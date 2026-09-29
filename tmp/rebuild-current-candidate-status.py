import json
from pathlib import Path
from PIL import Image, ImageChops

pairs = json.loads(Path('tmp/current-candidate-pairs.json').read_text(encoding='utf-8'))
root = Path('captures/2026-09-27/current-source-exhaustive-recapture')
results = []
for pair in pairs:
    output = next(root.glob(f"{pair['id']}-*"), None)
    record = {'id': pair['id'], 'route': pair['route'], 'viewport': pair['viewport'], 'manifest': pair['manifest']}
    if output is None:
        record['status'] = 'recapture-error'
    else:
        record['outputDir'] = str(output.resolve())
        left_path, right_path = output / 'recaptured-react.png', output / 'recaptured-vue.png'
        if not left_path.exists() or not right_path.exists():
            record['status'] = 'recapture-error'
        else:
            with Image.open(left_path).convert('RGBA') as left, Image.open(right_path).convert('RGBA') as right:
                if left.size != right.size:
                    record['status'] = 'dimension-mismatch'
                    record['differentPixels'] = max(left.width * left.height, right.width * right.height)
                else:
                    mask = ImageChops.difference(left, right).convert('RGB').convert('L').point([0] + [255] * 255)
                    changed = mask.histogram()[255]
                    record['status'] = 'exact' if changed == 0 else 'nonzero'
                    record['differentPixels'] = changed
    results.append(record)
summary = {}
for record in results:
    summary[record['status']] = summary.get(record['status'], 0) + 1
status = {'start': 0, 'limit': len(pairs), 'concurrency': 2, 'summary': summary, 'results': results}
Path('tmp/current-candidate-status.json').write_text(json.dumps(status, ensure_ascii=False, indent=2), encoding='utf-8')
print(json.dumps({'total': len(results), 'summary': summary, 'largest': sorted((x for x in results if x.get('differentPixels', 0) >= 10000), key=lambda x: x['differentPixels'], reverse=True)[:25]}, ensure_ascii=False, indent=2))
