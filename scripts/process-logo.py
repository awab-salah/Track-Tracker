#!/usr/bin/env python3
"""Process the new TrackTracker logo: generate favicon, OG image, and hero logo."""

from PIL import Image, ImageOps
from pathlib import Path

SRC = Path("/home/z/my-project/upload/IMG_20260729_191612.jpg")
OUT = Path("/home/z/my-project/Track-Tracker/artifacts/landing-page/public")

img = Image.open(SRC)
img = ImageOps.exif_transpose(img)  # fix orientation

# Convert to RGBA for transparency support
img_rgba = img.convert("RGBA")

# 1. Favicon 32x32 PNG
fav32 = img_rgba.resize((32, 32), Image.LANCZOS)
fav32.save(OUT / "favicon-32.png", "PNG")
print(f"favicon-32.png: {fav32.size}")

# 2. Favicon 16x16 PNG
fav16 = img_rgba.resize((16, 16), Image.LANCZOS)
fav16.save(OUT / "favicon-16.png", "PNG")
print(f"favicon-16.png: {fav16.size}")

# 3. Apple touch icon 180x180 PNG
apple = img_rgba.resize((180, 180), Image.LANCZOS)
apple.save(OUT / "apple-touch-icon.png", "PNG")
print(f"apple-touch-icon.png: {apple.size}")

# 4. OG image (1200x630 with padding, centered logo)
og_w, og_h = 1200, 630
og_canvas = Image.new("RGBA", (og_w, og_h), (16, 76, 100, 255))  # teal-700 bg

# Scale logo to fit within 400px height
logo_h = 400
logo_w = int(img_rgba.width * (logo_h / img_rgba.height))
logo_resized = img_rgba.resize((logo_w, logo_h), Image.LANCZOS)

# Center on canvas
x = (og_w - logo_w) // 2
y = (og_h - logo_h) // 2
og_canvas.paste(logo_resized, (x, y), logo_resized if logo_resized.mode == "RGBA" else None)
og_canvas.save(OUT / "og-image.png", "PNG")
print(f"og-image.png: {og_canvas.size}")

# Also save as WebP for faster loading
og_canvas_rgb = og_canvas.convert("RGB")
og_canvas_rgb.save(OUT / "og-image.webp", "WEBP", quality=90)
print(f"og-image.webp: {og_canvas.size}")

# 5. Hero logo (large, 512x512 for crisp display)
hero = img_rgba.resize((512, 512), Image.LANCZOS)
hero.save(OUT / "icons" / "logo.png", "PNG")
print(f"icons/logo.png: {hero.size}")

# 6. Icon-512 for manifest
hero.save(OUT / "icons" / "icon-512.png", "PNG")
print(f"icons/icon-512.png: {hero.size}")

print("\nDone! All logo variants generated.")
