// =====================================================================
// Minhas conquistas: galeria de certificados por trilha + patente Referência,
// emissão (botão do aluno) e visualizador com impressão em PDF.
// Todas as regras (elegibilidade, nota, código) são decididas no servidor.
// =====================================================================
import { navigateTo, enviarLogAoPai } from './main.js';
import { esc, ensureRecursos, renderCertificado, miniatura, documentoImpressao, urlVerificacao, CERT_W, CERT_H } from './cert_render.js';
import { qrSvg } from './qr.js';
import { estrelasDoScore, htmlEstrelas } from './medalha.js';

const SQL_AVISO = 'Execute o script 06_certificados.sql no Supabase e recarregue a página.';

function erroTela(el, e) {
    const msg = String(e?.message || e || '');
    const falta = /function|schema cache|does not exist|Could not find/i.test(msg);
    el.innerHTML = `<div class="max-w-xl mx-auto mt-10 p-5 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
        <p class="font-bold mb-1">Não foi possível carregar.</p><p>${esc(msg)}</p>${falta ? `<p class="mt-2 font-semibold">${esc(SQL_AVISO)}</p>` : ''}</div>`;
}

function imprimir(certHtml, titulo) {
    const w = window.open('', '_blank');
    if (!w) { alert('O navegador bloqueou a janela de impressão. Permita pop-ups para este site e tente novamente.'); return; }
    w.document.open(); w.document.write(documentoImpressao(certHtml, titulo)); w.document.close();
}

// ---------------------------------------------------------------------
// Galeria
// ---------------------------------------------------------------------
export async function initConquistas() {
    const root = document.getElementById('conquistas-view');
    if (!root) return;
    ensureRecursos();
    try {
        const { data: st, error } = await window.supabase.rpc('academia_cert_status');
        if (error) throw error;

        const emitidos = [st.referencia?.emitido?.codigo, ...(st.trilhas || []).map(t => t.emitido?.codigo)].filter(Boolean);
        let snaps = {};
        if (emitidos.length) {
            const { data, error: e2 } = await window.supabase.from('academia_certificados').select('codigo, snapshot').in('codigo', emitidos);
            if (e2) throw e2;
            (data || []).forEach(r => { snaps[r.codigo] = r.snapshot; });
        }
        const base = st.config?.url_verificacao;
        const miniDe = codigo => {
            const s = snaps[codigo]; if (!s) return '';
            return miniatura(renderCertificado({ ...s, codigo }, { qr: qrSvg(urlVerificacao(codigo, base)) }), 300);
        };

        root.innerHTML = `
        <div class="animate-fade-in w-full space-y-6">
          <div class="flex items-center justify-between gap-3">
            <div>
              <h2 class="text-2xl font-black text-slate-800 dark:text-white flex items-center gap-2">🏅 Minhas conquistas</h2>
              <p class="text-sm text-slate-500 dark:text-slate-400">Conclua os módulos de uma trilha, com média de 70% ou mais nas Revisões, e emita o seu certificado.</p>
            </div>
            <button id="cq-voltar" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-lg whitespace-nowrap">Voltar ao mapa</button>
          </div>
          ${cartaoReferencia(st.referencia, miniDe)}
          ${(st.trilhas || []).map(t => cartaoTrilha(t, miniDe)).join('') || '<p class="text-center text-slate-400 py-10">Nenhuma trilha disponível ainda.</p>'}
        </div>`;

        document.getElementById('cq-voltar').onclick = () => navigateTo('dashboard');
        root.querySelectorAll('[data-ver]').forEach(b => b.onclick = () => navigateTo('certificado', { codigo: b.dataset.ver }));
        root.querySelectorAll('[data-emitir]').forEach(b => b.onclick = () => abrirEmissao({
            titulo: b.dataset.titulo, trackId: b.dataset.emitir === 'REF' ? null : b.dataset.emitir
        }));
    } catch (e) { console.error(e); erroTela(root, e); }
}

function medalhasResumo(o) {
    return `<span title="Medalhas de ouro, prata e bronze nas Revisões">🥇 ${o.ouros ?? 0} &nbsp;🥈 ${o.pratas ?? 0} &nbsp;🥉 ${o.bronzes ?? 0}</span>`;
}

