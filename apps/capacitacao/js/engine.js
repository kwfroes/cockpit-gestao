// =====================================================================
// Engine de lições – Academia CGCF
// - Só carrega telas ATIVAS
// - Lições curtas com progresso salvo ao concluir cada uma
// - Questão errada volta para o final da mesma lição (até acertar)
// - Revisão do Módulo com mínimo de acerto, revisão dos pontos e refação
// - Alternativas embaralhadas; correta sempre destacada em verde
// - Botão "Próxima lição" (pula lições curtas sem telas ativas)
// - ADMIN: editar a tela atual, nova versão, inativar, criar e pular
// - Nota (certificação) calculada no SERVIDOR (academia_concluir_unidade_v2)
// - Bônus de sequência de acertos (ver gamification.js)
// =====================================================================
import { navigateTo } from './main.js';
import { adicionarXP, registrarAtividade, getSequencia, setSequencia, setXP, contarAcerto, contarErro, mostrarSequencia, SEQ_PARA_REATIVAR } from './gamification.js';
import { renderSimulacao } from './simulation.js';
import { estrelasDoScore, htmlEstrelas, MEDALHAS } from './medalha.js';
import { esc, isAdmin, adminLivre, editarLicao } from './admin_editor.js';
import { carregarFalas, montarFala } from './falas.js';
import './narracao.js';

const XP = { teoria: 10, exercicio: 20, simulacao: 50 };
const SELECT_LICAO = `id, titulo, tipo, conteudo_texto, ordem, xp_recompensa, cenario, unit_id, ativo,
    questions ( id, enunciado, explicacao_feedback, question_options ( id, texto_alternativa, is_correta, ordem ) )`;

const OPC_BASE = 'flex items-center gap-3 p-4 rounded-xl border-2 transition-colors';
const OPC_ESTADO = {
    neutro: 'border-slate-200 dark:border-slate-700 hover:bg-blue-50 dark:hover:bg-blue-900/20 cursor-pointer',
    sel:    'border-blue-500 dark:border-blue-500 bg-blue-50 dark:bg-blue-900/30 cursor-pointer',
    certa:  'border-emerald-500 dark:border-emerald-400 bg-emerald-50 dark:bg-emerald-900/50 ring-2 ring-emerald-500/30',
    errada: 'border-red-500 dark:border-red-400 bg-red-50 dark:bg-red-900/50',
    inativa:'border-slate-200 dark:border-slate-700 opacity-60'
};
const OPC_TEXTO = {
    neutro: 'text-slate-700 dark:text-slate-300', sel: 'text-slate-800 dark:text-white',
    certa: 'text-emerald-800 dark:text-emerald-200 font-bold', errada: 'text-red-800 dark:text-red-200 font-bold',
    inativa: 'text-slate-500 dark:text-slate-500'
};
function estadoOpcao(label, estado) {
    label.className = `${OPC_BASE} ${OPC_ESTADO[estado]}`;
    label.querySelector('.opc-texto').className = `opc-texto flex-1 font-medium ${OPC_TEXTO[estado]}`;
    const marca = label.querySelector('.opc-marca');
    marca.textContent = estado === 'certa' ? '✓' : estado === 'errada' ? '✗' : '';
    marca.className = `opc-marca w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-sm font-black ${estado === 'certa' ? 'bg-emerald-500 text-white' : estado === 'errada' ? 'bg-red-500 text-white' : 'hidden'}`;
}

let S = null;

function novoUUID() {
    if (crypto.randomUUID) return crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
        const r = crypto.getRandomValues(new Uint8Array(1))[0] & 15;
        return (c === 'x' ? r : (r & 3) | 8).toString(16);
    });
}

