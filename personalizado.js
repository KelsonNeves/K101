// personalizado.js

// ===== CONFIGURAÇÕES PERSONALIZÁVEIS =====
// Altere estas listas para adicionar/remover opções

const CORES_DISPONIVEIS = [
    { nome: 'Vermelho', codigo: '#FF0000' },
    { nome: 'Azul', codigo: '#0000FF' },
    { nome: 'Verde', codigo: '#00FF00' },
    { nome: 'Amarelo', codigo: '#FFFF00' },
    { nome: 'Roxo', codigo: '#800080' },
    { nome: 'Laranja', codigo: '#FFA500' },
    { nome: 'Rosa', codigo: '#FFC0CB' },
    { nome: 'Preto', codigo: '#000000' },
    { nome: 'Branco', codigo: '#FFFFFF' },
    { nome: 'Vinho', codigo: '#800000' }
];

// Mapeamento das fontes (o nome amigável e o caminho para o arquivo na pasta edicao/fontes/)
const FONTES_DISPONIVEIS = [
    { nome: 'Padrão', arquivo: 'Arial, sans-serif' }, // Fallback para fonte do sistema
    { nome: 'Personalizada 1', arquivo: 'url("edicao/fontes/Mostwasted.ttf")' },
    { nome: 'Personalizada 2', arquivo: 'url("edicao/fontes/OCR-B 10 BT.ttf")' },
    { nome: 'Personalizada 3', arquivo: 'url("edicao/fontes/revue-bold.ttf")' },
    // Adicione mais fontes aqui. O formato é: { nome: 'Nome da Fonte', arquivo: 'url("caminho/para/fonte.ext")' }
];

const ICONES_DISPONIVEIS = [
    { nome: '@ Padrão', arquivo: 'edicao/icones/icone_1.svg' },
    { nome: 'Câmera', arquivo: 'edicao/icones/icone_2.svg' },
    // Adicione mais ícones SVG aqui
];
// ==========================================

// Elementos do DOM
const previaElement = document.getElementById('previa-adesivo');
const tipoBtns = document.querySelectorAll('.tipo-btn');
const controleIcone = document.getElementById('controle-icone');
const textoInput = document.getElementById('texto-adesivo');
 const corContainer = document.getElementById('selecao-cor');
const fonteContainer = document.getElementById('selecao-fonte');
const iconeContainer = document.getElementById('selecao-icone');
const fundoCheckbox = document.getElementById('fundo-adesivo');

// Estado atual da personalização
let tipoSelecionado = 'nome';
let corSelecionada = CORES_DISPONIVEIS[0]; // Padrão: primeira cor
let fonteSelecionada = FONTES_DISPONIVEIS[0]; // Padrão: primeira fonte
let iconeSelecionado = ICONES_DISPONIVEIS[0]; // Padrão: primeiro ícone
let textoAtual = '@exemplo';
let fundoAtivo = false;

// Inicialização
document.addEventListener('DOMContentLoaded', () => {
    inicializarOpcoes();
    configurarEventListeners();
    atualizarPrevia();
    atualizarContadorCarrinho(); // Para o ícone do carrinho no header
});

