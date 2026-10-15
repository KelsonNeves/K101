# K101 — Documento Técnico da Plataforma e Manifesto de Jogos

*Versão 1.2 · base: jogo "Defesa do Castelo" · hospedagem: GitHub Pages · domínio: k101.com.br*

## 1. Visão geral e decisões

O termo mais comum para o que você descreve é **catálogo** (ou *portal de jogos*, ou *hub*). Vou usar **catálogo** para a página inicial e **jogo** para cada página de jogo.

Princípios:

1. **Cada jogo é um site estático independente**, dentro da sua própria pasta. Ele não depende do catálogo e o catálogo não depende dele.
2. **O catálogo só carrega capas e um JSON pequeno.** Nenhum modelo, áudio ou script de jogo é baixado ali. Isso acontece "de graça" porque o jogo é outra página: o navegador só baixa o jogo quando o usuário entra nele.
3. **A página do jogo é a tela de boas-vindas.** O `index.html` do jogo já nasce mostrando a tela de carregamento e a barra de progresso, e só então baixa tudo. Por isso o link direto do jogo cai direto nessa tela.
4. **Tudo que é comum a todos os jogos fica em `/shared/`** (menu flutuante, SDK, futuros anúncios). Atualizou lá, atualizou em todos os jogos.
5. **O jogo conversa com a plataforma por um contrato pequeno e opcional** (`window.K101`). Se o SDK não carregar, o jogo continua funcionando.

## 2. Disposição dos links

| Endereço | O que é |
| --- | --- |
| `https://k101.com.br/` | Catálogo (vitrine com as capas) |
| `https://k101.com.br/jogos/defesa-do-castelo/` | Jogo: abre direto na tela de carregamento |
| `https://k101.com.br/jogos/<slug>/` | Qualquer outro jogo futuro |
| `https://k101.com.br/sobre/` | (futuro) página sobre / contato / política de privacidade |
| `https://k101.com.br/ads.txt` | (futuro) exigido pelas redes de anúncio |

Regras de link:

- O **slug** é a identidade do jogo: minúsculo, sem acento, com hífens (`defesa-do-castelo`). Depois de publicado, **não mude** (quebraria os links compartilhados).
- O link do jogo termina com **barra** (`/jogos/defesa-do-castelo/`). O GitHub Pages redireciona automaticamente se faltar a barra, e isso é o que faz os caminhos relativos do jogo (`css/style.css`, `js/main.js`) funcionarem.
- O botão "voltar ao catálogo" do menu leva a `/`, mas **só depois de o jogador confirmar** num popup (seção 7.4). A navegação em si é um link comum para `/`.
- Como o jogo é uma página estática, o link direto **não precisa de nenhuma configuração extra**.
- Crie também um `404.html` na raiz (o GitHub Pages usa esse arquivo automaticamente) com um botão para o catálogo.

**Importante para links compartilhados:** WhatsApp, Discord e redes sociais **não executam JavaScript** ao gerar a prévia do link. Por isso as tags Open Graph (título, descrição e capa) devem estar escritas direto no `index.html` de cada jogo (veja o modelo na seção 9).

## 3. Estrutura de pastas

### 3.1 Repositório do site

```text
k101-site/                         ← repositório no GitHub
├─ CNAME                           ← contém apenas:  k101.com.br
├─ .nojekyll                       ← arquivo vazio (impede o Jekyll de mexer nos arquivos)
├─ index.html                      ← CATÁLOGO (página inicial)
├─ 404.html
├─ favicon.ico
├─ ads.txt                         ← (futuro)
├─ robots.txt  ·  sitemap.xml      ← (opcional, gerado pelo script)
│
├─ site/                           ← arquivos só do catálogo
│  ├─ catalogo.css
│  └─ catalogo.js                  ← lê /data/games.json e desenha os cards
│
├─ data/
│  └─ games.json                   ← GERADO por tools/make-catalog.mjs (não editar à mão)
│
├─ shared/                         ← usado por TODOS os jogos
│  ├─ tema.css                     ← IDENTIDADE VISUAL: cores, bordas, botões, formas e fonte (seção 13)
│  ├─ k101.js                      ← SDK + menu flutuante (módulo ES)
│  ├─ img/
│  │  └─ logo.svg                  ← a logo do site (usada no botão do menu)
│  └─ (futuro) ads/…               ← integração de anúncios
│
├─ tools/                          ← scripts de apoio (não fazem parte do site)
│  ├─ make-catalog.mjs             ← junta os game.json em data/games.json
│  └─ make-audio-manifest.mjs      ← o seu script atual, agora recebe a pasta do jogo
│
└─ jogos/
   ├─ defesa-do-castelo/           ← 1 pasta = 1 jogo (estrutura em 3.2)
   └─ outro-jogo/
```

### 3.2 Pasta de um jogo (já com o Defesa do Castelo)

```text
jogos/defesa-do-castelo/
├─ index.html          ← tela de boas-vindas + carregamento (OBRIGATÓRIO)
├─ game.json           ← ficha do jogo para o catálogo (OBRIGATÓRIO)
├─ cover.webp          ← capa 16:9, 640×360 (OBRIGATÓRIA, ≤ 80 KB; usada na prévia de link/Open Graph)
├─ icon.webp           ← ícone quadrado, 256×256 (OBRIGATÓRIO, ≤ 40 KB; é o destaque do card)
├─ prints/             ← PASTA RESERVADA: imagens do jogo para o popup do catálogo (seção 5.4)
│  ├─ 01.webp          ← 2 a 8 imagens, em ordem de nome (01, 02, 03…)
│  ├─ 02.webp
│  └─ …
├─ css/
│  ├─ style.css
│  └─ hud.css
├─ js/
│  ├─ main.js
│  ├─ Game.js   Data.js   Map.js   Routes.js   Entities.js
│  ├─ Scene.js  Systems.js  UI.js  Vfx.js
│  ├─ Input.js  Haptics.js
│  └─ Audio.js  Sfx.js  Synth.js
└─ assets/
   ├─ models/        ← .glb
   └─ audio/         ← .ogg/.mp3 + manifest.json (gerado)
```

O que **não muda** em relação ao seu projeto: a organização interna (`css/`, `js/`, `assets/`) e os nomes dos arquivos. O que muda está na seção 10.

## 4. Hospedagem: GitHub Pages + k101.com.br

