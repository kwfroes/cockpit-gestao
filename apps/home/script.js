/**
 * apps/home/script.js
 */

// Importa o Supabase direto na Home
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://whnzeysvqbtuecxmthht.supabase.co';
const supabaseKey = 'sb_publishable_Gw4cFK56R9kms2ogg50UqA_ZhHi79qw'; // Substitua pela sua chave anon
const supabase = createClient(supabaseUrl, supabaseKey);

// ==========================================================
// MÓDULO DE NAVEGAÇÃO DINÂMICA
// ==========================================================

const APP_REGISTRY = {
    '#dashboard': {
        id: '#dashboard',
        titulo: 'Dashboard Operacional',
        icone: '<svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor"><path d="M15 1H1V7H3.38197L4.88196 4L7.11803 4L10 9.76393L11.382 7H15V1Z"/><path d="M15 9H12.618L11.118 12L8.88197 12L6 6.23607L4.61803 9H1V15H15V9Z"/></svg>',
        corHover: 'hover:border-blue-500',
        corIcone: 'text-blue-500 bg-blue-50 dark:bg-blue-900/30'
    },
    '#gerador': {
        id: '#gerador',
        titulo: 'Gerador de Mensagens',
        icone: '<svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor"><path d="M0 5.3585V14H16V5.35849L8 10.3585L0 5.3585Z" /><path d="M16 3V2H0V3L8 8L16 3Z" /></svg>',
        corHover: 'hover:border-indigo-500',
        corIcone: 'text-indigo-500 bg-indigo-50 dark:bg-indigo-900/30'
    },
    '#contratos': {
        id: '#contratos',
        titulo: 'Contratos Públicos',
        icone: '<svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor"><path d="M7 0H2V16H14V7H7V0Z" /><path d="M9 0V5H14L9 0Z" /></svg>',
        corHover: 'hover:border-emerald-500',
        corIcone: 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/30'
    },
    '#legislacao': {
        id: '#legislacao',
        titulo: 'Atos Normativos',
        icone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 212.858 212.858" fill="currentColor" class="w-5 h-5"><path d="M161.913,165.442h-41.357V37.333h52.499c-6.2,10.32-21.994,38.5-21.994,58.008 c0,15.853,12.685,28.75,28.26,28.75c15.581,0,28.26-12.897,28.26-28.75 c0-18.37-15.983-47.543-22.071-58.008h18.778V25.216h-83.731V0H92.308v25.216H8.582v12.117 h18.689c-6.203,10.32-21.994,38.5-21.994,58.008c0,15.853,12.678,28.75,28.259,28.75 c15.587,0,28.259-12.897,28.259-28.75c0-18.37-15.98-47.543-22.08-58.008h52.585v128.109H50.944v19.163H8.576v28.253h195.705 v-28.253h-42.368V165.442z M198.087,90.802h-37.533c1.938-15.416,12.749-35.831,18.713-46.092 C185.172,55.184,196.03,76.045,198.087,90.802z M52.301,90.802H14.768c1.941-15.416,12.752-35.843,18.716-46.092 C39.4,55.184,50.256,76.039,52.301,90.802z"/></svg>',
        corHover: 'hover:border-amber-500',
        corIcone: 'text-amber-500 bg-amber-50 dark:bg-amber-900/30'
    },
    '#qualificacao': {
        id: '#qualificacao',
        titulo: 'Qualificação Técnica',
        icone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path><path d="M9 12l2 2 4-4"></path></svg>',
        corHover: 'hover:border-cyan-500',
        corIcone: 'text-cyan-500 bg-cyan-50 dark:bg-cyan-900/30'
    },
    '#regmap': {
        id: '#regmap',
        titulo: 'RegMap',
        icone: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="w-5 h-5"><path d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7"/></svg>',
        corHover: 'hover:border-fuchsia-500',
        corIcone: 'text-fuchsia-500 bg-fuchsia-50 dark:bg-fuchsia-900/30'
    },
    '#demandas': {
        id: '#demandas',
        titulo: 'Gestão de Demandas',
        icone: '<svg class="w-5 h-5" viewBox="0 0 512 512" fill="currentColor" xmlns="http://www.w3.org/2000/svg"><g><path d="M277.785,370.582c46.892-8.902,83.894-45.906,92.797-92.797h27.422v-43.574h-27.422c-8.9-46.894-45.902-83.894-92.797-92.797v-27.422h-43.574v27.426c-46.89,8.898-83.894,45.902-92.795,92.793h-27.422v43.574h27.424c8.9,46.89,45.902,83.894,92.793,92.793v27.426h43.574V370.582z M234.211,296.934v43.859c-30.822-7.93-55.078-32.184-63.008-63.008h43.859v-43.574h-43.859c7.93-30.824,32.184-55.078,63.008-63.008v43.859h43.574v-43.859c30.824,7.93,55.08,32.184,63.01,63.008h-43.859v43.574h43.857c-7.93,30.824-32.185,55.078-63.008,63.008v-43.859H234.211z"/><path d="M487.344,234.211C476.988,123.426,388.57,35.008,277.785,24.656V0h-43.574v24.656C123.426,35.008,35.01,123.426,24.656,234.211H0v43.574h24.656C35.01,388.57,123.426,476.988,234.211,487.34V512h43.574v-24.66c110.785-10.352,199.203-98.77,209.558-209.555H512v-43.574H487.344z M234.211,421.219v19.668C148.924,430.898,81.1,363.074,71.109,277.785h19.67v-43.574h-19.67c9.99-85.289,77.815-153.113,163.102-163.102v19.668h43.574V71.109c85.289,9.988,153.113,77.813,163.104,163.102h-19.67v43.574h19.67c-9.99,85.289-77.814,153.113-163.104,163.102v-19.668H234.211z"/></g></svg>',
        corHover: 'hover:border-rose-500',
        corIcone: 'text-rose-500 bg-rose-50 dark:bg-rose-900/30'
    },
    '#conversor': {
        id: '#conversor',
        titulo: 'Conversor CSV',
        icone: '<svg class="w-5 h-5" viewBox="0 0 16 16" fill="currentColor"><path d="M10 8H9V4.8198L5.15728 4.05126C4.98683 4.01717 4.81343 4 4.63961 4C3.18179 4 2 5.18179 2 6.63961V9H0V6.63961C0 4.07722 2.07722 2 4.63961 2C4.94514 2 5.24992 2.03018 5.54951 2.0901L9 2.7802V0H10L14 4L10 8Z"/><path d="M16 7V9.36039C16 11.9228 13.9228 14 11.3604 14C11.0549 14 10.7501 13.9698 10.4505 13.9099L7 13.2198V16H6L2 12L6 8H7V11.1802L10.8427 11.9487C11.0132 11.9828 11.1866 12 11.3604 12C12.8182 12 14 10.8182 14 9.36039V7H16Z"/></svg>',
        corHover: 'hover:border-orange-500',
        corIcone: 'text-orange-500 bg-orange-50 dark:bg-orange-900/30'
    },
    '#usuarios': {
        id: '#usuarios',
        titulo: 'Gerenciar Usuários',
        icone: '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z"></path></svg>',
        corHover: 'hover:border-purple-500',
        corIcone: 'text-purple-500 bg-purple-50 dark:bg-purple-900/30'
    }
};

