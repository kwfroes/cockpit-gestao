// =====================================================================
// Admin > aba "Falas" (Sr. Cockpit)
//  - edita o texto do balão e o texto falado (roteiro do áudio) de cada fala e suas variações
//  - envia / substitui / remove o MP3 de cada variação (um a um ou vários de uma vez)
//  - baixa o roteiro em CSV para gravar ou gerar a narração
// Liga-se sozinho: basta o arquivo ser carregado; a aba e a seção são criadas no painel admin.
// =====================================================================
import { esc } from './admin_editor.js';
import { FALAS_PADRAO, BUCKET, LIMITE_AUDIO_BYTES, VARIAVEIS_EXEMPLO, aplicarVars, variaveisDe, urlAudio, invalidarFalas } from './falas.js';
import { falarAgora, pararNarracao } from './narracao.js';

const INPUT = 'w-full p-2 text-sm border rounded-lg bg-white dark:bg-slate-900 border-slate-300 dark:border-slate-600 text-slate-800 dark:text-white';
const LABEL = 'block text-[10px] font-bold uppercase tracking-widest text-slate-500 mb-1';
const BTN = 'px-3 py-1.5 rounded-lg font-bold text-[11px] uppercase tracking-wider transition-colors disabled:opacity-50';
const BADGE = {
    emerald: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300',
    amber: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300',
    slate: 'bg-slate-200 text-slate-600 dark:bg-slate-700 dark:text-slate-300'
};

let LINHAS = [];

// ---------------------------------------------------------------------
// Cria e liga a aba "Falas" sozinho (não depende de alteração no admin.html).
// O admin.html é reinserido a cada visita, então observamos o DOM.
// ---------------------------------------------------------------------
const CLASSE_ABA = 'adm-tab px-4 py-2 border-b-2 font-bold text-sm uppercase tracking-wider whitespace-nowrap';
const ABA_ATIVA = 'border-purple-600 text-purple-700 dark:text-purple-400';
const ABA_INATIVA = 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400';

// Mesma aparência que o admin.js dá às abas (admin.js não conhece a aba "falas")
function ativar(aba) {
    document.querySelectorAll('.adm-tab').forEach(b => { b.className = `${CLASSE_ABA} ${b === aba ? ABA_ATIVA : ABA_INATIVA}`; });
    document.querySelectorAll('.adm-sec').forEach(sec => {
        const a = sec.id === 'adm-falas';
        sec.classList.toggle('hidden', !a); sec.classList.toggle('flex', a);
    });
}

function ligar() {
    if (!document.getElementById('adm-trilhas')) return;              // não é a tela do admin
    const nav = document.querySelector('.adm-tab')?.parentElement;
    if (!nav) return;
    let aba = nav.querySelector('.adm-tab[data-tab="falas"]');
    if (!aba) {
        aba = document.createElement('button');
        aba.dataset.tab = 'falas'; aba.className = `${CLASSE_ABA} ${ABA_INATIVA}`; aba.textContent = 'Falas';
        nav.insertBefore(aba, nav.querySelector('.adm-tab[data-tab="implantacao"]'));    // null = no fim
    }
    let sec = document.getElementById('adm-falas');
    if (!sec) {
        sec = document.createElement('section');
        sec.id = 'adm-falas'; sec.className = 'adm-sec flex-col gap-4 hidden';
        sec.innerHTML = '<p class="text-center text-slate-400 py-6">Carregando...</p>';
        const ref = document.getElementById('adm-implantacao');
        if (ref) ref.before(sec); else [...document.querySelectorAll('.adm-sec')].pop()?.after(sec);
    }
    if (!aba.dataset.falasLigado) {
        aba.dataset.falasLigado = '1';
        aba.addEventListener('click', () => { ativar(aba); carregar(); });
    }
}
new MutationObserver(ligar).observe(document.body, { childList: true, subtree: true });
ligar();

// ---------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------
const faladoSalvoVar = v => ((v?.falado || v?.texto_falado || '').trim()) || (v?.texto || '').trim();

