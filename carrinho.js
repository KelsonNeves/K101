// Número do WhatsApp para receber os pedidos (SUBSTITUA PELO SEU)
const NUMERO_WHATSAPP = '5562984136170'; // Formato: código do país + DDD + número

// Elementos do DOM
const carrinhoItems = document.getElementById('carrinho-items');
const carrinhoResumo = document.getElementById('carrinho-resumo');

let nomeCliente = '';

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    renderizarCarrinho();
});

// Renderizar carrinho
function renderizarCarrinho() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    
    // Tentar recuperar nome da sessionStorage
    nomeCliente = sessionStorage.getItem('nomeClienteTemp') || '';
    
    if (carrinho.length === 0) {
        carrinhoItems.innerHTML = `
            <div class="carrinho-vazio">
                <i class="fas fa-shopping-cart"></i>
                <h2>Seu carrinho está vazio</h2>
                <p> Adicione alguns produtos para continuar </p>
                <a href="nav.html" style="color: var(--primary-color);">Voltar a comprar</a>
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
            <div class="carrinho-item">
                <img src="${item.imagem}" 
                    alt="${item.nome}" 
                    style="width: 80px; height: 60px; object-fit: contain; background: #f9f9f9; border-radius: 4px; padding: 2px;">
                <div class="item-info">
                    <h3>${item.nome}</h3>
                    <p class="item-preco">R$ ${item.preco.toFixed(2)}</p>
                </div>
                <div class="item-quantidade">
                    <button class="quantidade-btn" onclick="alterarQuantidade('${item.id}', -1)">-</button>
                    <span class="quantidade-input">${item.quantidade}</span>
                    <button class="quantidade-btn" onclick="alterarQuantidade('${item.id}', 1)">+</button>
                </div>
                <div class="item-total">
                    R$ ${totalItem.toFixed(2)}
                </div>
                <i class="fas fa-trash item-remove" onclick="removerItem('${item.id}')"></i>
            </div>
        `;
    });
    
    carrinhoItems.innerHTML = html;
}

// Renderizar resumo do carrinho (MODIFICADO)
function renderizarResumo(carrinho) {
    const subtotal = carrinho.reduce((total, item) => total + (item.preco * item.quantidade), 0);
    
    carrinhoResumo.innerHTML = `
        <div class="cliente-info">
            <h3>
                <i class="fas fa-user-circle" style="color: var(--primary-color);"></i>
                Identificação
            </h3>
            <input type="text" 
                id="nome-cliente" 
                class="campo-nome" 
                placeholder="Digite seu nome completo *" 
                value="${nomeCliente}"
                onkeyup="validarNomeCliente()"
                onblur="validarNomeCliente()">
            <div class="mensagem-erro" id="erro-nome">
                <i class="fas fa-exclamation-circle"></i>
                Por favor, digite seu nome para finalizar o pedido
            </div>
        </div>
        <h2>Resumo do Pedido</h2>
        <div class="resumo-linha">
            <span>Subtotal:</span>
            <span>R$ ${subtotal.toFixed(2)}</span>
        </div>
        <div class="resumo-linha resumo-total">
            <span>Total:</span>
            <span>R$ ${subtotal.toFixed(2)}</span>
        </div>
        <button class="btn-finalizar" onclick="finalizarCompra()" id="btn-finalizar" disabled>
            <i class="fab fa-whatsapp"></i> Finalizar Pedido
        </button>
        <button class="btn-limpar" onclick="limparCarrinho()">
            <i class="fas fa-trash"></i> Limpar Carrinho
        </button>
    `;
    
    // Verificar se já tem nome salvo para habilitar botão
    if (nomeCliente.trim().length >= 3) {
        document.getElementById('btn-finalizar').disabled = false;
    }
}

// NOVA FUNÇÃO: Validar nome do cliente
window.validarNomeCliente = () => {
    const inputNome = document.getElementById('nome-cliente');
    const erroNome = document.getElementById('erro-nome');
    const btnFinalizar = document.getElementById('btn-finalizar');
    
    nomeCliente = inputNome.value.trim();
    
    if (nomeCliente.length < 3) {
        inputNome.classList.add('error');
        erroNome.classList.add('mostrar');
        btnFinalizar.disabled = true;
        return false;
    } else {
        inputNome.classList.remove('error');
        erroNome.classList.remove('mostrar');
        btnFinalizar.disabled = false;
        
        // Salvar nome temporariamente para não perder se renderizar novamente
        sessionStorage.setItem('nomeClienteTemp', nomeCliente);
        return true;
    }
};