function renderDynamicMenu() {
    const menuContainer = document.getElementById('dynamic-nav-menu');
    if (!menuContainer) return;

    // Pega as permissões que foram salvas no login
    const role = sessionStorage.getItem("cockpit_user_role");
    let allowedApps = [];
    
    try {
        allowedApps = JSON.parse(sessionStorage.getItem("cockpit_allowed_apps") || '[]');
    } catch (e) { console.error("Erro ao ler apps permitidos"); }

    let html = '';

    Object.keys(APP_REGISTRY).forEach(appKey => {
        // Se for admin OU se o usuário tiver acesso
        if (role === 'admin' || allowedApps.includes(appKey)) {
            const app = APP_REGISTRY[appKey];
            
            // Desenha um botão estilo "App Icon", usando a propriedade title="" para exibir o nome ao passar o mouse
        html += `
            <div data-route="${app.id}" title="${app.titulo}"
                class="cursor-pointer group flex flex-col items-center gap-2 p-2 rounded-xl hover:bg-gray-50 dark:hover:bg-slate-700/50 transition-colors">

                <div class="${app.corIcone} w-14 h-14 rounded-2xl flex items-center justify-center shadow-sm border border-gray-100 dark:border-slate-700 group-hover:scale-105 group-hover:shadow-md transition-all duration-200">
                    ${app.icone}
                </div>

                <span class="text-[11px] font-medium text-gray-600 dark:text-gray-300 text-center leading-tight line-clamp-2">
                    ${app.titulo}
                </span>
            </div>
        `;
        }
    });

    menuContainer.innerHTML = html;

    // Reanexa os eventos de clique para navegação via parent
    document.querySelectorAll('#dynamic-nav-menu [data-route]').forEach(btn => {
        btn.addEventListener('click', () => {
            if (window.parent) window.parent.location.hash = btn.getAttribute('data-route');
            const overlay = document.getElementById('apps-overlay');
            if (overlay) overlay.classList.add('hidden'); // fecha ao escolher um app
        });
    });
}

// Chame isso logo após o DOMContentLoaded
document.addEventListener("DOMContentLoaded", () => {
    renderDynamicMenu();
});

document.addEventListener("DOMContentLoaded", () => {
    const btnOpenApps = document.getElementById("btn-open-apps");
    const btnCloseApps = document.getElementById("btn-close-apps");
    const appsOverlay = document.getElementById("apps-overlay");

    if (btnOpenApps && appsOverlay) {
        btnOpenApps.addEventListener("click", () => {
            appsOverlay.classList.remove("hidden");
        });
    }

    if (btnCloseApps && appsOverlay) {
        btnCloseApps.addEventListener("click", () => {
            appsOverlay.classList.add("hidden");
        });
    }

    if (appsOverlay) {
        // Fecha clicando fora do card
        appsOverlay.addEventListener("click", (e) => {
            if (e.target === appsOverlay) appsOverlay.classList.add("hidden");
        });
    }

    // Fecha com ESC
    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && appsOverlay) appsOverlay.classList.add("hidden");
    });
});


if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

let userNameFromParent = ""; // Variável global que guardará o apelido/nome
let lastIndex = -1;
let currentUserId = null;

// 1. Pede os dados ao Pai assim que o script carregar
if (window.parent) {
  window.parent.postMessage("GET_USER_DATA", "*");
}

// 2. Recepciona a resposta do Pai
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "USER_DATA_RESPONSE") {
    const { name, apelido, id } = event.data.payload;
    // Prioriza o apelido. Se não tiver, pega o primeiro nome.
    userNameFromParent = apelido || (name ? name.split(" ")[0] : "");
    currentUserId = id || null;
    
    // Fallback/Cache local
    if (userNameFromParent) {
      localStorage.setItem("cockpit_username", userNameFromParent);
    }
    if (id) {
      sessionStorage.setItem("cockpit_user_id", id); // cache
    }
    if (window.updateTime) {
        window.updateTime(); 
        fetchRadarData();
    }
  }
});

// --- LISTENERS DE TEMA (DARK MODE) ---
function applyTheme(theme) {
  if (theme === "dark") {
    document.documentElement.classList.add("dark");
  } else {
    document.documentElement.classList.remove("dark");
  }
}

// 1. Verifica localStorage ao carregar (Pega a preferência do pai)
const savedTheme = localStorage.getItem("cockpit_theme");
if (
  savedTheme === "dark" ||
  (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
) {
  applyTheme("dark");
}

// 2. Ouve o comando do pai em tempo real
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "THEME_CHANGE") {
    applyTheme(event.data.theme);
  }
});

/**
 * @name requestNotificationPermission
 * @description Pede permissão ao usuário para mostrar notificações no desktop.
 */
function requestNotificationPermission() {
  // Verifica se o navegador suporta a API e se a permissão ainda não foi concedida/negada.
  if (
    "Notification" in window &&
    Notification.permission !== "granted" &&
    Notification.permission !== "denied"
  ) {
    Notification.requestPermission();
  }
}

// --- CONFIGURAÇÃO DAS IMAGENS DE FUNDO ---
const BG_IMAGES = {
  manha: "img/manha.png",
  tarde: "img/tarde.png",
  noite: "img/noite.png",
};

/**
 * Atualiza o background dinâmico com base na hora e na flag em localStorage.
 * @param {number} hour - hora atual (0-23)
 */
function updateDynamicBackground(hour) {
  const bgEl = document.getElementById("dynamic-bg");
  if (!bgEl) return;

  const isBgEnabled = localStorage.getItem("cockpit_bg_enabled") === "true";
  if (!isBgEnabled) {
    bgEl.style.backgroundImage = "none";
    bgEl.classList.remove("opacity-20");
    bgEl.classList.add("opacity-0");
    return;
  }

  let bgImage = "";
  if (hour >= 5 && hour < 12) bgImage = BG_IMAGES.manha;
  else if (hour >= 12 && hour < 18) bgImage = BG_IMAGES.tarde;
  else bgImage = BG_IMAGES.noite;

  // aplica imagem e opacidade esmaecida
  bgEl.style.backgroundImage = `url('${bgImage}')`;
  bgEl.classList.remove("opacity-0");
  bgEl.classList.add("opacity-20");
}