1. Crie o repositório (por exemplo `k101-site`) e envie os arquivos.
2. No GitHub: **Settings → Pages → Build and deployment → Deploy from a branch → `main` / `(root)`**.
3. Crie na raiz o arquivo `CNAME` com uma única linha: `k101.com.br`.
4. No painel do seu registrador de domínio (DNS):
   - 4 registros **A** para o domínio raiz (`@`): `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - 1 registro **CNAME** para `www` apontando para `SEU-USUARIO.github.io`.
5. Em Settings → Pages, marque **Enforce HTTPS** quando o certificado ficar pronto (pode levar de minutos a algumas horas).

*Confira os IPs e os limites na documentação oficial do GitHub Pages antes de configurar; eles são alterados raramente, mas é bom validar.*

**Limites a ter em mente** (valores de referência; confirme na documentação): site publicado de até cerca de 1 GB, arquivos individuais de até 100 MB e tráfego mensal "suave" na casa de 100 GB. Para muitos jogos com modelos 3D pesados, o plano futuro é mover só a pasta `assets/` pesada para um armazenamento com CDN (por exemplo Cloudflare R2) e apontar o `basePath` do jogo para lá. Como o jogo já usa `AUDIO.basePath`, essa troca é simples.

**Atenção — maiúsculas e minúsculas.** O GitHub Pages roda em Linux e diferencia `Game.js` de `game.js`. No Windows/macOS funciona de qualquer jeito, então o erro só aparece depois de publicar. Regra: o texto do `import` tem que ser **idêntico** ao nome do arquivo (hoje seus arquivos são `Game.js`, `Data.js` etc. e os imports usam `./Game.js`: está certo, só mantenha assim).

## 5. O catálogo

### 5.1 Ficha do jogo (`game.json`)

Cada jogo traz uma ficha pequena. É a única coisa que o catálogo sabe sobre ele.

```json
{
  "id": "defesa-do-castelo",
  "title": "Defesa do Castelo",
  "tagline": "Tower defense 3D: segure os goblins e orcs na ponte.",
  "description": "Construa torres, segure goblins e orcs na ponte e proteja o castelo.\nAs ondas nunca acabam.",
  "cover": "cover.webp",
  "icon": "icon.webp",
  "version": "1.0.0",
  "status": "published",
  "tags": ["estratégia", "tower defense", "3D"],
  "platforms": ["desktop", "mobile"],
  "orientation": "landscape",
  "approxDownloadMB": 25,
  "sdk": 1,
  "ads": { "interstitial": true, "rewarded": false, "banner": ["loading", "end-screen"] },
  "menuSafeTop": 52
}
```

`status` pode ser `draft` (não aparece no catálogo) ou `published`. `approxDownloadMB` aparece como **Tamanho** ("\~25 MB") no popup, para o usuário de celular decidir. `description` é o texto do popup (aceita quebra de linha com `\n`); se faltar, o popup usa o `tagline`. `orientation` (`landscape` ou `portrait`) também define a proporção do carrossel de imagens (16:9 ou 9:16). Opcional: `"screenshots": ["prints/a.webp", "prints/b.webp"]` força a lista e a ordem das imagens; sem isso, vale tudo que estiver em `prints/`.

### 5.2 Índice gerado (`data/games.json`)

O script `tools/make-catalog.mjs` varre `jogos/*/game.json`, ignora os `draft`, descobre as imagens de `jogos/<slug>/prints/` e grava uma lista só com o necessário (título, ícone, descrição, tags, plataformas, tamanho, versão, orientação e a lista de imagens). Rode de novo **sempre** que mudar um `game.json` ou adicionar/remover prints:

```js
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
```

### 5.3 A página do catálogo

- `index.html` da raiz **não importa nada de nenhum jogo**. Carrega apenas `site/catalogo.css`, `site/catalogo.js` e `data/games.json` (poucos KB).
- **Card = só ícone e título** (ao passar o mouse, o card sobe e o ícone aumenta um pouco, sem girar). Cada card é um `<button>` com o ícone quadrado do jogo (`icon.webp`) em destaque e o nome embaixo, **sempre em caixa alta** (CSS `text-transform: uppercase`; no `game.json` o título continua escrito normalmente). Tocar/clicar abre o popup do jogo (seção 5.4); o card não navega por si só. A grade tem **no mínimo 2 cards por linha** (2 no celular, 3 a partir de 700 px, 4 a partir de 1000 px).
- Ícones: **WebP, quadrado, 256×256, até \~40 KB**, com `loading="lazy"` (os 4 primeiros são `eager`). O arredondamento do ícone é feito por CSS; o arquivo é quadrado.
- A capa (`cover.webp`) **não aparece mais no card**: continua obrigatória porque serve de prévia de link (Open Graph) na página do jogo.
- **Não use** `<iframe>` do jogo no catálogo, nem pré-carregamento (`<link rel="prefetch">`) de jogos.
- **Tela de boas-vindas (hero):** a primeira tela do catálogo ocupa **100% da altura do aparelho** (`min-height: 100svh`), em PC e celular. Ela contém só a logo grande, a frase "Jogos próprios da K101-JOGOS." (fonte menor) e a frase de apoio (fonte ainda menor), mais uma seta que desce até os jogos. O usuário precisa rolar para ver a busca e os cards.
  - **Animações sutis:** a logo "respira" (cresce e encolhe cerca de 5% a cada 8 s, com um brilho atrás) e cinco estrelas cadentes cruzam o fundo da tela de boas-vindas de vez em quando, rápidas (\~1 s), em posições e tempos diferentes (13, 17, 19, 23 e 29 s, para nunca sincronizarem).
  - **Planos diferentes na rolagem (parallax):** ao rolar, a logo anda mais devagar que a página, passa **por cima** das frases e vai diminuindo e sumindo, enquanto o texto sobe um pouco mais rápido. Isso é feito por `catalogo.js`, que grava `--hy` e `--p` (quanto da tela de boas-vindas já saiu) e o CSS usa essas variáveis. Quem usa "reduzir movimento" no aparelho vê tudo parado.
- **Menu flutuante (estilo app):** quando a tela de boas-vindas sai de vista, surge no centro inferior um menu em forma de pílula, com o `shared/img/logo-icone.svg` em destaque no meio e ícones nas laterais.
  - **Centro (logo):** funciona como botão **Início**: limpa a busca e rola suavemente de volta para a tela de boas-vindas (o menu some ao chegar lá).
  - **Esquerda (Buscar):** ao tocar, o espaço do ícone se estica por todo o menu e vira a barra de pesquisa, com um ícone de **minimizar** à direita que devolve o menu original. O filtro continua ativo depois de minimizar (uma bolinha rosa no ícone avisa). `Esc` limpa o texto e, com o campo vazio, minimiza. No celular o menu sobe junto com o teclado.
  - **Direita (Recentes):** só estético por enquanto (sem página; mostra "Em breve" ao parar o mouse). Será ligado quando existir o histórico de jogos recentes.
  - **Popup:** quando o popup de um jogo abre, o menu fica oculto e volta ao fechar.
  - A área de jogos tem altura mínima de uma tela, para sempre dar para rolar para fora da boas-vindas, mesmo com poucos jogos.
- **Esqueleto de carregamento (skeleton):** enquanto `data/games.json` é baixado (internet lenta), a página mostra 4 cards-fantasma com efeito de brilho (`#skeleton`, escrito direto no `index.html`). Cada ícone também mostra o brilho até a imagem terminar de carregar, e o mesmo vale para as imagens do carrossel no popup. Quem usa "reduzir movimento" vê o esqueleto parado.
- **Busca:** fica dentro do menu flutuante (abaixo). É um campo de busca com botão de lupa e botão de limpar. Filtra os cards enquanto se digita, ignorando maiúsculas e acentos, e procura em **título, tagline, descrição, tags, plataformas** (aceita "pc", "celular", "mobile") **e versão**. Várias palavras funcionam em conjunto ("tower 3d"). Sem resultados, aparece "Nenhum jogo encontrado para …". `Esc` dentro do campo limpa a busca.
- **Sem seleção de texto nem de imagem:** o CSS do catálogo desativa a seleção (`user-select: none`) em todo o site, para não aparecer a faixa azul ao tocar/arrastar. As imagens (ícones e carrossel) também não podem ser selecionadas, arrastadas nem abrir o menu "salvar imagem". Só o campo de busca continua editável.
- O link para jogar fica dentro do popup (botão **Jogar**, um `<a href="/jogos/<slug>/">` de verdade).

### 5.4 Popup do jogo e pasta `prints/`

Ao clicar num card abre um popup **centralizado**, com a mesma borda e o mesmo visual do card, contendo, nesta ordem: **título** (em caixa alta) **e ícone**, **carrossel de imagens** (estilo Play Store), **descrição**, **tags**, **informações** (Plataformas, Tamanho, Versão), um **separador** e, por último, o botão **Jogar**, grande e em destaque, ocupando toda a largura do popup.

**Como fechar (todas fazem a mesma coisa):**

| Ação | Onde |
| --- | --- |
| Clicar no **X** do popup | PC e celular |
| Clicar **fora** do popup (fundo escurecido) | PC e celular |
| **Voltar** do celular (gesto ou botão do sistema) / botão **Voltar** do navegador | celular e PC |
| Tecla **Backspace** (não age se o foco estiver num campo de texto) | PC |
| Tecla **Esc** | PC |

**Histórico:** ao abrir, o catálogo faz `history.pushState` (`{ k101Modal: "<id>" }`, URL `/#<id>`). Todo pedido de fechar volta uma entrada do histórico e o evento `popstate` fecha o popup. Por isso "voltar" fecha o popup em vez de sair do catálogo, e "avançar" reabre. Se o jogador clicar em **Jogar** e depois voltar do jogo, o catálogo reabre o popup daquele jogo.

**Imagens (pasta `jogos/<slug>/prints/`):**

- Coloque **2 a 8 imagens** do jogo em andamento (telas reais: partida, menu, algum momento marcante). Elas aparecem em ordem de nome, então use `01.webp`, `02.webp`, `03.webp`…
- **Formato:** WebP (também aceita PNG, JPG e AVIF). **Proporção:** a mesma para todas as imagens do jogo: **16:9 (1280×720)** se `orientation` for `landscape`, **9:16 (720×1280)** se for `portrait`. Imagens em outra proporção são cortadas para caber.
- **Peso:** até \~150 KB cada.
- **Carregamento:** as imagens **só são baixadas quando o popup abre** (a vitrine continua leve). A 1ª e a 2ª carregam logo; as demais, ao rolar o carrossel.
- No celular o carrossel rola com o dedo; no PC aparecem as setas e também funciona com a roda do mouse/teclado (setas, com o carrossel em foco).
- Sem imagens na pasta, o popup simplesmente não mostra o carrossel (o script de catálogo avisa no terminal).
- Depois de adicionar ou trocar prints, rode `node tools/make-catalog.mjs` para atualizar `data/games.json`.

## 6. Tela de boas-vindas e carregamento do jogo

Seu jogo já faz isso quase por completo: o `index.html` contém `#ov-loading` (título, "Carregando modelos…" e `#loading-fill`) e depois `#ov-menu` (botão **Jogar**). Isso vira regra do manifesto:

1. O `index.html` deve **mostrar a tela de carregamento sem depender de JavaScript pesado**: o HTML e o CSS mínimos dela devem ser leves e carregados antes de Three.js, modelos e áudio.
2. A barra de progresso reflete o carregamento **real** (modelos + áudio, como o `onProgress` do `Sound.load` já faz).
3. Ao terminar, o jogo mostra uma tela inicial com botão **Jogar**. Esse toque é o gesto que o navegador exige para liberar o áudio e para entrar em tela cheia, então ele é útil, não um passo a mais.
4. Se o carregamento falhar, mostrar mensagem clara e botão "Tentar de novo" + link para o catálogo.

Como o menu flutuante (seção 7) é injetado logo no início, o usuário pode sair para o catálogo mesmo durante o carregamento.

## 7. Menu flutuante padrão

### 7.1 Especificação

- **Posição:** centro superior da tela, respeitando a área segura de celulares com notch (`env(safe-area-inset-top)`).
- **Estado fechado:** um único botão circular de **40 px** (logo de 33 px no centro), com opacidade reduzida (\~55%) para ser discreto. **Fechado, fica sempre translúcido**: hover e foco não alteram a opacidade; só o estado aberto a leva a 100%.
- **Estado aberto:** ao clicar, o botão expande numa "pílula" horizontal com as opções: **tela cheia** (ícone, entrar/sair) e **fechar** (ícone X); com o menu aberto, a **logo** passa a levar ao **catálogo** (página inicial), **sempre passando pelo popup de confirmação de saída** (seção 7.4). Os ícones têm 25 px dentro de botões de 40 px. Itens futuros (silenciar, compartilhar, denunciar problema) entram na mesma pílula.
- **Fecha sozinho** ao clicar fora, ao tocar em **fechar**, após \~5 s sem uso, ou ao pedir para sair (o popup de confirmação assume a tela). Tocar de novo na logo com o menu aberto **não fecha** o menu: ela leva ao popup de saída.
- **Isolamento:** é um *custom element* com **Shadow DOM**. Assim o CSS do jogo (`* { box-sizing }`, `button`, `[hidden]`, `touch-action: none` do `body` etc.) não deforma o menu, e o CSS do menu não vaza para o jogo.
- **Eventos do ponteiro não atravessam** o menu (não deve virar "toque no mapa").
- **Camada:** `z-index` máximo; fica acima dos overlays do jogo (que usam `z-index: 20`).
- **Tela cheia:** usa a Fullscreen API (com prefixo `webkit` para Safari desktop/iPad). **No iPhone o Safari não permite tela cheia em páginas**, então o botão é **ocultado** quando não há suporte.
- **Teclado:** a logo é focável (`Tab`), com `aria-expanded` e rótulos em português. O menu **não registra atalhos globais**, para não colidir com as teclas do jogo (no Defesa do Castelo: B, P, Z, WASD).
- **Aviso ao jogo:** ao abrir/fechar, emite `menu:open` / `menu:close`; o jogo decide se reage a isso; pausar é opcional (o Defesa do Castelo não pausa por causa do menu). **Já o popup de saída (seção 7.4) exige que o jogo pause**: ele emite `exit:open`.

### 7.2 Reserva de espaço no topo

O Defesa do Castelo tem a aba da onda (`.wave-hud`) exatamente no centro superior, onde o menu ficará. Por isso o SDK define uma variável CSS global, `--k101-safe-top` (padrão **52 px**), e o jogo posiciona seu HUD superior abaixo dela. O valor 52 px vem da altura da barra (botão de 40 px + 4 px de padding em cada lado = 48 px) mais uma folga de 4 px; em aparelhos com notch, o jogo soma `env(safe-area-inset-top)` por conta própria, como no exemplo:

```css
/* hud.css (exemplo) */
.wave-hud { top: calc(var(--k101-safe-top, 0px) + 6px + env(safe-area-inset-top, 0px)); }
```

O valor real vem de `menuSafeTop` no `game.json`, para jogos com HUD diferente. No Defesa do Castelo a regra foi aplicada em `hud.css` à aba da onda (`.wave-hud`), à contagem 3-2-1 (`.countdown`, inclusive `.tick`) e ao aviso (`.toast`). Fora do site a variável vale 0 e nada muda.

### 7.3 Implementação de referência (`shared/k101.js`)

O arquivo é um módulo ES. Cada jogo o inclui com uma única linha e um `<meta>` que informa o `id` do jogo.

```js
/* ==========================================================================
   /shared/k101.js — SDK K101 v1: menu flutuante + ponte jogo ↔ plataforma.
   Incluído em todo jogo com:  <script type="module" src="/shared/k101.js"></script>
   (depois do importmap, se o jogo tiver um). O jogo informa o próprio id com
   <meta name="k101-game" content="slug"> e a reserva do topo com <meta name="k101-safe-top" content="44">.
   Eventos chegam ao jogo como CustomEvent no window: "k101:menu:open", "k101:ad:start", ...
   ========================================================================== */
