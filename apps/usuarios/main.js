import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://whnzeysvqbtuecxmthht.supabase.co';
const supabaseKey = 'sb_publishable_Gw4cFK56R9kms2ogg50UqA_ZhHi79qw';

// Inicializa o banco de dados direto neste arquivo
const supabase = createClient(supabaseUrl, supabaseKey);

const app = {
    theme: 'light',
    cropperInstance: null, // Guarda a ferramenta de recorte
    croppedBlob: null,     // Guarda a imagem final comprimida
    currentFileInputId: null, // Sabe se veio de 'newAvatar' ou 'editAvatar'

    async init() {
        this.loadTheme();
        this.setupGlobalEvents();
        await this.carregarUsuarios();
    },

    loadTheme() {
        this.theme = localStorage.getItem("cockpit_theme") || "light";
        document.documentElement.classList.toggle("dark", this.theme === "dark");
    },

    setupGlobalEvents() {
        window.addEventListener("message", (e) => {
            if (e.data && e.data.type === "THEME_CHANGE") {
                this.theme = e.data.theme;
                localStorage.setItem('cockpit_theme', this.theme);
                document.documentElement.classList.toggle("dark", this.theme === "dark");
            }
        });

        document.getElementById('newAvatar').addEventListener('change', (e) => this.iniciarRecorte(e, 'newAvatar'));
        document.getElementById('editAvatar').addEventListener('change', (e) => this.iniciarRecorte(e, 'editAvatar'));
    },

    // FUNÇÃO AUXILIAR: UPLOAD DE IMAGEM
    async uploadAvatar() {
        // Se não houver imagem recortada na memória, não faz nada
        if (!this.croppedBlob) return null;

        // Gera um nome único forçando a extensão .jpg
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
        const filePath = `avatares/${fileName}`; 

        try {
            const { error: uploadError } = await supabase.storage
                .from('avatars')
                .upload(filePath, this.croppedBlob, {
                    contentType: 'image/jpeg' // Diz ao Supabase que é uma imagem
                });

            if (uploadError) throw uploadError;

            // Retorna a URL pública gerada
            const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
            
            // Limpa a memória após o upload
            this.croppedBlob = null; 
            
            return data.publicUrl;
        } catch (error) {
            console.error("Erro no upload:", error);
            this.showToast("Falha ao carregar a imagem.", "error");
            return null;
        }
    },

    // 1. LISTAR USUÁRIOS
    async carregarUsuarios() {
        const tbody = document.getElementById('userTableBody');
        tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500">Carregando...</td></tr>';
        
        const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });

        if (error) {
            this.showToast("Erro ao carregar: " + error.message, "error");
            return;
        }

        if (data.length === 0) {
            tbody.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500">Nenhum usuário encontrado.</td></tr>';
            return;
        }

        // Avatar Padrão (Silhueta) se não houver foto
        const defaultAvatar = 'https://ui-avatars.com/api/?background=cbd5e1&color=475569&name=';

        tbody.innerHTML = data.map(u => `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${u.status === 'inativo' ? 'opacity-60 bg-red-50 dark:bg-red-900/10' : ''}">
                <td class="p-4 flex items-center gap-3">
                    <img src="${u.avatar_url || defaultAvatar + (u.name || 'U')}" class="w-10 h-10 rounded-full object-cover shadow-sm border border-slate-200 dark:border-slate-700">
                    <span class="text-slate-800 dark:text-slate-200 font-bold">${u.name || 'Sem nome'}</span>
                </td>
                
                <td class="p-4 text-slate-600 dark:text-slate-400 font-medium">
                    ${u.email || '<span class="text-xs opacity-50 italic">Sem e-mail</span>'}
                </td>
                
                <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${u.role === 'admin' ? 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400' : 'bg-slate-200 text-slate-600 dark:bg-slate-800 dark:text-slate-400'}">
                        ${u.role}
                    </span>
                </td>

                <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${u.status === 'inativo' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}">
                        ${u.status === 'inativo' ? 'Inativo' : 'Ativo'}
                    </span>
                </td>

                <td class="p-4 text-right">
                <!-- Botão Editar -->
                <button onclick="app.abrirEdicao('${u.id}', '${u.name}', '${u.email}', '${u.role}')"
                    class="text-blue-500 hover:text-blue-700 mr-3"
                    title="Editar Usuário">

                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"
                        xmlns="http://www.w3.org/2000/svg">
                        <path d="M12 3C7.74882 3 5.62323 3 4.30256 4.31802C3.298 5.32056 3.05755 6.78787 3 9.3M21 9.3C20.9424 6.78787 20.702 5.32056 19.6974 4.31802C18.8789 3.50116 17.7513 3.19056 16 3.07246M21 14.7C20.9424 17.2121 20.702 18.6794 19.6974 19.682C18.3768 21 16.2512 21 12 21C7.74882 21 5.62323 21 4.30256 19.682C3.29801 18.6794 3.05756 17.2121 3 14.7"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M8 8H16"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M12 16L12 8"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M22 12H20"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        <path d="M4 12H2"
                            stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                    </svg>

                </button>

                <!-- Botão Ativar/Inativar -->
                <button onclick="app.alternarStatus('${u.id}', '${u.status || 'ativo'}')"
                    class="${u.status === 'inativo' ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'}"
                    title="${u.status === 'inativo' ? 'Ativar Usuário' : 'Inativar Usuário'}">
                        ${u.status === 'inativo'
                            ? `
                        <!-- Play (Ativar) -->
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path d="M3 12L3 18.9671C3 21.2763 5.53435 22.736 7.59662 21.6145L10.7996 19.8727M3 8L3 5.0329C3 2.72368 5.53435 1.26402 7.59661 2.38548L20.4086 9.35258C22.5305 10.5065 22.5305 13.4935 20.4086 14.6474L14.0026 18.131"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"/>
                        </svg>
                        `
                        : `
                        <!-- Pause (Inativar) -->
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none"
                            xmlns="http://www.w3.org/2000/svg">
                            <path d="M2 18C2 19.8856 2 20.8284 2.58579 21.4142C3.17157 22 4.11438 22 6 22C7.88562 22 8.82843 22 9.41421 21.4142C10 20.8284 10 19.8856 10 18V6C10 4.11438 10 3.17157 9.41421 2.58579C8.82843 2 7.88562 2 6 2C4.11438 2 3.17157 2 2.58579 2.58579C2 3.17157 2 4.11438 2 6V14"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"/>
                            <path d="M22 6C22 4.11438 22 3.17157 21.4142 2.58579C20.8284 2 19.8856 2 18 2C16.1144 2 15.1716 2 14.5858 2.58579C14 3.17157 14 4.11438 14 6V18C14 19.8856 14 20.8284 14.5858 21.4142C15.1716 22 16.1144 22 18 22C19.8856 22 20.8284 22 21.4142 21.4142C22 20.8284 22 19.8856 22 18V10"
                                stroke="currentColor"
                                stroke-width="1.5"
                                stroke-linecap="round"/>
                        </svg>
                        `
                    }

                </button>
                </td>
            </tr>
        `).join('');
    },

    // 3. ABRIR MODAL DE EDIÇÃO
    abrirEdicao(id, name, email, role) {
        document.getElementById('editId').value = id;
        document.getElementById('editName').value = name;
        document.getElementById('editEmail').value = email !== 'undefined' ? email : '';
        document.getElementById('editRole').value = role;
        document.getElementById('editPass').value = '';
        document.getElementById('editAvatar').value = ''; // Limpa o input de arquivo
        document.getElementById('editModal').classList.remove('hidden');
    },

    async salvarEdicao() {
        const btn = document.getElementById('btnUpdateUser');
        const id = document.getElementById('editId').value;
        const name = document.getElementById('editName').value.trim();
        const email = document.getElementById('editEmail').value.trim();
        const role = document.getElementById('editRole').value;
        const password = document.getElementById('editPass').value.trim();

        btn.disabled = true;
        btn.textContent = "Atualizando...";

        try {
            const avatarUrl = await this.uploadAvatar('editAvatar');

            const payload = { 
                acao: 'editar', 
                idUsuario: id, 
                email: email !== '' ? email : undefined,
                metadata: { name: name, role: role } 
            };

            if (avatarUrl) payload.avatar_url = avatarUrl;
            if (password !== '') payload.password = password;

            const { error } = await supabase.functions.invoke('gerenciar-usuarios', { body: payload });

            if (error) throw error;

            this.showToast("Usuário atualizado com sucesso!");
            document.getElementById('editModal').classList.add('hidden');
            await this.carregarUsuarios(); 
        } catch (err) {
            this.showToast("Erro: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Atualizar";
        }
    },

    // 5. INATIVAR / ATIVAR USUÁRIO
    async alternarStatus(id, statusAtual) {
        const novoStatus = statusAtual === 'ativo' ? 'inativo' : 'ativo';
        const acaoTexto = novoStatus === 'inativo' ? 'bloquear o acesso de' : 'liberar o acesso de';
        const modal = document.getElementById('confirmStatusModal');
        const content = document.getElementById('confirmStatusContent');
        const btnConfirm = document.getElementById('btnConfirmAction');
        const iconDiv = document.getElementById('confirmIcon');
        
        // Estiliza de acordo com a ação (Vermelho para inativar, Verde para ativar)
        if (novoStatus === 'inativo') {
            document.getElementById('confirmTitle').textContent = "Bloquear Usuário?";
            iconDiv.className = "w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4";
            iconDiv.innerHTML = '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
            btnConfirm.className = "flex-1 px-4 py-2 font-medium rounded-lg text-white shadow-md transition-colors bg-red-600 hover:bg-red-700 shadow-red-500/30";
            btnConfirm.textContent = "Sim, Bloquear";
        } else {
            document.getElementById('confirmTitle').textContent = "Liberar Usuário?";
            iconDiv.className = "w-14 h-14 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-4";
            iconDiv.innerHTML = '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
            btnConfirm.className = "flex-1 px-4 py-2 font-medium rounded-lg text-white shadow-md transition-colors bg-green-600 hover:bg-green-700 shadow-green-500/30";
            btnConfirm.textContent = "Sim, Liberar";
        }

        document.getElementById('confirmMessage').textContent = `Tem certeza que deseja ${acaoTexto} este usuário?`;

        // Atrela a execução real ao botão de confirmar do Modal
        btnConfirm.onclick = async () => {
            btnConfirm.textContent = "Aguarde...";
            btnConfirm.disabled = true;
            try {
                const { error } = await supabase.functions.invoke('gerenciar-usuarios', {
                    body: { acao: 'status', idUsuario: id, status: novoStatus }
                });

                if (error) throw error;

                this.showToast(`Usuário ${novoStatus === 'ativo' ? 'ativado' : 'inativado'} com sucesso!`);
                this.fecharConfirmacao();
                await this.carregarUsuarios(); 
            } catch (err) {
                this.fecharConfirmacao();
                this.showToast("Erro: " + err.message, "error");
            }
        };

        // Mostra o Modal
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);
    },

    fecharConfirmacao() {
        const modal = document.getElementById('confirmStatusModal');
        const content = document.getElementById('confirmStatusContent');
        
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
        }, 300);
    },

    // 2. ADICIONAR USUÁRIO
    async salvarUsuario() {
        const btn = document.getElementById('btnSaveUser');
        const name = document.getElementById('newName').value.trim();
        const email = document.getElementById('newEmail').value.trim();
        const password = document.getElementById('newPass').value.trim();
        const role = document.getElementById('newRole').value;

        if (!name || !email || !password) {
            this.showToast("Preencha o nome, e-mail e senha!", "error");
            return;
        }

        btn.disabled = true;
        btn.textContent = "Salvando...";

        try {
            // Faz o upload da imagem e pega a URL (se houver arquivo selecionado)
            const avatarUrl = await this.uploadAvatar('newAvatar');

            const { error } = await supabase.functions.invoke('gerenciar-usuarios', {
                body: { acao: 'criar', email, password, avatar_url: avatarUrl, metadata: { role: role, name: name } }
            });

            if (error) throw error;

            this.showToast("Usuário criado com sucesso!");
            document.getElementById('modal').classList.add('hidden');
            
            // Limpa os campos
            document.getElementById('newName').value = '';
            document.getElementById('newEmail').value = '';
            document.getElementById('newPass').value = '';
            document.getElementById('newAvatar').value = '';
            
            await this.carregarUsuarios();
        } catch (err) {
            this.showToast("Erro: " + err.message, "error");
        } finally {
            btn.disabled = false;
            btn.textContent = "Salvar";
        }
    },

    showToast(msg, type = "success") {
        const toast = document.createElement('div');
        toast.className = `fixed bottom-10 left-1/2 -translate-x-1/2 px-8 py-4 rounded-[1.5rem] text-xs font-black uppercase tracking-widest shadow-2xl z-[100] transition-all ${type === 'success' ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900' : 'bg-red-600 text-white'}`;
        toast.innerText = msg;
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
    },

    // --- FUNÇÕES DE RECORTE DE IMAGEM ---
    iniciarRecorte(event, inputId) {
        const file = event.target.files[0];
        if (!file) return;

        // Cria uma URL temporária para mostrar a imagem no modal
        const url = URL.createObjectURL(file);
        const imageElement = document.getElementById('imageToCrop');
        imageElement.src = url;

        this.currentFileInputId = inputId;
        document.getElementById('cropperModal').classList.remove('hidden');

        // Se já existia um cropper antes, destroi para criar um novo limpo
        if (this.cropperInstance) {
            this.cropperInstance.destroy();
        }

        // Inicializa o Cropper.js forçando o formato quadrado (1:1)
        this.cropperInstance = new Cropper(imageElement, {
            aspectRatio: 1, 
            viewMode: 1,    // Restringe o corte para dentro da imagem
            dragMode: 'move', // Permite arrastar a imagem
            autoCropArea: 1,
            guides: true,
            background: false
        });
    },

    cancelarRecorte() {
        document.getElementById('cropperModal').classList.add('hidden');
        if (this.currentFileInputId) {
            document.getElementById(this.currentFileInputId).value = ''; // Reseta o input
        }
        this.croppedBlob = null;
        if (this.cropperInstance) this.cropperInstance.destroy();
    },

    confirmarRecorte() {
        if (!this.cropperInstance) return;

        // Extrai a imagem cortada, forçando a redução para 400x400 pixels
        const canvas = this.cropperInstance.getCroppedCanvas({
            width: 400,
            height: 400,
            imageSmoothingEnabled: true,
            imageSmoothingQuality: 'high',
        });

        // Converte o canvas para um arquivo Blob (JPEG com 80% de qualidade - comprime muito e mantém a beleza!)
        canvas.toBlob((blob) => {
            this.croppedBlob = blob;
            document.getElementById('cropperModal').classList.add('hidden');
            this.showToast("Imagem recortada e otimizada!");
        }, 'image/jpeg', 0.8);
    },
};

// Como o script é um type="module", precisamos pendurar o app no window
// para que o HTML consiga enxergá-lo quando clicar no botão "onclick=app.salvarUsuario()"
window.app = app;

app.init();