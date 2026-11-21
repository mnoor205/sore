// Run after build:worker and a staging bundle: useful when a deployment
// connector supports multipart Worker modules but cannot supply Assets JWTs.
import {
  readdir,
  readFile,
  mkdir,
  copyFile,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, extname, relative } from "node:path";

const root = process.cwd();
const source = resolve(root, ".open-next/assets");
const output = resolve(root, "artifacts/embedded");
const types = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".ico": "image/x-icon",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
  ".json": "application/json",
  ".txt": "text/plain",
  ".html": "text/html",
};
const assets = {};
async function collect(directory) {
  for (const item of await readdir(directory, { withFileTypes: true })) {
    const path = resolve(directory, item.name);
    if (item.isDirectory()) await collect(path);
    else if (
      item.isFile() &&
      !["_headers", "_redirects", ".assetsignore"].includes(item.name)
    ) {
      const bytes = await readFile(path);
      assets["/" + relative(source, path).replaceAll("\\", "/")] = {
        data: bytes.toString("base64"),
        type: types[extname(item.name)] || "application/octet-stream",
        hash: createHash("sha256").update(bytes).digest("hex").slice(0, 32),
      };
    }
  }
}
await collect(source);
await mkdir(output, { recursive: true });
await copyFile(
  resolve(root, "artifacts/app/worker.js"),
  resolve(output, "app.js"),
);
await copyFile(
  resolve(root, "scripts/embedded-assets-worker.mjs"),
  resolve(output, "worker.js"),
);
await writeFile(
  resolve(output, "assets.js"),
  "export default " + JSON.stringify(assets) + ";",
);
console.log(
  `Prepared three Worker modules with ${Object.keys(assets).length} public assets.`,
);
