// =====================================================================
// Admin > aba "Certificados"
//  - modelo por trilha (patente, emblema, cores, carga horária digitada, texto)
//  - modelo da patente Referência (+ regras de bronze/ouro)
//  - configurações gerais (URL de verificação, instituição, assinatura do Sr. Cockpit)
// Alterações valem para certificados emitidos DEPOIS; os já emitidos não mudam.
// =====================================================================
import { esc, ensureRecursos, renderCertificado, miniatura } from './cert_render.js';
import { qrSvg } from './qr.js';

const TEXTO_TRILHA = 'concluiu com êxito a trilha **{{trilha}}** (nível {{nivel}}) da Academia CGCF, com carga horária de **{{carga}} horas** e aproveitamento médio de **{{media}}%** nas Revisões dos módulos, alcançando a patente de **{{patente}}**. Emitido em {{data}}.';
const TEXTO_REF = 'concluiu com êxito as **{{n_trilhas}} trilhas** da Academia CGCF, cumprindo todos os módulos e Revisões, com carga horária total de **{{carga}} horas** e aproveitamento médio de **{{media}}%**, alcançando a patente máxima de **{{patente}}**. Emitido em {{data}}.';
const TOKENS = ['aluno', 'trilha', 'nivel', 'carga', 'media', 'patente', 'data', 'n_trilhas'];
const EMBLEMAS = [['chev:1', '1 chevron'], ['chev:2', '2 chevrons'], ['chev:3', '3 chevrons'], ['star:1', '1 estrela'], ['star:2', '2 estrelas'], ['star:3', '3 estrelas'], ['ref:1', 'Referência (louros e estrela)']];
const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

const INPUT = 'w-full p-2 text-sm border rounded-lg bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white';
const LABEL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';

let ST = null;   // { tracks, modulos, cfg }

export function initCertAdmin() {
    const aba = document.querySelector('.adm-tab[data-tab="certificados"]');
    if (!aba || aba.dataset.certLigado) return;
    aba.dataset.certLigado = '1';
    aba.addEventListener('click', carregar);
}

async function carregar() {
    const sec = document.getElementById('adm-certificados');
    if (!sec) return;
    ensureRecursos();
    sec.innerHTML = '<p class="text-center text-slate-400 animate-pulse py-6">Carregando...</p>';
    try {
        const [r1, r2, r3] = await Promise.all([
            window.supabase.from('learning_tracks').select('*').order('created_at', { ascending: true }),
            window.supabase.from('learning_modules').select('id, track_id, titulo, ordem').order('ordem', { ascending: true }),
            window.supabase.from('academia_cert_config').select('*').eq('id', 1).maybeSingle()
        ]);
        for (const r of [r1, r2, r3]) if (r.error) throw r.error;
        if (!r3.data) throw new Error('Configuração de certificados não encontrada. Execute o script 06_certificados.sql.');
        if (r1.data.length && !('cert_patente' in r1.data[0])) throw new Error('Colunas de certificado ausentes em learning_tracks. Execute o script 06_certificados.sql.');
        ST = { tracks: r1.data, modulos: r2.data || [], cfg: r3.data };
        desenhar(sec);
    } catch (e) {
        console.error(e);
        sec.innerHTML = `<div class="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">${esc(e.message || e)}</div>`;
    }
}

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const dataExtenso = d => `${d.getDate()} de ${MESES[d.getMonth()]} de ${d.getFullYear()}`;
function aplicarTokens(tpl, v) {
    return String(tpl || '').replace(/\{\{(\w+)\}\}/g, (m, k) => (k in v ? String(v[k]) : m));
}
function tokensDesconhecidos(tpl) {
    return [...new Set([...String(tpl || '').matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]).filter(k => !TOKENS.includes(k)))];
}
const hex = (v, p) => /^#[0-9a-fA-F]{6}$/.test(v || '') ? v : p;

// Valores atuais do formulário de um cartão
function ler(card) {
    const g = f => card.querySelector(`[data-f="${f}"]`);
    const [et, en] = (g('emb')?.value || 'chev:1').split(':');
    return {
        hab: g('hab')?.checked || false, patente: g('patente').value.trim(),
        emb_t: et, emb_n: parseInt(en, 10) || 1,
        c1: g('c1').value, cd: g('cd').value, c2: g('c2').value,
        carga: parseInt(g('carga').value, 10) || 0, texto: g('texto').value.trim(),
        min_ouro: g('min_ouro') ? parseInt(g('min_ouro').value, 10) : null,
        max_bronze: g('max_bronze') ? parseInt(g('max_bronze').value, 10) : null
    };
}

