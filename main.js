/**
 * main.js
 * Versão Final: DB Criptografado + Sem Loop Infinito
 */

document.addEventListener("DOMContentLoaded", () => {
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
    // AQUI ESTÁ A CORREÇÃO DO LOOP:
    // Só chamamos navigate() se o token for válido.
    if (sessionStorage.getItem("cockpit_auth_token") === "valid") {
      unlockInterface();
      applyPermissions();
      // Carrega o app correto (Home, Dashboard, etc)
      navigate(window.location.hash || "#home");
    } else {
      // Se não tiver login, garante que o iframe fique vazio
      frame.src = "about:blank";
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

      const inputUser = userInput.value.trim().toLowerCase();
      const inputPass = passwordInput.value;
      const btn = loginForm.querySelector("button");

      btn.textContent = "Autenticando...";
      btn.disabled = true;

      const dbUsers = await loadDatabase();

      if (dbUsers) {
        const foundUser = dbUsers.find((u) => u.username === inputUser);

        if (foundUser) {
          const inputHash = await sha256(inputPass);

          if (inputHash === foundUser.password_hash) {
            // LOGIN SUCESSO
            sessionStorage.setItem("cockpit_auth_token", "valid");
            sessionStorage.setItem("cockpit_user_realname", foundUser.name);
            sessionStorage.setItem("cockpit_user_role", foundUser.role);

            loginError.classList.add("hidden");
            unlockInterface();

            // Agora sim, carregamos o app!
            navigate(window.location.hash || "#home");
          } else {
            showError("Senha incorreta");
          }
        } else {
          showError("Usuário não encontrado");
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
  };
  const defaultHash = "#home";

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
    if (hash === "#conversor") {
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
  // 3. PREVISÃO DO TEMPO
  // =========================================================
  const infoText = document.getElementById("infoText");
  let weatherText = "Salvador: ...";
  let weatherIcon = "sunny";
  let detailsText = "...";

  const infoItems = [`Kevin Fróes • ${currentYear}`, weatherText, detailsText];
  let currentIndex = 0;

  async function updateWeather() {
    try {
      const response = await fetch(
        "https://api.open-meteo.com/v1/forecast?latitude=-12.9756&longitude=-38.491&hourly=temperature_2m,precipitation_probability,uv_index,wind_speed_10m&timezone=America%2FSao_Paulo&forecast_days=1",
      );
      const data = await response.json();
      const hourIndex = new Date().getHours();

      const temp = Math.round(data.hourly.temperature_2m[hourIndex]);
      const uv = data.hourly.uv_index[hourIndex];

      infoItems[1] = `Salvador: ${temp}°C`;
      infoItems[2] = `☀️ UV ${Math.round(uv)}`;

      if (infoText) renderInfo();
    } catch (e) {
      console.warn(e);
    }
  }

  function renderInfo() {
    if (!infoText) return;
    infoText.classList.remove("opacity-100");
    infoText.classList.add("opacity-0");
    setTimeout(() => {
      if (currentIndex === 0) infoText.innerHTML = infoItems[0];
      else if (currentIndex === 1) infoText.innerHTML = infoItems[1];
      else infoText.innerHTML = infoItems[2];

      infoText.classList.remove("opacity-0");
      infoText.classList.add("opacity-100");
      currentIndex = (currentIndex + 1) % infoItems.length;
    }, 500);
  }

  updateWeather();
  setInterval(updateWeather, 1800000);
  setTimeout(() => {
    renderInfo();
    setInterval(renderInfo, 8000);
  }, 1000);

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
    // 1. Limpa sessão
    sessionStorage.removeItem("cockpit_auth_token");
    sessionStorage.removeItem("cockpit_user_realname");
    sessionStorage.removeItem("cockpit_user_role");

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

    const loginBtn = loginForm.querySelector("button");
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

    if (conversorLink) {
      if (role === "admin") {
        // Admin: Vida normal
        conversorLink.classList.remove("opacity-30", "cursor-not-allowed");
        conversorLink.title = "Conversor CSV";
      } else {
        // User: Fica "meio apagado" (30% opacidade) e cursor de bloqueio
        conversorLink.classList.add("opacity-30", "cursor-not-allowed");
        conversorLink.title = "Acesso exclusivo para Administradores";

        // Se você quiser que o clique NÃO faça nada (nem aviso),
        // descomente a linha abaixo:
        // conversorLink.style.pointerEvents = 'none';
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
  window.openResetModal = () =>
    document.getElementById("resetModal").classList.remove("hidden");

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
});
