import json
from pathlib import Path
from PIL import Image, ImageChops

roots = [Path('docs/superpowers/migrations/captures/2026-09-26')]
states = {}
for root in roots:
    for manifest_path in root.rglob('manifest-*.json'):
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        steps = json.dumps(manifest.get('interaction', {}).get('steps', []), sort_keys=True, ensure_ascii=False)
        visible = json.dumps([item.get('text') for viewport in manifest.get('viewports', []) for item in viewport.get('visibleText', [])], ensure_ascii=False)
        key = (manifest.get('route'), steps, visible)
        states.setdefault(key, []).append((manifest, manifest_path))

pairs = {}
for records in states.values():
    latest_by_side = {}
    for manifest, manifest_path in records:
        captured_at = manifest.get('capturedAt', '')
        for viewport in manifest.get('viewports', []):
            if viewport.get('framework') not in {'react', 'vue'}:
                continue
            key = (viewport['width'], viewport['height'], viewport['framework'])
            current = latest_by_side.get(key)
            if current is None or captured_at > current[0]:
                latest_by_side[key] = (captured_at, viewport, manifest_path)
    sides = {}
    for (width, height, framework), (_, viewport, manifest_path) in latest_by_side.items():
        sides.setdefault((width, height), {})[framework] = (viewport, manifest_path)
    for size, values in sides.items():
        if set(values) == {'react', 'vue'}:
            react_viewport, react_manifest = values['react']
            vue_viewport, vue_manifest = values['vue']
            key = (react_viewport['image'], vue_viewport['image'])
            pairs.setdefault(key, (vue_manifest, size))

exact = 0
nonzero = []
for (react_path, vue_path), (manifest_path, size) in pairs.items():
    with Image.open(react_path) as react, Image.open(vue_path) as vue:
        react, vue = react.convert('RGBA'), vue.convert('RGBA')
        diff = ImageChops.difference(react, vue)
        mask = diff.convert('RGB').convert('L').point([0] + [255] * 255)
        changed = mask.histogram()[255]
    if changed:
        nonzero.append((changed, size, manifest_path.parent.name))
    else:
        exact += 1
print(f'latest states={len(states)} merged viewport pairs={len(pairs)} exact={exact} nonzero={len(nonzero)}')
for row in sorted(nonzero, reverse=True):
    print(row)
