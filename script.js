// Estado global da aplicação
let produtos = [];
let colecoes = new Set();
let filtroAtual = 'todos';
let termoPesquisa = '';

// ===== NOVO: Configuração da paginação =====
const ITENS_POR_PAGINA = 20;
let paginaAtual = 1;

// Elementos do DOM
const produtosGrid = document.getElementById('produtos-grid');
const pesquisaInput = document.getElementById('pesquisa');
const colecoesContainer = document.getElementById('colecoes-container');
const modal = document.getElementById('produto-modal');
const modalBody = document.getElementById('modal-body');
const closeBtn = document.querySelector('.close');
const notificacao = document.getElementById('notificacao');
const carrinhoCount = document.getElementById('carrinho-count');

// Variáveis para o banner
let bannerIndex = 0;
let bannerSlides = [];
let bannerInterval;
let isDragging = false;
let startX = 0;
let currentX = 0;
let dragStartTime = 0;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    carregarProdutos();
    atualizarContadorCarrinho();
    configurarEventListeners();
    adicionarEstilosPaginacao(); // NOVO: Adicionar estilos da paginação
});

// Carregar produtos do JSON
async function carregarProdutos() {
    try {
        const response = await fetch('produtos.json');
        produtos = await response.json();
        
        // Extrair coleções únicas
        produtos.forEach(produto => {
            if (produto.colecao) {
                colecoes.add(produto.colecao);
            }
        });
        
        renderizarColecoes();
        renderizarBanner();
        renderizarProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        produtosGrid.innerHTML = '<div class="loading">Erro ao carregar produtos. Tente novamente.</div>';
    }
}

// Função para carregar e renderizar o banner
function renderizarBanner() {
    // Obter coleções únicas
    const colecoesArray = Array.from(colecoes).sort();
    
    // Criar slides do banner
    bannerSlides = [];
    
    // Adicionar slide "Todos"
    bannerSlides.push({
        colecao: 'todos',
        imagem: 'imagens/banners/1todos.jpg'
    });
    
    // Adicionar slides para cada coleção
    colecoesArray.forEach(colecao => {
        bannerSlides.push({
            colecao: colecao,
            imagem: `imagens/banners/${colecao}.jpg`
        });
    });
    
    const bannerWrapper = document.getElementById('banner-wrapper');
    const bannerIndicators = document.getElementById('banner-indicators');
    const bannerPrev = document.getElementById('banner-prev');
    const bannerNext = document.getElementById('banner-next');
    
    if (!bannerWrapper) return;
    
    // Renderizar slides
    let slidesHTML = '';
    let indicatorsHTML = '';
    
    bannerSlides.forEach((slide, index) => {
        slidesHTML += `
            <div class="banner-slide" data-colecao="${slide.colecao}">
                <img src="${slide.imagem}" alt="Banner ${slide.colecao}" onerror="this.src='imagens/banners/default.jpg'; this.onerror=null;" draggable="false">
            </div>
        `;
        
        indicatorsHTML += `
            <div class="indicator ${index === 0 ? 'active' : ''}" data-index="${index}"></div>
        `;
    });
    
    bannerWrapper.innerHTML = slidesHTML;
    bannerIndicators.innerHTML = indicatorsHTML;
    
    // Configurar botões (agora apenas com ícones)
    if (bannerPrev) {
        bannerPrev.innerHTML = '<i class="fas fa-chevron-left"></i>';
    }
    if (bannerNext) {
        bannerNext.innerHTML = '<i class="fas fa-chevron-right"></i>';
    }
    
    // Adicionar eventos aos slides
    document.querySelectorAll('.banner-slide').forEach(slide => {
        // Evento de clique para mouse
        slide.addEventListener('click', (e) => {
            // Só considera clique se não foi um arrasto
            if (!isDragging && Math.abs(currentX - startX) < 10) {
                const colecao = slide.dataset.colecao;
                filtrarPorColecao(colecao);
            }
        });
        
        // Evento de toque para dispositivos móveis
        slide.addEventListener('touchstart', (e) => {
            // Não faz nada aqui, apenas permite que o evento de arrasto funcione
        }, { passive: true });
    });
    
    // Adicionar eventos aos indicadores
    document.querySelectorAll('.indicator').forEach(indicator => {
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            if (!isDragging) {
                const index = parseInt(indicator.dataset.index);
                irParaSlide(index);
            }
        });
    });
    
    // ===== NOVO: Eventos de arrasto =====
    // Eventos de mouse
    bannerWrapper.addEventListener('mousedown', iniciarArrasto);
    bannerWrapper.addEventListener('mousemove', duranteArrasto);
    bannerWrapper.addEventListener('mouseup', finalizarArrasto);
    bannerWrapper.addEventListener('mouseleave', cancelarArrasto);
    
    // Eventos de touch
    bannerWrapper.addEventListener('touchstart', iniciarArrastoTouch, { passive: false });
    bannerWrapper.addEventListener('touchmove', duranteArrastoTouch, { passive: false });
    bannerWrapper.addEventListener('touchend', finalizarArrastoTouch);
    bannerWrapper.addEventListener('touchcancel', cancelarArrasto);
    
    // Configurar posição inicial
    irParaSlide(0);
    
    // Iniciar autoplay
    iniciarAutoplay();
}

