// Edge function: chat
// The floating AI tutor ("Zé"). Receives short chat history + the page the
// student is on, replies with a concise tutoring answer.
//
// Deploy:  supabase functions deploy chat
import { corsHeaders, getClient, jsonResponse, MODEL } from '../_shared/anthropic.ts'

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  try {
    const { history, context = {} } = await req.json()
    if (!Array.isArray(history) || history.length === 0) {
      return jsonResponse({ error: 'history is required' }, 400)
    }
    const messages = history
      .slice(-12)
      .filter((m) => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
      .map((m) => ({ role: m.role, content: m.content.slice(0, 4000) }))

    const system = `You are Zé, the friendly AI tutor inside "Fala!", a Brazilian Portuguese vocabulary app for English speakers. Answer questions about Brazilian Portuguese (words, grammar, conjugation, culture, pronunciation) clearly and briefly — a few short paragraphs at most, with Portuguese examples translated to English. Brazilian usage only.

The student is currently on the app's "${String(context.page || 'home').slice(0, 40)}" page.${context.word ? ` They are looking at the word/phrase: "${String(context.word).slice(0, 120)}".` : ''} Use that context when it helps.

If the question is not about learning Portuguese or using the app, gently steer back to Portuguese.`

    const client = getClient()
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 2000,
      system,
      messages,
    })
    if (response.stop_reason === 'refusal') return jsonResponse({ error: 'declined' }, 400)
    const block = response.content.find((b) => b.type === 'text')
    return jsonResponse({ reply: block && block.type === 'text' ? block.text : '' })
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500)
  }
})
