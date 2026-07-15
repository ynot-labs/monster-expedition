import { build } from "esbuild";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputDirectory = path.join(root, "dist", "runtime");

await mkdir(outputDirectory, { recursive: true });
await build({
  entryPoints: [path.join(root, "server", "index.ts")],
  outfile: path.join(outputDirectory, "monster-expedition-server.mjs"),
  bundle: true,
  format: "esm",
  platform: "node",
  target: "node24",
  legalComments: "eof",
  sourcemap: false,
});
