import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://whnzeysvqbtuecxmthht.supabase.co';
const supabaseKey = 'sb_publishable_Gw4cFK56R9kms2ogg50UqA_ZhHi79qw';
const supabase = createClient(supabaseUrl, supabaseKey);

// Estado Global
let demandas = [];
let tempSubDemandas = [];
let perfisUsuarios = [];
const currentUserRole = sessionStorage.getItem('cockpit_user_role') || 'user';
const currentUserName = sessionStorage.getItem('cockpit_user_realname') || 'Usuário';

// Listeners Base
document.addEventListener("DOMContentLoaded", initApp);
document.getElementById('search-input').addEventListener('input', renderDemandas);
document.getElementById('filter-status').addEventListener('change', renderDemandas);
document.getElementById('filter-prioridade').addEventListener('change', renderDemandas);

// Theme Listener do Cockpit
window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "THEME_CHANGE") {
        document.documentElement.classList.toggle("dark", e.data.theme === "dark");
    }
});

async function initApp() {
    // 1. Carrega os usuários para o Select de "Atribuir a"
    await carregarUsuarios();
    
    // 2. Carrega as demandas respeitando o nível de acesso
    await fetchDemandas();

    // 3. Carrega as notificações antigas (se existirem)
    carregarNotificacoes()

    // 4. Carrega notificações realtime (via Supabase Realtime)
    configurarRealtimeNotificacoes();
}

async function carregarUsuarios() {
    const { data, error } = await supabase
        .from('profiles')
        .select('id, name')
        .eq('status', 'ativo')
        .order('name');
        
    if (error) {
        console.error("Erro ao buscar usuários:", error);
        return;
    }

    perfisUsuarios = data;
    const select = document.getElementById('f-responsavel');
    const selectSub = document.getElementById('nova-sub-responsavel');
    data.forEach(user => {
        select.innerHTML += `<option value="${user.id}">${user.name}</option>`;
        selectSub.innerHTML += `<option value="${user.id}">${user.name}</option>`;    });
}

async function fetchDemandas() {
    let query = supabase
        .from('demandas')
        .select('*')
        .order('data_criacao', { ascending: false });

    // Regra de Negócio: Usuário comum vê apenas criadas por ele ou atribuídas a ele
    if (currentUserRole !== 'admin') {
        query = query.or(`solicitante_nome.eq."${currentUserName}",responsavel_nome.eq."${currentUserName}"`);
    }

    const { data, error } = await query;

    if (error) {
        alert("Erro ao carregar as demandas.");
        console.error(error);
        return;
    }

    demandas = data;
    renderDemandas();
}

