import json
from pathlib import Path

capture_root = Path('docs/superpowers/migrations/captures/2026-09-26')
excluded_names = {
    'flow-echo-resource-feedback-paired-check', 'tasks-read-error-paired-check',
    'tasks-read-retry-paired-check', 'review-dirty-field-repeat',
    'review-range-30-repeat', 'tasks-read-error-repeat',
    'tasks-read-error-scrollbar-diagnostic', 'task-board-svg-debug-current',
    'task-board-pointer-away-current', 'search-open-mobile-after',
}
pairs = {}
for manifest_path in sorted(capture_root.rglob('manifest-*.json')):
    if manifest_path.parent.name in excluded_names:
        continue
    manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
    by_key = {}
    for viewport in manifest.get('viewports', []):
        if viewport.get('framework') not in {'react', 'vue'}:
            continue
        by_key.setdefault((viewport['width'], viewport['height']), {})[viewport['framework']] = viewport
    for (width, height), sides in by_key.items():
        if set(sides) != {'react', 'vue'}:
            continue
        react, vue = sides['react'], sides['vue']
        react_path, vue_path = Path(react['image']), Path(vue['image'])
        pair_key = (str(react_path.resolve()), str(vue_path.resolve()))
        if pair_key in pairs:
            continue
        geometry = json.loads(Path(vue['geometry']).read_text(encoding='utf-8'))
        viewport_env = geometry.get('viewport', {})
        pair_id = f'{len(pairs) + 1:03d}'
        pairs[pair_key] = {
            'id': pair_id,
            'route': manifest['route'],
            'manifest': str(manifest_path.resolve()),
            'viewport': f'{width}x{height}',
            'width': width,
            'height': height,
            'visualScale': float(viewport_env.get('visualScale', 1)),
            'visualWidth': float(viewport_env.get('visualWidth', width)),
            'visualHeight': float(viewport_env.get('visualHeight', height)),
            'reactImage': str(react_path.resolve()),
            'vueImage': str(vue_path.resolve()),
            'interactionSteps': len(manifest.get('interaction', {}).get('steps', [])),
            'stateDirectory': manifest_path.parent.name,
        }
result = list(pairs.values())
Path('tmp/official-current-pairs.json').write_text(json.dumps(result, ensure_ascii=False, indent=2), encoding='utf-8')
print(f'official current recapture pairs={len(result)}; scale=2 pairs={sum(row["visualScale"] == 2 for row in result)}; list=tmp/official-current-pairs.json')
