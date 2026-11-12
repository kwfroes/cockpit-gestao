// =====================================================================
// Tela do módulo: lições curtas + Revisão do Módulo
// - Conta apenas telas ATIVAS
// - Lição curta sem telas ativas não aparece para o aluno e não trava a sequência
// - Admin: tudo liberado (se o modo estiver ligado) e edição das lições curtas
// =====================================================================
import { navigateTo, enviarLogAoPai } from './main.js';
import { estrelasDoScore, htmlEstrelas } from './medalha.js';
import { esc, isAdmin, adminLivre, editarUnidade, editarLicao } from './admin_editor.js';

export async function initModuleView({ moduleId, moduleTitle }) {
    const view = document.getElementById('module-view');
    const email = sessionStorage.getItem('cockpit_user_email');
    const admin = adminLivre(), livre = admin;   // cadeado fechado = tela idêntica à do aluno
    try {
        const [{ data: unidades, error }, { data: ativas, error: e2 }] = await Promise.all([
            window.supabase.from('learning_units').select('id, titulo, ordem, tipo, config')
                .eq('module_id', moduleId).order('ordem', { ascending: true }),
            window.supabase.from('lessons').select('id, unit_id, tipo').eq('module_id', moduleId).eq('ativo', true)
        ]);
        if (error || e2) throw error || e2;

        const nAtivas = {};
        (ativas || []).forEach(l => { if (l.unit_id) nAtivas[l.unit_id] = (nAtivas[l.unit_id] || 0) + 1; });
        const nExercicios = (ativas || []).filter(l => l.tipo === 'exercicio').length;
        const temConteudo = u => u.tipo === 'revisao' ? nExercicios > 0 : (nAtivas[u.id] || 0) > 0;
        const contaveis = (unidades || []).filter(temConteudo);

        if (!contaveis.length && !admin) {
            navigateTo('lesson', { moduleId, moduleTitle });   // módulo ainda não organizado
            return;
        }

        const { data: prog } = await window.supabase
            .from('user_unit_progress').select('unit_id, melhor_score')
            .eq('user_email', email).in('unit_id', (unidades || []).map(u => u.id));
        const feitos = Object.fromEntries((prog || []).map(p => [p.unit_id, p]));

        const total = contaveis.length;
        const concluidas = contaveis.filter(u => feitos[u.id]).length;
        const pct = total ? concluidas / total : 0;
        let liberado = true;
        const recarregar = () => initModuleView({ moduleId, moduleTitle });

        view.innerHTML = `
          <div class="flex items-center gap-3 mb-6">
            <button id="btn-voltar-mapa" class="text-slate-400 hover:text-blue-600 p-2" title="Voltar ao mapa">
              <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7"/></svg>
            </button>
            <div class="flex-1">
              <p class="text-[10px] font-black text-slate-400 uppercase tracking-widest">Módulo</p>
              <h2 class="text-xl font-black text-slate-800 dark:text-white">${esc(moduleTitle)}</h2>
            </div>
            ${admin ? `<button id="btn-adm-gerenciar" class="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-700 text-white text-[10px] font-black uppercase tracking-wider">Gerenciar módulo</button>` : ''}
          </div>
          <div class="mb-8">
            <div class="flex justify-between text-xs font-bold text-slate-500 mb-1">
              <span>${concluidas} de ${total} concluídas</span><span>${Math.round(pct * 100)}%</span>
            </div>
            <div class="h-3 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all" style="width:${pct * 100}%"></div>
            </div>
          </div>
          ${admin && livre ? '<p class="mb-3 text-[11px] font-bold text-purple-600 dark:text-purple-400">Modo admin: todas as lições liberadas.</p>' : ''}
          <div id="lista-unidades" class="space-y-3"></div>
          ${admin ? `<div class="flex gap-2 mt-4">
              <button id="btn-adm-nova-unid" class="flex-1 py-3 rounded-2xl border-2 border-dashed border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-400 text-xs font-black uppercase">+ Lição curta</button>
              <button id="btn-adm-nova-licao" class="flex-1 py-3 rounded-2xl border-2 border-dashed border-purple-300 dark:border-purple-800 text-purple-600 dark:text-purple-400 text-xs font-black uppercase">+ Teoria / questão</button>
            </div>` : ''}`;

        document.getElementById('btn-voltar-mapa').onclick = () => navigateTo('dashboard');
        if (admin) {
            document.getElementById('btn-adm-gerenciar').onclick = () => navigateTo('admin', { aba: 'licoes', moduleId });
            document.getElementById('btn-adm-nova-unid').onclick = () => editarUnidade(null, { moduleId, onSalvo: recarregar });
            document.getElementById('btn-adm-nova-licao').onclick = () => editarLicao(null, { moduleId, unitId: (unidades || []).find(u => u.tipo === 'licao')?.id, onSalvo: recarregar });
        }
        const lista = document.getElementById('lista-unidades');
        const exibidas = admin ? (unidades || []) : contaveis;
        if (!exibidas.length) lista.innerHTML = '<p class="text-center text-slate-400 italic py-6">Este módulo ainda não tem lições curtas.</p>';

        let numero = 0;
        exibidas.forEach(u => {
            const revisao = u.tipo === 'revisao';
            const vazia = !temConteudo(u);
            const feito = !!feitos[u.id];
            if (!revisao && !vazia) numero++;
            const passos = revisao ? Math.min(u.config?.qtd ?? 8, nExercicios) : (nAtivas[u.id] || 0);

            let estado;
            if (vazia) estado = 'vazia';
            else if (feito) estado = 'concluida';
            else if (liberado || livre) { estado = 'disponivel'; liberado = false; }
            else estado = 'bloqueada';

            const icone = { concluida: '✓', bloqueada: '🔒', vazia: '∅', disponivel: revisao ? '🏁' : numero }[estado];
            const cor = {
                concluida: 'border-emerald-300 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20',
                disponivel: 'border-blue-500 dark:border-blue-500 bg-white dark:bg-slate-800 ring-4 ring-blue-500/20',
                bloqueada: 'border-slate-200 dark:border-slate-700 bg-slate-100 dark:bg-slate-800/50 opacity-60',
                vazia: 'border-dashed border-slate-300 dark:border-slate-600 bg-transparent opacity-70'
            }[estado];
            const corIcone = {
                concluida: 'bg-emerald-500 text-white',
                disponivel: revisao ? 'bg-amber-500 text-white' : 'bg-blue-600 text-white',
                bloqueada: 'bg-slate-300 dark:bg-slate-700 text-slate-500',
                vazia: 'bg-slate-200 dark:bg-slate-700 text-slate-400'
            }[estado];
            const sub = vazia
                ? 'Sem telas ativas • não aparece para os alunos'
                : revisao
                    ? `${passos} questões • mínimo de ${Math.round((u.config?.min_acerto ?? 0.7) * 100)}% de acerto`
                    : `${passos} passos • cerca de ${Math.max(2, Math.round(passos * 0.7))} min`;
            let nota = '';
            if (feito && revisao) nota = `<div class="flex gap-0.5 justify-end">${htmlEstrelas(estrelasDoScore(feitos[u.id].melhor_score), 'text-lg')}</div>`;
            else if (feito && feitos[u.id].melhor_score != null) nota = `<span class="text-[10px] font-bold text-emerald-700 dark:text-emerald-400">${Math.round(feitos[u.id].melhor_score * 100)}% de primeira</span>`;

            const linha = document.createElement('div');
            linha.className = 'flex items-stretch gap-2';
            const card = document.createElement('button');
            card.className = `flex-1 min-w-0 flex items-center gap-4 p-4 rounded-2xl border-2 text-left transition-all ${cor} ${estado === 'bloqueada' ? 'cursor-not-allowed' : 'hover:scale-[1.01] active:scale-[0.99]'}`;
            card.innerHTML = `
              <div class="w-12 h-12 shrink-0 rounded-full flex items-center justify-center font-black text-lg ${corIcone}">${icone}</div>
              <div class="flex-1 min-w-0">
                <p class="text-[10px] font-black uppercase tracking-widest ${revisao ? 'text-amber-600' : 'text-slate-400'}">${revisao ? 'Revisão final' : vazia ? 'Lição vazia' : 'Lição ' + numero}</p>
                <p class="font-bold text-slate-800 dark:text-white truncate">${esc(u.titulo)}</p>
                <p class="text-xs text-slate-500">${sub}</p>
              </div>
              <div class="text-right">${nota}${estado === 'concluida' ? '<p class="text-[10px] text-slate-400 mt-1">Refazer</p>' : ''}</div>`;
            if (estado !== 'bloqueada') {
                card.onclick = () => {
                    enviarLogAoPai('INICIAR_UNIDADE', { modulo_id: moduleId, unidade_id: u.id, unidade: u.titulo });
                    navigateTo('lesson', { moduleId, moduleTitle, unitId: u.id, unitTitle: u.titulo, unitTipo: u.tipo, unitConfig: u.config || {} });
                };
            } else card.disabled = true;
            linha.appendChild(card);
            if (admin) {
                const ed = document.createElement('button');
                ed.className = 'px-3 rounded-2xl border-2 border-purple-200 dark:border-purple-800 text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-900/30';
                ed.title = revisao ? 'Configurar revisão' : 'Editar lição curta';
                ed.textContent = '✏️';
                ed.onclick = () => editarUnidade(u, { moduleId, onSalvo: recarregar });
                linha.appendChild(ed);
            }
            lista.appendChild(linha);
        });
    } catch (err) {
        console.error('Erro ao carregar o módulo:', err);
        view.innerHTML = '<p class="text-red-500 font-bold text-center mt-10">Erro ao carregar o módulo.</p>';
    }
}
