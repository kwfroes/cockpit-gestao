// =====================================================================
// Gamificação – XP, sequência de dias (🔥) e objetivo do dia
// Datas sempre no fuso local do usuário (ex.: 22h em Salvador conta como hoje).
// =====================================================================
let ESTADO = { xp: 0, streak: 0, ultimaData: null, seq: 0, bonusAtivo: true };

// ---------------------------------------------------------------------
// Sequência de acertos (bônus)
//  - Vale só para exercícios, na 1ª tentativa, e atravessa lições e módulos.
//  - A partir do 2º acerto seguido, cada acerto soma +1 ponto de bônus.
//  - Errou: a sequência zera, o bônus acumulado NA LIÇÃO é perdido e o bônus
//    fica suspenso até o aluno acertar 3 seguidos.
//  - Teoria não pontua e não interfere na sequência.
// ---------------------------------------------------------------------
export const SEQ_BONUS_A_PARTIR_DE = 2;   // acerto seguido que começa a render bônus
export const SEQ_PARA_REATIVAR = 3;       // acertos seguidos para reativar após um erro
export const BONUS_POR_ACERTO = 1;

export function contarAcerto(seq, bonusAtivo) {
    const novaSeq = (seq || 0) + 1;
    const ativo = bonusAtivo || novaSeq >= SEQ_PARA_REATIVAR;
    const bonus = ativo && novaSeq >= SEQ_BONUS_A_PARTIR_DE ? BONUS_POR_ACERTO : 0;
    return { seq: novaSeq, bonusAtivo: ativo, bonus, reativou: !bonusAtivo && ativo };
}
export function contarErro() { return { seq: 0, bonusAtivo: false }; }
export function getSequencia() { return { seq: ESTADO.seq || 0, bonusAtivo: ESTADO.bonusAtivo !== false }; }
export function setSequencia(seq, bonusAtivo) { ESTADO = { ...ESTADO, seq, bonusAtivo }; mostrarSequencia(seq, bonusAtivo); }
export function setXP(total) { if (total != null) { ESTADO.xp = total; atualizarUI(); } }

export function mostrarSequencia(seq, bonusAtivo) {
    const el = document.getElementById('seq-acertos');
    if (!el) return;
    el.textContent = seq;
    const caixa = el.parentElement;
    if (!caixa) return;
    caixa.style.filter = bonusAtivo === false ? 'grayscale(0.7)' : '';
    caixa.title = bonusAtivo === false
        ? `Sequência de ${seq} acerto(s). Bônus suspenso: acerte ${SEQ_PARA_REATIVAR} seguidos para reativar.`
        : `Sequência de ${seq} acerto(s) seguidos. A partir do ${SEQ_BONUS_A_PARTIR_DE}º acerto, cada acerto vale +${BONUS_POR_ACERTO} de bônus.`;
}

export const hojeLocal = (d = new Date()) => d.toLocaleDateString('en-CA');          // AAAA-MM-DD local
const dataLocal = v => !v ? null : /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : hojeLocal(new Date(v));
const diasEntre = (a, b) => Math.round((Date.parse(b + 'T12:00:00') - Date.parse(a + 'T12:00:00')) / 86400000);
// Meio-dia local: serve tanto para coluna date quanto timestamptz sem "virar" o dia
const carimbo = () => new Date(hojeLocal() + 'T12:00:00').toISOString();

export function getEstado() { return { ...ESTADO, fezHoje: ESTADO.ultimaData === hojeLocal() }; }

