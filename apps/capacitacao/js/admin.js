// =====================================================================
// Painel Pedagógico (Admin) – Academia CGCF
// =====================================================================
import { navigateTo, enviarLogAoPai } from './main.js';
import { popularTrilhasEModulos } from './seed.js';
import { popularLoteJSON } from './seed_lote.js';
import { esc, isAdmin, editarLicao, editarUnidade, editarTrilha, editarModulo } from './admin_editor.js';

let CACHE = { trilhas: [], modulos: [], ativasPorModulo: {} };
let moduloAtual = null;

export async function initAdmin(params = {}) {
    if (!isAdmin()) {
        document.getElementById('router-view').innerHTML = '<p class="text-center text-red-500 font-bold mt-10">Acesso restrito ao perfil admin.</p>';
        return;
    }
    enviarLogAoPai("ACESSO_PAINEL_ADMIN_PEDAGOGICO");
    document.getElementById('btn-voltar-admin').onclick = () => navigateTo('dashboard');
    document.querySelectorAll('.adm-tab').forEach(b => b.onclick = () => abrirAba(b.dataset.tab));

    document.getElementById('btn-nova-trilha').onclick = () => editarTrilha(null, { onSalvo: carregarTrilhas });

    document.getElementById('sel-modulo').onchange = e => { moduloAtual = e.target.value || null; carregarLicoes(); };
    document.getElementById('busca-licao').oninput = filtrarLicoes;
    document.getElementById('ver-inativas').onchange = filtrarLicoes;
    document.getElementById('btn-testar').onclick = () => {
        const m = CACHE.modulos.find(x => x.id === moduloAtual);
        if (m) navigateTo('module', { moduleId: m.id, moduleTitle: m.titulo });
    };
    document.getElementById('btn-nova-unid').onclick = () => moduloAtual && editarUnidade(null, { moduleId: moduloAtual, onSalvo: carregarLicoes });
    document.getElementById('btn-nova-licao').onclick = () => moduloAtual && editarLicao(null, { moduleId: moduloAtual, onSalvo: carregarLicoes });
    document.getElementById('btn-organizar').onclick = organizar;

    document.getElementById('btn-seed-trilhas').onclick = async () => {
        if (!confirm("Inserir as trilhas e módulos padrão que estiverem faltando?")) return;
        await popularTrilhasEModulos(log);
        await carregarTrilhas();
    };
    document.getElementById('btn-importar-lote').onclick = async () => {
        const caminho = document.getElementById('caminho-lote').value.trim();
        if (!caminho.endsWith('.json')) return alert('Informe o caminho do arquivo .json (ex.: data/meu_lote.json).');
        if (!confirm(`Importar ${caminho}? Telas com o mesmo título no mesmo módulo (ativas ou inativas) são ignoradas.`)) return;
        await popularLoteJSON(log, caminho);
    };

    await carregarTrilhas();
    if (params.moduleId) moduloAtual = params.moduleId;
    preencherSelectModulos();
    abrirAba(params.aba || 'trilhas');
}

function log(msg) {
    const p = document.getElementById('seed-log');
    if (!p) return;
    p.classList.remove('hidden');
    p.insertAdjacentHTML('beforeend', `<div>&gt; ${esc(msg)}</div>`);
    p.scrollTop = p.scrollHeight;
}

function abrirAba(aba) {
    document.querySelectorAll('.adm-tab').forEach(b => {
        const ativa = b.dataset.tab === aba;
        b.className = `adm-tab px-4 py-2 border-b-2 font-bold text-sm uppercase tracking-wider whitespace-nowrap ${ativa
            ? 'border-purple-600 text-purple-700 dark:text-purple-400' : 'border-transparent text-slate-500 hover:text-slate-700 dark:text-slate-400'}`;
    });
    document.querySelectorAll('.adm-sec').forEach(s => {
        const ativa = s.id === `adm-${aba}`;
        s.classList.toggle('hidden', !ativa);
        s.classList.toggle('flex', ativa);
    });
    if (aba === 'licoes') carregarLicoes();
    if (aba === 'relatorios') carregarRelatorios();
}

