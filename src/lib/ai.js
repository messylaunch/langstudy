// AI features: word enrichment (conjugations, examples, related words),
// story generation, and vocabulary extraction from documents/transcripts.
//
// Resolution order:
//   1. shared cache (word_info table / localStorage) — AI is only ever called
//      once per word across ALL users, then everyone reads the cache
//   2. Supabase Edge Function (keeps the Anthropic key server-side)
//   3. direct browser call with a personal Anthropic API key from Settings
import Anthropic from '@anthropic-ai/sdk'
import { getConfig } from './config.js'
import { getSupabase } from './supabaseClient.js'
import { getCachedWordInfo, saveWordInfo, mode } from './store.js'

const MODEL = 'claude-opus-4-8'

export const WORD_INFO_SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string' },
    pos: { type: 'string', description: 'part of speech: noun, verb, adjective, adverb, pronoun, preposition, conjunction, interjection, phrase' },
    gender: { type: 'string', description: 'for nouns: masculine or feminine; otherwise "none"' },
    pronunciation_tip: { type: 'string', description: 'short plain-English tip on how a Brazilian pronounces it' },
    conjugations: {
      type: 'array',
      description: 'for verbs only: key tenses; empty array for non-verbs',
      items: {
        type: 'object',
        properties: {
          tense: { type: 'string' },
          forms: {
            type: 'array',
            items: {
              type: 'object',
              properties: { person: { type: 'string' }, form: { type: 'string' } },
              required: ['person', 'form'],
              additionalProperties: false,
            },
          },
        },
        required: ['tense', 'forms'],
        additionalProperties: false,
      },
    },
    examples: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pt: { type: 'string' }, en: { type: 'string' } },
        required: ['pt', 'en'],
        additionalProperties: false,
      },
    },
    related: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          pt: { type: 'string' },
          en: { type: 'string' },
          relation: { type: 'string', description: 'e.g. synonym, antonym, same family, common collocation' },
        },
        required: ['pt', 'en', 'relation'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string', description: 'brief usage notes for Brazilian Portuguese specifically' },
  },
  required: ['translation', 'pos', 'gender', 'pronunciation_tip', 'conjugations', 'examples', 'related', 'notes'],
  additionalProperties: false,
}

const STORY_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    sentences: {
      type: 'array',
      items: {
        type: 'object',
        properties: { pt: { type: 'string' }, en: { type: 'string' } },
        required: ['pt', 'en'],
        additionalProperties: false,
      },
    },
    new_words: {
      type: 'array',
      description: 'words used in the story that were NOT in the known list',
      items: {
        type: 'object',
        properties: { portuguese: { type: 'string' }, english: { type: 'string' } },
        required: ['portuguese', 'english'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'sentences', 'new_words'],
  additionalProperties: false,
}

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          portuguese: { type: 'string', description: 'dictionary form (infinitive for verbs, singular for nouns)' },
          english: { type: 'string' },
          pos: { type: 'string' },
          category: { type: 'string', description: 'one lowercase topic like greetings, food, travel, verbs-common' },
          is_phrase: { type: 'boolean' },
        },
        required: ['portuguese', 'english', 'pos', 'category', 'is_phrase'],
        additionalProperties: false,
      },
    },
  },
  required: ['words'],
  additionalProperties: false,
}

function wordInfoPrompt(word, english) {
  return `You are helping an English speaker learn Brazilian Portuguese. Give complete learner info for the Portuguese ${word.includes(' ') ? 'phrase' : 'word'}: "${word}"${english ? ` (meaning: ${english})` : ''}.

Rules:
- Brazilian Portuguese usage only (not European Portuguese).
- If it is a verb, include conjugations for: presente, pretérito perfeito, futuro do presente, and imperativo — with persons eu, você, ele/ela, nós, vocês, eles/elas. If not a verb, conjugations is an empty array.
- 3 example sentences at a beginner-friendly level, each with an English translation.
- 3-5 related words (synonyms, antonyms, word family, common collocations).
- Keep notes short and practical.`
}

function storyPrompt(knownWords, options) {
  return `You are helping an English speaker learn Brazilian Portuguese. Write a short, simple story (${options.length || 8}-${(options.length || 8) + 4} sentences) in Brazilian Portuguese${options.topic ? ` about: ${options.topic}` : ''}.

The learner knows these words — build the story around them:
${knownWords.join(', ')}

Rules:
- Use mostly words from the list plus very basic connectors (e, o, a, de, em, que...).
- You may introduce a FEW new words to stretch the learner; list every word you used that is not in the known list under new_words, in dictionary form with English meaning.
- Each sentence gets an English translation.
- Keep grammar simple: present and simple past.`
}

function extractPrompt(text) {
  return `You are helping an English speaker learn Brazilian Portuguese. Below is a document/transcript from their Portuguese class. Extract the vocabulary a student should learn from it.

Rules:
- Return each item once, in dictionary form (verbs as infinitive, nouns singular).
- Include useful multi-word phrases with is_phrase=true.
- Skip proper names and English words.
- Give each item a lowercase one-word-ish category (greetings, food, colors, family, travel, verbs-common, adjectives, etc.).

TEXT:
${text.slice(0, 24000)}`
}

// ------------------------------------------------------------------ plumbing
function directClient() {
  const { anthropicApiKey } = getConfig()
  if (!anthropicApiKey) return null
  return new Anthropic({ apiKey: anthropicApiKey, dangerouslyAllowBrowser: true })
}