// Alterar quantidade de um item
function alterarQuantidade(produtoId, delta) {
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    const itemIndex = carrinho.findIndex(item => item.id === produtoId);
    
    if (itemIndex !== -1) {
        const novaQuantidade = carrinho[itemIndex].quantidade + delta;
        
        // ALTERAÇÃO AQUI: Só permite diminuir até 1, nunca remove
        if (novaQuantidade >= 1) {
            carrinho[itemIndex].quantidade = novaQuantidade;
            
            localStorage.setItem('carrinho', JSON.stringify(carrinho));
            renderizarCarrinho();
            
            // Atualizar contador em todas as abas
            atualizarContadoresGlobalmente();
        }
        // Se tentar diminuir abaixo de 1, simplesmente não faz nada
    }
}

// Função removerItem
function removerItem(produtoId) {
    let carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    carrinho = carrinho.filter(item => item.id !== produtoId); // Agora compara string com string
    localStorage.setItem('carrinho', JSON.stringify(carrinho));
    renderizarCarrinho();
    
    // Atualizar contador em todas as abas
    atualizarContadoresGlobalmente();
}

// NOVA FUNÇÃO - Atualizar contadores em todas as páginas
function atualizarContadoresGlobalmente() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    const totalItens = carrinho.reduce((total, item) => total + item.quantidade, 0);
    
    // Atualizar todos os elementos com id 'carrinho-count' na página atual
    const contadores = document.querySelectorAll('#carrinho-count');
    contadores.forEach(el => {
        if (el) el.textContent = totalItens;
    });
    
    // Disparar evento personalizado para outras abas
    localStorage.setItem('carrinho-update', Date.now().toString());
}

// Ouvir mudanças em outras abas
window.addEventListener('storage', (e) => {
    if (e.key === 'carrinho' || e.key === 'carrinho-update') {
        renderizarCarrinho();
    }
});

// Limpar carrinho completamente
function limparCarrinho() {
    if (confirm('Tem certeza que deseja limpar todo o carrinho?')) {
        localStorage.removeItem('carrinho');
        renderizarCarrinho();
    }
}

