import { calcularFamiliasParaCnae } from './motor_cnae.js';

var supabase = window.supabaseClient;


let familyData = [];
let cnaeDictionary = [];
let relacionadosDict = [];
let validDocs = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 6;
let sugPage = 1;
const sugPerPage = 8;
let currentSugList = [];
let selectedSug = new Set();
let lastEditedIndex = null;
let ramosDictionary = [];
let descricoesRamos = [];
let sugestoesCarregadas = [];
let iaLoteEmAndamento = false;
let itensFamiliaCodigoAtual = null;
let itensFamiliaPage = 1;
let itensFamiliaTermoBusca = '';
let itensFamiliaDebounceTimer = null;
const ITENS_FAMILIA_POR_PAGINA = 20;

const grid = document.getElementById('family-grid');
const searchInput = document.getElementById('search-family');
const typeFilter = document.getElementById('filter-type');
const terceirizadoFilter = document.getElementById('filter-terceirizado');

// ==========================================
// CONTROLO DE ACESSO POR PERFIL (USER / ADMIN / GESTOR CGCF)
// ==========================================
function applyFamilyRoleRestrictions() {
    const role = sessionStorage.getItem("cockpit_user_role");
    const coordenacao = sessionStorage.getItem("cockpit_user_coordenacao");
    const isResponsavel = sessionStorage.getItem("cockpit_user_responsavel") === "true";

    let cssRules = "";

    // 1. Regra para botões exclusivos de Admin (Ex: Editar, Apagar)
    if (role !== "admin") {
        cssRules += `\n.admin-only { display: none !important; }`;
    }

    // 2. Regra para botões de Gestão da CGCF (Permite Admin como bypass de segurança)
    const isGestorCGCF = (coordenacao === "CGCF" && isResponsavel) || role === "admin";
    
    if (!isGestorCGCF) {
        cssRules += `\n.cgcf-manager-only { display: none !important; }`;
    }

    // Injeta as regras de ocultação no cabeçalho do documento
    if (cssRules !== "") {
        const style = document.createElement("style");
        style.id = "role-restrictions-style";
        style.innerHTML = cssRules;
        document.head.appendChild(style);
    }
}
applyFamilyRoleRestrictions(); // Executa imediatamente



function normalizarCodigoCnae(codigo) {
    return (codigo || '').replace(/\D/g, '');
}

// ==========================================
// MOTOR LOCAL DE SUGESTÃO DE CNAE (mesma lógica validada do motor_cnae.js:
// stopwords + fronteira de palavra + guarda de "exceto" + expansão só na
// direção Principal -> Relacionadas — evita os bugs que já achamos e
// corrigimos por lá: "de" em 89% dos CNAEs, "gas" escondido em "produtos",
// "consultoria" puxando "publicidade" na direção reversa)
// ==========================================
const STOPWORDS_SUGESTAO_MODAL = new Set([
    'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos',
    'para', 'por', 'com', 'sem', 'outros', 'outras', 'outro', 'outra',
    'nao', 'especificados', 'especificado', 'especializado', 'especializados',
    'anteriormente', 'geral', 'gerais', 'uso', 'usos', 'diversos', 'diversas',
    'exceto', 'inclusive', 'atividades', 'atividade', 'produtos', 'produto',
    'comercio', 'servicos', 'servico', 'fabricacao', 'varejista', 'varejo',
    'atacadista', 'atacado', 'a', 'o', 'os', 'as', 'ou', 'que', 'se',
    'seu', 'sua', 'seus', 'suas',
]);

