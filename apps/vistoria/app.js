// Acesso ao banco de dados herdado do Cockpit Gestão
const supabase = window.parent.supabaseClient || window.supabaseClient; 

// Estado Local
let vistorias = [];
let tempAmbientes = [];
let tempFotosBase64 = []; // Guarda as imagens comprimidas
let vistoriaEmVisualizacao = null;

// Obtém o nome do servidor logado na sessão principal do Cockpit
const currentUserName = sessionStorage.getItem('cockpit_user_realname') || 'Servidor Não Identificado';

// Listeners Base
document.addEventListener("DOMContentLoaded", () => {
    fetchVistorias();
    configurarBuscaCnpj(); 
});
document.getElementById('search-input').addEventListener('input', renderGrid);

// Escuta a mudança de tema do pai (Cockpit)
window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "THEME_CHANGE") {
        document.documentElement.classList.toggle("dark", e.data.theme === "dark");
    }
});

// NOTA: Requer que exista uma tabela 'vistorias' criada no Supabase com as colunas:
// id (uuid), empresa_nome (text), cnpj (text), endereco (text), representante (text), 
// area_total (numeric), servidor_nome (text), data_criacao (timestamp), ambientes (jsonb), fotos (jsonb)

async function fetchVistorias() {
    if (!supabase) {
        console.warn("Supabase não detectado. Modo de simulação ativado para fins de demonstração.");
        renderGrid();
        return;
    }

    const { data, error } = await supabase
        .from('vistorias')
        .select('*')
        .order('data_criacao', { ascending: false });

    if (error) {
        toast("Erro ao carregar vistorias", "error");
        console.error(error);
        return;
    }

    vistorias = data || [];
    renderGrid();
}

function renderGrid() {
    const grid = document.getElementById('vistorias-grid');
    const termo = document.getElementById('search-input').value.toLowerCase();
    grid.innerHTML = '';

    const filtradas = vistorias.filter(v => 
        v.empresa_nome.toLowerCase().includes(termo) || 
        v.cnpj.includes(termo)
    );

    if (filtradas.length === 0) {
        grid.innerHTML = `<div class="col-span-full p-8 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">Nenhuma vistoria encontrada.</div>`;
        return;
    }

    filtradas.forEach(v => {
        const isAprovada = v.area_total >= 40;
        const dataVis = new Date(v.data_criacao).toLocaleDateString('pt-BR');
        
        // Gera a grade de até 6 miniaturas 1x1 abaixo do CNPJ
        const fotosCards = (v.fotos || []).slice(0, 6).map(f => `
            <div class="aspect-square rounded overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                <img src="${f}" class="w-full h-full object-cover">
            </div>
        `).join('');

        const gridFotosHtml = fotosCards ? `
            <div class="grid grid-cols-6 gap-1 my-3">
                ${fotosCards}
            </div>
        ` : '';

        const card = document.createElement('div');
        card.className = `bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col group relative overflow-hidden`;
        
        card.innerHTML = `
            <div class="absolute top-0 left-0 w-full h-1 ${isAprovada ? 'bg-emerald-500' : 'bg-red-500'}"></div>
            <div class="flex justify-between items-start mb-2 mt-1">
                <span class="text-[10px] font-bold text-slate-400 uppercase tracking-widest">${dataVis}</span>
                <span class="text-[10px] uppercase font-bold tracking-widest px-2 py-0.5 rounded ${isAprovada ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}">
                    ${isAprovada ? 'Apta (>40m²)' : 'Inapta'}
                </span>
            </div>
            
            <h3 class="font-bold text-slate-800 dark:text-white leading-tight mb-1 group-hover:text-blue-600 transition-colors line-clamp-1" title="${v.empresa_nome}">${v.empresa_nome}</h3>
            <p class="text-xs text-slate-500 font-mono mb-2">${v.cnpj}</p>
            
            <!-- GRADE DE 6 IMAGENS 1X1 -->
            ${gridFotosHtml}
            
            <div class="mt-auto grid grid-cols-2 gap-2 text-xs border-t border-slate-100 dark:border-slate-800 pt-3">
                <div>
                    <p class="text-slate-400 uppercase text-[9px] font-bold">Área Total</p>
                    <p class="font-black text-slate-700 dark:text-slate-300">${v.area_total} m²</p>
                </div>
                <div>
                    <p class="text-slate-400 uppercase text-[9px] font-bold">Evidências</p>
                    <p class="font-medium text-slate-700 dark:text-slate-300">📸 ${v.fotos ? v.fotos.length : 0} fotos</p>
                </div>
            </div>
        `;
        card.onclick = () => abrirModalView(v.id);
        grid.appendChild(card);
    });
}

// ==========================================
// FORMULÁRIO E CALCULADORA DE ÁREA
// ==========================================

