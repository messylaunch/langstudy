// Edge function: generate-story
// Writes a short Brazilian Portuguese story built from the learner's known words.
//
// Deploy:  supabase functions deploy generate-story
import { askJson, corsHeaders, jsonResponse } from '../_shared/anthropic.ts'

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { knownWords, options = {} } = await req.json()
    if (!Array.isArray(knownWords) || knownWords.length === 0) {
      return jsonResponse({ error: 'knownWords array is required' }, 400)
    }
    const words = knownWords.slice(0, 400).map(String)
    const length = Number(options.length) || 8

    const prompt = `You are helping an English speaker learn Brazilian Portuguese. Write a short, simple story (${length}-${length + 4} sentences) in Brazilian Portuguese${options.topic ? ` about: ${String(options.topic).slice(0, 200)}` : ''}.

The learner knows these words — build the story around them:
${words.join(', ')}

Rules:
- Use mostly words from the list plus very basic connectors (e, o, a, de, em, que...).
- You may introduce a FEW new words to stretch the learner; list every word you used that is not in the known list under new_words, in dictionary form with English meaning.
- Each sentence gets an English translation.
- Keep grammar simple: present and simple past.`

    const story = await askJson(prompt, STORY_SCHEMA, 6000)
    return jsonResponse(story)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