function blocoEstado(o, miniDe, titulo, idEmitir) {
    if (o.emitido) {
        return `<div class="flex flex-col items-center gap-3">
            ${miniDe(o.emitido.codigo)}
            <div class="text-center">
              <p class="text-[11px] font-mono text-slate-500 dark:text-slate-400">${esc(o.emitido.codigo)}</p>
              <p class="text-xs font-bold text-emerald-600 dark:text-emerald-400">Emitido · selo ${esc(o.emitido.selo === 'OURO' ? 'Ouro' : 'Prata')} · ${esc(o.emitido.media)}%</p>
            </div>
            <button data-ver="${esc(o.emitido.codigo)}" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm">Ver / baixar PDF</button>
          </div>`;
    }
    const caixa = txt => `<div class="w-[300px] max-w-full h-[212px] rounded-md border-2 border-dashed border-slate-300 dark:border-slate-600 flex flex-col items-center justify-center gap-2 text-slate-400 dark:text-slate-500 text-center px-6">
        <span class="text-4xl grayscale opacity-60">🎓</span><span class="text-xs">${txt}</span></div>`;
    if (o.elegivel) {
        return `<div class="flex flex-col items-center gap-3">
            ${caixa('Você cumpriu todos os requisitos.')}
            <button data-emitir="${esc(idEmitir)}" data-titulo="${esc(titulo)}" class="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md">Emitir certificado</button>
            <p class="text-[11px] text-slate-400 max-w-[300px] text-center">Depois de emitido, o certificado não pode ser alterado.</p>
          </div>`;
    }
    return `<div class="flex flex-col items-center gap-3">${caixa(esc(o.motivo || 'Em breve.'))}</div>`;
}

function cartaoTrilha(t, miniDe) {
    const c1 = t.cor1 || '#64748B', cd = t.cor_escura || '#334155';
    const pct = t.req_total ? Math.round(100 * t.req_concluidos / t.req_total) : 0;
    const modulos = (t.modulos || []).map(m => {
        const est = m.score != null ? estrelasDoScore(m.score) : 0;
        let estado;
        if (!m.tem_conteudo) estado = '<span class="text-[10px] text-slate-400">em breve</span>';
        else if (m.concluido) estado = est ? htmlEstrelas(est, 'text-sm') : '<span class="text-emerald-500 text-xs font-bold">✓</span>';
        else estado = '<span class="text-[10px] text-slate-400">pendente</span>';
        const dica = m.score != null ? ` title="Melhor nota da Revisão: ${Math.round(m.score * 100)}%"` : '';
        return `<li${dica} class="flex items-center justify-between gap-2 text-xs py-1.5 border-b border-slate-100 dark:border-slate-700/60 ${m.tem_conteudo ? '' : 'opacity-50'}">
            <span class="text-slate-700 dark:text-slate-300">${esc(m.titulo)}</span><span class="flex gap-0.5 shrink-0">${estado}</span></li>`;
    }).join('');
    return `
    <section class="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden">
      <div class="px-5 py-3 flex flex-wrap items-center justify-between gap-2 text-white" style="background:linear-gradient(90deg,${esc(cd)},${esc(c1)})">
        <div>
          <p class="text-[10px] font-bold uppercase tracking-widest opacity-80">${esc(t.nivel || 'Trilha')}${t.patente ? ' · Patente ' + esc(t.patente) : ''}</p>
          <h3 class="font-bold text-lg leading-tight">${esc(t.titulo)}</h3>
        </div>
        <div class="text-xs font-bold bg-black/20 rounded-full px-3 py-1">${medalhasResumo(t)}</div>
      </div>
      <div class="p-5 grid md:grid-cols-[320px_1fr] gap-6">
        <div class="flex justify-center">${blocoEstado(t, miniDe, t.titulo, t.track_id)}</div>
        <div>
          <div class="flex items-center justify-between text-xs mb-1.5">
            <span class="font-bold text-slate-600 dark:text-slate-300">Módulos concluídos</span>
            <span class="font-bold text-slate-500">${t.req_concluidos ?? 0}/${t.req_total ?? 0}${t.media != null ? ' · média ' + t.media + '%' : ''}</span>
          </div>
          <div class="h-2 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden mb-3"><div class="h-full rounded-full" style="width:${pct}%;background:${esc(c1)}"></div></div>
          <ul>${modulos || '<li class="text-xs text-slate-400 py-2">Sem módulos.</li>'}</ul>
        </div>
      </div>
    </section>`;
}

