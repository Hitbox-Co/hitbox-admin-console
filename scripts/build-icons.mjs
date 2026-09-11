/**
 * Generates app icons from the brand mark.
 *
 *   node scripts/build-icons.mjs
 *
 * The source mark is white on transparent, which would vanish against a
 * browser tab's light chrome — so each icon is composited onto the brand
 * ground first. Re-run this whenever public/brand/hitbox-mark.png changes.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = resolve(root, "public/brand/hitbox-mark.png");
const GROUND = { r: 8, g: 9, b: 10, alpha: 1 }; // --ground #08090A

/** Mark inset as a fraction of the canvas, so it never touches the edge. */
const INSET = 0.17;

async function icon(size, outPath) {
  const inner = Math.round(size * (1 - INSET * 2));

  const mark = await sharp(SOURCE)
    .resize(inner, inner, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .toBuffer();

  const buffer = await sharp({
    create: { width: size, height: size, channels: 4, background: GROUND },
  })
    .composite([{ input: mark, gravity: "centre" }])
    .png()
    .toBuffer();

  await mkdir(dirname(outPath), { recursive: true });
  await sharp(buffer).toFile(outPath);
  console.log(`  ${outPath.replace(root, ".")}  ${size}x${size}`);
}

/** Flat white mark on transparent, for use on already-dark surfaces. */
async function markOnly(size, outPath) {
  await sharp(SOURCE)
    .resize(size, size, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(outPath);
  console.log(`  ${outPath.replace(root, ".")}  ${size}x${size} (transparent)`);
}

console.log("Building icons from the brand mark…");
await icon(512, resolve(root, "src/app/icon.png"));
await icon(180, resolve(root, "src/app/apple-icon.png"));
await icon(1200, resolve(root, "public/brand/og-mark.png"));
await markOnly(256, resolve(root, "public/brand/hitbox-mark-256.png"));
console.log("Done.");
