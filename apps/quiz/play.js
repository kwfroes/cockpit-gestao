/**
 * apps/quiz/play.js
 * Interface Mobile do Aluno Completa: Sincronização de Pontos + Encerramento de Sala
 */

const supabaseUrl = 'https://whnzeysvqbtuecxmthht.supabase.co';
const supabaseKey = 'sb_publishable_Gw4cFK56R9kms2ogg50UqA_ZhHi79qw';
const supabaseClient = window.supabase.createClient(supabaseUrl, supabaseKey);

let salaAtual = null;
let participante = null;
let opcoesAtuais = [];
let perguntaAtualId = null;
let dadosPerguntaCache = {};
let jaRespondeuNestaRodada = false;
let ultimoGanhoRodada = 0;          // Isolado para não ser sobrescrito pelo Realtime
let promiseEnvioResposta = null;    // Garante que o RPC termine antes de exibir o feedback
let realtimeChannel = null;
let alunoTimerInterval = null;

const telas = {
    login: document.getElementById("tela-login"),
    espera: document.getElementById("tela-espera"),
    pergunta: document.getElementById("tela-pergunta"),
    enviado: document.getElementById("tela-enviado"),
    feedback: document.getElementById("tela-feedback"),
    final: document.getElementById("tela-final")
};

document.addEventListener("DOMContentLoaded", () => {
    const urlParams = new URLSearchParams(window.location.search);
    const pinUrl = urlParams.get("sala");

    if (pinUrl) {
        document.getElementById("input-pin").value = pinUrl;
        document.getElementById("container-pin-input").classList.add("hidden");
        document.getElementById("container-pin-badge").classList.remove("hidden");
        document.getElementById("badge-pin-valor").textContent = pinUrl;
        document.getElementById("subtitulo-login").textContent = "Digite seu nome para entrar direto no jogo:";
        setTimeout(() => document.getElementById("input-nickname").focus(), 150);
    }

    restaurarSessaoLocal();
    document.getElementById("form-entrar").addEventListener("submit", handleEntrarSala);
});

function trocarTela(nomeTela) {
    Object.keys(telas).forEach(t => {
        if (!telas[t]) return;
        if (t === nomeTela) telas[t].classList.remove("hidden");
        else telas[t].classList.add("hidden");
    });

    const barra = document.getElementById("barra-reacoes");
    if (nomeTela === "login") barra.classList.add("hidden");
    else barra.classList.remove("hidden");
}

function exibirToast(msg) {
    const t = document.getElementById("toast");
    t.textContent = msg;
    t.classList.remove("opacity-0", "pointer-events-none");
    setTimeout(() => t.classList.add("opacity-0", "pointer-events-none"), 3000);
}

async function handleEntrarSala(e) {
    e.preventDefault();
    const pin = document.getElementById("input-pin").value.trim();
    const nickname = document.getElementById("input-nickname").value.trim();
    const btn = document.getElementById("btn-entrar");

    if (!pin || !nickname) {
        exibirToast("Preencha todos os campos.");
        return;
    }

    btn.disabled = true;
    btn.textContent = "Conectando...";

    try {
        const { data: sala, error: errSala } = await supabaseClient
            .from("quiz_salas")
            .select("id, codigo, status, pergunta_atual_id")
            .eq("codigo", pin)
            .maybeSingle();

        if (errSala || !sala) {
            exibirToast("Código da sala inválido ou inexistente.");
            btn.disabled = false;
            btn.textContent = "Conectar ➔";
            return;
        }

        if (sala.status === 'finalizado' || sala.status === 'encerrado') {
            exibirToast("Esta partida já foi encerrada pelo instrutor.");
            btn.disabled = false;
            btn.textContent = "Conectar ➔";
            return;
        }

        salaAtual = sala;

        const { data: partCriado, error: errPart } = await supabaseClient
            .from("quiz_participantes")
            .insert([{ sala_id: sala.id, apelido: nickname, pontos: 0 }])
            .select()
            .single();

        if (errPart) throw errPart;
        participante = partCriado;

        sessionStorage.setItem("quiz_aluno_sala", JSON.stringify(salaAtual));
        sessionStorage.setItem("quiz_aluno_part", JSON.stringify(participante));

        atualizarHeader(participante.apelido, participante.pontos);
        document.getElementById("espera-sala-pin").textContent = salaAtual.codigo;

        conectarRealtime();
        avaliarEstadoSala(salaAtual.status, salaAtual.pergunta_atual_id);

    } catch (err) {
        console.error("Erro ao entrar:", err);
        exibirToast("Falha ao entrar na sala.");
    } finally {
        btn.disabled = false;
        btn.textContent = "Conectar ➔";
    }
}

