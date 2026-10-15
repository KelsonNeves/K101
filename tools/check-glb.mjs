// Valida os .glb das plantas.  node tools/check-glb.mjs jogos/<slug>
import { readdir, readFile } from 'node:fs/promises';

const game = process.argv[2];
if (!game) { console.error('Uso: node tools/check-glb.mjs jogos/<slug>'); process.exit(1); }
const dir = `${game}/assets/models/plants`;
const LIMIT = { stageTris: 400, totalTris: 1500, kb: 80 };
let bad = 0;
const fail = (f, msg) => { bad++; console.error(`✗ ${f}: ${msg}`); };

function readGlb(buf) {
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error('não é um .glb');
  const jsonLen = buf.readUInt32LE(12);
  return JSON.parse(buf.toString('utf8', 20, 20 + jsonLen));
}
function trisOfMesh(g, mi) {
  let t = 0;
  for (const p of g.meshes[mi].primitives) {
    if ((p.mode ?? 4) !== 4) continue;
    const acc = p.indices !== undefined ? g.accessors[p.indices] : g.accessors[p.attributes.POSITION];
    t += acc.count / 3;
  }
  return t;
}
function walk(g, ni, acc) {
  const n = g.nodes[ni];
  if (n.mesh !== undefined) { acc.meshes++; acc.tris += trisOfMesh(g, n.mesh); }
  for (const c of n.children ?? []) walk(g, c, acc);
}
const near = (arr, ref) => !arr || arr.every((v, i) => Math.abs(v - ref[i]) < 1e-4);

let files;
try { files = (await readdir(dir)).filter((x) => x.endsWith('.glb')); }
catch { console.error(`Pasta não encontrada: ${dir}`); process.exit(1); }
if (!files.length) console.warn(`Nenhum .glb em ${dir} (o jogo usa modelos provisórios).`);

for (const f of files) {
  const before = bad;
  const buf = await readFile(`${dir}/${f}`);
  let g;
  try { g = readGlb(buf); } catch (e) { fail(f, e.message); continue; }
  const roots = g.scenes[g.scene ?? 0].nodes ?? [];
  const byName = Object.fromEntries(roots.map((i) => [g.nodes[i].name, i]));
  let total = 0;
  for (let s = 1; s <= 5; s++) {
    const i = byName[`stage_${s}`];
    if (i === undefined) { fail(f, `faltou o nó raiz stage_${s}`); continue; }
    const n = g.nodes[i];
    if (!near(n.translation, [0, 0, 0]) || !near(n.scale, [1, 1, 1]) || !near(n.rotation, [0, 0, 0, 1]))
      fail(f, `stage_${s} precisa ter posição 0, rotação 0 e escala 1`);
    const acc = { tris: 0, meshes: 0 };
    walk(g, i, acc);
    if (!acc.meshes) fail(f, `stage_${s} não tem malha`);
    if (acc.tris > (s <= 2 ? 60 : LIMIT.stageTris)) fail(f, `stage_${s}: ${acc.tris} triângulos (máx. ${s <= 2 ? 60 : LIMIT.stageTris})`);
    total += acc.tris;
  }
  const extras = roots.filter((i) => !/^stage_[1-5]$/.test(g.nodes[i].name));
  if (extras.length) fail(f, `nós raiz fora do padrão: ${extras.map((i) => g.nodes[i].name).join(', ')}`);
  if (total > LIMIT.totalTris) fail(f, `${total} triângulos no arquivo (máx. ${LIMIT.totalTris})`);
  if (g.images?.length) fail(f, 'tem textura (use só cor sólida)');
  if (g.animations?.length || g.skins?.length) fail(f, 'tem animação ou armadura');
  const kb = Math.round(buf.length / 1024);
  if (kb > LIMIT.kb) fail(f, `${kb} KB (máx. ${LIMIT.kb})`);
  if (bad === before) console.log(`✓ ${f}: ${total} triângulos, ${kb} KB`);
}
console.log(bad ? `${bad} problema(s).` : 'Tudo certo.');
process.exit(bad ? 1 : 0);
