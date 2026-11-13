// =====================================================================
// Editores do administrador (usados no painel e dentro das lições)
//
// Regras de preservação do histórico:
//  - Tela SEM respostas registradas: pode editar tudo e excluir.
//  - Tela COM respostas: pode corrigir textos (ortografia, clareza).
//    Mudar a alternativa correta ou remover alternativas exige
//    "Salvar como nova versão": a atual é inativada (histórico mantido)
//    e uma cópia nova assume o mesmo lugar para quem fizer daqui em diante.
//  - Inativar: some para quem fizer a lição a partir de agora; as respostas
//    já dadas continuam contando nos relatórios. Pode ser reativada.
// =====================================================================
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export function isAdmin() { return sessionStorage.getItem('cockpit_user_role') === 'admin'; }
export function adminLivre() { return isAdmin() && sessionStorage.getItem('academia_admin_livre') !== 'false'; }
export function setAdminLivre(v) { sessionStorage.setItem('academia_admin_livre', v ? 'true' : 'false'); }

const INPUT = 'w-full p-2.5 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 outline-none focus:ring-2 focus:ring-purple-500';
const LABEL = 'block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-1';
export const CSS = { INPUT, LABEL };

// ---------------------------------------------------------------------
// Modal genérico
//   extras: [{ texto, estilo: 'perigo'|'aviso'|'secundario', acao: async (raiz) => {} }]
// ---------------------------------------------------------------------
const ESTILO_EXTRA = {
    perigo: 'text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30',
    aviso: 'text-amber-600 dark:text-amber-400 hover:bg-amber-50 dark:hover:bg-amber-900/30',
    secundario: 'border border-purple-400 text-purple-700 dark:text-purple-300 hover:bg-purple-50 dark:hover:bg-purple-900/30'
};
export function modal({ titulo, corpo, onSalvar, extras = [], textoSalvar = 'Salvar', largura = 'max-w-2xl' }) {
    const fundo = document.createElement('div');
    fundo.className = 'fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-start justify-center overflow-y-auto p-4';
    fundo.innerHTML = `
      <div class="w-full ${largura} my-8 bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
        <div class="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
          <h3 class="font-black text-slate-800 dark:text-white uppercase tracking-wide text-sm flex items-center gap-2">
            <span class="px-2 py-0.5 rounded bg-purple-600 text-white text-[10px]">ADMIN</span>${esc(titulo)}</h3>
          <button data-x class="text-slate-400 hover:text-red-500 text-xl leading-none">✕</button>
        </div>
        <div data-corpo class="p-6 space-y-4">${corpo}</div>
        <p data-erro class="hidden mx-6 mb-2 p-3 rounded-lg bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm font-bold"></p>
        <div class="flex flex-wrap items-center gap-2 px-6 py-4 border-t border-slate-200 dark:border-slate-700">
          ${extras.map((x, i) => `<button data-extra="${i}" class="px-3 py-2 text-xs font-bold uppercase rounded-lg ${ESTILO_EXTRA[x.estilo] || ESTILO_EXTRA.secundario}">${esc(x.texto)}</button>`).join('')}
          <div class="flex-1"></div>
          <button data-x class="px-4 py-2 text-xs font-bold uppercase rounded-lg text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700">Cancelar</button>
          ${onSalvar ? `<button data-salvar class="px-5 py-2 text-xs font-bold uppercase rounded-lg bg-purple-600 hover:bg-purple-700 text-white shadow">${esc(textoSalvar)}</button>` : ''}
        </div>
      </div>`;
    document.body.appendChild(fundo);
    const fechar = () => fundo.remove();
    const erro = fundo.querySelector('[data-erro]');
    const mostrarErro = m => { erro.textContent = m; erro.classList.remove('hidden'); };
    fundo.querySelectorAll('[data-x]').forEach(b => b.onclick = fechar);
    const executar = async (fn, botao) => {
        erro.classList.add('hidden');
        botao.disabled = true; const t = botao.textContent; botao.textContent = 'Aguarde...';
        try { if (await fn(fundo) !== false) fechar(); }
        catch (e) { console.error(e); mostrarErro(e.message || String(e)); }
        finally { botao.disabled = false; botao.textContent = t; }
    };
    fundo.querySelector('[data-salvar]')?.addEventListener('click', e => executar(onSalvar, e.currentTarget));
    fundo.querySelectorAll('[data-extra]').forEach(b => b.addEventListener('click', e => executar(extras[+b.dataset.extra].acao, e.currentTarget)));
    return { raiz: fundo, fechar, mostrarErro };
}