export async function initLessonEngine(params, tituloAntigo) {
    if (typeof params !== 'object') params = { moduleId: params, moduleTitle: tituloAntigo };
    const seqIni = getSequencia();
    S = {
        ...params,
        modo: params.unitId ? (params.unitTipo === 'revisao' ? 'revisao' : 'licao') : 'legado',
        fila: [], feitos: 0, xp: 0, bonus: 0,
        seq: seqIni.seq, bonusAtivo: seqIni.bonusAtivo,
        pendentes: [], falhas: [], resultadoServidor: null,
        primeira: new Map(), refeitas: 0, erradasRevisao: [], teoriaDe: {},
        fase: 'normal', opcao: null, item: null, proxima: null, pulou: false, scoreRevisao: null,
        sessao: novoUUID(),
        cfg: { qtd: 8, min_acerto: 0.7, ...(params.unitConfig || {}) }
    };

    document.getElementById('lesson-module-title').textContent =
        S.unitTitle ? `${S.moduleTitle} • ${S.unitTitle}` : S.moduleTitle;
    document.getElementById('btn-secundario-licao')?.remove();
    mostrarSequencia(S.seq, S.bonusAtivo);

    document.getElementById('btn-fechar-licao').onclick = () => {
        const msg = S.modo === 'legado'
            ? 'Deseja sair agora? O progresso desta sessão será perdido.'
            : 'Deseja sair desta lição? As lições já concluídas do módulo continuam salvas.';
        if (confirm(msg)) sair();
    };
    document.getElementById('btn-acao-licao').onclick = () => acao();

    try { await Promise.all([carregar(), carregarFalas()]); }
    catch (err) { console.error('Erro ao carregar lições:', err); alert('Erro de conexão ao carregar a lição.'); return; }
    if (S.fila.length === 0) return semConteudo();
    proximo();
}

function sair() {
    larguraLicao(false);
    removerBarraAdmin();
    if (S.modo === 'legado') navigateTo('dashboard');
    else navigateTo('module', { moduleId: S.moduleId, moduleTitle: S.moduleTitle });
}

// ---------------------------------------------------------------------
// Carga
// ---------------------------------------------------------------------
const opcoesOk = q => {
    const o = q?.question_options || [];
    return o.length >= 2 && o.filter(x => x.is_correta).length === 1;
};
const valida = l =>
    l.ativo !== false && (
    l.tipo === 'teoria' ||
    (l.tipo === 'exercicio' && l.questions?.length > 0 && opcoesOk(l.questions[0])) ||
    (l.tipo === 'simulacao' && l.cenario?.itens?.length > 0));

async function carregar() {
    let q = window.supabase.from('lessons').select(SELECT_LICAO).eq('ativo', true);
    q = S.modo === 'licao' ? q.eq('unit_id', S.unitId) : q.eq('module_id', S.moduleId);
    const { data, error } = await q.order('ordem', { ascending: true });
    if (error) throw error;
    const todas = data || [];

    if (S.modo !== 'revisao') {
        S.fila = todas.filter(valida).map(l => ({ licao: l, rodada: 'primeira' }));
        return;
    }
    const porUnidade = {}; const teoriaAtual = {};
    todas.forEach(l => {
        if (l.tipo === 'teoria') teoriaAtual[l.unit_id] = l;
        if (l.tipo === 'exercicio' && valida(l)) {
            S.teoriaDe[l.id] = teoriaAtual[l.unit_id] || null;
            (porUnidade[l.unit_id || 'x'] ||= []).push(l);
        }
    });
    const grupos = Object.values(porUnidade).map(embaralhar);
    const escolhidas = [];
    while (escolhidas.length < S.cfg.qtd && grupos.some(g => g.length)) {
        for (const g of grupos) if (g.length && escolhidas.length < S.cfg.qtd) escolhidas.push(g.shift());
    }
    S.fila = embaralhar(escolhidas).map(l => ({ licao: l, rodada: 'primeira' }));
}

async function recarregarLicao(id) {
    const { data, error } = await window.supabase.from('lessons').select(SELECT_LICAO).eq('id', id).single();
    if (error) throw error;
    return data;
}

function embaralhar(a) {
    a = [...a];
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}

// Unidades do módulo que têm conteúdo ativo (as vazias são ignoradas)
async function unidadesComConteudo() {
    const [{ data: unidades }, { data: ativas }] = await Promise.all([
        window.supabase.from('learning_units').select('id, titulo, ordem, tipo, config').eq('module_id', S.moduleId).order('ordem', { ascending: true }),
        window.supabase.from('lessons').select('unit_id, tipo').eq('module_id', S.moduleId).eq('ativo', true)
    ]);
    const comTelas = new Set((ativas || []).map(l => l.unit_id).filter(Boolean));
    const temEx = (ativas || []).some(l => l.tipo === 'exercicio');
    return (unidades || []).filter(u => u.tipo === 'revisao' ? temEx : comTelas.has(u.id));
}

// ---------------------------------------------------------------------
// Barra do administrador
// ---------------------------------------------------------------------
let licaoDaBarra = null;
function removerBarraAdmin() { document.getElementById('adm-barra')?.remove(); licaoDaBarra = null; }

// Cadeado do admin: ao trancar/destrancar, atualiza a tela atual sem recarregar a lição
window.addEventListener('academia:admin-modo', () => {
    if (licaoDaBarra) barraAdmin(licaoDaBarra);
    document.querySelectorAll('[data-adm]').forEach(el => { el.style.display = adminLivre() ? '' : 'none'; });
});

