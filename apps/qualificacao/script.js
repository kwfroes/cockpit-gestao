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

const grid = document.getElementById('family-grid');
const searchInput = document.getElementById('search-family');
const typeFilter = document.getElementById('filter-type');
const terceirizadoFilter = document.getElementById('filter-terceirizado');

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
        const [respFamilies, respCnaes, respDocs, respRamos] = await Promise.all([
            fetch('qualificacao_tecnica.json'),
            fetch('cnae.json'),
            fetch('../gerador/docs-qual-tec.json').catch(() => null),
            fetch('./archives/ramos_classificados.json').catch(() => null) 
        ]);

        if (respRamos && respRamos.ok) {
            window.ramosDictionary = await respRamos.json();
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
                    
                    <button onclick="event.stopPropagation(); openFamilyForm(${indexInMain})" class="text-slate-400 hover:text-blue-500 transition-colors p-1" title="Editar Família">
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

            <div onclick="copyToClipboard(event, 'Família ${item.Família} - ${item.Descrição} | Ramo: ${item.Ramo && item.Ramo.nome ? item.Ramo.nome : 'Geral'}')" 
                class="flex items-center gap-1 mb-6 cursor-copy group/info">
                
                <span class="opacity-50 uppercase text-[11px] font-mono whitespace-nowrap overflow-hidden text-ellipsis max-w-[150px]" 
                    title="${item.Ramo && item.Ramo.nome ? item.Ramo.nome : 'Geral'}">
                    ${item.Ramo && item.Ramo.nome ? item.Ramo.nome : 'Geral'}
                </span>

                <span class="opacity-30">|</span>

                <p class="text-[11px] text-gray-500 dark:text-gray-400 font-mono whitespace-nowrap group-hover/info:text-blue-500 transition-colors">
                    FAMÍLIA: ${item.Família}
                </p>
            </div>

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
            
            // Se não houver nenhuma linha, adiciona uma para facilitar
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
        // Se for EDIÇÃO, recuperamos o ramo que já existia no objeto original
        ramoData = familyData[index].Ramo || null;
    } else {
        // Se for NOVA família, buscamos no dicionário pelo prefixo (ex: "01")
        const prefixo = codigoFamilia.split('.')[0];
        const ramoEncontrado = ramosDictionary.find(r => r.codigo.toString() === prefixo);
        if (ramoEncontrado) {
            ramoData = { codigo: ramoEncontrado.codigo, nome: ramoEncontrado.nome };
        }
    }

    const payload = {
        "Família": document.getElementById('f-codigo').value,
        "Descrição": document.getElementById('f-desc').value,
        "Tipo": document.getElementById('f-tipo').value,
        "Terceirizado": document.getElementById('f-terceirizado').checked ? "Sim" : "Não",
        "Documentos Exigidos": docsExigidos,
        "Documentos Elegíveis": docsElegiveis,
        "CNAEs": cnaes,
        "Ramo": ramoData
    };

    if (index !== "") {
        familyData[index] = payload;
        lastEditedIndex = parseInt(index);
        applyFilters(false); // <--- Chame aqui para manter a página na edição
    }
    else {
        familyData.unshift(payload);
        lastEditedIndex = 0;
        applyFilters(true); 
    };

    setTimeout(() => { lastEditedIndex = null; }, 2500);


    // Replicação em Massa
    if (document.getElementById('f-replicate').checked) {
        const destinos = document.getElementById('f-destinos').value
            .split(/[,; ]+/)
            .filter(s => s.trim() !== "");

        destinos.forEach(cod => {
            const familiaAlvo = familyData.find(f => f.Família.toString() === cod);
            if (familiaAlvo && familiaAlvo.Família !== document.getElementById('f-codigo').value) {
                if (!familiaAlvo.CNAEs) familiaAlvo.CNAEs = [];
                cnaes.forEach(novoCnae => {
                    if (!familiaAlvo.CNAEs.some(ex => ex.codigo === novoCnae.codigo)) {
                        familiaAlvo.CNAEs.push(novoCnae);
                    }
                });
            }
        });
    }

    cnaes.forEach(cnaeSalvo => {
        const existe = cnaeDictionary.find(c => c.CNAE === cnaeSalvo.codigo);
        if (!existe) {
            cnaeDictionary.push({
                "CNAE": cnaeSalvo.codigo,
                "DESCRIÇÃO": cnaeSalvo.descricao
            });
        }
    });

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

// Inicia o App
initApp();