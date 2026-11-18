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
        : (hash === "#painel" ? "Painel Admin" : hash);

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
    // [SEGURANÇA] HELPERS
    // =========================================================
    // Escapa texto vindo do banco antes de montar HTML (evita XSS armazenado)
    function escapeHtml(value) {
      return String(value ?? "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }
    // Só aceita mensagens da mesma origem E vindas de um iframe de app aberto pelo Cockpit
    function isTrustedMessage(event) {
      if (event.origin !== window.location.origin) return false;
      return Object.values(openFrames).some(
        (f) => f && f.contentWindow && f.contentWindow === event.source
      );
    }

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

  // =========================================================
  // [MONITOR DE APIs] Telemetria das chamadas a APIs externas
  // Informa ao Supabase (api_registrar_evento) o resultado de cada consulta real.
  // Nunca atrapalha o app: é "dispara e esquece" e qualquer erro é ignorado.
  // Eventos gerados antes do login ficam numa fila curta e saem após o login.
  // =========================================================
  const apiTelFila = [];
  let apiTelAtiva = true;      // vira false se o SQL do monitor ainda não foi aplicado
  let apiTelEnviando = false;

  function apiTel(api, ok, status, latenciaMs, erro, detalhes) {
    if (!apiTelAtiva) return;
    const st = Number(status);
    if (apiTelFila.length >= 20) apiTelFila.shift();
    apiTelFila.push({
      p_api: api,
      p_ok: !!ok,
      p_status: status != null && Number.isFinite(st) ? Math.round(st) : null,
      p_latencia_ms: Number.isFinite(latenciaMs) ? Math.round(latenciaMs) : null,
      p_erro: erro ? String(erro).slice(0, 300) : null,
      p_detalhes: detalhes || {},
    });
    apiTelFlush();
  }

  async function apiTelFlush() {
    if (apiTelEnviando || !apiTelAtiva || !apiTelFila.length) return;
    apiTelEnviando = true;
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return; // ainda sem login: mantém na fila
      while (apiTelFila.length) {
        const ev = apiTelFila.shift();
        const { error } = await supabase.rpc("api_registrar_evento", ev);
        if (error && (error.code === "PGRST202" || error.code === "42883")) {
          apiTelAtiva = false; // função não existe: para de tentar nesta sessão
          apiTelFila.length = 0;
          break;
        }
      }
    } catch (e) { /* telemetria nunca derruba o app */ }
    finally { apiTelEnviando = false; }
  }


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
    apiTelFlush(); // [MONITOR] envia eventos de API que ficaram na fila antes do login
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
      const { data, error } = await supabase.auth.signInWithPassword({
          email: inputEmail,
          password: inputPass,
      });

      if (error) {
        console.warn("Falha no login:", error.message); // [SEGURANÇA] nunca logar e-mail/senha digitados

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
    "#vistoria": "apps/vistoria/index.html",
    "#quiz": "apps/quiz/index.html",
    "#chatstorage": "apps/chatstorage/index.html",
    "#capacitacao": "apps/capacitacao/index.html",
    "#apresentacoes": "apps/apresentacoes/index.html",
    "#painel": "apps/painel-admin/index.html"
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
  // Sidebar como gaveta sobre o conteúdo (desktop e celular): começa oculta, não empurra o layout
  window.toggleSidebar = function () {
    const isClosed = sidebar.classList.contains("-translate-x-full");
    if (menuButton) menuButton.classList.toggle("rotate-90", isClosed);

    if (isClosed) {
      sidebar.classList.remove("-translate-x-full");
      overlay.classList.remove("hidden");
      setTimeout(() => overlay.classList.remove("opacity-0"), 10);
    } else {
      sidebar.classList.add("-translate-x-full");
      overlay.classList.add("opacity-0");
      setTimeout(() => overlay.classList.add("hidden"), 300);
    }
  };

  // Mantém o nome original (usado em vários pontos), mas agora fecha em qualquer largura
  function closeSidebarOnMobile() {
    if (!sidebar.classList.contains("-translate-x-full")) {
      window.toggleSidebar();
    }
  }

  // Esc fecha a sidebar
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeSidebarOnMobile();
  });

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

      // Painel Admin: exclusivo de administrador, mesmo que conste em allowed_apps
      if (hash === "#painel" && role !== "admin") {
        showError("Acesso Negado: o Painel Admin é exclusivo de administradores.");
        navigate("#home");
        return;
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
                newIframe.contentWindow.postMessage({ type: "THEME_CHANGE", theme: currentTheme }, window.location.origin);
            }
        });
        
        appContainer.appendChild(newIframe);
        openFrames[hash] = newIframe;
    }

    // Atualiza menu e abas visuais
    updateActiveLink(hash);
    renderTabs();

    // --- LÓGICA DO FLOATING LINKS E SIDEBAR ---
    // A sidebar não é mais aberta automaticamente: ao navegar, ela é fechada se estiver aberta.
    closeSidebarOnMobile();
    if (window.innerWidth >= 768) {
      if (hash === "#home") {
        if (floatingLinks) floatingLinks.classList.add("hidden");
      } else {
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

  // Painel Admin (opção do menu do usuário): fecha o menu e navega
  window.abrirPainelAdmin = function () {
    const dd = document.getElementById("userMenuDropdown");
    if (dd) {
      dd.classList.remove("scale-100", "opacity-100");
      dd.classList.add("scale-95", "opacity-0", "hidden");
    }
    history.pushState(null, null, "#painel");
    navigate("#painel");
    closeSidebarOnMobile();
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
  // CÉU DO RELÓGIO: sol/lua, cor do fundo e TEMPO (nuvens, chuva, neblina, trovoada)
  // seguem o horário e a previsão reais de Salvador
  // =========================================================
  /* <sky> */
  // Horários aproximados, usados só até a API informar o nascer/pôr do sol de hoje
  const SKY_FALLBACK = { sunrise: 330, sunset: 1065 };
  let skyTimes = { sunrise: SKY_FALLBACK.sunrise, sunset: SKY_FALLBACK.sunset, real: false, srTxt: "", ssTxt: "" };
  // Previsão atual vinda da API: { code (WMO), cloud (%), wind (km/h) }
  let skyRaw = null;

  const skyLerp = (a, b, k) => a + (b - a) * k;
  const skyMix = (c1, c2, k) => c1.map((v, i) => Math.round(skyLerp(v, c2[i], k)));
  const skyRgb = (c) => "rgb(" + c[0] + ", " + c[1] + ", " + c[2] + ")";
  const skyClamp = (v, a, b) => Math.min(b, Math.max(a, v));

  // "2026-11-17T05:08" -> minutos desde 00:00 (null se o formato não vier como esperado)
  function skyParseTime(iso) {
    const m = /T(\d{2}):(\d{2})/.exec(String(iso || ""));
    return m ? Number(m[1]) * 60 + Number(m[2]) : null;
  }
  function skyValid(sr, ss) {
    return Number.isFinite(sr) && Number.isFinite(ss) && sr >= 0 && ss < 1440 && ss - sr >= 360 && ss - sr <= 1080;
  }

  // Paleta ao longo do dia, ancorada no nascer (sr) e no pôr do sol (ss), em minutos
  function skyKeyframes(sr, ss) {
    const mid = (sr + ss) / 2;
    return [
      { t: sr - 90,  top: [10, 14, 38],   bot: [24, 34, 82] },     // noite
      { t: sr - 35,  top: [44, 38, 96],   bot: [226, 112, 92] },   // alvorada
      { t: sr + 20,  top: [88, 150, 214], bot: [255, 190, 120] },  // nascer do sol
      { t: sr + 120, top: [74, 160, 232], bot: [170, 214, 250] },  // manhã
      { t: mid,      top: [56, 150, 236], bot: [150, 208, 252] },  // meio-dia
      { t: ss - 110, top: [70, 150, 222], bot: [186, 214, 238] },  // tarde
      { t: ss - 30,  top: [96, 128, 196], bot: [255, 176, 96] },   // fim de tarde
      { t: ss + 10,  top: [74, 56, 130],  bot: [240, 108, 72] },   // pôr do sol
      { t: ss + 50,  top: [34, 30, 84],   bot: [120, 66, 120] },   // crepúsculo
      { t: ss + 100, top: [10, 14, 38],   bot: [24, 34, 82] },     // noite
    ];
  }
  function skyColors(min, sr, ss) {
    const kf = skyKeyframes(sr, ss);
    const first = kf[0], last = kf[kf.length - 1];
    if (min <= first.t || min >= last.t) return { top: first.top, bot: first.bot };
    for (let i = 0; i < kf.length - 1; i++) {
      const a = kf[i], b = kf[i + 1];
      if (min >= a.t && min <= b.t) {
        const k = (min - a.t) / (b.t - a.t);
        return { top: skyMix(a.top, b.top, k), bot: skyMix(a.bot, b.bot, k) };
      }
    }
    return { top: first.top, bot: first.bot };
  }

  // Contraste (WCAG) para escolher texto claro ou escuro sobre o fundo atual
  function skyLum(c) {
    const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
    return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]);
  }
  function skyContrast(l1, l2) {
    const hi = Math.max(l1, l2), lo = Math.min(l1, l2);
    return (hi + 0.05) / (lo + 0.05);
  }
  const SKY_DARK_INK = [11, 25, 52];
  // veil (opcional): cor e opacidade média das nuvens/névoa que ficam por cima do fundo
  function skyInk(top, bot, veil) {
    let mid = skyMix(top, bot, 0.5);
    if (veil) mid = skyMix(mid, veil.c, veil.a);
    const L = skyLum(mid);
    const white = skyContrast(1, L), dark = skyContrast(skyLum(SKY_DARK_INK), L);
    return white >= dark
      ? { color: "#ffffff", halo: "0 1px 2px rgba(0,0,0,.55)", ratio: white, mid }
      : { color: skyRgb(SKY_DARK_INK), halo: "0 0 3px rgba(255,255,255,.55)", ratio: dark, mid };
  }

  // Sol durante o dia, lua à noite; p vai de 0 (horizonte esquerdo) a 1 (horizonte direito)
  function skyBody(min, sr, ss) {
    if (min >= sr && min <= ss) return { kind: "sun", p: skyClamp((min - sr) / (ss - sr), 0, 1) };
    const night = 1440 - ss + sr;
    return { kind: "moon", p: skyClamp((((min - ss) % 1440) + 1440) % 1440 / night, 0, 1) };
  }
  // Posição em % do quadro: sobe do horizonte (embaixo), encosta no alto ao meio-dia e desce
  function skyBodyPos(p) {
    return { x: 8 + 84 * p, y: 96 - 82 * Math.sin(Math.PI * p) };
  }
  function skyStarsOpacity(top) {
    return skyClamp((0.08 - skyLum(top)) / 0.07, 0, 1);
  }
  function skyPhaseLabel(min, t) {
    if (!t.real) return "";
    if (min < t.sunrise) return "🌅 Nascer do sol às " + t.srTxt;
    if (min <= t.sunset) return "🌇 Pôr do sol às " + t.ssTxt;
    return "🌙 Noite em Salvador";
  }

  // ---------- TEMPO: código WMO da previsão + cobertura de nuvens ----------
  const SKY_DROPS = [0, 4, 8, 12, 16]; // gotas visíveis por intensidade (0 a 4)
  function skyWeather(code, cloudPct, wind, night) {
    const c = Number(code);
    const pct = Number.isFinite(cloudPct) ? skyClamp(cloudPct, 0, 100) / 100 : null;
    const dur = skyClamp(95 - 2.2 * (Number.isFinite(wind) ? wind : 15), 28, 95); // vento mais forte = nuvens mais rápidas
    // Céu com nuvens (sem chuva): tudo deriva da cobertura
    const cov = (id, label, icon, cover) => {
      const k = Math.max(0, cover - 0.1) / 0.9; // até ~10% de nuvens o céu fica exatamente como no céu limpo
      return {
      id, label, icon, cover, drops: 0, snow: false, fog: 0, storm: false,
      desat: 0.6 * k, dark: 0.12 * k, cloudDark: 0,
      bodyVis: skyClamp(1.1 - 0.9 * cover * cover, 0, 1),
      starVis: skyClamp(1.15 - 1.35 * cover * cover, 0, 1), // estrelas somem antes do sol (nuvens as cobrem primeiro)
      rainK: 1, dur,
      };
    };
    // Precipitação: tier 1 (fraca) a 4 (forte)
    const wet = (id, label, icon, tier, o) => Object.assign({
      id, label, icon, cover: 0.8 + 0.05 * tier, drops: SKY_DROPS[tier], snow: false, fog: 0, storm: false,
      desat: 0.45 + 0.06 * tier, dark: 0.1 + 0.07 * tier, cloudDark: 0.25 + 0.08 * tier,
      bodyVis: Math.max(0, 0.14 - 0.04 * tier), starVis: Math.max(0, 0.1 - 0.03 * tier),
      rainK: 1.15 - 0.12 * tier, dur,
    }, o || {});

    if (c === 1) return cov("mostly-clear", "Predominantemente Limpo", night ? "🌙" : "🌤️", pct == null ? 0.25 : skyClamp(pct, 0.1, 0.45));
    if (c === 2) return cov("partly", "Parcialmente Nublado", night ? "☁️" : "⛅", pct == null ? 0.55 : skyClamp(pct, 0.4, 0.75));
    if (c === 3) return cov("overcast", "Nublado", "☁️", pct == null ? 0.95 : skyClamp(pct, 0.85, 1));
    if (c === 45 || c === 48) {
      const w = cov("fog", "Nevoeiro", "🌫️", 0.35);
      return Object.assign(w, { fog: 1, desat: 0.5, dark: 0.05, bodyVis: 0.35, starVis: 0.2 });
    }
    if (c >= 51 && c <= 57) return wet("drizzle", "Garoa", "🌦️", c === 55 || c === 57 ? 2 : 1);
    if (c === 61) return wet("rain", "Chuva Fraca", "🌧️", 2);
    if (c === 63) return wet("rain", "Chuva", "🌧️", 3);
    if (c === 65) return wet("heavy-rain", "Chuva Forte", "🌧️", 4);
    if (c === 66 || c === 67) return wet("rain", "Chuva Congelante", "🌧️", 3);
    if (c === 80) return wet("showers", "Pancadas de Chuva", "🌧️", 2);
    if (c === 81) return wet("showers", "Pancadas de Chuva", "🌧️", 3);
    if (c === 82) return wet("heavy-rain", "Pancadas Fortes", "🌧️", 4);
    if (c === 95) return wet("storm", "Trovoada", "⛈️", 3, { storm: true, dark: 0.45, cloudDark: 0.65, desat: 0.7 });
    if (c === 96 || c === 99) return wet("storm", "Trovoada com Granizo", "⛈️", 4, { storm: true, dark: 0.45, cloudDark: 0.65, desat: 0.7 });
    if (c === 71 || c === 73 || c === 75 || c === 77 || c === 85 || c === 86) {
      return wet("snow", "Neve", "🌨️", c === 73 ? 3 : c === 75 || c === 86 ? 4 : 2, { snow: true, dark: 0.08, desat: 0.5, cloudDark: 0.1, bodyVis: 0.1, starVis: 0.1 });
    }
    return cov("clear", "Céu Limpo", night ? "🌙" : "☀️", pct == null ? 0.05 : skyClamp(pct, 0, 0.25));
  }

  // Escurece e tira a cor do céu conforme o tempo (nublado e chuva são mais cinzas)
  function skyTint(c, w) {
    const g = Math.round(0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]);
    return skyMix(skyMix(c, [g, g, g], w.desat), [0, 0, 0], w.dark);
  }

  // Nuvens: limiar de cobertura em que cada uma aparece, posição, tamanho e velocidade relativa
  const SKY_CLOUDS = [
    { t: 0.08, top: 8,  size: 9,  left: 62, f: 1.0,  d: 0 },
    { t: 0.2,  top: 54, size: 8,  left: 18, f: 1.35, d: 23 },
    { t: 0.32, top: 28, size: 11, left: 80, f: 0.8,  d: 41 },
    { t: 0.46, top: 66, size: 9,  left: 40, f: 1.15, d: 9 },
    { t: 0.6,  top: 14, size: 10, left: 8,  f: 0.9,  d: 57 },
    { t: 0.75, top: 42, size: 12, left: 55, f: 1.5,  d: 33 },
  ];

  // Tudo que a cena precisa, calculado sem tocar no DOM (por isso é testável)
  // Texto sobre o cartão do modal: o céu aparece inteiro atrás das letras (degradê, nuvens, névoa).
  // Entra na conta o pior fundo possível e a cor do texto é a que melhor se sai nele; a pastilha cobre o resto.
  function skyBannerInk(top, bot, veil, cloudRgb, cover, fogRgb, fog, corpo) {
    // Pior caso de verdade: as cores puras do degradê (o topo é a faixa mais escura, onde fica o título do cartão)
    // e, sobre cada uma, uma nuvem ou a névoa. A "média de nuvens" não serve: ela clareia um fundo que, naquele ponto, pode estar limpo.
    const mid = skyMix(top, bot, 0.5);
    const fundos = [top, mid, bot];
    if (cover > 0.08) {
      const k = 0.8 * skyClamp(cover * 1.5, 0, 1); // várias nuvens sobrepostas
      fundos.push(skyMix(top, cloudRgb, k), skyMix(mid, cloudRgb, k), skyMix(bot, cloudRgb, k));
    }
    if (fog > 0) {
      const k = 0.6 * fog;
      fundos.push(skyMix(top, fogRgb, k), skyMix(mid, fogRgb, k), skyMix(bot, fogRgb, k));
    }
    if (corpo) fundos.push(corpo); // o sol ou a lua passando por trás do texto
    // O vidro atrás do texto escurece o fundo quando o texto é branco e o clareia quando é escuro (backdrop-filter: brightness)
    const bri = (c, b) => c.map((x) => Math.min(255, Math.round(x * b)));
    const pior = (inkL, tgt, a, b) =>
      Math.min(...fundos.map((c) => skyContrast(inkL, skyLum(a > 0 ? skyMix(bri(c, b), tgt, a) : bri(c, b)))));
    const darkL = skyLum(SKY_DARK_INK);
    const BRI_B = 0.6, BRI_D = 1.35; // limites do brilho do vidro para texto branco / texto escuro
    const branco = pior(1, [0, 0, 0], 0, BRI_B) >= pior(darkL, [255, 255, 255], 0, BRI_D);
    const inkL = branco ? 1 : darkL;
    const tgt = branco ? [0, 0, 0] : [255, 255, 255];
    const BRIS = branco ? [1, 0.85, 0.7, BRI_B] : [1, 1.1, 1.22, BRI_D];
    // Menor intervenção que atinge a meta: o vidro só muda o brilho, e a pastilha só aparece, quando é preciso
    const achar = (meta, fixo) => {
      let melhor = null;
      for (const br of fixo ? [fixo] : BRIS) {
        for (let a = 0; a <= 0.6001; a += 0.04) {
          if (pior(inkL, tgt, a, br) < meta) continue;
          const custo = (Math.abs(br - 1) / 0.4) * 0.3 + a / 0.6; // o brilho do vidro é discreto; a pastilha é uma caixa: pesa mais
          if (!melhor || custo < melhor.custo) melhor = { br, a, custo };
          break; // para este brilho, a menor pastilha que serve
        }
      }
      return melhor || { br: fixo || BRIS[BRIS.length - 1], a: 0.6, custo: 9 };
    };
    const P = achar(5.0); // texto pequeno
    const G = achar(3.4, P.br); // texto grande/negrito: mesmo vidro, pastilha própria
    const brilho = P.br, aP = P.a, aG = G.a;
    const rgba = (a) => (a > 0.01 ? "rgba(" + tgt.join(",") + "," + a.toFixed(2) + ")" : "transparent");
    return {
      color: branco ? "#ffffff" : skyRgb(SKY_DARK_INK),
      halo: branco ? "0 1px 2px rgba(0,0,0,.55)" : "0 0 3px rgba(255,255,255,.55)",
      pill: rgba(aP), pillL: rgba(aG), bri: brilho, ratio: pior(inkL, tgt, aP, brilho), ratioL: pior(inkL, tgt, aG, brilho),
    };
  }

  function skyCompute(min, sr, ss, wx) {
    const base = skyColors(min, sr, ss);
    const top = skyTint(base.top, wx), bot = skyTint(base.bot, wx);
    const mid = skyMix(top, bot, 0.5);
    const L = skyLum(mid);
    let cloud = skyMix(mid, [255, 255, 255], 0.35 + 0.4 * skyClamp(L * 3, 0, 1));
    cloud = skyMix(cloud, [58, 64, 80], wx.cloudDark);
    const fogRgb = skyMix(mid, [235, 240, 248], 0.4 + 0.4 * skyClamp(L * 3, 0, 1));
    const veil = { c: cloud, a: 0.28 * skyClamp(wx.cover + 0.5 * wx.fog, 0, 1) };
    const ink = skyInk(top, bot, veil);
    const b = skyBody(min, sr, ss);
    const pos = skyBodyPos(b.p);
    // Pastilha atrás do texto: aparece de forma gradual só quando o contraste fica abaixo de ~5,5:1
    const pillA = skyClamp((5.5 - ink.ratio) / 1.5, 0, 1) * 0.42;
    const pillTarget = ink.color === "#ffffff" ? [0, 0, 0] : [255, 255, 255];
    const inkLum = ink.color === "#ffffff" ? 1 : skyLum(SKY_DARK_INK);
    const inkRatio = pillA > 0 ? skyContrast(inkLum, skyLum(skyMix(ink.mid, pillTarget, pillA))) : ink.ratio;
    const pill = pillA > 0.01 ? "rgba(" + pillTarget.join(",") + "," + pillA.toFixed(2) + ")" : "transparent";
    return {
      top, bot, ink, pill, inkRatio,
      banner: skyBannerInk(top, bot, veil, cloud, wx.cover, fogRgb, wx.fog, wx.bodyVis > 0.5 ? (b.kind === "sun" ? [255, 210, 63] : [238, 242, 255]) : null),
      body: { kind: b.kind, x: pos.x, y: pos.y, vis: wx.bodyVis, blur: (1 - wx.bodyVis) * 1.4 },
      stars: skyStarsOpacity(base.top) * wx.starVis,
      cloudRgb: cloud,
      cloudOps: SKY_CLOUDS.map((c) => skyClamp((wx.cover - c.t) / 0.18, 0, 1) * (0.45 + 0.3 * wx.cover)),
      fogRgb, fogOp: 0.85 * wx.fog,
      drops: wx.drops, snow: wx.snow, storm: wx.storm,
      rainK: wx.rainK, dur: wx.dur,
    };
  }

  const SKY_STARS = [[12, 22], [27, 62], [41, 18], [55, 70], [66, 30], [78, 58], [88, 20], [93, 66]];
  function skyBuildStars(box) {
    if (!box || box.childNodes.length) return;
    SKY_STARS.forEach((s, i) => {
      const el = document.createElement("i");
      el.className = "sky-star";
      el.style.left = s[0] + "%";
      el.style.top = s[1] + "%";
      el.style.animationDelay = (i * 0.45).toFixed(2) + "s";
      box.appendChild(el);
    });
  }
  // Cria estrelas, nuvens e gotas (uma só vez) dentro da cena
  function skyBuildLayers(scene) {
    if (!scene) return;
    skyBuildStars(scene.querySelector(".sky-stars"));
    const cb = scene.querySelector(".sky-clouds");
    if (cb && !cb.childNodes.length) {
      SKY_CLOUDS.forEach((c) => {
        const el = document.createElement("i");
        el.className = "sky-cloud";
        el.style.top = c.top + "%";
        el.style.left = c.left + "%";
        el.style.fontSize = c.size + "px";
        el.style.setProperty("--f", String(c.f));
        el.style.setProperty("--d", String(c.d));
        cb.appendChild(el);
      });
    }
    const rb = scene.querySelector(".sky-rain");
    if (rb && !rb.childNodes.length) {
      for (let i = 0; i < SKY_DROPS[4]; i++) {
        const el = document.createElement("i");
        el.className = "sky-drop";
        el.style.left = ((i * 37 + 11) % 97 + 1) + "%";
        el.style.setProperty("--j", String(i % 4));
        el.style.animationDelay = "-" + ((i * 0.173) % 1).toFixed(2) + "s";
        el.style.display = "none";
        rb.appendChild(el);
      }
    }
  }

  function applySky(trigger, body, min, sr, ss, wx) {
    if (!trigger || !body) return;
    const w = wx || skyWeather(0, NaN, NaN, false);
    const s = skyCompute(min, sr, ss, w);
    const set = (k, v) => trigger.style.setProperty(k, v);
    set("--sky-top", skyRgb(s.top));
    set("--sky-bot", skyRgb(s.bot));
    set("--sky-ink", s.ink.color);
    set("--sky-halo", s.ink.halo);
    set("--sky-stars", s.stars.toFixed(2));
    set("--sky-cloud", s.cloudRgb.join(", "));
    set("--sky-fog-rgb", s.fogRgb.join(", "));
    set("--sky-fog-op", s.fogOp.toFixed(2));
    set("--sky-dur", s.dur.toFixed(0) + "s");
    set("--sky-rain-k", s.rainK.toFixed(2));
    set("--sky-pill", s.pill);
    set("--sky-b-ink", s.banner.color);
    set("--sky-b-halo", s.banner.halo);
    set("--sky-b-pill", s.banner.pill);
    set("--sky-b-pill-l", s.banner.pillL);
    set("--sky-b-bri", s.banner.bri.toFixed(2));

    // Sol/lua: ao trocar um pelo outro não deve haver deslize atravessando o quadro
    const troca = body.dataset.kind !== s.body.kind;
    if (troca) body.style.transition = "none";
    body.className = "sky-body " + s.body.kind;
    body.dataset.kind = s.body.kind;
    body.style.left = s.body.x.toFixed(1) + "%";
    body.style.top = s.body.y.toFixed(1) + "%";
    body.style.opacity = s.body.vis.toFixed(2);
    body.style.filter = s.body.blur > 0.05 ? "blur(" + s.body.blur.toFixed(1) + "px)" : "";
    if (troca) { void body.offsetWidth; body.style.transition = ""; }

    // Camadas do tempo
    trigger.querySelectorAll(".sky-cloud").forEach((el, i) => { el.style.opacity = (s.cloudOps[i] || 0).toFixed(2); });
    trigger.querySelectorAll(".sky-drop").forEach((el, i) => { el.style.display = i < s.drops ? "block" : "none"; });
    const rain = trigger.querySelector(".sky-rain");
    if (rain) rain.classList.toggle("snow", s.snow);
    const flash = trigger.querySelector(".sky-flash");
    if (flash) flash.classList.toggle("on", s.storm);
    if (w.label && !(trigger.classList && trigger.classList.contains("sky-banner"))) trigger.title = "Salvador: " + w.label + " • clique para ver detalhes";
  }

  // Horário de Salvador (fixo), mesmo que o computador esteja em outro fuso
  const skyFmt = (() => {
    try {
      return new Intl.DateTimeFormat("en-GB", { timeZone: "America/Bahia", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });
    } catch (e) { return null; }
  })();
  function skyNow(d) {
    const dt = d || new Date();
    if (skyFmt) {
      const p = skyFmt.formatToParts(dt);
      const h = Number((p.find((x) => x.type === "hour") || {}).value);
      const mi = Number((p.find((x) => x.type === "minute") || {}).value);
      if (Number.isFinite(h) && Number.isFinite(mi)) return { h, m: mi, min: h * 60 + mi };
    }
    return { h: dt.getHours(), m: dt.getMinutes(), min: dt.getHours() * 60 + dt.getMinutes() };
  }
  // Data de hoje em Salvador (AAAA-MM-DD), para validar o cache da previsão
  function skyToday() {
    try {
      return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bahia", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
    } catch (e) {
      const d = new Date();
      return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    }
  }

  // Tempo "agora": a previsão da API + o horário atual (dia ou noite)
  function skyWxNow() {
    const min = skyNow().min;
    const night = min < skyTimes.sunrise || min > skyTimes.sunset;
    const r = skyRaw || { code: 0, cloud: NaN, wind: NaN };
    return skyWeather(r.code, r.cloud, r.wind, night);
  }

  function skyTick() {
    const min = skyNow().min, wx = skyWxNow();
    // Céu da barra superior (computador/tablet) e céu do cabeçalho no celular
    applySky(document.getElementById("weatherTrigger"), document.getElementById("skyBody"), min, skyTimes.sunrise, skyTimes.sunset, wx);
    applySky(document.getElementById("weatherTriggerM"), document.getElementById("skyBodyM"), min, skyTimes.sunrise, skyTimes.sunset, wx);
    // Cartão do modal do clima
    applySky(document.getElementById("skyBanner"), document.getElementById("skyBodyB"), min, skyTimes.sunrise, skyTimes.sunset, wx);
  }
  /* </sky> */


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

  /* <info> */
  // ---- Textos do relógio: saudação com data, chuva provável, sensação térmica ----
  // Cada texto aceita short=true: versão curta para o cabeçalho do celular
  const INFO_WEEKDAYS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];
  const INFO_MONTHS = ["jan", "fev", "mar", "abr", "mai", "jun", "jul", "ago", "set", "out", "nov", "dez"];
  let wxProb = null; // chance de chuva por hora (0..23) do dia da última previsão
  let wxProbDay = ""; // dia (AAAA-MM-DD) a que essa previsão se refere

  // O texto rotativo usa innerHTML, então tudo que vem do usuário é escapado
  const infoEsc = (v) =>
    String(v).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

  // "ter, 17 nov" (data de hoje em Salvador, independente do fuso do computador)
  function infoDateLabel() {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(skyToday());
    if (!m) return "";
    const mo = Number(m[2]) - 1, d = Number(m[3]);
    const wd = new Date(Date.UTC(Number(m[1]), mo, d)).getUTCDay();
    return INFO_WEEKDAYS[wd] + ", " + d + " " + INFO_MONTHS[mo];
  }

  // "Bom dia, Kevin • ter, 17 nov"  (sem nome, vira "Bom dia • ter, 17 nov"). maxLen = tamanho máximo do nome
  function infoGreeting(hour, nome, dataTxt, maxLen) {
    const saud = hour >= 5 && hour < 12 ? "Bom dia" : hour >= 12 && hour < 18 ? "Boa tarde" : "Boa noite";
    const max = maxLen || 18;
    let n = String(nome || "").trim();
    if (n.length > max) {
      const corte = n.slice(0, max - 1);
      const esp = corte.lastIndexOf(" ");
      n = (esp > 3 ? corte.slice(0, esp) : corte) + "…"; // corta no último espaço, não no meio de uma palavra
    }
    return infoEsc(saud + (n ? ", " + n : "") + (dataTxt ? " • " + dataTxt : ""));
  }
  // Mesmo critério do menu do usuário: apelido, senão o primeiro nome
  function infoGreetingNow(short) {
    let ap = "", real = "";
    try {
      ap = sessionStorage.getItem("cockpit_user_apelido") || "";
      real = sessionStorage.getItem("cockpit_user_realname") || "";
    } catch (e) {}
    const nome = ap.trim() || real.trim().split(/\s+/)[0] || "";
    // No celular a data vira um item separado e o nome é mais curto
    return short ? infoGreeting(skyNow().h, nome, "", 11) : infoGreeting(skyNow().h, nome, infoDateLabel());
  }

  // Chuva provável: 1ª hora (agora até +6 h) com chance >= 50%. Vazio se já está chovendo.
  function infoRainText(prob, probDay, today, h, jaChovendo, short) {
    if (jaChovendo || !Array.isArray(prob) || probDay !== today) return "";
    for (let i = h; i <= Math.min(h + 6, 23); i++) {
      const p = Number(prob[i]);
      if (Number.isFinite(p) && p >= 50) {
        return "🌂 Chuva " + (short ? "" : "provável ") + (i === h ? "agora" : "às " + i + "h") + " (" + Math.round(p) + "%)";
      }
    }
    return "";
  }

  // Sensação térmica: só quando difere da temperatura em 4° ou mais
  function infoFeelsLike(temp, feels, short) {
    if (!Number.isFinite(temp) || !Number.isFinite(feels)) return "";
    const d = feels - temp;
    if (d >= 4) return "🥵 Sensação " + (short ? "" : "de ") + feels + "°";
    if (d <= -4) return "🥶 Sensação " + (short ? "" : "de ") + feels + "°";
    return "";
  }

  // Lista de textos da rotação (cada item é um texto ou uma função(short) que devolve texto; vazio = pula)
  function infoBuildItems(weather, year) {
    const items = [
      `Kevin Fróes • ${year}`,
      (s) => `${skyWxNow().icon} Salvador${s ? "" : ":"} ${weather.temp}°C`,
      (s) => infoFeelsLike(weather.temp, weather.sensacao, s), // só se a sensação diferir em 4° ou mais
      weather.uv >= 8 ? `🟣 UV ${weather.uv} (Alto)` : `🟢 UV ${weather.uv}`,
      (s) => infoRainText(wxProb, wxProbDay, skyToday(), skyNow().h, skyWxNow().drops > 0, s), // só se houver chuva provável
      (s) => infoGreetingNow(s),
      (s) => (s ? "📅 " + infoDateLabel() : ""), // no computador a data já vai na saudação
    ];
    // Fase do dia (calculada na hora de exibir, para acompanhar o relógio)
    if (skyTimes.real) {
      items.push((s) => {
        const t = skyPhaseLabel(skyNow().min, skyTimes);
        return s ? t.replace(" às ", " ") : t;
      });
    }
    return items;
  }

  // Próximo texto da rotação; itens sem conteúdo no momento são pulados. Devolve "" se nenhum tiver.
  function infoNext(short) {
    let txt = "";
    for (let tentativa = 0; tentativa < infoItems.length; tentativa++) {
      if (currentIndex >= infoItems.length) currentIndex = 0;
      const item = infoItems[currentIndex];
      currentIndex = (currentIndex + 1) % infoItems.length;
      let v = "";
      try { v = typeof item === "function" ? item(!!short) : item; } catch (e) { v = ""; }
      if (v) { txt = v; break; }
    }
    return txt;
  }
  /* </info> */

  /* <mobhead> */
  // ---- Cabeçalho no celular (< 640 px): o título "Cockpit Gestão" se alterna com o céu animado ----
  const MH_TITLE_MS = 6000; // título visível
  const MH_SKY_MS = 12000; // céu visível
  const MH_ITEM_MS = 4000; // cada texto do céu (3 por fase)
  let mhWxReady = false; // só mostra o céu quando há previsão; sem ela o título fica fixo
  let mhMode = "title";
  let mhTimers = [];

  // Mesmo ponto de corte do Tailwind "sm" (640 px)
  function mhIsMobile() {
    try {
      if (typeof window.matchMedia === "function") return window.matchMedia("(max-width: 639.98px)").matches;
    } catch (e) {}
    return window.innerWidth < 640;
  }
  // Instantes (ms, desde a entrada do céu) em que cada texto aparece: 0, 4000 e 8000
  function mhItemTimes(skyMs, itemMs) {
    const t = [];
    for (let x = 0; x < skyMs; x += itemMs) t.push(x);
    return t;
  }
  function mhClear() { mhTimers.forEach(clearTimeout); mhTimers = []; }
  function mhLater(fn, ms) { mhTimers.push(setTimeout(fn, ms)); }

  function mhApply(mode) {
    mhMode = mode;
    const box = document.getElementById("brandSwap");
    const btn = document.getElementById("weatherTriggerM");
    if (box) box.setAttribute("data-mode", mode);
    if (btn) {
      const on = mode === "sky";
      btn.tabIndex = on ? 0 : -1; // invisível = fora da ordem de Tab
      btn.setAttribute("aria-hidden", on ? "false" : "true");
    }
  }
  function mhShowItem(fade) {
    const el = document.getElementById("infoTextM");
    if (!el) return;
    const txt = infoNext(true);
    if (!txt) return;
    if (!fade) { el.innerHTML = txt; return; }
    el.style.opacity = "0";
    mhLater(() => { el.innerHTML = txt; el.style.opacity = "1"; }, 250);
  }
  function mhTitlePhase() {
    mhApply("title");
    mhLater(mhSkyPhase, MH_TITLE_MS);
  }
  function mhSkyPhase() {
    if (!mhIsMobile()) { mhStop(); return; }
    if (!mhWxReady) { mhTitlePhase(); return; } // sem previsão: o título fica e tenta de novo no próximo ciclo
    skyTick();
    mhShowItem(false);
    mhApply("sky");
    mhItemTimes(MH_SKY_MS, MH_ITEM_MS).slice(1).forEach((t) => mhLater(() => mhShowItem(true), t));
    mhLater(mhTitlePhase, MH_SKY_MS);
  }
  function mhStart() {
    mhClear();
    mhApply("title");
    if (mhIsMobile()) mhTitlePhase();
  }
  function mhStop() { mhClear(); mhApply("title"); }
  // Girou o celular ou redimensionou a janela: reinicia o ciclo (ou desliga no computador)
  function mhWatch() {
    try {
      const mq = window.matchMedia("(max-width: 639.98px)");
      const on = () => mhStart();
      if (typeof mq.addEventListener === "function") mq.addEventListener("change", on);
      else if (typeof mq.addListener === "function") mq.addListener(on);
    } catch (e) {}
  }
  /* </mobhead> */

  // ---- Previsão (Open-Meteo): cache de 15 min, bloco "current" e fallback ----
  const WX_BASE = "https://api.open-meteo.com/v1/forecast?latitude=-12.9756&longitude=-38.491";
  const WX_HOURLY = "temperature_2m,weathercode,uv_index,wind_speed_10m,apparent_temperature,relative_humidity_2m,precipitation_probability,cloud_cover";
  const WX_CURRENT = "temperature_2m,apparent_temperature,relative_humidity_2m,wind_speed_10m,weather_code,cloud_cover";
  const WX_TAIL = "&daily=sunrise,sunset&timezone=America%2FSao_Paulo&forecast_days=1";
  const WX_CACHE_KEY = "cockpit_weather_cache";
  const WX_TTL = 15 * 60 * 1000;

  // Só aceita dados que sejam de hoje (a resposta traz as 24 horas do dia em que foi pedida)
  function wxIsToday(data) {
    const t = data && data.hourly && data.hourly.time && data.hourly.time[0];
    return typeof t === "string" && t.slice(0, 10) === skyToday();
  }
  function wxReadCache() {
    try {
      const c = JSON.parse(localStorage.getItem(WX_CACHE_KEY));
      if (c && c.data && Number.isFinite(c.t) && wxIsToday(c.data)) return c;
    } catch (e) {}
    return null;
  }
  // Se já existe uma consulta em andamento, todos reaproveitam a mesma (evita chamadas duplicadas)
  let wxInflight = null;
  function wxLoad(force) {
    if (wxInflight) return wxInflight;
    wxInflight = wxFetch(force).finally(() => { wxInflight = null; });
    return wxInflight;
  }
  async function wxFetch(force) {
    const c = wxReadCache();
    if (c && !force && Date.now() - c.t < WX_TTL) return c.data;
    // 1ª tentativa com "current"; se a API recusar, 2ª tentativa só com a previsão por hora
    const urls = [
      WX_BASE + "&hourly=" + WX_HOURLY + "&current=" + WX_CURRENT + WX_TAIL,
      WX_BASE + "&hourly=" + WX_HOURLY + WX_TAIL,
    ];
    // [MONITOR] um evento por ciclo de consulta (não por tentativa): resultado, tempo total e se precisou do plano B
    const t0 = performance.now();
    let tentativas = 0, ultimoStatus = null, ultimoErro = null;
    for (const url of urls) {
      tentativas++;
      try {
        const r = await fetch(url);
        ultimoStatus = r.status;
        if (!r.ok) { ultimoErro = "HTTP " + r.status; continue; }
        const j = await r.json();
        if (j && !j.error && j.hourly && wxIsToday(j)) {
          try { localStorage.setItem(WX_CACHE_KEY, JSON.stringify({ t: Date.now(), data: j })); } catch (e) {}
          apiTel("open-meteo", true, r.status, performance.now() - t0,
            null, { tentativas, fallback: tentativas > 1, tem_current: !!j.current });
          return j;
        }
        ultimoErro = j && j.error ? "API: " + String(j.reason || "erro").slice(0, 120)
          : (j && j.hourly ? "dado não é de hoje" : "resposta sem previsão");
      } catch (e) {
        ultimoStatus = null;
        ultimoErro = (e && e.message) || "falha de rede";
      }
    }
    apiTel("open-meteo", false, ultimoStatus, performance.now() - t0,
      ultimoErro, { tentativas, stale: !!c });
    return c ? c.data : null; // sem rede: usa o último clima de hoje, se houver
  }

  async function updateWeather(force) {
    try {
      const data = await wxLoad(force === true);
      if (!data) return;
      const h = skyNow().h;
      const cur = data.current || {};
      // Prefere o valor "agora" (current); se não vier, usa a previsão da hora cheia
      const num = (v, arr) => (Number.isFinite(Number(v)) && v !== null && v !== undefined ? Number(v) : Number(arr && arr[h]));

      // Extraindo dados
      const weather = {
        temp: Math.round(num(cur.temperature_2m, data.hourly.temperature_2m)),
        sensacao: Math.round(num(cur.apparent_temperature, data.hourly.apparent_temperature)),
        uv: Math.round(Number(data.hourly.uv_index[h])),
        vento: Math.round(num(cur.wind_speed_10m, data.hourly.wind_speed_10m)),
        umidade: Math.round(num(cur.relative_humidity_2m, data.hourly.relative_humidity_2m)),
        chuvaProb: Math.round(Number(data.hourly.precipitation_probability[h])),
        code: num(cur.weather_code, data.hourly.weathercode),
      };

      // Nascer e pôr do sol de hoje (alimentam o céu da barra e o texto da fase do dia)
      const sr = skyParseTime(data.daily && data.daily.sunrise && data.daily.sunrise[0]);
      const ss = skyParseTime(data.daily && data.daily.sunset && data.daily.sunset[0]);
      if (skyValid(sr, ss)) {
        skyTimes = {
          sunrise: sr,
          sunset: ss,
          real: true,
          srTxt: String(data.daily.sunrise[0]).slice(11, 16),
          ssTxt: String(data.daily.sunset[0]).slice(11, 16),
        };
      }

      // Tempo atual: código WMO + cobertura de nuvens + vento (alimentam ícone, descrição e a cena do céu)
      const nuvens = Number.isFinite(Number(cur.cloud_cover)) && cur.cloud_cover !== null && cur.cloud_cover !== undefined
        ? Number(cur.cloud_cover)
        : (data.hourly.cloud_cover ? Number(data.hourly.cloud_cover[h]) : NaN);
      skyRaw = { code: weather.code, cloud: nuvens, wind: weather.vento };
      const wx = skyWxNow();
      weather.icon = wx.icon;
      weather.desc = wx.label;
      currentWeatherData = weather;
      wxProb = data.hourly.precipitation_probability;
      wxProbDay = String((data.hourly.time && data.hourly.time[0]) || "").slice(0, 10);
      skyTick();
      mhWxReady = true; // a partir daqui o céu pode aparecer no cabeçalho do celular

      // Texto rotativo
      infoItems = infoBuildItems(weather, new Date().getFullYear());

      if (currentIndex === 0) renderInfo();
    } catch (e) {
      console.warn("Erro clima:", e);
    }
  }

  function renderInfo() {
    if (!infoText || mhIsMobile()) return; // no celular, quem alterna o texto é o cabeçalho (mhStart)
    infoText.classList.remove("opacity-100");
    infoText.classList.add("opacity-0");

    setTimeout(() => {
      const txt = infoNext(false);
      if (txt) infoText.innerHTML = txt;
      infoText.classList.remove("opacity-0");
      infoText.classList.add("opacity-100");
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
  skyBuildLayers(document.getElementById("skyScene"));
  skyBuildLayers(document.getElementById("skySceneM"));
  skyBuildLayers(document.getElementById("skySceneB"));
  skyTick();
  setInterval(skyTick, 60000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { skyTick(); updateWeather(); mhStart(); } });
  updateWeather();
  setInterval(updateWeather, 15 * 60 * 1000);
  setTimeout(() => setInterval(renderInfo, 5000), 1000);
  mhWatch();
  mhStart();

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
      { element: document.querySelector('a[href="#usuarios"]'), route: "#usuarios" },
      { element: document.querySelector('a[href="#vistoria"]'), route: "#vistoria" },
      { element: document.querySelector('a[href="#quiz"]'), route: "#quiz" },
      { element: document.querySelector('a[href="#chatstorage"]'), route: "#chatstorage" },
      { element: document.querySelector('a[href="#capacitacao"]'), route: "#capacitacao" },
      { element: document.querySelector('a[href="#apresentacoes"]'), route: "#apresentacoes" }
    ];

    // Painel Admin: opção do menu do usuário, somente para administrador (não depende de allowed_apps)
    const btnPainel = document.getElementById("menuPainelAdmin");
    if (btnPainel) btnPainel.classList.toggle("hidden", role !== "admin");

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
        window.location.origin
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
    // [SEGURANÇA] origem + iframe conhecido
    if (event.data === "GET_USER_DATA" && isTrustedMessage(event)) {
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
        }, window.location.origin);
    }
  });

  // Objeto que armazena a quantidade de notificações de cada app do Cockpit