function traduzErro(e) {
    const m = e?.message || '';
    if (/row-level security|permission denied/i.test(m)) return 'Sem permissão no banco. Confirme se seu perfil é admin e se o script 03_admin.sql foi executado.';
    if (/column .*(ativo|versao_de|inativado_em)/i.test(m)) return 'Faltam colunas no banco. Execute o script 04_inativacao.sql.';
    if (/update or delete on table .* violates foreign key constraint/i.test(m)) return 'Há histórico de alunos ligado a este item (respostas, tentativas ou progresso), então ele não pode ser excluído. Use "Inativar" para tirá-lo do ar sem perder o histórico.';
    return m;
}
const ok = ({ error }) => { if (error) throw new Error(traduzErro(error)); };

// Se a contagem falhar (ex.: RLS), NÃO assume zero: zero liberaria a exclusão de uma tela com histórico.
async function contarRespostas(licao) {
    let n = 0;
    const r1 = await window.supabase.from('user_answers').select('id', { count: 'exact', head: true }).eq('lesson_id', licao.id);
    if (r1.error || r1.count == null) throw new Error('Não foi possível contar as respostas: ' + traduzErro(r1.error));
    n += r1.count;
    if (licao.tipo === 'simulacao') {
        const r2 = await window.supabase.from('simulation_attempts').select('id', { count: 'exact', head: true }).eq('lesson_id', licao.id);
        if (r2.error || r2.count == null) throw new Error('Não foi possível contar as tentativas: ' + traduzErro(r2.error));
        n += r2.count;
    }
    return n;
}

