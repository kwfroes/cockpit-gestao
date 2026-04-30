const app = {
    data: { "Estados": [] },
    currentIndex: null,
    isEditing: false,
    theme: 'light',

    async init() {
        // 1. Define o tema inicial
        this.loadTheme();
        
        // 2. Configura os ouvintes (Click, Storage, Message)
        this.setupGlobalEvents();


        // 4. Carrega os dados do JSON/Local
        await this.loadData();
        
        this.showWelcomeModal();

    },

    loadTheme() {
        const savedTheme = localStorage.getItem("cockpit_theme") || "light";
        this.theme = savedTheme; // mantém o estado interno
        document.documentElement.classList.toggle("dark", savedTheme === "dark");
        this.updateThemeUI();
    },

    applyTheme() {
        const root = document.documentElement;

        root.classList.remove('dark');

        if (this.theme === 'dark') {
            root.classList.add('dark');
        }

        this.updateThemeUI();

        console.log("Tema aplicado:", this.theme);
        setTimeout(() => {
            console.log("Classes finais:", document.documentElement.className);
        }, 100);
    },

    toggleTheme() {
        const newTheme = this.theme === 'dark' ? 'light' : 'dark';

        if (this.theme === newTheme) return; // segurança extra

        this.theme = newTheme;
        localStorage.setItem('cockpit_theme', this.theme);
        
        // Sincroniza com o Cockpit se estiver em um iframe
        if (window.parent !== window) {
            try {
                window.parent.localStorage.setItem('cockpit_theme', this.theme);
                // Opcional: Avisar o pai da mudança
                window.parent.postMessage({ type: "THEME_CHANGE", theme: this.theme }, "*");
            } catch(e) {}
        }
        
        this.applyTheme();
    },


    setupGlobalEvents() {
        // Vincula o botão de exportar
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.onclick = () => this.handleExport();
        
        // Vincula a busca
        const searchInput = document.getElementById('searchInput');
        if (searchInput) searchInput.oninput = () => this.filterStates();

        // Vincula o toggle de tema
        const themeToggle = document.getElementById('themeToggle');
        if (themeToggle) themeToggle.onclick = () => this.toggleTheme();

        // ESCUTA DE MENSAGENS (Padrão Matriz Eisenhower)
        window.addEventListener("message", (e) => {
            // Verifica se a mensagem tem o formato esperado
            if (e.data && e.data.type === "THEME_CHANGE") {
                if (this.theme === e.data.theme) return; // 🔒 evita duplicação

                this.theme = e.data.theme;
                localStorage.setItem('cockpit_theme', this.theme);
                this.applyTheme();
            }
        });

        // ESCUTA DE STORAGE (Para sincronia entre abas)
        window.addEventListener('storage', (e) => {
            if (e.key === 'cockpit_theme') {
                if (this.theme === e.newValue) return; // 🔒 evita duplicação

                this.theme = e.newValue || 'light';
                this.applyTheme();
            }
        });
    },


    async loadData() {
        try {
            const local = localStorage.getItem('pm_data');
            if (local) {
                this.data = JSON.parse(local); // se corrompido, cai no catch
                this.onDataLoaded();
                return;
            }
        } catch (e) {
            console.warn('pm_data corrompido, removendo...', e);
            localStorage.removeItem('pm_data'); // limpa automaticamente
        }

        // Fallback: busca o JSON original
        try {
            const response = await fetch('regularidade_estados_mun.json');
            if (response.ok) {
                this.data = await response.json();
                this.onDataLoaded();
            }
        } catch (err) {
            console.error("Erro ao carregar dados iniciais:", err);
        }
    },

    onDataLoaded() {
        document.getElementById('loadingState')?.classList.add('hidden');
        document.getElementById('toolbar')?.classList.remove('hidden');
        const exportBtn = document.getElementById('exportBtn');
        if (exportBtn) exportBtn.disabled = false;
        
        this.renderGrid();
        localStorage.setItem('pm_data', JSON.stringify(this.data));
    },

    // --- NOVA LOGICA DE VALIDAÇÃO DE LINKS ---
    async validateLink(url) {
        if (!url || url.length < 10) return 'invalid';
        try {
            // Usamos mode: 'no-cors' para evitar erros de bloqueio de política de origem, 
            // embora isso limite a precisão do status, ajuda a detectar URLs malformadas ou DNS falhos.
            await fetch(url, { method: 'HEAD', mode: 'no-cors' });
            return 'ok'; 
        } catch (e) {
            return 'broken';
        }
    },

    async startLinkValidation() {
        const linkElements = document.querySelectorAll('[data-check-url]');
        linkElements.forEach(async (el) => {
            const url = el.getAttribute('data-check-url');
            const status = await this.validateLink(url);
            const dot = el.querySelector('.link-status-dot');
            if (dot) {
                dot.classList.remove('status-loading');
                dot.classList.add(status === 'ok' ? 'status-ok' : 'status-broken');
            }
        });
    },

    // --- RENDERIZAÇÃO DA GRADE PRINCIPAL ---
    renderGrid(list = null) {
        const grid = document.getElementById('stateGrid');
        const states = list || this.data.Estados;
        if (!grid) return;

        grid.innerHTML = states.map((s) => {
            const actualIdx = this.data.Estados.indexOf(s);
            const uf = s.Estado.includes('(') ? s.Estado.split('(')[1].replace(')', '') : '--';
            return `
                <div onclick="app.openModal(${actualIdx})" class="state-card bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-[2rem] p-7 cursor-pointer shadow-sm relative overflow-hidden group">
                    <div class="flex justify-between items-start mb-6">
                        <span class="px-3 py-1 bg-slate-100 dark:bg-slate-800 text-[10px] font-black tracking-widest text-slate-500 uppercase rounded-lg">${uf}</span>
                        <div class="w-3 h-3 rounded-full ${this.getStatusColor(s)} shadow-lg"></div>
                    </div>
                    <h3 class="text-xl font-extrabold mb-1 tracking-tight text-slate-800 dark:text-slate-100">${s.Estado}</h3>
                    <p class="text-sm text-slate-400 font-semibold mb-6">${s.Capital}</p>
                    <div class="pt-5 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                        <span class="text-[10px] font-black text-slate-400 uppercase tracking-widest">${s.Cidades.length} Polos</span>
                        <span class="text-xs font-bold text-blue-600">Ver detalhes →</span>
                    </div>
                </div>`;
        }).join('');
    },

    // --- MODAL ---
    openModal(idx) {
        this.currentIndex = idx;
        this.isEditing = false;
        this.renderModal();
        document.getElementById('modalOverlay').classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    },

    renderModal() {
        const s = this.data.Estados[this.currentIndex];
        const header = document.getElementById('modalHeaderContent');
        const body = document.getElementById('modalBody');
        const footer = document.getElementById('modalFooter');
        const editBtn = document.getElementById('toggleEditBtn');

        editBtn.innerText = this.isEditing ? "Voltar para Resumo" : "Editar Dados";
        footer.classList.toggle('hidden', !this.isEditing);

        header.innerHTML = `
            <h2 class="text-2xl font-black text-slate-800 dark:text-slate-100">${s.Estado}</h2>
            <p class="text-[10px] uppercase font-black text-slate-400 tracking-[0.2em] mt-0.5">Capital: ${s.Capital}</p>
        `;

        body.innerHTML = this.isEditing ? this.getEditTemplate(s) : this.getViewTemplate(s);
        
        if (!this.isEditing) this.startLinkValidation();
    },

    // --- TEMPLATES DE VISUALIZAÇÃO E EDIÇÃO ---
    getViewTemplate(s) {
        return `
            <div class="grid grid-cols-1 md:grid-cols-2 gap-8 mb-12">
                <div class="bg-slate-50 dark:bg-slate-800/40 p-6 rounded-3xl border border-slate-100 dark:border-slate-800">
                    <h4 class="text-[10px] font-black uppercase text-slate-400 mb-6 tracking-widest">Documentos Estaduais</h4>
                    <div class="space-y-4">
                        ${this.getLinkButton("Concordata e Falência", s.Links["Concordata e Falência - Estado"])}
                        ${this.getLinkButton("Regularidade Estadual", s.Links["Regularidade Estadual - Estadual"])}
                    </div>
                </div>
                <div class="flex items-center justify-center p-6 bg-blue-500/5 rounded-3xl border border-blue-500/10">
                    <div class="text-center">
                        <div class="text-3xl font-black text-blue-600 mb-1">${s.Cidades.length}</div>
                        <div class="text-[10px] font-black uppercase text-blue-500 tracking-widest">Polos de Atuação</div>
                    </div>
                </div>
            </div>
            <div class="grid grid-cols-1 gap-4">
                ${s.Cidades.map(c => {
                    const isCapital = c.Nome.toLowerCase() === s.Capital.toLowerCase();
                    return `
                    <div class="flex flex-col md:flex-row md:items-center justify-between p-6 bg-white dark:bg-slate-800/20 border border-slate-100 dark:border-slate-800 rounded-2xl group">
                        <div class="mb-4 md:mb-0">
                            <div class="flex items-center gap-3 mb-1">
                                <span class="text-lg font-bold ${isCapital ? 'text-blue-600' : ''}">${c.Nome}</span>
                                ${isCapital ? '<span class="bg-blue-500/10 text-blue-600 text-[8px] font-black px-2 py-0.5 rounded uppercase">Capital</span>' : ''}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            ${this.getLinkIconButton("Ficha", c.Links["Ficha de Inscrição - Municipio"], "Inscrição")}
                            ${this.getLinkIconButton("Reg.", c.Links["Regularidade Municipal - Municipio"], "Regularidade")}
                        </div>
                    </div>`;
                }).join('')}
            </div>`;
    },

    getEditTemplate(s) {
        return `
            <div class="mb-10">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-slate-50 dark:bg-slate-800/40 p-8 rounded-3xl border border-slate-100 dark:border-slate-800 mb-6">
                    <div>
                        <label class="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Nome do Estado</label>
                        <input type="text" id="edit_state_name" value="${s.Estado}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                    <div>
                        <label class="block text-[10px] font-black uppercase text-slate-400 mb-2 tracking-widest">Capital Oficial</label>
                        <input type="text" id="edit_state_capital" value="${s.Capital}" class="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl py-2 px-4 text-sm outline-none focus:ring-2 focus:ring-blue-500">
                    </div>
                </div>

                <div class="grid grid-cols-1 md:grid-cols-2 gap-6 bg-blue-50/50 dark:bg-blue-900/10 p-8 rounded-3xl border border-blue-100 dark:border-blue-900/30 mb-6">
                    <div>
                        <label class="block text-[10px] font-black uppercase text-blue-500 mb-2 tracking-widest">Concordata e Falência (Judiciáro Estadual)</label>
                        <input type="text" id="edit_link_concordata" value="${s.Links["Concordata e Falência - Estado"] || ''}" class="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl py-2 px-4 text-[10px] outline-none">
                    </div>
                    <div>
                        <label class="block text-[10px] font-black uppercase text-blue-500 mb-2 tracking-widest">Regularidade Estadual</label>
                        <input type="text" id="edit_link_regularidade" value="${s.Links["Regularidade Estadual - Estadual"] || ''}" class="w-full bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 rounded-xl py-2 px-4 text-[10px] outline-none">
                    </div>
                </div>
            </div>

            <div id="citiesContainer" class="space-y-4">
                <h4 class="text-[10px] font-black uppercase text-slate-400 px-4 tracking-[0.2em]">Cidades / Polos</h4>
                ${s.Cidades.map((c, idx) => `
                    <div class="p-6 bg-white dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl">
                        <div class="grid grid-cols-1 lg:grid-cols-12 gap-4 items-center">
                            <div class="lg:col-span-3">
                                <label class="text-[8px] uppercase font-bold text-slate-400 block mb-1">Nome do Polo</label>
                                <input type="text" value="${c.Nome}" onchange="app.updateCityField(${idx}, 'Nome', this.value)" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-lg py-2 px-3 text-sm">
                            </div>
                            <div class="lg:col-span-4">
                                <label class="text-[8px] uppercase font-bold text-slate-400 block mb-1">Link Ficha</label>
                                <input type="text" value="${c.Links["Ficha de Inscrição - Municipio"] || ''}" onchange="app.updateCityLink(${idx}, 'Ficha de Inscrição - Municipio', this.value)" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-lg py-2 px-3 text-[10px]">
                            </div>
                            <div class="lg:col-span-4">
                                <label class="text-[8px] uppercase font-bold text-slate-400 block mb-1">Link Regularidade</label>
                                <input type="text" value="${c.Links["Regularidade Municipal - Municipio"] || ''}" onchange="app.updateCityLink(${idx}, 'Regularidade Municipal - Municipio', this.value)" class="w-full bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-700 rounded-lg py-2 px-3 text-[10px]">
                            </div>
                            <div class="lg:col-span-1 flex justify-end">
                                <button onclick="app.removeCity(${idx})" class="p-2 text-slate-300 hover:text-red-500 transition-colors">
                                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>`).join('')}
            </div>
            <button onclick="app.addCityRow()" class="mt-4 w-full py-4 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-slate-400 text-xs font-black uppercase hover:bg-slate-50 dark:hover:bg-slate-800 transition-all">+ Adicionar Novo Polo Regional</button>`;
    },

    // --- FUNÇÕES DE BOTÃO ---
    getLinkButton(label, url) {
        const hasUrl = url && url.length > 5;
        return `
            <div class="flex items-center justify-between group" ${hasUrl ? `data-check-url="${url}"` : ''}>
                <div class="flex items-center gap-2 text-sm font-bold text-slate-600 dark:text-slate-400">
                    ${hasUrl ? '<span class="link-status-dot status-loading shrink-0"></span>' : ''}
                    <span>${label}</span>
                </div>
                ${hasUrl ? `<a href="${url}" target="_blank" class="link-badge px-4 py-2 bg-blue-600 text-white text-[10px] font-black rounded-full">Acessar</a>` : '<span class="text-slate-400 italic text-[10px]">Não consta</span>'}
            </div>`;
    },

    getLinkIconButton(label, url, sub) {
        const hasUrl = url && url.length > 5;
        return `
            <a ${hasUrl ? `href="${url}" target="_blank" data-check-url="${url}"` : ''} 
               class="flex items-center gap-2 px-4 py-3 rounded-xl transition-all ${hasUrl ? 'bg-slate-100 dark:bg-slate-800 hover:bg-blue-600 hover:text-white' : 'opacity-30 cursor-not-allowed'}">
                ${hasUrl ? '<span class="link-status-dot status-loading shrink-0"></span>' : ''}
                <div class="flex flex-col items-start">
                    <p class="text-[9px] font-black uppercase leading-none">${label}</p>
                    <p class="text-[7px] opacity-60 uppercase mt-1">${sub}</p>
                </div>
            </a>`;
    },

    // --- LÓGICA DE NEGÓCIO E PERSISTÊNCIA ---
    updateCityField(idx, field, val) { 
        this.data.Estados[this.currentIndex].Cidades[idx][field] = val; 
        this.saveToLocal();
    },

    updateCityLink(idx, field, val) { 
        this.data.Estados[this.currentIndex].Cidades[idx].Links[field] = val; 
        this.saveToLocal();
    },
    
    addCityRow() {
        this.data.Estados[this.currentIndex].Cidades.push({
            "Nome": "Novo Polo", "Tipo": "Polo Regional",
            "Links": { "Ficha de Inscrição - Municipio": "", "Regularidade Municipal - Municipio": "" }
        });
        this.renderModal();
    },

    removeCity(idx) {
        if(confirm("Remover este polo permanentemente?")) {
            this.data.Estados[this.currentIndex].Cidades.splice(idx, 1);
            this.renderModal();
        }
    },

    saveChanges() {
        const s = this.data.Estados[this.currentIndex];
        
        // Salva nome e capital
        s.Estado = document.getElementById('edit_state_name').value;
        s.Capital = document.getElementById('edit_state_capital').value;
        
        // Salva os links estaduais (RECUPERADO)
        s.Links["Concordata e Falência - Estado"] = document.getElementById('edit_link_concordata').value;
        s.Links["Regularidade Estadual - Estadual"] = document.getElementById('edit_link_regularidade').value;
        
        this.saveToLocal();
        this.onDataLoaded();
        this.isEditing = false;
        this.renderModal();
        this.showToast("Alterações salvas com sucesso!");
    },

    saveToLocal() {
        localStorage.setItem('pm_data', JSON.stringify(this.data));
    },

    /*
    addNewState() {
        const n = { "Estado": "Novo Estado (UF)", "Capital": "Sede", "Links": { "Concordata e Falência - Estado": "", "Regularidade Estadual - Estadual": "" }, "Cidades": [] };
        this.data.Estados.unshift(n);
        this.saveToLocal();
        this.onDataLoaded(); 
        this.openModal(0); 
        this.toggleEditMode();
    },
    */

    deleteState() {
        if(confirm("Excluir este estado e todos os seus polos?")) {
            this.data.Estados.splice(this.currentIndex, 1);
            this.saveToLocal();
            this.onDataLoaded(); 
            this.closeModal();
            this.showToast("Estado removido.", "error");
        }
    },

    // --- BUSCA E FILTROS ---
    filterStates() {
        const q = document.getElementById('searchInput').value.toLowerCase();
        const filtered = this.data.Estados.filter(s => 
            s.Estado.toLowerCase().includes(q) || 
            s.Capital.toLowerCase().includes(q) ||
            s.Cidades.some(c => c.Nome.toLowerCase().includes(q))
        );
        this.renderGrid(filtered);
    },

    updateThemeUI() {
        const icon = document.getElementById('themeIcon');
        if (!icon) return;
        icon.innerHTML = this.theme === 'dark' 
            ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707m12.728 0l-.707-.707M6.343 6.343l-.707-.707M12 5a7 7 0 100 14 7 7 0 000-14z" />'
            : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />';
    },

    getStatusColor(s) {
        const allCities = s.Cidades.length > 0 && s.Cidades.every(c => Object.values(c.Links).some(link => link && link.length > 5));
        if (allCities) return 'bg-emerald-500 shadow-emerald-500/50';
        
        const hasStateLinks = Object.values(s.Links).some(l => l && l.length > 5);
        const hasCap = s.Cidades.find(c => c.Nome.toLowerCase() === s.Capital.toLowerCase());
        const capHasLinks = hasCap && Object.values(hasCap.Links).some(l => l && l.length > 5);
        
        if (hasStateLinks && capHasLinks) return 'bg-yellow-500 shadow-yellow-500/50';
        return 'bg-slate-300 dark:bg-slate-700';
    },

    showToast(msg, type = "success") {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-2xl z-[100] animate-bounce ${type === 'success' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-red-600 text-white'}`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    handleExport() {
        try {
            const dataStr = JSON.stringify(this.data, null, 4);
            const blob = new Blob([dataStr], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `regularidade_estados_mun.json`;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            this.showToast("JSON Exportado!");
        } catch (e) {
            this.showToast("Erro ao exportar", "error");
        }
    },

    toggleEditMode() { this.isEditing = !this.isEditing; this.renderModal(); },
        closeModal() { document.getElementById('modalOverlay').classList.add('hidden'); document.body.style.overflow = 'auto'; },

        showWelcomeModal() {
        const dontShow = localStorage.getItem('regmap_welcome_hidden');

        if (dontShow === 'true') return;

        const modal = document.getElementById('welcomeModal');
        if (modal) modal.classList.remove('hidden');
    },

    closeWelcomeModal() {
        const checkbox = document.getElementById('dontShowAgain');

        if (checkbox && checkbox.checked) {
            localStorage.setItem('regmap_welcome_hidden', 'true');
        }

        const modal = document.getElementById('welcomeModal');
        if (modal) modal.classList.add('hidden');
    }
};

// Inicializa o App
app.init();