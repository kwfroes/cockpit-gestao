/**
 * apps/quiz/app.js
 * Painel do Instrutor / Telão com Edição e Exclusão de Quizzes
 */

const supabase = window.parent.supabaseClient || window.supabaseClient;

let quizzesDisponiveis = [];
let salaAtiva = null;
let perguntasDaPartida = [];
let indicePerguntaAtual = 0;
let participantesConectados = [];
let respostasRecebidas = [];
let timerInterval = null;
let realtimeChannel = null;
let lobbyPollInterval = null;
let fasePergunta = 'idle'; // 'leitura' | 'valendo' | 'encerrada'

// Controle de Edição e Exclusão
let quizEmEdicaoId = null;
let quizParaExcluirId = null;
let contadorUidPergunta = 0;

const OPCOES_CONFIG = [
    { cor: 'bg-red-500 text-white', icone: '▲' },
    { cor: 'bg-blue-500 text-white', icone: '◆' },
    { cor: 'bg-yellow-500 text-slate-950', icone: '●' },
    { cor: 'bg-emerald-500 text-white', icone: '■' }
];

document.addEventListener("DOMContentLoaded", () => {
    carregarQuizzes();
    injetarCssReacoes();
    injetarModalConfirmacaoExclusao();
});

window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "THEME_CHANGE") {
        document.documentElement.classList.toggle("dark", e.data.theme === "dark");
    }
});

function injetarCssReacoes() {
    if (document.getElementById("css-reacoes-flutuantes")) return;
    const style = document.createElement("style");
    style.id = "css-reacoes-flutuantes";
    style.textContent = `
        @keyframes subirFlutuando {
            0% { transform: translateY(0) scale(0.6); opacity: 0; }
            15% { transform: translateY(-30px) scale(1.4); opacity: 1; }
            100% { transform: translateY(-380px) scale(1.1); opacity: 0; }
        }
        .emoji-flutuante {
            position: fixed;
            bottom: 30px;
            pointer-events: none;
            z-index: 9999;
            animation: subirFlutuando 2.5s cubic-bezier(0.1, 0.8, 0.2, 1) forwards;
            filter: drop-shadow(0 4px 6px rgba(0,0,0,0.3));
        }
    `;
    document.head.appendChild(style);
}

// Injeta um modal de confirmação de exclusão no padrão visual do Cockpit
function injetarModalConfirmacaoExclusao() {
    if (document.getElementById("modal-excluir-quiz")) return;
    const modal = document.createElement("div");
    modal.id = "modal-excluir-quiz";
    modal.className = "fixed inset-0 z-[60] bg-slate-900/80 hidden flex items-center justify-center p-4 backdrop-blur-sm";
    modal.innerHTML = `
        <div class="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-800 space-y-4 text-center">
            <div class="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/30 text-red-600 dark:text-red-400 flex items-center justify-center mx-auto text-xl font-black">
                🗑️
            </div>
            <div class="space-y-1">
                <h3 class="text-lg font-black text-slate-800 dark:text-white">Excluir Questionário?</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                    Você está prestes a excluir <strong id="nome-quiz-excluir" class="text-slate-800 dark:text-white">--</strong>. Todas as perguntas e históricos de salas deste quiz serão removidos permanentemente.
                </p>
            </div>
            <div class="flex justify-center gap-3 pt-2">
                <button type="button" onclick="fecharModalExclusao()" class="px-5 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors">
                    Cancelar
                </button>
                <button type="button" id="btn-confirmar-exclusao" onclick="executarExclusaoQuiz()" class="px-5 py-2.5 text-xs font-bold text-white bg-red-600 hover:bg-red-700 rounded-xl shadow-md transition-colors">
                    Sim, Excluir
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function dispararEfeitoEmoji(emoji) {
    const el = document.createElement("div");
    el.textContent = emoji;
    el.className = "emoji-flutuante text-5xl";
    const posX = Math.floor(Math.random() * 65) + 15;
    el.style.left = `${posX}%`;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 2600);
}

// ========================================================
// LISTAGEM, EDIÇÃO E EXCLUSÃO DE QUIZZES
// ========================================================
async function carregarQuizzes() {
    const grid = document.getElementById("grid-quizzes");
    if (!supabase) return;

    try {
        const { data, error } = await supabase
            .from("quiz_questionarios")
            .select(`
                id, titulo, descricao, created_at,
                quiz_perguntas (id),
                quiz_salas (
                    id, codigo, status, created_at,
                    quiz_participantes (apelido, pontos)
                )
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;
        quizzesDisponiveis = data || [];
        renderizarDashboardQuizzes();
    } catch (err) {
        console.error("Erro:", err);
    }
}

