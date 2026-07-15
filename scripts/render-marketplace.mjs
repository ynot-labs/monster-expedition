import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const repository = process.argv[2];
const ref = process.argv[3] ?? "v0.2.0";

if (!repository || !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
  process.stderr.write("Usage: node scripts/render-marketplace.mjs <owner/repository> [ref]\n");
  process.exit(2);
}

const marketplace = {
  name: "monster-expedition-public",
  interface: { displayName: "Monster Expedition" },
  plugins: [
    {
      name: "monster-expedition",
      source: {
        source: "url",
        url: `https://github.com/${repository}.git`,
        ref,
      },
      policy: {
        installation: "AVAILABLE",
        authentication: "ON_INSTALL",
      },
      category: "Other",
    },
  ],
};

const output = path.resolve("release", "marketplace.json");
await mkdir(path.dirname(output), { recursive: true });
await writeFile(output, `${JSON.stringify(marketplace, null, 2)}\n`, "utf8");
process.stdout.write(`${output}\n`);