document.addEventListener("DOMContentLoaded", () => {
  // --- 1. Lógica do Relógio ---
  const dateEl = document.getElementById("currentDate");
  const timeEl = document.getElementById("currentTime");
  const greetingEl = document.getElementById("greeting");

  
// Mostra o modal se a preferência "Não mostrar" não estiver marcada como true
const dontShow = localStorage.getItem("dontShowWelcomeCockpit");

  if (dontShow !== "true") {
      const modal = document.getElementById("welcomeModalCockpit");
      if (modal) {
          setTimeout(() => {
              modal.classList.remove("hidden");
          }, 300);
      }
  }

  // --- INÍCIO: Modal de Nome Personalizado (Tailwind) ---
  // 1. Tenta pegar apelido salvo OU nome do login (SessionStorage)
  let savedNick = localStorage.getItem("cockpit_username");
  let sessionName = sessionStorage.getItem("cockpit_user_realname");

  // Se não tiver apelido, usa o primeiro nome do cadastro
  let userName = savedNick || (sessionName ? sessionName.split(" ")[0] : "");

  // 1. Injeta o HTML do Modal no final do corpo da página
  const modalHTML = `
    <div id="nameModal" class="fixed inset-0 z-50 hidden flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm transition-opacity">
      <div class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl p-6 w-full max-w-sm transform transition-all scale-100">
        <h3 class="text-lg font-bold text-gray-800 dark:text-white mb-2">Como prefere ser chamado?</h3>
        <p class="text-sm text-gray-500 mb-4">Isso personalizará sua saudação diária.</p>
        
        <input type="text" id="nameInput" placeholder="Seu nome ou apelido" 
          class="w-full px-4 py-2 border border-gray-300 dark:border-slate-600 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 outline-none transition-all text-gray-700 dark:text-white bg-white dark:bg-slate-900 mb-4"
          autocomplete="off">
        
        <div class="flex justify-end gap-2">
          <button id="btnCancelName" class="px-4 py-2 text-sm text-gray-500 dark:text-white hover:bg-gray-100 dark:hover:bg-slate-700 rounded-lg transition-colors">Cancelar</button>
          <button id="btnSaveName" class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 dark:hover:bg-slate-700 text-white rounded-lg shadow-sm transition-colors font-medium">Salvar</button>
        </div>
      </div>
    </div>
  `;
  document.body.insertAdjacentHTML("beforeend", modalHTML);

  // 2. Referências aos elementos do Modal
  const modal = document.getElementById("nameModal");
  const input = document.getElementById("nameInput");
  const btnSave = document.getElementById("btnSaveName");
  const btnCancel = document.getElementById("btnCancelName");

  // 3. Funções de Controle
  function openNameModal() {
    input.value = localStorage.getItem("cockpit_username") || "";
    modal.classList.remove("hidden");
    setTimeout(() => input.focus(), 100); // Foca no campo automaticamente
  }

  function closeNameModal() {
    modal.classList.add("hidden");
  }

  window.closeNameModal = closeNameModal;

  window.saveName = function() { 
      const newName = input.value.trim();
      if (newName) {
        userName = newName; // Certifique-se de que userName está definido no escopo correto
        localStorage.setItem("cockpit_username", userName);
        window.updateTime(); 
        closeNameModal();
      }
    };

  // 4. Eventos
  btnSave.onclick = saveName;
  btnCancel.onclick = closeNameModal;

  // Salvar ao apertar ENTER
  input.addEventListener("keypress", (e) => {
    if (e.key === "Enter") saveName();
  });

  // Configura o clique na saudação para abrir o modal
  if (greetingEl) {
    greetingEl.style.cursor = "pointer";
    greetingEl.title = "Clique para alterar seu nome";
    greetingEl.onclick = openNameModal;
  }

  // Se não tiver nome salvo, abre o modal automaticamente ao iniciar
  if (!userName) {
    // Esconde o botão cancelar na primeira vez (obrigatório)
    btnCancel.style.display = "none";
    openNameModal();
  } else {
    btnCancel.style.display = "inline-block";
  }
  // --- FIM: Modal de Nome ---

  window.updateTime = function() {
    const now = new Date();
    const hour = now.getHours();

    // [PRESERVADO] Data por extenso
    const optionsDate = {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    };
    const dateStr = now.toLocaleDateString("pt-BR", optionsDate);

    // [PRESERVADO] Capitalizar primeira letra
    if (dateEl) {
      dateEl.textContent = dateStr.charAt(0).toUpperCase() + dateStr.slice(1);
    }

    // [PRESERVADO] Hora com segundos
    const timeStr = now.toLocaleTimeString("pt-BR", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    if (timeEl) {
      timeEl.textContent = timeStr;
    }

  if (greetingEl) {
    // Garante que o elemento tenha as classes necessárias para transição suave
    if (!greetingEl.classList.contains('transition-opacity')) {
      greetingEl.classList.add('transition-opacity', 'duration-500');
    }

    const activeName = userNameFromParent || localStorage.getItem("cockpit_username") || "pessoa";

    const frases = [
      `Olá, <span class="font-bold">${activeName}</span>! Como vamos hoje?`,
      `Bom dia, <span class="font-bold">${activeName}</span>. Pronto para o trabalho?`,
      `Tudo bem, <span class="font-bold">${activeName}</span>? O que faremos hoje?`,
      `Olá, <span class="font-bold">${activeName}</span>. Vamos começar?`
    ];

    // Alterna a frase a cada 10 segundos
    const index = Math.floor(now.getSeconds() / 10) % frases.length;

    // Só faz a transição se o índice da frase realmente mudou
    if (index !== lastIndex) {
      lastIndex = index;

      // 1. Inicia o Fade-out (esmaece para transparente)
      greetingEl.classList.add("opacity-0");

      // 2. Aguarda o término do fade-out (500ms) para alterar o texto e iniciar o Fade-in
      setTimeout(() => {
        greetingEl.innerHTML = frases[index];
        greetingEl.classList.remove("opacity-0"); // Fade-in suave
      }, 500); 
    }
  }

    // [PRESERVADO] Background dinâmico
    updateDynamicBackground(hour);
  }

  // Atualiza a cada segundo e roda imediatamente
  setInterval(window.updateTime, 1000);
  window.updateTime();

  // --- 2. Lógica de Navegação ---
  // Seleciona todos os elementos que tenham o atributo 'data-route'
  const navCards = document.querySelectorAll("[data-route]");

  navCards.forEach((card) => {
    card.addEventListener("click", () => {
      const hash = card.getAttribute("data-route");
      // Comunica com a janela pai (index.html principal)
      if (window.parent) {
        window.parent.location.hash = hash;
      }
    });
  });
 
});

window.closeWelcomeModalCockpit = function() {
    const modal = document.getElementById("welcomeModalCockpit");
    if (modal) {
        modal.classList.add("hidden");
        
        // Salva preferência de não mostrar novamente
        if (document.getElementById("dontShowCockpitAgain").checked) {
            localStorage.setItem("dontShowWelcomeCockpit", "true");
        }
    }
}

// ==========================================================
// MÓDULO DE ESTATÍSTICAS (DASHBOARD AO VIVO)
// ==========================================================

// 1. Configuração dos Cards (Ícones e Cores iguais aos cards de navegação)
const STATS_CONFIG = {
  dashboard: {
    titulo: "Operacional",
    cor: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800",
    hoverBorder: "hover:border-blue-400",
    icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"></path></svg>`,
  },
  gerador: {
    titulo: "Mensagens",
    cor: "text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-indigo-100 dark:border-indigo-800",
    hoverBorder: "hover:border-indigo-400",
    icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"></path></svg>`,
  },
  contratos: {
    titulo: "Contratos",
    cor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800",
    hoverBorder: "hover:border-emerald-400",
    icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>`,
  },
  familias: {
    titulo: "Qualificação",
    cor: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800",
    hoverBorder: "hover:border-amber-400",
    icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M12 3l7 4v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V7l7-4z" />
      <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2"
        d="M9 12l2 2 4-4" />
    </svg>`,
  },
  //conversor: {
  //  titulo: "Arquivos",
  //  cor: "text-amber-600 bg-amber-50 border-amber-100",
  //  icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>`,
  //},
};

// 2. Formatador de Moeda Compacto (ex: 1.5M)
function formatMoneyCompact(number) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(number);
}

