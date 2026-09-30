# Local notes (not upstream)

Source: https://github.com/obra/superpowers (skills/brainstorming), by Jesse Vincent.
Vendored as a PROJECT skill rather than installed as a plugin, because the normal route
(`/plugin marketplace add obra/superpowers-marketplace`) is a slash command the operator runs in
their own CLI, not something a session can do for them.

## What was deliberately NOT installed

- **The plugin's `hooks/hooks.json`.** It registers a `SessionStart` hook that executes
  `hooks/run-hook.cmd session-start` on every startup/clear/compact. A hook runs commands on every
  session, so it is not something to add quietly — install it yourself if you want it.
- **The other 13 skills** in the plugin (test-driven-development, verification-before-completion,
  executing-plans, subagent-driven-development, …). Several of them change how an agent works in a
  repo — TDD gates, completion checks, parallel-agent dispatch. That is a workflow decision for the
  operator, not a side effect of asking for the brainstorming skill. Say the word and they go in.

## Caveat in a remote session

The skill's "visual companion" (`scripts/start-server.sh`, `server.cjs`, `helper.js`) serves a
browser UI on localhost and opens a tab. In a Claude Code **remote/web** session the container is
not the operator's machine, so that tab cannot open for them — the offer should be skipped and the
brainstorm run text-only. Everything else in the skill works normally.