async function callDirect(prompt, schema, maxTokens) {
  const client = directClient()
  if (!client) return null
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: maxTokens,
    output_config: { format: { type: 'json_schema', schema } },
    messages: [{ role: 'user', content: prompt }],
  })
  if (response.stop_reason === 'refusal') throw new Error('The AI declined this request.')
  const text = response.content.find((b) => b.type === 'text')
  return text ? JSON.parse(text.text) : null
}

async function callEdgeFunction(name, body) {
  if (mode() !== 'supabase') return null
  const sb = getSupabase()
  try {
    const { data, error } = await sb.functions.invoke(name, { body })
    if (error) return null
    return data
  } catch {
    return null
  }
}

export function aiAvailable() {
  return mode() === 'supabase' || Boolean(getConfig().anthropicApiKey)
}

// -------------------------------------------------------------------- public
export async function getWordInfo(word, english) {
  const cached = await getCachedWordInfo(word)
  if (cached) return cached

  let info = await callEdgeFunction('enrich-word', { word, english })
  if (!info) info = await callDirect(wordInfoPrompt(word, english), WORD_INFO_SCHEMA, 4000)
  if (!info) {
    throw new Error(
      'AI is not set up yet. Deploy the Supabase Edge Functions (see README) or paste a personal Anthropic API key in Settings.'
    )
  }
  await saveWordInfo(word, info)
  return info
}

export async function generateStory(knownWords, options = {}) {
  const words = knownWords.slice(0, 400)
  let story = await callEdgeFunction('generate-story', { knownWords: words, options })
  if (!story) story = await callDirect(storyPrompt(words, options), STORY_SCHEMA, 6000)
  if (!story) {
    throw new Error(
      'AI is not set up yet. Deploy the Supabase Edge Functions (see README) or paste a personal Anthropic API key in Settings.'
    )
  }
  return story
}

export async function extractWordsFromText(text) {
  let result = await callEdgeFunction('extract-words', { text })
  if (!result) result = await callDirect(extractPrompt(text), EXTRACT_SCHEMA, 16000)
  if (!result) {
    throw new Error(
      'AI is not set up yet. Deploy the Supabase Edge Functions (see README) or paste a personal Anthropic API key in Settings.'
    )
  }
  return result.words || []
}

// ============================================================================
// v2: AI tutor chat (page-aware) + mini lesson generation
// ============================================================================

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    topic: { type: 'string' },
    level: { type: 'string', description: 'beginner, intermediate, or advanced' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string', description: 'plain text explanation, short paragraphs' },
          examples: {
            type: 'array',
            items: {
              type: 'object',
              properties: { pt: { type: 'string' }, en: { type: 'string' } },
              required: ['pt', 'en'],
              additionalProperties: false,
            },
          },
        },
        required: ['heading', 'body', 'examples'],
        additionalProperties: false,
      },
    },
    practice: {
      type: 'array',
      description: '3-5 practice prompts: English sentence to translate to Portuguese',
      items: {
        type: 'object',
        properties: { en: { type: 'string' }, pt: { type: 'string' } },
        required: ['en', 'pt'],
        additionalProperties: false,
      },
    },
  },
  required: ['title', 'topic', 'level', 'sections', 'practice'],
  additionalProperties: false,
}

function lessonPrompt(topic, context) {
  return `You are a Brazilian Portuguese teacher creating a mini lesson for an English-speaking student who studies with flashcards in a vocabulary app.

Create a short, focused mini lesson on: "${topic}"
${context ? `Extra context from the student: ${context}` : ''}

Rules:
- Brazilian Portuguese only.
- 2-4 short sections, each with a clear heading, a plain-language explanation, and 2-4 example sentences with English translations.
- End with 3-5 practice items (English → Portuguese).
- Keep it beginner-friendly unless the topic clearly demands more.`
}

function tutorSystemNote(context) {
  return `You are Zé, the friendly AI tutor inside "Fala!", a Brazilian Portuguese vocabulary app for English speakers. Answer questions about Brazilian Portuguese (words, grammar, conjugation, culture, pronunciation) clearly and briefly — a few short paragraphs at most, with Portuguese examples translated to English. Brazilian usage only.

The student is currently on the app's "${context.page || 'home'}" page.${context.word ? ` They are looking at the word/phrase: "${context.word}".` : ''} Use that context when it helps.

If the question is not about learning Portuguese or using the app, gently steer back to Portuguese.`
}

// history: [{role:'user'|'assistant', content:string}]
export async function askTutor(history, context = {}) {
  let reply = await callEdgeFunction('chat', { history: history.slice(-12), context })
  if (reply && reply.reply) return reply.reply
  const client = directClient()
  if (!client) {
    throw new Error(
      'AI is not set up yet. Deploy the Supabase Edge Functions (see README) or paste a personal Anthropic API key in Settings.'
    )
  }
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 2000,
    system: tutorSystemNote(context),
    messages: history.slice(-12),
  })
  if (response.stop_reason === 'refusal') throw new Error('The AI declined this request.')
  const text = response.content.find((b) => b.type === 'text')
  return text ? text.text : ''
}

export async function generateLesson(topic, context = '') {
  let lesson = await callEdgeFunction('generate-lesson', { topic, context })
  if (!lesson || lesson.error) lesson = await callDirect(lessonPrompt(topic, context), LESSON_SCHEMA, 6000)
  if (!lesson) {
    throw new Error(
      'AI is not set up yet. Deploy the Supabase Edge Functions (see README) or paste a personal Anthropic API key in Settings.'
    )
  }
  return lesson
}
