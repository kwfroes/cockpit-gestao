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


  // =========================================================
  // GESTÃO DE ABAS E MULTI-IFRAMES
  // =========================================================
  const appContainer = document.getElementById("appContainer");
  const tabBar = document.getElementById("tabBar");
  const openFrames = {}; // Guarda os iframes abertos: { "#dashboard": iframeElement }

  function renderTabs() {
    if (!tabBar) return;
    tabBar.innerHTML = "";
    
    const openHashes = Object.keys(openFrames);
    if (openHashes.length === 0 || (openHashes.length === 1 && openHashes[0] === "#home")) {
        tabBar.classList.add("hidden"); // Esconde a barra se só tiver a home ou nada
        return;
    }
    
    tabBar.classList.remove("hidden");

    openHashes.forEach(hash => {
        if (hash === "#home") return; // Não cria aba visual para a Home

        // Busca o nome do app baseando-se no menu lateral
        const link = document.querySelector(`aside a[href="${hash}"]`);
        const title = link
        ? (link.dataset.title || link.textContent.trim())
        : hash;

        const isAtiva = window.location.hash === hash;

        const tab = document.createElement("div");
        tab.className = `px-4 py-2 border-r border-slate-200 dark:border-slate-700 cursor-pointer flex items-center gap-2 text-sm transition-colors group select-none ${
            isAtiva 
            ? "bg-slate-100 dark:bg-slate-900 font-bold text-blue-600 dark:text-blue-400 border-b-2 border-b-blue-600" 
            : "bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700"
        }`;

        // Texto que clica e navega
        const span = document.createElement("span");
        span.textContent = title;
        span.className = "whitespace-nowrap";
        span.onclick = () => {
            history.pushState(null, null, hash);
            navigate(hash);
        };

        // Botão de fechar (X)
        const closeBtn = document.createElement("button");
        closeBtn.innerHTML = "✕";
        closeBtn.className = "text-[10px] ml-2 w-5 h-5 flex items-center justify-center rounded-full text-slate-400 hover:bg-red-100 hover:text-red-600 dark:hover:bg-red-900/30 transition-colors";
        closeBtn.onclick = (e) => {
            e.stopPropagation();
            closeTab(hash);
        };

        tab.appendChild(span);
        tab.appendChild(closeBtn);
        tabBar.appendChild(tab);
    });
  }

  function closeTab(hash) {
      if (openFrames[hash]) {
          appContainer.removeChild(openFrames[hash]);
          delete openFrames[hash];
      }
      
      const remainingHashes = Object.keys(openFrames).filter(h => h !== "#home");
      if (remainingHashes.length > 0) {
          // Vai para a última aba aberta
          const lastHash = remainingHashes[remainingHashes.length - 1];
          history.pushState(null, null, lastHash);
          navigate(lastHash);
      } else {
          // Se fechou tudo, volta pra home
          history.pushState(null, null, "#home");
          navigate("#home");
      }
  }

  // Função utilitária para limpar tudo ao deslogar
  function clearAllApps() {
      if (appContainer) appContainer.innerHTML = "";
      for (let key in openFrames) delete openFrames[key];
      renderTabs();
  }

  // =========================================================
  // INICIALIZAÇÃO DO SUPABASE
  // =========================================================
  const supabase = window.supabaseClient;

  // =========================================================
  // SISTEMA CENTRAL DE LOGS
  // =========================================================
  window.registrarLog = async function(acao, detalhes = {}, appOrigem = 'COCKPIT_PAI') {
      try {
          // Tenta pegar quem está logado pela sessão atual
          const nome = sessionStorage.getItem("cockpit_user_realname") || "Usuário Desconhecido";
          const email = sessionStorage.getItem("cockpit_user_email") || "Email Desconhecido";

          const { error } = await supabase
              .from('sistema_logs')
              .insert([{
                  usuario_nome: nome,
                  usuario_email: email,
                  acao: acao,
                  app_origem: appOrigem,
                  detalhes: detalhes
              }]);

          if (error) console.error("Erro ao registrar log silencioso:", error);
      } catch (err) {
          console.error("Falha na função de log:", err);
      }
  };


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

  async function checkSession() {
      const { data: { session }, error } = await supabase.auth.getSession();

      if (session) {
          const user = session.user;
          
          // 1. Adicionamos 'status' na busca do perfil
          const { data: profile } = await supabase
            .from('profiles')
            .select('name, role, avatar_url, apelido, precisa_trocar_senha, allowed_apps, status, coordenacao, responsavel, user_dash')
            .eq('id', user.id)
            .single();
            
          // 2. BLOQUEIO DE INATIVO NA SESSÃO (Impede o acesso ao recarregar a página)
          if (profile?.status === 'inativo') {
              await supabase.auth.signOut(); // Desloga do Supabase
              sessionStorage.clear();        // Limpa a memória
              clearAllApps();     // Limpa a tela
              if (typeof generateCaptcha === "function") generateCaptcha();
              return; // Interrompe a execução aqui, não deixa criar a sessão local
          }
          
          sessionStorage.setItem("cockpit_auth_token", "valid");
          sessionStorage.setItem("cockpit_user_email", user.email);
          sessionStorage.setItem("cockpit_user_realname", profile?.name || user.user_metadata?.name || user.email.split('@')[0]);
          sessionStorage.setItem("cockpit_user_role", profile?.role || user.user_metadata?.role || "user");
          sessionStorage.setItem("cockpit_user_apelido", profile?.apelido || "");
          sessionStorage.setItem("cockpit_user_coordenacao", profile?.coordenacao || "");
          sessionStorage.setItem("cockpit_user_responsavel", profile?.responsavel ?? false);
          sessionStorage.setItem("cockpit_user_dash", profile?.user_dash || "");
          
          // Salva a lista de apps permitidos na sessão do navegador
          const userApps = profile?.allowed_apps || ["#home"];
          sessionStorage.setItem("cockpit_allowed_apps", JSON.stringify(userApps));
          
          if (profile?.avatar_url) {
              sessionStorage.setItem("cockpit_user_avatar", profile.avatar_url);
          } else {
              sessionStorage.removeItem("cockpit_user_avatar");
          }
          
          if (profile?.precisa_trocar_senha) {
              document.getElementById("forcedPasswordModal").classList.remove("hidden");
          } else {
              unlockInterface();
              applyPermissions(); // Aplica a ocultação baseada na lista salva
              updateUserMenu();
              updateUserAvatarVisuals();
              navigate(window.location.hash || "#home");

              // ==========================================
              // INICIALIZA AS NOTIFICAÇÕES GLOBAIS E REALTIME
              // ==========================================
              
              // 1. Pede permissão nativa do Windows/Mac para exibir notificações
              if ("Notification" in window && Notification.permission === "default") {
                  Notification.requestPermission();
              }

              // 2. Busca o status inicial do sininho
              fetchGlobalNotifications(); 
              
              // 3. LIGA O ESPIÃO EM TEMPO REAL (NOVIDADE AQUI!)
              if (typeof startDemandasListener === "function") {
                  startDemandasListener(); 
              }
              
              // 4. Cria o loop de segurança de 2 em 2 minutos
              if (!window.cockpitNotifInterval) {
                  window.cockpitNotifInterval = setInterval(fetchGlobalNotifications, 120000);
              }
          }
      } else {
          clearAllApps();
          generateCaptcha();
          
          // Limpa o loop se o usuário deslogar/perder a sessão
          if (window.cockpitNotifInterval) {
              clearInterval(window.cockpitNotifInterval);
              window.cockpitNotifInterval = null;
          }
          
          // Desliga o espião de notificações ao sair
          if (window.demandasChannel) {
              window.demandasChannel.unsubscribe();
          }
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

      const captchaInput = document.getElementById("captchaInput").value.toUpperCase();
      const inputEmail = userInput.value.trim().toLowerCase(); // Agora é e-mail
      const inputPass = passwordInput.value;
      const btn = loginForm.querySelector("button[type='submit']");

      if (captchaInput !== currentCaptcha) {
        showError("Código de verificação incorreto.");
        generateCaptcha();
        return;
      }

      btn.textContent = "Autenticando...";
      btn.disabled = true;

      // Chama a autenticação do Supabase
      console.log("Tentando login com:", { email: inputEmail, password: inputPass });
      const { data, error } = await supabase.auth.signInWithPassword({
          email: inputEmail,
          password: inputPass,
      });

      if (error) {
        console.log("O SUPABASE DISSE:", error); // Adicione isso antes do showError

          supabase.from('sistema_logs').insert([{
          usuario_nome: "Tentativa de Acesso",
          usuario_email: inputEmail,
          acao: "LOGIN_FALHO",
          app_origem: "COCKPIT_PAI",
          detalhes: { erro: error.message }
        }]);
    
          showError("Credenciais inválidas ou usuário não encontrado.");
          generateCaptcha();
        } else {
        // SUCESSO NO AUTH! (E-mail e senha estão certos)
        const user = data.user;
        
        // 1. Buscamos 'allowed_apps' e 'status' no login também
        const { data: profile } = await supabase
          .from('profiles')
          .select('name, role, avatar_url, apelido, precisa_trocar_senha, allowed_apps, status, coordenacao, responsavel, user_dash')
          .eq('id', user.id)
          .single();
        
        // 2. BLOQUEIO DE INATIVO NO LOGIN
        if (profile?.status === 'inativo') {
            await supabase.auth.signOut(); // Desloga imediatamente para segurança
            showError("Acesso Bloqueado: Este usuário foi inativado pelo Administrador.");
            generateCaptcha();
            btn.textContent = "Entrar no Sistema";
            btn.disabled = false;
            return; // 🛑 INTERROMPE AQUI! Não deixa entrar.
        }

        // 3. Se for ativo, segue a vida normal:
        sessionStorage.setItem("cockpit_auth_token", "valid");
        sessionStorage.setItem("cockpit_user_email", user.email);
        sessionStorage.setItem("cockpit_user_realname", profile?.name || user.user_metadata?.name || user.email.split('@')[0]);
        sessionStorage.setItem("cockpit_user_role", profile?.role || user.user_metadata?.role || "user");
        sessionStorage.setItem("cockpit_user_apelido", profile?.apelido || "");
        sessionStorage.setItem("cockpit_user_coordenacao", profile?.coordenacao || "");
        sessionStorage.setItem("cockpit_user_responsavel", profile?.responsavel ?? false);
        sessionStorage.setItem("cockpit_user_dash", profile?.user_dash || "");

        const userApps = profile?.allowed_apps || ["#home"];
        sessionStorage.setItem("cockpit_allowed_apps", JSON.stringify(userApps));

        if (profile?.avatar_url) {
            sessionStorage.setItem("cockpit_user_avatar", profile.avatar_url);
        } else {
            sessionStorage.removeItem("cockpit_user_avatar");
        }

          window.registrarLog("LOGIN_SUCESSO", { 
              metodo: "senha", 
              role: profile?.role 
          });

        // 4. Lógica limpa (sem duplicação)
        if (profile?.precisa_trocar_senha) {
            document.getElementById("forcedPasswordModal").classList.remove("hidden");
        } else {
            loginError.classList.add("hidden");
            applyPermissions(); 
            updateUserMenu();
            updateUserAvatarVisuals();
            unlockInterface();
            
            fetchGlobalNotifications(); 
            if (typeof startDemandasListener === "function") startDemandasListener(); 
            
            navigate(window.location.hash || "#home");
        }
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
    "#demandas": "apps/demandas/index.html",
    "#qualificacao": "apps/qualificacao/index.html",
    "#regmap": "apps/regmap/index.html",
    "#usuarios": "apps/usuarios/index.html",
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
    if (sessionStorage.getItem("cockpit_auth_token") !== "valid") return;

    // --- PROTEÇÃO DE ROTA GRANULAR ---
    if (hash !== "#home") {
      const role = sessionStorage.getItem("cockpit_user_role");
      let allowedApps = [];
      try {
        allowedApps = JSON.parse(sessionStorage.getItem("cockpit_allowed_apps")) || ["#home"];
      } catch(e) {
        allowedApps = ["#home"];
      }

      if (role !== "admin" && !allowedApps.includes(hash)) {
        showError("Acesso Negado: Você não possui autorização para este aplicativo.");
        navigate("#home");
        return;
      }
    }

    const route = routes[hash] || routes[defaultHash];

    // 1. Esconde TODOS os iframes abertos
    Object.values(openFrames).forEach(iframe => {
        iframe.style.display = "none";
    });

    // 2. Verifica se o iframe do app já existe
    if (openFrames[hash]) {
        // Se existe, apenas mostra ele de novo (mantendo o estado intacto!)
        openFrames[hash].style.display = "block";
    } else {
        // Se não existe, cria o iframe, injeta no HTML e salva na lista
        const newIframe = document.createElement("iframe");
        newIframe.src = route;
        newIframe.style.width = "100%";
        newIframe.style.height = "100%";
        newIframe.style.backgroundColor = "transparent";
        newIframe.allowFullscreen = true;
        newIframe.style.border = "none";

        newIframe.addEventListener("load", () => {
            const currentTheme = document.documentElement.classList.contains("dark") ? "dark" : "light";
            if (newIframe.contentWindow) {
                newIframe.contentWindow.postMessage({ type: "THEME_CHANGE", theme: currentTheme }, "*");
            }
        });
        
        appContainer.appendChild(newIframe);
        openFrames[hash] = newIframe;
    }

    // Atualiza menu e abas visuais
    updateActiveLink(hash);
    renderTabs();

    // --- LÓGICA DO FLOATING LINKS E SIDEBAR ---
    if (window.innerWidth >= 768) {
      if (hash === "#home") {
        sidebar.classList.remove("md:translate-x-0");
        mainContent.classList.remove("md:ml-64");
        if (menuButton) menuButton.classList.remove("rotate-90");
        if (floatingLinks) floatingLinks.classList.add("hidden");
      } else {
        sidebar.classList.add("md:translate-x-0");
        mainContent.classList.add("md:ml-64");
        if (menuButton) menuButton.classList.add("rotate-90");
        if (floatingLinks) {
          floatingLinks.classList.remove("hidden");
          floatingLinks.classList.add("translate-x-full");
          setTimeout(() => openFloating(), 800);
        }
      }
    }
      if (hash !== "#home") {
        window.registrarLog("ACESSO_APP", { app_destino: hash });
      }
    }

  // ADICIONE ESTE BLOCO LOGO ABAIXO DA FUNÇÃO ACIMA:
  window.appNavigate = function(hash) {
    history.pushState(null, null, hash);
    navigate(hash);
  };

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
          
          // Apenas atualiza a notificação ao mudar de tela (sem criar loops!)
          fetchGlobalNotifications();
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
async function performLogout() {

      await window.registrarLog("LOGOUT", { motivo: "Saída manual do usuário" });
      // 1. Destrói a sessão no Supabase
      await supabase.auth.signOut();
      
      // 2. Limpa dados locais
      sessionStorage.clear(); 
      localStorage.clear(); // O Supabase gerencia a persistência agora, podemos limpar tudo

      // 3. Limpa Iframe e esconde Modal
      clearAllApps();
      hideLogoutModal();

      // 4. Mostra a Tela de Login
      if (loginOverlay) {
        loginOverlay.style.display = "flex";
        setTimeout(() => {
          loginOverlay.classList.remove("opacity-0", "pointer-events-none");
        }, 10);
      }

      // 5. Reseta campos
      userInput.value = "";
      passwordInput.value = "";
      generateCaptcha();
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

// --- Lógica de Permissões (Ocultar links restritos) ---
  function applyPermissions() {
    const role = sessionStorage.getItem("cockpit_user_role");
    
    // 1. Obtém as permissões de aplicativos salvos. Se falhar, assume apenas a '#home'
    let allowedApps = [];
    try {
      const storedApps = sessionStorage.getItem("cockpit_allowed_apps");
      allowedApps = storedApps ? JSON.parse(storedApps) : ["#home"];
    } catch (e) {
      allowedApps = ["#home"];
    }

    // 2. Mapeia todos os elementos de links da Sidebar de forma dinâmica
    const menuLinks = [
      { element: document.querySelector('a[href="#dashboard"]'), route: "#dashboard" },
      { element: document.querySelector('a[href="#gerador"]'), route: "#gerador" },
      { element: document.querySelector('a[href="#contratos"]'), route: "#contratos" },
      { element: document.querySelector('a[href="#legislacao"]'), route: "#legislacao" },
      { element: document.querySelector('a[href="#qualificacao"]'), route: "#qualificacao" },
      { element: document.querySelector('a[href="#regmap"]'), route: "#regmap" },
      { element: document.querySelector('a[href="#demandas"]'), route: "#demandas" },
      { element: document.querySelector('a[href="#conversor"]'), route: "#conversor" },
      { element: document.querySelector('a[href="#usuarios"]'), route: "#usuarios" }
    ];

    // 3. Varre e esconde usando a classe do Tailwind "hidden"
    menuLinks.forEach(item => {
      if (item.element) {
        // Regra de Ouro: Admins vêem tudo. Usuários comuns só vêem se a rota estiver listada no allowedApps.
        if (role === "admin" || allowedApps.includes(item.route)) {
          item.element.classList.remove("hidden");
        } else {
          item.element.classList.add("hidden");
        }
      }
    });
  }

  // Sincroniza a chamada legada para não causar erros de carregamento
  function aplicarPermissoesDeMenu() {
    applyPermissions();
  }
  window.aplicarPermissoesDeMenu = aplicarPermissoesDeMenu;

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

// 1. Form CADASTRO (ATUALIZADO: Vai direto para a tabela pedidos_acesso)
  const regForm = document.getElementById("registerForm");
  if (regForm) {
    regForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const btn = document.getElementById("btnSubmitRegister");
      const name = document.getElementById("regName").value.trim();
      const email = document.getElementById("regEmail").value.trim().toLowerCase();

      btn.textContent = "Enviando...";
      btn.disabled = true;

      try {
        // Envia o Nome e o E-mail para a tabela de quarentena no Supabase
        const { error } = await supabase
          .from('pedidos_acesso')
          .insert([{ nome: name, email: email }]);

        if (error) {
          // Verifica se o erro é de e-mail duplicado (já solicitou antes)
          if (error.code === '23505') {
            throw new Error("Já existe uma solicitação pendente ou cadastro para este e-mail.");
          }
          throw error;
        }

        closeRequestModals();
        showSuccess(
          "Solicitação Enviada!",
          "Seus dados foram enviados com sucesso.\n\nAguarde o administrador aprovar seu acesso. Você será avisado quando estiver liberado."
        );
        regForm.reset();

      } catch (err) {
        console.error("Erro ao solicitar acesso:", err);
        showError(err.message || "Erro ao enviar solicitação. Tente novamente.");
      } finally {
        btn.textContent = "Enviar Solicitação";
        btn.disabled = false;
      }
    });
  }

  // 2. Form RESET SENHA (VIA EDGE FUNCTION DE GERAÇÃO)
  const resForm = document.getElementById("resetForm");
  if (resForm) {
    resForm.addEventListener("submit", async (e) => {
      e.preventDefault();
      
      const email = document.getElementById("resEmail").value.trim().toLowerCase();
      const btn = document.getElementById("btnSubmitReset");

      btn.textContent = "Enviando...";
      btn.disabled = true;

      try {
        // Dispara a requisição para a Edge Function
        const { data, error } = await supabase.functions.invoke('gerenciar-usuarios', {
            body: { acao: 'recuperar_senha', email: email }
        });

        // Se o back-end retornar erro (ex: e-mail não encontrado na base)
        if (error) throw error;

        closeRequestModals();
        showSuccess(
          "Senha Enviada!",
          "Verifique a caixa de entrada do seu e-mail. Uma nova senha temporária foi gerada."
        );
        resForm.reset();
        
      } catch (err) {
        console.error("Erro na recuperação:", err);
        // Tenta capturar a mensagem limpa enviada pela Edge Function
        let msgErro = "Não foi possível recuperar a senha.";
        if (err instanceof Error) msgErro = err.message;
        
        showError(msgErro);
      } finally {
        btn.textContent = "Enviar Nova Senha";
        btn.disabled = false;
      }
    });
   }

  // =========================================================
  // LOGICA DO MENU DE PERFIL (SIDEBAR)
  // =========================================================
  const userMenuBtn = document.getElementById("userMenuBtn");
  const userMenuDropdown = document.getElementById("userMenuDropdown");

  // 1. Função para atualizar os dados do menu
  function updateUserMenu() {
    const realName = sessionStorage.getItem("cockpit_user_realname") || "Usuário";
    const email = sessionStorage.getItem("cockpit_user_email") || "Sem e-mail";
    const role = sessionStorage.getItem("cockpit_user_role") || "USER";
    const apelido = sessionStorage.getItem("cockpit_user_apelido"); // Busca o apelido na memória

    // Se tiver apelido usa ele, se não, usa o primeiro nome do nome completo
    const displayName = apelido ? apelido : realName.split(" ")[0];

    // Preenche textos
    const sbName = document.getElementById("sidebarUserName");
    const mName = document.getElementById("menuUserName");
    const mEmail = document.getElementById("menuUserEmail");
    const mRole = document.getElementById("menuUserRole");
    const avatar = document.getElementById("userAvatar");

    if (sbName) sbName.textContent = displayName; // Exibe o apelido ou primeiro nome na barra lateral
    if (mName) mName.textContent = apelido ? `${realName} (${apelido})` : realName; // Exibe Nome Completo (Apelido) no menu expandido
    if (mEmail) mEmail.textContent = email;

    if (mRole) {
      mRole.textContent = role.toUpperCase();
      // Muda a cor da badge se for Admin
      if (role === "admin") {
        mRole.className =
          "text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-purple-100 text-purple-800 border border-purple-200 dark:bg-purple-500/20 dark:text-purple-300 dark:border-purple-500/30";
      }
    }

    // Gera inicial do Avatar baseada no nome de exibição (Apelido ou Nome)
    if (avatar) {
      avatar.textContent = displayName.charAt(0).toUpperCase();
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
  // SISTEMA DE TROCA DE SENHA OBRIGATÓRIA
  // =========================================================
  
  // Se ele desistir e clicar em "Cancelar e Sair"
  window.cancelForcedLogin = async function() {
      await supabase.auth.signOut();
      sessionStorage.clear();
      window.location.reload();
  };

  const forcedPasswordForm = document.getElementById("forcedPasswordForm");
  if (forcedPasswordForm) {
      forcedPasswordForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const newPass = document.getElementById("forcedNewPass").value.trim();
          const confirmPass = document.getElementById("forcedConfirmPass").value.trim();
          const btn = document.getElementById("btnSubmitForcedPass");

          if (newPass !== confirmPass) {
              showError("As senhas digitadas não coincidem.");
              return;
          }

          btn.textContent = "Salvando...";
          btn.disabled = true;

          try {
              // 1. Grava a senha nova e segura no Cofre do Supabase
              const { error: passErr } = await supabase.auth.updateUser({ password: newPass });
              if (passErr) throw passErr;

              // 2. Tira a trava (precisa_trocar_senha: false) da tabela pública
              const { data: { user } } = await supabase.auth.getUser();
              const { error: profErr } = await supabase.from('profiles').update({ precisa_trocar_senha: false }).eq('id', user.id);
              if (profErr) throw profErr;

              // 3. Destranca o Cockpit e deixa ele entrar!
              document.getElementById("forcedPasswordModal").classList.add("hidden");
              if (document.getElementById("loginError")) document.getElementById("loginError").classList.add("hidden");
              
              unlockInterface();
              if (typeof aplicarPermissoesDeMenu === "function") aplicarPermissoesDeMenu();
              if (typeof applyPermissions === "function") applyPermissions();
              updateUserMenu();
              updateUserAvatarVisuals();
              navigate(window.location.hash || "#home");

              showSuccess("Acesso Liberado!", "Sua senha definitiva foi salva com sucesso. Bem-vindo ao Cockpit!");

          } catch (err) {
              showError("Não foi possível alterar a senha: " + err.message);
          } finally {
              btn.textContent = "Salvar Senha e Entrar";
              btn.disabled = false;
          }
      });
  }

  // =========================================================
  // SISTEMA DE "MEU PERFIL" (USUÁRIO LOGADO)
  // =========================================================
  
  let profileCropper = null;
  let profileCroppedBlob = null;

  window.openMyProfile = function() {
      const modal = document.getElementById('myProfileModal');
      const emailField = document.getElementById('myProfileEmail');
      const imgPreview = document.getElementById('myAvatarPreview');
      
      const email = sessionStorage.getItem("cockpit_user_email") || "";
      const avatar = sessionStorage.getItem("cockpit_user_avatar");
      const realName = sessionStorage.getItem("cockpit_user_realname") || "U";
      
      emailField.value = email;
      document.getElementById('myProfileFullName').value = realName;
      document.getElementById('myProfileApelido').value = sessionStorage.getItem("cockpit_user_apelido") || "";
      document.getElementById('myProfileNewPass').value = "";
      profileCroppedBlob = null; // Reseta imagens cortadas anteriormente
      
      // Carrega a imagem atual ou a letra padrão
      if (avatar) {
          imgPreview.src = avatar;
      } else {
          imgPreview.src = `https://ui-avatars.com/api/?background=cbd5e1&color=475569&name=${realName}`;
      }

      // Fecha o dropdown se estiver aberto
      const userMenuDropdown = document.getElementById("userMenuDropdown");
      if (userMenuDropdown) {
          userMenuDropdown.classList.add("hidden");
      }
      
      modal.classList.remove('hidden');
  };

  window.iniciarRecortePerfil = function(event) {
      const file = event.target.files[0];
      if (!file) return;

      const url = URL.createObjectURL(file);
      const imageElement = document.getElementById('imageToCropProfile');
      imageElement.src = url;

      document.getElementById('cropperProfileModal').classList.remove('hidden');

      if (profileCropper) profileCropper.destroy();

      profileCropper = new Cropper(imageElement, {
          aspectRatio: 1, 
          viewMode: 1,
          dragMode: 'move',
          autoCropArea: 1,
          guides: true,
          background: false
      });
  };

  window.cancelarRecortePerfil = function() {
      document.getElementById('cropperProfileModal').classList.add('hidden');
      document.getElementById('myAvatarInput').value = ''; 
      profileCroppedBlob = null;
      if (profileCropper) profileCropper.destroy();
  };

  window.confirmarRecortePerfil = function() {
      if (!profileCropper) return;
      const canvas = profileCropper.getCroppedCanvas({ width: 400, height: 400, imageSmoothingEnabled: true });
      canvas.toBlob((blob) => {
          profileCroppedBlob = blob;
          document.getElementById('myAvatarPreview').src = URL.createObjectURL(blob);
          document.getElementById('cropperProfileModal').classList.add('hidden');
      }, 'image/jpeg', 0.8);
  };

  const myProfileForm = document.getElementById("myProfileForm");
  if (myProfileForm) {
      myProfileForm.addEventListener("submit", async (e) => {
          e.preventDefault();
          const btn = document.getElementById("btnSubmitMyProfile");
          const newPass = document.getElementById("myProfileNewPass").value.trim();
          const apelido = document.getElementById("myProfileApelido").value.trim(); 
          
          btn.textContent = "Salvando...";
          btn.disabled = true;

          try {
              const { data: { user } } = await supabase.auth.getUser();
              if (!user) throw new Error("Usuário não autenticado.");

              let newAvatarUrl = null;

              // 1. UPLOAD DA IMAGEM SE FOI ALTERADA
              if (profileCroppedBlob) {
                  const fileName = `${Date.now()}_${Math.random().toString(36).substring(7)}.jpg`;
                  const filePath = `avatares/${fileName}`; 

                  const { error: uploadError } = await supabase.storage.from('avatars').upload(filePath, profileCroppedBlob, { contentType: 'image/jpeg' });
                  if (uploadError) throw uploadError;

                  const { data } = supabase.storage.from('avatars').getPublicUrl(filePath);
                  newAvatarUrl = data.publicUrl;
              }

              // 2. ATUALIZA A SENHA NO AUTH (se informada)
              if (newPass) {
                  const { error: passErr } = await supabase.auth.updateUser({ password: newPass });
                  if (passErr) throw passErr;
              }

// 3. ATUALIZA O PERFIL (Apelido e/ou Imagem)
              const profileUpdateData = { apelido: apelido };

              if (newAvatarUrl) {
                  await supabase.auth.updateUser({ data: { avatar_url: newAvatarUrl } });
                  profileUpdateData.avatar_url = newAvatarUrl;
                  sessionStorage.setItem("cockpit_user_avatar", newAvatarUrl);
              }

              const { error: profErr } = await supabase.from('profiles').update(profileUpdateData).eq('id', user.id);
              if (profErr) throw profErr;

              sessionStorage.setItem("cockpit_user_apelido", apelido); // Salva o apelido novo

              document.getElementById('myProfileModal').classList.add('hidden');
              updateUserAvatarVisuals(); // Atualiza a bolinha no canto da tela
              updateUserMenu(); // Atualiza o menu de perfil

              window.registrarLog("PERFIL_ATUALIZADO", { 
                  trocou_senha: !!newPass, 
                  trocou_avatar: !!newAvatarUrl,
                  novo_apelido: apelido 
              });
              
              showSuccess("Perfil Atualizado", "Suas alterações foram salvas com sucesso!");

          } catch (err) {
              console.error("Erro ao atualizar perfil:", err);
              showError("Erro ao salvar: " + err.message);
          } finally {
              btn.textContent = "Salvar Alterações";
              btn.disabled = false;
          }
      });
  }

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
  Object.values(openFrames).forEach(iframe => {
    if (iframe && iframe.contentWindow) {
      iframe.contentWindow.postMessage(
        { type: "THEME_CHANGE", theme: theme },
        "*"
      );
    }
  });
  }

  // 4. Garantir que o iframe receba o tema assim que carregar a página
  //const frameEl = document.getElementById("appFrame");
  //if (frameEl) {
  //  frameEl.addEventListener("load", () => {
  //    const currentTheme = document.documentElement.classList.contains("dark")
 //       ? "dark"
  //      : "light";
  //    broadcastTheme(currentTheme);
  //  });