// 3. Função Principal de Renderização
function renderStats() {
  const container = document.getElementById("stats-section");
  if (!container) return;

  const role = sessionStorage.getItem("cockpit_user_role");
  const userRealName = sessionStorage.getItem("cockpit_user_realname");

  let cardsData = [];

  if (role === 'admin') {
      // --- LÓGICA 100% ORIGINAL PARA ADMINS ---
      const stats = {
        contratos: JSON.parse(localStorage.getItem("stats_contratos") || "{}"),
        gerador: JSON.parse(localStorage.getItem("stats_gerador") || "{}"),
        dashboard: JSON.parse(localStorage.getItem("stats_dashboard") || "{}"),
        familias: JSON.parse(localStorage.getItem("stats_familias") || "{}"),
      };

      cardsData = [
        {
          ...STATS_CONFIG.dashboard,
          principal: (stats.dashboard.solicitacoes || 0).toLocaleString("pt-BR"),
          label: "Análises",
          sub: `${(stats.dashboard.indeferidas || 0).toLocaleString("pt-BR")} indeferidas`,
        },
        {
          ...STATS_CONFIG.gerador,
          principal: (stats.gerador.mensagens || 0).toLocaleString("pt-BR"),
          label: "Geradas",
          sub: `${stats.gerador.percentualDeferidas || 0}% deferidas`,
        },
        {
          ...STATS_CONFIG.contratos,
          principal: (stats.contratos.ativos || 0).toLocaleString("pt-BR"),
          label: "Ativos",
          subHtml: stats.contratos.vencendo > 0
              ? `<span class="text-red-600 font-bold text-xs flex items-center gap-1">
                 ⚠️ ${stats.contratos.vencendo} a vencer 
                 <span class="text-gray-400 font-medium ml-1 text-[10px]">• ${stats.contratos.qtdPagamentos || 0} pagamentos</span>
               </span>`
              : `<span class="text-gray-400 text-xs">
                 ${formatMoneyCompact(stats.contratos.valorTotal || 0)} 
                 <span class="mx-1 text-gray-300">•</span> 
                 ${stats.contratos.qtdPagamentos || 0} pagamentos
               </span>`,
        },
        {
          id: "stats-card-familias", 
          ...STATS_CONFIG.familias,
          principal: (stats.familias.total || 0).toLocaleString("pt-BR"),
          label: "Famílias",
          sub: `${stats.familias.cnaesUnicos || 0} CNAEs únicos • ${stats.familias.percentualComCnae || 0}% vinculadas`,
        }
      ];

  } else {
      // --- NOVA LÓGICA EXCLUSIVA PARA USUÁRIOS COMUNS ---
      const todasDemandas = JSON.parse(localStorage.getItem("cache_demandas_usuario") || "[]");
      const hoje = new Date();
      hoje.setHours(0, 0, 0, 0); 
      const mesAtual = hoje.getMonth();
      
      const minhasDemandas = todasDemandas.filter(d => d.responsavel_nome === userRealName);
      const pendentes = minhasDemandas.filter(d => d.status !== 'Concluído' && d.status !== 'Cancelado');
      
      const atrasadas = pendentes.filter(d => {
          if (!d.prazo_limite) return false;
          const prazo = new Date(d.prazo_limite + "T12:00:00Z");
          return prazo < hoje; 
      });

      const concluidasMes = minhasDemandas.filter(d => {
          if (d.status !== 'Concluído' || !d.data_conclusao) return false;
          const dataConc = new Date(d.data_conclusao + "T12:00:00Z");
          return dataConc.getMonth() === mesAtual && dataConc.getFullYear() === hoje.getFullYear();
      });

      const taxaConclusao = minhasDemandas.length > 0 
          ? Math.round((concluidasMes.length / minhasDemandas.length) * 100) 
          : 0;

      cardsData = [
        {
            titulo: "Pendentes",
            principal: pendentes.length,
            label: "Na fila",
            cor: "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/30 border-blue-100 dark:border-blue-800",
            hoverBorder: "hover:border-blue-400",
            icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 7v10a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-6l-2-2H5a2 2 0 00-2 2z"></path></svg>`,
            sub: "Atribuições atuais"
        },
        {
            titulo: "Atrasadas",
            principal: atrasadas.length,
            label: "Prioridade",
            cor: "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/30 border-red-100 dark:border-red-800",
            hoverBorder: "hover:border-red-400",
            icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
            sub: "Necessitam atenção"
        },
        {
            titulo: "Concluídas",
            principal: concluidasMes.length,
            label: "Este mês",
            cor: "text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border-emerald-100 dark:border-emerald-800",
            hoverBorder: "hover:border-emerald-400",
            icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>`,
            sub: "Entregas realizadas"
        },
        {
            titulo: "Performance",
            principal: taxaConclusao + "%",
            label: "Eficiência",
            cor: "text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border-amber-100 dark:border-amber-800",
            hoverBorder: "hover:border-amber-400",
            icone: `<svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6"></path></svg>`,
            sub: "Taxa global de conclusão"
        }
      ];
  }

  // --- CONSTRUÇÃO DO HTML (CÓDIGO ORIGINAL INTOCADO) ---
  let html = `<div class="grid grid-cols-1 md:grid-cols-4 gap-6">`;

  cardsData.forEach((card) => {
    const cursorClass = card.id ? "cursor-pointer" : "cursor-default";
    const hoverBorderClass = card.hoverBorder || "hover:border-gray-300";
    const idAttr = card.id ? `id="${card.id}"` : "";

    html += `
      <div ${idAttr} class="bg-white dark:bg-slate-800 dark:border-slate-700 p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-between hover:shadow-md transition-all duration-200 hover:scale-[1.10] hover:z-10 ${cursorClass} ${hoverBorderClass}">
        <div class="flex items-start justify-between mb-2">
           <div class="p-2 rounded-lg border ${card.cor}">
             ${card.icone}
           </div>
           <span class="text-[10px] uppercase font-bold text-gray-400 tracking-wider">${card.titulo}</span>
        </div>
        
        <div>
          <div class="flex items-baseline gap-1">
             <span class="text-2xl font-bold text-gray-800 dark:text-white">${card.principal}</span>
             <span class="text-xs text-gray-500 dark:text-gray-400 font-medium">${card.label}</span>
          </div>
          <div class="mt-1 text-xs text-gray-400 truncate">
             ${card.subHtml ? card.subHtml : card.sub}
          </div>
        </div>
      </div>
    `;
  });

  html += `</div>`;
  container.innerHTML = html;
}

// ==========================================================
// MÓDULO DE RADARES (Busca Direta no Supabase)
// ==========================================================

