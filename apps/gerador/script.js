// --- VARIÁVEIS DE ESTADO ---
let db;
let encryptionKey = null;
let titleClickCount = 0;

document.addEventListener("DOMContentLoaded", function () {
  // --- INFORMAÇÕES DA APLICAÇÃO ---
  /**
   * @functionality 501
   * @category 5xx: Utilitários e Validações
   * @name Definição de Constantes de Aplicação e Versão
   * @description Armazena autor, nome, versão e data para footer e logs.
   */
  const APP_AUTHOR = "Kevin Fróes";
  const APP_NAME = "Gerador de Mensagens";
  const APP_VERSION = "3.1.0";
  const APP_VERSION_DATE = "04/12/2025";

  // --- ELEMENTOS DO DOM ---
  /**
   * @functionality 407
   * @category 4xx: UI/UX e Interações
   * @name Seleção de Elementos DOM com Cache para Performance
   * @description Armazena referências a inputs, modais e botões em variáveis globais.
   */
  const dbName = "CafDatabase";
  const dbVersion = 6;
  const dbStatus = document.getElementById("db-status");
  const familyDbStatus = document.getElementById("family-db-status");
  const cnpjInputForDb = document.getElementById("cnpj");
  const companyNameInputForDb = document.getElementById("companyName");
  const companyNameResults = document.getElementById("companyNameResults");
  const cnpjStatusSpan = document.getElementById("cnpj-status");
  const appTitle = document.getElementById("appTitle");
  const dbModal = document.getElementById("dbModal");
  const openDbModalBtn = document.getElementById("openDbModalBtn");
  const closeDbModalBtn = document.getElementById("closeDbModalBtn");
  const historyModal = document.getElementById("historyModal");
  const openHistoryModalBtn = document.getElementById("openHistoryModalBtn");
  const closeHistoryModalBtn = document.getElementById("closeHistoryModalBtn");
  const exportModal = document.getElementById("exportModal");
  const confirmExportBtn = document.getElementById("confirmExportBtn");
  const cancelExportBtn = document.getElementById("cancelExportBtn");
  const passwordModal = document.getElementById("passwordModal");
  const passwordForm = document.getElementById("passwordForm");
  const masterPasswordInput = document.getElementById("masterPassword");
  const keepLoggedInCheckbox = document.getElementById("keepLoggedIn");
  const passwordPromptMessage = document.getElementById(
    "passwordPromptMessage"
  );
  const logoutBtn = document.getElementById("logoutBtn");
  const csvFileInput = document.getElementById("csvFileInput");
  const loadCsvBtn = document.getElementById("loadCsvBtn");
  const loginBtn = document.getElementById("loginBtn");
  const csvFileInputLabel = document.getElementById("csvFileInputLabel");
  const familyCsvFileInput = document.getElementById("familyCsvFileInput");
  const loadFamilyCsvBtn = document.getElementById("loadFamilyCsvBtn");
  const familyCsvFileInputLabel = document.getElementById(
    "familyCsvFileInputLabel"
  );
  const historySearchCnpj = document.getElementById("historySearchCnpj");
  const historyStartDate = document.getElementById("historyStartDate");
  const historyEndDate = document.getElementById("historyEndDate");
  const filterHistoryBtn = document.getElementById("filterHistoryBtn");
  const clearHistoryFilterBtn = document.getElementById(
    "clearHistoryFilterBtn"
  );

  // --- ELEMENTOS DO DASHBOARD ---
  const dashboardModal = document.getElementById("dashboardModal");
  const openDashboardModalBtn = document.getElementById(
    "openDashboardModalBtn"
  );
  const closeDashboardModalBtn = document.getElementById(
    "closeDashboardModalBtn"
  );
  const dashboardPeriodFilter = document.getElementById(
    "dashboardPeriodFilter"
  );
  const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
  const statusChartCanvas = document.getElementById("statusChart");
  const topDocsList = document.getElementById("topDocsList");
  const topReasonsList = document.getElementById("topReasonsList");
  const dashboardTotalCount = document.getElementById("dashboardTotalCount");
  let statusChartInstance = null; // Para destruir o gráfico antigo

  // --- MODAL DE BACKUP ---
  const backupReminderModal = document.getElementById("backupReminderModal");
  const backupReminderPeriodSelect = document.getElementById(
    "backupReminderPeriod"
  );
  const confirmBackupReminderBtn = document.getElementById(
    "confirmBackupReminderBtn"
  );
  const cancelBackupReminderBtn = document.getElementById(
    "cancelBackupReminderBtn"
  );
  const closeBackupReminderBtn = document.getElementById(
    "closeBackupReminderBtn"
  );

  // --- MODAL WPP ---
  const sendWppBtn = document.getElementById("sendWppBtn");
  const wppModal = document.getElementById("wppModal");
  const closeWppModalBtn = document.getElementById("closeWppModalBtn");
  const wppContactListContainer = document.getElementById(
    "wppContactListContainer"
  );

  // Elementos do Modal de DB para Contatos
  const addContactBtn = document.getElementById("addContactBtn");
  const contactsListContainer = document.getElementById(
    "contactsListContainer"
  );
  const loadContactsCsvBtn = document.getElementById("loadContactsCsvBtn");
  const exportContactsCsvBtn = document.getElementById("exportContactsCsvBtn");
  const contactsCsvFileInput = document.getElementById("contactsCsvFileInput");
  const contactsDbStatus = document.getElementById("contacts-db-status");
  const modalcontactNameInput = document.getElementById("contactNameInput");
  const modalcontactRoleInput = document.getElementById("contactRoleInput");
  const contactPhoneInputModal = document.getElementById("contactPhoneInput");
  //const contactPhoneInput = document.getElementById("contactPhoneInput");
  const contactsModal = document.getElementById("contactsModal");
  const openContactsModalBtn = document.getElementById("openContactsModalBtn");
  const closeContactsModalBtn = document.getElementById(
    "closeContactsModalBtn"
  );

  // --- FUNÇÕES GERAIS E DE UTILIDADE ---

  /**
   * @functionality 401 (Atualizada v2)
   * @category 4xx: UI/UX e Interações
   * @name Sistema de Notificações Toast Empilhadas com Animações e Close Manual
   * @description Cria toasts dinâmicos em pilha. Duration=0 torna persistente com botão close; senão, auto-esconde.
   */
  function showToast(message, type = "info", duration = 3000) {
    // Cria o container se não existir
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className =
        "fixed bottom-5 right-5 z-50 flex flex-col items-end space-y-2 pointer-events-none";
      document.body.appendChild(container);
    }

    // Limite de pilha (opcional: remove o mais antigo se >5)
    if (container.children.length >= 5) {
      hideToast(container.lastElementChild);
    }

    // Cria o elemento toast
    const toast = document.createElement("div");
    toast.className = `
        relative bg-black text-white py-2 px-5 rounded-lg shadow-xl 
        opacity-0 transition-all duration-300 ease-in-out transform translate-y-4
        max-w-sm text-sm flex items-center justify-between
    `;

    // Cor por tipo
    let bgClass = "bg-black"; // info
    if (type === "success") bgClass = "bg-green-600";
    else if (type === "error") bgClass = "bg-red-600";
    toast.classList.add(bgClass);

    // Conteúdo principal + close button (só se duration=0 para persistente)
    let closeBtn = "";
    if (duration === 0) {
      closeBtn = `
            <button onclick="hideToast(this.parentElement); event.stopPropagation();" 
                    class="ml-3 text-white hover:text-gray-300 text-sm font-bold absolute right-1 top-1/2 -translate-y-1/2">
                ×
            </button>
        `;
      // Ajusta padding para o botão
      toast.classList.add("pr-6"); // Espaço para o ×
    }

    // Escape e innerHTML
    toast.innerHTML = `
        <span>${escapeHtml(message)}</span>
        ${closeBtn}
    `;

    // Insere no topo
    container.insertBefore(toast, container.firstChild);

    // Anima entrada
    requestAnimationFrame(() => {
      toast.classList.remove("opacity-0", "translate-y-4");
      toast.classList.add("opacity-100", "translate-y-0");
    });

    // Auto-remoção: Se duration=0, não auto-esconde (usa close manual). Senão, esconde após duration (mínimo 2000ms)
    const effectiveDuration = duration === 0 ? 0 : Math.max(duration, 2000);
    if (effectiveDuration > 0) {
      setTimeout(() => {
        toast.classList.remove("opacity-100", "translate-y-0");
        toast.classList.add("opacity-0", "translate-y-4");
        setTimeout(() => {
          if (toast.parentNode) container.removeChild(toast);
        }, 300);
      }, effectiveDuration);
    }
  }

  /**
   * @functionality 401.5
   * @category 4xx: UI/UX e Interações
   * @name Esconde Toast Específico ou Todos Manualmente
   * @description Força fade-out e remoção de um toast pelo elemento ou todos no container.
   */
  function hideToast(toastElement = null) {
    const container = document.getElementById("toast-container");
    if (!container) return;

    if (toastElement) {
      // Esconde um específico
      toastElement.classList.remove("opacity-100", "translate-y-0");
      toastElement.classList.add("opacity-0", "translate-y-4");
      setTimeout(() => {
        if (toastElement.parentNode) {
          container.removeChild(toastElement);
        }
      }, 300);
    } else {
      // Esconde todos (útil para cleanup)
      Array.from(container.children).forEach((toast) => hideToast(toast));
    }
  }

  /**
   * @functionality 416
   * @category 4xx: UI/UX e Interações
   * @name Renderização de Footer com Versão e Botão de Logout Condicional
   * @description Mostra info de app e esconde/mostra logout baseado em autenticação.
   */
  function renderFooter() {
    const footer = document.getElementById("appVersionInfo");
    if (footer)
      footer.textContent = `${APP_AUTHOR} - ${APP_NAME} Versão ${APP_VERSION} de ${APP_VERSION_DATE}`;
  }

  /**
   * @functionality 103
   * @category 1xx: Criptografia e Segurança
   * @name Escapamento de HTML em Renderização de Histórico para Prevenção de XSS
   * @description Usa escapeHtml para sanitizar mensagens no histórico.
   */
  window.escapeHtml = function (text) {
    if (typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  }

  /**
   * @functionality 503
   * @category 5xx: Utilitários e Validações
   * @name Formatação de Máscara Dinâmica de CNPJ/CPF
   * @description Aplica máscara de CPF (11) ou CNPJ (14) a uma string de dígitos.
   */
  function formatDocument(v) {
    v = v.replace(/\D/g, ""); // Remove tudo que não é dígito

    if (v.length <= 11) {
      // Formato CPF
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      // Formato CNPJ
      v = v.replace(/^(\d{2})(\d)/, "$1.$2");
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
      v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }
    return v;
  }

  /**
   * @functionality 505
   * @category 5xx: Utilitários e Validações
   * @name Formatação de Máscara Dinâmica de Telefone (XX) X XXXX-XXXX
   * @description Aplica máscara de telefone a uma string de dígitos.
   */
  function formatPhone(v) {
    v = v.replace(/\D/g, "");
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    return v;
  }

  // --- LÓGICA DE CRIPTOGRAFIA ---

  /**
   * @functionality 100
   * @category 1xx: Criptografia e Segurança
   * @name Implementação de Criptografia AES-GCM com PBKDF2
   * @description Deriva chaves de senha via PBKDF2 e prepara para criptografia AES-GCM.
   */
  async function deriveKey(password, salt) {
    const encoder = new TextEncoder();
    const keyMaterial = await crypto.subtle.importKey(
      "raw",
      encoder.encode(password),
      { name: "PBKDF2" },
      false,
      ["deriveKey"]
    );
    return crypto.subtle.deriveKey(
      { name: "PBKDF2", salt: salt, iterations: 100000, hash: "SHA-256" },
      keyMaterial,
      { name: "AES-GCM", length: 256 },
      true,
      ["encrypt", "decrypt"]
    );
  }

  /**
   * @functionality 100
   * @category 1xx: Criptografia e Segurança
   * @name Implementação de Criptografia AES-GCM com PBKDF2
   * @description Criptografa dados com AES-GCM (IV aleatório). Corrige stack overflow processando em chunks.
   */
  async function encryptData(text, key) {
    const encoder = new TextEncoder();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const encryptedContent = await crypto.subtle.encrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encoder.encode(text)
    );
    const encryptedBytes = new Uint8Array(encryptedContent);
    const finalData = new Uint8Array(iv.length + encryptedBytes.length);
    finalData.set(iv);
    finalData.set(encryptedBytes, iv.length);

    let binaryString = "";
    const CHUNK_SIZE = 8192;
    for (let i = 0; i < finalData.length; i += CHUNK_SIZE) {
      const chunk = finalData.subarray(i, i + CHUNK_SIZE);
      binaryString += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binaryString);
  }

  /**
   * @functionality 100
   * @category 1xx: Criptografia e Segurança
   * @name Implementação de Criptografia AES-GCM com PBKDF2
   * @description Descriptografa dados com AES-GCM.
   */
  async function decryptData(encryptedText, key) {
    const binaryString = atob(encryptedText);
    const encryptedDataWithIv = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      encryptedDataWithIv[i] = binaryString.charCodeAt(i);
    }

    const iv = encryptedDataWithIv.slice(0, 12);
    const encryptedContent = encryptedDataWithIv.slice(12);
    const decryptedContent = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      encryptedContent
    );
    const decoder = new TextDecoder();
    return decoder.decode(decryptedContent);
  }

  // --- LÓGICA DE AUTENTICAÇÃO E SESSÃO ---

  /**
   * @functionality 101
   * @category 1xx: Criptografia e Segurança
   * @name Mecanismo de Derivação e Armazenamento de Chave de Sessão no Navegador
   * @description Importa/exporta chaves JWK para localStorage/sessionStorage, com fallback para senha mestra. Suporta "manter conectado".
   */
  async function handlePasswordSubmit(event) {
    event.preventDefault();
    const password = masterPasswordInput.value;
    if (!password) return;

    showToast("Processando senha...", "info");

    try {
      const salt = new TextEncoder().encode("caf-app-salt");
      const key = await deriveKey(password, salt);

      encryptionKey = key;

      const exportableKey = await crypto.subtle.exportKey("jwk", key);

      if (keepLoggedInCheckbox.checked) {
        localStorage.setItem("encryptionKey", JSON.stringify(exportableKey));
      } else {
        sessionStorage.setItem("encryptionKey", JSON.stringify(exportableKey));
      }

      passwordModal.classList.add("hidden");
      masterPasswordInput.value = "";
      logoutBtn.classList.remove("hidden");
      loginBtn.classList.add("hidden");

      initializeAppLogic();
    } catch (e) {
      showToast("Erro ao processar a senha.", "error");
    }
  }

  /**
   * @functionality 403
   * @category 4xx: UI/UX e Interações
   * @name Logout e Limpeza de Sessão com Recarregamento de Página
   * @description Remove chaves de storage e recarrega para resetar estado.
   */
  function handleLogout() {
    localStorage.removeItem("encryptionKey");
    sessionStorage.removeItem("encryptionKey");
    location.reload();
  }

  /**
   * @functionality 101
   * @category 1xx: Criptografia e Segurança
   * @name Mecanismo de Derivação e Armazenamento de Chave de Sessão no Navegador
   * @description Recupera a chave JWK do localStorage ou sessionStorage e a importa para uso.
   */
  async function getStoredKey() {
    const keyData =
      localStorage.getItem("encryptionKey") ||
      sessionStorage.getItem("encryptionKey");
    if (!keyData) return null;

    try {
      const jwk = JSON.parse(keyData);
      return await crypto.subtle.importKey(
        "jwk",
        jwk,
        { name: "AES-GCM" },
        true,
        ["encrypt", "decrypt"]
      );
    } catch (e) {
      return null;
    }
  }

  // --- LÓGICA DE HASH E VERIFICAÇÃO DE ATUALIZAÇÃO ---

  /**
   * @functionality 209
   * @category 2xx: Banco de Dados e Persistência
   * @name Gerenciamento de Configurações de Backup Pessoal no Metadata
   * @description Salva o período (ms) selecionado pelo usuário no metadata store.
   */
  function saveBackupReminderPeriod(periodMs) {
    return new Promise((resolve, reject) => {
      if (!db) return reject("DB not available");
      const transaction = db.transaction(["metadata"], "readwrite");
      const store = transaction.objectStore("metadata");
      const request = store.put({
        id: "backup_reminder_period",
        value: periodMs,
      });
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * @functionality 209
   * @category 2xx: Banco de Dados e Persistência
   * @name Gerenciamento de Configurações de Backup Pessoal no Metadata
   * @description Recupera o período (ms) do metadata store. Padrão: Diariamente (86400000).
   */
  function getBackupReminderPeriod() {
    return new Promise((resolve) => {
      if (!db) return resolve(86400000); // Padrão
      const transaction = db.transaction(["metadata"], "readonly");
      const store = transaction.objectStore("metadata");
      const request = store.get("backup_reminder_period");
      request.onsuccess = () => {
        // Padrão é 'Diariamente' (86400000) se não estiver definido
        resolve(request.result ? request.result.value : 86400000);
      };
      request.onerror = () => resolve(86400000); // Padrão em caso de erro
    });
  }

  /**
   * @functionality 209
   * @category 2xx: Banco de Dados e Persistência
   * @name Gerenciamento de Configurações de Backup Pessoal no Metadata
   * @description Salva o timestamp (Date.now()) do último backup pessoal realizado.
   */
  function updateLastPersonalBackupTimestamp(timestamp) {
    return new Promise((resolve, reject) => {
      if (!db) return reject("DB not available");
      const transaction = db.transaction(["metadata"], "readwrite");
      const store = transaction.objectStore("metadata");
      const request = store.put({
        id: "last_personal_backup",
        value: timestamp,
      });
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * @functionality 209
   * @category 2xx: Banco de Dados e Persistência
   * @name Gerenciamento de Configurações de Backup Pessoal no Metadata
   * @description Recupera o timestamp do último backup pessoal. Padrão: 0.
   */
  function getLastPersonalBackupTimestamp() {
    return new Promise((resolve) => {
      if (!db) return resolve(0);
      const transaction = db.transaction(["metadata"], "readonly");
      const store = transaction.objectStore("metadata");
      const request = store.get("last_personal_backup");
      request.onsuccess = () =>
        resolve(request.result ? request.result.value : 0);
      request.onerror = () => resolve(0);
    });
  }

  /**
   * @functionality 102
   * @category 1xx: Criptografia e Segurança
   * @name Cálculo de Hash SHA-256 para Detecção de Mudanças em Backups
   * @description Gera hash hexadecimal de strings JSON para comparação remota/local.
   */
  async function calculateHash(text) {
    const encoder = new TextEncoder();
    const data = encoder.encode(text);
    const hashBuffer = await crypto.subtle.digest("SHA-256", data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    return hashHex;
  }

  /**
   * @functionality 207
   * @category 2xx: Banco de Dados e Persistência
   * @name Armazenamento e Recuperação de Hash Local em Store de Metadados
   * @description Recupera hash de backups no store 'metadata' para verificações.
   */
  function getLocalHash() {
    return new Promise((resolve) => {
      if (!db) return resolve(null);
      const transaction = db.transaction(["metadata"], "readonly");
      const store = transaction.objectStore("metadata");
      const request = store.get("backup_hash");
      request.onsuccess = () =>
        resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }

  /**
   * @functionality 207
   * @category 2xx: Banco de Dados e Persistência
   * @name Armazenamento e Recuperação de Hash Local em Store de Metadados
   * @description Salva hash de backups no store 'metadata' para verificações.
   */
  function saveLocalHash(hash) {
    return new Promise((resolve, reject) => {
      if (!db) return reject("DB not available");
      const transaction = db.transaction(["metadata"], "readwrite");
      const store = transaction.objectStore("metadata");
      const request = store.put({ id: "backup_hash", value: hash });
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /**
   * @functionality 202
   * @category 2xx: Banco de Dados e Persistência
   * @name Verificação Automática de Atualizações via Hash SHA-256 de Backup Criptografado
   * @description Fetch backup.json, descriptografa, compara hashes locais/remotos e importa se difere.
   */
  async function checkForUpdates() {
    if (!encryptionKey) return;

    try {
      const response = await fetch("backup.json");
      if (!response.ok) {
        console.warn(
          "Arquivo de backup central não encontrado. Pulando verificação automática."
        );
        const localHash = await getLocalHash();
        if (!localHash) {
          showToast('Arquivo "backup.json" não encontrado na pasta.', "error");
        }
        return;
      }

      const encryptedText = await response.text();

      const jsonText = await decryptData(encryptedText, encryptionKey);

      const remoteHash = await calculateHash(jsonText);
      const localHash = await getLocalHash();

      if (remoteHash !== localHash) {
        if (localHash === null) {
          showToast(
            "Base de dados inicial encontrada. Carregando...",
            "info",
            8000
          );
        } else {
          showToast(
            "Nova base de dados encontrada. Atualizando...",
            "info",
            8000
          );
        }
        const data = JSON.parse(jsonText);
        await processImportData(data, remoteHash);
      }
    } catch (error) {
      console.error("Falha na verificação de atualização:", error);
      showToast("Falha ao verificar/descriptografar base de dados.", "error");
      handleLogout();
    }
  }

  // --- LÓGICA DO MODO ADMIN ---

  /**
   * @functionality 410
   * @name Atualização de Estado dos Controles de Admin
   * @description Habilita/desabilita todas as funcionalidades de admin (exportação e upload de CSV)
   */
  function updateAdminControlsState() {
    const isAdmin = sessionStorage.getItem("adminModeUnlocked") === "true";

    // Controles de Exportação
    const exportCompanies = document.getElementById("exportCompanies");
    const exportFamilies = document.getElementById("exportFamilies");

    [exportCompanies, exportFamilies].forEach((checkbox) => {
      checkbox.disabled = !isAdmin;
      const label = checkbox.closest("label");
      if (isAdmin) {
        label.classList.remove("opacity-50", "cursor-not-allowed");
        label.title = "";
      } else {
        label.classList.add("opacity-50", "cursor-not-allowed");
        label.title = "Opção disponível apenas no Modo Admin.";
      }
    });

    const exportHistory = document.getElementById("exportHistory");
    const exportContacts = document.getElementById("exportContacts");

    if (isAdmin) {
      exportCompanies.checked = true;
      exportFamilies.checked = true;
      exportHistory.checked = false;
      exportContacts.checked = false;
    } else {
      exportCompanies.checked = false;
      exportFamilies.checked = false;
      exportHistory.checked = true;
      exportContacts.checked = true;
    }

    // Controles de Upload de CSV
    const csvControls = [
      { input: csvFileInput, btn: loadCsvBtn, label: csvFileInputLabel },
      {
        input: familyCsvFileInput,
        btn: loadFamilyCsvBtn,
        label: familyCsvFileInputLabel,
      },
    ];

    csvControls.forEach((control) => {
      control.input.disabled = !isAdmin;
      control.btn.disabled = !isAdmin;
      if (isAdmin) {
        [control.input, control.btn, control.label].forEach((el) =>
          el.classList.remove("opacity-50", "cursor-not-allowed")
        );
      } else {
        [control.input, control.btn, control.label].forEach((el) =>
          el.classList.add("opacity-50", "cursor-not-allowed")
        );
      }
    });
  }
  /**
   * @functionality 104
   * @category 1xx: Criptografia e Segurança
   * @name Ativação de Modo Admin via Contador de Cliques com Persistência em SessionStorage
   * @description Desbloqueia exportações completas após 7 cliques no título; atualiza UI de checkboxes.
   * @functionality 105
   * @name Timeout de Contador de Cliques no Título para Ativação Admin
   * @description Reseta titleClickCount após 2s para evitar ativações acidentais.
   */
  function setupAdminModeToggle() {
    appTitle.addEventListener("click", () => {
      titleClickCount++;
      if (titleClickCount >= 7) {
        sessionStorage.setItem("adminModeUnlocked", "true");
        showToast("Modo Admin Ativado!", "success");
        updateAdminControlsState(); // Atualiza todos os controles de admin
        titleClickCount = 0;
      }
      setTimeout(() => {
        titleClickCount = 0;
      }, 2000);
    });
  }

  // --- INICIALIZAÇÃO E LÓGICA DO BANCO DE DADOS ---

  /**
   * @functionality 502
   * @category 5xx: Utilitários e Validações
   * @name Inicialização de Lógica do App Após Autenticação
   * @description Chama checkForUpdates e checkDbStatus após login ou bootstrapping.
   */
  async function initializeAppLogic() {
    try {
      await checkForUpdates();
      checkDbStatus("companies", dbStatus, "registros");
      checkDbStatus("families", familyDbStatus, "famílias");

      renderContactsList();
      await checkForBackupReminder();

      showToast("Base de dados carregada!", "success");
    } catch (error) {
      // Se checkForUpdates ou outro passo falhar, o erro já foi
      // mostrado em um toast. Vamos garantir que o toast de erro apareça.
      hideToast(); // Esconde o "Carregando..." se ainda estiver lá
      showToast("Falha ao carregar a base de dados.", "error");
      console.error("Erro em initializeAppLogic:", error);
    }
  }

  /**
   * @functionality 504
   * @category 5xx: Utilitários e Validações
   * @name Verificação de Lembrete de Backup na Inicialização
   * @description Compara o último backup pessoal com o período configurado e exibe o modal se vencido.
   */
  async function checkForBackupReminder() {
    if (!encryptionKey) return; // Só verifica se estiver logado

    try {
      const periodMs = Number(await getBackupReminderPeriod());
      if (periodMs === 0) return; // Usuário desativou os lembretes

      const lastBackupTimestamp = await getLastPersonalBackupTimestamp();
      const now = Date.now();

      if (lastBackupTimestamp + periodMs < now) {
        // Backup está vencido!
        backupReminderModal.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Erro ao verificar lembrete de backup:", error);
    }
  }

  /**
   * @functionality 200
   * @category 2xx: Banco de Dados e Persistência
   * @name Inicialização e Upgrade de Schema no IndexedDB com Stores Múltiplos
   * @description Cria stores (companies, families, metadata, history) com índices (ex: timestamp). Versão 4 para compatibilidade.
   * @functionality 415
   * @name Prompt de Senha Mestra com Mensagem Dinâmica para Bootstrapping
   * @description Altera texto do modal baseado em presença de backup.json.
   */
  async function initDb() {
    const request = indexedDB.open(dbName, dbVersion);

    request.onupgradeneeded = function (event) {
      db = event.target.result;
      if (!db.objectStoreNames.contains("companies"))
        db.createObjectStore("companies", { keyPath: "cnpj" });
      if (!db.objectStoreNames.contains("families"))
        db.createObjectStore("families", { keyPath: "id" });
      if (!db.objectStoreNames.contains("metadata"))
        db.createObjectStore("metadata", { keyPath: "id" });
      if (!db.objectStoreNames.contains("history")) {
        const historyStore = db.createObjectStore("history", {
          keyPath: "id",
          autoIncrement: true,
        });
        historyStore.createIndex("timestamp", "timestamp", { unique: false });
      }

      if (!db.objectStoreNames.contains("contacts")) {
        const contactsStore = db.createObjectStore("contacts", {
          keyPath: "id",
          autoIncrement: true,
        });
        contactsStore.createIndex("name", "name", { unique: false });
      }
    };

    request.onsuccess = async function (event) {
      db = event.target.result;

      encryptionKey = await getStoredKey();

      if (encryptionKey) {
        // --- ESTÁ LOGADO ---
        logoutBtn.classList.remove("hidden");
        loginBtn.classList.add("hidden");

        // 1. Mostra o toast persistente (duração 0)
        showToast("Carregando base de dados...", "info", 8000);

        try {
          // 2. Aguarda a inicialização (que vai lidar com os toasts)
          await initializeAppLogic();
          atualizarStatsExternos();
        } catch (error) {
          // Este catch é para erros no PRÓPRIO initializeAppLogic
          hideToast(); // Esconde o "Carregando..."
          showToast("Erro crítico na inicialização.", "error");
          console.error("Erro fatal em initDb:", error);
        }
      } else {
        // --- NÃO ESTÁ LOGADO ---
        logoutBtn.classList.add("hidden");
        loginBtn.classList.remove("hidden");

        // Prepara a mensagem do modal, mas não o abre
        try {
          const response = await fetch("backup.json");
          if (response.ok) {
            passwordPromptMessage.textContent =
              "Uma base de dados central foi encontrada. Por favor, insira a senha mestra para acessá-la.";
          } else {
            passwordPromptMessage.textContent =
              "Por favor, insira a senha mestra para descriptografar e carregar os dados."; // Mensagem padrão
            console.log(
              "Nenhum backup central encontrado. Iniciando em modo de bootstrapping."
            );
          }
        } catch (error) {
          passwordPromptMessage.textContent =
            "Por favor, insira a senha mestra para descriptografar e carregar os dados."; // Mensagem padrão
          console.log(
            "Não foi possível acessar o backup central. Iniciando em modo offline/bootstrapping."
          );
        }

        // Não chame initializeAppLogic() aqui, pois ele será chamado
        // dentro de handlePasswordSubmit() após o login bem-sucedido.
      }
    };

    request.onerror = function (event) {
      showToast("Erro crítico ao acessar o banco de dados local.", "error");
    };
  }

  /**
   * @functionality 206
   * @category 2xx: Banco de Dados e Persistência
   * @name Contador de Registros e Exibição de Status de DB com Timestamps
   * @description Conta itens em stores e mostra contagem + última atualização via metadados.
   */
  function checkDbStatus(storeName, statusElement, label) {
    if (!db) return;
    try {
      const transaction = db.transaction([storeName], "readonly");
      const objectStore = transaction.objectStore(storeName);
      const countRequest = objectStore.count();

      countRequest.onsuccess = function () {
        const count = countRequest.result;
        if (count > 0) {
          const metaTransaction = db.transaction(["metadata"], "readonly");
          const metaStore = metaTransaction.objectStore("metadata");
          const timestampRequest = metaStore.get(`${storeName}_last_updated`);

          timestampRequest.onsuccess = function () {
            let statusText = `${count} ${label} carregadas.`;
            if (timestampRequest.result) {
              statusText += `<br>Última atualização: ${timestampRequest.result.value}`;
            }
            statusElement.innerHTML = statusText;
            statusElement.className = "text-green-600 text-xs text-center";
          };
        } else {
          statusElement.textContent = `Nenhum registro de ${label}.`;
          statusElement.className = "text-yellow-600 text-sm";
        }
      };
    } catch (e) {
      statusElement.textContent = "Erro ao verificar base de dados.";
      statusElement.className = "text-red-600";
    }
  }

  /**
   * @functionality 201
   * @category 2xx: Banco de Dados e Persistência
   * @name Carregamento e Parsing de CSV para Stores Específicos com Delimitador Customizado
   * @description Lê ISO-8859-1, parseia linhas (companyParser/familyParser), limpa store e atualiza metadados com timestamp.
   */
  function loadCsvToDB(file, storeName, statusElement, parser) {
    if (!encryptionKey) {
      showToast("Por favor, faça login antes de carregar dados.", "error");
      return;
    }
    if (!file) {
      alert("Por favor, selecione um arquivo CSV.");
      return;
    }

    const reader = new FileReader();
    reader.onload = function (event) {
      const lines = event.target.result.split("\n");
      const totalLines = lines.length;
      statusElement.textContent = `Processando ${totalLines} linhas...`;
      statusElement.className = "text-blue-600";

      const transaction = db.transaction([storeName], "readwrite");
      const objectStore = transaction.objectStore(storeName);
      objectStore.clear();

      lines.forEach((line, index) => {
        const record = parser(line);
        if (record) objectStore.put(record);
      });

      transaction.oncomplete = function () {
        const metaTransaction = db.transaction(["metadata"], "readwrite");
        const metaStore = metaTransaction.objectStore("metadata");
        const now = new Date();
        const timestamp = now.toLocaleString("pt-BR", {
          dateStyle: "short",
          timeStyle: "medium",
        });
        metaStore.put({ id: `${storeName}_last_updated`, value: timestamp });

        metaTransaction.oncomplete = function () {
          checkDbStatus(
            storeName,
            statusElement,
            storeName === "companies" ? "registros" : "famílias"
          );
          showToast(`Base de ${storeName} carregada com sucesso!`, "success");
        };
      };
      transaction.onerror = function () {
        statusElement.textContent = "Erro ao salvar dados.";
        statusElement.className = "text-red-600";
        showToast(`Erro ao carregar base de ${storeName}.`, "error");
      };
    };
    reader.readAsText(file, "ISO-8859-1");
  }

  /**
   * @functionality 400
   * @category 4xx: UI/UX e Interações
   * @name Exportação e Importação de Backup JSON com Opções Seletivas e Criptografia
   * @description Serializa stores selecionados, criptografa e baixa; suporta admin mode.
   * @functionality 408
   * @name Download de Arquivo de Backup com Blob e URL Temporária
   * @description Cria Blob criptografado e trigger download via hidden.
   */
  async function processExport(options) {
    if (!db) {
      showToast("Banco de dados não está pronto.", "error");
      return;
    }

    if (!encryptionKey) {
      passwordPromptMessage.textContent =
        "Esta é a primeira exportação. Crie a senha mestra para proteger o novo arquivo de backup.";
      keepLoggedInCheckbox.checked = true;
      passwordModal.classList.remove("hidden");

      passwordForm.addEventListener(
        "submit",
        () => {
          showToast(
            "Senha criada! Por favor, clique em Exportar novamente para gerar o arquivo.",
            "info"
          );
        },
        { once: true }
      );

      return;
    }

    try {
      const storesToExport = [];
      if (options.includeCompanies) storesToExport.push("companies");
      if (options.includeFamilies) storesToExport.push("families");
      if (options.includeHistory) {
        storesToExport.push("history");
      }
      if (options.includeContacts) {
        storesToExport.push("contacts");
      }
      if (storesToExport.length === 0) {
        showToast("Nenhum dado selecionado para exportar.", "error");
        return;
      }
      storesToExport.push("metadata");

      const exportObj = {};
      const transaction = db.transaction(storesToExport, "readonly");
      for (const storeName of storesToExport) {
        const store = transaction.objectStore(storeName);
        const allRecords = await new Promise((resolve, reject) => {
          store.getAll().onsuccess = (e) => resolve(e.target.result);
          store.getAll().onerror = (e) => reject(e.target.error);
        });
        exportObj[storeName] = allRecords;
      }

      const jsonString = JSON.stringify(exportObj, null, 2);
      const encryptedText = await encryptData(jsonString, encryptionKey);

      const blob = new Blob([encryptedText], { type: "text/plain" });
      const url = URL.createObjectURL(blob);

      let filename = "backup.json";
      let toastMessage =
        'Backup de sincronização exportado como "backup.json"!';

      if (options.includeHistory || options.includeContacts) {
        const date = new Date().toISOString().slice(0, 10);
        filename = `full_backup_${date}.json`;
        toastMessage = `Backup pessoal completo exportado como "${filename}"!`;
      } else {
        const newHash = await calculateHash(jsonString);
        await saveLocalHash(newHash);
      }

      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      showToast(toastMessage, "success");
    } catch (error) {
      console.error("Erro ao exportar:", error);
      showToast("Falha ao exportar o backup.", "error");
    }
  }

  /**
   * @functionality 208
   * @category 2xx: Banco de Dados e Persistência
   * @name Processamento de Importação de Backup com Merge e Atualização de Hash
   * @description Descriptografa JSON, insere/atualiza stores e salva novo hash local.
   */
  function processImportData(data, fileHash) {
    return new Promise((resolve, reject) => {
      const storesToImport = Object.keys(data);
      if (storesToImport.length === 0) {
        showToast("Arquivo de backup inválido ou vazio.", "error");
        return reject("Arquivo inválido");
      }

      const transaction = db.transaction(storesToImport, "readwrite");
      transaction.oncomplete = () => {
        saveLocalHash(fileHash).then(() => {
          showToast("Dados restaurados com sucesso!", "success");
          checkDbStatus("companies", dbStatus, "registros");
          checkDbStatus("families", familyDbStatus, "famílias");
          renderContactsList();
          resolve();
        });
      };
      transaction.onerror = (err) => {
        console.error("Erro na transação de importação:", err);
        showToast("Erro ao restaurar os dados.", "error");
        reject(err);
      };

      for (const storeName of storesToImport) {
        if (db.objectStoreNames.contains(storeName)) {
          const store = transaction.objectStore(storeName);
          store.clear();
          data[storeName].forEach((record) => {
            store.put(record);
          });
        }
      }
    });
  }

  /**
   * @functionality 409
   * @category 4xx: UI/UX e Interações
   * @name Importação de Arquivo JSON com Descriptografia e Validação
   * @description Lê arquivo, descriptografa e processa via processImportData.
   */
  async function importDatabase(event) {
    const file = event.target.files[0];
    if (!file || !encryptionKey) {
      if (!encryptionKey)
        showToast("Por favor, faça login antes de importar.", "error");
      return;
    }

    const importStatus = document.getElementById("importStatus");
    const importLabel = document.getElementById("importDbLabel");
    const exportBtn = document.getElementById("exportDbBtn");

    importStatus.textContent = "Importando... Por favor, aguarde.";
    importLabel.classList.add("opacity-50", "cursor-not-allowed");
    exportBtn.disabled = true;

    try {
      const encryptedText = await file.text();
      const jsonText = await decryptData(encryptedText, encryptionKey);
      const data = JSON.parse(jsonText);
      const fileHash = await calculateHash(jsonText);
      await processImportData(data, fileHash);
    } catch (error) {
      console.error("Erro ao importar manualmente:", error);
      showToast("Falha ao ler ou descriptografar o backup.", "error");
    } finally {
      event.target.value = "";
      importStatus.textContent = "";
      importLabel.classList.remove("opacity-50", "cursor-not-allowed");
      exportBtn.disabled = false;
    }
  }

  // --- LÓGICA DO HISTÓRICO ---

  /**
   * @functionality 203
   * @category 2xx: Banco de Dados e Persistência
   * @name Gerenciamento de Histórico de Mensagens com Armazenamento Auto-Incrementado e Índices
   * @description Adiciona itens com timestamp.
   */
  function saveMessageToHistory(messageData) {
    if (!db) return;
    const transaction = db.transaction(["history"], "readwrite");
    const store = transaction.objectStore("history");
    store.put(messageData);

    transaction.oncomplete = () => {
      atualizarStatsExternos(); // Atualiza a Home assim que salvar
    };
  }

  /**
   * @functionality 203
   * @category 2xx: Banco de Dados e Persistência
   * @name Gerenciamento de Histórico de Mensagens com Armazenamento Auto-Incrementado e Índices
   * @description Renderiza lista expansível, suporta copy/delete/clear.
   * @functionality 402
   * @name Renderização Responsiva de Histórico com Expansão Colapsível e Ações Inline
   * @description Lista itens com botões copy/delete/expand, usando transições CSS para conteúdo oculto.
   */

  const svgIconCopy = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" class="w-4 h-4">
        <rect x="4" y="8" width="12" height="12" rx="1" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"/>
        <path d="M8 6V5C8 4.44772 8.44772 4 9 4H19C19.5523 4 20 4.44772 20 5V15C20 15.5523 19.5523 16 19 16H18" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round" stroke-dasharray="2 2"/>
    </svg>`;

  const svgIconExpand = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor">
        <path d="M12 5.83L15.17 9l1.41-1.41L12 3 7.41 7.59 8.83 9 12 5.83zm0 12.34L8.83 15l-1.41 1.41L12 21l4.59-4.59L15.17 15 12 18.17z"/>
    </svg>`;

  const svgIconCollapse = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" class="w-4 h-4" fill="currentColor">
        <path d="M7.41 18.59L8.83 20 12 16.83 15.17 20l1.41-1.41L12 14l-4.59 4.59zm9.18-13.18L15.17 4 12 7.17 8.83 4 7.41 5.41 12 10l4.59-4.59z"/>
    </svg>`;

async function renderHistory(cnpjFilter = "", startDateFilter = "", endDateFilter = "") {
  const container = document.getElementById("historyListContainer");
  container.innerHTML = '<p class="text-gray-500 text-center">Carregando histórico...</p>';

  if (!db) {
    container.innerHTML = '<p class="text-red-500 text-center">Banco de dados não disponível.</p>';
    return;
  }

  // --- MAPEAMENTO DE CORES PARA OS STATUS ---
  const statusColorMap = {
    'Deferida': 'text-green-600',
    'Deferida Parcial': 'text-yellow-600',
    'Indeferida': 'text-red-600',
    'Pendente de Envio': 'text-blue-600',
    'Pendente do Termo': 'text-indigo-600'
  };

  // --- SVG DO ÍCONE DE TELEFONE ---
  const phoneIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-green-500 inline-block align-middle ml-2" title="Contato telefônico registrado">
          <path fill-rule="evenodd" d="M5.847.533A2.21 2.21 0 004.391 0H2.206a2.21 2.21 0 00-2.09 1.501c-.098.29-.135.598-.107.903l.001.012a15.13 15.13 0 002.355 6.637c1.29 1.987 2.615 3.304 4.596 4.587a15.197 15.197 0 006.618 2.35h.014a2.21 2.21 0 002.406-2.204v-.075c-.002-.383-.008-1.771 0-2.087A2.204 2.204 0 0014.1 9.386h-.007a8.626 8.626 0 01-1.884-.47 2.21 2.21 0 00-2.327.497l-.515.513a10.903 10.903 0 01-3.313-3.305l.51-.509.003-.003a2.204 2.204 0 00.498-2.326 8.577 8.577 0 01-.47-1.88v-.007A2.204 2.204 0 005.847.533zM4.401 1.5a.71.71 0 01.708.604c.1.753.285 1.493.55 2.205l.001.001a.703.703 0 01-.157.742l-.924.923a.75.75 0 00-.122.902 12.403 12.403 0 004.655 4.646.75.75 0 00.9-.121l.923-.921.002-.002a.71.71 0 01.746-.157h.002c.713.266 1.454.45 2.209.55a.709.709 0 01.606.715 148.67 148.67 0 000 2.134v.07a.702.702 0 01-.481.671.71.71 0 01-.286.035 13.696 13.696 0 01-5.957-2.117c-1.805-1.168-2.979-2.335-4.153-4.144a13.63 13.63 0 01-2.12-5.972.702.702 0 01.419-.704c.09-.04.187-.06.286-.06H4.4zm2.664 2.283v-.001l-.703.264.703-.263z" clip-rule="evenodd"/>
          <path d="M10.333.005a.75.75 0 10-.166 1.49 4.91 4.91 0 014.338 4.332.75.75 0 001.49-.167A6.41 6.41 0 0010.333.005z"/>
          <path d="M10.394 2.53a.75.75 0 10-.288 1.472 2.395 2.395 0 011.892 1.892.75.75 0 101.472-.288 3.894 3.894 0 00-3.076-3.076z"/>
      </svg>
  `;


  // Busca todos os registros de uma única vez
  const transaction = db.transaction(["history"], "readonly");
  const store = transaction.objectStore("history");
  const allRecords = await new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

  // --- FILTRAGEM ---
  let filteredRecords = allRecords;

  // Filtro por CNPJ/CPF
  if (cnpjFilter) {
    const cleanedFilter = cnpjFilter.replace(/\D/g, "");
    filteredRecords = filteredRecords.filter(item => {
      const cleanedCnpj = item.cnpj.replace(/\D/g, "");
      return cleanedCnpj.includes(cleanedFilter);
    });
  }

  // Filtro por data inicial
  if (startDateFilter) {
    const [y, m, d] = startDateFilter.split("-");
    const startDate = new Date(y, m - 1, d);
    startDate.setHours(0, 0, 0, 0);
    filteredRecords = filteredRecords.filter(item => new Date(item.timestamp) >= startDate);
  }

  // Filtro por data final
  if (endDateFilter) {
    const [y, m, d] = endDateFilter.split("-");
    const endDate = new Date(y, m - 1, d);
    endDate.setHours(23, 59, 59, 999);
    filteredRecords = filteredRecords.filter(item => new Date(item.timestamp) <= endDate);
  }

  // --- RESULTADO VAZIO ---
  if (filteredRecords.length === 0) {
    container.innerHTML = '<p class="text-gray-500 text-center">Nenhum registro encontrado para os filtros aplicados.</p>';
    return;
  }

  // Limpa e começa a renderizar
  container.innerHTML = "";

  // Ordena do mais recente para o mais antigo
  filteredRecords.reverse().forEach(item => {
    const date = new Date(item.timestamp);
    const formattedDate = date.toLocaleString("pt-BR");

    const status = item.status || "Status Desconhecido";
    const statusColor = statusColorMap[status] || "text-gray-500";
    const contactMadeHtml = item.contactMade ? phoneIcon : '';

    const div = document.createElement("div");
    div.className = "border rounded-lg bg-white shadow-sm overflow-hidden mb-4";

    div.innerHTML = `
      <div class="p-3 flex justify-between items-center bg-gray-50 border-b">
        <div class="flex-grow">
          <p class="font-bold text-blue-700">${escapeHtml(item.companyName)}</p>
          <p class="text-sm text-gray-600">${escapeHtml(item.cnpj)}</p>
          <p class="text-xs text-gray-400 mt-1">
            <span class="font-bold mr-1 ${statusColor}">${escapeHtml(status)}</span> 
            | Gerado em: ${formattedDate}
            ${contactMadeHtml}
          </p>
        </div>

        <div class="flex items-center space-x-2">
          <button data-id="${item.id}" class="delete-history-btn text-red-500 hover:text-red-700 font-bold text-2xl leading-none">&times;</button>
          <button data-message="${encodeURIComponent(item.message)}" title="Copiar" 
                  class="copy-history-btn bg-gray-200 text-gray-700 p-2 rounded hover:bg-gray-300 transition">
            ${svgIconCopy}
          </button>
          <button title="Expandir" 
                  class="expand-history-btn text-blue-600 hover:bg-blue-100 rounded p-2 transition">
            ${svgIconExpand}
          </button>
        </div>
      </div>

      <div class="history-message-content overflow-hidden" style="max-height:0; transition:max-height 0.3s ease-out;">
        <pre class="p-4 text-xs text-gray-800 whitespace-pre-wrap font-sans break-words">
${escapeHtml(item.message)}
        </pre>
      </div>
    `;

    container.appendChild(div);
  });
}

  /**
   * @functionality 211
   * @category 2xx: Banco de Dados e Persistência
   * @name Limpeza Total de Histórico com Confirmação e Reset de Container
   * @description Deleta todos itens do store 'history' e limpa UI.
   */
  function clearHistory() {
    if (
      !confirm(
        "Tem certeza que deseja apagar TODO o histórico de mensagens? Esta ação não pode ser desfeita."
      )
    ) {
      return;
    }
    if (!db) return;
    const transaction = db.transaction(["history"], "readwrite");
    const store = transaction.objectStore("history");
    const request = store.clear();
    request.onsuccess = () => {
      showToast("Histórico limpo com sucesso.", "success");
      renderHistory();
      atualizarStatsExternos();
    };
    request.onerror = () => {
      showToast("Erro ao limpar o histórico.", "error");
    };
  }

  /**
   * @functionality 210
   * @category 2xx: Banco de Dados e Persistência
   * @name Deleção de Item de Histórico com Confirmação e Atualização de Lista
   * @description Remove por ID via transaction e re-renderiza lista.
   */
  function deleteHistoryItem(id) {
    if (!db) return;
    const transaction = db.transaction(["history"], "readwrite");
    const store = transaction.objectStore("history");
    const request = store.delete(id);
    request.onsuccess = () => {
      showToast("Item removido do histórico.", "success");
      renderHistory();
      atualizarStatsExternos();
    };
    request.onerror = () => {
      showToast("Erro ao remover item.", "error");
    };
  }

  // --- LÓGICA DO DASHBOARD ---

  /**
   * @functionality 600
   * @category 6xx: Dashboard e Análises
   * @name Função Principal de Renderização do Dashboard
   * @description Orquestra a busca, processamento e renderização dos dados.
   */
  async function renderDashboard() {
    if (!db || !encryptionKey) {
      showToast("Banco de dados não disponível ou não logado.", "error");
      return;
    }

    // Mostra feedback de carregamento
    topDocsList.innerHTML =
      '<p class="text-gray-500 text-center">Processando...</p>';
    topReasonsList.innerHTML =
      '<p class="text-gray-500 text-center">Processando...</p>';

    try {
      const period = dashboardPeriodFilter.value;
      const historyItems = await loadHistoryForDashboard(period);
      dashboardTotalCount.textContent = historyItems.length;
      if (historyItems.length === 0) {
        topDocsList.innerHTML =
          '<p class="text-gray-500 text-center">Nenhum dado encontrado.</p>';
        topReasonsList.innerHTML =
          '<p class="text-gray-500 text-center">Nenhum dado encontrado.</p>';
        if (statusChartInstance) statusChartInstance.destroy();
        return;
      }

      const stats = processHistoryData(historyItems);

      renderStatusChart(stats.statusCounts);
      renderTopList(
        topDocsList,
        stats.docCounts,
        "Nenhum documento indeferido registrado."
      );
      renderTopList(
        topReasonsList,
        stats.reasonCounts,
        "Nenhum motivo de indeferimento registrado."
      );
    } catch (error) {
      console.error("Erro ao renderizar dashboard:", error);
      showToast("Erro ao processar dados do dashboard.", "error");
    }
  }

  /**
   * @functionality 601
   * @category 6xx: Dashboard e Análises
   * @name Carregamento de Dados do Histórico com Filtro
   * @description Busca no IndexedDB usando cursor e filtros de período/limite.
   */
  function loadHistoryForDashboard(period = "all") {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(["history"], "readonly");
      const store = transaction.objectStore("history");
      const index = store.index("timestamp"); // Usa o índice de timestamp

      let range = null;
      if (period === "month") {
        const oneMonthAgo = new Date();
        oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
        range = IDBKeyRange.lowerBound(oneMonthAgo.toISOString());
      }

      const request = index.openCursor(range, "prev"); // 'prev' para pegar os mais recentes
      const results = [];
      const limit = 1000;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor && results.length < limit) {
          results.push(cursor.value);
          cursor.continue();
        } else {
          resolve(results); // Retorna os dados (limitados a 1000 ou pelo período)
        }
      };
      request.onerror = (event) => reject(event.target.error);
    });
  }

  /**
   * @functionality 602
   * @category 6xx: Dashboard e Análises
   * @name Processamento e Agregação de Dados do Histórico
   * @description Processa o array de histórico, com fallback para dados antigos.
   */
  function processHistoryData(historyItems) {
    const statusCounts = new Map();
    const docCounts = new Map();
    const reasonCounts = new Map();

    const statusRegex = /foi analisada e \*(.*?)\*/; // Fallback para dados antigos

    historyItems.forEach((item) => {
      // 1. Processar Status (com fallback)
      let status = item.status;
      if (!status && item.message) {
        const match = item.message.match(statusRegex);
        if (match && match[1]) {
          status = match[1];
        }
      }
      if (status) {
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      }

      // 2. Processar Documentos e Motivos (APENAS dados novos)
      if (item.rejectedDocs && Array.isArray(item.rejectedDocs)) {
        item.rejectedDocs.forEach((doc) => {
          // Contar Documentos
          let docName =
            doc.name === "Sócio" && doc.socioName
              ? `Sócio: ${doc.socioName}`
              : doc.name;
          docCounts.set(docName, (docCounts.get(docName) || 0) + 1);

          // Contar Motivos
          if (doc.reason) {
            reasonCounts.set(
              doc.reason,
              (reasonCounts.get(doc.reason) || 0) + 1
            );
          }
        });
      }
    });

    // Helper para ordenar Map e pegar Top 5
    const sortMap = (map) => {
      return [...map.entries()]
        .sort((a, b) => b[1] - a[1]) // Ordena por contagem (descendente)
        .slice(0, 5); // Pega o Top 5
    };

    return {
      statusCounts: new Map(
        [...statusCounts.entries()].sort((a, b) => b[1] - a[1])
      ),
      docCounts: sortMap(docCounts),
      reasonCounts: sortMap(reasonCounts),
    };
  }
  /**
   * @functionality 603
   * @category 6xx: Dashboard e Análises
   * @name Renderização do Gráfico de Pizza (Chart.js)
   * @description Cria ou atualiza a instância do gráfico de status.
   */
  function renderStatusChart(statusData) {
    const ctx = statusChartCanvas.getContext("2d");

    // Destrói o gráfico anterior, se existir (essencial para "Atualizar")
    if (statusChartInstance) {
      statusChartInstance.destroy();
    }

    // Mapeamento de cores (pode ser expandido)
    const statusColors = {
      Deferida: "rgba(34, 139, 34, 0.7)", // Verde
      Indeferida: "rgba(220, 20, 60, 0.7)", // Vermelho
      "Deferida Parcial": "rgba(255, 165, 0, 0.7)", // Laranja
      "Pendente de Envio": "rgba(100, 149, 237, 0.7)", // Azul
      "Pendente do Termo": "rgba(218, 165, 32, 0.7)", // Dourado
      default: "rgba(128, 128, 128, 0.7)", // Cinza
    };

    const labels = [...statusData.keys()];
    const data = [...statusData.values()];
    const backgroundColors = labels.map(
      (label) => statusColors[label] || statusColors.default
    );

    statusChartInstance = new Chart(ctx, {
      type: "pie", // Tipo 'pie' (Pizza)
      data: {
        labels: labels,
        datasets: [
          {
            label: "# de Análises",
            data: data,
            backgroundColor: backgroundColors,
            borderColor: backgroundColors.map((c) => c.replace("0.7", "1")),
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        plugins: {
          legend: {
            position: "top",
          },
          tooltip: {
            callbacks: {
              label: function (context) {
                let label = context.label || "";
                let value = context.raw || 0;
                let total = context.chart.getDatasetMeta(0).total;
                let percentage = ((value / total) * 100).toFixed(1) + "%";
                return `${label}: ${value} (${percentage})`;
              },
            },
          },
        },
      },
    });
  }

  /**
   * @functionality 604
   * @category 6xx: Dashboard e Análises
   * @name Renderização das Listas "Top 5"
   * @description Popula o HTML das listas de documentos e motivos.
   */
  function renderTopList(container, data, emptyMessage) {
    if (data.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-center">${emptyMessage}</p>`;
      return;
    }

    container.innerHTML = ""; // Limpa o container
    const ol = document.createElement("ol");
    ol.className = "list-decimal list-inside space-y-2";

    data.forEach(([name, count]) => {
      const li = document.createElement("li");
      li.className =
        "text-sm text-gray-800 bg-white p-2 border-l-4 border-blue-500 rounded-r-md";
      li.innerHTML = `
                <span class="font-semibold text-blue-700">${count}x</span> - ${escapeHtml(
        name
      )}
            `;
      ol.appendChild(li);
    });
    container.appendChild(ol);
  }

  // --- FIM DA LÓGICA DO DASHBOARD ---

  // ---XX LÓGICA DE CONTATOS PESSOAIS XX---

  /**
   * @functionality 212
   * @category 2xx: Banco de Dados e Persistência
   * @name Renderização da Lista de Contatos Pessoais no Modal de DB
   * @description Lê o store 'contacts' e popula a lista no dbModal com botões de exclusão.
   */
  async function renderContactsList() {
    if (!db) return;
    contactsListContainer.innerHTML =
      '<p class="text-gray-500 text-center">Carregando...</p>';

    const transaction = db.transaction(["contacts"], "readonly");
    const store = transaction.objectStore("contacts");
    const allContacts = await new Promise((resolve, reject) => {
      store.getAll().onsuccess = (e) => resolve(e.target.result);
      store.getAll().onerror = (e) => reject(e.target.error);
    });

    if (allContacts.length === 0) {
      contactsListContainer.innerHTML =
        '<p class="text-sm text-gray-500 text-center">Nenhum contato cadastrado.</p>';
      return;
    }

    contactsListContainer.innerHTML = "";
    allContacts.forEach((contact) => {
      const div = document.createElement("div");
      div.className =
        "flex justify-between items-center bg-white p-2 rounded border text-sm";
      div.innerHTML = `
                <div>
                    <p class="font-semibold text-gray-800">${escapeHtml(
                      contact.name
                    )}</p>
                    <p class="text-xs text-gray-600">${escapeHtml(
                      contact.role
                    )} (${escapeHtml(contact.phone)})</p>
                </div>
                <button data-id="${
                  contact.id
                }" class="delete-contact-btn text-red-500 hover:text-red-700 font-bold p-1 text-lg leading-none">&times;</button>
            `;
      contactsListContainer.appendChild(div);
    });
  }

  /**
   * @functionality 213
   * @category 2xx: Banco de Dados e Persistência
   * @name Adicionar Contato Pessoal
   * @description Salva um novo contato no store 'contacts' a partir do formulário do modal.
   */
  function addContact() {
    const name = modalcontactNameInput.value.trim();
    const role = modalcontactRoleInput.value.trim();
    let phone = contactPhoneInput.value.trim().replace(/\D/g, "");

    if (!name || !phone) {
      showToast("Nome e WhatsApp são obrigatórios.", "error");
      return;
    }

    if (phone.length <= 11) {
      // Ex: 719... ou 119...
      showToast("Telefone inválido. Inclua o código do país (55).", "error");
      return;
    }

    const transaction = db.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    store.put({ name, role, phone });

    transaction.oncomplete = () => {
      showToast("Contato adicionado!", "success");
      modalcontactNameInput.value = "";
      modalcontactRoleInput.value = "";
      contactPhoneInput.value = "";
      renderContactsList();
    };
    transaction.onerror = () => showToast("Erro ao salvar contato.", "error");
  }

  /**
   * @functionality 214
   * @category 2xx: Banco de Dados e Persistência
   * @name Deletar Contato Pessoal
   * @description Remove um contato do store 'contacts' por ID.
   */
  function deleteContact(id) {
    if (!db || !id) return;
    if (!confirm("Tem certeza que deseja remover este contato?")) return;

    const transaction = db.transaction(["contacts"], "readwrite");
    const store = transaction.objectStore("contacts");
    store.delete(id);

    transaction.oncomplete = () => {
      showToast("Contato removido.", "success");
      renderContactsList();
    };
    transaction.onerror = () => showToast("Erro ao remover contato.", "error");
  }

  /**
   * @functionality 417
   * @category 4xx: UI/UX e Interações
   * @name Exportar CSV de Contatos Pessoais
   * @description Gera e baixa um arquivo CSV a partir do store 'contacts'.
   */
  async function exportContactsCsv() {
    if (!db) return;
    const transaction = db.transaction(["contacts"], "readonly");
    const store = transaction.objectStore("contacts");
    const allContacts = await new Promise((resolve, reject) => {
      store.getAll().onsuccess = (e) => resolve(e.target.result);
      store.getAll().onerror = (e) => reject(e.target.error);
    });

    let csvContent = "Nome;;Cargo;;Telefone\n";
    allContacts.forEach((c) => {
      csvContent += `${c.name};;${c.role};;${c.phone}\n`;
    });

    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "contatos_pessoais_whatsapp.csv";
    a.click();
    URL.revokeObjectURL(url);
    showToast("CSV de Contatos exportado!", "success");
  }

  /**
   * @functionality 314
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Abrir Modal de Envio WhatsApp
   * @description Popula o wppModal com contatos do store 'contacts'.
   */
  async function openWppModal() {
    if (!db) {
      showToast("Banco de dados não disponível.", "error");
      return;
    }
    const message = resultText.value;
    if (!message) {
      showToast("Gere uma mensagem antes de enviar.", "error");
      return;
    }

    wppContactListContainer.innerHTML =
      '<p class="text-gray-500 text-center">Carregando contatos...</p>';
    const transaction = db.transaction(["contacts"], "readonly");
    const store = transaction.objectStore("contacts");
    const allContacts = await new Promise((resolve, reject) => {
      store.getAll().onsuccess = (e) => resolve(e.target.result);
      store.getAll().onerror = (e) => reject(e.target.error);
    });

    if (allContacts.length === 0) {
      wppContactListContainer.innerHTML =
        '<p class="text-center text-red-500">Nenhum contato pessoal cadastrado. Adicione contatos no menu "Gerenciar Base de Dados".</p>';
    } else {
      wppContactListContainer.innerHTML = "";
      allContacts.forEach((contact) => {
        const button = document.createElement("button");
        button.className =
          "w-full text-left p-3 bg-gray-50 hover:bg-blue-100 rounded-lg transition";
        button.dataset.phone = contact.phone;
        button.innerHTML = `
                    <p class="font-semibold text-blue-700">${escapeHtml(
                      contact.name
                    )}</p>
                    <p class="text-sm text-gray-600">${escapeHtml(
                      contact.role
                    )}</p>
                `;
        wppContactListContainer.appendChild(button);
      });
    }
    wppModal.classList.remove("hidden");
  }

  /**
   * @functionality 315
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Handler de Clique para Envio de WhatsApp
   * @description Pega o telefone do data-attribute e abre o link wa.me.
   */
  function handleWppContactClick(event) {
    const targetButton = event.target.closest("button");
    if (!targetButton || !targetButton.dataset.phone) return;

    const phone = targetButton.dataset.phone;
    const message = resultText.value;
    const encodedMessage = encodeURIComponent(message);
    const wppUrl = `https://wa.me/${phone}?text=${encodedMessage}`;

    window.open(wppUrl, "_blank");
    wppModal.classList.add("hidden");
  }

  // ---XX LÓGICA PRINCIPAL DA APLICAÇÃO XX---

  /**
   * @functionality 204
   * @category 2xx: Banco de Dados e Persistência
   * @name Parsing de CSV para Empresas com Delimitador ';;' e Codificação ISO-8859-1
   * @description Extrai CNPJ e nome de linhas CSV, ignora headers e linhas vazias.
   */
  const companyParser = (line) => {
    const parts = line.split(";;");
    if (parts.length >= 2) {
      const cnpj = parts[0].trim().replace(/\D/g, "");
      const razaoSocial = parts[1]?.trim();
      const dataCadastro = parts[2]?.trim() || "";
      const tipoCadastro = parts[3]?.trim() || "";

      if (cnpj && razaoSocial)
        return { cnpj, razaoSocial, dataCadastro, tipoCadastro };
    }
    return null;
  };

  /**
   * @functionality 205
   * @category 2xx: Banco de Dados e Persistência
   * @name Parsing de CSV para Famílias com Mapeamento de ID e Descrição
   * @description Extrai ID e descrição de famílias de linhas CSV delimitadas por ';;'.
   */
  const familyParser = (line) => {
    const parts = line.split(";;");
    if (parts.length >= 3) {
      const id = parts[0]?.trim();
      const description = parts[2]?.trim();
      if (id && description) return { id, description };
    }
    return null;
  };

  /**
   * @functionality 205.5
   * @category 2xx: Banco de Dados e Persistência
   * @name Parsing de CSV para Contatos Pessoais
   * @description Extrai nome, cargo e telefone de linhas CSV delimitadas por ';;'.
   */
  const contactsParser = (line) => {
    const parts = line.split(";;");
    if (parts.length >= 3) {
      const name = parts[0]?.trim();
      const role = parts[1]?.trim();
      const phone = parts[2]?.trim().replace(/\D/g, ""); // Limpa o telefone
      if (name && phone) return { name, role, phone };
    }
    return null;
  };

  /**
   * @functionality 302
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Busca e Preenchimento Automático de Dados de Empresa via IndexedDB
   * @description Consulta store 'companies' por CNPJ formatado, popula nome da empresa e exibe status de validação.
   */
  function searchCnpj(doc) {
    companyNameResults.innerHTML = ""; //limpa lista de sugestões
    if (!encryptionKey) {
      showToast("Por favor, faça login para usar a base de dados.", "error");
      return;
    }
    const cleanedDoc = doc.replace(/\D/g, "");
    if ((cleanedDoc.length !== 11 && cleanedDoc.length !== 14) || !db) {
      companyNameInputForDb.value = "";
      cnpjStatusSpan.textContent = "";
      return;
    }

    cnpjStatusSpan.textContent = "Buscando...";
    cnpjStatusSpan.className = "text-gray-500";

    const transaction = db.transaction(["companies"], "readonly");
    const objectStore = transaction.objectStore("companies");
    const request = objectStore.get(cleanedDoc);

    request.onsuccess = function (event) {
      if (request.result) {
        // 1. Preenche os dados básicos da empresa (sempre que encontrar)
        companyNameInputForDb.value = request.result.razaoSocial;
        registrationDateInput.value = request.result.dataCadastro || "--";

        // 2. Verifica se TEM um tipo de cadastro (CRC, CRS, etc.)
        if (
          request.result.tipoCadastro &&
          request.result.tipoCadastro.toLowerCase() !== "null"
        ) {
          const tipo = request.result.tipoCadastro.trim().toUpperCase();
          if (tipo === "CRC") {
            registrationTypeInput.value = "CRC";
          } else if (tipo === "CRS") {
            registrationTypeInput.value = "CRS";
          } else if (tipo === "CANDIDATO") {
            registrationTypeInput.value = "Candidato";
          } else {
            registrationTypeInput.value = "CRC"; // Padrão se não reconhecer
          }

          // Status VERDE (Cadastro completo)
          cnpjStatusSpan.textContent = "Encontrado";
          cnpjStatusSpan.className = "text-green-600";
        } else {
          // 3. NÃO TEM tipo de cadastro (o campo é nulo ou vazio)

          // Define o tipo de cadastro como padrão no formulário
          registrationTypeInput.value = "CRC";

          // Status AMARELO (Conforme solicitado)
          cnpjStatusSpan.textContent = "Encontrado (Sem cadastro)";
          cnpjStatusSpan.className = "text-yellow-600"; // Tailwind para amarelo
        }
      } else {
        // 4. Bloco 'Não encontrado' (permanece o mesmo)
        companyNameInputForDb.value = "";
        registrationDateInput.value = "--";
        registrationTypeInput.value = "CRC";
        cnpjStatusSpan.textContent = "Não encontrado";
        cnpjStatusSpan.className = "text-red-600";
      }
    };
    request.onerror = function (event) {
      cnpjStatusSpan.textContent = "Erro";
      cnpjStatusSpan.className = "text-red-600";
      registrationDateInput.value = "--";
      registrationTypeInput.value = "CRC";
    };
  }

  /**
   * @functionality 302.5
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Sistema de Autocomplete para Busca de Empresas por Razão Social
   * @description Busca fuzzy (contains) em companies store via cursor, limita a 10 resultados.
   */
  function searchCompanyByName(searchTerm) {
    if (!encryptionKey) return; // Não mostra toast, para não poluir
    companyNameResults.innerHTML = "";
    if (searchTerm.length < 5 || !db) return; // Limite de 6 caracteres

    const transaction = db.transaction(["companies"], "readonly");
    const store = transaction.objectStore("companies");
    const request = store.openCursor();
    const results = [];
    const lowerCaseSearchTerm = searchTerm.toLowerCase();

    request.onsuccess = function (event) {
      const cursor = event.target.result;
      if (cursor) {
        if (
          cursor.value.razaoSocial.toLowerCase().includes(lowerCaseSearchTerm)
        ) {
          results.push(cursor.value);
        }
        if (results.length < 10) {
          // Limita a 10 resultados
          cursor.continue();
        } else {
          displayCompanyNameResults(results); // Atingiu o limite
        }
      } else {
        displayCompanyNameResults(results); // Fim do cursor
      }
    };
  }

  /**
   * @functionality 302.6
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Renderização de Resultados de Autocomplete de Empresa
   * @description Preenche div com resultados clicáveis, armazenando dados em data-attributes.
   */
  function displayCompanyNameResults(results) {
    companyNameResults.innerHTML = "";
    results.forEach((company) => {
      const div = document.createElement("div");
      // Estilização idêntica à de famílias (via CSS em index/style.css)
      div.className = "p-3 hover:bg-gray-100 cursor-pointer text-sm";
      div.textContent = company.razaoSocial;
      div.dataset.cnpj = company.cnpj;
      div.dataset.razaoSocial = company.razaoSocial;
      div.dataset.dataCadastro = company.dataCadastro || "";
      div.dataset.tipoCadastro = company.tipoCadastro || "";
      companyNameResults.appendChild(div);
    });
  }

  /**
   * @functionality 309
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Mapeamento de Documentos por Categoria em Objeto Constante
   * @description Define array docsByCat com listas de docs por aba (ex: Habilitação Jurídica).
   */
  const docsByCat = {
    "Dados do Fornecedor": ["Documento de Identificação"],
    "Habilitação Jurídica": [
      "Contrato Social",
      "Estatuto Social",
      "Ata",
      "Sócio",
      "Dirigente",
    ],
    Família: [],
    "Qualificação Técnica": [],
    "Regularidade Fiscal e Trabalhista": [
      "Cartão CNPJ",
      "Cadastro de Contribuinte Estadual",
      "Cadastro de Contribuinte Municipal",
      "Regularidade Fazenda Federal e a Dívida Ativa e INSS",
      "Regularidade com a Fazenda Estadual",
      "Regularidade Faz. Estadual (Licitação)",
      "Regularidade com a Fazenda Municipal",
      "Regularidade com o FGTS - CEF",
      "Certidão de Débitos Trabalhistas",
    ],
    "Qualificação Econômico-Financeira": [
      "Concordata e Falência",
      "Balanço 01",
      "Balanço 02",
    ],
    "Formulários e Declarações": [
      "Declaração do Empregador",
      "Declaração de Superveniência",
      "Declaração de Enquadramento",
      "Declaração de Desenquadramento",
      "Procuração",
      "Comprovante de Residência",
      "Termo de Concordância e Veracidade",
    ],
  };

  const statusRadios = document.querySelectorAll('input[name="status"]');
  const rejectedDocsSection = document.getElementById("rejected-docs-section");
  const generateBtn = document.getElementById("generateBtn");
  const resultSection = document.getElementById("result-section");
  const resultText = document.getElementById("resultText");
  const copyBtn = document.getElementById("copyBtn");
  const addDocBtn = document.getElementById("addDocBtn");
  const rejectedDocsListContainer =
    document.getElementById("rejected-docs-list");
  const companyNameInput = document.getElementById("companyName");
  const analysisDateInput = document.getElementById("analysisDate");
  const registrationTypeInput = document.getElementById("registrationType");
  const registrationDateInput = document.getElementById("registrationDate");
  const docCategoryInput = document.getElementById("docCategory");
  const docNameSelect = document.getElementById("docName");
  const customDocNameWrapper = document.getElementById("customDocNameWrapper");
  const customDocNameInput = document.getElementById("customDocName");
  const socioNameWrapper = document.getElementById("socioNameWrapper");
  const socioNameInput = document.getElementById("socioName");
  const rejectionReasonInput = document.getElementById("rejectionReason");
  const docNameWrapper = document.getElementById("docNameWrapper");
  const familyAutocompleteWrapper = document.getElementById(
    "familyAutocompleteWrapper"
  );
  const familySearchInput = document.getElementById("familySearchInput");
  const familyResults = document.getElementById("familyResults");
  const contactMadeCheckbox = document.getElementById("contactMade");
  const contactDetailsWrapper = document.getElementById(
    "contactDetailsWrapper"
  );
  const contactNameInput = document.getElementById("contactName");
  const contactRoleInput = document.getElementById("contactRole");
  let rejectedDocs = [];
  let selectedFamilyId = null;
  const contactPhoneInput = document.getElementById("contactPhone");
  const contactSuccessSelect = document.getElementById("contactSuccess");
  const omitLegalFlagCheckbox = document.getElementById("omitLegalFlag");

  /**
   * @functionality 312
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Reset de Campos de Formulário Após Busca de CNPJ
   * @description Limpa nome, contato, docs e rejected list ao digitar novo CNPJ.
   */
  function resetFormFields() {
    document.getElementById("statusDeferida").checked = true;
    registrationTypeInput.value = "CRC";
    registrationDateInput.value = "";
    const today = new Date().toISOString().split("T")[0];
    analysisDateInput.value = today;
    rejectedDocs = [];
    renderRejectedDocs();
    toggleRejectedDocsSection();
    resultSection.classList.add("hidden");
    resultText.value = "";
    contactMadeCheckbox.checked = false;
    contactDetailsWrapper.classList.add("hidden");
    contactNameInput.value = "";
    contactRoleInput.value = "Sócio";
    if (contactPhoneInput) contactPhoneInput.value = "";
    if (contactSuccessSelect) contactSuccessSelect.value = "S";
    const contactGenderM = document.getElementById("contactGenderM");
    if (contactGenderM) contactGenderM.checked = true; // Volta para Masculino

  }

  /**
   * @functionality 305
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Preenchimento Dinâmico de Selects de Documentos por Categoria
   * @description Mapeia docsByCat para opções de select, com fallback para 'outro' e custom input.
   */
  const populateDocNames = () => {
    const selectedCategory = docCategoryInput.value;

    familyAutocompleteWrapper.classList.add("hidden");
    docNameWrapper.classList.remove("hidden");
    customDocNameWrapper.classList.add("hidden");
    socioNameWrapper.classList.add("hidden");
    familySearchInput.value = "";
    selectedFamilyId = null;

    if (selectedCategory === "Família") {
      docNameWrapper.classList.add("hidden");
      familyAutocompleteWrapper.classList.remove("hidden");
      return;
    }

    const docs = docsByCat[selectedCategory] || [];
    docNameSelect.innerHTML = "";

    docs.forEach((doc) => {
      const option = document.createElement("option");
      option.value = doc;
      option.textContent = doc;
      docNameSelect.appendChild(option);
    });

    const otherOption = document.createElement("option");
    otherOption.value = "outro";
    otherOption.textContent = "Outro...";
    docNameSelect.appendChild(otherOption);

    if (selectedCategory === "Qualificação Técnica") {
      docNameSelect.value = "outro";
    }
    handleDocNameChange();
  };

  /**
   * @functionality 310
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Tratamento de Input Customizado para Documentos 'Outro' ou 'Sócio'
   * @description Mostra/oculta inputs para nome custom ou sócio baseado em select.
   */
  function handleDocNameChange() {
    const selectedDoc = docNameSelect.value;
    customDocNameWrapper.classList.add("hidden");
    socioNameWrapper.classList.add("hidden");

    if (selectedDoc === "outro") {
      customDocNameWrapper.classList.remove("hidden");
      customDocNameInput.focus();
    } else if (selectedDoc === "Sócio") {
      socioNameWrapper.classList.remove("hidden");
      socioNameInput.focus();
    }
  }

  /**
   * @functionality 303
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Manipulação Dinâmica de Seção de Documentos Indeferidos
   * @description Toggle visibilidade por status.
   * @functionality 306
   * @name Toggle Condicional de Campos de Análise por Status de Cadastro
   * @description Desabilita/enable campos (data, tipo) para status 'Pendente'.
   */
  const toggleRejectedDocsSection = () => {
    const selectedStatus = document.querySelector(
      'input[name="status"]:checked'
    ).value;
    const analysisFields = document
      .getElementById("company-data")
      .querySelectorAll('input[type="date"], select');

    if (
      selectedStatus === "Deferida Parcial" ||
      selectedStatus === "Indeferida"
    ) {
      rejectedDocsSection.classList.remove("hidden");
      analysisFields.forEach((field) => (field.disabled = false));
    } else {
      rejectedDocsSection.classList.add("hidden");
    }

    if (
      selectedStatus === "Pendente de Envio" ||
      selectedStatus === "Pendente do Termo"
    ) {
      analysisFields.forEach((field) => {
        field.disabled = true;
        field.classList.add("bg-gray-100");
      });
      analysisDateInput.disabled = true;
      analysisDateInput.classList.add("bg-gray-100");
    } else {
      analysisFields.forEach((field) => {
        field.disabled = false;
        field.classList.remove("bg-gray-100");
      });
      analysisDateInput.disabled = false;
      analysisDateInput.classList.remove("bg-gray-100");
    }
  };

  /**
   * @functionality 307
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Formatação de Data de Análise para DD/MM/AAAA
   * @description Converte ISO date string para formato brasileiro.
   */
  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };

  /**
   * @functionality 405
   * @category 4xx: UI/UX e Interações
   * @name Renderização de Lista de Documentos Indeferidos com Remoção Inline
   * @description Gera HTML dinâmico para itens de rejectedDocs, com botões de remoção por índice.
   */
  const renderRejectedDocs = () => {
    rejectedDocsListContainer.innerHTML = "";
    if (rejectedDocs.length === 0) return;

    const heading = document.createElement("h3");
    heading.className = "text-md font-semibold text-gray-600";
    heading.textContent = "Documentos Adicionados:";
    rejectedDocsListContainer.appendChild(heading);

    rejectedDocs.forEach((doc, index) => {
      const docElement = document.createElement("div");
      docElement.className =
        "flex justify-between items-center bg-white p-3 rounded-lg border";

      let docDisplayName = doc.name;
      if (doc.name === "Sócio" && doc.socioName) {
        docDisplayName += `: ${doc.socioName}`;
      }

      docElement.innerHTML = `
                <div class="text-sm">
                    <p class="font-bold text-blue-700">${escapeHtml(
                      doc.category
                    )}</p>
                    <p class="text-gray-800">${escapeHtml(docDisplayName)}</p>
                    <p class="text-gray-500 italic">Motivo: ${escapeHtml(
                      doc.reason
                    )}</p>
                </div>
                <button data-index="${index}" class="remove-doc-btn text-red-500 hover:text-red-700 font-bold p-1">&times;</button>
            `;
      rejectedDocsListContainer.appendChild(docElement);
    });
  };

  /**
   * @functionality 303
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Manipulação Dinâmica de Seção de Documentos Indeferidos
   * @description Adiciona/remove itens em array e atualiza a UI.
   */
  const addRejectedDoc = () => {
    const category = docCategoryInput.value;
    let name;
    const reason = rejectionReasonInput.value.trim();
    let socioName = null;

    if (category === "Família") {
      name = familySearchInput.value.trim();
      if (!selectedFamilyId || name === "") {
        alert("Por favor, selecione uma família da lista de sugestões.");
        return;
      }
    } else {
      name = docNameSelect.value;
      if (name === "outro") {
        name = customDocNameInput.value.trim();
      } else if (name === "Sócio") {
        socioName = socioNameInput.value.trim();
        if (!socioName) {
          alert("Por favor, preencha o nome do sócio.");
          return;
        }
      }
    }

    if (!name || !reason) {
      alert("Por favor, preencha o nome do documento e o motivo.");
      return;
    }

    rejectedDocs.push({ category, name, reason, socioName });
    renderRejectedDocs();

    showToast("Documento adicionado!", "success");
    rejectionReasonInput.value = "";
    customDocNameInput.value = "";
    socioNameInput.value = "";
    populateDocNames();
    rejectionReasonInput.focus();
  };

  const removeRejectedDoc = (index) => {
    rejectedDocs.splice(index, 1);
    renderRejectedDocs();
  };

  /**
   * @functionality 304
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Sistema de Autocomplete para Busca de Famílias na DB com Cursor Pagination
   * @description Busca fuzzy em families store via cursor, limita a 10 resultados, seleciona via click.
   */
  function searchFamilies(searchTerm) {
    if (!encryptionKey) {
      showToast("Por favor, faça login para usar a base de dados.", "error");
      return;
    }
    familyResults.innerHTML = "";
    if (!searchTerm || !db) return;

    const transaction = db.transaction(["families"], "readonly");
    const store = transaction.objectStore("families");
    const request = store.openCursor();
    const results = [];

    request.onsuccess = function (event) {
      const cursor = event.target.result;
      if (cursor) {
        if (
          cursor.value.description
            .toLowerCase()
            .includes(searchTerm.toLowerCase())
        ) {
          results.push(cursor.value);
        }
        cursor.continue();
      } else {
        displayFamilyResults(results.slice(0, 10));
      }
    };
  }

  function displayFamilyResults(results) {
    familyResults.innerHTML = "";
    results.forEach((family) => {
      const div = document.createElement("div");
      div.textContent = family.description;
      div.dataset.id = family.id;
      div.dataset.description = family.description;
      familyResults.appendChild(div);
    });
  }

  /**
   * @functionality 300
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Geração de Mensagens Personalizadas com Template Switch por Status
   * @description Monta strings Markdown-like baseadas em status, com agrupamento de docs e footer. Salva em histórico.
   * @functionality 313
   * @name Validações de Formulário Antes de Geração com Alerts
   * @description Checa campos obrigatórios.
   */
  const generateMessage = () => {
    if (!encryptionKey) {
      showToast("Por favor, faça login para usar o aplicativo.", "error");
      return;
    }
    const companyName = companyNameInput.value.trim();
    const cnpj = cnpjInputForDb.value.trim();
    const analysisDate = formatDate(analysisDateInput.value);
    const registrationType = registrationTypeInput.value;
    const status = document.querySelector('input[name="status"]:checked').value;
    const contactMade = contactMadeCheckbox.checked;
    const contactName = contactNameInput.value.trim();
    const contactRole = contactRoleInput.value;
    const contactPhone = contactPhoneInput.value.trim();
    const contactSuccess = contactSuccessSelect.value;
    const contactGender = document.querySelector('input[name="contactGender"]:checked').value;
    const omitLegal = omitLegalFlagCheckbox.checked;

    if (!companyName || !cnpj) {
      alert("Por favor, preencha o CNPJ/CPF e o Nome/Razão Social.");
      return;
    }

    if (
      status !== "Pendente de Envio" &&
      status !== "Pendente do Termo" &&
      !analysisDate
    ) {
      alert("Por favor, preencha a data da análise.");
      return;
    }

    if (contactMade && (!contactName || !contactRole || !contactPhone)) {
      alert("Por favor, preencha o Nome do Contato e o Cargo.");
      return;
    }

    //const legalFooter = `Importante salientar que as documentações necessárias para registro no Cadastro de Fornecedores do estado da Bahia – CAF obedecem ao quanto previsto nos art. 62 a 70 e 87 e 88, da Lei Federal nº 14.133/2021 c/c o art. 76 da Lei Estadual nº 14.634/2023.`;
    const legalParagraph = `Importante salientar que as documentações necessárias para registro no Cadastro de Fornecedores do estado da Bahia – CAF obedecem ao quanto previsto nos art. 62 a 70 e 87 e 88, da Lei Federal nº 14.133/2021 c/c o art. 76 da Lei Estadual nº 14.634/2023.`;
    const finalLegalFooter = omitLegal ? '' : `${legalParagraph}\n\n`; // Se omitir, é vazio, senão, inclui o parágrafo e 2 quebras de linha.
    const defaultEmailFooter = `O fornecedor é notificado automaticamente por e-mail.`;
    const noEmailFooter = '';
    const honorific = contactGender === 'M' ? 'Sr.' : 'Sra.';
    const roleString = contactGender === 'M' ? contactRole : contactRole.replace('o', 'a');
    //const contactMadeFooter = `O fornecedor é notificado automaticamente por e-mail. Contudo, em contato com o(a) Sr.(a) *${contactName}*, *${contactRole}* da Empresa, foram esclarecidos os motivos do indeferimento, tendo sido informado que estão sendo adotadas as providências necessárias para correção e que será sinalizado quando houver nova solicitação.`;
    const contactMadeSuccessFooter = `O fornecedor é notificado automaticamente por e-mail. Contudo, em contato com ${contactGender === 'M' ? 'o' : 'a'} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, foram esclarecidos os motivos do indeferimento, tendo sido informado que as providências necessárias para regularização já estão sendo adotadas e que será sinalizado quando houver nova solicitação.`;
    const contactMadeFailedFooter = `O fornecedor é notificado automaticamente por e-mail. Contudo, em tentativa de contato telefônico com ${contactGender === 'M' ? 'o' : 'a'} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, não obtivemos êxito, tendo a chamada sido direcionada para a caixa postal.`;
    const contactMadePendenteTermoFooter = `Em contato com ${contactGender === 'M' ? 'o' : 'a'} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, foi esclarecido o motivo da pendência, tendo sido informado que as providências necessárias para o envio do Termo de Concordância já estão sendo adotadas e que será sinalizado quando o envio for realizado.`;
    const contactMadePendenteEnvioFooter = `Em contato com ${contactGender === 'M' ? 'o' : 'a'} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, foi esclarecido o motivo da pendência, tendo sido informado que as providências necessárias para o envio da solicitação já estão sendo adotadas e que será sinalizado quando o envio for realizado.`;
    const contactMadePendenteFailedFooter = `Em tentativa de contato telefônico com ${contactGender === 'M' ? 'o' : 'a'} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, não obtivemos êxito, tendo a chamada sido direcionada para a caixa postal. Reiteramos a necessidade de regularização da pendência no CAF Digital para que a solicitação possa ser analisada.`;
    let message = "";
    const docIdentifier =
      cnpj.replace(/\D/g, "").length > 11 ? "CNPJ sob o nº" : "CPF sob o nº";

switch (status) {
      case "Deferida":
        //message = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, foi analisada e *${status}* em *${analysisDate}* para o tipo de cadastro *${registrationType}*.\n\n${legalFooter}\n\n${defaultEmailFooter}`;
        message = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, foi analisada e *${status}* em *${analysisDate}* para o tipo de cadastro *${registrationType}*.\n\n${finalLegalFooter}${defaultEmailFooter}`;
        break;
      case "Deferida Parcial":
      case "Indeferida":
        if (rejectedDocs.length === 0) {
          alert(
            `Para o status "${status}", é necessário adicionar pelo menos um documento indeferido.`
          );
          return;
        }
        let docsText = "Documentos analisados e Indeferidos:\n\n";
        const groupedByCategory = rejectedDocs.reduce((acc, doc) => {
          (acc[doc.category] = acc[doc.category] || []).push(doc);
          return acc;
        }, {});
        for (const category in groupedByCategory) {
          docsText += `*${category}*\n\n`;
          groupedByCategory[category].forEach((doc) => {
            let docTitle;
            if (doc.name === "Sócio" && doc.socioName) {
              docTitle = `*SÓCIO: ${doc.socioName.toUpperCase()}*`;
            } else {
              docTitle = `*${doc.name.toUpperCase()}*`;
            }
            docsText += `${docTitle}\n`;
            docsText += `*Motivo*: _${doc.reason}_\n\n`;
          });
        }

    let finalEmailFooter = defaultEmailFooter;

          if (contactMade) {
              // Verifica o sucesso (S) ou falha (N) do contato
              finalEmailFooter = contactSuccess === 'S' 
                  ? contactMadeSuccessFooter 
                  : contactMadeFailedFooter;
          }
          
          //message = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, foi analisada e *${status}* em *${analysisDate}* para o tipo de cadastro *${registrationType}*, conforme análise abaixo:\n\n${docsText}${legalFooter}\n\n${finalEmailFooter}`;
          message = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, foi analisada e *${status}* em *${analysisDate}* para o tipo de cadastro *${registrationType}*, conforme análise abaixo:\n\n${docsText}${finalLegalFooter}${finalEmailFooter}`;
          break; // Fim do bloco Deferida Parcial/Indeferida
        case "Pendente de Envio":
          let baseMessageEnvio = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, encontra-se *Pendente de Envio*.\n\nÉ necessário que o fornecedor acesse o CAF Digital, atualize os dados necessários e realize o envio da solicitação para análise pela Comissão de Inscrição e Registro Cadastral.`;
          
          let finalFooterEnvio = noEmailFooter; // << INICIA VAZIO (SEM NOTIFICAÇÃO DE E-MAIL)

          if (contactMade) {
            // Se houve contato, verificamos o sucesso/falha
            finalFooterEnvio = contactSuccess === 'S' 
                ? contactMadePendenteEnvioFooter
                : contactMadePendenteFailedFooter;
          }
          
          // Concatena a mensagem base + footer legal (se não omitido) + footer final
          message = `${baseMessageEnvio}\n\n${finalFooterEnvio}`;
          break;
        case "Pendente do Termo":
          let baseMessageTermo = `A solicitação enviada pelo fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, encontra-se *Pendente do envio do Termo de Concordância e Veracidade*.\n\nO fornecedor poderá realizar o envio do referido Termo por meio do *CAF Digital*, assinando-o eletronicamente com Certificado ICP-Brasil (por exemplo, utilizando o Assinador gov.br), ou optar pela entrega presencial, conforme orientações contidas no próprio Termo.`;
          
          let finalFooterTermo = noEmailFooter; // << INICIA VAZIO (SEM NOTIFICAÇÃO DE E-MAIL)

          if (contactMade) {
            // Se houve contato, verificamos o sucesso/falha
            finalFooterTermo = contactSuccess === 'S' 
                ? contactMadePendenteTermoFooter
                : contactMadePendenteFailedFooter;
          }

          // Concatena a mensagem base + footer legal (se não omitido) + footer final
          message = `${baseMessageTermo}\n\n${finalFooterTermo}`;
          break;
  }

    resultText.value = message;
    resultSection.classList.remove("hidden");
    resultText.style.height = "auto";
    resultText.style.height = resultText.scrollHeight + 10 + "px";
    resultText.scrollIntoView({ behavior: "smooth", block: "end" });

    const messageData = {
      cnpj: cnpj,
      companyName: companyName,
      message: message,
      timestamp: new Date().toISOString(),

      // --- Variávais para dash ---
      status: status,
      rejectedDocs: rejectedDocs,
      registrationType: registrationType,
      contactMade: contactMade,
      // ---
    };
    saveMessageToHistory(messageData);
    showToast("Mensagem gerada e salva no histórico!", "success");
  };

  /**
   * @functionality 406
   * @category 4xx: UI/UX e Interações
   * @name Cópia para Clipboard com Fallback e Toast de Feedback
   * @description Usa Navigator Clipboard API para copiar texto de mensagem ou histórico.
   */
  const copyToClipboard = (text) => {
    if (!text) return;

    navigator.clipboard
      .writeText(text)
      .then(() => {
        showToast("Texto copiado com sucesso!", "success");
      })
      .catch((err) => {
        console.error("Falha ao copiar texto: ", err);
        showToast("Erro ao copiar texto.", "error");
      });
  };

  // --- EVENT LISTENERS ---

  // Modais
  /**
   * @functionality 404
   * @category 4xx: UI/UX e Interações
   * @name Binding de Eventos para Modais com Fechamento por Clique Externo
   * @description Adiciona listeners para abrir/fechar modais (DB, histórico, export, senha) via classes Tailwind.
   */
  openDbModalBtn.addEventListener("click", async () => {
    // Carrega o valor salvo no select ao abrir o modal
    try {
      const savedPeriod = await getBackupReminderPeriod();
      // Garante que o elemento existe antes de tentar definir o valor
      if (backupReminderPeriodSelect) {
        backupReminderPeriodSelect.value = savedPeriod;
      }
    } catch (e) {
      if (backupReminderPeriodSelect) {
        backupReminderPeriodSelect.value = 86400000; // Padrão
      }
    }
    dbModal.classList.remove("hidden");
  });

  closeDbModalBtn.addEventListener("click", () =>
    dbModal.classList.add("hidden")
  );
  dbModal.addEventListener("click", (e) => {
    if (e.target.id === "dbModal") dbModal.classList.add("hidden");
  });

  openHistoryModalBtn.addEventListener("click", () => {
    historyModal.classList.remove("hidden");
    // Limpa os campos de filtro e renderiza a lista completa ao abrir
    historySearchCnpj.value = "";
    historyStartDate.value = "";
    historyEndDate.value = "";
    renderHistory();
  });

  // Listener para o botão de filtrar
  filterHistoryBtn.addEventListener("click", () => {
    const cnpj = historySearchCnpj.value.trim();
    const startDate = historyStartDate.value;
    const endDate = historyEndDate.value;
    renderHistory(cnpj, startDate, endDate);
  });

  // Listener para limpar os filtros
  clearHistoryFilterBtn.addEventListener("click", () => {
    historySearchCnpj.value = "";
    historyStartDate.value = "";
    historyEndDate.value = "";
    renderHistory(); // Renderiza a lista completa novamente
  });

  // Ajusta o CNPJ no filtro de history
  historySearchCnpj.addEventListener("input", (e) => {
    let v = e.target.value.replace(/\D/g, ""); // Remove tudo que não é dígito

    if (v.length <= 11) {
      // Formato CPF
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      // Formato CNPJ
      v = v.replace(/^(\d{2})(\d)/, "$1.$2");
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
      v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }
    e.target.value = v;
  });

  closeHistoryModalBtn.addEventListener("click", () =>
    historyModal.classList.add("hidden")
  );
  historyModal.addEventListener("click", (e) => {
    if (e.target.id === "historyModal") historyModal.classList.add("hidden");
  });

  document.getElementById("exportDbBtn").addEventListener("click", () => {
    updateAdminControlsState();
    exportModal.classList.remove("hidden");
  });
  cancelExportBtn.addEventListener("click", () => {
    exportModal.classList.add("hidden");
  });
  exportModal.addEventListener("click", (e) => {
    if (e.target.id === "exportModal") {
      exportModal.classList.add("hidden");
    }
  });
  confirmExportBtn.addEventListener("click", () => {
    const options = {
      includeCompanies: document.getElementById("exportCompanies").checked,
      includeFamilies: document.getElementById("exportFamilies").checked,
      includeHistory: document.getElementById("exportHistory").checked,
      includeContacts: document.getElementById("exportContacts").checked,
    };
    processExport(options);
    exportModal.classList.add("hidden");
  });

  // Banco de Dados e Histórico
  document.getElementById("loadCsvBtn").addEventListener("click", () => {
    const file = document.getElementById("csvFileInput").files[0]; // <<< LINHA CORRIGIDA
    loadCsvToDB(file, "companies", dbStatus, companyParser);
  });
  document.getElementById("loadFamilyCsvBtn").addEventListener("click", () => {
    const file = document.getElementById("familyCsvFileInput").files[0]; // <<< LINHA CORRIGIDA
    loadCsvToDB(file, "families", familyDbStatus, familyParser);
  });
  /**
   * @functionality 301
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Validação e Formatação Automática de CNPJ/CPF com Máscara Dinâmica
   * @description Aplica máscaras regex baseadas no tamanho (11 para CPF, 14 para CNPJ) e busca na DB.
   */
  cnpjInputForDb.addEventListener("input", (e) => {
    e.target.value = formatDocument(e.target.value);
    resetFormFields();
    searchCnpj(e.target.value);
  });

  document
    .getElementById("importDbFile")
    .addEventListener("change", importDatabase);
  document
    .getElementById("clearHistoryBtn")
    .addEventListener("click", clearHistory);

  // Listener para buscar por nome ao digitar
  companyNameInputForDb.addEventListener("input", (e) => {
    const searchTerm = e.target.value;
    if (searchTerm.length === 0) {
      companyNameResults.innerHTML = ""; // Limpa se o campo estiver vazio
      cnpjStatusSpan.textContent = ""; // Limpa o status
    } else if (searchTerm.length >= 5) {
      cnpjStatusSpan.textContent = "Buscando..."; // Indica busca
      cnpjStatusSpan.className = "text-gray-500";
      searchCompanyByName(searchTerm);
    }
  });

  // Listener para preencher CNPJ ao clicar no resultado do nome
  companyNameResults.addEventListener("click", (e) => {
    if (e.target.tagName === "DIV") {
      const cnpj = e.target.dataset.cnpj;
      const razaoSocial = e.target.dataset.razaoSocial;
      const dataCadastro = e.target.dataset.dataCadastro;
      const tipoCadastro = e.target.dataset.tipoCadastro;

      // Reseta o resto do formulário (status, data, docs)
      resetFormFields();

      // Preenche os campos
      companyNameInputForDb.value = razaoSocial;
      cnpjInputForDb.value = formatDocument(cnpj);
      registrationDateInput.value = dataCadastro || "--";

      // Lógica de mapeamento do Tipo de Cadastro (igual ao searchCnpj)
      if (tipoCadastro) {
        const tipo = tipoCadastro.trim().toUpperCase();
        if (tipo === "CRC") {
          registrationTypeInput.value = "CRC";
        } else if (tipo === "CRS") {
          registrationTypeInput.value = "CRS";
        } else if (tipo === "CANDIDATO") {
          registrationTypeInput.value = "Candidato";
        } else {
          registrationTypeInput.value = "CRC"; // Padrão
        }
      } else {
        registrationTypeInput.value = "CRC"; // Padrão
      }

      // Atualiza o status
      cnpjStatusSpan.textContent = "Encontrado";
      cnpjStatusSpan.className = "text-green-600";

      // Limpa os resultados
      companyNameResults.innerHTML = "";
    }
  });

  // Formulário principal
  statusRadios.forEach((radio) =>
    radio.addEventListener("change", toggleRejectedDocsSection)
  );
  addDocBtn.addEventListener("click", addRejectedDoc);
  generateBtn.addEventListener("click", generateMessage);
  copyBtn.addEventListener("click", () => copyToClipboard(resultText.value));
  docCategoryInput.addEventListener("change", populateDocNames);
  docNameSelect.addEventListener("change", handleDocNameChange);

  if (contactPhoneInput) {
  contactPhoneInput.addEventListener("input", (e) => {
    e.target.value = formatPhone(e.target.value);
  });
}

  /**
   * @functionality 311
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Seleção de Família via Autocomplete com Dataset Attributes
   * @description Armazena ID e descrição em data-attributes para uso posterior.
   */
  familySearchInput.addEventListener("input", (e) =>
    searchFamilies(e.target.value)
  );
  familyResults.addEventListener("click", (e) => {
    if (e.target.tagName === "DIV") {
      familySearchInput.value = e.target.textContent;
      selectedFamilyId = e.target.dataset.id;
      familyResults.innerHTML = "";
    }
  });

  rejectedDocsListContainer.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-doc-btn")) {
      const index = e.target.getAttribute("data-index");
      removeRejectedDoc(index);
    }
  });

  // --- LISTENERS DO LEMBRETE DE BACKUP E CONFIGURAÇÃO ---

  // Salva o período imediatamente ao ser alterado no modal de DB
  // Adiciona uma verificação para garantir que o elemento existe
  if (backupReminderPeriodSelect) {
    backupReminderPeriodSelect.addEventListener("change", async (e) => {
      try {
        await saveBackupReminderPeriod(Number(e.target.value));
        showToast("Frequência do lembrete atualizada!", "success");
      } catch (error) {
        showToast("Erro ao salvar a frequência.", "error");
      }
    });
  }

  // Ações do modal de lembrete (adiciona verificações)
  if (confirmBackupReminderBtn) {
    confirmBackupReminderBtn.addEventListener("click", async () => {
      const options = {
        includeCompanies: false,
        includeFamilies: false,
        includeHistory: true,
        includeContacts: true,
      };

      // 1. Inicia a exportação (que já exibe um toast)
      await processExport(options);

      // 2. Atualiza o timestamp do último backup
      await updateLastPersonalBackupTimestamp(Date.now());

      // 3. Fecha o modal
      backupReminderModal.classList.add("hidden");
    });
  }

  if (cancelBackupReminderBtn) {
    cancelBackupReminderBtn.addEventListener("click", () => {
      backupReminderModal.classList.add("hidden");
    });
  }

  if (closeBackupReminderBtn) {
    closeBackupReminderBtn.addEventListener("click", () => {
      backupReminderModal.classList.add("hidden");
    });
  }

  //  if (backupReminderModal) {
  //      backupReminderModal.addEventListener('click', (e) => {
  //        if (e.target.id === 'backupReminderModal') {
  //            backupReminderModal.classList.add('hidden');
  //        }
  //    });
  //}

  /**
   * @functionality 413
   * @category 4xx: UI/UX e Interações
   * @name Event Delegation para Ações no Container de Histórico
   * @description Um listener único para copy/delete/expand em itens dinâmicos.
   * @functionality 411
   * @name Expansão/Colapso de Conteúdo de Mensagem no Histórico com Transições
   * @description Alterna max-height via CSS para animação suave.
   */
  document
    .getElementById("historyListContainer")
    .addEventListener("click", function (e) {
      // Tenta encontrar um botão de "Copiar"
      const copyButton = e.target.closest(".copy-history-btn");
      if (copyButton) {
        const message = decodeURIComponent(copyButton.dataset.message);
        copyToClipboard(message);
        return; // Encontrou, não faz mais nada
      }

      // Tenta encontrar um botão de "Deletar"
      const deleteButton = e.target.closest(".delete-history-btn");
      if (deleteButton) {
        const id = parseInt(deleteButton.dataset.id, 10);
        deleteHistoryItem(id);
        return; // Encontrou, não faz mais nada
      }

      // Tenta encontrar um botão de "Expandir/Recolher"
      const expandButton = e.target.closest(".expand-history-btn");
      if (expandButton) {
        const content = expandButton
          .closest(".border")
          .querySelector(".history-message-content");

        if (!content.style.maxHeight || content.style.maxHeight === "0px") {
          // Se está recolhido, expande
          content.style.maxHeight = content.scrollHeight + "px";
          expandButton.innerHTML = svgIconCollapse; // Muda o SVG
          expandButton.title = "Recolher"; // Muda o title
        } else {
          // Se está expandido, recolhe
          content.style.maxHeight = null;
          expandButton.innerHTML = svgIconExpand; // Muda o SVG
          expandButton.title = "Expandir"; // Muda o title
        }
        return; // Encontrou, não faz mais nada
      }
    });

  /**
   * @functionality 308
   * @category 3xx: Geração de Mensagens e Formulários
   * @name Validação de Contato com Fornecedor e Toggle de Wrapper
   * @description Mostra/oculta campos de nome/cargo se checkbox marcado.
   */
  contactMadeCheckbox.addEventListener("change", () => {
    contactDetailsWrapper.classList.toggle(
      "hidden",
      !contactMadeCheckbox.checked
    );
  });

  // Event Listeners de Autenticação
  loginBtn.addEventListener("click", () => {
    passwordModal.classList.remove("hidden");
    masterPasswordInput.focus();
  });
  passwordForm.addEventListener("submit", handlePasswordSubmit);
  logoutBtn.addEventListener("click", handleLogout);

  // Listeners do Modal de WhatsApp
  sendWppBtn.addEventListener("click", openWppModal);
  closeWppModalBtn.addEventListener("click", () =>
    wppModal.classList.add("hidden")
  );
  wppModal.addEventListener("click", (e) => {
    if (e.target.id === "wppModal") wppModal.classList.add("hidden");
  });
  wppContactListContainer.addEventListener("click", handleWppContactClick);

  // Listeners do Modal de Gerenciamento de Contatos (Abre/Fecha)
  openContactsModalBtn.addEventListener("click", () =>
    contactsModal.classList.remove("hidden")
  );
  closeContactsModalBtn.addEventListener("click", () =>
    contactsModal.classList.add("hidden")
  );
  contactsModal.addEventListener("click", (e) => {
    if (e.target.id === "contactsModal") contactsModal.classList.add("hidden");
  });

  // Listeners do Gerenciador de Contatos (no dbModal)
  addContactBtn.addEventListener("click", addContact);
  exportContactsCsvBtn.addEventListener("click", exportContactsCsv);

  contactsListContainer.addEventListener("click", (e) => {
    const deleteButton = e.target.closest(".delete-contact-btn");
    if (deleteButton) {
      const id = parseInt(deleteButton.dataset.id, 10);
      deleteContact(id);
    }
  });

  loadContactsCsvBtn.addEventListener("click", () => {
    const file = contactsCsvFileInput.files[0];
    if (!file) {
      showToast("Selecione um arquivo CSV de contatos.", "error");
      return;
    }
    // Reusa a função loadCsvToDB
    loadCsvToDB(file, "contacts", contactsDbStatus, contactsParser);
    // Recarrega a lista após a importação
    setTimeout(renderContactsList, 1000);
  });

  // --- LISTENERS DO DASHBOARD (NOVO) ---
  openDashboardModalBtn.addEventListener("click", () => {
    dashboardModal.classList.remove("hidden");
    renderDashboard(); // Renderiza ao abrir
  });

  closeDashboardModalBtn.addEventListener("click", () => {
    dashboardModal.classList.add("hidden");
    // Destrói o gráfico para liberar memória
    if (statusChartInstance) {
      statusChartInstance.destroy();
      statusChartInstance = null;
    }
  });

  dashboardModal.addEventListener("click", (e) => {
    if (e.target.id === "dashboardModal") {
      dashboardModal.classList.add("hidden");
      if (statusChartInstance) {
        statusChartInstance.destroy();
        statusChartInstance = null;
      }
    }
  });

  refreshDashboardBtn.addEventListener("click", renderDashboard);

  // Inicialização
  /**
   * @functionality 500
   * @category 5xx: Utilitários e Validações
   * @name Inicialização de Data Atual no Campo de Análise
   * @description Define valor default como data de hoje em formato YYYY-MM-DD.
   */
  const today = new Date().toISOString().split("T")[0];
  analysisDateInput.value = today;
  populateDocNames();
  initDb();
  renderFooter();
  setupAdminModeToggle();
  updateAdminControlsState(); // Define o estado inicial dos controles de admin
});

// ==========================================================
// INTEGRAÇÃO COM HOME (DASHBOARD)
// Cole isso no FINAL do arquivo script.js
// ==========================================================

async function gerarEstatisticasGerador() {
  if (!db) return { mensagens: 0, deferidas: 0, percentualDeferidas: 0 };

  return new Promise((resolve) => {
    const transaction = db.transaction(["history"], "readonly");
    const store = transaction.objectStore("history");
    const request = store.getAll();

    request.onsuccess = function (event) {
      const all = event.target.result || [];
      const total = all.length;

      // Conta quantas tiveram status 'Deferida'
      // O regex verifica mensagens antigas, o .status verifica as novas (versão 3.0+)
      const deferidas = all.filter((item) => {
        if (item.status) return item.status === "Deferida";
        return item.message && item.message.includes("*Deferida*");
      }).length;

      resolve({
        mensagens: total,
        deferidas: deferidas,
        percentualDeferidas:
          total > 0 ? ((deferidas / total) * 100).toFixed(0) : 0,
      });
    };

    request.onerror = function () {
      resolve({ mensagens: 0, deferidas: 0, percentualDeferidas: 0 });
    };
  });
}

async function atualizarStatsExternos() {
  try {
    const stats = await gerarEstatisticasGerador();

    // Salva no LocalStorage para a Home ler instantaneamente
    localStorage.setItem("stats_gerador", JSON.stringify(stats));
    // console.log('Stats Gerador atualizados:', stats);
  } catch (e) {
    console.error("Erro ao atualizar stats do gerador:", e);
  }
}

// Listener para o PostMessage (Comunicação Iframe <-> Home)
window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "GET_STATS") {
    const stats = await gerarEstatisticasGerador();
    event.source.postMessage(
      {
        type: "STATS_RESPONSE",
        app: "gerador",
        data: stats,
      },
      event.origin
    );
  }
});
