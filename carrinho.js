// Número do WhatsApp para receber os pedidos (SUBSTITUA PELO SEU)
const NUMERO_WHATSAPP = '5562984136170'; // Formato: código do país + DDD + número

// Elementos do DOM
const carrinhoItems = document.getElementById('carrinho-items');
const carrinhoResumo = document.getElementById('carrinho-resumo');

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    renderizarCarrinho();
});

// Renderizar carrinho
function renderizarCarrinho() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    
    if (carrinho.length === 0) {
        carrinhoItems.innerHTML = `
            <div class="carrinho-vazio">
                <i class="fas fa-shopping-cart"></i>
                <h2>Seu carrinho está vazio</h2>
                <p>Adicione alguns produtos para continuar</p>
                <a href="index.html" style="color: var(--primary-color);">Continuar comprando</a>
            </div>
        `;
        carrinhoResumo.innerHTML = '';
        return;
    }
    
    renderizarItensCarrinho(carrinho);
    renderizarResumo(carrinho);
}

// Renderizar itens do carrinho
function renderizarItensCarrinho(carrinho) {
    let html = '';
    let subtotal = 0;
    
    carrinho.forEach(item => {
        const totalItem = item.preco * item.quantidade;
        subtotal += totalItem;
        
        html += `
            <div class="carrinho-item" data-id="${item.id}">
                <img src="${item.imagem}" alt="${item.nome}" class="item-imagem">
                <div class="item-info">
                    <h3>${item.nome}</h3>
                    <p class="item-preco">R$ ${item.preco.toFixed(2)}</p>
                </div>
                <div class="item-quantidade">
                    <button class="quantidade-btn" onclick="alterarQuantidade(${item.id}, -1)">-</button>
                    <span class="quantidade-input">${item.quantidade}</span>
                    <button class="quantidade-btn" onclick="alterarQuantidade(${item.id}, 1)">+</button>
                </div>
                <div class="item-total">
                    R$ ${totalItem.toFixed(2)}
                </div>
                <i class="fas fa-trash item-remove" onclick="removerItem(${item.id})"></i>
            </div>
        `;
    });
    
    carrinhoItems.innerHTML = html;
}

// Renderizar resumo do carrinho
function renderizarResumo(carrinho) {
    const subtotal = carrinho.reduce((total, item) => total + (item.preco * item.quantidade), 0);
    
    carrinhoResumo.innerHTML = `
        <h2>Resumo do Pedido</h2>
        <div class="resumo-linha">
            <span>Subtotal:</span>
            <span>R$ ${subtotal.toFixed(2)}</span>
        </div>
        <div class="resumo-linha resumo-total">
            <span>Total:</span>
            <span>R$ ${subtotal.toFixed(2)}</span>
        </div>
        <button class="btn-finalizar" onclick="finalizarCompra()">
            <i class="fab fa-whatsapp"></i> Finalizar Pedido
        </button>
        <button class="btn-limpar" onclick="limparCarrinho()">
            <i class="fas fa-trash"></i> Limpar Carrinho
        </button>
    `;
}

// Alterar quantidade de um item
function alterarQuantidade(produtoId, delta) {
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    const itemIndex = carrinho.findIndex(item => item.id === produtoId);
    
    if (itemIndex !== -1) {
        const novaQuantidade = carrinho[itemIndex].quantidade + delta;
        
        if (novaQuantidade <= 0) {
            carrinho.splice(itemIndex, 1);
        } else {
            carrinho[itemIndex].quantidade = novaQuantidade;
        }
        
        localStorage.setItem('carrinho', JSON.stringify(carrinho));
        renderizarCarrinho();
        
        // Atualizar contador no header da página principal (se existir)
        if (window.opener && !window.opener.closed) {
            window.opener.atualizarContadorCarrinho();
        }
    }
}

// Remover item específico
function removerItem(produtoId) {
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    carrinho = carrinho.filter(item => item.id !== produtoId);
    localStorage.setItem('carrinho', JSON.stringify(carrinho));
    renderizarCarrinho();
}

// Limpar carrinho completamente
function limparCarrinho() {
    if (confirm('Tem certeza que deseja limpar todo o carrinho?')) {
        localStorage.removeItem('carrinho');
        renderizarCarrinho();
    }
}

// Finalizar compra via WhatsApp
function finalizarCompra() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    
    if (carrinho.length === 0) {
        alert('Seu carrinho está vazio!');
        return;
    }
    
    // Construir mensagem do pedido
    let mensagem = '🧾*NOVO PEDIDO*\n*--------------------*\n\n';
    mensagem += '*ITENS:*\n';
    
    let total = 0;
    carrinho.forEach(item => {
        const subtotal = item.preco * item.quantidade;
        total += subtotal;
        mensagem += `• ${item.nome}\n`;
        mensagem += `  Quantidade: ${item.quantidade}\n`;
        mensagem += `  Preço: R$ ${item.preco.toFixed(2)}\n`;
        mensagem += `  Subtotal: R$ ${subtotal.toFixed(2)}\n\n`;
    });
    
    mensagem += `✔️*TOTAL DO PEDIDO: R$ ${total.toFixed(2)}*\n\n`;
    mensagem += 'Por favor, confirme o pedido e informe o prazo de entrega. 🙏';
    
    // Codificar mensagem para URL
    const mensagemCodificada = encodeURIComponent(mensagem);
    
    // Criar link do WhatsApp
    const whatsappLink = `https://wa.me/${NUMERO_WHATSAPP}?text=${mensagemCodificada}`;
    
    // Abrir WhatsApp em nova aba
    window.open(whatsappLink, '_blank');
    
    // Opcional: limpar carrinho após enviar pedido
    if (confirm('Deseja limpar o carrinho após enviar o pedido?')) {
        localStorage.removeItem('carrinho');
        renderizarCarrinho();
    }

}
