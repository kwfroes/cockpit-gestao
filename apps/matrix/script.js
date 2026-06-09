const app = {
    tasks: [],

    // NO script.js, altere a função init:
    init() {
        this.loadData();
        this.refreshQuadrants();
        this.render();
        this.checkWelcomeModal();
        
        
        // 1. Aplica o tema inicial assim que carrega
        const savedTheme = localStorage.getItem("cockpit_theme") || "light";
        document.documentElement.classList.toggle("dark", savedTheme === "dark");

        // 2. Listener de Mensagens do App Pai (Cockpit)
        window.addEventListener("message", (e) => {
            if (e.data && e.data.type === "THEME_CHANGE") {
                const isDark = e.data.theme === "dark";
                tailwind.config.darkMode = 'class';
                
                // 1. O Tailwind depende estritamente da classe no <html>
                document.documentElement.classList.toggle("dark", isDark);
                
                // 2. Remova os estilos inline do body para não conflitar com as classes do Tailwind
                document.body.style.backgroundColor = ""; 
                document.body.style.color = "";

                // 3. Persistência local
                localStorage.setItem("cockpit_theme", e.data.theme);
            }
        });
    },

    checkWelcomeModal() {
        // Usa uma chave única para não conflitar com outros apps futuramente
        const hasShown = localStorage.getItem("intro_eisenhower_shown");
        if (!hasShown) {
            const modal = document.getElementById("welcomeModal");
            if (modal) modal.classList.remove("hidden");
        }
    },

    closeWelcomeModal() {
        const checkbox = document.getElementById("dontShowAgain");
        if (checkbox && checkbox.checked) {
            localStorage.setItem("intro_eisenhower_shown", "true");
        }
        
        const modal = document.getElementById("welcomeModal");
        if (modal) modal.classList.add("hidden");
    },

    loadData() {
        const data = localStorage.getItem("cockpit_eisenhower");
        this.tasks = data ? JSON.parse(data) : [];
    },

    saveData() {
        localStorage.setItem("cockpit_eisenhower", JSON.stringify(this.tasks));
        this.updateStats();
    },

calculateDynamicQuadrant(deadlineValue, isStrategic, isCritical, isExclusive) {
        // 1. Determina se há urgência temporal ou operacional
        let isUrgent = isCritical;

        if (deadlineValue) {
            const today = new Date();
            const deadline = new Date(deadlineValue + "T23:59:59");
            const diffInDays = (deadline - today) / (1000 * 60 * 60 * 24);
            
            // Regra SAEB: Prazos regulamentares ou operacionais de 2 dias forçam urgência
            if (diffInDays <= 2) isUrgent = true;
        }

        // 2. Classificação Pura baseada na Matriz de Matiz Estratégica
        // Importante e Urgente -> Q1 (Fazer Agora)
        if (isStrategic && isUrgent) return 1;
        
        // Importante e Não Urgente -> Q2 (Planejar/Agendar)
        if (isStrategic && !isUrgent) return 2;
        
        // Não Importante (para as suas metas diretas) e Urgente -> Q3 (Delegar/Operacional)
        if (!isStrategic && isUrgent) return 3;
        
        // Não Importante e Não Urgente -> Q4 (Eliminar/Postergar)
        return 4;
    },

    refreshQuadrants() {
        this.tasks = this.tasks.map(task => ({
            ...task,
            quadrant: this.calculateDynamicQuadrant(task.deadline, task.isStrategic, task.isCritical || false, task.isExclusive)
        }));
        this.saveData();
    },

    editTask(id) {
        const task = this.tasks.find(t => t.id === id);
        if (!task) return;

        // Preenche o formulário com os dados atuais da tarefa
        document.getElementById("editingTaskId").value = task.id;
        document.getElementById("taskTitle").value = task.title;
        document.getElementById("taskDeadline").value = task.deadline || "";
        document.getElementById("taskEstimate").value = task.estimate || "";
        document.getElementById("impact_goal").checked = task.isStrategic;
        document.getElementById("is_critical").checked = task.isCritical || false;
        document.getElementById("only_me").checked = task.isExclusive;
        document.getElementById("delegateName").value = task.delegateName || "";
        document.getElementById("taskNote").value = task.notes || "";

        // Gerencia visibilidade do campo de delegação
        document.getElementById("delegateField").classList.toggle("hidden", task.isExclusive);

        // Altera o título do modal visualmente para o usuário saber que está editando
        const modalTitle = document.querySelector("#taskModal h3");
        if (modalTitle) modalTitle.textContent = "Editar Atividade";

        this.openModal();
    },

    saveTask() {
        const editingId = document.getElementById("editingTaskId").value;
        const title = document.getElementById("taskTitle").value.trim();
        const deadline = document.getElementById("taskDeadline").value;
        const estimate = document.getElementById("taskEstimate").value;
        const isStrategic = document.getElementById("impact_goal").checked;
        const isCritical = document.getElementById("is_critical").checked;
        const isExclusive = document.getElementById("only_me").checked;
        const delegateName = document.getElementById("delegateName").value.trim();
        const notes = document.getElementById("taskNote").value.trim();

        if (!title) {
            document.getElementById("taskTitle").focus();
            return this.showToast("Por favor, insira a descrição da atividade.", "warning");
        }

        const quadrant = this.calculateDynamicQuadrant(deadline, isStrategic, isCritical, isExclusive);

        if (editingId) {
            // Modo Edição: Atualiza a tarefa existente na memória
            this.tasks = this.tasks.map(task => {
                if (task.id === parseInt(editingId)) {
                    return {
                        ...task,
                        title: title.toUpperCase(),
                        deadline,
                        estimate,
                        isStrategic,
                        isCritical,
                        isExclusive,
                        delegateName: isExclusive ? "" : delegateName,
                        quadrant,
                        notes
                    };
                }
                return task;
            });
        } else {
            // Modo Criação: Cria uma nova entrada
            const task = {
                id: Date.now(),
                title: title.toUpperCase(),
                deadline,
                estimate,
                isStrategic,
                isCritical,
                isExclusive,
                delegateName: isExclusive ? "" : delegateName,
                quadrant,
                completed: false,
                notes: notes,
                createdAt: new Date().toISOString()
            };
            this.tasks.push(task);
        }

        this.saveData();
        this.render();
        this.closeModal();
    },

    resetForm() { 
        // 1. Limpa o ID de edição (Crucial para separar Edição de Criação)
        document.getElementById("editingTaskId").value = "";
        
        // 2. Limpa os campos de texto e data
        document.getElementById("taskTitle").value = "";
        document.getElementById("taskDeadline").value = "";
        document.getElementById("taskEstimate").value = "";
        document.getElementById("delegateName").value = "";
        document.getElementById("taskNote").value = "";
        
        // 3. Reseta os checkboxes para o padrão
        document.getElementById("impact_goal").checked = false;
        document.getElementById("is_critical").checked = false;
        document.getElementById("only_me").checked = true;
        
        // 4. Esconde o campo de delegação
        document.getElementById("delegateField").classList.add("hidden");
        
        // 5. Restaura o título do modal para o padrão
        const modalTitle = document.querySelector("#taskModal h3");
        if (modalTitle) modalTitle.textContent = "Análise de Prioridade";
    },

    getDeadlineBadge(deadlineValue) {
        if (!deadlineValue) return '';

        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const deadline = new Date(deadlineValue + "T00:00:00");
        const diffDays = Math.round((deadline - today) / (1000 * 60 * 60 * 24));

        if (diffDays < 0)  return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 uppercase tracking-wide">⚠ Atrasada</span>`;
        if (diffDays === 0) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-red-500 text-white uppercase tracking-wide animate-pulse">🔥 Hoje</span>`;
        if (diffDays === 1) return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-orange-100 dark:bg-orange-900/40 text-orange-600 dark:text-orange-400 uppercase tracking-wide">⏰ Amanhã</span>`;
        if (diffDays <= 3)  return `<span class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-yellow-100 dark:bg-yellow-900/40 text-yellow-700 dark:text-yellow-400 uppercase tracking-wide">📌 ${diffDays}d</span>`;
        return '';
    },

    renderFocusPanel() {
        const panel = document.getElementById("focus-panel");
        if (!panel) return;

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const active = this.tasks.filter(t => !t.completed);

        // Tarefas críticas: Q1 + Q2 com prazo <= 3 dias ou sem prazo mas Q1
        const overdue = active.filter(t => {
            if (!t.deadline) return false;
            const d = new Date(t.deadline + "T00:00:00");
            return d < today;
        });

        const dueToday = active.filter(t => {
            if (!t.deadline) return false;
            const d = new Date(t.deadline + "T00:00:00");
            return Math.round((d - today) / 86400000) === 0;
        });

        const focusTasks = active
            .filter(t => (t.quadrant === 1 || t.quadrant === 2))
            .sort((a, b) => {
                const da = a.deadline ? new Date(a.deadline) : new Date("9999-12-31");
                const db = b.deadline ? new Date(b.deadline) : new Date("9999-12-31");
                return da - db;
            })
            .slice(0, 4);

        // Não exibir painel se não há nada relevante
        if (active.length === 0) {
            panel.innerHTML = `<p class="text-xs text-gray-400 dark:text-slate-500 italic px-1">Nenhuma tarefa cadastrada ainda.</p>`;
            panel.classList.remove("hidden");
            return;
        }

        const totalHours = focusTasks.reduce((s, t) => s + (parseFloat(t.estimate) || 0), 0);

        const overdueHtml = overdue.length > 0
            ? `<span class="text-[10px] font-bold bg-red-100 dark:bg-red-900/40 text-red-600 dark:text-red-400 px-2 py-0.5 rounded-full">⚠ ${overdue.length} atrasada${overdue.length > 1 ? 's' : ''}</span>`
            : '';

        const dueTodayHtml = dueToday.length > 0
            ? `<span class="text-[10px] font-bold bg-orange-100 dark:bg-orange-900/30 text-orange-600 dark:text-orange-400 px-2 py-0.5 rounded-full">🔥 ${dueToday.length} vence hoje</span>`
            : '';

        const taskPills = focusTasks.map(t => {
            const diffDays = t.deadline ? Math.round((new Date(t.deadline + "T00:00:00") - today) / 86400000) : null;
            const isLate = diffDays !== null && diffDays < 0;
            const accent = t.quadrant === 1
                ? "border-red-400 dark:border-red-600"
                : "border-blue-400 dark:border-blue-600";
            const titleColor = t.quadrant === 1
                ? "text-red-600 dark:text-red-400"
                : "text-blue-600 dark:text-blue-400";
            const dateLabel = diffDays === null ? '' :
                isLate ? `<span class="text-[9px] text-red-500 font-bold">atrasada</span>` :
                diffDays === 0 ? `<span class="text-[9px] text-red-500 font-bold">hoje</span>` :
                diffDays === 1 ? `<span class="text-[9px] text-orange-500">amanhã</span>` :
                `<span class="text-[9px] text-gray-400">${t.deadline.split('-').reverse().join('/')}</span>`;

            return `<div class="flex items-center gap-2 bg-white dark:bg-slate-800 border-l-2 ${accent} rounded px-2 py-1.5 min-w-0 flex-1 basis-40">
                <div class="flex-1 min-w-0">
                    <p class="text-[10px] font-bold ${titleColor} truncate leading-tight">${t.title}</p>
                    <div class="flex gap-1.5 mt-0.5 items-center">${dateLabel}<span class="text-[9px] text-gray-400">⏱ ${t.estimate || '?'}h</span></div>
                </div>
            </div>`;
        }).join('');

        const hoursLabel = totalHours > 0 ? `<span class="text-[10px] text-gray-400 dark:text-slate-500">~${totalHours}h de foco</span>` : '';

        panel.innerHTML = `
            <div class="flex items-center justify-between mb-2 flex-wrap gap-2">
                <div class="flex items-center gap-2 flex-wrap">
                    <span class="text-[10px] font-bold uppercase tracking-wider text-gray-500 dark:text-slate-400">☀ Foco de Hoje</span>
                    ${overdueHtml}${dueTodayHtml}
                </div>
                ${hoursLabel}
            </div>
            <div class="flex gap-2 flex-wrap">
                ${focusTasks.length > 0 ? taskPills : '<p class="text-[10px] text-gray-400 italic">Sem tarefas Q1/Q2 pendentes. Bom trabalho!</p>'}
            </div>
        `;
        panel.classList.remove("hidden");
    },

    render() {
            // 1. Limpa os quadrantes antes de renderizar
            [1, 2, 3, 4].forEach(q => document.getElementById(`q${q}-list`).innerHTML = "");

            // 2. Filtra apenas as tarefas NÃO concluídas para a matriz
            this.tasks.filter(t => !t.completed).forEach(task => {
                const container = document.getElementById(`q${task.quadrant}-list`);
                const div = document.createElement("div");
                
                // Adicionado atributos de Drag nativo e cursor de movimento
                div.className = "bg-white dark:bg-slate-800 p-3 rounded border dark:border-slate-700 shadow-sm flex flex-col gap-1 group animate-in slide-in-from-left duration-200 cursor-grab active:cursor-grabbing hover:border-blue-400 dark:hover:border-blue-500 transition-colors";
                div.setAttribute("draggable", "true");
                div.addEventListener("dragstart", (e) => this.handleDragStart(e, task.id));
                div.addEventListener("dragend", (e) => this.handleDragEnd(e));
                
                const dataFormatada = task.deadline ? task.deadline.split('-').reverse().join('/') : 'S/ DATA';
                const urgencyBadge = this.getDeadlineBadge(task.deadline);
                
                div.innerHTML = `
                    <div class="flex justify-between items-start gap-2" draggable="false">
                            <input type="checkbox" onclick="app.toggleComplete(${task.id})" class="mt-1 cursor-pointer w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                            <div class="flex-1 overflow-hidden" draggable="false">
                                <div class="flex justify-between items-start" draggable="false">
                                    <span class="text-xs font-bold ${task.quadrant === 1 ? 'text-red-500' : ''} truncate pr-2">${task.title}</span>
                                    <div class="flex gap-2 shrink-0">
                                        <button onclick="app.editTask(${task.id})" class="text-gray-400 hover:text-blue-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✏️</button>
                                        <button onclick="app.deleteTask(${task.id})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity text-xs">✕</button>
                                    </div>
                                </div>
                                
                                <div class="flex flex-wrap gap-2 mt-1 items-center" draggable="false">
                                    <span class="text-[9px] bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-100 font-bold">⏱️ ${task.estimate || '?'}h</span>
                                    <span class="text-[9px] bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-100 font-mono">📅 ${dataFormatada}</span>
                                    ${urgencyBadge}
                                </div>

                                ${task.delegateName ? `<div class="text-[9px] text-yellow-600 font-bold mt-1 uppercase italic">👤 Encaminhado: ${task.delegateName}</div>` : ''}

                                ${task.notes ? `
                                    <details class="mt-2 text-[10px] text-gray-600 dark:text-gray-400 border-t dark:border-slate-700 pt-1" draggable="false">
                                        <summary class="cursor-pointer hover:text-blue-500 font-semibold outline-none">Ver detalhes</summary>
                                        <p class="mt-1 whitespace-pre-wrap leading-relaxed bg-gray-50 dark:bg-slate-900/50 p-1.5 rounded">${task.notes}</p>
                                    </details>
                                ` : ''}
                        </div>
                    </div>
                `;
                
                container.appendChild(div);
            });

            this.updateStats();
            this.renderFocusPanel();
    },

    deleteTask(id) {
        this.tasks = this.tasks.filter(t => t.id !== id);
        this.saveData();
        this.render();
    },

    updateStats() {
        const total = this.tasks.length;
        if (total === 0) {
            document.getElementById("q1-percent").textContent = "0%";
            document.getElementById("q2-percent").textContent = "0%";
            return;
        }
        const q1 = this.tasks.filter(t => t.quadrant === 1).length;
        const q2 = this.tasks.filter(t => t.quadrant === 2).length;
        document.getElementById("q1-percent").textContent = Math.round((q1/total)*100) + "%";
        document.getElementById("q2-percent").textContent = Math.round((q2/total)*100) + "%";
    },

    exportBackup() {
        const dataStr = JSON.stringify(this.tasks, null, 2);
        const blob = new Blob([dataStr], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `backup_saeb_eisenhower_${new Date().toISOString().split('T')[0]}.json`;
        a.click();
    },

    importBackup(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.tasks = JSON.parse(e.target.result);
                this.saveData();
                this.refreshQuadrants();
                this.render();
                this.showToast("Backup da SAEB restaurado com sucesso!", "success");
            } catch (err) { 
                this.showToast("Arquivo inválido ou corrompido.", "error"); 
                        }
        };
        reader.readAsText(file);
    },

    openModal() { 
        document.getElementById("taskModal").classList.remove("hidden"); 
        document.getElementById("taskTitle").focus(); 
    },

    closeModal() { 
        document.getElementById("taskModal").classList.add("hidden"); 
        this.resetForm(); 
    },


    toggleComplete(id) {
    this.tasks = this.tasks.map(task => 
        task.id === id ? { ...task, completed: !task.completed } : task
    );
    this.saveData();
    this.render();
    },

    openHistory() {
        document.getElementById("historyModal").classList.remove("hidden");
        this.renderHistory();
    },

    closeHistory() {
        document.getElementById("historyModal").classList.add("hidden");
    },

    renderHistory() {
        const historyList = document.getElementById("history-list");
        historyList.innerHTML = "";
        
        const completedTasks = this.tasks.filter(t => t.completed);
        
        if (completedTasks.length === 0) {
            historyList.innerHTML = "<p class='text-center text-gray-500 py-4'>Nenhuma tarefa concluída ainda.</p>";
            return;
        }

        completedTasks.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).forEach(task => {
            const div = document.createElement("div");
            div.className = "p-3 border-b dark:border-slate-700 flex justify-between items-center";
            div.innerHTML = `
                <div>
                    <p class="text-sm font-bold line-through text-gray-500">${task.title}</p>
                    <p class="text-[9px] text-gray-400">Criada em: ${new Date(task.createdAt).toLocaleDateString('pt-BR')}</p>
                </div>
                <button onclick="app.deleteTask(${task.id})" class="text-red-400 hover:text-red-600 text-xs">Excluir</button>
            `;
            historyList.appendChild(div);
        });
    },

    handleDragStart(e, taskId) {
        e.dataTransfer.setData("text/plain", taskId);
        // Pequeno delay para efeito visual de ghost do elemento arrastado
        setTimeout(() => e.target.classList.add("opacity-40"), 0);
    },

    handleDragEnd(e) {
        e.target.classList.remove("opacity-40");
    },

    handleDragOver(e) {
        e.preventDefault();
        // Adiciona uma pista visual de drop na seção do quadrante alvo
        const quadrantElement = e.currentTarget;
        quadrantElement.classList.add("border-dashed", "scale-[1.01]", "transition-transform");
    },

    handleDragLeave(e) {
        const quadrantElement = e.currentTarget;
        quadrantElement.classList.remove("border-dashed", "scale-[1.01]");
    },

    handleDrop(e, targetQuadrant) {
        e.preventDefault();
        const quadrantElement = e.currentTarget;
        quadrantElement.classList.remove("border-dashed", "scale-[1.01]");

        const taskId = parseInt(e.dataTransfer.getData("text/plain"));
        const task = this.tasks.find(t => t.id === taskId);
        
        if (task && task.quadrant !== targetQuadrant) {
            task.quadrant = targetQuadrant;
            
            // Regra reversa adaptativa: ajusta os parâmetros booleanos baseando-se no quadrante onde caiu
            switch (targetQuadrant) {
                case 1: // Crítico
                    task.isStrategic = true;
                    task.isCritical = true;
                    break;
                case 2: // Estratégico
                    task.isStrategic = true;
                    task.isCritical = false;
                    break;
                case 3: // Operacional / Delegar
                    task.isStrategic = false;
                    task.isCritical = true;
                    break;
                case 4: // Distração
                    task.isStrategic = false;
                    task.isCritical = false;
                    break;
            }
            
            this.saveData();
            this.render();
        }
    },

    showToast(message, type = 'error') {
        // Remove toasts anteriores para não empilhar vários
        const existingToast = document.getElementById('cockpit-toast');
        if (existingToast) existingToast.remove();

        const toast = document.createElement('div');
        toast.id = 'cockpit-toast';
        
        // Define as cores do Tailwind com base no tipo de aviso
        const bgColors = {
            success: 'bg-green-600 dark:bg-green-500',
            warning: 'bg-yellow-500 dark:bg-yellow-600',
            error: 'bg-red-600 dark:bg-red-500'
        };

        const colorClass = bgColors[type] || bgColors.error;

        // Estilização base com Tailwind (fixo no canto inferior direito, animação de entrada)
        toast.className = `fixed bottom-6 right-6 text-white px-6 py-3 rounded shadow-2xl z-[100] font-medium text-sm flex items-center gap-2 transform transition-all duration-300 translate-y-10 opacity-0 ${colorClass}`;
        
        // Ícone simples baseado no tipo
        const icon = type === 'success' ? '✅' : type === 'warning' ? '⚠️' : '❌';
        toast.innerHTML = `<span>${icon}</span> <span>${message}</span>`;

        document.body.appendChild(toast);

        // Dispara a animação de entrada (slide up e fade in)
        requestAnimationFrame(() => {
            toast.classList.remove('translate-y-10', 'opacity-0');
        });

        // Remove o toast após 3 segundos
        setTimeout(() => {
            toast.classList.add('opacity-0', 'translate-y-2');
            setTimeout(() => toast.remove(), 300); // Aguarda a transição terminar
        }, 3000);
    },
};

app.init();