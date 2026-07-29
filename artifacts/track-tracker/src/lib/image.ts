// src/lib/image.ts
//
// Client-side image compression utilities.
//
// Why: phone cameras routinely produce 3-8 MB JPEGs. Uploading the raw file
// wastes bandwidth, blows past Supabase Storage's 1 MB free-tier recommendation,
// and slows down every page that lists sales (multiple receipts per page).
//
// We resize the longest edge down to `maxDim` (default 1024px) and re-encode
// as JPEG at `quality` (default 0.82). PNGs with transparency are flattened
// to white — avatars and receipts are opaque content, so transparency loss
// is intentional and desired.
//
// Returns a File (not a Blob) so the caller can pass it directly to
// supabase-js `.upload(path, file)` which sets Content-Type from file.type.

const DEFAULT_MAX_DIM = 1024;
const DEFAULT_QUALITY = 0.82;

/**
 * Load an image File into an HTMLImageElement. Resolves once the image is
 * fully decoded. Rejects on decode error (corrupt file, non-image, etc.).
 */
function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

/**
 * Draw `img` into a canvas sized so the longest edge is `maxDim`, preserving
 * aspect ratio. Never upscales — images smaller than maxDim keep their size.
 */
function drawToCanvas(img: HTMLImageElement, maxDim: number): HTMLCanvasElement {
  const longest = Math.max(img.naturalWidth, img.naturalHeight);
  const scale = longest > maxDim ? maxDim / longest : 1;
  const w = Math.round(img.naturalWidth * scale);
  const h = Math.round(img.naturalHeight * scale);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;

  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas 2D context unavailable');
  // White background — flattens any transparency (avatars/receipts are opaque).
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(img, 0, 0, w, h);
  return canvas;
}

/**
 * Compress an image File in the browser. Resizes the longest edge to
 * `maxDim` (default 1024px) and re-encodes as JPEG at `quality` (default 0.82).
 *
 * Falls back to the ORIGINAL file (untouched) if:
 *   - The browser can't decode the image
 *   - Canvas isn't available (SSR / very old browser)
 *   - The original is already small enough that compression would inflate it
 *
 * Output filename is forced to .jpg so the MIME type matches the bytes.
 */
export async function compressImage(
  file: File,
  maxDim: number = DEFAULT_MAX_DIM,
  quality: number = DEFAULT_QUALITY
): Promise<File> {
  // Quick exit: non-image types can't be compressed — return as-is.
  if (!file.type.startsWith('image/')) return file;

  // Quick exit: very small files (<250 KB) — compression usually inflates them.
  if (file.size < 250 * 1024) return file;

  try {
    const img = await loadImage(file);
    const canvas = drawToCanvas(img, maxDim);

    const blob: Blob = await new Promise((resolve, reject) => {
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(new Error('canvas.toBlob returned null'))),
        'image/jpeg',
        quality
      );
    });

    // If compression somehow produced a LARGER file (rare, but possible for
    // already-compressed JPEGs), keep the original.
    if (blob.size >= file.size) return file;

    // Rename to .jpg — the bytes are JPEG now.
    const originalName = file.name.replace(/\.[^.]+$/, '');
    return new File([blob], `${originalName}.jpg`, { type: 'image/jpeg' });
  } catch (err) {
    console.warn('[image] compression failed, using original file:', err);
    return file;
  }
}