async function fetchRadarData() {
    const userId = currentUserId || sessionStorage.getItem("cockpit_user_id");
    const userRealName = sessionStorage.getItem("cockpit_user_realname");
    
    if (!userRealName) return;

    // Verifica permissões do usuário
    const role = sessionStorage.getItem("cockpit_user_role");
    let allowedApps = [];
    try {
        allowedApps = JSON.parse(sessionStorage.getItem("cockpit_allowed_apps") || '[]');
    } catch (e) {}
    
    const temAcessoContratos = role === 'admin' || allowedApps.includes('#contratos');

    // Referências do DOM
    const cardContratos = document.getElementById('card-radar-contratos');
    const cardAtribuidas = document.getElementById('card-radar-atribuidas');
    const tituloDemandas = document.getElementById('titulo-radar-demandas');
    
    const containerDemandas = document.getElementById('radar-demandas-list');
    const containerContratos = document.getElementById('radar-contratos-list');
    const containerAtribuidas = document.getElementById('radar-atribuidas-list');
    
    const badgeDemandas = document.getElementById('badge-demandas-home');
    const badgeContratos = document.getElementById('badge-contratos-home');
    const badgeAtribuidas = document.getElementById('badge-atribuidas-home');

    // Controle de Exibição dos Cards
    if (temAcessoContratos) {
        if (cardContratos) cardContratos.classList.remove('hidden');
        if (cardAtribuidas) cardAtribuidas.classList.add('hidden');
        if (tituloDemandas) tituloDemandas.innerHTML = '<span class="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6H5c-.553 0-1-.448-1-1s.447-1 1-1h3c.553 0 1 .448 1 1s-.447 1-1 1zM13 10H5c-.553 0-1-.448-1-1s.447-1 1-1h8c.553 0 1 .448 1 1s-.447 1-1 1zM13 14H5c-.553 0-1-.448-1-1s.447-1 1-1h8c.553 0 1 .448 1 1s-.447 1-1 1z"/><path d="M18 2v8c0 .55-.45 1-1 1s-1-.45-1-1V2.5c0-.28-.22-.5-.5-.5h-13c-.28 0-.5.22-.5.5v19c0 .28.22.5.5.5h13c.28 0 .5-.22.5-.5V21c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2C0 .9.9 0 2 0h14c1.1 0 2 .9 2 2z"/><path d="M23.87 11.882c.31.54.045 1.273-.595 1.643l-9.65 5.57c-.084.05-.176.086-.265.11l-2.656.66c-.37.092-.72-.035-.88-.314-.162-.278-.09-.65.17-.913l1.907-1.958c.063-.072.137-.123.214-.167.004-.01.012-.015.012-.015l9.65-5.57c.64-.37 1.408-.234 1.72.305l.374.65z"/></svg></span> Minhas Demandas e Equipe';
    } else {
        if (cardContratos) cardContratos.classList.add('hidden');
        if (cardAtribuidas) cardAtribuidas.classList.remove('hidden');
        if (tituloDemandas) tituloDemandas.innerHTML = '<span class="p-1.5 bg-blue-100 dark:bg-blue-900/30 text-blue-600 rounded-lg flex items-center justify-center"><svg xmlns="http://www.w3.org/2000/svg" class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 6H5c-.553 0-1-.448-1-1s.447-1 1-1h3c.553 0 1 .448 1 1s-.447 1-1 1zM13 10H5c-.553 0-1-.448-1-1s.447-1 1-1h8c.553 0 1 .448 1 1s-.447 1-1 1zM13 14H5c-.553 0-1-.448-1-1s.447-1 1-1h8c.553 0 1 .448 1 1s-.447 1-1 1z"/><path d="M18 2v8c0 .55-.45 1-1 1s-1-.45-1-1V2.5c0-.28-.22-.5-.5-.5h-13c-.28 0-.5.22-.5.5v19c0 .28.22.5.5.5h13c.28 0 .5-.22.5-.5V21c0-.55.45-1 1-1s1 .45 1 1v1c0 1.1-.9 2-2 2H2c-1.1 0-2-.9-2-2V2C0 .9.9 0 2 0h14c1.1 0 2 .9 2 2z"/><path d="M23.87 11.882c.31.54.045 1.273-.595 1.643l-9.65 5.57c-.084.05-.176.086-.265.11l-2.656.66c-.37.092-.72-.035-.88-.314-.162-.278-.09-.65.17-.913l1.907-1.958c.063-.072.137-.123.214-.167.004-.01.012-.015.012-.015l9.65-5.57c.64-.37 1.408-.234 1.72.305l.374.65z"/></svg></span> Minhas Demandas';
    }

// 1. BUSCA DE DEMANDAS (Comum para ambos os casos)
    try {
        // Retiramos os filtros .neq() e .not() do banco para trazer o bolo todo (necessário para as métricas)
        // Adicionado 'data_conclusao' no select
        const { data: demandasTotais, error } = await supabase
            .from('demandas')
            .select('id, titulo, prazo_limite, status, responsavel_nome, solicitante_nome, data_conclusao')
            .or(`responsavel_nome.eq."${userRealName}",solicitante_nome.eq."${userRealName}"`); 

        if (!error && demandasTotais) {
            // SALVA NO CACHE PARA O DASHBOARD PESSOAL LER
            localStorage.setItem("cache_demandas_usuario", JSON.stringify(demandasTotais));
            
            // Chama o renderStats para atualizar os cards imediatamente com os dados frescos
            renderStats();

            // Refazemos o filtro localmente apenas para popular os radares (ignorando concluídos e cancelados)
            const demandas = demandasTotais.filter(d => 
                d.status !== 'Concluído' && 
                d.status !== 'Cancelado' && 
                d.prazo_limite !== null
            );

            const hoje = new Date(); 
            hoje.setHours(0,0,0,0);
            
            // Função auxiliar de renderização HTML
            const renderHtmlDemanda = (d, mostrarComQuem) => {
                const isMinha = d.responsavel_nome === userRealName;
                const quemFaz = (!isMinha && mostrarComQuem) ? `<span class="block mt-1 text-[9px] font-bold text-slate-500 uppercase bg-white/50 px-1 py-0.5 rounded inline-block">👤 Com: ${d.responsavel_nome || 'Ninguém'}</span>` : '';
                const corBorda = d.diff < 0 ? 'border-red-500 bg-red-50' : (d.diff === 0 ? 'border-red-400 bg-red-50/50' : 'border-blue-500 bg-blue-50');
                const textoPrazo = d.diff < 0 ? `Atrasada há ${Math.abs(d.diff)} dias` : (d.diff === 0 ? 'Vence HOJE' : `Vence em ${d.diff} dias`);
                
                return `
                <div class="p-3 border-l-4 ${corBorda} rounded-r-lg mb-1">
                    <p class="font-bold text-[11px] text-gray-800 break-all">${d.titulo}</p>
                    <p class="text-[10px] text-gray-600 mt-1">${textoPrazo}</p>
                    ${quemFaz}
                </div>`;
            };

            // Calcula os dias (diff) e ordena
            const listaBase = demandas.map(d => {
                const prazo = new Date(d.prazo_limite + "T12:00:00Z");
                const diff = Math.ceil((prazo - hoje) / (1000 * 60 * 60 * 24));
                return { ...d, diff };
            }).filter(d => d.diff <= 7).sort((a, b) => a.diff - b.diff);

            
            // Popula as listas de acordo com a permissão
            if (temAcessoContratos) {
                // Modo 1: Usuário COM acesso a contratos (Mostra tudo no Card 1)
                badgeDemandas.textContent = listaBase.length;
                containerDemandas.innerHTML = listaBase.length > 0 
                    ? listaBase.map(d => renderHtmlDemanda(d, true)).join('')
                    : '<div class="flex flex-col items-center justify-center py-6 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-emerald-500 mb-2 opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10S2 17.514 2 12 6.486 2 12 2m0-2C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/><path d="M10.5 16.5c-.42 0-.82-.176-1.094-.484l-2.963-2.97c-.274-.26-.443-.653-.443-1.06 0-.405.17-.798.462-1.078.482-.513 1.557-.55 2.113.037l1.925 1.93 4.943-4.958c.52-.55 1.575-.57 2.132.02.256.242.425.634.425 1.04 0 .402-.164.79-.45 1.068l-5.993 6.012c-.238.267-.637.443-1.057.443z"/></svg><span class="text-sm font-medium">Tudo em dia!</span></div>'
            } else {
                // Modo 2: Usuário SEM acesso a contratos (Divide as demandas)
                const listaMinhas = listaBase.filter(d => d.responsavel_nome === userRealName);
                const listaAtribuidas = listaBase.filter(d => d.solicitante_nome === userRealName && d.responsavel_nome !== userRealName);

                
                // Card: Minhas
                badgeDemandas.textContent = listaMinhas.length;
                containerDemandas.innerHTML = listaMinhas.length > 0 
                    ? listaMinhas.map(d => renderHtmlDemanda(d, false)).join('')
                    : '<div class="flex flex-col items-center justify-center py-6 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-emerald-500 mb-2 opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10S2 17.514 2 12 6.486 2 12 2m0-2C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/><path d="M10.5 16.5c-.42 0-.82-.176-1.094-.484l-2.963-2.97c-.274-.26-.443-.653-.443-1.06 0-.405.17-.798.462-1.078.482-.513 1.557-.55 2.113.037l1.925 1.93 4.943-4.958c.52-.55 1.575-.57 2.132.02.256.242.425.634.425 1.04 0 .402-.164.79-.45 1.068l-5.993 6.012c-.238.267-.637.443-1.057.443z"/></svg><span class="text-sm font-medium">Tudo em dia!</span></div>'
                
                // Card: Atribuídas
                badgeAtribuidas.textContent = listaAtribuidas.length;
                containerAtribuidas.innerHTML = listaAtribuidas.length > 0 
                    ? listaAtribuidas.map(d => renderHtmlDemanda(d, true)).join('')
                    : '<div class="flex flex-col items-center justify-center py-6 text-gray-400"><svg xmlns="http://www.w3.org/2000/svg" class="w-8 h-8 text-emerald-500 mb-2 opacity-80" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2c5.514 0 10 4.486 10 10s-4.486 10-10 10S2 17.514 2 12 6.486 2 12 2m0-2C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0z"/><path d="M10.5 16.5c-.42 0-.82-.176-1.094-.484l-2.963-2.97c-.274-.26-.443-.653-.443-1.06 0-.405.17-.798.462-1.078.482-.513 1.557-.55 2.113.037l1.925 1.93 4.943-4.958c.52-.55 1.575-.57 2.132.02.256.242.425.634.425 1.04 0 .402-.164.79-.45 1.068l-5.993 6.012c-.238.267-.637.443-1.057.443z"/></svg><span class="text-sm font-medium">Tudo em dia!</span></div>';
            }
        }
    } catch (e) { console.error("Erro ao buscar demandas", e); }

    // 2. BUSCA DE CONTRATOS (Executa apenas se tiver acesso, poupando o banco de dados)
    if (temAcessoContratos) {
        try {
            const { data: contratos, error } = await supabase
                .from('contratos')
                .select('id, numeroContrato, dataFim')
                .not('dataFim', 'is', null)
                .is('parentId', null);

            if (!error && contratos) {
                const hoje = new Date();
                const vencendo = contratos.filter(c => {
                    const fim = new Date(c.dataFim + "T12:00:00Z");
                    const diff = Math.ceil((fim - hoje) / (1000 * 60 * 60 * 24));
                    return diff <= 90 && diff >= 0; 
                });

                badgeContratos.textContent = vencendo.length;
                containerContratos.innerHTML = vencendo.length > 0
                    ? vencendo.map(c => `
                        <div class="p-3 border-l-4 border-emerald-500 bg-emerald-50 rounded-r-lg">
                            <p class="font-bold text-xs text-gray-800">${c.numeroContrato}</p>
                            <p class="text-[10px] text-gray-600 mt-1">Vence em ${Math.ceil((new Date(c.dataFim) - hoje)/(1000*60*60*24))} dias</p>
                        </div>
                    `).join('')
                    : '<p class="text-center text-sm text-gray-400 py-4">Nenhum vencimento próximo.</p>';
            }
        } catch (e) { console.error("Erro ao buscar contratos", e); }
    }
}


