---
name: repo-health-check
description: Full non-destructive health check of the Fala! repo. Invoke when asked to "check the health of the repo", before a release, or when returning to the project after a break. Runs lint/tests/build/smoke, scans for secrets and common risks, and reports a status summary.
---

# Repo health check — Fala!

A repeatable, **non-destructive** health pass. Never edits, commits, or touches
the database.

## Procedure

1. **Install check**: `npm ls --depth=0` (report missing/extraneous). If
   `node_modules` is absent, run `npm install`.
2. **Static + tests** (run all, don't stop on first failure):
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run smoke`
3. **Secret / risk scan** (counts only, never print secret values):
   - `git grep -In 'service_role' -- ':!package-lock.json'` (expect none in src)
   - `git grep -In 'sk-ant-[A-Za-z0-9]' --` (expect none)
   - `git grep -c 'dangerouslyAllowBrowser\|dangerouslySetInnerHTML\|eval(' -- src`
   - confirm no `.env` is tracked: `git ls-files | grep -E '\.env'`
4. **Bundle size**: after build, `ls -la dist/assets/*.js` — flag any chunk > 500 KB.
5. **Debt signals**: `git grep -in 'TODO\|FIXME\|HACK' -- src supabase`.

## Output

A short status table: check → ✅/⚠️/❌ with the one-line reason. Then:
- **Blockers** (build/lint/test failures, secret exposure) — must fix now.
- **Warnings** (bundle size, debt markers) — track.
- **Clean** — one line listing what passed.

## Safety

Read-and-run only. No file edits, no git write commands, no DB/network mutations.
If a command fails, report the actual error output; do not "fix" silently.