const meta = (name) => document.querySelector(`meta[name="${name}"]`)?.content;
const listeners = {};
const root = document.documentElement;
const reqFS = root.requestFullscreen ?? root.webkitRequestFullscreen;
const exitFS = document.exitFullscreen ?? document.webkitExitFullscreen;
const fsOn = () => !!(document.fullscreenElement ?? document.webkitFullscreenElement);
/* Aparência: o menu e o popup leem TUDO de /shared/tema.css (cores, bordas, botões, formas, fonte).
   Se a página do jogo não tiver o <link> do tema, o SDK o adiciona sozinho. */
if (!document.querySelector('link[href$="/shared/tema.css"]')) {
  const tema = document.createElement("link");
  tema.rel = "stylesheet";
  tema.href = "/shared/tema.css";
  document.head.appendChild(tema);
}
const swallow = (p) => { try { p?.catch?.(() => {}); } catch { /* sem suporte */ } };

export const K101 = {
  sdk: 1,
  gameId: meta("k101-game") ?? "desconhecido",
  safeTop: Number(meta("k101-safe-top") ?? 52),
  home: "/",

  // true enquanto algo da plataforma (popup de saída, futuramente anúncio) está na frente do jogo.
  // Alternativa/reforço aos eventos: no loop do jogo, `if (window.K101?.blocked) return;`
  _holds: new Set(),
  get blocked() { return this._holds.size > 0; },

  on(event, fn) {
    (listeners[event] ??= []).push(fn);
    return () => { listeners[event] = listeners[event].filter((f) => f !== fn); };
  },
  emit(event, detail) {
    (listeners[event] ?? []).forEach((fn) => { try { fn(detail); } catch (err) { console.error(err); } });
    window.dispatchEvent(new CustomEvent(`k101:${event}`, { detail }));
  },

  fullscreen: {
    supported: !!reqFS && !!(document.fullscreenEnabled ?? document.webkitFullscreenEnabled),   // iPhone: false
    get active() { return fsOn(); },
    toggle() { swallow(fsOn() ? exitFS.call(document) : reqFS.call(root)); }
  },
  goHome() { location.href = K101.home; },
  // Pede confirmação antes de sair: avisa o jogo (pausar) e mostra o popup. Só sai se o jogador confirmar.
  confirmExit() { exitDialog.open(); },

  // Anúncios: por enquanto devolve "não exibido" na hora. A plataforma troca esta implementação depois,
  // sem o jogo mudar. O jogo continua normalmente nos dois casos.
  ads: {
    enabled: false,
    async request(type, info = {}) { return { shown: false, rewarded: false }; },
    slot(name) { /* futuro: preenche <div data-k101-slot="name"> */ }
  }
};
window.K101 = K101;