// ===== NOVAS FUNÇÕES DE ARRASTO =====
function iniciarArrasto(e) {
    e.preventDefault();
    isDragging = true;
    startX = e.pageX;
    currentX = startX;
    dragStartTime = Date.now();
    
    const bannerWrapper = document.getElementById('banner-wrapper');
    bannerWrapper.classList.add('dragging');
    
    // Parar autoplay durante o arrasto
    pararAutoplay();
}

function duranteArrasto(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    currentX = e.pageX;
    const diff = currentX - startX;
    
    // Limitar o arrasto para não passar dos limites
    const bannerWrapper = document.getElementById('banner-wrapper');
    const maxDrag = bannerWrapper.offsetWidth * 0.3; // Máximo 30% de arrasto
    
    let limitedDiff = diff;
    if (Math.abs(diff) > maxDrag) {
        limitedDiff = maxDrag * (diff > 0 ? 1 : -1);
    }
    
    // Feedback visual do arrasto (movimento parcial)
    const currentTranslate = -bannerIndex * 100;
    const partialMove = (limitedDiff / bannerWrapper.offsetWidth) * 100;
    bannerWrapper.style.transform = `translateX(calc(${currentTranslate}% + ${partialMove}px))`;
}

function finalizarArrasto(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const diff = currentX - startX;
    const dragDuration = Date.now() - dragStartTime;
    const bannerWrapper = document.getElementById('banner-wrapper');
    
    // Remove a classe de dragging
    bannerWrapper.classList.remove('dragging');
    
    // Determina se deve mudar de slide baseado na distância ou velocidade
    const threshold = bannerWrapper.offsetWidth * 0.15; // 15% do width (um pouco mais sensível)
    
    if (Math.abs(diff) > threshold || (dragDuration < 300 && Math.abs(diff) > 20)) {
        // Arrasto suficiente ou rápido
        if (diff > 0) {
            // Arrastou para direita -> slide anterior
            slideAnterior();
        } else {
            // Arrastou para esquerda -> próximo slide
            proximoSlide();
        }
    } else {
        // Arrasto pequeno, volta para o slide atual E considera como clique
        irParaSlide(bannerIndex);
        
        // Dispara o clique no slide atual se o movimento foi muito pequeno
        if (Math.abs(diff) < 10) {
            setTimeout(() => {
                const slides = document.querySelectorAll('.banner-slide');
                if (slides[bannerIndex]) {
                    const colecao = slides[bannerIndex].dataset.colecao;
                    filtrarPorColecao(colecao);
                }
            }, 50);
        }
    }
    
    isDragging = false;
}

function cancelarArrasto() {
    if (isDragging) {
        const bannerWrapper = document.getElementById('banner-wrapper');
        bannerWrapper.classList.remove('dragging');
        irParaSlide(bannerIndex);
        isDragging = false;
    }
}

// Versões para touch
function iniciarArrastoTouch(e) {
    e.preventDefault();
    isDragging = true;
    startX = e.touches[0].pageX;
    currentX = startX;
    dragStartTime = Date.now();
    
    const bannerWrapper = document.getElementById('banner-wrapper');
    bannerWrapper.classList.add('dragging');
}

function duranteArrastoTouch(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    currentX = e.touches[0].pageX;
    const diff = currentX - startX;
    
    const bannerWrapper = document.getElementById('banner-wrapper');
    const currentTranslate = -bannerIndex * 100;
    const partialMove = (diff / bannerWrapper.offsetWidth) * 100;
    bannerWrapper.style.transform = `translateX(calc(${currentTranslate}% + ${partialMove}px))`;
}

function finalizarArrastoTouch(e) {
    if (!isDragging) return;
    e.preventDefault();
    
    const diff = currentX - startX;
    const dragDuration = Date.now() - dragStartTime;
    const bannerWrapper = document.getElementById('banner-wrapper');
    
    bannerWrapper.classList.remove('dragging');
    
    const threshold = bannerWrapper.offsetWidth * 0.2;
    
    if (Math.abs(diff) > threshold || (dragDuration < 300 && Math.abs(diff) > 30)) {
        if (diff > 0) {
            slideAnterior();
        } else {
            proximoSlide();
        }
        isDragging = false;
    } else {
        // Se foi um toque rápido sem movimento significativo, considera como clique
        irParaSlide(bannerIndex);
        
        // Dispara o clique no slide atual
        setTimeout(() => {
            const slides = document.querySelectorAll('.banner-slide');
            if (slides[bannerIndex]) {
                const colecao = slides[bannerIndex].dataset.colecao;
                filtrarPorColecao(colecao);
            }
        }, 50);
        
        isDragging = false;
    }
}

// Função para filtrar por coleção ao clicar no banner
function filtrarPorColecao(colecao) {
    // Atualizar botão de coleção ativo
    document.querySelectorAll('.colecao-btn').forEach(btn => {
        btn.classList.remove('ativa');
        if (btn.dataset.colecao === colecao) {
            btn.classList.add('ativa');
        }
    });
    
    // Atualizar filtro atual e renderizar produtos
    filtroAtual = colecao;
    renderizarProdutos();
    
    
    // Rolar para o elemento de informação dos produtos
    rolarParaInfoProdutos();
}

// Funções de navegação do banner
function irParaSlide(index) {
    if (!bannerSlides.length) return;
    
    if (index < 0) index = bannerSlides.length - 1;
    if (index >= bannerSlides.length) index = 0;
    
    bannerIndex = index;
    
    const bannerWrapper = document.getElementById('banner-wrapper');
    if (bannerWrapper) {
        bannerWrapper.style.transform = `translateX(-${bannerIndex * 100}%)`;
        bannerWrapper.classList.remove('dragging'); // Garante que remove classe de arrasto
    }
    
    // Atualizar indicadores
    document.querySelectorAll('.indicator').forEach((indicator, i) => {
        if (i === bannerIndex) {
            indicator.classList.add('active');
        } else {
            indicator.classList.remove('active');
        }
    });
}

