/**
 * main.js
 * Lógica principal do Cockpit Gestão
 */

document.addEventListener("DOMContentLoaded", () => {
  // --- Referências ao DOM ---
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const frame = document.getElementById("appFrame");
  const mainContent = document.getElementById("mainContent");
  const floatingLinks = document.getElementById("floatingLinks");
  // Seleciona links internos da sidebar (ignora target="_blank")
  const links = document.querySelectorAll('aside a:not([target="_blank"])');

  // Atualiza automaticamente o ano em todos os lugares
  const currentYear = new Date().getFullYear();

  // Título da página
  document.title = `Cockpit Gestão - ${currentYear}`;

  // Ano no header (ao lado do nome)
  const yearHeaderElement = document.querySelector('#currentYearHeader');
  if (yearHeaderElement) {
    yearHeaderElement.textContent = currentYear;
  }

  // Referência ao botão
  const menuButton = document.getElementById("menuButton");

  // --- Configuração de Rotas ---
  const routes = {
    "#home": "apps/home/index.html",
    "#dashboard": "apps/dashboard/index.html",
    "#gerador": "apps/gerador/index.html",
    "#contratos": "apps/contratos/index.html",
    "#conversor": "apps/conversor/index.html",
  };
  

  const defaultHash = "#home";

  // --- Lógica de Responsividade (Sidebar) ---

  window.toggleSidebar = function () {
    const isMobile = window.innerWidth < 768; // Breakpoint 'md' do Tailwind

    // Gira o botão 90 graus
    // Se estiver horizontal, fica vertical. Se vertical, fica horizontal.
    if (menuButton) {
      menuButton.classList.toggle("rotate-90");
    }

    if (isMobile) {
      // Lógica Mobile (Com Overlay)
      const isClosed = sidebar.classList.contains("-translate-x-full");

      if (isClosed) {
        // Abrir
        sidebar.classList.remove("-translate-x-full");
        overlay.classList.remove("hidden");
        setTimeout(() => overlay.classList.remove("opacity-0"), 10);
      } else {
        // Fechar
        sidebar.classList.add("-translate-x-full");
        overlay.classList.add("opacity-0");
        setTimeout(() => overlay.classList.add("hidden"), 300);
      }
    } else {
      // Lógica Desktop (Sem Overlay, empurrando layout)

      // 1. Toggle na Sidebar:
      // A classe 'md:translate-x-0' força a sidebar a aparecer no desktop.
      // Ao removê-la, a sidebar volta para o estado padrão '-translate-x-full' (escondida).
      sidebar.classList.toggle("md:translate-x-0");

      // 2. Toggle no Main Content:
      // A classe 'md:ml-64' dá a margem esquerda.
      // Ao removê-la, o conteúdo estica para ocupar a tela toda.
      mainContent.classList.toggle("md:ml-64");
    }
  };

  // Função auxiliar para fechar sidebar no mobile ao clicar em link
  function closeSidebarOnMobile() {
    if (window.innerWidth < 768) {
      // Apenas se estiver aberta (sem a classe de fechado)
      if (!sidebar.classList.contains("-translate-x-full")) {
        window.toggleSidebar();
      }
    }
  }

  // --- Lógica de Roteamento ---

  function updateActiveLink(hash) {
    links.forEach((link) => {
      // Reseta estilos
      link.classList.remove("active-link");
      link.classList.add("text-gray-400");

      // Aplica estilo ativo se corresponder ao hash
      if (link.getAttribute("href") === hash) {
        link.classList.add("active-link");
        link.classList.remove("text-gray-400");
      }
    });
  }

  function navigate(hash) {
    // Fallback para a rota padrão se o hash não existir
    const route = routes[hash] || routes[defaultHash];

    // Atualiza o iframe e os links
    frame.src = route;
    updateActiveLink(hash);

    // 3. Lógica Automática da Sidebar (DENTRO da função navigate)
    // Se estivermos no Desktop (largura >= 768px), ajustamos o layout conforme a página
    if (window.innerWidth >= 768) {
      if (hash === "#home") {
        // --- MODO HOME: Tela Cheia (Esconde Sidebar) ---

        // Remove a classe que força a sidebar a aparecer
        sidebar.classList.remove("md:translate-x-0");

        // Remove a margem do conteúdo (ocupa 100%)
        mainContent.classList.remove("md:ml-64");

        // Gira o botão para indicar menu fechado
        if (menuButton) menuButton.classList.remove("rotate-90");
        if (floatingLinks) floatingLinks.style.display = "none";
      } else {
        // --- MODO APPS: Com Menu (Mostra Sidebar) ---

        // Adiciona a classe que mostra a sidebar
        sidebar.classList.add("md:translate-x-0");

        // Adiciona a margem para o conteúdo não ficar por baixo
        mainContent.classList.add("md:ml-64");

        // Reseta a rotação do botão
        if (menuButton) menuButton.classList.add("rotate-90");
        if (floatingLinks) floatingLinks.style.display = "";
      }
    }
  }

  // --- Event Listeners ---

  // 1. Cliques nos links da navegação
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const hash = link.getAttribute("href");

      // Atualiza URL sem recarregar
      history.pushState(null, null, hash);

      // Navega
      navigate(hash);

      // Fecha sidebar se estiver no mobile
      closeSidebarOnMobile();
    });
  });

  // 2. Botão de voltar/avançar do navegador
  window.addEventListener("popstate", () => {
    const hash = window.location.hash || defaultHash;
    navigate(hash);
  });

  // 3. Carregamento inicial da página
  const initialHash = window.location.hash || defaultHash;
  navigate(initialHash);