root.style.setProperty("--k101-safe-top", `${K101.safeTop}px`);
const onFS = () => K101.emit("fullscreen:change", { active: fsOn() });
document.addEventListener("fullscreenchange", onFS);
document.addEventListener("webkitfullscreenchange", onFS);

/* ------------------------------ popup de confirmação de saída ------------------------------ */
// Logo no centro, pergunta embaixo e dois botões: Cancelar e Sair.
// Ao abrir emite "exit:open" (o jogo deve pausar e silenciar); ao cancelar emite "exit:cancel"
// (o jogo continua pausado até o jogador retomar pelo próprio botão); ao confirmar, vai ao catálogo.
class K101Exit extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
<style>
  :host { display: none; position: fixed; inset: 0; z-index: 2147483600; touch-action: none;
          -webkit-user-select: none; user-select: none; -webkit-tap-highlight-color: transparent; }
  :host(.open) { display: grid; place-items: center; }
  /* mesmo fundo escurecido dos popups do catálogo */
  .veil { position: absolute; inset: 0; background: var(--overlay);
          backdrop-filter: blur(4px); -webkit-backdrop-filter: blur(4px); }
  /* mesmo cartão do popup de jogo do catálogo (.frame) */
  .box { position: relative; width: min(340px, calc(100vw - 40px)); box-sizing: border-box; padding: 26px 22px 22px;
         border: var(--borda); border-radius: var(--raio-card);
         background: var(--brilho-popup), var(--background2); box-shadow: var(--sombra-popup);
         color: var(--texto1); text-align: center; font: 600 16px/1.35 var(--fonte); }
  .box img { width: 96px; height: auto; max-height: 96px; display: block; margin: 0 auto 16px; }
  p { margin: 0 0 22px; font-size: 18px; font-weight: 800; text-wrap: balance; }
  .row { display: flex; gap: 10px; }
  button { all: unset; box-sizing: border-box; flex: 1; padding: 13px 10px; cursor: pointer; text-align: center;
           font: 800 16px/1 var(--fonte); border-radius: var(--raio-btn);
           border: var(--btn-borda-largura) solid transparent; transition: background .2s ease; }
  button:focus-visible { outline: var(--foco); outline-offset: 3px; }
  .cancel { background: var(--btn2-fundo); color: var(--btn2-texto); border-color: var(--btn2-borda); }   /* BTN2: neutro */
  .cancel:hover { background: var(--btn2-fundo-hover); }
  .leave { background: var(--btn3-fundo); color: var(--btn3-texto); border-color: var(--btn3-borda); }    /* BTN3: atenção */
  .leave:hover { background: var(--btn3-fundo-hover); }
</style>
<div class="veil"></div>
<div class="box" role="alertdialog" aria-modal="true" aria-labelledby="q">
  <img src="/shared/img/logo.svg" alt="K101">
  <p id="q">Deseja realmente sair do jogo?</p>
  <div class="row">
    <button class="cancel" type="button">Cancelar</button>
    <button class="leave" type="button">Sair</button>
  </div>
</div>`;

    const cancel = shadow.querySelector(".cancel"), leave = shadow.querySelector(".leave");
    const veil = shadow.querySelector(".veil");
    let previous = null;

    this.show = () => {
      if (this.classList.contains("open")) return;
      previous = document.activeElement;
      this.classList.add("open");
      K101._holds.add("exit");
      K101.emit("exit:open");          // o jogo pausa e silencia
      cancel.focus();                  // foco no botão seguro, para um Enter acidental não sair
    };
    const hide = () => {
      this.classList.remove("open");
      K101._holds.delete("exit");
      K101.emit("exit:cancel");
      try { previous?.focus?.(); } catch { /* sem foco anterior */ }
    };

    cancel.addEventListener("click", hide);
    veil.addEventListener("click", hide);
    leave.addEventListener("click", () => { K101.emit("exit:confirm"); K101.goHome(); });

    // Teclado: Esc cancela; Tab fica preso entre os dois botões; nada vaza para o jogo.
    this.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); hide(); }
      if (e.key === "Tab") {
        e.preventDefault();
        (shadow.activeElement === cancel ? leave : cancel).focus();
      }
    });
    this.addEventListener("keyup", (e) => e.stopPropagation());

    // Voltou pelo botão "voltar" do navegador (cache de página): não reaparece com o popup aberto.
    window.addEventListener("pageshow", (e) => { if (e.persisted && this.classList.contains("open")) hide(); });

    // O toque no popup não "vaza" para o jogo.
    for (const ev of ["pointerdown", "pointerup", "pointermove", "touchstart", "touchmove", "touchend", "wheel", "contextmenu", "click"])
      this.addEventListener(ev, (e) => e.stopPropagation(), { passive: false });
  }
}

if (!customElements.get("k101-exit")) customElements.define("k101-exit", K101Exit);
const exitDialog = {
  el: null,
  open() {
    if (!this.el) { this.el = document.createElement("k101-exit"); document.body.appendChild(this.el); }
    this.el.show();
  }
};

/* ------------------------------ menu flutuante ------------------------------ */
// Fechado: só o botão com a logo. Aberto: [logo → catálogo] [ícone de tela cheia] [x fechar].
const ICON = {
  enter: '<path d="M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5"/>',
  exit:  '<path d="M9 4v5H4M20 9h-5V4M15 20v-5h5M4 15h5v5"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>'
};
const svg = (name, cls = "") =>
  `<svg class="${cls}" viewBox="0 0 24 24" width="25" height="25" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICON[name]}</svg>`;

class K101Menu extends HTMLElement {
  connectedCallback() {
    const shadow = this.attachShadow({ mode: "open" });
    shadow.innerHTML = `
