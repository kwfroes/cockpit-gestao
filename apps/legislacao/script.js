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
  annotations: {}, // Propriedade para armazenar notas e highlights
  currentSelectionText: "",

  // --- Variável para guardar o callback de confirmação ---
  confirmCallback: null,

  // --- Sistema Customizado de Modais ---
  showModalUI(title, message, isConfirm, type = 'info', callback = null) {
      this.confirmCallback = callback;
      
      const modal = document.getElementById('customConfirmModal');
      const box = document.getElementById('customConfirmBox');
      document.getElementById('customConfirmTitle').textContent = title;
      document.getElementById('customConfirmMessage').textContent = message;
      
      const btnCancel = document.getElementById('customConfirmBtnCancel');
      const btnOk = document.getElementById('customConfirmBtnOk');
      const iconContainer = document.getElementById('customConfirmIcon');

      // Configuração visual baseada no 'tipo' do modal
      if (type === 'danger') {
          btnOk.className = "px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded font-bold transition-colors w-full shadow-sm";
          iconContainer.className = "w-12 h-12 bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-full flex items-center justify-center mb-4 mx-auto";
          iconContainer.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
          btnOk.textContent = "Excluir";
      } else if (type === 'warning') {
          btnOk.className = "px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded font-bold transition-colors w-full shadow-sm";
          iconContainer.className = "w-12 h-12 bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 rounded-full flex items-center justify-center mb-4 mx-auto";
          iconContainer.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>`;
          btnOk.textContent = isConfirm ? "Continuar" : "OK";
      } else { // 'info' default
          btnOk.className = "px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded font-bold transition-colors w-full shadow-sm";
          iconContainer.className = "w-12 h-12 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center mb-4 mx-auto";
          iconContainer.innerHTML = `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`;
          btnOk.textContent = isConfirm ? "Confirmar" : "OK";
      }

      if (isConfirm) {
          btnCancel.classList.remove('hidden');
      } else {
          btnCancel.classList.add('hidden');
      }

      modal.classList.remove('hidden');
      // Animação de entrada
      setTimeout(() => {
          box.classList.remove('scale-95', 'opacity-0');
      }, 10);
  },

  showAlert(title, message) {
      this.showModalUI(title, message, false, 'info');
  },

  showConfirm(title, message, callback, type = 'danger') {
      this.showModalUI(title, message, true, type, callback);
  },

  closeConfirmModal() {
      const modal = document.getElementById('customConfirmModal');
      const box = document.getElementById('customConfirmBox');
      
      box.classList.add('scale-95', 'opacity-0');
      setTimeout(() => {
          modal.classList.add('hidden');
          this.confirmCallback = null;
      }, 200); // Tempo da animação CSS
  },

  executeConfirmModal() {
      if (this.confirmCallback) {
          this.confirmCallback(); // Executa o código que foi passado para ele!
      }
      this.closeConfirmModal();
  },

  async init() {
    this.loadAnnotations();
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

    // Listener para o Menu de Highlight (Dentro do init)
    document.getElementById('viewContent').addEventListener('mouseup', (e) => {
        const selection = window.getSelection();
        const text = selection.toString().replace(/\s+/g, ' ').trim();
        const popup = document.getElementById('highlightToolbar');
        
        if (text.length >= 10 && !e.target.closest('#highlightToolbar')) {
            const viewerRect = document.getElementById('viewerContainer').getBoundingClientRect();
            popup.style.top = (e.clientY - viewerRect.top + document.getElementById('viewerContainer').scrollTop - 40) + 'px';
            popup.style.left = (e.clientX - viewerRect.left) + 'px';
            popup.classList.remove('hidden');
            this.currentSelectionText = text;

            // NOVO E DEFINITIVO: Algoritmo blindado para achar a âncora
            let anchor = null;
            if (selection.rangeCount > 0) {
                // 1. Usa anchorNode (onde o usuário começou a grifar)
                let node = selection.anchorNode;
                let el = node.nodeType === 1 ? node : node.parentElement;

                // 2. Proteção contra o "Vazamento de Seleção" (quando o navegador seleciona a div pai)
                if (el.id === 'viewContent' && node.childNodes.length > 0) {
                    let child = node.childNodes[selection.anchorOffset];
                    if (child) {
                        el = child.nodeType === 1 ? child : child.parentElement;
                    }
                }

                // 3. Sobe na árvore até achar o elemento que é FILHO DIRETO do viewContent
                let currentBlock = el;
                while (currentBlock && currentBlock.parentElement && currentBlock.parentElement.id !== 'viewContent') {
                    currentBlock = currentBlock.parentElement;
                }

                // 4. Agora varremos o bloco e os irmãos anteriores com segurança
                while (currentBlock && currentBlock.id !== 'viewContent') {
                    if (currentBlock.dataset && currentBlock.dataset.key) {
                        anchor = currentBlock.dataset.key;
                        break;
                    }
                    currentBlock = currentBlock.previousElementSibling;
                }
            }
            
            // 5. Fallback: Se grifar algo ANTES do Art. 1º (ex: a Ementa), salva como Preâmbulo
            this.currentSelectionAnchor = anchor || 'Preambulo';

        } else if (text.length === 0) {
            popup.classList.add('hidden');
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
      
      // Devolve o foco para a aba que estiver visível
      const mainContent = document.getElementById("editContent");
      const appendixContent = document.getElementById("editAppendix");
      
      if (!mainContent.classList.contains("hidden")) {
          mainContent.focus();
      } else {
          appendixContent.focus();
      }
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
      document.getElementById("editAppendix").innerHTML = item.appendix || "";
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
      document.getElementById("editAppendix").innerHTML = "";
      document.getElementsByName("editType")[0].checked = true;
      document.getElementById("modalTitle").textContent = "Nova Norma";
    }
    this.switchEditorTab('main');
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

    const headerPattern = /^\s*(LIVRO|TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO|INSTRUÇÃO|PORTARIA|RESOLUÇÃO)\s+(Nº\s*)?([IVXLCDM\d\.\/-]+)\.?\s*$/i;

    let currentArt = "";
    let currentPar = "";
    let currentInc = "";
    let currentAli = "";
    
    let blocks = [];
    let blockRegistry = {}; 

    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        if (!line) continue;

        if (line.toLowerCase().includes("(vetado)") || line.match(/vetado\.?$/i) || line.toLowerCase() === "vetado") {
            blocks.push({
                html: `<p style="text-decoration: line-through; color: #9ca3af; margin-bottom: 0.5em;">${line}</p>`,
                key: null
            });
            continue;
        }

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

            if (nextLine && !headerPattern.test(nextLine) && !nextLine.startsWith("Art.") && !nextLine.match(/^\d/) && !nextLine.includes("(Vetado)")) {
                blocks.push({
                    html: `<div style="margin: 1.5em 0 1em 0; text-align: center; font-weight: bold; color: var(--title-color, #1e3a8a); line-height: 1.2;">${line}<br>${nextLine}</div>`,
                    key: null
                });
                i = nextLineIndex;
                continue;
            } else {
                blocks.push({
                    html: `<div style="margin: 1.5em 0 1em 0; text-align: center; font-weight: bold; color: var(--title-color, #1e3a8a);">${line}</div>`,
                    key: null
                });
                continue;
            }
        }

        let key = null; 

        let artMatch = line.match(/^Art\s*\.?\s*(\d+(?:-[A-Za-z])?)/i);
        if (artMatch) {
            currentArt = `Art-${artMatch[1].toUpperCase()}`;
            currentPar = ""; 
            currentInc = "";
            currentAli = "";
            key = currentArt;
        }

        // 2. Identifica Parágrafo (Agora suporta letras, ex: § 3º-A)
        let parMatch = line.match(/^§\s*(\d+)(?:\s*[º°]\s*)?(?:-([A-Za-z]))?/i);
        let puMatch = line.match(/^(Parágrafo único)/i);
        if (parMatch) {
            let parNum = parMatch[1];
            if (parMatch[2]) parNum += "-" + parMatch[2].toUpperCase(); // Junta o número com a letra
            
            currentPar = `Par-${parNum}`;
            currentInc = ""; // Reset cascata
            currentAli = "";
            key = `${currentArt}-${currentPar}`;
        } else if (puMatch) {
            currentPar = `Par-PU`;
            currentInc = ""; 
            currentAli = "";
            key = `${currentArt}-${currentPar}`;
        }

        // 3. Identifica Inciso (Agora suporta Hífen -, En-Dash – e Em-Dash —)
        let incMatch = line.match(/^([IVXLCDM]+)\s*[-–—]/i);
        if (incMatch) {
            currentInc = `Inc-${incMatch[1]}`;
            currentAli = ""; 
            key = `${currentArt}${currentPar ? '-' + currentPar : ''}-${currentInc}`;
        }

        let aliMatch = line.match(/^([a-z])\s*\)/i);
        if (aliMatch) {
            currentAli = `Ali-${aliMatch[1]}`;
            key = `${currentArt}${currentPar ? '-' + currentPar : ''}${currentInc ? '-' + currentInc : ''}-${currentAli}`;
        }

        let penaMatch = line.match(/^Pena\s*-/i);
        if (penaMatch) {
            key = `${currentArt}${currentPar ? '-' + currentPar : ''}-Pena`;
            line = line.replace(/^(Pena\s*-)/i, "<b>$1</b>"); 
        }

        if (!key && line.length < 100 && !/[.:;]$/.test(line)) {
            let nextLine = (i + 1 < lines.length) ? lines[i + 1].trim() : "";
            let nextArtMatch = nextLine.match(/^Art\s*\.?\s*(\d+(?:-[A-Za-z])?)/i);
            
            if (nextArtMatch) {
                key = `Art-${nextArtMatch[1].toUpperCase()}-Rubrica`;
                line = `<b class="text-gray-700 dark:text-gray-300">${line}</b>`; 
            }
        }

        line = line.replace(/(\((Redação dada|Incluído|Vigência|Vide|Revigorado).*?\))/gi, '<i class="opacity-80 text-sm font-normal italic"> $1 </i>');
        line = line.replace(/^(Art\s*\.?\s*(\d+(?:-[A-Za-z])?)\s*[º\.]?)/i, '<b id="art-$2">$1</b>');
        line = line.replace(/^(§\s*\d+\s*[º°]?\s*(?:-[A-Za-z])?)/i, "<b>$1</b>");
        line = line.replace(/^(Parágrafo único)/i, "<b>$1</b>");
        line = line.replace(/^([IVXLCDM]+\s*[-–—]\s*)/, "<b>$1</b>");        
        line = line.replace(/^([a-z]\s*\))/i, "<b>$1</b>"); 
        line = line.replace(/(\(Incluído por.*?\))/gi, '<i class="opacity-80 text-sm">$1</i>');
        
        line = line.replace(/art\s*\.?\s*(\d+(?:-[A-Za-z])?)/gi, (match, p1) => {
            return `<a href="javascript:void(0)" onclick="app.scrollToArt('${p1.toUpperCase()}')" class="text-blue-600 dark:text-blue-400 underline decoration-dotted hover:text-blue-800 font-medium">${match}</a>`;
        });
        
        line = line.replace(/^(\d+(\.\d+)*\.?)\s/, "<b>$1 </b>");

        let htmlOutput = `<p style="margin-bottom: 0.8em; text-align: justify;"${key ? ` data-key="${key}"` : ''}>${line}</p>`;

        // --- LÓGICA DO TACHADO AUTOMÁTICO (EM CASCATA BLINDADA) ---
        if (key) {
            // Se a chave já existe, significa que encontramos uma nova versão/atualização do mesmo elemento
            if (blockRegistry[key] !== undefined) {
                // Recupera diretamente o índice do bloco antigo usando o mapa (O(1)), sem varrer o array todo
                const targetIdx = blockRegistry[key];
                
                if (blocks[targetIdx] && !blocks[targetIdx].html.includes('text-decoration: line-through')) {
                    blocks[targetIdx].html = blocks[targetIdx].html.replace('<p style="', '<p style="text-decoration: line-through; color: #9ca3af; ');
                }

                // --- Cascata Otimizada para os Filhos Imediatos ---
                // Em vez de varrer desde o bloco 0, varremos apenas os últimos blocos adicionados recentemente
                for (let j = blocks.length - 1; j >= targetIdx; j--) {
                    let blockKey = blocks[j].key;
                    if (blockKey && (blockKey === key || blockKey.startsWith(key + '-'))) {
                        if (!blocks[j].html.includes('text-decoration: line-through')) {
                            blocks[j].html = blocks[j].html.replace('<p style="', '<p style="text-decoration: line-through; color: #9ca3af; ');
                        }
                    }
                }
            }
            // Registra a posição do bloco atual associado a esta chave
            blockRegistry[key] = blocks.length;
        }

        blocks.push({ html: htmlOutput, key: key });
    }
    
    return blocks.map(b => b.html).join("");
  },

  // --- IMPORTAR TXT (Agora usa o processador comum) ---
  importTxtContent(input) {
      const file = input.files[0];
      if (!file) return;

      // Função interna que faz o trabalho
      const processFile = () => {
        const reader = new FileReader();
        reader.onload = (e) => {
          const processedHtml = this.processText(e.target.result);
          document.getElementById("editContent").innerHTML = processedHtml;
          input.value = "";
        };
        reader.readAsText(file);
      };

      if (file.size > 1024 * 1024) {
        this.showConfirm(
          "Arquivo Muito Grande", 
          "Esse arquivo é pesado e pode travar seu navegador. Deseja tentar importar mesmo assim?", 
          () => {
            processFile();
          }, 
          'warning'
        );
      } else {
        processFile();
      }
    },

  // --- AUTO FORMATAR (Botão ✨) ---
  // Agora pega o texto cru do editor e repassa pelo mesmo processador
  autoFormat() {
        const mainContent = document.getElementById("editContent");
        const appendixContent = document.getElementById("editAppendix");
        const editor = !mainContent.classList.contains("hidden") ? mainContent : appendixContent;

        const rawText = editor.innerText;

        if (!rawText.trim()) {
          this.showAlert("Editor Vazio", "Cole algum texto primeiro para poder formatar.");
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
    let appendix = document.getElementById("editAppendix").innerHTML;

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

    if (!title) return this.showAlert("Campo Obrigatório", "O título da norma não pode ficar em branco.");

    // Objeto a ser salvo (com keywords adicionado)
    const newItemData = {
      title,
      date,
      type,
      sphere,
      keywords,
      content,
      appendix,
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

      this.showConfirm(
        "Excluir Norma", 
        "Tem certeza que deseja excluir esta norma? Esta ação não pode ser desfeita.", 
        () => {
          // Isso aqui só roda se o usuário clicar no botão vermelho "Excluir"
          this.data = this.data.filter((x) => x.id !== this.currentId);
          this.saveData();
          this.renderList();
          document.getElementById("lawViewer").classList.add("hidden");
          document.getElementById("emptyState").classList.remove("hidden");
          this.currentId = null;
          if (window.innerWidth < 768) {
            this.isMobileListVisible = true;
            this.updateMobileView();
          }
        }, 
        'danger' // <- Este parâmetro deixa o botão vermelho e coloca o ícone de atenção
      );
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

  openViewer(id, preventScroll = false) {
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

    if (!preventScroll) {
        document.getElementById("viewerContainer").scrollTop = 0;
    }


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
                  <div class="mt-2 text-sm font-medium font-mono inline-flex items-center gap-1.5 px-2 py-1 rounded" style="color: var(--title-color); background-color: color-mix(in srgb, var(--title-color) 15%, transparent); border: 1px solid color-mix(in srgb, var(--title-color) 30%, transparent);">
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

    // 4. Injeta os dados na tela
    document.getElementById("viewTitle").innerHTML = titleHtml;
    document.getElementById("minibarTitle").textContent = item.title; 

    this.applyAppearance();

    document.getElementById("emptyState").classList.add("hidden");
    document.getElementById("lawViewer").classList.remove("hidden");

    document.getElementById("viewTag").innerHTML = item.type + sphereTagHtml;
    document.getElementById("viewDate").textContent =
      `Publicado em: ${new Date(item.date).toLocaleDateString("pt-BR", { dateStyle: "long" })}`;

    // CORREÇÃO: Deixa o conteúdo limpo para a Regex do Highlight funcionar
    let contentHtml = item.content;

    if (searchTerm && searchTerm.length > 2) {
      try {
        const regex = new RegExp(`(${searchTerm})`, "gi");
        contentHtml = contentHtml.replace(regex, '<span class="bg-yellow-200 text-black font-bold">$1</span>');
      } catch (e) {
        console.warn(e);
      }
    }

    // --- PROCESSAMENTO DE HIGHLIGHTS COCKPIT (ANTI-TRAVAMENTO) ---
    const ann = this.annotations[id];
    if (ann && ann.highlights && ann.highlights.length > 0) {
        // Ordena do maior texto pro menor para evitar sub-substituições incorretas
        const sortedHighlights = [...ann.highlights].sort((a, b) => b.text.length - a.text.length);
        
        sortedHighlights.forEach((hl) => {
            if (hl.text && hl.text.length >= 10) {
                // CORREÇÃO PARA LINKS NO MEIO: Substitui espaços por um padrão que tolera tags HTML internas como <a> e </a>
                const escapedLiteral = hl.text
                    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
                    .replace(/\s+/g, '(?:\\s|<[^>]*>)+'); // Ignora dinamicamente qualquer tag HTML no meio do texto selecionado
                
                try {
                    const regex = new RegExp(`(${escapedLiteral})`, "gi");
                    
                    const markTag = `<mark class="${hl.color} rounded-sm px-0.5 cursor-pointer hover:ring-2 hover:ring-red-500 transition-all shadow-sm" onclick="app.removeSingleHighlight(${id}, ${hl.id})" title="Clique para apagar apenas este grifo">$1</mark>`;
                    
                    if (regex.test(contentHtml)) {
                        contentHtml = contentHtml.replace(regex, markTag);
                    }
                } catch (regexError) {
                    console.error("Erro ao aplicar grifo otimizado:", regexError);
                }
            }
        });
    }

    // REINSERÇÃO: Aplica os links automáticos dinâmicos após os grifos estruturais
    contentHtml = this.linkifyNormas(contentHtml);

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

    // 3. Trava a animação responsiva no final da função
    if (!preventScroll) {
        if (window.innerWidth < 768) {
          const sidebar = document.getElementById("sidebar");
          if (sidebar.classList.contains("translate-x-0")) {
            this.toggleMobileMenu();
          }
          window.scrollTo(0, 0);
        } else {
          document
            .getElementById("viewerContainer")
            .scrollIntoView({ behavior: "smooth" });
        }
    }

    // No final do openViewer(), após carregar o viewContent:
    const btnAppendix = document.getElementById("btnViewAppendix");
    const sepAppendix = document.getElementById("divAppendixSeparator");
    
    if (item.appendix && item.appendix.trim() !== "" && item.appendix.trim() !== "<br>") {
        btnAppendix.classList.remove("hidden");
        sepAppendix.classList.remove("hidden");
    } else {
        btnAppendix.classList.add("hidden");
        sepAppendix.classList.add("hidden");
    }

    this.updateNoteIndicator();
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
    if (!w) return this.showAlert("Pop-ups Bloqueados", "Por favor, permita pop-ups neste site para conseguir imprimir ou salvar o PDF.");

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

    // Elementos do Modal de Anexo
    const appxBody = document.getElementById("appendixModalBody");
    const appxContent = document.getElementById("appendixViewContent");
    const appxTitle = document.getElementById("appendixModalTitle");

    // Se os elementos principais não existirem, aborta para evitar erros catastróficos
    if (!viewer || !content || !title) return;

    // --- 1. DEFINIÇÃO DOS MAPAS DE CORES (Centralizado para fácil manutenção) ---
    const themes = {
      sepia: {
        bg: ["bg-[#fdf6e3]", "border-[#eee8d5]"],
        text: ["text-[#433422]"],
        title: ["text-[#5b4636]"],
        tableStripe: "#eee8d5",
        tableBorder: "#d3cbb7",
        titleVarColor: "#78350f"
      },
      dark: {
        bg: ["bg-[#1c1917]", "border-[#44403c]"],
        text: ["text-[#d6d3d1]"],
        title: ["text-[#e7e5e4]"],
        tableStripe: "#292524",
        tableBorder: "#57534e",
        titleVarColor: "#93c5fd"
      },
      default: {
        bg: ["bg-white", "border-gray-200"],
        text: ["text-gray-800"],
        title: ["text-gray-900"],
        tableStripe: "#f9fafb",
        tableBorder: "#e5e7eb",
        titleVarColor: "#1e3a8a"
      }
    };

    // Coleta todas as classes possíveis para a Limpeza Total
    const allBgClasses = Object.values(themes).flatMap(t => t.bg);
    const allTextClasses = Object.values(themes).flatMap(t => t.text);
    const allTitleClasses = Object.values(themes).flatMap(t => t.title);

    // --- 2. LIMPEZA TOTAL CONTRA CONFLITOS ---
    const clearAndAdd = (el, classesToRemove, classesToAdd) => {
      if (!el) return;
      el.classList.remove(...classesToRemove);
      el.classList.add(...classesToAdd);
    };

    const currentTheme = themes[this.preferences.theme] || themes.default;

    // Aplica a limpa e a nova cor cirurgicamente
    clearAndAdd(viewer, allBgClasses, currentTheme.bg);
    clearAndAdd(appxBody, allBgClasses, currentTheme.bg);

    clearAndAdd(content, allTextClasses, currentTheme.text);
    clearAndAdd(appxContent, allTextClasses, currentTheme.text);

    clearAndAdd(title, allTitleClasses, currentTheme.title);
    clearAndAdd(appxTitle, allTitleClasses, currentTheme.title);

    // --- 3. INJEÇÃO DE CSS DINÂMICO (Fontes e Tabelas) ---
    let styleTag = document.getElementById("dynamic-font-style");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "dynamic-font-style";
      document.head.appendChild(styleTag);
    }

    const fonts = {
      serif: "'Merriweather', serif",
      mono: "'Courier New', Courier, monospace",
      default: "'Inter', sans-serif"
    };
    const fontStack = fonts[this.preferences.font] || fonts.default;

    // Melhores seletores para garantir que tabelas de anexos recebam estilos de tabela mesmo sem a classe .law-content
    styleTag.innerHTML = `
      :root {
          --title-color: ${currentTheme.titleVarColor} !important;
      }
      
      #viewContent, #viewContent *, #appendixViewContent, #appendixViewContent * {
          font-family: ${fontStack} !important;
      }

    /* 👇 REGRA AMPLIADA CONTRA HTML SUJO (Planalto) 👇 */
    /* Força tags p, span, font, div e tabelas a obedecerem a cor do tema */
    #viewContent p, #viewContent span:not([class*="bg-"]), #viewContent font, #viewContent div, #viewContent td, #viewContent th,
    #appendixViewContent p, #appendixViewContent span:not([class*="bg-"]), #appendixViewContent font, #appendixViewContent div, #appendixViewContent td, #appendixViewContent th,
    #editContent p, #editContent span:not([class*="bg-"]), #editContent font, #editContent div, #editContent td, #editContent th,
    #editAppendix p, #editAppendix span:not([class*="bg-"]), #editAppendix font, #editAppendix div, #editAppendix td, #editAppendix th {
        color: inherit !important;
        background-color: transparent !important;
    }
    /* 👆 FIM DA REGRA AMPLIADA 👆 */

      .law-content th, #appendixViewContent th {
          background-color: ${currentTheme.tableStripe} !important;
          border-color: ${currentTheme.tableBorder} !important;
          color: inherit !important;
      }
      .law-content tr:nth-child(even), #appendixViewContent tr:nth-child(even) {
          background-color: ${currentTheme.tableStripe} !important;
      }
      .law-content td, .law-content th, #appendixViewContent td, #appendixViewContent th {
          border-color: ${currentTheme.tableBorder} !important;
      }
    `;

    // --- 4. ATUALIZAÇÃO DA MINIBAR (Segura contra erros de elemento nulo) ---
    const minibar = document.getElementById("fixedMinibar");
    if (minibar) {
      // setTimeout obriga o Javascript a esperar o navegador "pintar" a tela
      // com a nova cor antes de tentar copiá-la. Fim da transparência!
      setTimeout(() => {
        const style = window.getComputedStyle(viewer);
        const contentStyle = window.getComputedStyle(content);
        
        const minibarInner = minibar.querySelector('div');
        if (minibarInner) {
          minibarInner.style.backgroundColor = style.backgroundColor;
          minibarInner.style.borderColor = style.borderBottomColor;
        }

        const titleEl = document.getElementById("minibarTitle");
        if (titleEl) {
          titleEl.style.color = contentStyle.color;
        }
      }, 50); // 50 milissegundos é invisível aos olhos, mas resolve o bug!
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
    // Descobre qual editor está aberto
    const mainContent = document.getElementById("editContent");
    const appendixContent = document.getElementById("editAppendix");
    const editor = !mainContent.classList.contains("hidden") ? mainContent : appendixContent;
    
    if (!editor) return;

    let content = editor.innerHTML;
    let linkCount = 0;

    let cleanHtml = content.replace(/&nbsp;/g, ' ');
    
    const regex = /(Lei|Decreto|Instrução|Portaria|Resolução)\s*(Federal|Estadual|Municipal|da\sBahia|do\sEstado)?\s*(?:nº\s*)?([\d\.\/-]+)/gi;

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
        this.showAlert("Limite de Fixados", "Você já possui 3 itens fixados no topo. Desfixe algum para fixar este.");
        return;
      }
      this.data[index].pinned = true;
    }

    this.saveData(); // Salva no localStorage
    this.renderList(document.getElementById("searchInput").value);
  },

  switchEditorTab(tab) {
      const tabMain = document.getElementById("tabMain");
      const tabAppendix = document.getElementById("tabAppendix");
      const contentMain = document.getElementById("editContent");
      const contentAppendix = document.getElementById("editAppendix");

      if (tab === 'main') {
          tabMain.className = "px-4 py-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400";
          tabAppendix.className = "px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 border-b-2 border-transparent";
          contentMain.classList.remove("hidden");
          contentAppendix.classList.add("hidden");
      } else {
          tabAppendix.className = "px-4 py-2 text-sm font-bold border-b-2 border-blue-600 text-blue-600 dark:text-blue-400";
          tabMain.className = "px-4 py-2 text-sm font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 border-b-2 border-transparent";
          contentAppendix.classList.remove("hidden");
          contentMain.classList.add("hidden");
      }
  },

  openAppendixModal() {
        if (!this.currentId) return;
        const item = this.data.find(x => x.id === this.currentId);
        if (!item || !item.appendix) return;

        // CORREÇÃO: O anexo já é HTML salvo pelo editor. 
        // NUNCA passe ele pelo processText() aqui, senão ele quebra as tags e a cor!
        let contentHtml = item.appendix;
        
        // Aplica apenas o gerador de links para outras leis, se quiser
        contentHtml = this.linkifyNormas(contentHtml);
        
        document.getElementById("appendixViewContent").innerHTML = contentHtml;
        document.getElementById("appendixModal").classList.remove("hidden");
    },

  // --- SISTEMA DE ANOTAÇÕES PESSOAIS ---
  loadAnnotations() {
      const saved = localStorage.getItem("cockpit_law_annotations");
      this.annotations = saved ? JSON.parse(saved) : {};
  },

  saveAnnotationsStore() {
      localStorage.setItem("cockpit_law_annotations", JSON.stringify(this.annotations));
  },

  addHighlight(colorClass) {
        if (!this.currentSelectionText || !this.currentId) return;
        
        if (!this.annotations[this.currentId]) {
            this.annotations[this.currentId] = { highlights: [], notes: '' };
        }
        
        const isDuplicate = this.annotations[this.currentId].highlights.some(h => h.text === this.currentSelectionText);

        // Resgata a âncora que foi salva no evento de seleção (mouseup)
        let anchor = this.currentSelectionAnchor || null;
        
        if (!isDuplicate && this.currentSelectionText.length > 0) {
            // CORREÇÃO: Injeta um ID único usando o Timestamp atual
            this.annotations[this.currentId].highlights.push({ 
                id: Date.now(), 
                text: this.currentSelectionText, 
                color: colorClass,
                anchor: anchor
            });
            this.saveAnnotationsStore();
            this.showToast("Texto marcado com sucesso!");
        }
        
        document.getElementById('highlightToolbar').classList.add('hidden');
        window.getSelection().removeAllRanges();
        
        const container = document.getElementById("viewerContainer");
        const currentScroll = container.scrollTop;
        
        this.openViewer(this.currentId, true);
        
        setTimeout(() => {
            container.scrollTop = currentScroll;
        }, 10);
    },

  clearHighlights() {
      if (!this.currentId || !this.annotations[this.currentId]) return;
      
      this.showConfirm("Limpar Marcações", "Deseja remover todas as marcações coloridas desta norma?", () => {
          this.annotations[this.currentId].highlights = [];
          this.saveAnnotationsStore();
          document.getElementById('highlightToolbar').classList.add('hidden');
          this.openViewer(this.currentId);
          this.showToast("Marcações removidas.");
      }, 'warning');
  },

  openNotes() {
      if (!this.currentId) return;
      const ann = this.annotations[this.currentId];

      // Observação geral
      document.getElementById('personalNotesText').value = (ann && ann.notes) ? ann.notes : '';

      // Lista de notas ancoradas
      const list = document.getElementById('anchorNotesList');
      const count = document.getElementById('anchorNotesCount');
      const anchorNotes = (ann && ann.anchorNotes) ? ann.anchorNotes : [];

      count.textContent = anchorNotes.length > 0 ? `${anchorNotes.length} nota(s)` : '';

      if (anchorNotes.length === 0) {
          list.innerHTML = '<p class="text-xs text-gray-400 italic">Nenhuma nota ancorada ainda.</p>';
      } else {
          list.innerHTML = anchorNotes.map(n => `
              <div class="flex items-start gap-2 bg-gray-50 dark:bg-slate-900/50 border dark:border-slate-700 rounded-lg p-3">
                  <div class="flex-1 min-w-0">
                      <button onclick="app.scrollToAnchor('${n.anchor}')"
                              class="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 hover:underline mb-1 block text-left">
                          📍 ${n.label}
                      </button>
                      <p class="text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">${n.note}</p>
                  </div>
                  <button onclick="app.removeAnchorNote(${n.id})"
                          class="text-gray-300 hover:text-red-500 dark:text-slate-600 dark:hover:text-red-400 shrink-0 mt-0.5"
                          title="Remover nota">
                      <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"/>
                      </svg>
                  </button>
              </div>
          `).join('');
      }

      // Garante que o formulário de nova nota esteja fechado ao abrir
      document.getElementById('anchorNoteForm').classList.add('hidden');
      document.getElementById('notesModal').classList.remove('hidden');
  },

  saveNotes() {
      if (!this.currentId) return;
      const text = document.getElementById("personalNotesText").value;
      
      if (!this.annotations[this.currentId]) {
          this.annotations[this.currentId] = { highlights: [], notes: '' };
      }
      
      this.annotations[this.currentId].notes = text;
      this.saveAnnotationsStore();
      
      document.getElementById("notesModal").classList.add("hidden");
      this.updateNoteIndicator();
      this.showToast("Observação salva com sucesso!");
  },

  updateNoteIndicator() {
      const indicator = document.getElementById('noteIndicator');
      if (!indicator || !this.currentId) return;

      const ann = this.annotations[this.currentId];
      const hasNotes = ann && ann.notes && ann.notes.trim().length > 0;
      const hasAnchors = ann && ann.anchorNotes && ann.anchorNotes.length > 0;

      if (hasNotes || hasAnchors) {
          indicator.classList.remove('hidden');
      } else {
          indicator.classList.add('hidden');
      }
  },

  // --- EXPORTAÇÃO E IMPORTAÇÃO DO BACKUP DE NOTAS ---
  exportAnnotations() {
      if (Object.keys(this.annotations).length === 0) {
          return this.showAlert("Aviso", "Você ainda não possui marcações ou notas para fazer backup.");
      }
      const dataStr = JSON.stringify(this.annotations, null, 2);
      const filename = `cockpit_anotacoes_${new Date().toISOString().split('T')[0]}.json`;
      this.downloadFile(filename, dataStr, "application/json");
      this.showToast("Backup gerado com sucesso!");
  },

  importAnnotations(input) {
      const file = input.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (e) => {
          try {
              const importedData = JSON.parse(e.target.result);
              
              this.showConfirm("Restaurar Notas", "Deseja mesclar este backup com suas notas atuais? (Notas existentes poderão ser sobrescritas)", () => {
                  this.annotations = { ...this.annotations, ...importedData };
                  this.saveAnnotationsStore();
                  input.value = ""; // limpa o input
                  if (this.currentId) this.openViewer(this.currentId);
                  this.showToast("Backup restaurado com sucesso!");
              }, 'warning');
          } catch (error) {
              this.showAlert("Erro", "Arquivo de backup inválido ou corrompido.");
          }
      };
      reader.readAsText(file);
  },

  removeSingleHighlight(lawId, highlightId) {
        this.showConfirm("Remover Grifo", "Deseja remover apenas esta marcação do texto?", () => {
            if (this.annotations[lawId] && this.annotations[lawId].highlights) {
                
                // CORREÇÃO CRÍTICA: Convertendo o highlightId recebido para Number
                const idParaRemover = Number(highlightId);
                
                this.annotations[lawId].highlights = this.annotations[lawId].highlights.filter(
                    hl => hl.id !== idParaRemover
                );
                
                this.saveAnnotationsStore();
                
                // Mantém a posição da tela estável
                const container = document.getElementById("viewerContainer");
                const currentScroll = container.scrollTop;
                
                // Força a re-renderização imediata
                this.openViewer(Number(lawId), true);
                
                setTimeout(() => {
                    container.scrollTop = currentScroll;
                }, 10);
                
                this.showToast("Marcação removida.");
            }
        }, 'warning');
    },

    addAnchorNote() {
        if (!this.currentId) return;

        // Puxa a âncora que identificamos no evento do mouse
        let anchor = this.currentSelectionAnchor || null;

        this._pendingAnchor = anchor;
        this.openAnchorNoteModal(anchor);
    },

    openAnchorNoteModal(anchor) {
    // Converte a chave técnica em label legível. Ex: "Art-5-Par-2" → "Art. 5, § 2º"
    const labelMap = (key) => {
        if (!key) return 'Dispositivo não identificado';
        if (key === 'Preambulo') return 'Preâmbulo / Ementa';
        return key
            .replace(/Art-(\w+)/,      'Art. $1')
            .replace(/-Par-PU/,        ', Parágrafo único')
            .replace(/-Par-(\w+)/,     ', § $1º')
            .replace(/-Inc-([IVXLCDM]+)/, ', inc. $1')
            .replace(/-Ali-([a-z])/,   ', al. $1')
            .replace(/-Pena/,          ', Pena')
            .replace(/-Rubrica/,       ' (Rubrica)');
    };

    document.getElementById('anchorNoteFormLabel').textContent = labelMap(anchor);
    document.getElementById('anchorNoteText').value = '';
    document.getElementById('anchorNoteForm').classList.remove('hidden');
    document.getElementById('notesModal').classList.remove('hidden');

      setTimeout(() => document.getElementById('anchorNoteText').focus(), 50);
  },

  cancelAnchorNote() {
      document.getElementById('anchorNoteForm').classList.add('hidden');
      document.getElementById('anchorNoteText').value = '';
      this._pendingAnchor = null;
  },

  saveAnchorNote() {
      const text = document.getElementById('anchorNoteText').value.trim();
      if (!text) return;

      const anchor = this._pendingAnchor;

      const labelMap = (key) => {
          if (!key) return 'Dispositivo não identificado';
          if (key === 'Preambulo') return 'Preâmbulo / Ementa';
          return key
              .replace(/Art-(\w+)/,      'Art. $1')
              .replace(/-Par-PU/,        ', Parágrafo único')
              .replace(/-Par-(\w+)/,     ', § $1º')
              .replace(/-Inc-([IVXLCDM]+)/, ', inc. $1')
              .replace(/-Ali-([a-z])/,   ', al. $1')
              .replace(/-Pena/,          ', Pena')
              .replace(/-Rubrica/,       ' (Rubrica)');
      };

      if (!this.annotations[this.currentId]) {
          this.annotations[this.currentId] = { highlights: [], notes: '', anchorNotes: [] };
      }
      if (!this.annotations[this.currentId].anchorNotes) {
          this.annotations[this.currentId].anchorNotes = [];
      }

      this.annotations[this.currentId].anchorNotes.push({
          id: Date.now(),
          anchor: anchor,
          label: labelMap(anchor),
          note: text,
          createdAt: Date.now()
      });

      this.saveAnnotationsStore();
      this.cancelAnchorNote();
      this.openNotes(); // Recarrega a lista
      this.updateNoteIndicator();
      this.showToast('Nota salva com sucesso!');
  },

  scrollToAnchor(anchor) {
    document.getElementById('notesModal').classList.add('hidden');
    if (!anchor) return;

    // Tenta ir direto ao elemento com data-key
    const el = document.querySelector(`[data-key="${anchor}"]`);
    if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('bg-yellow-100', 'dark:bg-yellow-900/30');
        setTimeout(() => el.classList.remove('bg-yellow-100', 'dark:bg-yellow-900/30'), 2000);
        return;
    }

    // Fallback: rola até o artigo pai
    const artMatch = anchor.match(/Art-(\w+)/);
    if (artMatch) this.scrollToArt(artMatch[1]);
  },

  removeAnchorNote(noteId) {
      this.showConfirm('Remover Nota', 'Deseja remover esta nota ancorada?', () => {
          if (!this.annotations[this.currentId]?.anchorNotes) return;
          this.annotations[this.currentId].anchorNotes = 
              this.annotations[this.currentId].anchorNotes.filter(n => n.id !== noteId);
          this.saveAnnotationsStore();
          this.openNotes(); // Atualiza a lista
          this.updateNoteIndicator();
          this.showToast('Nota removida.');
      }, 'warning');
  },


};

app.init();
