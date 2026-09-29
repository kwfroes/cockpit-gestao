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
let fasePergunta = 'idle'; // 'leitura' | 'valendo' | 'encerrada' | 'nuvem' | 'nuvem_resultado'

// Nuvem de palavras
let palavrasNuvem = new Map();      // id da resposta -> { id, participante_id, pergunta_id, texto, oculta }
let nuvemElementos = new Map();     // chave normalizada -> <span> no telão
let chavesNuvemBloqueadas = new Set(); // palavras ocultadas pelo instrutor (novas iguais já chegam ocultas)
let nuvemPollInterval = null;
let nuvemRenderAgendado = false;
let nuvemResizeObserver = null;

// Controle de Edição e Exclusão
let quizEmEdicaoId = null;
let quizParaExcluirId = null;
let contadorUidPergunta = 0;

// Palavra mais citada de uma sessão encerrada (dashboard), agrupando por grafia/acentuação
function palavraMaisCitadaHistorico(lista) {
    const grupos = new Map();
    (lista || []).forEach(r => {
        const chave = chaveNuvem(r.texto);
        if (!chave) return;
        let g = grupos.get(chave);
        if (!g) { g = { total: 0, formas: new Map() }; grupos.set(chave, g); }
        g.total++;
        const forma = String(r.texto).trim();
        g.formas.set(forma, (g.formas.get(forma) || 0) + 1);
    });

    let melhor = null;
    grupos.forEach((g, chave) => {
        if (!melhor || g.total > melhor.total) {
            let exibicao = "", maior = 0;
            g.formas.forEach((qtd, forma) => { if (qtd > maior) { maior = qtd; exibicao = forma; } });
            melhor = { chave, total: g.total, exibicao };
        }
    });
    return melhor;
}

