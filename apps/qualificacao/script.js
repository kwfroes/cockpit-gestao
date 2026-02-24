let familyData = [];
let filteredData = [];
let currentPage = 1;
const itemsPerPage = 6;
let sugPage = 1;
const sugPerPage = 8;
let currentSugList = [];
let selectedSug = new Set();

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
        const response = await fetch('qualificacao_tecnica.json');
        if (!response.ok) throw new Error("Erro ao carregar JSON");
        
        familyData = await response.json();
        
        // Inicializa a interface
        applyFilters();
        updateDatalist();
        checkWelcomeModal();
    } catch (err) {
        console.error("Erro ao carregar dados:", err);
        grid.innerHTML = `<p class="col-span-full text-center py-20 text-gray-600 dark:text-gray-400">Erro ao carregar o arquivo JSON local. Verifique se o ficheiro existe na pasta.</p>`;
    }
}

// --- FILTROS E RENDERIZAÇÃO ---
function applyFilters() {
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

    currentPage = 1;
    renderGrid();
}

function renderGrid() {
    grid.innerHTML = '';
    const start = (currentPage - 1) * itemsPerPage;
    const pageItems = filteredData.slice(start, start + itemsPerPage);

    document.getElementById('page-info').textContent = `${filteredData.length} registros • Pág ${currentPage} de ${Math.ceil(filteredData.length / itemsPerPage) || 1}`;
    document.getElementById('btn-prev').disabled = currentPage === 1;
    document.getElementById('btn-next').disabled = start + itemsPerPage >= filteredData.length;

    pageItems.forEach((item) => {
        const indexInMain = familyData.indexOf(item);
        const card = document.createElement('div');
        const isTerceirizado = item.Terceirizado === "Sim";

        // Definição das classes NEON para os badges no modo escuro
        const tipoBadgeClasses = item.Tipo === 'S' 
            ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400 dark:shadow-[0_0_10px_rgba(129,140,248,0.3)] dark:border dark:border-indigo-500/50' 
            : 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400 dark:shadow-[0_0_10px_rgba(251,146,60,0.3)] dark:border dark:border-orange-500/50';

        const terceirizadoBadgeClasses = 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 dark:shadow-[0_0_10px_rgba(192,132,252,0.3)] dark:border dark:border-purple-500/50';
        
        card.className = `relative bg-white dark:bg-slate-900 rounded-2xl p-6 shadow-sm border ${isTerceirizado ? 'border-purple-200 dark:border-purple-900/40' : 'border-slate-200 dark:border-slate-800'} hover:border-blue-400 transition-all cursor-pointer group flex flex-col h-full animate-fade-in`;
        
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

            
            <h4 class="font-bold text-slate-800 dark:text-white text-sm leading-tight mb-1 group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">${item.Descrição}</h4>
            <p class="text-[12px] text-gray-600 dark:text-gray-100 font-mono mb-6">FAMÍLIA: ${item.Família}</p>

            <div class="space-y-4 flex-grow">
                ${renderDocList("Obrigatórios", item["Documentos Exigidos"] || item["DOCUMENTOS EXIGIDOS"], "text-red-500")}
                ${renderDocList("Elegíveis", item["Documentos Elegíveis"] || item["DOCUMENTOS ELEGÍVEIS"], "text-emerald-600")}
            </div>

            <div class="cnae-section hidden mt-6 pt-4 border-t border-slate-100 dark:border-slate-800 animate-fade-in">
                <p class="text-[9px] font-bold text-blue-500 uppercase mb-2">CNAEs Relacionados</p>
                <div class="space-y-1.5">
                    ${(item.CNAEs || []).length > 0 ? item.CNAEs.map(c => `
                        <div class="text-[10px] bg-slate-50 dark:bg-slate-850 p-2 rounded border dark:border-slate-800 dark:text-slate-300 font-medium">
                            <span class="text-blue-600 dark:text-blue-400 font-bold">${c.codigo}</span> <span class="mx-1 text-slate-300">|</span> ${c.descricao}
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
    div.className = "flex flex-col sm:flex-row gap-2 bg-white dark:bg-slate-900 p-3 rounded-lg border dark:border-slate-700 animate-fade-in";
    div.innerHTML = `
        <input type="text" placeholder="0000-0/00" value="${codigo}" class="cnae-code w-full sm:w-32 p-2 text-xs border rounded-md dark:bg-slate-850 dark:border-slate-700 dark:text-white outline-none focus:border-blue-500">
        <input type="text" placeholder="Descrição" value="${descricao}" class="cnae-desc flex-1 w-full p-2 text-xs border rounded-md dark:bg-slate-850 dark:border-slate-700 dark:text-white outline-none focus:border-blue-500">
        <button type="button" onclick="this.parentElement.remove()" class="text-red-400 hover:text-red-600 p-1">✕</button>
    `;
    container.appendChild(div);
}

window.openFamilyForm = (index = null) => {
    const modal = document.getElementById('family-form-modal');
    document.getElementById('cnae-rows-container').innerHTML = '';
    document.getElementById('f-destinos').value = '';
    document.getElementById('f-replicate').checked = false;
    document.getElementById('replicate-container').classList.add('hidden');
    
    if (index !== null) {
        const item = familyData[index];
        document.getElementById('edit-index').value = index;
        document.getElementById('f-codigo').value = item.Família;
        document.getElementById('f-desc').value = item.Descrição;
        document.getElementById('f-tipo').value = item.Tipo;
        document.getElementById('f-terceirizado').checked = item.Terceirizado === "Sim";
        (item.CNAEs || []).forEach(c => addCnaeRow(c.codigo, c.descricao));
        document.getElementById('form-title').innerText = "Editar Família";
    } else {
        document.getElementById('family-form').reset();
        document.getElementById('edit-index').value = "";
        document.getElementById('form-title').innerText = "Nova Família";
    }
    modal.classList.remove('hidden');
};

window.closeFamilyForm = () => document.getElementById('family-form-modal').classList.add('hidden');

document.getElementById('family-form').onsubmit = (e) => {
    e.preventDefault();
    const index = document.getElementById('edit-index').value;
    
    const cnaes = [];
    document.querySelectorAll('#cnae-rows-container > div').forEach(row => {
        const c = row.querySelector('.cnae-code').value.trim();
        const d = row.querySelector('.cnae-desc').value.trim();
        if (c) cnaes.push({ codigo: c, descricao: d });
    });

    const payload = {
        "Família": document.getElementById('f-codigo').value,
        "Descrição": document.getElementById('f-desc').value,
        "Tipo": document.getElementById('f-tipo').value,
        "Terceirizado": document.getElementById('f-terceirizado').checked ? "Sim" : "Não",
        "Documentos Exigidos": index !== "" ? (familyData[index]["Documentos Exigidos"] || familyData[index]["DOCUMENTOS EXIGIDOS"] || []) : [],
        "Documentos Elegíveis": index !== "" ? (familyData[index]["Documentos Elegíveis"] || familyData[index]["DOCUMENTOS ELEGÍVEIS"] || []) : [],
        "CNAEs": cnaes
    };

    if (index !== "") familyData[index] = payload;
    else familyData.unshift(payload);

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

    applyFilters();
    updateDatalist();
    closeFamilyForm();
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
searchInput.oninput = applyFilters;
typeFilter.onchange = applyFilters;
terceirizadoFilter.onchange = applyFilters;
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
    const textoWhatsApp = 
        `*CONSULTA DE QUALIFICAÇÃO TÉCNICA*\n\n` +
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

// Inicia o App
initApp();