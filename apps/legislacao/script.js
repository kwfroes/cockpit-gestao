/**
 * apps/legislacao/script.js
 */

const app = {
    data: [],
    currentId: null,
    filterType: 'todos',
    
    async init() {
        await this.loadData();
        this.renderList();
        document.getElementById('searchInput').addEventListener('input', (e) => this.renderList(e.target.value));
    },

    // --- 1. CARREGAMENTO COM FETCH ---
    async loadData() {
        const localJson = localStorage.getItem('legislacao_db');
        
        if (localJson) {
            this.data = JSON.parse(localJson);
        } else {
            try {
                const response = await fetch('legislacao.json');
                if (response.ok) {
                    const jsonData = await response.json();
                    this.data = jsonData;
                    this.saveData(); 
                    console.log("Dados carregados via fetch de legislacao.json");
                } else {
                    console.warn("legislacao.json não encontrado ou erro no fetch.");
                    this.data = [];
                }
            } catch (error) {
                console.error("Erro ao fazer fetch:", error);
                this.data = [];
            }
        }
    },

    saveData() {
        localStorage.setItem('legislacao_db', JSON.stringify(this.data));
        const stats = {
            total: this.data.length,
            ultimaAtualizacao: new Date().toLocaleDateString('pt-BR')
        };
        localStorage.setItem('stats_legislacao', JSON.stringify(stats));
    },

    // --- 2. FORMATAÇÃO RICA ---
    format(command, value = null) {
        document.execCommand(command, false, value);
        document.getElementById('editContent').focus();
    },

    openEditor(id = null) {
        const modal = document.getElementById('editorModal');
        const contentDiv = document.getElementById('editContent');
        
        if (id) {
            const item = this.data.find(x => x.id === id);
            document.getElementById('editId').value = item.id;
            document.getElementById('editTitle').value = item.title;
            document.getElementById('editDate').value = item.date;
            
            // NOVO: Carrega as keywords
            document.getElementById('editKeywords').value = item.keywords || ""; 

            contentDiv.innerHTML = item.content; 
            const radios = document.getElementsByName('editType');
            for(let r of radios) if(r.value === item.type) r.checked = true;
            document.getElementById('modalTitle').textContent = "Editar Norma";
        } else {
            // Reset
            document.getElementById('editId').value = "";
            document.getElementById('editTitle').value = "";
            document.getElementById('editDate').value = new Date().toISOString().split('T')[0];
            
            // NOVO: Limpa as keywords
            document.getElementById('editKeywords').value = ""; 

            contentDiv.innerHTML = "";
            document.getElementsByName('editType')[0].checked = true;
            document.getElementById('modalTitle').textContent = "Nova Norma";
        }
        modal.classList.remove('hidden');
    },

    closeEditor() {
        document.getElementById('editorModal').classList.add('hidden');
    },

    // --- FUNÇÃO AJUDANTE DE PROCESSAMENTO (Centraliza a Lógica) ---
    processText(rawText) {
        // 1. Limpeza Prévia: Remove excesso de Enters no texto original
        // Troca sequências de 3 ou mais enters por apenas 2, para garantir
        let cleanedText = rawText.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n');
        
        const lines = cleanedText.split('\n');
        let htmlOutput = "";

        // Regex para Títulos (CAPÍTULO, SEÇÃO, etc)
        const headerPattern = /^\s*(LIVRO|TÍTULO|CAPÍTULO|SEÇÃO|SUBSEÇÃO)\s+([IVXLCDM\d\.]+)\.?\s*$/i;

        for (let i = 0; i < lines.length; i++) {
            let line = lines[i].trim();
            
            // --- CORREÇÃO DO ESPAÇAMENTO ---
            // Se a linha estiver vazia, NÓS A IGNORAMOS.
            // Não adicionamos <br>. O próprio <p> da próxima linha já dará o espaço necessário.
            if (!line) {
                continue; 
            }

            // --- TACHADO (VETADO) ---
            if (line.toLowerCase().includes('(vetado)') || line.toLowerCase() === 'vetado') {
                htmlOutput += `<p style="text-decoration: line-through; color: #9ca3af; margin-bottom: 0.5em;">${line}</p>`;
                continue;
            }

            // --- FUSÃO DE TÍTULOS ---
            if (headerPattern.test(line)) {
                // Procura a próxima linha que NÃO seja vazia
                let nextLineIndex = i + 1;
                let nextLine = "";
                
                // Avança no array até achar texto ou acabar (pula os vazios)
                while (nextLineIndex < lines.length) {
                    if (lines[nextLineIndex].trim()) {
                        nextLine = lines[nextLineIndex].trim();
                        break;
                    }
                    nextLineIndex++;
                }

                // Verifica se essa próxima linha é uma descrição válida
                if (nextLine && !headerPattern.test(nextLine) && !nextLine.startsWith('Art.') && !nextLine.includes('(Vetado)')) {
                    // ACHAMOS O PAR!
                    // Reduzi o margin para 1.5em (era 2em) para ficar mais compacto
                    htmlOutput += `
                        <div style="margin: 1.5em 0 1em 0; text-align: center; font-weight: bold; color: #1e3a8a; line-height: 1.2;">
                            ${line}<br>
                            ${nextLine}
                        </div>
                    `;
                    // Avança o índice principal para onde achamos a próxima linha, para não repeti-la
                    i = nextLineIndex; 
                    continue; 
                } else {
                    // Título sozinho
                    htmlOutput += `
                        <div style="margin: 1.5em 0 1em 0; text-align: center; font-weight: bold; color: #1e3a8a;">
                            ${line}
                        </div>
                    `;
                    continue;
                }
            }

            // --- NEGRITOS PADRÃO ---
            line = line.replace(/^(Art\.\s*\d+\s*º)/i, '<b>$1</b>');
            line = line.replace(/^(Art\.\s*\d+)(?!\d|º)/i, '<b>$1</b>');
            line = line.replace(/^(§\s*\d+\s*º?)/i, '<b>$1</b>');
            line = line.replace(/^(Parágrafo único)/i, '<b>$1</b>');
            line = line.replace(/^([IVXLCDM]+\s-\s)/, '<b>$1</b>');

            // Adiciona parágrafo com margem controlada (margin-bottom padrão do navegador é ok, mas podemos forçar algo sutil)
            htmlOutput += `<p style="margin-bottom: 0.8em;">${line}</p>`;
        }
        
        return htmlOutput;
    },

    // --- IMPORTAR TXT (Agora usa o processador comum) ---
    importTxtContent(input) {
        const file = input.files[0];
        if (!file) return;
        if (file.size > 1024 * 1024 && !confirm("Arquivo grande. Continuar?")) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            const processedHtml = this.processText(e.target.result);
            document.getElementById('editContent').innerHTML = processedHtml;
            input.value = '';
        };
        reader.readAsText(file);
    },

    // --- AUTO FORMATAR (Botão ✨) ---
    // Agora pega o texto cru do editor e repassa pelo mesmo processador
    autoFormat() {
        const editor = document.getElementById('editContent');
        
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
        const id = document.getElementById('editId').value;
        const title = document.getElementById('editTitle').value.trim();
        const date = document.getElementById('editDate').value;
        const type = document.querySelector('input[name="editType"]:checked').value;
        
        // NOVO: Pega o valor das keywords
        const keywords = document.getElementById('editKeywords').value.trim();

        let content = document.getElementById('editContent').innerHTML;

        // (Bloco de correção de tabela mantido...)
        const tempDiv = document.createElement('div');
        tempDiv.innerHTML = content;
        const tables = tempDiv.querySelectorAll('table');
        tables.forEach(table => {
            if (!table.parentElement.classList.contains('table-wrapper')) {
                const wrapper = document.createElement('div');
                wrapper.className = 'table-wrapper';
                table.parentNode.insertBefore(wrapper, table);
                wrapper.appendChild(table);
            }
        });
        content = tempDiv.innerHTML;

        if (!title) return alert("O título é obrigatório.");

        // Objeto a ser salvo (com keywords adicionado)
        const newItemData = { title, date, type, keywords, content, updatedAt: Date.now() };

        if (id) {
            const index = this.data.findIndex(x => x.id == id);
            if (index > -1) {
                // Merge dos dados antigos com os novos
                this.data[index] = { ...this.data[index], ...newItemData };
            }
        } else {
            const newItem = {
                id: Date.now(),
                ...newItemData,
                createdAt: Date.now()
            };
            this.data.unshift(newItem);
        }

        this.saveData();
        this.closeEditor();
        this.renderList();
        
        if (this.currentId == id || !id) {
           if(id) this.openViewer(Number(id));
           else this.openViewer(this.data[0].id);
        }
    },

    deleteCurrent() {
        if (!this.currentId) return;
        if (confirm("Tem certeza que deseja excluir esta norma?")) {
            this.data = this.data.filter(x => x.id !== this.currentId);
            this.saveData();
            this.renderList();
            document.getElementById('lawViewer').classList.add('hidden');
            document.getElementById('emptyState').classList.remove('hidden');
            this.currentId = null;
        }
    },

    filter(type) {
        this.filterType = type;
        
        // Atualiza estilo dos botões (Lógica Refatorada: Compara o argumento do onclick)
        document.querySelectorAll('.filter-chip').forEach(btn => {
            // Extrai o tipo de dentro do texto do onclick="app.filter('X')"
            const clickAttr = btn.getAttribute('onclick');
            const btnType = clickAttr ? clickAttr.match(/'([^']+)'/)[1] : null;

            if (btnType === type) {
                 // Estilo Ativo (Blue)
                 btn.classList.add('bg-blue-100', 'text-blue-700', 'border-blue-200');
                 btn.classList.remove('bg-white', 'text-gray-600');
            } else {
                 // Estilo Inativo
                 btn.classList.remove('bg-blue-100', 'text-blue-700', 'border-blue-200');
                 btn.classList.add('bg-white', 'text-gray-600');
            }
        });

        this.renderList(document.getElementById('searchInput').value);
    },

    renderList(searchTerm = "") {
        const listEl = document.getElementById('lawList');
        listEl.innerHTML = "";
        const term = searchTerm.toLowerCase();
        
        const filtered = this.data.filter(item => {
            const matchesType = this.filterType === 'todos' || item.type === this.filterType;
            
            // NOVO: Agora busca também no campo keywords
            const textToSearch = (
                item.title + " " + 
                item.content + " " + 
                (item.keywords || "") // Garante que não quebre se for undefined
            ).toLowerCase();

            const matchesSearch = textToSearch.includes(term);
            return matchesType && matchesSearch;
        });

        if (filtered.length === 0) {
            listEl.innerHTML = `<div class="p-4 text-center text-sm text-gray-400">Nenhum documento.</div>`;
            return;
        }

        filtered.forEach(item => {
            // (Renderização visual mantida igual, sem mostrar keywords na lista, conforme pedido)
            const dateStr = new Date(item.date).toLocaleDateString('pt-BR');
            const div = document.createElement('div');
            const isActive = item.id === this.currentId ? "bg-blue-50 border-blue-200" : "hover:bg-gray-50 border-transparent";
            div.className = `p-4 border-b cursor-pointer transition-colors ${isActive}`;
            div.onclick = () => this.openViewer(item.id);
            div.innerHTML = `
                <div class="flex justify-between items-start mb-1">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-blue-600 bg-blue-100 px-1.5 py-0.5 rounded">${item.type}</span>
                    <span class="text-xs text-gray-400 font-mono">${dateStr}</span>
                </div>
                <h4 class="text-sm font-semibold text-gray-800 leading-snug line-clamp-2">${item.title}</h4>
            `;
            listEl.appendChild(div);
        });
    },

    openViewer(id) {
        this.currentId = id;
        const item = this.data.find(x => x.id === id);
        if (!item) return;
        this.renderList(document.getElementById('searchInput').value);
        
        // Estrutura do Título + Keywords na visualização
        const titleHtml = `
            ${item.title}
            ${item.keywords ? `<div class="mt-2 text-sm font-normal text-blue-500 font-mono bg-blue-50 inline-block px-2 py-1 rounded">🏷️ ${item.keywords}</div>` : ''}
        `;
        
        document.getElementById('viewTitle').innerHTML = titleHtml;
        document.getElementById('viewDate').textContent = `Publicado em: ${new Date(item.date).toLocaleDateString('pt-BR', { dateStyle: 'long' })}`;
        document.getElementById('viewTag').textContent = item.type;
        document.getElementById('viewContent').innerHTML = item.content;

        document.getElementById('emptyState').classList.add('hidden');
        document.getElementById('lawViewer').classList.remove('hidden');
        if(window.innerWidth < 768) document.getElementById('viewerContainer').scrollIntoView({ behavior: 'smooth' });
    },

    editCurrent() { if (this.currentId) this.openEditor(this.currentId); },
    exportJson() {
        const dataStr = JSON.stringify(this.data, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `legislacao.json`;
        a.click();
    }
};

app.init();