// ---------------------------------------------------------------------
// Lição (teoria, exercício ou simulação)
//   editarLicao(id, callbacks)              -> edita
//   editarLicao(null, { moduleId, unitId })  -> cria
//   callbacks: onSalvo(idResultante), onExcluido(), onInativado()
// ---------------------------------------------------------------------
export async function editarLicao(lessonId, { moduleId, unitId, onSalvo, onExcluido, onInativado } = {}) {
    let licao = null;
    if (lessonId) {
        const { data, error } = await window.supabase.from('lessons')
            .select('id, module_id, unit_id, titulo, tipo, conteudo_texto, ordem, xp_recompensa, cenario, ativo, versao_de, questions(id, enunciado, explicacao_feedback, question_options(id, texto_alternativa, is_correta, ordem))')
            .eq('id', lessonId).single();
        if (error) return alert('Erro ao carregar a lição: ' + traduzErro(error));
        licao = data;
        moduleId = data.module_id;
    }
    let nResp = 0;
    if (licao) {
        try { nResp = await contarRespostas(licao); }
        catch (e) { return alert(e.message + '\nPor segurança, a edição não foi aberta.'); }
    }
    const ativa = licao ? licao.ativo !== false : true;

    const { data: unidades } = await window.supabase.from('learning_units')
        .select('id, titulo, ordem, tipo').eq('module_id', moduleId).order('ordem', { ascending: true });
    const nova = !licao;
    const tipo0 = licao?.tipo || 'exercicio';
    const q = licao?.questions?.[0];
    const opcoes = [...(q?.question_options || [])].sort((a, b) => a.ordem - b.ordem);
    while (opcoes.length < 4 && !q) opcoes.push({ id: null, texto_alternativa: '', is_correta: opcoes.length === 0 });

    const optUnid = (unidades || []).filter(u => u.tipo === 'licao')
        .map(u => `<option value="${esc(u.id)}" ${u.id === (licao?.unit_id ?? unitId) ? 'selected' : ''}>${esc(u.ordem + '. ' + u.titulo)}</option>`).join('');

    const aviso = !licao ? '' : `
      <div class="p-3 rounded-xl text-xs leading-relaxed ${!ativa
        ? 'bg-slate-100 dark:bg-slate-900 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300'
        : nResp ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-200'
                : 'bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200'}">
        ${!ativa ? '<b>INATIVA.</b> Não aparece para ninguém a partir de agora. As respostas já dadas continuam nos relatórios. '
                 : ''}
        ${nResp
          ? `<b>${nResp} resposta(s) registrada(s).</b> Correções de texto podem ser salvas normalmente. Para mudar a alternativa correta ou remover alternativas, use <b>Salvar como nova versão</b>: esta fica inativa com o histórico, e a nova assume o mesmo lugar.`
          : 'Ainda sem respostas registradas: pode editar livremente ou excluir.'}
        ${licao.versao_de ? '<br><i>Esta tela é uma nova versão de outra, já inativada.</i>' : ''}
      </div>`;

    const corpo = `${aviso}
      <div class="grid grid-cols-1 md:grid-cols-6 gap-3">
        <div class="md:col-span-4"><label class="${LABEL}">Título</label><input data-f="titulo" class="${INPUT}" value="${esc(licao?.titulo)}"></div>
        <div class="md:col-span-2"><label class="${LABEL}">Tipo</label>
          <select data-f="tipo" class="${INPUT}" ${nova ? '' : 'disabled'}>
            ${['teoria', 'exercicio', 'simulacao'].map(t => `<option value="${t}" ${t === tipo0 ? 'selected' : ''}>${t}</option>`).join('')}
          </select></div>
        <div class="md:col-span-4"><label class="${LABEL}">Lição curta</label>
          <select data-f="unit_id" class="${INPUT}"><option value="">(sem lição curta)</option>${optUnid}</select></div>
        <div><label class="${LABEL}">Ordem</label><input data-f="ordem" type="number" class="${INPUT}" value="${esc(licao?.ordem ?? '')}" placeholder="fim"></div>
        <div><label class="${LABEL}">XP</label><input data-f="xp" type="number" class="${INPUT}" value="${esc(licao?.xp_recompensa ?? '')}" placeholder="padrão"></div>
      </div>

      <div data-bloco="teoria" class="space-y-1">
        <label class="${LABEL}">Texto da teoria</label>
        <textarea data-f="conteudo" rows="9" class="${INPUT}">${esc(licao?.conteudo_texto)}</textarea>
      </div>

      <div data-bloco="exercicio" class="space-y-3">
        <div><label class="${LABEL}">Enunciado</label><textarea data-f="enunciado" rows="3" class="${INPUT}">${esc(q?.enunciado)}</textarea></div>
        <div>
          <label class="${LABEL}">Alternativas <span class="normal-case font-semibold tracking-normal">(marque a correta)</span></label>
          <div data-opcoes class="space-y-2"></div>
          <button data-addopt class="mt-2 text-xs font-bold text-purple-600 hover:text-purple-800 dark:text-purple-400">+ Alternativa</button>
        </div>
        <div><label class="${LABEL}">Explicação (feedback)</label><textarea data-f="explicacao" rows="3" class="${INPUT}">${esc(q?.explicacao_feedback)}</textarea></div>
      </div>

      <div data-bloco="simulacao" class="space-y-1">
        <label class="${LABEL}">Cenário da simulação (JSON)</label>
        <textarea data-f="cenario" rows="16" class="${INPUT} font-mono text-xs">${esc(licao?.cenario ? JSON.stringify(licao.cenario, null, 2) : '')}</textarea>
      </div>`;

    const removidas = [];
    const ctx = { licao, moduleId, removidas, onSalvo, nResp };
    const extras = [];
    if (licao && !nResp) extras.push({
        texto: 'Excluir', estilo: 'perigo', acao: async () => {
            if (!confirm(`Excluir definitivamente "${licao.titulo}"?`)) return false;
            if (q) {
                ok(await window.supabase.from('question_options').delete().eq('question_id', q.id));
                ok(await window.supabase.from('questions').delete().eq('id', q.id));
            }
            ok(await window.supabase.from('lessons').delete().eq('id', licao.id));
            await onExcluido?.();
        }
    });
    if (licao && ativa) extras.push({
        texto: 'Inativar', estilo: 'aviso', acao: async () => {
            if (!confirm(`Inativar "${licao.titulo}"?\n\nEla deixa de aparecer para quem fizer a lição a partir de agora. As respostas já dadas continuam nos relatórios. Você pode reativar depois.`)) return false;
            ok(await window.supabase.from('lessons').update({ ativo: false, inativado_em: new Date().toISOString() }).eq('id', licao.id));
            await (onInativado || onExcluido)?.();
        }
    });
    if (licao && !ativa) extras.push({
        texto: 'Reativar', estilo: 'secundario', acao: async () => {
            ok(await window.supabase.from('lessons').update({ ativo: true, inativado_em: null }).eq('id', licao.id));
            await onSalvo?.(licao.id);
        }
    });
    if (licao && ativa) extras.push({
        texto: 'Salvar como nova versão', estilo: 'secundario',
        acao: raiz => salvarLicao(raiz, { ...ctx, novaVersaoDe: licao })
    });

    const m = modal({
        titulo: nova ? 'Nova tela' : 'Editar tela',
        corpo, largura: 'max-w-3xl', extras,
        onSalvar: raiz => salvarLicao(raiz, ctx)
    });
    const r = m.raiz;
    const listaOpc = r.querySelector('[data-opcoes]');
    const linhaOpcao = o => {
        const div = document.createElement('div');
        div.className = 'flex items-center gap-2';
        div.dataset.id = o.id ?? '';
        div.innerHTML = `
          <input type="radio" name="adm-correta" ${o.is_correta ? 'checked' : ''} class="w-5 h-5 accent-emerald-600 shrink-0" title="Correta">
          <input data-texto class="${INPUT}" value="${esc(o.texto_alternativa)}">
          <button data-rm class="text-slate-400 hover:text-red-500 px-2 text-lg" title="Remover">🗑</button>`;
        div.querySelector('[data-rm]').onclick = () => {
            if (listaOpc.children.length <= 2) return alert('A questão precisa de ao menos 2 alternativas.');
            if (div.dataset.id) removidas.push(div.dataset.id);
            div.remove();
        };
        listaOpc.appendChild(div);
    };
    opcoes.forEach(linhaOpcao);
    r.querySelector('[data-addopt]').onclick = () => {
        if (listaOpc.children.length >= 6) return alert('Máximo de 6 alternativas.');
        linhaOpcao({ id: null, texto_alternativa: '', is_correta: false });
    };
    const selTipo = r.querySelector('[data-f="tipo"]');
    const mostrarBloco = () => r.querySelectorAll('[data-bloco]').forEach(b => b.classList.toggle('hidden', b.dataset.bloco !== selTipo.value));
    selTipo.onchange = mostrarBloco; mostrarBloco();
}