// === PREVISÃO DO TEMPO REAL COM OPEN-METEO + Alternância ===
  const infoText = document.getElementById('infoText');
  // const currentYear = new Date().getFullYear(); // Já declarado no início do seu arquivo

  // Verifica se o elemento existe
  if (!infoText) {
    console.warn('Elemento #infoText não encontrado no header!');
  }

  // Variáveis de Estado
  let weatherText = 'Salvador: Carregando...';
  let weatherIcon = 'sunny';
  let detailsText = 'Carregando detalhes...'; // Novo texto para o 3º slide

  // Agora temos 3 itens no array
  const infoItems = [
    `Kevin Fróes • ${currentYear}`, // Índice 0
    weatherText,                    // Índice 1 (Clima Geral)
    detailsText                     // Índice 2 (UV e Vento)
  ];

  let currentIndex = 0;

  function getWeatherDescription(temp, precipProb) {
    if (precipProb > 50) return { text: "Chuva", icon: "rainy" };
    if (precipProb > 20) return { text: "Possibilidade de chuva", icon: "cloudy" };
    if (temp >= 30) return { text: "Céu limpo", icon: "sunny" };
    if (temp >= 27) return { text: "Parcialmente nublado", icon: "partly_sunny" };
    return { text: "Nublado", icon: "cloud" };
  }

  function getUVDescription(uv) {
    if (uv >= 11) return "Extremo";
    if (uv >= 8) return "Mto Alto";
    if (uv >= 6) return "Alto";
    if (uv >= 3) return "Moderado";
    return "Baixo";
  }

  async function updateWeather() {
    try {
      // URL ATUALIZADA: Incluindo uv_index e wind_speed_10m
      const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=-12.9756&longitude=-38.491&hourly=temperature_2m,precipitation_probability,uv_index,wind_speed_10m&timezone=America%2FSao_Paulo&forecast_days=1"
      );
      const data = await response.json();

      const now = new Date();
      const currentHour = now.getHours();
      // Encontra a hora atual
      const hourIndex = data.hourly.time.findIndex(t => t.includes(`T${String(currentHour).padStart(2, '0')}:00`));

      if (hourIndex === -1) throw new Error("Hora não encontrada");

      // 1. Captura Dados
      const temp = Math.round(data.hourly.temperature_2m[hourIndex]);
      const precipProb = data.hourly.precipitation_probability[hourIndex];
      const uv = data.hourly.uv_index[hourIndex];
      const wind = Math.round(data.hourly.wind_speed_10m[hourIndex]);

      // 2. Atualiza Texto do Clima (Item 1)
      const condition = getWeatherDescription(temp, precipProb);
      weatherText = `Salvador: ${temp}°C • ${condition.text}`;
      weatherIcon = condition.icon;
      infoItems[1] = weatherText;

      // 3. Atualiza Texto de Detalhes (Item 2 - NOVO)
      // Usaremos emojis diretos para UV e Vento para economizar espaço
      const uvDesc = getUVDescription(uv);
      // Ex: "☀️ UV 9 (Alto) • 💨 15km/h"
      detailsText = `☀️ UV ${Math.round(uv)} (${uvDesc}) • 💨 ${wind}km/h`;
      infoItems[2] = detailsText;

      // Se o elemento existir, renderiza para garantir dados frescos
      if (infoText) renderInfo();

    } catch (error) {
      console.warn("Erro ao carregar previsão:", error);
      // Fallback
      weatherText = "Salvador: --°C";
      detailsText = "Sem conexão";
      infoItems[1] = weatherText;
      infoItems[2] = detailsText;
    }
  }

function renderInfo() {
    if (!infoText) return;

    // Fade Out
    infoText.classList.remove('opacity-100');
    infoText.classList.add('opacity-0');

    setTimeout(() => {
      // Lógica de Renderização por Índice
      if (currentIndex === 0) {
        // === 1. NOME ===
        infoText.innerHTML = `Kevin Fróes • ${currentYear}`;
      
      } else if (currentIndex === 1) {
        // === 2. CLIMA GERAL (Correção: Usando Emojis para não quebrar) ===
        const icons = {
          sunny: "☀️",
          partly_sunny: "⛅",
          cloudy: "☁️",
          rain: "🌧️",
          rainy: "🌧️",
          fog: "🌫️",
          snow: "❄️"
        };
        // Pega o emoji ou usa um termômetro genérico se falhar
        const iconSymbol = icons[weatherIcon] || "🌡️";
        
        infoText.innerHTML = `${iconSymbol} ${infoItems[1]//.replace('Salvador:', 'SSA:')// 
          }`;
        // Dica: 'SSA:' economiza espaço no mobile

      } else {
        // === 3. DETALHES (UV + Vento) ===
        // O texto já vem formatado com emojis da função updateWeather
        infoText.innerHTML = infoItems[2];
      }

      // Fade In
      infoText.classList.remove('opacity-0');
      infoText.classList.add('opacity-100');

      // Avança para o próximo (0 -> 1 -> 2 -> 0)
      currentIndex = (currentIndex + 1) % infoItems.length;
    }, 500);
  }

  // Inicialização
  updateWeather(); 
  setInterval(updateWeather, 30 * 60 * 1000); // Dados a cada 30 min

  setTimeout(() => {
    renderInfo(); 
    setInterval(renderInfo, 8000); // Alterna a cada 8 seg
  }, 1000);
});