function obterVariacoes(r) {
    const def = FALAS_PADRAO[r.chave]?.variacoes || [];
    if (Array.isArray(r.variacoes) && r.variacoes.length > 0) {
        return r.variacoes.map((v, i) => ({
            texto: v.texto ?? def[i]?.texto ?? '',
            falado: v.falado ?? v.texto_falado ?? def[i]?.falado ?? null,
            audio_path: v.audio_path || null,
            audio_texto: v.audio_texto || null
        }));
    }
    return def.map((d, i) => ({
        texto: (i === 0 && r.texto) ? r.texto : d.texto,
        falado: (i === 0 && r.texto_falado) ? r.texto_falado : d.falado,
        audio_path: (i === 0 && r.audio_path) ? r.audio_path : null,
        audio_texto: (i === 0 && r.audio_texto) ? r.audio_texto : null
    }));
}

function statusAudioVar(v) {
    if (!v.audio_path) return { cls: 'slate', txt: 'Áudio Git / Voz do navegador' };
    if (v.audio_texto && v.audio_texto.trim() !== faladoSalvoVar(v)) return { cls: 'amber', txt: 'Texto mudou após o áudio' };
    return { cls: 'emerald', txt: 'Áudio MP3 (Supabase)' };
}

async function lerCabecalho(file) {
    const b = new Uint8Array(await file.slice(0, 3).arrayBuffer());
    const id3 = b[0] === 0x49 && b[1] === 0x44 && b[2] === 0x33;                 // "ID3"
    const sync = b[0] === 0xFF && (b[1] & 0xE0) === 0xE0;                         // quadro MPEG
    return id3 || sync;
}

async function validarArquivo(f) {
    const ext = /\.mp3$/i.test(f.name), tipo = /^audio\/(mpeg|mp3)$/i.test(f.type);
    if (!ext && !tipo) return 'Envie um arquivo .mp3.';
    if (f.size > LIMITE_AUDIO_BYTES) return `O arquivo tem ${(f.size / 1048576).toFixed(1)} MB. O limite é ${LIMITE_AUDIO_BYTES / 1048576} MB.`;
    if (f.size < 500) return 'O arquivo está vazio ou corrompido.';
    if (!(await lerCabecalho(f))) return 'Este arquivo não parece ser um MP3 válido (talvez seja outro formato com a extensão renomeada).';
    return null;
}

function validarTextos({ texto, falado }, chave, numVar = null) {
    const prefixo = numVar ? `Variação ${numVar}: ` : '';
    const ok = FALAS_PADRAO[chave]?.vars || [];
    if (!texto) return `${prefixo}Informe o texto do balão.`;
    if (texto.length > 300 || falado.length > 300) return `${prefixo}Use no máximo 300 caracteres.`;
    const desc = [...new Set([...variaveisDe(texto), ...variaveisDe(falado)])].filter(v => !ok.includes(v));
    if (desc.length) return `${prefixo}Campo não permitido nesta fala: ${desc.map(v => '{{' + v + '}}').join(', ')}.` + (ok.length ? ` Permitidos: ${ok.map(v => '{{' + v + '}}').join(', ')}.` : ' Esta fala não aceita campos.');
    return null;
}

function msg(el, texto, ok) {
    if (!el) return;
    el.textContent = texto;
    el.className = `text-sm font-semibold ${ok ? 'text-emerald-600' : 'text-red-600'}`;
    if (ok) setTimeout(() => { if (el.textContent === texto) el.textContent = ''; }, 5000);
}

// ---------------------------------------------------------------------
// Tela
// ---------------------------------------------------------------------
async function carregar() {
    const sec = document.getElementById('adm-falas');
    if (!sec) return;
    sec.innerHTML = '<p class="text-center text-slate-400 animate-pulse py-6">Carregando...</p>';
    try {
        const { data, error } = await window.supabase.from('academia_falas').select('*').order('ordem', { ascending: true });
        if (error) throw error;
        LINHAS = (data || []).map(r => ({ ...r, variacoes: obterVariacoes(r) }));
        if (!LINHAS.length) throw new Error('A tabela academia_falas está vazia. Execute o script SQL de falas.');
        desenhar(sec);
    } catch (e) {
        console.error(e);
        const falta = /does not exist|schema cache|Could not find|relation/i.test(e.message || '');
        sec.innerHTML = `<div class="p-4 rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-700 dark:text-red-300">
            <p class="font-bold">Não foi possível carregar as falas.</p><p>${esc(e.message || e)}</p>${falta ? '<p class="mt-2 font-semibold">Execute o script 07_falas.sql no Supabase e recarregue.</p>' : ''}</div>`;
    }
}

