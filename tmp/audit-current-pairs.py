import json
from pathlib import Path
from PIL import Image, ImageChops
import sys

root = Path.cwd()
manifests = list((root / 'captures').rglob('manifest-*.json')) + list((root / 'docs/superpowers/migrations/captures/2026-09-26').rglob('manifest-*.json'))
seen = set()
rows = []
for manifest in manifests:
    data = json.loads(manifest.read_text(encoding='utf-8'))
    react = {(v.get('width'), v.get('height')): v for v in data.get('viewports', []) if v.get('framework') == 'react'}
    vue = {(v.get('width'), v.get('height')): v for v in data.get('viewports', []) if v.get('framework') == 'vue'}
    for dims in react.keys() & vue.keys():
        paths = []
        for item in (react[dims], vue[dims]):
            image = Path(item['image'])
            if not image.is_absolute(): image = root / image
            if not image.exists(): image = manifest.parent / image.name
            paths.append(image)
        key = tuple(map(str, paths))
        if key in seen: continue
        seen.add(key)
        with Image.open(paths[0]) as r, Image.open(paths[1]) as v:
            r, v = r.convert('RGBA'), v.convert('RGBA')
            if r.size != v.size: rows.append((manifest, 0, None, None, r.size, v.size)); continue
            d = ImageChops.difference(r, v)
            channels = d.split()
            intensity = ImageChops.lighter(ImageChops.lighter(channels[0], channels[1]), channels[2])
            mask = intensity.point([0] + [255]*255)
            n = mask.histogram()[255]
            if n:
                extrema = [c.getextrema()[1] for c in channels[:3]]
                bbox = mask.getbbox()
                rows.append((manifest, n, max(extrema), bbox, r.size, dims))
print(f'manifests={len(manifests)} unique pairs={len(seen)} differing={len(rows)}')
print('difference buckets:', {
    '0': len(seen) - len(rows),
    '1-75': sum(1 for row in rows if 1 <= row[1] <= 75),
    '76-999': sum(1 for row in rows if 76 <= row[1] < 1000),
    '1000+': sum(1 for row in rows if row[1] >= 1000),
})
for manifest, n, peak, bbox, size, dims in sorted(rows, key=lambda x: x[1], reverse=True):
    name=manifest.parent.name+'/'+manifest.name
    print(f'{n:5} max={str(peak):>3} bbox={str(bbox):20} {size} {dims} {name}')