function renderDemandas() {
    const grid = document.getElementById('demandas-grid');
    const termo = document.getElementById('search-input').value.toLowerCase();
    const statusFiltro = document.getElementById('filter-status').value;
    const prioridadeFiltro = document.getElementById('filter-prioridade').value;

    grid.innerHTML = '';

    const filtradas = demandas.filter(d => {
        const matchSearch = d.titulo.toLowerCase().includes(termo) || 
                            (d.responsavel_nome && d.responsavel_nome.toLowerCase().includes(termo)) ||
                            d.solicitante_nome.toLowerCase().includes(termo);
                            
        // NOVA REGRA: Se o filtro estiver no padrão (""), esconde as concluídas
        const matchStatus = statusFiltro === "" ? d.status !== 'Concluído' : d.status === statusFiltro;
        
        const matchPrio = prioridadeFiltro === "" || d.prioridade === prioridadeFiltro;

        return matchSearch && matchStatus && matchPrio;
    });

    if (filtradas.length === 0) {
        grid.innerHTML = `<div class="col-span-full p-8 text-center text-slate-500 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">Nenhuma demanda encontrada para os filtros atuais.</div>`;
        return;
    }

    filtradas.forEach(d => {
        const prazo = d.prazo_limite ? new Date(d.prazo_limite + 'T12:00:00Z').toLocaleDateString('pt-BR') : 'Sem prazo';
        const isAtrasado = d.prazo_limite && new Date(d.prazo_limite) < new Date() && d.status !== 'Concluído';
        
        const criacao = new Date(d.data_criacao);
        const idVisual = `REQ-${criacao.getFullYear()}${String(criacao.getMonth() + 1).padStart(2, '0')}${String(criacao.getDate()).padStart(2, '0')}${String(criacao.getHours()).padStart(2, '0')}${String(criacao.getMinutes()).padStart(2, '0')}`;
        
        const precisaDarCiente = (d.status === 'Pendente' && d.responsavel_nome === currentUserName);

        const statusColors = {
            'Pendente': 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
            'Em Andamento': 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400',
            'Concluído': 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
            'Cancelado': 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
        };
        const prioColors = {
            'Baixa': 'text-slate-500', 'Média': 'text-blue-500', 'Alta': 'text-orange-500', 'Urgente': 'text-red-600 font-bold'
        };

        // BOTÃO DE EXCLUIR APARECE APENAS PARA ADMIN
        const btnExcluir = currentUserRole === 'admin' ? `
            <button class="text-slate-400 hover:text-red-500 p-1" onclick="event.stopPropagation(); excluirDemanda('${d.id}')" title="Excluir (Admin)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
            </button>
        ` : '';

        const card = document.createElement('div');
        card.className = `bg-white dark:bg-slate-900 p-5 rounded-xl border ${isAtrasado ? 'border-red-300 dark:border-red-800/50 shadow-[0_0_15px_rgba(239,68,68,0.1)]' : 'border-slate-200 dark:border-slate-800'} shadow-sm hover:shadow-md transition-shadow flex flex-col animate-fade-in cursor-pointer group`;
        card.onclick = () => abrirModalDemanda(d.id);

        card.innerHTML = `
            <div class="flex justify-between items-start mb-2">
                <span class="text-xs font-mono font-bold text-slate-400 dark:text-slate-500">${idVisual}</span>
                <span class="text-[10px] uppercase font-bold tracking-widest ${prioColors[d.prioridade]}">${d.prioridade}</span>
            </div>
            
            <div class="flex justify-between items-start mb-3">
                <span class="px-2.5 py-1 rounded text-[10px] font-black uppercase tracking-wider ${statusColors[d.status]}">${d.status}</span>
            </div>
            
            <h3 class="font-bold text-slate-800 dark:text-white leading-tight mb-2 group-hover:text-blue-600 transition-colors">${d.titulo}</h3>
            <p class="text-xs text-slate-500 line-clamp-2 mb-4 flex-1">${d.descricao || 'Sem descrição.'}</p>
            
            <div class="grid grid-cols-2 gap-2 text-xs border-t dark:border-slate-800 pt-3">
                <div>
                    <p class="text-slate-400 uppercase text-[9px] font-bold">Solicitante</p>
                    <p class="font-medium text-slate-700 dark:text-slate-300 truncate" title="${d.solicitante_nome}">${d.solicitante_nome}</p>
                </div>
                <div>
                    <p class="text-slate-400 uppercase text-[9px] font-bold">Responsável</p>
                    <p class="font-medium text-slate-700 dark:text-slate-300 truncate" title="${d.responsavel_nome || 'Não atribuído'}">${d.responsavel_nome || 'Ninguém'}</p>
                </div>
            </div>
            <div class="mt-3 text-xs flex items-center justify-between">
                <span class="${isAtrasado ? 'text-red-500 font-bold' : 'text-slate-500'}">Prazo: ${prazo}</span>
                ${btnExcluir}
            </div>
            
            ${precisaDarCiente ? `
                <div class="mt-4 pt-3 border-t border-slate-200 dark:border-slate-800">
                <button onclick="event.stopPropagation(); solicitarCiente('${d.id}', '${d.solicitante_nome}')" class="w-full py-2 bg-blue-50 hover:bg-blue-600 text-blue-600 hover:text-white dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-600 dark:hover:text-white font-bold rounded-lg transition-all text-xs uppercase tracking-wider shadow-sm">
                    Dar Ciente
                </button>
                </div>
            ` : ''}
        `;
        grid.appendChild(card);
    });
}

