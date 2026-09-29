import json
from pathlib import Path
p=Path('docs/superpowers/migrations/captures/2026-09-26/task-board-keyboard-status-after-fix/manifest-app_module_tasks-1440x900_1024x768_390x844.json')
d=json.loads(p.read_text(encoding='utf-8'))
for step in d['interaction']['steps']:
    if step.get('selector') == 'button[aria-label="临时键盘状态行动状态"]':
        step['selector'] = 'select[aria-label="临时键盘状态行动状态"]'
p.write_text(json.dumps(d, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
