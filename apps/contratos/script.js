// Estado global da aplicação
let db = {
    contratos: []
};
// Variáveis do formulário de contrato
let currentFormStep = 1;
let tempContratoData = {};
let acaoConfirmada = null;

// --- Funções de Formatação ---

function formatCurrency(value) {
    if (typeof value !== 'number') {
        value = parseFloat(value) || 0;
    }
    
    // Detecta se o número tem mais de 2 casas decimais e ajusta a formatação
    const s = String(value);
    const p = s.indexOf('.');
    const decimals = (p !== -1 && s.length - p - 1 > 2) ? 3 : 2;

    return value.toLocaleString('pt-BR', { 
        style: 'currency', 
        currency: 'BRL',
        minimumFractionDigits: decimals,
        maximumFractionDigits: 3 // Permite até 3
    });
}

function formatDate(dateString) {
    if (!dateString) return 'N/D';
    // Adiciona checagem para datas que já possam estar formatadas
    if (dateString.includes('/')) return dateString;
    
    const parts = dateString.split('-');
    if (parts.length !== 3) return dateString; // Retorna original se formato inesperado
    
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
}

function parseDate(dateString) { // Formato DD/MM/YYYY -> YYYY-MM-DD
    if (!dateString || !dateString.includes('/')) return dateString;
    const [day, month, year] = dateString.split('/');
    return `${year}-${month}-${day}`;
}

// --- FUNÇÃO DE COR PARA GRÁFICOS ---
function getItemColor(descricao) {
    const desc = descricao.toLowerCase();
    if (desc.includes('emissão') || desc.includes('cnd')) {
        return '#f97316'; // Laranja (ex: Emissão CND)
    }
    if (desc.includes('faixa 1')) {
        return '#22c55e'; // Verde (ex: Consulta Faixa 1)
    }
    if (desc.includes('faixa 2')) {
        return '#3b82f6'; // Azul (ex: Consulta Faixa 2)
    }
    return '#6b7280'; // Cinza (para outros)
}

// Formata input como BRL (1.000,00)
function formatInputAsBRL(e) {
    let value = e.target.value.replace(/\D/g, ''); // Remove não-numéricos
    if (value.length === 0) {
        e.target.value = '';
        return;
    }
    
    value = value.padStart(3, '0');
    
    let cents = value.slice(-2);
    let reais = value.slice(0, -2);
    
    reais = reais.replace(/^0+/, '') || '0';
    reais = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    e.target.value = `${reais},${cents}`;
}

// Formata input como BRL com 3 casas decimais (ex: 1.000,000)
function formatInputAsBRL_3dec(e) {
    let value = e.target.value.replace(/\D/g, '');
    if (value.length === 0) {
        e.target.value = '';
        return;
    }
    
    value = value.padStart(4, '0');
    
    let cents = value.slice(-3); // Pega os 3 últimos dígitos
    let reais = value.slice(0, -3); // Pega o resto
    
    reais = reais.replace(/^0+/, '') || '0';
    reais = reais.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    
    e.target.value = `${reais},${cents}`;
}

// Converte BRL formatado para número (float)
function parseBRL(value) {
    if (typeof value !== 'string' || value.length === 0) return 0;
    return parseFloat(value.replace(/\./g, '').replace(',', '.')) || 0;
}