export async function carregarGamificacao() {
    const userEmail = sessionStorage.getItem("cockpit_user_email");
    if (!userEmail) return;
    try {
        let { data } = await window.supabase.from('user_gamification').select('*').eq('user_email', userEmail).maybeSingle();
        if (!data) {
            const { data: novo, error } = await window.supabase.from('user_gamification')
                .insert([{ user_email: userEmail, xp_total: 0, sequencia_dias: 0 }]).select().single();
            if (error) throw error;
            data = novo;
        }
        const ultima = dataLocal(data.last_activity_date);
        let seq = data.sequencia_dias || 0;
        const diff = ultima ? diasEntre(ultima, hojeLocal()) : null;

        // Correção: estudou hoje (ou ontem) mas a sequência nunca foi contada
        if (diff !== null && diff <= 1 && seq === 0) {
            seq = 1;
            await window.supabase.from('user_gamification').update({ sequencia_dias: 1 }).eq('user_email', userEmail);
        }
        // Sequência quebrada (mais de um dia sem estudar): mostra 0
        const streak = diff !== null && diff <= 1 ? seq : 0;

        ESTADO = { xp: data.xp_total || 0, streak, ultimaData: ultima, seq: data.acertos_seguidos || 0, bonusAtivo: data.bonus_ativo !== false };
        atualizarUI();
        mostrarSequencia(ESTADO.seq, ESTADO.bonusAtivo);
    } catch (err) {
        console.error("Erro ao carregar gamificação:", err);
    }
}

// Chamar ao CONCLUIR uma lição curta ou revisão (mesmo que não gere XP)
export async function registrarAtividade() {
    const userEmail = sessionStorage.getItem("cockpit_user_email");
    if (!userEmail) return null;
    try {
        const { data, error } = await window.supabase.from('user_gamification')
            .select('sequencia_dias, last_activity_date').eq('user_email', userEmail).single();
        if (error) throw error;
        const hoje = hojeLocal();
        const ultima = dataLocal(data.last_activity_date);
        const seqAtual = data.sequencia_dias || 0;
        const primeiraHoje = ultima !== hoje;
        let seq;
        if (!primeiraHoje) seq = Math.max(seqAtual, 1);
        else if (ultima && diasEntre(ultima, hoje) === 1) seq = seqAtual + 1;
        else seq = 1;

        const { error: e2 } = await window.supabase.from('user_gamification')
            .update({ sequencia_dias: seq, last_activity_date: carimbo() }).eq('user_email', userEmail);
        if (e2) throw e2;
        ESTADO = { ...ESTADO, streak: seq, ultimaData: hoje };
        atualizarUI(true);
        return { streak: seq, primeiraHoje };
    } catch (err) {
        console.error("Erro ao registrar atividade:", err);
        return null;
    }
}

// Incremento atômico no banco (RPC academia_somar_xp): duas abas não se sobrescrevem.
export async function adicionarXP(quantidade) {
    if (!sessionStorage.getItem("cockpit_user_email")) return;
    try {
        const { data, error } = await window.supabase.rpc('academia_somar_xp', { p_xp: Math.round(quantidade) });
        if (error) throw error;
        setXP(data);
    } catch (err) {
        console.error("Erro ao salvar XP:", err);
    }
}

function atualizarUI(animarStreak = false) {
    const xpEl = document.getElementById('xp-total');
    const streakEl = document.getElementById('streak-days');
    if (xpEl) {
        xpEl.textContent = ESTADO.xp;
        xpEl.classList.add('text-emerald-500', 'scale-110');
        setTimeout(() => xpEl.classList.remove('text-emerald-500', 'scale-110'), 500);
    }
    if (streakEl) {
        streakEl.textContent = ESTADO.streak;
        const caixa = streakEl.parentElement;
        if (caixa) {
            caixa.title = ESTADO.ultimaData === hojeLocal()
                ? `Sequência de ${ESTADO.streak} dia(s). Você já estudou hoje!`
                : ESTADO.streak ? `Sequência de ${ESTADO.streak} dia(s). Conclua uma lição hoje para manter.`
                                : 'Conclua uma lição para iniciar sua sequência.';
            caixa.style.filter = ESTADO.ultimaData === hojeLocal() ? '' : 'grayscale(0.6)';
        }
        if (animarStreak) {
            streakEl.classList.add('scale-125');
            setTimeout(() => streakEl.classList.remove('scale-125'), 600);
        }
    }
}
