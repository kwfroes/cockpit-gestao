/**
 * apps/legislacao/script.js
 */

// ==========================================
// GESTÃO DE TEMA (DARK MODE) - INTEGRAÇÃO
// ==========================================
function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// 1. Verifica localStorage ao carregar (Fallback)
const savedTheme = localStorage.getItem("cockpit_theme");
if (
  savedTheme === "dark" ||
  (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  applyTheme("dark");
}

// 2. Ouve o comando do pai em tempo real
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "THEME_CHANGE") {
    applyTheme(event.data.theme);
  }
});

// ==========================================
// CONTROLE DE ACESSO POR PERFIL (USER / ADMIN)
// ==========================================
function applyLawRoleRestrictions() {
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
applyLawRoleRestrictions(); // Executa imediatamente


const app = {
  data: [],
  currentId: null,
  filterType: "todos",
  isMobileListVisible: true,
  currentPage: 1,
  itemsPerPage: 6,
  searchMatches: [],      // Guarda os resultados encontrados
  currentSearchIndex: -1, // Posição atual da busca

  async init() {
    await this.loadData();

    document.getElementById("viewerContainer").addEventListener('scroll', () => this.handleScroll());
    this.checkMobileState();

    const savedPrefs = localStorage.getItem("viewer_prefs");
    if (savedPrefs) {
      this.preferences = JSON.parse(savedPrefs);
    }
    this.applyAppearance();
    this.renderList();

  document
      .getElementById("searchInput")
      .addEventListener("input", (e) => {
          this.currentPage = 1; // Reseta a página ao buscar
          this.renderList(e.target.value);
      });

    this.checkMobileState();
    window.addEventListener("resize", () => this.checkMobileState());

    const dontShow = localStorage.getItem("dontShowWelcomeLegislacao");
    if (!dontShow) {
        const modal = document.getElementById("welcomeModalLegislacao");
        if (modal) {
            modal.classList.remove("hidden");
        }
    }

    // Intercepta Ctrl+F (ou Cmd+F no Mac)
    window.addEventListener("keydown", (e) => {
      if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        const isEditorOpen = !document.getElementById("editorModal").classList.contains("hidden");
        const isViewerOpen = !document.getElementById("lawViewer").classList.contains("hidden");

        if (isEditorOpen || isViewerOpen) {
          e.preventDefault();
          
          // Se for no editor, foca o campo de busca mas garante que o modal fique por cima
          this.internalSearch();
          
          // Ajuste de Z-Index dinâmico para o modal de busca
          const searchModal = document.getElementById("internalSearchModal");
          if (isEditorOpen) {
              searchModal.style.zIndex = "100"; // Acima do modal do editor (50)
          } else {
              searchModal.style.zIndex = "50";
          }
        }
      }
    });

  },

  preferences: {
    theme: "default", // default, sepia, dark
    font: "sans", // sans, serif, mono
  },

  // --- 1. CARREGAMENTO COM FETCH ---
    async loadData() {
      try {
        const response = await fetch(`legislacao.json?t=${Date.now()}`, {
          cache: "no-store"
        });

        if (response.ok) {
          const serverData = await response.json();
          const localJson = localStorage.getItem("legislacao_db");
          const localData = localJson ? JSON.parse(localJson) : [];

          // --- FUNÇÃO DE NORMALIZAÇÃO ---
          const normalize = (text) => 
            text.toString().toLowerCase()
              .normalize("NFD").replace(/[\u0300-\u036f]/g, "") 
              .replace(/[^a-z0-9]/g, "") 
              .trim();

          // 3. Criar o Set de chaves do Servidor
          const serverKeys = new Set(serverData.map(item => 
            item.id ? item.id.toString() : normalize(item.title)
          ));

          // 4. Filtrar o local
          const manualEntries = localData.filter(item => {
            const localKey = item.id ? item.id.toString() : normalize(item.title);
            return !serverKeys.has(localKey);
          });

          // 5. Une as listas (Servidor + Manuais)
          const mergedList = [...serverData, ...manualEntries];
          
          // --- 6. A FAXINA (DEDUPLICAÇÃO ESTRITA) ---
          // Varre a lista combinada e remove qualquer duplicata que tenha ficado no cache
          const uniqueData = [];
          const seenKeys = new Set();

          for (const item of mergedList) {
              const key = item.id ? item.id.toString() : normalize(item.title);
              if (!seenKeys.has(key)) {
                  seenKeys.add(key); // Marca como visto
                  uniqueData.push(item); // Adiciona na lista limpa
              }
          }
          
          this.data = uniqueData; // Usa apenas a lista limpa
          this.saveData(); // Subscreve o cache envenenado com a lista limpa
          
          console.log(`Sincronização: ${serverData.length} oficiais e ${manualEntries.length} manuais limpos.`);
        } else {
          throw new Error("Falha ao baixar legislacao.json");
        }
      } catch (error) {
        console.error("Erro no fetch:", error);
        const localJson = localStorage.getItem("legislacao_db");
        this.data = localJson ? JSON.parse(localJson) : [];
      }
    },

    saveData() {
      localStorage.setItem("legislacao_db", JSON.stringify(this.data));
      const stats = {
        total: this.data.length,
        ultimaAtualizacao: new Date().toLocaleDateString("pt-BR"),
      };
      localStorage.setItem("stats_legislacao", JSON.stringify(stats));
    },

  // --- 2. FORMATAÇÃO RICA ---
  format(command, value = null) {
    document.execCommand(command, false, value);
    document.getElementById("editContent").focus();
  },

  openEditor(id = null) {
    const modal = document.getElementById("editorModal");
    const contentDiv = document.getElementById("editContent");

    if (id) {
      const item = this.data.find((x) => x.id === id);
      document.getElementById("editId").value = item.id;
      document.getElementById("editTitle").value = item.title;
      document.getElementById("editDate").value = item.date;

      // NOVO: Carrega as keywords
      document.getElementById("editKeywords").value = item.keywords || "";

      contentDiv.innerHTML = item.content;
      const radios = document.getElementsByName("editType");
      for (let r of radios) if (r.value === item.type) r.checked = true;
      document.getElementById("modalTitle").textContent = "Editar Norma";
      const radiosSphere = document.getElementsByName("editSphere");
      // Se o item for antigo e não tiver esfera, define 'Federal' por padrão
      const itemSphere = item.sphere || "Federal";
      for (let r of radiosSphere) {
        if (r.value === itemSphere) r.checked = true;
      }
    } else {
      // Reset
      document.getElementById("editId").value = "";
      document.getElementById("editTitle").value = "";
      document.getElementById("editDate").value = new Date()
        .toISOString()
        .split("T")[0];
      document.getElementsByName("editSphere")[0].checked = true;

      // NOVO: Limpa as keywords
      document.getElementById("editKeywords").value = "";

      contentDiv.innerHTML = "";
      document.getElementsByName("editType")[0].checked = true;
      document.getElementById("modalTitle").textContent = "Nova Norma";
    }
    modal.classList.remove("hidden");
  },

  closeEditor() {
    document.getElementById("editorModal").classList.add("hidden");
  },

  // --- FUNÇÃO AJUDANTE DE PROCESSAMENTO (Centraliza a Lógica) ---
  processText(rawText) {
    // Limpeza Prévia
    let cleanedText = rawText.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n");
    const lines = cleanedText.split("\n");
    let htmlOutput = "";

    // Regex Atualizado: Adicionei INSTRUÇÃO, PORTARIA, RESOLUÇÃO e suporte a barras (ex: Nº 12/2023)
    const headerPattern =
      /^\s*(LIVRO|TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO|INSTRUÇÃO|PORTARIA|RESOLUÇÃO)\s+(Nº\s*)?([IVXLCDM\d\.\/-]+)\.?\s*$/i;

    for (let i = 0; i < lines.length; i++) {
      let line = lines[i].trim();
      if (!line) continue;

      // Tachado (Vetado)
      if (
        line.toLowerCase().includes("(vetado)") ||
        line.toLowerCase() === "vetado"
      ) {
        htmlOutput += `<p style="text-decoration: line-through; color: #9ca3af; margin-bottom: 0.5em;">${line}</p>`;
        continue;
      }

      // Fusão de Títulos (Agora pega INSTRUÇÃO também)
      if (headerPattern.test(line)) {
        let nextLineIndex = i + 1;
        let nextLine = "";
        while (nextLineIndex < lines.length) {
          if (lines[nextLineIndex].trim()) {
            nextLine = lines[nextLineIndex].trim();
            break;
          }
          nextLineIndex++;
        }

        if (
          nextLine &&
          !headerPattern.test(nextLine) &&
          !nextLine.startsWith("Art.") &&
          !nextLine.match(/^\d/) &&
          !nextLine.includes("(Vetado)")
        ) {
          htmlOutput += `
                        <div style="margin: 1.5em 0 1em 0; text-align: center; font-weight: bold; color: var(--title-color, #1e3a8a); line-height: 1.2;">
                            ${line}<br>${nextLine}
                        </div>
                    `;
          i = nextLineIndex;
          continue;
        } else {
          htmlOutput += `
                        <div style="margin: 1.5em 0 1em 0; text-align: center; font-weight: bold; color: var(--title-color, #1e3a8a);">${line}</div>
                    `;
          continue;
        }
      }

      // --- NEGRITOS PADRÃO ---

      // 1. Regras de Leis (Art., §, Incisos)
      line = line.replace(/(\((Redação dada|Incluído|Vigência|Vide).*?\))/gi, '<i class="opacity-80 text-sm font-normal italic"> $1 </i>');
      line = line.replace(/^(Art\.\s*(\d+)\s*[º\.]?)/i, '<b id="art-$2">$1</b>');
      line = line.replace(/^(Art\.\s*\d+)(?!\d|º)/i, '<b id="art-$2">$1</b>');
      line = line.replace(/^(§\s*\d+\s*º?)/i, "<b>$1</b>");
      line = line.replace(/^(Parágrafo único)/i, "<b>$1</b>");
      line = line.replace(/^([IVXLCDM]+\s-\s)/, "<b>$1</b>");
      
      line = line.replace(/(\(Incluído por.*?\))/gi, '<i class="opacity-80 text-sm">$1</i>');
      line = line.replace(/art\.\s*(\d+)/gi, (match, p1) => {
        return `<a href="javascript:void(0)" onclick="app.scrollToArt(${p1})" class="text-blue-600 dark:text-blue-400 underline decoration-dotted hover:text-blue-800 font-medium">${match}</a>`;
      });

      // 2. NOVA REGRA: Itens Numéricos (comum em Instruções)
      // Ex: "1. Texto", "1.1 Texto", "1.1.2. Texto"
      // Regex: Início da linha + Números e pontos + Espaço ou ponto final
      line = line.replace(/^(\d+(\.\d+)*\.?)\s/, "<b>$1 </b>");

      htmlOutput += `<p style="margin-bottom: 0.8em; text-align: justify;">${line}</p>`;
    }
    return htmlOutput;
  },

  // --- IMPORTAR TXT (Agora usa o processador comum) ---
  importTxtContent(input) {
    const file = input.files[0];
    if (!file) return;
    if (file.size > 1024 * 1024 && !confirm("Arquivo grande. Continuar?"))
      return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const processedHtml = this.processText(e.target.result);
      document.getElementById("editContent").innerHTML = processedHtml;
      input.value = "";
    };
    reader.readAsText(file);
  },

  // --- AUTO FORMATAR (Botão ✨) ---
  // Agora pega o texto cru do editor e repassa pelo mesmo processador
  autoFormat() {
    const editor = document.getElementById("editContent");

    // Pega apenas o TEXTO puro (sem HTML sujo anterior), preservando quebras de linha
    // O .innerText geralmente preserva as quebras visuais como \n
    const rawText = editor.innerText;

    if (!rawText.trim()) {
      alert("Cole algum texto primeiro para formatar.");
      return;
    }

    const processedHtml = this.processText(rawText);
    editor.innerHTML = processedHtml;
  },
  // --- 3. AJUSTE DE TABELAS AO SALVAR ---
  save() {
    const id = document.getElementById("editId").value;
    const title = document
      .getElementById("editTitle")
      .value.trim()
      .toUpperCase();
    const date = document.getElementById("editDate").value;
    const type = document.querySelector('input[name="editType"]:checked').value;
    const sphere =
      document.querySelector('input[name="editSphere"]:checked')?.value ||
      "Federal";

    // NOVO: Pega o valor das keywords
    const keywords = document.getElementById("editKeywords").value.trim();

    let content = document.getElementById("editContent").innerHTML;

    // (Bloco de correção de tabela mantido...)
    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = content;
    const tables = tempDiv.querySelectorAll("table");
    tables.forEach((table) => {
      if (!table.parentElement.classList.contains("table-wrapper")) {
        const wrapper = document.createElement("div");
        wrapper.className = "table-wrapper";
        table.parentNode.insertBefore(wrapper, table);
        wrapper.appendChild(table);
      }
    });
    content = tempDiv.innerHTML;

    if (!title) return alert("O título é obrigatório.");

    // Objeto a ser salvo (com keywords adicionado)
    const newItemData = {
      title,
      date,
      type,
      sphere,
      keywords,
      content,
      updatedAt: Date.now(),
    };

    if (id) {
      const index = this.data.findIndex((x) => x.id == id);
      if (index > -1) {
        // Merge dos dados antigos com os novos
        this.data[index] = { ...this.data[index], ...newItemData };
      }
    } else {
      const newItem = {
        id: Date.now(),
        ...newItemData,
        createdAt: Date.now(),
      };
      this.data.unshift(newItem);
    }

    this.saveData();
    this.closeEditor();
    this.renderList();

    if (this.currentId == id || !id) {
      if (id) this.openViewer(Number(id));
      else this.openViewer(this.data[0].id);
    }
  },

  deleteCurrent() {
    if (!this.currentId) return;
    if (confirm("Tem certeza que deseja excluir esta norma?")) {
      this.data = this.data.filter((x) => x.id !== this.currentId);
      this.saveData();
      this.renderList();
      document.getElementById("lawViewer").classList.add("hidden");
      document.getElementById("emptyState").classList.remove("hidden");
      this.currentId = null;
      if (window.innerWidth < 768) {
        this.isMobileListVisible = true; // Volta para a lista
        this.updateMobileView();
      }
    }
  },

  filter(type) {
    this.filterType = type;
    this.currentPage = 1;

    // Atualiza estilo dos botões (Lógica Refatorada: Compara o argumento do onclick)
    document.querySelectorAll(".filter-chip").forEach((btn) => {
      // Extrai o tipo de dentro do texto do onclick="app.filter('X')"
      const clickAttr = btn.getAttribute("onclick");
      const btnType = clickAttr ? clickAttr.match(/'([^']+)'/)[1] : null;

      if (btnType === type) {
        // Estilo Ativo (Blue)
        btn.classList.add("bg-blue-100", "text-blue-700", "border-blue-200");
        btn.classList.remove("bg-white", "text-gray-600");
        // DARK MODE STYLE
        btn.classList.add(
          "dark:bg-blue-900/40",
          "dark:text-blue-300",
          "dark:border-blue-800",
        );
        btn.classList.remove("dark:bg-slate-700", "dark:text-gray-300");
      } else {
        // Estilo Inativo
        btn.classList.remove("bg-blue-100", "text-blue-700", "border-blue-200");
        btn.classList.add("bg-white", "text-gray-600");
        // DARK MODE STYLE
        btn.classList.remove(
          "dark:bg-blue-900/40",
          "dark:text-blue-300",
          "dark:border-blue-800",
        );
        btn.classList.add("dark:bg-slate-700", "dark:text-gray-300");
      }
    });

    this.renderList(document.getElementById("searchInput").value);
  },

  renderList(searchTerm = "") {
    const listEl = document.getElementById("lawList");
    const paginationEl = document.getElementById("paginationControls");
    listEl.innerHTML = "";
    if (paginationEl) paginationEl.innerHTML = "";

    const term = searchTerm.toLowerCase();

    // 1. FILTRO
    let filtered = this.data.filter((item) => {
      const matchesType = this.filterType === "todos" || item.type === this.filterType;
      const textToSearch = (item.title + " " + (item.content || "") + " " + (item.keywords || "")).toLowerCase();
      return matchesType && textToSearch.includes(term);
    });

    // 2. ORDENAÇÃO
    // 2. ORDENAÇÃO: Fixados primeiro, depois por data decrescente
    filtered.sort((a, b) => {
      if (a.pinned && !b.pinned) return -1;
      if (!a.pinned && b.pinned) return 1;
      return new Date(b.date) - new Date(a.date);
    });

    // --- LÓGICA DE PAGINAÇÃO ---
    const totalItems = filtered.length;
    const totalPages = Math.ceil(totalItems / this.itemsPerPage);

    // Proteção: se a busca reduziu os resultados e a página atual não existe mais
    if (this.currentPage > totalPages && totalPages > 0) {
        this.currentPage = totalPages;
    } else if (totalPages === 0) {
        this.currentPage = 1;
    }

    // Fatia o array (Ex: do 0 ao 6, depois do 6 ao 12...)
    const startIndex = (this.currentPage - 1) * this.itemsPerPage;
    const endIndex = startIndex + this.itemsPerPage;
    const paginatedItems = filtered.slice(startIndex, endIndex);

    // 3. RENDERIZAÇÃO DA LISTA
    if (paginatedItems.length === 0) {
      listEl.innerHTML = `<div class="p-4 text-center text-sm text-gray-400 dark:text-gray-500">Nenhum documento encontrado.</div>`;
      const countEl = document.getElementById("lawCountIndicator");
      if (countEl) countEl.textContent = `0 de ${this.data.length} normas`;
      return;
    }

    paginatedItems.forEach((item) => {
      const dateStr = new Date(item.date).toLocaleDateString("pt-BR");
      const isActive = item.id === this.currentId
          ? "bg-blue-50 dark:bg-blue-900/30 border-blue-200 dark:border-blue-800"
          : "hover:bg-gray-50 dark:hover:bg-slate-700/50 border-transparent dark:border-transparent";

      let sphereBadge = "";
      if (item.sphere === "Municipal") sphereBadge = '<span class="text-[10px] font-bold text-orange-600 dark:text-orange-400 bg-orange-100 dark:bg-orange-900/30 px-1.5 py-0.5 rounded ml-1">MUN</span>';
      else if (item.sphere === "Estadual") sphereBadge = '<span class="text-[10px] font-bold text-blue-600 dark:text-blue-400 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded ml-1">EST</span>';
      else sphereBadge = '<span class="text-[10px] font-bold text-green-600 dark:text-green-400 bg-green-100 dark:bg-green-900/30 px-1.5 py-0.5 rounded ml-1">FED</span>';

      let keywordBadge = "";
      if (item.keywords) {
          const tags = item.keywords.split(',').map(t => t.trim());
          const shortestTag = tags.reduce((a, b) => a.length <= b.length ? a : b);
          keywordBadge = `<span class="text-[10px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700/50 px-1.5 py-0.5 rounded ml-1 truncate max-w-[80px]" title="${shortestTag}">${shortestTag}</span>`;
      }

// Verifica se o item está fixado
      const isPinned = item.pinned === true;
      const pinIcon = isPinned ? '📌' : '📍';
      
      // Adiciona uma cor de fundo levemente diferente se estiver fixado
      const pinnedClass = isPinned ? 'bg-amber-50/50 dark:bg-amber-900/10' : '';

      const div = document.createElement("div");
      div.className = `p-4 border-b dark:border-slate-700 cursor-pointer transition-colors ${isActive} ${pinnedClass}`;
      div.onclick = () => this.openViewer(item.id);
      div.innerHTML = `
          <div class="flex justify-between items-start mb-1">
              <div class="flex items-center gap-2">
                  <button onclick="app.togglePin(event, ${item.id})" 
                          class="hover:scale-125 transition-transform ${isPinned ? 'opacity-100' : 'opacity-20 hover:opacity-100'}"
                          title="${isPinned ? 'Desfixar' : 'Fixar no topo'}">
                      ${pinIcon}
                  </button>
                  <span class="text-[10px] font-bold uppercase tracking-wider text-blue-600 dark:text-blue-300 bg-blue-100 dark:bg-blue-900/40 px-1.5 py-0.5 rounded">${item.type}</span>
                  ${sphereBadge}
                  ${keywordBadge}
              </div>
              <span class="text-xs text-gray-400 dark:text-gray-500 font-mono">${dateStr}</span>
          </div>
          <h4 class="text-sm font-semibold text-gray-800 dark:text-gray-200 leading-snug line-clamp-2 uppercase" title="${item.title}">${item.title}</h4>
      `;
      listEl.appendChild(div);
    });

    const countEl = document.getElementById("lawCountIndicator");
    if (countEl) countEl.textContent = `${totalItems} de ${this.data.length} normas`;

    // 4. RENDERIZAÇÃO DA PAGINAÇÃO
    if (totalPages > 1 && paginationEl) {
      this.renderPagination(totalPages);
    }
  },

  renderPagination(totalPages) {
    const container = document.getElementById("paginationControls");
    let html = "";

    // Botão Anterior
    const prevDisabled = this.currentPage === 1 ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer text-gray-700 dark:text-gray-300";
    html += `<button onclick="app.changePage(${this.currentPage - 1})" ${this.currentPage === 1 ? 'disabled' : ''} class="p-1.5 rounded ${prevDisabled} transition-colors" title="Página Anterior">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"></path></svg>
             </button>`;

    // Números das Páginas
    for (let i = 1; i <= totalPages; i++) {
        // Mostra a primeira, a última e as vizinhas da atual
        if (i === 1 || i === totalPages || (i >= this.currentPage - 1 && i <= this.currentPage + 1)) {
            const activeClass = i === this.currentPage 
                ? "bg-blue-600 text-white font-bold border-blue-600" 
                : "bg-white dark:bg-slate-800 text-gray-600 dark:text-gray-300 border-gray-300 dark:border-slate-600 hover:bg-gray-50 dark:hover:bg-slate-700";
            
            html += `<button onclick="app.changePage(${i})" class="w-7 h-7 mx-0.5 flex items-center justify-center rounded border text-xs shadow-sm ${activeClass} transition-colors">${i}</button>`;
        } else if (i === this.currentPage - 2 || i === this.currentPage + 2) {
            html += `<span class="text-gray-400 dark:text-gray-500 text-xs px-1">...</span>`;
        }
    }

    // Botão Próximo
    const nextDisabled = this.currentPage === totalPages ? "opacity-30 cursor-not-allowed" : "hover:bg-gray-200 dark:hover:bg-slate-700 cursor-pointer text-gray-700 dark:text-gray-300";
    html += `<button onclick="app.changePage(${this.currentPage + 1})" ${this.currentPage === totalPages ? 'disabled' : ''} class="p-1.5 rounded ${nextDisabled} transition-colors" title="Próxima Página">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 5l7 7-7 7"></path></svg>
             </button>`;

    container.innerHTML = html;
  },

  changePage(newPage) {
    const searchTerm = document.getElementById("searchInput").value.trim();
    this.currentPage = newPage;
    this.renderList(searchTerm);
    // Rola a lista lateral de volta pro topo
    document.getElementById('lawList').scrollTop = 0;
  },

  openViewer(id) {
    this.closeInternalSearch();
    this.currentId = id;
    const item = this.data.find((x) => x.id === id);
    if (!item) return;

    const searchTerm = document.getElementById("searchInput").value.trim();

    // Sincroniza o título da minibar
    document.getElementById("minibarTitle").textContent = item.title;
    this.applyAppearance();

    // 1. Atualiza a lista lateral (para pintar o item selecionado)
    this.renderList(searchTerm);

    // Isso garante que o texto comece sempre do topo
    document.getElementById("viewerContainer").scrollTop = 0;



    // 2. Prepara HTML da Esfera
    let sphereTagHtml = "";
    const sphere = item.sphere || "Federal";

    if (sphere === "Municipal")
      sphereTagHtml =
        '<span class="px-2 py-1 text-xs font-bold uppercase tracking-wider bg-orange-100 text-orange-700 rounded ml-2">Municipal</span>';
    else if (sphere === "Estadual")
      sphereTagHtml =
        '<span class="px-2 py-1 text-xs font-bold uppercase tracking-wider bg-blue-100 text-blue-700 rounded ml-2">Estadual</span>';
    else
      sphereTagHtml =
        '<span class="px-2 py-1 text-xs font-bold uppercase tracking-wider bg-green-100 text-green-700 rounded ml-2">Federal</span>';

    // 3. Prepara Título
    const titleHtml = `
            <span class="uppercase">${item.title}</span>
            ${item.keywords ? `
              <div class="mt-2 text-sm font-normal text-blue-500 font-mono bg-blue-50 dark:bg-blue-900/30 dark:text-blue-300 inline-flex items-center gap-1.5 px-2 py-1 rounded">
                <svg 
                  xmlns="http://www.w3.org/2000/svg" 
                  viewBox="0 0 24 24" 
                  fill="none" 
                  class="w-3.5 h-3.5"
                >
                  <path 
                    d="M4.72848 16.1369C3.18295 14.5914 2.41018 13.8186 2.12264 12.816C1.83509 11.8134 2.08083 10.7485 2.57231 8.61875L2.85574 7.39057C3.26922 5.59881 3.47597 4.70292 4.08944 4.08944C4.70292 3.47597 5.59881 3.26922 7.39057 2.85574L8.61875 2.57231C10.7485 2.08083 11.8134 1.83509 12.816 2.12264C13.8186 2.41018 14.5914 3.18295 16.1369 4.72848L17.9665 6.55812C20.6555 9.24711 22 10.5916 22 12.2623C22 13.933 20.6555 15.2775 17.9665 17.9665C15.2775 20.6555 13.933 22 12.2623 22C10.5916 22 9.24711 20.6555 6.55812 17.9665L4.72848 16.1369Z" 
                    stroke="currentColor" 
                    stroke-width="1.5"
                  />
                  <circle cx="8.60724" cy="8.87891" r="2" transform="rotate(-45 8.60724 8.87891)" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M11.5417 18.5L18.5208 11.5208" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                </svg>
                ${item.keywords}
              </div>
            ` : ""}
        `;

    // 4. Injeta os dados na tela (IMPORTANTE: Isso faz o texto aparecer)
    document.getElementById("viewTitle").innerHTML = titleHtml;
    // SINCRONIZA O TÍTULO DA MINIBAR AQUI TAMBÉM
    document.getElementById("minibarTitle").textContent = item.title; 

    // CHAMA A APARÊNCIA ANTES DE MOSTRAR
    this.applyAppearance();

    document.getElementById("emptyState").classList.add("hidden");
    document.getElementById("lawViewer").classList.remove("hidden");

    document.getElementById("viewTag").innerHTML = item.type + sphereTagHtml;
    document.getElementById("viewDate").textContent =
      `Publicado em: ${new Date(item.date).toLocaleDateString("pt-BR", { dateStyle: "long" })}`;


    let contentHtml = item.content;
    contentHtml = this.linkifyNormas(contentHtml);


    // 5. Lógica de Destaque (Highlight)
    if (searchTerm && searchTerm.length > 2) {
      try {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        contentHtml = contentHtml.replace(
          regex,
          '<span class="bg-yellow-200 text-black font-bold">$1</span>',
        );
      } catch (e) {
        console.warn(e);
      }
    }

    document.getElementById("viewContent").innerHTML = contentHtml;

    // 6. Mostra o visualizador
    document.getElementById("emptyState").classList.add("hidden");
    this.applyAppearance();
    document.getElementById("lawViewer").classList.remove("hidden");

    // 7. Lógica Responsiva (Mobile)
    if (window.innerWidth < 768) {
      const sidebar = document.getElementById("sidebar");
      // Se a sidebar estiver aberta, fecha ela suavemente
      if (sidebar.classList.contains("translate-x-0")) {
        this.toggleMobileMenu();
      }
      window.scrollTo(0, 0);
    } else {
      document
        .getElementById("viewerContainer")
        .scrollIntoView({ behavior: "smooth" });
    }
  },

  editCurrent() {
    if (this.currentId) this.openEditor(this.currentId);
  },
  exportJson() {
    const dataStr = JSON.stringify(this.data, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `legislacao.json`;
    a.click();
  },

  // --- FUNÇÕES DE EXPORTAÇÃO ---

  // 1. Exportar para TXT (Remove HTML e limpa)
  exportToTxt() {
    if (!this.currentId) return;

    // CORREÇÃO: Busca em 'this.data' pois você ainda não migrou para o índice separado
    const item = this.data.find((x) => x.id === this.currentId);

    if (!item) return;

    // CORREÇÃO: Pega o conteúdo direto do item
    const htmlContent = item.content;

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;
    tempDiv.querySelectorAll("p, div, tr").forEach((el) => el.after("\n"));

    let text = tempDiv.innerText;
    const header = `${item.type.toUpperCase()}: ${item.title}\nDATA: ${item.date}\n\n-----------------------\n\n`;

    this.downloadFile(`${item.title}.txt`, header + text, "text/plain");
  },

  // 2. Exportar para CSV (Excel - Parágrafo por linha)
  exportToCsv() {
    if (!this.currentId) return;

    // CORREÇÃO: Busca em 'this.data'
    const item = this.data.find((x) => x.id === this.currentId);

    if (!item) return;

    // CORREÇÃO: Pega o conteúdo direto do item
    const htmlContent = item.content;

    const tempDiv = document.createElement("div");
    tempDiv.innerHTML = htmlContent;

    let csvContent = "ID;TIPO;DATA;TITULO;CONTEUDO_LINHA\n";
    const blocks = tempDiv.querySelectorAll("p, div, li, th, td");

    blocks.forEach((block) => {
      let text = block.innerText.trim();
      if (text) {
        text = text.replace(/"/g, "'").replace(/\n/g, " ");
        const row = `${item.id};"${item.type}";"${item.date}";"${item.title}";"${text}"`;
        csvContent += row + "\n";
      }
    });

    const universalBOM = "\uFEFF";
    this.downloadFile(
      `${item.title}.csv`,
      universalBOM + csvContent,
      "text/csv;charset=utf-8",
    );
  },

  // --- 3. EXPORTAR PDF (JANELA LIMPA) ---
  exportToPdf() {
    if (!this.currentId) return;

    const item = this.data.find((x) => x.id === this.currentId);
    if (!item) return;

    // Recupera a esfera (com fallback para Federal se for antigo)
    const sphere = item.sphere || "Federal";

    const w = window.open("", "_blank", "width=900,height=800");
    if (!w) return alert("Popups bloqueados.");

    w.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>${item.title}</title>
                <style>
                    @page { margin: 2cm; size: A4; }
                    body { 
                        font-family: 'Times New Roman', serif; 
                        font-size: 12pt; 
                        line-height: 1.5; 
                        color: #000;
                        margin: 0;
                        padding: 20px;
                    }
                    h1 { 
                        font-family: Arial, sans-serif; 
                        font-size: 16pt; 
                        text-align: center; 
                        margin-bottom: 5px; 
                    }
                    .meta { 
                        text-align: center; 
                        font-size: 10pt; 
                        color: #666; 
                        margin-bottom: 30px; 
                        border-bottom: 1px solid #ccc; 
                        padding-bottom: 10px;
                    }
                    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    th, td { border: 1px solid #000; padding: 5px; text-align: left; font-size: 10pt; }
                    p { margin-bottom: 10px; text-align: justify; }
                    div[style*="text-align: center"] { margin: 20px 0; }
                    
                    /* Destaque para marcas de texto impressas */
                    .bg-yellow-200 { background-color: #fef08a !important; padding: 0 2px; }
                </style>
            </head>
            <body>
                <h1>${item.title}</h1>
                
                <div class="meta">
                    <strong>Esfera:</strong> ${sphere} &nbsp;|&nbsp; 
                    <strong>Tipo:</strong> ${item.type} &nbsp;|&nbsp; 
                    <strong>Data:</strong> ${new Date(item.date).toLocaleDateString("pt-BR")}
                    ${item.keywords ? `<br><strong>Tags:</strong> ${item.keywords}` : ""}
                </div>

                <div class="content">
                    ${item.content}
                </div>

                <script>
                    window.onload = function() {
                        setTimeout(function() {
                            window.print();
                        }, 500);
                    };
                </script>
            </body>
            </html>
        `);
    w.document.close();
  },

  // Função auxiliar de download
  downloadFile(filename, content, mimeType) {
    const blob = new Blob([content], { type: mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  },

  // --- FUNÇÕES DE RESPONSIVIDADE ---

  checkMobileState() {
    // Apenas garante que o overlay suma se redimensionar para desktop
    if (window.innerWidth >= 768) {
      const overlay = document.getElementById("sidebarOverlay");
      if (overlay) overlay.classList.add("hidden");
    }
  },

  toggleMobileMenu() {
    const sidebar = document.getElementById("sidebar");
    const overlay = document.getElementById("sidebarOverlay");

    // Ícones do Livro
    const iconClosed = document.getElementById("iconClosed");
    const iconOpen = document.getElementById("iconOpen");

    const isOpen = sidebar.classList.contains("translate-x-0");

    if (isOpen) {
      // --- FECHAR MENU ---
      sidebar.classList.remove("translate-x-0");
      sidebar.classList.add("-translate-x-full");

      // Esconde overlay
      if (overlay) {
        overlay.classList.remove("opacity-100");
        overlay.classList.add("opacity-0");
        setTimeout(() => overlay.classList.add("hidden"), 300);
      }

      // TROCA DE ÍCONE: Mostra Livro Fechado
      if (iconClosed && iconOpen) {
        iconClosed.classList.remove("hidden");
        iconOpen.classList.add("hidden");
      }
    } else {
      // --- ABRIR MENU ---
      sidebar.classList.remove("-translate-x-full");
      sidebar.classList.add("translate-x-0");

      // Mostra overlay
      if (overlay) {
        overlay.classList.remove("hidden");
        setTimeout(() => {
          overlay.classList.remove("opacity-0");
          overlay.classList.add("opacity-100");
        }, 10);
      }

      // TROCA DE ÍCONE: Mostra Livro Aberto
      if (iconClosed && iconOpen) {
        iconClosed.classList.add("hidden");
        iconOpen.classList.remove("hidden");
      }
    }
  },

  // A função updateMobileView NÃO É MAIS NECESSÁRIA com essa lógica de slide.
  // Pode remover ela ou deixá-la vazia:
  updateMobileView() {
    // Função desativada - controle feito via CSS classes (translate)
  },

  // --- FUNÇÕES DE APARÊNCIA ---

  setTheme(themeName) {
    this.preferences.theme = themeName;
    localStorage.setItem("viewer_prefs", JSON.stringify(this.preferences));
    this.applyAppearance();
  },

  setFont(fontName) {
    this.preferences.font = fontName;
    localStorage.setItem("viewer_prefs", JSON.stringify(this.preferences));
    this.applyAppearance();
  },

  applyAppearance() {
    const viewer = document.getElementById("lawViewer");
    const content = document.getElementById("viewContent");
    const title = document.getElementById("viewTitle");

    // --- 1. LIMPEZA TOTAL (O Segredo para não travar) ---
    // Removemos todas as cores possíveis de todos os temas antes de aplicar o escolhido.

    // Cores de Fundo e Borda (Viewer)
    viewer.classList.remove(
      "bg-white",
      "border-gray-200", // Padrão
      "bg-[#fdf6e3]",
      "border-[#eee8d5]", // Sépia
      "bg-gray-900",
      "border-gray-700", // Dark Comum
      "bg-[#1c1917]",
      "border-[#44403c]", // Dark "Papel Velho"
    );

    // Cores de Texto do Conteúdo
    content.classList.remove(
      "text-gray-800", // Padrão
      "text-[#433422]", // Sépia
      "text-gray-300", // Dark Comum
      "text-[#d6d3d1]", // Dark "Papel Velho"
    );

    // Cores de Título
    title.classList.remove(
      "text-gray-900", // Padrão
      "text-[#5b4636]", // Sépia
      "text-gray-100", // Dark Comum
      "text-[#e7e5e4]", // Dark "Papel Velho"
    );

    // --- 2. APLICAÇÃO DO TEMA ---

    // Variáveis para as cores da Tabela (Zebrado e Bordas)
    let tableStripe = "";
    let tableBorder = "";
    let titleVarColor = "";

    if (this.preferences.theme === "sepia") {
      // TEMA SÉPIA (Dia)
      viewer.classList.add("bg-[#fdf6e3]", "border-[#eee8d5]");
      content.classList.add("text-[#433422]");
      title.classList.add("text-[#5b4636]");

      tableStripe = "#eee8d5";
      tableBorder = "#d3cbb7";
      titleVarColor = "#78350f";
    } else if (this.preferences.theme === "dark") {
      // --- MODO ESCURO "WARM" (Estilo Dark Academia / Couro Antigo) ---

      // Fundo: Stone-900 (Um cinza bem quente, quase marrom café)
      // Borda: Stone-700 (Para separar suavemente)
      viewer.classList.add("bg-[#1c1917]", "border-[#44403c]");

      // Texto: Stone-300 (Um cinza claro meio bege, não é branco estourado)
      content.classList.add("text-[#d6d3d1]");
      title.classList.add("text-[#e7e5e4]");

      // Tabelas: Mantendo a paleta quente
      tableStripe = "#292524"; // Stone-800 para linhas pares
      tableBorder = "#57534e"; // Stone-600 para as grades
      titleVarColor = "#93c5fd";
    } else {
      // TEMA PADRÃO (Clean)
      viewer.classList.add("bg-white", "border-gray-200");
      content.classList.add("text-gray-800");
      title.classList.add("text-gray-900");

      tableStripe = "#f9fafb";
      tableBorder = "#e5e7eb";
      titleVarColor = "#1e3a8a";
    }

    // --- 3. INJEÇÃO DE CSS DINÂMICO (Para Fontes e Tabelas) ---
    let styleTag = document.getElementById("dynamic-font-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-font-style";
      document.head.appendChild(styleTag);
    }

    let fontStack = "";
    if (this.preferences.font === "serif") {
      fontStack = "'Merriweather', serif";
    } else if (this.preferences.font === "mono") {
      fontStack = "'Courier New', Courier, monospace";
    } else {
      fontStack = "'Inter', sans-serif";
    }

    styleTag.innerHTML = `
            :root {
                --title-color: ${titleVarColor} !important;
            }
            #viewContent, #viewContent * {
                font-family: ${fontStack} !important;
            }
            .law-content th {
                background-color: ${tableStripe} !important;
                border-color: ${tableBorder} !important;
                color: inherit !important;
            }
            .law-content tr:nth-child(even) {
                background-color: ${tableStripe} !important;
            }
            .law-content td, .law-content th {
                border-color: ${tableBorder} !important;
            }
        `;

    const minibar = document.getElementById("fixedMinibar");

    if (minibar && viewer) {
        const style = window.getComputedStyle(viewer);
        const contentStyle = window.getComputedStyle(content);
        
        // Pegamos a div interna da minibar para pintar
        const minibarInner = minibar.querySelector('div');
        if (minibarInner) {
            minibarInner.style.backgroundColor = style.backgroundColor;
            minibarInner.style.borderColor = style.borderBottomColor;
        }

        const titleEl = document.getElementById("minibarTitle");
        if (titleEl) {
            // Se o tema for 'default', removemos a cor do JS. 
            // Isso faz o Título obedecer o CSS (text-gray-700 / dark:text-gray-100)
            if (this.preferences.theme === 'default') {
                titleEl.style.color = contentStyle.color; 
            } else {
                // Se for Sépia ou Dark Warm, aí sim usamos a cor do texto do leitor
                titleEl.style.color = contentStyle.color;
            }
        }
    }
  },

  // 1. Localizar termo dentro da norma aberta
  // Abre o modal de busca em vez de usar o prompt
  // --- BUSCA INTERNA (Avançada) ---

  internalSearch() {
    const modal = document.getElementById('internalSearchModal');
    const input = document.getElementById('internalSearchInput');
    
    modal.classList.remove('hidden');
    input.focus();
    input.select(); // Seleciona o texto atual se houver

    // Eventos do Input
    input.onkeydown = (e) => {
      if (e.key === 'Enter') {
        e.preventDefault(); // Evita reload se estiver num form
        if (this.searchMatches.length > 0) {
          // Shift + Enter = Volta | Enter = Avança
          this.navigateSearch(e.shiftKey ? -1 : 1);
        } else {
          this.executeInternalSearch(input.value);
        }
      } else if (e.key === 'Escape') {
        this.closeInternalSearch();
      }
    };

    // Pesquisa em tempo real ao digitar
    input.oninput = () => {
      this.executeInternalSearch(input.value);
    };
  },

  executeInternalSearch(term) {
    const content = document.getElementById('viewContent');
    const stats = document.getElementById('searchStats');
    
    // 1. Limpa busca anterior
    this.clearSearchMarks(content);
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    if (!term || term.length < 2) {
      stats.textContent = "";
      return;
    }

    // 2. Protege o Regex contra caracteres especiais na busca
    const safeTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${safeTerm})`, 'gi');
    
    // 3. Busca apenas em nós de texto para não quebrar o HTML
    const walker = document.createTreeWalker(content, NodeFilter.SHOW_TEXT, null, false);
    let node;
    const nodesToReplace = [];

    while (node = walker.nextNode()) {
        if (node.nodeValue.match(regex)) nodesToReplace.push(node);
    }

    // 4. Embrulha os achados em <span> com <mark>
    nodesToReplace.forEach(textNode => {
        const span = document.createElement('span');
        span.className = 'search-wrapper-temp'; 
        span.innerHTML = textNode.nodeValue.replace(regex, '<mark class="bg-yellow-300 dark:bg-yellow-500/80 text-black rounded-sm px-0.5">$1</mark>');
        textNode.parentNode.replaceChild(span, textNode);
    });

    // 5. Salva referências e ativa a primeira
    this.searchMatches = Array.from(content.querySelectorAll('mark'));

    if (this.searchMatches.length > 0) {
        this.currentSearchIndex = 0;
        this.highlightCurrentSearch();
    } else {
        stats.textContent = "Nenhum resultado";
    }
  },

  highlightCurrentSearch() {
    const stats = document.getElementById('searchStats');
    
    // Reseta o estilo de todos os <mark>
    this.searchMatches.forEach(mark => {
        mark.className = 'bg-yellow-300 dark:bg-yellow-500/80 text-black rounded-sm px-0.5';
    });

    // Destaca o Atual (Laranja + Sombra)
    const activeMark = this.searchMatches[this.currentSearchIndex];
    if (activeMark) {
        activeMark.className = 'bg-orange-500 text-white font-bold rounded-sm px-0.5 ring-2 ring-orange-400 ring-offset-2 dark:ring-offset-slate-900 transition-all';
        activeMark.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    // Atualiza Stats (Ex: 1 de 5)
    stats.textContent = `${this.currentSearchIndex + 1} de ${this.searchMatches.length}`;
  },

  navigateSearch(direction) {
    if (this.searchMatches.length === 0) return;
    
    this.currentSearchIndex += direction;
    
    // Efeito de Loop (se passar do último, volta pro primeiro)
    if (this.currentSearchIndex >= this.searchMatches.length) {
        this.currentSearchIndex = 0;
    } else if (this.currentSearchIndex < 0) {
        this.currentSearchIndex = this.searchMatches.length - 1;
    }

    this.highlightCurrentSearch();
  },

  clearSearchMarks(content) {
    // Restaura o texto original removendo os spans injetados
    const spans = content.querySelectorAll('.search-wrapper-temp');
    spans.forEach(span => {
        const textNode = document.createTextNode(span.textContent);
        span.parentNode.replaceChild(textNode, span);
    });
    content.normalize(); // Junta fragmentos de texto soltos
  },

  closeInternalSearch() {
    const modal = document.getElementById('internalSearchModal');
    const content = document.getElementById('viewContent');
    
    this.clearSearchMarks(content);
    
    this.searchMatches = [];
    this.currentSearchIndex = -1;

    modal.classList.add('hidden');
    document.getElementById('internalSearchInput').value = "";
    document.getElementById('searchStats').textContent = "";
  },

  // 2. Voltar ao topo do container de leitura
  scrollToTop() {
    document.getElementById('viewerContainer').scrollTo({ top: 0, behavior: 'smooth' });
  },

  // 3. Controlar visibilidade do botão de topo e minibar
  handleScroll() {
      const container = document.getElementById('viewerContainer');
      const minibar = document.getElementById('fixedMinibar');
      const btnTopo = document.getElementById('scrollTopBtn');
      
      if (container.scrollTop > 400) {
          minibar.classList.remove('hidden');
          btnTopo.classList.replace('opacity-0', 'opacity-100');
          btnTopo.classList.remove('pointer-events-none');
      } else {
          minibar.classList.add('hidden');
          btnTopo.classList.replace('opacity-100', 'opacity-0');
          btnTopo.classList.add('pointer-events-none');
      }
  },

  closeWelcomeModalLegislacao() {
      const modal = document.getElementById("welcomeModalLegislacao");
      if (modal) {
          modal.classList.add("hidden");
          
          // Salva preferência de não mostrar novamente
          if (document.getElementById("dontShowLegislacaoAgain").checked) {
              localStorage.setItem("dontShowWelcomeLegislacao", "true");
          }
      }
  },

  scrollToArt(num) {
      const element = document.getElementById(`art-${num}`);
      if (element) {
          element.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Efeito visual de destaque temporário
          element.classList.add('bg-yellow-200', 'dark:text-black');
          setTimeout(() => {
              element.classList.remove('bg-yellow-200', 'dark:text-black');
          }, 2000);
      } else {
          console.warn("Artigo não encontrado nesta norma.");
      }
  },

  // Dentro do objeto app:
  // 1. Nova função para converter menções em links (Links em Lote)
  linkifyNormas(htmlContent) {
      if (!htmlContent) return "";

    // Limpeza de espaços HTML especiais (&nbsp;) que quebram a Regex
    let cleanHtml = htmlContent.replace(/&nbsp;/g, ' ');
      
    // Regex melhorada: lida com espaços opcionais e formatos variados de números
    const regex = /(Lei|Decreto|Instrução|Portaria|Resolução)\s*(Federal|Estadual|Municipal|da\sBahia|do\sEstado)?\s*(?:nº\s*)?([\d\.\/-]+)/gi;

        return htmlContent.replace(regex, (match, type, scope, number) => {
            // Normalização agressiva: apenas o TIPO + NÚMEROS
            const cleanNumber = number.replace(/[^\d]/g, ""); 
            const typeUpper = type.toUpperCase();
            
            const found = this.data.find(item => {
                if (item.id === this.currentId) return false;
                
                const titleUpper = item.title.toUpperCase();
                const itemNumberOnly = item.title.replace(/[^\d]/g, "");
                
                // Compara apenas TIPO e a sequência numérica, ignorando o "Federal/Estadual" do texto
                return titleUpper.includes(typeUpper) && 
                      (titleUpper.includes(number.toUpperCase()) || (cleanNumber && itemNumberOnly.includes(cleanNumber)));
            });

            if (found) {
                return `<a href="javascript:void(0)" 
                          onclick="app.showLawPreview(event, ${found.id})" 
                          class="text-blue-600 dark:text-blue-400 underline decoration-dotted font-bold hover:text-blue-800 transition-colors">
                          ${match}
                        </a>`;
            }
            return match;
        });
    },

// 2. Mostrar o Popup
showLawPreview(event, id) {
    const item = this.data.find(x => x.id === id);
    if (!item) return;

    const popup = document.getElementById('lawPreviewPopup');
    const title = document.getElementById('previewPopupTitle');
    const snippet = document.getElementById('previewPopupSnippet');
    const tag = document.getElementById('previewPopupTag');
    const btnGo = document.getElementById('previewPopupGoTo');

    title.textContent = item.title;
    tag.textContent = item.type;
    
    // Limpa o HTML e pega os primeiros 200 caracteres para o resumo
    const tempDiv = document.createElement('div');
    tempDiv.innerHTML = item.content;
    snippet.textContent = tempDiv.innerText.substring(0, 200) + "...";

    btnGo.onclick = () => {
        this.openViewer(item.id);
        this.closeLawPreview();
    };

    // Posicionamento inteligente (perto do clique)
    popup.classList.remove('hidden');
    const x = Math.min(event.clientX, window.innerWidth - 400);
    const y = Math.min(event.clientY, window.innerHeight - 250);
    
    popup.style.left = `${x}px`;
    popup.style.top = `${y}px`;
},

// 3. Add botão para relacionar na caixa de texto
previewLinksInEditor() {
    const editor = document.getElementById("editContent");
    if (!editor) return;

    let content = editor.innerHTML;
    let linkCount = 0;

    // 1. Normalização do conteúdo (remove espaços HTML que quebram Regex)
    let cleanHtml = content.replace(/&nbsp;/g, ' ');
    
    // 2. Regex para identificar Normas Jurídicas
    const regex = /(Lei|Decreto|Instrução|Portaria|Resolução)\s*(Federal|Estadual|Municipal|da\sBahia|do\sEstado)?\s*(?:nº\s*)?([\d\.\/-]+)/gi;

    // 3. Processamento e Cruzamento com a Biblioteca (this.data)
    const linkedContent = cleanHtml.replace(regex, (match, type, scope, number) => {
        const cleanNumber = number.replace(/[^\d]/g, ""); 
        const typeUpper = type.toUpperCase();
        
        const found = this.data.find(item => {
            if (item.id === this.currentId) return false;
            const titleUpper = item.title.toUpperCase();
            const itemNumberOnly = item.title.replace(/[^\d]/g, "");
            
            return titleUpper.includes(typeUpper) && 
                   (itemNumberOnly === cleanNumber || titleUpper.includes(number.toUpperCase()));
        });

        if (found) {
            linkCount++;
            return `<a href="javascript:void(0)" 
                        onclick="app.showLawPreview(event, ${found.id})" 
                        class="text-blue-600 dark:text-blue-400 underline decoration-dotted font-bold hover:text-blue-800">
                        ${match}
                    </a>`;
        }
        return match;
    });

    // 4. Atualização da UI e Feedback via Toast
    if (linkCount > 0) {
        editor.innerHTML = linkedContent;
        this.showToast(`${linkCount} link(s) gerado(s) com sucesso!`, 'success');
    } else {
        this.showToast("Nenhuma citação correspondente encontrada na biblioteca.", 'warning');
    }
},

showToast(message, type = 'success') {
    const container = document.getElementById("toast-container");
    const toast = document.createElement("div");
    
    // Cores baseadas no tipo
    const bgColor = type === 'success' ? 'bg-green-600' : 'bg-amber-500';

    toast.className = `${bgColor} text-white px-6 py-3 rounded-lg shadow-lg transform transition-all duration-500 translate-y-10 opacity-0 flex items-center gap-2`;
    toast.innerHTML = `
        <span class="font-medium">${message}</span>
    `;

    container.appendChild(toast);

    // Animação de entrada
    setTimeout(() => {
        toast.classList.remove('translate-y-10', 'opacity-0');
    }, 100);

    // Auto-destruição
    setTimeout(() => {
        toast.classList.add('opacity-0', 'translate-x-full');
        setTimeout(() => toast.remove(), 500);
    }, 3000);
},

closeLawPreview() {
    document.getElementById('lawPreviewPopup').classList.add('hidden');
},

togglePin(event, id) {
    event.stopPropagation(); // Evita que o clique abra a norma
    
    const index = this.data.findIndex(x => x.id === id);
    if (index === -1) return;

    const currentlyPinned = this.data.filter(x => x.pinned === true);

    if (this.data[index].pinned) {
      this.data[index].pinned = false;
    } else {
      if (currentlyPinned.length >= 3) {
        alert("Você já possui 3 itens fixados. Desfixe um para fixar este.");
        return;
      }
      this.data[index].pinned = true;
    }

    this.saveData(); // Salva no localStorage
    this.renderList(document.getElementById("searchInput").value);
  },


};

app.init();