<style>
  :host { position: fixed; top: max(env(safe-area-inset-top), 6px); left: 50%; transform: translateX(-50%);
          z-index: 2147483000; touch-action: manipulation; -webkit-user-select: none; user-select: none;
          -webkit-tap-highlight-color: transparent; font-family: var(--fonte); }
  /* mesma "pílula de vidro" do menu do catálogo (.dock-bar) */
  .bar { display: flex; align-items: center; gap: 5px; padding: 4px; border-radius: var(--raio-pill);
         background: var(--vidro); border: var(--borda);
         backdrop-filter: blur(14px); -webkit-backdrop-filter: blur(14px);
         opacity: .55; transition: opacity .15s; }
  /* Só o estado aberto deixa a barra opaca; fechado é sempre translúcido. */
  .bar.open { opacity: 1; }
  button { all: unset; box-sizing: border-box; display: grid; place-items: center; cursor: pointer;
           width: 40px; height: 40px; border-radius: var(--raio-pill); color: var(--texto1); }
  button:focus-visible { outline: var(--foco); outline-offset: 1px; }
  .logo img { width: 33px; height: 33px; display: block; border-radius: 8px; }
  .opt { display: none; }
  .bar.open .opt { display: grid; }
  .opt:hover, .bar.open .logo:hover { background: var(--hover-leve); }
  .opt[hidden] { display: none; }
  .fs .exit { display: none; }
  .fs.on .enter { display: none; }
  .fs.on .exit { display: block; }
  @media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
<div class="bar">
  <button class="logo" type="button" aria-label="Abrir menu K101" aria-expanded="false"><img src="/shared/img/logo-icone.svg" alt=""></button>
  <button class="opt fs" type="button" aria-label="Tela cheia" title="Tela cheia">${svg("enter", "enter")}${svg("exit", "exit")}</button>
  <button class="opt close" type="button" aria-label="Fechar menu" title="Fechar menu">${svg("close")}</button>
</div>`;

    const bar = shadow.querySelector(".bar"), logo = shadow.querySelector(".logo");
    const fs = shadow.querySelector(".fs"), close = shadow.querySelector(".close");
    let timer;

    const isOpen = () => bar.classList.contains("open");
    const setOpen = (open) => {
      if (open === isOpen()) return;
      bar.classList.toggle("open", open);
      logo.setAttribute("aria-expanded", String(open));
      const label = open ? "Voltar ao catálogo" : "Abrir menu K101";
      logo.setAttribute("aria-label", label);
      logo.title = open ? label : "";
      clearTimeout(timer);
      if (open) timer = setTimeout(() => setOpen(false), 5000);   // fecha sozinho
      K101.emit(open ? "menu:open" : "menu:close");
    };
    const syncFS = () => {
      const on = fsOn();
      fs.classList.toggle("on", on);
      fs.setAttribute("aria-label", on ? "Sair da tela cheia" : "Tela cheia");
      fs.title = on ? "Sair da tela cheia" : "Tela cheia";
    };

    fs.hidden = !K101.fullscreen.supported;                       // iPhone/Safari: sem tela cheia
    syncFS();
    logo.addEventListener("click", () => (isOpen() ? (setOpen(false), K101.confirmExit()) : setOpen(true)));   // aberto: a logo leva ao catálogo
    fs.addEventListener("click", () => { K101.fullscreen.toggle(); setOpen(false); });
    close.addEventListener("click", () => setOpen(false));
    K101.on("fullscreen:change", syncFS);
    document.addEventListener("pointerdown", (e) => { if (!e.composedPath().includes(this)) setOpen(false); }, true);

    // O toque no menu não "vaza" para o jogo.
    for (const ev of ["pointerdown", "pointerup", "pointermove", "wheel", "contextmenu"])
      this.addEventListener(ev, (e) => e.stopPropagation());
  }
}

if (!customElements.get("k101-menu")) customElements.define("k101-menu", K101Menu);
document.body.appendChild(document.createElement("k101-menu"));
```

Notas: (a) como o `Input.js` do jogo escuta `pointerdown/up/move` direto no `<canvas>`, o menu (que está fora do canvas) já não interfere; o `stopPropagation` é uma proteção para jogos que escutem no `window`. (b) O arquivo é um módulo, portanto carrega de forma adiada e **não atrasa** a tela de carregamento. (c) Se o `<script>` falhar, `window.K101` não existe: o jogo deve sempre usar `window.K101?.…`.

Mais três regras: (d) o `<script>` do SDK precisa vir **depois** do `importmap` do jogo; um módulo carregado antes dele faz o navegador ignorar o `importmap`. (e) O SDK avisa o jogo por `CustomEvent` no `window` (`k101:menu:open`, `k101:ad:start` etc.), então o jogo pode ouvir sem importar nada e sem depender da ordem de carregamento. (f) O popup de saída é um segundo *custom element* (`k101-exit`), também com Shadow DOM, criado só na primeira vez que é pedido; o jogo não precisa de HTML nem de CSS para ele.

### 7.4 Popup de confirmação de saída

Evita que o jogador saia por engano. Ele aparece quando, com o menu aberto, o jogador toca na **logo** (ou quando o jogo chama `K101.confirmExit()`).

**Aparência.** Igual ao popup do catálogo, para parecer parte do site e não do jogo: mesmo cartão (fundo, borda, raio, brilho e sombra), mesmo fundo escurecido com desfoque e mesma fonte, tudo vindo de `/shared/tema.css`. Conteúdo: a **logo** (`/shared/img/logo.svg`, 96 px) no centro, embaixo a pergunta **"Deseja realmente sair do jogo?"** e, na linha de baixo, dois botões de mesma largura: **Cancelar** (`BTN2`, neutro) e **Sair** (`BTN3`, destaque). Largura máxima de 340 px (ou a tela menos 40 px). É um `role="alertdialog"` com `aria-modal`.

**Sequência.**

1. O jogador toca na logo do menu aberto: o menu se fecha e o popup abre.
2. O SDK emite `exit:open` **antes de qualquer outra coisa**. O jogo deve **pausar a simulação e silenciar o áudio** nesse momento.
3. **Cancelar** (ou tocar fora do cartão, ou `Esc`): o popup fecha e o SDK emite `exit:cancel`. O jogo **continua pausado**; o jogador retoma pelo próprio botão de continuar (mesma regra de `ad:end`). O jogo só deve restaurar o áudio.
4. **Sair**: o SDK emite `exit:confirm` e logo em seguida chama `K101.goHome()`. Como a página vai ser descarregada, o jogo só pode fazer trabalho **síncrono** nesse evento (por exemplo, salvar o recorde no `localStorage`); não use `await`.

**Comportamento garantido pelo SDK (o jogo não precisa implementar).**

