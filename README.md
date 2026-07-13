# Fala! 🇧🇷 — Brazilian Portuguese vocabulary app

A progressive web app (PWA) for an English speaker learning **Brazilian Portuguese**, focused on
building vocabulary from your own word lists.

**Try it immediately:** the app runs in *local demo mode* with no setup at all — data stays in your
browser. Connect Supabase (10 minutes, below) to get real accounts, sync across devices, and
multiple profiles.

---

## What it does

| Feature | Where |
|---|---|
| ~680-word Brazilian Portuguese starter pack | installed automatically (local mode) or one click on the Home screen |
| **Import your own word list (~2000 words)** — paste, CSV, or spreadsheet copy/paste | Import → "Word list / CSV" |
| **Import from class documents / transcriptions** — AI extracts the vocabulary | Import → "Class document (AI)" |
| Add single words **or phrases**, with your own picture (upload or URL) and notes | Words → "＋ Add word / phrase" |
| Word statuses: **Don't know · Learning · Trouble remembering · Recognize · Learned** | everywhere |
| Word list with search, category, word-type, and **date-added** filters | Words |
| **Flashcards** with a learning limit (never too many words at once — set it in Settings) | Flashcards |
| **Info panel on each card**: AI conjugations, examples, related words — cached in a shared database so AI is only called once per word, ever | flashcard → ℹ️ Info |
| **Audio** for every word/phrase (shared audio library + Brazilian Portuguese text-to-speech, cached for offline) | 🔈 buttons |
| **Pronunciation check** — say the word, get scored (Chrome/Edge/Android) | 🎤 buttons |
| **Quiz** — 10 quick multiple-choice questions, both directions | Quiz |
| **AI short stories** written from words you already know; tap any word to mark it recognized or add it | Stories |
| **Daily study reminders** at your chosen time | Settings |
| **Master profile** that can view every user's progress; unlimited normal profiles | first account created = master |
| Installable **PWA** with offline support | browser "Install app" prompt |
| **Public landing page** with a try-it flashcard demo; sign-up required to use the app | shown when signed out |
| **Guided tour** of the whole app on first login, replayable anytime | Settings → Help & how-to |
| **Teacher accounts & classes** — students join with a code; teachers see each student's progress, assign homework with attached word lists, and track completion | sign up as teacher → My Class tab |
| **Homework** lands on the student's dashboard: one tap adds the words, then mark complete | Home |
| **Notifications** (homework, messages, completions) that stay in the list after being read | 🔔 bell in the top bar |
| **Floating chat head** — ask Zé the AI tutor (it knows what page/word you're on) or message your teacher about the next class | bottom-right on every page |
| **Mini lessons** — generate a lesson on anything ("conjugating ir", "beach phrases"), save AI chat answers as lessons, search your library, revisit one from the dashboard | Lessons tab, plus 📖 buttons on flashcards and words |
| **Leaderboard** — points from words learned and cards reviewed | Home |
| **Account management** — profile picture, change email, change password | Settings |

---

## Quick start (no backend)

```bash
npm install
npm run dev
```

Open http://localhost:5173 — you're in local demo mode with the starter pack loaded.

## Full setup with Supabase (multi-user, synced)

1. **Create a project** at [supabase.com](https://supabase.com) (free tier is fine).
2. **Run the schema**: open *SQL Editor* in the Supabase dashboard, paste the entire contents of
   [`supabase/schema.sql`](supabase/schema.sql), and run it. This creates the tables, security
   policies, and storage buckets (shared audio + word images).
3. **Connect the app**: copy your project's URL and anon key from *Settings → API*, then either
   - paste them into the app (sign-in screen → "Change Supabase connection", or Settings →
     Connections), **or**
   - put them in `.env` (see `.env.example`) and rebuild.
4. **Create your account** in the app. ⭐ **The first account created becomes the master profile**
   — create yours first. Everyone signing up later is a regular user. To promote someone later:
   ```sql
   update public.profiles set role = 'master' where email = 'someone@example.com';
   ```
5. On the Home screen, click **"Install starter word pack"**, then import your own list.

### AI features (word info, stories, document import)

Two options — pick one:

**Option A (recommended): Supabase Edge Functions** — the Anthropic API key stays server-side and
every user gets AI features.

```bash
npm install -g supabase
supabase login
supabase link --project-ref <your-project-ref>
supabase secrets set ANTHROPIC_API_KEY=sk-ant-...      # from console.anthropic.com
supabase functions deploy enrich-word
supabase functions deploy generate-story
supabase functions deploy extract-words
supabase functions deploy chat
supabase functions deploy generate-lesson
```

**Option B: personal API key** — paste an Anthropic API key into *Settings → Connections*. It's
stored only in that browser and calls the API directly. Fine for a single user or for trying
things out.

Word lookups are cached in the shared `word_info` table, so each word costs one AI call **total**,
across all users, forever.

### Deploying the app

It's a static site — host `dist/` anywhere. Easiest: push this repo to GitHub and import it in
[Vercel](https://vercel.com) or [Netlify](https://netlify.com) (build command `npm run build`,
output `dist`). HTTPS is required for the PWA install prompt, notifications, and the microphone.

---

## How the learning flow works

- New words start as **Don't know**. Flashcard sessions introduce them a few at a time
  (*Settings → New words per session*) but only while your **Learning limit** has room —
  the count of *Learning + Trouble remembering* words never exceeds it.
- **Spaced review**: reviewed words rest, then come due again by status — *Trouble* words
  immediately, *Learning* after 1 day, *Recognize* after 3 days, and *Learned* after 14 days —
  so nothing silently decays. The Home screen shows how many words are due.
- Grading a card moves it: **Again** → Trouble remembering · **Hard** → Learning ·
  **Good** → Recognize (never demotes a Learned word) · **Easy** → Learned.
- **Session scope**: study everything, one category, or only words added in the last 7/30 days —
  perfect for drilling exactly what this week's class covered.
- Quizzes come in two styles: **multiple choice** (both directions) and **type the Portuguese**
  (real recall — accent-insensitive, but it shows you the accents you missed). A wrong answer
  sends the word back to *Trouble remembering*.
- Stories are generated from your known words; tapping a word you understood marks it
  **Recognize** — a nice way to promote passive vocabulary.
- **Your data is portable**: Settings → "Export my words (CSV)" downloads your whole list in a
  format the Import screen accepts back.

## Audio & pronunciation

- The 🔈 button plays a recording from the shared `word-audio` storage bucket if one exists
  (upload files named like `bom-dia.mp3` to that bucket to build a shared library); otherwise it
  falls back to the browser's Brazilian Portuguese text-to-speech voice. Played audio is cached by
  the service worker, so it downloads once and then works offline.
- The 🎤 pronunciation check uses the browser's speech recognizer (pt-BR) and scores your attempt
  against the target — supported in Chrome, Edge, and Android; iOS Safari doesn't expose it yet.

## Notifications

Daily reminders are local notifications: they fire while the app or installed PWA window is open,
and on Android (installed PWA) they can fire in the background via Periodic Background Sync. True
server-push (works even when the app was never opened that day) would require a push server —
not included.

## Development

```bash
npm run dev      # dev server → http://localhost:5180
npm run lint     # ESLint (flat config; catches real bugs, not style nits)
npm test         # vitest unit tests (pure logic: review scheduling, pronunciation)
npm run build    # production build to dist/
npm run smoke    # headless-browser end-to-end smoke of the built app
```

Run `npm run lint && npm test && npm run build && npm run smoke` before
declaring frontend work done. CI (`.github/workflows/ci.yml`) runs lint + test +
build on every PR; the smoke test is a local check (it needs a preinstalled
Chromium).

### Claude Code dev system

This repo ships a small, auditable Claude Code setup (see `CLAUDE.md` for the
full project memory):

- **Agents** (`.claude/agents/`, read-only): `repo-mapper`, `ux-auditor`,
  `rls-reviewer`, `security-reviewer`, `skeptical-reviewer`.
- **Skills** (`.claude/skills/`): `repo-health-check`, `rls-review`,
  `pre-deploy-verify`, `design-review`.
- **Guardrail hook** (`.claude/hooks/scan-secrets.mjs`, wired in
  `.claude/settings.json`): blocks commits that would add a secret
  (`sk-ant-…`, `service_role`, JWTs, private keys) and a few footguns
  (force-push to main, destructive SQL). Segment-anchored to avoid false
  positives on commands that merely mention those strings.

Tech: React + Vite, Supabase (auth, Postgres with row-level security, storage, edge functions),
Anthropic Claude for word enrichment / stories / document extraction, Web Speech API for TTS and
pronunciation, hand-rolled service worker for offline + notifications.
