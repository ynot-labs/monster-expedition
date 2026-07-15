import { readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "dist", "widget");
const htmlPath = path.join(outputDirectory, "index.html");
const assetsDirectory = path.join(outputDirectory, "assets");

let html = await readFile(htmlPath, "utf8");
const assets = await readdir(assetsDirectory);

for (const asset of assets) {
  const source = await readFile(path.join(assetsDirectory, asset), "utf8");
  const escapedAsset = asset.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

  if (asset.endsWith(".css")) {
    const stylesheetPattern = new RegExp(
      `<link[^>]+href=["']\\./assets/${escapedAsset}["'][^>]*>`,
    );
    html = html.replace(stylesheetPattern, () => `<style>${source}</style>`);
  }

  if (asset.endsWith(".js")) {
    const scriptPattern = new RegExp(
      `<script[^>]+src=["']\\./assets/${escapedAsset}["'][^>]*></script>`,
    );
    html = html.replace(scriptPattern, () => `<script type="module">${source}</script>`);
  }
}

await writeFile(htmlPath, html, "utf8");