//  }


  // Aguarda o app filho pedir os dados
  window.addEventListener("message", (event) => {
    // É uma boa prática verificar a origem por segurança
    if (event.data === "GET_USER_DATA") {
        const userData = {
            id: sessionStorage.getItem("cockpit_user_id"),
            name: sessionStorage.getItem("cockpit_user_realname"),
            role: sessionStorage.getItem("cockpit_user_role"),
            apelido: sessionStorage.getItem("cockpit_user_apelido")
        };
        
        // Envia os dados para o iframe
        event.source.postMessage({
            type: "USER_DATA_RESPONSE",
            payload: userData
        }, event.origin);
    }
  });

  // Objeto que armazena a quantidade de notificações de cada app do Cockpit
const globalNotificationState = {
    demandas: 0
    // No futuro, se houver 'contratos': 0, etc.
};

// Escuta os pedidos de LOG vindos dos iframes filhos
  window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "REGISTRAR_LOG") {
          const { acao, detalhes, appOrigem } = event.data.payload;
          
          // Repassa para a função global que criamos
          if (typeof window.registrarLog === "function") {
              window.registrarLog(acao, detalhes, appOrigem);
          }
      }
  });

// Escuta as mensagens dos iframes filhos
window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "UPDATE_NOTIFICATIONS") {
        const { appName, count } = event.data;
        
        // 1. Atualiza o estado daquele app específico
        globalNotificationState[appName] = count;
        
        // 2. Atualiza a Badge do Menu Lateral (se existir)
        const menuBadge = document.getElementById(`badge-menu-${appName}`);
        if (menuBadge) {
            menuBadge.textContent = count;
            if (count > 0) {
                menuBadge.classList.remove('hidden');
            } else {
                menuBadge.classList.add('hidden');
            }
        }

        // 3. Atualiza o Sino Global (Soma de todos os apps)
        const totalNotificacoes = Object.values(globalNotificationState).reduce((a, b) => a + b, 0);
        const sinoBadge = document.getElementById('badge-sino-global');
        
        if (sinoBadge) {
            sinoBadge.textContent = totalNotificacoes;
            if (totalNotificacoes > 0) {
                sinoBadge.classList.remove('hidden', 'scale-0');
                sinoBadge.classList.add('scale-100');
                // Faz o sino dar um "pulo" rápido para chamar atenção
                const btnSino = document.getElementById('btn-global-notifications');
                btnSino.classList.add('animate-bounce');
                setTimeout(() => btnSino.classList.remove('animate-bounce'), 1000);
            } else {
                sinoBadge.classList.remove('scale-100');
                sinoBadge.classList.add('scale-0');
                setTimeout(() => sinoBadge.classList.add('hidden'), 300);
            }
        }
    }
});

  // ==========================================================
  // MÓDULO: ESCUTA ATIVA DE DEMANDAS (REALTIME)
  // ==========================================================
  function startDemandasListener() {
    const userRealName = sessionStorage.getItem("cockpit_user_realname");
    
    if (!userRealName) return;

    // Remove inscrições antigas para evitar duplicidade de notificações se o usuário deslogar/logar
    if (window.demandasChannel) {
        window.demandasChannel.unsubscribe();
    }

    console.log("📡 Iniciando escuta em tempo real para demandas de:", userRealName);

    // Inscreve o App Pai no canal de alterações da tabela Demandas
    window.demandasChannel = supabase
        .channel('custom-demandas-updates')
        .on(
            'postgres_changes',
            {
                event: 'UPDATE', // Escuta apenas edições (mudanças de status, prazos, etc)
                schema: 'public',
                table: 'demandas',
            },
            (payload) => {
                const novaDemanda = payload.new;

                // Verifica se a alteração diz respeito a você (Responsável OU Solicitante)
                if (novaDemanda.responsavel_nome === userRealName || novaDemanda.solicitante_nome === userRealName) {
                    
                    // 1. Dispara uma notificação no Desktop/Celular
                    if ("Notification" in window && Notification.permission === "granted") {
                        new Notification(`Demanda Atualizada!`, {
                            body: `A demanda "${novaDemanda.titulo}" agora está: ${novaDemanda.status}`,
                            icon: "icons/android-chrome-192x192.png", // Seu ícone do Cockpit
                            silent: false
                        });
                    }

                    // 2. Atualiza os dados do Sininho Global silenciosamente
                    if (typeof window.fetchGlobalNotifications === "function") {
                        window.fetchGlobalNotifications();
                    }
                    
                    console.log(`🔔 Notificação de Realtime disparada: ${novaDemanda.titulo}`);
                }
            }
        )
        .subscribe();
  }
  window.startDemandasListener = startDemandasListener;



  // --- SISTEMA GLOBAL DE NOTIFICAÇÕES ---

  // 1. Função para abrir/fechar o modal do sino
  window.toggleNotificationsModal = function() {
      const modal = document.getElementById("notificationsModal");
      if (!modal) return;
      
      const isHidden = modal.classList.contains("hidden");
      if (isHidden) {
          modal.classList.remove("hidden");
          // Busca os dados mais recentes ao abrir
          fetchGlobalNotifications();
          setTimeout(() => {
              modal.classList.remove("opacity-0", "scale-95");
              modal.classList.add("opacity-100", "scale-100");
          }, 10);
      } else {
          modal.classList.remove("opacity-100", "scale-100");
          modal.classList.add("opacity-0", "scale-95");
          setTimeout(() => modal.classList.add("hidden"), 200);
      }
  };

  // 2. Função para buscar os dados no Supabase
  window.fetchGlobalNotifications = async function() {
      const role = sessionStorage.getItem('cockpit_user_role');
      const userName = sessionStorage.getItem('cockpit_user_realname');

      const coordenacao = sessionStorage.getItem("cockpit_user_coordenacao");
      const isResponsavel = sessionStorage.getItem("cockpit_user_responsavel") === "true";
      const isGestorCGCF = (coordenacao === "CGCF" && isResponsavel) || role === "admin";
      
      if (!userName) return; // Não faz nada se não estiver logado

      try {
          let totalNotificacoes = 0;
          let htmlList = "";

          // Consulta 1: Logs de Demandas (Para o usuário atual que não foram lidas)
          const { data: demandasData, error: errDemandas } = await supabase
              .from('demandas_logs')
              .select('*')
              .eq('destinatario_nome', userName)
              .eq('lida', false)
              .order('data_criacao', { ascending: false });

          if (!errDemandas && demandasData && demandasData.length > 0) {
              totalNotificacoes += demandasData.length;
              
              // Cria um cabeçalho e lista os itens de demandas
              htmlList += `<div class="px-2 pt-2 pb-1 text-[10px] font-bold text-blue-500 uppercase">Demandas (${demandasData.length})</div>`;
              
              demandasData.forEach(notif => {
                  const dataFormatada = new Date(notif.data_criacao).toLocaleString('pt-BR');
                  htmlList += `
                      <div onclick="appNavigate('#demandas'); toggleNotificationsModal();" class="cursor-pointer p-2 rounded-lg bg-blue-50 dark:bg-slate-700/50 hover:bg-blue-100 dark:hover:bg-slate-600 text-xs transition-colors mb-1 border-l-2 border-blue-500">
                          <p class="font-bold text-slate-800 dark:text-slate-200">${notif.ator_nome}</p>
                          <p class="text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">${notif.mensagem}</p>
                          <p class="text-[9px] text-slate-400 mt-1">${dataFormatada}</p>
                      </div>`;
              });
          }

          // Consulta 2: Pedidos de Acesso (Apenas se for Admin)
          if (role === 'admin') {
              const { data: usuariosData, error: errUsuarios } = await supabase
                  .from('pedidos_acesso')
                  .select('*')
                  .eq('status', 'pendente')
                  .order('created_at', { ascending: false });

              if (!errUsuarios && usuariosData && usuariosData.length > 0) {
                  totalNotificacoes += usuariosData.length;
                  
                  htmlList += `<div class="px-2 pt-3 pb-1 text-[10px] font-bold text-green-500 uppercase mt-2 border-t border-slate-100 dark:border-slate-700">Novos Usuários (${usuariosData.length})</div>`;
                  
                  usuariosData.forEach(user => {
                      const dataFormatada = new Date(user.created_at).toLocaleDateString('pt-BR');
                      htmlList += `
                          <div onclick="appNavigate('#usuarios'); toggleNotificationsModal();" class="cursor-pointer p-2 rounded-lg bg-emerald-50 dark:bg-emerald-900/10 hover:bg-emerald-100 dark:hover:bg-emerald-900/20 text-xs transition-colors mb-1 border-l-2 border-emerald-500">
                              <p class="font-bold text-slate-800 dark:text-slate-200">${user.nome} solicitou acesso</p>
                              <p class="text-slate-600 dark:text-slate-400 mt-0.5">${user.email}</p>
                              <p class="text-[9px] text-slate-400 mt-1">${dataFormatada}</p>
                          </div>`;
                  });
              }
          }

        // CONSULTA 3: ALERTA DE VENCIMENTO DE CONTRATOS
        // --------------------------------------------------------
        // Só busca se o usuário tiver permissão para ver contratos (Admin ou listado no allowed_apps)
        const allowedApps = JSON.parse(sessionStorage.getItem("cockpit_allowed_apps") || '[]');
        if (role === 'admin' || allowedApps.includes('#contratos')) {
            
            const { data: contratosData, error: errContratos } = await supabase
                .from('contratos')
                .select('id, parentId, dataFim, processoSei, numeroContrato');

            if (!errContratos && contratosData && contratosData.length > 0) {
                const hoje = new Date();
                hoje.setHours(0, 0, 0, 0);

                const datasFimReais = {};
                const infoContratos = {};

                // 1. Agrupa os contratos e aditivos para achar a data de término real
                contratosData.forEach(c => {
                    const paiId = c.parentId || c.id;
                    const dataFim = c.dataFim ? new Date(c.dataFim + "T00:00:00") : null;

                    // Salva os dados do contrato principal para exibição
                    if (!c.parentId) {
                        infoContratos[paiId] = c.processoSei || c.numeroContrato || 'Contrato Sem Nome';
                    }

                    // Encontra a maior data de fim (considerando aditivos de prazo)
                    if (dataFim) {
                        if (!datasFimReais[paiId] || dataFim > datasFimReais[paiId]) {
                            datasFimReais[paiId] = dataFim;
                        }
                    }
                });

                let alertasContratosHTML = "";
                let qtdContratosVencendo = 0;

                // 2. Verifica a regra de negócio (90 dias)
                for (const [id, dataFimReal] of Object.entries(datasFimReais)) {
                    const diffTime = dataFimReal - hoje;
                    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                    // Regra: Vence em até 90 dias (mas ainda não venceu)
                    if (diffDays >= 0 && diffDays <= 90) {
                        qtdContratosVencendo++;
                        totalNotificacoes++; // Soma na badge vermelha global do sino

                        let nivelAlerta = diffDays <= 30 ? 'text-red-600 bg-red-50 border-red-500' : 'text-orange-600 bg-orange-50 border-orange-400';
                        let icone = diffDays <= 30 ? '🚨' : '⚠️';
                        let acao = diffDays <= 30 ? 'Urgente: Renovar' : 'Iniciar Renovação';

                        // AS DUAS LINHAS QUE FALTARAM ESTÃO AQUI:
                        const dataExibicao = new Date(dataFimReal);
                        dataExibicao.setDate(dataExibicao.getDate() - 1);

                        alertasContratosHTML += `
                            <div onclick="appNavigate('#contratos'); toggleNotificationsModal();" class="cursor-pointer p-2 rounded-lg hover:brightness-95 text-xs transition-colors mb-1 border-l-2 ${nivelAlerta}">
                                <div class="flex justify-between items-start gap-2">
                                    <p class="font-bold text-[10px] break-all leading-tight mt-0.5">${icone} ${infoContratos[id]}</p>
                                    <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-white/50 shrink-0">${acao}</span>
                                </div>
                                <p class="mt-1 opacity-90 font-medium">Vence em ${diffDays} dias (${dataExibicao.toLocaleDateString('pt-BR')})</p>
                            </div>`;
                    }
                }

                // 3. Adiciona na lista final se houver alertas
                if (qtdContratosVencendo > 0) {
                    htmlList += `<div class="px-2 pt-3 pb-1 text-[10px] font-bold text-orange-500 uppercase mt-2 border-t border-slate-100 dark:border-slate-700">Contratos a Vencer (${qtdContratosVencendo})</div>`;
                    htmlList += alertasContratosHTML;
                }
            }
        }

        // --------------------------------------------------------
        // CONSULTA 4: ALERTAS DE PRAZOS DE DEMANDAS (MINHAS E DELEGADAS)
        // --------------------------------------------------------
        // O '.or' busca demandas onde você é o responsável OU o solicitante
        const { data: demandasPrazo, error: errPrazo } = await supabase
            .from('demandas')
            .select('id, titulo, prazo_limite, prioridade, responsavel_nome, solicitante_nome')
            .or(`responsavel_nome.eq."${userName}",solicitante_nome.eq."${userName}"`)
            .neq('status', 'Concluído')
            .neq('status', 'Cancelado')
            .not('prazo_limite', 'is', null);

        if (!errPrazo && demandasPrazo && demandasPrazo.length > 0) {
            const hojeDemandas = new Date();
            hojeDemandas.setHours(0, 0, 0, 0);
            
            let alertasDemandasHTML = "";
            let qtdDemandasVencendo = 0;

            demandasPrazo.forEach(d => {
                const dataPrazo = new Date(d.prazo_limite + "T12:00:00Z"); 
                dataPrazo.setHours(0, 0, 0, 0);
                
                const diffTime = dataPrazo - hojeDemandas;
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

                // Dispara o radar apenas se atrasou ou faltam 7 dias (ou menos)
                if (diffDays <= 7) {
                    qtdDemandasVencendo++;
                    totalNotificacoes++; 

                    // Verifica com quem está a demanda para exibir no card
                    const isMinha = d.responsavel_nome === userName;
                    const quemFaz = isMinha ? 'Você' : (d.responsavel_nome || 'Ninguém');
                    const labelDelegada = isMinha ? '' : `<span class="block mt-1.5 text-[9px] text-slate-500 uppercase font-bold bg-white/40 dark:bg-black/20 inline-block px-1.5 py-0.5 rounded shadow-sm border border-slate-200/50">👤 Com: ${quemFaz}</span>`;

                    let nivelAlerta = '';
                    let icone = '';
                    let textoPrazo = '';

                    // Matriz de cores e urgência
                    if (diffDays < 0) {
                        nivelAlerta = 'text-red-700 bg-red-100 border-red-600 shadow-[0_0_10px_rgba(239,68,68,0.2)]';
                        icone = '❌';
                        textoPrazo = `Atrasada há ${Math.abs(diffDays)} dia(s)`;
                    } else if (diffDays === 0) {
                        nivelAlerta = 'text-red-600 bg-red-50 border-red-500 font-bold';
                        icone = '⏰';
                        textoPrazo = 'Vence HOJE';
                    } else if (diffDays <= 3) {
                        nivelAlerta = 'text-orange-600 bg-orange-50 border-orange-400';
                        icone = '⚠️';
                        textoPrazo = `Vence em ${diffDays} dias`;
                    } else { 
                        nivelAlerta = 'text-blue-600 bg-blue-50 border-blue-400';
                        icone = '📅';
                        textoPrazo = `Vence em ${diffDays} dias`;
                    }

                    alertasDemandasHTML += `
                        <div onclick="appNavigate('#demandas'); toggleNotificationsModal();" class="cursor-pointer p-2 rounded-lg hover:brightness-95 text-xs transition-all mb-1 border-l-4 ${nivelAlerta}">
                            <div class="flex justify-between items-start gap-2">
                                <p class="font-bold text-[11px] break-all leading-tight mt-0.5">${icone} ${d.titulo}</p>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-white/60 shrink-0">${d.prioridade}</span>
                            </div>
                            <p class="mt-1 opacity-90 font-medium">${textoPrazo} (${dataPrazo.toLocaleDateString('pt-BR')})</p>
                            ${labelDelegada}
                        </div>`;
                }
            });

            if (qtdDemandasVencendo > 0) {
                htmlList += `<div class="px-2 pt-3 pb-1 text-[10px] font-bold text-red-500 uppercase mt-2 border-t border-slate-100 dark:border-slate-700">Prazos de Demandas (${qtdDemandasVencendo})</div>`;
                htmlList += alertasDemandasHTML;
            }
        }

        // --------------------------------------------------------
        // CONSULTA 5: SUGESTÕES DE VÍNCULO CNAE x FAMÍLIA
        // --------------------------------------------------------
        // Só busca e exibe se o usuário for o Gestor da CGCF ou Admin
        if (isGestorCGCF) {
            const { data: sugestoesData, error: errSugestoes } = await supabase
                .from('sugestoes_cnae_familia')
                .select('familia_codigo, cnae_codigo, quantidade, usuarios_sugeriram, created_at')
                .eq('status', 'pendente')
                .order('created_at', { ascending: false });

            if (!errSugestoes && sugestoesData && sugestoesData.length > 0) {
                totalNotificacoes += sugestoesData.length;
                
                htmlList += `<div class="px-2 pt-3 pb-1 text-[10px] font-bold text-purple-500 uppercase mt-2 border-t border-slate-100 dark:border-slate-700">Sugestões de Vínculo (${sugestoesData.length})</div>`;
                
                sugestoesData.forEach(sug => {
                    const dataFormatada = new Date(sug.created_at).toLocaleDateString('pt-BR');
                    // Pega apenas o primeiro nome de quem sugeriu para não quebrar o layout se houver muitos
                    const primeiroSugeridor = sug.usuarios_sugeriram.split(',')[0]; 

                    htmlList += `
                        <div onclick="appNavigate('#qualificacao'); toggleNotificationsModal();" class="cursor-pointer p-2 rounded-lg bg-purple-50 dark:bg-purple-900/10 hover:bg-purple-100 dark:hover:bg-purple-900/20 text-xs transition-colors mb-1 border-l-2 border-purple-500">
                            <div class="flex justify-between items-start">
                                <p class="font-bold text-slate-800 dark:text-slate-200">Família ${sug.familia_codigo}</p>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200 shadow-sm shrink-0">
                                    ${sug.quantidade} Sugestão(ões)
                                </span>
                            </div>
                            <p class="text-slate-600 dark:text-slate-300 mt-0.5">Novo CNAE: <span class="font-mono">${sug.cnae_codigo}</span></p>
                            <p class="text-[9px] text-slate-400 mt-1">${dataFormatada} • Por: ${primeiroSugeridor}</p>
                        </div>`;
                });
            }
        }

        

          // 3. Atualiza a Interface
          const listContainer = document.getElementById("notificationsList");
          const sinoBadge = document.getElementById("badge-sino-global");

          if (totalNotificacoes > 0) {
              listContainer.innerHTML = htmlList;
              
              sinoBadge.textContent = totalNotificacoes > 99 ? '99+' : totalNotificacoes;
              sinoBadge.classList.remove('hidden', 'scale-0');
              sinoBadge.classList.add('scale-100');
          } else {
              listContainer.innerHTML = '<div class="text-center py-8"><span class="text-2xl mb-2 block">🎉</span><p class="text-xs text-slate-500 font-medium">Tudo limpo por aqui!<br>Você não tem novas notificações.</p></div>';
              
              sinoBadge.classList.remove('scale-100');
              sinoBadge.classList.add('scale-0');
              setTimeout(() => sinoBadge.classList.add('hidden'), 300);
          }

      } catch (error) {
          console.error("Erro ao carregar notificações globais:", error);
      }
  };

  // Fechar o modal se clicar fora dele
  document.addEventListener('click', function(event) {
      const modal = document.getElementById('notificationsModal');
      const btn = document.getElementById('btn-global-notifications');
      
      if (modal && !modal.classList.contains('hidden')) {
          if (!modal.contains(event.target) && !btn.contains(event.target)) {
              toggleNotificationsModal();
          }
      }
  });

  // Executa imediatamente na inicialização da página para checar o estado atual
  aplicarPermissoesDeMenu();

  // Torna a função global para que o formulário de login possa acioná-la
  window.aplicarPermissoesDeMenu = aplicarPermissoesDeMenu;

});