async function salvarLicao(r, { licao, moduleId, removidas, onSalvo, nResp, novaVersaoDe }) {
    const base = novaVersaoDe ? null : licao;          // null = cria registro novo
    const v = k => r.querySelector(`[data-f="${k}"]`).value;
    const tipo = v('tipo');
    const titulo = v('titulo').trim();
    if (!titulo) throw new Error('Informe o título.');
    const reg = { titulo, unit_id: v('unit_id') || null };
    if (v('xp') !== '') reg.xp_recompensa = parseInt(v('xp'), 10);
    if (tipo === 'teoria') {
        reg.conteudo_texto = v('conteudo').trim();
        if (!reg.conteudo_texto) throw new Error('Informe o texto da teoria.');
    }
    if (tipo === 'simulacao') {
        try { reg.cenario = JSON.parse(v('cenario')); } catch (e) { throw new Error('JSON do cenário inválido: ' + e.message); }
        if (!Array.isArray(reg.cenario?.itens) || !reg.cenario.itens.length) throw new Error('O cenário precisa ter a lista "itens".');
    }
    let opcs = [];
    if (tipo === 'exercicio') {
        if (!v('enunciado').trim()) throw new Error('Informe o enunciado.');
        opcs = [...r.querySelectorAll('[data-opcoes] > div')].map((d, i) => ({
            id: novaVersaoDe ? null : (d.dataset.id || null),
            texto_alternativa: d.querySelector('[data-texto]').value.trim(),
            is_correta: d.querySelector('input[type=radio]').checked, ordem: i + 1
        }));
        if (opcs.some(o => !o.texto_alternativa)) throw new Error('Há alternativa sem texto.');
        if (opcs.filter(o => o.is_correta).length !== 1) throw new Error('Marque exatamente uma alternativa correta.');

        // Proteção do histórico
        if (base && nResp > 0) {
            const corretaAntes = base.questions?.[0]?.question_options?.find(o => o.is_correta)?.id;
            const corretaAgora = opcs.find(o => o.is_correta)?.id;
            if (removidas.length) throw new Error(`Esta questão já tem ${nResp} resposta(s). Remover alternativas apagaria o que os participantes marcaram. Use "Salvar como nova versão".`);
            if (corretaAntes && corretaAgora !== corretaAntes) throw new Error(`Esta questão já tem ${nResp} resposta(s). Mudar a alternativa correta alteraria resultados já registrados. Use "Salvar como nova versão".`);
        }
    }
    if (tipo === 'simulacao' && base && nResp > 0 && JSON.stringify(reg.cenario) !== JSON.stringify(base.cenario)) {
        throw new Error(`Esta simulação já tem ${nResp} tentativa(s). Para alterar o cenário, use "Salvar como nova versão".`);
    }

    let ordem = v('ordem') === '' ? null : parseInt(v('ordem'), 10);
    if (ordem == null && !base) {
        if (novaVersaoDe) ordem = novaVersaoDe.ordem;
        else {
            const { data } = await window.supabase.from('lessons').select('ordem').eq('module_id', moduleId).order('ordem', { ascending: false }).limit(1);
            ordem = (data?.[0]?.ordem || 0) + 1;
        }
    }
    if (ordem != null) reg.ordem = ordem;

    let id = base?.id;
    if (base) ok(await window.supabase.from('lessons').update(reg).eq('id', id));
    else {
        const novo = { ...reg, module_id: moduleId, tipo, xp_recompensa: reg.xp_recompensa ?? ({ teoria: 10, exercicio: 20, simulacao: 50 }[tipo]) };
        if (novaVersaoDe) novo.versao_de = novaVersaoDe.id;
        const { data, error } = await window.supabase.from('lessons').insert([novo]).select('id').single();
        if (error) throw new Error(traduzErro(error));
        id = data.id;
    }

    if (tipo === 'exercicio') {
        let qid = base?.questions?.[0]?.id;
        const qreg = { enunciado: v('enunciado').trim(), explicacao_feedback: v('explicacao').trim() };
        if (qid) ok(await window.supabase.from('questions').update(qreg).eq('id', qid));
        else {
            const { data, error } = await window.supabase.from('questions').insert([{ ...qreg, lesson_id: id }]).select('id').single();
            if (error) throw new Error(traduzErro(error));
            qid = data.id;
        }
        if (base) for (const rid of removidas) ok(await window.supabase.from('question_options').delete().eq('id', rid));
        for (const o of opcs.filter(o => o.id)) {
            ok(await window.supabase.from('question_options')
                .update({ texto_alternativa: o.texto_alternativa, is_correta: o.is_correta, ordem: o.ordem }).eq('id', o.id));
        }
        const novas = opcs.filter(o => !o.id).map(o => ({ question_id: qid, texto_alternativa: o.texto_alternativa, is_correta: o.is_correta, ordem: o.ordem }));
        if (novas.length) ok(await window.supabase.from('question_options').insert(novas));
    }

    // Nova versão: a anterior sai de circulação, com o histórico preservado
    if (novaVersaoDe) {
        ok(await window.supabase.from('lessons').update({ ativo: false, inativado_em: new Date().toISOString() }).eq('id', novaVersaoDe.id));
    }
    await onSalvo?.(id);
}