function snapshotAmostra(def, ctx) {
    const cfg = ST.cfg;
    const vals = { aluno: 'Nome do Aluno', trilha: ctx.titulo, nivel: (ctx.nivel || '').toLowerCase(), carga: def.carga || 'XX', media: 86, patente: def.patente || 'Patente', data: dataExtenso(new Date()), n_trilhas: ctx.n };
    return {
        tipo: ctx.ref ? 'referencia' : 'trilha',
        instituicao: cfg.instituicao, subinstituicao: cfg.subinstituicao, titulo_doc: 'CERTIFICADO',
        subtitulo: ctx.ref ? 'de conclusão da jornada completa' : 'de conclusão de trilha',
        patente: def.patente || 'Patente', patente_rotulo: ctx.ref ? 'Patente máxima · ' : 'Patente · ',
        emblema: { t: ctx.ref ? 'ref' : def.emb_t, n: def.emb_n },
        cores: { c1: hex(def.c1, '#38BDF8'), cd: hex(def.cd, '#0369A1'), c2: hex(def.c2, '#FDE68A') },
        aluno: vals.aluno, texto: aplicarTokens(def.texto, vals),
        lista_rotulo: ctx.ref ? 'Trilhas concluídas:' : 'Módulos concluídos:', lista: ctx.lista,
        media: 86, selo: 'PRATA', assinatura: { nome: cfg.assinatura_nome, papel: cfg.assinatura_papel }, codigo: 'CGCF-0000-EXEM-PLO1'
    };
}

// ---------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------
function desenhar(sec) {
    const c = ST.cfg;
    const trilhas = ST.tracks;
    sec.innerHTML = `
    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300">
      <b>Como funciona:</b> o aluno emite o certificado de uma trilha ao concluir todos os módulos com conteúdo, com média de 70% ou mais nas Revisões
      (selo Prata de 70% a 89%, Ouro a partir de 90%). Depois de emitido, o certificado <b>não muda</b>. A carga horária é digitada por você;
      a trilha só libera a certificação quando estiver <b>habilitada</b> e com carga horária preenchida.
    </div>

    <div class="bg-white dark:bg-slate-800 rounded-xl p-5 border border-slate-200 dark:border-slate-700 space-y-3" id="cfg-geral">
      <h3 class="font-bold text-slate-800 dark:text-white uppercase tracking-wider text-sm">Configurações gerais</h3>
      <div class="grid md:grid-cols-2 gap-3">
        <div class="md:col-span-2"><label class="${LABEL}">URL da página de verificação (QR Code)</label>
          <input data-g="url_verificacao" class="${INPUT}" placeholder="https://seu-site/capacitacao/verificar.html" value="${esc(c.url_verificacao || '')}">
          <p class="text-[11px] text-slate-400 mt-1">Em branco, usa o arquivo verificar.html ao lado do app. Informe a URL publicada para o QR não mudar entre ambiente local e publicado.</p></div>
        <div><label class="${LABEL}">Instituição (topo)</label><input data-g="instituicao" class="${INPUT}" value="${esc(c.instituicao)}"></div>
        <div><label class="${LABEL}">Subtítulo institucional</label><input data-g="subinstituicao" class="${INPUT}" value="${esc(c.subinstituicao)}"></div>
        <div><label class="${LABEL}">Assinatura (nome)</label><input data-g="assinatura_nome" class="${INPUT}" value="${esc(c.assinatura_nome)}"></div>
        <div><label class="${LABEL}">Assinatura (função)</label><input data-g="assinatura_papel" class="${INPUT}" value="${esc(c.assinatura_papel)}"></div>
      </div>
      <div class="flex items-center gap-3"><button id="g-salvar" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase rounded-lg">Salvar configurações</button><span id="g-msg" class="text-sm font-semibold"></span></div>
    </div>

    <div id="cards" class="space-y-4"></div>`;

    const cards = sec.querySelector('#cards');
    cards.innerHTML = cartaoReferencia() + trilhas.map(cartaoTrilha).join('');

    sec.querySelector('#g-salvar').onclick = salvarGeral;
    cards.querySelectorAll('[data-card]').forEach(prepararCartao);
}

