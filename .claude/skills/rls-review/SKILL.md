---
name: rls-review
description: Review Supabase Row-Level Security and schema for Fala! before any database change. Invoke when editing supabase/schema.sql, adding a table/policy, or auditing authorization. Produces a risk report; never applies SQL.
---

# RLS & schema review — Fala!

Audit `supabase/schema.sql` (and edge functions) for authorization safety.
**Never run SQL or apply migrations** — this produces a report for a human.

## Inputs

The current `supabase/schema.sql`, plus any proposed change (a diff or new SQL).

## Procedure

For each table/policy/function in scope:
1. **RLS enabled?** Every table with user data must have `enable row level
   security` and policies for every operation it allows.
2. **Ownership boundary**: SELECT/UPDATE/DELETE must be constrained to the owner
   (`user_id = auth.uid()`) or an explicitly-authorized role
   (`is_master()`, `is_teacher_of()`, class membership). Look for IDOR: can user A
   reach user B's rows?
3. **INSERT/UPDATE `WITH CHECK`**: can a caller set `user_id`, `role`,
   `teacher_id`, or `status` to escalate privilege or write as someone else?
4. **`SECURITY DEFINER` functions**: fixed `search_path`? Scoped correctly (e.g.
   `leaderboard()` limited to the caller's class, `join_class` validating the
   code)? No privilege leak.
5. **Shared/mutable surfaces**: `word_info` cache and public storage buckets —
   who can INSERT vs UPDATE? Can one user overwrite everyone's data? Prefer
   first-write-wins or master-only overwrite.
6. **Client trust**: confirm the frontend never references `service_role` and
   that any client-side role check is also enforced by a policy.

## Output

Per finding: **object**, **risk + exact SQL clause**, **exploit scenario**,
**severity**, **minimal fix (as SQL)**, and **"requires human sign-off"** on
anything that alters policies/auth. End with a go/no-go recommendation for the
proposed change.

## Safety

Report-only. Applying any migration or policy change requires explicit user
authorization — this skill never does it.
