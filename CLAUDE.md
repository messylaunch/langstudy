# CLAUDE.md — Fala! project memory

Brazilian-Portuguese vocabulary PWA for English speakers. A "workbook companion"
for people actively taking Portuguese classes: import your word list, drill it
with status-based spaced-review flashcards, quiz, read AI stories, generate AI
mini-lessons, and (with a teacher) get homework and chat.

## Stack (verified — do not assume)

- **Frontend: React 18 + Vite 5, plain JavaScript/JSX. There is NO TypeScript
  in the frontend** (no `tsconfig`, no `tsc`). Do not add `.ts`/`.tsx` to `src/`
  or introduce type annotations expecting a compiler — there isn't one.
- **Edge functions ARE TypeScript** (Deno), under `supabase/functions/`.
- No router library — `App.jsx` is a tab switcher via `useState`.
- No state library — React state + a small module-level helper (`uiContext.js`).
- Styling: one hand-written `src/styles.css` (CSS variables, no framework).

## Commands

```bash
npm run dev        # Vite dev server → http://localhost:5180
npm run build      # production build → dist/
npm run preview    # serve the build → http://localhost:5181
npm run smoke      # Playwright end-to-end smoke (local mode, happy path)
npm run lint       # ESLint (flat config)
npm test           # vitest unit tests (pure logic)
```

Always run `npm run lint && npm test && npm run build && npm run smoke` before
declaring frontend work done.

## Architecture map

- `src/main.jsx` → `src/App.jsx`: auth gate + landing/tour + tab router.
- `src/lib/store.js`: **the data layer, ~900 lines, imported by 16 files.** It
  switches on `mode()` between a **local** backend (localStorage, zero setup)
  and a **supabase** backend. Every data call goes through here. Treat changes
  as high-blast-radius; keep the two backends behaviorally in sync.
- `src/lib/ai.js`: AI features. Resolution order per call: shared cache →
  Supabase edge function → optional personal Anthropic key (direct browser call,
  `dangerouslyAllowBrowser`). Model is pinned `claude-opus-4-8`.
- `src/lib/config.js` / `supabaseClient.js`: runtime config (env vars OR values
  pasted into Settings, stored in localStorage) and the Supabase client.
- `src/lib/speech.js`: TTS + pronunciation scoring (Levenshtein/similarity).
- `src/lib/notify.js`: daily reminder loop. `src/lib/a11y.js`: `pressable()`
  keyboard helper. `src/lib/uiContext.js`: current-word context for the AI chat.
- `src/components/`: one file per screen/widget. Reusable: `AudioButton`,
  `WordInfo`, `Pronounce`, `NotificationsBell`, `ChatWidget`, `Tour`.
- `supabase/schema.sql`: **single append-only file** (v1 → v2 → v2.1 sections),
  idempotent (`if not exists`, `drop policy if exists`). Run whole in the SQL
  editor. There is NO migrations directory yet.
- `supabase/functions/*/index.ts`: `enrich-word`, `generate-story`,
  `extract-words`, `chat`, `generate-lesson`; shared helper in `_shared/`.

## Data model & roles

- `profiles` (role: user | teacher | master — first signup becomes master),
  `words`, `word_info` (shared AI cache), `stories`, `activity`, `assignments` +
  `assignment_students`, `notifications`, `messages`, `lessons`. Leaderboard is a
  class-scoped `SECURITY DEFINER` function.
- Word statuses: `unknown → learning → trouble → recognize → learned`. Spaced
  review via `isDue()` / `REVIEW_INTERVALS_DAYS` in `store.js`.

## Conventions

- Match the surrounding style: no semicolon-heavy TS idioms; existing code uses
  no semicolons at statement ends and single quotes. Follow it.
- All day/date keys use `store.localDay()` (LOCAL timezone). Never key activity
  or streaks off `toISOString().slice(0,10)` (UTC) — that breaks streaks in the
  Americas. This was a real bug; don't reintroduce it.
- Clickable non-`<button>` elements must use `pressable()` from `lib/a11y.js`
  (role/tabIndex/Enter-Space) and icon-only buttons need `title`/`aria-label`.
- Status colors in `store.js` (`STATUS_COLORS`) carry white text — keep every
  value ≥ 4.5:1 contrast.
- Keep the local and supabase code paths in `store.js` behaviorally equivalent.

## Guardrails (do NOT do without explicit user sign-off)

- Do not change `supabase/schema.sql` RLS policies, auth, or roles.
- Do not change pricing/product flows or destructive migrations.
- Never commit secrets. Frontend uses the Supabase **anon** key only — never
  reference `service_role` in `src/`. The Claude Code Bash-tool guard
  (`.claude/hooks/scan-secrets.mjs`) blocks agent commits that stage `sk-ant-…`,
  JWTs, or private keys (any file) or `service_role` (in `src/`) — but it only
  covers commands run through the agent's Bash tool, not terminal/IDE/GUI
  commits, so it's a safety net, not a real git pre-commit hook.
- Do not `git push`/PR/merge unless the user asks.

## Known technical debt (see the audit in git history)

- `@anthropic-ai/sdk` is statically bundled into the browser (~653 KB main
  chunk) for the optional personal-key path — candidate for lazy import.
- `store.js` is a god-module (split later, carefully).
- Schema is append-only, not versioned migrations.
- Only E2E smoke exists (local mode); Supabase/auth/RLS paths are untested.