function renderizarDashboardQuizzes() {
    const grid = document.getElementById("grid-quizzes");
    grid.innerHTML = "";

    if (quizzesDisponiveis.length === 0) {
        grid.innerHTML = `<p class="text-sm font-bold text-slate-500 col-span-full">Nenhum quiz encontrado. Crie um novo acima.</p>`;
        return;
    }

    quizzesDisponiveis.forEach(q => {
        const qtdPerguntas = q.quiz_perguntas ? q.quiz_perguntas.length : 0;

        // Filtra as partidas que tiveram participantes e ordena da mais recente para a mais antiga
        const salasComJogadores = (q.quiz_salas || [])
            .filter(s => s.quiz_participantes && s.quiz_participantes.length > 0)
            .sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

        const qtdUsos = salasComJogadores.length;

        // Monta a lista de vencedores de cada sessão
        const historicoHtml = qtdUsos > 0
            ? `
                <details class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-xs group/hist">
                    <summary class="cursor-pointer font-bold text-slate-500 dark:text-slate-400 hover:text-purple-600 dark:hover:text-purple-400 flex items-center justify-between select-none list-none">
                        <span class="flex items-center gap-1.5">
                            🏆 <span>Vencedores por partida (${qtdUsos})</span>
                        </span>
                        <span class="text-[10px] transition-transform group-open/hist:rotate-180">▼</span>
                    </summary>
                    <div class="mt-2 space-y-1.5 max-h-32 overflow-y-auto pr-1">
                        ${salasComJogadores.map(s => {
                            const ranking = [...s.quiz_participantes].sort((a, b) => b.pontos - a.pontos);
                            const vencedor = ranking[0];
                            const dataPartida = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
                            return `
                                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                                    <span class="text-[10px] font-mono text-slate-400">Sala #${s.codigo} (${dataPartida})</span>
                                    <span class="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                                        👑 ${vencedor.apelido} <strong class="text-purple-600 dark:text-purple-400 font-mono">(${vencedor.pontos} pts)</strong>
                                    </span>
                                </div>
                            `;
                        }).join('')}
                    </div>
                </details>
            `
            : `<p class="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 text-[11px] text-slate-400 italic">Ainda não utilizado em sala.</p>`;

        const card = document.createElement("div");
        card.className = "bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col justify-between hover:border-purple-500/40 transition-all";
        card.innerHTML = `
            <div>
                <div class="flex justify-between items-center mb-2">
                    <div class="flex items-center gap-1.5">
                        <span class="text-[10px] font-black uppercase px-2.5 py-1 rounded-md bg-purple-50 dark:bg-purple-900/30 text-purple-600 dark:text-purple-300">
                            ${qtdPerguntas} ${qtdPerguntas === 1 ? 'Pergunta' : 'Perguntas'}
                        </span>
                        <span class="text-[10px] font-bold px-2 py-1 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300">
                            📊 ${qtdUsos}x usado
                        </span>
                    </div>
                    
                    <!-- Botões de Editar e Excluir -->
                    <div class="flex items-center gap-1">
                        <button type="button" onclick="abrirModalEditarQuiz('${q.id}')" title="Editar Questionário" class="p-1.5 rounded-lg text-slate-400 hover:text-purple-600 hover:bg-purple-50 dark:hover:bg-slate-800 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"></path></svg>
                        </button>
                        <button type="button" onclick="confirmarExclusaoQuiz('${q.id}')" title="Excluir Questionário" class="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-slate-800 transition-colors">
                            <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"></path></svg>
                        </button>
                    </div>
                </div>

                <h3 class="font-bold text-slate-800 dark:text-white text-base mt-1">${q.titulo}</h3>
                <p class="text-xs text-slate-500 mt-1 line-clamp-2">${q.descricao || 'Sem descrição.'}</p>

                ${historicoHtml}
            </div>

            <div class="mt-4 pt-3 border-t border-slate-100 dark:border-slate-800">
                <button onclick="criarSalaAoVivo('${q.id}')" ${qtdPerguntas === 0 ? 'disabled' : ''} class="w-full py-2.5 bg-purple-600 hover:bg-purple-700 disabled:opacity-40 text-white text-xs font-black rounded-xl shadow-md transition-all">
                    Apresentar em Sala ➔
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Abre modal para criar um quiz do zero
function abrirModalNovoQuiz() {
    quizEmEdicaoId = null;
    const tituloModal = document.querySelector("#modal-quiz h3");
    if (tituloModal) tituloModal.textContent = "Criar Questionário";

    document.getElementById("quiz-titulo-input").value = "";
    document.getElementById("quiz-desc-input").value = "";
    document.getElementById("container-perguntas-builder").innerHTML = "";
    adicionarBlocoPergunta();
    document.getElementById("modal-quiz").classList.remove("hidden");
}

// Abre o modal carregando todos os dados de um quiz salvo para edição
async function abrirModalEditarQuiz(quizId) {
    if (!supabase) return;

    try {
        const { data: quiz, error } = await supabase
            .from("quiz_questionarios")
            .select(`
                id, titulo, descricao,
                quiz_perguntas (
                    id, ordem, enunciado, justificativa, tempo_segundos, tempo_leitura_segundos,
                    quiz_opcoes (id, texto, is_correta, cor_indice)
                )
            `)
            .eq("id", quizId)
            .single();

        if (error || !quiz) {
            toast("Erro ao carregar dados do questionário.", "error");
            return;
        }

        quizEmEdicaoId = quiz.id;
        const tituloModal = document.querySelector("#modal-quiz h3");
        if (tituloModal) tituloModal.textContent = "Editar Questionário";

        document.getElementById("quiz-titulo-input").value = quiz.titulo || "";
        document.getElementById("quiz-desc-input").value = quiz.descricao || "";

        const container = document.getElementById("container-perguntas-builder");
        container.innerHTML = "";

        const perguntasOrdenadas = (quiz.quiz_perguntas || []).sort((a, b) => a.ordem - b.ordem);
        if (perguntasOrdenadas.length === 0) {
            adicionarBlocoPergunta();
        } else {
            perguntasOrdenadas.forEach(p => adicionarBlocoPergunta(p));
        }

        document.getElementById("modal-quiz").classList.remove("hidden");

    } catch (err) {
        console.error("Erro ao abrir edição:", err);
        toast("Falha ao carregar questionário.", "error");
    }
}

function fecharModalQuiz() {
    quizEmEdicaoId = null;
    document.getElementById("modal-quiz").classList.add("hidden");
}

// Adiciona bloco de pergunta (vazio ou preenchido com dados existentes)
function adicionarBlocoPergunta(dadosPergunta = null) {
    const container = document.getElementById("container-perguntas-builder");
    contadorUidPergunta++;
    const uid = contadorUidPergunta;
    const numeroQuestao = container.children.length + 1;

    const enunciadoVal = dadosPergunta ? (dadosPergunta.enunciado || "").replace(/"/g, '&quot;') : "";
    const justificativaVal = dadosPergunta ? (dadosPergunta.justificativa || "").replace(/"/g, '&quot;') : "";
    const tempoLeituraVal = dadosPergunta ? (dadosPergunta.tempo_leitura_segundos || 5) : 5;
    const tempoRespostaVal = dadosPergunta ? (dadosPergunta.tempo_segundos || 5) : 5;

    let opcoesOrdenadas = [
        { texto: "", is_correta: true },
        { texto: "", is_correta: false },
        { texto: "", is_correta: false },
        { texto: "", is_correta: false }
    ];

    if (dadosPergunta && dadosPergunta.quiz_opcoes && dadosPergunta.quiz_opcoes.length > 0) {
        const salvas = [...dadosPergunta.quiz_opcoes].sort((a, b) => a.cor_indice - b.cor_indice);
        opcoesOrdenadas = [0, 1, 2, 3].map(i => ({
            texto: salvas[i] ? (salvas[i].texto || "").replace(/"/g, '&quot;') : "",
            is_correta: salvas[i] ? !!salvas[i].is_correta : (i === 0)
        }));
    }

    const div = document.createElement("div");
    div.className = "p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 relative group";
    div.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-2">
            <span class="label-num-questao text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Questão #${numeroQuestao}</span>
            
            <div class="flex flex-wrap items-center gap-3">
                <div class="flex items-center gap-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Leitura:</label>
                    <select class="b-tempo-leitura bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none text-amber-600 dark:text-amber-400">
                        ${[3, 5, 7, 10].map(v => `<option value="${v}" ${tempoLeituraVal === v ? 'selected' : ''}>${v}s</option>`).join('')}
                    </select>
                </div>

                <div class="flex items-center gap-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Resposta:</label>
                    <select class="b-tempo-resposta bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none text-purple-600 dark:text-purple-400">
                        ${[3, 5, 10, 15, 20, 30].map(v => `<option value="${v}" ${tempoRespostaVal === v ? 'selected' : ''}>${v}s</option>`).join('')}
                    </select>
                </div>

                <button type="button" onclick="removerBlocoPergunta(this)" class="text-red-400 hover:text-red-600 text-xs font-bold">Remover</button>
            </div>
        </div>

        <input type="text" value="${enunciadoVal}" placeholder="Digite o enunciado da questão..." class="b-enunciado w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500">
        
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            ${[0, 1, 2, 3].map(i => `
                <div class="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                    <input type="radio" name="correta_uid_${uid}" value="${i}" ${opcoesOrdenadas[i].is_correta ? 'checked' : ''} class="b-correta accent-purple-600 cursor-pointer" title="Marcar como correta">
                    <input type="text" value="${opcoesOrdenadas[i].texto}" placeholder="Alternativa ${i + 1}" class="b-opcao-texto w-full text-xs bg-transparent outline-none text-slate-800 dark:text-white">
                </div>
            `).join('')}
        </div>

        <div class="pt-1">
            <input type="text" value="${justificativaVal}" placeholder="💡 Justificativa / explicação da resposta correta (opcional)..." class="b-justificativa w-full px-3 py-1.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-amber-500">
        </div>
    `;
    container.appendChild(div);
}

function removerBlocoPergunta(btnEl) {
    const bloco = btnEl.closest(".group");
    if (bloco) bloco.remove();

    // Renumera visualmente as questões restantes
    const restantes = document.querySelectorAll("#container-perguntas-builder .label-num-questao");
    restantes.forEach((el, idx) => {
        el.textContent = `Questão #${idx + 1}`;
    });
}

// Salva novo quiz ou atualiza um quiz existente
async function salvarNovoQuiz() {
    const titulo = document.getElementById("quiz-titulo-input").value.trim();
    const descricao = document.getElementById("quiz-desc-input").value.trim();
    const btn = document.getElementById("btn-salvar-quiz");

    if (!titulo) {
        toast("Informe o título do questionário.", "error");
        return;
    }

    const blocos = document.querySelectorAll("#container-perguntas-builder > div");
    if (blocos.length === 0) {
        toast("Adicione ao menos uma pergunta.", "error");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Salvando...";

    try {
        const { data: { user } } = await supabase.auth.getUser();
        let targetQuizId = quizEmEdicaoId;

        if (quizEmEdicaoId) {
            // MODO EDIÇÃO:
            // 1. Atualiza título e descrição do questionário
            const { error: errUpd } = await supabase
                .from("quiz_questionarios")
                .update({ titulo, descricao })
                .eq("id", quizEmEdicaoId);

            if (errUpd) throw errUpd;

            // 2. Desvincula pergunta_atual_id de salas antigas para permitir recriar as perguntas sem bloqueio de FK
            await supabase
                .from("quiz_salas")
                .update({ pergunta_atual_id: null })
                .eq("questionario_id", quizEmEdicaoId);

            // 3. Remove as perguntas antigas (opções são removidas em cascata)
            const { error: errDelPerg } = await supabase
                .from("quiz_perguntas")
                .delete()
                .eq("questionario_id", quizEmEdicaoId);

            if (errDelPerg) throw errDelPerg;

        } else {
            // MODO CRIAÇÃO:
            const { data: quizCriado, error: errIns } = await supabase
                .from("quiz_questionarios")
                .insert([{ host_id: user.id, titulo, descricao }])
                .select()
                .single();

            if (errIns) throw errIns;
            targetQuizId = quizCriado.id;
        }

        // Insere as perguntas e opções atualizadas
        let ordemReal = 1;
        for (let i = 0; i < blocos.length; i++) {
            const b = blocos[i];
            const enunciado = b.querySelector(".b-enunciado").value.trim();
            if (!enunciado) continue;

            const justificativa = b.querySelector(".b-justificativa")?.value.trim() || null;
            const tempoLeitura = parseInt(b.querySelector(".b-tempo-leitura")?.value) || 5;
            const tempoResposta = parseInt(b.querySelector(".b-tempo-resposta")?.value) || 5;

            const { data: perguntaCriada, error: errP } = await supabase
                .from("quiz_perguntas")
                .insert([{
                    questionario_id: targetQuizId,
                    enunciado: enunciado,
                    justificativa: justificativa,
                    ordem: ordemReal++,
                    tempo_leitura_segundos: tempoLeitura,
                    tempo_segundos: tempoResposta
                }])
                .select()
                .single();

            if (errP) throw errP;

            const radioChecked = b.querySelector(".b-correta:checked");
            const indiceCorreto = radioChecked ? parseInt(radioChecked.value) : 0;
            const inputsOpcoes = b.querySelectorAll(".b-opcao-texto");

            const opcoesPayload = [];
            inputsOpcoes.forEach((inp, idx) => {
                opcoesPayload.push({
                    pergunta_id: perguntaCriada.id,
                    texto: inp.value.trim() || `Alternativa ${idx + 1}`,
                    is_correta: idx === indiceCorreto,
                    cor_indice: idx
                });
            });

            await supabase.from("quiz_opcoes").insert(opcoesPayload);
        }

        toast(quizEmEdicaoId ? "Questionário atualizado com sucesso!" : "Questionário criado com sucesso!");
        fecharModalQuiz();
        await carregarQuizzes();

    } catch (err) {
        console.error("Erro ao salvar questionário:", err);
        toast("Erro ao salvar questionário.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Salvar Questionário";
    }
}

// Abre confirmação de exclusão
function confirmarExclusaoQuiz(quizId) {
    const quiz = quizzesDisponiveis.find(q => q.id === quizId);
    if (!quiz) return;

    quizParaExcluirId = quizId;
    document.getElementById("nome-quiz-excluir").textContent = `"${quiz.titulo}"`;
    document.getElementById("modal-excluir-quiz").classList.remove("hidden");
}

function fecharModalExclusao() {
    quizParaExcluirId = null;
    document.getElementById("modal-excluir-quiz").classList.add("hidden");
}

async function executarExclusaoQuiz() {
    if (!quizParaExcluirId || !supabase) return;

    const btn = document.getElementById("btn-confirmar-exclusao");
    btn.disabled = true;
    btn.textContent = "Excluindo...";

    try {
        // Limpa referência de pergunta_atual_id nas salas antes de excluir em cascata
        await supabase
            .from("quiz_salas")
            .update({ pergunta_atual_id: null })
            .eq("questionario_id", quizParaExcluirId);

        const { error } = await supabase
            .from("quiz_questionarios")
            .delete()
            .eq("id", quizParaExcluirId);

        if (error) throw error;

        toast("Questionário excluído com sucesso!");
        fecharModalExclusao();
        await carregarQuizzes();

    } catch (err) {
        console.error("Erro ao excluir quiz:", err);
        toast("Não foi possível excluir o questionário.", "error");
    } finally {
        btn.disabled = false;
        btn.textContent = "Sim, Excluir";
    }
}

// ========================================================
// SALA AO VIVO, REALTIME E CRONÔMETRO EM MILISSEGUNDOS
// ========================================================
async function criarSalaAoVivo(quizId) {
    if (!supabase) return;

    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        const { data: perguntas } = await supabase
            .from("quiz_perguntas")
            .select(`id, ordem, enunciado, justificativa, tempo_segundos, tempo_leitura_segundos, quiz_opcoes (id, texto, is_correta, cor_indice)`)
            .eq("questionario_id", quizId)
            .order("ordem", { ascending: true });

        perguntasDaPartida = perguntas || [];
        indicePerguntaAtual = 0;
        participantesConectados = [];

        const codigoSala = Math.floor(100000 + Math.random() * 900000).toString();

        const { data: salaCriada, error } = await supabase
            .from("quiz_salas")
            .insert([{ codigo: codigoSala, questionario_id: quizId, host_id: user.id, status: 'lobby' }])
            .select()
            .single();

        if (error) throw error;
        salaAtiva = salaCriada;

        montarArenaLobby(codigoSala);
        iniciarRealtimeSala(salaAtiva.id);

        buscarParticipantesBanco(salaAtiva.id);
        if (lobbyPollInterval) clearInterval(lobbyPollInterval);
        lobbyPollInterval = setInterval(() => buscarParticipantesBanco(salaAtiva.id), 2500);

    } catch (err) {
        console.error("Erro ao criar sala:", err);
    }
}

function montarArenaLobby(codigoSala) {
    document.getElementById("view-dashboard").classList.add("hidden");
    document.getElementById("view-arena").classList.remove("hidden");
    document.getElementById("btn-sair-partida").classList.remove("hidden");

    document.getElementById("arena-lobby").classList.remove("hidden");
    document.getElementById("arena-pergunta").classList.add("hidden");
    document.getElementById("arena-resultado").classList.add("hidden");
    document.getElementById("arena-placar").classList.add("hidden");
    document.getElementById("arena-podio").classList.add("hidden");

    document.getElementById("lobby-pin").textContent = codigoSala;
    document.getElementById("lobby-count").textContent = "0";
    document.getElementById("lobby-participantes-grid").innerHTML = `<p class="text-xs text-slate-400 italic">Aguardando participantes...</p>`;
    document.getElementById("btn-iniciar-jogo").disabled = true;

    const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const urlAluno = `${baseDir}/play.html?sala=${codigoSala}`;

    const qrContainer = document.getElementById("lobby-qrcode");
    qrContainer.innerHTML = "";
    new QRCode(qrContainer, {
        text: urlAluno,
        width: 180,
        height: 180,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: QRCode.CorrectLevel.M
    });
}

async function buscarParticipantesBanco(salaId) {
    if (!salaAtiva || salaAtiva.id !== salaId) return;

    const { data: parts } = await supabase
        .from("quiz_participantes")
        .select("*")
        .eq("sala_id", salaId);

    if (parts) {
        parts.forEach(p => {
            if (!participantesConectados.some(x => x.id === p.id)) {
                participantesConectados.push(p);
            }
        });
        atualizarLobbyParticipantes();
    }
}

function iniciarRealtimeSala(salaId) {
    if (realtimeChannel) realtimeChannel.unsubscribe();

    realtimeChannel = supabase
        .channel(`quiz_sala_${salaId}`)
        .on('broadcast', { event: 'novo_participante' }, (payload) => {
            const p = payload.payload;
            if (!participantesConectados.some(x => x.id === p.id)) {
                participantesConectados.push(p);
                atualizarLobbyParticipantes();
            }
        })
        .on('broadcast', { event: 'reacao' }, (payload) => {
            dispararEfeitoEmoji(payload.payload.emoji);
        })
        .on('broadcast', { event: 'novo_voto' }, (payload) => {
            registrarVotoMemoria(payload.payload);
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'quiz_participantes',
            filter: `sala_id=eq.${salaId}`
        }, (payload) => {
            if (!participantesConectados.some(x => x.id === payload.new.id)) {
                participantesConectados.push(payload.new);
                atualizarLobbyParticipantes();
            }
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'quiz_respostas',
            filter: `sala_id=eq.${salaId}`
        }, (payload) => {
            registrarVotoMemoria(payload.new);
        })
        .subscribe();
}

function registrarVotoMemoria(voto) {
    const pergunta = perguntasDaPartida[indicePerguntaAtual];
    if (!pergunta || voto.pergunta_id !== pergunta.id) return;

    if (!respostasRecebidas.some(r => r.participante_id === voto.participante_id)) {
        respostasRecebidas.push(voto);
        document.getElementById("pergunta-respostas-count").textContent = respostasRecebidas.length;

        if (fasePergunta === 'valendo' && participantesConectados.length > 0 && respostasRecebidas.length >= participantesConectados.length) {
            finalizarTempoPergunta();
        }
    }
}

function atualizarLobbyParticipantes() {
    const grid = document.getElementById("lobby-participantes-grid");
    document.getElementById("lobby-count").textContent = participantesConectados.length;
    document.getElementById("btn-iniciar-jogo").disabled = participantesConectados.length === 0;

    grid.innerHTML = participantesConectados.map(p => `
        <span class="px-3.5 py-1.5 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-white rounded-xl text-xs font-bold shadow-xs">
            ${p.apelido}
        </span>
    `).join("");
}

async function iniciarPartida() {
    if (lobbyPollInterval) clearInterval(lobbyPollInterval);
    indicePerguntaAtual = 0;
    await dispararPerguntaAtual();
}

async function dispararPerguntaAtual() {
    const pergunta = perguntasDaPartida[indicePerguntaAtual];
    if (!pergunta) {
        exibirPodioFinal();
        return;
    }

    fasePergunta = 'leitura';
    respostasRecebidas = [];
    document.getElementById("pergunta-respostas-count").textContent = "0";

    const tempoLeitura = pergunta.tempo_leitura_segundos || 5;

    await supabase
        .from("quiz_salas")
        .update({ status: 'preparando', pergunta_atual_id: pergunta.id })
        .eq("id", salaAtiva.id);

    if (realtimeChannel) {
        realtimeChannel.send({
            type: 'broadcast',
            event: 'mudar_status',
            payload: {
                status: 'preparando',
                perguntaId: pergunta.id,
                enunciado: pergunta.enunciado,
                tempo: tempoLeitura
            }
        });
    }

    document.getElementById("arena-lobby").classList.add("hidden");
    document.getElementById("arena-resultado").classList.add("hidden");
    document.getElementById("arena-placar").classList.add("hidden");
    document.getElementById("arena-pergunta").classList.remove("hidden");

    document.getElementById("pergunta-numero-badge").textContent = `Questão ${indicePerguntaAtual + 1} de ${perguntasDaPartida.length}`;
    document.getElementById("pergunta-enunciado").textContent = pergunta.enunciado;

    const badgeFase = document.getElementById("pergunta-fase-badge");
    badgeFase.textContent = "⏳ PREPARE-SE! LEIA A PERGUNTA";
    badgeFase.className = "px-3 py-1 rounded-full text-xs font-black bg-amber-500/20 text-amber-500 border border-amber-500/30";

    document.getElementById("pergunta-aviso-preparacao").classList.remove("hidden");
    const containerOpcoes = document.getElementById("pergunta-opcoes-grid");
    containerOpcoes.classList.add("hidden");
    containerOpcoes.classList.remove("grid");

    containerOpcoes.innerHTML = "";
    const opcoesOrdenadas = [...(pergunta.quiz_opcoes || [])].sort((a, b) => a.cor_indice - b.cor_indice);
    opcoesOrdenadas.forEach((opc, idx) => {
        const cfg = OPCOES_CONFIG[idx % 4];
        containerOpcoes.innerHTML += `
            <div class="${cfg.cor} p-6 rounded-2xl flex items-center gap-4 shadow-lg text-left transform transition-all">
                <span class="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center font-black text-xl shrink-0">${cfg.icone}</span>
                <span class="text-lg md:text-xl font-bold leading-tight">${opc.texto}</span>
            </div>
        `;
    });

    iniciarContadorMilissegundos(tempoLeitura, "amber", () => {
        liberarOpcoesParaResposta();
    });
}

async function liberarOpcoesParaResposta() {
    const pergunta = perguntasDaPartida[indicePerguntaAtual];
    if (!pergunta || fasePergunta !== 'leitura') return;

    fasePergunta = 'valendo';
    const tempoResposta = pergunta.tempo_segundos || 5;

    document.getElementById("pergunta-aviso-preparacao").classList.add("hidden");
    const containerOpcoes = document.getElementById("pergunta-opcoes-grid");
    containerOpcoes.classList.remove("hidden");
    containerOpcoes.classList.add("grid");

    const badgeFase = document.getElementById("pergunta-fase-badge");
    badgeFase.textContent = "⚡ VALENDO! RESPONDA RÁPIDO!";
    badgeFase.className = "px-3 py-1 rounded-full text-xs font-black bg-red-500/20 text-red-500 border border-red-500/30 animate-pulse";

    if (realtimeChannel) {
        realtimeChannel.send({
            type: 'broadcast',
            event: 'mudar_status',
            payload: {
                status: 'pergunta',
                perguntaId: pergunta.id,
                enunciado: pergunta.enunciado,
                tempo: tempoResposta
            }
        });
    }

    const agoraIso = new Date().toISOString();
    supabase
        .from("quiz_salas")
        .update({ status: 'pergunta', pergunta_atual_id: pergunta.id, pergunta_iniciada_em: agoraIso })
        .eq("id", salaAtiva.id)
        .then();

    iniciarContadorMilissegundos(tempoResposta, "red", () => {
        finalizarTempoPergunta();
    });
}

function iniciarContadorMilissegundos(segundosTotais, temaCor, onComplete) {
    if (timerInterval) clearInterval(timerInterval);

    const duracaoMs = segundosTotais * 1000;
    const fimTimestamp = performance.now() + duracaoMs;
    const labelSegundos = document.getElementById("pergunta-segundos");
    const bar = document.getElementById("timer-bar");

    if (temaCor === "amber") {
        bar.className = "bg-amber-500 h-full w-full";
        labelSegundos.className = "tabular-timer font-mono text-3xl md:text-4xl font-black text-amber-500";
    } else {
        bar.className = "bg-purple-600 h-full w-full";
        labelSegundos.className = "tabular-timer font-mono text-3xl md:text-4xl font-black text-purple-600 dark:text-purple-400";
    }

    timerInterval = setInterval(() => {
        const agora = performance.now();
        const restanteMs = Math.max(0, fimTimestamp - agora);
        const segundosFormatados = (restanteMs / 1000).toFixed(2).padStart(5, '0');

        labelSegundos.textContent = `${segundosFormatados}s`;
        bar.style.width = `${(restanteMs / duracaoMs) * 100}%`;

        if (temaCor === "red" && restanteMs <= 2500) {
            bar.className = "bg-red-600 h-full";
            labelSegundos.className = "tabular-timer font-mono text-3xl md:text-4xl font-black text-red-500 scale-105 transition-transform";
        }

        if (restanteMs <= 0) {
            clearInterval(timerInterval);
            labelSegundos.textContent = "00.00s";
            bar.style.width = "0%";
            if (typeof onComplete === "function") onComplete();
        }
    }, 25);
}

function forcarFimPergunta() {
    if (timerInterval) clearInterval(timerInterval);
    if (fasePergunta === 'leitura') {
        liberarOpcoesParaResposta();
    } else {
        finalizarTempoPergunta();
    }
}

async function finalizarTempoPergunta() {
    if (timerInterval) clearInterval(timerInterval);
    if (fasePergunta === 'encerrada') return;
    fasePergunta = 'encerrada';

    const pergunta = perguntasDaPartida[indicePerguntaAtual];

    if (realtimeChannel) {
        realtimeChannel.send({
            type: 'broadcast',
            event: 'mudar_status',
            payload: { status: 'placar', perguntaId: pergunta.id }
        });
    }

    await new Promise(r => setTimeout(r, 350));
    await supabase.from("quiz_salas").update({ status: 'placar' }).eq("id", salaAtiva.id);

    const { data: votosBanco } = await supabase
        .from("quiz_respostas")
        .select("opcao_id, participante_id, tempo_gasto_segundos")
        .eq("pergunta_id", pergunta.id)
        .eq("sala_id", salaAtiva.id);

    const mapaVotos = new Map();
    respostasRecebidas.forEach(v => mapaVotos.set(v.participante_id, v));
    if (votosBanco) {
        votosBanco.forEach(v => mapaVotos.set(v.participante_id, v));
    }
    const votosValidos = Array.from(mapaVotos.values());
    const totalVotos = votosValidos.length;

    document.getElementById("arena-pergunta").classList.add("hidden");
    document.getElementById("arena-resultado").classList.remove("hidden");
    document.getElementById("resultado-enunciado-resumo").textContent = pergunta.enunciado;

    const containerBarras = document.getElementById("resultado-barras");
    containerBarras.innerHTML = "";

    const opcoesOrdenadas = [...(pergunta.quiz_opcoes || [])].sort((a, b) => a.cor_indice - b.cor_indice);
    opcoesOrdenadas.forEach((opc, idx) => {
        const cfg = OPCOES_CONFIG[idx % 4];
        const votosDestaOpcao = votosValidos.filter(r => r.opcao_id === opc.id);
        const votosNesta = votosDestaOpcao.length;
        const porcentagem = totalVotos > 0 ? Math.round((votosNesta / totalVotos) * 100) : 0;
        
        // Calcula a média de tempo de quem escolheu esta alternativa
        let tempoMedioStr = "";
        if (votosNesta > 0) {
            const somaTempos = votosDestaOpcao.reduce((acc, curr) => acc + (parseFloat(curr.tempo_gasto_segundos) || 0), 0);
            const media = somaTempos / votosNesta;
            tempoMedioStr = ` ⏱️ ${media.toFixed(2)}s`;
        }

        const destaqueCorreta = opc.is_correta
            ? "ring-2 ring-emerald-500 bg-emerald-50/50 dark:bg-emerald-950/30"
            : "opacity-65";

    containerBarras.innerHTML += `
            <div class="flex items-center gap-3 text-left">
                <span class="w-9 h-9 rounded-xl ${cfg.cor} flex items-center justify-center font-bold text-sm shrink-0">${cfg.icone}</span>
                <div class="flex-1 bg-slate-100 dark:bg-slate-800 rounded-xl overflow-hidden h-11 flex items-center px-4 relative border border-slate-200 dark:border-slate-700 ${destaqueCorreta}">
                    <div class="absolute left-0 top-0 bottom-0 ${cfg.cor} opacity-35 transition-all duration-500" style="width: ${porcentagem}%"></div>
                    <span class="relative z-10 text-xs md:text-sm font-bold text-slate-800 dark:text-white flex-1 truncate">
                        ${opc.texto} ${opc.is_correta ? '<span class="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500 text-white">Correta</span>' : ''}
                    </span>
                    <span class="relative z-10 text-xs font-black text-slate-700 dark:text-slate-200 font-mono">${votosNesta} ${votosNesta === 1 ? 'voto' : 'votos'} (${porcentagem}%)${tempoMedioStr}</span>
                </div>
                ${opc.is_correta ? '<span class="text-emerald-500 font-black text-xl">✔</span>' : '<span class="text-transparent text-xl">✔</span>'}
            </div>
        `;
    });

    // Exibe o bloco de justificativa se houver explicação cadastrada para a questão
    if (pergunta.justificativa) {
        containerBarras.innerHTML += `
            <div class="mt-5 p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800/60 text-left flex items-start gap-3">
                <span class="text-xl shrink-0">💡</span>
                <div>
                    <p class="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400">Justificativa da Resposta</p>
                    <p class="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5 leading-relaxed">${pergunta.justificativa}</p>
                </div>
            </div>
        `;
    }
}

async function avancarParaPlacar() {
    const { data: ranking } = await supabase
        .from("quiz_participantes")
        .select("id, apelido, pontos")
        .eq("sala_id", salaAtiva.id)
        .order("pontos", { ascending: false });

    document.getElementById("arena-resultado").classList.add("hidden");
    document.getElementById("arena-placar").classList.remove("hidden");

    const lista = document.getElementById("placar-lista");
    lista.innerHTML = "";

    (ranking || []).slice(0, 5).forEach((p, idx) => {
        const medalhas = ['🥇', '🥈', '🥉'];
        const iconePos = medalhas[idx] || `<span class="w-5 text-center font-black">${idx + 1}º</span>`;
        lista.innerHTML += `
            <div class="flex justify-between items-center p-3.5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-xs">
                <div class="flex items-center gap-3">
                    <span class="text-xl">${iconePos}</span>
                    <span class="font-bold text-sm text-slate-800 dark:text-white">${p.apelido}</span>
                </div>
                <span class="font-mono font-black text-sm text-purple-600 dark:text-purple-400">${p.pontos} pts</span>
            </div>
        `;
    });

    const isUltima = indicePerguntaAtual + 1 >= perguntasDaPartida.length;
    document.getElementById("btn-proxima-etapa-txt").textContent = isUltima ? "Finalizar e Ver Ranking Geral 🏆" : "Próxima Pergunta ➔";
}

function avancarRodada() {
    indicePerguntaAtual++;
    if (indicePerguntaAtual >= perguntasDaPartida.length) {
        exibirPodioFinal();
    } else {
        dispararPerguntaAtual();
    }
}

async function exibirPodioFinal() {
    await supabase.from("quiz_salas").update({ status: 'finalizado' }).eq("id", salaAtiva.id);

    if (realtimeChannel) {
        realtimeChannel.send({
            type: 'broadcast',
            event: 'mudar_status',
            payload: { status: 'finalizado', perguntaId: null }
        });
    }

    const { data: ranking } = await supabase
        .from("quiz_participantes")
        .select("apelido, pontos")
        .eq("sala_id", salaAtiva.id)
        .order("pontos", { ascending: false });

    document.getElementById("arena-placar").classList.add("hidden");
    document.getElementById("arena-podio").classList.remove("hidden");

    document.getElementById("podio-nome-1").textContent = ranking?.[0]?.apelido || "--";
    document.getElementById("podio-pontos-1").textContent = `${ranking?.[0]?.pontos || 0} pts`;

    document.getElementById("podio-nome-2").textContent = ranking?.[1]?.apelido || "--";
    document.getElementById("podio-pontos-2").textContent = `${ranking?.[1]?.pontos || 0} pts`;

    document.getElementById("podio-nome-3").textContent = ranking?.[2]?.apelido || "--";
    document.getElementById("podio-pontos-3").textContent = `${ranking?.[2]?.pontos || 0} pts`;

    if (typeof confetti === "function") {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
}

async function voltarParaDashboard() {
    if (timerInterval) clearInterval(timerInterval);
    if (lobbyPollInterval) clearInterval(lobbyPollInterval);

    // Se houver uma sala aberta, derruba todos os participantes conectados
    if (salaAtiva && salaAtiva.id) {
        // 1. Avisa os celulares instantaneamente via WebSocket
        if (realtimeChannel) {
            await realtimeChannel.send({
                type: 'broadcast',
                event: 'mudar_status',
                payload: { status: 'encerrado', perguntaId: null }
            });
        }

        // 2. Marca a sala como encerrada no banco para ninguém mais entrar ou restaurar sessão
        await supabase
            .from("quiz_salas")
            .update({ status: 'encerrado', pergunta_atual_id: null })
            .eq("id", salaAtiva.id);
    }

    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    salaAtiva = null;
    participantesConectados = [];
    respostasRecebidas = [];

    document.getElementById("view-arena").classList.add("hidden");
    document.getElementById("btn-sair-partida").classList.add("hidden");
    document.getElementById("view-dashboard").classList.remove("hidden");
    carregarQuizzes();
}

function toggleFullScreen() {
    if (!document.fullscreenElement) document.documentElement.requestFullscreen().catch(() => {});
    else if (document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function toast(message, type = 'success') {
    if (window.parent && typeof window.parent.showToast === 'function') {
        window.parent.showToast(message, type);
        return;
    }

    let container = document.getElementById('local-toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'local-toast-container';
        container.className = 'fixed bottom-6 right-6 z-[9999] flex flex-col gap-2 pointer-events-none';
        document.body.appendChild(container);
    }

    const el = document.createElement('div');
    const bgColors = type === 'error'
        ? 'bg-red-600 text-white'
        : 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border border-slate-700 dark:border-slate-200';

    el.className = `pointer-events-auto px-5 py-3 rounded-xl text-xs font-black uppercase tracking-widest shadow-2xl transition-all transform translate-y-2 opacity-0 ${bgColors}`;
    el.textContent = message;

    container.appendChild(el);
    setTimeout(() => el.classList.remove('translate-y-2', 'opacity-0'), 10);
    setTimeout(() => {
        el.classList.add('translate-y-2', 'opacity-0');
        setTimeout(() => el.remove(), 300);
    }, 3500);
}

// Copia o link direto de acesso do aluno para a área de transferência
function copiarLinkSala() {
    if (!salaAtiva || !salaAtiva.codigo) {
        toast("Nenhuma sala ativa no momento.", "error");
        return;
    }

    const baseDir = window.location.href.substring(0, window.location.href.lastIndexOf('/'));
    const urlAluno = `${baseDir}/play.html?sala=${salaAtiva.codigo}`;

    navigator.clipboard.writeText(urlAluno).then(() => {
        toast("Link copiado para a área de transferência!");
    }).catch(() => {
        toast("Falha ao copiar o link.", "error");
    });
}