window.abrirModalDemanda = (id = null) => {
    const modal = document.getElementById('modal-demanda');
    const form = document.getElementById('form-demanda');
    form.reset();
    document.getElementById('f-id').value = '';

    if (id) {
        const d = demandas.find(x => x.id === id);
        if (d) {
            if (d.responsavel_nome === currentUserName && !d.visualizado_em) {
                registrarVisualizacao(d);
            }
            document.getElementById('modal-title').textContent = 'Editar Demanda';
            document.getElementById('f-id').value = d.id;
            document.getElementById('f-titulo').value = d.titulo;
            document.getElementById('f-descricao').value = d.descricao;
            document.getElementById('f-status').value = d.status;
            document.getElementById('f-prioridade').value = d.prioridade;
            document.getElementById('f-prazo').value = d.prazo_limite || '';
            document.getElementById('f-obs').value = d.observacoes || '';

            carregarSubdemandas(id);

            document.getElementById('container-subdemandas').classList.remove('hidden');
            // Setar o select do responsável
            if(d.responsavel_id) document.getElementById('f-responsavel').value = d.responsavel_id;
        }
    } else {
        document.getElementById('modal-title').textContent = 'Nova Demanda';
        document.getElementById('container-subdemandas').classList.remove('hidden');
        
        // Zera o array de memória e limpa a tela de subdemandas anteriores
        tempSubDemandas = [];
        renderTempSubdemandas();
    }

    modal.classList.remove('hidden');
}

window.fecharModalDemanda = () => {
    document.getElementById('modal-demanda').classList.add('hidden');
    tempSubDemandas = []; // <--- Isso limpa a memória ao fechar!
};


window.salvarDemanda = async () => {
    const btn = document.getElementById('btn-save');
    const originalText = btn.textContent;
    const id = document.getElementById('f-id').value; // Pegamos o ID aqui

    btn.textContent = 'Salvando...';
    btn.disabled = true;

    try {
        const respSelect = document.getElementById('f-responsavel');
        const respId = respSelect.value || null;
        const respNome = respSelect.value ? respSelect.options[respSelect.selectedIndex].text : null;

        const payload = {
            titulo: document.getElementById('f-titulo').value.trim(),
            descricao: document.getElementById('f-descricao').value.trim(),
            status: document.getElementById('f-status').value,
            prioridade: document.getElementById('f-prioridade').value,
            responsavel_id: respId,
            responsavel_nome: respNome,
            prazo_limite: document.getElementById('f-prazo').value || null,
            observacoes: document.getElementById('f-obs').value.trim(),
            data_atualizacao: new Date().toISOString()
        };

        if (!payload.titulo) throw new Error("O título é obrigatório.");

        let idFinal = id;

        // --- BLOCO ÚNICO DE SALVAMENTO ---
        if (!id) {
            // CRIANDO NOVA
            payload.solicitante_nome = currentUserName;
            const { data, error } = await supabase.from('demandas').insert([payload]).select();
            if (error) throw error;
            idFinal = data[0].id;

            // Log de atribuição
            if (respNome) {
                await supabase.from('demandas_logs').insert([{
                    demanda_id: idFinal,
                    ator_nome: currentUserName,
                    destinatario_nome: respNome,
                    mensagem: `Atribuiu uma nova demanda para você: "${payload.titulo}"`
                }]);
            }
        } else {
            // ATUALIZANDO EXISTENTE
            const { error } = await supabase.from('demandas').update(payload).eq('id', id);
            if (error) throw error;
        }

        // --- SINCRONIZAÇÃO DE SUBDEMANDAS (Lógica Upsert Separada) ---
        if (tempSubDemandas.length > 0) {
            
            // 1. Separa os itens em duas listas (Existentes vs Novos)
            const paraAtualizar = [];
            const paraInserir = [];

            tempSubDemandas.forEach(s => {
                const item = {
                    demanda_id: idFinal,
                    titulo: s.titulo,
                    prazo: s.prazo || null,
                    responsavel_id: s.responsavel_id || null,
                    responsavel_nome: s.responsavel_nome || null,
                    concluido: s.concluido || false
                };
                
                if (s.id) {
                    item.id = s.id; // Se tem ID, vai para a lista de atualização
                    paraAtualizar.push(item);
                } else {
                    paraInserir.push(item); // Se não tem ID, vai para a lista de novos passos
                }
            });

            // 2. Envia as atualizações (sem disparar e-mails repetidos)
            if (paraAtualizar.length > 0) {
                const { error: errUp } = await supabase.from('sub_demandas').upsert(paraAtualizar);
                if (errUp) {
                    console.error("Erro no Upsert:", errUp);
                    throw new Error("Erro ao atualizar as subdemandas existentes.");
                }
            }

            // 3. Envia os novos passos (o banco fará o INSERT e disparará o e-mail)
            if (paraInserir.length > 0) {
                const { error: errIn } = await supabase.from('sub_demandas').insert(paraInserir);
                if (errIn) {
                    console.error("Erro no Insert:", errIn);
                    throw new Error("Erro ao inserir os novos passos.");
                }
            }

            // 4. Limpeza: Deleta do banco os passos que o usuário excluiu na tela (clicou no X)
            const idsAtuais = tempSubDemandas.filter(s => s.id).map(s => s.id);
            if (idsAtuais.length > 0) {
                await supabase.from('sub_demandas')
                    .delete()
                    .eq('demanda_id', idFinal)
                    .not('id', 'in', `(${idsAtuais.join(',')})`);
            } else {
                await supabase.from('sub_demandas').delete().eq('demanda_id', idFinal).not('id', 'is', null);
            }
            
        } else {
            // Se a lista está totalmente vazia, deleta tudo
            await supabase.from('sub_demandas').delete().eq('demanda_id', idFinal);
        }
        // ==========================================
        // MANTENHA ESTA PARTE INTACTA
        // ==========================================
        fecharModalDemanda();
        await fetchDemandas(); 
        showToast("Demanda salva com sucesso!");

    } catch (err) {
        alert(err.message || "Erro ao salvar a demanda.");
        console.error(err);
    } finally {
        btn.textContent = originalText;
        btn.disabled = false;
    }
}