function proximoSlide() {
    irParaSlide(bannerIndex + 1);
    reiniciarAutoplay();
}

function slideAnterior() {
    irParaSlide(bannerIndex - 1);
    reiniciarAutoplay();
}

function iniciarAutoplay() {
    pararAutoplay();
    bannerInterval = setInterval(proximoSlide, 5000);
}

function pararAutoplay() {
    if (bannerInterval) {
        clearInterval(bannerInterval);
    }
}

function reiniciarAutoplay() {
    pararAutoplay();
    iniciarAutoplay();
}

// Renderizar botões de coleção
function renderizarColecoes() {
    let html = '<button class="colecao-btn ativa" data-colecao="todos">Todos</button>';
    
    Array.from(colecoes).sort().forEach(colecao => {
        html += `<button class="colecao-btn" data-colecao="${colecao}">${colecao}</button>`;
    });
    
    colecoesContainer.innerHTML = html;
    
    // Adicionar eventos aos botões de coleção
    document.querySelectorAll('.colecao-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.colecao-btn').forEach(b => b.classList.remove('ativa'));
            btn.classList.add('ativa');
            filtroAtual = btn.dataset.colecao;
            renderizarProdutos();
        });
    });
}

// Função auxiliar para obter produtos filtrados
function getProdutosFiltrados() {
    let produtosFiltrados = produtos;
    
    // Filtrar por coleção
    if (filtroAtual !== 'todos') {
        produtosFiltrados = produtosFiltrados.filter(p => p.colecao === filtroAtual);
    }
    
    // Filtrar por pesquisa
    if (termoPesquisa.trim() !== '') {
        const termo = termoPesquisa.toLowerCase().trim();
        produtosFiltrados = produtosFiltrados.filter(p => 
            p.nome.toLowerCase().includes(termo) || 
            (p.descricao && p.descricao.toLowerCase().includes(termo)) ||
            (p.tags && p.tags.some(tag => tag.toLowerCase().includes(termo)))
        );
    }
    
    return produtosFiltrados;
}

// Criar container para os controles de paginação
function criarControlesPaginacao() {
    let paginationContainer = document.getElementById('pagination-container');
    
    if (!paginationContainer) {
        paginationContainer = document.createElement('div');
        paginationContainer.id = 'pagination-container';
        paginationContainer.className = 'pagination-container';
        
        const produtosGrid = document.getElementById('produtos-grid');
        if (produtosGrid && produtosGrid.parentNode) {
            produtosGrid.parentNode.insertBefore(paginationContainer, produtosGrid.nextSibling);
        }
    }
    
    return paginationContainer;
}

// Renderizar controles de paginação
function renderizarPaginacao(totalItens) {
    const totalPaginas = Math.ceil(totalItens / ITENS_POR_PAGINA);
    const paginationContainer = criarControlesPaginacao();
    
    if (totalPaginas <= 1) {
        paginationContainer.innerHTML = '';
        return;
    }
    
    let html = '<div class="pagination">';
    
    // Botão anterior
    html += `
        <button class="page-btn prev-btn" ${paginaAtual === 1 ? 'disabled' : ''} 
                onclick="mudarPagina(${paginaAtual - 1})">
            <i class="fas fa-chevron-left"></i>
        </button>
    `;
    
    // Determinar quais páginas mostrar
    let inicio = Math.max(1, paginaAtual - 2);
    let fim = Math.min(totalPaginas, paginaAtual + 2);
    
    if (fim - inicio < 4) {
        if (inicio === 1) {
            fim = Math.min(totalPaginas, inicio + 4);
        } else if (fim === totalPaginas) {
            inicio = Math.max(1, fim - 4);
        }
    }
    
    // Primeira página
    if (inicio > 1) {
        html += `<button class="page-btn" onclick="mudarPagina(1)">1</button>`;
        if (inicio > 2) {
            html += `<span class="page-dots">...</span>`;
        }
    }
    
    // Páginas do meio
    for (let i = inicio; i <= fim; i++) {
        html += `<button class="page-btn ${i === paginaAtual ? 'active' : ''}" 
                        onclick="mudarPagina(${i})">${i}</button>`;
    }
    
    // Última página
    if (fim < totalPaginas) {
        if (fim < totalPaginas - 1) {
            html += `<span class="page-dots">...</span>`;
        }
        html += `<button class="page-btn" onclick="mudarPagina(${totalPaginas})">${totalPaginas}</button>`;
    }
    
    // Botão próximo
    html += `
        <button class="page-btn next-btn" ${paginaAtual === totalPaginas ? 'disabled' : ''} 
                onclick="mudarPagina(${paginaAtual + 1})">
            <i class="fas fa-chevron-right"></i>
        </button>
    `;
    
    html += '</div>';
    paginationContainer.innerHTML = html;
}

// Função para mudar de página
function mudarPagina(novaPagina) {
    const produtosFiltrados = getProdutosFiltrados();
    const totalPaginas = Math.ceil(produtosFiltrados.length / ITENS_POR_PAGINA);
    
    if (novaPagina < 1 || novaPagina > totalPaginas) {
        return;
    }
    
    paginaAtual = novaPagina;
    renderizarProdutosPaginados();
    
    // Rolar para o elemento de informação dos produtos
    rolarParaInfoProdutos();
}