function atualizarHeader(nome, pontos) {
    document.getElementById("header-user-info").classList.remove("hidden");
    document.getElementById("label-user-name").textContent = nome;
    document.getElementById("label-user-score").textContent = `${pontos} pts`;
}

function conectarRealtime() {
    if (realtimeChannel) realtimeChannel.unsubscribe();

    realtimeChannel = supabaseClient
        .channel(`quiz_sala_${salaAtual.id}`)
        .on('broadcast', { event: 'mudar_status' }, (payload) => {
            const { status, perguntaId, enunciado, tempo } = payload.payload;
            salaAtual.status = status;
            salaAtual.pergunta_atual_id = perguntaId;
            avaliarEstadoSala(status, perguntaId, enunciado, tempo);
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'quiz_salas',
            filter: `id=eq.${salaAtual.id}`
        }, (payload) => {
            const nova = payload.new;
            if (salaAtual.status !== nova.status || salaAtual.pergunta_atual_id !== nova.pergunta_atual_id) {
                salaAtual = nova;
                avaliarEstadoSala(salaAtual.status, salaAtual.pergunta_atual_id);
            }
        })
        .on('postgres_changes', {
            event: 'UPDATE',
            schema: 'public',
            table: 'quiz_participantes',
            filter: `id=eq.${participante.id}`
        }, (payload) => {
            participante.pontos = payload.new.pontos;
            sessionStorage.setItem("quiz_aluno_part", JSON.stringify(participante));
            atualizarHeader(participante.apelido, participante.pontos);
        })
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                realtimeChannel.send({
                    type: 'broadcast',
                    event: 'novo_participante',
                    payload: participante
                });
            }
        });
}

function dispararEmoji(emoji) {
    if (!realtimeChannel) return;
    if (navigator.vibrate) navigator.vibrate(30);

    realtimeChannel.send({
        type: 'broadcast',
        event: 'reacao',
        payload: { emoji, apelido: participante ? participante.apelido : 'Aluno' }
    });
}

function iniciarTimerAluno(segundosTotais, temaCor) {
    if (alunoTimerInterval) clearInterval(alunoTimerInterval);

    const duracaoMs = segundosTotais * 1000;
    const fimTimestamp = performance.now() + duracaoMs;
    const labelTxt = document.getElementById("aluno-timer-txt");
    const bar = document.getElementById("aluno-timer-bar");

    if (temaCor === "amber") {
        bar.className = "bg-amber-500 h-full w-full";
        labelTxt.className = "tabular-timer font-mono text-2xl font-black text-amber-400";
    } else {
        bar.className = "bg-purple-500 h-full w-full";
        labelTxt.className = "tabular-timer font-mono text-2xl font-black text-purple-400";
    }

    alunoTimerInterval = setInterval(() => {
        const restanteMs = Math.max(0, fimTimestamp - performance.now());
        const formatado = (restanteMs / 1000).toFixed(2).padStart(5, '0');

        labelTxt.textContent = `${formatado}s`;
        bar.style.width = `${(restanteMs / duracaoMs) * 100}%`;

        if (temaCor === "red" && restanteMs <= 2500) {
            bar.className = "bg-red-500 h-full";
            labelTxt.className = "tabular-timer font-mono text-2xl font-black text-red-500";
        }

        if (restanteMs <= 0) {
            clearInterval(alunoTimerInterval);
            labelTxt.textContent = "00.00s";
            bar.style.width = "0%";
        }
    }, 30);
}