window.excluirDemanda = (id) => {
    if (currentUserRole !== 'admin') {
        showToast("Apenas administradores podem excluir.", "error");
        return;
    }

    abrirModalConfirmacao(
        "Excluir Demanda",
        "Tem certeza que deseja excluir esta demanda? Esta ação é definitiva e todos os logs associados também serão apagados.",
        "danger",
        async () => {
            const { error } = await supabase.from('demandas').delete().eq('id', id);
            if (error) {
                showToast("Erro ao excluir demanda.", "error");
                console.error(error);
            } else {
                showToast("Demanda excluída com sucesso.");
                await fetchDemandas();
            }
        }
    );
};

window.darCiente = async (idDemanda, solicitanteNome) => {
    // 1. Muda o status da demanda
    await supabase.from('demandas').update({ status: 'Em Andamento' }).eq('id', idDemanda);
    
    // 2. Dispara o Log para o Solicitante
    await supabase.from('demandas_logs').insert([{
        demanda_id: idDemanda,
        ator_nome: currentUserName,
        destinatario_nome: solicitanteNome, // Quem enviou vai receber o aviso
        mensagem: `Deu ciente e iniciou a demanda.`
    }]);

    await fetchDemandas();
    alert("Ciente registrado com sucesso!");
};

window.carregarNotificacoes = async () => {
    // Busca logs onde o destinatário é o usuário logado
    const { data, error } = await supabase
        .from('demandas_logs')
        .select('*')
        .eq('destinatario_nome', currentUserName)
        .order('data_criacao', { ascending: false })
        .limit(20);

    if (error || !data) return;

    const lista = document.getElementById('lista-notificacoes');
    const badge = document.getElementById('badge-notificacoes');
    const nNaoLidas = data.filter(n => !n.lida).length;
    

    if (nNaoLidas > 0) {
        badge.textContent = nNaoLidas;
        badge.classList.remove('hidden');
    } else {
        badge.classList.add('hidden');
    }

    if (data.length === 0) {
        lista.innerHTML = '<p class="text-xs text-slate-400 text-center py-4">Sem notificações.</p>';
        return;
    }

    lista.innerHTML = data.map(n => `
        <div class="p-2 rounded-lg ${n.lida ? 'opacity-60' : 'bg-blue-50 dark:bg-slate-700/50'} text-xs">
            <p class="font-bold text-slate-800 dark:text-slate-200">${n.ator_nome}</p>
            <p class="text-slate-600 dark:text-slate-400">${n.mensagem}</p>
            <p class="text-[9px] text-slate-400 mt-1">${new Date(n.data_criacao).toLocaleString('pt-BR')}</p>
        </div>
    `).join('');


};

window.marcarNotificacoesLidas = async () => {
    await supabase.from('demandas_logs')
        .update({ lida: true })
        .eq('destinatario_nome', currentUserName)
        .eq('lida', false);
        
    carregarNotificacoes();
};