// Função para renderizar apenas os produtos da página atual
function renderizarProdutosPaginados() {
    const produtosFiltrados = getProdutosFiltrados();
    const inicio = (paginaAtual - 1) * ITENS_POR_PAGINA;
    const fim = inicio + ITENS_POR_PAGINA;
    const produtosPagina = produtosFiltrados.slice(inicio, fim);
    
    let html = '';
    produtosPagina.forEach(produto => {
        html += `
            <div class="produto-card" data-id="${produto.id}">
                <img src="${produto.imagem}" alt="${produto.nome}" class="produto-imagem" onerror="this.src='imagens/produtos/default.jpg'">
                <div class="produto-info">
                    <h3 class="produto-nome">${produto.nome}</h3>
                    <p class="produto-colecao">${produto.colecao || 'Sem coleção'}</p>
                    <p class="produto-preco">R$ ${produto.preco.toFixed(2)}</p>
                </div>
            </div>
        `;
    });
    
    produtosGrid.innerHTML = html;
    
    // Adicionar evento de clique nos cards
    document.querySelectorAll('.produto-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const produtoId = parseInt(card.dataset.id);
            abrirModalProduto(produtoId);
        });
    });
    
    // Renderizar controles de paginação
    renderizarPaginacao(produtosFiltrados.length);
    
    // Mostrar informação de produtos
    mostrarInfoProdutos(produtosFiltrados.length, inicio + 1, fim);
}

// Função para mostrar informação sobre os produtos
function mostrarInfoProdutos(total, inicio, fim) {
    let infoContainer = document.getElementById('produtos-info');
    
    if (!infoContainer) {
        infoContainer = document.createElement('div');
        infoContainer.id = 'produtos-info';
        infoContainer.className = 'produtos-info';
        
        const produtosGrid = document.getElementById('produtos-grid');
        if (produtosGrid && produtosGrid.parentNode) {
            produtosGrid.parentNode.insertBefore(infoContainer, produtosGrid);
        }
    }
    
    const fimReal = Math.min(fim, total);
    
    // Determinar o nome da coleção a ser exibido
    let nomeColecao = '';
    if (filtroAtual === 'todos') {
        nomeColecao = '';
    } else {
        nomeColecao = ' - ['+filtroAtual+']';
    }
    
    infoContainer.innerHTML = `
        <span class="produtos-info-texto">
            Mostrando ${inicio} - ${fimReal} de ${total} produtos ${nomeColecao}
        </span>
    `;
}

// Função principal de renderizar produtos (substitui a original)
function renderizarProdutos() {
    const produtosFiltrados = getProdutosFiltrados();
    
    if (produtosFiltrados.length === 0) {
        produtosGrid.innerHTML = '<div class="loading">Nenhum produto encontrado</div>';
        const paginationContainer = document.getElementById('pagination-container');
        if (paginationContainer) {
            paginationContainer.innerHTML = '';
        }
        return;
    }
    
    paginaAtual = 1;
    renderizarProdutosPaginados();
    
    // Se a pesquisa estiver vazia, mostrar o banner novamente
    if (termoPesquisa.trim() === '') {
        mostrarBanner();
    }
}

// Adicionar estilos CSS para a paginação
function adicionarEstilosPaginacao() {
    const style = document.createElement('style');
    style.textContent = `
        .pagination-container {
            margin-top: 2rem;
            margin-bottom: 2rem;
        }
        
        .pagination {
            display: flex;
            justify-content: center;
            align-items: center;
            gap: 5px;
            flex-wrap: wrap;
        }
        
        .page-btn {
            min-width: 40px;
            height: 40px;
            padding: 0 8px;
            border: 2px solid var(--border-color);
            background: white;
            color: var(--text-color);
            border-radius: 8px;
            cursor: pointer;
            font-weight: 600;
            transition: all 0.3s;
            display: flex;
            align-items: center;
            justify-content: center;
        }
        
        .page-btn:hover:not(:disabled) {
            background: var(--primary-color);
            color: white;
            border-color: var(--primary-color);
            transform: translateY(-2px);
        }
        
        .page-btn.active {
            background: var(--primary-color);
            color: white;
            border-color: var(--primary-color);
        }
        
        .page-btn:disabled {
            opacity: 0.5;
            cursor: not-allowed;
        }
        
        .page-dots {
            padding: 0 5px;
            color: #666;
            font-weight: 600;
        }
        
        .prev-btn, .next-btn {
            font-size: 0.9rem;
        }
        
        .produtos-info {
            text-align: center;
            margin-bottom: 1rem;
            padding: 0.5rem;
            color: #666;
            font-size: 0.9rem;
        }
        
        .produtos-info-texto {
            background: white;
            padding: 0.5rem 1rem;
            border-radius: 20px;
            box-shadow: 0 2px 5px rgba(0,0,0,0.05);
            display: inline-block;
        }
        
        @media (max-width: 768px) {
            .page-btn {
                min-width: 35px;
                height: 35px;
                font-size: 0.9rem;
            }
        }
        
        @media (max-width: 480px) {
            .pagination {
                gap: 3px;
            }
            
            .page-btn {
                min-width: 32px;
                height: 32px;
                font-size: 0.8rem;
            }
            
            .page-dots {
                padding: 0 2px;
            }
        }
    `;
    
    document.head.appendChild(style);
}


