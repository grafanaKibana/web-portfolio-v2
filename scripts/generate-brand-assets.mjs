/** Regenerates platform icons from public/brand/mark.svg. */
import { readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

const source = await readFile(new URL("../public/brand/mark.svg", import.meta.url), "utf8");
const paths = source.slice(source.indexOf("  <path"), source.indexOf("</svg>"));
const whitePaths = paths.replace('fill="currentColor"', 'fill="#fafafa"');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256"><rect width="256" height="256" rx="48" fill="#111"/><g transform="translate(30 45) scale(.75)">${whitePaths}</g></svg>\n`;
const touchIcon = icon.replace('rx="48"', 'rx="0"');

await writeFile(new URL("../app/icon.svg", import.meta.url), icon);
await sharp(Buffer.from(touchIcon)).resize(180, 180).png().toFile(new URL("../app/apple-icon.png", import.meta.url).pathname);

const sizes = [16, 32, 48, 64];
const images = await Promise.all(sizes.map((size) => sharp(Buffer.from(icon)).resize(size, size).png().toBuffer()));
const directory = Buffer.alloc(6 + sizes.length * 16);
directory.writeUInt16LE(1, 2);
directory.writeUInt16LE(sizes.length, 4);
let offset = directory.length;
for (const [index, data] of images.entries()) {
  const entry = 6 + index * 16;
  directory.writeUInt8(sizes[index], entry);
  directory.writeUInt8(sizes[index], entry + 1);
  directory.writeUInt16LE(1, entry + 4);
  directory.writeUInt16LE(32, entry + 6);
  directory.writeUInt32LE(data.length, entry + 8);
  directory.writeUInt32LE(offset, entry + 12);
  offset += data.length;
}
await writeFile(new URL("../app/favicon.ico", import.meta.url), Buffer.concat([directory, ...images]));
