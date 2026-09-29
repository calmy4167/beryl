import json
from pathlib import Path

roots = [Path('captures'), Path('docs/superpowers/migrations/captures/2026-09-26')]
states = {}
for root in roots:
    if not root.exists():
        continue
    for manifest_path in root.rglob('manifest-*.json'):
        manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
        steps = json.dumps(manifest.get('interaction', {}).get('steps', []), sort_keys=True, ensure_ascii=False)
        visible = json.dumps(
            [item.get('text') for viewport in manifest.get('viewports', []) for item in viewport.get('visibleText', [])],
            ensure_ascii=False,
        )
        key = (manifest.get('route'), steps, visible)
        states.setdefault(key, []).append((manifest, manifest_path.resolve()))

pairs = {}
for state_key, records in states.items():
    latest_by_side = {}
    for manifest, manifest_path in records:
        captured_at = manifest.get('capturedAt', '')
        for viewport in manifest.get('viewports', []):
            framework = viewport.get('framework')
            if framework not in {'react', 'vue'}:
                continue
            key = (viewport['width'], viewport['height'], framework)
            current = latest_by_side.get(key)
            if current is None or captured_at > current[0]:
                latest_by_side[key] = (captured_at, viewport, manifest, manifest_path)

    sides = {}
    for (width, height, framework), record in latest_by_side.items():
        sides.setdefault((width, height), {})[framework] = record
    for (width, height), values in sides.items():
        if set(values) != {'react', 'vue'}:
            continue
        react_stamp, react_viewport, _, _ = values['react']
        vue_stamp, vue_viewport, vue_manifest, vue_manifest_path = values['vue']
        stable_key = (*state_key, width, height)
        pairs.setdefault(stable_key, {
            'id': f'{len(pairs) + 1:03d}',
            'route': vue_manifest.get('route'),
            'manifest': str(vue_manifest_path),
            'viewport': f'{width}x{height}',
            'width': width,
            'height': height,
            'capturedAt': vue_manifest.get('capturedAt', ''),
            'reactImage': react_viewport.get('image'),
            'vueImage': vue_viewport.get('image'),
            'reactCapturedAt': react_stamp,
            'vueCapturedAt': vue_stamp,
            'interactionSteps': len(vue_manifest.get('interaction', {}).get('steps', [])),
        })

result = list(pairs.values())
Path('tmp/current-candidate-pairs.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'current candidate pairs={len(result)}; unique route/state keys={len(states)}; list=tmp/current-candidate-pairs.json')