// Finalizar compra via WhatsApp
async function finalizarCompra() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    if (carrinho.length === 0) return alert('Carrinho vazio!');
    
    // VALIDAÇÃO DO NOME
    const nomeInput = document.getElementById('nome-cliente');
    if (!nomeInput) {
        // Se o input não existir (caso raro), tenta pegar da sessionStorage
        nomeCliente = sessionStorage.getItem('nomeClienteTemp') || '';
    } else {
        nomeCliente = nomeInput.value.trim();
    }
    
    if (nomeCliente.length < 3) {
        alert('Por favor, digite seu nome completo para finalizar o pedido.');
        if (nomeInput) {
            nomeInput.focus();
            nomeInput.classList.add('error');
        }
        return;
    }

    try {
        const { initializeApp } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js");
        const { getDatabase, ref, set } = await import("https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js");

        const firebaseConfig = {
            apiKey: "AIzaSyAGEHEzJhbtXMP9HVc6S05wtFeunZqsPn8",
            authDomain: "k101-ab869.firebaseapp.com",
            projectId: "k101-ab869",
            databaseURL: "https://k101-ab869-default-rtdb.firebaseio.com", 
            storageBucket: "k101-ab869.firebasestorage.app",
            messagingSenderId: "480248062348",
            appId: "1:480248062348:web:366525d09ff5b8417e76a9"
        };

        const app = initializeApp(firebaseConfig);
        const db = getDatabase(app);

        const idPedido = Math.random().toString(36).substr(2, 4).toUpperCase();

        // CORREÇÃO: Mapear os itens e garantir que não haja undefined
        const itensParaSalvar = carrinho.map(item => {
            // Criar objeto base com campos obrigatórios
            const itemBase = {
                id: item.id || Date.now().toString(),
                nome: item.nome || 'Produto',
                preco: Number(item.preco) || 0,
                quantidade: Number(item.quantidade) || 1,
                tipo: item.tipo || 'padrao',
                paginaOrigem: item.paginaOrigem || determinarPaginaOrigem(item),
                temSVG: !!(item.svgRaw && typeof item.svgRaw === 'string' && item.svgRaw !== 'undefined')
            };

            // Adicionar campos opcionais APENAS se existirem e não forem undefined
            if (item.texto) itemBase.texto = item.texto;
            if (item.cor) itemBase.cor = item.cor;
            if (item.imagem) itemBase.imagem = item.imagem;
            
            // Só adicionar svgRaw se existir e NÃO for undefined
            if (item.svgRaw && typeof item.svgRaw === 'string' && item.svgRaw !== 'undefined') {
                itemBase.svgRaw = item.svgRaw;
            }
            
            // Adicionar especificações adicionais se existirem
            if (item.especificacoes) itemBase.especificacoes = item.especificacoes;

            return itemBase;
        });

        // Verificar se todos os itens são válidos
        console.log('Itens para salvar:', itensParaSalvar);

        // Salva todos os itens do carrinho no Firebase (AGORA COM NOME DO CLIENTE)
        await set(ref(db, 'PEDIDOS/' + idPedido), {
            id: idPedido,
            data: new Date().toISOString(),
            cliente: {
                nome: nomeCliente,
                // Reservado para futuras informações do cliente
                telefone: '', // Pode ser adicionado depois
                email: ''     // Pode ser adicionado depois
            },
            itens: itensParaSalvar,
            status: 'Pendente',
            total: carrinho.reduce((total, item) => total + (Number(item.preco) * Number(item.quantidade)), 0)
        });

        // CONSTRUIR MENSAGEM DO WHATSAPP (AGORA COM NOME DO CLIENTE)
        let mensagem = `🧾 *PEDIDO: ${idPedido}*\n`;
        mensagem += `👤 *Cliente: ${nomeCliente}*\n`; // Nome do cliente na mensagem
        mensagem += `----------------------------\n`;

        // Iterar sobre cada item do carrinho
        carrinho.forEach((item, index) => {
            // Determinar o tipo de produto para formatação específica
            const tipoProduto = determinarTipoProduto(item);
            
            // Nome do item (sempre presente)
            mensagem += `\n*- [ ${item.nome} ]*\n`;
            
            // Quantidade e preço base (sempre presentes)
            mensagem += `Qtd: ${item.quantidade}x\n`;
            mensagem += `Preço unit: R$ ${Number(item.preco).toFixed(2)}\n`;
            mensagem += `Subtotal: R$ ${(Number(item.preco) * Number(item.quantidade)).toFixed(2)}\n`;
            
            // Informações específicas baseadas no tipo de produto
            switch(tipoProduto) {
                case 'adesivo-personalizado':
                    if (item.tipo) mensagem += `Material: ${item.tipo}\n`;
                    if (item.cor) mensagem += `Cor: ${item.cor}\n`;
                    if (item.texto) mensagem += `Texto: "${item.texto}"\n`;
                    break;
                    
                case 'adesivo-normal':
                    // Adesivo normal (sem personalização)
                    break;
                    
                case 'produto-futuro-a':
                    mensagem += `Especificação futura A\n`;
                    break;
                    
                case 'produto-futuro-b':
                    mensagem += `Especificação futura B\n`;
                    break;
                    
                default:
                    if (item.especificacoes) {
                        Object.entries(item.especificacoes).forEach(([key, value]) => {
                            mensagem += `└ ${key}: ${value}\n`;
                        });
                    }
            }
        });

        // TOTAL DO PEDIDO
        mensagem += `\n----------------------------\n`;
        mensagem += `✔️ *TOTAL DO PEDIDO: R$ ${carrinho.reduce((total, item) => total + (Number(item.preco) * Number(item.quantidade)), 0).toFixed(2)}*\n`;

        // Abrir WhatsApp
        window.open(`https://wa.me/${NUMERO_WHATSAPP}?text=${encodeURIComponent(mensagem)}`, '_blank');
        
        // Limpar carrinho e sessionStorage
        localStorage.removeItem('carrinho');
        sessionStorage.removeItem('nomeClienteTemp');
        renderizarCarrinho();
        atualizarContadoresGlobalmente();
        
        // Mostrar mensagem de sucesso antes de redirecionar
        alert(`✅ Pedido enviado com sucesso, ${nomeCliente}! Você será redirecionado para a página inicial.`);
        
        setTimeout(() => {
            window.location.href = 'nav.html';
        }, 2000);

    } catch (e) {
        console.error("Erro ao salvar pedido:", e);
        alert('Erro ao processar pedido. Verifique o console (F12) para mais detalhes.');
    }
}

// Função auxiliar para determinar o tipo de produto baseado nas propriedades
function determinarTipoProduto(item) {
    // Se tem svgRaw, provavelmente é adesivo personalizado
    if (item.svgRaw && typeof item.svgRaw === 'string') {
        return 'adesivo-personalizado';
    }
    
    // Se é adesivo mas sem personalização
    if (item.nome && item.nome.toLowerCase().includes('adesivo') && !item.svgRaw) {
        return 'adesivo-normal';
    }
    
    // Verificar pela página de origem
    if (item.paginaOrigem === 'nome.html') return 'adesivo-personalizado';
    
    // Você pode adicionar mais condições conforme criar novas páginas
    // if (item.paginaOrigem === 'canecas.html') return 'produto-futuro-a';
    // if (item.paginaOrigem === 'camisetas.html') return 'produto-futuro-b';
    
    // Se não se encaixar em nenhuma categoria específica
    return 'produto-generico';
}

// Função auxiliar para determinar página de origem (fallback)
function determinarPaginaOrigem(item) {
    if (item.svgRaw) return 'nome.html';
    if (item.nome && item.nome.toLowerCase().includes('adesivo')) return 'produtos.html';
    return 'desconhecida';
}