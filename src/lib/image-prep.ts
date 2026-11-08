/**
 * Crop and resize an image in the browser before it is uploaded.
 *
 * The artist profile API stores exactly what it receives — no server-side
 * resizing (artist-profile-api.md §7) — so a 12 MB phone photo would be
 * served as a 12 MB avatar. Here it is centre-cropped to the target shape and
 * scaled DOWN (never up) to the suggested size, keeping its own format.
 *
 * GIFs pass through untouched: drawing one on a canvas keeps only its first
 * frame, which would silently turn an animated avatar into a still.
 */

export const ARTIST_IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif"];
export const ARTIST_IMAGE_MAX_BYTES = 15 * 1024 * 1024;

export interface ImageTarget {
  width: number;
  height: number;
}

export async function prepareImage(file: File, target: ImageTarget): Promise<File> {
  if (file.type === "image/gif") return file;

  const bitmap = await loadBitmap(file);
  const want = target.width / target.height;
  const have = bitmap.width / bitmap.height;

  // Centre crop to the target aspect.
  let sw = bitmap.width;
  let sh = bitmap.height;
  if (have > want) sw = Math.round(bitmap.height * want);
  else if (have < want) sh = Math.round(bitmap.width / want);
  const sx = Math.round((bitmap.width - sw) / 2);
  const sy = Math.round((bitmap.height - sh) / 2);

  // Scale down only.
  const scale = Math.min(1, target.width / sw);
  const dw = Math.round(sw * scale);
  const dh = Math.round(sh * scale);

  // Already the right shape and no bigger than needed: send the original.
  if (sx === 0 && sy === 0 && scale === 1 && sw === bitmap.width && sh === bitmap.height) {
    close(bitmap);
    return file;
  }

  const canvas = document.createElement("canvas");
  canvas.width = dw;
  canvas.height = dh;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    close(bitmap);
    return file;
  }
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap as CanvasImageSource, sx, sy, sw, sh, 0, 0, dw, dh);
  close(bitmap);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, file.type, file.type === "image/png" ? undefined : 0.9)
  );
  // A browser that cannot encode this type returns null or falls back to PNG;
  // either way the declared mimeType would no longer match, so keep the original.
  if (!blob || blob.type !== file.type) return file;
  return new File([blob], file.name, { type: file.type, lastModified: Date.now() });
}

async function loadBitmap(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if (typeof createImageBitmap === "function") {
    try {
      return await createImageBitmap(file);
    } catch {
      /* fall through to <img> */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

function close(b: ImageBitmap | HTMLImageElement) {
  if ("close" in b) b.close();
}