// Abrir modal com detalhes do produto
function abrirModalProduto(produtoId) {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    
    modalBody.innerHTML = `
        <div class="modal-produto">
            <div class="zoom-overlay desktop-only">
                <i class="fas fa-search-plus"></i>
                <span>Clique para zoom</span>
            </div>
            <!-- Container da imagem com zoom -->
            <div class="imagem-container" id="imagem-zoom-container">
                <img src="${produto.imagem}" alt="${produto.nome}" id="modal-imagem" onerror="this.src='imagens/produtos/default.jpg'">
                
                <!-- Overlay indicador de zoom (visível apenas em desktop) -->
                
                
                <!-- Controles de zoom para mobile -->
                <div class="zoom-controls mobile-only">
                    <button class="zoom-btn" onclick="zoomIn(event)">
                        <i class="fas fa-search-plus"></i>
                    </button>
                    <button class="zoom-btn zoom-out" onclick="zoomOut(event)">
                        <i class="fas fa-search-minus"></i>
                    </button>
                </div>
            </div>
            
            <h2 style="margin: 20px 0 10px; font-size: 1.1rem;">${produto.nome}</h2>
            <p style="color: #666; margin-bottom: 15px; font-size: 0.8rem;"><strong>Coleção:</strong> ${produto.colecao || 'Sem coleção'}</p>
            <div class="modal-preco-quantidade">
                <div class="modal-preco">
                    <span class="preco-valor">R$ ${produto.preco.toFixed(2)}</span>
                    <div class="quantidade-controles">
                        <button class="quantidade-btn-modal" onclick="alterarQuantidadeModal(-1)">
                            <i class="fas fa-minus"></i>
                        </button>
                        <input type="number" id="quantidade-modal" class="quantidade-input-modal" value="1" min="1" max="99" onchange="atualizarPrecoTotal()">
                        <button class="quantidade-btn-modal" onclick="alterarQuantidadeModal(1)">
                            <i class="fas fa-plus"></i>
                        </button>
                    </div>
                </div>

                
            </div>
            <div class="modal-total" id="modal-total">
                Total: R$ ${produto.preco.toFixed(2)}
            </div>
            <button class="btn-add-carrinho-modal" onclick="adicionarAoCarrinho(${produto.id})">
                <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
            </button>
            <p style="margin-bottom: 50px; margin-top: 20px; font-size: 0.7rem;">${produto.descricao || 'Sem descrição disponível.'}</p>
        </div>
    `;
    
    modal.style.display = 'block';
    
    // NOVO: Bloquear scroll da página
    bloquearScroll();
    
    // Configurar eventos de zoom após o modal ser aberto
    setTimeout(configurarZoom, 100);
}

// ===== FUNÇÕES DE ZOOM =====

// Configurar eventos de zoom
function configurarZoom() {
    const imagemContainer = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!imagemContainer || !imagem) return;
    
    // Remover eventos anteriores
    imagemContainer.removeEventListener('click', toggleZoom);
    imagem.removeEventListener('mousemove', moverZoom);
    imagem.removeEventListener('mouseleave', resetZoom);
    
    // Adicionar eventos baseado no dispositivo
    if (window.innerWidth <= 768) {
        // Mobile: usa os botões de controle
        console.log('Modo mobile: botões de zoom e arrasto ativados');
        
        // Resetar qualquer transformação ao configurar
        imagem.style.transform = '';
        imagem.style.transformOrigin = 'center center';
        isZoomDragging = false;
        
        // Configurar arrasto
        configurarArrastoZoom();
    } else {
        // Desktop: clique para zoom e mouse move para navegação
        imagemContainer.addEventListener('click', toggleZoom);
        
        // Eventos de mouse move apenas quando estiver com zoom
        imagem.addEventListener('mousemove', moverZoom);
        imagem.addEventListener('mouseleave', resetZoom);
    }
}
// Alternar zoom (para desktop)
function toggleZoom(e) {
    e.stopPropagation();
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem) return;
    
    container.classList.toggle('zoomed');
    
    // Resetar posição do zoom
    if (!container.classList.contains('zoomed')) {
        imagem.style.transformOrigin = 'center center';
    }
}

// Mover o zoom com o mouse
function moverZoom(e) {
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem || !container.classList.contains('zoomed')) return;
    
    // Calcular posição do mouse relativa à imagem
    const rect = imagem.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 100;
    const y = ((e.clientY - rect.top) / rect.height) * 100;
    
    // Limitar entre 0% e 100%
    const limitedX = Math.max(0, Math.min(100, x));
    const limitedY = Math.max(0, Math.min(100, y));
    
    // Aplicar transform origin
    imagem.style.transformOrigin = `${limitedX}% ${limitedY}%`;
}

// ===== FUNÇÕES DE ARRASTO PARA ZOOM (MOBILE) =====

let isZoomDragging = false;
let startDragX = 0;
let startDragY = 0;
let currentTransformX = 0;
let currentTransformY = 0;
let startTransformX = 0;
let startTransformY = 0;

