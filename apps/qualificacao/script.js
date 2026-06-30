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

const grid = document.getElementById('family-grid');
const searchInput = document.getElementById('search-family');
const typeFilter = document.getElementById('filter-type');
const terceirizadoFilter = document.getElementById('filter-terceirizado');

// ==========================================
// CONTROLO DE ACESSO POR PERFIL (USER / ADMIN)
// ==========================================
function applyFamilyRoleRestrictions() {
    const role = sessionStorage.getItem("cockpit_user_role");
    
    // Se não for admin, injeta o CSS para ocultar a classe admin-only
    if (role !== "admin") {
        const style = document.createElement("style");
        style.id = "role-restrictions-style";
        style.innerHTML = `
            .admin-only { 
                display: none !important; 
            }
        `;
        document.head.appendChild(style);
    }
}
applyFamilyRoleRestrictions(); // Executa imediatamente

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
        // Carrega ambos os arquivos em paralelo para ganhar velocidade
        const [respFamilies, respCnaes, respDocs, respRamos, respDescRamos] = await Promise.all([
            fetch('qualificacao_tecnica.json'),
            fetch('cnae.json'),
            fetch('../gerador/docs-qual-tec.json').catch(() => null),
            fetch('./archives/ramos_classificados.json').catch(() => null),
            fetch('./archives/descricao_ramos.json').catch(() => null)
        ]);

        if (respRamos && respRamos.ok) {
            window.ramosDictionary = await respRamos.json();
        }

        if (respDescRamos && respDescRamos.ok) {
            descricoesRamos = await respDescRamos.json();
        }

        // Validação rigorosa: se qualquer um falhar, interrompe o fluxo
        if (!respFamilies.ok || !respCnaes.ok) {
            throw new Error("Falha ao carregar os arquivos de dados.");
        }

        familyData = await respFamilies.json();
        cnaeDictionary = await respCnaes.json();
        const respRelacionados = await fetch('relacionados_dictionary.json');
        relacionadosDict = await respRelacionados.json();

        const cnaesConhecidos = new Set(cnaeDictionary.map(c => c.CNAE));
        familyData.forEach(familia => {
            if (familia.CNAEs) {
                familia.CNAEs.forEach(c => {
                    if (!cnaesConhecidos.has(c.codigo)) {
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
        
        // Inicializa a interface com todos os dados prontos
        applyFilters();
        updateDatalist(); // Importante se houver busca dinâmica
        checkWelcomeModal();
        enviarStatsParaHome();

    } catch (err) {
        console.error("Erro crítico na inicialização:", err);
        // Feedback visual para o usuário não achar que o app travou
        grid.innerHTML = `<p class="col-span-full text-center py-20 text-gray-600">
            Erro ao carregar dados locais. Verifique a conexão ou os arquivos JSON.
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

    filteredData = familyData.filter(item => {
        const exigidos = (item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"] || []);
        const elegiveis = (item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"] || []);
        const allDocs = [...exigidos, ...elegiveis].join(" ").toLowerCase();
        
        const textMatch = item.Família.toString().toLowerCase().includes(term) || 
                          item.Descrição.toLowerCase().includes(term) ||
                          allDocs.includes(term);

        const typeMatch = type === "" || item.Tipo === type;
        const terceirizadoMatch = !onlyTerceirizado || item.Terceirizado === "Sim";

        return textMatch && typeMatch && terceirizadoMatch;
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
        
        card.className = `relative bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border transition-all cursor-pointer group flex flex-col h-full animate-fade-in 
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
                    
                    <button onclick="event.stopPropagation(); openFamilyForm(${indexInMain})" class="text-slate-400 hover:text-blue-500 transition-colors p-1 admin-only" title="Editar Família">
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

            <div class="cnae-section hidden mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 animate-fade-in">
                <p class="text-[9px] font-bold text-blue-500 uppercase mb-2">CNAEs Relacionados</p>
                <div class="space-y-1.5">
                    ${(item.CNAEs || []).length > 0 ? item.CNAEs.map(c => `
                    <div onclick="copyToClipboard(event, '${c.codigo} | ${c.descricao}')" 
                        class="text-[10px] bg-slate-50 dark:bg-slate-850 p-2 rounded border dark:border-slate-800 dark:text-slate-300 font-medium cursor-copy hover:border-blue-400 transition-all active:scale-95"
                        title="Copiar CNAE">
                        <span class="text-blue-600 dark:text-blue-400 font-bold">${c.codigo}</span> 
                        <span class="mx-1 text-slate-300">|</span> 
                        ${c.descricao}
                    </div>
                    `).join('') : '<p class="text-[10px] italic text-gray-600 dark:text-gray-400 text-center py-2">Nenhum CNAE cadastrado.</p>'}
                </div>
            </div>
            
            <div class="mt-6 flex justify-center border-t dark:border-slate-800 pt-3">
                <span class="text-[8px] font-black uppercase tracking-widest transition-colors ${ (item.CNAEs || []).length > 0 ? 'text-blue-500 dark:text-blue-400' : 'text-gray-600 dark:text-gray-100' } group-hover:text-blue-600">
                    Detalhes / CNAE
                </span>
            </div>
        `;

        card.onclick = () => card.querySelector('.cnae-section').classList.toggle('hidden');
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
function addCnaeRow(codigo = '', descricao = '') {
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

document.getElementById('family-form').onsubmit = (e) => {
    e.preventDefault();
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

    // Exige a inclusão de ao menos um CNAE
    if (cnaes.length === 0) {
        showError("CNAE Obrigatório", "É necessário incluir ao menos um CNAE válido para salvar esta família.");
        if (document.querySelectorAll('#cnae-rows-container > div').length === 0) {
            addCnaeRow();
        }
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
        if (ramoEncontrado) {
            ramoData = { codigo: ramoEncontrado.codigo, nome: ramoEncontrado.nome };
        }
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

    // --- SALVAMENTO DOS DADOS ---
    if (index !== "") {
        familyData[index] = payload;
        lastEditedIndex = parseInt(index);
    } else {
        familyData.unshift(payload);
        lastEditedIndex = 0;
    }

    setTimeout(() => { lastEditedIndex = null; }, 2500);

    // --- 1. REPLICAÇÃO EM MASSA ---
    if (document.getElementById('f-replicate').checked) {
        const destinos = document.getElementById('f-destinos').value
            .split(/[,; ]+/)
            .filter(s => s.trim() !== "");

        destinos.forEach(cod => {
            const familiaAlvo = familyData.find(f => f.Família.toString() === cod);
            if (familiaAlvo && familiaAlvo.Família !== codigoFamilia) {
                if (!familiaAlvo.CNAEs) familiaAlvo.CNAEs = [];
                cnaes.forEach(novoCnae => {
                    if (!familiaAlvo.CNAEs.some(ex => ex.codigo === novoCnae.codigo)) {
                        familiaAlvo.CNAEs.push(novoCnae);
                    }
                });
            }
        });
    }

    // --- 2. ATUALIZA DICIONÁRIO DE CNAES ---
    cnaes.forEach(cnaeSalvo => {
        const existe = cnaeDictionary.find(c => c.CNAE === cnaeSalvo.codigo);
        if (!existe) {
            cnaeDictionary.push({
                "CNAE": cnaeSalvo.codigo,
                "DESCRIÇÃO": cnaeSalvo.descricao
            });
        }
    });

    // --- 3. ATUALIZAÇÃO DO GRID E UI ---
    // Se for edição (index não vazio), passa false para manter a página atual.
    // Se for novo (index vazio), passa true para voltar à página 1.
    applyFilters(index === ""); 

    updateDatalist();
    closeFamilyForm();
    enviarStatsParaHome();
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


window.normalizeCnaeInput = (input) => {
    // 1. Limpeza rigorosa: remove TUDO que não for dígito (0-9)
    // Isso remove espaços, pontos, traços e barras ANTES de validar
    let value = input.value.replace(/\D/g, ''); 

    const descInput = input.parentElement.querySelector('.cnae-desc');

    // 2. Agora validamos apenas a STRING LIMPA (somente números)
    if (value.length === 7) {
        // 3. Aplica a máscara padrão 0000-0/00 em cima dos números limpos
        const formattedCnae = value.substring(0, 4) + '-' + value.substring(4, 5) + '/' + value.substring(5, 7);
        
        // Atualiza o valor do input com a máscara correta
        input.value = formattedCnae;

        // 4. Busca no dicionário
        const cnaeEncontrado = cnaeDictionary.find(c => c.CNAE === formattedCnae);

        if (cnaeEncontrado) {
            descInput.value = cnaeEncontrado.DESCRIÇÃO;
            input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
            input.classList.add('border-emerald-500'); 
            
            if (typeof handleCnaeBlur === 'function') {
                handleCnaeBlur(descInput);
            }

            setTimeout(() => input.classList.remove('border-emerald-500'), 1500);
        } else {
            aplicarErroCnae(input, descInput, "CNAE não encontrado na base.");
        }
    } else if (value.length > 7) {
        // Caso o usuário cole algo maior, tentamos pegar apenas os primeiros 7 números
        let extraClean = value.substring(0, 7);
        input.value = extraClean;
        // Chama a função novamente com o valor corrigido
        window.normalizeCnaeInput(input);
        
    } else if (value.length > 0) {
        aplicarErroCnae(input, descInput, "Formato inválido (mínimo 7 dígitos).");
    } else {
        input.classList.remove('border-red-500', 'ring-2', 'ring-red-200');
        if (descInput) descInput.placeholder = "Descrição do CNAE";
    }
};

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

// --- FUNÇÕES AUXILIARES DE INTERFACE ---

function exibirModalResultadoAnalise(resultado) {
    window.resultadoAnaliseAtual = resultado;
    const modalAntigo = document.getElementById('modal-analise-cnpj');
    if (modalAntigo) modalAntigo.remove();

    const cnaesPdfNumericos = resultado.cnaes.map(cnae => cnae.replace(/\D/g, ''));

    // 1. Constrói o HTML das Famílias
    let familiasHtml = '';
    if (resultado.familiasHabilitadas.length > 0) {
        familiasHtml = resultado.familiasHabilitadas.map(fam => {
            const cnaesCompativeis = (fam.CNAEs || []).filter(c => {
                if (!c || !c.codigo) return false;
                return cnaesPdfNumericos.includes(c.codigo.replace(/\D/g, ''));
            });

            const todosCnaesString = (fam.CNAEs || []).map(c => c.codigo).join(' ');
            const termoBusca = `${fam['Família']} ${fam['Descrição']} ${todosCnaesString}`.toLowerCase();
            
            // Criamos um ID único para cada família (ex: "list-01-00") para o JavaScript saber quem abrir
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
                </div>
            </div>`;
        }).join('');
    } else {
        familiasHtml = `<div class="p-6 text-center text-slate-500 dark:text-slate-400 italic bg-slate-50 dark:bg-slate-800/50 rounded-lg border border-slate-200 dark:border-slate-700">Nenhuma família compatível com os CNAEs deste fornecedor.</div>`;
    }


    // 2. Constrói o HTML da Lista de TODOS os CNAEs com Checkboxes e o Botão Flutuante
    let cnaesHtml = resultado.cnaesDetalhados.map(cnae => `
        <label class="cnae-card p-3 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 flex flex-row items-center gap-3 mb-2 shadow-sm transition-all hover:border-blue-400 cursor-pointer" data-search="${cnae.codigo} ${cnae.descricao.toLowerCase()}">
            <input type="checkbox" class="cnae-checkbox-vincular w-4 h-4 text-blue-600 bg-slate-100 border-slate-300 rounded focus:ring-blue-500 dark:focus:ring-blue-600 dark:ring-offset-slate-800 dark:bg-slate-700 dark:border-slate-600" value="${cnae.codigo}" data-desc="${cnae.descricao}">
            <div class="flex flex-col">
                <span class="text-blue-600 dark:text-blue-400 font-mono font-bold text-sm mb-1">${cnae.codigo}</span>
                <span class="text-slate-700 dark:text-slate-300 text-sm leading-tight">${cnae.descricao}</span>
            </div>
        </label>
    `).join('');

    // Adiciona o Botão Flutuante (Sticky) logo abaixo da lista
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

    // 3. Monta o Modal com o Sistema de Abas Integrado
    const modal = document.createElement('div');
    modal.id = 'modal-analise-cnpj';
    modal.className = 'fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-fade-in';
    
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden animate-scale-up">
            
            <div class="flex justify-between items-center p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/80 shrink-0">
                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                    <svg class="w-5 h-5 text-amber-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                    Análise de Comprovante CNPJ
                </h3>
                <button onclick="document.getElementById('modal-analise-cnpj').remove()" class="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors">
                    <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
            </div>

            <div class="p-4 overflow-y-auto flex-1 flex flex-col gap-4 custom-scrollbar">
                
                <div class="bg-slate-100 dark:bg-slate-900/50 p-4 rounded-lg border border-slate-200 dark:border-slate-700 shrink-0">
                    <div class="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Empresa Identificada</div>
                    <div class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-1">${resultado.razaoSocial}</div>
                    <div class="text-sm font-mono text-slate-600 dark:text-slate-300 flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2M9 14a3.001 3.001 0 00-2.83 2M15 11h3m-3 4h2"></path></svg>
                        CNPJ: ${resultado.cnpj}
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
                        Famílias Possíveis (${resultado.familiasHabilitadas.length})
                    </button>
                    <button id="tab-btn-cnaes" onclick="switchTabAnalise('cnaes')" class="px-4 py-2 border-b-2 border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-300 font-medium text-sm transition-all">
                        Todos os CNAEs (${resultado.cnaes.length})
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

            <div class="p-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3 bg-slate-50 dark:bg-slate-800/80 shrink-0">

                <button onclick="document.getElementById('upload-cnpj').click()" class="px-4 py-2 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded-lg transition-colors font-medium flex items-center gap-2">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        Próxima
                </button>

                <button onclick="gerarRelatorioPDF()" class="px-3 py-2 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/30 rounded-lg transition-colors font-medium flex items-center gap-1.5 text-sm border border-emerald-200 dark:border-emerald-800/50">
                        <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
                        Relatório
                </button>

                <button onclick="document.getElementById('modal-analise-cnpj').remove()" class="px-4 py-2 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-lg transition-colors font-medium">
                    Fechar
                </button>
                
                ${resultado.familiasHabilitadas.length > 0 ? `
                <button onclick="aplicarFiltroDeAnalise('${resultado.familiasHabilitadas.map(f => f['Família']).join(',')}')" 
                        class="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-lg transition-all shadow-md hover:shadow-lg font-medium flex items-center gap-2">
                    <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z"></path></svg>
                    Filtrar Grid Principal
                </button>
                ` : ''}
            </div>
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

// --- MODAL DE PRÉ-ANÁLISE (VERIFICAÇÃO DO PDF) ---
window.abrirModalPreAnalise = () => {
    // Remove o modal caso já exista algum travado
    const modalAntigo = document.getElementById('modal-pre-analise');
    if (modalAntigo) modalAntigo.remove();

    const modal = document.createElement('div');
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
                <h4 class="text-lg font-bold text-slate-800 dark:text-slate-100 mb-2">Você já possui o comprovante em PDF?</h4>
                
                <p class="text-sm text-slate-600 dark:text-slate-400 mb-4">
                    Para realizar a análise automática, é necessário anexar o <strong>Comprovante de Inscrição e de Situação Cadastral</strong> original emitido pelo site da Receita Federal.
                </p>
                
                <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/50 rounded-lg p-3 mb-6 text-xs text-amber-700 dark:text-amber-400 flex items-start gap-2 text-left shadow-sm">
                    <svg class="w-5 h-5 shrink-0 mt-0.5 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
                            <path d="M4,23H20a1,1,0,0,0,1-1V6a1,1,0,0,0-.293-.707l-4-4A1,1,0,0,0,16,1H4A1,1,0,0,0,3,2V22A1,1,0,0,0,4,23ZM5,3H15.586L19,6.414V21H5Zm8,4v6a1,1,0,0,1-2,0V7a1,1,0,0,1,2,0Zm0,9v1a1,1,0,0,1-2,0V16a1,1,0,0,1,2,0Z"/>
                    </svg>                    
                <span><strong>Nota Importante:</strong> A extração de dados pode não funcionar corretamente em documentos escaneados ou salvos como imagem. Utilize sempre o PDF digital gerado diretamente pelo sistema, usando sempre a opção <b>"Salvar como PDF"</b>.</span>
                </div>
                
                <div class="flex flex-col gap-3">
                    <button onclick="document.getElementById('upload-cnpj').click(); document.getElementById('modal-pre-analise').remove();" class="w-full py-3 bg-amber-600 hover:bg-amber-700 text-white rounded-lg font-bold transition-all shadow-md flex justify-center items-center gap-2">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12"></path></svg>
                        Sim, anexar arquivo PDF
                    </button>
                    
                    <a href="https://solucoes.receita.fazenda.gov.br/Servicos/cnpjreva/" target="_blank" class="w-full py-3 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-lg font-semibold transition-all flex justify-center items-center gap-2 border border-slate-200 dark:border-slate-600">
                        <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"></path></svg>
                        Não, emitir na Receita Federal
                    </a>
                </div>
                ${getHistoricoHtml()}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
};

// --- GERAÇÃO DE RELATÓRIO PDF ---
window.gerarRelatorioPDF = () => {
    const resultado = window.resultadoAnaliseAtual;
    if (!resultado) return;

    if (typeof showToast === 'function') window.showToast("Gerando relatório oficial, aguarde...", "info");

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({ unit: 'mm', format: 'a4', orientation: 'portrait' });

    const marginL = 20;
    const marginR = 20;
    const pageW = 210;
    const contentW = pageW - marginL - marginR;
    let y = 20;

    // --- Helpers ---
    const checkPage = (neededSpace = 10) => {
        if (y + neededSpace > 270) {
            doc.addPage();
            y = 20;
        }
    };

    const drawLine = (x1, y1, x2, y2, r = 0, g = 0, b = 0) => {
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
    // CABEÇALHO
    // ==========================================
    doc.setFillColor(44, 62, 80);
    doc.rect(marginL, y, contentW, 18, 'F');

    writeText('RELATÓRIO DE QUALIFICAÇÃO TÉCNICA', pageW / 2, y + 7, {
        size: 13, style: 'bold', color: [255, 255, 255], align: 'center'
    });
    writeText('Análise Automatizada de Comprovante de Situação Cadastral', pageW / 2, y + 13, {
        size: 8, style: 'normal', color: [180, 200, 220], align: 'center'
    });
    y += 24;

    const dataAtual = new Date().toLocaleString('pt-BR');
    writeText(`Emissão: ${dataAtual} via Cockpit Gestão`, pageW / 2, y, {
        size: 8, color: [120, 120, 120], align: 'center'
    });
    y += 10;

    // ==========================================
    // SEÇÃO 1 — IDENTIFICAÇÃO DO FORNECEDOR
    // ==========================================
    doc.setFillColor(230, 236, 245);
    doc.rect(marginL, y, contentW, 7, 'F');
    writeText('1. IDENTIFICAÇÃO DO FORNECEDOR', marginL + 3, y + 5, {
        size: 9, style: 'bold', color: [44, 62, 80]
    });
    y += 11;

    const campos = [
        ['Razão Social:', resultado.razaoSocial],
        ['CNPJ:', resultado.cnpj],
        ['Total de CNAEs:', `${resultado.cnaes.length} extraídos do documento`],
    ];

    campos.forEach(([label, valor]) => {
        checkPage(7);
        writeText(label, marginL, y, { size: 9, style: 'bold', color: [60, 60, 60] });
        writeText(valor, marginL + 35, y, { size: 9, color: [0, 0, 0] });
        y += 7;
    });

    y += 4;
    drawLine(marginL, y, marginL + contentW, y, 200, 200, 200);
    y += 8;

    // ==========================================
    // SEÇÃO 2 — CNAEs EXTRAÍDOS
    // ==========================================
    doc.setFillColor(230, 236, 245);
    doc.rect(marginL, y, contentW, 7, 'F');
    writeText('2. CNAEs EXTRAÍDOS DO COMPROVANTE', marginL + 3, y + 5, {
        size: 9, style: 'bold', color: [44, 62, 80]
    });
    y += 11;

    if (resultado.cnaesDetalhados && resultado.cnaesDetalhados.length > 0) {
        resultado.cnaesDetalhados.forEach((item, idx) => {
            checkPage(8);
            const bgColor = idx % 2 === 0 ? [248, 250, 252] : [255, 255, 255];
            doc.setFillColor(...bgColor);
            doc.rect(marginL, y - 4, contentW, 7, 'F');
            writeText(item.codigo, marginL + 2, y, { size: 8, style: 'bold', color: [30, 80, 160] });
            const descLines = writeText(item.descricao || '', marginL + 28, y, {
                size: 8, color: [50, 50, 50], maxWidth: contentW - 30
            });
            y += Math.max(descLines * 5, 7);
        });
    } else {
        writeText('Nenhum CNAE extraído.', marginL, y, { size: 9, color: [150, 150, 150], style: 'italic' });
        y += 7;
    }

    y += 4;
    drawLine(marginL, y, marginL + contentW, y, 200, 200, 200);
    y += 8;

    // ==========================================
    // SEÇÃO 3 — FAMÍLIAS HABILITADAS
    // ==========================================
    doc.setFillColor(230, 236, 245);
    doc.rect(marginL, y, contentW, 7, 'F');
    writeText('3. FAMÍLIAS POSSÍVEIS', marginL + 3, y + 5, {
        size: 9, style: 'bold', color: [44, 62, 80]
    });
    y += 11;

    const cnaesPdfNumericos = resultado.cnaes.map(c => c.replace(/\D/g, ''));

    if (resultado.familiasHabilitadas && resultado.familiasHabilitadas.length > 0) {
        resultado.familiasHabilitadas.forEach((fam) => {
            checkPage(20);

            // Cabeçalho da família
            doc.setFillColor(44, 62, 80);
            doc.rect(marginL, y - 4, contentW, 8, 'F');
            writeText(
                `Família ${fam['Família']} — ${fam['Descrição']}`,
                marginL + 3, y + 1,
                { size: 9, style: 'bold', color: [255, 255, 255], maxWidth: contentW - 6 }
            );
            y += 9;

            const cnaesCompativeis = (fam.CNAEs || []).filter(c =>
                cnaesPdfNumericos.includes(c.codigo.replace(/\D/g, ''))
            );

            if (cnaesCompativeis.length > 0) {
                writeText(`CNAEs compatíveis (${cnaesCompativeis.length}):`, marginL + 3, y, {
                    size: 8, style: 'bold', color: [80, 80, 80]
                });
                y += 6;

                cnaesCompativeis.forEach((c, idx) => {
                    checkPage(8);
                    const bgColor = idx % 2 === 0 ? [240, 247, 255] : [255, 255, 255];
                    doc.setFillColor(...bgColor);
                    doc.rect(marginL + 3, y - 3.5, contentW - 6, 6.5, 'F');
                    writeText(`• ${c.codigo}`, marginL + 5, y, { size: 8, style: 'bold', color: [30, 80, 160] });
                    const descLines = writeText(c.descricao || '', marginL + 25, y, {
                        size: 8, color: [50, 50, 50], maxWidth: contentW - 28
                    });
                    y += Math.max(descLines * 5, 6);
                });
            } else {
                writeText('Nenhum CNAE compatível identificado nesta família.', marginL + 3, y, {
                    size: 8, color: [150, 150, 150], style: 'italic'
                });
                y += 6;
            }
            y += 5;
        });
    } else {
        doc.setFillColor(255, 243, 205);
        doc.rect(marginL, y - 3, contentW, 12, 'F');
        writeText('⚠ Nenhuma família compatível identificada com os CNAEs extraídos.', marginL + 3, y + 4, {
            size: 9, style: 'italic', color: [150, 100, 0]
        });
        y += 14;
    }

    // ==========================================
    // RODAPÉ — ASSINATURA
    // ==========================================
    checkPage(30);
    y += 10;
    drawLine(marginL, y, marginL + contentW, y, 180, 180, 180);
    y += 8;

    const assinW = 80;
    const assinX = (pageW - assinW) / 2;
    drawLine(assinX, y, assinX + assinW, y, 0, 0, 0);
    y += 5;
    writeText('Analista Responsável', pageW / 2, y, {
        size: 9, style: 'bold', color: [0, 0, 0], align: 'center'
    });
    y += 5;
    writeText('Coordenação de Gestão do Cadastro de Fornecedores', pageW / 2, y, {
        size: 8, color: [100, 100, 100], align: 'center'
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

    // Salva
    doc.save(`Qualificacao_${resultado.cnpj.replace(/\D/g, '')}.pdf`);
    if (typeof showToast === 'function') window.showToast("Download do relatório concluído com sucesso!", "success");
};

window.vincularCnaesEmLote = () => {
    // 1. Captura os checkboxes selecionados
    const checkboxes = document.querySelectorAll('.cnae-checkbox-vincular:checked');
    if (checkboxes.length === 0) {
        if (typeof showError === 'function') showError("Atenção", "Selecione ao menos um CNAE na lista para vincular.");
        return;
    }

    // 2. Captura e limpa os códigos de famílias informados
    const inputFamilias = document.getElementById('vincular-familias-input').value;
    const familiasAlvo = inputFamilias.split(/[,;]+/).map(f => f.trim()).filter(f => f);

    if (familiasAlvo.length === 0) {
        if (typeof showError === 'function') showError("Atenção", "Informe ao menos um código de família.");
        return;
    }

    // 3. Monta o array de CNAEs selecionados no formato esperado pelo banco
    const cnaesSelecionados = Array.from(checkboxes).map(cb => ({
        codigo: cb.value,
        descricao: cb.getAttribute('data-desc')
    }));

    let familiasAtualizadas = 0;

    // 4. Varre as famílias alvo e insere os CNAEs (evitando duplicidade)
    familiasAlvo.forEach(cod => {
        const familia = familyData.find(f => f.Família.toString() === cod);
        
        if (familia) {
            // Garante que o array CNAEs existe na família
            if (!familia.CNAEs) familia.CNAEs = [];
            
            let adicionadoNestaFamilia = false;

            cnaesSelecionados.forEach(novoCnae => {
                // Checa se o CNAE já não existe nesta família
                if (!familia.CNAEs.some(c => c.codigo === novoCnae.codigo)) {
                    familia.CNAEs.push(novoCnae);
                    adicionadoNestaFamilia = true;

                    // Atualiza também o dicionário global de CNAEs por segurança
                    if (!cnaeDictionary.some(c => c.CNAE === novoCnae.codigo)) {
                        cnaeDictionary.push({ "CNAE": novoCnae.codigo, "DESCRIÇÃO": novoCnae.descricao });
                    }
                }
            });

            if (adicionadoNestaFamilia) familiasAtualizadas++;
        }
    });

    // 5. Feedback Visual e Atualização de Tela
    if (familiasAtualizadas > 0) {
        if (typeof showToast === 'function') {
            showToast(`${cnaesSelecionados.length} CNAE(s) vinculado(s) a ${familiasAtualizadas} família(s) com sucesso!`);
        }
        
        // Limpa os inputs e checkboxes
        document.getElementById('vincular-familias-input').value = '';
        checkboxes.forEach(cb => cb.checked = false);

        // Atualiza a grid principal no fundo
        if (typeof applyFilters === 'function') applyFilters(false);
        if (typeof enviarStatsParaHome === 'function') enviarStatsParaHome();

    } else {
        if (typeof showError === 'function') {
            showError("Erro no Vínculo", "Nenhuma família encontrada com os códigos informados. Verifique se digitou a numeração exata (Ex: 01.01).");
        }
    }
};

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

window.vincularCnaesEmLote = () => {
    const checkboxes = document.querySelectorAll('.cnae-checkbox-vincular:checked');
    const inputFamilias = document.getElementById('vincular-familias-input').value;
    const familiasAlvo = inputFamilias.split(/[,;]+/).map(f => f.trim()).filter(f => f);

    if (familiasAlvo.length === 0) {
        if (typeof showError === 'function') showError("Atenção", "Informe ao menos um código de família.");
        return;
    }

    const cnaesSelecionados = Array.from(checkboxes).map(cb => ({
        codigo: cb.value,
        descricao: cb.getAttribute('data-desc')
    }));

    let familiasAtualizadas = 0;

    familiasAlvo.forEach(cod => {
        const familia = familyData.find(f => f.Família.toString() === cod);
        
        if (familia) {
            if (!familia.CNAEs) familia.CNAEs = [];
            let adicionadoNestaFamilia = false;

            cnaesSelecionados.forEach(novoCnae => {
                if (!familia.CNAEs.some(c => c.codigo === novoCnae.codigo)) {
                    familia.CNAEs.push(novoCnae);
                    adicionadoNestaFamilia = true;

                    if (!cnaeDictionary.some(c => c.CNAE === novoCnae.codigo)) {
                        cnaeDictionary.push({ "CNAE": novoCnae.codigo, "DESCRIÇÃO": novoCnae.descricao });
                    }
                }
            });

            if (adicionadoNestaFamilia) familiasAtualizadas++;
        }
    });

    if (familiasAtualizadas > 0) {
        if (typeof showToast === 'function') {
            showToast(`${cnaesSelecionados.length} CNAE(s) vinculado(s) a ${familiasAtualizadas} família(s)!`);
        }
        
        // Limpa os checkboxes desmarcando tudo
        document.querySelectorAll('.cnae-checkbox-vincular').forEach(cb => cb.checked = false);

        // Atualiza a grid principal no fundo e as estatísticas
        if (typeof applyFilters === 'function') applyFilters(false);
        if (typeof enviarStatsParaHome === 'function') enviarStatsParaHome();

        // Destrói o modal após o sucesso
        fecharModalVinculoCnaes();
    } else {
        if (typeof showError === 'function') {
            showError("Erro no Vínculo", "Nenhuma família encontrada. Verifique se digitou a numeração exata (Ex: 01.01).");
        }
    }
};

// Função para salvar no localStorage
function salvarHistoricoAnalise(resultado) {
    let historico = JSON.parse(localStorage.getItem('cockpit_cnpj_history') || '[]');
    historico = historico.filter(h => h.cnpj !== resultado.cnpj);
    historico.unshift({
        cnpj: resultado.cnpj,
        razaoSocial: resultado.razaoSocial,
        data: new Date().getTime(),
        resultado: resultado
    });
    localStorage.setItem('cockpit_cnpj_history', JSON.stringify(historico.slice(0, 3)));
}

// Função para reabrir uma análise salva
window.reabrirAnalise = (cnpj) => {
    const historico = JSON.parse(localStorage.getItem('cockpit_cnpj_history') || '[]');
    const item = historico.find(h => h.cnpj === cnpj);
    if (item) {
        const modalPre = document.getElementById('modal-pre-analise');
        if (modalPre) modalPre.remove();
        exibirModalResultadoAnalise(item.resultado);
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

// Inicia o App
initApp();