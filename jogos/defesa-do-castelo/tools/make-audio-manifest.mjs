// Gera assets/audio/manifest.json com todos os arquivos de áudio da pasta (inclusive subpastas).
// Pode ser executado de QUALQUER pasta:  node tools/make-audio-manifest.mjs
import { readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, extname, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = process.argv[2]
  ? resolve(process.argv[2])
  : resolve(dirname(fileURLToPath(import.meta.url)), "..", "assets", "audio");
const EXTS = new Set([".ogg", ".mp3", ".m4a", ".wav"]);
const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const p = join(dir, name);
  return statSync(p).isDirectory() ? walk(p) : [p];
});

const files = walk(root)
  .filter((f) => EXTS.has(extname(f).toLowerCase()))
  .map((f) => relative(root, f).split("\\").join("/"))
  .sort();

writeFileSync(join(root, "manifest.json"), JSON.stringify({ files }, null, 2) + "\n");
console.log(`manifest.json em ${root}: ${files.length} arquivo(s)`);