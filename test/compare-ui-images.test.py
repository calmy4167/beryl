from pathlib import Path
import subprocess
import sys
import tempfile
import unittest

from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
COMPARATOR = ROOT / "test" / "compare-ui-images.py"


class CompareUiImagesTests(unittest.TestCase):
    def run_comparator(self, left: Image.Image, right: Image.Image):
        with tempfile.TemporaryDirectory(prefix="calmy-image-diff-") as directory:
            reference = Path(directory) / "reference.png"
            candidate = Path(directory) / "candidate.png"
            left.save(reference)
            right.save(candidate)
            return subprocess.run(
                [sys.executable, str(COMPARATOR), str(reference), str(candidate)],
                cwd=ROOT,
                capture_output=True,
                text=True,
                check=False,
            )

    def test_reports_changed_pixels_and_writes_heatmap(self):
        left = Image.new("RGBA", (2, 2), "white")
        right = left.copy()
        right.putpixel((1, 0), (0, 0, 0, 255))

        result = self.run_comparator(left, right)

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("1/4", result.stdout)
        self.assertIn("heatmap", result.stdout.lower())

    def test_counts_each_pixel_once_including_alpha_only_changes(self):
        left = Image.new("RGBA", (3, 2), (30, 60, 90, 255))
        right = left.copy()
        right.putpixel((0, 0), (30, 60, 90, 0))
        right.putpixel((2, 1), (30, 61, 90, 255))

        result = self.run_comparator(left, right)

        self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
        self.assertIn("2/6", result.stdout)

    def test_identical_images_pass(self):
        image = Image.new("RGBA", (2, 2), (32, 64, 96, 255))

        result = self.run_comparator(image, image.copy())

        self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
        self.assertIn("identical", result.stdout.lower())

    def test_different_dimensions_fail_with_clear_message(self):
        result = self.run_comparator(Image.new("RGB", (2, 2)), Image.new("RGB", (3, 2)))

        self.assertEqual(result.returncode, 2, result.stdout + result.stderr)
        self.assertIn("dimensions", (result.stdout + result.stderr).lower())


if __name__ == "__main__":
    unittest.main()