function abrirModalFormulario(id = null) {
    const form = document.getElementById('form-vistoria');
    form.reset();
    tempAmbientes = [];
    tempFotosBase64 = [];
    document.getElementById('f-id').value = '';
    
    if (id) {
        const v = vistorias.find(x => x.id === id);
        if (v) {
            document.getElementById('modal-title').textContent = 'Editar Vistoria';
            document.getElementById('f-id').value = v.id;
            document.getElementById('f-empresa').value = v.empresa_nome;
            document.getElementById('f-cnpj').value = v.cnpj;
            document.getElementById('f-endereco').value = v.endereco;
            document.getElementById('f-representante').value = v.representante || '';
            tempAmbientes = JSON.parse(JSON.stringify(v.ambientes || []));
            tempFotosBase64 = [...(v.fotos || [])];
        }
    } else {
        document.getElementById('modal-title').textContent = 'Nova Vistoria';
        adicionarAmbiente(); 
    }
    
    renderizarAmbientes();
    renderizarPreviewFotos();
    document.getElementById('modal-form').classList.remove('hidden');
}

function fecharModalFormulario() {
    document.getElementById('modal-form').classList.add('hidden');
}

function adicionarAmbiente() {
    const num = tempAmbientes.length + 1;
    tempAmbientes.push({ nome: `Sala ${num}`, largura: '', comprimento: '' });
    renderizarAmbientes();
    
    setTimeout(() => {
        const inputs = document.querySelectorAll('#lista-ambientes input[type="text"]');
        if (inputs.length > 0) {
            inputs[inputs.length - 3].focus();
        }
    }, 50);
}

function removerAmbiente(index) {
    tempAmbientes.splice(index, 1);
    renderizarAmbientes();
}

// Função auxiliar para converter "6,045" ou "6.045" em número decimal real para cálculo
function parseMedida(valor) {
    if (!valor) return 0;
    // Substitui vírgula por ponto e converte para float
    return parseFloat(valor.toString().replace(',', '.')) || 0;
}

function calcularAreaAtual() {
    return tempAmbientes.reduce((acc, curr) => acc + (parseMedida(curr.largura) * parseMedida(curr.comprimento)), 0);
}

function moverFoto(index, direcao) {
    const novoIndex = index + direcao;
    // Impede mover para fora dos limites do array
    if (novoIndex < 0 || novoIndex >= tempFotosBase64.length) return;
    
    // Troca a foto de posição no array
    const fotoMovida = tempFotosBase64.splice(index, 1)[0];
    tempFotosBase64.splice(novoIndex, 0, fotoMovida);
    
    // Atualiza o preview na tela
    renderizarPreviewFotos();
}

function renderizarAmbientes() {
    const lista = document.getElementById('lista-ambientes');
    lista.innerHTML = '';
    let somaTotal = 0;

    tempAmbientes.forEach((amb, index) => {
        const areaLinha = parseMedida(amb.largura) * parseMedida(amb.comprimento);
        somaTotal += areaLinha;
        
        // Definição correta da variável para saber se é a última linha
        const isLast = index === tempAmbientes.length - 1;

        lista.innerHTML += `
            <div class="flex flex-col sm:flex-row gap-2 items-end bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-700">
                <div class="flex-1 w-full">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Ambiente</label>
                    <input type="text" value="${amb.nome || ''}" oninput="tempAmbientes[${index}].nome = this.value" placeholder="Ex: Sala ADM" class="w-full px-2 py-1.5 rounded text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500">
                </div>
                <div class="w-full sm:w-20">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Larg (m)</label>
                    <input type="text" inputmode="decimal" value="${amb.largura !== undefined ? amb.largura : ''}" oninput="tempAmbientes[${index}].largura = this.value; calcularAreaTotalEmTempoReal()" class="w-full px-2 py-1.5 rounded text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500 text-center">
                </div>
                <div class="w-full sm:w-20">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Comp (m)</label>
                    <input type="text" inputmode="decimal" value="${amb.comprimento !== undefined ? amb.comprimento : ''}" 
                        oninput="tempAmbientes[${index}].comprimento = this.value; calcularAreaTotalEmTempoReal()" 
                        onkeydown="if(${isLast} && event.key === 'Tab' && !event.shiftKey) { event.preventDefault(); adicionarAmbiente(); }"
                        class="w-full px-2 py-1.5 rounded text-sm bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 outline-none focus:border-blue-500 text-center">
                </div>
                <button type="button" onclick="removerAmbiente(${index})" class="p-1.5 mb-0.5 text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 rounded transition-colors" tabindex="-1">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </button>
            </div>
        `;
    });

    atualizarDisplayAreaTotal(somaTotal);
}

