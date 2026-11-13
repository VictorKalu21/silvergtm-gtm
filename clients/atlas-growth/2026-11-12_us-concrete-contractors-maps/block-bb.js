// preload guard (node -r): this run is MillionVerifier STAGE 1 ONLY. Any fetch to BounceBan throws, so a runner path that would
// route an address to stage 2 cannot spend or even send a request. No engine edit.
const of = globalThis.fetch;
globalThis.fetch = (u, ...a) => { if (/bounceban/i.test(String(u && u.url || u))) throw new Error('BounceBan blocked: stage 1 only (no separate go yet)'); return of(u, ...a); };