// Troca, na sessão, a tela antiga pela versão nova (ou atualizada)
function substituirNaSessao(nova, idAntigo = nova.id) {
    S.fila.forEach(i => { if (i.licao.id === idAntigo) i.licao = nova; });
    S.erradasRevisao = S.erradasRevisao.map(l => l.id === idAntigo ? nova : l);
    if (idAntigo !== nova.id && S.primeira.has(idAntigo)) { S.primeira.set(nova.id, S.primeira.get(idAntigo)); S.primeira.delete(idAntigo); }
}
function removerDaSessao(id) {
    S.fila = S.fila.filter(i => i.licao.id !== id);
    S.erradasRevisao = S.erradasRevisao.filter(l => l.id !== id);
    S.primeira.delete(id);
}

function barraAdmin(licao) {
    removerBarraAdmin();
    licaoDaBarra = licao;
    if (!adminLivre()) return;
    const barra = document.createElement('div');
    barra.id = 'adm-barra';
    barra.className = 'mb-4 flex flex-wrap items-center gap-2 px-3 py-2 rounded-xl border border-purple-300 dark:border-purple-800 bg-purple-50 dark:bg-purple-900/20';
    barra.innerHTML = `
      <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-black">ADMIN</span>
      <span class="text-[11px] font-bold text-purple-700 dark:text-purple-300 flex-1 truncate">${esc(licao.tipo)} • ordem ${esc(licao.ordem)}</span>
      <button data-a="editar" class="px-3 py-1 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[11px] font-bold">✏️ Editar esta tela</button>
      <button data-a="nova" class="px-3 py-1 rounded-lg border border-purple-400 text-purple-700 dark:text-purple-300 text-[11px] font-bold hover:bg-purple-100 dark:hover:bg-purple-900/40">＋ Nova a seguir</button>
      <button data-a="pular" class="px-3 py-1 rounded-lg border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 text-[11px] font-bold hover:bg-slate-100 dark:hover:bg-slate-800">Pular ▶</button>`;
    const alvo = document.getElementById('lesson-content');
    alvo.insertBefore(barra, alvo.firstChild);

    const tirarDaTela = () => { removerDaSessao(licao.id); proximo(); };
    barra.querySelector('[data-a="editar"]').onclick = () => editarLicao(licao.id, {
        onSalvo: async (idNovo) => {
            const nova = await recarregarLicao(idNovo || licao.id);
            substituirNaSessao(nova, licao.id);
            if (!valida(nova)) return tirarDaTela();
            S.item = { ...S.item, licao: nova };
            S.fila.unshift(S.item);
            proximo();
        },
        onExcluido: tirarDaTela,
        onInativado: tirarDaTela
    });
    barra.querySelector('[data-a="nova"]').onclick = () => editarLicao(null, {
        moduleId: S.moduleId, unitId: licao.unit_id || S.unitId,
        onSalvo: async id => {
            const nova = await recarregarLicao(id);
            if (valida(nova)) S.fila.unshift({ licao: nova, rodada: 'primeira' });
            alert('Criada. Ela aparece logo após a tela atual nesta sessão. Ajuste o campo "Ordem" se quiser mudar a posição definitiva.');
        }
    });
    barra.querySelector('[data-a="pular"]').onclick = () => { S.pulou = true; S.feitos++; proximo(); };
}

// ---------------------------------------------------------------------
// Renderização
// ---------------------------------------------------------------------
function larguraLicao(larga) {
    const raiz = document.getElementById('lesson-content')?.parentElement;
    const main = document.getElementById('router-view');
    if (raiz) { raiz.classList.toggle('max-w-2xl', !larga); raiz.classList.toggle('max-w-6xl', larga); }
    if (main) { main.classList.toggle('max-w-4xl', !larga); main.classList.toggle('max-w-6xl', larga); }
}

function atualizarBarra() {
    const total = S.feitos + S.fila.length;
    document.getElementById('lesson-progress-bar').style.width = `${total ? (S.feitos / total) * 100 : 100}%`;
}