- O foco inicial fica em **Cancelar**, para que um `Enter` ou toque acidental não faça o jogador sair. `Tab` alterna entre os dois botões (o foco fica preso no popup) e o foco volta ao elemento anterior ao cancelar.
- Teclas, toques, roda do mouse e menu de contexto **não atravessam** o popup e o fundo cobre a tela inteira; o jogo por baixo não recebe entrada enquanto ele está aberto.
- Chamar `K101.confirmExit()` com o popup já aberto não faz nada (não emite `exit:open` duas vezes).
- Se o jogador sair e voltar pelo botão "voltar" do navegador e a página vier do cache (*bfcache*), o popup **não reaparece aberto**: ele é fechado e o SDK emite `exit:cancel`.
- **Camada:** `z-index` 2147483600, acima do menu (2147483000) e de qualquer overlay do jogo.

**Regra para todo jogo novo:** ouvir `exit:open` e pausar. Sem isso o popup funciona, mas o jogo continua rodando por trás dele e o jogador pode perder a partida enquanto decide.

## 8. Contrato jogo ↔ plataforma (`window.K101`)

### 8.1 Eventos que o jogo deve ouvir

| Evento | Quando | O que o jogo faz |
| --- | --- | --- |
| `menu:open` | usuário abriu o menu | opcional: o jogo decide (pausar não é necessário) |
| `menu:close` | menu fechou | nada (o jogador retoma pelo próprio botão de continuar) |
| `exit:open` | o popup "Deseja realmente sair do jogo?" abriu | **obrigatório:** pausar a simulação e silenciar o áudio |
| `exit:cancel` | o jogador cancelou a saída (ou o popup foi fechado pelo cache do navegador) | restaurar o áudio; **manter pausado** até o jogador retomar pelo próprio botão |
| `exit:confirm` | o jogador confirmou a saída; a página vai fechar | opcional: salvar progresso/recorde, só com código síncrono |
| `ad:start` | um anúncio vai ocupar a tela | **obrigatório:** pausar a simulação e silenciar todo o áudio |
| `ad:end` | anúncio acabou | restaurar o áudio; manter pausado até o jogador confirmar |
| `fullscreen:change` | entrou/saiu da tela cheia | refazer o `resize` do renderer |

Para ouvir esses eventos sem importar o SDK, use o `window` com o prefixo `k101:`, por exemplo `window.addEventListener("k101:ad:start", () => { /* pausar e silenciar */ })`. Os mesmos nomes valem para `k101:menu:open`, `k101:menu:close`, `k101:ad:end`, `k101:exit:open`, `k101:exit:cancel`, `k101:exit:confirm` e `k101:fullscreen:change`.

**Anúncio e saída ao mesmo tempo.** Os dois pedem pausa e silêncio, então o jogo deve usar um contador (ou um mudo externo por origem) em vez de um simples liga/desliga, para que o fim de um não religue o áudio enquanto o outro ainda está ativo. Na prática, `setExternalMute` deve ser chamado com `true` em `exit:open`/`ad:start` e só voltar a `false` quando nenhum dos dois estiver ativo.

### 8.2 Chamadas que o jogo pode fazer

| Chamada | Uso |
| --- | --- |
| `K101.ads.request("interstitial", { reason })` | em pausas naturais (fim de partida, entre fases). Retorna `{ shown }`; pode ser `false` (sem anúncio, bloqueador, intervalo mínimo ainda não passou). O jogo segue normalmente nos dois casos. |
| `K101.ads.request("rewarded", { reward })` | o jogador escolhe assistir para ganhar algo. Retorna `{ shown, rewarded }`; **só dá a recompensa se `rewarded === true`**. |
| `K101.ads.slot(nome)` | preenche um espaço de banner reservado (`<div data-k101-slot="...">`) |
| `K101.confirmExit()` | **forma recomendada** de um botão "Sair" do próprio jogo: abre o popup de confirmação (emite `exit:open`) e só sai se o jogador confirmar |
| `K101.goHome()` | volta ao catálogo **imediatamente, sem confirmação**. Use só quando a saída já foi confirmada ou não há partida a perder (por exemplo, erro fatal). Para qualquer botão que o jogador possa tocar sem querer, use `confirmExit()` |
| `K101.fullscreen.toggle()` | opcional: botão de tela cheia do próprio jogo |

### 8.3 Regras de anúncio (valem para todo jogo)

1. **Nunca durante a jogabilidade.** Anúncio em tela cheia só em momentos de pausa natural, e sempre **depois** de uma ação do jogador.
2. **O jogo não controla a frequência.** Ele pede; a plataforma decide se mostra (intervalo mínimo, limites por sessão). Assim o intervalo pode ser ajustado em um lugar só.
3. **Resposta imediata nunca pode quebrar o jogo.** `shown: false` é um caminho normal.
4. **Banners ficam fora do `<canvas>`**: só em áreas reservadas de **altura fixa** (para não "pular" o layout), nos pontos declarados em `ads.banner` do `game.json` (ex.: `loading`, `end-screen`). Nunca sobre o HUD, sobre botões de ação ou encostado em botões que se tocam com frequência.
5. **Sem anúncio** na tela do jogo em andamento, no menu de contexto, nas telas de tutorial nem enquanto o usuário não tiver tocado ao menos uma vez.
6. Jogos voltados a crianças exigem tratamento próprio (consentimento/anúncios não personalizados). Decida isso antes de ativar a rede de anúncios.
7. Consentimento de cookies/LGPD: o gerenciamento fica na plataforma (um aviso único no catálogo e no jogo), nunca dentro de cada jogo.

Pontos naturais do Defesa do Castelo: o botão *Jogar de novo* da tela de fim de partida (`#ov-end`) para *interstitial*, pedido só depois dessa ação do jogador; banner em `loading` e `end-screen`; *rewarded* é opcional (por exemplo, "assistir para ganhar moedas iniciais" na tela inicial).

## 9. Manifesto de criação de jogos K101 (v1)

Este é o guia que todo jogo novo deve seguir para entrar no site.

### 9.1 Estrutura mínima obrigatória

- [ ] Pasta em `jogos/<slug>/` com slug minúsculo, sem acento e sem espaços.
- [ ] `index.html` na raiz da pasta, que **já mostra** a tela de carregamento.
- [ ] `game.json` válido (campos da seção 5.1).
- [ ] `cover.webp` 16:9, 640×360, até \~80 KB.
- [ ] `icon.webp` quadrado, 256×256, até \~40 KB.
- [ ] Pasta `prints/` com 2 a 8 imagens (`01.webp`, `02.webp`…), 16:9 (1280×720) ou 9:16 (720×1280) conforme `orientation`, até \~150 KB cada.
- [ ] `description` preenchida no `game.json` (texto do popup).
- [ ] Todos os caminhos **relativos** (`css/style.css`, `assets/...`) e nunca começando com `/`, exceto `/shared/...` (que é da plataforma). Assim o jogo roda de qualquer pasta.
- [ ] Nomes de arquivo idênticos aos `import`s (atenção às maiúsculas).
- [ ] Funciona sem o SDK: sempre `window.K101?.…`.

### 9.2 Modelo do `index.html`

```html
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">
  <title>NOME DO JOGO — K101</title>

  <!-- Identificação para a plataforma -->
  <meta name="k101-game" content="SLUG">
  <meta name="k101-safe-top" content="52">

  <!-- Prévia de link (precisa ser estático: redes sociais não executam JS) -->
  <link rel="canonical" href="https://k101.com.br/jogos/SLUG/">
  <meta property="og:type" content="website">
  <meta property="og:title" content="NOME DO JOGO">
  <meta property="og:description" content="Descrição curta">
  <meta property="og:image" content="https://k101.com.br/jogos/SLUG/cover.webp">
  <meta property="og:url" content="https://k101.com.br/jogos/SLUG/">

  <link rel="icon" href="/favicon.ico">
  <!-- identidade visual da plataforma (opcional: o SDK a adiciona sozinho se faltar; linke aqui para evitar piscar sem estilo) -->
  <link rel="stylesheet" href="/shared/tema.css">
  <link rel="stylesheet" href="css/style.css">
  <!-- importmap, fontes etc. do jogo -->

  <!-- SDK da plataforma: menu flutuante + anúncios. Precisa vir DEPOIS do importmap do jogo (antes dele, o navegador ignora o importmap). Módulo = não bloqueia o carregamento. -->
  <script type="module" src="/shared/k101.js"></script>
</head>
<body>
  <!-- tela de carregamento primeiro, com a barra de progresso -->
  <!-- <div data-k101-slot="loading"></div>  (reservado para banner, quando for ativado) -->
  ...
  <script type="module" src="js/main.js"></script>
</body>
</html>
```