// Carrega as opções (cores, fontes, ícones) nos controles
function inicializarOpcoes() {
    // Cores
    CORES_DISPONIVEIS.forEach((cor, index) => {
        const corDiv = document.createElement('div');
        corDiv.className = `cor-opcao ${index === 0 ? 'selecionada' : ''}`;
        corDiv.style.backgroundColor = cor.codigo;
        corDiv.dataset.cor = cor.codigo;
        corDiv.dataset.nome = cor.nome;
        corDiv.title = cor.nome;
        corContainer.appendChild(corDiv);
    });

    // Fontes (carrega as fontes personalizadas)
    FONTES_DISPONIVEIS.forEach((fonte, index) => {
        // Se for uma fonte personalizada (não é a padrão), cria uma regra de estilo
        if (fonte.arquivo.startsWith('url(')) {
            const fontFace = `
                @font-face {
                    font-family: '${fonte.nome}';
                    src: ${fonte.arquivo};
                }
            `;
            // Adiciona a regra @font-face ao documento
            const style = document.createElement('style');
            style.textContent = fontFace;
            document.head.appendChild(style);
        }

        const fonteBtn = document.createElement('button');
        fonteBtn.className = `fonte-opcao ${index === 0 ? 'selecionada' : ''}`;
        fonteBtn.textContent = fonte.nome;
        fonteBtn.dataset.fonte = fonte.arquivo.startsWith('url(') ? fonte.nome : 'Arial, sans-serif'; // Usa o nome da família se for personalizada
        fonteBtn.dataset.nome = fonte.nome;
        fonteBtn.style.fontFamily = fonte.arquivo.startsWith('url(') ? fonte.nome : 'Arial, sans-serif';
        fonteContainer.appendChild(fonteBtn);
    });

    // Ícones SVG
    ICONES_DISPONIVEIS.forEach((icone, index) => {
        const iconeDiv = document.createElement('div');
        iconeDiv.className = `icone-opcao ${index === 0 ? 'selecionada' : ''}`;
        iconeDiv.dataset.icone = icone.arquivo;
        iconeDiv.dataset.nome = icone.nome;

        // Carrega o SVG (simplificado - apenas mostra uma prévia, mas no adesivo final podemos usar a string)
        fetch(icone.arquivo)
            .then(response => response.text())
            .then(svgText => {
                iconeDiv.innerHTML = svgText;
            })
            .catch(() => {
                iconeDiv.textContent = icone.nome; // Fallback
            });

        iconeContainer.appendChild(iconeDiv);
    });
}

// Configura os ouvintes de eventos
function configurarEventListeners() {
    // Tipo de adesivo
    tipoBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            tipoBtns.forEach(b => b.classList.remove('ativo'));
            btn.classList.add('ativo');
            tipoSelecionado = btn.dataset.tipo;
            
            // Mostra/esconde controle de ícone e ajusta placeholder
            if (tipoSelecionado === 'instagram') {
                controleIcone.style.display = 'block';
                textoInput.placeholder = 'Digite seu @...';
                if (!textoInput.value.startsWith('@')) {
                    textoInput.value = '@' + textoInput.value.replace('@', '');
                }
            } else {
                controleIcone.style.display = 'none';
                textoInput.placeholder = 'Digite o nome...';
                textoInput.value = textoInput.value.replace('@', '');
            }
            atualizarPrevia();
        });
    });

    // Texto
    textoInput.addEventListener('input', (e) => {
        let valor = e.target.value;
        if (tipoSelecionado === 'instagram' && !valor.startsWith('@')) {
            valor = '@' + valor;
            textoInput.value = valor;
        }
        textoAtual = valor || (tipoSelecionado === 'instagram' ? '@' : '');
        atualizarPrevia();
    });

    // Cor
    corContainer.addEventListener('click', (e) => {
        const corDiv = e.target.closest('.cor-opcao');
        if (!corDiv) return;

        document.querySelectorAll('.cor-opcao').forEach(c => c.classList.remove('selecionada'));
        corDiv.classList.add('selecionada');
        corSelecionada = {
            nome: corDiv.dataset.nome,
            codigo: corDiv.dataset.cor
        };
        atualizarPrevia();
    });

    // Fonte
    fonteContainer.addEventListener('click', (e) => {
        const fonteBtn = e.target.closest('.fonte-opcao');
        if (!fonteBtn) return;

        document.querySelectorAll('.fonte-opcao').forEach(f => f.classList.remove('selecionada'));
        fonteBtn.classList.add('selecionada');
        
        const fonteNome = fonteBtn.dataset.nome;
        fonteSelecionada = FONTES_DISPONIVEIS.find(f => f.nome === fonteNome);
        atualizarPrevia();
    });

    // Ícone
    iconeContainer.addEventListener('click', (e) => {
        const iconeDiv = e.target.closest('.icone-opcao');
        if (!iconeDiv) return;

        document.querySelectorAll('.icone-opcao').forEach(i => i.classList.remove('selecionada'));
        iconeDiv.classList.add('selecionada');
        
        const iconeNome = iconeDiv.dataset.nome;
        iconeSelecionado = ICONES_DISPONIVEIS.find(i => i.nome === iconeNome);
        atualizarPrevia();
    });

    // Fundo
    fundoCheckbox.addEventListener('change', (e) => {
        fundoAtivo = e.target.checked;
        atualizarPrevia();
    });

    // Adicionar ao carrinho
    document.getElementById('adicionar-carrinho-personalizado').addEventListener('click', adicionarAoCarrinho);
}