function cartaoReferencia(r, miniDe) {
    if (!r) return '';
    const ok = (cond) => cond ? '<span class="text-emerald-500 font-black">✔</span>' : '<span class="text-slate-400 font-black">○</span>';
    const reqs = `
      <ul class="space-y-1.5 text-sm text-slate-700 dark:text-slate-300">
        <li>${ok(r.trilhas_total > 0 && r.trilhas_emitidas >= r.trilhas_total)} Certificado de todas as trilhas <b>(${r.trilhas_emitidas}/${r.trilhas_total})</b></li>
        <li>${ok((r.bronzes ?? 0) <= r.max_bronze)} No máximo <b>${r.max_bronze}</b> medalha de bronze nas Revisões <span class="text-slate-400">(você tem ${r.bronzes ?? 0})</span></li>
        <li>${ok((r.ouros ?? 0) >= r.min_ouro)} Pelo menos <b>${r.min_ouro}</b> medalhas de ouro nas Revisões <span class="text-slate-400">(você tem ${r.ouros ?? 0})</span></li>
      </ul>
      <p class="text-[11px] text-slate-400 mt-3">Dica: dá para refazer a Revisão de um módulo para subir de medalha. A melhor nota fica guardada.</p>`;
    return `
    <section class="rounded-2xl overflow-hidden border-2 shadow-md" style="border-color:${esc(r.cor1 || '#C9A227')};background:${esc(r.cor_escura || '#0B1F4B')}">
      <div class="px-5 py-3 flex flex-wrap items-center justify-between gap-2" style="color:${esc(r.cor2 || '#E6C65C')}">
        <div><p class="text-[10px] font-bold uppercase tracking-widest opacity-80">Patente máxima</p><h3 class="font-bold text-xl leading-tight">★ ${esc(r.patente || 'Referência')}</h3></div>
        <div class="text-xs font-bold bg-white/10 rounded-full px-3 py-1 text-white">${medalhasResumo(r)}</div>
      </div>
      <div class="p-5 grid md:grid-cols-[320px_1fr] gap-6 bg-white dark:bg-slate-800">
        <div class="flex justify-center">${blocoEstado(r, miniDe, r.patente || 'Referência', 'REF')}</div>
        <div><p class="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">Requisitos</p>${reqs}
          ${!r.elegivel && !r.emitido && r.motivo ? `<p class="mt-3 text-xs font-semibold text-amber-600 dark:text-amber-400">${esc(r.motivo)}</p>` : ''}</div>
      </div>
    </section>`;
}

// ---------------------------------------------------------------------
// Emissão
// ---------------------------------------------------------------------
function abrirEmissao({ titulo, trackId }) {
    document.getElementById('cq-modal')?.remove();
    const nomeSessao = (sessionStorage.getItem('cockpit_user_realname') || '').trim();
    const m = document.createElement('div');
    m.id = 'cq-modal';
    m.className = 'fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4';
    m.innerHTML = `
      <div class="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-md p-6 space-y-4">
        <h3 class="text-lg font-black text-slate-800 dark:text-white">Emitir certificado</h3>
        <p class="text-sm text-slate-600 dark:text-slate-300"><b>${esc(titulo)}</b></p>
        <div>
          <label class="block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1">Nome que aparecerá no certificado</label>
          <input id="cq-nome" maxlength="90" value="${esc(nomeSessao)}" class="w-full p-2.5 text-sm border rounded-lg bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white">
        </div>
        <p class="text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3">
          Confira o nome com atenção. Depois de emitido, o certificado <b>não pode ser alterado</b>, mesmo que você melhore suas notas.</p>
        <p id="cq-erro" class="text-sm font-semibold text-red-600 hidden"></p>
        <div class="flex justify-end gap-2">
          <button id="cq-cancela" class="px-4 py-2 text-xs font-bold uppercase rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200">Cancelar</button>
          <button id="cq-ok" class="px-5 py-2 text-xs font-bold uppercase rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white">Emitir</button>
        </div>
      </div>`;
    document.body.appendChild(m);
    const fechar = () => m.remove();
    m.querySelector('#cq-cancela').onclick = fechar;
    m.addEventListener('mousedown', e => { if (e.target === m) fechar(); });
    const input = m.querySelector('#cq-nome'); input.focus(); input.select();
    const ok = m.querySelector('#cq-ok'), erro = m.querySelector('#cq-erro');
    const emitir = async () => {
        erro.classList.add('hidden');
        const nome = input.value.trim();
        if (nome.length < 3) { erro.textContent = 'Informe o nome completo.'; erro.classList.remove('hidden'); return; }
        ok.disabled = true; ok.textContent = 'Emitindo...';
        try {
            const { data, error } = await window.supabase.rpc('academia_emitir_certificado', { p_track_id: trackId, p_nome: nome });
            if (error) throw error;
            if (!data?.ja_emitido) enviarLogAoPai('CERTIFICADO_EMITIDO', { codigo: data?.codigo, tipo: trackId ? 'trilha' : 'referencia' });
            fechar();
            navigateTo('certificado', { codigo: data.codigo });
        } catch (e) {
            console.error(e);
            erro.textContent = e.message || 'Não foi possível emitir. Tente novamente.';
            erro.classList.remove('hidden'); ok.disabled = false; ok.textContent = 'Emitir';
        }
    };
    ok.onclick = emitir;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') emitir(); });
}

