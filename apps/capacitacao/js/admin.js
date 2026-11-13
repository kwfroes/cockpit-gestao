// =====================================================================
// Painel Pedagógico (Admin) – Academia CGCF
// =====================================================================
import { navigateTo, enviarLogAoPai } from './main.js';
import { popularTrilhasEModulos } from './seed.js';
import { popularLoteJSON } from './seed_lote.js';
import { esc, isAdmin, editarLicao, editarUnidade, editarTrilha, editarModulo, adminLivre } from './admin_editor.js';


let CACHE = { trilhas: [], modulos: [], ativasPorModulo: {} };
let moduloAtual = null;
let licoesSelecionadas = new Set(); // Guarda os IDs selecionados para lote

export async function initAdmin(params = {}) {
    // Entrou no painel: descarta seleção e barra de lote que tenham sobrado de uma visita anterior
    licoesSelecionadas.clear();
    document.getElementById('barra-acoes-lote')?.remove();
    if (!isAdmin()) {
        document.getElementById('router-view').innerHTML = '<p class="text-center text-red-500 font-bold mt-10">Acesso restrito ao perfil admin.</p>';
        return;
    }
    enviarLogAoPai("ACESSO_PAINEL_ADMIN_PEDAGOGICO");
    document.getElementById('btn-voltar-admin').onclick = () => navigateTo('dashboard');
    document.querySelectorAll('.adm-tab').forEach(b => b.onclick = () => abrirAba(b.dataset.tab));

    document.getElementById('btn-nova-trilha').onclick = () => editarTrilha(null, { onSalvo: carregarTrilhas });

    document.getElementById('sel-modulo').onchange = e => { 
        moduloAtual = e.target.value || null; 
        licoesSelecionadas.clear(); // Limpa seleção ao trocar módulo
        carregarLicoes(); 
    };
    document.getElementById('busca-licao').oninput = filtrarLicoes;
    document.getElementById('ver-inativas').onchange = filtrarLicoes;
    document.getElementById('btn-testar').onclick = () => {
        const m = CACHE.modulos.find(x => x.id === moduloAtual);
        if (m) navigateTo('module', { moduleId: m.id, moduleTitle: m.titulo });
    };
    document.getElementById('btn-nova-unid').onclick = () => moduloAtual && editarUnidade(null, { moduleId: moduloAtual, onSalvo: carregarLicoes });
    document.getElementById('btn-nova-licao').onclick = () => moduloAtual && editarLicao(null, { moduleId: moduloAtual, onSalvo: carregarLicoes });
    document.getElementById('btn-organizar').onclick = organizar;
    document.getElementById('btn-exportar-json').onclick = (e) => gerenciarExportacao(e, exportarBackupJSON);
    document.getElementById('btn-exportar-csv').onclick = (e) => gerenciarExportacao(e, exportarBackupCSV);


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
    if (aba === 'licoes') {
        licoesSelecionadas.clear();
        carregarLicoes();
    }
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
// LIÇÕES E QUESTÕES (Com Bulk Actions)
// =====================================================================
async function carregarLicoes() {
    const alvo = document.getElementById('lista-licoes');
    if (!moduloAtual) { alvo.innerHTML = '<p class="text-center text-slate-400 italic py-8">Selecione um módulo.</p>'; atualizarBarraLote(); return; }
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
        const alerta = u.tipo !== 'solto' && nAtivas === 0 ? '⚠ sem telas ativas' : '';
        const bloco = document.createElement('div');
        bloco.className = `rounded-xl border shadow-sm mb-4 ${u.tipo === 'solto' ? 'border-amber-300 dark:border-amber-700 bg-amber-50/50 dark:bg-amber-900/10' : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'}`;
        bloco.innerHTML = `
          <div class="flex flex-wrap items-center gap-3 px-5 py-3 border-b border-slate-200 dark:border-slate-700">
            <input type="checkbox" data-selecionar-bloco class="w-4 h-4 rounded text-purple-600 bg-slate-100 border-slate-300 cursor-pointer">
            <span class="w-7 h-7 rounded-full flex items-center justify-center text-xs font-black ${u.tipo === 'solto' ? 'bg-amber-400 text-white' : 'bg-blue-600 text-white'}">${u.tipo === 'solto' ? '!' : esc(u.ordem)}</span>
            <h4 class="flex-1 font-bold text-slate-800 dark:text-white">${esc(u.titulo)}
              <span class="text-xs font-semibold text-slate-400">• ${nAtivas} ativas</span>
              ${alerta ? `<span class="ml-2 text-[11px] font-bold text-amber-600 dark:text-amber-400">${alerta}</span>` : ''}</h4>
            ${u.id ? `<button data-a="add" class="text-xs font-bold uppercase text-emerald-600 dark:text-emerald-400 hover:underline">+ Tela</button>
                      <button data-a="edit-u" class="text-xs font-bold uppercase text-purple-600 dark:text-purple-400 hover:underline">Editar</button>` : ''}
          </div>
          <div data-itens></div>`;
        
        const checkBloco = bloco.querySelector('[data-selecionar-bloco]');
        checkBloco.onclick = (e) => {
            const checks = bloco.querySelectorAll('[data-selecionar]');
            checks.forEach(c => {
                if (c.closest('.adm-linha').classList.contains('hidden')) return; // ignora invisiveis
                c.checked = e.target.checked;
                if (c.checked) licoesSelecionadas.add(c.value);
                else licoesSelecionadas.delete(c.value);
            });
            atualizarBarraLote();
        };

        const cont = bloco.querySelector('[data-itens]');
        itens.forEach((l, i) => {
            const q = l.questions?.[0];
            const certa = q?.question_options?.find(o => o.is_correta)?.texto_alternativa;
            const prev = l.tipo === 'teoria' ? l.conteudo_texto : l.tipo === 'exercicio' ? q?.enunciado : `${l.cenario?.itens?.length ?? 0} itens de análise`;
            const busca = [l.titulo, l.conteudo_texto, q?.enunciado, ...(q?.question_options || []).map(o => o.texto_alternativa)].join(' ').toLowerCase();
            const cor = { 
                teoria: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300', 
                exercicio: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300', 
                simulacao: 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300' 
            }[l.tipo] || '';

            const linha = document.createElement('div');
            linha.className = `adm-linha flex items-start gap-3 px-5 py-3 border-b last:border-0 border-slate-100 dark:border-slate-700/60 hover:bg-slate-50 dark:hover:bg-slate-900/40 ${ativa(l) ? '' : 'opacity-50'}`;
            linha.dataset.busca = busca;
            linha.dataset.inativa = ativa(l) ? '0' : '1';
            linha.innerHTML = `
            <div class="pt-1"><input type="checkbox" value="${esc(l.id)}" data-selecionar class="w-4 h-4 rounded text-purple-600 bg-slate-100 border-slate-300 cursor-pointer" ${licoesSelecionadas.has(l.id) ? 'checked' : ''}></div>
            <span class="text-xs text-slate-400 font-bold w-8 pt-0.5">${esc(l.ordem)}</span>
            <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase ${cor}">${esc(l.tipo)}</span>
              <div class="flex-1 min-w-0">
                <p class="font-semibold text-slate-800 dark:text-slate-100 text-sm cursor-pointer hover:text-purple-600" data-trigger-edit>${esc(l.titulo)}
                  ${ativa(l) ? '' : '<span class="ml-1 px-1.5 py-0.5 rounded bg-slate-300 dark:bg-slate-600 text-slate-700 dark:text-slate-200 text-[9px] font-black uppercase">Inativa</span>'}</p>
                <p class="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1">${esc(prev)}</p>
                ${certa ? `<p class="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">✓ ${esc(certa)}</p>` : ''}
              </div>
              <div class="whitespace-nowrap">
                <button data-a="up" ${i === 0 ? 'disabled' : ''} class="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20">▲</button>
                <button data-a="down" ${i === itens.length - 1 ? 'disabled' : ''} class="px-1.5 text-slate-400 hover:text-slate-700 disabled:opacity-20">▼</button>
                <button data-a="edit" class="ml-2 px-2 py-1 rounded bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-bold uppercase">Editar</button>
              </div>`;
            
            linha.querySelector('input[type="checkbox"]').onchange = (e) => {
                if (e.target.checked) licoesSelecionadas.add(e.target.value);
                else licoesSelecionadas.delete(e.target.value);
                atualizarBarraLote();
            };

            const abrirEdicao = () => editarLicao(l.id, { onSalvo: carregarLicoes, onExcluido: carregarLicoes, onInativado: carregarLicoes });
            linha.querySelector('[data-a="edit"]').onclick = abrirEdicao;
            linha.querySelector('[data-trigger-edit]').onclick = abrirEdicao;
            
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

    if (!(licoes || []).length && !(unidades || []).length) alvo.innerHTML = '<p class="text-center text-slate-400 italic py-8">Módulo vazio.</p>';
    
    // Anexa a barra de lote no DOM se não existir
    if (!document.getElementById('barra-acoes-lote')) {
        const barra = document.createElement('div');
        barra.id = 'barra-acoes-lote';
        barra.className = 'fixed bottom-4 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-4 transition-all duration-300 transform translate-y-24 opacity-0 z-50';
        barra.innerHTML = `
            <span id="txt-lote-count" class="font-bold text-sm">0 selecionadas</span>
            <div class="h-6 w-px bg-slate-700"></div>
            <button id="btn-lote-inativar" class="text-xs font-bold uppercase text-amber-400 hover:text-amber-300">Inativar</button>
            <button id="btn-lote-excluir" class="text-xs font-bold uppercase text-red-400 hover:text-red-300">Excluir</button>
            <button id="btn-lote-cancelar" class="ml-4 text-slate-400 hover:text-white">✕</button>
        `;
        document.body.appendChild(barra);
        
        document.getElementById('btn-lote-cancelar').onclick = () => {
            licoesSelecionadas.clear();
            document.querySelectorAll('[data-selecionar], [data-selecionar-bloco]').forEach(c => c.checked = false);
            atualizarBarraLote();
        };

        document.getElementById('btn-lote-inativar').onclick = async () => {
            const arr = Array.from(licoesSelecionadas);
            if (!confirm(`Inativar as ${arr.length} telas selecionadas?\nElas deixarão de aparecer para os alunos.`)) return;
            document.getElementById('btn-lote-inativar').innerText = 'Aguarde...';
            const { error } = await window.supabase.from('lessons').update({ ativo: false, inativado_em: new Date().toISOString() }).in('id', arr);
            if (error) alert('Erro ao inativar: ' + error.message);
            else { licoesSelecionadas.clear(); carregarLicoes(); }
            document.getElementById('btn-lote-inativar').innerText = 'Inativar';
        };

        document.getElementById('btn-lote-excluir').onclick = () => excluirTelasEmLote();
    }
    
    filtrarLicoes();
    atualizarBarraLote();
}

// ---------------------------------------------------------------------
// Exclusão em lote: só exclui telas SEM histórico de alunos.
// Telas com respostas / tentativas de simulação são mantidas (o caminho para elas é "Inativar").
// Se a contagem de histórico falhar, NADA é excluído (nunca se assume "zero respostas").
// ---------------------------------------------------------------------
async function historicoPorTela(ids) {
    const mapa = new Map();
    const lote = 8;
    for (let i = 0; i < ids.length; i += lote) {
        await Promise.all(ids.slice(i, i + lote).map(async id => {
            const [a, s] = await Promise.all([
                window.supabase.from('user_answers').select('id', { count: 'exact', head: true }).eq('lesson_id', id),
                window.supabase.from('simulation_attempts').select('id', { count: 'exact', head: true }).eq('lesson_id', id)
            ]);
            const erro = a.error || s.error;
            if (erro || a.count == null || s.count == null) throw new Error(erro?.message || 'contagem indisponível');
            mapa.set(id, a.count + s.count);
        }));
    }
    return mapa;
}

export async function excluirTelasEmLote() {
    const btn = document.getElementById('btn-lote-excluir');
    const rotulo = btn ? btn.innerText : 'Excluir';
    const volta = () => { if (btn) btn.innerText = rotulo; };
    const arr = Array.from(licoesSelecionadas);
    if (!arr.length) return;

    if (btn) btn.innerText = 'Verificando...';
    let historico;
    try { historico = await historicoPorTela(arr); }
    catch (e) {
        volta();
        return alert('Não foi possível verificar o histórico de respostas. NADA foi excluído.\n' + (e.message || e));
    }
    volta();

    const livres = arr.filter(id => !historico.get(id));
    const comHistorico = arr.filter(id => historico.get(id));
    if (!livres.length) {
        return alert(`As ${arr.length} tela(s) selecionada(s) já têm respostas de alunos e não podem ser excluídas: isso apagaria o histórico.\n\nUse "Inativar": a tela some para os alunos e o histórico é preservado.`);
    }
    const aviso = comHistorico.length
        ? `\n\n${comHistorico.length} tela(s) têm respostas de alunos e serão MANTIDAS. Para tirá-las do ar, use "Inativar".`
        : '';
    if (!confirm(`EXCLUIR PERMANENTEMENTE ${livres.length} tela(s) sem respostas de alunos?${aviso}`)) return;

    if (btn) btn.innerText = 'Aguarde...';
    try {
        // Um único comando: as questões e alternativas saem junto (ON DELETE CASCADE) e, se algo falhar, nada fica pela metade.
        const { error } = await window.supabase.from('lessons').delete().in('id', livres);
        if (error) throw error;
        livres.forEach(id => licoesSelecionadas.delete(id));
        await carregarLicoes();
        if (comHistorico.length) alert(`${livres.length} tela(s) excluída(s). ${comHistorico.length} mantida(s) por terem respostas de alunos.`);
    } catch (e) {
        console.error(e);
        alert('Falha ao excluir: ' + (e.message || e));
        await carregarLicoes();
    } finally { volta(); }
}

function atualizarBarraLote() {
    const barra = document.getElementById('barra-acoes-lote');
    if (!barra) return;
    const qtd = licoesSelecionadas.size;
    if (qtd > 0) {
        document.getElementById('txt-lote-count').innerText = `${qtd} selecionada${qtd > 1 ? 's' : ''}`;
        barra.classList.remove('translate-y-24', 'opacity-0');
    } else {
        barra.classList.add('translate-y-24', 'opacity-0');
    }
}

function filtrarLicoes() {
    const termo = document.getElementById('busca-licao').value.trim().toLowerCase();
    const verInativas = document.getElementById('ver-inativas').checked;
    document.querySelectorAll('.adm-linha').forEach(l => {
        const esconde = (!!termo && !l.dataset.busca.includes(termo)) || (!verInativas && l.dataset.inativa === '1');
        l.classList.toggle('hidden', esconde);
        // Se a lição for ocultada pela busca, remove da seleção de lote para não afetar lições escondidas acidentalmente
        if (esconde && licoesSelecionadas.has(l.querySelector('[data-selecionar]').value)) {
            licoesSelecionadas.delete(l.querySelector('[data-selecionar]').value);
            l.querySelector('[data-selecionar]').checked = false;
        }
    });
    atualizarBarraLote();
}

async function organizar() {
    if (!confirm('Distribuir as telas ativas "sem lição curta" de TODOS os módulos em lições curtas e criar a Revisão onde faltar?')) return;
    const { data, error } = await window.supabase.rpc('academia_organizar_unidades', { simular: false });
    if (error) return alert('Erro: ' + error.message);
    alert(data?.length ? `Organizado: ${data.length} itens criados.` : 'Nada a organizar.');
    await carregarTrilhas(); preencherSelectModulos(); carregarLicoes();
}

// =====================================================================
// RELATÓRIOS
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

// =====================================================================
// EXPORTAÇÃO (JSON e CSV)
// =====================================================================

// Mapear os cliques dos botões logo no início da sua função initAdmin()
// Adicione estas duas linhas lá em cima:

async function gerenciarExportacao(event, funcaoExportar) {
    const btn = event.currentTarget;
    const txtOriginal = btn.textContent;
    btn.textContent = 'Gerando...';
    btn.disabled = true;
    try {
        await funcaoExportar();
    } catch (e) {
        alert('Erro ao exportar: ' + e.message);
    } finally {
        btn.textContent = txtOriginal;
        btn.disabled = false;
    }
}

// 1. Exportação JSON (Estrutura de Lote)
async function exportarBackupJSON() {
    const [tRes, mRes, lRes] = await Promise.all([
        window.supabase.from('learning_tracks').select('id, titulo').order('created_at'),
        window.supabase.from('learning_modules').select('id, track_id, titulo').order('ordem'),
        window.supabase.from('lessons').select('module_id, titulo, tipo, xp_recompensa, conteudo_texto, cenario, questions(enunciado, explicacao_feedback, question_options(texto_alternativa, is_correta))').eq('ativo', true).order('ordem')
    ]);

    if (tRes.error || mRes.error || lRes.error) throw new Error('Falha ao buscar dados no Supabase.');

    const trilhas = tRes.data || [];
    const modulos = mRes.data || [];
    const licoes = lRes.data || [];
    const exportData = [];

    modulos.forEach(mod => {
        const trilha = trilhas.find(t => t.id === mod.track_id);
        if (!trilha) return;

        const licoesModulo = licoes.filter(l => l.module_id === mod.id).map(l => {
            const obj = { titulo: l.titulo, tipo: l.tipo, xp_recompensa: l.xp_recompensa, conteudo_texto: l.conteudo_texto };
            if (l.tipo === 'simulacao' && l.cenario) obj.cenario = l.cenario;
            
            if (l.tipo === 'exercicio' && l.questions && l.questions.length > 0) {
                const q = l.questions[0];
                obj.questao = {
                    enunciado: q.enunciado,
                    explicacao_feedback: q.explicacao_feedback,
                    opcoes: (q.question_options || []).map(o => ({ texto: o.texto_alternativa, correta: o.is_correta }))
                };
            }
            return obj;
        });

        if (licoesModulo.length > 0) {
            exportData.push({ trilha: trilha.titulo, modulo: mod.titulo, licoes: licoesModulo });
        }
    });

    baixarArquivo(JSON.stringify(exportData, null, 2), `backup_academia_cgcf_${dataAtual()}.json`, 'application/json');
}

// 2. Exportação CSV (Para Excel) - Atualizada com a coluna Status
async function exportarBackupCSV() {
    const [mRes, lRes] = await Promise.all([
        window.supabase.from('learning_modules').select('id, titulo'),
        window.supabase.from('lessons').select('module_id, titulo, tipo, conteudo_texto, ativo, questions(enunciado, explicacao_feedback, question_options(texto_alternativa, is_correta, ordem))').order('module_id').order('ordem')
    ]);

    if (mRes.error || lRes.error) throw new Error('Falha ao buscar dados no Supabase.');

    const modulos = Object.fromEntries((mRes.data || []).map(m => [m.id, m.titulo]));
    
    // Cabeçalho do CSV agora com a coluna Status
    let csvContent = "Status;Módulo;Tipo;Título;Texto/Enunciado;Feedback;Alternativa 1;Alternativa 2;Alternativa 3;Alternativa 4;Alternativa 5;Alternativa Correta\n";

    const escapeCSV = (str) => {
        if (!str) return "";
        let limpo = String(str).replace(/\r?\n|\r/g, " "); // Remove quebras de linha
        if (limpo.includes(";") || limpo.includes('"')) {
            limpo = `"${limpo.replace(/"/g, '""')}"`; // Escapa aspas e ponto-e-vírgula
        }
        return limpo;
    };

    (lRes.data || []).forEach(l => {
        const moduloNome = modulos[l.module_id] || 'Desconhecido';
        const statusTexto = l.ativo !== false ? 'Ativa' : 'Inativa';
        const q = (l.questions && l.questions.length > 0) ? l.questions[0] : null;
        
        let textoBase = l.tipo === 'exercicio' ? (q?.enunciado || '') : (l.conteudo_texto || '');
        let feedback = q?.explicacao_feedback || '';
        let altCorreta = '';
        let opcoes = ['', '', '', '', ''];

        if (q && q.question_options) {
            const opts = [...q.question_options].sort((a, b) => (a.ordem || 0) - (b.ordem || 0));
            opts.forEach((o, i) => {
                if (i < 5) opcoes[i] = o.texto_alternativa;
                if (o.is_correta) altCorreta = `Opção ${i + 1}`;
            });
        }

        csvContent += `${escapeCSV(statusTexto)};${escapeCSV(moduloNome)};${escapeCSV(l.tipo)};${escapeCSV(l.titulo)};${escapeCSV(textoBase)};${escapeCSV(feedback)};${escapeCSV(opcoes[0])};${escapeCSV(opcoes[1])};${escapeCSV(opcoes[2])};${escapeCSV(opcoes[3])};${escapeCSV(opcoes[4])};${escapeCSV(altCorreta)}\n`;
    });

    // Usa UTF-8 com BOM para o Excel abrir os acentos corretamente
    baixarArquivo("\uFEFF" + csvContent, `questoes_academia_cgcf_${dataAtual()}.csv`, 'text/csv;charset=utf-8;');
}

function baixarArquivo(conteudo, nomeArquivo, tipoMime) {
    const blob = new Blob([conteudo], { type: tipoMime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = nomeArquivo;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function dataAtual() {
    return new Date().toISOString().split('T')[0];
}
