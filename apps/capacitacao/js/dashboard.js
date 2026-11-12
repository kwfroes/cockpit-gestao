import { navigateTo, enviarLogAoPai } from './main.js';
import { estrelasDoScore, htmlEstrelas, MEDALHAS } from './medalha.js';
import { esc, isAdmin, adminLivre } from './admin_editor.js';
import { getEstado } from './gamification.js';

export async function initDashboard() {
    enviarLogAoPai("ACESSO_DASHBOARD_ACADEMIA");
    renderizarBoasVindas();
    const container = document.getElementById('tracks-container');
    if (container) container.innerHTML = '<p class="text-slate-500 animate-pulse text-center mt-10">Buscando o seu progresso no banco de dados...</p>';
    await carregarDadosDoSupabase();
}

function renderizarBoasVindas() {
    const header = document.getElementById('dashboard-header');
    if (!header) return;
    const userName = sessionStorage.getItem("cockpit_user_realname") || "Analista";
    const primeiroNome = userName.split(" ")[0];
    header.innerHTML = `
        <div class="flex flex-col md:flex-row items-center gap-6 bg-gradient-to-r from-blue-600 to-indigo-700 rounded-3xl p-6 md:p-8 shadow-lg text-white mb-10 relative overflow-hidden">
            <div class="absolute -top-24 -right-24 w-64 h-64 bg-white opacity-10 rounded-full blur-3xl"></div>
            <div class="w-32 h-32 shrink-0 relative z-10 flex items-center justify-center bg-white/10 rounded-full p-2 border-2 border-white/20 shadow-inner">
                <img src="../../assets/img/capacitacao/srcockpit/sr_cockpit_ola.png" alt="Sr. Cockpit" class="w-full h-full object-contain drop-shadow-md rounded-full" onerror="this.style.display='none'">
            </div>
            <div class="flex-1 relative z-10 text-center md:text-left">
                <h2 class="text-2xl md:text-3xl font-black mb-2 tracking-tight">Olá, ${esc(primeiroNome)}! Eu sou o Sr. Cockpit.</h2>
                <p class="text-blue-100 text-sm md:text-base leading-relaxed mb-4">
                    Pronto para aprofundar seus conhecimentos em análise documental e regras do CAF Digital?
                    Siga o caminho e complete os módulos para ganhar XP!
                </p>
                ${objetivoHtml()}
            </div>
        </div>`;
}

function objetivoHtml() {
    const { fezHoje, streak } = getEstado();
    if (fezHoje) return `
        <div class="inline-flex items-center gap-2 bg-emerald-500/90 border border-emerald-300 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
            <span class="w-5 h-5 rounded-full bg-white text-emerald-600 flex items-center justify-center font-black">✓</span>
            Objetivo de hoje concluído! 🔥 ${streak} ${streak === 1 ? 'dia' : 'dias'} seguidos
        </div>`;
    return `
        <div class="inline-block bg-white/20 backdrop-blur-sm border border-white/30 rounded-lg px-4 py-2 text-xs font-bold uppercase tracking-wider text-white shadow-sm">
            🏁 Seu objetivo hoje: completar 1 lição!${streak ? ` <span class="normal-case font-semibold opacity-90">(mantenha sua sequência de ${streak} ${streak === 1 ? 'dia' : 'dias'})</span>` : ''}
        </div>`;
}

async function carregarDadosDoSupabase() {
    const container = document.getElementById('tracks-container');
    const userEmail = sessionStorage.getItem("cockpit_user_email");
    try {
        let qTr = window.supabase.from('learning_tracks').select('*').order('created_at', { ascending: true });
        if (!adminLivre()) qTr = qTr.eq('ativo', true);
        const [r1, r2, r3, r4, r5, r6] = await Promise.all([
            qTr,
            window.supabase.from('learning_modules').select('*').order('ordem', { ascending: true }),
            window.supabase.from('user_progress').select('module_id, status').eq('user_email', userEmail),
            window.supabase.from('learning_units').select('id, module_id, tipo'),
            window.supabase.from('user_unit_progress').select('unit_id, melhor_score').eq('user_email', userEmail),
            // Só telas ATIVAS contam para "módulo com conteúdo" e para o total de lições
            window.supabase.from('lessons').select('module_id, unit_id, tipo').eq('ativo', true).limit(10000)
        ]);
        for (const r of [r1, r2, r3, r4, r5, r6]) if (r.error) throw r.error;
        const trilhas = r1.data, modulos = r2.data, progresso = r3.data || [];
        const unidades = r4.data || [], progUnid = r5.data || [], ativas = r6.data || [];

        const telasPorModulo = {}, telasPorUnidade = {}, exPorModulo = {};
        ativas.forEach(l => {
            telasPorModulo[l.module_id] = (telasPorModulo[l.module_id] || 0) + 1;
            if (l.unit_id) telasPorUnidade[l.unit_id] = (telasPorUnidade[l.unit_id] || 0) + 1;
            if (l.tipo === 'exercicio') exPorModulo[l.module_id] = (exPorModulo[l.module_id] || 0) + 1;
        });

        const progressoMap = {};
        progresso.forEach(p => { progressoMap[p.module_id] = p.status; });
        const feitas = Object.fromEntries(progUnid.map(p => [p.unit_id, p]));
        const resumo = {};
        unidades.forEach(u => {
            const conta = u.tipo === 'revisao' ? (exPorModulo[u.module_id] || 0) > 0 : (telasPorUnidade[u.id] || 0) > 0;
            if (!conta) return;
            const r = (resumo[u.module_id] ||= { total: 0, feitas: 0, scoreRevisao: null, temRevisao: false });
            r.total++;
            if (feitas[u.id]) r.feitas++;
            if (u.tipo === 'revisao') {
                r.temRevisao = true;
                if (feitas[u.id]) r.scoreRevisao = feitas[u.id].melhor_score;
            }
        });
        renderizarMapaTrilhas(trilhas, modulos, progressoMap, resumo, telasPorModulo);
    } catch (error) {
        console.error("Erro ao carregar dados:", error);
        if (container) container.innerHTML = '<p class="text-red-500 font-bold text-center">Erro ao carregar o conteúdo. Contate o administrador.</p>';
    }
}