// Configurar eventos de arrasto para zoom
function configurarArrastoZoom() {
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem) return;
    
    // Remover eventos anteriores
    imagem.removeEventListener('touchstart', iniciarArrastoZoom);
    imagem.removeEventListener('touchmove', duranteArrastoZoom);
    imagem.removeEventListener('touchend', finalizarArrastoZoom);
    imagem.removeEventListener('touchcancel', cancelarArrastoZoom);
    
    // Adicionar eventos apenas se estiver no mobile
    if (window.innerWidth <= 768) {
        imagem.addEventListener('touchstart', iniciarArrastoZoom, { passive: false });
        imagem.addEventListener('touchmove', duranteArrastoZoom, { passive: false });
        imagem.addEventListener('touchend', finalizarArrastoZoom);
        imagem.addEventListener('touchcancel', cancelarArrastoZoom);
    }
}

function iniciarArrastoZoom(e) {
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    // Só permite arrastar se estiver com zoom
    if (!container || !container.classList.contains('zoomed')) return;
    
    e.preventDefault();
    
    isZoomDragging = true;
    startDragX = e.touches[0].clientX;
    startDragY = e.touches[0].clientY;
    
    // Capturar a transformação atual
    const transform = imagem.style.transform;
    if (transform && transform.includes('translate')) {
        const matches = transform.match(/translate\(([-\d.]+)px,\s*([-\d.]+)px\)/);
        if (matches) {
            startTransformX = parseFloat(matches[1]) || 0;
            startTransformY = parseFloat(matches[2]) || 0;
        } else {
            startTransformX = 0;
            startTransformY = 0;
        }
    } else {
        startTransformX = 0;
        startTransformY = 0;
    }
    
    // Mudar o cursor para "grabbing"
    imagem.style.cursor = 'grabbing';
}

function duranteArrastoZoom(e) {
    if (!isZoomDragging) return;
    e.preventDefault();
    
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem) return;
    
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    
    // Calcular diferença do arrasto
    const deltaX = currentX - startDragX;
    const deltaY = currentY - startDragY;
    
    // Calcular nova posição
    let newX = startTransformX + deltaX;
    let newY = startTransformY + deltaY;
    
    // Calcular limites de arrasto baseado no zoom
    const zoomScale = 2.5; // Mesmo valor do zoom no CSS
    const containerRect = container.getBoundingClientRect();
    const imageRect = imagem.getBoundingClientRect();
    
    // Calcular quanto a imagem aumentou
    const imageWidth = imageRect.width;
    const containerWidth = containerRect.width;
    const extraWidth = imageWidth - containerWidth;
    
    // Limites horizontais (metade do extra para cada lado)
    const maxX = extraWidth / 2;
    const minX = -maxX;
    
    // Limites verticais
    const imageHeight = imageRect.height;
    const containerHeight = containerRect.height;
    const extraHeight = imageHeight - containerHeight;
    const maxY = extraHeight / 2;
    const minY = -maxY;
    
    // Aplicar limites
    newX = Math.max(minX, Math.min(maxX, newX));
    newY = Math.max(minY, Math.min(maxY, newY));
    
    // Aplicar transformação
    imagem.style.transform = `translate(${newX}px, ${newY}px) scale(2.5)`;
}

function finalizarArrastoZoom(e) {
    if (!isZoomDragging) return;
    e.preventDefault();
    
    const imagem = document.getElementById('modal-imagem');
    if (imagem) {
        imagem.style.cursor = '';
    }
    
    isZoomDragging = false;
}

function cancelarArrastoZoom(e) {
    if (!isZoomDragging) return;
    
    const imagem = document.getElementById('modal-imagem');
    if (imagem) {
        imagem.style.cursor = '';
    }
    
    isZoomDragging = false;
}

// Resetar zoom quando o mouse sai da imagem
function resetZoom() {
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem) return;
    
    // Se estiver com zoom, remove
    if (container.classList.contains('zoomed')) {
        container.classList.remove('zoomed');
        imagem.style.transformOrigin = 'center center';
    }
}

// Funções para os botões de zoom (mobile)
function zoomIn(e) {
    e.stopPropagation();
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem) return;
    
    container.classList.add('zoomed');
    
    // Resetar transformação ao dar zoom in
    imagem.style.transform = 'scale(2.5)';
    imagem.style.transformOrigin = 'center center';
    
    // Configurar arrasto após o zoom
    setTimeout(configurarArrastoZoom, 100);
}

function zoomOut(e) {
    e.stopPropagation();
    const container = document.getElementById('imagem-zoom-container');
    const imagem = document.getElementById('modal-imagem');
    
    if (!container || !imagem) return;
    
    container.classList.remove('zoomed');
    
    // Resetar transformação ao tirar zoom
    imagem.style.transform = '';
    imagem.style.transformOrigin = 'center center';
    isZoomDragging = false;
}

// Função para bloquear scroll da página
function bloquearScroll() {
    document.body.style.overflow = 'hidden';
    document.body.style.position = 'fixed';
    document.body.style.width = '100%';
    document.body.style.top = `-${window.scrollY}px`; // Mantém a posição do scroll
}

// Função para liberar scroll da página
function liberarScroll() {
    const scrollY = document.body.style.top;
    document.body.style.overflow = '';
    document.body.style.position = '';
    document.body.style.width = '';
    document.body.style.top = '';
    
    // Restaura a posição do scroll
    if (scrollY) {
        window.scrollTo(0, parseInt(scrollY || '0') * -1);
    }
}

// Detectar mudança de tamanho da tela para reconfigurar zoom
window.addEventListener('resize', function() {
    // Se o modal estiver aberto, reconfigurar zoom
    if (modal.style.display === 'block') {
        configurarZoom();
    }
});