// Função separada apenas para atualizar o visor da área sem redesenhar os inputs (evita perder o foco da digitação)
function calcularAreaTotalEmTempoReal() {
    const somaTotal = tempAmbientes.reduce((acc, curr) => acc + (parseMedida(curr.largura) * parseMedida(curr.comprimento)), 0);
    atualizarDisplayAreaTotal(somaTotal);
}

function atualizarDisplayAreaTotal(somaTotal) {
    const display = document.getElementById('area-total-display');
    if (!display) return;
    display.textContent = `${somaTotal.toLocaleString('pt-BR', {minimumFractionDigits: 2, maximumFractionDigits: 3})} m²`;
    display.className = `text-xl font-black ${somaTotal >= 40 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`;
}

// ==========================================
// PROCESSAMENTO DE FOTOS (COMPRESSÃO NO CLIENTE)
// ==========================================

function processarFotos(event) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    // Converte e comprime cada imagem usando FileReader + Canvas
    Array.from(files).forEach(file => {
        if (!file.type.startsWith('image/')) return;
        
        const reader = new FileReader();
        reader.onload = function(e) {
            const img = new Image();
            img.onload = function() {
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d');
                
                // Redimensionamento para no máximo 800px para não explodir o banco
                const MAX_WIDTH = 800;
                let width = img.width;
                let height = img.height;

                if (width > height && width > MAX_WIDTH) {
                    height *= MAX_WIDTH / width;
                    width = MAX_WIDTH;
                } else if (height > width && height > MAX_WIDTH) {
                    width *= MAX_WIDTH / height;
                    height = MAX_WIDTH;
                }

                canvas.width = width;
                canvas.height = height;
                ctx.drawImage(img, 0, 0, width, height);
                
                // Converte para Base64 JPEG com 70% de qualidade
                const base64 = canvas.toDataURL('image/jpeg', 0.7);
                tempFotosBase64.push(base64);
                renderizarPreviewFotos();
            }
            img.src = e.target.result;
        }
        reader.readAsDataURL(file);
    });
    
    // Limpa o input para permitir selecionar a mesma imagem novamente se precisar
    document.getElementById('foto-upload').value = '';
}

function removerFoto(index) {
    tempFotosBase64.splice(index, 1);
    renderizarPreviewFotos();
}

function renderizarPreviewFotos() {
    const grid = document.getElementById('fotos-preview');
    grid.innerHTML = '';
    
    if (tempFotosBase64.length === 0) {
        grid.innerHTML = `<p class="text-xs text-slate-400 col-span-full italic">Nenhuma foto adicionada.</p>`;
        return;
    }

    tempFotosBase64.forEach((base64, index) => {
        grid.innerHTML += `
            <div draggable="true" 
                 ondragstart="drag(event, ${index})" 
                 ondragover="allowDrop(event)" 
                 ondrop="drop(event, ${index})"
                 class="relative group aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-900 flex flex-col shadow-sm cursor-grab active:cursor-grabbing">
                
                <!-- Imagem (pointer-events-none evita que o arraste pegue na tag img em vez da div) -->
                <img src="${base64}" class="w-full h-full object-cover pointer-events-none">
                
                <!-- Número Indicador da Ordem -->
                <div class="absolute top-1 left-1 bg-slate-900/80 text-white text-[10px] font-black px-1.5 py-0.5 rounded shadow">
                    ${index + 1}
                </div>

                <!-- Barra inferior ao passar o mouse -->
                <div class="absolute inset-x-0 bottom-0 bg-slate-900/80 backdrop-blur-xs px-2 py-1 flex justify-between items-center opacity-0 group-hover:opacity-100 transition-opacity">
                    <span class="text-[9px] text-slate-300">Arraste para mover</span>
                    <button type="button" onclick="removerFoto(${index})" class="text-red-400 hover:text-red-200 font-bold text-xs" title="Excluir foto">
                        ✕
                    </button>
                </div>
            </div>
        `;
    });
}

// Funções de controle do Drag and Drop
function drag(ev, index) {
    ev.dataTransfer.setData("text/plain", index);
}

function allowDrop(ev) {
    ev.preventDefault(); // Necessário para permitir o "drop"
}

function drop(ev, targetIndex) {
    ev.preventDefault();
    const sourceIndex = parseInt(ev.dataTransfer.getData("text/plain"));
    
    if (!isNaN(sourceIndex) && sourceIndex !== targetIndex) {
        // Reorganiza o array movendo o item arrastado para a nova posição
        const fotoMovida = tempFotosBase64.splice(sourceIndex, 1)[0];
        tempFotosBase64.splice(targetIndex, 0, fotoMovida);
        
        // Atualiza a grade visual com a nova ordem e numeração correta
        renderizarPreviewFotos();
    }
}

// ==========================================
// SALVAR NO BANCO
// ==========================================