function desenhar(sec) {
    const faltando = Object.keys(FALAS_PADRAO).filter(k => !LINHAS.some(r => r.chave === k));
    sec.innerHTML = `
    <div class="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-4 text-sm text-blue-800 dark:text-blue-300 space-y-1">
      <p><b>Como funciona:</b> cada fala possui <b>3 variações</b> com o <b>texto do balão</b>, o <b>texto falado</b> (roteiro para gravar o áudio) e, se quiser sobrescrever o áudio local do Git, um <b>MP3 no Supabase</b>.</p>
      <p>Nome do arquivo para pasta local (Git) ou envio em lote: <code>chave_1.mp3</code>, <code>chave_2.mp3</code>, <code>chave_3.mp3</code> (ex.: <code>licao_teoria_1.mp3</code>). Máximo de 2 MB por arquivo.</p>
      <p>Nas falas com números ({{nota}}, {{xp}}...), grave o áudio com o <b>texto falado genérico</b>, sem os números. O balão continua mostrando os valores reais.</p>
    </div>
    ${faltando.length ? `<div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 text-sm text-amber-800 dark:text-amber-300">Faltam na tabela: ${faltando.map(esc).join(', ')}. Execute o SQL de falas de novo para criá-las.</div>` : ''}
    <div class="flex flex-wrap items-center gap-2">
      <button id="fl-csv" class="${BTN} border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700">Baixar roteiro (CSV)</button>
      <button id="fl-bulk" class="${BTN} bg-purple-600 hover:bg-purple-700 text-white">Enviar vários MP3</button>
      <input id="fl-bulk-in" type="file" accept=".mp3,audio/mpeg" multiple class="hidden">
      <span id="fl-msg" class="text-sm font-semibold"></span>
    </div>
    <div id="fl-log" class="hidden text-xs bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-lg p-3 space-y-0.5"></div>
    <div id="fl-lista" class="space-y-3">${LINHAS.map(linhaHtml).join('')}</div>`;

    sec.querySelector('#fl-csv').onclick = baixarCsv;
    const entrada = sec.querySelector('#fl-bulk-in');
    sec.querySelector('#fl-bulk').onclick = () => entrada.click();
    entrada.onchange = () => { const fs = [...entrada.files]; entrada.value = ''; if (fs.length) enviarLote(fs); };
    sec.querySelectorAll('[data-linha]').forEach(ligarLinha);
}

function linhaHtml(r) {
    const def = FALAS_PADRAO[r.chave] || {};
    const vars = def.vars || [];
    const variacoes = obterVariacoes(r);

    const blocosHtml = variacoes.map((v, idx) => {
        const st = statusAudioVar(v);
        const url = v.audio_path ? urlAudio(v.audio_path) : '';
        return `
        <div data-var-idx="${idx}" class="p-3 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/40 space-y-2.5">
          <div class="flex flex-wrap items-center justify-between gap-2">
            <span class="text-xs font-bold text-slate-700 dark:text-slate-300">Variação ${idx + 1} <code class="ml-1 text-[11px] font-mono text-slate-400">${esc(r.chave)}_${idx + 1}.mp3</code></span>
            <span data-badge class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${BADGE[st.cls]}">${esc(st.txt)}</span>
          </div>
          <div><label class="${LABEL}">Texto do balão</label>
            <textarea data-f="texto" rows="2" maxlength="300" class="${INPUT}">${esc(v.texto)}</textarea></div>
          <div><label class="${LABEL}">Texto falado (roteiro do áudio)</label>
            <textarea data-f="falado" rows="2" maxlength="300" class="${INPUT}" placeholder="Em branco = fala o mesmo texto do balão">${esc(v.falado || '')}</textarea></div>
          <div class="flex flex-wrap items-center gap-2">
            ${url ? `<audio data-player controls preload="none" src="${esc(url)}" class="h-9 max-w-full"></audio>` : ''}
            <button data-up class="${BTN} bg-purple-600 hover:bg-purple-700 text-white">${v.audio_path ? 'Substituir MP3' : 'Enviar MP3'}</button>
            <input data-file type="file" accept=".mp3,audio/mpeg" class="hidden">
            ${v.audio_path ? `<button data-rm class="${BTN} border border-red-300 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20">Remover MP3</button>` : ''}
            <button data-ouvir class="${BTN} border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">Ouvir voz do navegador</button>
          </div>
        </div>`;
    }).join('');

    return `
    <div data-linha="${esc(r.chave)}" class="bg-white dark:bg-slate-800 rounded-xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
      <div class="flex flex-wrap items-center justify-between gap-2">
        <div><p class="font-bold text-slate-800 dark:text-white">${esc(r.momento)}</p>
          <p class="text-[11px] font-mono text-slate-400">${esc(r.chave)} (3 variações)</p></div>
        ${vars.length ? `<p class="text-[11px] text-slate-400">Campos permitidos: ${vars.map(v => `<code>{{${v}}}</code>`).join(' ')}</p>` : ''}
      </div>
      <div class="space-y-3">${blocosHtml}</div>
      <div class="flex flex-wrap items-center gap-2 pt-1">
        <button data-salvar class="${BTN} bg-emerald-600 hover:bg-emerald-700 text-white">Salvar textos</button>
        <button data-padrao class="${BTN} border border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-300">Restaurar padrão</button>
        <span data-msg class="text-sm font-semibold"></span>
      </div>
    </div>`;
}

function lerFormVariacoes(el) {
    return [...el.querySelectorAll('[data-var-idx]')].map(bloco => ({
        texto: bloco.querySelector('[data-f="texto"]').value.trim(),
        falado: bloco.querySelector('[data-f="falado"]').value.trim()
    }));
}

function ligarLinha(el) {
    const chave = el.dataset.linha;
    const r = LINHAS.find(x => x.chave === chave);
    const out = el.querySelector('[data-msg]');
    const botoes = () => el.querySelectorAll('button');
    const ocupado = b => botoes().forEach(x => { x.disabled = b; });
    const refazer = () => { const n = document.createElement('div'); n.innerHTML = linhaHtml(r); const novo = n.firstElementChild; el.replaceWith(novo); ligarLinha(novo); return novo; };

    el.querySelector('[data-salvar]').onclick = async () => {
        const forms = lerFormVariacoes(el);
        for (let i = 0; i < forms.length; i++) {
            const erro = validarTextos(forms[i], chave, i + 1);
            if (erro) return msg(out, erro, false);
        }
        ocupado(true);
        try {
            const atuais = obterVariacoes(r);
            const novasVariacoes = forms.map((f, i) => ({
                texto: f.texto,
                falado: f.falado || null,
                audio_path: atuais[i]?.audio_path || null,
                audio_texto: atuais[i]?.audio_texto || null
            }));
            const novo = {
                texto: novasVariacoes[0].texto,
                texto_falado: novasVariacoes[0].falado || null,
                variacoes: novasVariacoes,
                atualizado_em: new Date().toISOString()
            };
            await atualizar(chave, novo);
            Object.assign(r, novo);
            const mudou = novasVariacoes.some(v => v.audio_path && (v.audio_texto || '').trim() !== faladoSalvoVar(v));
            const novoEl = refazer();
            msg(novoEl.querySelector('[data-msg]'), mudou ? 'Salvo. O texto falado mudou em alguma variação com MP3: regrave o áudio se necessário.' : 'Salvo.', true);
        } catch (e) { console.error(e); msg(out, 'Não foi possível salvar: ' + (e.message || e), false); ocupado(false); }
    };

    el.querySelector('[data-padrao]').onclick = () => {
        const d = FALAS_PADRAO[chave]?.variacoes || [];
        el.querySelectorAll('[data-var-idx]').forEach((bloco, i) => {
            if (d[i]) {
                bloco.querySelector('[data-f="texto"]').value = d[i].texto;
                bloco.querySelector('[data-f="falado"]').value = d[i].falado || '';
            }
        });
        msg(out, 'Padrão carregado nas 3 variações. Clique em "Salvar textos" para aplicar.', true);
    };

    el.querySelectorAll('[data-var-idx]').forEach((bloco, idx) => {
        bloco.querySelector('[data-ouvir]').onclick = () => {
            const texto = bloco.querySelector('[data-f="texto"]').value.trim();
            const falado = bloco.querySelector('[data-f="falado"]').value.trim();
            falarAgora(aplicarVars(falado || texto, VARIAVEIS_EXEMPLO));
        };

        const arquivo = bloco.querySelector('[data-file]');
        bloco.querySelector('[data-up]').onclick = () => arquivo.click();
        arquivo.onchange = async () => {
            const file = arquivo.files[0]; arquivo.value = '';
            if (!file) return;
            const f = {
                texto: bloco.querySelector('[data-f="texto"]').value.trim(),
                falado: bloco.querySelector('[data-f="falado"]').value.trim()
            };
            const erro = validarTextos(f, chave, idx + 1);
            if (erro) return msg(out, erro, false);
            ocupado(true); msg(out, `Enviando MP3 da variação ${idx + 1}...`, true);
            try { await subirAudio(r, idx, file, f); const n = refazer(); msg(n.querySelector('[data-msg]'), `MP3 da variação ${idx + 1} enviado.`, true); }
            catch (e) { console.error(e); msg(out, e.message || String(e), false); ocupado(false); }
        };

        const rm = bloco.querySelector('[data-rm]');
        if (rm) rm.onclick = async () => {
            if (!confirm(`Remover o MP3 do Supabase da variação ${idx + 1}? Ela voltará a usar o áudio local do Git ou a voz do navegador.`)) return;
            ocupado(true);
            try { await removerAudio(r, idx); const n = refazer(); msg(n.querySelector('[data-msg]'), `MP3 da variação ${idx + 1} removido.`, true); }
            catch (e) { console.error(e); msg(out, e.message || String(e), false); ocupado(false); }
        };

        bloco.querySelector('[data-player]')?.addEventListener('play', pararNarracao);
    });
}

// ---------------------------------------------------------------------
// Banco e Storage
// ---------------------------------------------------------------------
async function atualizar(chave, campos) {
    const { data, error } = await window.supabase.from('academia_falas').update(campos).eq('chave', chave).select('chave');
    if (error) throw error;
    if (!data?.length) throw new Error('Nenhuma linha foi atualizada. Apenas administradores podem alterar as falas.');
    invalidarFalas();
}

// Envia o MP3 com nome único (evita cache antigo), grava na variação e só então apaga o arquivo anterior.
async function subirAudio(r, idx, file, { texto, falado }) {
    const erro = await validarArquivo(file);
    if (erro) throw new Error(erro);
    const st = window.supabase.storage.from(BUCKET);
    const path = `falas/${r.chave}_${idx + 1}-${Date.now()}.mp3`;
    const { error: eUp } = await st.upload(path, file, { contentType: 'audio/mpeg', cacheControl: '31536000', upsert: false });
    if (eUp) throw new Error('Falha no envio: ' + eUp.message);

    const novasVariacoes = obterVariacoes(r);
    const antigo = novasVariacoes[idx]?.audio_path;
    novasVariacoes[idx] = {
        texto,
        falado: falado || null,
        audio_path: path,
        audio_texto: (falado || texto).trim()
    };

    const novo = {
        texto: novasVariacoes[0].texto,
        texto_falado: novasVariacoes[0].falado || null,
        variacoes: novasVariacoes,
        atualizado_em: new Date().toISOString()
    };
    if (idx === 0) {
        novo.audio_path = path;
        novo.audio_texto = novasVariacoes[0].audio_texto;
    }

    try { await atualizar(r.chave, novo); }
    catch (e) { await st.remove([path]).catch(() => {}); throw e; }

    Object.assign(r, novo);
    if (antigo && antigo !== path) st.remove([antigo]).catch(() => {});
}

async function removerAudio(r, idx) {
    const novasVariacoes = obterVariacoes(r);
    const antigo = novasVariacoes[idx]?.audio_path;
    if (novasVariacoes[idx]) {
        novasVariacoes[idx].audio_path = null;
        novasVariacoes[idx].audio_texto = null;
    }

    const novo = {
        variacoes: novasVariacoes,
        atualizado_em: new Date().toISOString()
    };
    if (idx === 0) {
        novo.audio_path = null;
        novo.audio_texto = null;
    }

    await atualizar(r.chave, novo);
    Object.assign(r, novo);
    if (antigo) window.supabase.storage.from(BUCKET).remove([antigo]).catch(() => {});
}

// ---------------------------------------------------------------------
// Envio em lote (arquivos chamados chave_1.mp3, chave_2.mp3, chave_3.mp3 ou chave.mp3)
// ---------------------------------------------------------------------
async function enviarLote(arquivos) {
    const log = document.getElementById('fl-log'), topo = document.getElementById('fl-msg');
    const botoes = document.querySelectorAll('#adm-falas button'); botoes.forEach(b => { b.disabled = true; });
    log.classList.remove('hidden'); log.innerHTML = '';
    const linha = (ok, t) => log.insertAdjacentHTML('beforeend', `<p class="${ok ? 'text-emerald-600' : 'text-red-600'}">${ok ? '✔' : '✘'} ${esc(t)}</p>`);
    let certos = 0;
    for (const f of arquivos) {
        const nomeBase = f.name.replace(/\.mp3$/i, '').trim().toLowerCase();
        const match = nomeBase.match(/^(.+?)(?:_([1-3]))?$/);
        const chave = match ? match[1] : nomeBase;
        const idx = (match && match[2]) ? parseInt(match[2], 10) - 1 : 0;

        const r = LINHAS.find(x => x.chave === chave);
        if (!r) { linha(false, `${f.name}: não corresponde a nenhuma fala (use chave_1.mp3, chave_2.mp3 ou chave_3.mp3).`); continue; }
        const vAtual = obterVariacoes(r)[idx] || { texto: r.texto, falado: r.texto_falado };
        try {
            await subirAudio(r, idx, f, { texto: vAtual.texto, falado: (vAtual.falado || '').trim() });
            linha(true, `${f.name}: enviado (Variação ${idx + 1}).`);
            certos++;
        } catch (e) { console.error(e); linha(false, `${f.name}: ${e.message || e}`); }
    }
    msg(topo, `${certos} de ${arquivos.length} arquivo(s) enviado(s).`, certos === arquivos.length);
    const sec = document.getElementById('adm-falas');
    const lista = sec.querySelector('#fl-lista');
    lista.innerHTML = LINHAS.map(linhaHtml).join('');
    lista.querySelectorAll('[data-linha]').forEach(ligarLinha);
    botoes.forEach(b => { if (b.isConnected) b.disabled = false; });
}

// ---------------------------------------------------------------------
// Roteiro em CSV (separador ";" para abrir direto no Excel em português)
// ---------------------------------------------------------------------
function baixarCsv() {
    const cel = v => '"' + String(v ?? '').replace(/"/g, '""') + '"';
    const cab = ['arquivo', 'momento', 'fala_para_gravar', 'aparece_no_balao', 'campos'];
    const linhas = [];
    for (const r of LINHAS) {
        const vars = (FALAS_PADRAO[r.chave]?.vars || []).map(v => `{{${v}}}`).join(' ');
        const variacoes = obterVariacoes(r);
        variacoes.forEach((v, idx) => {
            linhas.push([`${r.chave}_${idx + 1}.mp3`, r.momento, faladoSalvoVar(v), v.texto, vars]);
        });
    }
    const csv = '\uFEFF' + [cab, ...linhas].map(l => l.map(cel).join(';')).join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    a.download = 'roteiro_falas_sr_cockpit.csv';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}