async function avaliarEstadoSala(status, perguntaId, enunciadoBroadcast = null, tempoBroadcast = null) {
    // Se o professor clicou em "Encerrar Partida", derruba o aluno na hora
    if (status === 'encerrado') {
        derrubarParticipante("A partida foi encerrada pelo instrutor.");
        return;
    }

    if (status === 'lobby') {
        if (alunoTimerInterval) clearInterval(alunoTimerInterval);
        trocarTela("espera");
        return;
    }

    // FASE 1: LEITURA DA PERGUNTA
    if (status === 'preparando') {
        if (perguntaId !== perguntaAtualId) {
            perguntaAtualId = perguntaId;
            jaRespondeuNestaRodada = false;
            ultimoGanhoRodada = 0;
            promiseEnvioResposta = null;
        }

        trocarTela("pergunta");

        document.getElementById("box-aguardando-opcoes").classList.remove("hidden");
        const gridBotoes = document.getElementById("grid-botoes-resposta");
        gridBotoes.classList.add("hidden");
        gridBotoes.classList.remove("grid");

        const badge = document.getElementById("aluno-fase-badge");
        badge.textContent = "⏳ LEIA A PERGUNTA";
        badge.className = "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 border border-amber-500/30";

        if (enunciadoBroadcast) {
            document.getElementById("aluno-enunciado").textContent = enunciadoBroadcast;
        }

        await carregarDadosPergunta(perguntaId);

        const tempoLeitura = tempoBroadcast || dadosPerguntaCache[perguntaId]?.tempo_leitura_segundos || 5;
        iniciarTimerAluno(tempoLeitura, "amber");
        return;
    }

    // FASE 2: VALENDO!
    if (status === 'pergunta') {
        if (perguntaId !== perguntaAtualId) {
            perguntaAtualId = perguntaId;
            jaRespondeuNestaRodada = false;
            ultimoGanhoRodada = 0;
            promiseEnvioResposta = null;
        }

        await carregarDadosPergunta(perguntaId);

        if (enunciadoBroadcast) {
            document.getElementById("aluno-enunciado").textContent = enunciadoBroadcast;
        }

        if (jaRespondeuNestaRodada) {
            trocarTela("enviado");
        } else {
            trocarTela("pergunta");

            document.getElementById("box-aguardando-opcoes").classList.add("hidden");
            const gridBotoes = document.getElementById("grid-botoes-resposta");
            gridBotoes.classList.remove("hidden");
            gridBotoes.classList.add("grid");

            const badge = document.getElementById("aluno-fase-badge");
            badge.textContent = "⚡ VALENDO! RESPONDA!";
            badge.className = "text-[10px] font-black uppercase tracking-widest px-2.5 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse";

            const tempoResposta = tempoBroadcast || dadosPerguntaCache[perguntaId]?.tempo_segundos || 5;
            iniciarTimerAluno(tempoResposta, "red");

            if (navigator.vibrate) navigator.vibrate(80);
        }
        return;
    }

    if (status === 'placar') {
        if (alunoTimerInterval) clearInterval(alunoTimerInterval);
        await exibirFeedbackRodada();
        return;
    }

    if (status === 'finalizado') {
        if (alunoTimerInterval) clearInterval(alunoTimerInterval);
        document.getElementById("final-total-pontos").textContent = participante.pontos;
        trocarTela("final");
        limparSessaoLocal();
        return;
    }
}