function anel(pct, cor, trilhaCor = 'rgba(148,163,184,.35)') {
    const C = 2 * Math.PI * 44;
    return `<svg class="absolute inset-0 w-full h-full -rotate-90 pointer-events-none" viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="44" fill="none" stroke="${trilhaCor}" stroke-width="6"/>
        <circle cx="50" cy="50" r="44" fill="none" stroke="${cor}" stroke-width="6" stroke-linecap="round"
                stroke-dasharray="${C}" stroke-dashoffset="${C * (1 - pct)}" style="transition:stroke-dashoffset .6s"/>
    </svg>`;
}

function renderizarMapaTrilhas(trilhas, modulos, progressoMap, resumo, telasPorModulo) {
    const container = document.getElementById('tracks-container');
    if (!container) return;
    container.innerHTML = '';
    if (!trilhas.length) {
        container.innerHTML = '<p class="text-slate-500 text-center italic py-10">Nenhuma trilha ativa cadastrada no momento.</p>';
        return;
    }
    const livre = adminLivre();
    let isProximoDesbloqueado = true;
    trilhas.forEach((trilha) => {
        const modulosDestaTrilha = modulos.filter(m => m.track_id === trilha.id).sort((a, b) => a.ordem - b.ordem);
        let colorTheme = { bg: 'bg-emerald-100', border: 'border-emerald-200', text: 'text-emerald-700', bgDark: 'dark:bg-emerald-900/30', borderDark: 'dark:border-emerald-800', textDark: 'dark:text-emerald-400' };
        let icone = '📝', corTrilha = { bg: '#3B82F6', borda: '#1D4ED8' };
        if (trilha.nivel === "Inicial") {
            colorTheme = { bg: 'bg-purple-100', border: 'border-purple-200', text: 'text-purple-700', bgDark: 'dark:bg-purple-900/30', borderDark: 'dark:border-purple-800', textDark: 'dark:text-purple-400' };
            icone = '🏛️'; corTrilha = { bg: '#A855F7', borda: '#7E22CE' };
        } else if (trilha.nivel === "Avançado" || trilha.nivel === "Especialista") {
            colorTheme = { bg: 'bg-amber-100', border: 'border-amber-200', text: 'text-amber-700', bgDark: 'dark:bg-amber-900/30', borderDark: 'dark:border-amber-800', textDark: 'dark:text-amber-400' };
            icone = '⚖️'; corTrilha = { bg: '#F59E0B', borda: '#B45309' };
        }
        const section = document.createElement('div');
        section.className = `w-full mb-16 animate-fade-in ${trilha.ativo === false ? 'opacity-60' : ''}`;
        section.innerHTML = `
            <div class="${colorTheme.bg} ${colorTheme.bgDark} border ${colorTheme.border} ${colorTheme.borderDark} rounded-2xl p-6 mb-8 text-center shadow-sm relative overflow-hidden">
                <div class="absolute top-0 right-0 p-3 opacity-20 text-6xl transform rotate-12">${icone}</div>
                <div class="inline-block px-3 py-1 mb-3 rounded-full bg-white/50 dark:bg-black/20 text-[10px] font-black uppercase tracking-widest ${colorTheme.text} ${colorTheme.textDark} border ${colorTheme.border} ${colorTheme.borderDark}">
                    NÍVEL ${esc(trilha.nivel)}${trilha.ativo === false ? ' • INATIVA (só admin vê)' : ''}
                </div>
                <h2 class="text-2xl font-black ${colorTheme.text} ${colorTheme.textDark} uppercase tracking-wide relative z-10">${esc(trilha.titulo)}</h2>
                <p class="text-sm ${colorTheme.text} ${colorTheme.textDark} opacity-80 mt-2 max-w-2xl mx-auto relative z-10">${esc(trilha.descricao)}</p>
            </div>
            <div id="path-track-${trilha.id}" class="flex flex-col items-center gap-4 relative w-full pb-8"></div>`;
        container.appendChild(section);
        const pathContainer = document.getElementById(`path-track-${trilha.id}`);
        if (!modulosDestaTrilha.length) {
            pathContainer.innerHTML = '<p class="text-xs text-slate-400 italic">Módulos em desenvolvimento...</p>';
            return;
        }

        modulosDestaTrilha.forEach((mod, index) => {
            const offset = index % 2 === 0 ? '-translate-x-12' : 'translate-x-12';
            const tooltip = (rotulo, detalhe = '') => `
                <div class="absolute -top-14 left-1/2 -translate-x-1/2 bg-white dark:bg-slate-800 text-slate-800 dark:text-white text-xs font-bold px-3 py-2 rounded-lg shadow-lg border dark:border-slate-700 whitespace-nowrap opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity z-20 text-center">
                    <span class="block text-[9px] text-slate-400 uppercase mb-0.5">${rotulo}</span>
                    ${esc(mod.titulo)}
                    ${detalhe ? `<span class="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 mt-0.5">${detalhe}</span>` : ''}
                </div>`;
            const no = document.createElement('div');
            no.className = `relative ${offset} flex flex-col items-center group z-10`;

            const vazio = !telasPorModulo[mod.id];
            if (vazio && !livre) {
                no.innerHTML = `
                  <div class="w-24 h-24 flex items-center justify-center">
                    <div class="w-20 h-20 rounded-full flex items-center justify-center text-2xl border-4 border-dashed border-slate-300 dark:border-slate-600 bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed opacity-60">🚧</div>
                  </div>${tooltip('Em breve')}`;
                pathContainer.appendChild(no);
                return;
            }

            const r = resumo[mod.id] || { total: 0, feitas: 0, scoreRevisao: null, temRevisao: false };
            const concluido = progressoMap[mod.id] === 'concluido' || (r.total > 0 && r.feitas === r.total);
            let status = 'bloqueado';
            if (concluido) { status = 'concluido'; isProximoDesbloqueado = true; }
            else if (livre || progressoMap[mod.id] === 'em_andamento' || isProximoDesbloqueado) { status = 'andamento'; isProximoDesbloqueado = false; }

            const pct = concluido ? 1 : (r.total ? r.feitas / r.total : 0);
            let circulo, anelHtml = '', abaixo = '', detalhe = '';
            if (status === 'concluido') {
                const est = estrelasDoScore(r.scoreRevisao);
                const m = MEDALHAS[est];
                anelHtml = anel(1, m.bg, m.borda);
                circulo = `<div class="w-[76px] h-[76px] rounded-full flex items-center justify-center text-3xl font-black text-white border-4 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                               style="background:${m.bg};border-color:${m.borda};box-shadow:0 5px 0 ${m.borda}">${est === 3 ? '🏆' : '✓'}</div>`;
                abaixo = est ? `<div class="flex gap-0.5 mt-1">${htmlEstrelas(est, 'text-xl')}</div>` : '';
                detalhe = est ? `${m.nome} • ${Math.round(r.scoreRevisao * 100)}% na revisão`
                              : (r.temRevisao ? 'Faça a revisão para ganhar estrelas' : 'Concluído');
            } else if (status === 'andamento') {
                const cor = vazio ? { bg: '#94A3B8', borda: '#64748B' } : corTrilha;
                anelHtml = anel(pct, cor.bg);
                circulo = `<div class="w-[76px] h-[76px] rounded-full flex items-center justify-center text-3xl text-white border-4 cursor-pointer transform hover:scale-105 active:scale-95 transition-all"
                               style="background:${cor.bg};border-color:${cor.borda};box-shadow:0 5px 0 ${cor.borda}">${vazio ? '🚧' : icone}</div>`;
                abaixo = r.total ? `<span class="mt-1 text-[11px] font-black text-slate-500 dark:text-slate-400">${r.feitas}/${r.total}</span>` : '';
                detalhe = vazio ? 'Sem conteúdo ativo (só admin abre)' : (r.total ? `${r.feitas} de ${r.total} lições` : '');
            } else {
                circulo = `<div class="w-[76px] h-[76px] rounded-full flex items-center justify-center text-3xl border-4 bg-slate-200 dark:bg-slate-700 border-slate-300 dark:border-slate-600 shadow-[0_5px_0_#94a3b8] dark:shadow-[0_5px_0_#475569] text-slate-400 cursor-not-allowed">🔒</div>`;
            }
            no.innerHTML = `
              <div class="relative w-24 h-24 flex items-center justify-center">${anelHtml}${circulo}</div>
              ${abaixo}
              ${tooltip('Módulo ' + (index + 1), detalhe)}`;
            if (status !== 'bloqueado') {
                no.querySelector('.cursor-pointer').onclick = () => {
                    enviarLogAoPai("ABRIR_MODULO", { modulo_id: mod.id, modulo_titulo: mod.titulo });
                    navigateTo('module', { moduleId: mod.id, moduleTitle: mod.titulo });
                };
            }
            pathContainer.appendChild(no);
        });
    });
}