//let userName = localStorage.getItem("cockpit_username") || "";

// 4. Inicialização e Atualização
document.addEventListener("DOMContentLoaded", () => {
  // Renderiza imediatamente
  renderStats();
  renderDynamicMenu();
    
    // ATIVAÇÃO DOS RADARES
  fetchRadarData(); 
  setInterval(fetchRadarData, 60000); // Atualiza os radares a cada 1 minuto

  // Força a coleta e atualização de dados reais com segurança
  setTimeout(() => {
    forceUpdateContratos();
    forceUpdateGerador();
    forceUpdateQualificacao();
  }, 300);

  // Atualiza a cada 5 segundos (para pegar mudanças salvas em outras abas/apps)
  setInterval(renderStats, 5000);

  // Escuta eventos de PostMessage (caso os apps mandem 'push' de atualização)
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "STATS_RESPONSE") {
      const appKey = `stats_${event.data.app}`;
      localStorage.setItem(appKey, JSON.stringify(event.data.data));
      renderStats();
    }
  });
});

// ==========================================================
// MÓDULO DE "ESPIONAGEM" (Atualização Direta sem abrir Apps)
// ==========================================================

// 1. Forçar Leitura de Contratos (LocalStorage -> Stats)
function forceUpdateContratos() {
  const rawData = localStorage.getItem("contratosDB");
  if (!rawData) return; // Se não tem banco, não faz nada

  try {
    const db = JSON.parse(rawData);
    const contratosPai = (db.contratos || []).filter((c) => !c.parentId);

    let totalValor = 0;
    let ativos = 0;
    let vencendo = 0;
    let qtdPagamentos = 0;

    contratosPai.forEach((c) => {
      // Lógica simplificada de status/vencimento
      const status = c.status || "Ativo";

      // Cálculo de dias restantes (Simplificado para a Home)
      let diasRestantes = 100;
      if (c.vigenciaFim) {
        const hoje = new Date();
        const fim = new Date(c.vigenciaFim);
        const diffTime = fim - hoje;
        diasRestantes = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      }

      // Conta pagamentos (Pai + Filhos)
      const familia = (db.contratos || []).filter(
        (item) => item.id === c.id || item.parentId === c.id,
      );
      familia.forEach((f) => {
        if (f.pagamentos) qtdPagamentos += f.pagamentos.length;
      });

      if (status !== "Vencido/Encerrado" && status !== "Encerrado") {
        totalValor += parseFloat(c.valorGlobal || 0);
        ativos++;
        if (diasRestantes < 90 && diasRestantes >= 0) vencendo++;
      }
    });

    const statsFrescos = {
      ativos,
      vencendo,
      valorTotal: totalValor,
      qtdPagamentos,
    };

    // Salva e atualiza a tela
    localStorage.setItem("stats_contratos", JSON.stringify(statsFrescos));
    renderStats(); // Chama a função que já existe para desenhar
    console.log("Stats de Contratos atualizados diretamente pela Home.");
  } catch (e) {
    console.error("Erro ao ler DB de Contratos na Home:", e);
  }
}

// 2. Forçar Leitura do Gerador (IndexedDB -> Stats)
function forceUpdateGerador() {
  const request = indexedDB.open("CafDatabase", 6); // Versão 6 (conforme seu script)

  request.onsuccess = function (event) {
    const db = event.target.result;
    if (!db.objectStoreNames.contains("history")) return;

    const transaction = db.transaction(["history"], "readonly");
    const store = transaction.objectStore("history");
    const countRequest = store.getAll();

    countRequest.onsuccess = function () {
      const all = countRequest.result || [];
      const total = all.length;

      // Conta deferidas
      const deferidas = all.filter((item) => {
        if (item.status) return item.status === "Deferida";
        return item.message && item.message.includes("*Deferida*");
      }).length;

      const statsFrescos = {
        mensagens: total,
        deferidas: deferidas,
        percentualDeferidas:
          total > 0 ? ((deferidas / total) * 100).toFixed(0) : 0,
      };

      localStorage.setItem("stats_gerador", JSON.stringify(statsFrescos));
      renderStats();
      console.log("Stats do Gerador atualizados diretamente pela Home.");
    };
  };
  // Silenciosamente ignora erros (se o banco não existir ainda)
  request.onerror = (e) => e.preventDefault();
}

