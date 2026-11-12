// =====================================================================
// Simulador de análise do CAF Digital – Academia CGCF
// Renderiza uma tela no padrão do perfil Validador, com documentos
// fictícios, e compara as decisões do analista com o gabarito.
// =====================================================================
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ABAS = ['Dados do Fornecedor', 'Habilitação Jurídica', 'Família', 'Qualificação Técnica',
    'Regularidade Fiscal e Trabalhista', 'Qualificação Econômico-Financeira', 'Formulários e Declarações'];

/**
 * @param {object} cenario  JSON salvo em lessons.cenario
 * @param {HTMLElement} container  normalmente #lesson-body
 * @param {(resultado:{acertos:number,total:number,respostas:object})=>void} onFinish
 */
export function renderSimulacao(cenario, container, onFinish) {
    const respostas = {};       // itemId -> { decisao: 'aprovar'|'rejeitar', motivo }
    const docs = Object.fromEntries((cenario.documentos || []).map(d => [d.id, d]));

    const abaAtiva = cenario.aba || '';
    const abasHtml = ABAS.map(a => `<span class="text-[10px] leading-tight uppercase ${a === abaAtiva ? 'text-sky-600 font-black' : 'text-slate-400 font-semibold'}">${esc(a)}</span>`).join('');

    container.innerHTML = `
      <div class="space-y-4 text-sm">
        <div class="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4">
          <p class="font-bold text-amber-800 dark:text-amber-300 mb-1">📋 Situação</p>
          <p class="text-amber-900 dark:text-amber-200">${esc(cenario.contexto)}</p>
          ${cenario.data_referencia ? `<p class="mt-2 text-xs font-bold text-amber-700 dark:text-amber-400">Data da análise: ${esc(cenario.data_referencia)}</p>` : ''}
        </div>

        <div class="rounded-xl border border-slate-300 dark:border-slate-600 overflow-hidden shadow-sm">
          <div class="bg-white dark:bg-slate-900 px-4 py-2 flex items-center justify-between border-b dark:border-slate-700">
            <span class="font-black text-slate-700 dark:text-white">Comprasnet<span class="text-red-600">.BA</span> <span class="ml-2 px-2 py-0.5 bg-blue-900 text-white text-[10px] italic rounded">CAF Digital</span></span>
            <span class="text-[10px] text-slate-400 uppercase">Ambiente de treinamento</span>
          </div>
          <div class="bg-slate-50 dark:bg-slate-800 p-4">
            <p class="text-xs text-slate-500 mb-3">Validador &gt; <b class="text-slate-700 dark:text-slate-200">${esc(cenario.tela || 'Área Restrita')}</b></p>
            ${cenario.aba ? `<div class="grid grid-cols-4 md:grid-cols-7 gap-2 mb-4 border-b pb-3 dark:border-slate-700">${abasHtml}</div>` : ''}
            ${cenario.fornecedor ? `<div class="text-xs bg-white dark:bg-slate-900 rounded-lg p-3 mb-4 border dark:border-slate-700 grid grid-cols-1 md:grid-cols-3 gap-1">
               ${Object.entries(cenario.fornecedor).map(([k, v]) => `<span><span class="text-slate-400">${esc(k)}:</span> <b>${esc(v)}</b></span>`).join('')}</div>` : ''}
            <div id="sim-itens" class="space-y-3"></div>
          </div>
        </div>

        <div id="sim-doc" class="hidden rounded-xl border-2 border-blue-300 dark:border-blue-700 overflow-hidden">
          <div class="flex justify-between items-center bg-blue-50 dark:bg-blue-900/30 px-4 py-2">
            <span id="sim-doc-titulo" class="font-bold text-blue-800 dark:text-blue-300 text-xs uppercase"></span>
            <button id="sim-doc-fechar" class="text-xs font-bold text-blue-700 hover:text-red-600">Fechar ✕</button>
          </div>
          <div id="sim-doc-corpo" class="bg-white"></div>
        </div>

        ${cenario.decisao_final ? `
        <div id="sim-final" class="bg-white dark:bg-slate-900 border dark:border-slate-700 rounded-xl p-4 space-y-3">
          <p class="font-bold text-slate-700 dark:text-slate-200">${esc(cenario.decisao_final.titulo || 'Tela de atualização')}</p>
          ${cenario.decisao_final.tipos_cadastro ? `<div class="flex gap-4 text-xs"><span class="text-slate-500">Tipo de Cadastro Permitido:</span>
            ${cenario.decisao_final.tipos_cadastro.map(t => `<label class="flex items-center gap-1"><input type="radio" name="sim-tipo" value="${esc(t)}"> ${esc(t)}</label>`).join('')}</div>` : ''}
          <div class="flex gap-3">
            ${(cenario.decisao_final.opcoes || ['REJEITAR', 'ATUALIZAR']).map((o, i) => `<button data-final="${esc(o)}" class="sim-final-btn px-4 py-2 rounded-lg ${i === 0 ? 'bg-red-500' : 'bg-green-600'} text-white text-xs font-bold opacity-60">${esc(o)}</button>`).join('')}
          </div>
        </div>` : ''}

        <button id="sim-concluir" class="w-full py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold uppercase tracking-wider disabled:opacity-40" disabled>Concluir análise</button>
        <div id="sim-resultado" class="hidden"></div>
      </div>`;

    // ---------- Itens analisáveis ----------
    const lista = container.querySelector('#sim-itens');
    cenario.itens.forEach(item => {
        const div = document.createElement('div');
        div.id = `sim-item-${item.id}`;
        div.className = 'bg-white dark:bg-slate-900 border-2 border-slate-200 dark:border-slate-700 rounded-lg transition-colors';
        div.innerHTML = `
          <div class="flex items-center justify-between px-4 py-2 border-b dark:border-slate-700">
            <span class="text-[11px] font-black uppercase text-sky-800 dark:text-sky-400">${esc(item.bloco)}</span>
            <div class="flex items-center gap-2">
              ${item.documento ? `<button data-doc="${esc(item.documento)}" class="sim-ver px-2 py-1 text-[10px] font-bold uppercase rounded bg-slate-100 dark:bg-slate-800 hover:bg-blue-100" title="Abrir anexo">⬇ Anexo</button>` : ''}
              <button data-acao="aprovar" class="sim-dec w-8 h-8 rounded-full text-green-600 hover:bg-green-50 font-black" title="Aprovar">A✓</button>
              <button data-acao="rejeitar" class="sim-dec w-8 h-8 rounded-full text-red-600 hover:bg-red-50 font-black" title="Rejeitar">⊗</button>
            </div>
          </div>
          <div class="px-4 py-3 grid grid-cols-2 md:grid-cols-4 gap-2 text-xs">
            ${Object.entries(item.campos || {}).map(([k, v]) => `<div class="border dark:border-slate-700 rounded px-2 py-1"><div class="text-[9px] text-slate-400">${esc(k)}</div><div class="font-semibold text-slate-700 dark:text-slate-200">${esc(v)}</div></div>`).join('')}
          </div>
          <div class="sim-motivo hidden px-4 pb-3">
            <select class="w-full text-xs p-2 border rounded dark:bg-slate-800 dark:border-slate-600">
              <option value="">Selecione o motivo da rejeição...</option>
              ${(cenario.motivos || []).map(m => `<option>${esc(m)}</option>`).join('')}
            </select>
          </div>
          <div class="sim-fb hidden px-4 pb-3 text-xs"></div>`;
        lista.appendChild(div);

        div.querySelectorAll('.sim-dec').forEach(b => b.onclick = () => {
            const acao = b.dataset.acao;
            respostas[item.id] = { decisao: acao, motivo: respostas[item.id]?.motivo || '' };
            div.classList.remove('border-slate-200', 'border-green-500', 'border-red-400', 'dark:border-slate-700');
            div.classList.add(acao === 'aprovar' ? 'border-green-500' : 'border-red-400');
            div.querySelector('.sim-motivo').classList.toggle('hidden', acao !== 'rejeitar');
            atualizarBotao();
        });
        div.querySelector('select').onchange = e => {
            if (respostas[item.id]) respostas[item.id].motivo = e.target.value;
            atualizarBotao();
        };
    });

    // ---------- Visualizador de documentos ----------
    const painel = container.querySelector('#sim-doc');
    container.querySelectorAll('.sim-ver').forEach(b => b.onclick = () => {
        const d = docs[b.dataset.doc];
        if (!d) return;
        container.querySelector('#sim-doc-titulo').textContent = d.titulo;
        const corpo = container.querySelector('#sim-doc-corpo');
        if (d.tipo === 'imagem') corpo.innerHTML = `<img src="${esc(d.url)}" class="w-full" alt="${esc(d.titulo)}">`;
        else if (d.tipo === 'pdf') corpo.innerHTML = `<iframe src="${esc(d.url)}" class="w-full h-[70vh]"></iframe>`;
        else { // html fictício, isolado em iframe
            const f = document.createElement('iframe');
            f.className = 'w-full h-[60vh]'; f.setAttribute('sandbox', '');
            f.srcdoc = d.html; corpo.innerHTML = ''; corpo.appendChild(f);
        }
        painel.classList.remove('hidden');
        painel.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    container.querySelector('#sim-doc-fechar').onclick = () => painel.classList.add('hidden');

    // ---------- Decisão final ----------
    let decisaoFinal = null;
    container.querySelectorAll('.sim-final-btn').forEach(b => b.onclick = () => {
        decisaoFinal = b.dataset.final;
        container.querySelectorAll('.sim-final-btn').forEach(x => x.classList.add('opacity-60'));
        b.classList.remove('opacity-60'); b.classList.add('ring-4', 'ring-offset-2');
        atualizarBotao();
    });

    const btn = container.querySelector('#sim-concluir');
    // O tipo de cadastro passa a ser obrigatório quando a decisão final o exige
    container.querySelectorAll('input[name="sim-tipo"]').forEach(r => r.addEventListener('change', () => atualizarBotao()));
    function atualizarBotao() {
        const todos = cenario.itens.every(i => respostas[i.id] && (respostas[i.id].decisao === 'aprovar' || respostas[i.id].motivo));
        const exigeTipo = !!cenario.decisao_final?.tipos_cadastro?.length;
        const tipoOk = !exigeTipo || !!container.querySelector('input[name="sim-tipo"]:checked');
        const final = !cenario.decisao_final || decisaoFinal;
        btn.disabled = !(todos && final && tipoOk);
    }

    // ---------- Correção ----------
    btn.onclick = () => {
        let acertos = 0, total = 0;
        cenario.itens.forEach(item => {
            total++;
            const r = respostas[item.id];
            const okDecisao = r.decisao === item.decisao_correta;
            const okMotivo = item.decisao_correta !== 'rejeitar' || !item.motivo_correto || r.motivo === item.motivo_correto;
            const ok = okDecisao && okMotivo;
            if (ok) acertos++;
            const div = container.querySelector(`#sim-item-${item.id}`);
            div.querySelectorAll('button.sim-dec, select').forEach(x => x.disabled = true);
            const fb = div.querySelector('.sim-fb');
            fb.classList.remove('hidden');
            fb.className = `sim-fb px-4 pb-3 text-xs font-medium ${ok ? 'text-emerald-700' : 'text-red-700'}`;
            const esperado = item.decisao_correta === 'aprovar' ? 'Aprovar' : `Rejeitar${item.motivo_correto ? ' – ' + item.motivo_correto : ''}`;
            fb.innerHTML = `${ok ? '✔ Correto.' : `✘ Esperado: <b>${esc(esperado)}</b>.`} ${esc(item.explicacao)}`;
        });

        if (cenario.decisao_final) {
            total++;
            const tipoSel = container.querySelector('input[name="sim-tipo"]:checked')?.value;
            const df = cenario.decisao_final;
            const ok = decisaoFinal === df.correta && (!df.tipo_correto || tipoSel === df.tipo_correto);
            if (ok) acertos++;
            const box = container.querySelector('#sim-final');
            box.insertAdjacentHTML('beforeend', `<p class="text-xs font-medium ${ok ? 'text-emerald-700' : 'text-red-700'}">${ok ? '✔' : '✘ Esperado: <b>' + esc(df.correta + (df.tipo_correto ? ' / ' + df.tipo_correto : '')) + '</b>.'} ${esc(df.explicacao || '')}</p>`);
            box.querySelectorAll('button, input').forEach(x => x.disabled = true);
        }

        btn.classList.add('hidden');
        const res = container.querySelector('#sim-resultado');
        res.classList.remove('hidden');
        res.className = 'rounded-xl p-4 text-center font-bold ' + (acertos === total ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800');
        res.textContent = `Você acertou ${acertos} de ${total} decisões.`;
        onFinish({ acertos, total, respostas: { itens: respostas, final: decisaoFinal } });
    };
}