// ---------------------------------------------------------------------
// Visualizador
// ---------------------------------------------------------------------
export async function initCertificado(params = {}) {
    const root = document.getElementById('certificado-view');
    if (!root) return;
    ensureRecursos();
    try {
        if (!params.codigo) throw new Error('Certificado não informado.');
        const [r1, r2] = await Promise.all([
            window.supabase.from('academia_certificados').select('codigo, snapshot').eq('codigo', params.codigo).maybeSingle(),
            window.supabase.from('academia_cert_config').select('url_verificacao').eq('id', 1).maybeSingle()
        ]);
        if (r1.error) throw r1.error;
        if (!r1.data) throw new Error('Certificado não encontrado.');
        const url = urlVerificacao(r1.data.codigo, r2.data?.url_verificacao);
        const html = renderCertificado({ ...r1.data.snapshot, codigo: r1.data.codigo }, { qr: qrSvg(url) });
        const titulo = `Certificado ${r1.data.snapshot?.patente || ''} - ${r1.data.snapshot?.aluno || ''}`.trim();

        root.innerHTML = `
        <div class="animate-fade-in w-full space-y-4">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <button id="ce-voltar" class="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider rounded-lg">← Minhas conquistas</button>
            <div class="flex flex-wrap gap-2">
              <button id="ce-link" class="px-4 py-2 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-bold text-xs uppercase tracking-wider rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700">Copiar link de verificação</button>
              <button id="ce-pdf" class="px-4 py-2 bg-purple-600 hover:bg-purple-700 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-sm">Baixar PDF / imprimir</button>
            </div>
          </div>
          <div id="ce-caixa" class="w-full overflow-hidden rounded-lg shadow-lg"></div>
          <p class="text-[11px] text-slate-400 text-center">Na janela de impressão, escolha "Salvar como PDF", papel A4, orientação paisagem e margens "nenhuma".</p>
        </div>`;

        const caixa = document.getElementById('ce-caixa');
        const ajustar = () => {
            const k = Math.min(1, caixa.clientWidth / CERT_W);
            caixa.style.height = Math.round(CERT_H * k) + 'px';
            caixa.innerHTML = `<div style="width:${CERT_W}px;height:${CERT_H}px;transform:scale(${k});transform-origin:0 0">${html}</div>`;
        };
        ajustar();

        document.getElementById('ce-voltar').onclick = () => navigateTo('conquistas');
        document.getElementById('ce-pdf').onclick = () => imprimir(html, titulo);
        document.getElementById('ce-link').onclick = async (ev) => {
            try { await navigator.clipboard.writeText(url); ev.target.textContent = 'Link copiado ✔'; }
            catch { prompt('Copie o link de verificação:', url); }
            setTimeout(() => { ev.target.textContent = 'Copiar link de verificação'; }, 2000);
        };
    } catch (e) { console.error(e); erroTela(root, e); }
}
