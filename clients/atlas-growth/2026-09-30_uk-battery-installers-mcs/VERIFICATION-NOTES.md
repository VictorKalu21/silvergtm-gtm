# Verification gotchas on the UK battery list, and how each was handled

Written 2026-11-01 at the operator's request. Covers wave 1 (1,453 send addresses, 2026-09-30) and wave 2 (1,020 held +
secondary addresses, 2026-10-26) through `verify-millionverifier-bounceban.js`. Each item: what went wrong, how it showed,
what was done, what to do next time. Engine-shaped items are also in `skills/email-verify-debounce-bounceban/IMPROVEMENTS.md`.

## 1. BounceBan failed silently and the report called the failures "risky"
**What:** every BounceBan call in wave 2 answered `Authorization information is missing or invalid`; the script exited 0 and
reported 250 risky. Wave 1, same script, same key file, had worked.
**Why:** the operator had added the BounceBan key as a cloud-environment credential. The container then exported
`BOUNCEBAN_KEY=proxy…`, a 5-character placeholder meant for proxied curl. The script resolves
`process.env.BOUNCEBAN_KEY || ENV.BOUNCEBAN_KEY`, so the placeholder beat the real key in the gitignored `.env`; Node's
fetch does not go through the proxy, so the placeholder reached BounceBan raw. And `classify()` treats a BounceBan record
with no `result` as "no answer", falling back to the MillionVerifier verdict (`bb:none`) → catch-alls stayed risky.
**How it showed:** 250 risky with `verify_detail` ending `bb:none`; `bounceban.jsonl` full of `msg` lines; curl with the file
key returned 200 while the script failed.
**Fix used:** relaunch with the file key exported explicitly (`BOUNCEBAN_KEY=<file value> MILLIONVERIFIER_KEY=<file value>`),
fresh `bounceban.jsonl`; MillionVerifier checkpoints meant zero MV re-spend. Result 728 → 936 sendable. The two failed
passes consumed no BounceBan credits.
**Next time:** probe both keys once before a run (MV `/credits` is free; BB status poll on a known id is free). If the
container exports a key-named variable, check its length before trusting it. Engine fix proposed in IMPROVEMENTS.

## 2. Diagnosing "auth" needs three channels
curl via proxy, curl `--noproxy '*'`, and Node fetch with the parsed file key all returned 200. That isolated the fault to the
script's key resolution rather than the key, the proxy, or BounceBan. Keep the three-channel probe as the standard first move
on any vendor auth error; it took one command.

## 3. Never probe BounceBan without a key
On 2026-09-30 a keyless and a bogus-key probe both returned a job id and "each request will cost 1 credit". Whose account
absorbed them is unknown. MillionVerifier without a key returns a clean error; BounceBan may not. Probe BounceBan only with
the real key and only on the status endpoint.

## 4. Process-matching a monitor by script name catches the monitor itself
`pgrep -f verify-millionverifier-bounceban.js` matched the watcher's own bash loop (its command line contains the name), so
the watch never ended; `pkill -f` with the same pattern killed the shell that issued it (exit 144). Use
`pgrep -af 'node .*verify-million' | grep -v bash`, or watch for the output artefact (`report.json`) instead of the process.

## 5. Throughput, so the wait is planned not discovered
MillionVerifier at concurrency 4 ran ~1 address/s (1,453 in ~25 min). BounceBan ran ~8/min (440 in ~55 min, 292 in ~37
min), partly because ~10% of calls return `verifying` and are polled 8 s apart. Budget an hour per 1,500 addresses and run
it in the background with a monitor on `report.json`, re-armed every 30 min.

## 6. The rank-2 fallback only helps leads that had more than one candidate
Wave 1: 10 dropped → 8 fallback addresses → 7 sendable. Wave 2: 42 dropped → 0 fallback addresses, because held and
secondary rows carry one register address each. A dropped registry-only lead is dead unless a site harvest or name-to-domain
produces another address first.

## 7. "Risky" is a catch-all domain, not a bad address
80 (wave 1) + 55 (wave 2) risky rows are `mv:catch_all bb:risky`. Held out of both uploads, delivered separately. Decide
per campaign: a separate low-volume list, or drop.

## 8. Names ride addresses only under the name rule, so owner-read before `base`
The 531 secondary rows had never been owner-read. Running `prep-owner-batches.js --ch` + 13 Haiku readers first named 441
(83%), which is what let 252 of the 936 wave-2 rows carry a first name. Companies House surnames arrive ALL CAPS; title-case
them after `fill`, keeping Mc/Mac/O' capitalisation (73 fixed in wave 1, 6 in wave 2).

## 9. Register cities break the fill
`fill` repeats a known city verbatim, and the register's city field is the installer's own typing: 129 ALL CAPS towns, 60
streets/counties/"n/a", 38 comma-joined fragments. `city-clean.js` first, then the engine's `city-fallback` for blanks —
but its Nominatim call uses Node fetch (bypasses the proxy, shared egress, 429). `geocode-fixture.js` curls through the proxy
at 1/1.2 s and `city-fallback --geocode-fixture` runs offline. Hand-fix the dozen district answers (Tandridge, Wychavon…)
from the register street address.

## 10. Keys were pasted in chat
Both verifier keys arrived in the conversation. They were written only to the gitignored `.env` and never committed, but a
pasted key is a shared key: rotate both.

## 11. The container is ephemeral
On 2026-10-31 the cloud container was rebuilt. Everything gitignored in the run folder was gone: leads, verify checkpoints,
`emails_final.csv`, both uploads, the `.env`. Only committed scripts and notes survived. Send deliverables the moment they
pass `check`, keep the tarball, and treat checkpoints as session-scoped. A re-pull of the MCS register afterwards returned
1,817 unique of 2,828 rows (overlapping pages, where 09-30 gave 2,794 of 2,794), so even "free, keyless, re-pullable" is not
a substitute for keeping the deliverable.

## 12. Mail-provider mix, for the send
MX on 1,543 register domains: Microsoft 40%, Google 18%, free mail 15%, IONOS 4%, other hosts 15%. Business domains only:
Microsoft 48%, Google 22%. Plan placement testing around Microsoft first.
