#!/usr/bin/env node
// PreToolUse(Bash) guardrail for Fala!.
//
// SCOPE: this guards commands run through Claude Code's Bash tool. It is NOT a
// real git pre-commit hook — commits made from a terminal, IDE, or git GUI do
// not pass through it. Treat it as a safety net for the agent, not a boundary.
//
// It blocks:
//   - `git commit` when the STAGED diff introduces a real secret VALUE
//     (Anthropic key, JWT/access token, private key) in any file, or a bare
//     `service_role` reference inside frontend `src/` (must use the anon key).
//   - force-push to main/master, or a bare force-push with no explicit
//     non-main branch (which targets the tracked upstream — could be main).
//   - destructive SQL (DROP/TRUNCATE/unqualified DELETE) via psql/supabase.
//   - rm -rf on a root/home path.
//
// Detection is SEGMENT-ANCHORED and wrapper-normalized: a command that merely
// *mentions* a dangerous phrase as data (echo/grep/this test) is NOT blocked,
// and `sudo`/`command`/`env`/`/usr/bin/` prefixes do not bypass it.
//
// Fail-open on its own errors: a guardrail must never brick the workflow.
// Contract: exit 2 + stderr = block; exit 0 = allow.
import fs from 'node:fs'
import { execSync } from 'node:child_process'

function block(msg) {
  process.stderr.write('⛔ Blocked by scan-secrets hook: ' + msg + '\n')
  process.exit(2)
}

let cmd = ''
try {
  const input = JSON.parse(fs.readFileSync(0, 'utf8')) // fd 0 = stdin
  cmd = (input.tool_input && input.tool_input.command) || ''
} catch {
  process.exit(0) // no/unparseable input → allow
}
if (!cmd) process.exit(0)

// Strip leading env-assignments and sudo/command/env wrappers, and reduce a
// path-qualified binary to its basename, so `/usr/bin/git`, `sudo git`,
// `FOO=1 command git` all normalize to a segment starting with `git`.
function normalize(seg) {
  let s = seg.trim()
  s = s.replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S+)\s+)+/, '')
  while (/^(?:sudo|command|env|nice|nohup)\s+/.test(s)) s = s.replace(/^(?:sudo|command|env|nice|nohup)\s+/, '')
  s = s.replace(/^\S*\/([A-Za-z0-9._-]+)/, '$1') // /usr/bin/git … → git …
  return s
}

// Split on shell separators; each segment's first token is the real command.
const segments = cmd
  .split(/\n|&&|\|\||[;|]/)
  .map((s) => normalize(s))
  .filter(Boolean)

function isForcePushToProtected(seg) {
  if (!/^git\s+push\b/.test(seg)) return false
  const hasForce = /(?:--force\b|--force-with-lease\b|(?:^|\s)-f(?:\s|$))/.test(seg)
  const plusRef = /\s\+(\S+)/.exec(seg) // "+main" style force refspec
  if (!hasForce && !plusRef) return false
  const branchTok = plusRef
    ? plusRef[1]
    : seg
        .replace(/^git\s+push\s*/, '')
        .split(/\s+/)
        .filter((a) => a && !a.startsWith('-'))[1] // [0]=remote, [1]=branch
  if (!branchTok) return true // bare force-push → tracked upstream, could be main
  const branch = branchTok.replace(/^\+/, '').replace(/^[^:]*:/, '') // strip + and src:dst
  return /^(main|master|HEAD)$/i.test(branch)
}

for (const seg of segments) {
  if (isForcePushToProtected(seg)) {
    block('force-push to main/master (or an unspecified upstream). Push to an explicit feature branch instead.')
  }
  if (/^rm\s+-\S*(rf|fr)\b/.test(seg) && /\s(\/(\s|$)|~|\$HOME)/.test(seg)) {
    block('rm -rf on a root/home path.')
  }
  if (
    /^(psql|supabase\s+db)\b/.test(seg) &&
    /(drop\s+(table|schema|database)|truncate\b|delete\s+from\b(?![^\n]*where))/i.test(seg)
  ) {
    block('destructive SQL (DROP/TRUNCATE/unqualified DELETE) against a database. Run the rls-review skill first.')
  }
}

// Secret scan on the staged diff — only when a segment actually runs git commit.
// File-aware: real secret *values* are flagged in any file; the bare word
// `service_role` is flagged only in frontend `src/` (elsewhere it is legitimate
// documentation / a policy name — this file and CLAUDE.md both mention it).
if (segments.some((seg) => /^git\s+commit\b/.test(seg))) {
  let diff = ''
  try {
    diff = execSync('git diff --cached -U0', { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 })
  } catch {
    process.exit(0) // can't read diff → fail-open
  }
  const ALWAYS = [
    [/sk-ant-[A-Za-z0-9_-]{8,}/, 'Anthropic API key (sk-ant-…)'],
    [/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{6,}/, 'JWT / access token'],
    [/-----BEGIN[A-Z ]*PRIVATE KEY-----/, 'private key'],
  ]
  const SRC_ONLY = [[/service_role/i, 'service_role reference in frontend code']]

  let file = ''
  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ ')) {
      file = line.replace(/^\+\+\+\s+(b\/)?/, '').trim()
      continue
    }
    if (!line.startsWith('+') || line.startsWith('+++')) continue
    const added = line.slice(1)
    for (const [re, label] of ALWAYS) {
      if (re.test(added)) {
        block(`staged file "${file}" adds a ${label}. Remove it (use an env var / Supabase Settings), then re-commit.`)
      }
    }
    if (/^src\//.test(file)) {
      for (const [re, label] of SRC_ONLY) {
        if (re.test(added)) {
          block(`staged file "${file}" adds a ${label}. The frontend must use only the anon key.`)
        }
      }
    }
  }
}

process.exit(0)