async function salvarVistoria() {
    const btn = document.getElementById('btn-salvar');
    const id = document.getElementById('f-id').value;
    const empresa = document.getElementById('f-empresa').value.trim();
    const cnpj = document.getElementById('f-cnpj').value.trim();
    const endereco = document.getElementById('f-endereco').value.trim();
    const representante = document.getElementById('f-representante').value.trim();
    
    if (!empresa || !cnpj || !endereco) {
        toast("Preencha todos os campos obrigatórios.", "error");
        return;
    }

    const ambientesValidos = tempAmbientes.filter(a => a.nome && a.largura && a.comprimento);
    const areaCalculada = calcularAreaAtual();

    if (areaCalculada === 0) {
        toast("Insira ao menos um ambiente com medidas válidas.", "error");
        return;
    }

    const payload = {
        empresa_nome: empresa,
        cnpj: cnpj,
        endereco: endereco,
        representante: representante,
        area_total: parseFloat(areaCalculada.toFixed(3)),
        servidor_nome: currentUserName,
        ambientes: ambientesValidos,
        fotos: tempFotosBase64
    };

    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
        if (supabase) {
            if (id) {
                const { error } = await supabase.from('vistorias').update(payload).eq('id', id);
                if (error) throw error;
                toast("Vistoria atualizada com sucesso!");
            } else {
                payload.data_criacao = new Date().toISOString();
                const { error } = await supabase.from('vistorias').insert([payload]);
                if (error) throw error;
                toast("Vistoria salva com sucesso!");
            }
            await fetchVistorias();
        }
        
        fecharModalFormulario();
        enviarLogPai(id ? "ATUALIZAR_VISTORIA" : "REGISTRAR_VISTORIA", { empresa: empresa, area: payload.area_total });

    } catch (err) {
        console.error(err);
        toast("Erro ao salvar vistoria.", "error");
    } finally {
        btn.textContent = 'Salvar Vistoria';
        btn.disabled = false;
    }
}

// ==========================================
// VISUALIZAÇÃO E EXPORTAÇÃO PARA WORD (.DOC)
// ==========================================

