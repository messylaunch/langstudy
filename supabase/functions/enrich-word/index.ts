// Edge function: enrich-word
// Given a Portuguese word/phrase, returns learner info (conjugations, examples,
// related words). The app caches the result in the shared word_info table so
// this only runs once per word across all users.
//
// Deploy:  supabase functions deploy enrich-word
import { askJson, corsHeaders, jsonResponse } from '../_shared/anthropic.ts'

const WORD_INFO_SCHEMA = {
  type: 'object',
  properties: {
    translation: { type: 'string' },
    pos: { type: 'string' },
    gender: { type: 'string', description: 'for nouns: masculine or feminine; otherwise "none"' },
    pronunciation_tip: { type: 'string' },
    conjugations: {
      type: 'array',
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
          relation: { type: 'string' },
        },
        required: ['pt', 'en', 'relation'],
        additionalProperties: false,
      },
    },
    notes: { type: 'string' },
  },
  required: ['translation', 'pos', 'gender', 'pronunciation_tip', 'conjugations', 'examples', 'related', 'notes'],
  additionalProperties: false,
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { word, english } = await req.json()
    if (!word || typeof word !== 'string') return jsonResponse({ error: 'word is required' }, 400)

    const prompt = `You are helping an English speaker learn Brazilian Portuguese. Give complete learner info for the Portuguese ${word.includes(' ') ? 'phrase' : 'word'}: "${word}"${english ? ` (meaning: ${english})` : ''}.

Rules:
- Brazilian Portuguese usage only (not European Portuguese).
- If it is a verb, include conjugations for: presente, pretérito perfeito, futuro do presente, and imperativo — with persons eu, você, ele/ela, nós, vocês, eles/elas. If not a verb, conjugations is an empty array.
- 3 example sentences at a beginner-friendly level, each with an English translation.
- 3-5 related words (synonyms, antonyms, word family, common collocations).
- Keep notes short and practical.`

    const info = await askJson(prompt, WORD_INFO_SCHEMA, 4000)
    return jsonResponse(info)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