// Atualiza a pré-visualização em tempo real
function atualizarPrevia() {
    if (!previaElement) return;

    let textoExibido = textoAtual;
    
    // Para o tipo Instagram, podemos colocar o ícone antes do texto
    if (tipoSelecionado === 'instagram') {
        // Por enquanto, apenas o texto. A implementação completa do ícone na prévia é mais complexa.
        // Podemos criar um elemento <span> para o ícone e outro para o texto.
        // Para simplificar, usaremos apenas o texto, mas você pode evoluir isso.
        previaElement.innerHTML = textoExibido; 
    } else {
        previaElement.innerHTML = textoExibido;
    }

    // Aplica a cor
    previaElement.style.color = corSelecionada.codigo;

    // Aplica a fonte
    if (fonteSelecionada.arquivo.startsWith('url(')) {
        // Se for uma fonte personalizada que carregamos com @font-face, usamos o nome da família
        previaElement.style.fontFamily = `'${fonteSelecionada.nome}', Arial, sans-serif`;
    } else {
        previaElement.style.fontFamily = fonteSelecionada.arquivo;
    }

    // Aplica o fundo (borda)
    if (fundoAtivo) {
        previaElement.classList.add('com-fundo');
        // A cor do fundo pode ser preta, mas você pode personalizar
        previaElement.style.backgroundColor = 'black';
        previaElement.style.color = corSelecionada.codigo; // Mantém a cor do texto
        previaElement.style.padding = '0.5rem 1.5rem';
        previaElement.style.filter = 'none';
    } else {
        previaElement.classList.remove('com-fundo');
        previaElement.style.backgroundColor = 'transparent';
        previaElement.style.padding = '0.5rem 1.5rem'; // Mantém padding para a sombra
        // Simula a borda com sombra (para efeito de recorte)
        previaElement.style.filter = 'drop-shadow(0 0 0 3px black)';
    }
}

// Adiciona o produto personalizado ao carrinho
function adicionarAoCarrinho() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];

    // Criar um nome descritivo para o produto
    const nomePersonalizado = `Adesivo Personalizado: ${textoAtual} (${tipoSelecionado === 'instagram' ? 'Instagram' : 'Nome'})`;

    // Preço fixo para personalizados (você pode ajustar ou buscar de algum lugar)
    const precoPersonalizado = 10.00;

    const novoItem = {
        id: `personalizado-${Date.now()}`, // ID único
        nome: nomePersonalizado,
        preco: precoPersonalizado,
        imagem: '', // Sem imagem por enquanto
        quantidade: 1,
        // Salvar as configurações para referência futura
        configuracao: {
            tipo: tipoSelecionado,
            texto: textoAtual,
            cor: corSelecionada,
            fonte: fonteSelecionada,
            icone: iconeSelecionado,
            fundo: fundoAtivo
        }
    };

    carrinho.push(novoItem);
    localStorage.setItem('carrinho', JSON.stringify(carrinho));

    mostrarNotificacao('✅ Adesivo personalizado adicionado ao carrinho!');
    atualizarContadorCarrinho();
}

// Funções auxiliares (copiadas do script.js para funcionar aqui)
function atualizarContadorCarrinho() {
    const carrinho = JSON.parse(localStorage.getItem('carrinho')) || [];
    const totalItens = carrinho.reduce((total, item) => total + item.quantidade, 0);
    
    const carrinhoCount = document.getElementById('carrinho-count');
    if (carrinhoCount) {
        carrinhoCount.textContent = totalItens;
    }
}

function mostrarNotificacao(mensagem) {
    const notificacao = document.getElementById('notificacao');
    if (!notificacao) return;

    notificacao.textContent = mensagem;
    notificacao.classList.add('mostrar');
    
    setTimeout(() => {
        notificacao.classList.remove('mostrar');
    }, 2000);
}