// RECOVERY: build the retry input from unreachable rows worth retrying (skip dead ENOTFOUND /
// no-website). Run pipeline.mjs on the output with a longer TIMEOUT + relaxed TLS to recover
// slow + cert-broken sites.
//
//   RUN=<run> DIR=<dir> node recover-input.mjs        # -> {RUN}_recover_input.json
//   then: RUN={RUN}_recover TIMEOUT=35000 NODE_TLS_REJECT_UNAUTHORIZED=0 node pipeline.mjs
import { readFileSync, writeFileSync } from 'node:fs';
const DIR = process.env.DIR || '.';
const RUN = process.env.RUN || 'run';
const rd = (f) => JSON.parse(readFileSync(`${DIR}/${f}`, 'utf8').replace(/^﻿/, ''));
const sig = rd(`${RUN}_signal.json`);
const input = rd(`${RUN}_input.json`);
const im = new Map(input.map((r) => [r.name, r]));
const dead = /ENOTFOUND|no_website/;
const recover = sig.filter((r) => r.status === 'unreachable' && !dead.test(r.fetch || ''))
  .map((r) => im.get(r.name)).filter(Boolean);
writeFileSync(`${DIR}/${RUN}_recover_input.json`, JSON.stringify(recover, null, 2));
console.error(`recover set: ${recover.length} (retryable unreachable; ${sig.filter((r) => r.status === 'unreachable').length - recover.length} skipped as dead)`);
console.error(`next: RUN=${RUN}_recover TIMEOUT=35000 NODE_TLS_REJECT_UNAUTHORIZED=0 node pipeline.mjs`);