// Alterar quantidade no modal
function alterarQuantidadeModal(delta) {
    const inputQuantidade = document.getElementById('quantidade-modal');
    if (!inputQuantidade) return;
    
    let novaQuantidade = parseInt(inputQuantidade.value) + delta;
    
    if (novaQuantidade < 1) novaQuantidade = 1;
    if (novaQuantidade > 99) novaQuantidade = 99;
    
    inputQuantidade.value = novaQuantidade;
    atualizarPrecoTotal();
}

// Atualizar preço total no modal
function atualizarPrecoTotal() {
    const inputQuantidade = document.getElementById('quantidade-modal');
    const modalTotal = document.getElementById('modal-total');
    const precoElement = document.querySelector('.preco-valor');
    
    if (!inputQuantidade || !modalTotal || !precoElement) return;
    
    const quantidade = parseInt(inputQuantidade.value) || 1;
    const precoTexto = precoElement.textContent;
    const preco = parseFloat(precoTexto.replace('R$', '').replace(',', '.').trim());
    
    const total = preco * quantidade;
    modalTotal.textContent = `Total: R$ ${total.toFixed(2)}`;
}

// Adicionar ao carrinho a partir do modal
function adicionarAoCarrinho(produtoId) {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    
    const inputQuantidade = document.getElementById('quantidade-modal');
    const quantidade = inputQuantidade ? parseInt(inputQuantidade.value) : 1;
    
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    
    const itemExistente = carrinho.find(item => item.id === produto.id.toString());
    
    if (itemExistente) {
        itemExistente.quantidade += quantidade;
    } else {
        carrinho.push({
            id: produto.id.toString(),
            nome: produto.nome,
            preco: produto.preco,
            imagem: produto.imagem,
            quantidade: quantidade
        });
    }
    
    localStorage.setItem('carrinho', JSON.stringify(carrinho));
    
    modal.style.display = 'none';
    liberarScroll();
    
    mostrarNotificacao(`✅ ${quantidade} x ${produto.nome} adicionado ao carrinho!`);
    atualizarContadorCarrinho();
}

// Fechar modal pelo botão X
closeBtn.onclick = () => {
    modal.style.display = 'none';
    liberarScroll(); // NOVO: Liberar scroll
};

// Fechar modal clicando fora
window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
        liberarScroll(); // NOVO: Liberar scroll
    }
};


// Atualizar contador do carrinho
function atualizarContadorCarrinho() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    const totalItens = carrinho.reduce((total, item) => total + item.quantidade, 0);
    
    // Atualizar contador do header
    const carrinhoCount = document.getElementById('carrinho-count');
    if (carrinhoCount) {
        carrinhoCount.textContent = totalItens;
    }
    
    // Controlar botão flutuante
    const floatingCart = document.getElementById('floating-cart');
    const floatingCount = document.getElementById('floating-cart-count');
    
    if (floatingCart && floatingCount) {
        if (totalItens > 0) {
            // Verifica se o botão estava oculto para aplicar animação de entrada apenas uma vez
            const estavaOculto = floatingCart.style.display === 'none' || !floatingCart.style.display;
            
            floatingCart.style.display = 'block';
            floatingCount.textContent = totalItens;
            
            // Aplica animação de entrada apenas se estava oculto
            if (estavaOculto) {
                floatingCart.classList.add('show');
                // Remove a classe após a animação terminar
                setTimeout(() => {
                    floatingCart.classList.remove('show');
                }, 300);
            }
        } else {
            floatingCart.style.display = 'none';
            floatingCart.classList.remove('show', 'pulse');
        }
    }
}

// Mostrar notificação
function mostrarNotificacao(mensagem) {
    notificacao.textContent = mensagem;
    notificacao.classList.add('mostrar');
    
    // Efeito de pulso no botão flutuante
    const floatingCart = document.getElementById('floating-cart');
    if (floatingCart && floatingCart.style.display === 'block') {
        floatingCart.classList.add('pulse');
        setTimeout(() => {
            floatingCart.classList.remove('pulse');
        }, 500);
    }
    
    // Timer para remover a notificação (3 segundos)
    setTimeout(() => {
        notificacao.classList.remove('mostrar');
    }, 2000);
}