const ESTILO_BTN = {
    off: 'bg-slate-300 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
    azul: 'bg-blue-600 hover:bg-blue-700 text-white active:scale-95',
    verde: 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-95',
    ambar: 'bg-amber-500 hover:bg-amber-600 text-white active:scale-95',
    contorno: 'bg-transparent border-2 border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800'
};
function botao(texto, estilo) {
    const b = document.getElementById('btn-acao-licao');
    b.textContent = texto;
    b.dataset.acao = texto;
    b.disabled = estilo === 'off';
    b.className = `w-full sm:w-auto px-8 py-3.5 font-bold uppercase tracking-wider rounded-xl shadow-md transition-all ${ESTILO_BTN[estilo]}`;
}
function botaoSecundario(texto, onClick) {
    const principal = document.getElementById('btn-acao-licao');
    let b = document.getElementById('btn-secundario-licao');
    if (!b) {
        b = document.createElement('button');
        b.id = 'btn-secundario-licao';
        principal.parentElement.insertBefore(b, principal);
    }
    b.textContent = texto;
    b.className = `w-full sm:w-auto px-6 py-3.5 font-bold uppercase tracking-wider rounded-xl transition-all sm:mr-3 mb-2 sm:mb-0 ${ESTILO_BTN.contorno}`;
    b.onclick = onClick;
}

function limparFeedback() {
    const f = document.getElementById('feedback-area');
    f.className = 'flex-1 font-bold text-sm md:text-base hidden flex-col justify-center w-full sm:w-auto p-4 rounded-xl';
}

function proximo() {
    atualizarBarra();
    limparFeedback();
    S.opcao = null;
    const opts = document.getElementById('lesson-options');
    if (S.fila.length === 0) return fimDaFila();

    S.item = S.fila.shift();
    const { licao, rodada } = S.item;
    const corpo = document.getElementById('lesson-body');
    larguraLicao(licao.tipo === 'simulacao');
    document.getElementById('lesson-title').textContent =
        rodada === 'refazer' ? `Vamos tentar de novo: ${licao.titulo.replace(/^(Teste|Prática):\s*/, '')}` : licao.titulo;
    barraAdmin(licao);

    if (licao.tipo === 'teoria') {
        mascote('tablet', 'licao_teoria');
        corpo.innerHTML = `<div class="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm leading-relaxed">${esc(licao.conteudo_texto).replace(/\n/g, '<br>')}</div>`;
        opts.classList.add('hidden');
        botao('Continuar', 'verde');

    } else if (licao.tipo === 'simulacao') {
        mascote('apontando', 'sim_abertura');
        opts.classList.add('hidden');
        botao('Conclua a análise', 'off');
        renderSimulacao(licao.cenario, corpo, async ({ acertos, total, respostas }) => {
            const ok = acertos === total;
            if (!S.primeira.has(licao.id)) S.primeira.set(licao.id, ok);
            if (rodada === 'primeira') S.xp += Math.round((licao.xp_recompensa || XP.simulacao) * acertos / total);
            else S.refeitas++;
            enviarRegistro('simulation_attempts', {
                user_email: sessionStorage.getItem('cockpit_user_email'), lesson_id: licao.id, acertos, total, respostas,
                sessao: S.sessao, rodada, teste: isAdmin()
            });
            // Simulação errada na 1ª rodada volta ao final da lição, como as questões
            if (!ok && rodada === 'primeira') S.fila.push({ licao, rodada: 'refazer' });
            mascote(ok ? 'ola' : 'pensativo', ok ? 'sim_ok' : 'sim_revisar');
            botao('Continuar', 'azul');
        });

    } else {
        const q = licao.questions[0];
        mascote('pensativo', rodada === 'refazer' ? 'ex_refazer' : 'ex_pratica');
        corpo.innerHTML = `${rodada === 'refazer' ? '<span class="inline-block mb-3 px-2 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 text-[10px] font-black uppercase tracking-widest">Refazendo</span>' : ''}
            <p class="font-bold text-lg text-slate-800 dark:text-white">${esc(q.enunciado)}</p>`;
        opts.innerHTML = '';
        opts.classList.remove('hidden');
        embaralhar(q.question_options).forEach(opt => {
            const label = document.createElement('label');
            label.dataset.id = opt.id;
            label.innerHTML = `<input type="radio" name="opcao_aula" value="${esc(opt.id)}" class="w-5 h-5 text-blue-600 shrink-0"><span class="opc-texto"></span><span class="opc-marca"></span>`;
            label.querySelector('.opc-texto').textContent = opt.texto_alternativa;
            estadoOpcao(label, 'neutro');
            label.onclick = () => {
                if (label.querySelector('input').disabled) return;
                opts.querySelectorAll('label').forEach(l => estadoOpcao(l, 'neutro'));
                estadoOpcao(label, 'sel');
                S.opcao = opt;
                botao('Verificar', 'azul');
            };
            opts.appendChild(label);
        });
        botao('Verificar', 'off');
    }
}

