#!/usr/bin/env python3
"""Optimize screenshots for the landing page: resize, strip EXIF, convert to WebP + AVIF."""

import os
from pathlib import Path
from PIL import Image

SRC_DIR = Path("/home/z/my-project/Track-Tracker/artifacts/landing-page/public/screenshots")
OUT_DIR = SRC_DIR  # output in same dir

# Ordered screenshots (chronological, earliest first = top of app flow)
# Sort by timestamp in filename
FILES = sorted(SRC_DIR.glob("IMG_*.jpg"))

# Responsive sizes for the carousel
SIZES = {
    "sm": 360,   # mobile
    "md": 540,   # tablet
    "lg": 720,   # desktop
}

# Friendly names for each screenshot
NAMES = [
    "dashboard",
    "map-tracking",
    "driver-management",
    "sales-recording",
    "reports-analytics",
    "notifications",
    "user-management",
]

def main():
    print(f"Processing {len(FILES)} screenshots...")

    for i, src_path in enumerate(FILES):
        name = NAMES[i] if i < len(NAMES) else f"screen-{i+1}"
        print(f"\n  [{i+1}/{len(FILES)}] {src_path.name} -> {name}")

        img = Image.open(src_path)

        # Strip EXIF (privacy: remove GPS data) by creating new image
        # Also fix orientation from EXIF
        from PIL import ImageOps
        img = ImageOps.exif_transpose(img)

        # Calculate new dimensions maintaining aspect ratio
        # Target: max width 720px for the largest version
        w, h = img.size
        aspect = h / w

        # Generate WebP at each size
        for size_label, max_width in SIZES.items():
            new_w = min(w, max_width)
            new_h = int(new_w * aspect)

            resized = img.resize((new_w, new_h), Image.LANCZOS)

            # WebP output
            webp_path = OUT_DIR / f"{name}-{size_label}.webp"
            resized.save(webp_path, "WEBP", quality=82, method=6)
            print(f"    {webp_path.name} ({new_w}x{new_h}, {webp_path.stat().st_size // 1024}KB)")

        # Also create a full-res WebP for the largest
        webp_full = OUT_DIR / f"{name}.webp"
        img.save(webp_full, "WEBP", quality=85, method=6)
        print(f"    {webp_full.name} (full, {webp_full.stat().st_size // 1024}KB)")

    # Remove original JPGs
    for f in FILES:
        f.unlink()
        print(f"\n  Removed original: {f.name}")

    print(f"\nDone! Optimized screenshots saved to {OUT_DIR}")

if __name__ == "__main__":
    main()