// Configurar event listeners
function configurarEventListeners() {
    console.log('Configurando event listeners...'); // Debug
    
    // Pesquisa com debounce
    let timeoutId;
    if (pesquisaInput) {
        pesquisaInput.addEventListener('input', (e) => {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                termoPesquisa = e.target.value;
                renderizarProdutos();
            }, 300);
        });
    }
    
    // ===== Menu lateral =====
    const menuToggle = document.getElementById('menu-toggle');
    const sidebar = document.getElementById('sidebar');
    const sidebarOverlay = document.getElementById('sidebar-overlay');
    const sidebarClose = document.getElementById('sidebar-close');
    
    console.log('menuToggle:', menuToggle); // Debug
    console.log('sidebar:', sidebar); // Debug
    console.log('sidebarOverlay:', sidebarOverlay); // Debug
    console.log('sidebarClose:', sidebarClose); // Debug
    
    if (menuToggle && sidebar && sidebarOverlay && sidebarClose) {
        // Abrir menu
        menuToggle.addEventListener('click', () => {
            console.log('Clicou no menu toggle!'); // Debug
            sidebar.classList.add('active');
            sidebarOverlay.classList.add('active');
            document.body.style.overflow = 'hidden'; // Previne scroll da página
        });
        
        // Fechar menu (botão X)
        sidebarClose.addEventListener('click', () => {
            console.log('Fechando menu pelo X'); // Debug
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
        
        // Fechar menu (clicar no overlay)
        sidebarOverlay.addEventListener('click', () => {
            console.log('Fechando menu pelo overlay'); // Debug
            sidebar.classList.remove('active');
            sidebarOverlay.classList.remove('active');
            document.body.style.overflow = '';
        });
        
        // Fechar menu com tecla ESC
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && sidebar.classList.contains('active')) {
                console.log('Fechando menu por ESC'); // Debug
                sidebar.classList.remove('active');
                sidebarOverlay.classList.remove('active');
                document.body.style.overflow = '';
            }
        });
    } else {
        console.log('Algum elemento do menu não foi encontrado!');
    }
    
    // ===== Evento de tecla Enter no campo de pesquisa =====
    if (pesquisaInput) {
        pesquisaInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault(); // Previne comportamento padrão do formulário
                
                const termo = e.target.value.trim();
                
                // Se o campo estiver vazio, apenas remove foco e restaura banner
                if (termo === '') {
                    pesquisaInput.blur();
                    mostrarBanner(); // Restaura o banner se visível
                    return;
                }
                
                // Feedback visual: mudar cor temporariamente
                pesquisaInput.style.backgroundColor = '#f0f8ff';
                pesquisaInput.style.borderColor = 'var(--primary-color)';
                
                // Esconder o banner
                esconderBanner();
                
                // Atualiza a pesquisa imediatamente
                termoPesquisa = termo;
                renderizarProdutos();
                
                // Remove o foco do campo de pesquisa
                pesquisaInput.blur();
                
                // Restaura a cor original após um tempo
                setTimeout(() => {
                    pesquisaInput.style.backgroundColor = '';
                    pesquisaInput.style.borderColor = '';
                }, 500);
                
                // CHAMAR A FUNÇÃO AUXILIAR PARA ROLAR ATÉ A INFORMAÇÃO DOS PRODUTOS
                rolarParaInfoProdutos();
            }
        });
    }
    
    // Eventos do banner
    const btnPrev = document.getElementById('banner-prev');
    const btnNext = document.getElementById('banner-next');
    
    if (btnPrev) {
        btnPrev.addEventListener('click', (e) => {
            e.stopPropagation();
            slideAnterior();
        });
    }
    
    if (btnNext) {
        btnNext.addEventListener('click', (e) => {
            e.stopPropagation();
            proximoSlide();
        });
    }
    
    // Pausar autoplay quando o mouse estiver sobre o banner
    const bannerContainer = document.getElementById('banner-container');
    if (bannerContainer) {
        bannerContainer.addEventListener('mouseenter', pararAutoplay);
        bannerContainer.addEventListener('mouseleave', iniciarAutoplay);
    }
}

// Função auxiliar para rolar e destacar o elemento de informação
function rolarParaInfoProdutos() {
    
        const produtosInfo = document.getElementById('produtos-info');
        if (produtosInfo) {
            const header = document.querySelector('.header');
            const headerHeight = header ? header.offsetHeight : 0;
            
            // Offset para dar um espaçamento agradável
            const offset = headerHeight + 20;
            
            const elementPosition = produtosInfo.getBoundingClientRect().top + window.pageYOffset;
            const offsetPosition = elementPosition - offset;
            
            window.scrollTo({
                top: offsetPosition,
                behavior: 'smooth'
            });
            
            // Destaque sutil no elemento de informação
            produtosInfo.style.transition = 'background-color 0.3s ease';
            produtosInfo.style.backgroundColor = 'rgba(18, 172, 159, 0.1)';
            produtosInfo.style.borderRadius = '8px';
            setTimeout(() => {
                produtosInfo.style.backgroundColor = '';
            }, 1000);
        }
}

// ===== NOVAS FUNÇÕES PARA CONTROLAR O BANNER =====
function esconderBanner() {
    const bannerContainer = document.getElementById('banner-container');
    const colecoesContainer = document.getElementById('colecoes-container');
    
    if (bannerContainer) {
        bannerContainer.style.opacity = '0';
        bannerContainer.style.height = '0';
        bannerContainer.style.margin = '0';
        bannerContainer.style.overflow = 'hidden';
        bannerContainer.style.pointerEvents = 'none';
        
        // Parar autoplay quando esconder
        pararAutoplay();
    }
    
    // Ajustar margem da coleções para ficar mais próximo da pesquisa
    if (colecoesContainer) {
        colecoesContainer.style.transition = 'margin-top 0.3s ease';
        colecoesContainer.style.marginTop = '0';
    }
}

function mostrarBanner() {
    const bannerContainer = document.getElementById('banner-container');
    const colecoesContainer = document.getElementById('colecoes-container');
    
    if (bannerContainer) {
        bannerContainer.style.transition = 'opacity 0.3s ease, height 0.3s ease, margin 0.3s ease';
        bannerContainer.style.opacity = '1';
        bannerContainer.style.height = ''; // Volta ao tamanho original
        bannerContainer.style.margin = ''; // Volta à margem original
        bannerContainer.style.overflow = '';
        bannerContainer.style.pointerEvents = '';
        
        // Reiniciar autoplay
        iniciarAutoplay();
    }
    
    // Restaurar margem original das coleções
    if (colecoesContainer) {
        colecoesContainer.style.transition = 'margin-top 0.3s ease';
        colecoesContainer.style.marginTop = '';
    }
}