// 3. Forçar Leitura da Qualificação
function forceUpdateQualificacao() {
  // Tenta ler o que foi salvo pelo Script 1
  const rawStats = localStorage.getItem("stats_familias");
  if (!rawStats) return;

  try {
    // Apenas força a renderização, pois o Script 1 já calculou e salvou o JSON pronto
    renderStats();
    console.log("Stats de Qualificação atualizados pela Home.");
  } catch (e) {
    console.error("Erro ao ler stats de famílias na Home:", e);
  }
}

// Atualize o listener de carregamento da Home para incluir a chamada:
document.addEventListener("DOMContentLoaded", () => {
  setTimeout(() => {
    forceUpdateContratos();
    forceUpdateGerador();
    forceUpdateQualificacao(); // <--- Adicione esta linha aqui
  }, 500);
});

// 4. Executar ao carregar a página
document.addEventListener("DOMContentLoaded", () => {
  // Tenta atualizar os dados reais assim que abre
  setTimeout(() => {
    forceUpdateContratos();
    forceUpdateGerador();
  }, 500); // Pequeno delay para não travar a animação de entrada
});

// ==========================================================
// MÓDULO DE REFLEXÃO
// ==========================================================

(function initStoicModule() {
  requestNotificationPermission();
  let updateIntervalId = null;
  const ELEMENTS = {
    container: document.getElementById("stoic-container"),
    text: document.getElementById("stoic-text"),
    author: document.getElementById("stoic-author"),
  };

  if (!ELEMENTS.container) return;

  const STORAGE_KEY = "cockpit_stoic_data";
  const UPDATE_INTERVAL_MS = 30 * 60 * 1000; // 30 min
  let allQuotesCache = []; // Cache em memória enriquecido

  // --- 1. Lógica de Renderização ---
  function renderQuote(quote, author) {
    ELEMENTS.container.classList.add("opacity-0");
    setTimeout(() => {
      ELEMENTS.text.textContent = `"${quote}"`;
      ELEMENTS.author.textContent = author || "Autor Desconhecido";
      ELEMENTS.container.classList.remove("opacity-0");
    }, 200);
  }

  // --- 2. Busca e Atualização Automática ---
  async function loadData() {
    if (allQuotesCache.length > 0) return;

    try {
      const response = await fetch("frases.json");
      const data = await response.json();

      // Achata o array, mas INJETA o nome da categoria em cada frase
      allQuotesCache = data.categorias.flatMap((cat) =>
        cat.frases.map((f) => ({
          ...f,
          categoria: cat.nome, // Importante para o filtro
        })),
      );
    } catch (error) {
      console.error("Erro ao carregar frases:", error);
    }
  }

  async function updateQuote(forceRandom = false) {
    const now = Date.now();
    const cachedData = JSON.parse(localStorage.getItem(STORAGE_KEY));

    if (!forceRandom && cachedData && now < cachedData.nextUpdate) {
      renderQuote(cachedData.quote, cachedData.author);
      return;
    }

    await loadData(); // Garante que temos dados
    if (allQuotesCache.length === 0) return;

    const randomItem =
      allQuotesCache[Math.floor(Math.random() * allQuotesCache.length)];
    saveAndRender(randomItem);
  }

  function notifyNewQuote(frase, autor) {
    if (Notification.permission === "granted") {
      new Notification(`📖 Reflexão do Dia`, {
        body: `"${frase}"\n— ${autor || "Desconhecido"}`,
        icon: "favicon-96x96.png",
        tag: "stoic-quote-update",
        silent: true,
      });
    }
  }

  // --- Timer automático de 30 minutos ---
  function startAutoUpdate() {
    // Se já existir um timer rodando, limpa ele primeiro
    if (updateIntervalId !== null) {
      clearInterval(updateIntervalId);
      updateIntervalId = null;
    }

    updateQuote(); // primeira execução imediata

    // Agenda a próxima atualização (30 minutos)
    updateIntervalId = setInterval(() => {
      updateQuote(true); // força nova citação a cada 30 min
    }, UPDATE_INTERVAL_MS);

    // === TESTE RÁPIDO ===
    //Gera uma nova citação + notificação em 5 segundos
    //setTimeout(() => {
    //  updateQuote(true);
    //}, 5000);
  }

  // --- Inicia tudo ---
  startAutoUpdate();

  function saveAndRender(item) {
    const payload = {
      quote: item.frase,
      author: item.autor,
      nextUpdate: Date.now() + UPDATE_INTERVAL_MS,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    renderQuote(payload.quote, payload.author);
    notifyNewQuote(payload.quote, payload.author);
  }

  // --- 3. Funcionalidade de "Easter Egg" (Lista com Filtros) ---

  function createModal() {
    // 1. IMPORTANTE: Defina a variável antes de usar no HTML
    const isBgEnabled =
      localStorage.getItem("cockpit_bg_enabled") === "true" ? "checked" : "";

    // HTML atualizado
    const modalHTML = `
      <div id="stoic-modal" class="hidden fixed inset-0 z-50 flex items-center justify-center bg-gray-900 bg-opacity-50 backdrop-blur-sm transition-opacity">
        <div class="bg-white dark:bg-slate-800 w-full max-w-3xl h-[85vh] rounded-xl shadow-2xl flex flex-col overflow-hidden m-4 animate-fade-in-down">
          
          <div class="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
            <h3 class="font-bold text-gray-700 dark:text-white flex items-center gap-2">
              <span>🏛️</span> Biblioteca de Sabedoria
            </h3>
            <button id="stoic-close-btn" class="text-gray-400 hover:text-red-500 text-2xl px-2">&times;</button>
          </div>

          <div class="p-4 border-b border-gray-100 bg-white dark:bg-slate-800 grid grid-cols-1 md:grid-cols-4 gap-3 items-center">
            
            <input type="text" id="stoic-search" placeholder="🔍 Buscar texto..." 
              class="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-blue-400 text-sm">
            
            <select id="stoic-filter-author" class="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-blue-400 text-sm bg-white dark:bg-slate-800">
              <option value="">Todas os Autores</option>
            </select>

            <select id="stoic-filter-category" class="w-full p-2 rounded-lg border border-gray-200 dark:border-slate-600 dark:bg-slate-900 dark:text-white focus:outline-none focus:border-blue-400 text-sm bg-white dark:bg-slate-800">
              <option value="">Todas as Categorias</option>
            </select>

            <div class="flex items-center justify-center md:justify-end gap-2 text-xs font-medium text-gray-600 dark:text-gray-200 bg-gray-50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700 p-2 rounded-lg border border-gray-100">
              <span>Wallpaper</span>
              <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" id="stoic-bg-toggle" class="sr-only peer" ${isBgEnabled}>
                <div class="w-9 h-5 bg-gray-200 peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white dark:bg-slate-800 after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-blue-600"></div>
              </label>
            </div>

          </div> <div id="stoic-list" class="flex-1 overflow-y-auto p-4 space-y-2 bg-gray-50/50 dark:bg-slate-800 border border-gray-100 dark:border-slate-700">
            </div>
          
          <div class="p-2 border-t border-gray-100 text-center text-xs text-gray-400 bg-white dark:bg-slate-800">
            <span id="stoic-count">0</span> frases encontradas
            <span id="stoic-timer-info" class="font-mono tracking-tight opacity-70 flex items-center gap-2 inline-flex ml-2" title="Ciclo de atualização automática">
               </span>
          </div>
        </div>
      </div>
    `;
    document.body.insertAdjacentHTML("beforeend", modalHTML);
  }

  async function openModal() {
    let modal = document.getElementById("stoic-modal");

    // SÓ ENTRA AQUI NA PRIMEIRA VEZ (Criação)
    if (!modal) {
      createModal();
      modal = document.getElementById("stoic-modal");

      // Event Listeners (Fechar)
      document.getElementById("stoic-close-btn").onclick = () =>
        modal.classList.add("hidden");

      // Eventos de Input para filtrar
      const inputs = [
        "stoic-search",
        "stoic-filter-author",
        "stoic-filter-category",
      ];
      inputs.forEach((id) => {
        document.getElementById(id).addEventListener("input", applyFilters);
      });

      // --- CORREÇÃO: O LISTENER DO WALLPAPER FICA AQUI DENTRO ---
      const bgToggle = document.getElementById("stoic-bg-toggle");
      if (bgToggle) {
        bgToggle.addEventListener("change", (e) => {
          localStorage.setItem("cockpit_bg_enabled", e.target.checked);
          location.reload();
        });
      }
    }

    // AQUI PARA BAIXO É O QUE RODA TODA VEZ QUE ABRE
    await populateList();

    // --- LÓGICA DO TIMER I ---
    const storedData = JSON.parse(localStorage.getItem(STORAGE_KEY));
    const timerEl = document.getElementById("stoic-timer-info");

    if (storedData && storedData.nextUpdate && timerEl) {
      const nextTime = new Date(storedData.nextUpdate);
      const lastTime = new Date(storedData.nextUpdate - UPDATE_INTERVAL_MS);
      const fmt = (date) =>
        date.toLocaleTimeString("pt-BR", {
          hour: "2-digit",
          minute: "2-digit",
        });

      timerEl.innerHTML = `
              <span class="flex items-center gap-1">↻ ${fmt(lastTime)}</span>
              <span class="text-gray-300">|</span>
              <span class="flex items-center gap-1">⌛ Próx: ${fmt(nextTime)}</span>
          `;
    } else if (timerEl) {
      timerEl.textContent = "Sincronizando...";
    }

    modal.classList.remove("hidden");
    setTimeout(() => document.getElementById("stoic-search").focus(), 100);
  }

  async function populateList() {
    await loadData();

    const listContainer = document.getElementById("stoic-list");
    const authorSelect = document.getElementById("stoic-filter-author");
    const categorySelect = document.getElementById("stoic-filter-category");

    listContainer.innerHTML = "";

    // 1. Extrair Autores e Categorias Únicos para os Selects
    const uniqueAuthors = [
      ...new Set(allQuotesCache.map((i) => i.autor || "Desconhecido")),
    ].sort();
    const uniqueCategories = [
      ...new Set(allQuotesCache.map((i) => i.categoria)),
    ].sort();

    // 2. Preencher Selects (apenas se estiverem vazios para não resetar seleção se reabrir)
    if (authorSelect.options.length <= 1) {
      uniqueAuthors.forEach((autor) => {
        const opt = document.createElement("option");
        opt.value = autor;
        opt.textContent = autor;
        authorSelect.appendChild(opt);
      });
    }

    if (categorySelect.options.length <= 1) {
      uniqueCategories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = cat;
        categorySelect.appendChild(opt);
      });
    }

    // 3. Renderizar Lista
    allQuotesCache.forEach((item) => {
      const div = document.createElement("div");
      // Adiciona data-attributes para facilitar a filtragem
      div.setAttribute(
        "data-autor",
        (item.autor || "Desconhecido").toLowerCase(),
      );
      div.setAttribute("data-categoria", (item.categoria || "").toLowerCase());
      div.setAttribute("data-texto", item.frase.toLowerCase());

      div.className =
        "stoic-item bg-white dark:bg-slate-800 p-4 rounded-lg border border-gray-100 hover:border-blue-300 hover:shadow-md cursor-pointer transition-all group relative overflow-hidden";

      div.innerHTML = `
        <div class="absolute top-0 left-0 w-1 h-full bg-gray-200 dark:bg-slate-700 group-hover:bg-blue-500 dark:hover:bg-slate-700 transition-colors"></div>
        <div class="pl-2">
            <span class="text-[10px] inline-block px-2 py-0.5 rounded-full bg-gray-100 dark:bg-slate-700 text-gray-500 dark:text-gray-300 mb-2 font-bold uppercase tracking-wider group-hover:bg-blue-50 dark:group-hover:bg-blue-900/40 group-hover:text-blue-600 dark:group-hover:text-blue-300 transition-colors">
                ${item.categoria}
            </span>
            <p class="text-gray-700 dark:text-gray-200 font-serif text-lg leading-relaxed group-hover:text-gray-900 dark:group-hover:text-white transition-colors">"${item.frase}"</p>
            <span class="text-xs text-blue-600 dark:text-blue-400 font-bold uppercase mt-2 block tracking-widest flex items-center gap-1">
                — ${item.autor || "Desconhecido"}
            </span>
        </div>
      `;

      div.onclick = () => {
        saveAndRender(item);
        document.getElementById("stoic-modal").classList.add("hidden");
      };

      listContainer.appendChild(div);
    });

    // Atualiza contador inicial
    document.getElementById("stoic-count").textContent = allQuotesCache.length;
  }

  function applyFilters() {
    const textTerm = document
      .getElementById("stoic-search")
      .value.toLowerCase();
    const authorTerm = document
      .getElementById("stoic-filter-author")
      .value.toLowerCase();
    const categoryTerm = document
      .getElementById("stoic-filter-category")
      .value.toLowerCase();

    const items = document.querySelectorAll(".stoic-item");
    let visibleCount = 0;

    items.forEach((item) => {
      const itemText = item.getAttribute("data-texto");
      const itemAutor = item.getAttribute("data-autor");
      const itemCat = item.getAttribute("data-categoria");

      // Verifica as 3 condições
      const matchText = itemText.includes(textTerm);
      const matchAuthor = authorTerm === "" || itemAutor === authorTerm;
      const matchCategory = categoryTerm === "" || itemCat === categoryTerm;

      if (matchText && matchAuthor && matchCategory) {
        item.style.display = "block";
        visibleCount++;
      } else {
        item.style.display = "none";
      }
    });

    document.getElementById("stoic-count").textContent = visibleCount;
  }

  // --- 4. Detector de 3 Cliques ---
  let clickCount = 0;
  let clickTimer;

  ELEMENTS.container.addEventListener("click", () => {
    clickCount++;
    clearTimeout(clickTimer);
    if (clickCount === 3) {
      openModal();
      clickCount = 0;
    } else {
      clickTimer = setTimeout(() => {
        clickCount = 0;
      }, 500);
    }
  });

  ELEMENTS.container.style.cursor = "help";
  updateQuote();
})();