function camposComuns(d, ref) {
    return `
      <div class="grid md:grid-cols-4 gap-3">
        <div class="md:col-span-2"><label class="${LABEL}">Patente</label><input data-f="patente" class="${INPUT}" value="${esc(d.patente)}"></div>
        ${ref ? '' : `<div><label class="${LABEL}">Emblema</label><select data-f="emb" class="${INPUT}">${EMBLEMAS.filter(e => e[0] !== 'ref:1').map(([v, n]) => `<option value="${v}" ${v === d.emb ? 'selected' : ''}>${n}</option>`).join('')}</select></div>`}
        <div><label class="${LABEL}">Carga horária (h)</label><input data-f="carga" type="number" min="0" max="2000" class="${INPUT}" value="${d.carga || ''}" placeholder="${ref ? 'vazio = soma das trilhas' : 'digite'}"></div>
      </div>
      <div class="grid grid-cols-3 gap-3 max-w-md">
        <div><label class="${LABEL}">Cor principal</label><input data-f="c1" type="color" class="w-full h-9 rounded border border-slate-300 dark:border-slate-600 bg-transparent" value="${hex(d.c1, '#38BDF8')}"></div>
        <div><label class="${LABEL}">Cor escura</label><input data-f="cd" type="color" class="w-full h-9 rounded border border-slate-300 dark:border-slate-600 bg-transparent" value="${hex(d.cd, '#0369A1')}"></div>
        <div><label class="${LABEL}">Cor de detalhe</label><input data-f="c2" type="color" class="w-full h-9 rounded border border-slate-300 dark:border-slate-600 bg-transparent" value="${hex(d.c2, '#FDE68A')}"></div>
      </div>
      <div><label class="${LABEL}">Texto do certificado</label>
        <textarea data-f="texto" rows="4" class="${INPUT}">${esc(d.texto)}</textarea>
        <p class="text-[11px] text-slate-400 mt-1">Campos: ${TOKENS.map(t => `<code>{{${t}}}</code>`).join(' ')} &nbsp;·&nbsp; use <code>**texto**</code> para negrito.</p></div>`;
}

function cabecalhoCartao(titulo, sub, d) {
    return `<div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3 min-w-0">
        <span class="w-9 h-9 rounded-lg shrink-0" style="background:linear-gradient(135deg,${hex(d.cd, '#334155')},${hex(d.c1, '#64748B')})"></span>
        <div class="min-w-0"><p class="font-bold text-slate-800 dark:text-white truncate">${esc(titulo)}</p>
          <p class="text-xs text-slate-500">${esc(sub)}</p></div>
      </div>
      <div class="flex items-center gap-2">
        <span data-badge class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${d.hab ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}">${d.hab ? 'Habilitada' : 'Desabilitada'}</span>
        <button data-abrir class="px-3 py-1.5 border border-purple-400 text-purple-700 dark:text-purple-300 font-bold text-[11px] uppercase rounded-lg hover:bg-purple-50 dark:hover:bg-purple-900/30">Editar</button>
      </div></div>`;
}

function defDaTrilha(t) {
    return {
        hab: !!t.cert_habilitada, patente: t.cert_patente || '', emb: `${t.cert_emblema_tipo || 'chev'}:${t.cert_emblema_qtd || 1}`,
        c1: t.cert_cor1 || '#38BDF8', cd: t.cert_cor_escura || '#0369A1', c2: t.cert_cor2 || '#FDE68A',
        carga: t.cert_carga_horaria || 0, texto: t.cert_texto || TEXTO_TRILHA
    };
}

function cartaoTrilha(t) {
    const d = defDaTrilha(t);
    const nMods = ST.modulos.filter(m => String(m.track_id) === String(t.id)).length;
    return `<div data-card="trilha" data-id="${esc(t.id)}" class="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-4">
      ${cabecalhoCartao(t.titulo, `${t.nivel || 'Trilha'} · ${nMods} módulo(s)${d.patente ? ' · Patente ' + d.patente : ''}`, d)}
      <div data-painel class="hidden space-y-4 border-t border-slate-100 dark:border-slate-700 pt-4">
        <label class="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><input data-f="hab" type="checkbox" class="w-4 h-4 accent-emerald-600" ${d.hab ? 'checked' : ''}> Certificação habilitada (o aluno pode emitir)</label>
        ${camposComuns(d, false)}
        <div data-prev class="overflow-x-auto"></div>
        <div class="flex flex-wrap items-center gap-3">
          <button data-salvar class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase rounded-lg">Salvar</button>
          <button data-padrao class="px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase rounded-lg">Texto padrão</button>
          <span data-msg class="text-sm font-semibold"></span>
        </div>
      </div></div>`;
}