// ---------------------------------------------------------------------
// Lição curta (unidade) e Revisão do Módulo
// ---------------------------------------------------------------------
export function editarUnidade(unit, { moduleId, onSalvo } = {}) {
    const nova = !unit;
    const revisao = unit?.tipo === 'revisao';
    const cfg = unit?.config || {};
    const extras = nova ? [] : [{
        texto: 'Excluir', estilo: 'perigo', acao: async () => {
            // Excluir a lição curta apagaria o progresso (e as medalhas) de quem já a concluiu. Se a contagem falhar, não exclui.
            const { count, error } = await window.supabase.from('user_unit_progress').select('id', { count: 'exact', head: true }).eq('unit_id', unit.id);
            if (error || count == null) throw new Error('Não foi possível verificar o progresso dos alunos. Nada foi excluído. ' + traduzErro(error));
            if (count > 0) throw new Error(`${count} aluno(s) já concluíram "${unit.titulo}". Excluir apagaria esse progresso${unit.tipo === 'revisao' ? ' e as medalhas da Revisão' : ''}. Edite a lição em vez de excluí-la.`);
            if (!confirm(`Excluir "${unit.titulo}"? As telas dela NÃO serão apagadas: ficam "sem lição curta" até você movê-las ou organizar.`)) return false;
            ok(await window.supabase.from('lessons').update({ unit_id: null }).eq('unit_id', unit.id));
            ok(await window.supabase.from('learning_units').delete().eq('id', unit.id));
            await onSalvo?.();
        }
    }];
    modal({
        titulo: nova ? 'Nova lição curta' : (revisao ? 'Configurar Revisão do Módulo' : 'Editar lição curta'),
        largura: 'max-w-lg', extras,
        corpo: `
          <div><label class="${LABEL}">Título</label><input data-f="titulo" class="${INPUT}" value="${esc(unit?.titulo)}"></div>
          ${revisao ? `
          <div class="grid grid-cols-2 gap-3">
            <div><label class="${LABEL}">Questões sorteadas</label><input data-f="qtd" type="number" min="3" class="${INPUT}" value="${esc(cfg.qtd ?? 8)}"></div>
            <div><label class="${LABEL}">Mínimo de acerto (%)</label><input data-f="min" type="number" min="0" max="100" class="${INPUT}" value="${esc(Math.round((cfg.min_acerto ?? 0.7) * 100))}"></div>
          </div>` : `<div><label class="${LABEL}">Ordem</label><input data-f="ordem" type="number" class="${INPUT}" value="${esc(unit?.ordem ?? '')}" placeholder="fim"></div>`}`,
        onSalvar: async r => {
            const v = k => r.querySelector(`[data-f="${k}"]`)?.value;
            const titulo = v('titulo').trim();
            if (!titulo) throw new Error('Informe o título.');
            const reg = { titulo };
            if (revisao) reg.config = { ...cfg, qtd: parseInt(v('qtd'), 10) || 8, min_acerto: (parseInt(v('min'), 10) || 70) / 100 };
            let ordem = v('ordem') ? parseInt(v('ordem'), 10) : null;
            // A Revisão tem ordem 999: nenhuma lição curta pode alcançá-la
            if (!revisao && ordem != null && ordem >= 999) throw new Error('A ordem máxima de uma lição curta é 998 (a Revisão fica sempre por último).');
            if (nova) {
                if (ordem == null) {
                    const { data } = await window.supabase.from('learning_units').select('ordem').eq('module_id', moduleId).eq('tipo', 'licao').order('ordem', { ascending: false }).limit(1);
                    ordem = (data?.[0]?.ordem || 0) + 1;
                }
                ok(await window.supabase.from('learning_units').insert([{ ...reg, module_id: moduleId, ordem, tipo: 'licao' }]));
            } else {
                if (ordem != null && !revisao) reg.ordem = ordem;
                ok(await window.supabase.from('learning_units').update(reg).eq('id', unit.id));
            }
            await onSalvo?.();
        }
    });
}

