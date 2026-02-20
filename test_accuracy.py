"""
Test the tote counting accuracy against real photos.

Usage:
    python test_accuracy.py

Runs each image in imgs/ through the VLM pipeline and prints the results.
Compare the predicted counts against your known ground truth.
"""

import base64
import os
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env")

from server.vlm import count_totes


def run_tests():
    imgs_dir = Path(__file__).parent / "imgs"
    image_files = sorted(imgs_dir.glob("*.jpg"))

    if not image_files:
        print("No images found in imgs/ directory.")
        return

    print(f"Found {len(image_files)} images. Running tote counter...\n")
    print(f"{'Filename':<45} {'Count':>5} {'Confidence':<8} {'Time':>6}")
    print("-" * 70)

    for img_path in image_files:
        with open(img_path, "rb") as f:
            b64 = base64.b64encode(f.read()).decode("utf-8")

        start = time.time()
        result = count_totes(b64)
        elapsed = time.time() - start

        count = result.get("count", "?")
        conf = result.get("confidence", "?")
        error = result.get("error", "")

        status = f"{count:>5} {conf:<8} {elapsed:>5.1f}s"
        if error:
            status += f"  ERROR: {error}"

        print(f"{img_path.name:<45} {status}")

    print("\nDone. Compare these counts against your known ground truth.")
    print("If counts are off, adjust the prompt in server/prompt.py.")


if __name__ == "__main__":
    run_tests()