const SECOES_SERVICO_BLOQUEADAS_MODAL = new Set(['F', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']);
const PREFIXO_SERVICO_BLOQUEADO_MODAL = /^(servicos?\s+de|manutencao|reparacao|instalacao|montagem|assistencia\s+tecnica)\b/;

function normalizarParaBuscaModal(t) {
    return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

function temPalavraModal(haystack, frase) {
    if (!frase) return false;
    const escaped = frase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(haystack);
}

// Tipo M (material) não pode receber CNAE de serviço — mesma regra do motor
function candidatoBloqueadoModal(cnae, tipoFamilia) {
    if (tipoFamilia !== 'M') return false;
    if (cnae.SECAO && SECOES_SERVICO_BLOQUEADAS_MODAL.has(cnae.SECAO)) return true;
    return PREFIXO_SERVICO_BLOQUEADO_MODAL.test(normalizarParaBuscaModal(cnae.DESCRIÇÃO));
}

function calcularSugestoesCnaeParaFamilia(familia, limite = 8) {
    const norm = normalizarParaBuscaModal(familia.Descrição);
    const palavras = norm.match(/[a-z]+/g) || [];
    const termos = new Set(palavras.filter(w => !STOPWORDS_SUGESTAO_MODAL.has(w) && w.length > 2));

    (relacionadosDict || []).forEach(item => {
        const principal = normalizarParaBuscaModal(item.Principal);
        if (temPalavraModal(norm, principal)) {
            const relacionadas = normalizarParaBuscaModal(item.Relacionadas).split(', ').filter(Boolean);
            relacionadas.forEach(r => termos.add(r));
        }
    });

    const jaVinculados = new Set((familia.CNAEs || []).map(c => normalizarCodigoCnae(c.codigo)));

    return cnaeDictionary
        .filter(c => !jaVinculados.has(normalizarCodigoCnae(c.CNAE)))
        .filter(c => !candidatoBloqueadoModal(c, familia.Tipo))
        .map(cnae => {
            const cnaeNormFull = normalizarParaBuscaModal(cnae.DESCRIÇÃO);
            const cnaeNorm = cnaeNormFull.split(/\bexceto\b/)[0];
            let score = 0;
            termos.forEach(termo => {
                if (temPalavraModal(cnaeNorm, termo)) score += 2;
                if (cnaeNorm.startsWith(termo)) score += 3;
            });
            return { CNAE: cnae.CNAE, DESCRIÇÃO: cnae.DESCRIÇÃO, score };
        })
        .filter(c => c.score >= 4)
        .sort((a, b) => b.score - a.score)
        .slice(0, limite);
}

function escapeAttrModal(str) {
    return (str || '').replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

// ==========================================
// MODAL DE DETALHE DA FAMÍLIA (substitui a expansão inline no card)
// ==========================================
window.abrirModalDetalheFamilia = (index) => {
    const item = familyData[index];
    if (!item) return;

    let modal = document.getElementById('modal-detalhe-familia');
    if (modal) modal.remove();

    const isTerceirizado = item.Terceirizado === 'Sim';
    const exigidos = item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"] || [];
    const elegiveis = item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"] || [];

    modal = document.createElement('div');
    modal.id = 'modal-detalhe-familia';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[130] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[88vh] flex flex-col overflow-hidden animate-scale-up border border-slate-200 dark:border-slate-700">
            <div class="flex justify-between items-start p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                <div class="min-w-0">
                    <div class="flex gap-2 mb-2">
                        <span class="text-[9px] font-bold px-2 py-1 rounded ${item.Tipo === 'S' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400'} uppercase tracking-tighter">
                            ${item.Tipo === 'S' ? 'Serviço' : 'Material'}
                        </span>
                        ${isTerceirizado ? `<span class="text-[9px] font-bold px-2 py-1 rounded bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 uppercase tracking-tighter">Terceirizado</span>` : ''}
                    </div>
                    <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 leading-tight">${item.Descrição}</h3>
                    <p class="text-xs font-mono text-slate-500 dark:text-slate-400 mt-1">Família ${item.Família}</p>
                </div>
                <div class="flex gap-1 shrink-0">
                    <button onclick="abrirModalItensFamilia('${item.Família}')" class="text-slate-400 hover:text-purple-500 transition-colors p-1.5" title="Ver itens desta família">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4"></path></svg>
                    </button>
                    <button onclick="document.getElementById('modal-detalhe-familia').remove(); openFamilyForm(${index});" class="cgcf-manager-only text-slate-400 hover:text-blue-500 transition-colors p-1.5" title="Editar Família">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"><path fill-rule="evenodd" clip-rule="evenodd" d="M20.8477 1.87868C19.6761 0.707109 17.7766 0.707105 16.605 1.87868L2.44744 16.0363C2.02864 16.4551 1.74317 16.9885 1.62702 17.5692L1.03995 20.5046C0.760062 21.904 1.9939 23.1379 3.39334 22.858L6.32868 22.2709C6.90945 22.1548 7.44285 21.8693 7.86165 21.4505L22.0192 7.29289C23.1908 6.12132 23.1908 4.22183 22.0192 3.05025L20.8477 1.87868ZM18.0192 3.29289C18.4098 2.90237 19.0429 2.90237 19.4335 3.29289L20.605 4.46447C20.9956 4.85499 20.9956 5.48815 20.605 5.87868L17.9334 8.55027L15.3477 5.96448L18.0192 3.29289ZM13.9334 7.3787L3.86165 17.4505C3.72205 17.5901 3.6269 17.7679 3.58818 17.9615L3.00111 20.8968L5.93645 20.3097C6.13004 20.271 6.30784 20.1759 6.44744 20.0363L16.5192 9.96448L13.9334 7.3787Z" fill="currentColor"/></svg>
                    </button>
                    <button onclick="document.getElementById('modal-detalhe-familia').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors p-1.5">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>
            </div>

            <div class="p-4 overflow-y-auto flex-1 flex flex-col gap-4 custom-scrollbar">
                ${(exigidos.length > 0 || elegiveis.length > 0) ? `
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    ${renderDocList("Obrigatórios", exigidos, "text-red-500")}
                    ${renderDocList("Elegíveis", elegiveis, "text-emerald-600")}
                </div>` : ''}

                <div class="border-t border-slate-200 dark:border-slate-700 pt-4">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-[10px] font-bold text-blue-500 uppercase tracking-widest">CNAEs Relacionados</p>
                        <button type="button" id="btn-sugerir-cnae-modal" onclick="rodarSugestaoCnaeModal(${index})"
                            class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            Sugerir CNAE
                        </button>
                    </div>
                    <div id="lista-cnaes-familia-modal" class="space-y-1.5">
                        ${(item.CNAEs || []).length > 0 ? item.CNAEs.map(c => `
                        <div class="flex items-center justify-between gap-2 text-[11px] bg-slate-50 dark:bg-slate-850 p-2 rounded border dark:border-slate-800 dark:text-slate-300">
                            <div onclick="copyToClipboard(event, '${c.codigo} | ${c.descricao}')" class="flex-1 cursor-copy min-w-0" title="Copiar CNAE">
                                <span class="text-blue-600 dark:text-blue-400 font-bold">${c.codigo}</span>
                                <span class="mx-1 text-slate-300">|</span>${c.descricao}
                            </div>
                            <button type="button" onclick="event.stopPropagation(); reabrirBuscaIbgeDireto('${c.codigo}')"
                                class="shrink-0 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="Ver detalhes no IBGE">
                                <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                            </button>
                        </div>
                        `).join('') : '<p class="text-[10px] italic text-gray-500 dark:text-gray-400 text-center py-2">Nenhum CNAE cadastrado.</p>'}
                    </div>
                    <div id="sugestoes-cnae-modal-container" class="mt-3"></div>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.rodarSugestaoCnaeModal = (index) => {
    const item = familyData[index];
    const btn = document.getElementById('btn-sugerir-cnae-modal');
    const container = document.getElementById('sugestoes-cnae-modal-container');
    if (!item || !container) return;
    if (btn) btn.disabled = true;

    const candidatos = calcularSugestoesCnaeParaFamilia(item, 8);

    if (candidatos.length === 0) {
        container.innerHTML = `<p class="text-[11px] italic text-slate-400 dark:text-slate-500 text-center py-2">O motor local não achou candidato claro pra essa descrição.</p>`;
        if (btn) btn.disabled = false;
        return;
    }

    container.innerHTML = `
        <div class="bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800 rounded-lg p-3">
            <div class="flex items-center justify-between mb-2">
                <p class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 uppercase tracking-widest">Candidatos do motor local</p>
                <button type="button" onclick="analisarSugestoesModalComIA(${index})"
                    class="text-[10px] font-bold uppercase tracking-wider text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1">
                    🤖 Analisar com IA
                </button>
            </div>
            <div id="lista-candidatos-modal" class="space-y-1.5">
                ${candidatos.map((c, i) => `
                <div id="candidato-modal-${i}" data-codigo="${c.CNAE}" data-descricao="${escapeAttrModal(c.DESCRIÇÃO)}" class="flex items-center justify-between gap-2 text-[11px] bg-white dark:bg-slate-800 p-2 rounded border border-slate-200 dark:border-slate-700">
                    <div class="flex-1 min-w-0">
                        <span class="text-blue-600 dark:text-blue-400 font-bold">${c.CNAE}</span>
                        <span class="text-slate-400 dark:text-slate-500 mx-1">(score ${c.score})</span>
                        <span class="text-slate-700 dark:text-slate-300">${c.DESCRIÇÃO}</span>
                        <div class="ia-resultado-candidato"></div>
                    </div>
                    <button type="button" onclick="vincularCandidatoModal(${index}, ${i})"
                        class="shrink-0 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded transition-colors">
                        Vincular
                    </button>
                </div>
                `).join('')}
            </div>
        </div>
    `;
    if (btn) btn.disabled = false;
};

window.analisarSugestoesModalComIA = async (index) => {
    const item = familyData[index];
    const candidatosEls = document.querySelectorAll('#lista-candidatos-modal [id^="candidato-modal-"]');
    if (!item || candidatosEls.length === 0) return;

    const pares = Array.from(candidatosEls).map((el, i) => ({
        id: i,
        familia: item.Descrição,
        cnae: el.dataset.descricao,
        acao: 'adicionar'
    }));

    if (typeof showToast === 'function') showToast(`Analisando ${pares.length} candidatos com IA...`);

    try {
        const { data, error } = await supabase.functions.invoke('analisar-afinidade-cnae', { body: { pares } });
        if (error) throw error;
        if (!Array.isArray(data)) throw new Error('Resposta inesperada da IA.');

        data.forEach(r => {
            const el = document.getElementById(`candidato-modal-${r.id}`);
            if (!el) return;
            const alvo = el.querySelector('.ia-resultado-candidato');
            if (!alvo) return;
            let cor = 'text-red-600 dark:text-red-400';
            if (r.score >= 8) cor = 'text-emerald-600 dark:text-emerald-400';
            else if (r.score >= 4) cor = 'text-amber-600 dark:text-amber-400';
            alvo.innerHTML = `<span class="block mt-1 ${cor} text-[10px]">🤖 IA: ${r.score}/10 — ${r.justificativa}</span>`;
        });
        if (typeof showToast === 'function') showToast('Análise da IA concluída.');
    } catch (err) {
        console.error(err);
        if (typeof showError === 'function') showError('Erro na IA', err.message || 'Falha ao analisar com IA.');
    }
};

window.vincularCandidatoModal = async (indexFamilia, indexCandidato) => {
    const item = familyData[indexFamilia];
    const linha = document.getElementById(`candidato-modal-${indexCandidato}`);
    if (!item || !linha) return;

    const codigo = linha.dataset.codigo;
    const descricao = linha.dataset.descricao;

    if (item.CNAEs && item.CNAEs.some(c => normalizarCodigoCnae(c.codigo) === normalizarCodigoCnae(codigo))) {
        if (typeof showToast === 'function') showToast('Esse CNAE já está vinculado.');
        return;
    }

    const btn = linha.querySelector('button');
    if (btn) { btn.disabled = true; btn.textContent = '...'; }

    try {
        if (!item.CNAEs) item.CNAEs = [];
        item.CNAEs.push({ codigo, descricao });

        const payloadSupa = {
            familia: item["Família"], descricao: item["Descrição"], tipo: item["Tipo"],
            terceirizado: item["Terceirizado"], documentos_exigidos: item["Documentos Exigidos"],
            documentos_elegiveis: item["Documentos Elegíveis"], cnaes: item.CNAEs, ramo: item["Ramo"]
        };
        const { error } = await supabase.from('qualificacao_tecnica').upsert([payloadSupa]);
        if (error) throw error;

        if (!cnaeDictionary.some(c => c.CNAE === codigo)) {
            cnaeDictionary.push({ CNAE: codigo, DESCRIÇÃO: descricao });
        }

        if (typeof showToast === 'function') showToast('CNAE vinculado com sucesso!');
        linha.remove();
        applyFilters(false);
        enviarStatsParaHome();

        const listaTopo = document.getElementById('lista-cnaes-familia-modal');
        if (listaTopo) {
            const vazio = listaTopo.querySelector('p.italic');
            if (vazio) vazio.remove();
            listaTopo.insertAdjacentHTML('beforeend', `
                <div class="flex items-center justify-between gap-2 text-[11px] bg-slate-50 dark:bg-slate-850 p-2 rounded border dark:border-slate-800 dark:text-slate-300">
                    <div onclick="copyToClipboard(event, '${codigo} | ${descricao}')" class="flex-1 cursor-copy min-w-0" title="Copiar CNAE">
                        <span class="text-blue-600 dark:text-blue-400 font-bold">${codigo}</span>
                        <span class="mx-1 text-slate-300">|</span>${descricao}
                    </div>
                    <button type="button" onclick="event.stopPropagation(); reabrirBuscaIbgeDireto('${codigo}')"
                        class="shrink-0 p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded transition-colors" title="Ver detalhes no IBGE">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </button>
                </div>`);
        }
    } catch (err) {
        console.error(err);
        if (typeof showError === 'function') showError('Erro', 'Falha ao vincular o CNAE.');
        item.CNAEs = item.CNAEs.filter(c => c.codigo !== codigo);
        if (btn) { btn.disabled = false; btn.textContent = 'Vincular'; }
    }
};

// ==========================================
// LÓGICA DO PAINEL DE VALIDAÇÃO (ADMIN / GESTOR CGCF)
// ==========================================
window.carregarContadorSugestoes = async () => {
    const role = sessionStorage.getItem("cockpit_user_role");
    const coordenacao = sessionStorage.getItem("cockpit_user_coordenacao");
    const isResponsavel = sessionStorage.getItem("cockpit_user_responsavel") === "true";

    const isGestorCGCF = (coordenacao === "CGCF" && isResponsavel) || role === "admin";

    // Só busca no banco se for Gestor da CGCF ou Admin
    if (!isGestorCGCF) return;

    const badge = document.getElementById('badge-sugestoes');
    if (!badge) return;

    const { count, error } = await supabase
        .from('sugestoes_cnae_familia')
        .select('*', { count: 'exact', head: true })
        .eq('status', 'pendente');

    if (!error && count > 0) {
        badge.innerText = count;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }
};

// --- LISTENERS DE TEMA (DARK MODE EM TEMPO REAL) ---
function applyTheme(theme) {
    if (theme === "dark") {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
}

// Ouve o comando do Cockpit (pai) em tempo real via postMessage
window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "THEME_CHANGE") {
        applyTheme(event.data.theme);
    }
});

// --- INICIALIZAÇÃO ---
async function initApp() {
    try {
        // 1. Função auxiliar que burla o limite e busca TUDO paginando automaticamente
        const fetchAllQualificacoes = async () => {
            let allData = [];
            let from = 0;
            const step = 1000;
            
            while (true) {
                const { data, error } = await supabase
                    .from('qualificacao_tecnica')
                    .select('*')
                    .order('familia', { ascending: true })
                    .range(from, from + step - 1); // Ex: 0-999, 1000-1999...
                
                if (error) throw error;
                
                allData.push(...data);
                
                // Se vieram menos de 1000, significa que acabou de ler o banco
                if (data.length < step) break; 
                
                from += step;
            }
            return { data: allData, error: null };
        };

        // Passamos a nossa função paginada em vez do .select() simples
        const supaPromise = fetchAllQualificacoes();

        // 2. Disparamos a busca do banco e de TODOS os JSONs em paralelo!
        const [supaResult, respCnaes, respDocs, respRamos, respDescRamos, respRelacionados] = await Promise.all([
            supaPromise,
            fetch('cnae.json'),
            fetch('../gerador/docs-qual-tec.json').catch(() => null),
            fetch('./archives/ramos_classificados.json').catch(() => null),
            fetch('./archives/descricao_ramos.json').catch(() => null),
            fetch('relacionados_dictionary.json').catch(() => null)
        ]);

        // Verificação de erro do Supabase
        const { data: supaData, error: supaError } = supaResult;
        if (supaError) throw supaError;

        // 3. Mapeia as colunas do banco (agora com as 1119 famílias garantidas)
        familyData = supaData.map(item => ({
            "Família": item.familia,
            "Descrição": item.descricao,
            "Tipo": item.tipo,
            "Terceirizado": item.terceirizado,
            "Documentos Exigidos": item.documentos_exigidos || [],
            "Documentos Elegíveis": item.documentos_elegiveis || [],
            "CNAEs": item.cnaes || [],
            "Ramo": item.ramo || {}
        }));

        // 4. Processa os retornos e converte para JSON
        if (respRamos && respRamos.ok) window.ramosDictionary = await respRamos.json();
        if (respDescRamos && respDescRamos.ok) descricoesRamos = await respDescRamos.json();
        if (respRelacionados && respRelacionados.ok) relacionadosDict = await respRelacionados.json(); // <-- Processado aqui
        if (!respCnaes.ok) throw new Error("Falha ao carregar dicionário CNAE local.");

        cnaeDictionary = await respCnaes.json();

        // 5. Sincroniza CNAEs conhecidos
        const cnaesConhecidos = new Set(cnaeDictionary.map(c => c.CNAE));
        familyData.forEach(familia => {
            if (familia.CNAEs) {
                familia.CNAEs.forEach(c => {
                    if (c && c.codigo && !cnaesConhecidos.has(c.codigo)) {
                        cnaeDictionary.push({
                            "CNAE": c.codigo,
                            "DESCRIÇÃO": c.descricao
                        });
                        cnaesConhecidos.add(c.codigo);
                    }
                });
            }
        });

        if (respDocs && respDocs.ok) {
            validDocs = await respDocs.json();
            populateDocsDatalist();
        }
        
        applyFilters();
        updateDatalist(); 
        checkWelcomeModal();
        enviarStatsParaHome();

    } catch (err) {
        console.error("Erro crítico na inicialização:", err);
        grid.innerHTML = `<p class="col-span-full text-center py-20 text-red-500 font-bold">
            Erro ao carregar dados. Verifique sua conexão.
        </p>`;
    }
}

function populateDocsDatalist() {
    const datalist = document.getElementById('valid-docs-list');
    if (!datalist) return;
    datalist.innerHTML = validDocs.map(doc => `<option value="${doc.nome}"></option>`).join('');
}

// --- FILTROS E RENDERIZAÇÃO ---
function applyFilters(resetPage = true) {
    const term = searchInput.value.toLowerCase();
    const type = typeFilter.value;
    const onlyTerceirizado = terceirizadoFilter.checked;

    const cnaeOperador = document.getElementById('filter-cnae-operador')?.value || '';
    const cnaeValorRaw = document.getElementById('filter-cnae-valor')?.value;
    const cnaeValor = cnaeValorRaw === '' || cnaeValorRaw === undefined ? null : parseInt(cnaeValorRaw, 10);

    filteredData = familyData.filter(item => {
        const exigidos = (item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"] || []);
        const elegiveis = (item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"] || []);
        const allDocs = [...exigidos, ...elegiveis].join(" ").toLowerCase();
        
        const textMatch = item.Família.toString().toLowerCase().includes(term) || 
                          item.Descrição.toLowerCase().includes(term) ||
                          allDocs.includes(term);
        const typeMatch = type === "" || item.Tipo === type;
        const terceirizadoMatch = !onlyTerceirizado || item.Terceirizado === "Sim";

        let cnaeMatch = true;
        if (cnaeOperador && cnaeValor !== null && !isNaN(cnaeValor)) {
            const qtdCnaes = (item.CNAEs || []).length;
            if (cnaeOperador === 'lte') cnaeMatch = qtdCnaes <= cnaeValor;
            else if (cnaeOperador === 'eq') cnaeMatch = qtdCnaes === cnaeValor;
            else if (cnaeOperador === 'gte') cnaeMatch = qtdCnaes >= cnaeValor;
        }

        return textMatch && typeMatch && terceirizadoMatch && cnaeMatch;
    });
    if (resetPage) {
        currentPage = 1;
    }
    renderGrid();
}


function renderGrid() {
grid.innerHTML = '';
    
    // --- NOVOS CÁLCULOS DE PAGINAÇÃO ---
    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
    const start = (currentPage - 1) * itemsPerPage;
    const end = Math.min(start + itemsPerPage, totalItems);
    const pageItems = filteredData.slice(start, start + itemsPerPage);

    // --- ATUALIZAÇÃO DOS ELEMENTOS DE UI ---
    // Atualiza o contador: "Exibindo 1-6 de 1119 registros"
    const pageInfo = document.getElementById('page-info');
    if (pageInfo) {
        pageInfo.textContent = `Exibindo ${totalItems > 0 ? start + 1 : 0}-${end} de ${totalItems} registros`;
    }

    // Atualiza o input de navegação e o total de páginas
    const totalPagesElem = document.getElementById('total-pages');
    const jumpInput = document.getElementById('jump-page');
    
    if (totalPagesElem) totalPagesElem.textContent = totalPages;
    if (jumpInput) {
        jumpInput.value = currentPage;
        jumpInput.max = totalPages;
    }

    document.getElementById('btn-prev').disabled = currentPage === 1;
    document.getElementById('btn-next').disabled = end >= totalItems;

    pageItems.forEach((item) => {
        const indexInMain = familyData.indexOf(item);
        const card = document.createElement('div');
        const isTerceirizado = item.Terceirizado === "Sim";
        const isHighlighted = indexInMain === lastEditedIndex;


        // Definição das classes NEON para os badges no modo escuro
        const tipoBadgeClasses = item.Tipo === 'S' 
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 dark:shadow-[0_0_10px_rgba(129,140,248,0.3)] dark:border dark:border-indigo-500/50' 
            : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 dark:shadow-[0_0_10px_rgba(251,146,60,0.3)] dark:border dark:border-orange-500/50';

        const terceirizadoBadgeClasses = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 dark:shadow-[0_0_10px_rgba(192,132,252,0.3)] dark:border dark:border-purple-500/50';
        
        card.className = `relative bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border transition-all cursor-pointer group flex flex-col min-h-full animate-fade-in 
        ${isTerceirizado ? 'border-purple-200 dark:border-purple-900/40' : 'border-slate-200 dark:border-slate-800'} 
        ${isHighlighted ? 'highlight-new border-blue-500 z-10' : 'hover:border-blue-400'}`;       
        
        card.innerHTML = `
            <div class="flex justify-between items-start mb-4">
                <div class="flex gap-2">
                    <span class="text-[9px] font-bold px-2 py-1 rounded ${tipoBadgeClasses} uppercase tracking-tighter transition-all">
                        ${item.Tipo === 'S' ? 'Serviço' : 'Material'}
                    </span>
                    ${isTerceirizado ? `<span class="text-[9px] font-bold px-2 py-1 rounded ${terceirizadoBadgeClasses} uppercase tracking-tighter transition-all">Terceirizado</span>` : ''}
                </div>

                <div class="flex gap-1">
                    <button onclick="event.stopPropagation(); generateSummary(${indexInMain})" class="text-slate-400 hover:text-emerald-500 transition-colors p-1" title="Gerar Resumo para WhatsApp">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path>
                        </svg>
                    </button>
                    
                    <button onclick="event.stopPropagation(); openFamilyForm(${indexInMain})" class="text-slate-400 hover:text-blue-500 transition-colors p-1 cgcf-manager-only" title="Editar Família">
                        <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path fill-rule="evenodd" clip-rule="evenodd" d="M20.8477 1.87868C19.6761 0.707109 17.7766 0.707105 16.605 1.87868L2.44744 16.0363C2.02864 16.4551 1.74317 16.9885 1.62702 17.5692L1.03995 20.5046C0.760062 21.904 1.9939 23.1379 3.39334 22.858L6.32868 22.2709C6.90945 22.1548 7.44285 21.8693 7.86165 21.4505L22.0192 7.29289C23.1908 6.12132 23.1908 4.22183 22.0192 3.05025L20.8477 1.87868ZM18.0192 3.29289C18.4098 2.90237 19.0429 2.90237 19.4335 3.29289L20.605 4.46447C20.9956 4.85499 20.9956 5.48815 20.605 5.87868L17.9334 8.55027L15.3477 5.96448L18.0192 3.29289ZM13.9334 7.3787L3.86165 17.4505C3.72205 17.5901 3.6269 17.7679 3.58818 17.9615L3.00111 20.8968L5.93645 20.3097C6.13004 20.271 6.30784 20.1759 6.44744 20.0363L16.5192 9.96448L13.9334 7.3787Z" fill="currentColor"/>
                        </svg>
                    </button>
                </div>

            </div>

            
            <h4 onclick="copyToClipboard(event, 'Família ${item.Família} - ${item.Descrição}')" 
                class="font-bold text-slate-800 dark:text-white text-sm leading-tight mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors cursor-copy hover:underline" 
                title="Clique para copiar">
                ${item.Descrição}
            </h4>

            ${(() => {
                const nomeRamo = item.Ramo && item.Ramo.nome ? item.Ramo.nome : 'Geral';
                const codRamo = item.Ramo && item.Ramo.codigo ? item.Ramo.codigo : null;
                const temDescricao = codRamo && descricoesRamos.some(r => r.codigo === codRamo);

                return `
                <div class="flex items-center justify-between gap-2 mb-6">
                    <div onclick="copyToClipboard(event, 'Família ${item.Família} - ${item.Descrição} | Ramo: ${nomeRamo}')" 
                        class="flex items-center gap-1 cursor-copy group/info overflow-hidden">
                        
                        <span class="opacity-50 uppercase text-[11px] font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" 
                            title="${nomeRamo}">
                            ${nomeRamo}
                        </span>
                        <span class="opacity-30">|</span>
                        <p class="text-[13px] text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap group-hover/info:text-blue-500 transition-colors">
                            FAMÍLIA: ${item.Família}
                        </p>
                    </div>
                    
                    ${temDescricao ? `
                    <button type="button" onclick="event.stopPropagation(); showRamoInfo('${codRamo}')" 
                        class="shrink-0 p-1.5 text-blue-500 hover:text-white bg-blue-50 hover:bg-blue-500 dark:bg-blue-900/30 dark:hover:bg-blue-600 rounded-lg transition-all" 
                        title="Ver detalhes técnicos deste ramo">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>
                    </button>
                    ` : ''}
                </div>
                `;
            })()}

            <div class="space-y-4 flex-grow">
                ${renderDocList("Obrigatórios", item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"], "text-red-500")}
                ${renderDocList("Elegíveis", item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"], "text-emerald-600")}
            </div>

            
            <div class="mt-6 flex justify-center border-t dark:border-slate-800 pt-3">
                <span class="text-[8px] font-black uppercase tracking-widest transition-colors ${ (item.CNAEs || []).length > 0 ? 'text-blue-500 dark:text-blue-400' : 'text-gray-600 dark:text-gray-100' } group-hover:text-blue-600">
                    Detalhes / CNAE
                </span>
            </div>
        `;

        card.onclick = () => abrirModalDetalheFamilia(indexInMain);
        grid.appendChild(card);
    });
}

// Listener para pular página ao apertar Enter
const jumpInput = document.getElementById('jump-page');
if (jumpInput) {
    jumpInput.onkeydown = (e) => {
        if (e.key === 'Enter') {
            let targetPage = parseInt(e.target.value);
            const totalPages = Math.ceil(filteredData.length / itemsPerPage) || 1;

            if (isNaN(targetPage) || targetPage < 1) {
                targetPage = 1;
            } else if (targetPage > totalPages) {
                targetPage = totalPages;
            }
            
            currentPage = targetPage;
            renderGrid();
        }
    };
}

function renderDocList(title, list, colorClass) {
    if (!list || list.length === 0) return "";
    return `
        <div>
            <span class="text-[8px] font-black uppercase text-gray-600 dark:text-gray-400 dark:text-slate-500 block mb-1.5 tracking-widest">${title}</span>
            <ul class="text-[11px] ${colorClass} space-y-1 leading-tight font-medium">
                ${list.map(doc => `<li class="flex items-start gap-1"><span>•</span> <span>${doc}</span></li>`).join('')}
            </ul>
        </div>
    `;
}

// --- FORMULÁRIO E CNAE ---
window.addCnaeRow = function(codigo = '', descricao = '') {
    const container = document.getElementById('cnae-rows-container');
    const div = document.createElement('div');
    // Adicionei 'relative' para o dropdown de sugestões flutuar corretamente
    div.className = "cnae-row relative flex flex-col sm:flex-row gap-2 bg-white dark:bg-slate-900 p-3 rounded-lg border dark:border-slate-700 animate-fade-in";
    div.innerHTML = `
        <input type="text" placeholder="0000-0/00" value="${codigo}" maxlength="10" 
            onblur="normalizeCnaeInput(this)" 
            class="cnae-code w-full sm:w-32 p-2 text-xs border rounded-md dark:bg-slate-850 dark:border-slate-700 dark:text-white outline-none focus:border-blue-500">
        
        <div class="flex-1 relative">
            <input type="text" placeholder="Digite a descrição para buscar..." value="${descricao}" 
                oninput="searchCnaeByDesc(this)"
                onkeydown="handleCnaeKeyDown(event, this)"
                class="cnae-desc w-full p-2 text-xs border rounded-md dark:bg-slate-850 dark:border-slate-700 dark:text-white outline-none focus:border-blue-500">
            <div class="cnae-autocomplete-list hidden absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-md shadow-xl z-[100] max-h-48 overflow-y-auto"></div>
        </div>

        <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-1">✕</button>
    `;
 
    container.prepend(div);
}

// Busca CNAEs no dicionário pelo texto da descrição
window.searchCnaeByDesc = (input) => {
    const term = input.value.toLowerCase();
    const listContainer = input.parentElement.querySelector('.cnae-autocomplete-list');
    
    if (term.length < 3) {
        listContainer.classList.add('hidden');
        return;
    }

    const matches = cnaeDictionary
        .filter(c => c.DESCRIÇÃO.toLowerCase().includes(term))
        .slice(0, 10); // Limita a 10 sugestões para performance

    if (matches.length > 0) {
        listContainer.innerHTML = matches.map(c => `
            <div class="p-2 hover:bg-blue-50 dark:hover:bg-blue-900/30 cursor-pointer border-b last:border-0 dark:border-slate-700"
                 onclick="selectCnaeSuggestion(this, '${c.CNAE}', '${c.DESCRIÇÃO}')">
                <span class="text-[10px] font-bold text-blue-600 font-mono">${c.CNAE}</span>
                <p class="text-[10px] text-slate-600 dark:text-slate-300 truncate">${c.DESCRIÇÃO}</p>
            </div>
        `).join('');
        listContainer.classList.remove('hidden');
    } else {
        listContainer.classList.add('hidden');
    }
};

// Ao clicar em uma sugestão do dropdown
window.selectCnaeSuggestion = (elem, cod, desc) => {
    const row = elem.closest('.cnae-row');
    const codeInput = row.querySelector('.cnae-code');
    const descInput = row.querySelector('.cnae-desc');
    const listContainer = row.querySelector('.cnae-autocomplete-list');

    codeInput.value = cod;
    descInput.value = desc;
    listContainer.classList.add('hidden');
    codeInput.classList.remove('border-red-500');

    // Abre uma nova linha automaticamente se esta for a última linha preenchida
    const container = document.getElementById('cnae-rows-container');
    if (row === container.firstElementChild) { // Como você usa prepend, o novo é o primeiro
        addCnaeRow();
    }
};

// Fecha o autocomplete se clicar fora
document.addEventListener('click', (e) => {
    if (!e.target.closest('.cnae-row')) {
        document.querySelectorAll('.cnae-autocomplete-list').forEach(l => l.classList.add('hidden'));
    }
});

window.addDocument = (type) => {
    const inputId = type === 'exigido' ? 'input-doc-exigido' : 'input-doc-elegivel';
    const containerId = type === 'exigido' ? 'container-docs-exigidos' : 'container-docs-elegiveis';
    const badgeStyle = type === 'exigido' 
        ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400 border-red-200 dark:border-red-800' 
        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    
    const input = document.getElementById(inputId);
    const docName = input.value.trim();
    
    if (!docName) return;

    const container = document.getElementById(containerId);
    
    // Evita documentos duplicados na mesma lista
    const existingDocs = Array.from(container.querySelectorAll('.doc-name-value')).map(span => span.textContent);
    if (existingDocs.includes(docName)) {
        input.value = '';
        return;
    }

    const tag = document.createElement('div');
    tag.className = `flex items-center gap-1 px-2 py-1 rounded text-[10px] font-bold border shadow-sm ${badgeStyle} animate-fade-in`;
    tag.innerHTML = `
        <span class="doc-name-value">${docName}</span>
        <button type="button" onclick="this.parentElement.remove()" class="ml-1 text-current hover:opacity-50 text-xs leading-none">&times;</button>
    `;
    
    container.appendChild(tag);
    input.value = ''; // Limpa o input após adicionar
};

window.toggleDocsSection = () => {
    const section = document.getElementById('docs-content-section');
    const iconExpand = document.getElementById('icon-expand');
    const iconCollapse = document.getElementById('icon-collapse');
    
    // Se está escondido, mostra (expande)
    if (section.classList.contains('hidden')) {
        section.classList.remove('hidden');
        section.classList.add('animate-fade-in');
        iconExpand.classList.add('hidden');
        iconCollapse.classList.remove('hidden');
    } else {
        // Se está visível, esconde (recolhe)
        section.classList.add('hidden');
        section.classList.remove('animate-fade-in');
        iconExpand.classList.remove('hidden');
        iconCollapse.classList.add('hidden');
    }
};

window.openFamilyForm = (index = null) => {
    const modal = document.getElementById('family-form-modal');
    document.getElementById('cnae-rows-container').innerHTML = '';
    document.getElementById('f-destinos').value = '';
    document.getElementById('f-replicate').checked = false;
    document.getElementById('replicate-container').classList.add('hidden');
    document.getElementById('container-docs-exigidos').innerHTML = '';
    document.getElementById('container-docs-elegiveis').innerHTML = '';
    document.getElementById('docs-content-section').classList.add('hidden');
    document.getElementById('icon-expand').classList.remove('hidden');
    document.getElementById('icon-collapse').classList.add('hidden');
    document.getElementById('f-ramo-data').value = '';;
    
    if (index !== null) {
        const item = familyData[index];
        document.getElementById('edit-index').value = index;
        document.getElementById('f-ramo-data').value = item.Ramo ? JSON.stringify(item.Ramo) : "";
        document.getElementById('f-codigo').value = item.Família;
        document.getElementById('f-desc').value = item.Descrição;
        document.getElementById('f-tipo').value = item.Tipo;
        document.getElementById('f-terceirizado').checked = item.Terceirizado === "Sim";
        (item.CNAEs || []).forEach(c => addCnaeRow(c.codigo, c.descricao));
        addCnaeRow();

        // Carrega Documentos Exigidos
        const exigidos = item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"] || [];
        exigidos.forEach(doc => {
            document.getElementById('input-doc-exigido').value = doc;
            addDocument('exigido');
        });

        // Carrega Documentos Elegíveis
        const elegiveis = item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"] || [];
        elegiveis.forEach(doc => {
            document.getElementById('input-doc-elegivel').value = doc;
            addDocument('elegivel');
        });


        document.getElementById('form-title').innerText = "Editar Família";
    } else {
        document.getElementById('family-form').reset();
        document.getElementById('edit-index').value = "";
        addCnaeRow();
        document.getElementById('form-title').innerText = "Nova Família";
    }
    modal.classList.remove('hidden');
};

window.closeFamilyForm = () => document.getElementById('family-form-modal').classList.add('hidden');

document.getElementById('family-form').onsubmit = async (e) => {
    e.preventDefault();
    
    // Adiciona "Salvando..." no botão para evitar duplo clique
    const btnSubmit = e.target.querySelector('button[type="submit"]');
    const originalBtnText = btnSubmit.innerHTML;
    btnSubmit.innerHTML = "Salvando...";
    btnSubmit.disabled = true;

    try {
        const index = document.getElementById('edit-index').value;
        const cnaeMap = new Map();
        document.querySelectorAll('#cnae-rows-container > .cnae-row').forEach(row => {
            const c = row.querySelector('.cnae-code').value.trim();
            const d = row.querySelector('.cnae-desc').value.trim();
            if (c && !cnaeMap.has(c)) {
                cnaeMap.set(c, { codigo: c, descricao: d });
            }
        });

        const cnaes = Array.from(cnaeMap.values());
        if (cnaes.length === 0) {
            showError("CNAE Obrigatório", "É necessário incluir ao menos um CNAE válido.");
            if (document.querySelectorAll('#cnae-rows-container > div').length === 0) addCnaeRow();
            return;
        }

        const docsExigidos = Array.from(document.querySelectorAll('#container-docs-exigidos .doc-name-value')).map(span => span.textContent);
        const docsElegiveis = Array.from(document.querySelectorAll('#container-docs-elegiveis .doc-name-value')).map(span => span.textContent);
        const codigoFamilia = document.getElementById('f-codigo').value;
        
        let ramoData = null;
        if (index !== "") {
            ramoData = familyData[index].Ramo || null;
        } else {
            const prefixo = codigoFamilia.split('.')[0];
            const ramoEncontrado = ramosDictionary.find(r => r.codigo.toString() === prefixo);
            if (ramoEncontrado) ramoData = { codigo: ramoEncontrado.codigo, nome: ramoEncontrado.nome };
        }

        const payload = {
            "Família": codigoFamilia,
            "Descrição": document.getElementById('f-desc').value,
            "Tipo": document.getElementById('f-tipo').value,
            "Terceirizado": document.getElementById('f-terceirizado').checked ? "Sim" : "Não",
            "Documentos Exigidos": docsExigidos,
            "Documentos Elegíveis": docsElegiveis,
            "CNAEs": cnaes,
            "Ramo": ramoData
        };

        // Salva na memória RAM para a tela atualizar rápido
        if (index !== "") {
            familyData[index] = payload;
            lastEditedIndex = parseInt(index);
        } else {
            familyData.unshift(payload);
            lastEditedIndex = 0;
        }
        setTimeout(() => { lastEditedIndex = null; }, 2500);

        // --- PREPARA PARA O SUPABASE (Inclui Replicação) ---
        let familiasParaSalvar = [payload];

        if (document.getElementById('f-replicate').checked) {
            const destinos = document.getElementById('f-destinos').value.split(/[,; ]+/).filter(s => s.trim() !== "");
            destinos.forEach(cod => {
                const familiaAlvo = familyData.find(f => f.Família.toString() === cod);
                if (familiaAlvo && familiaAlvo.Família !== codigoFamilia) {
                    if (!familiaAlvo.CNAEs) familiaAlvo.CNAEs = [];
                    cnaes.forEach(novoCnae => {
                        if (!familiaAlvo.CNAEs.some(ex => normalizarCodigoCnae(ex.codigo) === normalizarCodigoCnae(novoCnae.codigo))) {
                            familiaAlvo.CNAEs.push(novoCnae);
                        }
                    });
                    familiasParaSalvar.push(familiaAlvo);
                }
            });
        }

        // Converte as famílias afetadas para o padrão minúsculo do Supabase
        const supaBatch = familiasParaSalvar.map(f => ({
            familia: f["Família"],
            descricao: f["Descrição"],
            tipo: f["Tipo"],
            terceirizado: f["Terceirizado"],
            documentos_exigidos: f["Documentos Exigidos"],
            documentos_elegiveis: f["Documentos Elegíveis"],
            cnaes: f["CNAEs"],
            ramo: f["Ramo"]
        }));

        // Envia o lote inteiro pro banco
        const { error } = await supabase.from('qualificacao_tecnica').upsert(supaBatch);
        if (error) throw error;

        // Atualiza dicionário de CNAEs caso tenha um novo
        cnaes.forEach(cnaeSalvo => {
            if (!cnaeDictionary.find(c => c.CNAE === cnaeSalvo.codigo)) {
                cnaeDictionary.push({ "CNAE": cnaeSalvo.codigo, "DESCRIÇÃO": cnaeSalvo.descricao });
            }
        });

        applyFilters(index === ""); 
        updateDatalist();
        closeFamilyForm();
        enviarStatsParaHome();
        showToast("Dados salvos com sucesso!");

    } catch (err) {
        console.error(err);
        showError("Erro do Banco de Dados", "Não foi possível salvar as informações no Supabase.");
    } finally {
        btnSubmit.innerHTML = originalBtnText;
        btnSubmit.disabled = false;
    }
};

// --- REPLICAÇÃO E SUGESTÕES ---
window.openSuggestionsModal = () => {
    const currentCod = document.getElementById('f-codigo').value;
    const prefix = currentCod.split('.')[0];
    currentSugList = familyData.filter(f => f.Família.startsWith(prefix) && f.Família !== currentCod);
    sugPage = 1;
    selectedSug.clear();
    renderSuggestions();
    document.getElementById('suggestions-modal').classList.remove('hidden');
};

function renderSuggestions() {
    const container = document.getElementById('suggestions-list');
    container.innerHTML = '';
    const start = (sugPage - 1) * sugPerPage;
    const items = currentSugList.slice(start, start + sugPerPage);

    items.forEach(f => {
        const div = document.createElement('label');
        div.className = "flex items-center gap-3 p-3 rounded-lg border dark:border-slate-800 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer transition-colors";
        div.innerHTML = `
            <input type="checkbox" value="${f.Família}" ${selectedSug.has(f.Família) ? 'checked' : ''} 
                onchange="toggleSug('${f.Família}')" class="rounded text-blue-600 w-4 h-4">
            <div class="flex flex-col">
                <span class="text-[10px] font-bold text-blue-600 font-mono">${f.Família}</span>
                <span class="text-[11px] dark:text-slate-300 leading-tight">${f.Descrição}</span>
            </div>`;
        container.appendChild(div);
    });

    document.getElementById('sug-prev').disabled = sugPage === 1;
    document.getElementById('sug-next').disabled = start + sugPerPage >= currentSugList.length;
}

window.toggleSug = (cod) => {
    if (selectedSug.has(cod)) selectedSug.delete(cod);
    else selectedSug.add(cod);
};

window.changeSugPage = (dir) => {
    sugPage += dir;
    renderSuggestions();
};

window.confirmSuggestions = () => {
    const input = document.getElementById('f-destinos');
    const existing = input.value.split(',').map(s => s.trim()).filter(s => s);
    const combined = [...new Set([...existing, ...selectedSug])];
    input.value = combined.join(', ');
    closeSuggestionsModal();
};

window.closeSuggestionsModal = () => document.getElementById('suggestions-modal').classList.add('hidden');

function updateDatalist() {
    const datalist = document.getElementById('familias-list');
    if (!datalist) return;
    datalist.innerHTML = familyData.map(f => `<option value="${f.Família}">${f.Descrição}</option>`).join('');
}

// --- BOAS-VINDAS E UTILITÁRIOS ---
function checkWelcomeModal() {
    if (!localStorage.getItem("qualificacao_welcome_hidden")) {
        document.getElementById("welcomeModalQualificacao").classList.remove("hidden");
    }
}

window.closeWelcomeModalQualificacao = () => {
    if (document.getElementById("dontShowAgainQualificacao").checked) {
        localStorage.setItem("qualificacao_welcome_hidden", "true");
    }
    document.getElementById("welcomeModalQualificacao").classList.add("hidden");
};

window.exportFullBase = () => {
    const dataStr = JSON.stringify(familyData, null, 2);
    const link = document.createElement('a');
    link.href = URL.createObjectURL(new Blob([dataStr], { type: 'application/json' }));
    link.download = 'qualificacao_tecnica.json';
    link.click();
};

// --- EVENT LISTENERS ---
searchInput.oninput = () => applyFilters(true);
typeFilter.onchange = () => applyFilters(true);
terceirizadoFilter.onchange = () => applyFilters(true);
document.getElementById('filter-cnae-operador').onchange = () => applyFilters(true);
document.getElementById('filter-cnae-valor').oninput = () => applyFilters(true);
document.getElementById('btn-prev').onclick = () => { if(currentPage > 1) { currentPage--; renderGrid(); } };
document.getElementById('btn-next').onclick = () => { if((currentPage * itemsPerPage) < filteredData.length) { currentPage++; renderGrid(); } };
document.getElementById('f-replicate').onchange = (e) => {
    document.getElementById('replicate-container').classList.toggle('hidden', !e.target.checked);
};

window.generateSummary = (index) => {
    const item = familyData[index];
    const isServico = item.Tipo === 'S';
    const tipo = isServico ? 'SERVIÇO' : 'MATERIAL';
    
    // 1. Tratamento de Listas (Padrão anterior mantido)
    const listaExigidos = item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"] || [];
    const exigidosStr = listaExigidos.length > 0 ? listaExigidos.map(doc => `• ${doc}`).join("\n") : "• Nenhum documento específico";

    const listaElegiveis = item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"] || [];
    const elegiveisStr = listaElegiveis.length > 0 ? listaElegiveis.map(doc => `• ${doc}`).join("\n") : "• Nenhum documento opcional";

    const listaCnaes = item.CNAEs || [];
    const cnaesStr = listaCnaes.length > 0 ? listaCnaes.map(c => `• *${c.codigo}* - ${c.descricao}`).join("\n") : "• Nenhum CNAE específico";

    // 2. Lógica Condicional de Frases (Novas Regras)
    let infoServico = "";
    let infoTerceirizado = "";

    if (isServico) {
        // Frase de Atestado de Capacidade Técnica
        infoServico = `Por se tratar de família classificada como *serviço*, poderá ser exigido atestado de capacidade técnica, com a finalidade de comprovar a aptidão e a qualidade do serviço previamente prestado pelo fornecedor.\n\n`;

        // Frase de Terceirização
        if (item.Terceirizado === "Sim") {
            infoTerceirizado = `_Esta família integra o grupo de famílias de serviço terceirizado, sendo necessária a vistoria do imóvel, além do atendimento às normas previstas no edital._`;
        } else {
            infoTerceirizado = `_Esta família não integra o grupo de famílias de serviço terceirizado._`;
        }
    }

    // 3. Montagem do Texto Final para WhatsApp
    const nomeRamo = item.Ramo && item.Ramo.nome ? item.Ramo.nome : "Geral";
    const codRamo = item.Ramo && item.Ramo.codigo ? item.Ramo.codigo : "--";
    const textoWhatsApp = 
        `*CONSULTA DE QUALIFICAÇÃO TÉCNICA*\n\n` +
        `Ramo de Atividade ${codRamo} - ${nomeRamo}\n` +
        `Família ${item.Família} - ${item.Descrição.toUpperCase()}\n\n` +
        `Para a família *${item.Descrição.toUpperCase()}* (Código: *${item.Família}*), classificada como *${tipo}*, informamos que os documentos *OBRIGATÓRIOS* são:\n\n` +
        `${exigidosStr}\n\n` +
        `Como documentos *ELEGÍVEIS* (opcionais), constam:\n\n` +
        `${elegiveisStr}\n\n` +
        `Para fins de compatibilidade, recomenda-se o(s) *CNAE(s)*:\n\n` +
        `${cnaesStr}\n\n` +
        `${infoServico}` + // Aparece apenas se for serviço
        `${infoTerceirizado}`; // Aparece apenas se for serviço (Sim ou Não)

    // Injeção no Modal
    document.getElementById('summary-subtitle').textContent = `FAMÍLIA ${item.Família} • ${tipo}`;
    document.getElementById('summary-content').textContent = textoWhatsApp;
    document.getElementById('summary-modal').classList.remove('hidden');
};

window.closeSummaryModal = () => {
    document.getElementById('summary-modal').classList.add('hidden');
};

window.copySummary = () => {
    const text = document.getElementById('summary-content').textContent;
    const btn = document.getElementById('btn-copy-summary');

    
    navigator.clipboard.writeText(text).then(() => {
        const originalContent = btn.innerHTML;

        btn.innerHTML = `
            <svg viewBox="0 0 24 24" fill="none" class="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
            <path opacity="0.5" d="M4 12.9L7.14286 16.5L15 7.5"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"/>
            <path d="M20.0002 7.5625L11.4286 16.5625L11.0002 16"
                    stroke="currentColor"
                    stroke-width="1.5"
                    stroke-linecap="round"
                    stroke-linejoin="round"/>
            </svg>
            Copiado
        `;

        btn.classList.replace('bg-emerald-600', 'bg-blue-600');

        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.classList.replace('bg-blue-600', 'bg-emerald-600');
        }, 2000);

        
        setTimeout(() => {
            btn.innerHTML = originalContent;
            btn.classList.replace('bg-blue-600', 'bg-emerald-600');
        }, 2000);
    });
};


window.normalizeCnaeInput = async (input) => {
    let value = input.value.replace(/\D/g, ''); 
    const descInput = input.parentElement.querySelector('.cnae-desc');

    if (value.length === 7) {
        const formattedCnae = value.substring(0, 4) + '-' + value.substring(4, 5) + '/' + value.substring(5, 7);
        input.value = formattedCnae;

        // Inicia o processo de busca
        if (descInput) descInput.placeholder = "Buscando no IBGE...";
        input.classList.add('animate-pulse'); // Feedback visual de carregamento

        try {
            // 1. Tenta buscar na API do IBGE primeiro (Prioridade)
            const url = `https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${value}`;
            const response = await fetch(url);
            
            if (!response.ok) throw new Error('api_error');
            
            const data = await response.json();
            const item = Array.isArray(data) ? data[0] : data;
            
            if (item && item.id) {
                const cnaeEncontrado = {
                    "CNAE": formattedCnae,
                    "DESCRIÇÃO": item.descricao
                };
                
                // Atualiza o dicionário local caso não exista (mantém a base atualizada)
                if (!cnaeDictionary.some(c => c.CNAE === formattedCnae)) {
                    cnaeDictionary.push(cnaeEncontrado);
                }
                
                aplicarSucessoCnae(input, descInput, cnaeEncontrado.DESCRIÇÃO);
            } else {
                throw new Error('invalid_data');
            }
        } catch (error) {
            // 2. Fallback (Rede de Segurança): Se a API falhar ou estiver offline, busca no local
            let cnaeEncontradoLocal = cnaeDictionary.find(c => c.CNAE === formattedCnae);

            if (cnaeEncontradoLocal) {
                if (descInput) descInput.placeholder = "Descrição do CNAE"; // Restaura o placeholder
                aplicarSucessoCnae(input, descInput, cnaeEncontradoLocal.DESCRIÇÃO);
            } else {
                aplicarErroCnae(input, descInput, "CNAE não encontrado (API e Base Local).");
            }
        } finally {
            input.classList.remove('animate-pulse'); // Remove o carregamento em qualquer cenário
        }

    } else if (value.length > 7) {
        let extraClean = value.substring(0, 7);
        input.value = extraClean;
        window.normalizeCnaeInput(input);
    } else if (value.length > 0) {
        aplicarErroCnae(input, descInput, "Formato inválido (mínimo 7 dígitos).");
    } else {
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-200', 'border-emerald-500');
        if (descInput) {
            descInput.value = "";
            descInput.placeholder = "Descrição do CNAE";
        }
    }
};

// Função auxiliar (mantida igual)
function aplicarSucessoCnae(input, descInput, descricao) {
    if (descInput) descInput.value = descricao;
    input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
    input.classList.add('border-emerald-500'); 
    
    if (typeof handleCnaeBlur === 'function') {
        handleCnaeBlur(descInput);
    }

    setTimeout(() => input.classList.remove('border-emerald-500'), 1500);
}

function aplicarErroCnae(input, descInput, mensagem) {
    input.classList.add('border-red-500', 'ring-2', 'ring-red-200');
    if (descInput) {
        descInput.value = ""; 
        descInput.placeholder = mensagem;
    }
}



// --- NAVEGAÇÃO POR TECLADO ---
document.addEventListener('keydown', (e) => {
    // Ignora se o usuário estiver digitando em um campo de texto (busca, formulário ou jump-page)
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
        return;
    }

    const totalItems = filteredData.length;
    const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;

    if (e.key === 'ArrowRight') {
        // Seta para Direita: Próxima Página
        if ((currentPage * itemsPerPage) < totalItems) {
            currentPage++;
            renderGrid();
        }
    } else if (e.key === 'ArrowLeft') {
        // Seta para Esquerda: Página Anterior
        if (currentPage > 1) {
            currentPage--;
            renderGrid();
        }
    }
});

// Função para abrir o modal de erro
window.showError = (title, message) => {
    const modal = document.getElementById('errorModal');
    const content = document.getElementById('errorModalContent');
    
    document.getElementById('errorModalTitle').innerText = title;
    document.getElementById('errorMessageText').innerText = message;

    modal.classList.remove('hidden');
    // Força um reflow para a animação funcionar
    setTimeout(() => {
        modal.classList.add('opacity-100');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
};

// Função para fechar o modal de erro
window.closeErrorModal = () => {
    const modal = document.getElementById('errorModal');
    const content = document.getElementById('errorModalContent');

    modal.classList.remove('opacity-100');
    content.classList.remove('scale-100', 'opacity-100');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300);
};

// --- MODAL DE INFORMAÇÕES DO RAMO ---
window.showRamoInfo = (codigo) => {
    const ramoInfo = descricoesRamos.find(r => r.codigo === codigo);
    if (!ramoInfo) return;

    document.getElementById('ramo-codigo-display').textContent = ramoInfo.codigo;
    document.getElementById('ramo-nome-display').textContent = ramoInfo.nome;
    document.getElementById('ramo-desc-display').textContent = ramoInfo.Descrição;
    document.getElementById('ramo-icon-display').innerHTML = iconesRamos[codigo] || iconesRamos["padrao"];

    const modal = document.getElementById('ramo-info-modal');
    const content = document.getElementById('ramo-info-content');

    modal.classList.remove('hidden');
    
    // Pequeno atraso para o CSS transition de Fade e Scale funcionar
    setTimeout(() => {
        modal.classList.remove('opacity-0');
        content.classList.remove('scale-95', 'opacity-0');
        content.classList.add('scale-100', 'opacity-100');
    }, 10);
};

window.closeRamoInfoModal = () => {
    const modal = document.getElementById('ramo-info-modal');
    const content = document.getElementById('ramo-info-content');

    // Efeito inverso
    modal.classList.remove('opacity-100');
    content.classList.remove('scale-100', 'opacity-100');
    content.classList.add('scale-95', 'opacity-0');

    setTimeout(() => {
        modal.classList.add('hidden');
    }, 300); // 300ms = tempo da transition do tailwind
};

// --- INTEGRAÇÃO COM A HOME: ENVIAR ESTATÍSTICAS ---

function calcularEstatisticasQualificacao() {
    if (!familyData || familyData.length === 0) return { total: 0, cnaesUnicos: 0, percentualComCnae: 0 };

    const totalFamilias = familyData.length;
    const familiasComCnae = familyData.filter(f => f.CNAEs && f.CNAEs.length > 0).length;
    
    // Extrai todos os códigos CNAE únicos
    const todosCnaes = new Set();
    familyData.forEach(f => {
        if (f.CNAEs) {
            f.CNAEs.forEach(c => todosCnaes.add(c.codigo));
        }
    });

    return {
        total: totalFamilias,
        cnaesUnicos: todosCnaes.size,
        percentualComCnae: ((familiasComCnae / totalFamilias) * 100).toFixed(0)
    };
}

function enviarStatsParaHome() {
    if (!familyData || familyData.length === 0) return;

    const total = familyData.length;
    // Conta quantas famílias possuem o array CNAEs com pelo menos 1 item
    const comCnae = familyData.filter(f => f.CNAEs && f.CNAEs.length > 0).length;
    
    const cnaesSet = new Set();
    familyData.forEach(f => f.CNAEs?.forEach(c => cnaesSet.add(c.codigo)));

    const stats = {
        total: total,
        cnaesUnicos: cnaesSet.size,
        // Garante que o nome seja 'percentualComCnae' para a Home ler
        percentualComCnae: total > 0 ? Math.round((comCnae / total) * 100) : 0
    };

    // Salva na chave "stats_familias" que a Home monitora
    localStorage.setItem("stats_familias", JSON.stringify(stats));
    
    if (window.parent) {
        window.parent.postMessage({
            type: "STATS_RESPONSE",
            app: "familias",
            data: stats
        }, "*");
    }
}

// Adicione esta função para gerenciar o teclado e o Tab
window.handleCnaeKeyDown = (event, input) => {
    const listContainer = input.parentElement.querySelector('.cnae-autocomplete-list');
    const items = listContainer.querySelectorAll('div');
    let currentIndex = Array.from(items).findIndex(item => item.classList.contains('bg-blue-50'));

    if (event.key === 'ArrowDown') {
        event.preventDefault();
        if (currentIndex < items.length - 1) {
            if (currentIndex !== -1) items[currentIndex].classList.remove('bg-blue-50', 'dark:bg-blue-900/30');
            items[currentIndex + 1].classList.add('bg-blue-50', 'dark:bg-blue-900/30');
            items[currentIndex + 1].scrollIntoView({ block: 'nearest' });
        }
    } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (currentIndex > 0) {
            items[currentIndex].classList.remove('bg-blue-50', 'dark:bg-blue-900/30');
            items[currentIndex - 1].classList.add('bg-blue-50', 'dark:bg-blue-900/30');
            items[currentIndex - 1].scrollIntoView({ block: 'nearest' });
        }
    } else if (event.key === 'Enter' && !listContainer.classList.contains('hidden')) {
        event.preventDefault();
        if (currentIndex !== -1) {
            items[currentIndex].click();
        } else if (items.length > 0) {
            items[0].click();
        }
    } else if (event.key === 'Tab' && !event.shiftKey) {
        // Se der Tab na descrição da primeira linha (topo), adiciona nova
        const container = document.getElementById('cnae-rows-container');
        if (input.closest('.cnae-row') === container.firstElementChild && input.value.trim() !== "") {
            addCnaeRow();
        }
    }
};

// Defina o handleCnaeBlur que é chamado na linha 445 do seu script
window.handleCnaeBlur = (input) => {
    // Apenas um placeholder para evitar erro de referência ou
    // adicione lógica extra de validação aqui se desejar.
};


window.sugerirCnaesPorDescricao = () => {
    const descInput = document.getElementById('f-desc');
    const descOriginal = descInput.value.trim().toLowerCase();
    if (!descOriginal) return;

    const normalize = (t) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const descNorm = normalize(descOriginal);

    // --- PASSO 1: Expandir Termos usando o Dicionário ---
    let termosParaBusca = descNorm.split(/\s+/);
    let termosExpandidos = new Set([...termosParaBusca]);

    relacionadosDict.forEach(item => {
        const principalNorm = normalize(item.Principal);
        const relacionadasNorm = normalize(item.Relacionadas);

        // Se a descrição contém a Palavra Principal, adiciona todas as Relacionadas
        if (descNorm.includes(principalNorm)) {
            relacionadasNorm.split(', ').forEach(r => termosExpandidos.add(r));
        }

        // Se a descrição contém alguma palavra Relacionada, adiciona a Principal (Busca de Volta)
        relacionadasNorm.split(', ').forEach(rel => {
            if (descNorm.includes(rel)) {
                termosExpandidos.add(principalNorm);
            }
        });
    });

    // --- PASSO 2: Scoring no cnaeDictionary ---
    const arrayTermos = Array.from(termosExpandidos);
    let matches = cnaeDictionary.map(cnae => {
        let score = 0;
        const cnaeNorm = normalize(cnae.DESCRIÇÃO);
        
        arrayTermos.forEach(termo => {
            if (cnaeNorm.includes(termo)) score += 2;
            if (cnaeNorm.startsWith(termo)) score += 3;
        });
        
        return { ...cnae, score };
    })
    .filter(c => c.score > 2)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

    // --- PASSO 3: Injeção de Dados ---
    if (matches.length > 0) {
        document.querySelectorAll('#cnae-rows-container .cnae-row').forEach(row => {
            if (!row.querySelector('.cnae-code').value) row.remove();
        });
        matches.forEach(m => addCnaeRow(m.CNAE, m.DESCRIÇÃO));
    } else {
        showError("Sugestão Automática", "Não foi possível encontrar uma relação clara. Tente palavras mais simples.");
    }
};

window.showToast = (message) => {
    const container = document.getElementById('toast-container');
    const toast = document.createElement('div');
    
    // Estilização do Toast (Tailwind)
    toast.className = `
        flex items-center gap-2 px-4 py-3 rounded-lg shadow-2xl 
        bg-white dark:bg-slate-800 border-l-4 border-emerald-500 
        text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider
        animate-fade-in transition-all duration-300
    `;
    
    toast.innerHTML = `
        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>
        </svg>
        <span>${message}</span>
    `;

    container.appendChild(toast);

    // Remove o toast após 3 segundos com efeito de saída
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
};

window.copyToClipboard = (event, text) => {
    event.stopPropagation();
    
    // Capturamos a referência exata do elemento clicado ANTES do clipboard
    const elementoClicado = event.currentTarget; 

    navigator.clipboard.writeText(text).then(() => {
        // Agora usamos a referência salva, garantindo que não seja nula
        if (elementoClicado) {
            showToast("Copiado para a área de transferência!");
            
            elementoClicado.classList.add('text-emerald-500', 'dark:text-emerald-400');
            setTimeout(() => {
                elementoClicado.classList.remove('text-emerald-500', 'dark:text-emerald-400');
            }, 500);
        }
    }).catch(err => {
        console.error("Erro ao copiar: ", err);
    });
};


window.analisarFornecedor = async (event) => {
    const file = event.target.files[0];
    if (!file) return;

    if (window.showToast) window.showToast("Analisando Comprovante CNPJ...", "info");

    try {
        const resultado = await AnalisadorCnpj.processar(file);
        
        salvarHistoricoAnalise(resultado);
        // Chama a função que constrói e exibe o modal
        exibirModalResultadoAnalise(resultado);

        // Reseta o input para permitir subir o mesmo arquivo de novo se necessário
        event.target.value = '';

    } catch (error) {
        if (window.showError) window.showError("Erro na Análise", error.message);
    }
};

// --- FUNÇÕES AUXILIARES DE INTERFACE ---

function exibirModalResultadoAnalise(resultado) {
    window.resultadoAnaliseAtual = resultado;
    const modalAntigo = document.getElementById('modal-analise-cnpj');
    if (modalAntigo) modalAntigo.remove();

    const cnaesPdfNumericos = resultado.cnaes.map(cnae => cnae.replace(/\D/g, ''));

    // 1. Constrói o HTML das Famílias (CNAEs agrupados dentro da Família)
    let familiasHtml = '';
    if (resultado.familiasHabilitadas.length > 0) {
        familiasHtml = resultado.familiasHabilitadas.map(fam => {
            const cnaesCompativeis = (fam.CNAEs || []).filter(c => {
                if (!c || !c.codigo) return false;
                return cnaesPdfNumericos.includes(c.codigo.replace(/\D/g, ''));
            });
            const cnaesNaoEncontrados = (fam.CNAEs || []).filter(c => {
                if (!c || !c.codigo) return false;
                return !cnaesPdfNumericos.includes(c.codigo.replace(/\D/g, ''));
            });

            const todosCnaesString = (fam.CNAEs || []).map(c => c.codigo).join(' ');
            const termoBusca = `${fam['Família']} ${fam['Descrição']} ${todosCnaesString}`.toLowerCase();
            const uniqueId = fam['Família'].replace(/\./g, '-');

            return `
            <div class="family-card p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg border border-slate-200 dark:border-slate-600 mb-2 transition-all hover:border-amber-400" data-search="${termoBusca}">
                
                <div class="flex flex-col sm:flex-row justify-between items-start gap-3">
                    <div class="flex flex-col">
                        <span class="text-xs font-mono text-slate-500 dark:text-slate-400 font-semibold tracking-wider">Família ${fam['Família']}</span>
                        <span class="font-bold text-slate-800 dark:text-slate-100 leading-tight mt-0.5">${fam['Descrição']}</span>
                    </div>
                    
                    <button onclick="toggleCnaeList('${uniqueId}')" class="shrink-0 flex items-center gap-1.5 text-xs bg-amber-100 text-amber-800 dark:bg-amber-900/50 dark:text-amber-300 px-3 py-1.5 rounded-full whitespace-nowrap border border-amber-200 dark:border-amber-800/50 shadow-sm hover:bg-amber-200 dark:hover:bg-amber-900/70 transition-colors focus:outline-none focus:ring-2 focus:ring-amber-500">
                        ${cnaesCompativeis.length} Compatibilidade(s)
                        <svg id="icon-${uniqueId}" class="w-3.5 h-3.5 transform transition-transform duration-200" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 9l-7 7-7-7"></path></svg>
                    </button>
                </div>

                <div id="list-${uniqueId}" class="hidden mt-3 pt-3 border-t border-slate-200 dark:border-slate-600 animate-fade-in">
                    <div class="text-xs font-bold text-slate-500 dark:text-slate-400 mb-2 uppercase tracking-wider">Detalhamento dos CNAEs:</div>
                    <div class="grid grid-cols-1 gap-2">
                        ${cnaesCompativeis.map(c => `
                            <div class="bg-white dark:bg-slate-800/80 p-2.5 rounded border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col">
                                <span class="text-blue-600 dark:text-blue-400 font-mono font-bold text-xs mb-0.5">${c.codigo}</span>
                                <span class="text-slate-600 dark:text-slate-300 text-xs leading-snug">${c.descricao}</span>
                            </div>
                        `).join('')}
                    </div>
                    ${cnaesNaoEncontrados.length > 0 ? `
                    <div class="text-[10px] font-bold text-amber-600 dark:text-amber-400 mt-4 mb-2 uppercase tracking-wider flex items-center gap-1">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                        Não encontrados neste comprovante:
                    </div>
                    <div class="grid grid-cols-1 gap-2">
                        ${cnaesNaoEncontrados.map(c => `
                            <div class="bg-amber-50 dark:bg-amber-900/10 p-2.5 rounded border border-amber-100 dark:border-amber-900/40 shadow-sm flex items-center justify-between gap-2">
                                <div class="flex flex-col min-w-0">
                                    <span class="text-amber-700 dark:text-amber-400 font-mono font-bold text-xs mb-0.5">${c.codigo}</span>
                                    <span class="text-slate-600 dark:text-slate-300 text-xs leading-snug">${c.descricao}</span>
                                </div>
                                <button type="button" data-familia="${fam['Família']}" data-cnae="${c.codigo}" data-desc="${c.descricao}"
                                    onclick="event.stopPropagation(); abrirConfirmacaoRemocao(this)"
                                    class="shrink-0 p-1.5 text-red-500 hover:text-white hover:bg-red-500 bg-red-50 dark:bg-red-900/20 rounded-md transition-colors"
                                    title="Sugerir remoção deste CNAE da família">
                                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                                </button>
                            </div>
                        `).join('')}
                    </div>` : ''}
                </div>
            </div>`;
        }).join('');
    } else {
        familiasHtml = `<div class="p-6 text-center text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">Nenhuma família compatível com os CNAEs informados.</div>`;
    }

    // 2. Constrói o HTML da Lista de TODOS os CNAEs cruzados com Famílias
    let cnaesRelacionadosCount = 0;

    let cnaesHtml = resultado.cnaesDetalhados.map(cnae => {
        const cnaeNum = cnae.codigo.replace(/\D/g, '');
        
        // Procura quais famílias contêm este CNAE
        const familiasDoCnae = resultado.familiasHabilitadas.filter(fam => 
            (fam.CNAEs || []).some(c => c.codigo.replace(/\D/g, '') === cnaeNum)
        );
        
        if (familiasDoCnae.length > 0) cnaesRelacionadosCount++;

        // Renderiza as tags das famílias vinculadas
        const tagsFamilias = familiasDoCnae.map(f => 
            `<span class="inline-block bg-teal-100 text-teal-700 dark:bg-teal-900/40 dark:text-teal-400 px-2 py-0.5 rounded text-[10px] font-bold mr-1 mb-1 shadow-sm border border-teal-200 dark:border-teal-800" title="${f['Descrição']}">Família ${f['Família']}</span>`
        ).join('');

        const familiasListHtml = familiasDoCnae.length > 0 
            ? `<div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 w-full">
                  <div class="text-[9px] font-bold text-slate-500 uppercase tracking-widest mb-1.5">Famílias Relacionadas:</div>
                  <div class="flex flex-wrap">${tagsFamilias}</div>
               </div>`
            : `<div class="mt-2 pt-2 border-t border-slate-100 dark:border-slate-700 w-full">
                  <span class="text-[10px] text-red-400 dark:text-red-400 italic font-medium flex items-center gap-1">
                      <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                      Nenhuma família vinculada
                  </span>
               </div>`;

        return `
        <label class="cnae-card p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col items-start gap-2 mb-2 shadow-sm transition-all hover:border-blue-400 cursor-pointer" data-search="${cnae.codigo} ${cnae.descricao.toLowerCase()}">
            <div class="flex flex-row items-start justify-between gap-3 w-full">
                <div class="flex flex-row items-start gap-3 flex-1">
                    <input type="checkbox" class="cnae-checkbox-vincular mt-1 w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 dark:bg-slate-700 dark:border-slate-600" value="${cnae.codigo}" data-desc="${cnae.descricao}">
                    <div class="flex flex-col">
                        <span class="text-blue-600 dark:text-blue-400 font-mono font-bold text-sm mb-0.5">${cnae.codigo}</span>
                        <span class="text-slate-700 dark:text-slate-300 text-xs leading-tight">${cnae.descricao}</span>
                    </div>
                </div>
                
                <button type="button" onclick="event.stopPropagation(); event.preventDefault(); reabrirBuscaIbgeDireto('${cnae.codigo}')" 
                    class="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0" 
                    title="Ver detalhes completos do CNAE no IBGE">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                    </svg>
                </button>
            </div>
            ${familiasListHtml}
        </label>`;
    }).join('');

    // Adiciona o Botão Flutuante (Sticky) de vincular
    cnaesHtml += `
        <div class="sticky bottom-4 flex justify-end pointer-events-none mt-4 mr-2">
            <button type="button" onclick="abrirModalVinculoCnaes()" 
                class="pointer-events-auto p-4 bg-blue-600 hover:bg-blue-700 text-white rounded-full shadow-[0_4px_15px_rgba(37,99,235,0.4)] hover:shadow-[0_6px_20px_rgba(37,99,235,0.6)] transition-all transform hover:scale-105 active:scale-95 group flex items-center justify-center gap-0 hover:gap-2 z-20">
                <svg class="w-6 h-6 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                <span class="max-w-0 overflow-hidden whitespace-nowrap group-hover:max-w-xs transition-all duration-300 font-bold text-sm">
                    Vincular
                </span>
            </button>
        </div>
    `;

    // 3. Monta o Modal e o Relatório Visual de Taxa de Relacionamento
    const isManual = resultado.cnpj === "N/A";
    const percentual = resultado.cnaesDetalhados.length > 0 
        ? Math.round((cnaesRelacionadosCount / resultado.cnaesDetalhados.length) * 100) 
        : 0;

    const modal = document.createElement('div');
    modal.id = 'modal-analise-cnpj';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in';
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            
            <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    ${isManual ? 'Análise de Múltiplos CNAEs' : 'Análise de Comprovante CNPJ'}
                </h3>
                <button onclick="document.getElementById('modal-analise-cnpj').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <div class="p-4 overflow-y-auto flex-1 flex flex-col gap-4 custom-scrollbar">
                
            <div class="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
                <div class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">${isManual ? 'Origem da Análise' : 'Empresa Identificada'}</div>
                <div class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">${resultado.razaoSocial}</div>
                
                ${!isManual ? `
                <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 mt-2 pt-2 border-t border-slate-200/60 dark:border-slate-700/60 text-xs font-mono text-slate-600 dark:text-slate-300">
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-slate-400">CNPJ:</span> ${resultado.cnpj}
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-slate-400">Abertura:</span> ${resultado.dataAbertura || '-'}
                    </div>
                    <div class="flex items-center gap-1.5">
                        <span class="font-bold text-slate-400">Porte:</span> <span class="uppercase">${resultado.porte || '-'}</span>
                    </div>
                </div>` : ''}

                    <!-- RESUMO ESTATÍSTICO DA ANÁLISE -->
                    <div class="mt-4 flex items-center justify-between p-3 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-800/50 shadow-sm">
                        <div class="flex flex-col">
                            <span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 uppercase tracking-widest">Taxa de Relacionamento</span>
                            <span class="text-sm font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                                ${cnaesRelacionadosCount} de ${resultado.cnaesDetalhados.length} CNAEs encontrados nas famílias.
                            </span>
                        </div>
                        <div class="text-right flex flex-col items-end">
                            <span class="text-2xl font-black ${percentual === 100 ? 'text-emerald-600 dark:text-emerald-400' : (percentual >= 50 ? 'text-blue-600 dark:text-blue-400' : 'text-amber-600 dark:text-amber-400')}">
                                ${percentual}%
                            </span>
                        </div>
                    </div>
                </div>

                <div class="relative shrink-0">
                    <div class="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                        <svg class="h-4 w-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                    </div>
                    <input type="text" id="modal-search" onkeyup="filtrarModalAnalise()" placeholder="Buscar família, CNAE ou descrição..." 
                           class="w-full pl-9 pr-3 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800/50 text-slate-800 dark:text-slate-100 text-sm focus:ring-2 focus:ring-amber-500 focus:border-amber-500 outline-none transition-all placeholder-slate-400">
                </div>

                <div class="flex border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <button id="tab-btn-familias" onclick="switchTabAnalise('familias')" class="px-4 py-2 border-b-2 border-amber-500 text-amber-600 dark:text-amber-400 font-bold text-sm transition-all">
                        Visão por Famílias (${resultado.familiasHabilitadas.length})
                    </button>
                    <button id="tab-btn-cnaes" onclick="switchTabAnalise('cnaes')" class="px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 font-medium text-sm transition-all">
                        Visão por CNAEs (${resultado.cnaes.length})
                    </button>
                </div>

                <div class="flex-1 overflow-y-auto">
                    <div id="tab-content-familias" class="space-y-1 block">
                        ${familiasHtml}
                    </div>
                    <div id="tab-content-cnaes" class="space-y-1 hidden bg-slate-50 dark:bg-slate-900/30 p-2 rounded-lg border border-slate-100 dark:border-slate-800">
                        ${cnaesHtml}
                    </div>
                </div>
            </div>

            <div class="p-4 border-t border-slate-200 dark:border-slate-700 flex flex-wrap justify-end gap-2 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                ${!isManual ? `
                <button onclick="document.getElementById('upload-cnpj').click()" class="px-3 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors font-medium flex items-center gap-1.5 text-xs">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                    Próximo PDF
                </button>` : ''}
                
                <!-- MODELO 1: RELATÓRIO SINTÉTICO / EXECUTIVO -->
                <button onclick="gerarRelatorioPDF('sintetico')" class="px-3 py-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors font-medium flex items-center gap-1.5 text-xs border border-emerald-200 dark:border-emerald-800/50" title="Gera um relatório sintético contendo apenas as famílias habilitadas">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Relatório Executivo
                </button>

                <!-- MODELO 2: RELATÓRIO COMPLETO / AUDITORIA -->
                <button onclick="gerarRelatorioPDF('completo')" class="px-3 py-2 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 rounded-lg transition-colors font-medium flex items-center gap-1.5 text-xs border border-indigo-200 dark:border-indigo-800/50" title="Gera o relatório de auditoria completo com detalhamento individual de cada CNAE">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Relatório Completo
                </button>

                <button onclick="document.getElementById('modal-analise-cnpj').remove()" class="px-3 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors font-medium text-xs">
                    Fechar
                </button>
                
                ${resultado.familiasHabilitadas.length > 0 ? `
                <button onclick="aplicarFiltroDeAnalise('${resultado.familiasHabilitadas.map(f => f['Família']).join(',')}')" 
                        class="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium flex items-center gap-1.5 text-xs">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                    Filtrar Grid
                </button>
                ` : ''}
            </div>
    `;

    document.body.appendChild(modal);
}

// NOVA FUNÇÃO: Faz a animação de Expandir/Colapsar a lista de CNAEs
window.toggleCnaeList = (id) => {
    const list = document.getElementById(`list-${id}`);
    const icon = document.getElementById(`icon-${id}`);
    
    if (list.classList.contains('hidden')) {
        list.classList.remove('hidden');
        icon.classList.add('rotate-180'); // Gira a setinha para cima
    } else {
        list.classList.add('hidden');
        icon.classList.remove('rotate-180'); // Gira a setinha para baixo
    }
};

// ==========================================
// SUGESTÃO DE REMOÇÃO — via análise de comprovante CNPJ
// (CNAE vinculado à família mas ausente no comprovante do fornecedor)
// ==========================================
window.abrirConfirmacaoRemocao = (btn) => {
    const familiaCodigo = btn.dataset.familia;
    const cnaeCodigo = btn.dataset.cnae;
    const cnaeDesc = btn.dataset.desc;

    const modalAntigo = document.getElementById('modal-confirmar-remocao');
    if (modalAntigo) modalAntigo.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-confirmar-remocao';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[170] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 border border-slate-200 dark:border-slate-700 animate-scale-up">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                </div>
                <h3 class="text-base font-bold text-slate-800 dark:text-slate-100">Sugerir remoção de CNAE</h3>
            </div>

            <div class="bg-slate-50 dark:bg-slate-900/50 rounded-lg p-3 border border-slate-200 dark:border-slate-700">
                <div class="flex items-center justify-between gap-2 mb-1">
                    <span class="text-blue-600 dark:text-blue-400 font-mono font-bold text-xs">${cnaeCodigo}</span>
                    <button type="button" onclick="document.getElementById('modal-confirmar-remocao').remove(); reabrirBuscaIbgeDireto('${cnaeCodigo}')"
                        class="text-[10px] text-indigo-600 dark:text-indigo-400 hover:underline font-bold uppercase tracking-wider flex items-center gap-1 shrink-0">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        Ver no IBGE
                    </button>
                </div>
                <p class="text-xs text-slate-600 dark:text-slate-300">${cnaeDesc}</p>
                <p class="text-[10px] text-slate-400 dark:text-slate-500 mt-2">Família ${familiaCodigo} — não encontrado no comprovante desta análise.</p>
            </div>

            <label class="flex items-start gap-2 cursor-pointer">
                <input type="checkbox" id="check-verificou-cnae" onchange="document.getElementById('btn-confirmar-remocao').disabled = !this.checked"
                    class="mt-0.5 rounded text-red-600 w-4 h-4 shrink-0">
                <span class="text-xs text-slate-600 dark:text-slate-300">
                    Confirmo que verifiquei as especificações deste CNAE (atividades/observações no IBGE) antes de sugerir a remoção.
                </span>
            </label>

            <div class="flex justify-end gap-3 pt-2 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onclick="document.getElementById('modal-confirmar-remocao').remove()"
                    class="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold uppercase rounded-lg transition-colors">
                    Cancelar
                </button>
                <button type="button" id="btn-confirmar-remocao" disabled data-familia="${familiaCodigo}" data-cnae="${cnaeCodigo}" data-desc="${cnaeDesc}"
                    onclick="confirmarSugestaoRemocao(this)"
                    class="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold uppercase rounded-lg transition-colors shadow-md">
                    Confirmar Sugestão de Remoção
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

window.confirmarSugestaoRemocao = async (btn) => {
    const familiaCodigo = btn.dataset.familia;
    const cnaeCodigo = btn.dataset.cnae;
    const cnaeDesc = btn.dataset.desc;
    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = 'Enviando...';

    const currentUser = sessionStorage.getItem("cockpit_user_realname") || "Usuário do Sistema";

    try {
        // Mesma lógica de dedup/incremento que vincularCnaesEmLote já usa pra adição
        const { data: existente } = await supabase
            .from('sugestoes_cnae_familia')
            .select('*')
            .eq('familia_codigo', familiaCodigo)
            .eq('cnae_codigo', cnaeCodigo)
            .eq('acao', 'remover')
            .eq('status', 'pendente')
            .maybeSingle();

        if (existente) {
            let usuariosArr = existente.usuarios_sugeriram.split(', ');
            if (!usuariosArr.includes(currentUser)) usuariosArr.push(currentUser);
            const { error } = await supabase.from('sugestoes_cnae_familia').update({
                quantidade: existente.quantidade + 1,
                usuarios_sugeriram: usuariosArr.join(', '),
                updated_at: new Date().toISOString()
            }).eq('id', existente.id);
            if (error) throw error;
        } else {
            const { error } = await supabase.from('sugestoes_cnae_familia').insert([{
                familia_codigo: familiaCodigo,
                cnae_codigo: cnaeCodigo,
                cnae_descricao: cnaeDesc,
                quantidade: 1,
                usuarios_sugeriram: currentUser,
                status: 'pendente',
                origem: 'usuario',
                acao: 'remover',
                motivo: `Analista verificou as especificações do CNAE e sugeriu remoção via análise de comprovante CNPJ (CNAE não encontrado no documento).`,
            }]);
            if (error) throw error;
        }

        if (typeof showToast === 'function') showToast('Sugestão de remoção enviada para análise!');
        document.getElementById('modal-confirmar-remocao').remove();
        if (typeof carregarContadorSugestoes === 'function') carregarContadorSugestoes();
    } catch (err) {
        console.error(err);
        if (typeof showError === 'function') showError('Erro', 'Falha ao enviar sugestão de remoção.');
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
};

// Lógica de alternância das Abas
window.switchTabAnalise = (tabId) => {
    const btnFamilias = document.getElementById('tab-btn-familias');
    const btnCnaes = document.getElementById('tab-btn-cnaes');
    const contentFamilias = document.getElementById('tab-content-familias');
    const contentCnaes = document.getElementById('tab-content-cnaes');

    // Reseta o visual dos botões
    btnFamilias.className = "px-4 py-2 border-b-2 font-medium text-sm transition-all " + 
        (tabId === 'familias' ? "border-amber-500 text-amber-600 dark:text-amber-400 font-bold" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300");
    
    btnCnaes.className = "px-4 py-2 border-b-2 font-medium text-sm transition-all " + 
        (tabId === 'cnaes' ? "border-amber-500 text-amber-600 dark:text-amber-400 font-bold" : "border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300");

    // Mostra/Oculta o conteúdo
    if (tabId === 'familias') {
        contentFamilias.classList.remove('hidden');
        contentFamilias.classList.add('block');
        contentCnaes.classList.remove('block');
        contentCnaes.classList.add('hidden');
    } else {
        contentCnaes.classList.remove('hidden');
        contentCnaes.classList.add('block');
        contentFamilias.classList.remove('block');
        contentFamilias.classList.add('hidden');
    }
};

// Motor de Busca Unificado (Filtra ambas as abas)
window.filtrarModalAnalise = () => {
    const termo = document.getElementById('modal-search').value.toLowerCase();
    
    document.querySelectorAll('.family-card').forEach(card => {
        card.style.display = card.getAttribute('data-search').includes(termo) ? '' : 'none';
    });

    document.querySelectorAll('.cnae-card').forEach(card => {
        card.style.display = card.getAttribute('data-search').includes(termo) ? '' : 'none';
    });
};

// Função de integração: Ao clicar em "Filtrar Grid Principal" no modal
window.aplicarFiltroDeAnalise = (codigosString) => {
    const codigosFamilias = codigosString.split(',');
    const modal = document.getElementById('modal-analise-cnpj');
    if (modal) modal.remove();

    // Filtra as famílias aprovadas
    const familiasFiltradas = familyData.filter(fam => codigosFamilias.includes(fam['Família']));
    
    // Substitui os dados da tela e redesenha
    filteredData = familiasFiltradas;
    currentPage = 1;
    renderGrid();
    
    // --- NOVIDADE: Cria um banner visual para permitir limpar o filtro ---
    let bannerLimpar = document.getElementById('banner-limpar-cnpj');
    if (!bannerLimpar) {
        bannerLimpar = document.createElement('div');
        bannerLimpar.id = 'banner-limpar-cnpj';
        // Estilização com as cores do Tailwind do seu projeto
        bannerLimpar.className = 'col-span-full mb-6 flex flex-col sm:flex-row justify-between items-center gap-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 p-3 lg:px-5 rounded-xl animate-fade-in shadow-sm';
        bannerLimpar.innerHTML = `
            <div class="flex items-center gap-2 text-sm font-bold text-amber-800 dark:text-amber-400">
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>
                Exibindo apenas ${familiasFiltradas.length} família(s) habilitada(s) pelo documento.
            </div>
            <button onclick="limparFiltroCnpj()" class="shrink-0 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-md hover:shadow-lg flex items-center gap-2">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                Limpar Filtro
            </button>
        `;
        
        // Insere o banner dinamicamente logo antes da grelha ('family-grid')
        const gridElement = document.getElementById('family-grid');
        gridElement.parentNode.insertBefore(bannerLimpar, gridElement);
    }
    
    if (typeof showToast === 'function') {
        showToast("Exibindo apenas as famílias habilitadas pelo CNPJ.");
    }
};

// NOVA FUNÇÃO: Remove o banner e restaura a grelha completa
window.limparFiltroCnpj = () => {
    const banner = document.getElementById('banner-limpar-cnpj');
    if (banner) banner.remove();
    
    // A sua função applyFilters() original já faz todo o trabalho de 
    // recarregar a variável 'filteredData' com todas as famílias e chamar o renderGrid()
    if (typeof applyFilters === 'function') {
        applyFilters(true);
    }
    
    if (typeof showToast === 'function') {
        showToast("Filtro removido. Exibindo todas as famílias.");
    }
};

// --- MODAL DE VERIFICAÇÃO DO PDF ---
window.abrirModalPreAnalise = () => {
    const modalAntigo = document.getElementById('modal-pre-analise');
    if (modalAntigo) modalAntigo.remove();

    const modal = document.createElement('div');
    const statusRate = verificarPermissaoConsultaApi();
    modal.id = 'modal-pre-analise';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in';
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md flex flex-col overflow-hidden animate-scale-up border border-slate-200 dark:border-slate-700">
            
            <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80">
                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Análise Documental
                </h3>
                <button onclick="document.getElementById('modal-pre-analise').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <div class="p-6 text-center">
                <div class="w-16 h-16 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mx-auto mb-4">
                    <svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                </div>
                <h4 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Análise por Comprovante ou API</h4>
                
                <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Anexe o PDF da Receita Federal ou utilize a consulta direta por CNPJ (exclusivo para administradores).
                </p>

                <!-- 🔒 CAMPO DE CONSULTA DIRETA POR CNPJ (ADMIN ONLY) -->
                <div class="admin-only mb-5 p-3 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 text-left">
                    <div class="flex justify-between items-center mb-1.5">
                        <label class="block text-[10px] font-bold text-slate-500 uppercase tracking-widest">Consulta Direta via API</label>
                        <span id="contador-api-status" class="text-[10px] font-mono font-bold ${statusRate.permitido ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}">
                            ${statusRate.permitido ? `${statusRate.restantes} restantes (1 min)` : `Aguarde ${statusRate.tempoEspera}`}
                        </span>
                    </div>
                    <div class="flex gap-2">
                        <input type="text" id="input-cnpj-direto" placeholder="Digite o CNPJ..." maxlength="18"
                            class="flex-1 p-2 text-xs border rounded-lg dark:bg-slate-800 dark:border-slate-600 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 font-mono">
                        <button type="button" onclick="consultarCnpjApiDireta()" id="btn-pesquisa-cnpj-api"
                            class="px-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-sm flex items-center justify-center" title="Pesquisar CNPJ na API">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path></svg>
                        </button>
                    </div>
                </div>
                
                <div class="flex flex-col gap-3">
                    <button onclick="document.getElementById('upload-cnpj').click(); document.getElementById('modal-pre-analise').remove();" class="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-all shadow-md flex justify-center items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        Anexar arquivo PDF
                    </button>
                    
                    <a href="https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/" target="_blank" class="w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-semibold transition-all flex justify-center items-center gap-2 border border-slate-200 dark:border-slate-600">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        Emitir na Receita Federal
                    </a>
                </div>
                ${getHistoricoHtml()}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

const LIMITE_MAXIMO_CONSULTAS = 5;
const JANELA_TEMPO_MS = 60 * 1000; // 1 minuto em milissegundos

function verificarPermissaoConsultaApi() {
    let historico = JSON.parse(localStorage.getItem('cnpja_rate_limit') || '[]');
    const agora = Date.now();

    // Filtra apenas os registros que aconteceram nos últimos 60 segundos
    historico = historico.filter(timestamp => (agora - timestamp) < JANELA_TEMPO_MS);

    if (historico.length >= LIMITE_MAXIMO_CONSULTAS) {
        // Calcula quanto tempo falta para o mais antigo expirar
        const tempoMaisAntigo = historico[0];
        const tempoRestanteMs = JANELA_TEMPO_MS - (agora - tempoMaisAntigo);
        const segundosRestantes = Math.ceil(tempoRestanteMs / 1000);
        
        const minutos = Math.floor(segundosRestantes / 60);
        const segundos = segundosRestantes % 60;
        const tempoFormatado = `${minutos}:${segundos < 10 ? '0' : ''}${segundos}`;

        return {
            permitido: false,
            restantes: 0,
            tempoEspera: tempoFormatado
        };
    }

    return {
        permitido: true,
        restantes: LIMITE_MAXIMO_CONSULTAS - historico.length
    };
}

function registrarConsultaApi() {
    let historico = JSON.parse(localStorage.getItem('cnpja_rate_limit') || '[]');
    const agora = Date.now();
    
    historico = historico.filter(timestamp => (agora - timestamp) < JANELA_TEMPO_MS);
    historico.push(agora);
    
    localStorage.setItem('cnpja_rate_limit', JSON.stringify(historico));
}

window.consultarCnpjApiDireta = async () => {
    const statusRate = verificarPermissaoConsultaApi();
    if (!statusRate.permitido) {
        if (typeof showError === 'function') {
            showError("Limite Atingido", `Você esgotou o limite de consultas por minuto. Tente novamente em ${statusRate.tempoEspera}.`);
        }
        return;
    }

    const input = document.getElementById('input-cnpj-direto');
    const btn = document.getElementById('btn-pesquisa-cnpj-api');
    if (!input) return;

    const cnpjLimpo = input.value.replace(/\D/g, '');
    if (cnpjLimpo.length !== 14) {
        if (typeof showError === 'function') showError("Atenção", "Informe um CNPJ válido com 14 dígitos.");
        return;
    }

    registrarConsultaApi();

    const novoStatus = verificarPermissaoConsultaApi();
    const spanStatus = document.getElementById('contador-api-status');
    if (spanStatus) {
        spanStatus.textContent = novoStatus.permitido ? `${novoStatus.restantes} restantes (1 min)` : `Aguarde ${novoStatus.tempoEspera}`;
        spanStatus.className = `text-[10px] font-mono font-bold ${novoStatus.permitido ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`;
    }

    const originalHtml = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin h-4 w-4 text-white" viewBox="0 0 24 24" fill="none"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;

    try {
        // Altera para o endpoint da BrasilAPI conforme o openapi.json fornecido
        const response = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${cnpjLimpo}`);
        if (!response.ok) throw new Error('CNPJ não encontrado na BrasilAPI.');

        const data = await response.json();
        
        // Formata código CNAE numérico de 7 dígitos para o padrão 0000-0/00
        const formatarCodigoCnae = (codigoNum) => {
            const s = String(codigoNum).padStart(7, '0');
            return `${s.substring(0, 4)}-${s.substring(4, 5)}/${s.substring(5, 7)}`;
        };

        const cnaesUnicosSet = new Set();
        const cnaesDetalhados = [];

        // Adiciona CNAE Principal (Mapeado da BrasilAPI: cnae_fiscal e cnae_fiscal_descricao)
        if (data.cnae_fiscal) {
            const codFormatado = formatarCodigoCnae(data.cnae_fiscal);
            cnaesUnicosSet.add(codFormatado);
            cnaesDetalhados.push({ codigo: codFormatado, descricao: data.cnae_fiscal_descricao });
        }

        // Adiciona CNAEs Secundários (Mapeado da BrasilAPI: cnaes_secundarios)[cite: 5]
        if (data.cnaes_secundarios && Array.isArray(data.cnaes_secundarios)) {
            data.cnaes_secundarios.forEach(act => {
                const codFormatado = formatarCodigoCnae(act.codigo);
                cnaesUnicosSet.add(codFormatado);
                cnaesDetalhados.push({ codigo: codFormatado, descricao: act.descricao });
            });
        }

        const cnaesUnicos = Array.from(cnaesUnicosSet);
        const codigosApenasNumeros = cnaesUnicos.map(c => c.replace(/\D/g, ''));

        // Cruza com as famílias cadastradas na memória
        const familiasHabilitadas = familyData.filter(fam => {
            if (!fam.CNAEs || fam.CNAEs.length === 0) return false;
            return fam.CNAEs.some(cnaeFam => codigosApenasNumeros.includes(cnaeFam.codigo.replace(/\D/g, '')));
        });

        const formatarDataBr = (dataIso) => {
            if (!dataIso) return "-";
            const partes = dataIso.split('-');
            if (partes.length !== 3) return dataIso;
            return `${partes[2]}/${partes[1]}/${partes[0]}`;
        };

        // Monta o objeto de resultado compatível com o modal de análise existente
        const resultadoApi = {
            cnpj: data.cnpj ? data.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})$/, "$1.$2.$3/$4-$5") : cnpjLimpo,
            razaoSocial: data.razao_social || "Empresa Consultada",
            porte: data.porte || "NÃO INFORMADO",
            dataAbertura: formatarDataBr(data.data_inicio_atividade),
            cnaes: cnaesUnicos,
            cnaesDetalhados: cnaesDetalhados,
            familiasHabilitadas: familiasHabilitadas
        };

        // Salva no histórico local para reabrir depois se quiser
        salvarHistoricoAnalise(resultadoApi);

        // Fecha o modal de pré-análise e abre o modal oficial de resultados
        document.getElementById('modal-pre-analise').remove();
        exibirModalResultadoAnalise(resultadoApi);

        if (typeof showToast === 'function') showToast("Consulta realizada com sucesso via BrasilAPI!");

    } catch (err) {
        console.error(err);
        if (typeof showError === 'function') showError("Erro na Consulta", err.message || "Falha ao buscar dados do CNPJ.");
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalHtml;
    }
};

// --- GERAÇÃO DE RELATÓRIO PDF (MODELOS SINTÉTICO E COMPLETO) ---
window.gerarRelatorioPDF = (tipoModelo = 'sintetico') => {
    const resultado = window.resultadoAnaliseAtual;
    if (!resultado) return;

    const isCompleto = tipoModelo === 'completo';
    const tituloRelatorio = isCompleto 
        ? "RELATÓRIO DE QUALIFICAÇÃO TÉCNICA - DETALHADO" 
        : "RELATÓRIO DE QUALIFICAÇÃO TÉCNICA - EXECUTIVO";

    if (typeof showToast === 'function') {
        showToast(`Gerando ${isCompleto ? 'Relatório Completo' : 'Relatório Executivo'}, aguarde...`, "info");
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const marginL = 20;
    const marginR = 20;
    const pageW = 210;
    const contentW = pageW - marginL - marginR;
    let y = 20;

    // --- Helpers Internos para Controle de Página e Quebra de Linha ---
    const checkPage = (neededSpace = 10) => {
        if (y + neededSpace > 270) {
            doc.addPage();
            y = 20;
        }
    };

    const drawLine = (x1, y1, x2, y2, r = 200, g = 200, b = 200) => {
        doc.setDrawColor(r, g, b);
        doc.line(x1, y1, x2, y2);
    };

    const writeText = (text, x, yPos, opts = {}) => {
        const { size = 10, style = 'normal', color = [0, 0, 0], align = 'left', maxWidth = null } = opts;
        doc.setFontSize(size);
        doc.setFont('helvetica', style);
        doc.setTextColor(...color);
        if (maxWidth) {
            const lines = doc.splitTextToSize(String(text), maxWidth);
            doc.text(lines, x, yPos, { align });
            return lines.length;
        }
        doc.text(String(text), x, yPos, { align });
        return 1;
    };

    // ==========================================
    // CABEÇALHO GERAL
    // ==========================================
    doc.setFillColor(44, 62, 80);
    doc.rect(marginL, y, contentW, 18, 'F');

    writeText(tituloRelatorio, pageW / 2, y + 7, {
        size: 11, style: 'bold', color: [255, 255, 255], align: 'center'
    });
    writeText('Cruzamento de Compatibilidade CNAE x Famílias Comprasnet.BA', pageW / 2, y + 13, {
        size: 8, style: 'normal', color: [180, 200, 220], align: 'center'
    });
    y += 24;

    const dataAtual = new Date().toLocaleString('pt-BR');
    writeText(`Emissão: ${dataAtual} via Cockpit Gestão`, pageW / 2, y, {
        size: 8, color: [120, 120, 120], align: 'center'
    });
    y += 8;

    // ==========================================
    // SEÇÃO 1 — IDENTIFICAÇÃO E ESTATÍSTICA
    // ==========================================
    doc.setFillColor(230, 236, 245);
    doc.rect(marginL, y, contentW, 7, 'F');
    writeText('1. IDENTIFICAÇÃO E TAXA DE RELACIONAMENTO', marginL + 3, y + 5, {
        size: 9, style: 'bold', color: [44, 62, 80]
    });
    y += 11;

    const cnaesPdfNumericos = resultado.cnaes.map(c => c.replace(/\D/g, ''));
    let cnaesRelacionadosCount = 0;
    resultado.cnaesDetalhados.forEach(c => {
        const cNum = c.codigo.replace(/\D/g, '');
        if (resultado.familiasHabilitadas.some(f => (f.CNAEs || []).some(fc => fc.codigo.replace(/\D/g, '') === cNum))) {
            cnaesRelacionadosCount++;
        }
    });

    const totalCnaes = resultado.cnaesDetalhados.length;
    const percentual = totalCnaes > 0 ? Math.round((cnaesRelacionadosCount / totalCnaes) * 100) : 0;

    const campos = [
        ['Razão Social / Origem:', resultado.razaoSocial],
        ['CNPJ / Identificador:', resultado.cnpj],
        ['Total de CNAEs Analisados:', `${totalCnaes} subclasse(s)`],
        ['CNAEs Encontrados em Famílias:', `${cnaesRelacionadosCount} de ${totalCnaes} (${percentual}% dos CNAES estão relacionados)`],
        ['Famílias Possíveis:', `${resultado.familiasHabilitadas.length} família(s) do catálogo`]
    ];

    campos.forEach(([label, valor]) => {
        checkPage(7);
        writeText(label, marginL, y, { size: 8, style: 'bold', color: [60, 60, 60] });
        writeText(valor, marginL + 48, y, { size: 8, color: [0, 0, 0] });
        y += 6;
    });

    y += 3;
    drawLine(marginL, y, marginL + contentW, y);
    y += 7;

    if (!isCompleto) {
        // ==========================================
        // MODELO SINTÉTICO (Foco nas Famílias Habilitadas)
        // ==========================================
        doc.setFillColor(230, 236, 245);
        doc.rect(marginL, y, contentW, 7, 'F');
        writeText(`2. FAMÍLIAS HABILITADAS (${resultado.familiasHabilitadas.length})`, marginL + 3, y + 5, {
            size: 9, style: 'bold', color: [44, 62, 80]
        });
        y += 11;

        if (resultado.familiasHabilitadas && resultado.familiasHabilitadas.length > 0) {
            resultado.familiasHabilitadas.forEach((fam) => {
                checkPage(20);

                doc.setFillColor(44, 62, 80);
                doc.rect(marginL, y - 4, contentW, 7, 'F');
                writeText(
                    `Família ${fam['Família']} — ${fam['Descrição']}`,
                    marginL + 3, y + 1,
                    { size: 8, style: 'bold', color: [255, 255, 255], maxWidth: contentW - 6 }
                );
                y += 8;

                const cnaesCompativeis = (fam.CNAEs || []).filter(c =>
                    cnaesPdfNumericos.includes(c.codigo.replace(/\D/g, ''))
                );

                if (cnaesCompativeis.length > 0) {
                    cnaesCompativeis.forEach((c, idx) => {
                        checkPage(7);
                        const bgColor = idx % 2 === 0 ? [245, 248, 255] : [255, 255, 255];
                        doc.setFillColor(...bgColor);
                        doc.rect(marginL + 2, y - 3.5, contentW - 4, 6, 'F');
                        writeText(`• ${c.codigo}`, marginL + 4, y, { size: 8, style: 'bold', color: [30, 80, 160] });
                        const descLines = writeText(c.descricao || '', marginL + 25, y, {
                            size: 8, color: [50, 50, 50], maxWidth: contentW - 28
                        });
                        y += Math.max(descLines * 4.5, 6);
                    });
                } else {
                    writeText('Sem detalhamento de CNAEs.', marginL + 4, y, { size: 8, color: [150, 150, 150], style: 'italic' });
                    y += 5;
                }
                y += 4;
            });
        } else {
            doc.setFillColor(255, 243, 205);
            doc.rect(marginL, y - 3, contentW, 10, 'F');
            writeText('⚠ Nenhuma família de contratação compatível identificada.', marginL + 3, y + 3, {
                size: 8, style: 'italic', color: [150, 100, 0]
            });
            y += 12;
        }
    } else {
        // ==========================================
        // MODELO COMPLETO (Foco na Auditoria CNAE x Família x Documentos)
        // ==========================================
        doc.setFillColor(230, 236, 245);
        doc.rect(marginL, y, contentW, 7, 'F');
        writeText(`2. DETALHAMENTO DE TODOS OS CNAEs ANALISADOS`, marginL + 3, y + 5, {
            size: 9, style: 'bold', color: [44, 62, 80]
        });
        y += 11;

        resultado.cnaesDetalhados.forEach((item) => {
            checkPage(15);
            const cNum = item.codigo.replace(/\D/g, '');
            const famsVinculadas = resultado.familiasHabilitadas.filter(f => 
                (f.CNAEs || []).some(fc => fc.codigo.replace(/\D/g, '') === cNum)
            );

            // 1. Cabeçalho do CNAE e quebra dinâmica da descrição
            doc.setFillColor(248, 250, 252);
            doc.rect(marginL, y - 4, contentW, 8, 'F');
            writeText(`CNAE ${item.codigo}`, marginL + 2, y + 1.5, { size: 8, style: 'bold', color: [30, 80, 160] });
            const descLines = writeText(item.descricao || '', marginL + 28, y + 1.5, { size: 8, color: [50, 50, 50], maxWidth: contentW - 30 });
            y += Math.max(descLines * 4.5, 6) + 3;

            // 2. Lista as Famílias vinculadas a este CNAE
            if (famsVinculadas.length > 0) {
                famsVinculadas.forEach(f => {
                    checkPage(12);
                    const famText = `» Família ${f['Família']} - ${f['Descrição']}`;
                    const famLines = writeText(famText, marginL + 5, y, { size: 8, style: 'bold', color: [44, 62, 80], maxWidth: contentW - 10 });
                    y += (famLines * 4.5) + 1;

                    // 3. Exibe a Qualificação Técnica (Exigidos e Elegíveis) para esta família
                    const exigidos = f['Documentos Exigidos'] || f['DOCUMENTOS EXIGIDOS'] || [];
                    const elegiveis = f['Documentos Elegíveis'] || f['DOCUMENTOS ELEGÍVEIS'] || [];

                    if (exigidos.length > 0 || elegiveis.length > 0) {
                        
                        // Lista Documentos Exigidos (em Vermelho)
                        if (exigidos.length > 0) {
                            exigidos.forEach(docName => {
                                checkPage(6);
                                const docLines = writeText(`• Exigido: ${docName}`, marginL + 10, y, { size: 7.5, color: [200, 50, 50], maxWidth: contentW - 15 });
                                y += (docLines * 4.5);
                            });
                        }
                        
                        // Lista Documentos Elegíveis (em Verde/Esmeralda)
                        if (elegiveis.length > 0) {
                            elegiveis.forEach(docName => {
                                checkPage(6);
                                const docLines = writeText(`• Elegível: ${docName}`, marginL + 10, y, { size: 7.5, color: [16, 122, 87], maxWidth: contentW - 15 });
                                y += (docLines * 4.5);
                            });
                        }
                        
                        y += 2;
                    } else {
                        checkPage(6);
                        writeText(`• Sem exigência de qualificação técnica específica.`, marginL + 10, y, { size: 7.5, color: [100, 100, 100], style: 'italic' });
                        y += 5;
                    }
                });
            } else {
                checkPage(6);
                writeText('Este CNAE ainda não foi mapeado para vinculação', marginL + 5, y, { size: 7.5, color: [200, 50, 50], style: 'italic' });
                y += 5;
            }

            // Linha separadora de CNAEs
            y += 2;
            drawLine(marginL, y, marginL + contentW, y, 235, 235, 235);
            y += 6;
        });
    }

    // ==========================================
    // RODAPÉ E ASSINATURA GERAL
    // ==========================================
    checkPage(25);
    y += 6;
    drawLine(marginL, y, marginL + contentW, y, 180, 180, 180);
    y += 8;

    const assinW = 80;
    const assinX = (pageW - assinW) / 2;
    drawLine(assinX, y, assinX + assinW, y, 0, 0, 0);
    y += 4;
    writeText('Analista Responsável', pageW / 2, y, {
        size: 8, style: 'bold', color: [0, 0, 0], align: 'center'
    });
    y += 4;
    writeText('Coordenação de Gestão do Cadastro de Fornecedores', pageW / 2, y, {
        size: 7, color: [100, 100, 100], align: 'center'
    });

    // Numeração de páginas
    const totalPages = doc.getNumberOfPages();
    for (let i = 1; i <= totalPages; i++) {
        doc.setPage(i);
        writeText(`Página ${i} de ${totalPages}`, pageW - marginR, 287, {
            size: 7, color: [150, 150, 150], align: 'right'
        });
        writeText('CGCF/DSL/SRL — SAEB', marginL, 287, {
            size: 7, color: [150, 150, 150]
        });
    }

    // Nome de arquivo dinâmico conforme a origem da análise
    const idNome = resultado.cnpj !== "N/A" ? resultado.cnpj.replace(/\D/g, '') : "Pesquisa_Manual";
    const nomeArquivo = `Qualificacao_${idNome}_${isCompleto ? 'Completo' : 'Executivo'}.pdf`;
    
    doc.save(nomeArquivo);
    
    if (typeof showToast === 'function') {
        showToast(`Relatório ${isCompleto ? 'Completo' : 'Executivo'} baixado com sucesso!`, "success");
    }
};

// ==========================================
// MUDANÇA: FLUXO DE SUGESTÃO DE VÍNCULO
// ==========================================
window.vincularCnaesEmLote = async () => {
    const checkboxes = document.querySelectorAll('.cnae-checkbox-vincular:checked');
    const inputFamilias = document.getElementById('vincular-familias-input').value;
    const familiasAlvo = inputFamilias.split(/[,;]+/).map(f => f.trim()).filter(f => f);

    if (familiasAlvo.length === 0) {
        if (typeof showError === 'function') showError("Atenção", "Informe ao menos um código de família.");
        return;
    }

    const btnSave = document.querySelector('#modal-vinculo-cnaes button.bg-blue-600');
    const originalBtnText = btnSave.innerHTML;
    btnSave.innerHTML = "Enviando Sugestão...";
    btnSave.disabled = true;

    // Captura o usuário logado (Ajuste a key caso seja diferente no seu sessionStorage)
    const currentUser = sessionStorage.getItem("cockpit_user_realname") || "Usuário do Sistema";

    try {
        const cnaesSelecionados = Array.from(checkboxes).map(cb => ({
            codigo: cb.value,
            descricao: cb.getAttribute('data-desc')
        }));

        let sugestoesCriadas = 0;

        for (let cod of familiasAlvo) {
            for (let cnae of cnaesSelecionados) {
                // 1. Verifica se já existe uma sugestão PENDENTE para este par
                const { data: existente, error: findError } = await supabase
                    .from('sugestoes_cnae_familia')
                    .select('*')
                    .eq('familia_codigo', cod)
                    .eq('cnae_codigo', cnae.codigo)
                    .eq('status', 'pendente')
                    .maybeSingle(); // maybeSingle não quebra se não encontrar

                if (existente) {
                    // 2. Se existe, incrementa a quantidade e adiciona o usuário (se não estiver na lista)
                    let usuariosArr = existente.usuarios_sugeriram.split(', ');
                    if (!usuariosArr.includes(currentUser)) {
                        usuariosArr.push(currentUser);
                    }
                    
                    await supabase.from('sugestoes_cnae_familia').update({
                        quantidade: existente.quantidade + 1,
                        usuarios_sugeriram: usuariosArr.join(', '),
                        updated_at: new Date().toISOString()
                    }).eq('id', existente.id);
                    sugestoesCriadas++;
                } else {
                    // 3. Se não existe, cria a sugestão do zero
                    await supabase.from('sugestoes_cnae_familia').insert([{
                        familia_codigo: cod,
                        cnae_codigo: cnae.codigo,
                        cnae_descricao: cnae.descricao,
                        quantidade: 1,
                        usuarios_sugeriram: currentUser,
                        status: 'pendente'
                    }]);
                    sugestoesCriadas++;
                }
            }
        }

        if (sugestoesCriadas > 0) {
            if (typeof showToast === 'function') {
                showToast("Sugestão de vínculo enviada para análise!");
            }
            document.querySelectorAll('.cnae-checkbox-vincular').forEach(cb => cb.checked = false);
            fecharModalVinculoCnaes();
            carregarContadorSugestoes(); // Atualiza o badge se o admin estiver logado
        }

    } catch (err) {
        console.error(err);
        showError("Erro", "Falha ao enviar sugestão de relacionamento.");
    } finally {
        if (btnSave) {
            btnSave.innerHTML = originalBtnText;
            btnSave.disabled = false;
        }
    }
};

// ==========================================
// LÓGICA DO PAINEL DE VALIDAÇÃO (ADMIN)
// ==========================================

window.abrirModalSugestoesAdmin = async () => {
    document.getElementById('modal-validar-sugestoes').classList.remove('hidden');
    const container = document.getElementById('lista-sugestoes-admin');
    container.innerHTML = `<p class="text-center py-8 text-slate-500 animate-pulse">Carregando sugestões pendentes...</p>`;

    const { data: sugestoes, error } = await supabase
        .from('sugestoes_cnae_familia')
        .select('*')
        .eq('status', 'pendente')
        .order('gemini_score', { ascending: false, nullsFirst: false })
        .order('quantidade', { ascending: false });

    if (error) {
        container.innerHTML = `<p class="text-center py-8 text-red-500">Erro ao buscar dados do banco.</p>`;
        return;
    }

    sugestoesCarregadas = sugestoes; 

    if (sugestoes.length === 0) {
        container.innerHTML = `
            <div class="text-center p-8 bg-white dark:bg-slate-800 rounded-xl border border-dashed dark:border-slate-700">
                <p class="text-slate-500 dark:text-slate-400">Nenhuma sugestão de vínculo pendente no momento.</p>
            </div>`;
        return;
    }

    // Usamos o .map() com chaves {} para poder executar a busca antes de retornar o HTML
container.innerHTML = sugestoes.map(sug => {
        const familiaEncontrada = familyData.find(f => f.Família.toString() === sug.familia_codigo);
        const descricaoFamilia = familiaEncontrada ? familiaEncontrada.Descrição : "Descrição não encontrada";

        // --- Lógica de Cores da Badge do Gemini ---
        let geminiBadgeHtml = '';
        if (sug.gemini_score !== null && sug.gemini_score !== undefined) {
            let colorClass = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800';
            if (sug.gemini_score >= 8) {
                colorClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
            } else if (sug.gemini_score >= 4) {
                colorClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800';
            }

            geminiBadgeHtml = `
            <div class="mt-3 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1">
                <div class="flex items-center gap-2">
                    <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border shadow-sm ${colorClass}">
                        🤖 Score IA: ${sug.gemini_score}/10
                    </span>
                </div>
                <span class="text-xs text-slate-600 dark:text-slate-400 leading-tight">
                    ${sug.gemini_justificativa}
                </span>
            </div>`;
        }

        return `
        <div id="sugestao-${sug.id}" class="bg-white dark:bg-slate-800 p-4 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row justify-between items-center gap-4 shadow-sm hover:shadow-md transition-all">
            <div class="flex-1 w-full">
                <div class="flex items-center gap-3 mb-1">
                    <span class="bg-purple-100 text-purple-700 dark:bg-purple-900/40 dark:text-purple-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider shadow-sm">
                        Família ${sug.familia_codigo}
                    </span>
                    ${sug.acao === 'remover' ? `
                    <span class="bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm border border-red-200 dark:border-red-800">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        REMOÇÃO
                    </span>` : ''}
                    <span class="bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4v16m8-8H4"></path></svg>
                        ${sug.quantidade} ${sug.quantidade > 1 ? 'Sugestões' : 'Sugestão'}
                    </span>
                    <button type="button" onclick="event.stopPropagation(); abrirModalItensFamilia('${sug.familia_codigo}')"
                        class="p-1.5 text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0"
                        title="Ver itens de compra desta família">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                    </button>
                    ${(sug.gemini_score === null || sug.gemini_score === undefined) ? `
                    <button type="button" id="btn-ia-${sug.id}" data-id="${sug.id}"
                        onclick="analisarUmaSugestao(this)"
                        class="bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/70 px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider flex items-center gap-1 shadow-sm transition-colors border border-violet-200 dark:border-violet-800"
                        title="Analisar lote de até 8 sugestões com IA (respeita limite de taxa)">
                        <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                        IA
                    </button>` : ''}
                </div>
                
                <div class="mb-3 text-xs font-bold text-slate-800 dark:text-slate-200 uppercase tracking-wide">
                    ${descricaoFamilia}
                </div>
                
                <div class="mb-1 flex items-center gap-1">
                    <span class="text-blue-600 dark:text-blue-400 font-mono font-bold text-sm">${sug.cnae_codigo}</span>
                    <span class="text-slate-700 dark:text-slate-300 text-sm ml-1">${sug.cnae_descricao}</span>
                    <button type="button" onclick="event.stopPropagation(); reabrirBuscaIbgeDireto('${sug.cnae_codigo}')"
                        class="p-1 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-md transition-colors shrink-0"
                        title="Ver detalhes completos do CNAE no IBGE">
                        <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"></path>
                        </svg>
                    </button>
                </div>
                
                <p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                    <strong>Sugerido por:</strong> ${sug.usuarios_sugeriram}
                </p>
                ${sug.motivo ? `<p class="text-[10px] text-slate-500 dark:text-slate-400 mt-1 italic">⚙️ Motor Local: ${sug.motivo}</p>` : ''}
                
                <!-- INJEÇÃO DA BADGE DO GEMINI AQUI -->
                ${geminiBadgeHtml}
            </div>
            
            <div class="flex gap-2 shrink-0 self-start sm:self-center mt-3 sm:mt-0">
                <button onclick="processarSugestao('${sug.id}', 'rejeitar')" class="p-2 text-red-500 bg-red-50 hover:bg-red-500 hover:text-white dark:bg-red-900/20 dark:hover:bg-red-600 rounded-lg transition-colors border border-red-100 dark:border-red-800" title="Rejeitar">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <button onclick="processarSugestao('${sug.id}', 'aprovar', '${sug.familia_codigo}', '${sug.cnae_codigo}', '${sug.cnae_descricao}', '${sug.acao || 'adicionar'}')" class="px-4 py-2 ${sug.acao === 'remover' ? 'bg-red-600 hover:bg-red-700' : 'bg-emerald-600 hover:bg-emerald-700'} text-white text-xs font-bold uppercase tracking-wider rounded-lg transition-colors shadow-md flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>
                    ${sug.acao === 'remover' ? 'Aprovar Remoção' : 'Aprovar'}
                </button>
            </div>
        </div>
        `;
    }).join('');
};

window.fecharModalSugestoesAdmin = () => {
    document.getElementById('modal-validar-sugestoes').classList.add('hidden');
    carregarContadorSugestoes(); // Atualiza contador ao fechar
};

// ==========================================
// ANÁLISE DE IA EM LOTE (clicar em 1 analisa até 20, numa única requisição)
// ==========================================
const TAMANHO_LOTE_IA = 20;  // 1 chamada à Edge Function pra esse tanto — não gasta RPM extra
const SVG_SPINNER_IA = `<svg class="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
const SVG_RAIO_IA = `<svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`;

window.analisarUmaSugestao = async (btn) => {
    if (iaLoteEmAndamento) {
        if (typeof showToast === 'function') showToast('Já tem um lote de IA rodando — aguarde terminar.');
        return;
    }
    iaLoteEmAndamento = true;

    try {
        const idClicado = btn.dataset.id;
        const semAnalise = sugestoesCarregadas.filter(s =>
            (s.gemini_score === null || s.gemini_score === undefined) && document.getElementById(`btn-ia-${s.id}`)
        );
        const lote = [
            semAnalise.find(s => s.id === idClicado),
            ...semAnalise.filter(s => s.id !== idClicado),
        ].filter(Boolean).slice(0, TAMANHO_LOTE_IA);

        if (typeof showToast === 'function') showToast(`Analisando ${lote.length} sugestões com IA (1 requisição)...`);

        lote.forEach(s => {
            const b = document.getElementById(`btn-ia-${s.id}`);
            if (b) { b.disabled = true; b.innerHTML = `${SVG_SPINNER_IA} IA`; }
        });

        const itens = lote.map(sug => {
            const fam = familyData.find(f => f.Família.toString() === sug.familia_codigo);
            return { id: sug.id, familia: fam ? fam.Descrição : '', cnae: sug.cnae_descricao };
        });

        let sucesso = 0;
        try {
            const resultados = await window.analisarLoteSugestoes(itens);
            const porId = new Map(resultados.map(r => [String(r.id), r]));

            lote.forEach(sug => {
                const b = document.getElementById(`btn-ia-${sug.id}`);
                const r = porId.get(String(sug.id));
                if (r && r.score !== null && r.score !== undefined) {
                    inserirBadgeIA(sug.id, r.score, r.justificativa);
                    sug.gemini_score = r.score;
                    if (b) b.remove();
                    sucesso++;
                } else if (b) {
                    b.disabled = false;
                    b.innerHTML = `${SVG_RAIO_IA} IA`;
                }
            });
        } catch (err) {
            console.error('Falha no lote de IA:', err);
            lote.forEach(sug => {
                const b = document.getElementById(`btn-ia-${sug.id}`);
                if (b) { b.disabled = false; b.innerHTML = `${SVG_RAIO_IA} IA`; }
            });
            if (typeof showError === 'function') showError('Erro na IA', err.message || 'Falha ao analisar o lote. Tente novamente.');
        }

        if (typeof showToast === 'function') showToast(`IA concluiu ${sucesso} de ${lote.length} sugestões.`);
    } finally {
        iaLoteEmAndamento = false;
    }
};

// Busca o arquivo de itens só na primeira vez

window.abrirModalItensFamilia = async (codigoFamilia) => {
    let modal = document.getElementById('modal-itens-familia');
    if (modal) modal.remove();

    const familiaInfo = familyData.find(f => f.Família.toString() === codigoFamilia);
    const descFamilia = familiaInfo ? familiaInfo.Descrição : '';

    modal = document.createElement('div');
    modal.id = 'modal-itens-familia';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[160] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-lg max-h-[85vh] flex flex-col overflow-hidden animate-scale-up border border-slate-200 dark:border-slate-700">
            <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                <div>
                    <div class="inline-block px-2 py-0.5 bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400 font-mono font-bold text-xs rounded mb-1">
                        Família ${codigoFamilia}
                    </div>
                    <h3 class="text-sm font-bold text-slate-800 dark:text-slate-100">${descFamilia}</h3>
                </div>
                <button onclick="document.getElementById('modal-itens-familia').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors shrink-0">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            <div class="p-4 flex flex-col gap-3 flex-1 overflow-hidden">
                <input type="text" id="itens-familia-busca" oninput="filtrarItensFamilia(this.value)"
                    placeholder="Buscar item por código ou descrição..."
                    class="w-full px-3 py-2 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-purple-500 focus:outline-none text-slate-700 dark:text-slate-300 shrink-0">
                <p id="itens-familia-contador" class="text-[10px] text-slate-400 dark:text-slate-500 shrink-0"></p>
                <div id="itens-familia-lista" class="flex flex-col gap-1.5 overflow-y-auto flex-1">
                    <p class="text-center text-sm text-slate-500 dark:text-slate-400 py-8 animate-pulse">Carregando itens...</p>
                </div>
                <div id="itens-familia-paginacao" class="hidden items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-700 shrink-0">
                    <button type="button" onclick="mudarPaginaItensFamilia(-1)"
                        class="px-3 py-1.5 text-xs font-bold uppercase rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Anterior
                    </button>
                    <span id="itens-familia-pagina-label" class="text-[10px] text-slate-400 dark:text-slate-500"></span>
                    <button type="button" onclick="mudarPaginaItensFamilia(1)"
                        class="px-3 py-1.5 text-xs font-bold uppercase rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
                        Próxima
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    itensFamiliaCodigoAtual = codigoFamilia;
    itensFamiliaPage = 1;
    itensFamiliaTermoBusca = '';
    await renderItensFamiliaLista();
};

// Só troca a lista + paginação — o input de busca nunca é recriado, então não perde foco ao digitar
async function renderItensFamiliaLista() {
    const lista = document.getElementById('itens-familia-lista');
    const contador = document.getElementById('itens-familia-contador');
    const paginacao = document.getElementById('itens-familia-paginacao');
    const paginaLabel = document.getElementById('itens-familia-pagina-label');
    if (!lista) return;

    lista.innerHTML = `<p class="text-center text-sm text-slate-500 dark:text-slate-400 py-8 animate-pulse">Carregando...</p>`;

    const inicio = (itensFamiliaPage - 1) * ITENS_FAMILIA_POR_PAGINA;
    const fim = inicio + ITENS_FAMILIA_POR_PAGINA - 1;

    let query = supabase
        .from('itens_por_familia')
        .select('item_codigo, descricao', { count: 'exact' })
        .eq('familia_codigo', itensFamiliaCodigoAtual);

    // remove caracteres que quebrariam a sintaxe de filtro do PostgREST
    const termoLimpo = itensFamiliaTermoBusca.trim().replace(/[,()%]/g, '');
    if (termoLimpo) {
        query = query.or(`descricao.ilike.%${termoLimpo}%,item_codigo.ilike.%${termoLimpo}%`);
    }

    const { data, count, error } = await query
        .order('item_codigo', { ascending: true })
        .range(inicio, fim);

    if (error) {
        console.error(error);
        lista.innerHTML = `<p class="text-center text-sm text-red-500 py-8">Erro ao buscar itens desta família.</p>`;
        return;
    }

    const total = count || 0;
    const totalPaginas = Math.ceil(total / ITENS_FAMILIA_POR_PAGINA) || 1;
    if (itensFamiliaPage > totalPaginas) itensFamiliaPage = totalPaginas;

    if (contador) {
        contador.textContent = itensFamiliaTermoBusca
            ? `${total} resultado${total === 1 ? '' : 's'} para essa busca`
            : `${total} item${total === 1 ? '' : 's'} cadastrado${total === 1 ? '' : 's'}`;
    }

    lista.innerHTML = (data && data.length > 0)
        ? data.map(({ item_codigo, descricao }) => `
            <div class="p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 text-xs">
                <div class="font-mono text-[10px] text-slate-400 dark:text-slate-500 mb-0.5">${item_codigo}</div>
                <div class="text-slate-700 dark:text-slate-300 leading-snug">${descricao}</div>
            </div>`).join('')
        : `<p class="text-center text-sm text-slate-400 dark:text-slate-500 italic py-8">
            ${total === 0 && !itensFamiliaTermoBusca ? 'Nenhum item cadastrado para esta família.' : 'Nenhum resultado encontrado para essa busca.'}
           </p>`;

    if (paginacao) {
        if (totalPaginas > 1) {
            paginacao.classList.remove('hidden');
            paginacao.classList.add('flex');
            const btns = paginacao.querySelectorAll('button');
            btns[0].disabled = itensFamiliaPage === 1;
            btns[1].disabled = itensFamiliaPage === totalPaginas;
            if (paginaLabel) paginaLabel.textContent = `Página ${itensFamiliaPage} de ${totalPaginas}`;
        } else {
            paginacao.classList.add('hidden');
            paginacao.classList.remove('flex');
        }
    }
}

// Debounce de 300ms — antes filtrava a cada tecla (era grátis, tudo em memória);
// agora cada busca é uma consulta ao banco, então espera parar de digitar.
window.filtrarItensFamilia = (valor) => {
    clearTimeout(itensFamiliaDebounceTimer);
    itensFamiliaDebounceTimer = setTimeout(() => {
        itensFamiliaTermoBusca = valor;
        itensFamiliaPage = 1;
        renderItensFamiliaLista();
    }, 300);
};

window.mudarPaginaItensFamilia = (delta) => {
    itensFamiliaPage += delta;
    renderItensFamiliaLista();
};

// Insere a badge de score no card já renderizado, sem recarregar a lista inteira
function inserirBadgeIA(id, score, justificativa) {
    const card = document.getElementById(`sugestao-${id}`);
    if (!card) return;

    let colorClass = 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800';
    if (score >= 8) colorClass = 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
    else if (score >= 4) colorClass = 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800';

    const badgeHtml = `
    <div class="mt-3 p-2.5 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-col gap-1 animate-fade-in">
        <div class="flex items-center gap-2">
            <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border shadow-sm ${colorClass}">
                🤖 Score IA: ${score}/10
            </span>
        </div>
        <span class="text-xs text-slate-600 dark:text-slate-400 leading-tight">${justificativa}</span>
    </div>`;

    const coluna = card.querySelector('.flex-1.w-full');
    if (coluna) coluna.insertAdjacentHTML('beforeend', badgeHtml);
}

window.processarSugestao = async (id, decisao, codFamilia = null, codCnae = null, descCnae = null, tipoAcao = 'adicionar') => {
    const card = document.getElementById(`sugestao-${id}`);
    if (card) card.style.opacity = '0.5';

    try {
        if (decisao === 'aprovar') {
            // 1. Pega a família atual no array em memória
            const indexFamilia = familyData.findIndex(f => f.Família.toString() === codFamilia);
            
            if (indexFamilia !== -1) {
                let familiaInfo = familyData[indexFamilia];
                if (!familiaInfo.CNAEs) familiaInfo.CNAEs = [];

                const cnaeJaExiste = familiaInfo.CNAEs.some(c => normalizarCodigoCnae(c.codigo) === normalizarCodigoCnae(codCnae));
                const precisaSalvar = tipoAcao === 'remover' ? cnaeJaExiste : !cnaeJaExiste;

                if (precisaSalvar) {
                    if (tipoAcao === 'remover') {
                        familiaInfo.CNAEs = familiaInfo.CNAEs.filter(c => normalizarCodigoCnae(c.codigo) !== normalizarCodigoCnae(codCnae));
                    } else {
                        familiaInfo.CNAEs.push({ codigo: codCnae, descricao: descCnae });
                    }

                    // 2. Atualiza no Supabase (Tabela Qualificacao)
                    const payloadSupa = {
                        familia: familiaInfo["Família"],
                        descricao: familiaInfo["Descrição"],
                        tipo: familiaInfo["Tipo"],
                        terceirizado: familiaInfo["Terceirizado"],
                        documentos_exigidos: familiaInfo["Documentos Exigidos"],
                        documentos_elegiveis: familiaInfo["Documentos Elegíveis"],
                        cnaes: familiaInfo.CNAEs,
                        ramo: familiaInfo["Ramo"]
                    };
                    const { error: updError } = await supabase.from('qualificacao_tecnica').upsert([payloadSupa]);
                    if (updError) throw updError;

                    // Atualiza dicionário de CNAE global se necessário (só faz sentido pra adição)
                    if (tipoAcao !== 'remover' && !cnaeDictionary.some(c => c.CNAE === codCnae)) {
                        cnaeDictionary.push({ "CNAE": codCnae, "DESCRIÇÃO": descCnae });
                    }
                }
            } else {
                showError("Erro", `A família ${codFamilia} não foi encontrada na base local.`);
                if (card) card.style.opacity = '1';
                return;
            }
        }

        // 3. Atualiza o status da sugestão
        const novoStatus = decisao === 'aprovar' ? 'aprovado' : 'rejeitado';
        await supabase.from('sugestoes_cnae_familia').update({ status: novoStatus }).eq('id', id);

        // Remove o card da UI e mostra aviso
        if (card) {
            card.style.transform = 'translateX(20px)';
            card.style.opacity = '0';
            setTimeout(() => card.remove(), 300);
        }
        showToast(decisao === 'aprovar' ? "Sugestão aprovada e vínculo realizado!" : "Sugestão rejeitada.");
        
        // Atualiza a grid no fundo
        if (decisao === 'aprovar') {
            applyFilters(false);
            enviarStatsParaHome();
        }

    } catch (err) {
        console.error(err);
        showError("Erro", "Houve uma falha ao processar a sugestão.");
        if (card) card.style.opacity = '1';
    }
};

// Dispara a contagem do badge ao iniciar a tela
document.addEventListener('DOMContentLoaded', () => {
    // Dá um timeout rápido para garantir que o cliente Supabase esteja ok
    setTimeout(carregarContadorSugestoes, 1500); 
});

window.abrirModalVinculoCnaes = () => {
    // 1. Verifica se selecionou algo antes de abrir a tela
    const checkboxes = document.querySelectorAll('.cnae-checkbox-vincular:checked');
    if (checkboxes.length === 0) {
        if (typeof showError === 'function') showError("Atenção", "Selecione ao menos um CNAE na lista antes de vincular.");
        return;
    }

    // 2. Remove modal anterior se houver (para evitar duplicatas em caso de bug)
    fecharModalVinculoCnaes();

    // 3. Monta e insere o Modal 100% Opaco
    const modalHtml = `
    <div id="modal-vinculo-cnaes" class="fixed inset-0 bg-slate-900/80 backdrop-blur-sm z-[150] flex items-center justify-center p-4 animate-fade-in">
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 flex flex-col gap-4 border border-slate-200 dark:border-slate-700 animate-scale-up">
            
            <div class="flex justify-between items-center mb-2">
                <h3 class="text-lg font-bold text-blue-800 dark:text-blue-400 uppercase tracking-wider flex items-center gap-2">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1"></path></svg>
                    Vincular ${checkboxes.length} CNAE(s)
                </h3>
                <button onclick="fecharModalVinculoCnaes()" class="text-slate-400 hover:text-red-500 transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>
            
            <p class="text-sm text-slate-600 dark:text-slate-300">
                Informe os códigos das famílias que receberão os CNAEs selecionados:
            </p>

            <div class="flex flex-col gap-1">
                <input type="text" id="vincular-familias-input" placeholder="Ex: 01.01, 02.05" 
                    class="w-full p-3 text-sm border border-slate-300 dark:border-slate-600 rounded-lg bg-slate-50 dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-blue-500 shadow-inner">
                <p class="text-[10px] text-blue-600/80 dark:text-blue-400/80 italic ml-1">
                    * Separe múltiplos códigos por vírgula.
                </p>
            </div>

            <div class="flex justify-end gap-3 mt-4 pt-4 border-t border-slate-100 dark:border-slate-700">
                <button type="button" onclick="fecharModalVinculoCnaes()" class="px-5 py-2.5 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 text-xs font-bold uppercase rounded-lg transition-colors">
                    Cancelar
                </button>
                <button type="button" onclick="vincularCnaesEmLote()" class="px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-bold uppercase rounded-lg transition-colors shadow-lg active:scale-95">
                    Salvar Vínculos
                </button>
            </div>
        </div>
    </div>
    `;

    document.body.insertAdjacentHTML('beforeend', modalHtml);
    document.getElementById('vincular-familias-input').focus();
};

window.fecharModalVinculoCnaes = () => {
    const m = document.getElementById('modal-vinculo-cnaes');
    if (m) m.remove();
};

// Função para salvar no localStorage 
function salvarHistoricoAnalise(resultado) {
    let historico = JSON.parse(localStorage.getItem('cockpit_cnpj_history') || '[]');
    historico = historico.filter(h => h.cnpj !== resultado.cnpj);
    
    // Salva já limpando qualquer lixo que tenha vindo do PDF
    const cnaesLimpos = resultado.cnaes.filter(c => c && typeof c === 'string' && c.replace(/\D/g, '').length === 7);

    historico.unshift({
        cnpj: resultado.cnpj,
        razaoSocial: resultado.razaoSocial,
        data: new Date().getTime(),
        cnaesBrutos: cnaesLimpos 
    });
    
    localStorage.setItem('cockpit_cnpj_history', JSON.stringify(historico.slice(0, 3)));
}

// Função para reabrir uma análise salva (ATUALIZADA COM SANITIZAÇÃO)
window.reabrirAnalise = async (cnpj) => {
    const historico = JSON.parse(localStorage.getItem('cockpit_cnpj_history') || '[]');
    const item = historico.find(h => h.cnpj === cnpj);
    
    if (item) {
        const modalPre = document.getElementById('modal-pre-analise');
        if (modalPre) modalPre.remove();
        
        if (typeof showToast === 'function') showToast("Reanalisando CNPJ com as regras atuais...", "info");

        // Tenta buscar no formato novo (cnaesBrutos) ou resgatar do formato antigo (resultado.cnaes)
        let cnaesBrutos = [];
        if (item.cnaesBrutos && item.cnaesBrutos.length > 0) {
            cnaesBrutos = item.cnaesBrutos;
        } else if (item.resultado && item.resultado.cnaes && item.resultado.cnaes.length > 0) {
            cnaesBrutos = item.resultado.cnaes;
        }

        // --- A MÁGICA DA LIMPEZA (SANITIZAÇÃO) ---
        // 1. Remove vazios e strings que não contenham 7 números
        // 2. Padroniza a formatação para evitar duplicatas ou bugs
        let cnaesUnicos = cnaesBrutos.filter(c => {
            if (!c || typeof c !== 'string') return false;
            return c.replace(/\D/g, '').length === 7;
        }).map(val => {
            const num = val.replace(/\D/g, '');
            return num.substring(0, 4) + '-' + num.substring(4, 5) + '/' + num.substring(5, 7);
        });

        // Remove duplicatas exatas
        cnaesUnicos = [...new Set(cnaesUnicos)];

        if (cnaesUnicos.length === 0) {
            if (typeof showError === 'function') showError("Aviso", "Não foi possível recuperar CNAEs válidos deste histórico. Faça o upload do PDF novamente.");
            return;
        }

        const cnaesDetalhados = [];

        // 1. Refaz a busca das descrições 
        for (const codigo of cnaesUnicos) {
            let cnaeLocal = cnaeDictionary.find(c => c.CNAE === codigo);
            
            if (cnaeLocal) {
                cnaesDetalhados.push({ codigo: cnaeLocal.CNAE, descricao: cnaeLocal.DESCRIÇÃO });
            } else {
                try {
                    const cleanCode = codigo.replace(/\D/g, '');
                    const response = await fetch(`https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${cleanCode}`);
                    if (response.ok) {
                        const data = await response.json();
                        const cnaeIbge = Array.isArray(data) ? data[0] : data;
                        if (cnaeIbge && cnaeIbge.descricao) {
                            cnaesDetalhados.push({ codigo: codigo, descricao: cnaeIbge.descricao });
                            cnaeDictionary.push({ "CNAE": codigo, "DESCRIÇÃO": cnaeIbge.descricao });
                        }
                    } else {
                        cnaesDetalhados.push({ codigo: codigo, descricao: "Descrição não encontrada no IBGE" });
                    }
                } catch (e) {
                    cnaesDetalhados.push({ codigo: codigo, descricao: "Erro ao buscar descrição" });
                }
            }
        }

        // 2. Refaz o cruzamento com as Famílias ATUAIS renderizadas na memória
        const codigosApenasNumeros = cnaesUnicos.map(c => c.replace(/\D/g, ''));
        const familiasHabilitadas = familyData.filter(fam => {
            if (!fam.CNAEs || fam.CNAEs.length === 0) return false;
            return fam.CNAEs.some(cnaeFam => codigosApenasNumeros.includes(cnaeFam.codigo.replace(/\D/g, '')));
        });

        // 3. Reconstrói o objeto resultado perfeitamente limpo e atualizado
        const resultadoAtualizado = {
            cnpj: item.cnpj,
            razaoSocial: item.razaoSocial,
            cnaes: cnaesUnicos,
            cnaesDetalhados: cnaesDetalhados,
            familiasHabilitadas: familiasHabilitadas
        };

        exibirModalResultadoAnalise(resultadoAtualizado);
    }
};

// Função para renderizar o histórico dentro do modal
function getHistoricoHtml() {
    const historico = JSON.parse(localStorage.getItem('cockpit_cnpj_history') || '[]');
    if (historico.length === 0) return '';
    
    const itens = historico.map(h => `
        <button onclick="reabrirAnalise('${h.cnpj}')" 
            class="w-full text-left p-3 bg-slate-50 dark:bg-slate-900 border dark:border-slate-700 rounded-lg hover:border-blue-400 transition-all group">
            <div class="text-[10px] font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-blue-600">${h.razaoSocial}</div>
            <div class="text-[9px] text-slate-500 font-mono mt-0.5">${h.cnpj}</div>
        </button>
    `).join('');

    return `
        <div class="mt-6 border-t dark:border-slate-700 pt-4">
            <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mb-3">Últimas análises</p>
            <div class="space-y-2">${itens}</div>
        </div>
    `;
}

// ==========================================
// INTEGRAÇÃO API IBGE - MODAL STANDALONE
// ==========================================
window.abrirModalBuscaCnae = () => {
    document.getElementById('ibge-cnae-input').value = '';
    document.getElementById('ibge-cnae-result').classList.add('hidden');
    document.getElementById('modal-busca-cnae').classList.remove('hidden');
    setTimeout(() => document.getElementById('ibge-cnae-input').focus(), 100);
};

window.fecharModalBuscaCnae = () => {
    document.getElementById('modal-busca-cnae').classList.add('hidden');
};

document.getElementById('ibge-cnae-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') buscarCnaeIbge();
});

window.buscarCnaeIbge = async () => {
    const input = document.getElementById('ibge-cnae-input');
    const btn = document.getElementById('ibge-cnae-btn');
    const resultDiv = document.getElementById('ibge-cnae-result');
    
    const codigoBruto = input.value.trim();
    const codigoLimpo = codigoBruto.replace(/\D/g, '');

    resultDiv.classList.remove('hidden');

    if (codigoLimpo.length !== 7) {
        resultDiv.innerHTML = `<div class="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl text-sm font-bold text-center">Informe um código válido contendo exatos 7 números.</div>`;
        return;
    }

    btn.disabled = true;
    btn.innerHTML = `<svg class="animate-spin h-5 w-5 mx-auto text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
    resultDiv.innerHTML = `<div class="text-center text-sm text-slate-500 dark:text-slate-400 py-8 animate-pulse">Consultando base de dados do IBGE...</div>`;

    try {
        const url = `https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${encodeURIComponent(codigoLimpo)}`;
        const response = await fetch(url);
        if (!response.ok) throw new Error('not_found');
        
        const data = await response.json();
        const item = Array.isArray(data) ? data[0] : data;
        if (!item || !item.id) throw new Error('not_found');

        renderResultadoIbge(item, resultDiv);
    } catch (err) {
        resultDiv.innerHTML = `<div class="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-xl text-sm text-center">Subclasse <b>${codigoBruto}</b> não encontrada na API do IBGE. Verifique o código digitado.</div>`;
    } finally {
        btn.disabled = false;
        btn.textContent = 'Buscar';
    }
};

// Remove acento e baixa a caixa — usado na busca de Atividades Relacionadas do IBGE
function normalizarTexto(t) {
    return (t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
}

// Separa o texto de "observacoes" da API em 3 blocos: compreende / compreende ainda / não compreende
function parseObservacoesIbge(observacoes) {
    const vazio = { compreende: [], compreendeAinda: [], naoCompreende: [], notasComplementares: [] };
    if (!observacoes || observacoes.length === 0) return vazio;

    const textoCompleto = observacoes.join(' ');
    const regexCabecalhos = /Esta subclasse (compreende ainda|n[aã]o compreende|compreende)|Notas complementares/gi;
    const blocos = [];
    let match;
    let ultimaPos = null;
    let ultimoTipo = null;

    while ((match = regexCabecalhos.exec(textoCompleto)) !== null) {
        if (ultimaPos !== null) {
            blocos.push({ tipo: ultimoTipo, texto: textoCompleto.slice(ultimaPos, match.index) });
        }
        if (match[1]) {
            const cap = match[1].toLowerCase();
            ultimoTipo = cap.includes('ainda') ? 'compreendeAinda' : (cap.includes('ao') || cap.includes('ão')) ? 'naoCompreende' : 'compreende';
        } else {
            ultimoTipo = 'notasComplementares';
        }
        ultimaPos = match.index + match[0].length;
    }
    if (ultimaPos !== null) {
        blocos.push({ tipo: ultimoTipo, texto: textoCompleto.slice(ultimaPos) });
    }

    const resultado = { compreende: [], compreendeAinda: [], naoCompreende: [], notasComplementares: [] };
    blocos.forEach(b => {
        const itens = b.texto.split(/\s-\s/).map(s => s.trim()).filter(Boolean);
        resultado[b.tipo].push(...itens);
    });
    return resultado;
}

// Monta um bloco colorido (título + lista) — usado 3x, uma por categoria
function renderBlocoObservacoes(escapeHtml, titulo, itens, corTitulo) {
    if (!itens || itens.length === 0) return '';
    return `
    <div class="mb-3">
        <p class="text-[10px] font-black uppercase tracking-widest mb-1.5 ${corTitulo}">${titulo}</p>
        <ul class="list-disc pl-5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
            ${itens.map(txt => `<li data-search="${normalizarTexto(txt)}">${linkificarCnaesNoTexto(escapeHtml(txt))}</li>`).join('')}
        </ul>
    </div>`;
}

function linkificarCnaesNoTexto(textoEscapado) {
    return textoEscapado.replace(/\((\d{4}-\d\/\d{2})\)/g, (match, codigo) => {
        return `(<a href="javascript:void(0)" onclick="event.stopPropagation(); reabrirBuscaIbgeDireto('${codigo}')"
            class="text-indigo-600 dark:text-indigo-400 underline decoration-dotted hover:text-indigo-800 dark:hover:text-indigo-300 font-mono font-semibold">${codigo}</a>)`;
    });
}

function renderResultadoIbge(item, container) {
    const escapeHtml = (str) => {
        const div = document.createElement('div');
        div.textContent = str;
        return div.innerHTML;
    };
    const classe = item.classe || {};
    const grupo = classe.grupo || {};
    const divisao = grupo.divisao || {};
    const secao = divisao.secao || {};

    const familiasVinculadas = familyData.filter(f =>
        (f.CNAEs || []).some(c => normalizarCodigoCnae(c.codigo) === normalizarCodigoCnae(item.id))
    );

    const abasHtml = `
        <div class="mt-4 pt-4 border-t dark:border-slate-700">
            <div class="flex items-center gap-1 mb-3 border-b border-slate-200 dark:border-slate-700">
                <button type="button" id="aba-ibge-atividades" onclick="trocarAbaIbge('atividades')"
                    class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b-2 border-indigo-500 text-indigo-600 dark:text-indigo-400 transition-colors">
                    Atividades (${(item.atividades || []).length})
                </button>
                <button type="button" id="aba-ibge-observacoes" onclick="trocarAbaIbge('observacoes')"
                    class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b-2 border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    Observações (${(item.observacoes || []).length})
                </button>
                <button type="button" id="aba-ibge-familias" onclick="trocarAbaIbge('familias')"
                    class="px-3 py-1.5 text-[10px] font-bold uppercase tracking-widest border-b-2 border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors">
                    Famílias (<span id="ibge-familias-count">${familiasVinculadas.length}</span>)
                </button>
            </div>
            
            <!-- BUSCA E LISTA DE ATIVIDADES -->
            <div id="painel-ibge-atividades">
                <input type="text" id="ibge-atividades-busca" oninput="filtrarAtividadesIbge(this)"
                    placeholder="Buscar atividade..."
                    class="w-full mb-2 px-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:outline-none text-slate-700 dark:text-slate-300">
                <p id="ibge-atividades-contador" class="text-[10px] text-slate-400 dark:text-slate-500 mb-1"></p>

                <ul id="ibge-lista-atividades" class="list-disc pl-5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                    ${(item.atividades || []).map(a => `<li data-search="${normalizarTexto(a)}">${linkificarCnaesNoTexto(escapeHtml(a))}</li>`).join('')}
                </ul>
            </div>

            <!-- PAINEL DE OBSERVAÇÕES -->
            <div id="ibge-lista-observacoes" class="hidden">
                ${(() => {
                    const partes = parseObservacoesIbge(item.observacoes);
                    const temEstruturado = partes.compreende.length || partes.compreendeAinda.length || partes.naoCompreende.length || partes.notasComplementares.length;
                    if (temEstruturado) {
                        return renderBlocoObservacoes(escapeHtml, 'Compreende', partes.compreende, 'text-emerald-600 dark:text-emerald-400')
                             + renderBlocoObservacoes(escapeHtml, 'Compreende Ainda', partes.compreendeAinda, 'text-blue-600 dark:text-blue-400')
                             + renderBlocoObservacoes(escapeHtml, 'Não Compreende', partes.naoCompreende, 'text-red-600 dark:text-red-400')
                             + renderBlocoObservacoes(escapeHtml, 'Notas Complementares', partes.notasComplementares, 'text-slate-500 dark:text-slate-400');
                    }
                    return `<ul class="list-disc pl-5 text-xs text-slate-700 dark:text-slate-300 space-y-1">
                        ${(item.observacoes || []).map(o => `<li data-search="${normalizarTexto(o)}">${linkificarCnaesNoTexto(escapeHtml(o))}</li>`).join('')}
                    </ul>`;
                })()}
            </div>

            <!-- PAINEL DE FAMÍLIAS (COM INPUT DE INCLUSÃO RÁPIDA) -->
            <div id="ibge-lista-familias" class="hidden space-y-3">
                <div class="cgcf-manager-only flex gap-2 relative">
                    <div class="flex-1 relative">
                        <input type="text" id="input-incluir-familia-ibge" placeholder="Pesquisar família por código ou descrição..." 
                            oninput="searchFamiliaForIbge(this)" data-cnae-id="${item.id}" data-cnae-desc="${escapeAttrModal(item.descricao)}"
                            class="w-full p-2 text-xs border rounded-lg dark:bg-slate-900 dark:border-slate-700 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">
                        <div id="autocomplete-familia-ibge" class="hidden absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-800 border dark:border-slate-700 rounded-lg shadow-xl z-[170] max-h-40 overflow-y-auto"></div>
                    </div>
                </div>

                <div id="container-familias-vinculadas-ibge" class="space-y-1.5 max-h-48 overflow-y-auto">
                    ${familiasVinculadas.map(f => renderCardFamiliaVinculadaIbge(f, item.id)).join('')}
                </div>

                <!-- ========================================== -->
                <!-- NOVO: VINCULADOR REVERSO -->
                <!-- ========================================== -->
                <div class="mt-4 pt-4 border-t border-slate-200 dark:border-slate-700 cgcf-manager-only">
                    <div class="flex items-center justify-between mb-2">
                        <p class="text-[10px] font-bold text-blue-500 uppercase tracking-widest">Motor Reverso</p>
                        <button type="button" id="btn-sugerir-familias-reverso" onclick="rodarMotorReverso('${item.id}', '${escapeAttrModal(item.descricao)}')"
                            class="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 transition-colors">
                            <svg class="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                            Sugerir Famílias
                        </button>
                    </div>
                    <div id="container-sugestoes-reversas-ibge" class="space-y-1.5 max-h-48 overflow-y-auto"></div>
                </div>
                <!-- ========================================== -->
            </div>

            <p id="ibge-atividades-vazio" class="hidden text-xs text-slate-400 dark:text-slate-500 italic py-2"></p>
        </div>`;

    container.innerHTML = `
    <div class="bg-slate-50 dark:bg-slate-800/50 border dark:border-slate-700 rounded-xl p-5 shadow-sm animate-fade-in">
        <div class="inline-block px-3 py-1 bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-400 font-mono font-bold text-xs rounded-md mb-3 border border-indigo-200 dark:border-indigo-800">
            ${escapeHtml(item.id)}
        </div>
        <h3 class="text-lg font-bold text-slate-800 dark:text-white leading-tight mb-4">${escapeHtml(item.descricao || '')}</h3>
        
        <div class="text-xs text-slate-600 dark:text-slate-400 space-y-2 border-t dark:border-slate-700 pt-4">
            <p><strong class="text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-widest">Classe:</strong> ${escapeHtml(classe.id || '-')} — ${escapeHtml(classe.descricao || '-')}</p>
            <p><strong class="text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-widest">Grupo:</strong> ${escapeHtml(grupo.id || '-')} — ${escapeHtml(grupo.descricao || '-')}</p>
            <p><strong class="text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-widest">Divisão:</strong> ${escapeHtml(divisao.id || '-')} — ${escapeHtml(divisao.descricao || '-')}</p>
            <p><strong class="text-slate-800 dark:text-slate-200 uppercase text-[10px] tracking-widest">Seção:</strong> ${escapeHtml(secao.id || '-')} — ${escapeHtml(secao.descricao || '-')}</p>
        </div>
        ${abasHtml}
    </div>`;
};

// Troca entre as abas "Atividades" e "Observações" dentro do modal do IBGE
window.trocarAbaIbge = (aba) => {
    const mapa = { atividades: 'ibge-lista-atividades', observacoes: 'ibge-lista-observacoes', familias: 'ibge-lista-familias' };
    Object.entries(mapa).forEach(([nome, listaId]) => {
        const lista = document.getElementById(listaId);
        const botao = document.getElementById(`aba-ibge-${nome}`);
        if (!lista || !botao) return;
        const ativo = nome === aba;
        lista.classList.toggle('hidden', !ativo);
        botao.classList.toggle('border-indigo-500', ativo);
        botao.classList.toggle('text-indigo-600', ativo);
        botao.classList.toggle('dark:text-indigo-400', ativo);
        botao.classList.toggle('border-transparent', !ativo);
        botao.classList.toggle('text-slate-400', !ativo);
        botao.classList.toggle('dark:text-slate-500', !ativo);
    });
    const input = document.getElementById('ibge-atividades-busca');
    if (input) filtrarAtividadesIbge(input);
};

// Filtra a lista da aba ativa (Atividades ou Observações) dentro do modal do IBGE
window.filtrarAtividadesIbge = (input) => {
    const termo = normalizarTexto(input.value.trim());
    const listaAtiva = document.querySelector('#ibge-lista-atividades:not(.hidden), #ibge-lista-observacoes:not(.hidden), #ibge-lista-familias:not(.hidden)');
    const contador = document.getElementById('ibge-atividades-contador');
    const vazio = document.getElementById('ibge-atividades-vazio');
    if (!listaAtiva) return;

    let rotulo, rotuloSingular, mensagemVazia;
    if (listaAtiva.id === 'ibge-lista-observacoes') {
        rotulo = 'observações'; rotuloSingular = 'observação';
        mensagemVazia = 'Nenhuma observação cadastrada para esta subclasse.';
    } else if (listaAtiva.id === 'ibge-lista-familias') {
        rotulo = 'famílias'; rotuloSingular = 'família';
        mensagemVazia = 'Nenhuma família usa este CNAE ainda.';
    } else {
        rotulo = 'atividades'; rotuloSingular = 'atividade';
        mensagemVazia = 'Nenhuma atividade cadastrada para esta subclasse.';
    }

    const itens = listaAtiva.querySelectorAll('li');
    let visiveis = 0;
    itens.forEach(li => {
        const bateu = li.getAttribute('data-search').includes(termo);
        li.style.display = bateu ? '' : 'none';
        if (bateu) visiveis++;
    });

    if (contador) {
        contador.textContent = termo ? `${visiveis} de ${itens.length} ${rotulo}` : '';
    }
    if (vazio) {
        if (itens.length === 0) {
            vazio.textContent = mensagemVazia;
            vazio.classList.remove('hidden');
        } else if (visiveis === 0) {
            vazio.textContent = 'Nenhum resultado encontrado para essa busca.';
            vazio.classList.remove('hidden');
        } else {
            vazio.classList.add('hidden');
        }
    }
};

// Função para abrir os detalhes do CNAE diretamente a partir de um código pronto
window.reabrirBuscaIbgeDireto = (codigo) => {
    // Exibe o modal do IBGE (ele vai sobrepor o de análise por causa do z-index superior)
    document.getElementById('modal-busca-cnae').classList.remove('hidden');
    
    // Alimenta o input de texto com o código clicado
    const input = document.getElementById('ibge-cnae-input');
    input.value = codigo;
    
    // Dispara a busca automática na API do IBGE
    buscarCnaeIbge();
};

// ==========================================
// TRAVA DE ROLAGEM DA TELA PRINCIPAL (CORRIGIDO)
// ==========================================
const gerenciarRolagemDoFundo = () => {
    const modaisEstaticos = [
        'family-form-modal', 
        'suggestions-modal', 
        'welcomeModalQualificacao', 
        'summary-modal', 
        'errorModal', 
        'ramo-info-modal',
        'modal-busca-cnae' // O modal do IBGE
    ];

    const modaisDinamicos = [
        'modal-analise-cnpj', 
        'modal-pre-analise', 
        'modal-vinculo-cnaes',
        'modal-pesquisa-manual',
        'modal-itens-familia',
        'modal-confirmar-remocao',
        'modal-detalhe-familia'
    ];

    // Verifica se tem algum modal estático aberto (sem a classe hidden)
    const temEstaticoAberto = modaisEstaticos.some(id => {
        const modal = document.getElementById(id);
        return modal && !modal.classList.contains('hidden');
    });

    // Verifica se tem algum modal dinâmico que existe no DOM atualmente
    const temDinamicoAberto = modaisDinamicos.some(id => {
        return document.getElementById(id) !== null;
    });

    // Se tiver qualquer um aberto, adiciona a trava (evitando fazer isso se já tiver)
    if (temEstaticoAberto || temDinamicoAberto) {
        if (!document.body.classList.contains('overflow-hidden')) {
            document.body.classList.add('overflow-hidden');
        }
    } else {
        document.body.classList.remove('overflow-hidden');
    }
};

// 1. Observador de Modais Estáticos (Vigia APENAS a classe desses 7 elementos, super leve)
const observerEstatico = new MutationObserver(gerenciarRolagemDoFundo);
const idsEstaticos = ['family-form-modal', 'suggestions-modal', 'welcomeModalQualificacao', 'summary-modal', 'errorModal', 'ramo-info-modal', 'modal-busca-cnae'];

idsEstaticos.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
        observerEstatico.observe(el, { attributes: true, attributeFilter: ['class'] });
    }
});

window.abrirModalPesquisaManual = () => {
    document.getElementById('input-cnaes-manuais').value = '';
    document.getElementById('modal-pesquisa-manual').classList.remove('hidden');
    setTimeout(() => document.getElementById('input-cnaes-manuais').focus(), 100);
};

window.processarPesquisaManual = async () => {
    const rawText = document.getElementById('input-cnaes-manuais').value;
    const matches = rawText.replace(/\D/g, '').match(/.{1,7}/g) || [];
    if (matches.length === 0) {
        showError("Atenção", "Nenhum CNAE válido de 7 dígitos encontrado.");
        return;
    }
    const cnaesUnicos = [...new Set(matches)].map(val => 
        val.substring(0, 4) + '-' + val.substring(4, 5) + '/' + val.substring(5, 7)
    );

    document.getElementById('modal-pesquisa-manual').classList.add('hidden');

    // 1 código só -> direto pro detalhe rico do IBGE (mesma experiência da Consulta CNAE de hoje)
    if (cnaesUnicos.length === 1) {
        reabrirBuscaIbgeDireto(cnaesUnicos[0]);
        return;
    }

    // 2+ códigos -> segue o cruzamento com famílias, como já era
    if (typeof showToast === 'function') showToast("Buscando descrições e cruzando dados...", "info");
    const cnaesDetalhados = [];

    // 2. Buscar Descrição de cada CNAE (Local ou API IBGE)
    for (const codigo of cnaesUnicos) {
        // Tenta achar na base local primeiro (já carregada no cnaeDictionary)
        let cnaeLocal = cnaeDictionary.find(c => c.CNAE === codigo);
        
        if (cnaeLocal) {
            cnaesDetalhados.push({ codigo: cnaeLocal.CNAE, descricao: cnaeLocal.DESCRIÇÃO });
        } else {
            // Se não achar, busca no IBGE (reaproveitando sua lógica existente)
            try {
                const cleanCode = codigo.replace(/\D/g, '');
                const response = await fetch(`https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${cleanCode}`);
                if (response.ok) {
                    const data = await response.json();
                    const item = Array.isArray(data) ? data[0] : data;
                    if (item && item.descricao) {
                        cnaesDetalhados.push({ codigo: codigo, descricao: item.descricao });
                        // Alimenta a base local em memória
                        cnaeDictionary.push({ "CNAE": codigo, "DESCRIÇÃO": item.descricao });
                    }
                } else {
                    cnaesDetalhados.push({ codigo: codigo, descricao: "Descrição não encontrada no IBGE" });
                }
            } catch (e) {
                cnaesDetalhados.push({ codigo: codigo, descricao: "Erro ao buscar descrição" });
            }
        }
    }

    // 3. Cruzar os CNAEs com as Famílias existentes na base
    const codigosApenasNumeros = cnaesUnicos.map(c => c.replace(/\D/g, ''));
    
    const familiasHabilitadas = familyData.filter(fam => {
        if (!fam.CNAEs || fam.CNAEs.length === 0) return false;
        
        // Verifica se algum CNAE da família bate com os CNAEs pesquisados
        return fam.CNAEs.some(cnaeFam => {
            const codFamNum = cnaeFam.codigo.replace(/\D/g, '');
            return codigosApenasNumeros.includes(codFamNum);
        });
    });

    // 4. Montar o Objeto de Resultado no formato que seu Modal existente espera
    const resultadoMock = {
        cnpj: "N/A",
        razaoSocial: "Pesquisa de Múltiplos CNAEs",
        cnaes: cnaesUnicos, // Apenas os códigos
        cnaesDetalhados: cnaesDetalhados, // Array de objetos {codigo, descricao}
        familiasHabilitadas: familiasHabilitadas // Famílias que deram match
    };

    // 5. Exibir o Modal Reaproveitado!
    exibirModalResultadoAnalise(resultadoMock);
};

window.processarArquivoCSV = (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
        const conteudoCsv = e.target.result;
        
        // Pega o conteúdo atual do textarea
        const textarea = document.getElementById('input-cnaes-manuais');
        const conteudoAtual = textarea.value.trim();
        
        // Concatena o conteúdo do CSV com o que já estiver no textarea
        // Isso permite que o usuário cole alguns e faça upload de outros juntos
        textarea.value = conteudoAtual ? `${conteudoAtual}\n${conteudoCsv}` : conteudoCsv;
        
        if (typeof showToast === 'function') {
            showToast("CSV carregado! Verifique os CNAEs no campo e clique em Analisar.");
        }
        
        // Limpa o input de arquivo para permitir novo upload do mesmo arquivo, se necessário
        event.target.value = '';
    };

    reader.onerror = () => {
        if (typeof showError === 'function') showError("Erro na leitura", "Não foi possível ler o arquivo CSV.");
    };

    // Lê como texto
    reader.readAsText(file);
};

// Renderiza o item de família já vinculada dentro da aba IBGE
window.renderCardFamiliaVinculadaIbge = (f, cnaeCodigo) => {
    return `
        <div id="familia-vinculo-${f.Família.replace(/\./g, '-')}" class="flex items-center justify-between gap-2 bg-emerald-50 dark:bg-emerald-950/30 text-emerald-800 dark:text-emerald-300 px-3 py-2 rounded-lg border border-emerald-200 dark:border-emerald-800/60 text-xs">
            <div class="min-w-0">
                <span class="font-mono font-bold">${f.Família}</span> — <span class="truncate">${f.Descrição}</span>
            </div>
            <button type="button" onclick="removerFamiliaDoCnaeIbge('${f.Família}', '${cnaeCodigo}')"
                class="cgcf-manager-only shrink-0 text-red-400 hover:text-red-600 p-1 transition-colors" title="Desvincular família deste CNAE">
                ✕
            </button>
        </div>
    `;
};

// Autocomplete ao digitar no campo de inclusão de família na consulta IBGE
window.searchFamiliaForIbge = (input) => {
    const term = input.value.toLowerCase();
    const listContainer = document.getElementById('autocomplete-familia-ibge');
    if (!listContainer) return;

    if (term.length < 2) {
        listContainer.classList.add('hidden');
        return;
    }

    const cnaeId = input.dataset.cnaeId;
    const cnaeDesc = input.dataset.cnaeDesc;

    // Filtra famílias que ainda NÃO possuem este CNAE vinculado
    const matches = familyData.filter(f => {
        const jaTem = (f.CNAEs || []).some(c => normalizarCodigoCnae(c.codigo) === normalizarCodigoCnae(cnaeId));
        if (jaTem) return false;
        return f.Família.toString().toLowerCase().includes(term) || f.Descrição.toLowerCase().includes(term);
    }).slice(0, 8);

    if (matches.length > 0) {
        listContainer.innerHTML = matches.map(f => `
            <div class="p-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 cursor-pointer border-b last:border-0 dark:border-slate-700 text-xs"
                 onclick="vincularFamiliaAoCnaeIbge('${f.Família}', '${cnaeId}', '${cnaeDesc}')">
                <span class="font-bold text-indigo-600 dark:text-indigo-400 font-mono">${f.Família}</span>
                <p class="text-slate-600 dark:text-slate-300 truncate">${f.Descrição}</p>
            </div>
        `).join('');
        listContainer.classList.remove('hidden');
    } else {
        listContainer.classList.add('hidden');
    }
};

// Ação de vincular a família selecionada ao CNAE consultado
window.vincularFamiliaAoCnaeIbge = async (familiaCodigo, cnaeCodigo, cnaeDescricao) => {
    const input = document.getElementById('input-incluir-familia-ibge');
    const listContainer = document.getElementById('autocomplete-familia-ibge');
    if (listContainer) listContainer.classList.add('hidden');
    if (input) input.value = '';

    const index = familyData.findIndex(f => f.Família.toString() === familiaCodigo.toString());
    if (index === -1) return;

    let familia = familyData[index];
    if (!familia.CNAEs) familia.CNAEs = [];

    // --- AQUI ESTÁ A ALTERAÇÃO ---
    // Forçamos a máscara antes de salvar no array da família
    const codigoFormatado = window.formatarCnae(cnaeCodigo);

    // Verifica duplicidade usando a comparação normalizada (sem máscara)
    if (!familia.CNAEs.some(c => normalizarCodigoCnae(c.codigo) === normalizarCodigoCnae(codigoFormatado))) {
        familia.CNAEs.push({ codigo: codigoFormatado, descricao: cnaeDescricao });
    }
    // -----------------------------

    try {
        const payloadSupa = {
            familia: familia["Família"],
            descricao: familia["Descrição"],
            tipo: familia["Tipo"],
            terceirizado: familia["Terceirizado"],
            documentos_exigidos: familia["Documentos Exigidos"],
            documentos_elegiveis: familia["Documentos Elegíveis"],
            cnaes: familia.CNAEs, // Já contém o código formatado aqui
            ramo: familia["Ramo"]
        };

        const { error } = await supabase.from('qualificacao_tecnica').upsert([payloadSupa]);
        if (error) throw error;

        atualizarVisualizacaoFamiliasIbge(cnaeCodigo);
        applyFilters(false);
        enviarStatsParaHome();
        if (typeof showToast === 'function') showToast(`Família ${familiaCodigo} vinculada ao CNAE ${codigoFormatado}!`);

    } catch (err) {
        console.error(err);
        if (typeof showError === 'function') showError("Erro", "Não foi possível salvar o vínculo no banco de dados.");
    }
};

// Ação de desvincular família do CNAE diretamente pela consulta IBGE
window.removerFamiliaDoCnaeIbge = async (familiaCodigo, cnaeCodigo) => {
    const index = familyData.findIndex(f => f.Família.toString() === familiaCodigo.toString());
    if (index === -1) return;

    let familia = familyData[index];
    if (!familia.CNAEs) return;

    familia.CNAEs = familia.CNAEs.filter(c => normalizarCodigoCnae(c.codigo) !== normalizarCodigoCnae(cnaeCodigo));

    try {
        const payloadSupa = {
            familia: familia["Família"],
            descricao: familia["Descrição"],
            tipo: familia["Tipo"],
            terceirizado: familia["Terceirizado"],
            documentos_exigidos: familia["Documentos Exigidos"],
            documentos_elegiveis: familia["Documentos Elegíveis"],
            cnaes: familia.CNAEs,
            ramo: familia["Ramo"]
        };

        const { error } = await supabase.from('qualificacao_tecnica').upsert([payloadSupa]);
        if (error) throw error;

        atualizarVisualizacaoFamiliasIbge(cnaeCodigo);
        applyFilters(false);
        enviarStatsParaHome();
        if (typeof showToast === 'function') showToast(`Família ${familiaCodigo} desvinculada.`);

    } catch (err) {
        console.error(err);
        if (typeof showError === 'function') showError("Erro", "Não foi possível remover o vínculo.");
    }
};

// Atualiza o container de listagem e contadores da aba Famílias no modal IBGE
window.atualizarVisualizacaoFamiliasIbge = (cnaeCodigo) => {
    const container = document.getElementById('container-familias-vinculadas-ibge');
    const badgeCount = document.getElementById('ibge-familias-count');
    if (!container) return;

    const familiasVinculadas = familyData.filter(f =>
        (f.CNAEs || []).some(c => normalizarCodigoCnae(c.codigo) === normalizarCodigoCnae(cnaeCodigo))
    );

    if (badgeCount) badgeCount.textContent = familiasVinculadas.length;

    if (familiasVinculadas.length > 0) {
        container.innerHTML = familiasVinculadas.map(f => renderCardFamiliaVinculadaIbge(f, cnaeCodigo)).join('');
    } else {
        container.innerHTML = `<p class="text-xs text-slate-400 dark:text-slate-500 italic py-2">Nenhuma família vinculada a este CNAE ainda.</p>`;
    }
};

// Ajuste na função trocarAbaIbge para incluir a aba 'familias'
window.trocarAbaIbge = (aba) => {
    const mapa = { 
        atividades: 'ibge-lista-atividades', 
        observacoes: 'ibge-lista-observacoes', 
        familias: 'ibge-lista-familias' 
    };
    
    // Oculta input de busca de atividades caso esteja na aba de famílias
    const inputAtividadesBusca = document.getElementById('ibge-atividades-busca');
    const contadorAtividades = document.getElementById('ibge-atividades-contador');
    if (inputAtividadesBusca) inputAtividadesBusca.style.display = aba === 'familias' ? 'none' : '';
    if (contadorAtividades) contadorAtividades.style.display = aba === 'familias' ? 'none' : '';

    Object.entries(mapa).forEach(([nome, listaId]) => {
        const lista = document.getElementById(listaId);
        const botao = document.getElementById(`aba-ibge-${nome}`);
        if (!lista || !botao) return;
        const ativo = nome === aba;
        lista.classList.toggle('hidden', !ativo);
        botao.classList.toggle('border-indigo-500', ativo);
        botao.classList.toggle('text-indigo-600', ativo);
        botao.classList.toggle('dark:text-indigo-400', ativo);
        botao.classList.toggle('border-transparent', !ativo);
        botao.classList.toggle('text-slate-400', !ativo);
        botao.classList.toggle('dark:text-slate-500', !ativo);
    });
    const input = document.getElementById('ibge-atividades-busca');
    if (input && aba !== 'familias') filtrarAtividadesIbge(input);
};

window.formatarCnae = (valor) => {
    const num = valor.toString().replace(/\D/g, '');
    if (num.length !== 7) return valor; // Retorna original se não tiver 7 dígitos
    return num.substring(0, 4) + '-' + num.substring(4, 5) + '/' + num.substring(5, 7);
};

window.rodarMotorReverso = (cnaeCodigo, cnaeDescricao) => {
    const btn = document.getElementById('btn-sugerir-familias-reverso');
    const container = document.getElementById('container-sugestoes-reversas-ibge');
    if (!container) return;

    if (btn) btn.disabled = true;
    container.innerHTML = `<p class="text-[11px] text-slate-500 dark:text-slate-400 text-center py-2 animate-pulse">Varrendo o catálogo de famílias...</p>`;

    setTimeout(() => {
        // Chama a inteligência lá do motor_cnae.js passando as variáveis que estão na memória
        const sugestoes = calcularFamiliasParaCnae(cnaeCodigo, cnaeDescricao, familyData, relacionadosDict);

        // Desenha a tela
        if (sugestoes.length === 0) {
            container.innerHTML = `<p class="text-[11px] italic text-slate-400 dark:text-slate-500 text-center py-2">Nenhuma família com alta compatibilidade encontrada no catálogo para este CNAE.</p>`;
        } else {
            container.innerHTML = sugestoes.map(s => `
                <div class="flex items-center justify-between gap-2 text-[11px] bg-emerald-50 dark:bg-emerald-900/10 p-2 rounded border border-emerald-200 dark:border-emerald-800/50 animate-fade-in">
                    <div class="flex-1 min-w-0">
                        <span class="text-indigo-600 dark:text-indigo-400 font-bold font-mono">${s.familia.Família}</span>
                        <span class="text-slate-400 dark:text-slate-500 mx-1">(score ${s.score})</span>
                        <span class="text-slate-700 dark:text-slate-300">${s.familia.Descrição}</span>
                    </div>
                    <button type="button" onclick="vincularFamiliaAoCnaeIbge('${s.familia.Família}', '${cnaeCodigo}', '${cnaeDescricao.replace(/'/g, "\\'")}'); this.parentElement.remove();"
                        class="shrink-0 px-2 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold uppercase rounded transition-colors shadow-sm">
                        Vincular
                    </button>
                </div>
            `).join('');
        }

        if (btn) btn.disabled = false;
    }, 50);
};

// Função padrão para jogar no JS dos apps filhos
function enviarLogAoPai(acao, detalhes = {}) {
    // Verifica se está rodando dentro do iframe do Cockpit
    if (window.parent !== window) {
        window.parent.postMessage({
            type: "REGISTRAR_LOG",
            payload: {
                acao: acao,
                detalhes: detalhes,
                appOrigem: "QUALIFICACAO_TECNICA"
            }
        }, "*");
    } else {
        console.warn("Log não enviado: rodando fora do iframe.", acao);
    }
}

// 2. Observador de Modais Dinâmicos (Vigia APENAS elementos sendo injetados/removidos direto no body)
const observerDinamico = new MutationObserver(gerenciarRolagemDoFundo);
observerDinamico.observe(document.body, { childList: true });

// Roda uma vez no início para garantir que já trave caso o modal de Boas-Vindas esteja aberto
gerenciarRolagemDoFundo();



// Inicia o App
initApp();