// ---------------------------------------------------------------------
// Trilha e módulo
// ---------------------------------------------------------------------
export function editarTrilha(t, { onSalvo } = {}) {
    const nova = !t;
    const extras = nova ? [] : [{
        texto: 'Excluir', estilo: 'perigo', acao: async () => {
            const { count } = await window.supabase.from('learning_modules').select('id', { count: 'exact', head: true }).eq('track_id', t.id);
            if (count > 0) throw new Error('A trilha tem módulos. Para escondê-la, marque como Inativa.');
            if (!confirm(`Excluir a trilha "${t.titulo}"?`)) return false;
            ok(await window.supabase.from('learning_tracks').delete().eq('id', t.id));
            await onSalvo?.();
        }
    }];
    modal({
        titulo: nova ? 'Nova trilha' : 'Editar trilha', largura: 'max-w-lg', extras,
        corpo: `
          <div><label class="${LABEL}">Título</label><input data-f="titulo" class="${INPUT}" value="${esc(t?.titulo)}"></div>
          <div class="grid grid-cols-2 gap-3">
            <div><label class="${LABEL}">Nível</label><input data-f="nivel" list="adm-niveis" class="${INPUT}" value="${esc(t?.nivel)}">
              <datalist id="adm-niveis"><option>Inicial</option><option>Intermediário</option><option>Avançado</option><option>Especialista</option></datalist></div>
            <div><label class="${LABEL}">Situação</label><select data-f="ativo" class="${INPUT}">
              <option value="true" ${t?.ativo !== false ? 'selected' : ''}>Ativa</option><option value="false" ${t?.ativo === false ? 'selected' : ''}>Inativa</option></select></div>
          </div>
          <div><label class="${LABEL}">Descrição</label><textarea data-f="descricao" rows="3" class="${INPUT}">${esc(t?.descricao)}</textarea></div>`,
        onSalvar: async r => {
            const v = k => r.querySelector(`[data-f="${k}"]`).value;
            const reg = { titulo: v('titulo').trim(), nivel: v('nivel').trim(), descricao: v('descricao').trim(), ativo: v('ativo') === 'true' };
            if (!reg.titulo) throw new Error('Informe o título.');
            ok(nova ? await window.supabase.from('learning_tracks').insert([reg])
                    : await window.supabase.from('learning_tracks').update(reg).eq('id', t.id));
            await onSalvo?.();
        }
    });
}

