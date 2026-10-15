// Gera data/games.json (e sitemap.xml) a partir de jogos/*/game.json.
// Rode na raiz do site:  node tools/make-catalog.mjs
//
// Imagens do popup: coloque os prints do jogo na pasta  jogos/<slug>/prints/
// (01.webp, 02.webp, ...). Elas entram no carrossel em ordem de nome.
// Para forçar outra ordem/lista, use "screenshots": ["prints/a.webp", ...] no game.json.
import { readdir, readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";

const DOMAIN = "https://k101.com.br";
const IMG = /\.(webp|png|jpe?g|avif)$/i;
const dirs = await readdir("jogos", { withFileTypes: true });
const games = [];

async function findShots(slug, g) {
  let files;
  if (Array.isArray(g.screenshots) && g.screenshots.length) {
    files = g.screenshots;
  } else {
    const folder = `jogos/${slug}/prints`;
    files = existsSync(folder)
      ? (await readdir(folder)).filter((f) => IMG.test(f)).sort((a, b) => a.localeCompare(b, "pt", { numeric: true })).map((f) => `prints/${f}`)
      : [];
  }
  const ok = [];
  for (const f of files) {
    if (existsSync(`jogos/${slug}/${f}`)) ok.push(`/jogos/${slug}/${encodeURI(f)}`);
    else console.warn(`[catálogo] ${slug}: imagem não encontrada: ${f}`);
  }
  if (!ok.length) console.warn(`[catálogo] ${slug}: sem imagens em prints/ (o popup ficará sem carrossel)`);
  return ok;
}

for (const d of dirs.filter((x) => x.isDirectory())) {
  try {
    const g = JSON.parse(await readFile(`jogos/${d.name}/game.json`, "utf8"));
    if (g.status !== "published") continue;
    if (g.id !== d.name) console.warn(`[catálogo] ${d.name}: "id" (${g.id}) difere do nome da pasta`);
    for (const f of [g.cover, g.icon]) {
      if (f && !existsSync(`jogos/${d.name}/${f}`)) console.warn(`[catálogo] ${d.name}: arquivo não encontrado: ${f}`);
    }
    games.push({
      id: g.id,
      title: g.title,
      tagline: g.tagline,
      description: g.description ?? null,
      tags: g.tags ?? [],
      platforms: g.platforms ?? [],
      orientation: g.orientation ?? "landscape",
      version: g.version ?? null,
      approxDownloadMB: g.approxDownloadMB ?? null,
      url: `/jogos/${d.name}/`,
      cover: g.cover ? `/jogos/${d.name}/${g.cover}` : null,
      icon: g.icon ? `/jogos/${d.name}/${g.icon}` : null,
      screenshots: await findShots(d.name, g)
    });
  } catch {
    console.warn(`[catálogo] ${d.name}: sem game.json válido, ignorado`);
  }
}

await mkdir("data", { recursive: true });
await writeFile("data/games.json", JSON.stringify({ generated: new Date().toISOString(), games }, null, 2) + "\n");

const urls = [`${DOMAIN}/`, ...games.map((g) => `${DOMAIN}${g.url}`)];
await writeFile("sitemap.xml",
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n` +
  urls.map((u) => `  <url><loc>${u}</loc></url>`).join("\n") + `\n</urlset>\n`);
await writeFile("robots.txt", `User-agent: *\nAllow: /\nSitemap: ${DOMAIN}/sitemap.xml\n`);

console.log(`${games.length} jogo(s) no catálogo.`);