// ----------------------------------------------------
// AS 3 FUNÇÕES VITAIS QUE FALTAVAM (NÃO REMOVA)
// ----------------------------------------------------
async function carregarDadosPergunta(perguntaId) {
    if (!perguntaId) return;

    if (dadosPerguntaCache[perguntaId]) {
        document.getElementById("aluno-enunciado").textContent = dadosPerguntaCache[perguntaId].enunciado;
        return;
    }

    try {
        const { data: perg, error } = await supabaseClient
            .from("quiz_perguntas")
            .select(`
                id, enunciado, tempo_segundos, tempo_leitura_segundos,
                quiz_opcoes (id, texto, cor_indice)
            `)
            .eq("id", perguntaId)
            .single();

        if (error || !perg) return;

        dadosPerguntaCache[perguntaId] = perg;
        document.getElementById("aluno-enunciado").textContent = perg.enunciado;

        opcoesAtuais = (perg.quiz_opcoes || []).sort((a, b) => a.cor_indice - b.cor_indice);

        const botoes = document.querySelectorAll(".btn-opcao");
        botoes.forEach((btn, idx) => {
            btn.disabled = false;
            btn.classList.remove("opacity-40");
            const labelTexto = btn.querySelector(".opt-texto");
            if (opcoesAtuais[idx]) {
                labelTexto.textContent = opcoesAtuais[idx].texto;
                btn.style.display = "flex";
            } else {
                btn.style.display = "none";
            }
        });
    } catch (err) {
        console.error("Erro ao carregar pergunta:", err);
    }
}

async function enviarResposta(indiceOpcao) {
    if (jaRespondeuNestaRodada) return;
    const opcaoEscolhida = opcoesAtuais[indiceOpcao];
    if (!opcaoEscolhida) return;

    jaRespondeuNestaRodada = true;
    if (alunoTimerInterval) clearInterval(alunoTimerInterval);

    document.querySelectorAll(".btn-opcao").forEach(btn => btn.disabled = true);
    trocarTela("enviado");

    if (navigator.vibrate) navigator.vibrate(40);

    // 1. Executa primeiro o cálculo seguro no banco e guarda a Promise
    promiseEnvioResposta = (async () => {
        try {
            const { data: pontosGanhos, error } = await supabaseClient.rpc("submit_quiz_answer", {
                p_sala_id: salaAtual.id,
                p_participante_id: participante.id,
                p_pergunta_id: perguntaAtualId,
                p_opcao_id: opcaoEscolhida.id
            });

            if (!error && typeof pontosGanhos === "number") {
                ultimoGanhoRodada = pontosGanhos;
            }
        } catch (err) {
            console.warn("Erro ao submeter resposta:", err);
        }

        // 2. Só avisa o telão após o banco ter computado os pontos!
        if (realtimeChannel) {
            realtimeChannel.send({
                type: 'broadcast',
                event: 'novo_voto',
                payload: {
                    sala_id: salaAtual.id,
                    participante_id: participante.id,
                    pergunta_id: perguntaAtualId,
                    opcao_id: opcaoEscolhida.id
                }
            });
        }
    })();

    await promiseEnvioResposta;
}

