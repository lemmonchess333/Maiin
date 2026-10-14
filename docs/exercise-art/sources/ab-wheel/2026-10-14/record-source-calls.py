from pathlib import Path
import hashlib, json
r = Path(__file__).resolve().parent
p = r / 'provenance.json'
d = json.loads(p.read_text(encoding='utf-8'))
rows = [
    ('Roll', 'roll-prompt.txt', 'exec-eac66659-d7e6-4b96-a82d-6e6c36111288.png', 'roll-original.png', ['Canonical FA56 identity', 'Intact no-shorts Brace master; exact scene authority']),
    ('Reach', 'reach-prompt.txt', 'exec-0dc22d2b-287d-4564-8bf2-18c7a44664e0.png', 'reach-original.png', ['Canonical FA56 identity', 'Intact no-shorts Brace master; exact scene authority', 'Adjacent whole Roll pose; edit target'])
]
for pose, prompt, output, source, roles in rows:
    if not any(x['pose'] == pose for x in d['calls']):
        d['calls'].append({'pose': pose, 'prompt': prompt, 'referenceRoles': roles,
            'savedToolOutputPath': 'C:/Users/myles/.codex/generated_images/01a10711-412c-7ce2-8907-eb9f63d462da/' + output,
            'workspaceSource': source, 'sourceSha256': hashlib.sha256((r/source).read_bytes()).hexdigest(),
            'size': [1536,1024], 'result': 'image produced; physical cycle measurements/review pending',
            'notClaimed': 'No raw request ID exposed by built-in result; file output identifier preserved instead'})
for item in d['calls']:
    item['promptSha256'] = hashlib.sha256((r/item['prompt']).read_bytes()).hexdigest()
d['newImageRequests'] = len(d['calls'])
p.write_text(json.dumps(d,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'newImageRequests': d['newImageRequests'], 'sources': [x['workspaceSource'] for x in d['calls']], 'completionCredit':0}))