const globalNotificationState = {
    demandas: 0,
    chatstorage: 0,
    // No futuro, se houver 'contratos': 0, etc.
};

// Escuta os pedidos de LOG vindos dos iframes filhos
  window.addEventListener("message", (event) => {
      if (event.data && event.data.type === "REGISTRAR_LOG") {
          // [SEGURANÇA] ignora mensagens que não vêm de um app do Cockpit
          if (!isTrustedMessage(event)) return;
          const { acao, detalhes, appOrigem } = event.data.payload || {};
          if (!acao) return;

          // Repassa para a função global que criamos (com limites de tamanho)
          if (typeof window.registrarLog === "function") {
              window.registrarLog(
                  String(acao).slice(0, 80),
                  (detalhes && typeof detalhes === "object") ? detalhes : {},
                  String(appOrigem || "APP_FILHO").slice(0, 60)
              );
          }
      }
  });

// Escuta as mensagens dos iframes filhos
window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "UPDATE_NOTIFICATIONS") {
        // [SEGURANÇA] origem confiável + validação dos campos
        if (!isTrustedMessage(event)) return;
        const appName = String(event.data.appName || "");
        const count = Math.max(0, Math.floor(Number(event.data.count)));
        if (!/^[a-z0-9_-]{1,40}$/i.test(appName) || appName === "__proto__" || !Number.isFinite(count)) return;
        
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
                          <p class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(notif.ator_nome)}</p>
                          <p class="text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">${escapeHtml(notif.mensagem)}</p>
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
                              <p class="font-bold text-slate-800 dark:text-slate-200">${escapeHtml(user.nome)} solicitou acesso</p>
                              <p class="text-slate-600 dark:text-slate-400 mt-0.5">${escapeHtml(user.email)}</p>
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
                                    <p class="font-bold text-[10px] break-all leading-tight mt-0.5">${icone} ${escapeHtml(infoContratos[id])}</p>
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
                    const labelDelegada = isMinha ? '' : `<span class="block mt-1.5 text-[9px] text-slate-500 uppercase font-bold bg-white/40 dark:bg-black/20 inline-block px-1.5 py-0.5 rounded shadow-sm border border-slate-200/50">👤 Com: ${escapeHtml(quemFaz)}</span>`;

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
                                <p class="font-bold text-[11px] break-all leading-tight mt-0.5">${icone} ${escapeHtml(d.titulo)}</p>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-sm uppercase tracking-wider bg-white/60 shrink-0">${escapeHtml(d.prioridade)}</span>
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
                                <p class="font-bold text-slate-800 dark:text-slate-200">Família ${escapeHtml(sug.familia_codigo)}</p>
                                <span class="text-[9px] font-bold px-1.5 py-0.5 rounded-sm bg-purple-200 text-purple-800 dark:bg-purple-800 dark:text-purple-200 shadow-sm shrink-0">
                                    ${escapeHtml(sug.quantidade)} Sugestão(ões)
                                </span>
                            </div>
                            <p class="text-slate-600 dark:text-slate-300 mt-0.5">Novo CNAE: <span class="font-mono">${escapeHtml(sug.cnae_codigo)}</span></p>
                            <p class="text-[9px] text-slate-400 mt-1">${dataFormatada} • Por: ${escapeHtml(primeiroSugeridor)}</p>
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
