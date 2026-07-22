// Minimal RFC-4180 CSV parser/writer — handles embedded commas, quotes, newlines.
// Board feeds have commas inside fields; never use naive split on these.
function parse(text) {
  const rows = []; let f = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else {
      if (c === '"') q = true;
      else if (c === ',') { f.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') {
        if (c === '\r' && text[i + 1] === '\n') i++;
        if (cur !== '' || f.length) { f.push(cur); rows.push(f); f = []; cur = ''; }
      } else cur += c;
    }
  }
  if (cur !== '' || f.length) { f.push(cur); rows.push(f); }
  return rows;
}
const esc = v => { v = (v == null ? '' : String(v)); return /[",\n]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; };
const write = rows => rows.map(r => r.map(esc).join(',')).join('\n');
const norm = s => (s || '').toLowerCase().replace(/[.,]/g, '').replace(/\b(inc|llc|ltd|corp|co|the|gmbh)\b/g, '').replace(/[^a-z0-9]/g, '').trim();
module.exports = { parse, write, esc, norm };