function cartaoReferencia() {
    const c = ST.cfg;
    const d = { hab: !!c.ref_habilitada, patente: c.ref_patente || 'Referência', c1: c.ref_cor1, cd: c.ref_cor_escura, c2: c.ref_cor2, carga: c.ref_carga_horaria || 0, texto: c.ref_texto || TEXTO_REF };
    return `<div data-card="ref" class="bg-white dark:bg-slate-800 rounded-xl p-4 border-2 border-amber-300 dark:border-amber-700 space-y-4">
      ${cabecalhoCartao('★ Patente Referência', `Certificado final das ${ST.tracks.length} trilhas · ${c.ref_min_ouro} ouro(s) no mínimo, até ${c.ref_max_bronze} bronze(s)`, d)}
      <div data-painel class="hidden space-y-4 border-t border-slate-100 dark:border-slate-700 pt-4">
        <label class="flex items-center gap-2 text-sm font-bold text-slate-700 dark:text-slate-200"><input data-f="hab" type="checkbox" class="w-4 h-4 accent-emerald-600" ${d.hab ? 'checked' : ''}> Referência habilitada</label>
        <div class="grid grid-cols-2 gap-3 max-w-md">
          <div><label class="${LABEL}">Mínimo de medalhas de ouro</label><input data-f="min_ouro" type="number" min="0" class="${INPUT}" value="${c.ref_min_ouro}"></div>
          <div><label class="${LABEL}">Máximo de medalhas de bronze</label><input data-f="max_bronze" type="number" min="0" class="${INPUT}" value="${c.ref_max_bronze}"></div>
        </div>
        <p class="text-[11px] text-slate-400 -mt-2">Medalhas das Revisões de todos os módulos: ouro a partir de 90%, bronze abaixo de 70%. Além disso, o aluno precisa ter emitido o certificado de todas as trilhas ativas.</p>
        ${camposComuns(d, true)}
        <div data-prev class="overflow-x-auto"></div>
        <div class="flex flex-wrap items-center gap-3">
          <button data-salvar class="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase rounded-lg">Salvar</button>
          <button data-padrao class="px-3 py-2 border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase rounded-lg">Texto padrão</button>
          <span data-msg class="text-sm font-semibold"></span>
        </div>
      </div></div>`;
}

function prepararCartao(card) {
    const ref = card.dataset.card === 'ref';
    const painel = card.querySelector('[data-painel]');
    const prev = card.querySelector('[data-prev]');
    const track = ref ? null : ST.tracks.find(t => String(t.id) === card.dataset.id);

    const atualizar = () => {
        const d = ler(card);
        const ctx = ref
            ? { ref: true, titulo: 'Academia CGCF', nivel: '', n: ST.tracks.length, lista: ST.tracks.map(t => t.titulo) }
            : { ref: false, titulo: track.titulo, nivel: track.nivel, n: 1, lista: ST.modulos.filter(m => String(m.track_id) === String(track.id)).map(m => m.titulo) };
        const html = renderCertificado(snapshotAmostra(d, ctx), { qr: qrSvg('https://exemplo.com/verificar.html?c=CGCF-0000-EXEM-PLO1') });
        prev.innerHTML = `<p class="${LABEL}">Pré-visualização (dados fictícios)</p>${miniatura(html, 560)}`;
    };
    let t0;
    const agendar = () => { clearTimeout(t0); t0 = setTimeout(atualizar, 150); };
    painel.querySelectorAll('[data-f]').forEach(el => { el.addEventListener('input', agendar); el.addEventListener('change', agendar); });

    card.querySelector('[data-abrir]').onclick = (ev) => {
        const abrir = painel.classList.contains('hidden');
        painel.classList.toggle('hidden', !abrir);
        ev.target.textContent = abrir ? 'Fechar' : 'Editar';
        if (abrir) atualizar();
    };
    card.querySelector('[data-padrao]').onclick = () => { card.querySelector('[data-f="texto"]').value = ref ? TEXTO_REF : TEXTO_TRILHA; atualizar(); };
    card.querySelector('[data-salvar]').onclick = () => salvarCartao(card, ref, track);
}

// ---------------------------------------------------------------------
// Salvar
// ---------------------------------------------------------------------
function msg(el, texto, ok) {
    el.textContent = texto;
    el.className = `text-sm font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`;
    if (ok) setTimeout(() => { el.textContent = ''; }, 3500);
}