### 9.3 Compatibilidade com o menu flutuante

- [ ] Nada importante do HUD no centro superior: respeitar `var(--k101-safe-top)`.
- [ ] Não cobrir o menu: nenhum elemento do jogo com `z-index` acima de `2147483000`.
- [ ] Não capturar teclas/toques fora do próprio canvas sem necessidade (o menu precisa receber o toque).
- [ ] No evento `fullscreen:change` (ou `resize`), recalcular o tamanho do canvas.
- [ ] Ouvir `menu:open` só se quiser reagir a ele (pausar é opcional).
- [ ] **Ouvir `exit:open` e pausar a simulação e silenciar o áudio** (obrigatório; é o popup de confirmação de saída, seção 7.4). A função de pausa precisa ser segura de chamar em qualquer estado (já pausado, tela inicial, fim de partida).
- [ ] Ouvir `exit:cancel`: restaurar o áudio e **manter o jogo pausado** até o jogador retomar.
- [ ] Se tiver "sair" próprio, chamar `K101.confirmExit()` (nunca `K101.goHome()` direto, nem `location.href`, nem `<a href="/">`, que sairiam sem confirmar).
- [ ] Cores, bordas, raios e botões do jogo, quando quiserem combinar com o site, usam `var(--cor1)`, `var(--btn1-fundo)`, `var(--borda)` etc. de `/shared/tema.css` (seção 13), nunca valores copiados.
- [ ] Reforço à pausa: no loop principal, `if (window.K101?.blocked) return;` (vale `true` enquanto o popup de saída estiver aberto).
- [ ] Não desenhar um popup de confirmação de saída próprio: o do SDK é o padrão para todos os jogos.
- [ ] Se usar `exit:confirm`, só código síncrono (a página já está saindo).
- [ ] Pausa por anúncio e por saída devem coexistir sem religar o áudio cedo demais (seção 8.1).

### 9.4 Compatibilidade com anúncios

- [ ] Ouvir `ad:start` / `ad:end` (pausar e silenciar o áudio).
- [ ] Chamar `K101.ads.request(...)` somente nos pontos declarados em `game.json → ads`.
- [ ] Reservar visualmente espaço fixo para banners nos pontos `loading` e `end-screen`.
- [ ] Nunca dar recompensa sem `rewarded === true`.

### 9.5 Regras de convivência (todos os jogos dividem o mesmo domínio)

- **Armazenamento local compartilhado.** `localStorage` é do domínio inteiro `k101.com.br`, não de cada jogo. **Toda chave deve começar com o slug**: `defesa-do-castelo:audio`, `defesa-do-castelo:record`. (O `Audio.js` já faz isso; confira recordes e configurações no restante do código.)
- **Sem CSS global destrutivo fora da página do jogo**: cada jogo é uma página própria, então não há conflito entre jogos, mas nada deve tentar alterar o menu (Shadow DOM) ou `/shared`.
- **Bibliotecas externas:** fixar a versão exata (como seu `three@0.160.0`). Nunca usar "latest".
- **Peso:** informar `approxDownloadMB`. Evitar arquivos individuais acima de \~20 MB; preferir texturas/modelos comprimidos.
- **Mobile:** tocar com um dedo, sem *hover* obrigatório; respeitar `safe-area-inset`.
- **Falhas:** áudio, vibração e tela cheia são opcionais; o jogo não pode travar se algum não existir (o seu já segue esse padrão).

## 10. Adaptação do Defesa do Castelo (aplicada)

### 10.1 Renomeações e movimentos

| Hoje | Depois | Observação |
| --- | --- | --- |
| `index.html` | **continua `index.html`**, mas dentro de `jogos/defesa-do-castelo/` | O nome não deve mudar: é ele que faz o endereço `/jogos/defesa-do-castelo/` abrir sem escrever o nome do arquivo. O `index.html` da **raiz do site** passa a ser o catálogo (arquivo novo). |
| `style.css`, `hud.css` | iguais, em `css/` | O `index.html` já aponta para `css/style.css` e `css/hud.css`. Como cada jogo é uma página própria, não precisa renomear. |
| `main.js`, `Game.js`, `Data.js`… | iguais, em `js/` | Manter o casing exato. |
| `make-audio-manifest.mjs` | `tools/make-audio-manifest.mjs` (na raiz do site) | Passa a receber a pasta do jogo: `node tools/make-audio-manifest.mjs jogos/defesa-do-castelo`. Atualize o comentário em `Audio.js` que cita `tools/make-audio-manifest.mjs`. |
| (novos) | `game.json`, `cover.webp` | Seção 5.1. |

Resumindo: **nenhum arquivo do jogo precisa ser renomeado**. O que muda é onde o jogo mora e quem é a página inicial do site.

### 10.2 O que mudou no código e no HTML

O jogo já foi adaptado ao manifesto. A lista abaixo mostra o que mudou e serve de modelo para adaptar os próximos.

**1. `index.html`.** Título, descrição, `k101-game`, `k101-safe-top`, canonical + Open Graph, ícone e o `<script type="module" src="/shared/k101.js">` colocado **depois do importmap**. A tela inicial ganhou uma dica sobre o botão da logo (que agora pede confirmação antes de sair).

**2. Caminhos dos assets.** O `Data.js` já usava caminhos relativos (`assets/models/`, `assets/icons/`, `AUDIO.basePath = "assets/audio/"`), então nada precisou mudar. Os arquivos reais de `assets/` (modelos `.glb`, ícones e áudio) precisam ser copiados para a pasta do jogo com os nomes exatos.

**3. `hud.css`.** `.wave-hud`, `.countdown` (inclusive `.tick`) e `.toast` somam `var(--k101-safe-top, 0px)` ao `top` e ficam abaixo do menu.

**4. `Game.js`, método `installPlatform()`.** O jogo ouve o SDK pelo `window`. Anúncio e popup de saída pausam e silenciam; o menu flutuante em si **não** pausa, por isso não há ouvinte de `k101:menu:open`. Como anúncio e saída podem se sobrepor, o jogo guarda quais origens estão pedindo silêncio.

```js
installPlatform() {
  const on = (name, fn) => window.addEventListener(`k101:${name}`, fn);
  this.muteSources = new Set();
  const mute = (src, active) => {
    active ? this.muteSources.add(src) : this.muteSources.delete(src);
    Sound.setExternalMute(this.muteSources.size > 0);   // só religa quando ninguém mais pede silêncio
  };
  on("ad:start", () => { this.pause(); mute("ad", true); });      // anúncio: pausa e silencia
  on("ad:end", () => mute("ad", false));                          // segue pausado até o jogador voltar
  on("exit:open", () => { this.pause(); mute("exit", true); });   // popup "Deseja sair?": pausa e silencia
  on("exit:cancel", () => mute("exit", false));                   // segue pausado até o jogador voltar
  // on("exit:confirm", () => this.saveRecord());                 // opcional, só código síncrono
}
```