// Escapa texto digitado por usuários antes de inserir via innerHTML (evita XSS no telão)
function escapeHtml(valor) {
    return String(valor ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

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
                quiz_perguntas (id, tipo),
                quiz_salas (
                    id, codigo, status, created_at,
                    quiz_participantes (apelido, pontos),
                    quiz_nuvem_respostas (texto)
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
        const qtdNuvens = (q.quiz_perguntas || []).filter(p => p.tipo === 'nuvem').length;
        const quizEhSoNuvem = qtdPerguntas > 0 && qtdNuvens === qtdPerguntas;

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
                            ${quizEhSoNuvem ? '☁️' : '🏆'} <span>${quizEhSoNuvem ? 'Palavra mais citada por partida' : 'Vencedores por partida'} (${qtdUsos})</span>
                        </span>
                        <span class="text-[10px] transition-transform group-open/hist:rotate-180">▼</span>
                    </summary>
                    <div class="mt-2 space-y-1.5 max-h-32 overflow-y-auto pr-1">
                        ${salasComJogadores.map(s => {
                            const dataPartida = new Date(s.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });

                            let linhaDestaque;
                            if (quizEhSoNuvem) {
                                const top = palavraMaisCitadaHistorico(s.quiz_nuvem_respostas || []);
                                linhaDestaque = top
                                    ? `☁️ ${escapeHtml(top.exibicao)} <strong class="text-sky-600 dark:text-sky-400 font-mono">(${top.total}x)</strong>`
                                    : `<span class="italic text-slate-400">Sem palavras enviadas</span>`;
                            } else {
                                const ranking = [...s.quiz_participantes].sort((a, b) => b.pontos - a.pontos);
                                const vencedor = ranking[0];
                                linhaDestaque = `👑 ${escapeHtml(vencedor.apelido)} <strong class="text-purple-600 dark:text-purple-400 font-mono">(${vencedor.pontos} pts)</strong>`;
                            }

                            return `
                                <div class="flex justify-between items-center bg-slate-50 dark:bg-slate-950 px-2.5 py-1.5 rounded-lg border border-slate-200/60 dark:border-slate-800">
                                    <span class="text-[10px] font-mono text-slate-400">Sala #${s.codigo} (${dataPartida})</span>
                                    <span class="text-[11px] font-bold text-slate-700 dark:text-slate-200 truncate max-w-[140px]">
                                        ${linhaDestaque}
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
                        ${qtdNuvens > 0 ? `
                        <span class="text-[10px] font-bold px-2 py-1 rounded-md bg-sky-50 dark:bg-sky-900/30 text-sky-600 dark:text-sky-300">
                            ☁️ ${qtdNuvens} ${qtdNuvens === 1 ? 'nuvem' : 'nuvens'}
                        </span>` : ''}
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

                <h3 class="font-bold text-slate-800 dark:text-white text-base mt-1">${escapeHtml(q.titulo)}</h3>
                <p class="text-xs text-slate-500 mt-1 line-clamp-2">${escapeHtml(q.descricao || 'Sem descrição.')}</p>

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
                    id, ordem, tipo, max_palavras, enunciado, justificativa, tempo_segundos, tempo_leitura_segundos,
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

    const tipoVal = dadosPergunta && dadosPergunta.tipo === 'nuvem' ? 'nuvem' : 'multipla';
    const maxPalavrasVal = dadosPergunta ? (dadosPergunta.max_palavras || 1) : 1;
    const enunciadoVal = escapeHtml(dadosPergunta ? dadosPergunta.enunciado : "");
    const justificativaVal = escapeHtml(dadosPergunta ? dadosPergunta.justificativa : "");
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
            texto: salvas[i] ? escapeHtml(salvas[i].texto) : "",
            is_correta: salvas[i] ? !!salvas[i].is_correta : (i === 0)
        }));
    }

    const div = document.createElement("div");
    div.className = "bloco-pergunta p-4 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3 relative group";
    div.dataset.tipo = tipoVal;
    div.innerHTML = `
        <div class="flex flex-wrap justify-between items-center gap-2">
            <div class="flex items-center gap-2">
                <span class="label-num-questao text-xs font-bold text-purple-600 dark:text-purple-400 uppercase">Questão #${numeroQuestao}</span>
                <select class="b-tipo bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none text-slate-700 dark:text-slate-200" onchange="alternarTipoBloco(this)">
                    <option value="multipla" ${tipoVal === 'multipla' ? 'selected' : ''}>🔘 Múltipla escolha</option>
                    <option value="nuvem" ${tipoVal === 'nuvem' ? 'selected' : ''}>☁️ Nuvem de palavras</option>
                </select>
            </div>

            <div class="flex flex-wrap items-center gap-3">
                <div class="b-so-multipla flex items-center gap-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Leitura:</label>
                    <select class="b-tempo-leitura bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none text-amber-600 dark:text-amber-400">
                        ${[3, 5, 7, 10].map(v => `<option value="${v}" ${tempoLeituraVal === v ? 'selected' : ''}>${v}s</option>`).join('')}
                    </select>
                </div>

                <div class="b-so-multipla flex items-center gap-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Resposta:</label>
                    <select class="b-tempo-resposta bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none text-purple-600 dark:text-purple-400">
                        ${[3, 5, 10, 15, 20, 30].map(v => `<option value="${v}" ${tempoRespostaVal === v ? 'selected' : ''}>${v}s</option>`).join('')}
                    </select>
                </div>

                <div class="b-so-nuvem flex items-center gap-1">
                    <label class="text-[10px] font-bold text-slate-400 uppercase">Palavras por pessoa:</label>
                    <select class="b-max-palavras bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 text-xs font-bold rounded-lg px-2 py-1 outline-none text-sky-600 dark:text-sky-400">
                        ${[1, 2, 3, 5].map(v => `<option value="${v}" ${maxPalavrasVal === v ? 'selected' : ''}>${v}</option>`).join('')}
                    </select>
                </div>

                <button type="button" onclick="removerBlocoPergunta(this)" class="text-red-400 hover:text-red-600 text-xs font-bold">Remover</button>
            </div>
        </div>

        <input type="text" value="${enunciadoVal}" placeholder="Digite o enunciado da questão..." class="b-enunciado w-full px-3 py-1.5 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-xs font-medium outline-none focus:ring-2 focus:ring-purple-500">

        <div class="b-so-multipla grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
            ${[0, 1, 2, 3].map(i => `
                <div class="flex items-center gap-2 bg-white dark:bg-slate-900 p-2 rounded-lg border border-slate-200 dark:border-slate-800">
                    <input type="radio" name="correta_uid_${uid}" value="${i}" ${opcoesOrdenadas[i].is_correta ? 'checked' : ''} class="b-correta accent-purple-600 cursor-pointer" title="Marcar como correta">
                    <input type="text" value="${opcoesOrdenadas[i].texto}" placeholder="Alternativa ${i + 1}" class="b-opcao-texto w-full text-xs bg-transparent outline-none text-slate-800 dark:text-white">
                </div>
            `).join('')}
        </div>

        <div class="b-so-multipla pt-1">
            <input type="text" value="${justificativaVal}" placeholder="💡 Justificativa / explicação da resposta correta (opcional)..." class="b-justificativa w-full px-3 py-1.5 bg-amber-50/60 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800/50 rounded-lg text-xs text-slate-700 dark:text-slate-300 outline-none focus:ring-2 focus:ring-amber-500">
        </div>

        <p class="b-so-nuvem text-[11px] text-slate-500 dark:text-slate-400 bg-sky-50/70 dark:bg-sky-950/20 border border-sky-200 dark:border-sky-800/50 rounded-lg px-3 py-2">
            Cada participante envia até o número de palavras escolhido acima (até 25 caracteres cada). Não vale pontos e não tem resposta certa; você encerra as respostas quando quiser.
        </p>
    `;
    container.appendChild(div);
    aplicarTipoBloco(div);
}

function alternarTipoBloco(selectEl) {
    const bloco = selectEl.closest(".bloco-pergunta");
    if (!bloco) return;
    bloco.dataset.tipo = selectEl.value;
    aplicarTipoBloco(bloco);
}

function aplicarTipoBloco(bloco) {
    const isNuvem = bloco.dataset.tipo === 'nuvem';
    bloco.querySelectorAll(".b-so-multipla").forEach(el => el.classList.toggle("hidden", isNuvem));
    bloco.querySelectorAll(".b-so-nuvem").forEach(el => el.classList.toggle("hidden", !isNuvem));
    const enunciado = bloco.querySelector(".b-enunciado");
    if (enunciado) {
        enunciado.placeholder = isNuvem
            ? "Ex: Em uma palavra, o que você espera deste curso?"
            : "Digite o enunciado da questão...";
    }
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

            const tipo = b.querySelector(".b-tipo")?.value === 'nuvem' ? 'nuvem' : 'multipla';
            const isNuvem = tipo === 'nuvem';
            const justificativa = isNuvem ? null : (b.querySelector(".b-justificativa")?.value.trim() || null);
            const tempoLeitura = parseInt(b.querySelector(".b-tempo-leitura")?.value) || 5;
            const tempoResposta = parseInt(b.querySelector(".b-tempo-resposta")?.value) || 5;
            const maxPalavras = parseInt(b.querySelector(".b-max-palavras")?.value) || 1;

            const { data: perguntaCriada, error: errP } = await supabase
                .from("quiz_perguntas")
                .insert([{
                    questionario_id: targetQuizId,
                    tipo: tipo,
                    max_palavras: maxPalavras,
                    enunciado: enunciado,
                    justificativa: justificativa,
                    ordem: ordemReal++,
                    tempo_leitura_segundos: tempoLeitura,
                    tempo_segundos: tempoResposta
                }])
                .select()
                .single();

            if (errP) throw errP;

            // Nuvem de palavras não tem alternativas
            if (isNuvem) continue;

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
            .select(`id, ordem, tipo, max_palavras, enunciado, justificativa, tempo_segundos, tempo_leitura_segundos, quiz_opcoes (id, texto, is_correta, cor_indice)`)
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
    document.getElementById("arena-nuvem").classList.add("hidden");

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
        .on('broadcast', { event: 'nova_palavra' }, (payload) => {
            registrarPalavraNuvem(payload.payload);
        })
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'quiz_nuvem_respostas',
            filter: `sala_id=eq.${salaId}`
        }, (payload) => {
            registrarPalavraNuvem(payload.new);
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
            ${escapeHtml(p.apelido)}
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

    if (pergunta.tipo === 'nuvem') {
        await iniciarNuvem(pergunta);
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
    document.getElementById("arena-nuvem").classList.add("hidden");
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
                <span class="text-lg md:text-xl font-bold leading-tight">${escapeHtml(opc.texto)}</span>
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
                        ${escapeHtml(opc.texto)} ${opc.is_correta ? '<span class="ml-2 text-[10px] font-black uppercase px-2 py-0.5 rounded bg-emerald-500 text-white">Correta</span>' : ''}
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
                    <p class="text-xs md:text-sm font-medium text-slate-700 dark:text-slate-200 mt-0.5 leading-relaxed">${escapeHtml(pergunta.justificativa)}</p>
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
                    <span class="font-bold text-sm text-slate-800 dark:text-white">${escapeHtml(p.apelido)}</span>
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
    document.getElementById("arena-nuvem").classList.add("hidden");
    document.getElementById("arena-podio").classList.remove("hidden");

    // Partida só com nuvens de palavras: não há pontuação para premiar
    const temPontuacao = perguntasDaPartida.some(p => p.tipo !== 'nuvem');
    document.getElementById("podio-steps").classList.toggle("hidden", !temPontuacao);
    document.getElementById("podio-eyebrow").textContent = temPontuacao ? "Grande Final" : "Atividade concluída";
    document.getElementById("podio-titulo").textContent = temPontuacao ? "Pódio dos Campeões 🎉" : "Obrigado pela participação ☁️";

    document.getElementById("podio-nome-1").textContent = ranking?.[0]?.apelido || "--";
    document.getElementById("podio-pontos-1").textContent = `${ranking?.[0]?.pontos || 0} pts`;

    document.getElementById("podio-nome-2").textContent = ranking?.[1]?.apelido || "--";
    document.getElementById("podio-pontos-2").textContent = `${ranking?.[1]?.pontos || 0} pts`;

    document.getElementById("podio-nome-3").textContent = ranking?.[2]?.apelido || "--";
    document.getElementById("podio-pontos-3").textContent = `${ranking?.[2]?.pontos || 0} pts`;

    if (temPontuacao && typeof confetti === "function") {
        confetti({ particleCount: 150, spread: 80, origin: { y: 0.6 } });
    }
}

async function voltarParaDashboard() {
    if (timerInterval) clearInterval(timerInterval);
    if (lobbyPollInterval) clearInterval(lobbyPollInterval);
    if (nuvemPollInterval) { clearInterval(nuvemPollInterval); nuvemPollInterval = null; }
    fasePergunta = 'idle';

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

// ========================================================
// NUVEM DE PALAVRAS (TELÃO)
// ========================================================
const CORES_NUVEM = [
    'text-purple-600 dark:text-purple-400',
    'text-sky-600 dark:text-sky-400',
    'text-emerald-600 dark:text-emerald-400',
    'text-rose-600 dark:text-rose-400',
    'text-amber-600 dark:text-amber-400',
    'text-indigo-600 dark:text-indigo-400',
    'text-teal-600 dark:text-teal-400',
    'text-fuchsia-600 dark:text-fuchsia-400'
];

// "Transparência", "transparencia" e " TRANSPARÊNCIA " viram a mesma chave
function chaveNuvem(texto) {
    return String(texto || "")
        .trim()
        .toLowerCase()
        .normalize("NFD").replace(/[\u0300-\u036f]/g, "")
        .replace(/\s+/g, " ");
}

// Número estável por palavra: define cor, orientação e ângulo inicial na espiral
function hashNuvem(chave) {
    let h = 0;
    for (let i = 0; i < chave.length; i++) h = (h * 31 + chave.charCodeAt(i)) >>> 0;
    return h;
}

function corNuvem(chave) {
    return CORES_NUVEM[hashNuvem(chave) % CORES_NUVEM.length];
}

function perguntaNuvemAtual() {
    const p = perguntasDaPartida[indicePerguntaAtual];
    return p && p.tipo === 'nuvem' ? p : null;
}

async function iniciarNuvem(pergunta) {
    if (timerInterval) clearInterval(timerInterval);
    if (nuvemPollInterval) clearInterval(nuvemPollInterval);

    fasePergunta = 'nuvem';
    palavrasNuvem = new Map();
    nuvemElementos = new Map();
    chavesNuvemBloqueadas = new Set();

    await supabase
        .from("quiz_salas")
        .update({ status: 'nuvem', pergunta_atual_id: pergunta.id })
        .eq("id", salaAtiva.id);

    if (realtimeChannel) {
        realtimeChannel.send({
            type: 'broadcast',
            event: 'mudar_status',
            payload: {
                status: 'nuvem',
                perguntaId: pergunta.id,
                enunciado: pergunta.enunciado,
                maxPalavras: pergunta.max_palavras || 1
            }
        });
    }

    ["arena-lobby", "arena-pergunta", "arena-resultado", "arena-placar", "arena-podio"]
        .forEach(id => document.getElementById(id).classList.add("hidden"));
    document.getElementById("arena-nuvem").classList.remove("hidden");

    document.getElementById("nuvem-numero-badge").textContent = `Questão ${indicePerguntaAtual + 1} de ${perguntasDaPartida.length}`;
    document.getElementById("nuvem-enunciado").textContent = pergunta.enunciado;

    const badge = document.getElementById("nuvem-fase-badge");
    badge.textContent = "☁️ Recebendo palavras";
    badge.className = "px-3 py-1 rounded-full text-xs font-black bg-sky-500/15 text-sky-600 dark:text-sky-400 border border-sky-500/30 animate-pulse";

    document.getElementById("btn-encerrar-nuvem").classList.remove("hidden");
    document.getElementById("btn-nuvem-proxima").classList.add("hidden");

    const containerNuvem = document.getElementById("nuvem-container");
    containerNuvem.innerHTML = "";
    // Reorganiza a nuvem quando o tamanho muda (ex.: entrar/sair do Modo Telão)
    if (!nuvemResizeObserver && typeof ResizeObserver === "function") {
        nuvemResizeObserver = new ResizeObserver(() => agendarRenderNuvem());
        nuvemResizeObserver.observe(containerNuvem);
    }
    renderizarNuvem();

    await buscarPalavrasNuvemBanco();
    // Rede de segurança caso algum evento Realtime se perca
    nuvemPollInterval = setInterval(buscarPalavrasNuvemBanco, 3000);
}

async function buscarPalavrasNuvemBanco() {
    const pergunta = perguntaNuvemAtual();
    if (!salaAtiva || !pergunta) return;

    const { data, error } = await supabase
        .from("quiz_nuvem_respostas")
        .select("id, participante_id, pergunta_id, texto, oculta")
        .eq("sala_id", salaAtiva.id)
        .eq("pergunta_id", pergunta.id);

    if (error || !data) return;

    let mudou = false;
    data.forEach(r => {
        const atual = palavrasNuvem.get(r.id);
        if (!atual || atual.oculta !== r.oculta) {
            palavrasNuvem.set(r.id, { ...r });
            mudou = true;
        }
        aplicarBloqueioSeNecessario(palavrasNuvem.get(r.id));
    });
    if (mudou) agendarRenderNuvem();
}

function registrarPalavraNuvem(r) {
    const pergunta = perguntaNuvemAtual();
    if (!r || !r.id || !pergunta || r.pergunta_id !== pergunta.id) return;
    if (fasePergunta !== 'nuvem' && fasePergunta !== 'nuvem_resultado') return;
    if (palavrasNuvem.has(r.id)) return;

    const registro = {
        id: r.id,
        participante_id: r.participante_id,
        pergunta_id: r.pergunta_id,
        texto: String(r.texto || "").slice(0, 25),
        oculta: !!r.oculta
    };
    palavrasNuvem.set(r.id, registro);
    aplicarBloqueioSeNecessario(registro);
    agendarRenderNuvem();
}

// Se o instrutor já ocultou essa palavra, repetições novas também ficam ocultas
function aplicarBloqueioSeNecessario(registro) {
    if (!registro || registro.oculta) return;
    if (!chavesNuvemBloqueadas.has(chaveNuvem(registro.texto))) return;
    registro.oculta = true;
    supabase.from("quiz_nuvem_respostas").update({ oculta: true }).eq("id", registro.id).then();
}

function agendarRenderNuvem() {
    if (nuvemRenderAgendado) return;
    nuvemRenderAgendado = true;
    requestAnimationFrame(renderizarNuvem);
}

function agregarPalavrasNuvem() {
    const grupos = new Map();
    palavrasNuvem.forEach(r => {
        if (r.oculta) return;
        const chave = chaveNuvem(r.texto);
        if (!chave) return;
        let g = grupos.get(chave);
        if (!g) {
            g = { chave, total: 0, formas: new Map() };
            grupos.set(chave, g);
        }
        g.total++;
        const forma = r.texto.trim();
        g.formas.set(forma, (g.formas.get(forma) || 0) + 1);
    });

    return [...grupos.values()].map(g => {
        // Exibe a grafia mais usada pelos participantes
        let exibicao = "", maior = 0;
        g.formas.forEach((qtd, forma) => { if (qtd > maior) { maior = qtd; exibicao = forma; } });
        return { chave: g.chave, total: g.total, exibicao };
    }).sort((a, b) => b.total - a.total || a.exibicao.localeCompare(b.exibicao, 'pt-BR'));
}

// Posiciona caixas numa espiral elíptica a partir do centro, sem sobreposição.
// Retorna, para cada caixa, { x, y, w, h } (canto superior esquerdo) ou null se não coube.
function posicionarEmEspiral(caixas, W, H, limitarAoRetangulo) {
    const colocadas = [];
    const resultado = [];
    const cx = W / 2, cy = H / 2;
    const esticarX = Math.min(3, Math.max(1, W / H)); // espalha mais na horizontal, preenchendo o retângulo
    const GAP = 6;
    const raioMax = Math.hypot(W, H);

    const sobrepoe = (a) => colocadas.some(b =>
        a.x < b.x + b.w + GAP && a.x + a.w + GAP > b.x &&
        a.y < b.y + b.h + GAP && a.y + a.h + GAP > b.y
    );

    caixas.forEach((c, i) => {
        let achou = null;
        const anguloInicial = (c.seed % 628) / 100;   // cada palavra começa num ângulo diferente
        const sentido = c.seed % 2 === 0 ? 1 : -1;

        for (let t = 0; t < 900; t += 0.17) {
            const r = 1.7 * t;
            if (r > raioMax) break;
            const ang = sentido * t + anguloInicial;
            const x = cx + r * esticarX * Math.cos(ang) - c.w / 2;
            const y = cy + r * Math.sin(ang) - c.h / 2;

            if (limitarAoRetangulo && (x < 0 || y < 0 || x + c.w > W || y + c.h > H)) continue;

            const candidata = { x, y, w: c.w, h: c.h };
            if (i === 0 || !sobrepoe(candidata)) {
                achou = candidata;
                break;
            }
        }

        if (achou) colocadas.push(achou);
        resultado.push(achou);
    });

    return resultado;
}

function medirPalavraNuvem(medidor, texto, px) {
    medidor.textContent = texto;
    medidor.style.fontSize = `${px}px`;
    return { w: medidor.offsetWidth, h: medidor.offsetHeight };
}

function renderizarNuvem() {
    nuvemRenderAgendado = false;
    const container = document.getElementById("nuvem-container");
    if (!container) return;

    const registros = [...palavrasNuvem.values()];
    const visiveis = registros.filter(r => !r.oculta);
    const ocultas = registros.length - visiveis.length;

    document.getElementById("nuvem-total-palavras").textContent = visiveis.length;
    document.getElementById("nuvem-total-participantes").textContent = new Set(registros.map(r => r.participante_id)).size;
    document.getElementById("nuvem-qtd-ocultas").textContent = ocultas;
    document.getElementById("btn-restaurar-ocultas").classList.toggle("hidden", ocultas === 0);

    const itens = agregarPalavrasNuvem().slice(0, 80);

    // Remove palavras que deixaram de existir (ocultadas)
    const chavesAtuais = new Set(itens.map(i => i.chave));
    nuvemElementos.forEach((el, chave) => {
        if (!chavesAtuais.has(chave)) {
            el.remove();
            nuvemElementos.delete(chave);
        }
    });

    let vazia = document.getElementById("nuvem-vazia");
    if (itens.length === 0) {
        if (!vazia) {
            vazia = document.createElement("p");
            vazia.id = "nuvem-vazia";
            vazia.className = "absolute inset-0 flex items-center justify-center text-sm text-slate-400 italic";
            container.appendChild(vazia);
        }
        vazia.textContent = fasePergunta === 'nuvem_resultado'
            ? "Nenhuma palavra visível."
            : "As palavras aparecem aqui assim que os participantes enviarem.";
        return;
    }
    if (vazia) vazia.remove();

    const W = container.clientWidth;
    const H = container.clientHeight;
    if (!W || !H) return;

    // Elemento invisível, sem animação, só para medir o tamanho final de cada palavra
    let medidor = document.getElementById("nuvem-medidor");
    if (!medidor) {
        medidor = document.createElement("span");
        medidor.id = "nuvem-medidor";
        medidor.className = "nuvem-palavra nuvem-medidor";
        medidor.setAttribute("aria-hidden", "true");
        container.appendChild(medidor);
    }

    const MIN_PX = 18, MAX_PX = 96;
    const maxTotal = itens[0].total;

    const base = itens.map((it, i) => {
        const seed = hashNuvem(it.chave);
        return {
            ...it,
            seed,
            proporcao: maxTotal <= 1 ? 0.45 : Math.pow((it.total - 1) / (maxTotal - 1), 0.6),
            // Algumas palavras menores ficam na vertical para preencher os vãos (nunca as 3 mais citadas)
            vertical: itens.length >= 8 && i >= 3 && seed % 5 === 0
        };
    });

    const montarCaixas = (fator) => base.map(it => {
        let px = (MIN_PX + (MAX_PX - MIN_PX) * it.proporcao) * fator;
        let m = medirPalavraNuvem(medidor, it.exibicao, px);
        const limite = (it.vertical ? H : W) * 0.92;   // nenhuma palavra maior que o quadro
        if (m.w > limite) {
            px *= limite / m.w;
            m = medirPalavraNuvem(medidor, it.exibicao, px);
        }
        return {
            px,
            wTexto: m.w,
            hTexto: m.h,
            w: it.vertical ? m.h : m.w,
            h: it.vertical ? m.w : m.h,
            seed: it.seed
        };
    });

    // Passo 1: monta a nuvem livre para descobrir o tamanho natural dela
    let caixas = montarCaixas(1);
    const livre = posicionarEmEspiral(caixas, W, H, false).filter(Boolean);
    const minX = Math.min(...livre.map(b => b.x)), maxX = Math.max(...livre.map(b => b.x + b.w));
    const minY = Math.min(...livre.map(b => b.y)), maxY = Math.max(...livre.map(b => b.y + b.h));

    // Passo 2: amplia ou reduz as fontes para a nuvem ocupar o retângulo inteiro
    let fator = Math.min(1.8, (W * 0.95) / (maxX - minX), (H * 0.92) / (maxY - minY));
    if (Math.abs(fator - 1) > 0.03) caixas = montarCaixas(fator);
    let posicoes = posicionarEmEspiral(caixas, W, H, true);

    // Se alguma palavra não coube, reduz um pouco e tenta de novo (até 8 vezes)
    for (let tentativa = 0; tentativa < 8 && posicoes.some(p => !p); tentativa++) {
        fator *= 0.9;
        caixas = montarCaixas(fator);
        posicoes = posicionarEmEspiral(caixas, W, H, true);
    }

    // Centraliza o conjunto no quadro (a espiral pode crescer mais para um lado)
    const postas = posicoes.filter(Boolean);
    if (postas.length > 0) {
        const bx0 = Math.min(...postas.map(b => b.x)), bx1 = Math.max(...postas.map(b => b.x + b.w));
        const by0 = Math.min(...postas.map(b => b.y)), by1 = Math.max(...postas.map(b => b.y + b.h));
        const dx = (W - bx1 - bx0) / 2, dy = (H - by1 - by0) / 2;
        postas.forEach(b => { b.x += dx; b.y += dy; });
    }

    base.forEach((it, i) => {
        const c = caixas[i];
        const p = posicoes[i];
        let el = nuvemElementos.get(it.chave);
        const novo = !el;

        if (novo) {
            el = document.createElement("span");
            el.className = `nuvem-palavra nova ${corNuvem(it.chave)}`;
            el.dataset.chave = it.chave;
            el.addEventListener("click", () => ocultarPalavraNuvem(el.dataset.chave));
            el.addEventListener("animationend", () => el.classList.remove("nova"), { once: true });
            nuvemElementos.set(it.chave, el);
        }

        el.textContent = it.exibicao; // textContent: nunca interpreta HTML
        el.title = `${it.total} ${it.total === 1 ? 'menção' : 'menções'} · clique para ocultar`;
        el.style.setProperty("--rot", it.vertical ? "-90deg" : "0deg");
        el.style.fontSize = `${c.px.toFixed(1)}px`;

        if (p) {
            // A rotação é feita pelo centro, então alinhamos o centro do texto ao centro da caixa
            const centroX = p.x + p.w / 2;
            const centroY = p.y + p.h / 2;
            el.style.left = `${(centroX - c.wTexto / 2).toFixed(1)}px`;
            el.style.top = `${(centroY - c.hTexto / 2).toFixed(1)}px`;
            el.classList.remove("fora");
        } else {
            el.classList.add("fora"); // não coube no quadro (casos extremos, com muitas palavras)
        }

        // Estilos definidos antes de entrar na tela: palavra nova surge no lugar certo, sem "voar" do canto
        if (novo) container.appendChild(el);
    });
}

async function ocultarPalavraNuvem(chave) {
    const pergunta = perguntaNuvemAtual();
    if (!pergunta || !salaAtiva) return;

    const ids = [...palavrasNuvem.values()]
        .filter(r => !r.oculta && chaveNuvem(r.texto) === chave)
        .map(r => r.id);
    if (ids.length === 0) return;

    const { error } = await supabase
        .from("quiz_nuvem_respostas")
        .update({ oculta: true })
        .in("id", ids);

    if (error) {
        toast("Não foi possível ocultar a palavra.", "error");
        return;
    }

    chavesNuvemBloqueadas.add(chave);
    ids.forEach(id => { const r = palavrasNuvem.get(id); if (r) r.oculta = true; });
    agendarRenderNuvem();
}

async function restaurarPalavrasOcultas() {
    const pergunta = perguntaNuvemAtual();
    if (!pergunta || !salaAtiva) return;

    const { error } = await supabase
        .from("quiz_nuvem_respostas")
        .update({ oculta: false })
        .eq("sala_id", salaAtiva.id)
        .eq("pergunta_id", pergunta.id)
        .eq("oculta", true);

    if (error) {
        toast("Não foi possível restaurar as palavras.", "error");
        return;
    }

    chavesNuvemBloqueadas.clear();
    palavrasNuvem.forEach(r => { r.oculta = false; });
    agendarRenderNuvem();
    toast("Palavras restauradas.");
}

async function encerrarNuvem() {
    const pergunta = perguntaNuvemAtual();
    if (!pergunta || fasePergunta !== 'nuvem') return;

    fasePergunta = 'nuvem_resultado';
    if (nuvemPollInterval) { clearInterval(nuvemPollInterval); nuvemPollInterval = null; }

    const btnEncerrar = document.getElementById("btn-encerrar-nuvem");
    btnEncerrar.disabled = true;

    if (realtimeChannel) {
        realtimeChannel.send({
            type: 'broadcast',
            event: 'mudar_status',
            payload: { status: 'nuvem_resultado', perguntaId: pergunta.id }
        });
    }

    await supabase.from("quiz_salas").update({ status: 'nuvem_resultado' }).eq("id", salaAtiva.id);

    // Dá tempo para envios que estavam a caminho e busca a lista final
    await new Promise(r => setTimeout(r, 400));
    await buscarPalavrasNuvemBanco();

    // Recria a nuvem já organizada (mais citadas ao centro), num único "revelar"
    nuvemElementos.forEach(el => el.remove());
    nuvemElementos.clear();
    renderizarNuvem();

    const badge = document.getElementById("nuvem-fase-badge");
    badge.textContent = "✔ Respostas encerradas";
    badge.className = "px-3 py-1 rounded-full text-xs font-black bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30";

    btnEncerrar.disabled = false;
    btnEncerrar.classList.add("hidden");

    const isUltima = indicePerguntaAtual + 1 >= perguntasDaPartida.length;
    document.getElementById("btn-nuvem-proxima-txt").textContent = isUltima ? "Finalizar atividade" : "Próxima pergunta";
    document.getElementById("btn-nuvem-proxima").classList.remove("hidden");
}