function validar(d, ref) {
    if (!d.patente) return 'Informe o nome da patente.';
    if (!d.texto) return 'Informe o texto do certificado.';
    const desc = tokensDesconhecidos(d.texto);
    if (desc.length) return `Campo desconhecido no texto: ${desc.map(x => '{{' + x + '}}').join(', ')}.`;
    if (d.carga < 0 || d.carga > 2000) return 'A carga horária deve estar entre 0 e 2000 horas.';
    if (d.hab && !ref && d.carga <= 0) return 'Digite a carga horária antes de habilitar a certificação.';
    if (ref && (d.min_ouro < 0 || d.max_bronze < 0 || Number.isNaN(d.min_ouro) || Number.isNaN(d.max_bronze))) return 'Informe os limites de ouro e bronze (0 ou mais).';
    return null;
}

async function salvarCartao(card, ref, track) {
    const d = ler(card);
    const out = card.querySelector('[data-msg]');
    const erro = validar(d, ref);
    if (erro) return msg(out, erro, false);
    const btn = card.querySelector('[data-salvar]'); btn.disabled = true;
    try {
        let q;
        if (ref) {
            q = window.supabase.from('academia_cert_config').update({
                ref_habilitada: d.hab, ref_patente: d.patente, ref_cor1: d.c1, ref_cor_escura: d.cd, ref_cor2: d.c2,
                ref_carga_horaria: d.carga > 0 ? d.carga : null, ref_texto: d.texto, ref_min_ouro: d.min_ouro, ref_max_bronze: d.max_bronze
            }).eq('id', 1);
        } else {
            q = window.supabase.from('learning_tracks').update({
                cert_habilitada: d.hab, cert_patente: d.patente, cert_emblema_tipo: d.emb_t, cert_emblema_qtd: d.emb_n,
                cert_cor1: d.c1, cert_cor_escura: d.cd, cert_cor2: d.c2, cert_carga_horaria: d.carga > 0 ? d.carga : null, cert_texto: d.texto
            }).eq('id', track.id);
        }
        const { data: afetadas, error } = await q.select('id');
        if (error) throw error;
        if (!afetadas?.length) throw new Error('Nenhuma linha foi atualizada. Apenas administradores podem alterar os certificados.');
        // atualiza o estado local e o selo "Habilitada"
        if (ref) Object.assign(ST.cfg, { ref_habilitada: d.hab, ref_patente: d.patente, ref_cor1: d.c1, ref_cor_escura: d.cd, ref_cor2: d.c2, ref_carga_horaria: d.carga || null, ref_texto: d.texto, ref_min_ouro: d.min_ouro, ref_max_bronze: d.max_bronze });
        else Object.assign(track, { cert_habilitada: d.hab, cert_patente: d.patente, cert_emblema_tipo: d.emb_t, cert_emblema_qtd: d.emb_n, cert_cor1: d.c1, cert_cor_escura: d.cd, cert_cor2: d.c2, cert_carga_horaria: d.carga || null, cert_texto: d.texto });
        const b = card.querySelector('[data-badge]');
        b.textContent = d.hab ? 'Habilitada' : 'Desabilitada';
        b.className = `px-2 py-0.5 rounded text-[10px] font-black uppercase ${d.hab ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'}`;
        msg(out, 'Salvo. Vale para os próximos certificados emitidos.', true);
    } catch (e) {
        console.error(e);
        msg(out, 'Não foi possível salvar: ' + (e.message || e), false);
    } finally { btn.disabled = false; }
}

async function salvarGeral() {
    const out = document.getElementById('g-msg');
    const v = f => document.querySelector(`#cfg-geral [data-g="${f}"]`).value.trim();
    const url = v('url_verificacao');
    if (url && !/^https?:\/\//i.test(url)) return msg(out, 'A URL deve começar com http:// ou https://', false);
    if (!v('instituicao') || !v('subinstituicao') || !v('assinatura_nome') || !v('assinatura_papel')) return msg(out, 'Preencha todos os campos.', false);
    try {
        const patch = { url_verificacao: url || null, instituicao: v('instituicao'), subinstituicao: v('subinstituicao'), assinatura_nome: v('assinatura_nome'), assinatura_papel: v('assinatura_papel') };
        const { data: afetadas, error } = await window.supabase.from('academia_cert_config').update(patch).eq('id', 1).select('id');
        if (error) throw error;
        if (!afetadas?.length) throw new Error('Nenhuma linha foi atualizada. Apenas administradores podem alterar os certificados.');
        Object.assign(ST.cfg, patch);
        msg(out, 'Salvo.', true);
    } catch (e) { console.error(e); msg(out, 'Não foi possível salvar: ' + (e.message || e), false); }
}