// ---------------------------------------------------------------------
// Ações
// ---------------------------------------------------------------------
function acao() {
    const a = document.getElementById('btn-acao-licao').dataset.acao;
    if (a === 'Continuar') { S.feitos++; return proximo(); }
    if (a === 'Verificar' && S.opcao) return verificar();
    if (a === 'Refazer questões') return iniciarRefazer();
    if (a === 'Tentar salvar de novo') return concluir();
    if ((a === 'Próxima lição' || a === 'Ir para a Revisão') && S.proxima) {
        const u = S.proxima;
        return navigateTo('lesson', { moduleId: S.moduleId, moduleTitle: S.moduleTitle, unitId: u.id, unitTitle: u.titulo, unitTipo: u.tipo, unitConfig: u.config || {} });
    }
    if (a === 'Voltar ao módulo') return sair();
    if (a === 'Voltar ao mapa') { larguraLicao(false); return navigateTo('dashboard'); }
}

function verificar() {
    const { licao, rodada } = S.item;
    const q = licao.questions[0];
    const ok = !!S.opcao.is_correta;

    registrarResposta(licao, q, S.opcao, ok, rodada);

    let aviso = '';
    if (rodada === 'primeira') {
        S.primeira.set(licao.id, ok);
        if (ok) {
            S.xp += licao.xp_recompensa || XP.exercicio;
            const r = contarAcerto(S.seq, S.bonusAtivo);
            S.seq = r.seq; S.bonusAtivo = r.bonusAtivo; S.bonus += r.bonus;
            if (r.bonus) aviso = ` 🎯 Sequência de ${S.seq} acertos: +${r.bonus} de bônus.`;
            else if (!S.bonusAtivo) aviso = ` 🎯 Sequência: ${S.seq}. Faltam ${SEQ_PARA_REATIVAR - S.seq} acerto(s) seguidos para reativar o bônus.`;
        } else {
            const perdido = S.bonus;
            const z = contarErro();
            S.seq = z.seq; S.bonusAtivo = z.bonusAtivo; S.bonus = 0;
            aviso = perdido
                ? ` Sequência perdida: os ${perdido} ponto(s) de bônus desta lição foram zerados. Acerte ${SEQ_PARA_REATIVAR} seguidos para reativar o bônus.`
                : ` Sequência zerada. Acerte ${SEQ_PARA_REATIVAR} seguidos para reativar o bônus.`;
        }
        mostrarSequencia(S.seq, S.bonusAtivo);
    } else S.refeitas++;

    if (!ok) {
        if (S.modo === 'revisao' && S.fase === 'normal') {
            S.erradasRevisao.push(licao);
            aviso += ' Você vai rever este ponto ao final.';
        } else {
            S.fila.push({ licao, rodada: 'refazer' });
            aviso += ' Esta questão voltará ao final da lição.';
        }
    }

    const opts = document.getElementById('lesson-options');
    opts.querySelectorAll('input').forEach(i => i.disabled = true);
    opts.querySelectorAll('label').forEach(l => {
        const opt = q.question_options.find(o => String(o.id) === l.dataset.id);
        if (opt?.is_correta) estadoOpcao(l, 'certa');
        else if (String(S.opcao.id) === l.dataset.id) estadoOpcao(l, 'errada');
        else estadoOpcao(l, 'inativa');
    });

    const f = document.getElementById('feedback-area');
    f.classList.remove('hidden');
    f.classList.add(...(ok
        ? ['bg-emerald-100', 'dark:bg-emerald-900/40', 'text-emerald-800', 'dark:text-emerald-300', 'border', 'border-emerald-200', 'dark:border-emerald-800']
        : ['bg-red-100', 'dark:bg-red-900/40', 'text-red-800', 'dark:text-red-300', 'border', 'border-red-200', 'dark:border-red-800']));
    document.getElementById('feedback-title').textContent = ok ? '✔ Excelente!' : '✘ Incorreto';
    document.getElementById('feedback-desc').textContent = (q.explicacao_feedback || '') + aviso;
    mascote(ok ? 'ola' : 'pensativo', ok ? 'resp_certa' : 'resp_errada');
    botao('Continuar', 'azul');
}

function registrarResposta(licao, q, opt, correta, rodada) {
    enviarRegistro('user_answers', {
        unit_id: S.unitId || null, lesson_id: licao.id, question_id: q.id,
        option_id: opt.id, correta, rodada, sessao: S.sessao, teste: isAdmin()
    });
}

