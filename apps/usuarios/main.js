var supabase = window.supabaseClient;

const app = {
    theme: 'light',
    cropperInstance: null, // Guarda a ferramenta de recorte
    croppedBlob: null,     // Guarda a imagem final comprimida
    currentFileInputId: null, // Sabe se veio de 'newAvatar' ou 'editAvatar'
    logsData: [],
    nomesDashboard: [],

    async init() {
        this.setupGlobalEvents();
        this.loadTheme();
        await this.carregarUsuarios();
        await this.carregarPendentes();
    },

    loadTheme() {
    this.theme = localStorage.getItem("cockpit_theme") || "light";
    if (this.theme === "dark") {
        document.documentElement.classList.add("dark");
    } else {
        document.documentElement.classList.remove("dark");
    }
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

    // --- LÓGICA DE HIERARQUIA SRL ---
    hierarquiaData: null,

    async carregarHierarquia() {
        if (!this.hierarquiaData) {
            const res = await fetch('../../assets/json/hierarquia_srl.json');
            this.hierarquiaData = await res.json();
        }
        return this.hierarquiaData;
    },

    async popularDiretorias(pref) {
        const data = await this.carregarHierarquia();
        const select = document.getElementById(`${pref}Diretoria`);
        select.innerHTML = '<option value="">Selecione...</option>';
        data.superintendencia.subordinados.forEach(d => {
            select.innerHTML += `<option value="${d.sigla}">${d.nome}</option>`;
        });
    },

    async filtrarCoordenacoes(pref) {
        const data = await this.carregarHierarquia();
        const dirSigla = document.getElementById(`${pref}Diretoria`).value;
        const coordSelect = document.getElementById(`${pref}Coordenacao`);
        
        coordSelect.innerHTML = '<option value="">Selecione...</option>';
        coordSelect.disabled = !dirSigla;
        
        if (dirSigla) {
            const dir = data.superintendencia.subordinados.find(s => s.sigla === dirSigla);
            dir.subordinados.forEach(c => {
                coordSelect.innerHTML += `<option value="${c.sigla}">${c.nome}</option>`;
            });
        }
    },

    async filtrarSetores(pref) {
        const data = await this.carregarHierarquia();
        const dirSigla = document.getElementById(`${pref}Diretoria`).value;
        const coordSigla = document.getElementById(`${pref}Coordenacao`).value;
        const setorSelect = document.getElementById(`${pref}Setor`);
        
        setorSelect.innerHTML = '<option value="">Nenhum</option>';
        
        const dir = data.superintendencia.subordinados.find(s => s.sigla === dirSigla);
        const coord = dir.subordinados.find(c => c.sigla === coordSigla);
        
        if (coord && coord.subordinados) {
            coord.subordinados.forEach(s => {
                setorSelect.innerHTML += `<option value="${s.sigla}">${s.nome}</option>`;
            });
            setorSelect.disabled = false;
        } else {
            setorSelect.disabled = true;
        }
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

// 1. LISTAR USUÁRIOS E SEPARAR POR STATUS
    async carregarUsuarios() {
        const tbodyAtivos = document.getElementById('userTableBody');
        const tbodyInativos = document.getElementById('inativosTableBody');
                
        tbodyAtivos.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">Carregando...</td></tr>';
        if (tbodyInativos) tbodyInativos.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">Carregando...</td></tr>';
        
        const { data, error } = await supabase.from('profiles').select('*').order('name', { ascending: true });

        if (error) {
            this.showToast("Erro ao carregar: " + error.message, "error");
            return;
        }

        if (data.length === 0) {
            tbodyAtivos.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">Nenhum usuário encontrado no sistema.</td></tr>';
            if (tbodyInativos) tbodyInativos.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500">Nenhum usuário inativo encontrado.</td></tr>';
            return;
        }

        const defaultAvatar = 'https://ui-avatars.com/api/?background=cbd5e1&color=475569&name=';
        const meuEmail = sessionStorage.getItem("cockpit_user_email");

        // Separa os arrays
        const usuariosAtivos = data.filter(u => u.status !== 'inativo');
        const usuariosInativos = data.filter(u => u.status === 'inativo');

        // Função auxiliar para gerar as linhas da tabela (para não repetir código)
        const renderRow = (u) => {
            const appsJsonString = encodeURIComponent(JSON.stringify(u.allowed_apps || ["#home", "#demandas"]));
            const isMe = u.email === meuEmail;
            const isInativo = u.status === 'inativo';
            const coord = u.coordenacao || '-';
            const safeCoord = encodeURIComponent(u.coordenacao || '');
            const isResp = u.responsavel ? 'true' : 'false';
            const safeUserDash = encodeURIComponent(u.user_dash || '');

            // Define a cor da badge mantendo a coesão com as colunas de Cargo e Status
            const coordBadgeClass = u.responsavel 
                ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' 
                : 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400';

            return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors ${isInativo ? 'opacity-70 bg-gray-50 dark:bg-slate-800/30' : ''}">
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
                    ${coord !== '-' 
                        ? `<span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider cursor-default ${coordBadgeClass}" title="${u.responsavel ? 'Responsável pela Coordenação' : 'Membro da Equipe'}">
                            ${coord}
                        </span>`
                        : `<span class="text-slate-400 dark:text-slate-600 text-xs">-</span>`
                    }
                </td>
                <td class="p-4 text-center">
                    <span class="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${isInativo ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'}">
                        ${isInativo ? 'Inativo' : 'Ativo'}
                    </span>
                </td>
                <td class="p-4 text-right">
                    <button onclick="app.abrirEdicao('${u.id}', '${u.name}', '${u.email}', '${u.role}', '${appsJsonString}', '${safeCoord}', ${isResp}, '${safeUserDash}')"
                        class="text-blue-500 hover:text-blue-700 mr-3" title="Editar Usuário">
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M12 3C7.74882 3 5.62323 3 4.30256 4.31802C3.298 5.32056 3.05755 6.78787 3 9.3M21 9.3C20.9424 6.78787 20.702 5.32056 19.6974 4.31802C18.8789 3.50116 17.7513 3.19056 16 3.07246M21 14.7C20.9424 17.2121 20.702 18.6794 19.6974 19.682C18.3768 21 16.2512 21 12 21C7.74882 21 5.62323 21 4.30256 19.682C3.29801 18.6794 3.05756 17.2121 3 14.7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <path d="M8 8H16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <path d="M12 16L12 8" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <path d="M22 12H20" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <path d="M4 12H2" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>
                    </button>

                    <button onclick="${isMe ? `app.showToast('Segurança: Você não pode alterar o seu próprio status.', 'error')` : `app.alternarStatus('${u.id}', '${u.status || 'ativo'}')`}"
                        class="${isInativo ? 'text-green-500 hover:text-green-700' : 'text-red-500 hover:text-red-700'} ${isMe ? 'opacity-30 cursor-not-allowed' : ''}"
                        title="${isMe ? 'Proteção de Conta Ativa' : (isInativo ? 'Ativar Usuário' : 'Inativar Usuário')}">
                            ${isInativo 
                                ? `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M3 12L3 18.9671C3 21.2763 5.53435 22.736 7.59662 21.6145L10.7996 19.8727M3 8L3 5.0329C3 2.72368 5.53435 1.26402 7.59661 2.38548L20.4086 9.35258C22.5305 10.5065 22.5305 13.4935 20.4086 14.6474L14.0026 18.131" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
                                : `<svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2 18C2 19.8856 2 20.8284 2.58579 21.4142C3.17157 22 4.11438 22 6 22C7.88562 22 8.82843 22 9.41421 21.4142C10 20.8284 10 19.8856 10 18V6C10 4.11438 10 3.17157 9.41421 2.58579C8.82843 2 7.88562 2 6 2C4.11438 2 3.17157 2 2.58579 2.58579C2 3.17157 2 4.11438 2 6V14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><path d="M22 6C22 4.11438 22 3.17157 21.4142 2.58579C20.8284 2 19.8856 2 18 2C16.1144 2 15.1716 2 14.5858 2.58579C14 3.17157 14 4.11438 14 6V18C14 19.8856 14 20.8284 14.5858 21.4142C15.1716 22 16.1144 22 18 22C19.8856 22 20.8284 22 21.4142 21.4142C22 20.8284 22 19.8856 22 18V10" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>`
                            }
                    </button>
                </td>
            </tr>
            `;
        };

        // Injeta os HTMLs
        if (usuariosAtivos.length > 0) {
            tbodyAtivos.innerHTML = usuariosAtivos.map(renderRow).join('');
        } else {
            tbodyAtivos.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500">Nenhum usuário ativo no momento.</td></tr>';
        }

        if (tbodyInativos) {
            if (usuariosInativos.length > 0) {
                tbodyInativos.innerHTML = usuariosInativos.map(renderRow).join('');
            } else {
                tbodyInativos.innerHTML = '<tr><td colspan="5" class="p-8 text-center text-slate-500">Nenhum usuário inativo. A base está limpa!</td></tr>';
            }
        }
    },
    
    // 3. ABRIR MODAL DE EDIÇÃO
    async abrirEdicao(id, name, email, role, encodedApps, encodedCoord, isResp, encodedUserDash) {
        document.getElementById('editId').value = id;
        document.getElementById('editName').value = name;
        document.getElementById('editEmail').value = email !== 'undefined' ? email : '';
        document.getElementById('editRole').value = role;
        
        // 1. Popular os dropdowns primeiro
        await this.popularDiretorias('edit');
        
        // 2. Extrair as variáveis encodadas (INCLUINDO O USER DASH)
        const coordCompleta = encodedCoord && encodedCoord !== 'undefined' ? decodeURIComponent(encodedCoord) : '';
        const userDashValue = encodedUserDash && encodedUserDash !== 'undefined' ? decodeURIComponent(encodedUserDash) : '';
        
        // Agora sim a variável existe e pode ser usada
        await this.popularSelectUserDash('editUserDash', userDashValue);
        
        const partes = coordCompleta.split('/');
        
        // 3. Preencher e disparar os filtros para carregar as opções
        if (partes.length >= 1) {
            document.getElementById('editDiretoria').value = partes[0];
            await this.filtrarCoordenacoes('edit');
        }
        if (partes.length >= 2) {
            document.getElementById('editCoordenacao').value = partes[1];
            await this.filtrarSetores('edit');
        }
        if (partes.length >= 3) {
            document.getElementById('editSetor').value = partes[2];
        }

        document.getElementById('editResponsavel').checked = (isResp === true || isResp === 'true');

        // Tratamento da array de aplicativos
        let userApps = ["#home", "#demandas"]; // Valor padrão se não houver apps salvos
        if (encodedApps) {
            try {
                userApps = JSON.parse(decodeURIComponent(encodedApps));
            } catch (e) { console.error("Erro lendo apps", e); }
        }

        // Marca/Desmarca as caixas de seleção
        const checkboxes = document.querySelectorAll('input[name="app_permission"]');
        checkboxes.forEach(cb => {
            cb.checked = userApps.includes(cb.value);
            // Se o usuário já for admin, bloqueia os checkboxes visualmente
            if (role === 'admin') {
                cb.disabled = true;
                cb.parentElement.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                cb.disabled = false;
                cb.parentElement.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });

        // Evento: Se o admin mudar o select de "User" para "Admin", congela as checkboxes
        document.getElementById('editRole').onchange = (e) => {
            const isAdmin = e.target.value === 'admin';
            checkboxes.forEach(cb => {
                if (isAdmin) {
                    cb.checked = true;
                    cb.disabled = true;
                    cb.parentElement.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    cb.checked = userApps.includes(cb.value); // Volta ao estado salvo
                    cb.disabled = false;
                    cb.parentElement.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            });
        };

        document.getElementById('editModal').classList.remove('hidden');
    },

    async salvarEdicao() {
            const btn = document.getElementById('btnUpdateUser');
            const id = document.getElementById('editId').value;
            const name = document.getElementById('editName').value.trim();
            const email = document.getElementById('editEmail').value.trim();
            const role = document.getElementById('editRole').value;
            const password = document.getElementById('editPass').value.trim();
            const responsavel = document.getElementById('editResponsavel').checked;
            
            // Pegando os valores dos novos selects
            const dir = document.getElementById('editDiretoria').value;
            const coord = document.getElementById('editCoordenacao').value;
            const setor = document.getElementById('editSetor').value;
            
            // Concatenando hierarquia na variável correta 'coordenacao'
            const coordenacao = `${dir}/${coord}${setor && setor !== 'Nenhum' ? '/'+setor : ''}`;

            // 1. Recolhe todos os checkboxes marcados
            let allowed_apps = ["#home", "#demandas"]; 
            
            if (role === 'admin') {
                // Se virar Admin (ou continuar Admin), recebe o pacote completo
                allowed_apps = ['#home', '#dashboard', '#gerador', '#contratos', '#legislacao', '#qualificacao', '#regmap', '#demandas', '#conversor', '#usuarios'];
            } else {
                // Se for User (ou rebaixado para User), pega os marcados e mescla garantindo a Home
                const checkedBoxes = Array.from(document.querySelectorAll('input[name="app_permission"]:checked'));
                const customApps = checkedBoxes.map(cb => cb.value);
                // O "new Set" garante que não terá duplicatas
                allowed_apps = [...new Set(["#home", "#demandas", ...customApps])]; 
            }

            btn.disabled = true;
            btn.textContent = "Atualizando...";

            const user_dash = document.getElementById('editUserDash').value;
            try {
                const avatarUrl = await this.uploadAvatar('editAvatar');

                // 2. Prepara o Payload enviando o 'allowed_apps' no bloco 'metadata'
                const payload = { 
                    acao: 'editar', 
                    idUsuario: id, 
                    email: email !== '' ? email : undefined,
                    metadata: { 
                        name: name, 
                        role: role,
                        allowed_apps: allowed_apps, 
                        coordenacao: coordenacao, // Variável declarada corretamente acima
                        responsavel: responsavel,
                        user_dash: user_dash
                    } 
                };

                if (avatarUrl) payload.avatar_url = avatarUrl;
                if (password !== '') payload.password = password;

                // 3. Chama a Edge Function que agora faz todo o trabalho duro e seguro
                const { error } = await supabase.functions.invoke('gerenciar-usuarios', { body: payload });

                if (error) throw error;

                this.showToast("Usuário atualizado com sucesso!");
                
                // INJETE AQUI
                enviarLogAoPai("EDITAR_USUARIO", { 
                    alvo: email, 
                    nova_role: role, 
                    coordenacao: coordenacao,
                    is_responsavel: responsavel 
                });

                document.getElementById('editModal').classList.add('hidden');
                await this.carregarUsuarios(); 
            } catch (err) {
                this.showToast("Erro: " + err.message, "error");
            } finally {
                btn.disabled = false;
                btn.textContent = "Salvar Alterações";
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

        // 1. TRAVA DE SEGURANÇA: Garante que o botão sempre nasça destravado ao abrir
        btnConfirm.disabled = false;

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

                    enviarLogAoPai(novoStatus === 'inativo' ? "BLOQUEAR_ACESSO" : "DESBLOQUEAR_ACESSO", { 
                    alvo_id: id 
                    });

                this.fecharConfirmacao();
                await this.carregarUsuarios(); 
            } catch (err) {
                this.fecharConfirmacao();
                this.showToast("Erro: " + err.message, "error");
            } finally {
                // 2. CORREÇÃO: Destrava o botão independentemente de dar certo ou erro!
                btnConfirm.disabled = false;
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
        const appsSection = document.getElementById('approveAppsSection');
        
        modal.classList.add('opacity-0');
        content.classList.remove('scale-100', 'opacity-100');
        content.classList.add('scale-95', 'opacity-0');
        
        setTimeout(() => {
            modal.classList.add('hidden');
            // Oculta a seção de apps e restaura a largura original do modal
            if (appsSection) appsSection.classList.add('hidden');
            content.classList.replace('max-w-md', 'max-w-sm');
        }, 300);
    },

// 2A. ABRIR MODAL LIMPANDO CACHES ANTIGOS
    abrirNovoUsuario() {
        document.getElementById('newName').value = '';
        document.getElementById('newEmail').value = '';
        document.getElementById('newAvatar').value = '';
        document.getElementById('newRole').value = 'user';
        this.handleNewRoleChange('user'); // Reseta os checkboxes
        document.getElementById('newResponsavel').checked = false;
        
        // Popula as diretorias e reseta/trava os selects dependentes
        this.popularDiretorias('new');
        
        const coordSelect = document.getElementById('newCoordenacao');
        coordSelect.innerHTML = '<option value="">Selecione a diretoria...</option>';
        coordSelect.disabled = true;
        
        const setorSelect = document.getElementById('newSetor');
        setorSelect.innerHTML = '<option value="">Nenhum</option>';
        setorSelect.disabled = true;

        this.popularSelectUserDash('newUserDash');
        document.getElementById('modal').classList.remove('hidden');
    },

    // 2B. GERENCIA CONGELAMENTO DOS CHECKBOXES SE FOR ADMIN
    handleNewRoleChange(role) {
        const checkboxes = document.querySelectorAll('input[name="new_app_permission"]');
        const isAdmin = role === 'admin';
        
        checkboxes.forEach(cb => {
            if (isAdmin) {
                cb.checked = true;
                cb.disabled = true;
                cb.parentElement.classList.add('opacity-50', 'cursor-not-allowed');
            } else {
                cb.checked = false; 
                cb.disabled = false;
                cb.parentElement.classList.remove('opacity-50', 'cursor-not-allowed');
            }
        });
    },

    // 2C. ADICIONAR USUÁRIO
    async salvarUsuario() {
            const btn = document.getElementById('btnSaveUser');
            const name = document.getElementById('newName').value.trim();
            const email = document.getElementById('newEmail').value.trim();
            const role = document.getElementById('newRole').value;
            const responsavel = document.getElementById('newResponsavel').checked;

            // 1. Coleta os valores diretamente dos 3 selects do modal de NOVO usuário
            const dir = document.getElementById('newDiretoria').value;
            const coord = document.getElementById('newCoordenacao').value;
            const setor = document.getElementById('newSetor').value;
            
            // 2. Junta tudo em um único texto (ex: "DSL/CGCF" ou "DSL/CSA/GESTAO_FROTA")
            // Se o setor for vazio ou "Nenhum", ele ignora o setor para não salvar lixo
            const coordenacao = `${dir}/${coord}${setor && setor !== 'Nenhum' ? '/'+setor : ''}`;

            // A senha não é mais necessária aqui no front-end!
            if (!name || !email) {
                this.showToast("Preencha o nome e o e-mail do usuário!", "error");
                return;
            }

            btn.disabled = true;
            btn.textContent = "Criando e Enviando E-mail...";

            try {
                const avatarUrl = await this.uploadAvatar('newAvatar');

                // Ler apps permitidos baseados nos checkboxes
                let allowed_apps = ["#home", "#demandas"];
                if (role === 'admin') {
                    allowed_apps = ['#home', '#dashboard', '#gerador', '#contratos', '#legislacao', '#qualificacao', '#regmap', '#demandas', '#conversor', '#usuarios'];
                } else {
                    const checkedBoxes = Array.from(document.querySelectorAll('input[name="new_app_permission"]:checked'));
                    const customApps = checkedBoxes.map(cb => cb.value);
                    allowed_apps = [...new Set(["#home", "#demandas", ...customApps])];
                }

                const user_dash = document.getElementById('newUserDash').value;
                // Envia para a Edge Function incluindo a coordenação montada
                const { error } = await supabase.functions.invoke('gerenciar-usuarios', {
                    body: { 
                        acao: 'criar', 
                        email: email, 
                        avatar_url: avatarUrl, 
                        metadata: { 
                            role: role, 
                            name: name,
                            allowed_apps: allowed_apps,
                            coordenacao: coordenacao, // Aqui vai a string unificada (Ex: "DSL/CGCF")
                            responsavel: responsavel,
                            user_dash: user_dash
                        } 
                    }
                });

                if (error) throw error;

                this.showToast("Usuário criado e e-mail enviado com sucesso!");

                    // INJETE AQUI
                    enviarLogAoPai("CRIAR_USUARIO_MANUAL", { 
                        alvo_email: email, 
                        alvo_nome: name, 
                        role_atribuida: role, 
                        coordenacao: coordenacao 
                    });

                document.getElementById('modal').classList.add('hidden');
                
                await this.carregarUsuarios();
            } catch (err) {
                this.showToast("Erro: " + err.message, "error");
            } finally {
                btn.disabled = false;
                btn.textContent = "Criar Usuário";
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

    // --- FUNÇÕES DA NOVA ABA DE APROVAÇÃO E INATIVOS ---

    mudarAba(aba) {
        const tabUsuarios = document.getElementById('tabUsuarios');
        const tabInativos = document.getElementById('tabInativos');
        const tabPendentes = document.getElementById('tabPendentes');
        const tabLogs = document.getElementById('tabLogs'); // NOVA ABA
        
        const contUsuarios = document.getElementById('containerUsuarios');
        const contInativos = document.getElementById('containerInativos');
        const contPendentes = document.getElementById('containerPendentes');
        const contLogs = document.getElementById('containerLogs'); // NOVO CONTAINER

        // Reseta todos
        const resetClass = "px-4 py-3 font-bold text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300 border-b-2 border-transparent transition-colors flex items-center gap-2";
        tabUsuarios.className = resetClass;
        tabInativos.className = resetClass;
        tabPendentes.className = resetClass;
        if (tabLogs) tabLogs.className = resetClass;

        contUsuarios.classList.add('hidden');
        contInativos.classList.add('hidden');
        contPendentes.classList.add('hidden');
        if (contLogs) contLogs.classList.add('hidden');

        const activeClass = "px-4 py-3 font-bold text-blue-600 border-b-2 border-blue-600 transition-colors flex items-center gap-2";

        // Aplica o estado ativo
        if (aba === 'usuarios') {
            tabUsuarios.className = activeClass;
            contUsuarios.classList.remove('hidden');
        } else if (aba === 'inativos') {
            tabInativos.className = activeClass;
            contInativos.classList.remove('hidden');
        } else if (aba === 'pendentes') {
            tabPendentes.className = activeClass;
            contPendentes.classList.remove('hidden');
        } else if (aba === 'logs') {
            if (tabLogs) tabLogs.className = activeClass;
            if (contLogs) contLogs.classList.remove('hidden');
            this.carregarLogs(); // CARREGA OS LOGS AO CLICAR NA ABA
        }
    },

    async carregarLogs() {
        const tbody = document.getElementById('logsTableBody');
        if (!tbody) return;
        
        // Colspan alterado para 6
        tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 animate-pulse">Consultando banco de dados de auditoria...</td></tr>';

        // Traz os últimos 500 eventos para dar mais opções de filtro local
        const { data, error } = await supabase
            .from('sistema_logs')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(500);

        if (error) {
            this.showToast("Erro ao carregar logs", "error");
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-red-500">Erro de permissão ou conexão ao buscar logs.</td></tr>';
            return;
        }

        this.logsData = data || [];

        // Extrai os nomes de Apps dinamicamente e popula o Select
        const appsUnicos = [...new Set(this.logsData.map(l => l.app_origem))].filter(Boolean);
        const selectApp = document.getElementById('filterLogApp');
        if (selectApp) {
            const valAtual = selectApp.value;
            selectApp.innerHTML = '<option value="">Todos os Apps</option>' + 
                appsUnicos.map(app => `<option value="${app}">${app}</option>`).join('');
            selectApp.value = valAtual;
        }

        this.renderLogs();
    },

    renderLogs() {
        const tbody = document.getElementById('logsTableBody');
        if (!tbody) return;

        const busca = (document.getElementById('filterLogBusca')?.value || '').toLowerCase();
        const appFiltro = document.getElementById('filterLogApp')?.value || '';
        const periodoFiltro = document.getElementById('filterLogPeriodo')?.value || '7';

        let dataLimite = new Date(0);
        if (periodoFiltro !== 'todos') {
            dataLimite = new Date();
            dataLimite.setDate(dataLimite.getDate() - parseInt(periodoFiltro));
            dataLimite.setHours(0, 0, 0, 0);
        }

        const filtrados = this.logsData.filter(log => {
            const logData = new Date(log.created_at);
            
            if (logData < dataLimite) return false;
            if (appFiltro && log.app_origem !== appFiltro) return false;

            if (busca) {
                const jsonText = log.detalhes ? JSON.stringify(log.detalhes).toLowerCase() : '';
                const matchName = (log.usuario_nome || '').toLowerCase().includes(busca);
                const matchEmail = (log.usuario_email || '').toLowerCase().includes(busca);
                const matchAction = (log.acao || '').toLowerCase().includes(busca);
                const matchJson = jsonText.includes(busca);

                if (!matchName && !matchEmail && !matchAction && !matchJson) return false;
            }

            return true;
        });

        if (filtrados.length === 0) {
            tbody.innerHTML = '<tr><td colspan="6" class="p-8 text-center text-slate-500 italic">Nenhum registro encontrado para os filtros atuais.</td></tr>';
            return;
        }

        tbody.innerHTML = filtrados.map(log => {
            const dataHora = new Date(log.created_at).toLocaleString('pt-BR');
            
            const detalhesFormatados = Object.entries(log.detalhes || {}).map(([k, v]) => 
                `<span class="font-semibold text-blue-600 dark:text-blue-400 capitalize">${k.replace(/_/g, ' ')}:</span> ${v}`
            ).join(' <span class="text-slate-300 dark:text-slate-600 mx-1">|</span> ');

            // Separado Nome e E-mail em duas TDs
            return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors border-t border-slate-100 dark:border-slate-800/50">
                <td class="p-4 text-slate-500 dark:text-slate-400 align-top">${dataHora}</td>
                <td class="p-4 text-slate-800 dark:text-slate-200 font-bold align-top">${log.usuario_nome}</td>
                <td class="p-4 text-slate-500 dark:text-slate-400 align-top">${log.usuario_email}</td>
                <td class="p-4 text-center align-top">
                    <span class="px-2 py-1 rounded bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400 text-[9px] font-black uppercase tracking-wider">${log.app_origem}</span>
                </td>
                <td class="p-4 font-bold text-slate-700 dark:text-slate-300 align-top">${log.acao.replace(/_/g, ' ')}</td>
                <td class="p-4 text-slate-600 dark:text-slate-400 text-[11px] whitespace-normal min-w-[300px] leading-relaxed align-top">
                    ${detalhesFormatados || '<span class="italic opacity-50">Sem detalhes adicionais</span>'}
                </td>
            </tr>
            `;
        }).join('');
    },

    async carregarPendentes() {
        const tbody = document.getElementById('pendentesTableBody');
        const badge = document.getElementById('badgePendentes');
        tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500">Buscando solicitações...</td></tr>';

        // Busca dados que caíram na tabela pedidos_acesso
        const { data, error } = await supabase.from('pedidos_acesso').select('*').eq('status', 'pendente').order('created_at', { ascending: false });

        if (error) {
            this.showToast("Erro ao carregar pedidos.", "error");
            return;
        }

        // Atualiza a bolinha vermelha de notificação
        if (data.length > 0) {
            badge.textContent = data.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
            tbody.innerHTML = '<tr><td colspan="4" class="p-8 text-center text-slate-500">Nenhuma solicitação pendente no momento.</td></tr>';
            return;
        }

        // Monta a tabela
        tbody.innerHTML = data.map(p => {
            const dataPed = new Date(p.created_at).toLocaleDateString('pt-BR');
            return `
            <tr class="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                <td class="p-4 text-slate-800 dark:text-slate-200 font-bold">${p.nome}</td>
                <td class="p-4 text-slate-600 dark:text-slate-400">${p.email}</td>
                <td class="p-4 text-slate-500 text-center text-sm">${dataPed}</td>
                <td class="p-4 text-right flex justify-end gap-3 items-center h-full">
                    
                    <button onclick="app.aprovarPendente('${p.id}', '${p.nome}', '${p.email}')" 
                        class="text-green-500 hover:text-green-700 transition-colors" 
                        title="Aprovar Solicitação">
                        
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M4.56499 12.4068C4.29258 12.0947 3.81879 12.0626 3.50676 12.335C3.19472 12.6074 3.1626 13.0812 3.43501 13.3932L4.56499 12.4068ZM7.14286 16.5L6.57787 16.9932C6.7203 17.1564 6.92629 17.25 7.14286 17.25C7.35942 17.25 7.56542 17.1564 7.70784 16.9932L7.14286 16.5ZM15.565 7.99324C15.8374 7.68121 15.8053 7.20742 15.4932 6.93501C15.1812 6.6626 14.7074 6.69472 14.435 7.00676L15.565 7.99324ZM10.5064 11.5068C10.234 11.8188 10.2662 12.2926 10.5782 12.565C10.8902 12.8374 11.364 12.8053 11.6364 12.4932L10.5064 11.5068ZM9.67213 14.7432C9.94454 14.4312 9.91242 13.9574 9.60039 13.685C9.28835 13.4126 8.81457 13.4447 8.54215 13.7568L9.67213 14.7432ZM3.43501 13.3932L6.57787 16.9932L7.70784 16.0068L4.56499 12.4068L3.43501 13.3932ZM7.70784 16.9932L9.67213 14.7432L8.54215 13.7568L6.57787 16.0068L7.70784 16.9932ZM11.6364 12.4932L13.6007 10.2432L12.4707 9.25676L10.5064 11.5068L11.6364 12.4932ZM13.6007 10.2432L15.565 7.99324L14.435 7.00676L12.4707 9.25676L13.6007 10.2432Z" fill="currentColor"/>
                            <path d="M20.0002 7.5625L15.7144 12.0625M11.0002 16L11.4286 16.5625L13.5715 14.3125" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                        </svg>

                    </button>

                    <button onclick="app.rejeitarPendente('${p.id}', '${p.nome}')" 
                        class="text-red-500 hover:text-red-700 transition-colors" 
                        title="Rejeitar Solicitação">
                        
                        <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                            <path d="M8 3.5C8 2.67157 8.67157 2 9.5 2H14.5C15.3284 2 16 2.67157 16 3.5V4.5C16 5.32843 15.3284 6 14.5 6H9.5C8.67157 6 8 5.32843 8 4.5V3.5Z" stroke="currentColor" stroke-width="1.5"/>
                            <path d="M14.5 11L9.50004 16M9.50002 11L14.5 16" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                            <path d="M21 16.0002C21 18.8286 21 20.2429 20.1213 21.1215C19.2426 22.0002 17.8284 22.0002 15 22.0002H9C6.17157 22.0002 4.75736 22.0002 3.87868 21.1215C3 20.2429 3 18.8286 3 16.0002V13.0002M16 4.00195C18.175 4.01406 19.3529 4.11051 20.1213 4.87889C21 5.75757 21 7.17179 21 10.0002V12.0002M8 4.00195C5.82497 4.01406 4.64706 4.11051 3.87868 4.87889C3.11032 5.64725 3.01385 6.82511 3.00174 9" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
                        </svg>

                    </button>
                </td>               
            </tr>
            `;
        }).join('');
    },

    async aprovarPendente(id, nome, email) {
        const modal = document.getElementById('confirmStatusModal');
        const content = document.getElementById('confirmStatusContent');
        const btnConfirm = document.getElementById('btnConfirmAction');
        const iconDiv = document.getElementById('confirmIcon');
        const appsSection = document.getElementById('approveAppsSection');

        // Alarga o modal para caber a grade de opções
        content.classList.replace('max-w-sm', 'max-w-md');

        document.getElementById('confirmTitle').textContent = "Aprovar Acesso?";
        iconDiv.className = "w-14 h-14 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4";
        iconDiv.innerHTML = '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>';
        
        btnConfirm.className = "flex-1 px-4 py-2 font-medium rounded-lg text-white shadow-md transition-colors bg-emerald-600 hover:bg-emerald-700 shadow-emerald-500/30";
        btnConfirm.textContent = "Sim, Aprovar";
        
        document.getElementById('confirmMessage').textContent = `Liberar o acesso para "${nome}"? A senha provisória será gerada e enviada por e-mail.`;

        // Mostra as opções de apps e desmarca todas por precaução
        appsSection.classList.remove('hidden');
        document.querySelectorAll('input[name="approve_app_permission"]').forEach(cb => cb.checked = false);

            document.getElementById('approveCoordenacao').value = '';
            document.getElementById('approveResponsavel').checked = false;

            this.popularSelectUserDash('approveUserDash');

            btnConfirm.onclick = async () => {
            const checkedBoxes = Array.from(document.querySelectorAll('input[name="approve_app_permission"]:checked'));
            const customApps = checkedBoxes.map(cb => cb.value);
            const allowed_apps = ["#home", "#demandas", ...customApps]; // Força o envio do demandas

            const coordenacao = document.getElementById('approveCoordenacao').value.trim();
            const responsavel = document.getElementById('approveResponsavel').checked;

            btnConfirm.textContent = "Aprovando...";
            btnConfirm.disabled = true;
            const user_dash = document.getElementById('approveUserDash').value;
            try {
                const { error } = await supabase.functions.invoke('gerenciar-usuarios', {
                    body: { 
                        acao: 'aprovar', 
                        idPedido: id, 
                        email: email, 
                        name: nome,
                        allowed_apps: allowed_apps, // Enviando as permissões para o backend
                        coordenacao: coordenacao, // Envia para a Edge
                        responsavel: responsavel,
                        user_dash: user_dash
                    }
                });

                if (error) throw error;

                this.showToast("Acesso liberado com sucesso!");

                    // INJETE AQUI (dentro do btnConfirm.onclick try)
                    enviarLogAoPai("APROVAR_SOLICITACAO_ACESSO", { 
                        alvo_email: email, 
                        coordenacao_atribuida: coordenacao 
                    });

                this.fecharConfirmacao();
                await this.carregarPendentes();
                await this.carregarUsuarios();
            } catch (err) {
                this.fecharConfirmacao();
                this.showToast("Erro ao aprovar: " + err.message, "error");
            } finally {
                btnConfirm.disabled = false;
            }
        };

        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);
    },

    async rejeitarPendente(id, nome = "este usuário") {
        const modal = document.getElementById('confirmStatusModal');
        const content = document.getElementById('confirmStatusContent');
        const btnConfirm = document.getElementById('btnConfirmAction');
        const iconDiv = document.getElementById('confirmIcon');

        // Visual Vermelho (Rejeição/Exclusão)
        document.getElementById('confirmTitle').textContent = "Rejeitar Solicitação?";
        iconDiv.className = "w-14 h-14 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4";
        iconDiv.innerHTML = '<svg class="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>';
        
        btnConfirm.className = "flex-1 px-4 py-2 font-medium rounded-lg text-white shadow-md transition-colors bg-red-600 hover:bg-red-700 shadow-red-500/30";
        btnConfirm.textContent = "Sim, Rejeitar";
        
        document.getElementById('confirmMessage').textContent = `Tem certeza que deseja recusar e excluir o pedido de "${nome}"?`;

        // Ação real ao confirmar
        btnConfirm.onclick = async () => {
            btnConfirm.textContent = "Excluindo...";
            btnConfirm.disabled = true;
            try {
                const { error } = await supabase.functions.invoke('gerenciar-usuarios', {
                    body: { acao: 'rejeitar', idPedido: id }
                });

                if (error) throw error;

                this.showToast("Solicitação excluída.");

                // INJETE AQUI (dentro do btnConfirm.onclick try)
                enviarLogAoPai("REJEITAR_SOLICITACAO_ACESSO", { 
                    alvo_id: id 
                });

                this.fecharConfirmacao();
                await this.carregarPendentes();
            } catch (err) {
                this.fecharConfirmacao();
                this.showToast("Erro ao excluir: " + err.message, "error");
            } finally {
                btnConfirm.disabled = false;
            }
        };

        // Exibe o modal com animação
        modal.classList.remove('hidden');
        setTimeout(() => {
            modal.classList.remove('opacity-0');
            content.classList.remove('scale-95', 'opacity-0');
            content.classList.add('scale-100', 'opacity-100');
        }, 10);
    },

    async carregarNomesDashboard() {
        if (this.nomesDashboard.length > 0) return this.nomesDashboard;

        try {
            // 1. Lista os arquivos do bucket relatorios-caf
            const { data: files, error } = await supabase.storage.from('relatorios-caf').list();
            if (error) throw error;

            // 2. Filtra os JSONs e pega APENAS o último (ex: 2026-12.json)
            const monthFiles = (files || [])
                .filter(f => /^\d{4}-\d{2}\.json$/.test(f.name))
                .sort((a, b) => a.name.localeCompare(b.name));

            if (monthFiles.length === 0) return [];

            const lastFile = monthFiles[monthFiles.length - 1];

            // 3. Faz o download exclusivamente do último mês
            const { data: fileData, error: downloadError } = await supabase.storage
                .from('relatorios-caf')
                .download(lastFile.name);

            if (downloadError) throw downloadError;

            // 4. Converte e extrai os nomes únicos
            const text = await fileData.text();
            const json = JSON.parse(text);
            
            let uniqueNames = new Set();
            
            // O Dashboard exporta como matriz { cols: [...], rows: [...] }
            if (json.cols && json.rows) {
                const analystIndex = json.cols.indexOf("Usuario Analista");
                if (analystIndex !== -1) {
                    json.rows.forEach(row => {
                        if (row[analystIndex]) uniqueNames.add(row[analystIndex]);
                    });
                }
            }

            this.nomesDashboard = [...uniqueNames].filter(Boolean).sort();
            return this.nomesDashboard;
        } catch (err) {
            console.error("Erro ao puxar analistas do Storage:", err);
            return [];
        }
    },

    async popularSelectUserDash(selectId, selectedValue = '') {
        const select = document.getElementById(selectId);
        select.innerHTML = '<option value="">Carregando...</option>';
        
        const nomes = await this.carregarNomesDashboard();
        
        select.innerHTML = '<option value="">Não vincular</option>';
        nomes.forEach(nome => {
            const isSelected = (nome === selectedValue) ? 'selected' : '';
            select.innerHTML += `<option value="${nome}" ${isSelected}>${nome}</option>`;
        });
    },

    
};

// Função padrão para jogar no JS dos apps filhos
function enviarLogAoPai(acao, detalhes = {}) {
    // Verifica se está rodando dentro do iframe do Cockpit
    if (window.parent !== window) {
        window.parent.postMessage({
            type: "REGISTRAR_LOG",
            payload: {
                acao: acao,
                detalhes: detalhes,
                appOrigem: "GESTAO_USUARIOS"
            }
        }, "*");
    } else {
        console.warn("Log não enviado: rodando fora do iframe.", acao);
    }
}

// Como o script é um type="module", precisamos pendurar o app no window
// para que o HTML consiga enxergá-lo quando clicar no botão "onclick=app.salvarUsuario()"
window.app = app;

app.init();