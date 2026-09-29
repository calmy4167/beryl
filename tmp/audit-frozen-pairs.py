import json
import sys
from pathlib import Path

from PIL import Image, ImageChops


pair_path = Path(sys.argv[1] if len(sys.argv) > 1 else "tmp/official-current-pairs.json")
pairs = json.loads(pair_path.read_text(encoding="utf-8"))
results = []
for pair in pairs:
    with Image.open(pair["reactImage"]).convert("RGBA") as left, Image.open(pair["vueImage"]).convert("RGBA") as right:
        if left.size != right.size:
            count = max(left.width * left.height, right.width * right.height)
            status = "dimension-mismatch"
        else:
            diff = ImageChops.difference(left, right)
            count = sum(1 for pixel in diff.getdata() if pixel != (0, 0, 0, 0))
            status = "exact" if count == 0 else "nonzero"
    results.append({"id": pair["id"], "route": pair["route"], "viewport": pair["viewport"], "status": status, "differentPixels": count})

summary = {}
for result in results:
    summary[result["status"]] = summary.get(result["status"], 0) + 1
output = {"source": str(pair_path), "count": len(results), "summary": summary, "results": results}
Path("tmp/frozen-pair-audit.json").write_text(json.dumps(output, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({"count": len(results), "summary": summary, "largestResiduals": sorted((x for x in results if x["status"] != "exact"), key=lambda x: x["differentPixels"], reverse=True)[:25]}, ensure_ascii=False, indent=2))