// ==========================================
// MÓDULO REALTIME: NOTIFICAÇÕES INSTANTÂNEAS
// ==========================================
window.configurarRealtimeNotificacoes = () => {
    const userName = sessionStorage.getItem('cockpit_user_realname');
    if (!userName) return;

    // Cria um canal de escuta exclusivo
    supabase
        .channel('notificacoes-demandas')
        .on(
            'postgres_changes',
            {
                event: 'INSERT', // Escuta apenas novas notificações
                schema: 'public',
                table: 'demandas_logs',
                filter: `destinatario_nome=eq.${userName}` // Filtro: Apenas as enviadas para mim
            },
            (payload) => {
                const novaNotificacao = payload.new;
                
                // 1. Atualizar o contador numérico (Badge) do sininho
                const badge = document.getElementById('badge-notificacoes');
                let count = parseInt(badge.textContent || '0');
                badge.textContent = count + 1;
                badge.classList.remove('hidden');
                
                // Animação para chamar a atenção
                badge.classList.add('animate-bounce');
                setTimeout(() => badge.classList.remove('animate-bounce'), 3000);

                // 2. Inserir a notificação visualmente no topo da lista do dropdown
                const lista = document.getElementById('lista-notificacoes');
                
                // Se a lista estiver vazia ou com a mensagem "Sem notificações", limpamos primeiro
                if (lista.innerHTML.includes('Sem notificações')) {
                    lista.innerHTML = '';
                }

                const notifHtml = `
                    <div class="p-2 rounded-lg bg-blue-50 dark:bg-slate-700 text-xs animate-fade-in border-l-2 border-blue-500 shadow-sm">
                        <p class="font-bold text-slate-800 dark:text-slate-200">${novaNotificacao.ator_nome}</p>
                        <p class="text-slate-600 dark:text-slate-300 mt-0.5">${novaNotificacao.mensagem}</p>
                        <p class="text-[9px] text-blue-500 mt-1 font-medium">Agora mesmo</p>
                    </div>
                `;
                
                // Insere no topo da lista
                lista.insertAdjacentHTML('afterbegin', notifHtml);

                // 3. Exibir o Toast no ecrã para aviso imediato
                if (typeof showToast === 'function') {
                    showToast(`Nova notificação de ${novaNotificacao.ator_nome}`);
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log("Conectado ao canal de notificações em tempo real.");
            }
        });


};

window.registrarVisualizacao = async (demanda) => {
    const agora = new Date().toISOString();
    
    // 1. Atualiza a demanda marcando a data de visualização
    const { error } = await supabase
        .from('demandas')
        .update({ visualizado_em: agora })
        .eq('id', demanda.id);

    if (!error) {
        // 2. Dispara a notificação para o solicitante saber que foi lido
        // Só notifica se quem está abrindo não for a mesma pessoa que criou
        if (demanda.solicitante_nome !== currentUserName) {
            await supabase.from('demandas_logs').insert([{
                demanda_id: demanda.id,
                ator_nome: currentUserName,
                destinatario_nome: demanda.solicitante_nome,
                mensagem: `Visualizou a demanda "${demanda.titulo}" pela primeira vez.`
            }]);
        }

        // 3. Atualiza o objeto local para não disparar novamente se ele abrir e fechar o modal hoje
        demanda.visualizado_em = agora;
    }
};

