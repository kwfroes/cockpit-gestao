/**
 * apps/home/script.js
 */

if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("./sw.js");
}

let userNameFromParent = ""; // Variável global que guardará o apelido/nome
let lastIndex = -1;

// 1. Pede os dados ao Pai assim que o script carregar
if (window.parent) {
  window.parent.postMessage("GET_USER_DATA", "*");
}

// 2. Recepciona a resposta do Pai
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "USER_DATA_RESPONSE") {
    const { name, apelido } = event.data.payload;
    // Prioriza o apelido. Se não tiver, pega o primeiro nome.
    userNameFromParent = apelido || (name ? name.split(" ")[0] : "");
    
    // Fallback/Cache local
    if (userNameFromParent) {
      localStorage.setItem("cockpit_username", userNameFromParent);
    }
    updateTime(); // Força atualização visual imediata ao receber
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

  function saveName() {
    const newName = input.value.trim();
    if (newName) {
      userName = newName;
      localStorage.setItem("cockpit_username", userName);
      updateTime(); // Atualiza a saudação na hora
      closeNameModal();
    }
  }

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

  function updateTime() {
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
    const activeName = userNameFromParent || localStorage.getItem("cockpit_username") || "pessoa";

    const frases = [
      `Olá, <span class="font-bold">${activeName}</span>! Como vamos hoje?`,
      `Bom dia, <span class="font-bold">${activeName}</span>. Pronto para o trabalho?`,
      `Tudo bem, <span class="font-bold">${activeName}</span>? O que faremos hoje?`,
      `Olá, <span class="font-bold">${activeName}</span>. Vamos começar?`
    ];

    // Alterna a frase a cada 8 segundos
    const index = Math.floor(now.getSeconds() / 10) % frases.length;

    // Só faz a transição se o índice da frase realmente mudou
    if (index !== lastIndex) {
      lastIndex = index;

      // 1. Inicia o Fade-out (esconde a frase antiga)
      greetingEl.classList.add("opacity-0");

      // 2. Aguarda o tempo do fade-out (300ms) para trocar o texto e iniciar o Fade-in
      setTimeout(() => {
        greetingEl.innerHTML = frases[index];
        greetingEl.classList.remove("opacity-0"); // Fade-in (revela a nova frase)
      }, 300); 
    }
  }

    // [PRESERVADO] Background dinâmico
    updateDynamicBackground(hour);
  }

  // Atualiza a cada segundo e roda imediatamente
  setInterval(updateTime, 1000);
  updateTime();

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

function closeWelcomeModalCockpit() {
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

  // Tenta ler do LocalStorage (Fallback / Cache)
  // Se não existir, assume objeto vazio para não quebrar
  const stats = {
    contratos: JSON.parse(localStorage.getItem("stats_contratos") || "{}"),
    gerador: JSON.parse(localStorage.getItem("stats_gerador") || "{}"),
    dashboard: JSON.parse(localStorage.getItem("stats_dashboard") || "{}"),
    familias: JSON.parse(localStorage.getItem("stats_familias") || "{}"),
    //conversor: JSON.parse(localStorage.getItem("stats_conversor") || "{}"),
  };

  // Definição dos Dados dos Cards
  const cardsData = [
    {
      ...STATS_CONFIG.dashboard,
      principal: (stats.dashboard.solicitacoes || 0).toLocaleString("pt-BR"),
      label: "Análises",
      sub: `${(stats.dashboard.indeferidas || 0).toLocaleString(
        "pt-BR",
      )} indeferidas`,
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
      // Lógica especial: Se houver contratos a vencer, destaca em vermelho
      subHtml:
        stats.contratos.vencendo > 0
          ? `<span class="text-red-600 font-bold text-xs flex items-center gap-1">
             ⚠️ ${stats.contratos.vencendo} a vencer 
             <span class="text-gray-400 font-medium ml-1 text-[10px]">• ${
               stats.contratos.qtdPagamentos || 0
             } pagamentos</span>
           </span>`
          : `<span class="text-gray-400 text-xs">
             ${formatMoneyCompact(stats.contratos.valorTotal || 0)} 
             <span class="mx-1 text-gray-300">•</span> 
             ${stats.contratos.qtdPagamentos || 0} pagamentos
           </span>`,
    },
    {
      id: "stats-card-familias", // ID para o clique
      ...STATS_CONFIG.familias,
      principal: (stats.familias.total || 0).toLocaleString("pt-BR"),
      label: "Famílias",
      sub: `${stats.familias.cnaesUnicos || 0} CNAEs únicos • ${stats.familias.percentualComCnae || 0}% vinculadas`,    },
    //{
    //  ...STATS_CONFIG.conversor,
    //  principal: stats.conversor.merges || 0,
    //  label: "Processados",
    //  sub: "CSVs integrados",
    //},
  ];

  // Construção do HTML
  let html = `<div class="grid grid-cols-1 md:grid-cols-4 gap-6">`;

  cardsData.forEach((card) => {
    // 1. Define o cursor (apenas Famílias é clicável)
    const cursorClass = card.id ? "cursor-pointer" : "cursor-default";

    // 2. Define a borda hover (agora todos têm a sua cor específica)
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

// 4. Inicialização e Atualização
document.addEventListener("DOMContentLoaded", () => {
  // Renderiza imediatamente
  renderStats();

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
