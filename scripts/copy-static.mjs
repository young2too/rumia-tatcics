import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");

await mkdir(resolve(root, "dist"), { recursive: true });
await cp(resolve(root, "assets"), resolve(root, "dist", "assets"), {
  recursive: true,
  force: true,
});