function abrirModalView(id) {
    vistoriaEmVisualizacao = vistorias.find(v => v.id === id);
    if (!vistoriaEmVisualizacao) return;

    const v = vistoriaEmVisualizacao;
    
    document.getElementById('view-empresa').textContent = v.empresa_nome;
    document.getElementById('view-cnpj').textContent = v.cnpj;
    document.getElementById('view-endereco').textContent = v.endereco;
    document.getElementById('view-representante').textContent = v.representante || '-';
    document.getElementById('view-servidor').textContent = v.servidor_nome;
    document.getElementById('view-data').textContent = `Realizada em: ${new Date(v.data_criacao).toLocaleDateString('pt-BR')} às ${new Date(v.data_criacao).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
    
    document.getElementById('view-area').textContent = `${v.area_total} m²`;
    document.getElementById('view-area').className = `text-lg font-black ${v.area_total >= 40 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`;

    // Monta lista de ambientes
    const listaAmb = document.getElementById('view-ambientes-lista');
    listaAmb.innerHTML = '';
    if (v.ambientes && v.ambientes.length > 0) {
        v.ambientes.forEach(a => {
            // Usa o parseMedida para calcular com decimais exatos e formata no padrão brasileiro
            const m2 = (parseMedida(a.largura) * parseMedida(a.comprimento)).toLocaleString('pt-BR', {minimumFractionDigits: 3, maximumFractionDigits: 3});
            listaAmb.innerHTML += `<li><span class="text-slate-700 dark:text-slate-300 font-bold">${a.nome}</span>: ${a.largura}m x ${a.comprimento}m = ${m2} m²</li>`;
        });
    } else {
        listaAmb.innerHTML = '<li>Medidas detalhadas não informadas.</li>';
    }

    // Monta fotos
    const fotosGrid = document.getElementById('view-fotos-grid');
    fotosGrid.innerHTML = '';
    if (v.fotos && v.fotos.length > 0) {
        v.fotos.forEach(fotoBase64 => {
            fotosGrid.innerHTML += `
                <div class="aspect-square rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700">
                    <img src="${fotoBase64}" class="w-full h-full object-cover">
                </div>
            `;
        });
    } else {
        fotosGrid.innerHTML = '<p class="text-xs text-slate-500 col-span-full">Nenhuma evidência capturada.</p>';
    }

    document.getElementById('btn-export-word').onclick = exportarWord;
    document.getElementById('btn-download-zip').onclick = baixarZipVistoria;
    document.getElementById('btn-abrir-preview').onclick = abrirModalPreviewRelatorio;
    document.getElementById('btn-edit-vistoria').onclick = () => {
        document.getElementById('modal-view').classList.add('hidden');
        abrirModalFormulario(v.id);
    };

    document.getElementById('modal-view').classList.remove('hidden');
}

function exportarWord() {
    const v = vistoriaEmVisualizacao;
    if (!v) return;

    // Pega as imagens do preview atual para checar se é paisagem ou retrato
    const domImgs = document.querySelectorAll('#view-fotos-grid img');
    const dataFormatada = new Date(v.data_criacao).toLocaleDateString('pt-BR');
    const horaFormatada = new Date(v.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const htmlContent = montarHtmlRelatorio(v, domImgs, dataFormatada, horaFormatada, gerarCorpoRelatorioPadrao(v, dataFormatada, horaFormatada));

    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Vistoria_${v.empresa_nome.substring(0, 15).replace(/\s/g, '_')}.doc`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    enviarLogPai("EXPORTAR_VISTORIA", { formato: "Word", empresa: v.empresa_nome });
    toast("Documento Word gerado com sucesso!");
}

// ==========================================
// MODELO OFICIAL DO RELATÓRIO (SEI Bahia)
// Estrutura e texto alinhados ao layout do
// "Relatório de Vistoria" emitido pela
// CGCF/DSL/SRL/SAEB (cabeçalho, tabela de
// identificação, corpo do relato e dupla
// assinatura).
// ==========================================

// Monta o texto padrão do relato (usado tanto na exportação direta quanto
// como base editável no modal de preview). Campos que o formulário ainda
// não coleta (matrícula do servidor, horário exato da diligência, números
// SEI de referência e nome do Coordenador Técnico) entram como marcadores
// entre colchetes, para serem preenchidos manualmente antes da geração
// final — assim como ocorre com o campo "[indicar o local/região]" do
// próprio Termo de Referência padrão.
function gerarCorpoRelatorioPadrao(v, dataFormatada, horaFormatada) {
    return `O objeto do presente Relatório consiste em atestar vistoria nas instalações físicas das empresas prestadoras de serviços terceirizados para seu registro no Cadastro de Fornecedores do Estado da Bahia - CAF, em atendimento ao Decreto Estadual nº 21.451/2022 (SEI nº [Nº SEI DO DECRETO]), o qual atribui tal competência a Coordenação de Gestão do Cadastro de Fornecedores – CGCF/DSL/SRL/SAEB.

Importante salientar que a vistoria das instalações físicas das empresas prestadoras de serviços terceirizados segue os critérios de qualificação técnica estabelecidos nos Termos de Referência padrão de serviços terceirizados (SEI nº [Nºs SEI DOS TERMOS DE REFERÊNCIA]), conforme diretrizes estabelecidas no Parecer PGE Nº PA 020 - 2025 (SEI nº [Nº SEI DO PARECER]).

b.1.1) Ao formular sua proposta, o licitante compromete-se a disponibilizar sede, filial ou escritório em [indicar o local/região], com: estrutura física dotada de área mínima de 40 (quarenta) metros quadrados, admitida a variação de 10%, para menos, mobiliário e equipamentos de informática e telefone; e estrutura administrativa com capacidade operacional para receber e solucionar qualquer demanda relacionada à execução dos serviços.

Em ${dataFormatada}, por volta das ${horaFormatada}, o(a) servidor(a) ${v.servidor_nome}, matrícula nº [MATRÍCULA], realizou diligência junto à empresa ${v.empresa_nome}, CNPJ Nº ${v.cnpj}, situada na ${v.endereco}, conforme endereço constante no Contrato Social (SEI nº [Nº SEI]) e Alvará de Funcionamento (SEI nº [Nº SEI]).

Ao chegar ao local, o(a) servidor(a) supracitado(a) foi recebido(a) pelo(a) Sr(a). ${v.representante || '[REPRESENTANTE]'}, que se identificou como responsável pela empresa e, em seguida, apresentou os documentos solicitados: Última Alteração Contratual (registrada na Junta Comercial em [DATA DO REGISTRO]) e Alvará de Funcionamento, os quais conferem com os registros do Cadastro de Fornecedores do Estado da Bahia.

Constatou-se que a empresa encontra-se em funcionamento, instalada em área de aproximadamente ${v.area_total} m², conforme registros fotográficos a seguir, tendo sido deferida após análise e verificação de que a estrutura física atende aos requisitos mínimos previstos no Termo de Referência padrão.`;
}

// Recebe o corpo textual (padrão ou já editado pelo usuário) e monta o HTML
// final do relatório, com cabeçalho institucional, tabela de identificação
// da empresa, fotos numeradas e bloco de dupla assinatura (Coordenador II
// e Coordenador Técnico), no mesmo layout do modelo oficial em SEI.
function montarHtmlRelatorio(v, domImgs, dataFormatada, horaFormatada, corpoTexto) {
    const paragrafosHtml = corpoTexto
        .split('\n\n')
        .map(bloco => `<p>${bloco.replace(/\n/g, '<br>')}</p>`)
        .join('');

    let htmlContent = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
            <meta charset='utf-8'>
            <title>Relatório de Vistoria</title>
            <style>
                body { font-family: 'Arial', sans-serif; font-size: 11pt; line-height: 1.5; text-align: justify; }
                table.cabecalho, table.identificacao { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
                table.cabecalho td, table.identificacao td { border: 1px solid #000; padding: 8px; vertical-align: middle; }
                table.cabecalho td.titulo, table.identificacao td.titulo { text-align: center; font-weight: bold; }
                .foto-container { text-align: center; margin-top: 20px; page-break-inside: avoid; }
                img { border: 1px solid #000; }
                .signature-table { width: 100%; margin-top: 60px; border-collapse: collapse; }
                .signature-table td { width: 50%; text-align: center; vertical-align: top; padding: 0 10px; }
            </style>
        </head>
        <body>
            <table class="cabecalho">
                <tr>
                    <td style="width:70%;">
                        <strong>GOVERNO DO ESTADO DA BAHIA</strong><br>
                        Secretaria da Administração do Estado da Bahia<br>
                        Coordenação de Gestão do Cadastro de Fornecedores - SAEB/SRL/DSL/CGCF
                    </td>
                    <td class="titulo" style="width:30%;">RELATÓRIO DE<br>VISTORIA</td>
                </tr>
            </table>

            <table class="identificacao">
                <tr>
                    <td style="width:70%;"><strong>Nome da Empresa/Fornecedor:</strong><br>${v.empresa_nome}</td>
                    <td style="width:30%;"><strong>CNPJ / CPF:</strong><br>${v.cnpj}</td>
                </tr>
            </table>

            ${paragrafosHtml}
            <br>
    `;

    if (v.fotos && v.fotos.length > 0) {
        v.fotos.forEach((foto, idx) => {
            // Padrão Paisagem: 280px (~metade da página do Word)
            let larguraPx = 280;

            if (domImgs && domImgs[idx]) {
                const w = domImgs[idx].naturalWidth || domImgs[idx].width || 1;
                const h = domImgs[idx].naturalHeight || domImgs[idx].height || 1;
                if (h > w) {
                    // Padrão Retrato (Vertical): 140px (~1/4 da página do Word)
                    larguraPx = 140;
                }
            }

            htmlContent += `
                <div class="foto-container">
                    <p><strong>FOTO ${String(idx + 1).padStart(2, '0')}</strong></p>
                    <img src="${foto}" width="${larguraPx}" style="height: auto;" />
                </div>
            `;
        });
    }

    htmlContent += `
            <br><br>
            <p>Considerando o exposto e não havendo mais nada a tratar, damos por encerrado o relatório e conclui-se o presente processo nesta unidade.</p>

            <p style="margin-top: 30px;">Atenciosamente,</p>

            <table class="signature-table">
                <tr>
                    <td>
                        _________________________________________<br>
                        <strong>${v.servidor_nome}</strong><br>
                        Coordenador(a) II - CGCF/DSL/SRL/SAEB
                    </td>
                    <td>
                        _________________________________________<br>
                        <strong>[NOME DO COORDENADOR TÉCNICO]</strong><br>
                        Coordenador(a) Técnico(a) - CGCF/DSL/SRL/SAEB
                    </td>
                </tr>
            </table>
        </body>
        </html>
    `;

    return htmlContent;
}

// ==========================================
// FUNÇÕES UTILITÁRIAS PARA O COCKPIT
// ==========================================

function toast(message, type = 'success') {
    // Tenta usar o Toast global do Cockpit pai, se disponível
    if (window.parent && typeof window.parent.showToast === 'function') {
        window.parent.showToast(message, type);
        return;
    }

    // Fallback moderno e isolado (Garante que nunca usará alert nativo)
    let container = document.getElementById('local-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'local-toast-container';
        container.className = 'fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const el = document.createElement('div');
    const bgColors = type === 'error' 
        ? 'bg-red-600 text-white border border-red-500 shadow-red-900/20' 
        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-700 dark:border-slate-200';
    
    el.className = `pointer-events-auto px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all transform translate-y-2 opacity-0 ${bgColors}`;
    el.textContent = message;

    container.appendChild(el);

    // Animação de entrada suave
    setTimeout(() => {
        el.classList.remove('translate-y-2', 'opacity-0');
    }, 10);

    // Remove automaticamente após 3.5 segundos com animação de saída
    setTimeout(() => {
        el.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

function enviarLogPai(acao, detalhes) {
    if (window.parent !== window) {
        window.parent.postMessage({
            type: "REGISTRAR_LOG",
            payload: {
                acao: acao,
                detalhes: detalhes,
                appOrigem: "APP_VISTORIA"
            }
        }, "*");
    }
}

// ==========================================
// MÁSCARA E BUSCA AUTOMÁTICA DE CNPJ
// ==========================================

function configurarBuscaCnpj() {
    const inputCnpj = document.getElementById('f-cnpj');
    
    if (!inputCnpj) return;

    inputCnpj.addEventListener('input', async function (e) {
        // Remove tudo que não for número
        let valorLimpo = e.target.value.replace(/\D/g, '');
        
        // Limita a 14 dígitos (tamanho máximo de um CNPJ)
        if (valorLimpo.length > 14) valorLimpo = valorLimpo.slice(0, 14);

        // Aplica a máscara visual (00.000.000/0000-00)
        let mascarado = valorLimpo;
        if (valorLimpo.length > 2) mascarado = valorLimpo.replace(/^(\d{2})(\d)/, "$1.$2");
        if (valorLimpo.length > 5) mascarado = mascarado.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
        if (valorLimpo.length > 8) mascarado = mascarado.replace(/\.(\d{3})(\d)/, ".$1/$2");
        if (valorLimpo.length > 12) mascarado = mascarado.replace(/(\d{4})(\d)/, "$1-$2");

        // Atualiza o input com a máscara
        e.target.value = mascarado;

        // Se o usuário digitou os 14 números completos, dispara a busca
        if (valorLimpo.length === 14) {
            await buscarRazaoSocial(valorLimpo);
        }
    });
}

async function buscarRazaoSocial(cnpjLimpo) {
    const inputEmpresa = document.getElementById('f-empresa');
    const inputEndereco = document.getElementById('f-endereco');

    const placeholderOriginalEmpresa = inputEmpresa.placeholder;
    const placeholderOriginalEndereco = inputEndereco ? inputEndereco.placeholder : '';

    inputEmpresa.placeholder = "Buscando...";
    if (inputEndereco) inputEndereco.placeholder = "Buscando endereço...";

    let razaoEncontradaLocal = false;

    // 1. Busca prioritária e imediata no banco local (Supabase)
    if (supabase) {
        try {
            const { data: compData, error } = await supabase
                .from('companies')
                .select('razao_social')
                .eq('cnpj', cnpjLimpo)
                .maybeSingle();

            if (!error && compData && compData.razao_social) {
                inputEmpresa.value = compData.razao_social;
                razaoEncontradaLocal = true;
            }
        } catch (e) {
            console.warn("Erro na consulta local do CNPJ:", e);
        }
    }

    // 2. Consulta acessória na BrasilAPI (Endereço completo + contingência da Razão Social)
    try {
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);

        if (response.ok) {
            const data = await response.json();

            // Se o banco local não tinha a razão social, usa a da API
            if (!razaoEncontradaLocal && data.razao_social) {
                inputEmpresa.value = data.razao_social;
            }

            // Monta o endereço completo oficial
            if (inputEndereco) {
                const partes = [];

                const tipoLog = data.descricao_tipo_de_logradouro ? `${data.descricao_tipo_de_logradouro} ` : '';
                const logradouro = data.logradouro ? `${tipoLog}${data.logradouro}`.trim() : '';
                if (logradouro) partes.push(logradouro);

                const numLimpo = data.numero ? data.numero.replace(/^0+/, '') : '';
                if (numLimpo) partes.push(`Nº ${numLimpo}`);
                else if (data.numero) partes.push(`Nº ${data.numero}`);

                if (data.complemento && data.complemento.trim()) {
                    partes.push(data.complemento.trim());
                }

                if (data.bairro && data.bairro.trim()) {
                    partes.push(data.bairro.trim());
                }

                if (data.municipio && data.uf) {
                    partes.push(`${data.municipio} - ${data.uf}`);
                }

                if (data.cep) {
                    const c = data.cep.replace(/\D/g, '');
                    const cepFmt = c.length === 8 ? `${c.slice(0, 5)}-${c.slice(5)}` : data.cep;
                    partes.push(`CEP: ${cepFmt}`);
                }

                if (partes.length > 0) {
                    inputEndereco.value = partes.join(', ');
                }
            }
        } else if (!razaoEncontradaLocal) {
            inputEmpresa.placeholder = "Razão social não encontrada";
        }
    } catch (err) {
        console.warn("BrasilAPI indisponível ou lenta, mantendo dados locais:", err);
        if (!razaoEncontradaLocal) {
            inputEmpresa.placeholder = "Razão social não encontrada";
        }
    } finally {
        if (inputEmpresa.value) inputEmpresa.placeholder = placeholderOriginalEmpresa;
        if (inputEndereco && inputEndereco.value) inputEndereco.placeholder = placeholderOriginalEndereco;
    }
}

async function baixarZipVistoria() {
    const v = vistoriaEmVisualizacao;
    if (!v) return;

    if (typeof JSZip === 'undefined') {
        toast("Biblioteca JSZip não carregada.", "error");
        return;
    }

    toast("Compactando arquivos em ZIP...", "success");
    const zip = new JSZip();
    
    // Nome do arquivo ZIP com o nome completo da empresa (sanitizado para evitar caracteres inválidos)
    const nomeZipCompleto = `${v.empresa_nome.replace(/[^a-zA-Z0-9]/g, '_')}.zip`;
    // Primeiro nome da empresa para o prefixo das imagens (ex: EXXO_01.jpg)
    const primeiroNome = v.empresa_nome.trim().split(' ')[0].replace(/[^a-zA-Z0-9]/g, '_');

    // Adiciona as imagens numeradas na ordem correta
    if (v.fotos && v.fotos.length > 0) {
        v.fotos.forEach((fotoBase64, idx) => {
            const base64Data = fotoBase64.replace(/^data:image\/jpeg;base64,/, "");
            const numStr = String(idx + 1).padStart(2, '0');
            zip.file(`${primeiroNome}_${numStr}.jpg`, base64Data, {base64: true});
        });
    }

    // Cria o conteúdo do relatório em TXT
    const textoRelatorio = `RELATÓRIO DE VISTORIA - ${new Date(v.data_criacao).getFullYear()}
--------------------------------------------------
Empresa: ${v.empresa_nome}
CNPJ: ${v.cnpj}
Endereço: ${v.endereco}
Representante: ${v.representante || '-'}
Área Total Aferida: ${v.area_total} m²
Servidor Responsável: ${v.servidor_nome}
Data da Vistoria: ${new Date(v.data_criacao).toLocaleDateString('pt-BR')}

--- AMBIENTES AFERIDOS ---
${(v.ambientes || []).map(a => `• ${a.nome}: ${a.largura}m x ${a.comprimento}m`).join('\n')}

--- RELATO OFICIAL ---
O objeto deste Relatório de Vistoria consiste em realizar vistoria nas instalações físicas das empresas prestadoras de serviços terceirizados para seu registro no Cadastro Unificado de Fornecedores do Estado da Bahia – CAF, em atendimento ao Decreto Estadual nº 21.451/2022.
`;

    zip.file("relatorio_vistoria.txt", textoRelatorio);

    // Gera o Blob do ZIP e dispara o download automaticamente
    const content = await zip.generateAsync({type: "blob"});
    const url = URL.createObjectURL(content);
    const link = document.createElement('a');
    link.href = url;
    link.download = nomeZipCompleto;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    toast("Arquivo ZIP baixado com sucesso!");
    enviarLogPai("BAIXAR_ZIP_VISTORIA", { empresa: v.empresa_nome });
}

// 1. Abre o modal preenchendo a textarea com o texto padrão customizado com os dados da vistoria
function abrirModalPreviewRelatorio() {
    const v = vistoriaEmVisualizacao;
    if (!v) return;

    const dataFormatada = new Date(v.data_criacao).toLocaleDateString('pt-BR');
    const horaFormatada = new Date(v.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    // Monta o texto base editável a partir do mesmo modelo oficial usado na
    // exportação direta. O usuário pode revisar/preencher os marcadores
    // entre colchetes (matrícula, números SEI, coordenador técnico etc.)
    // antes de gerar o Word.
    const textoPadrao = gerarCorpoRelatorioPadrao(v, dataFormatada, horaFormatada);

    document.getElementById('txt-preview-editavel').value = textoPadrao;
    
    // Configura a ação do botão dentro do modal de preview
    document.getElementById('btn-gerar-word-editado').onclick = exportarWordEditado;

    document.getElementById('modal-view').classList.add('hidden');
    document.getElementById('modal-preview-relatorio').classList.remove('hidden');
}

// 2. Usa o texto (editado ou não) da textarea e gera o Word no layout oficial
function exportarWordEditado() {
    const v = vistoriaEmVisualizacao;
    if (!v) return;

    const textoEditado = document.getElementById('txt-preview-editavel').value;
    const domImgs = document.querySelectorAll('#view-fotos-grid img');
    const dataFormatada = new Date(v.data_criacao).toLocaleDateString('pt-BR');
    const horaFormatada = new Date(v.data_criacao).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

    const htmlContent = montarHtmlRelatorio(v, domImgs, dataFormatada, horaFormatada, textoEditado);

    const blob = new Blob(['\ufeff', htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Vistoria_${v.empresa_nome.substring(0, 15).replace(/\s/g, '_')}.doc`;
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    document.getElementById('modal-preview-relatorio').classList.add('hidden');
    enviarLogPai("EXPORTAR_WORD_EDITADO", { formato: "Word", empresa: v.empresa_nome });
    toast("Documento Word personalizado gerado com sucesso!");
}