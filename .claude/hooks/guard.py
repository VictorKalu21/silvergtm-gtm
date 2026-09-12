#!/usr/bin/env python3
"""PreToolUse guard (Bash | Write | Edit). Deterministic, fails OPEN on any internal error.

Rule A - job-local scripts: creating or running a *.js/*.mjs/*.cjs/*.sh/*.py inside a dated run
         folder (clients/<client>/YYYY-MM-DD_*/) requires <run>/.skill-check to exist.
         The marker is written by hand AFTER doing SKILL.md STEP 0 (inventory sibling skills).
Rule B - owner-finding without a prompt: any command or write touching <run>/owner/ or
         <run>/owner_new/ requires <run>/owner-prompt.md (SKILL.md STEP 6a) to exist.
"""
import json, os, re, sys

RUN_RE = re.compile(r'(?:^|[\s"\'=(])((?:[^\s"\'()]*?/)?clients/([^/\s"\']+)/(\d{4}-\d{2}-\d{2}[^/\s"\']*)/([^\s"\'()]*))')
SCRIPT_RE = re.compile(r'\.(?:js|mjs|cjs|sh|py)$')

def deny(reason):
    print(json.dumps({"hookSpecificOutput": {"hookEventName": "PreToolUse",
        "permissionDecision": "deny", "permissionDecisionReason": reason}}))
    sys.exit(0)

def run_root(prefix, client, run):
    # resolve the run folder on disk from whatever prefix the path used
    p = os.path.join(prefix, 'clients', client, run) if prefix else os.path.join('clients', client, run)
    if not os.path.isdir(p):
        alt = os.path.join(os.getcwd(), 'clients', client, run)
        p = alt if os.path.isdir(alt) else p
    return p

def main():
    try:
        data = json.load(sys.stdin)
    except Exception:
        return
    tool = data.get('tool_name', '')
    ti = data.get('tool_input') or {}
    text = ''
    if tool in ('Write', 'Edit'):
        text = ti.get('file_path', '') or ''
    elif tool == 'Bash':
        text = ti.get('command', '') or ''
    else:
        return
    hits = RUN_RE.findall(text)
    if not hits:
        return
    for full, client, run, rest in hits:
        prefix = full.split('clients/')[0]
        root = run_root(prefix, client, run)
        tag = f'clients/{client}/{run}'
        # Rule B
        if rest.startswith('owner/') or rest.startswith('owner_new/') or rest in ('owner', 'owner_new'):
            if not os.path.exists(os.path.join(root, 'owner-prompt.md')):
                deny(f"Owner-finding gate: {tag}/owner-prompt.md does not exist. SKILL.md STEP 6a: "
                     f"build the per-vertical owner prompt from skills/google-maps-scrape/owner-prompt.template.md "
                     f"(or copy clients/{client}/owner-prompts/<vertical>.md) BEFORE any owner-finding fetch, read, "
                     f"or extraction. Nothing under owner/ is written or read until the prompt exists.")
        # Rule A
        if SCRIPT_RE.search(rest.split()[0] if rest else ''):
            creating = tool in ('Write', 'Edit') or re.search(r'(>\s*|tee\s+(-a\s+)?|node\s+|python3?\s+|bash\s+|sh\s+)\S*' + re.escape(rest.split()[0]), text)
            if creating and not os.path.exists(os.path.join(root, '.skill-check')):
                deny(f"Job-local script gate: {tag}/{rest.split()[0]} would be created or run without "
                     f"{tag}/.skill-check. SKILL.md STEP 0: first `ls skills/` and read the sibling skill that "
                     f"covers this need (web-scrape-triage, name-to-domain, email-verify-debounce-bounceban, "
                     f"icp-source-planner, web-visitor-deid-qualify). If none does, record it and retry: "
                     f"printf 'checked: <skills read>\\nneed: <one line>\\n' > {tag}/.skill-check . "
                     f"An engine capability gap is fixed in skills/google-maps-scrape with a test and an "
                     f"IMPROVEMENTS.md entry, not with a run-folder script.")

if __name__ == '__main__':
    try:
        main()
    except Exception:
        pass
