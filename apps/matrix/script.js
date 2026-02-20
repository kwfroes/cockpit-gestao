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

    calculateDynamicQuadrant(deadlineValue, isStrategic, isExclusive) {
        if (!isExclusive) return 3;

        let isUrgent = false;
        if (deadlineValue) {
            const today = new Date();
            const deadline = new Date(deadlineValue + "T23:59:59"); // Garante o fim do dia
            const diffInDays = (deadline - today) / (1000 * 60 * 60 * 24);
            
            // Regra SAEB: Menos de 2 dias é urgente
            if (diffInDays <= 2) isUrgent = true;
        }

        if (isStrategic && isUrgent) return 1;
        if (isStrategic && !isUrgent) return 2;
        if (!isStrategic && isUrgent) return 3;
        return 4;
    },

    refreshQuadrants() {
        this.tasks = this.tasks.map(task => ({
            ...task,
            quadrant: this.calculateDynamicQuadrant(task.deadline, task.isStrategic, task.isExclusive)
        }));
        this.saveData();
    },

    saveTask() {
        const title = document.getElementById("taskTitle").value.trim();
        const deadline = document.getElementById("taskDeadline").value;
        const estimate = document.getElementById("taskEstimate").value;
        const isStrategic = document.getElementById("impact_goal").checked;
        const isExclusive = document.getElementById("only_me").checked;
        const delegateName = document.getElementById("delegateName").value;
        const notes = document.getElementById("taskNote").value.trim();

        if (!title) return alert("Digite o título da tarefa.");

        const quadrant = this.calculateDynamicQuadrant(deadline, isStrategic, isExclusive);

        const task = {
            id: Date.now(),
            title: title.toUpperCase(),
            deadline,
            estimate,
            isStrategic,
            isExclusive,
            delegateName: isExclusive ? "" : delegateName,
            quadrant,
            completed: false,
            notes: notes,
            createdAt: new Date().toISOString()
        };

        this.tasks.push(task);
        this.saveData();
        this.render();
        this.closeModal();
    },

    render() {
        // 1. Limpa os quadrantes antes de renderizar
        [1, 2, 3, 4].forEach(q => document.getElementById(`q${q}-list`).innerHTML = "");

        // 2. Filtra apenas as tarefas NÃO concluídas para a matriz
        this.tasks.filter(t => !t.completed).forEach(task => {
            const container = document.getElementById(`q${task.quadrant}-list`);
            const div = document.createElement("div");
            div.className = "bg-white dark:bg-slate-800 p-3 rounded border dark:border-slate-700 shadow-sm flex flex-col gap-1 group animate-in slide-in-from-left duration-200";
            
            const dataFormatada = task.deadline ? task.deadline.split('-').reverse().join('/') : 'S/ DATA';
            
            // Unificando o Checkbox com as informações de tempo e delegado
            div.innerHTML = `
                <div class="flex justify-between items-start gap-2">
                        <input type="checkbox" onclick="app.toggleComplete(${task.id})" class="mt-1 cursor-pointer w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500">
                        <div class="flex-1 overflow-hidden">
                            <div class="flex justify-between items-start">
                                <span class="text-xs font-bold ${task.quadrant === 1 ? 'text-red-500' : ''} truncate pr-2">${task.title}</span>
                                <button onclick="app.deleteTask(${task.id})" class="text-gray-400 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
                            </div>
                            
                            <div class="flex gap-2 mt-1">
                                <span class="text-[9px] bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-100 font-bold">⏱️ ${task.estimate || '?'}h</span>
                                <span class="text-[9px] bg-gray-100 dark:bg-slate-700 px-1.5 py-0.5 rounded text-gray-500 dark:text-gray-100 font-mono">📅 ${dataFormatada}</span>
                            </div>

                            ${task.delegateName ? `<div class="text-[9px] text-yellow-600 font-bold mt-1 uppercase italic">👤 Encaminhado: ${task.delegateName}</div>` : ''}

                            ${task.notes ? `
                                <details class="mt-2 text-[10px] text-gray-600 dark:text-gray-400 border-t dark:border-slate-700 pt-1">
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
                alert("Backup da SAEB restaurado!");
            } catch (err) { alert("Arquivo inválido."); }
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

    resetForm() { 
        document.getElementById("taskTitle").value = "";
        document.getElementById("taskDeadline").value = "";
        document.getElementById("taskEstimate").value = "";
        document.getElementById("impact_goal").checked = false;
        document.getElementById("only_me").checked = true;
        document.getElementById("delegateName").value = "";
        document.getElementById("taskNote").value = "";
        document.getElementById("delegateField").classList.add("hidden");
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
    }
};

app.init();