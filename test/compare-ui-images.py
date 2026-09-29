#!/usr/bin/env python3
"""Compare two UI screenshots pixel-for-pixel and save a red heatmap."""

import argparse
from pathlib import Path
import sys

from PIL import Image, ImageChops


def compare(reference_path: Path, candidate_path: Path, heatmap_path: Path | None = None) -> int:
    with Image.open(reference_path) as reference_file, Image.open(candidate_path) as candidate_file:
        reference = reference_file.convert("RGBA")
        candidate = candidate_file.convert("RGBA")

    if reference.size != candidate.size:
        print(
            f"Image dimensions differ: reference={reference.width}x{reference.height}, "
            f"candidate={candidate.width}x{candidate.height}",
            file=sys.stderr,
        )
        return 2

    difference = ImageChops.difference(reference, candidate)
    red, green, blue, alpha = difference.split()
    intensity = ImageChops.lighter(ImageChops.lighter(red, green), ImageChops.lighter(blue, alpha))
    changed_mask = intensity.point([0] + [255] * 255)
    changed = changed_mask.histogram()[255]
    total = reference.width * reference.height
    if changed == 0:
        print(f"Images are identical ({reference.width}x{reference.height}).")
        return 0

    heatmap_path = heatmap_path or candidate_path.with_name(f"{candidate_path.stem}.heatmap.png")
    heatmap = Image.merge("RGB", (
        changed_mask.point([18] + [255] * 255),
        intensity.point([24] + [max(24, min(210, value)) for value in range(1, 256)]),
        changed_mask.point([24] + [0] * 255),
    ))
    heatmap.save(heatmap_path)
    percentage = changed * 100 / total
    print(f"Images differ: {changed}/{total} pixels ({percentage:.4f}%). Heatmap: {heatmap_path}")
    return 1


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("reference", type=Path, help="reference screenshot")
    parser.add_argument("candidate", type=Path, help="candidate screenshot")
    parser.add_argument("--heatmap", type=Path, help="optional output path for the difference heatmap")
    args = parser.parse_args()
    try:
        return compare(args.reference, args.candidate, args.heatmap)
    except (OSError, ValueError) as error:
        print(f"Unable to compare screenshots: {error}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
