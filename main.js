/**
 * main.js
 * Versão Final: DB Criptografado + Sem Loop Infinito
 */

document.addEventListener("DOMContentLoaded", () => {


  
let currentCaptcha = "";
let isGenerating = false; // Trava para evitar cliques múltiplos seguidos

async function generateCaptcha() {
    if (isGenerating) return;
    isGenerating = true;

    const canvas = document.getElementById('captchaCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    // 1. Efeito visual de "Carregando"
    ctx.fillStyle = "#f3f4f6";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.font = "12px Inter";
    ctx.fillStyle = "#94a3b8";
    ctx.textAlign = "center";
    ctx.fillText("Gerando...", canvas.width / 2, canvas.height / 2 + 5);

    // 2. Delay Aleatório (1 a 3 segundos)
    const delay = Math.floor(Math.random() * (3000 - 1000 + 1)) + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));

    // 3. Lógica de Geração do Código
    const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    currentCaptcha = "";
    for (let i = 0; i < 5; i++) {
        currentCaptcha += chars.charAt(Math.floor(Math.random() * chars.length));
    }

    // 4. Limpar e desenhar fundo final
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    // 5. RUÍDO PESADO (Antes do texto)
    // Linhas aleatórias coloridas
    for (let i = 0; i < 15; i++) {
        ctx.strokeStyle = `rgba(${Math.random() * 150}, ${Math.random() * 150}, ${Math.random() * 150}, ${0.2 + Math.random() * 0.3})`;
        ctx.lineWidth = 0.5 + Math.random() * 1.5;
        ctx.beginPath();
        ctx.moveTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.lineTo(Math.random() * canvas.width, Math.random() * canvas.height);
        ctx.stroke();
    }

    // Pontos de interferência (Granulação)
    for (let i = 0; i < 60; i++) {
        ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.2})`;
        ctx.beginPath();
        ctx.arc(Math.random() * canvas.width, Math.random() * canvas.height, 0.8, 0, Math.PI * 2);
        ctx.fill();
    }

    // 6. Desenhar Texto
    ctx.font = "bold 24px 'Inter', sans-serif";
    ctx.textAlign = "start"; // Reseta o alinhamento
    
    for (let i = 0; i < currentCaptcha.length; i++) {
        const x = 15 + (i * 20);
        const y = 25 + (Math.random() * 6 - 3);
        ctx.save();
        ctx.translate(x, y);
        ctx.rotate((Math.random() * 24 - 12) * Math.PI / 180); // Rotação mais agressiva
        ctx.fillStyle = `rgb(${Math.random() * 50}, ${Math.random() * 50}, ${100 + Math.random() * 100})`; // Tons de azul/escuro variados
        ctx.fillText(currentCaptcha[i], 0, 0);
        ctx.restore();
    }

    // 7. Ruído Final (Uma linha que cruza o texto)
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo(0, Math.random() * canvas.height);
    ctx.bezierCurveTo(
        canvas.width / 3, Math.random() * canvas.height,
        (2 * canvas.width) / 3, Math.random() * canvas.height,
        canvas.width, Math.random() * canvas.height
    );
    ctx.stroke();

    isGenerating = false;
}
  window.generateCaptcha = generateCaptcha; // Expõe para o clique no ícone


  // =========================================================
  // 1. MÓDULO DE SEGURANÇA (SINGLE ENCRYPTED DB)
  // =========================================================
  const loginOverlay = document.getElementById("loginOverlay");
  const loginForm = document.getElementById("loginForm");
  const userInput = document.getElementById("userInput");
  const passwordInput = document.getElementById("passwordInput");
  const loginError = document.getElementById("loginError");
  const frame = document.getElementById("appFrame"); // Referência ao iframe
  const APP_MASTER_KEY = "B{G@k5A[m:IZB]0M!+nWK8Gy<oHdeS";
  const REQUEST_KEY = "admin0000";

  // --- Funções de Criptografia ---
  async function sha256(message) {
    const msgBuffer = new TextEncoder().encode(message);
    const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
  }

  // ... fim da função sha256 ...

  // NOVA FUNÇÃO: Criptografia Leve para o JSON de Solicitação
  async function encryptLight(text) {
    const enc = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      enc.encode(REQUEST_KEY),
      "PBKDF2",
      false,
      ["deriveKey"],
    );
    const fixedSalt = enc.encode("static_salt_requests"); // Salt fixo para o Admin conseguir abrir

    const key = await crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: fixedSalt, iterations: 1000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      false,
      ["encrypt"],
    );

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encrypted = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      enc.encode(text),
    );

    // Converte para Hex para salvar no JSON limpo
    const ivHex = Array.from(iv)
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const cipherHex = Array.from(new Uint8Array(encrypted))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");

    return { iv: ivHex, content: cipherHex };
  }

  async function loadDatabase() {
    try {
      const response = await fetch("database.lock");
      if (!response.ok) throw new Error("Banco de dados não encontrado");

      const fileBuffer = await response.arrayBuffer();
      const data = new Uint8Array(fileBuffer);

      const salt = data.slice(0, 16);
      const iv = data.slice(16, 28);
      const ciphertext = data.slice(28);

      const enc = new TextEncoder();
      const keyMaterial = await crypto.subtle.importKey(
        "raw",
        enc.encode(APP_MASTER_KEY),
        "PBKDF2",
        false,
        ["deriveKey"],
      );

      const key = await crypto.subtle.deriveKey(
        { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
        keyMaterial,
        { name: "AES-GCM", length: 256 },
        false,
        ["decrypt"],
      );

      const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        key,
        ciphertext,
      );

      const jsonString = new TextDecoder().decode(decrypted);
      return JSON.parse(jsonString);
    } catch (e) {
      console.error("Erro DB:", e);
      return null;
    }
  }

  // --- Lógica de Sessão ---

  function checkSession() {
      const sessionAuth = sessionStorage.getItem("cockpit_auth_token");
      const localAuth = localStorage.getItem("cockpit_persistent_auth");

      if (sessionAuth === "valid" || localAuth === "valid") {
          // Se estiver no local mas não no session, restaura os dados básicos
          if (localAuth === "valid" && !sessionAuth) {
              sessionStorage.setItem("cockpit_auth_token", "valid");
              sessionStorage.setItem("cockpit_user_login", localStorage.getItem("cockpit_saved_user"));
              sessionStorage.setItem("cockpit_user_realname", localStorage.getItem("cockpit_saved_name"));
              sessionStorage.setItem("cockpit_user_role", localStorage.getItem("cockpit_saved_role"));
              const savedEmail = localStorage.getItem("cockpit_saved_email");
              const savedAvatar = localStorage.getItem("cockpit_saved_avatar");
              const savedCsvName = localStorage.getItem("cockpit_saved_csv_name");
              if (savedCsvName) sessionStorage.setItem("cockpit_csv_name", savedCsvName);
              
              if (savedEmail) sessionStorage.setItem("cockpit_user_email", savedEmail);
              if (savedAvatar) sessionStorage.setItem("cockpit_user_avatar", savedAvatar);
              // Nota: Para segurança total, os dados do usuário (nome, cargo) 
              // também precisariam estar no localStorage ou recarregados do DB.
          }
          
          unlockInterface();
          applyPermissions();
          updateUserMenu();
          updateUserAvatarVisuals();
          navigate(window.location.hash || "#home");
      } else {
          frame.src = "about:blank";
          generateCaptcha(); // Gera um captcha assim que a tela de login aparece
      }
  }

  function unlockInterface() {
    if (loginOverlay) {
      loginOverlay.classList.add("opacity-0", "pointer-events-none");
      setTimeout(() => {
        loginOverlay.style.display = "none";
      }, 500);
    }
  }

  // --- Formulário de Login ---
if (loginForm) {
  loginForm.addEventListener("submit", async (e) => {
    e.preventDefault();

    // 1. Captura os novos campos
    const captchaInput = document.getElementById("captchaInput").value.toUpperCase();
    const rememberMe = document.getElementById("rememberMe").checked;
    
    const inputUser = userInput.value.trim().toLowerCase();
    const inputPass = passwordInput.value;
    const btn = loginForm.querySelector("button[type='submit']");

    // 2. VALIDAÇÃO DO CAPTCHA (Primeira barreira)
    if (captchaInput !== currentCaptcha) {
      showError("Código de verificação incorreto.");
      generateCaptcha(); // Muda o captcha em cada erro para evitar brute-force
      return; // Interrompe o login aqui mesmo
    }

    btn.textContent = "Autenticando...";
    btn.disabled = true;

    const dbUsers = await loadDatabase();

    if (dbUsers) {
      const foundUser = dbUsers.find((u) => u.username === inputUser);

      if (foundUser) {
        const inputHash = await sha256(inputPass);

    // --- DENTRO DO loginForm.addEventListener("submit"...) ---
    if (inputHash === foundUser.password_hash) {
      // 1. Dados que SEMPRE vão para a sessão atual
      sessionStorage.setItem("cockpit_auth_token", "valid");
      sessionStorage.setItem("cockpit_user_login", foundUser.username);
      sessionStorage.setItem("cockpit_user_realname", foundUser.name);
      sessionStorage.setItem("cockpit_user_role", foundUser.role);
      sessionStorage.setItem("cockpit_user_email", foundUser.email || "Sem e-mail");
      sessionStorage.setItem("cockpit_csv_name", foundUser.csvName || foundUser.name); 
      
      if (foundUser.avatar) {
        sessionStorage.setItem("cockpit_user_avatar", foundUser.avatar);
      } else {
        sessionStorage.removeItem("cockpit_user_avatar");
      }

      // 2. PERSISTÊNCIA (Apenas se o checkbox estiver marcado)
      if (rememberMe) {
        localStorage.setItem("cockpit_persistent_auth", "valid");
        localStorage.setItem("cockpit_saved_user", foundUser.username);
        localStorage.setItem("cockpit_saved_name", foundUser.name);
        localStorage.setItem("cockpit_saved_role", foundUser.role);
        localStorage.setItem("cockpit_saved_email", foundUser.email || "Sem e-mail");
        localStorage.setItem("cockpit_saved_csv_name", foundUser.csvName || foundUser.name);
        if (foundUser.avatar) {
            localStorage.setItem("cockpit_saved_avatar", foundUser.avatar);
        }
      }

      loginError.classList.add("hidden");
      aplicarPermissoesDeMenu();
      updateUserMenu();
      updateUserAvatarVisuals();
      unlockInterface();
      navigate(window.location.hash || "#home");
    } else {
          showError("Senha incorreta");
          generateCaptcha(); // Opcional: trocar captcha se errar a senha também
        }
      } else {
        showError("Usuário não encontrado");
        generateCaptcha();
      }
    } else {
      showError("Erro ao carregar banco de dados");
    }

    btn.textContent = "Entrar no Sistema";
    btn.disabled = false;
  });
}

  // =========================================================
  // 4. SISTEMA DE ERRO (MODAL)
  // =========================================================
  const errorModal = document.getElementById("errorModal");
  const errorContent = document.getElementById("errorModalContent");
  const errorMessageText = document.getElementById("errorMessageText");
  const btnCloseError = document.getElementById("btnCloseError");

  function showError(msg) {
    // Atualiza o texto
    if (errorMessageText) errorMessageText.textContent = msg;

    // Mostra o Modal
    if (errorModal) {
      errorModal.classList.remove("hidden");
      // Pequeno delay para a animação suave
      setTimeout(() => {
        errorModal.classList.remove("opacity-0");
        if (errorContent) {
          errorContent.classList.remove("scale-95", "opacity-0");
          errorContent.classList.add("scale-100", "opacity-100");
        }
      }, 10);
    } else {
      // Fallback caso esqueça de colocar o HTML
      alert(msg);
    }

    // Vibração no celular
    if (navigator.vibrate) navigator.vibrate(200);
  }

  function hideErrorModal() {
    if (!errorModal) return;

    // Animação de saída
    errorModal.classList.add("opacity-0");
    if (errorContent) {
      errorContent.classList.remove("scale-100", "opacity-100");
      errorContent.classList.add("scale-95", "opacity-0");
    }

    setTimeout(() => {
      errorModal.classList.add("hidden");

      // Limpa e foca na senha para tentar de novo rápido
      if (passwordInput) {
        passwordInput.value = "";
        passwordInput.focus();
      }
    }, 300);
  }

  // --- Event Listeners do Erro ---
  if (btnCloseError) {
    btnCloseError.addEventListener("click", (e) => {
      e.preventDefault();
      hideErrorModal();
    });
  }

  // Fecha clicando fora da caixa branca
  if (errorModal) {
    errorModal.addEventListener("click", (e) => {
      if (e.target === errorModal) hideErrorModal();
    });
  }

  // Fecha apertando ESC
  window.addEventListener("keydown", (e) => {
    if (
      e.key === "Escape" &&
      errorModal &&
      !errorModal.classList.contains("hidden")
    ) {
      hideErrorModal();
    }
  });

  // =========================================================
  // 2. LÓGICA DE UI E NAVEGAÇÃO
  // =========================================================
  const sidebar = document.getElementById("sidebar");
  const overlay = document.getElementById("sidebarOverlay");
  const mainContent = document.getElementById("mainContent");
  const floatingLinks = document.getElementById("floatingLinks");
  const links = document.querySelectorAll('aside a:not([target="_blank"])');
  const menuButton = document.getElementById("menuButton");

  // Ano Atual
  const currentYear = new Date().getFullYear();
  document.title = `Cockpit Gestão - ${currentYear}`;
  const yearHeader = document.querySelector("#currentYearHeader");
  if (yearHeader) yearHeader.textContent = currentYear;

  // Rotas
  const routes = {
    "#home": "apps/home/index.html",
    "#dashboard": "apps/dashboard/index.html",
    "#gerador": "apps/gerador/index.html",
    "#contratos": "apps/contratos/index.html",
    "#conversor": "apps/conversor/index.html",
    "#legislacao": "apps/legislacao/index.html",
    "#matrix": "apps/matrix/index.html",
    "#qualificacao": "apps/qualificacao/index.html",
    "#regmap": "apps/regmap/index.html",
  };
  const defaultHash = "#home";

  // --- CONTROLE DA GAVETA FLUTUANTE ---
  const iconFloatArrow = document.getElementById("iconFloatArrow");
  let floatingTimer = null;

  // Função para ABRIR a gaveta
  window.openFloating = function () {
    if (!floatingLinks) return;

    // Remove o translate (traz para a tela)
    floatingLinks.classList.remove("translate-x-full");

    // Gira a seta para apontar para a direita
    if (iconFloatArrow) iconFloatArrow.classList.add("rotate-180");

    // Reinicia o timer de 10 segundos
    resetFloatingTimer();
  };

  // Função para FECHAR a gaveta
  window.closeFloating = function () {
    if (!floatingLinks) return;

    // Adiciona o translate (joga para fora)
    floatingLinks.classList.add("translate-x-full");

    // Gira a seta para apontar para a esquerda
    if (iconFloatArrow) iconFloatArrow.classList.remove("rotate-180");

    // Limpa o timer para não gastar memória
    if (floatingTimer) clearTimeout(floatingTimer);
  };

  // Função de Toggle (para o botão)
  window.toggleFloatingMenu = function () {
    if (!floatingLinks) return;
    const isClosed = floatingLinks.classList.contains("translate-x-full");

    if (isClosed) {
      openFloating();
    } else {
      closeFloating();
    }
  };

  // Lógica do Timer de 10 segundos
  function resetFloatingTimer() {
    if (floatingTimer) clearTimeout(floatingTimer);
    floatingTimer = setTimeout(() => {
      closeFloating();
    }, 10000); // 10000ms = 10 segundos
  }

  // Sidebar Toggle
  window.toggleSidebar = function () {
    const isMobile = window.innerWidth < 768;
    if (menuButton) menuButton.classList.toggle("rotate-90");

    if (isMobile) {
      const isClosed = sidebar.classList.contains("-translate-x-full");
      if (isClosed) {
        sidebar.classList.remove("-translate-x-full");
        overlay.classList.remove("hidden");
        setTimeout(() => overlay.classList.remove("opacity-0"), 10);
      } else {
        sidebar.classList.add("-translate-x-full");
        overlay.classList.add("opacity-0");
        setTimeout(() => overlay.classList.add("hidden"), 300);
      }
    } else {
      sidebar.classList.toggle("md:translate-x-0");
      mainContent.classList.toggle("md:ml-64");
    }
  };

  function closeSidebarOnMobile() {
    if (
      window.innerWidth < 768 &&
      !sidebar.classList.contains("-translate-x-full")
    ) {
      window.toggleSidebar();
    }
  }

  // --- Função Central de Navegação ---
  function updateActiveLink(hash) {
    links.forEach((link) => {
      link.classList.remove("active-link");
      link.classList.add("text-gray-400");
      if (link.getAttribute("href") === hash) {
        link.classList.add("active-link");
        link.classList.remove("text-gray-400");
      }
    });
  }

  function navigate(hash) {
    // SEGURANÇA EXTRA: Se tentar navegar sem login, para tudo.
    if (sessionStorage.getItem("cockpit_auth_token") !== "valid") return;

    // --- PROTEÇÃO DE ROTA (NOVA) ---
    // Se tentar acessar o conversor sem ser admin, bloqueia e joga para Home
    if (hash === "#conversor" || hash === "#matrix") {
      const role = sessionStorage.getItem("cockpit_user_role");
      if (role !== "admin") {
        showError("Acesso Negado: Você não acesso à essa função. ");
        navigate("#home");
        return;
      }
    }

    const route = routes[hash] || routes[defaultHash];

    // Só atualiza o src se for diferente (evita flash desnecessário)
    if (!frame.src.endsWith(route)) {
      frame.src = route;
    }

    updateActiveLink(hash);

    // --- NOVA LÓGICA DO FLOATING LINKS ---
    if (window.innerWidth >= 768) {
      // Ajustes de layout existentes...
      if (hash === "#home") {
        sidebar.classList.remove("md:translate-x-0");
        mainContent.classList.remove("md:ml-64");
        if (menuButton) menuButton.classList.remove("rotate-90");

        // NA HOME: Esconde totalmente o elemento (nem a seta aparece)
        if (floatingLinks) floatingLinks.classList.add("hidden");
      } else {
        sidebar.classList.add("md:translate-x-0");
        mainContent.classList.add("md:ml-64");
        if (menuButton) menuButton.classList.add("rotate-90");

        // NOS APPS:
        if (floatingLinks) {
          // 1. Garante que o elemento existe no DOM (remove display:none)
          floatingLinks.classList.remove("hidden");

          // 2. Garante que começa fechado visualmente
          floatingLinks.classList.add("translate-x-full");

          // 3. Pequeno delay para animar a entrada automática
          setTimeout(() => {
            openFloating(); // Abre a gaveta
          }, 800);
        }
      }
    }

    // Ajuste de Layout (Full width na Home)
    if (window.innerWidth >= 768) {
      if (hash === "#home") {
        sidebar.classList.remove("md:translate-x-0");
        mainContent.classList.remove("md:ml-64");
        if (menuButton) menuButton.classList.remove("rotate-90");
        if (floatingLinks) floatingLinks.style.display = "none";
      } else {
        sidebar.classList.add("md:translate-x-0");
        mainContent.classList.add("md:ml-64");
        if (menuButton) menuButton.classList.add("rotate-90");
        if (floatingLinks) floatingLinks.style.display = "";
      }
    }
  }

  // Listeners de Navegação
  links.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const hash = link.getAttribute("href");
      history.pushState(null, null, hash);
      navigate(hash);
      closeSidebarOnMobile();
    });
  });

  window.addEventListener("popstate", () => {
    // Proteção no botão Voltar do navegador
    if (sessionStorage.getItem("cockpit_auth_token") === "valid") {
      navigate(window.location.hash || defaultHash);
    }
  });

  // --- INICIALIZAÇÃO ---
  // A chamada navigate() solta que existia aqui foi REMOVIDA.
  // Quem inicia tudo agora é a checkSession().
  checkSession();

  // =========================================================
  // 3. MONITORAMENTO CLIMÁTICO AVANÇADO (CORRIGIDO)
  // =========================================================
  const infoText = document.getElementById("infoText");
  const weatherModal = document.getElementById("weatherModal");
  const weatherBackdrop = document.getElementById("weatherBackdrop"); // Nova referência

  // Cache de dados
  let currentWeatherData = {};

  // Array de rotação
  let infoItems = ["Iniciando...", "Carregando Clima..."];
  let currentIndex = 0;

  async function updateWeather() {
    try {
      const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=-12.9756&longitude=-38.491&hourly=temperature_2m,weathercode,uv_index,wind_speed_10m,apparent_temperature,relative_humidity_2m,precipitation_probability&timezone=America%2FSao_Paulo&forecast_days=1",
      );
      const data = await response.json();
      const h = new Date().getHours();

      // Extraindo dados
      const weather = {
        temp: Math.round(data.hourly.temperature_2m[h]),
        sensacao: Math.round(data.hourly.apparent_temperature[h]),
        uv: Math.round(data.hourly.uv_index[h]),
        vento: Math.round(data.hourly.wind_speed_10m[h]),
        umidade: Math.round(data.hourly.relative_humidity_2m[h]),
        chuvaProb: Math.round(data.hourly.precipitation_probability[h]),
        code: data.hourly.weathercode[h],
      };

      // Ícone
      let icon = "☀️";
      let desc = "Céu Limpo";
      if (weather.code >= 1 && weather.code <= 3) {
        icon = "⛅";
        desc = "Parcialmente Nublado";
      } else if (weather.code >= 45 && weather.code <= 48) {
        icon = "🌫️";
        desc = "Nevoeiro";
      } else if (weather.code >= 51 && weather.code <= 67) {
        icon = "🌧️";
        desc = "Chuva Leve";
      } else if (weather.code >= 80 && weather.code <= 99) {
        icon = "⛈️";
        desc = "Tempestade";
      }

      weather.icon = icon;
      weather.desc = desc;
      currentWeatherData = weather;

      // Texto rotativo
      const currentYear = new Date().getFullYear();
      infoItems = [
        `Kevin Fróes • ${currentYear}`,
        `${icon} Salvador: ${weather.temp}°C`,
        weather.uv >= 8 ? `🟣 UV ${weather.uv} (Alto)` : `🟢 UV ${weather.uv}`,
      ];

      if (currentIndex === 0) renderInfo();
    } catch (e) {
      console.warn("Erro clima:", e);
    }
  }

  function renderInfo() {
    if (!infoText) return;
    infoText.classList.remove("opacity-100");
    infoText.classList.add("opacity-0");

    setTimeout(() => {
      if (currentIndex >= infoItems.length) currentIndex = 0;
      infoText.innerHTML = infoItems[currentIndex];
      infoText.classList.remove("opacity-0");
      infoText.classList.add("opacity-100");
      currentIndex = (currentIndex + 1) % infoItems.length;
    }, 500);
  }

  // --- Abrir/Fechar Modal (Agora controla o Backdrop também) ---
  window.toggleWeatherModal = function () {
    if (!weatherModal) return;
    const isHidden = weatherModal.classList.contains("hidden");

    if (isHidden) {
      // 1. Preenche dados
      if (currentWeatherData.temp !== undefined) {
        document.getElementById("wm-icon").textContent =
          currentWeatherData.icon;
        document.getElementById("wm-temp").textContent =
          `${currentWeatherData.temp}°C`;
        document.getElementById("wm-desc").textContent =
          currentWeatherData.desc;
        document.getElementById("wm-sensacao").textContent =
          `${currentWeatherData.sensacao}°`;
        document.getElementById("wm-uv").textContent = currentWeatherData.uv;
        document.getElementById("wm-umidade").textContent =
          `${currentWeatherData.umidade}%`;
        document.getElementById("wm-vento").textContent =
          `${currentWeatherData.vento} km/h`;
        document.getElementById("wm-chuva").textContent =
          `${currentWeatherData.chuvaProb}%`;
      }

      // 2. Mostra Modal e Cortina
      weatherModal.classList.remove("hidden");
      if (weatherBackdrop) weatherBackdrop.classList.remove("hidden");

      setTimeout(() => {
        weatherModal.classList.remove("opacity-0", "scale-95");
        weatherModal.classList.add("opacity-100", "scale-100");
      }, 10);
    } else {
      // 3. Esconde
      weatherModal.classList.remove("opacity-100", "scale-100");
      weatherModal.classList.add("opacity-0", "scale-95");

      // Esconde a cortina imediatamente para liberar o clique
      if (weatherBackdrop) weatherBackdrop.classList.add("hidden");

      setTimeout(() => weatherModal.classList.add("hidden"), 200);
    }
  };

  // Inicia
  updateWeather();
  setInterval(updateWeather, 1800000);
  setTimeout(() => setInterval(renderInfo, 5000), 1000);

  // =========================================================
  // LOGOUT COM MODAL PERSONALIZADO
  // =========================================================
  const logoutButton = document.getElementById("logoutButton");
  const logoutModal = document.getElementById("logoutModal");
  const modalContent = document.getElementById("logoutModalContent");
  const btnCancel = document.getElementById("btnCancelLogout");
  const btnConfirm = document.getElementById("btnConfirmLogout");

  // Função para abrir o modal com animação
  function showLogoutModal() {
    if (!logoutModal) return;
    logoutModal.classList.remove("hidden");
    // Pequeno delay para permitir que o navegador renderize antes de animar a opacidade
    setTimeout(() => {
      logoutModal.classList.remove("opacity-0");
      modalContent.classList.remove("scale-95", "opacity-0");
      modalContent.classList.add("scale-100", "opacity-100");
    }, 10);
  }
  window.showLogoutModal = showLogoutModal;

  // Função para fechar o modal
  function hideLogoutModal() {
    if (!logoutModal) return;
    logoutModal.classList.add("opacity-0");
    modalContent.classList.remove("scale-100", "opacity-100");
    modalContent.classList.add("scale-95", "opacity-0");

    setTimeout(() => {
      logoutModal.classList.add("hidden");
    }, 300); // Espera a animação de 300ms terminar
  }

  // Função que executa o Logout Real
  function performLogout() {
      // 1. Limpa tudo
      sessionStorage.clear(); 
      
      localStorage.removeItem("cockpit_persistent_auth");
      localStorage.removeItem("cockpit_saved_user");
      localStorage.removeItem("cockpit_saved_name");
      localStorage.removeItem("cockpit_saved_role");
      localStorage.removeItem("cockpit_saved_email");
      localStorage.removeItem("cockpit_saved_avatar");

      // 2. Limpa Iframe
      frame.src = "about:blank";

      // 3. Esconde o Modal de Logout
      hideLogoutModal();

    // 4. Mostra a Tela de Login (Gatekeeper)
    if (loginOverlay) {
      loginOverlay.style.display = "flex";
      setTimeout(() => {
        loginOverlay.classList.remove("opacity-0", "pointer-events-none");
      }, 10);
    }

    // 5. Reseta campos de login
    userInput.value = "";
    passwordInput.value = "";

    const loginBtn = loginForm.querySelector("button[type='submit']");
    if (loginBtn) {
      loginBtn.textContent = "Entrar no Sistema";
      loginBtn.disabled = false;
    }
  }

  // --- Event Listeners ---

  if (logoutButton) {
    logoutButton.addEventListener("click", (e) => {
      e.preventDefault();
      showLogoutModal(); // Em vez de confirm(), abrimos o modal
    });
  }

  if (btnCancel) {
    btnCancel.addEventListener("click", hideLogoutModal);
  }

  if (btnConfirm) {
    btnConfirm.addEventListener("click", performLogout);
  }

  // Fecha se clicar fora do card (no fundo escuro)
  if (logoutModal) {
    logoutModal.addEventListener("click", (e) => {
      if (e.target === logoutModal) {
        hideLogoutModal();
      }
    });
  }

  // --- Lógica de Permissões (Visual "Apagado") ---
  function applyPermissions() {
    const role = sessionStorage.getItem("cockpit_user_role");

    // Seleciona o link do conversor
    const conversorLink = document.querySelector('a[href="#conversor"]');
    const matrixLink = document.querySelector('a[href="#matrix"]');

    // Lógica para o Conversor
      if (conversorLink) {
        if (role === "admin") {
          conversorLink.classList.remove("opacity-30", "cursor-not-allowed");
          conversorLink.title = "Conversor CSV";
        } else {
          conversorLink.classList.add("opacity-30", "cursor-not-allowed");
          conversorLink.title = "Acesso exclusivo para Administradores";
        }
      }

      // Lógica para a Matriz Eisenhower
      if (matrixLink) {
        if (role === "admin") {
          // Admin: Acesso liberado
          matrixLink.classList.remove("opacity-30", "cursor-not-allowed");
          matrixLink.title = "Matriz Eisenhower";
        } else {
          // User: Acesso bloqueado visualmente
          matrixLink.classList.add("opacity-30", "cursor-not-allowed");
          matrixLink.title = "Acesso exclusivo para Administradores";
          
          // Opcional: desabilitar cliques completamente
          // matrixLink.style.pointerEvents = 'none';
        }
      }
    }
  // =========================================================
  // SISTEMA DE SOLICITAÇÃO & MODAIS DE SUCESSO
  // =========================================================

  // --- Lógica do Modal de Sucesso ---
  const successModal = document.getElementById("successModal");
  const successContent = document.getElementById("successModalContent");
  const successTitle = document.getElementById("successTitle");
  const successMessage = document.getElementById("successMessage");
  const btnCloseSuccess = document.getElementById("btnCloseSuccess");

  function showSuccess(title, msg) {
    if (successTitle) successTitle.textContent = title;
    if (successMessage) successMessage.textContent = msg;

    if (successModal) {
      successModal.classList.remove("hidden");
      setTimeout(() => {
        successModal.classList.remove("opacity-0");
        if (successContent) {
          successContent.classList.remove("scale-95", "opacity-0");
          successContent.classList.add("scale-100", "opacity-100");
        }
      }, 10);
    } else {
      alert(msg); // Fallback
    }
    if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
  }

  function hideSuccessModal() {
    if (!successModal) return;
    successModal.classList.add("opacity-0");
    if (successContent) {
      successContent.classList.remove("scale-100", "opacity-100");
      successContent.classList.add("scale-95", "opacity-0");
    }
    setTimeout(() => {
      successModal.classList.add("hidden");
    }, 300);
  }

  if (btnCloseSuccess) {
    btnCloseSuccess.addEventListener("click", (e) => {
      e.preventDefault();
      hideSuccessModal();
    });
  }

  // --- Funções de Solicitação ---
  window.openRegisterModal = () =>
    document.getElementById("registerModal").classList.remove("hidden");

  // Função para Abrir Modal de Senha
  window.openResetModal = () => {
    const modal = document.getElementById("resetModal");
    const userField = document.getElementById("resUser");
    const emailField = document.getElementById("resEmail");

    // Tenta pegar os dados salvos na sessão
    const savedLogin = sessionStorage.getItem("cockpit_user_login");
    const savedEmail = sessionStorage.getItem("cockpit_user_email");

    // Se existirem (usuário logado), preenche os campos
    if (savedLogin && userField) userField.value = savedLogin;
    if (savedEmail && savedEmail !== "Sem e-mail" && emailField)
      emailField.value = savedEmail;

    // Abre o modal
    modal.classList.remove("hidden");
  };

  function closeRequestModals() {
    document.getElementById("registerModal").classList.add("hidden");
    document.getElementById("resetModal").classList.add("hidden");
  }

  function downloadRequest(data, filename) {
    const blob = new Blob([JSON.stringify(data, null, 2)], {
      type: "application/json",
    });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // 1. Form CADASTRO
  const regForm = document.getElementById("registerForm");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawPass = document.getElementById("regPass").value;

      const confirmPass = document.getElementById("regConfirm").value;

      // --- VALIDAÇÃO DE IGUALDADE ---
      if (rawPass !== confirmPass) {
        showError("As senhas não coincidem!"); // Usa seu modal de erro existente
        return; // Para tudo aqui
      }

      const securePass = await encryptLight(rawPass);

      const payload = {
        type: "cadastro",
        date: new Date().toISOString(),
        payload: {
          name: document.getElementById("regName").value,
          username: document
            .getElementById("regUser")
            .value.trim()
            .toLowerCase(),
          avatar: tempRegisterAvatar,
          email: document.getElementById("regEmail").value.trim().toLowerCase(),
          secure_data: securePass,
        },
      };

      downloadRequest(
        payload,
        `solicitacao_cadastro_${payload.payload.username}.json`,
      );

      // SUBSTITUI O ALERT AQUI:
      closeRequestModals();
      showSuccess(
        "Arquivo Gerado!",
        "O arquivo foi salvo no seu computador.\n\nEnvie este arquivo para o administrador:\ncockpitgestao@gmail.com\n\nApós a conclusão, você será informado no e-mail cadastrado.",
      );
      regForm.reset();
    });
  }

  // 2. Form RESET SENHA
  const resForm = document.getElementById("resetForm");
  if (resForm) {
    resForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      const rawPass = document.getElementById("resNewPass").value;

      const confirmPass = document.getElementById("resConfirm").value;

      // --- VALIDAÇÃO DE IGUALDADE ---
      if (rawPass !== confirmPass) {
        showError("A confirmação de senha está incorreta.");
        return;
      }

      const securePass = await encryptLight(rawPass);

      const payload = {
        type: "senha",
        date: new Date().toISOString(),
        payload: {
          username: document
            .getElementById("resUser")
            .value.trim()
            .toLowerCase(),
          email: document.getElementById("resEmail").value.trim().toLowerCase(),
          avatar: tempResetAvatar,
          secure_data: securePass,
        },
      };

      downloadRequest(
        payload,
        `solicitacao_senha_${payload.payload.username}.json`,
      );

      // SUBSTITUI O ALERT AQUI:
      closeRequestModals();
      showSuccess(
        "Solicitação Gerada!",
        "O arquivo de troca de senha foi salvo.\n\nEnvie-o para o administrador para processamento.",
      );
      resForm.reset();
    });
  }

  // =========================================================
  // LOGICA DO MENU DE PERFIL (SIDEBAR)
  // =========================================================
  const userMenuBtn = document.getElementById("userMenuBtn");
  const userMenuDropdown = document.getElementById("userMenuDropdown");

  // 1. Função para atualizar os dados do menu
  function updateUserMenu() {
    const realName =
      sessionStorage.getItem("cockpit_user_realname") || "Usuário";
    const email = sessionStorage.getItem("cockpit_user_email") || "Sem e-mail";
    const role = sessionStorage.getItem("cockpit_user_role") || "USER";

    // Preenche textos
    const sbName = document.getElementById("sidebarUserName");
    const mName = document.getElementById("menuUserName");
    const mEmail = document.getElementById("menuUserEmail");
    const mRole = document.getElementById("menuUserRole");
    const avatar = document.getElementById("userAvatar");

    if (sbName) sbName.textContent = realName.split(" ")[0]; // Só o primeiro nome na barra
    if (mName) mName.textContent = realName;
    if (mEmail) mEmail.textContent = email;

    if (mRole) {
      mRole.textContent = role.toUpperCase();
      // Muda a cor da badge se for Admin
      if (role === "admin") {
        mRole.className =
          "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30";
      }
    }

    // Gera inicial do Avatar
    if (avatar) {
      avatar.textContent = realName.charAt(0).toUpperCase();
    }
  }

  // 2. Toggle do Menu (Abrir/Fechar)
  if (userMenuBtn && userMenuDropdown) {
    userMenuBtn.addEventListener("click", (e) => {
      e.stopPropagation(); // Impede fechar imediato
      const isHidden = userMenuDropdown.classList.contains("hidden");

      if (isHidden) {
        // Abrir
        updateUserMenu(); // Garante dados frescos
        userMenuDropdown.classList.remove("hidden");
        setTimeout(() => {
          userMenuDropdown.classList.remove("scale-95", "opacity-0");
          userMenuDropdown.classList.add("scale-100", "opacity-100");
        }, 10);
      } else {
        // Fechar
        userMenuDropdown.classList.remove("scale-100", "opacity-100");
        userMenuDropdown.classList.add("scale-95", "opacity-0");
        setTimeout(() => userMenuDropdown.classList.add("hidden"), 200);
      }
    });

    // Fechar ao clicar fora
    document.addEventListener("click", (e) => {
      if (
        !userMenuDropdown.classList.contains("hidden") &&
        !userMenuBtn.contains(e.target) &&
        !userMenuDropdown.contains(e.target)
      ) {
        userMenuDropdown.classList.remove("scale-100", "opacity-100");
        userMenuDropdown.classList.add("scale-95", "opacity-0");
        setTimeout(() => userMenuDropdown.classList.add("hidden"), 200);
      }
    });
  }

  // Chama ao iniciar para já deixar bonito
  updateUserMenu();

  // =========================================================
  // MEDIDOR DE FORÇA DE SENHA
  // =========================================================

  function attachPasswordStrength(inputId, barId, textId) {
    const input = document.getElementById(inputId);
    const bar = document.getElementById(barId);
    const text = document.getElementById(textId);

    if (!input || !bar || !text) return;

    input.addEventListener("input", () => {
      const val = input.value;
      let score = 0;

      // Critérios de Pontuação
      if (val.length >= 6) score++; // Tamanho mínimo
      if (val.length >= 10) score++; // Tamanho bom
      if (/[A-Z]/.test(val)) score++; // Tem Maiúscula
      if (/[0-9]/.test(val)) score++; // Tem Número
      if (/[^A-Za-z0-9]/.test(val)) score++; // Tem Símbolo (!@#)

      // Limita score máximo a 4 (para facilitar a UI)
      if (score > 4) score = 4;
      if (val.length === 0) score = 0;

      // Atualiza a Barra (Cores e Tamanho)
      let width = "0%";
      let color = "bg-red-500";
      let label = "Muito fraca";

      switch (score) {
        case 0:
          width = "0%";
          label = "";
          break;
        case 1:
          width = "25%";
          color = "bg-red-500";
          label = "Fraca 😟";
          break;
        case 2:
          width = "50%";
          color = "bg-yellow-500";
          label = "Média 😐";
          break;
        case 3:
          width = "75%";
          color = "bg-blue-500";
          label = "Boa 🙂";
          break;
        case 4:
          width = "100%";
          color = "bg-green-500";
          label = "Forte! 🚀";
          break;
      }

      // Aplica estilos
      bar.style.width = width;
      bar.className = `h-full transition-all duration-300 ${color}`;
      text.textContent = label;
    });
  }

  // Ativa nos dois campos (Cadastro e Reset)
  attachPasswordStrength("regPass", "regStrengthBar", "regStrengthText");
  attachPasswordStrength("resNewPass", "resStrengthBar", "resStrengthText");

  // =========================================================
  // SISTEMA DE AVATAR (COMPRESSÃO, MODAIS E SIDEBAR)
  // =========================================================

  // Variáveis para guardar o Base64 temporariamente (serão usadas no JSON)
  let tempRegisterAvatar = "";
  let tempResetAvatar = "";

  // 1. Função Reutilizável: Processa a imagem nos Modais
  function handleAvatarSelection(
    inputId,
    previewId,
    placeholderId,
    storageCallback,
  ) {
    const input = document.getElementById(inputId);
    const preview = document.getElementById(previewId);
    const placeholder = document.getElementById(placeholderId);

    if (!input) return;

    input.addEventListener("change", function (e) {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = function (event) {
        const img = new Image();
        img.onload = function () {
          // --- COMPRESSÃO (Canvas) ---
          const canvas = document.createElement("canvas");
          const ctx = canvas.getContext("2d");

          // Define tamanho máximo (Thumbnail 150x150)
          const maxSize = 150;
          let width = img.width;
          let height = img.height;

          // Redimensionamento Proporcional
          if (width > height) {
            if (width > maxSize) {
              height *= maxSize / width;
              width = maxSize;
            }
          } else {
            if (height > maxSize) {
              width *= maxSize / height;
              height = maxSize;
            }
          }

          canvas.width = width;
          canvas.height = height;
          ctx.drawImage(img, 0, 0, width, height);

          // Converte para Base64 leve
          const dataUrl = canvas.toDataURL("image/jpeg", 0.7);

          // 1. Atualiza Visual do Modal (Preview)
          if (preview) {
            preview.src = dataUrl;
            preview.classList.remove("hidden");
          }
          if (placeholder) placeholder.classList.add("hidden");

          // 2. Salva na variável para enviar no JSON depois
          storageCallback(dataUrl);
        };
        img.src = event.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  // 2. Ativa a lógica nos dois modais (Cadastro e Reset)
  // Quando o usuário escolhe foto no cadastro, salva em tempRegisterAvatar
  handleAvatarSelection(
    "regAvatarInput",
    "regAvatarPreview",
    "regAvatarPlaceholder",
    (val) => {
      tempRegisterAvatar = val;
    },
  );

  // Quando o usuário escolhe foto no reset, salva em tempResetAvatar
  handleAvatarSelection(
    "resAvatarInput",
    "resAvatarPreview",
    "resAvatarPlaceholder",
    (val) => {
      tempResetAvatar = val;
    },
  );

  // 3. Função Visual da Sidebar (Apenas exibe o que está na sessão)
  function updateUserAvatarVisuals() {
    const avatarImg = document.getElementById("userAvatarImg");
    const avatarFallback = document.getElementById("userAvatarFallback");
    const savedAvatar = sessionStorage.getItem("cockpit_user_avatar");

    if (savedAvatar) {
      // Tem foto na sessão: Mostra IMG, Esconde Letra
      if (avatarImg) {
        avatarImg.src = savedAvatar;
        avatarImg.classList.remove("hidden");
      }
      if (avatarFallback) avatarFallback.classList.add("hidden");
    } else {
      // Não tem foto: Esconde IMG, Mostra Letra
      if (avatarImg) avatarImg.classList.add("hidden");
      if (avatarFallback) avatarFallback.classList.remove("hidden");
    }
  }

  // Chama ao iniciar (para carregar se o usuário já fez login com foto)
  updateUserAvatarVisuals();

  // =========================================================
  // GESTÃO DE TEMA (DARK MODE)
  // =========================================================

  // 1. Carregar tema salvo ao iniciar
  const savedTheme = localStorage.getItem("cockpit_theme");
  // Se estiver salvo 'dark' OU o sistema do usuário for dark, ativa
  // if (
  //    savedTheme === "dark" ||
  //   (!savedTheme && window.matchMedia("(prefers-color-scheme: dark)").matches)
  // ) {
  //   document.documentElement.classList.add("dark");
  // } else {
  //   document.documentElement.classList.remove("dark");
  // }

  // 2. Função de Alternância (Chamada pelo botão do menu)
  window.toggleTheme = function () {
    const html = document.documentElement;

    if (html.classList.contains("dark")) {
      // Mudar para Claro
      html.classList.remove("dark");
      localStorage.setItem("cockpit_theme", "light");
      broadcastTheme("light");
    } else {
      // Mudar para Escuro
      html.classList.add("dark");
      localStorage.setItem("cockpit_theme", "dark");
      broadcastTheme("dark");
    }
  };

  // 3. A "PORTA ABERTA": Avisa o iframe sobre a mudança
  function broadcastTheme(theme) {
    const frame = document.getElementById("appFrame");
    // Verifica se o iframe existe e tem conteúdo
    if (frame && frame.contentWindow) {
      // Envia mensagem segura. Se o app filho não tiver o script receptor, nada acontece (sem erro).
      frame.contentWindow.postMessage(
        { type: "THEME_CHANGE", theme: theme },
        "*",
      );
    }
  }

  // 4. Garantir que o iframe receba o tema assim que carregar a página
  const frameEl = document.getElementById("appFrame");
  if (frameEl) {
    frameEl.addEventListener("load", () => {
      const currentTheme = document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
      broadcastTheme(currentTheme);
    });
  }

  function aplicarPermissoesDeMenu() {
      const role = sessionStorage.getItem("cockpit_user_role");
      const linkMatriz = document.querySelector('a[href="#matrix"]');
      const linkConversor = document.querySelector('a[href="#conversor"]');
      
      const rotasRestritas = [linkMatriz, linkConversor];

      rotasRestritas.forEach(link => {
          if (link) {
              if (role === "admin") {
                  link.classList.remove("opacity-50", "cursor-not-allowed");
              } else {
                  link.classList.add("opacity-50", "cursor-not-allowed");
              }
          }
      });
  }

  // Executa imediatamente na inicialização da página para checar o estado atual
  aplicarPermissoesDeMenu();

  // Torna a função global para que o formulário de login possa acioná-la
  window.aplicarPermissoesDeMenu = aplicarPermissoesDeMenu;

});
