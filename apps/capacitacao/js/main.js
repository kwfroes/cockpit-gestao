import { initDashboard } from './dashboard.js';
import { initLessonEngine } from './engine.js';
import { initModuleView } from './module.js';
import { carregarGamificacao } from './gamification.js';
import { initAdmin } from './admin.js';
import { isAdmin, adminLivre, setAdminLivre } from './admin_editor.js';
import { initConquistas, initCertificado } from './certificados.js';
import { initCertAdmin } from './cert_admin.js';
import './falas_admin.js';

window.supabase = window.supabaseClient;
const routerView = document.getElementById('router-view');
let telaAtual = { viewName: 'dashboard', params: {} };

window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "THEME_CHANGE") {
        if (event.data.theme === "dark") document.documentElement.classList.add("dark");
        else document.documentElement.classList.remove("dark");
    }
});

export function enviarLogAoPai(acao, detalhes = {}) {
    if (window.parent !== window) {
        window.parent.postMessage({ type: "REGISTRAR_LOG", payload: { acao, detalhes, appOrigem: "ACADEMIA_CGCF" } }, "*");
    } else {
        console.log(`[LOG] ${acao}`, detalhes);
    }
}

export async function navigateTo(viewName, params = {}) {
    try {
        const response = await fetch(`views/${viewName}.html`);
        if (!response.ok) throw new Error("Tela não encontrada");
        document.getElementById('barra-acoes-lote')?.remove();     // a barra de seleção do admin não deve sobrar em outras telas
        routerView.innerHTML = await response.text();
        telaAtual = { viewName, params };
        window.scrollTo(0, 0);
        if (viewName === 'dashboard') initDashboard();
        else if (viewName === 'module') initModuleView(params);
        else if (viewName === 'lesson') initLessonEngine(params.moduleId ? params
            : { moduleId: params.lessonId, moduleTitle: params.lessonTitle });
        else if (viewName === 'admin') { initAdmin(params); initCertAdmin(); }
        else if (viewName === 'conquistas') initConquistas();
        else if (viewName === 'certificado') initCertificado(params);
    } catch (error) {
        console.error(error);
        routerView.innerHTML = `<p class="text-red-500 text-center mt-10">Erro ao carregar a tela.</p>`;
    }
}

document.addEventListener('DOMContentLoaded', async () => {
    await carregarGamificacao();
    navigateTo('dashboard');
    {   // Botão "Conquistas": galeria de certificados (todos os perfis)
        const barra = document.getElementById('header-stats-container');
        if (barra && !document.getElementById('btn-conquistas')) {
            const b = document.createElement('button');
            b.id = 'btn-conquistas';
            b.title = 'Minhas conquistas e certificados';
            b.className = "flex items-center gap-2 bg-emerald-50 dark:bg-emerald-900/20 hover:bg-emerald-100 dark:hover:bg-emerald-900/40 px-3 py-1.5 rounded-full border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-bold text-xs uppercase transition-colors shadow-sm";
            b.innerHTML = '🏅 <span class="hidden sm:inline">Conquistas</span>';
            b.onclick = () => navigateTo('conquistas');
            barra.appendChild(b);
        }
    }
    const role = sessionStorage.getItem("cockpit_user_role");
    const isResponsavel = sessionStorage.getItem("cockpit_user_responsavel") === "true";
    if (role === "admin" || isResponsavel) {
        const headerStats = document.getElementById('header-stats-container');
        if (headerStats) {
            const btnAdmin = document.createElement('button');
            btnAdmin.className = "flex items-center gap-2 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 px-3 py-1.5 rounded-full border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold text-xs uppercase transition-colors ml-2 shadow-sm";
            btnAdmin.innerHTML = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg> <span class="hidden sm:inline">Admin Pedagógico</span>`;
            btnAdmin.id = 'btn-admin-pedagogico';
            btnAdmin.onclick = () => navigateTo('admin');
            headerStats.appendChild(btnAdmin);

            // Cadeado ao lado do Admin Pedagógico: 🔓 tudo liberado / 🔒 ver como aluno
            if (isAdmin()) {
                const btnCadeado = document.createElement('button');
                btnCadeado.id = 'btn-admin-cadeado';
                const pintar = () => {
                    const livre = adminLivre();
                    btnCadeado.textContent = livre ? '🔓' : '🔒';
                    btnCadeado.title = livre
                        ? 'Tudo liberado (modo admin). Clique para ver como aluno.'
                        : 'Vendo como aluno (bloqueios ativos). Clique para liberar tudo.';
                    btnAdmin.style.display = livre ? '' : 'none';   // cadeado fechado: some também o acesso ao painel
                    btnCadeado.className = `w-9 h-9 flex items-center justify-center rounded-full border text-base transition-colors shadow-sm ${livre
                        ? 'bg-purple-600 border-purple-500 hover:bg-purple-700'
                        : 'bg-slate-100 dark:bg-slate-800 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'}`;
                };
                pintar();
                btnCadeado.onclick = () => {
                    setAdminLivre(!adminLivre());
                    pintar();
                    window.dispatchEvent(new CustomEvent('academia:admin-modo'));
                    if (telaAtual.viewName === 'admin' && !adminLivre()) navigateTo('dashboard');
                    else if (telaAtual.viewName !== 'lesson') navigateTo(telaAtual.viewName, telaAtual.params);
                };
                headerStats.appendChild(btnCadeado);
            }
        }
    }
});
