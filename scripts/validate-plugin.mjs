import { access, readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

const root = path.resolve(import.meta.dirname, "..");
const manifestPath = path.join(root, ".codex-plugin", "plugin.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const failures = [];

if (manifest.name !== "monster-expedition") failures.push("manifest name must be monster-expedition");
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(manifest.version ?? "")) {
  failures.push("manifest version must be semver");
}
if (!manifest.description || !manifest.author?.name) failures.push("description and author.name are required");
if (!Array.isArray(manifest.interface?.defaultPrompt) || manifest.interface.defaultPrompt.length > 3) {
  failures.push("interface.defaultPrompt must contain at most three prompts");
}

for (const key of ["skills", "mcpServers"]) {
  const relative = manifest[key];
  if (typeof relative !== "string" || !relative.startsWith("./")) {
    failures.push(`${key} must be a ./ relative path`);
    continue;
  }
  try {
    await access(path.join(root, relative));
  } catch {
    failures.push(`${key} does not exist: ${relative}`);
  }
}

if (JSON.stringify(manifest).includes("[TODO:")) failures.push("manifest contains a TODO placeholder");

if (failures.length) {
  for (const failure of failures) process.stderr.write(`- ${failure}\n`);
  process.exit(1);
}

process.stdout.write(`Plugin manifest valid: ${manifest.name}@${manifest.version}\n`);
