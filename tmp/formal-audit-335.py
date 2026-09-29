import json
from pathlib import Path
from PIL import Image, ImageChops

root = Path.cwd()
capture_root = root / 'docs/superpowers/migrations/captures/2026-09-26'
excluded_names = {
    'flow-echo-resource-feedback-paired-check',
    'tasks-read-error-paired-check',
    'tasks-read-retry-paired-check',
    'review-dirty-field-repeat',
    'review-range-30-repeat',
    'tasks-read-error-repeat',
    'tasks-read-error-scrollbar-diagnostic',
    'task-board-svg-debug-current',
    'task-board-pointer-away-current',
    'search-open-mobile-after',
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
    for size, sides in by_key.items():
        if set(sides) != {'react', 'vue'}:
            continue
        react_path = Path(sides['react']['image'])
        vue_path = Path(sides['vue']['image'])
        key = (str(react_path.resolve()), str(vue_path.resolve()))
        pairs.setdefault(key, {'manifest': manifest_path, 'size': size})

results = []
for (react_path, vue_path), meta in pairs.items():
    with Image.open(react_path) as ref_image, Image.open(vue_path) as candidate_image:
        ref_image = ref_image.convert('RGBA')
        candidate_image = candidate_image.convert('RGBA')
        if ref_image.size != candidate_image.size:
            results.append((meta, None, ref_image.size, candidate_image.size))
            continue
        difference = ImageChops.difference(ref_image, candidate_image)
        mask = difference.convert('RGB').convert('L').point([0] + [255] * 255)
        results.append((meta, mask.histogram()[255], ref_image.size, candidate_image.size))

nonzero = [row for row in results if row[1] not in (None, 0)]
print(f'formal candidates={len(pairs)} exact={len(results)-len(nonzero)} nonzero={len(nonzero)}')
print(f'unreadable-size-mismatches={sum(row[1] is None for row in results)}')
print('nonzero rows:')
for meta, count, ref_size, candidate_size in sorted(nonzero, key=lambda row: row[1] or 0, reverse=True):
    print(f'{count:5} {meta["size"][0]}x{meta["size"][1]} {meta["manifest"].parent.name}/{meta["manifest"].name}')
