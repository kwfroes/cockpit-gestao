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
});