// Envia sem travar a tela, mas guarda a promessa: a conclusão só segue depois que tudo foi gravado.
function enviarRegistro(tabela, linha) {
    const p = (async () => {
        const { error } = await window.supabase.from(tabela).insert([linha]);
        if (error) { console.warn(`Registro não gravado (${tabela}):`, error.message); S.falhas.push({ tabela, linha }); }
    })();
    S.pendentes.push(p);
}

async function sincronizarRegistros() {
    await Promise.all(S.pendentes);
    S.pendentes = [];
    const falhas = S.falhas.splice(0);
    for (const f of falhas) {
        const { error } = await window.supabase.from(f.tabela).insert([f.linha]);
        if (error) S.falhas.push(f);
    }
    if (S.falhas.length) throw new Error(`${S.falhas.length} resposta(s) não foram gravadas. Verifique a conexão.`);
}

// ---------------------------------------------------------------------
// Fim da fila
// ---------------------------------------------------------------------
function scorePrimeira() {
    const r = [...S.primeira.values()];
    return r.length ? r.filter(Boolean).length / r.length : 1;
}

function fimDaFila() {
    if (S.modo === 'revisao' && S.fase === 'normal' && S.erradasRevisao.length > 0) {
        const score = scorePrimeira();
        if (score < S.cfg.min_acerto) return telaRevisaoDosPontos(score);
        S.fase = 'refazer';
        S.fila = embaralhar(S.erradasRevisao).map(l => ({ licao: l, rodada: 'refazer' }));
        mascote('ola', 'rev_atingiu', { nota: Math.round(score * 100), n: S.fila.length });
        return proximo();
    }
    concluir();
}