// --- MOTOR DE TOASTS (Substitui os alerts simples) ---
window.showToast = (message, type = 'success') => {
    const container = document.getElementById('toast-container');
    if (!container) return;
    
    const toast = document.createElement('div');
    const colors = type === 'success' ? 'bg-emerald-500 border-emerald-600' : (type === 'error' ? 'bg-red-500 border-red-600' : 'bg-blue-500 border-blue-600');
    const icon = type === 'success' ? '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path>' : '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>';

    toast.className = `flex items-center gap-3 px-4 py-3 rounded-lg shadow-xl text-white text-sm font-bold animate-fade-in border-b-4 ${colors}`;
    toast.innerHTML = `<svg class="w-5 h-5 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">${icon}</svg> <span>${message}</span>`;
    
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
        toast.style.transition = 'all 0.3s ease';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

// --- MOTOR DE MODAL DE CONFIRMAÇÃO ---
window.abrirModalConfirmacao = (titulo, mensagem, tipo, acaoConfirmar) => {
    document.getElementById('confirm-title').textContent = titulo;
    document.getElementById('confirm-message').textContent = mensagem;
    
    const icon = document.getElementById('confirm-icon');
    const btn = document.getElementById('btn-confirm-action');
    
    if (tipo === 'danger') {
        icon.className = 'w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-red-100 text-red-600 dark:bg-red-900/30';
        icon.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>';
        btn.className = 'px-5 py-2 text-white font-bold rounded-lg transition-colors text-sm shadow-md bg-red-600 hover:bg-red-700';
    } else {
        icon.className = 'w-12 h-12 rounded-full flex items-center justify-center shrink-0 bg-blue-100 text-blue-600 dark:bg-blue-900/30';
        icon.innerHTML = '<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>';
        btn.className = 'px-5 py-2 text-white font-bold rounded-lg transition-colors text-sm shadow-md bg-blue-600 hover:bg-blue-700';
    }

    btn.onclick = () => {
        acaoConfirmar();
        fecharModalConfirmacao();
    };

    document.getElementById('modal-confirmacao').classList.remove('hidden');
};

window.fecharModalConfirmacao = () => document.getElementById('modal-confirmacao').classList.add('hidden');

// --- NOVO "DAR CIENTE" COM MODAL ---
window.solicitarCiente = (idDemanda, solicitanteNome) => {
    abrirModalConfirmacao(
        "Iniciar Demanda",
        `Ao confirmar, a demanda mudará para "Em Andamento" e o solicitante (${solicitanteNome}) receberá uma notificação de que o trabalho foi iniciado. Deseja prosseguir?`,
        "info",
        async () => {
            await supabase.from('demandas').update({ status: 'Em Andamento' }).eq('id', idDemanda);
            
            await supabase.from('demandas_logs').insert([{
                demanda_id: idDemanda,
                ator_nome: currentUserName,
                destinatario_nome: solicitanteNome,
                mensagem: `Aceitou e iniciou o andamento da demanda.`
            }]);

            await fetchDemandas();
            showToast("Demanda iniciada e solicitante notificado!");
        }
    );
};

// Carrega do banco para a memória apenas ao abrir o modal
async function carregarSubdemandas(demandaId) {
    const { data } = await supabase.from('sub_demandas').select('*').eq('demanda_id', demandaId);
    tempSubDemandas = data || []; 
    renderTempSubdemandas();
}

// Apenas adiciona ao array, sem salvar no banco agora
window.adicionarSubdemanda = () => {
    const titulo = document.getElementById('nova-sub-titulo').value;
    const prazo = document.getElementById('nova-sub-prazo').value;
    const selectResp = document.getElementById('nova-sub-responsavel');
    
    // Captura ID e Nome do select
    const respId = selectResp.value || null;
    const respNome = selectResp.value ? selectResp.options[selectResp.selectedIndex].text : null;

    if (!titulo) return showToast("Digite o título do passo", "error");

    tempSubDemandas.push({ 
        titulo, 
        prazo: prazo || null, 
        responsavel_id: respId,      // Salva o ID na memória
        responsavel_nome: respNome,  // Mantém o nome para exibir na tela
        concluido: false 
    });
    
    // Limpa os campos após adicionar
    document.getElementById('nova-sub-titulo').value = '';
    document.getElementById('nova-sub-prazo').value = '';
    selectResp.value = '';
    
    renderTempSubdemandas();
};

// Renderiza a interface a partir da memória
function renderTempSubdemandas() {
    const lista = document.getElementById('lista-subdemandas');
    lista.innerHTML = tempSubDemandas.map((s, index) => `
        <div class="flex items-center gap-2 p-2 bg-slate-50 dark:bg-slate-800 rounded border border-slate-200 dark:border-slate-700">
            <input type="checkbox" ${s.concluido ? 'checked' : ''} onchange="tempSubDemandas[${index}].concluido = this.checked">
            <span class="flex-1 text-xs">${s.titulo}</span>
            <span class="text-[10px] text-slate-400 dark:text-slate-500">${s.prazo || ''}</span>
            <span class="text-[10px] bg-blue-100 dark:bg-blue-800 text-blue-800 dark:text-blue-100 px-1 rounded">${s.responsavel_nome || ''}</span>
            <button type="button" onclick="tempSubDemandas.splice(${index}, 1); renderTempSubdemandas()" class="text-red-500 font-bold px-2">x</button>
        </div>
    `).join('');
}

// 3. Marcar como concluído
window.toggleSubdemanda = async (id, status) => {
    await supabase.from('sub_demandas').update({ concluido: status }).eq('id', id);
    // Atualiza a lista visualmente
    carregarSubdemandas(document.getElementById('f-id').value);
};