// =====================================================================
// TRILHAS E MÓDULOS
// =====================================================================
async function carregarTrilhas() {
    const alvo = document.getElementById('lista-trilhas');
    const [r1, r2, r3, r4] = await Promise.all([
        window.supabase.from('learning_tracks').select('*').order('created_at', { ascending: true }),
        window.supabase.from('learning_modules').select('*').order('ordem', { ascending: true }),
        window.supabase.from('lessons').select('module_id, ativo').limit(10000),
        window.supabase.from('learning_units').select('module_id')
    ]);
    const erro = r1.error || r2.error || r3.error;
    if (erro) { alvo.innerHTML = `<p class="text-red-500">Erro: ${esc(erro.message)}</p>`; return; }
    const ativas = {}, inativas = {}, unids = {};
    (r3.data || []).forEach(l => { const t = l.ativo === false ? inativas : ativas; t[l.module_id] = (t[l.module_id] || 0) + 1; });
    (r4.data || []).forEach(u => { unids[u.module_id] = (unids[u.module_id] || 0) + 1; });
    CACHE = { trilhas: r1.data || [], modulos: r2.data || [], ativasPorModulo: ativas };

    alvo.innerHTML = '';
    CACHE.trilhas.forEach(t => {
        const mods = CACHE.modulos.filter(m => m.track_id === t.id).sort((a, b) => a.ordem - b.ordem);
        const card = document.createElement('div');
        card.className = 'bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm';
        card.innerHTML = `
          <div class="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-700">
            <span class="px-2 py-1 rounded text-[10px] font-black uppercase bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">${esc(t.nivel)}</span>
            <h3 class="flex-1 font-black text-slate-800 dark:text-white">${esc(t.titulo)}</h3>
            <span class="px-2 py-1 rounded text-[10px] font-bold uppercase ${t.ativo ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'}">${t.ativo ? 'Ativa' : 'Inativa'}</span>
            <button data-a="edit-t" class="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 hover:underline">Editar</button>
            <button data-a="novo-m" class="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 hover:underline">+ Módulo</button>
          </div>
          <table class="w-full text-sm"><tbody>${mods.map((m, i) => `
              <tr class="border-b last:border-0 border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-900/40">
                <td class="pl-5 py-2 w-10 text-slate-400 font-bold">${i + 1}</td>
                <td class="py-2 font-semibold text-slate-700 dark:text-slate-200">${esc(m.titulo)}</td>
                <td class="py-2 text-xs text-slate-500 text-center w-36">${ativas[m.id] || 0} telas ativas${inativas[m.id] ? ` <span class="text-slate-400">(+${inativas[m.id]} inativas)</span>` : ''}</td>
                <td class="py-2 text-xs text-slate-500 text-center w-28">${unids[m.id] || 0} lições curtas</td>
                <td class="py-2 pr-5 text-right whitespace-nowrap">
                  <button data-m="${esc(m.id)}" data-a="up" ${i === 0 ? 'disabled' : ''} class="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                  <button data-m="${esc(m.id)}" data-a="down" ${i === mods.length - 1 ? 'disabled' : ''} class="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                  <button data-m="${esc(m.id)}" data-a="conteudo" class="ml-2 text-xs font-bold uppercase text-blue-600 dark:text-blue-400 hover:underline">Conteúdo</button>
                  <button data-m="${esc(m.id)}" data-a="edit-m" class="ml-2 text-xs font-bold uppercase text-purple-600 dark:text-purple-400 hover:underline">Editar</button>
                </td>
              </tr>`).join('') || '<tr><td class="px-5 py-3 text-xs italic text-slate-400">Sem módulos.</td></tr>'}
          </tbody></table>`;
        card.querySelector('[data-a="edit-t"]').onclick = () => editarTrilha(t, { onSalvo: carregarTrilhas });
        card.querySelector('[data-a="novo-m"]').onclick = () => editarModulo(null, { trackId: t.id, trilhas: CACHE.trilhas, onSalvo: carregarTrilhas });
        card.querySelectorAll('[data-m]').forEach(b => b.onclick = async () => {
            const m = mods.find(x => x.id === b.dataset.m);
            const i = mods.indexOf(m);
            if (b.dataset.a === 'edit-m') return editarModulo(m, { trilhas: CACHE.trilhas, onSalvo: carregarTrilhas });
            if (b.dataset.a === 'conteudo') { moduloAtual = m.id; preencherSelectModulos(); return abrirAba('licoes'); }
            const j = b.dataset.a === 'up' ? i - 1 : i + 1;
            if (mods[j]) { await trocarOrdem('learning_modules', m, mods[j], i, j); carregarTrilhas(); }
        });
        alvo.appendChild(card);
    });
    if (!CACHE.trilhas.length) alvo.innerHTML = '<p class="text-center italic text-slate-400 py-6">Nenhuma trilha. Use a aba Implantação.</p>';
}