function telaRevisaoDosPontos(score) {
    S.fase = 'revisao_pontos';
    S.scoreRevisao = score;
    removerBarraAdmin();
    larguraLicao(false);
    document.getElementById('lesson-options').classList.add('hidden');
    limparFeedback();
    document.getElementById('lesson-title').textContent = 'Revisão dos pontos';
    mascote('pensativo', 'rev_abaixo', { nota: Math.round(score * 100), minimo: Math.round(S.cfg.min_acerto * 100) });
    if (!S.erradasRevisao.length) return concluir();
    const cards = S.erradasRevisao.map((l, i) => {
        const q = l.questions[0];
        const certa = q.question_options.find(o => o.is_correta);
        const teoria = S.teoriaDe[l.id];
        return `
          <div class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-5 space-y-3">
            <div class="flex items-center justify-between">
              <p class="text-[10px] font-black uppercase tracking-widest text-red-500">Ponto ${i + 1}</p>
              ${isAdmin() ? `<button data-adm style="${adminLivre() ? '' : 'display:none'}" data-edit="${esc(l.id)}" class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px] font-bold">✏️ Editar</button>` : ''}
            </div>
            <p class="font-bold text-slate-800 dark:text-white">${esc(q.enunciado)}</p>
            <p class="text-sm"><span class="font-bold text-emerald-700 dark:text-emerald-400">Resposta correta:</span> <span class="text-slate-700 dark:text-slate-200">${esc(certa?.texto_alternativa)}</span></p>
            <p class="text-sm text-slate-600 dark:text-slate-300">${esc(q.explicacao_feedback)}</p>
            ${teoria ? `<details class="text-sm bg-blue-50 dark:bg-blue-900/20 rounded-xl p-3">
                <summary class="cursor-pointer font-bold text-blue-700 dark:text-blue-300">📖 Rever: ${esc(teoria.titulo)}</summary>
                <p class="mt-2 text-slate-700 dark:text-slate-300">${esc(teoria.conteudo_texto)}</p></details>` : ''}
          </div>`;
    }).join('');
    const corpo = document.getElementById('lesson-body');
    corpo.innerHTML = `
      <div class="space-y-4">
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 text-sm text-amber-900 dark:text-amber-200">
          Leia os pontos abaixo. Em seguida, você vai refazer as <b>${S.erradasRevisao.length}</b> questões que errou.
          O módulo só é concluído quando todas forem respondidas corretamente.
        </div>
        ${cards}
      </div>`;
    corpo.querySelectorAll('[data-edit]').forEach(b => {
        const id = b.dataset.edit;
        const sumir = () => { removerDaSessao(id); telaRevisaoDosPontos(S.scoreRevisao); };
        b.onclick = () => editarLicao(id, {
            onSalvo: async idNovo => {
                const nova = await recarregarLicao(idNovo || id);
                substituirNaSessao(nova, id);
                telaRevisaoDosPontos(S.scoreRevisao);
            },
            onExcluido: sumir, onInativado: sumir
        });
    });
    botao('Refazer questões', 'ambar');
}

function iniciarRefazer() {
    S.fase = 'refazer';
    S.fila = embaralhar(S.erradasRevisao).map(l => ({ licao: l, rodada: 'refazer' }));
    proximo();
}

async function proximaUnidade() {
    const lista = await unidadesComConteudo();
    const todas = (await window.supabase.from('learning_units').select('id, ordem').eq('module_id', S.moduleId).order('ordem', { ascending: true })).data || [];
    const ordemAtual = todas.find(u => u.id === S.unitId)?.ordem ?? -Infinity;
    return lista.find(u => u.ordem > ordemAtual && u.id !== S.unitId) || null;
}

async function concluir() {
    removerBarraAdmin();
    larguraLicao(false);
    document.getElementById('lesson-progress-bar').style.width = '100%';
    document.getElementById('lesson-options').classList.add('hidden');
    limparFeedback();
    botao('Salvando...', 'off');

    let score = scorePrimeira();               // provisório: a nota oficial vem do servidor
    const nQuestoes = S.primeira.size;
    const acertos = [...S.primeira.values()].filter(Boolean).length;
    const revisao = S.modo === 'revisao';
    let primeiraVez = true;
    let ativ = null;
    try {
        if (S.pulou) {
            primeiraVez = false;    // conferência do admin: não grava progresso nem XP
            if (S.modo === 'licao') S.proxima = await proximaUnidade();
        } else if (S.modo === 'legado') {
            const { data: prog } = await window.supabase.from('user_progress')
                .select('status').eq('user_email', sessionStorage.getItem('cockpit_user_email'))
                .eq('module_id', S.moduleId).maybeSingle();
            primeiraVez = prog?.status !== 'concluido';
            await salvarModulo('concluido', score);
            ativ = await registrarAtividade();
            if (primeiraVez && S.xp + S.bonus > 0) await adicionarXP(S.xp + S.bonus);
        } else {
            if (!S.resultadoServidor) {
                await sincronizarRegistros();
                const { data, error } = await window.supabase.rpc('academia_concluir_unidade_v2', {
                    p_unit_id: String(S.unitId), p_sessao: S.sessao,
                    p_xp: S.xp + S.bonus, p_seq: S.seq, p_bonus_ativo: S.bonusAtivo
                });
                if (error) throw error;
                S.resultadoServidor = data;
            }
            const r = S.resultadoServidor;
            primeiraVez = r.primeira_vez === true;
            score = Number(r.score);
            setSequencia(S.seq, S.bonusAtivo);
            setXP(r.xp_total);
            if (S.modo === 'licao') S.proxima = await proximaUnidade();
            ativ = await registrarAtividade();
        }
    } catch (err) {
        console.error('Erro ao salvar conclusão:', err);
        document.getElementById('lesson-title').textContent = 'Não foi possível salvar';
        document.getElementById('lesson-body').innerHTML = `
          <div class="text-center py-8 space-y-3">
            <div class="text-5xl">⚠️</div>
            <p class="font-bold text-red-600">${esc(err.message || 'Erro de conexão.')}</p>
            <p class="text-sm text-slate-500">Seu progresso desta sessão está guardado na tela. Tente salvar de novo; não feche a página antes.</p>
          </div>`;
        botao('Tentar salvar de novo', 'ambar');
        return;
    }

    const estrelas = revisao ? estrelasDoScore(score) : 0;
    mascote('cafe', S.pulou ? 'conclusao_conferencia' : primeiraVez ? 'conclusao_xp' : 'conclusao_repeticao', { xp: S.xp + S.bonus });
    document.getElementById('lesson-title').textContent = S.pulou ? 'Conferência concluída' : (revisao ? 'Módulo concluído!' : 'Lição concluída!');
    document.getElementById('lesson-body').innerHTML = `
      <div class="text-center py-8 space-y-4">
        ${S.pulou ? `<div class="mx-auto max-w-md p-3 rounded-xl bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 text-sm font-bold text-purple-700 dark:text-purple-300">
              Você pulou itens como admin. Por isso, esta passagem não foi registrada no seu progresso nem gerou XP.</div>`
        : revisao
            ? `<div class="mx-auto w-24 h-24 rounded-full flex items-center justify-center text-4xl font-black text-white border-4" style="background:${MEDALHAS[estrelas].bg};border-color:${MEDALHAS[estrelas].borda};box-shadow:0 6px 0 ${MEDALHAS[estrelas].borda}">🏆</div>
               <div class="flex justify-center gap-1">${htmlEstrelas(estrelas, 'text-4xl')}</div>
               <p class="text-sm font-bold" style="color:${MEDALHAS[estrelas].bg}">${MEDALHAS[estrelas].nome} • ${Math.round(score * 100)}% de acerto de primeira</p>`
            : '<div class="text-6xl">✅</div>'}
        ${ativ?.primeiraHoje ? `<div class="mx-auto max-w-sm flex items-center justify-center gap-3 p-3 rounded-xl bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800">
              <span class="text-3xl">🔥</span>
              <div class="text-left"><p class="font-black text-orange-600 dark:text-orange-400">${ativ.streak} ${ativ.streak === 1 ? 'dia' : 'dias'} seguidos!</p>
              <p class="text-xs text-orange-700 dark:text-orange-300">Objetivo de hoje cumprido ✓</p></div></div>` : ''}
        ${nQuestoes && !S.pulou ? `<div class="inline-grid grid-cols-3 gap-3 text-sm">
            <div class="bg-white dark:bg-slate-800 rounded-xl p-3 border dark:border-slate-700"><p class="text-2xl font-black text-emerald-600">${acertos}/${nQuestoes}</p><p class="text-xs text-slate-500">de primeira</p></div>
            <div class="bg-white dark:bg-slate-800 rounded-xl p-3 border dark:border-slate-700"><p class="text-2xl font-black text-amber-500">${S.refeitas}</p><p class="text-xs text-slate-500">refeitas</p></div>
            <div class="bg-white dark:bg-slate-800 rounded-xl p-3 border dark:border-slate-700"><p class="text-2xl font-black text-blue-600">${primeiraVez ? '+' + (S.xp + S.bonus) : 0}</p><p class="text-xs text-slate-500">XP${primeiraVez && S.bonus ? ` (🎯 ${S.bonus} de bônus)` : ''}</p></div>
          </div>` : ''}
        <p class="text-slate-600 dark:text-slate-400">${S.pulou ? ''
            : revisao
            ? (estrelas < 3 ? 'Você concluiu o módulo! Refaça a revisão quando quiser para melhorar suas estrelas.' : 'Você concluiu o módulo com nota máxima!')
            : S.proxima ? `Progresso salvo. A seguir: <b>${esc(S.proxima.titulo)}</b>.` : 'Progresso salvo.'}</p>
      </div>`;

    if (revisao || S.modo === 'legado') {
        botao('Voltar ao mapa', 'ambar');
        if (revisao) botaoSecundario('Voltar ao módulo', () => sair());
    } else if (S.proxima) {
        botao(S.proxima.tipo === 'revisao' ? 'Ir para a Revisão' : 'Próxima lição', 'verde');
        botaoSecundario('Voltar ao módulo', () => sair());
    } else {
        botao('Voltar ao módulo', 'ambar');
    }
}

// (Status do módulo nas lições curtas/revisão agora é calculado no servidor: academia_concluir_unidade_v2)
async function salvarModulo(status, score) {
    const email = sessionStorage.getItem('cockpit_user_email');
    const { data: atual } = await window.supabase.from('user_progress')
        .select('status').eq('user_email', email).eq('module_id', S.moduleId).maybeSingle();
    if (atual?.status === 'concluido') status = 'concluido';   // nunca rebaixa quem já concluiu
    const { error } = await window.supabase.from('user_progress').upsert({
        user_email: email, module_id: S.moduleId, status,
        score: Math.round(score * 100), last_accessed: new Date().toISOString()
    }, { onConflict: 'user_email,module_id' });
    if (error) throw error;
}

function semConteudo() {
    document.getElementById('lesson-body').innerHTML = '<p class="text-center text-red-500 font-bold">Nenhuma tela ativa aqui ainda. Volte mais tarde!</p>';
    botao(S.modo === 'legado' ? 'Voltar ao mapa' : 'Voltar ao módulo', 'azul');
    if (adminLivre()) botaoSecundario('＋ Criar conteúdo', () => editarLicao(null, { moduleId: S.moduleId, unitId: S.unitId, onSalvo: () => initLessonEngine({ ...S }) }));
}

function mascote(humor, chave, vars = {}) {
    const img = document.getElementById('mascote-img');
    const fala = document.getElementById('mascote-fala');
    const f = montarFala(chave, vars);      // texto do balão, texto falado e MP3 vêm da tabela academia_falas
    if (img) img.src = `../../assets/img/capacitacao/srcockpit/sr_cockpit_${humor}.png`;
    if (fala) {
        fala.dataset.chave = chave;
        fala.dataset.falado = f.falado;
        fala.dataset.audio = f.audio;
        fala.textContent = f.texto;         // por último: é a troca do texto que dispara a narração
    }
}
