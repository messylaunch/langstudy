---
name: pre-deploy-verify
description: Pre-deployment verification for Fala!. Invoke before pushing a release or asking to deploy. Confirms the build is shippable and lists the manual Supabase/hosting steps the human must do.
---

# Pre-deploy verification — Fala!

Confirm the app is shippable and surface the manual steps. Non-destructive; does
not deploy, push, or touch production.

## Procedure

1. **Green gate** — all must pass (report the actual output of each):
   - `npm run lint`
   - `npm test`
   - `npm run build`
   - `npm run smoke`
2. **Bundle sanity**: `ls -la dist/assets/*.js`; flag chunks > 500 KB as a
   perf note (not a blocker).
3. **PWA sanity**: confirm `dist/manifest.webmanifest`, `dist/sw.js`, and the
   three icons exist in the build output.
4. **Secret sanity**: `git status` clean of tracked `.env`; `git grep` finds no
   `service_role`/`sk-ant-` in `src`.
5. **Config note**: confirm the app reads Supabase creds from env
   (`VITE_SUPABASE_*`) OR runtime Settings — not hardcoded.

## Output

- **Ship / hold** verdict with the reason.
- The green-gate results table.
- **Manual steps the human must perform** (the app can't do these):
  1. Apply any `supabase/schema.sql` changes in the Supabase SQL editor.
  2. Deploy edge functions if changed (`supabase functions deploy <name>`).
  3. Set hosting env vars (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`).
  4. Verify HTTPS (required for PWA install, notifications, microphone).

## Safety

Never runs `git push`, `supabase ... deploy`, or any deploy command itself —
it only verifies and instructs.
