// Edge function: generate-lesson
// Builds a structured mini lesson on any topic (a conjugation, a set of
// phrases, a grammar point...). The app saves it into the student's lessons.
//
// Deploy:  supabase functions deploy generate-lesson
import { askJson, corsHeaders, jsonResponse } from '../_shared/anthropic.ts'

const LESSON_SCHEMA = {
  type: 'object',
  properties: {
    title: { type: 'string' },
    topic: { type: 'string' },
    level: { type: 'string' },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          heading: { type: 'string' },
          body: { type: 'string' },
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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { topic, context = '' } = await req.json()
    if (!topic || typeof topic !== 'string') return jsonResponse({ error: 'topic is required' }, 400)

    const prompt = `You are a Brazilian Portuguese teacher creating a mini lesson for an English-speaking student who studies with flashcards in a vocabulary app.

Create a short, focused mini lesson on: "${topic.slice(0, 300)}"
${context ? `Extra context from the student: ${String(context).slice(0, 1000)}` : ''}

Rules:
- Brazilian Portuguese only.
- 2-4 short sections, each with a clear heading, a plain-language explanation, and 2-4 example sentences with English translations.
- End with 3-5 practice items (English → Portuguese).
- Keep it beginner-friendly unless the topic clearly demands more.`

    const lesson = await askJson(prompt, LESSON_SCHEMA, 6000)
    return jsonResponse(lesson)
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