export function editarModulo(mod, { trackId, trilhas = [], onSalvo } = {}) {
    const novo = !mod;
    const extras = novo ? [] : [{
        texto: 'Excluir', estilo: 'perigo', acao: async () => {
            const { count } = await window.supabase.from('lessons').select('id', { count: 'exact', head: true }).eq('module_id', mod.id);
            if (count > 0) throw new Error(`O módulo tem ${count} telas (ativas ou inativas). Ele não pode ser excluído.`);
            if (!confirm(`Excluir o módulo "${mod.titulo}"?`)) return false;
            ok(await window.supabase.from('learning_modules').delete().eq('id', mod.id));
            await onSalvo?.();
        }
    }];
    modal({
        titulo: novo ? 'Novo módulo' : 'Editar módulo', largura: 'max-w-lg', extras,
        corpo: `
          <div><label class="${LABEL}">Título</label><input data-f="titulo" class="${INPUT}" value="${esc(mod?.titulo)}"></div>
          <div class="grid grid-cols-3 gap-3">
            <div class="col-span-2"><label class="${LABEL}">Trilha</label><select data-f="track_id" class="${INPUT}">
              ${trilhas.map(t => `<option value="${esc(t.id)}" ${t.id === (mod?.track_id ?? trackId) ? 'selected' : ''}>${esc(t.titulo)}</option>`).join('')}</select></div>
            <div><label class="${LABEL}">Ordem</label><input data-f="ordem" type="number" class="${INPUT}" value="${esc(mod?.ordem ?? '')}" placeholder="fim"></div>
          </div>
          <p class="text-xs text-slate-500 dark:text-slate-400">O importador de lotes localiza o módulo pelo título exato.</p>`,
        onSalvar: async r => {
            const v = k => r.querySelector(`[data-f="${k}"]`).value;
            const reg = { titulo: v('titulo').trim(), track_id: v('track_id') };
            if (!reg.titulo) throw new Error('Informe o título.');
            if (v('ordem') !== '') reg.ordem = parseInt(v('ordem'), 10);
            else if (novo) {
                const { data } = await window.supabase.from('learning_modules').select('ordem').eq('track_id', reg.track_id).order('ordem', { ascending: false }).limit(1);
                reg.ordem = (data?.[0]?.ordem || 0) + 1;
            }
            ok(novo ? await window.supabase.from('learning_modules').insert([reg])
                    : await window.supabase.from('learning_modules').update(reg).eq('id', mod.id));
            await onSalvo?.();
        }
    });
}
