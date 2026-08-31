// HeyReach MCP caller. Usage: node hr_call.js <toolName> '<jsonArgs>'
const https = require('https');
const KEY = 'C4h0moR%2FaB%2Bmm449yurs3NqMXUfyL%2BLy2aWZMEUZtw4%3D';
const URL = 'https://mcp.heyreach.io/mcp?xMcpKey=' + KEY;

const tool = process.argv[2];
let a3 = process.argv[3] || '{}'; if (a3.startsWith('@')) a3 = require('fs').readFileSync(a3.slice(1), 'utf8'); const args = JSON.parse(a3);

function post(body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = https.request(URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
        'Content-Length': Buffer.byteLength(data),
      },
    }, (res) => {
      let s = '';
      res.on('data', d => s += d);
      res.on('end', () => resolve(s));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function parseSSE(raw) {
  let out = null;
  for (const line of raw.split(/\r?\n/)) {
    const t = line.startsWith('data:') ? line.slice(5).trim() : (line.trim().startsWith('{') ? line.trim() : '');
    if (!t) continue;
    try { const d = JSON.parse(t); if (d.result !== undefined || d.error !== undefined) out = d; } catch {}
  }
  return out;
}

(async () => {
  const raw = await post({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: tool, arguments: args } });
  const d = parseSSE(raw);
  if (!d) { console.log('RAW:', raw.slice(0, 800)); return; }
  if (d.error) { console.log('ERROR:', JSON.stringify(d.error)); return; }
  // tools/call result: content array with text
  const content = d.result && d.result.content;
  if (Array.isArray(content)) {
    for (const c of content) {
      if (c.type === 'text') process.stdout.write(c.text + '\n');
      else process.stdout.write(JSON.stringify(c) + '\n');
    }
  } else {
    console.log(JSON.stringify(d.result));
  }
})();