// Capitaliza a primeira letra de cada palavra
function capitalizeWords(str) {
    if (typeof str !== 'string') return '';
    const exceptions = ['de', 'da', 'do', 'dos', 'das'];
    return str.toLowerCase().split(' ').map(word => {
        if (exceptions.includes(word)) {
            return word;
        }
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
}

// Formata o input para capitalizar
function formatInputAsCapitalized(e) {
    const start = e.target.selectionStart;
    const end = e.target.selectionEnd;
    e.target.value = capitalizeWords(e.target.value);
    e.target.setSelectionRange(start, end); // Preserva posição do cursor
}

// Reseta o estado visual do formulário (para Novo/Editar/Aditivo)
function resetarFormularioContrato() {
    document.getElementById('form-contrato').reset();

    // Limpa IDs de controle
    document.getElementById('contrato-id').value = '';
    document.getElementById('contrato-parentId').value = '';

    // Reseta o stepper
    document.getElementById('stepper-contrato').style.display = 'flex';

    // Oculta seção de aditivo
    const fieldsetAditivo = document.getElementById('fieldset-aditivo');
    fieldsetAditivo.style.display = 'none';
    fieldsetAditivo.querySelectorAll('select, input').forEach(el => {
        el.removeAttribute('required');
    });

    // Reseta labels
    document.getElementById('label-valor-total').textContent = 'Valor Total (R$)';
    document.getElementById('label-data-fim').textContent = 'Data Fim';
    
    // Oculta as seções dinâmicas do aditivo
    document.getElementById('aditivo-valor-fields').style.display = 'none';
    document.getElementById('aditivo-prazo-fields').style.display = 'none';
    document.getElementById('aditivo-gestor-fiscal-fields').style.display = 'none';
    
    // Limpa container de fiscais
    document.getElementById('fiscais-container').innerHTML = '';


    // Limpa dados temporários
    tempContratoData = { unidade: {}, empresa: {} };


    // Limpa links dos processos
    document.getElementById('contrato-link-sei').value = '';
    document.getElementById('aditivo-link-sei').value = '';

    // Reseta dropdown de aditivo (para o Termo de Cooperação)
    const aditivoTipoSelect = document.getElementById('aditivo-tipo');
    Array.from(aditivoTipoSelect.options).forEach(option => {
        option.style.display = 'block';
    });
}

// --- NOVA FUNÇÃO PARA RENDERIZAR GRÁFICO DETALHADO ---
function atualizarGraficoDetalhado(pagamentos) {
    const container = document.getElementById('container-grafico-detalhado');
    const filtroAnoVal = document.getElementById('filtro-ano').value;
    const filtroMesVal = document.getElementById('filtro-mes').value;

    if (!container) return;

    // --- LÓGICA DE DADOS (Semelhante à anterior) ---

    // 1. Encontra todos os itens únicos primeiro
    const itensMasterSet = new Set();
    pagamentos.forEach(p => {
        if (p.detalhes) {
            p.detalhes.forEach(item => itensMasterSet.add(item.descricao || 'Item não descrito'));
        }
    });
    // Ordena para que a legenda seja consistente
    const itensMasterList = [...itensMasterSet].sort(); 

    // 2. Processa os dados com base nos filtros
    const dadosItens = {}; // Para o gráfico de Mês Específico
    const dadosMensais = {}; // Para o gráfico de Linha Anual

    let totalMesEspecifico = 0;
    let maxValorItemIndividual = 0; // Para escalar o eixo Y do gráfico de linha

    // Inicializa os 12 meses com todos os itens zerados
    for (let i = 0; i < 12; i++) { // 0 = Jan, 11 = Dez
        dadosMensais[i] = {};
        itensMasterList.forEach(desc => dadosMensais[i][desc] = 0);
    }

    pagamentos.forEach(p => {
        if (!p.periodoAte || !p.detalhes) return;
        
        const dataCompetencia = new Date(p.periodoAte + "T00:00:00");
        const ano = dataCompetencia.getFullYear().toString();
        const mes = dataCompetencia.getMonth(); // 0-11

        // Filtra por ANO
        if (filtroAnoVal === 'todos' || ano === filtroAnoVal) {
            
            p.detalhes.forEach(item => {
                const qtd = parseFloat(item.quantidade) || 0;
                const valUnit = parseFloat(item.valorUnitario) || 0;
                const valorTotalItem = qtd * valUnit;
                const desc = item.descricao || 'Item não descrito';

                // Acumula para o gráfico MENSAL (de Linha)
                dadosMensais[mes][desc] = (dadosMensais[mes][desc] || 0) + valorTotalItem;
                
                // Encontra o novo valor máximo para a escala do eixo Y
                if (dadosMensais[mes][desc] > maxValorItemIndividual) {
                    maxValorItemIndividual = dadosMensais[mes][desc];
                }

                // Acumula para o gráfico de ITENS (se filtro de MÊS específico)
                if (filtroMesVal !== 'todos' && mes.toString() === filtroMesVal) {
                    dadosItens[desc] = (dadosItens[desc] || 0) + valorTotalItem;
                    totalMesEspecifico += valorTotalItem;
                }
            });
        }
    });

    // --- LÓGICA DE RENDERIZAÇÃO ATUALIZADA ---
    let html = '';

    if (filtroMesVal !== 'todos') {
        // --- GRÁFICO 2: BARRAS SIMPLES POR ITEM (Mês específico) ---
        // (Esta parte não muda)
        html = '<div class="space-y-2 p-2">';
        const itensOrdenados = Object.keys(dadosItens).sort((a, b) => dadosItens[b] - dadosItens[a]);
        
        if (itensOrdenados.length === 0) {
            html = '<div class="text-gray-500 text-center p-4">Sem dados detalhados para este mês.</div>';
        } else {
            itensOrdenados.forEach(desc => {
                const valor = dadosItens[desc];
                const perc = (totalMesEspecifico > 0) ? (valor / totalMesEspecifico) * 100 : 0;
                const cor = getItemColor(desc);
                
                html += `
                    <div class="flex items-center" title="${desc}: ${formatCurrency(valor)}">
                        <span class="text-xs text-gray-700 w-24 truncate" style="color: ${cor}">${desc}</span>
                        <div class="flex-1 bg-gray-200 rounded-full h-5 ml-2">
                            <div class="h-5 rounded-full flex items-center px-2" style="width: ${perc}%; background-color: ${cor}">
                                <span class="text-xs font-bold text-white">${formatCurrency(valor)}</span>
                            </div>
                        </div>
                    </div>`;
            });
        }
        html += '</div>';

    } else {
        // --- GRÁFICO 1: GRÁFICO DE LINHA SVG (Ano inteiro) ---
        
        // 1. Criar a Legenda primeiro
        html = '<div class="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-3">';
        itensMasterList.forEach(desc => {
            // Só mostra na legenda se o item tiver algum valor no ano
            const temValorNoAno = Object.keys(dadosMensais).some(mes => dadosMensais[mes][desc] > 0);
            if (temValorNoAno) {
                html += `
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-1" style="background-color: ${getItemColor(desc)}"></div>
                        <span class="text-xs text-gray-700">${desc}</span>
                    </div>
                `;
            }
        });
        html += '</div>';

        // 2. Criar o Gráfico de Linha SVG
        const svgHeight = 150; // Altura do canvas SVG
        const svgWidth = 500;  // Largura (para cálculo de precisão)
        const pX = 20; // Padding X (para labels)
        const pY = 10; // Padding Y (para pico)
        const chartWidth = svgWidth - (pX * 2);
        const chartHeight = svgHeight - (pY * 2);

        let polylines = ''; // Onde as linhas <polyline> serão armazenadas
        
        // Cria uma <polyline> para cada item
        itensMasterList.forEach(desc => {
            let points = ''; // String de pontos "x1,y1 x2,y2..."
            for (let i = 0; i < 12; i++) { // 0 = Jan, 11 = Dez
                const valorItem = dadosMensais[i][desc] || 0;
                
                // Calcula Coordenada X (12 pontos no eixo X)
                const x = pX + (i * (chartWidth / 11)); 
                
                // Calcula Coordenada Y (Eixo Y é invertido no SVG, 0 é o topo)
                let y = pY + chartHeight; // Ponto base (fundo do gráfico)
                if (maxValorItemIndividual > 0) {
                    y = pY + (chartHeight - (valorItem / maxValorItemIndividual) * chartHeight);
                }
                
                points += `${x},${y} `;
            }
            
            // Adiciona a linha (polyline) ao SVG
            polylines += `
                <polyline fill="none" 
                          stroke="${getItemColor(desc)}" 
                          stroke-width="3" 
                          points="${points.trim()}" />
            `;
        });
        
        // Adiciona labels dos meses (Jan, Fev...) abaixo do gráfico
        let monthLabels = '';
        const nomesMeses = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
        for (let i = 0; i < 12; i++) {
            const x = pX + (i * (chartWidth / 11));
            // y = altura do SVG + 15px de margem
            monthLabels += `<text x="${x}" y="${svgHeight + 15}" text-anchor="middle" font-size="12" fill="#6b7280">${nomesMeses[i]}</text>`;
        }
        
        // Adiciona linhas de grade horizontais (Ex: 0%, 50%, 100%)
        let gridLines = '';
        for (let i = 0; i <= 2; i++) { // 0, 1, 2
             const y = pY + (i * (chartHeight / 2));
             gridLines += `<line x1="${pX}" y1="${y}" x2="${pX + chartWidth}" y2="${y}" stroke="#e5e7eb" stroke-width="1" />`;
             // Adiciona o label do eixo Y
             const valorLabel = maxValorItemIndividual * (1 - (i/2));
             if (i < 2) { // Não mostra o label do 0
                 gridLines += `<text x="${pX - 5}" y="${y + 3}" text-anchor="end" font-size="10" fill="#9ca3af">${formatCurrency(valorLabel)}</text>`;
             }
        }

        // Monta o SVG final
        html += `
            <div class="w-full overflow-x-auto">
                <svg width="100%" height="${svgHeight + 20}" viewBox="0 0 ${svgWidth} ${svgHeight + 20}">
                    ${gridLines}
                    ${polylines}
                    ${monthLabels}
                </svg>
            </div>`;
    }
    
    container.innerHTML = html;
}


// Preenche o formulário com dados de um contrato existente
function preencherFormularioContrato(contrato) {
    // Etapa 1
    document.getElementById('unidade-nome').value = contrato.unidade.nome;
    document.getElementById('unidade-cnpj').value = contrato.unidade.cnpj;
    document.getElementById('unidade-endereco').value = contrato.unidade.endereco;
    document.getElementById('unidade-rep').value = contrato.unidade.rep;
    // Etapa 2
    document.getElementById('empresa-nome').value = contrato.empresa.nome;
    document.getElementById('empresa-cnpj').value = contrato.empresa.cnpj;
    document.getElementById('empresa-endereco').value = contrato.empresa.endereco;
    document.getElementById('empresa-rep').value = contrato.empresa.rep;
    
    // Etapa 3 - Dados Principais (que não mudam com aditivo)
    document.getElementById('contrato-processo-sei').value = contrato.processoSei;
    document.getElementById('contrato-numero').value = contrato.numeroContrato;
    document.getElementById('contrato-tipo').value = contrato.tipoContrato;
    document.getElementById('contrato-objeto').value = contrato.objeto;
    document.getElementById('contrato-tempo').value = contrato.tempoContrato;
    document.getElementById('contrato-data-assinatura').value = contrato.dataAssinatura;
    document.getElementById('contrato-data-inicio').value = contrato.dataInicio;
    document.getElementById('contrato-link-sei').value = contrato.linkSei || '';
    
    // Formata os campos de moeda
    // ATENÇÃO: Os campos valorTotal e dataFim estão no formulário de aditivo
    // Mas no modo "Editar", eles representam o valor *original*
    // A lógica de `saveStepData` e `salvarContrato` cuida disso.
    document.getElementById('contrato-valor-total').value = (contrato.valorTotal || 0).toString().replace('.', ',');
    formatInputAsBRL({ target: document.getElementById('contrato-valor-total') }); 
    
    document.getElementById('contrato-data-fim').value = contrato.dataFim;
    
    document.getElementById('contrato-estimativa-mensal').value = (contrato.estimativaMensal || 0).toString().replace('.', ',');
    formatInputAsBRL({ target: document.getElementById('contrato-estimativa-mensal') }); 

    // Salva os dados no objeto temporário
    saveStepData(1);
    saveStepData(2);
    saveStepData(3);
}

// Função central para abrir o modal de contrato (Novo, Editar, Aditivo)
function abrirModalContratoForm(modo, contratoId) { // contratoId pode ser o Pai ou o Aditivo
    resetarFormularioContrato();

    if (modo === 'Novo') {
        document.getElementById('modal-contrato-titulo').textContent = 'Novo Contrato';
        document.getElementById('btn-form-salvar').textContent = 'Salvar Contrato';
        
        // No modo NOVO, mostra os campos de valor/data fim na seção principal
        document.getElementById('aditivo-valor-fields').style.display = 'grid';
        document.getElementById('aditivo-prazo-fields').style.display = 'grid';
        // E aplica 'required'
        document.getElementById('contrato-valor-total').setAttribute('required', 'required');
        document.getElementById('contrato-data-fim').setAttribute('required', 'required');

        showFormStep(1);
        atualizarCamposPorTipoContrato();
    
    } else if (modo === 'Editar') {
        const contratoParaEditar = db.contratos.find(c => c.id === contratoId);
        if (!contratoParaEditar) return;

        document.getElementById('modal-contrato-titulo').textContent = 'Editar Contrato';
        document.getElementById('btn-form-salvar').textContent = 'Salvar Alterações';
        document.getElementById('contrato-id').value = contratoParaEditar.id; // Define o ID para modo Edição

        preencherFormularioContrato(contratoParaEditar);
        
        // No modo EDITAR, também mostra os campos de valor/data fim
        document.getElementById('aditivo-valor-fields').style.display = 'grid';
        document.getElementById('aditivo-prazo-fields').style.display = 'grid';
        // E aplica 'required'
        document.getElementById('contrato-valor-total').setAttribute('required', 'required');
        document.getElementById('contrato-data-fim').setAttribute('required', 'required');
        
        showFormStep(1); // Começa da etapa 1
        atualizarCamposPorTipoContrato();

    } else if (modo === 'EditarAditivo') {
        const aditivoParaEditar = db.contratos.find(c => c.id === contratoId);
        if (!aditivoParaEditar || !aditivoParaEditar.parentId) return;
        
        const contratoPai = db.contratos.find(c => c.id === aditivoParaEditar.parentId);
        if (!contratoPai) return;

        if (contratoPai.tipoContrato === 'Cooperacao Tecnica') {
        const aditivoTipoSelect = document.getElementById('aditivo-tipo');
        Array.from(aditivoTipoSelect.options).forEach(option => {
            if (option.value !== 'Prazo' && option.value !== '') {
                option.style.display = 'none';
            }
        });
    }

        document.getElementById('modal-contrato-titulo').textContent = 'Editar Termo Aditivo';
        document.getElementById('btn-form-salvar').textContent = 'Salvar Alterações';
        document.getElementById('contrato-id').value = aditivoParaEditar.id; // Define o ID para modo Edição
        document.getElementById('contrato-parentId').value = contratoPai.id; // Define o Pai
        document.getElementById('aditivo-link-sei').value = aditivoParaEditar.aditivo.linkSei || '';

        // Preenche o formulário com dados do PAI (para Unidade/Empresa)
        preencherFormularioContrato(contratoPai);
        
        // AGORA, SOBRESCREVE com os dados do Aditivo
        // Etapa 3 - Dados Principais (que não mudam com aditivo)
        document.getElementById('contrato-processo-sei').value = aditivoParaEditar.processoSei;
        document.getElementById('contrato-numero').value = aditivoParaEditar.numeroContrato;
        document.getElementById('contrato-tipo').value = aditivoParaEditar.tipoContrato;
        document.getElementById('contrato-objeto').value = aditivoParaEditar.objeto;
        document.getElementById('contrato-tempo').value = aditivoParaEditar.tempoContrato;
        document.getElementById('contrato-data-assinatura').value = aditivoParaEditar.dataAssinatura;
        document.getElementById('contrato-data-inicio').value = aditivoParaEditar.dataInicio;
        document.getElementById('contrato-estimativa-mensal').value = (aditivoParaEditar.estimativaMensal || 0).toString().replace('.', ',');
        formatInputAsBRL({ target: document.getElementById('contrato-estimativa-mensal') }); 

        // Mostra e configura a seção de aditivo
        const fieldsetAditivo = document.getElementById('fieldset-aditivo');
        fieldsetAditivo.style.display = 'block';
        fieldsetAditivo.querySelectorAll('#aditivo-tipo, #aditivo-numero, #aditivo-processo-sei, #aditivo-data-assinatura, #aditivo-justificativa').forEach(el => {
            el.setAttribute('required', 'required');
        });
        
        // Preenche os campos do aditivo
        document.getElementById('aditivo-tipo').value = aditivoParaEditar.aditivo.tipo;
        document.getElementById('aditivo-numero').value = aditivoParaEditar.aditivo.numero;
        document.getElementById('aditivo-processo-sei').value = aditivoParaEditar.aditivo.processoSei;
        document.getElementById('aditivo-justificativa').value = aditivoParaEditar.aditivo.justificativa;
        document.getElementById('aditivo-data-assinatura').value = aditivoParaEditar.aditivo.dataAssinatura;
        
        // Preenche os campos dinâmicos
        if (aditivoParaEditar.aditivo.tipo === 'Valor') {
            document.getElementById('contrato-valor-total').value = (aditivoParaEditar.valorTotal || 0).toString().replace('.', ',');
            formatInputAsBRL({ target: document.getElementById('contrato-valor-total') });
        } else if (aditivoParaEditar.aditivo.tipo === 'Prazo') {
            document.getElementById('contrato-data-fim').value = aditivoParaEditar.dataFim;
        } else if (aditivoParaEditar.aditivo.tipo === 'GestorFiscal') {
            if (aditivoParaEditar.aditivo.gestor) {
                document.getElementById('aditivo-gestor-nome').value = aditivoParaEditar.aditivo.gestor.nome;
                document.getElementById('aditivo-gestor-matricula').value = aditivoParaEditar.aditivo.gestor.matricula;
            }
            // Limpa o container antes de preencher
            document.getElementById('fiscais-container').innerHTML = '';
            if (aditivoParaEditar.aditivo.fiscais && aditivoParaEditar.aditivo.fiscais.length > 0) {
                aditivoParaEditar.aditivo.fiscais.forEach(f => {
                    adicionarNovaLinhaFiscal(); // Adiciona linha
                    const container = document.getElementById('fiscais-container');
                    const lastRow = container.lastElementChild;
                    lastRow.querySelector('.fiscal-nome').value = f.nome;
                    lastRow.querySelector('.fiscal-matricula').value = f.matricula;
                });
            } else {
                adicionarNovaLinhaFiscal(); // Garante uma linha em branco
            }
        }
        
        atualizarCamposAditivo(); // Garante a visibilidade correta

        // Oculta stepper e vai direto para a etapa 3
        document.getElementById('stepper-contrato').style.display = 'none';
        showFormStep(3); 
        atualizarCamposPorTipoContrato();

    } else if (modo === 'Aditivo') {
        const contratoPai = db.contratos.find(c => c.id === contratoId);
        if (!contratoPai) return;

        if (contratoPai.tipoContrato === 'Cooperacao Tecnica') {
        const aditivoTipoSelect = document.getElementById('aditivo-tipo');
        aditivoTipoSelect.value = 'Prazo'; // Força a seleção
        Array.from(aditivoTipoSelect.options).forEach(option => {
            if (option.value !== 'Prazo' && option.value !== '') {
                option.style.display = 'none';
            }
        });
        }

        document.getElementById('modal-contrato-titulo').textContent = 'Novo Termo Aditivo';
        document.getElementById('btn-form-salvar').textContent = 'Salvar Aditivo';
        document.getElementById('contrato-parentId').value = contratoPai.id; // Define o Pai

        // Preenche o formulário com dados do PAI
        preencherFormularioContrato(contratoPai);

        // Limpa campos específicos do aditivo
        document.getElementById('contrato-valor-total').value = ''; // Valor aditado começa zerado
        document.getElementById('contrato-data-fim').value = contratoPai.dataFim; // Sugere a data fim atual

        // Mostra e configura a seção de aditivo
        const fieldsetAditivo = document.getElementById('fieldset-aditivo');
        fieldsetAditivo.style.display = 'block';
        // Requer apenas os campos *comuns* do aditivo
        fieldsetAditivo.querySelectorAll('#aditivo-tipo, #aditivo-numero, #aditivo-processo-sei, #aditivo-data-assinatura, #aditivo-justificativa').forEach(el => {
            el.setAttribute('required', 'required');
        });

        atualizarCamposAditivo(); // Chama a função para configurar a visibilidade inicial

        // Oculta stepper e vai direto para a etapa 3
        document.getElementById('stepper-contrato').style.display = 'none';
        showFormStep(3); 
        atualizarCamposPorTipoContrato();
    }
    
    // Adiciona classe z-60 para garantir que o modal de formulário fique na frente
    document.getElementById('modal-contrato').classList.add('z-60');
    abrirModal('modal-contrato');
}


// Função para abrir o modal de confirmação exclusão
function abrirModalConfirmacao(mensagem, callback) {
    document.getElementById('confirmacao-mensagem').textContent = mensagem;
    acaoConfirmada = callback; // Armazena a função a ser executada
    
    // Garante que o modal de confirmação apareça sobre qualquer outro modal
    document.getElementById('modal-confirmacao').classList.add('z-60');
    abrirModal('modal-confirmacao');
}

// Mostra/oculta campos do aditivo base_TIPO
function atualizarCamposAditivo() {
    const tipo = document.getElementById('aditivo-tipo').value;
    
    // Seleciona os containers
    const valorFields = document.getElementById('aditivo-valor-fields');
    const prazoFields = document.getElementById('aditivo-prazo-fields');
    const gestorFields = document.getElementById('aditivo-gestor-fiscal-fields');
    const fiscaisContainer = document.getElementById('fiscais-container');
    
    // Seleciona os inputs que podem ser required
    const valorInput = document.getElementById('contrato-valor-total');
    const prazoInput = document.getElementById('contrato-data-fim');
    const gestorNomeInput = document.getElementById('aditivo-gestor-nome');
    
    // Reseta tudo (exceto o container de fiscais se já estiver preenchido no modo Edição)
    [valorFields, prazoFields, gestorFields].forEach(f => f.style.display = 'none');
    [valorInput, prazoInput, gestorNomeInput].forEach(i => i.removeAttribute('required'));
    // Limpa fiscais SOMENTE se não for tipo Gestor (para preservar na edição)
    if (tipo !== 'GestorFiscal') {
        fiscaisContainer.innerHTML = ''; 
    }

    // Atualiza labels (elas estão dentro das seções agora)
    document.getElementById('label-valor-total').textContent = 'Valor Aditado (R$)';
    document.getElementById('label-data-fim').textContent = 'Nova Data Fim';

    if (tipo === 'Valor') {
        valorFields.style.display = 'grid';
        valorInput.setAttribute('required', 'required');
    } else if (tipo === 'Prazo') {
        prazoFields.style.display = 'grid';
        prazoInput.setAttribute('required', 'required');
        valorFields.style.display = 'grid';
    } else if (tipo === 'GestorFiscal') {
        gestorFields.style.display = 'block';
        gestorNomeInput.setAttribute('required', 'required'); // Pelo menos o gestor é obrigatório
        
        // Só adiciona a primeira linha se o container estiver vazio
        if (fiscaisContainer.innerHTML.trim() === '') {
            adicionarNovaLinhaFiscal(); 
        }
    }
    // Se for 'Outro' ou 'Selecione', nada aparece.
}

// Adiciona uma linha de fiscal no formulário
function adicionarNovaLinhaFiscal() {
    const template = document.getElementById('template-fiscal-row');
    const container = document.getElementById('fiscais-container');
    const novaLinha = template.content.cloneNode(true);
    
    // Adiciona o listener de remoção
    novaLinha.querySelector('.btn-remover-fiscal').addEventListener('click', (e) => {
        e.target.closest('.fiscal-row').remove();
    });
    
    container.appendChild(novaLinha);
}

// Mostra/oculta campos de VALOR base_TIPO DE CONTRATO
function atualizarCamposPorTipoContrato() {
    const tipoContrato = document.getElementById('contrato-tipo').value;
    const estimativaMensalContainer = document.getElementById('contrato-estimativa-mensal').closest('div');
    const valorTotalContainer = document.getElementById('aditivo-valor-fields'); // O campo de valor total
    
    const estimativaMensalInput = document.getElementById('contrato-estimativa-mensal');
    const valorTotalInput = document.getElementById('contrato-valor-total');

    // Verifica se estamos no formulário de Contrato Pai (Novo ou Editar), e não de Aditivo
    const parentId = document.getElementById('contrato-parentId').value;
    const isNovoOuEditarPai = !parentId;

    if (tipoContrato === 'Cooperacao Tecnica') {
        // É Termo de Cooperação: ESCONDE e REMOVE 'required'
        estimativaMensalContainer.style.display = 'none';
        estimativaMensalInput.removeAttribute('required');
        
        if (isNovoOuEditarPai) {
            valorTotalContainer.style.display = 'none';
            valorTotalInput.removeAttribute('required');
        }
        
    } else {
        // Outros tipos: MOSTRA e ADICIONA 'required'
        estimativaMensalContainer.style.display = 'block';
        estimativaMensalInput.setAttribute('required', 'required');
        
        if (isNovoOuEditarPai) {
            valorTotalContainer.style.display = 'grid';
            valorTotalInput.setAttribute('required', 'required');
        }
    }
}


// --- Funções de Cálculo ---

// ATUALIZADO: para lidar com Aditivos
function calcularResumoContrato(contratoPai) {
    // Pega o contrato pai e todos os seus aditivos
    const aditivos = db.contratos.filter(c => c.parentId === contratoPai.id);
    const todosContratos = [contratoPai, ...aditivos];

    let valorTotalAgregado = parseFloat(contratoPai.valorTotal) || 0;
    let dataFimAgregada = new Date(contratoPai.dataFim + "T00:00:00");
    const dataInicio = new Date(contratoPai.dataInicio + "T00:00:00");
    
    let totalPagoAgregado = 0;


    todosContratos.forEach(c => {
        // Soma os pagamentos de todos (pai e aditivos)
        totalPagoAgregado += c.pagamentos.reduce((acc, p) => acc + (parseFloat(p.valorPago) || 0), 0);

        // Se for um aditivo (tem a sub-propriedade 'aditivo')
        if (c.aditivo) {

            // Lógica de Soma de Valor (Aditivo de Valor OU Prazo)
            if (c.aditivo.tipo === 'Valor' || c.aditivo.tipo === 'Prazo') {
                valorTotalAgregado += parseFloat(c.valorTotal) || 0;
            }

            // Lógica de Data (Apenas Aditivo de Prazo)
            if (c.aditivo.tipo === 'Prazo') {
                const novaDataFim = new Date(c.dataFim + "T00:00:00");
                if (novaDataFim > dataFimAgregada) {
                    dataFimAgregada = novaDataFim;
                }
            }
        }
    });

    const valorRestante = valorTotalAgregado - totalPagoAgregado;
    
    let diasTotais = 0;
    let diasPassados = 0;
    let diasRestantesNum = 0;
    let percTempo = 0;
    
    try {
        const hoje = new Date();
        hoje.setHours(0, 0, 0, 0);
        
        if (!isNaN(dataInicio.getTime()) && !isNaN(dataFimAgregada.getTime())) {
            diasTotais = Math.ceil((dataFimAgregada - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
            
            if (hoje < dataInicio) {
                diasPassados = 0;
                diasRestantesNum = diasTotais;
            } else if (hoje > dataFimAgregada) {
                diasPassados = diasTotais;
                diasRestantesNum = 0;
            } else {
                diasPassados = Math.ceil((hoje - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
                diasRestantesNum = diasTotais - diasPassados;
            }
            
            if (diasTotais > 0) {
                percTempo = (diasPassados / diasTotais) * 100;
            }
        }
    } catch (e) {
        console.error("Erro ao calcular datas:", e);
    }

    const percValor = (valorTotalAgregado > 0) ? (totalPagoAgregado / valorTotalAgregado) * 100 : 0;
    
    return {
        totalPago: totalPagoAgregado,
        valorTotal: valorTotalAgregado, // Retorna o valor agregado
        valorRestante: valorRestante,
        diasRestantes: `${diasRestantesNum} dias`,
        diasPassadosNum: diasPassados,
        diasRestantesNum: diasRestantesNum,
        percValor: Math.min(100, percValor),
        percTempo: Math.min(100, percTempo),
        dataFimFinal: dataFimAgregada.toISOString().split('T')[0] // Retorna a data final agregada
    };
}

// --- Funções de Renderização ---

// ATUALIZADO: para filtrar e mostrar só contratos "Pai"
function renderizarContratos() {
    const listaContratos = document.getElementById('lista-contratos');
    const msgSemContratos = document.getElementById('msg-sem-contratos');
    listaContratos.innerHTML = ''; 
    
    if (!msgSemContratos) {
        console.error("Elemento 'msg-sem-contratos' não encontrado.");
        return;
    }

    // FILTRO: Exibe apenas contratos "Pai" (sem parentId)
    const contratosPai = db.contratos.filter(c => !c.parentId);

    if (contratosPai.length === 0) {
        msgSemContratos.style.display = 'block';
        if (!document.body.classList.contains('loading')) {
            msgSemContratos.textContent = "Nenhum contrato cadastrado.";
        }
        return;
    }
    
    msgSemContratos.style.display = 'none';
    const template = document.getElementById('template-card-contrato');

    contratosPai.forEach(contrato => {
        const card = template.content.cloneNode(true);
        // USA O CÁLCULO AGREGADO
        const resumo = calcularResumoContrato(contrato);
        
        card.querySelector('[data-field="processoSei"]').textContent = contrato.processoSei;
        card.querySelector('[data-field="objeto"]').textContent = contrato.objeto;
        card.querySelector('[data-field="empresaNome"]').textContent = contrato.empresa.nome;
        
        card.querySelector('[data-field="totalPago"]').textContent = formatCurrency(resumo.totalPago);
        card.querySelector('[data-field="valorTotal"]').textContent = formatCurrency(resumo.valorTotal); // Usa valor agregado
        card.querySelector('[data-field="progressoValor"]').style.width = `${resumo.percValor}%`;
        
        card.querySelector('[data-field="diasRestantes"]').textContent = resumo.diasRestantes;
        card.querySelector('[data-field="progressoTempo"]').style.width = `${resumo.percTempo}%`;
        
        card.querySelector('.btn-visualizar-contrato').dataset.id = contrato.id;
        card.querySelector('.btn-abrir-modal-pagamento').dataset.id = contrato.id;
        
        listaContratos.appendChild(card);
    });
}

// ATUALIZADO: para mostrar Aditivos e Pagamentos Consolidados
function renderizarModalVisualizar(contratoId) {
    const contratoPai = db.contratos.find(c => c.id === contratoId);
    if (!contratoPai) return;
    
    const body = document.getElementById('visualizar-contrato-body');
    const resumo = calcularResumoContrato(contratoPai); // Já usa o cálculo agregado
    
    // Pega os aditivos
    const aditivos = db.contratos.filter(c => c.parentId === contratoPai.id);
    
    // Agrega pagamentos do PAI e dos ADITIVOS
    let pagamentos = [...(contratoPai.pagamentos || []).map(p => ({...p, origemContratoId: contratoPai.id}))];
    
    aditivos.forEach(ad => {
        if (ad.pagamentos && ad.pagamentos.length > 0) {
            const pagamentosAditivo = ad.pagamentos.map(p => ({...p, origemContratoId: ad.id}));
            pagamentos = pagamentos.concat(pagamentosAditivo);
        }
    });
    // Ordena pagamentos por data
    // Ordena pagamentos por data 'Periodo (De)', com fallback para 'Data do Pagamento'
    pagamentos.sort((a, b) => {
        // Adiciona T00:00:00 para garantir que a data seja lida como local e não UTC
        const dataA = a.periodoDe ? new Date(a.periodoDe + "T00:00:00") : null;
        const dataB = b.periodoDe ? new Date(b.periodoDe + "T00:00:00") : null;

        // Lógica para tratar nulos (pagamentos sem 'periodoDe')
        // Se A tem data e B não, A vem primeiro
        if (dataA && !dataB) return -1; 
        // Se A não tem data e B tem, B vem primeiro
        if (!dataA && dataB) return 1;  
        
        // Se ambos não têm 'periodoDe', ordena pela 'data' (data do pagamento)
        if (!dataA && !dataB) {
            const fallbackA = new Date(a.data + "T00:00:00");
            const fallbackB = new Date(b.data + "T00:00:00");
            return fallbackA - fallbackB;
        }
        
        // Se ambos têm 'periodoDe', compara-os.
        // Se forem iguais, usa a 'data' do pagamento como desempate
        if (dataA.getTime() === dataB.getTime()) {
             const fallbackA = new Date(a.data + "T00:00:00");
             const fallbackB = new Date(b.data + "T00:00:00");
             return fallbackA - fallbackB;
        }

        return dataA - dataB;
    });


    // --- INÍCIO DO NOVO BLOCO DE AGREGAÇÃO (PONTO 1 e 2) ---

    // 1. Agregação para Gráfico Anual (USA 'periodoAte' - Conforme solicitado)
    const pagamentosPorAno = {};
    let maxValorAno = 0; // Para escalar o gráfico de barras
    
    // 2. Agregação para Consumo por Item
    const consumoPorItem = {};
    let valorTotalItens = 0;

    // 3. Agregação para Análise de Gasto Médio (USA 'periodoAte')
    const pagamentosComData = pagamentos.filter(p => p.periodoAte); // Filtra pagamentos que têm a data
    let mesesDePagamento = 0;

    if (pagamentosComData.length > 0) {
        // Encontra a primeira e última data de 'periodoAte'
        const datas = pagamentosComData.map(p => new Date(p.periodoAte + "T00:00:00"));
        const minData = new Date(Math.min.apply(null, datas));
        const maxData = new Date(Math.max.apply(null, datas));
        
        // Calcula a diferença em dias e assume 30.44 dias/mês
        const diasDePagamento = ((maxData - minData) / (1000 * 60 * 60 * 24));
        mesesDePagamento = diasDePagamento / 30.44;

        // Se for menos de um mês (ou só um mês), considera como 1
        if (mesesDePagamento < 1) {
            mesesDePagamento = 1;
        }
    }

    // Calcula o Gasto Médio Mensal REAL
    const gastoMedioMensalReal = (mesesDePagamento > 0) ? (resumo.totalPago / mesesDePagamento) : 0;
    
    // Calcula o desvio da estimativa
    const percentDesvio = (contratoPai.estimativaMensal > 0 && gastoMedioMensalReal > 0) 
        ? ((gastoMedioMensalReal / contratoPai.estimativaMensal) - 1) * 100 
        : 0;

    // Calcula a Previsão de 'Burn Rate'
    const diasRestantesValor = (gastoMedioMensalReal > 0) 
        ? (resumo.valorRestante / gastoMedioMensalReal) * 30.44 
        : Infinity; // Se não há gasto, o dinheiro dura 'infinito'
        
    const alertaBurnRate = (diasRestantesValor < resumo.diasRestantesNum) && (diasRestantesValor !== Infinity);


    // Itera UMA VEZ para preencher os gráficos
    pagamentos.forEach(p => {
        // 1. Gráfico Anual (usa 'periodoAte')
        if (p.periodoAte && p.valorPago > 0) {
            const ano = new Date(p.periodoAte + "T00:00:00").getFullYear();
            pagamentosPorAno[ano] = (pagamentosPorAno[ano] || 0) + p.valorPago;
            if (pagamentosPorAno[ano] > maxValorAno) {
                maxValorAno = pagamentosPorAno[ano];
            }
        }
        
        // 2. Gráfico de Itens
        if (p.detalhes && p.detalhes.length > 0) {
            p.detalhes.forEach(item => {
                const qtd = parseFloat(item.quantidade) || 0;
                const valUnit = parseFloat(item.valorUnitario) || 0;
                const valorTotalItem = qtd * valUnit;
                
                if (valorTotalItem > 0) {
                    const descricao = item.descricao || 'Item não descrito';
                    consumoPorItem[descricao] = (consumoPorItem[descricao] || 0) + valorTotalItem;
                    valorTotalItens += valorTotalItem;
                }
            });
        }
    });
    
    // Converte dados dos gráficos para arrays ordenados
    const dadosAnuais = Object.keys(pagamentosPorAno).map(ano => ({
        ano: ano,
        total: pagamentosPorAno[ano]
    })).sort((a, b) => a.ano - b.ano);

    const dadosConsumo = Object.keys(consumoPorItem).map(desc => ({
        descricao: desc,
        total: consumoPorItem[desc],
        percentual: (valorTotalItens > 0) ? (consumoPorItem[desc] / valorTotalItens) * 100 : 0
    })).sort((a, b) => b.total - a.total); 

    // --- FIM DO NOVO BLOCO DE AGREGAÇÃO ---

    // Encontra o último gestor/fiscal válido
    let gestorAtual = { nome: 'N/D', matricula: '' };
    let fiscaisAtuais = [];
    
    // Itera dos mais recentes para os mais antigos (aditivos)
    [...aditivos].reverse().forEach(ad => {
        if (ad.aditivo && ad.aditivo.tipo === 'GestorFiscal') {
            // Pega o primeiro gestor válido que encontrar
            if (gestorAtual.nome === 'N/D' && ad.aditivo.gestor && ad.aditivo.gestor.nome) { 
                gestorAtual = ad.aditivo.gestor;
            }
            // Pega a primeira lista de fiscais válida que encontrar
            if (fiscaisAtuais.length === 0 && ad.aditivo.fiscais && ad.aditivo.fiscais.length > 0) {
                fiscaisAtuais = ad.aditivo.fiscais;
            }
        }
    });


    // Funções auxiliares de renderização
    const renderField = (label, value, extraClass = '') => `
        <div class="grid grid-cols-3 gap-2 ${extraClass}">
            <span class="text-sm font-semibold text-gray-700 col-span-1">${label}:</span>
            <span class="text-sm text-gray-900 col-span-2">${value || 'N/D'}</span>
        </div>`;
    
    const renderSection = (title, content, actions = '') => `
        <fieldset class="border border-gray-300 p-4 rounded-lg">
            <legend class="text-lg font-semibold px-2 flex justify-between items-center w-full">
                <span>${title}</span>
                <div>${actions}</div>
            </legend>
            <div class="space-y-2">${content}</div>
        </fieldset>`;
    
    // --- Ações (Botões Editar/Aditivo) ---
    const contratoActions = 
        `<button class="btn-editar-contrato-form text-sm bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded-lg shadow-sm" data-id="${contratoPai.id}">Editar Contrato</button>
         <button class="btn-adicionar-aditivo text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-lg shadow-sm ml-2" data-id="${contratoPai.id}">+ Adicionar Aditivo</button>`;

    // --- Seções de Conteúdo ---
    const unidadeContent = renderField('Razão Social', contratoPai.unidade.nome) +
                         renderField('CNPJ', contratoPai.unidade.cnpj) +
                         renderField('Endereço', contratoPai.unidade.endereco) +
                         renderField('Representante', contratoPai.unidade.rep);
                         
    const empresaContent = renderField('Razão Social', contratoPai.empresa.nome) +
                         renderField('CNPJ', contratoPai.empresa.cnpj) +
                         renderField('Endereço', contratoPai.empresa.endereco) +
                         renderField('Representante', contratoPai.empresa.rep);
    
    const contratoContent = renderField('Nº Processo SEI', 
                                    contratoPai.linkSei 
                                        ? `<a href="${contratoPai.linkSei}" target="_blank" class="text-blue-600 hover:underline">${contratoPai.processoSei}</a>` 
                                        : contratoPai.processoSei
                                ) +
                          renderField('Nº do Contrato', contratoPai.numeroContrato) +
                          renderField('Tipo de Contrato', contratoPai.tipoContrato) +
                          renderField('Objeto', contratoPai.objeto) +
                          renderField('Valor Inicial', formatCurrency(contratoPai.valorTotal)) +
                          renderField('Valor Total (c/ Aditivos)', formatCurrency(resumo.valorTotal), 'font-bold bg-blue-50 p-1 rounded-md') +
                          renderField('Estimativa Mensal', formatCurrency(contratoPai.estimativaMensal)) +
                          renderField('Tempo de Contrato', contratoPai.tempoContrato) +
                          renderField('Data Assinatura', formatDate(contratoPai.dataAssinatura)) +
                          renderField('Data Início', formatDate(contratoPai.dataInicio)) +
                          renderField('Data Fim (c/ Aditivos)', formatDate(resumo.dataFimFinal), 'font-bold bg-green-50 p-1 rounded-md') +
                          renderField('Total Pago', formatCurrency(resumo.totalPago)) +
                          renderField('Valor Restante', formatCurrency(resumo.valorRestante)) +
                          renderField('Dias Restantes', resumo.diasRestantes) +
                          // Exibe Gestor e Fiscais
                          renderField('Gestor Atual', `${gestorAtual.nome} ${gestorAtual.matricula ? '(Mat. ' + gestorAtual.matricula + ')' : ''}`, 'font-bold bg-yellow-50 p-1 rounded-md') +
                          renderField('Fiscais Atuais', fiscaisAtuais.map(f => `${f.nome} ${f.matricula ? '(Mat. ' + f.matricula + ')' : ''}`).join('<br>') || 'N/D', 'font-bold bg-yellow-50 p-1 rounded-md');
    
    // --- Seção: Histórico de Aditivos (ATUALIZADA) ---
    let aditivosContent = '<h4 class="font-semibold mb-2">Histórico de Aditivos</h4>';
    if (aditivos.length === 0) {
        aditivosContent += '<p class="text-gray-500 text-sm">Nenhum aditivo registrado.</p>';
    } else {
        aditivosContent += '<div class="overflow-x-auto border rounded-lg">';
        aditivosContent += '<table class="min-w-full divide-y divide-gray-200">';
        aditivosContent += `<thead class="bg-gray-50">
                                <tr>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Assin.</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Processo Aditivo</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Justificativa</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor/Prazo/Gestor</th>
                                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                                </tr>
                            </thead><tbody class="bg-white divide-y divide-gray-200">`;
        
        aditivos.forEach(ad => {
            let infoExtra = 'N/A';
            if (ad.aditivo.tipo === 'Valor') {
                infoExtra = formatCurrency(ad.valorTotal);
            } else if (ad.aditivo.tipo === 'Prazo') {
                infoExtra = `Nova Data Fim: ${formatDate(ad.dataFim)}`;
            } else if (ad.aditivo.tipo === 'GestorFiscal' && ad.aditivo.gestor) {
                infoExtra = `Gestor: ${ad.aditivo.gestor.nome}`;
            }

            aditivosContent += `<tr>
                <td class="px-4 py-3 text-sm">${ad.aditivo.numero || 'N/D'}</td>
                <td class="px-4 py-3 text-sm">${ad.aditivo.tipo || 'N/D'}</td>
                <td class="px-4 py-3 text-sm">${formatDate(ad.aditivo.dataAssinatura) || 'N/D'}</td>
                <td class="px-4 py-3 text-sm">
                    ${ad.aditivo.linkSei 
                        ? `<a href="${ad.aditivo.linkSei}" target="_blank" class="text-blue-600 hover:underline">${ad.aditivo.processoSei}</a>` 
                        : (ad.aditivo.processoSei || 'N/D')}
                </td>
                <td class="px-4 py-3 text-sm">${ad.aditivo.justificativa || 'N/D'}</td>
                <td class="px-4 py-3 text-sm">${infoExtra}</td>
                <td class="px-4 py-3 text-sm">
                    <button class="btn-editar-aditivo text-yellow-600 hover:text-yellow-800" data-aditivo-id="${ad.id}">Editar</button>
                    <button class="btn-detalhar-aditivo text-blue-600 hover:text-blue-800" data-aditivo-id="${ad.id}" data-pai-id="${contratoPai.id}">Detalhar</button>
                </td>
                
            </tr>`;
        });
        aditivosContent += '</tbody></table></div>';
    }

    // --- Tabela de Pagamentos (Consolidada) ---
    let pagamentosContent = `
        <h4 class="font-semibold mb-2">Histórico de Pagamentos (Consolidado)</h4>
        <div class="overflow-x-auto border rounded-lg">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Período</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor Pago</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NF</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Proc. Pag. SEI</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                     </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200 border border-gray-200">
                    ${pagamentos.length === 0 ? 
                        `<tr><td colspan="6" class="px-4 py-4 text-center text-gray-500">Nenhum pagamento registrado.</td></tr>` :
                        pagamentos.map(p => `
                            <tr class="${p.origemContratoId !== contratoPai.id ? 'bg-blue-50' : ''}">
                                <td class="px-4 py-3 text-sm">${formatDate(p.data)} ${p.origemContratoId !== contratoPai.id ? '<span class="text-blue-500 text-xs block">(Aditivo)</span>' : ''}</td>
                                <td class="px-4 py-3 text-sm">${p.periodoDe ? `${formatDate(p.periodoDe)} a ${formatDate(p.periodoAte)}` : 'N/D'}</td>
                                <td class="px-4 py-3 text-sm">
                                    ${formatCurrency(p.valorPago)}
                                    ${p.isTRD ? '<span class="ml-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs font-semibold rounded-full">TRD</span>' : ''}
                                </td>
                                <td class="px-4 py-3 text-sm">${p.notaFiscal}</td>
                                <td class="px-4 py-3 text-sm">
                                    ${p.linkPagamentoSei 
                                        ? `<a href="${p.linkPagamentoSei}" target="_blank" class="text-blue-600 hover:underline">${p.processoPagamentoSei}</a>` 
                                        : p.processoPagamentoSei}
                                </td>
                                <td class="px-4 py-3 text-sm">
                                    <button class="btn-editar-pagamento text-yellow-600 hover:text-yellow-800" data-contrato-id="${p.origemContratoId}" data-pagamento-id="${p.id}" data-contrato-pai-id="${contratoPai.id}">Editar</button>
                                    <button class="btn-detalhar-pagamento text-blue-600 hover:text-blue-800 ml-2" data-contrato-id="${p.origemContratoId}" data-pagamento-id="${p.id}" data-contrato-pai-id="${contratoPai.id}">Detalhar</button>
                                    <button class="btn-excluir-pagamento text-red-600 hover:text-red-800 ml-2" data-contrato-id="${p.origemContratoId}" data-pagamento-id="${p.id}" data-contrato-pai-id="${contratoPai.id}">Excluir</button>
                                </td>
                            </tr>
                        `).join('')
                    }
                </tbody>
            </table>
        </div>`;
    
    // --- Renderização Final do Modal ---
    body.innerHTML = `
        <div id="visualizar-contrato-graficos" class="mb-6"></div>
        ${renderSection('Dados do Contrato', contratoContent, contratoActions)}
        ${renderSection('Histórico de Aditivos', aditivosContent)}
        ${renderSection('Unidade Contratante', unidadeContent)}
        ${renderSection('Empresa Contratada', empresaContent)}
        ${pagamentosContent}
    `;

    // --- Configuração do Botão PDF ---
    const btnExportarPDF = document.querySelector('#modal-visualizar-contrato #btn-exportar-pdf');
    if (btnExportarPDF) {
        const newBtn = btnExportarPDF.cloneNode(true);
        btnExportarPDF.parentNode.replaceChild(newBtn, btnExportarPDF);
        
        newBtn.addEventListener('click', () => {
            exportarDetalhesPDF(contratoPai.id); // Usa o contratoPai.id
        });
    }

    // --- Injeção dos Gráficos ---
    const graficosContainer = document.getElementById('visualizar-contrato-graficos');
    const corValor = '#3b82f6'; // blue-600
    const corTempo = '#16a34a'; // green-600
    const corFundo = '#e5e7eb'; // gray-200

    // --- INÍCIO DO BLOCO DE GRÁFICOS SUBSTITUÍDO (PONTO 1 e 2) ---

// 1. HTML dinâmico para o Consumo por Item (Tabela Ordenada) - Gráfico da Direita
    let htmlConsumoItens = '<div class="overflow-y-auto max-h-48 border rounded-lg">';
    htmlConsumoItens += '<table class="min-w-full divide-y divide-gray-200">';
    htmlConsumoItens += `<thead class="bg-gray-50 sticky top-0 z-10"><tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor Total</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">% do Total</th>
                         </tr></thead>`;
    htmlConsumoItens += '<tbody class="bg-white divide-y divide-gray-200">';
    if (dadosConsumo.length === 0) {
        htmlConsumoItens += '<tr><td colspan="3" class="px-4 py-3 text-center text-gray-500">Nenhum item detalhado nos pagamentos</td></tr>';
    } else {
        dadosConsumo.forEach(d => {
            htmlConsumoItens += `
                <tr>
                    <td class="px-4 py-2 text-sm text-gray-900">${d.descricao}</td>
                    <td class="px-4 py-2 text-sm text-gray-700">${formatCurrency(d.total)}</td>
                    <td class="px-4 py-2 text-sm text-gray-700">
                        <div class="flex items-center">
                            <span class="w-16">${d.percentual.toFixed(1)}%</span>
                            <div class="w-full bg-gray-200 rounded-full h-2.5 ml-2">
                                <div class="bg-green-600 h-2.5 rounded-full" style="width: ${d.percentual.toFixed(1)}%"></div>
                            </div>
                        </div>
                    </td>
                </tr>`;
        });
    }
    htmlConsumoItens += '</tbody></table></div>';
    
    // Define o estilo do KPI
    const kpiBoxClass = "flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg border";
    const kpiLabelClass = "text-sm font-medium text-gray-600";
    const kpiValueClass = "text-2xl font-bold text-gray-900";
    const kpiContextClass = "text-xs font-medium";

    // 3. Renderiza o container principal com todos os gráficos
    graficosContainer.innerHTML = `
        <fieldset class="border border-gray-300 p-4 rounded-lg">
            <legend class="text-lg font-semibold px-2">Resumo Visual (Agregado)</legend>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                
                <div class="flex flex-col items-center">
                    <h4 class="font-semibold text-gray-700 mb-3">Progresso do Valor</h4>
                    <div class="donut-chart-container relative">
                        <div class="donut-chart" style="background: conic-gradient(${corValor} 0% ${resumo.percValor}%, ${corFundo} ${resumo.percValor}% 100%);">
                            <div class="donut-chart-center">
                                <span>${resumo.percValor.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                    <div class="mt-3 text-center space-y-1">
                        <div class="text-sm"><span class="inline-block w-3 h-3 rounded-full bg-blue-600 mr-2" style="vertical-align: middle;"></span>Total Pago: ${formatCurrency(resumo.totalPago)}</div>
                        <div class="text-sm"><span class="inline-block w-3 h-3 rounded-full bg-gray-200 mr-2" style="vertical-align: middle;"></span>Restante: ${formatCurrency(resumo.valorRestante)}</div>
                    </div>
                </div>

                <div class="flex flex-col items-center">
                    <h4 class="font-semibold text-gray-700 mb-3">Progresso do Tempo</h4>
                    <div class="donut-chart-container relative">
                        <div class="donut-chart" style="background: conic-gradient(${corTempo} 0% ${resumo.percTempo}%, ${corFundo} ${resumo.percTempo}% 100%);">
                            <div class="donut-chart-center">
                                <span>${resumo.percTempo.toFixed(0)}%</span>
                            </div>
                        </div>
                    </div>
                     <div class="mt-3 text-center space-y-1">
                        <div class="text-sm"><span class="inline-block w-3 h-3 rounded-full bg-green-600 mr-2" style="vertical-align: middle;"></span>Dias Passados: ${resumo.diasPassadosNum}</div>
                        <div class="text-sm"><span class="inline-block w-3 h-3 rounded-full bg-gray-200 mr-2" style="vertical-align: middle;"></span>Dias Restantes: ${resumo.diasRestantesNum}</div>
                    </div>
                </div>
            </div>
        </fieldset>

        <fieldset class="border border-gray-300 p-4 rounded-lg mt-6">
            <legend class="text-lg font-semibold px-2">Análise Financeira (KPIs)</legend>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                
                <div class="${kpiBoxClass}">
                    <span class="${kpiLabelClass}">Gasto Médio Mensal (Real)</span>
                    <span class="${kpiValueClass}">${formatCurrency(gastoMedioMensalReal)}</span>
                    <span class="${kpiLabelClass} mt-1">(Estimativa: ${formatCurrency(contratoPai.estimativaMensal)})</span>
                </div>
                
                <div class="${kpiBoxClass} ${percentDesvio > 10 ? 'bg-red-50 border-red-300' : 'bg-green-50 border-green-300'}">
                    <span class="${kpiLabelClass}">Desvio da Estimativa</span>
                    <span class="${kpiValueClass} ${percentDesvio > 10 ? 'text-red-700' : 'text-green-700'}">
                        ${percentDesvio >= 0 ? '+' : ''}${percentDesvio.toFixed(1)}%
                    </span>
                    <span class="${kpiLabelClass} mt-1">${percentDesvio > 10 ? 'Gasto acima do esperado' : 'Gasto dentro do esperado'}</span>
                </div>
                
                <div class="${kpiBoxClass} ${alertaBurnRate ? 'bg-red-50 border-red-300' : 'bg-gray-50'}">
                    <span class="${kpiLabelClass}">Previsão (Dias Restantes)</span>
                    <div class="flex items-baseline space-x-2">
                        <span class="${kpiValueClass} ${alertaBurnRate ? 'text-red-700' : ''}" title="Dias de Valor">${diasRestantesValor.toFixed(0)} dias</span>
                        <span class="${kpiLabelClass}">vs</span>
                        <span class="${kpiValueClass}" title="Dias de Prazo">${resumo.diasRestantesNum} dias</span>
                    </div>
                    <span class="${kpiLabelClass} mt-1">${alertaBurnRate ? 'Risco de Exaustão de Valor!' : 'Valor e Prazo alinhados'}</span>
                </div>
                
            </div>
        </fieldset>

        <fieldset class="border border-gray-300 p-4 rounded-lg mt-6">
            <legend class="text-lg font-semibold px-2">Análises Detalhadas</legend>
            <div class="grid grid-cols-1 lg:grid-cols-1 gap-6 pt-2">
                
                <div>
                    <h4 class="font-semibold text-gray-700 mb-3 text-center">Consumo por Competência</h4>
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <select id="filtro-ano" class="p-2 border rounded-md w-full bg-white"></select>
                        <select id="filtro-mes" class="p-2 border rounded-md w-full bg-white">
                            <option value="todos">Todos os Meses</option>
                            <option value="0">Janeiro</option>
                            <option value="1">Fevereiro</option>
                            <option value="2">Março</option>
                            <option value="3">Abril</option>
                            <option value="4">Maio</option>
                            <option value="5">Junho</option>
                            <option value="6">Julho</option>
                            <option value="7">Agosto</option>
                            <option value="8">Setembro</option>
                            <option value="9">Outubro</option>
                            <option value="10">Novembro</option>
                            <option value="11">Dezembro</option>
                        </select>
                    </div>
                    <div id="container-grafico-detalhado" class="min-h-[200px]">
                        </div>
                </div>
                
                <div>
                    <h4 class="font-semibold text-gray-700 mb-3 text-center">Consumo por Item (Período Total)</h4>
                    ${htmlConsumoItens}
                </div>

            </div>
        </fieldset>
    `;
    // --- FIM DO BLOCO DE GRÁFICOS SUBSTITUÍDO ---

    // --- INÍCIO DO NOVO BLOCO DE LISTENERS (DEVE VIR APÓS graficosContainer.innerHTML) ---

    // Pega todos os pagamentos (já agregados)
    const todosPagamentosAgregados = pagamentos; // 'pagamentos' já está em escopo

    // Popula o <select> de Ano
    const selectAno = document.getElementById('filtro-ano');
    const anosUnicos = new Set(todosPagamentosAgregados
        .map(p => p.periodoAte ? new Date(p.periodoAte + "T00:00:00").getFullYear() : null)
        .filter(ano => ano)
    );
    
    // Adiciona opção "Todos"
    // selectAno.innerHTML = '<option value="todos">Todos os Anos</option>'; 
    // Nota: A lógica atual funciona melhor selecionando um ano.
    
    // Adiciona anos do mais novo para o mais antigo
    [...anosUnicos].sort((a, b) => b - a).forEach(ano => {
        const option = document.createElement('option');
        option.value = ano;
        option.text = ano;
        selectAno.appendChild(option);
    });
    // Garante que a opção "Todos os Meses" seja selecionada por padrão
    document.getElementById('filtro-mes').value = 'todos';

    // Adiciona os listeners
    document.getElementById('filtro-ano').addEventListener('change', () => {
        atualizarGraficoDetalhado(todosPagamentosAgregados);
    });
    document.getElementById('filtro-mes').addEventListener('change', () => {
        atualizarGraficoDetalhado(todosPagamentosAgregados);
    });

    // Renderiza o estado inicial do gráfico
    atualizarGraficoDetalhado(todosPagamentosAgregados);

    // --- FIM DO NOVO BLOCO DE LISTENERS ---
}

// --- NOVA FUNÇÃO: RENDERIZAR MODAL DETALHES DO ADITIVO ---

function renderizarModalDetalharAditivo(aditivoId, contratoPaiId) {
    const aditivo = db.contratos.find(c => c.id === aditivoId);
    const contratoPai = db.contratos.find(c => c.id === contratoPaiId);
    
    if (!aditivo || !contratoPai) {
        mostrarToast('Erro ao encontrar aditivo ou contrato pai.', true);
        return;
    }

    document.getElementById('detalhe-aditivo-titulo').textContent = `Detalhes do ${aditivo.aditivo.numero} Termo Aditivo`;

    // 1. Renderiza os Detalhes do Aditivo
    const infoContainer = document.getElementById('detalhe-aditivo-info');
    infoContainer.innerHTML = `
        <div class="grid grid-cols-3 gap-2">
            <span class="text-sm font-semibold text-gray-700 col-span-1">Tipo:</span>
            <span class="text-sm text-gray-900 col-span-2">${aditivo.aditivo.tipo}</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <span class="text-sm font-semibold text-gray-700 col-span-1">Processo SEI:</span>
            <span class="text-sm text-gray-900 col-span-2">${aditivo.aditivo.processoSei}</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <span class="text-sm font-semibold text-gray-700 col-span-1">Data Assinatura:</span>
            <span class="text-sm text-gray-900 col-span-2">${formatDate(aditivo.aditivo.dataAssinatura)}</span>
        </div>
        <div class="grid grid-cols-3 gap-2">
            <span class="text-sm font-semibold text-gray-700 col-span-1">Justificativa:</span>
            <span class="text-sm text-gray-900 col-span-2">${aditivo.aditivo.justificativa}</span>
        </div>
    `;
    
    // 2. Lógica de Pagamentos
    const pagamentosContainer = document.getElementById('detalhe-aditivo-pagamentos');
    
    // Se for Gestor/Fiscal, não há pagamentos
    if (aditivo.aditivo.tipo === 'GestorFiscal') {
        pagamentosContainer.innerHTML = `<p class="text-gray-500 text-center">Aditivos de Gestor/Fiscal não possuem pagamentos associados.</p>`;
        abrirModal('modal-detalhes-aditivo');
        return;
    }

    // Se for Aditivo de Valor (ou Outro), não podemos filtrar por período
    if (aditivo.aditivo.tipo === 'Valor' || aditivo.aditivo.tipo === 'Outro') {
        pagamentosContainer.innerHTML = `<p class="text-gray-500 text-center">Não é possível filtrar pagamentos por período para este tipo de aditivo.</p>`;
        abrirModal('modal-detalhes-aditivo');
        return;
    }

    // --- Se for Aditivo de Prazo, fazemos o filtro ---
    
    // Pega todos os instrumentos (Pai + Aditivos de Prazo) e ordena por dataFim
    const todosInstrumentos = [
        contratoPai, 
        ...db.contratos.filter(c => c.parentId === contratoPaiId && c.aditivo.tipo === 'Prazo')
    ].sort((a, b) => new Date(a.dataFim + "T00:00:00") - new Date(b.dataFim + "T00:00:00"));

    // Encontra o índice do nosso aditivo na lista ordenada
    const indexAtual = todosInstrumentos.findIndex(c => c.id === aditivoId);
    
    if (indexAtual === -1) {
         pagamentosContainer.innerHTML = `<p class="text-red-500 text-center">Erro ao calcular o período do aditivo.</p>`;
         abrirModal('modal-detalhes-aditivo');
         return;
    }

    // O início do período é a dataFim do instrumento ANTERIOR (+1 dia)
    // Se indexAtual for 0, é o primeiro aditivo, então usa o PAI
    // Mas o PAI é o [0] da lista se for o primeiro, então pegamos index-1
    const instrumentoAnterior = todosInstrumentos[indexAtual - 1];
    if (!instrumentoAnterior) {
        pagamentosContainer.innerHTML = `<p class="text-red-500 text-center">Erro: Aditivo anterior não encontrado para cálculo.</p>`;
        abrirModal('modal-detalhes-aditivo');
        return;
    }

    // Data Fim do instrumento anterior
    const dataFimAnterior = new Date(instrumentoAnterior.dataFim + "T00:00:00");
    // Data Início do período do Aditivo ATUAL (dia seguinte ao fim do anterior)
    const dataInicioAditivo = new Date(dataFimAnterior.setDate(dataFimAnterior.getDate() + 1));
    // Data Fim do período do Aditivo ATUAL
    const dataFimAditivo = new Date(aditivo.dataFim + "T00:00:00");

    // Filtra os pagamentos do PAI (onde todos estão armazenados)
    const pagamentosFiltrados = contratoPai.pagamentos.filter(p => {
        if (!p.periodoAte) return false;
        const dataPagamento = new Date(p.periodoAte + "T00:00:00");
        return dataPagamento >= dataInicioAditivo && dataPagamento <= dataFimAditivo;
    });

    // 3. Renderiza a Tabela de Pagamentos
    let htmlTabela = '';
    if (pagamentosFiltrados.length === 0) {
        htmlTabela = `<p class="text-gray-500 text-center">Nenhum pagamento encontrado para o período de ${formatDate(dataInicioAditivo.toISOString().split('T')[0])} a ${formatDate(aditivo.dataFim)}.</p>`;
    } else {
        htmlTabela = `
            <div class="overflow-x-auto border rounded-lg">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Período (Até)</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor Pago</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NF</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Proc. Pag. SEI</th>
                    </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200">
                    ${pagamentosFiltrados.map(p => `
                        <tr>
                            <td class="px-4 py-3 text-sm">${formatDate(p.periodoAte)}</td>
                            <td class="px-4 py-3 text-sm">${formatCurrency(p.valorPago)}</td>
                            <td class="px-4 py-3 text-sm">${p.notaFiscal}</td>
                            <td class="px-4 py-3 text-sm">${p.processoPagamentoSei}</td>
                        </tr>
                    `).join('')}
                </tbody>
            </table>
            </div>`;
    }
    
    pagamentosContainer.innerHTML = htmlTabela;
    abrirModal('modal-detalhes-aditivo');
}
        
function renderizarModalDetalhesPagamento(contratoId, pagamentoId) {
    const contrato = db.contratos.find(c => c.id === contratoId);
    if (!contrato) return;
    const pagamento = contrato.pagamentos.find(p => p.id === pagamentoId);
    if (!pagamento) return;
    
    // Define os IDs no modal
    document.getElementById('detalhe-contrato-id').value = contratoId;
    document.getElementById('detalhe-pagamento-id').value = pagamentoId;
    
    document.getElementById('detalhe-pagamento-info').textContent = 
        `NF: ${pagamento.notaFiscal} - Valor Total: ${formatCurrency(pagamento.valorPago)}`;
    
    const listaItens = document.getElementById('lista-detalhes-itens');
    listaItens.innerHTML = '';
    
    let totalItens = 0;
    
    if (!pagamento.detalhes || pagamento.detalhes.length === 0) {
        listaItens.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Nenhum item detalhado.</td></tr>`;
    } else {
        pagamento.detalhes.forEach(item => {
            const valorTotalItem = (parseFloat(item.quantidade) || 0) * (parseFloat(item.valorUnitario) || 0);
            totalItens += valorTotalItem;
            
            const row = `
                <tr>
                    <td class="px-4 py-3 text-sm">${item.descricao}</td>
                    <td class="px-4 py-3 text-sm">${item.quantidade}</td>
                    <td class="px-4 py-3 text-sm">${formatCurrency(item.valorUnitario)}</td>
                    <td class="px-4 py-3 text-sm">${formatCurrency(valorTotalItem)}</td>
                    <td class="px-4 py-3 text-sm">
                        <button class="btn-excluir-item-detalhe text-red-600 hover:text-red-800" data-item-id="${item.id}">Excluir</button>
                    </td>
                </tr>
            `;
            listaItens.innerHTML += row;
        });
    }
    
    document.getElementById('detalhe-item-total-geral').textContent = formatCurrency(totalItens);
    document.getElementById('form-detalhe-item').reset();
}

// --- Funções de UI (Formulário Contrato) ---

function showFormStep(step) {
    currentFormStep = step;
    document.querySelectorAll('#form-contrato .form-step').forEach(s => s.style.display = 'none');
    
    const currentStepEl = document.getElementById(`form-step-${step}`);
    if (currentStepEl) {
        currentStepEl.style.display = 'block';
    }
    
    const stepper = document.getElementById('stepper-contrato');
    if (stepper.style.display === 'none') return; // Não atualiza se o stepper estiver oculto

    for (let i = 1; i <= 3; i++) {
        const dot = document.getElementById(`step-dot-${i}`);
        if (!dot) continue;
        
        dot.classList.remove('bg-blue-600', 'bg-green-600', 'bg-gray-300', 'text-white', 'text-gray-600');
        
        if (i < step) {
            dot.classList.add('bg-green-600', 'text-white'); // Concluído
        } else if (i === step) {
            dot.classList.add('bg-blue-600', 'text-white'); // Ativo
        } else {
            dot.classList.add('bg-gray-300', 'text-gray-600'); // Pendente
        }
    }

    document.getElementById('btn-form-anterior').style.display = (step === 1) ? 'none' : 'inline-block';
    document.getElementById('btn-form-proximo').style.display = (step === 3) ? 'none' : 'inline-block';
    document.getElementById('btn-form-salvar').style.display = (step === 3) ? 'inline-block' : 'none';
}

function validateStep(step) {
    const stepElement = document.getElementById(`form-step-${step}`);
    if (!stepElement) return false;
    
    // Procura por inputs requeridos que estão visíveis
    const inputs = stepElement.querySelectorAll('input[required], select[required], textarea[required]');
    for (const input of inputs) {
        // Verifica se o input (ou seu fieldset pai) está visível
        if (input.offsetParent !== null) { 
            if (!input.value) {
                const label = input.placeholder || input.labels?.[0]?.textContent || 'Campo';
                mostrarToast(`Erro: O campo "${label}" é obrigatório.`, true);
                input.focus();
                return false;
            }
        }
    }
    return true;
}

function saveStepData(step) {
    if (step === 1) {
        tempContratoData.unidade = {
            nome: document.getElementById('unidade-nome').value,
            cnpj: document.getElementById('unidade-cnpj').value,
            endereco: document.getElementById('unidade-endereco').value,
            rep: document.getElementById('unidade-rep').value,
        };
    } else if (step === 2) {
        tempContratoData.empresa = {
            nome: document.getElementById('empresa-nome').value,
            cnpj: document.getElementById('empresa-cnpj').value,
            endereco: document.getElementById('empresa-endereco').value,
            rep: document.getElementById('empresa-rep').value,
        };
    } else if (step === 3) {
        // Salva dados principais
        tempContratoData.processoSei = document.getElementById('contrato-processo-sei').value;
        tempContratoData.numeroContrato = document.getElementById('contrato-numero').value;
        tempContratoData.tipoContrato = document.getElementById('contrato-tipo').value;
        tempContratoData.objeto = document.getElementById('contrato-objeto').value;
        tempContratoData.estimativaMensal = parseBRL(document.getElementById('contrato-estimativa-mensal').value);
        tempContratoData.tempoContrato = document.getElementById('contrato-tempo').value;
        tempContratoData.dataAssinatura = document.getElementById('contrato-data-assinatura').value;
        tempContratoData.dataInicio = document.getElementById('contrato-data-inicio').value;
        tempContratoData.linkSei = document.getElementById('contrato-link-sei').value.trim() || null;

        // Salva os campos que foram movidos (Valor e Data Fim)
        const valorTotalInput = document.getElementById('contrato-valor-total');
        const dataFimInput = document.getElementById('contrato-data-fim');
        
        if (valorTotalInput) {
            tempContratoData.valorTotal = parseBRL(valorTotalInput.value);
        }
        if (dataFimInput) {
            tempContratoData.dataFim = dataFimInput.value;
        }
    }
}


// --- Funções de Manipulação de Dados (CRUD) ---

// ATUALIZADO: para lidar com Edição e Aditivos
function salvarContrato(e) {
    e.preventDefault();
    const id = document.getElementById('contrato-id').value;
    const parentId = document.getElementById('contrato-parentId').value;

    // Validar e salvar a etapa final antes de submeter
    if (!validateStep(3)) return;
    saveStepData(3);
    
    // Usamos 'structuredClone' para uma cópia profunda e segura
    const contratoData = structuredClone(tempContratoData); 

    if (contratoData.tipoContrato === 'Cooperacao Tecnica') {
        contratoData.valorTotal = 0;
        contratoData.estimativaMensal = 0;
    }

    // Se for um Aditivo, coleta os dados do aditivo
    if (parentId) {
        contratoData.aditivo = {
            tipo: document.getElementById('aditivo-tipo').value,
            numero: document.getElementById('aditivo-numero').value,
            processoSei: document.getElementById('aditivo-processo-sei').value,
            linkSei: document.getElementById('aditivo-link-sei').value.trim() || null,
            justificativa: document.getElementById('aditivo-justificativa').value,
            dataAssinatura: document.getElementById('aditivo-data-assinatura').value
        };
        
        // Salva dados específicos do tipo
        if (contratoData.aditivo.tipo === 'GestorFiscal') {
            const gestorNome = document.getElementById('aditivo-gestor-nome').value;
            const gestorMatricula = document.getElementById('aditivo-gestor-matricula').value;
            contratoData.aditivo.gestor = { nome: gestorNome, matricula: gestorMatricula };
            
            // Lógica para ler as linhas de fiscal
            contratoData.aditivo.fiscais = [];
            const fiscalRows = document.querySelectorAll('#fiscais-container .fiscal-row');
            fiscalRows.forEach(row => {
                const nome = row.querySelector('.fiscal-nome').value;
                const matricula = row.querySelector('.fiscal-matricula').value;
                if (nome && matricula) { // Só salva se ambos estiverem preenchidos
                    contratoData.aditivo.fiscais.push({ nome: nome, matricula: matricula });
                }
            });

            // Validação
            if (!gestorNome) {
                 mostrarToast("Erro: O nome do Gestor é obrigatório.", true);
                 return;
            }
            if (contratoData.aditivo.fiscais.length === 0) {
                 mostrarToast("Erro: Adicione pelo menos um Fiscal com nome e matrícula.", true);
                 return;
            }
            
            // Se for Gestor/Fiscal, zera o valor (pois o campo 'valorTotal' é o mesmo usado para aditivo de valor)
            contratoData.valorTotal = 0; 
            contratoData.dataFim = db.contratos.find(c => c.id === parentId).dataFim; // Mantém a data fim do pai
        
        } else if (contratoData.aditivo.tipo === 'Prazo') {
             // Garante que o valor seja 0 se não for aditivo de valor
             // contratoData.valorTotal = 0;
        } else if (contratoData.aditivo.tipo === 'Valor') {
             // Garante que a data fim seja a do pai se não for aditivo de prazo
             contratoData.dataFim = db.contratos.find(c => c.id === parentId).dataFim;
        }


        // Validação dos campos do aditivo
        if (!contratoData.aditivo.tipo || !contratoData.aditivo.numero || !contratoData.aditivo.processoSei || !contratoData.aditivo.justificativa || !contratoData.aditivo.dataAssinatura) {
            mostrarToast("Erro: Preencha todos os campos gerais do Aditivo.", true);
            return;
        }
    }
    
    if (id) {
        // --- MODO EDITAR --- (Contrato PAI ou Aditivo)
        const index = db.contratos.findIndex(c => c.id === id);
        if (index > -1) {
            // Preserva pagamentos, ID original, e parentId (se houver), atualiza o resto
            db.contratos[index] = { 
                ...db.contratos[index], // Preserva (pagamentos, id, parentId)
                ...contratoData      // Sobrescreve (unidade, empresa, dados etapa 3, e .aditivo se houver)
            };
            mostrarToast('Contrato atualizado com sucesso!');
        }
    } else {
        // --- MODO NOVO (Contrato ou Aditivo) ---
        contratoData.id = `contrato_${Date.now()}`;
        contratoData.pagamentos = []; // Aditivos também podem ter pagamentos
        
        if (parentId) {
            // É um NOVO ADITIVO
            contratoData.parentId = parentId;
            mostrarToast('Aditivo salvo com sucesso!');
        } else {
            // É um NOVO CONTRATO PAI
            mostrarToast('Contrato salvo com sucesso!');
        }
        db.contratos.push(contratoData);
    }
    
    renderizarContratos();
    fecharModal('modal-contrato');
    
    // Se estávamos no modal de visualização, atualiza ele
    if (document.getElementById('modal-visualizar-contrato').style.display === 'block') {
        const idParaRenderizar = parentId || id; // Renderiza o PAI
        renderizarModalVisualizar(idParaRenderizar);
    }
    
    resetarFormularioContrato(); // Limpa o formulário
}
        
function salvarPagamento(e) {
    e.preventDefault();
    const contratoId = document.getElementById('pagamento-contrato-id').value;
    const pagamentoId = document.getElementById('pagamento-id').value;
    const contrato = db.contratos.find(c => c.id === contratoId);
    let novoPagamentoIdParaDetalhe = null;
    
    if (!contrato) {
        mostrarToast('Erro: Contrato não encontrado', true);
        return;
    }
    
    const pagamentoData = {
        data: document.getElementById('pagamento-data').value,
        valorPago: parseBRL(document.getElementById('pagamento-valor').value),
        notaFiscal: document.getElementById('pagamento-nf').value,
        processoPagamentoSei: document.getElementById('pagamento-processo-sei').value,
        linkPagamentoSei: document.getElementById('pagamento-link-sei').value.trim() || null,
        periodoDe: document.getElementById('pagamento-periodo-de').value,
        periodoAte: document.getElementById('pagamento-periodo-ate').value,
        isTRD: document.getElementById('pagamento-is-trd').checked
    };
    
    if (pagamentoId) {
        // Editar pagamento existente
        const index = contrato.pagamentos.findIndex(p => p.id === pagamentoId);
        if (index > -1) {
            contrato.pagamentos[index] = { 
                ...contrato.pagamentos[index], // Preserva ID e detalhes
                ...pagamentoData // Sobrescreve com novos dados
            };
            mostrarToast('Pagamento atualizado!');
        }
    } else {
        // Novo pagamento
        const novoPagamento = {
            ...pagamentoData,
            id: `pag_${Date.now()}`,
            detalhes: []
        };
        contrato.pagamentos.push(novoPagamento);
        novoPagamentoIdParaDetalhe = novoPagamento.id;
        mostrarToast('Pagamento adicionado!');
    }
    
    renderizarContratos(); // Atualiza o card com o novo valor pago
    
    // ATUALIZADO: para re-renderizar o modal PAI
    if (document.getElementById('modal-visualizar-contrato').style.display === 'block') {
        const contratoDono = db.contratos.find(c => c.id === contratoId);
        const contratoPaiId = contratoDono.parentId || contratoDono.id;
        renderizarModalVisualizar(contratoPaiId);
    }
    
    fecharModal('modal-pagamento');

    if (novoPagamentoIdParaDetalhe) {
    renderizarModalDetalhesPagamento(contratoId, novoPagamentoIdParaDetalhe);
    abrirModal('modal-detalhes-pagamento');
    }
}
        
function salvarDetalheItem(e) {
    e.preventDefault();
    const contratoId = document.getElementById('detalhe-contrato-id').value;
    const pagamentoId = document.getElementById('detalhe-pagamento-id').value;
    
    const contrato = db.contratos.find(c => c.id === contratoId);
    if (!contrato) return;
    const pagamento = contrato.pagamentos.find(p => p.id === pagamentoId);
    if (!pagamento) return;
    
    const novoItem = {
        id: `item_${Date.now()}`,
        descricao: document.getElementById('detalhe-item-desc').value,
        quantidade: parseFloat(document.getElementById('detalhe-item-qtd').value),
        valorUnitario: parseBRL(document.getElementById('detalhe-item-valor').value)
    };
    
    if (!pagamento.detalhes) {
        pagamento.detalhes = [];
    }
    
    pagamento.detalhes.push(novoItem);
    renderizarModalDetalhesPagamento(contratoId, pagamentoId);
}
        
function excluirPagamento(contratoId, pagamentoId) {
    const contrato = db.contratos.find(c => c.id === contratoId);
    if (!contrato) return;
    
    contrato.pagamentos = contrato.pagamentos.filter(p => p.id !== pagamentoId);
    
    renderizarContratos(); // Atualiza card
    
    // Re-renderiza o modal de visualização (a função já está no event listener)
    mostrarToast('Pagamento excluído');
}
        
function excluirItemDetalhe(contratoId, pagamentoId, itemId) {
     const contrato = db.contratos.find(c => c.id === contratoId);
    if (!contrato) return;
    const pagamento = contrato.pagamentos.find(p => p.id === pagamentoId);
    if (!pagamento || !pagamento.detalhes) return;
    
    pagamento.detalhes = pagamento.detalhes.filter(item => item.id !== itemId);
    
    renderizarModalDetalhesPagamento(contratoId, pagamentoId);
    
    // Re-renderiza o modal de visualização (a função já está no event listener)
}

// --- Funções de Manipulação de Dados (Import/Export) ---

async function carregarDados() {
    try {
        const response = await fetch('dados.json');
        if (!response.ok) {
            throw new Error('Arquivo dados.json não encontrado ou inválido.');
        }
        const data = await response.json();
        if (data && data.contratos) {
            db = data;
            mostrarToast('Dados carregados com sucesso!');
        }
    } catch (error) {
        console.warn(error.message);
        mostrarToast('Nenhum dado local encontrado. Começando do zero.', true);
    } finally {
        document.body.classList.remove('loading');
        renderizarContratos();
    }
}

function exportarDados() {
    try {
        const dataStr = JSON.stringify(db, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.href = url;
        a.download = 'dados.json';
        document.body.appendChild(a);
        a.click();
        
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        mostrarToast('Dados exportados com sucesso!');
    } catch (error) {
        console.error("Erro ao exportar dados:", error);
        mostrarToast('Erro ao exportar dados.', true);
    }
}

// --- Função de Exportar PDF ---

function exportarDetalhesPDF(contratoPaiId) {
    // ATUALIZADO: Pega o PAI e TODOS os aditivos/pagamentos
    const contratoPai = db.contratos.find(c => c.id === contratoPaiId);
    if (!contratoPai) {
        mostrarToast('Erro ao gerar PDF: Contrato não encontrado', true);
        return;
    }
    
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
    const resumo = calcularResumoContrato(contratoPai);
    const aditivos = db.contratos.filter(c => c.parentId === contratoPai.id);
    
    let pagamentos = [...(contratoPai.pagamentos || []).map(p => ({...p, origemContratoId: contratoPai.id}))];
    aditivos.forEach(ad => {
        if (ad.pagamentos && ad.pagamentos.length > 0) {
            pagamentos = pagamentos.concat(ad.pagamentos.map(p => ({...p, origemContratoId: ad.id, origemAditivo: ad.aditivo.processoSei})));
        }
    });
    pagamentos.sort((a, b) => new Date(a.data) - new Date(b.data));
    
    // Encontra o último gestor/fiscal
    let gestorAtual = { nome: 'N/D', matricula: '' };
    let fiscaisAtuais = [];
    [...aditivos].reverse().forEach(ad => {
        if (ad.aditivo && ad.aditivo.tipo === 'GestorFiscal') {
            if (gestorAtual.nome === 'N/D' && ad.aditivo.gestor && ad.aditivo.gestor.nome) { 
                gestorAtual = ad.aditivo.gestor;
            }
            if (fiscaisAtuais.length === 0 && ad.aditivo.fiscais && ad.aditivo.fiscais.length > 0) {
                fiscaisAtuais = ad.aditivo.fiscais;
            }
        }
    });

    // --- Configuração do Rodapé (Paginação e Data) ---
    const addFooter = () => {
        const pageCount = doc.internal.getNumberOfPages();
        const dataEmissao = new Date().toLocaleString('pt-BR');
        
        doc.setFontSize(8);
        doc.setTextColor(100);

        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.text(`Emitido em: ${dataEmissao}`, 14, 287);
            doc.text(`Página ${i}/${pageCount}`, 190, 287);
        }
    };

    // --- Página 1: Detalhes do Contrato ---
    doc.setFontSize(18);
    doc.text('Relatório de Acompanhamento de Contrato', 14, 22);
    doc.setFontSize(11);
    doc.setTextColor(100);

    const dadosContrato = [
        ['Nº Processo SEI', contratoPai.processoSei],
        ['Nº do Contrato', contratoPai.numeroContrato],
        ['Tipo de Contrato', contratoPai.tipoContrato],
        ['Objeto', contratoPai.objeto],
        ['Valor Inicial', formatCurrency(contratoPai.valorTotal)],
        ['Valor Total (c/ Aditivos)', formatCurrency(resumo.valorTotal)],
        ['Estimativa Mensal', formatCurrency(contratoPai.estimativaMensal)],
        ['Data Início', formatDate(contratoPai.dataInicio)],
        ['Data Fim (c/ Aditivos)', formatDate(resumo.dataFimFinal)],
        ['Total Pago', formatCurrency(resumo.totalPago)],
        ['Valor Restante', formatCurrency(resumo.valorRestante)],
        ['Dias Restantes', resumo.diasRestantes],
        ['Gestor Atual', `${gestorAtual.nome} ${gestorAtual.matricula ? '(Mat. ' + gestorAtual.matricula + ')' : ''}`],
        ['Fiscais Atuais', fiscaisAtuais.map(f => `${f.nome} ${f.matricula ? '(Mat. ' + f.matricula + ')' : ''}`).join(', ') || 'N/D'],
    ];
    
    doc.autoTable({
        head: [['Dados do Contrato', '']],
        body: dadosContrato,
        startY: 30,
        headStyles: { fillColor: [22, 160, 133] },
        theme: 'striped',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 'auto' } },
        didParseCell: function (data) {
            if (data.row.index === 3 && data.column.index === 1) { // Objeto
                data.cell.styles.cellWidth = 'wrap';
            }
            if (data.row.index === 5 || data.row.index === 8 || data.row.index === 12 || data.row.index === 13) { // Campos agregados/atuais
                data.cell.styles.fontStyle = 'bold';
            }
        }
    });

    const dadosUnidade = [
        ['Razão Social', contratoPai.unidade.nome],
        ['CNPJ', contratoPai.unidade.cnpj],
        ['Endereço', contratoPai.unidade.endereco],
        ['Representante', contratoPai.unidade.rep],
    ];
    doc.autoTable({
        head: [['Unidade Contratante', '']],
        body: dadosUnidade,
        startY: doc.autoTable.previous.finalY + 10, 
        headStyles: { fillColor: [44, 62, 80] },
        theme: 'striped',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 'auto' } }
    });

    const dadosEmpresa = [
        ['Razão Social', contratoPai.empresa.nome],
        ['CNPJ', contratoPai.empresa.cnpj],
        ['Endereço', contratoPai.empresa.endereco],
        ['Representante', contratoPai.empresa.rep],
    ];
    doc.autoTable({
        head: [['Empresa Contratada', '']],
        body: dadosEmpresa,
        startY: doc.autoTable.previous.finalY + 10,
        headStyles: { fillColor: [44, 62, 80] },
        theme: 'striped',
        columnStyles: { 0: { fontStyle: 'bold', cellWidth: 50 }, 1: { cellWidth: 'auto' } }
    });
    
    // --- Aditivos (Página 2) ---
    if (aditivos.length > 0) {
        doc.addPage(); // <<<< MODIFICAÇÃO: Força nova página
        doc.setFontSize(16);
        doc.text('Histórico de Aditivos', 14, 22);

        const headAditivos = [['Número', 'Tipo', 'Data Assin.', 'Processo Aditivo', 'Justificativa', 'Valor/Prazo/Gestor']];
        const bodyAditivos = aditivos.map(ad => {
             let infoExtra = 'N/A';
            if (ad.aditivo.tipo === 'Valor') {
                infoExtra = formatCurrency(ad.valorTotal);
            } else if (ad.aditivo.tipo === 'Prazo') {
                infoExtra = `Nova Data Fim: ${formatDate(ad.dataFim)}`;
            } else if (ad.aditivo.tipo === 'GestorFiscal' && ad.aditivo.gestor) {
                infoExtra = `Gestor: ${ad.aditivo.gestor.nome}`;
            }
            return [
                ad.aditivo.numero,
                ad.aditivo.tipo,
                formatDate(ad.aditivo.dataAssinatura),
                ad.aditivo.processoSei,
                ad.aditivo.justificativa,
                infoExtra
            ];
        });
        
        doc.autoTable({
            head: headAditivos,
            body: bodyAditivos,
            startY: 30, // <<<< MODIFICAÇÃO: Começa do topo
            headStyles: { fillColor: [96, 108, 119] }, // Cinza
            theme: 'striped'
        });
    }


    // --- Página 3+: Histórico de Pagamentos ---
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Histórico de Pagamentos (Consolidado)', 14, 22);
    let startY = 30; // <<<< MODIFICAÇÃO: Renomeada ou resetada

    if (pagamentos.length === 0) {
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text("Nenhum pagamento registrado.", 14, 30);
    } else {
        pagamentos.forEach((p, index) => {
            const headPagamento = [['Data', 'Período', 'Valor Pago', 'NF', 'Proc. Pag. SEI']];
            const bodyPagamento = [[
                formatDate(p.data) + (p.origemAditivo ? `\n(Aditivo ${p.origemAditivo})` : ''),
                p.periodoDe ? `${formatDate(p.periodoDe)} a ${formatDate(p.periodoAte)}` : 'N/D',
                formatCurrency(p.valorPago),
                p.notaFiscal,
                p.processoPagamentoSei
            ]];
            
            // Verifica se precisa de nova página ANTES de desenhar
            let requiredHeight = 20; // Altura estimada do pagto + detalhes
            if (p.detalhes && p.detalhes.length > 0) {
                requiredHeight += (p.detalhes.length + 2) * 8; 
            }
            if (startY + requiredHeight > 280) {
                doc.addPage();
                startY = 22;
            }

            doc.autoTable({
                head: headPagamento,
                body: bodyPagamento,
                startY: startY,
                theme: 'grid',
                headStyles: { fillColor: [96, 108, 119], fontSize: 9 },
                bodyStyles: { fontSize: 9, fillColor: p.origemAditivo ? [235, 248, 255] : [255, 255, 255] } // Azul claro para aditivo
            });
            startY = doc.autoTable.previous.finalY;

            // Tabela de Detalhes
            if (p.detalhes && p.detalhes.length > 0) {
                let totalItens = 0;
                const bodyDetalhes = p.detalhes.map(item => {
                    const valorTotalItem = (parseFloat(item.quantidade) || 0) * (parseFloat(item.valorUnitario) || 0);
                    totalItens += valorTotalItem;
                    return [ item.descricao, item.quantidade, formatCurrency(item.valorUnitario), formatCurrency(valorTotalItem) ];
                });
                bodyDetalhes.push([
                    { content: 'Total dos Itens:', colSpan: 3, styles: { halign: 'right', fontStyle: 'bold' } },
                    { content: formatCurrency(totalItens), styles: { fontStyle: 'bold' } }
                ]);

                doc.autoTable({
                    head: [['Descrição', 'Qtd.', 'Valor Unit.', 'Total Item']],
                    body: bodyDetalhes,
                    startY: startY,
                    theme: 'striped',
                    margin: { left: 20, right: 14 },
                    headStyles: { fillColor: [236, 240, 241], textColor: [44, 62, 80], fontSize: 8 },
                    bodyStyles: { fontSize: 8 },
                    didParseCell: function (data) {
                        if (data.row.index === bodyDetalhes.length - 1) {
                            data.cell.styles.fillColor = [245, 245, 245];
                        }
                    }
                });
                startY = doc.autoTable.previous.finalY + 5;
            } else {
                 startY += 5;
            }
            if(index < pagamentos.length - 1) {
                 startY += 5;
            }
        });
    }

    addFooter();
    doc.save(`Relatorio_${contratoPai.objeto.substring(0, 20).replace(/\s+/g, '_')}_${contratoPai.processoSei}.pdf`);
    mostrarToast('Relatório PDF gerado!');
}


// --- Funções de UI (Modal, Toast) ---

function abrirModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'block';
    }
}

function fecharModal(id) {
    const modal = document.getElementById(id);
    if (modal) {
        modal.style.display = 'none';
        // Remove a classe z-60 ao fechar
        modal.classList.remove('z-60');
    }
}

function fecharTodosModais() {
    document.querySelectorAll('.modal').forEach(modal => {
        modal.style.display = 'none';
        // Remove a classe z-60 ao fechar
        modal.classList.remove('z-60');
    });
}

function mostrarToast(message, isError = false) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = 'show';
    toast.style.backgroundColor = isError ? '#dc3545' : '#333';
    
    setTimeout(() => {
        toast.className = toast.className.replace('show', '');
    }, 3000);
}

// --- Event Listeners ---

// 'DOMContentLoaded' é o evento correto para scripts externos
document.addEventListener('DOMContentLoaded', () => {
    
    document.body.classList.add('loading');
    carregarDados();

    document.getElementById('btn-exportar').addEventListener('click', exportarDados);

    // ATUALIZADO: Botão Abrir Modal Contrato (Novo)
    document.getElementById('btn-abrir-modal-contrato').addEventListener('click', () => {
        abrirModalContratoForm('Novo', null);
    });

    // Botões de navegação do formulário de contrato
    document.getElementById('btn-form-proximo').addEventListener('click', () => {
        if (validateStep(currentFormStep)) {
            saveStepData(currentFormStep);
            showFormStep(currentFormStep + 1);
        }
    });

    document.getElementById('btn-form-anterior').addEventListener('click', () => {
        saveStepData(currentFormStep); 
        showFormStep(currentFormStep - 1);
    });

    // Adicionar listeners de máscara de moeda
    document.querySelectorAll('.currency-input').forEach(input => {
        input.addEventListener('input', formatInputAsBRL);
    });
    document.querySelectorAll('.currency-input-3dec').forEach(input => {
        input.addEventListener('input', formatInputAsBRL_3dec);
    });
    
    // Listener para o dropdown de tipo de aditivo
    document.getElementById('aditivo-tipo').addEventListener('change', atualizarCamposAditivo);

    // Listener para o atualizar campos por tipo de contrato
    document.getElementById('contrato-tipo').addEventListener('change', atualizarCamposPorTipoContrato);

    // Listener para o botão "+ Adicionar Fiscal"
    document.getElementById('btn-adicionar-fiscal').addEventListener('click', adicionarNovaLinhaFiscal);

    // Botão "+ Novo Pagamento" dentro do modal de Detalhes da NF
    document.getElementById('btn-detalhes-novo-pagamento').addEventListener('click', () => {
        // Pega o ID do contrato que "possui" o pagamento (pode ser o PAI ou um Aditivo)
        // Este ID foi salvo no modal quando ele foi aberto
        const contratoDonoId = document.getElementById('detalhe-contrato-id').value;
        const contratoDono = db.contratos.find(c => c.id === contratoDonoId);
        
        if (!contratoDono) {
            mostrarToast('Erro: Não foi possível identificar o contrato de origem.', true);
            return;
        }

        // Descobre o ID do Contrato PAI
        // Se o 'contratoDono' for um aditivo, ele terá um 'parentId'. Se não, ele é o PAI.
        const contratoPaiId = contratoDono.parentId || contratoDono.id;
        const contratoPai = db.contratos.find(c => c.id === contratoPaiId);

        if (!contratoPai) {
            mostrarToast('Erro: Contrato principal não encontrado.', true);
            return;
        }
        
        // Fecha o modal de detalhes
        fecharModal('modal-detalhes-pagamento');
        
        // Abre o modal de pagamento, pré-preenchido com dados do PAI
        // (Exatamente como se clicasse "+ Pagamento" no card)
        document.getElementById('form-pagamento').reset();
        document.getElementById('pagamento-contrato-id').value = contratoPai.id; // O ID do PAI
        document.getElementById('pagamento-id').value = ''; // Limpa ID do pagamento (é um NOVO pagto)
        document.getElementById('pagamento-contrato-objeto').textContent = `Contrato: ${contratoPai.objeto}`;
        
        document.getElementById('modal-pagamento-titulo').textContent = 'Adicionar Pagamento';
        document.getElementById('modal-pagamento-submit-btn').textContent = 'Adicionar Pagamento';
        document.getElementById('pagamento-data').value = new Date().toISOString().split('T')[0];
        
        abrirModal('modal-pagamento');
    });

    // Adicionar listeners de capitalização
    document.querySelectorAll('.capitalize-input').forEach(input => {
        input.addEventListener('input', formatInputAsCapitalized);
    });

    // Botões de Fechar Modal
    document.querySelectorAll('.modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            const modal = btn.closest('.modal');
            if (modal) {
                fecharModal(modal.id);
            }
        });
    });

    // Fechar modal clicando fora do conteúdo
    window.addEventListener('click', (event) => {
        if (event.target.classList.contains('modal')) {
            fecharModal(event.target.id);
        }
    });

    // Submit Forms
    document.getElementById('form-contrato').addEventListener('submit', salvarContrato);
    document.getElementById('form-pagamento').addEventListener('submit', salvarPagamento);
    document.getElementById('form-detalhe-item').addEventListener('submit', salvarDetalheItem);

    // --- Lógica do Modal de Confirmação ---
    document.getElementById('btn-confirmacao-sim').addEventListener('click', () => {
        if (typeof acaoConfirmada === 'function') {
            acaoConfirmada(); // Executa a ação (ex: excluirPagamento)
        }
        acaoConfirmada = null;
        fecharModal('modal-confirmacao');
    });

    // Limpa a ação se o usuário clicar "Cancelar" ou no "X"
    document.querySelectorAll('#modal-confirmacao .modal-close').forEach(btn => {
        btn.addEventListener('click', () => {
            acaoConfirmada = null;
            fecharModal('modal-confirmacao');
        });
    });
    
    // ===== NOVOS LISTENERS PARA AUTO-PREENCHIMENTO (INÍCIO) =====
    // ==========================================================

    // Procura por CNPJ de Unidade
    document.getElementById('unidade-cnpj').addEventListener('blur', (e) => {
        const cnpjInput = e.target.value.replace(/\D/g, ''); // Limpa formatação do input
        if (cnpjInput.length < 14) return; // Não procura se não for um CNPJ completo

        let dadosEncontrados = null;
        for (const contrato of db.contratos) {
            // Procura primeiro em Unidades
            if (contrato.unidade && contrato.unidade.cnpj && contrato.unidade.cnpj.replace(/\D/g, '') === cnpjInput) {
                dadosEncontrados = contrato.unidade;
                break;
            }
            // Procura também em Empresas (caso um fornecedor vire unidade)
            if (contrato.empresa && contrato.empresa.cnpj && contrato.empresa.cnpj.replace(/\D/g, '') === cnpjInput) {
                dadosEncontrados = contrato.empresa;
                break;
            }
        }

        if (dadosEncontrados) {
            document.getElementById('unidade-nome').value = dadosEncontrados.nome;
            document.getElementById('unidade-endereco').value = dadosEncontrados.endereco;
            document.getElementById('unidade-rep').value = dadosEncontrados.rep;
            // Re-executa a capitalização nos campos preenchidos
            formatInputAsCapitalized({ target: document.getElementById('unidade-nome') });
            formatInputAsCapitalized({ target: document.getElementById('unidade-rep') });
            mostrarToast('Unidade preenchida automaticamente.');
        }
    });

    // Procura por CNPJ de Empresa
    document.getElementById('empresa-cnpj').addEventListener('blur', (e) => {
        const cnpjInput = e.target.value.replace(/\D/g, ''); // Limpa formatação do input
        if (cnpjInput.length < 14) return;

        let dadosEncontrados = null;
        for (const contrato of db.contratos) {
            // Procura primeiro em Empresas
            if (contrato.empresa && contrato.empresa.cnpj && contrato.empresa.cnpj.replace(/\D/g, '') === cnpjInput) {
                dadosEncontrados = contrato.empresa;
                break;
            }
            // Procura também em Unidades (caso uma unidade vire fornecedor)
            if (contrato.unidade && contrato.unidade.cnpj && contrato.unidade.cnpj.replace(/\D/g, '') === cnpjInput) {
                dadosEncontrados = contrato.unidade;
                break;
            }
        }

        if (dadosEncontrados) {
            document.getElementById('empresa-nome').value = dadosEncontrados.nome;
            document.getElementById('empresa-endereco').value = dadosEncontrados.endereco;
            document.getElementById('empresa-rep').value = dadosEncontrados.rep;
            // Re-executa a capitalização nos campos preenchidos
            formatInputAsCapitalized({ target: document.getElementById('empresa-nome') });
            formatInputAsCapitalized({ target: document.getElementById('empresa-rep') });
            mostrarToast('Empresa preenchida automaticamente.');
        }
    });

    // Event Delegation para botões dinâmicos
    document.body.addEventListener('click', (e) => {

           
        // Botão "Ver Detalhes" no Card
        if (e.target.classList.contains('btn-visualizar-contrato')) {
            const contratoId = e.target.dataset.id;
            renderizarModalVisualizar(contratoId);
            abrirModal('modal-visualizar-contrato');
        }
        
        // Botão "+ Pagamento" no Card
        if (e.target.classList.contains('btn-abrir-modal-pagamento')) {
            const contratoId = e.target.dataset.id;
            const contrato = db.contratos.find(c => c.id === contratoId);
            if (contrato) {
                document.getElementById('form-pagamento').reset();
                // O pagamento é sempre associado ao contrato PAI
                document.getElementById('pagamento-contrato-id').value = contrato.id; 
                //document.getElementById('pagamento-link-sei').value = pagamento.linkPagamentoSei || '';
                document.getElementById('pagamento-id').value = ''; 
                document.getElementById('pagamento-contrato-objeto').textContent = `Contrato: ${contrato.objeto}`;
                
                document.getElementById('modal-pagamento-titulo').textContent = 'Adicionar Pagamento';
                document.getElementById('modal-pagamento-submit-btn').textContent = 'Adicionar Pagamento';
                document.getElementById('pagamento-data').value = new Date().toISOString().split('T')[0];
                abrirModal('modal-pagamento');
            }
        }
        
        // --- LISTENERS DE ADITIVO/EDIÇÃO ---

        // Botão "Editar Contrato" (dentro do modal visualizar)
        if (e.target.classList.contains('btn-editar-contrato-form')) {
            const contratoId = e.target.dataset.id;
            abrirModalContratoForm('Editar', contratoId);
        }
        
        // Botão "+ Adicionar Aditivo" (dentro do modal visualizar)
        if (e.target.classList.contains('btn-adicionar-aditivo')) {
            const contratoPaiId = e.target.dataset.id;
            abrirModalContratoForm('Aditivo', contratoPaiId);
        }
        
        // Botão "Editar Aditivo" (dentro do modal visualizar)
        if (e.target.classList.contains('btn-editar-aditivo')) {
            const aditivoId = e.target.dataset.aditivoId;
            abrirModalContratoForm('EditarAditivo', aditivoId);
        }

        // Botão "Detalhar Aditivo" (dentro do modal visualizar)
        if (e.target.classList.contains('btn-detalhar-aditivo')) {
            const { aditivoId, paiId } = e.target.dataset;
            renderizarModalDetalharAditivo(aditivoId, paiId);
        }
        
        // Botão "Editar" Pagamento
        if (e.target.classList.contains('btn-editar-pagamento')) {
            const { contratoId, pagamentoId, contratoPaiId } = e.target.dataset;
            const contrato = db.contratos.find(c => c.id === contratoId); // Contrato dono (pai ou aditivo)
            const pagamento = contrato?.pagamentos.find(p => p.id === pagamentoId);
            
            if (pagamento) {
                const contratoPai = db.contratos.find(c => c.id === contratoPaiId); // Contrato pai (para o título)
            
                document.getElementById('form-pagamento').reset();
                document.getElementById('pagamento-contrato-id').value = contratoId; // O ID do dono do pagto
                document.getElementById('pagamento-id').value = pagamentoId;
                
                document.getElementById('pagamento-contrato-objeto').textContent = 'Contrato: ' + contratoPai.objeto;
                document.getElementById('pagamento-data').value = pagamento.data || '';
                document.getElementById('pagamento-valor').value = (pagamento.valorPago || 0).toString().replace('.', ',');
                document.getElementById('pagamento-nf').value = pagamento.notaFiscal || '';
                document.getElementById('pagamento-processo-sei').value = pagamento.processoPagamentoSei || '';
                document.getElementById('pagamento-periodo-de').value = pagamento.periodoDe || '';
                document.getElementById('pagamento-periodo-ate').value = pagamento.periodoAte || '';
                document.getElementById('pagamento-is-trd').checked = pagamento.isTRD || false;

                formatInputAsBRL({ target: document.getElementById('pagamento-valor') }); 

                document.getElementById('modal-pagamento-titulo').textContent = 'Editar Pagamento';
                document.getElementById('modal-pagamento-submit-btn').textContent = 'Salvar Alterações';

                abrirModal('modal-pagamento');
            }
        }
        
        // Botão "Detalhar" Pagamento
        if (e.target.classList.contains('btn-detalhar-pagamento')) {
            const { contratoId, pagamentoId } = e.target.dataset;
            renderizarModalDetalhesPagamento(contratoId, pagamentoId);
            abrirModal('modal-detalhes-pagamento');
        }
        
        // Botão "Excluir" Pagamento
        if (e.target.classList.contains('btn-excluir-pagamento')) {
            const { contratoId, pagamentoId, contratoPaiId } = e.target.dataset;
            
            // Refatorado para usar o modal de confirmação
            abrirModalConfirmacao(
                "Tem certeza que deseja excluir este pagamento? Esta ação não pode ser desfeita.", 
                () => { // Esta é a função (callback) que será executada se o usuário clicar "Excluir"
                    excluirPagamento(contratoId, pagamentoId); 
                    renderizarModalVisualizar(contratoPaiId);
                }
            );
        }
        
        // Botão "Excluir" Item Detalhe
        if (e.target.classList.contains('btn-excluir-item-detalhe')) {
            // Pega os IDs antes de abrir o modal
            const contratoId = document.getElementById('detalhe-contrato-id').value;
            const pagamentoId = document.getElementById('detalhe-pagamento-id').value;
            const itemId = e.target.dataset.itemId;
            
            // Refatorado para usar o modal de confirmação
            abrirModalConfirmacao(
                "Tem certeza que deseja excluir este item da nota fiscal?",
                () => { // Esta é a função (callback)
                    excluirItemDetalhe(contratoId, pagamentoId, itemId);
                    
                    // Re-renderiza o modal principal (se estiver aberto)
                    if (document.getElementById('modal-visualizar-contrato').style.display === 'block') {
                        const contratoDono = db.contratos.find(c => c.id === contratoId);
                        const contratoPaiId = contratoDono.parentId || contratoDono.id;
                        renderizarModalVisualizar(contratoPaiId);
                    }
                }
            );
        }
    });
});