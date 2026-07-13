// Edge function: extract-words
// Pulls learnable vocabulary out of a class document or transcription.
//
// Deploy:  supabase functions deploy extract-words
import { askJson, corsHeaders, jsonResponse } from '../_shared/anthropic.ts'

const EXTRACT_SCHEMA = {
  type: 'object',
  properties: {
    words: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          portuguese: { type: 'string' },
          english: { type: 'string' },
          pos: { type: 'string' },
          category: { type: 'string' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { text } = await req.json()
    if (!text || typeof text !== 'string') return jsonResponse({ error: 'text is required' }, 400)

    const prompt = `You are helping an English speaker learn Brazilian Portuguese. Below is a document/transcript from their Portuguese class. Extract the vocabulary a student should learn from it.

Rules:
- Return each item once, in dictionary form (verbs as infinitive, nouns singular).
- Include useful multi-word phrases with is_phrase=true.
- Skip proper names and English words.
- Give each item a lowercase one-word-ish category (greetings, food, colors, family, travel, verbs-common, adjectives, etc.).

TEXT:
${text.slice(0, 24000)}`

    const result = await askJson(prompt, EXTRACT_SCHEMA, 16000)
    return jsonResponse(result)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