Confira que `this.pause()` pode ser chamado em qualquer estado (já pausado, tela inicial, fim de partida) sem efeito colateral: o popup pode abrir em qualquer um deles.

**5. `Game.js`, método `restart()`.** O anúncio entre partidas é pedido ao tocar em *Jogar de novo* na tela de fim, só no estado `GAME_OVER`. O botão de reiniciar do menu de pausa não chama anúncio.

```js
async restart() {
  if (this.restarting) return;
  this.restarting = true;
  try {
    if (this.state === "GAME_OVER") await window.K101?.ads?.request?.("interstitial", { reason: "restart" });
  } catch { /* sem anúncio, segue o jogo */ }
  this.restarting = false;
  this.newGame();
}
```

**6. `Audio.js`.** `Sound.setExternalMute(on)` silencia o jogo durante o anúncio **sem** alterar o volume nem o mudo que o jogador salvou (ao contrário de `toggleMute`).

**7. Teclas.** O menu não usa teclas; B, P, Z, M e WASD seguem como estão. Só com o popup de saída aberto o SDK usa `Esc` (cancelar), `Tab` e `Enter`/`Espaço` nos botões, e nenhuma tecla chega ao jogo enquanto ele está aberto.

**8. `localStorage`.** As chaves já têm o prefixo do jogo (`defesa-do-castelo:audio` e `defesa-do-castelo:recorde`).

**9. Fontes e Three.js.** Continuam via CDN (Google Fonts e jsDelivr), o que funciona no GitHub Pages. Opcional no futuro: copiar `three@0.160.0` para `/shared/vendor/`.

## 11. Plano de execução (em ordem)

1. Criar o repositório com a estrutura da seção 3.1 (pastas vazias com um arquivo `.gitkeep` se necessário), `CNAME` e `.nojekyll`.
2. Mover o jogo para `jogos/defesa-do-castelo/` na estrutura 3.2 (`css/`, `js/`, `assets/`).
3. Criar `shared/k101.js` e `shared/img/logo.svg` (a sua logo).
4. Ajustar o `index.html` do jogo, `hud.css` e os pontos do `Game.js` (seção 10.2).
5. Criar `game.json`, `cover.webp`, `icon.webp` e a pasta `prints/` com as imagens do jogo.
6. Rodar `node tools/make-audio-manifest.mjs jogos/defesa-do-castelo` e `node tools/make-catalog.mjs`.
7. Criar o catálogo (`index.html`, `site/catalogo.css`, `site/catalogo.js`) e o `404.html`.
8. Testar **localmente com um servidor estático na raiz do repositório** (por exemplo `npx serve .`), porque os caminhos `/shared/...` não funcionam abrindo o arquivo com duplo clique.
9. Publicar no GitHub, configurar DNS e HTTPS (seção 4).
10. Testar em produção: catálogo → jogo, link direto do jogo em aba anônima, menu no celular e no PC, tela cheia, voltar ao catálogo (a logo abre o popup; o jogo pausa e o áudio silencia; **Cancelar** mantém o jogo pausado; **Sair** leva ao catálogo; `Esc` cancela), DevTools → Rede (o catálogo não deve baixar nenhum arquivo de jogo).

**Ao criar um jogo novo:** copiar o modelo da seção 9.2, preencher `game.json`, passar pelo checklist 9.1–9.5 (inclusive o `exit:open` da 9.3) e rodar `make-catalog.mjs`. Opcional: uma GitHub Action que roda esse script a cada *push* para que `data/games.json` nunca fique desatualizado.

## 12. Pendências e próximos passos

- **Assets do Defesa do Castelo:** copie `assets/` (modelos `.glb`, ícones e áudio) para `jogos/defesa-do-castelo/assets/`, mantendo os nomes exatos (maiúsculas incluídas), e rode `node tools/make-audio-manifest.mjs jogos/defesa-do-castelo`.
- **Capa:** falta `jogos/defesa-do-castelo/cover.webp` (16:9, 640×360), usada na prévia de link.
- **Ícone e prints:** falta `jogos/defesa-do-castelo/icon.webp` (256×256) e a pasta `jogos/defesa-do-castelo/prints/` com as imagens (`01.webp`…, 16:9, 1280×720). Sem ícone, o card mostra a inicial do jogo; sem prints, o popup fica sem carrossel.
- **Logo:** `shared/img/logo.svg` é provisório; troque pela sua logo mantendo o mesmo nome.
- **Anúncios:** o SDK entrega o *contrato*. A integração real (AdSense, Google Ad Manager ou outra rede), o `ads.txt`, o aviso de consentimento e a política de privacidade são a próxima etapa.
- **Peso dos modelos 3D:** se a soma dos jogos se aproximar dos limites do GitHub Pages, mover `assets/` para um CDN (seção 4).
- **Analytics (opcional):** uma métrica simples e sem cookies (por exemplo, Plausible ou Cloudflare Web Analytics) ajuda a saber quais jogos são abertos; pode ser carregada pelo próprio `k101.js`.

---

## 13. Tema visual (`/shared/tema.css`)

**Regra:** cores, bordas, botões, formas e fonte do ecossistema vivem **somente** em `shared/tema.css`. O catálogo (`catalogo.css`), o menu flutuante, o popup de saída e qualquer jogo leem de lá. Para mudar a aparência de tudo, edite só a parte `EDITE AQUI` do arquivo. Nenhum outro arquivo deve ter código de cor (`#hex`, `rgb()`) nem raio/borda escritos à mão.

| Grupo | Variáveis | Uso |
|---|---|---|
| Cores | `--cor1` … `--cor4` | `cor1`: destaque forte (brilhos, BTN3). `cor2`: bordas, foco, manchas de fundo. `cor3`: fundo de ícones, BTN1. `cor4`: hover do BTN1. |
| Fundos | `--background1`, `--background2` | página; cards, popups e menus |
| Textos | `--texto1`, `--texto2` | principal; secundário (aceita transparência) |
| Bordas | `--borda-cor`, `--borda-largura`, `--borda-opacidade`, `--borda-opacidade-hover` | usadas por `--borda` e `--borda-hover` (`border: var(--borda)`) |
| Formas | `--raio-card`, `--raio-btn`, `--raio-pill`, `--raio-img`, `--raio-icone`, `--foco-largura`, `--fonte` | cantos e fonte |
| Botões | `--btn1-*`, `--btn2-*`, `--btn3-*` (`fundo`, `fundo-hover`, `texto`, `borda`) e `--btn-borda-largura` | BTN1 ação principal (Jogar), BTN2 neutro (Cancelar), BTN3 destaque/atenção (Sair) |
| Derivados | `--foco`, `--overlay`, `--vidro`, `--hover-leve`, `--brilho-popup`, `--sombra-popup`, `--skeleton1/2` | calculados a partir das cores acima; normalmente não se mexe |

Transparência de uma cor do tema, sem criar cor nova: `color-mix(in srgb, var(--cor1) 30%, transparent)`.

**Como cada parte carrega o tema**

- **Catálogo:** `index.html` linka `/shared/tema.css` **antes** de `/site/catalogo.css`.
- **Menu e popup de saída (Shadow DOM):** variáveis CSS atravessam o Shadow DOM, então eles herdam o tema da página. O `k101.js` adiciona o `<link>` do tema sozinho se o jogo não tiver.
- **Jogos:** podem usar as mesmas variáveis no próprio CSS. Linke o tema antes do CSS do jogo.
- **Limite:** `<meta name="theme-color">` do HTML não aceita variável CSS; se mudar o fundo da página, atualize esse valor à mão.