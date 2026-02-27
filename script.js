// Estado global da aplicação
let produtos = [];
let colecoes = new Set();
let filtroAtual = 'todos';
let termoPesquisa = '';

// Elementos do DOM
const produtosGrid = document.getElementById('produtos-grid');
const pesquisaInput = document.getElementById('pesquisa');
const colecoesContainer = document.getElementById('colecoes-container');
const modal = document.getElementById('produto-modal');
const modalBody = document.getElementById('modal-body');
const closeBtn = document.querySelector('.close');
const notificacao = document.getElementById('notificacao');
const carrinhoCount = document.getElementById('carrinho-count');

// Inicialização

// Efeito da logo centralizada
document.addEventListener('DOMContentLoaded', () => {
    // Aguarda um pequeno tempo para garantir que tudo carregou
    carregarProdutos();
    atualizarContadorCarrinho();
    configurarEventListeners();
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
        renderizarProdutos();
    } catch (error) {
        console.error('Erro ao carregar produtos:', error);
        produtosGrid.innerHTML = '<div class="loading">Erro ao carregar produtos. Tente novamente.</div>';
    }
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

// Renderizar produtos com filtros
function renderizarProdutos() {
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
    
    if (produtosFiltrados.length === 0) {
        produtosGrid.innerHTML = '<div class="loading">Nenhum produto encontrado</div>';
        return;
    }
    
    let html = '';
    produtosFiltrados.forEach(produto => {
        html += `
            <div class="produto-card" data-id="${produto.id}">
                <img src="${produto.imagem}" alt="${produto.nome}" class="produto-imagem">
                <div class="produto-info">
                    <h3 class="produto-nome">${produto.nome}</h3>
                    <p class="produto-colecao">${produto.colecao || 'Sem coleção'}</p>
                    <p class="produto-preco">R$ ${produto.preco.toFixed(2)}</p>
                    <!-- Botão removido -->
                </div>
            </div>
        `;
    });
    
    produtosGrid.innerHTML = html;
    
    // Adicionar evento de clique nos cards para abrir modal
    document.querySelectorAll('.produto-card').forEach(card => {
        card.addEventListener('click', (e) => {
            const produtoId = parseInt(card.dataset.id);
            abrirModalProduto(produtoId);
        });
    });
}

// Abrir modal com detalhes do produto
// Abrir modal com detalhes do produto (versão com seletor de quantidade)
function abrirModalProduto(produtoId) {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    
    modalBody.innerHTML = `
        <div class="modal-produto">
            <img src="${produto.imagem}" alt="${produto.nome}" style="width: 100%; max-height: 400px; object-fit: contain; border-radius: 10px;">
            <h2 style="margin: 20px 0 10px;">${produto.nome}</h2>
            <p style="color: #666; margin-bottom: 15px;"><strong>Coleção:</strong> ${produto.colecao || 'Sem coleção'}</p>
            <p style="margin-bottom: 20px;">${produto.descricao || 'Sem descrição disponível.'}</p>
            
            <div class="modal-preco-quantidade">
                <div class="modal-preco">
                    <span class="preco-label">Preço:</span>
                    <span class="preco-valor">R$ ${produto.preco.toFixed(2)}</span>
                </div>
                
                <div class="modal-quantidade">
                    <span class="quantidade-label">Quantidade:</span>
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
            
            <button class="btn-add-carrinho-modal" onclick="adicionarAoCarrinhoModal(${produto.id})">
                <i class="fas fa-cart-plus"></i> Adicionar ao Carrinho
            </button>
        </div>
    `;
    
    modal.style.display = 'block';
}

// Alterar quantidade no modal
function alterarQuantidadeModal(delta) {
    const inputQuantidade = document.getElementById('quantidade-modal');
    if (!inputQuantidade) return;
    
    let novaQuantidade = parseInt(inputQuantidade.value) + delta;
    
    // Garantir que a quantidade seja pelo menos 1 e no máximo 99
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
function adicionarAoCarrinhoModal(produtoId) {
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    
    const inputQuantidade = document.getElementById('quantidade-modal');
    const quantidade = inputQuantidade ? parseInt(inputQuantidade.value) : 1;
    
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    
    const itemExistente = carrinho.find(item => item.id === produtoId);
    
    if (itemExistente) {
        itemExistente.quantidade += quantidade;
    } else {
        carrinho.push({
            id: produto.id,
            nome: produto.nome,
            preco: produto.preco,
            imagem: produto.imagem,
            quantidade: quantidade
        });
    }
    
    localStorage.setItem('carrinho', JSON.stringify(carrinho));
    
    // Fechar o modal
    modal.style.display = 'none';
    
    mostrarNotificacao(`✅ ${quantidade} x ${produto.nome} adicionado ao carrinho!`);
    atualizarContadorCarrinho();
}

// Fechar modal
closeBtn.onclick = () => {
    modal.style.display = 'none';
};

window.onclick = (event) => {
    if (event.target === modal) {
        modal.style.display = 'none';
    }
};

// Função do carrinho
function adicionarAoCarrinho(event, produtoId) {
    event.stopPropagation();
    
    const produto = produtos.find(p => p.id === produtoId);
    if (!produto) return;
    
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    
    const itemExistente = carrinho.find(item => item.id === produtoId);
    
    if (itemExistente) {
        itemExistente.quantidade += 1;
    } else {
        carrinho.push({
            id: produto.id,
            nome: produto.nome,
            preco: produto.preco,
            imagem: produto.imagem,
            quantidade: 1
        });
    }
    
    localStorage.setItem('carrinho', JSON.stringify(carrinho));
    
    mostrarNotificacao('✅ Produto adicionado ao carrinho!');
    atualizarContadorCarrinho();
}

// Atualizar contador do carrinho
function atualizarContadorCarrinho() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    const totalItens = carrinho.reduce((total, item) => total + item.quantidade, 0);
    carrinhoCount.textContent = totalItens;
}

// Mostrar notificação
function mostrarNotificacao(mensagem) {
    notificacao.textContent = mensagem;
    notificacao.classList.add('mostrar');
    
    setTimeout(() => {
        notificacao.classList.remove('mostrar');
    }, 3000);
}

// Configurar event listeners
function configurarEventListeners() {
    // Pesquisa com debounce
    let timeoutId;
    pesquisaInput.addEventListener('input', (e) => {
        clearTimeout(timeoutId);
        timeoutId = setTimeout(() => {
            termoPesquisa = e.target.value;
            renderizarProdutos();
        }, 300);
    });
}