async function trocarOrdem(tabela, a, b, posA, posB) {
    let oa = a.ordem, ob = b.ordem;
    if (oa === ob || oa == null || ob == null) { oa = posA + 1; ob = posB + 1; }
    const r1 = await window.supabase.from(tabela).update({ ordem: ob }).eq('id', a.id);
    const r2 = await window.supabase.from(tabela).update({ ordem: oa }).eq('id', b.id);
    if (r1.error || r2.error) alert('Erro ao reordenar: ' + (r1.error || r2.error).message);
}

function preencherSelectModulos() {
    const sel = document.getElementById('sel-modulo');
    sel.innerHTML = '<option value="">Selecione um módulo...</option>' + CACHE.trilhas.map(t => `
        <optgroup label="${esc(t.titulo)}">
          ${CACHE.modulos.filter(m => m.track_id === t.id).sort((a, b) => a.ordem - b.ordem)
            .map(m => `<option value="${esc(m.id)}" ${m.id === moduloAtual ? 'selected' : ''}>${esc(m.titulo)} (${CACHE.ativasPorModulo[m.id] || 0})</option>`).join('')}
        </optgroup>`).join('');
}

// =====================================================================
// LIÇÕES E QUESTÕES
// =====================================================================
async function carregarLicoes() {
    const alvo = document.getElementById('lista-licoes');
    if (!moduloAtual) { alvo.innerHTML = '<p class="text-center text-slate-400 italic py-8">Selecione um módulo.</p>'; return; }
    alvo.innerHTML = '<p class="text-center text-slate-400 animate-pulse py-8">Carregando...</p>';
    const [{ data: unidades }, { data: licoes, error }] = await Promise.all([
        window.supabase.from('learning_units').select('id, titulo, ordem, tipo, config').eq('module_id', moduloAtual).order('ordem', { ascending: true }),
        window.supabase.from('lessons').select('id, titulo, tipo, ordem, unit_id, ativo, versao_de, conteudo_texto, cenario, questions(id, enunciado, question_options(texto_alternativa, is_correta))')
            .eq('module_id', moduloAtual).order('ordem', { ascending: true })
    ]);
    if (error) { alvo.innerHTML = `<p class="text-red-500">Erro: ${esc(error.message)}</p>`; return; }

    const ativa = l => l.ativo !== false;
    const grupos = [...(unidades || []).filter(u => u.tipo === 'licao'), { id: null, titulo: 'Sem lição curta', tipo: 'solto' }];
    const revisao = (unidades || []).find(u => u.tipo === 'revisao');
    alvo.innerHTML = '';

    grupos.forEach(u => {
        const itens = (licoes || []).filter(l => (l.unit_id || null) === u.id);
        if (u.tipo === 'solto' && !itens.length) return;
        const nAtivas = itens.filter(ativa).length;
        const alerta = u.tipo !== 'solto' && nAtivas === 0 ? '⚠ sem telas ativas: não aparece para os alunos'
                     : u.tipo !== 'solto' && nAtivas < 3 ? `⚠ só ${nAtivas} tela(s) ativa(s)` : '';
        const bloco = document.createElement('div');
        bloco.className = `rounded-xl border shadow-sm ${u.tipo === 'solto' ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`;
        bloco.innerHTML = `
          <div class="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
            <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${u.tipo === 'solto' ? 'bg-amber-400 text-white' : 'bg-blue-600 text-white'}">${u.tipo === 'solto' ? '!' : esc(u.ordem)}</span>
            <h4 class="flex-1 font-bold text-slate-800 dark:text-white">${esc(u.titulo)}
              <span class="text-xs font-semibold text-slate-400">• ${nAtivas} ativas${itens.length > nAtivas ? `, ${itens.length - nAtivas} inativas` : ''}</span>
              ${alerta ? `<span class="ml-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">${alerta}</span>` : ''}</h4>
            ${u.id ? `<button data-a="add" class="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 hover:underline">+ Tela</button>
                      <button data-a="edit-u" class="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 hover:underline">Editar</button>` : ''}
          </div>
          <div data-itens></div>`;
        const cont = bloco.querySelector('[data-itens]');
        itens.forEach((l, i) => {
            const q = l.questions?.[0];
            const certa = q?.question_options?.find(o => o.is_correta)?.texto_alternativa;
            const prev = l.tipo === 'teoria' ? l.conteudo_texto : l.tipo === 'exercicio' ? q?.enunciado : `${l.cenario?.itens?.length ?? 0} itens de análise`;
            const busca = [l.titulo, l.conteudo_texto, q?.enunciado, ...(q?.question_options || []).map(o => o.texto_alternativa)].join(' ').toLowerCase();
            const cor = { teoria: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', exercicio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', simulacao: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' }[l.tipo] || '';
            const linha = document.createElement('div');
            linha.className = `adm-linha flex items-start gap-3 px-5 py-3 border-b last:border-0 border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-900/40 ${ativa(l) ? '' : 'opacity-50'}`;
            linha.dataset.busca = busca;
            linha.dataset.inativa = ativa(l) ? '0' : '1';
            linha.innerHTML = `
              <span class="text-xs text-slate-400 font-bold w-8 pt-0.5">${esc(l.ordem)}</span>
              <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${cor}">${esc(l.tipo)}</span>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-slate-800 dark:text-slate-100 text-sm">${esc(l.titulo)}
                  ${ativa(l) ? '' : '<span class="ml-1 px-1.5 py-0.5 rounded bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase">Inativa</span>'}
                  ${l.versao_de ? '<span class="ml-1 px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 text-[9px] font-black uppercase">Nova versão</span>' : ''}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2">${esc(prev)}</p>
                ${certa ? `<p class="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">✓ ${esc(certa)}</p>` : ''}
                ${l.tipo === 'exercicio' && !q ? '<p class="text-xs font-bold text-red-600">⚠ Exercício sem questão (não aparece para o aluno)</p>' : ''}
              </div>
              <div class="whitespace-nowrap">
                <button data-a="up" ${i === 0 ? 'disabled' : ''} class="px-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20">▲</button>
                <button data-a="down" ${i === itens.length - 1 ? 'disabled' : ''} class="px-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-white disabled:opacity-20">▼</button>
                <button data-a="edit" class="ml-2 px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold uppercase">Editar</button>
              </div>`;
            linha.querySelector('[data-a="edit"]').onclick = () => editarLicao(l.id, { onSalvo: carregarLicoes, onExcluido: carregarLicoes, onInativado: carregarLicoes });
            linha.querySelectorAll('[data-a="up"],[data-a="down"]').forEach(b => b.onclick = async () => {
                const j = b.dataset.a === 'up' ? i - 1 : i + 1;
                await trocarOrdem('lessons', l, itens[j], i, j);
                carregarLicoes();
            });
            cont.appendChild(linha);
        });
        if (!itens.length) cont.innerHTML = '<p class="px-5 py-3 text-xs italic text-slate-400">Sem telas.</p>';
        bloco.querySelector('[data-a="add"]')?.addEventListener('click', () => editarLicao(null, { moduleId: moduloAtual, unitId: u.id, onSalvo: carregarLicoes }));
        bloco.querySelector('[data-a="edit-u"]')?.addEventListener('click', () => editarUnidade(u, { moduleId: moduloAtual, onSalvo: carregarLicoes }));
        alvo.appendChild(bloco);
    });

    if (revisao) {
        const nEx = (licoes || []).filter(l => ativa(l) && l.tipo === 'exercicio' && l.questions?.length).length;
        const qtd = revisao.config?.qtd ?? 8;
        const r = document.createElement('div');
        r.className = 'flex flex-wrap items-center gap-3 px-5 py-3 rounded-xl border border-amber-300 dark:border-amber-700 bg-white dark:bg-slate-800';
        r.innerHTML = `<span class="text-xl">🏁</span>
          <p class="flex-1 font-bold text-slate-800 dark:text-white">${esc(revisao.titulo)}
            <span class="text-xs font-semibold text-slate-500"> • sorteia ${qtd} de ${nEx} questões ativas • mínimo ${Math.round((revisao.config?.min_acerto ?? 0.7) * 100)}%</span>
            ${nEx < qtd ? `<span class="ml-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">⚠ a revisão terá só ${nEx} questões</span>` : ''}</p>
          <button class="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 hover:underline">Configurar</button>`;
        r.querySelector('button').onclick = () => editarUnidade(revisao, { moduleId: moduloAtual, onSalvo: carregarLicoes });
        alvo.appendChild(r);
    }
    if (!(licoes || []).length && !(unidades || []).length) alvo.innerHTML = '<p class="text-center text-slate-400 italic py-8">Módulo vazio. Use "+ Lição curta" e "+ Teoria / questão".</p>';
    filtrarLicoes();
}

function filtrarLicoes() {
    const termo = document.getElementById('busca-licao').value.trim().toLowerCase();
    const verInativas = document.getElementById('ver-inativas').checked;
    document.querySelectorAll('.adm-linha').forEach(l => l.classList.toggle('hidden',
        (!!termo && !l.dataset.busca.includes(termo)) || (!verInativas && l.dataset.inativa === '1')));
}

async function organizar() {
    if (!confirm('Distribuir as telas ativas "sem lição curta" de TODOS os módulos em lições curtas e criar a Revisão onde faltar?')) return;
    const { data, error } = await window.supabase.rpc('academia_organizar_unidades', { simular: false });
    if (error) return alert('Erro: ' + error.message);
    alert(data?.length ? `Organizado: ${data.length} itens criados.` : 'Nada a organizar.');
    await carregarTrilhas(); preencherSelectModulos(); carregarLicoes();
}

// =====================================================================
// RELATÓRIOS – agregados no banco (função academia_relatorio)
//  - sem o teto de 1.000 linhas do PostgREST
//  - ignora respostas de teste do admin (user_answers.teste = true)
//  - "Questões com mais erros" só considera questões com amostra mínima
// =====================================================================
const AMOSTRA_MINIMA = 5;

async function carregarRelatorios() {
    const set = (id, v) => { document.getElementById(id).textContent = v; };
    const relQ = document.getElementById('rel-questoes');
    const relA = document.getElementById('rel-alunos');
    const { data, error } = await window.supabase.rpc('academia_relatorio', { p_min_amostra: AMOSTRA_MINIMA });
    if (error) {
        const msg = `<p class="text-sm text-red-500">Erro ao carregar relatórios: ${esc(error.message)}. Confirme se o script 05_academia_correcoes.sql foi executado.</p>`;
        relQ.innerHTML = msg; relA.innerHTML = '';
        return;
    }
    set('kpi-alunos', data.alunos_ativos ?? '–');
    set('kpi-licoes', data.licoes_concluidas ?? '–');
    set('kpi-modulos', data.modulos_concluidos ?? '–');
    set('kpi-acerto', data.acerto_primeira == null ? '–' : data.acerto_primeira + '%');

    const nomeMod = id => CACHE.modulos.find(m => m.id === id)?.titulo || '';
    const qs = data.questoes || [];
    if (!qs.length) relQ.innerHTML = `<p class="text-sm italic text-slate-400">Ainda não há questões com pelo menos ${AMOSTRA_MINIMA} respostas e algum erro.</p>`;
    else {
        relQ.innerHTML = `<p class="text-[11px] text-slate-400 mb-2">Considera apenas questões com ${AMOSTRA_MINIMA}+ respostas de primeira. Respostas de teste do admin ficam de fora.</p>
          <table class="w-full text-sm">
          <thead class="text-[10px] uppercase text-slate-500"><tr><th class="text-left py-2">Questão</th><th class="text-left">Módulo</th><th>Respostas</th><th>Erro</th><th></th></tr></thead>
          <tbody>${qs.map(q => `<tr class="border-t border-slate-100 dark:border-slate-700 ${q.ativa ? '' : 'opacity-60'}">
            <td class="py-2 pr-3 text-slate-700 dark:text-slate-200">${esc(q.enunciado || '(questão removida)')}
              ${q.ativa ? '' : '<span class="ml-1 px-1.5 py-0.5 rounded bg-slate-300 dark:bg-slate-600 text-[9px] font-black uppercase">Inativa</span>'}</td>
            <td class="text-xs text-slate-500">${esc(nomeMod(q.module_id))}</td>
            <td class="text-center text-slate-600 dark:text-slate-300">${q.respostas}</td>
            <td class="text-center font-black ${q.pct_erro >= 50 ? 'text-red-600' : 'text-amber-500'}">${q.pct_erro}%</td>
            <td class="text-right">${q.lesson_id ? `<button data-l="${esc(q.lesson_id)}" class="px-2 py-1 rounded bg-purple-600 text-white text-[10px] font-bold uppercase">Editar</button>` : ''}</td></tr>`).join('')}</tbody></table>`;
        relQ.querySelectorAll('[data-l]').forEach(b => b.onclick = () => editarLicao(b.dataset.l, { onSalvo: carregarRelatorios, onInativado: carregarRelatorios, onExcluido: carregarRelatorios }));
    }

    const alunos = data.alunos || [];
    relA.innerHTML = alunos.length ? `<table class="w-full text-sm">
        <thead class="text-[10px] uppercase text-slate-500"><tr><th class="text-left py-2">Aluno</th><th>Lições</th><th>Módulos</th><th>Acerto 1ª</th><th>Última atividade</th></tr></thead>
        <tbody>${alunos.map(a => `<tr class="border-t border-slate-100 dark:border-slate-700 text-slate-700 dark:text-slate-200">
          <td class="py-2">${esc(a.email)}</td><td class="text-center">${a.licoes}</td><td class="text-center">${a.modulos}</td>
          <td class="text-center">${a.acerto == null ? '–' : a.acerto + '%'}</td>
          <td class="text-center text-xs text-slate-500">${a.ultima ? new Date(a.ultima).toLocaleString('pt-BR') : '–'}</td></tr>`).join('')}</tbody></table>`
        : '<p class="text-sm italic text-slate-400">Nenhum aluno com atividade ainda.</p>';
}