async function exibirFeedbackRodada() {
    // Se a requisição da resposta ainda estiver em trânsito, aguarda ela concluir!
    if (promiseEnvioResposta) {
        try { await promiseEnvioResposta; } catch (e) {}
    }

    // Fallback de segurança: se respondeu mas ultimoGanhoRodada ainda for 0, confere no banco
    if (jaRespondeuNestaRodada && ultimoGanhoRodada === 0 && perguntaAtualId) {
        const { data: respBanco } = await supabaseClient
            .from("quiz_respostas")
            .select("pontos_ganhos")
            .eq("participante_id", participante.id)
            .eq("pergunta_id", perguntaAtualId)
            .maybeSingle();

        if (respBanco && respBanco.pontos_ganhos > 0) {
            ultimoGanhoRodada = respBanco.pontos_ganhos;
        }
    }

    trocarTela("feedback");
    const iconeEl = document.getElementById("feedback-icone");
    const tituloEl = document.getElementById("feedback-titulo");
    const pontosEl = document.getElementById("feedback-pontos");

    if (ultimoGanhoRodada > 0) {
        iconeEl.textContent = "🎯";
        tituloEl.textContent = "Você Acertou!";
        pontosEl.textContent = `+${ultimoGanhoRodada} pontos nesta rodada!`;
        pontosEl.className = "text-base font-black text-emerald-400 font-mono";
        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    } else {
        iconeEl.textContent = "❌";
        tituloEl.textContent = jaRespondeuNestaRodada ? "Resposta Incorreta!" : "Tempo Esgotado!";
        pontosEl.textContent = "0 pontos nesta rodada";
        pontosEl.className = "text-sm font-black text-red-400 font-mono";
        if (navigator.vibrate) navigator.vibrate(200);
    }
}
// ----------------------------------------------------

// ========================================================
// FUNÇÃO PARA DERRUBAR O PARTICIPANTE E LIMPAR A SESSÃO
// ========================================================
function derrubarParticipante(mensagem = "A sala foi encerrada.") {
    if (alunoTimerInterval) clearInterval(alunoTimerInterval);
    if (realtimeChannel) {
        realtimeChannel.unsubscribe();
        realtimeChannel = null;
    }

    // 1. Limpa o sessionStorage e variáveis da partida
    limparSessaoLocal();
    salaAtual = null;
    participante = null;
    perguntaAtualId = null;
    jaRespondeuNestaRodada = false;
    ultimoGanhoRodada = 0;

    // 2. Esconde o crachá do topo (Nome e Pontos)
    document.getElementById("header-user-info").classList.add("hidden");

    // 3. Limpa o PIN antigo e reexibe o campo de código para aguardar uma nova sala
    document.getElementById("input-pin").value = "";
    document.getElementById("container-pin-badge").classList.add("hidden");
    document.getElementById("container-pin-input").classList.remove("hidden");
    document.getElementById("subtitulo-login").textContent = "Aguardando nova sala... Informe o PIN ou leia o novo QR Code.";

    // Remove o ?sala= antigo da barra de endereços para não recarregar na sala morta
    window.history.replaceState({}, document.title, window.location.pathname);

    // 4. Volta para a tela inicial de aguardo/entrada e avisa o aluno
    trocarTela("login");
    exibirToast(mensagem);
    if (navigator.vibrate) navigator.vibrate(200);
}

// Valida no banco se a sala ainda existe e está ativa ao recarregar a página
async function restaurarSessaoLocal() {
    try {
        const salaSalva = sessionStorage.getItem("quiz_aluno_sala");
        const partSalvo = sessionStorage.getItem("quiz_aluno_part");

        if (salaSalva && partSalvo) {
            const salaObj = JSON.parse(salaSalva);
            const partObj = JSON.parse(partSalvo);

            // Confere no Supabase o status real da sala antes de reconectar
            const { data: salaBanco, error } = await supabaseClient
                .from("quiz_salas")
                .select("id, codigo, status, pergunta_atual_id")
                .eq("id", salaObj.id)
                .maybeSingle();

            if (error || !salaBanco || salaBanco.status === 'encerrado' || salaBanco.status === 'finalizado') {
                derrubarParticipante("A partida anterior já foi encerrada.");
                return;
            }

            salaAtual = salaBanco;
            participante = partObj;

            atualizarHeader(participante.apelido, participante.pontos);
            document.getElementById("espera-sala-pin").textContent = salaAtual.codigo;
            conectarRealtime();
            avaliarEstadoSala(salaAtual.status, salaAtual.pergunta_atual_id);
        }
    } catch (e) {
        limparSessaoLocal();
    }
}

function limparSessaoLocal() {
    sessionStorage.removeItem("quiz_aluno_sala");
    sessionStorage.removeItem("quiz_aluno_part");
}