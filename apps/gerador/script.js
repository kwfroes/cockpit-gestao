// =====================================================================
// GERADOR DE MENSAGENS CAF - script.js
// Versão 5.1.0: contatos e histórico no Supabase, vinculados ao usuário
// logado (auth.uid() + RLS). Contatos com setor e e-mail opcionais.
// O IndexedDB antigo é usado SOMENTE para leitura, na migração dos dados
// locais para a conta do usuário.
// =====================================================================

// --- VARIÁVEIS DE ESTADO ---
let db; // IndexedDB legado (somente leitura / migração)
const supabaseClientCaf = window.supabaseClient;
let currentUserId = null;

// Tabelas no Supabase
const TBL_CONTACTS = "caf_contacts";
const TBL_HISTORY = "caf_message_history";
const CONTACT_COLUMNS = "id, name, role, sector, phone, email, is_favorite";

// --- GESTÃO DE TEMA ---
function applyTheme(theme) {
  if (theme === "dark") document.documentElement.classList.add("dark");
  else document.documentElement.classList.remove("dark");
}
window.addEventListener("message", (event) => {
  if (event.data && event.data.type === "THEME_CHANGE")
    applyTheme(event.data.theme);
});

/**
 * Retorna o UUID do usuário autenticado no Supabase (sessão do app pai).
 * Lança erro se não houver sessão válida.
 */
async function getCurrentUserId() {
  if (currentUserId) return currentUserId;
  if (!supabaseClientCaf) throw new Error("Cliente Supabase não carregado.");
  const { data, error } = await supabaseClientCaf.auth.getUser();
  if (error || !data || !data.user) {
    throw new Error("Sessão não encontrada. Faça login novamente no Cockpit.");
  }
  currentUserId = data.user.id;
  return currentUserId;
}

if (supabaseClientCaf && supabaseClientCaf.auth && supabaseClientCaf.auth.onAuthStateChange) {
  supabaseClientCaf.auth.onAuthStateChange((event, session) => {
    if (event === "SIGNED_OUT") currentUserId = null;
    else if (session && session.user) currentUserId = session.user.id;
  });
}

document.addEventListener("DOMContentLoaded", function () {
  // --- INFORMAÇÕES DA APLICAÇÃO ---
  const APP_AUTHOR = "Kevin Fróes";
  const APP_NAME = "Gerador de Mensagens";
  const APP_VERSION = "5.1.0";
  const APP_VERSION_DATE = "28/10/2026";

  // --- ELEMENTOS DO DOM ---
  const dbName = "CafDatabase";
  const dbVersion = 8;
  const cnpjInputForDb = document.getElementById("cnpj");
  const companyNameInputForDb = document.getElementById("companyName");
  const companyNameResults = document.getElementById("companyNameResults");
  const cnpjStatusSpan = document.getElementById("cnpj-status");
  const dbModal = document.getElementById("dbModal");
  const openDbModalBtn = document.getElementById("openDbModalBtn");
  const closeDbModalBtn = document.getElementById("closeDbModalBtn");
  const historyModal = document.getElementById("historyModal");
  const openHistoryModalBtn = document.getElementById("openHistoryModalBtn");
  const closeHistoryModalBtn = document.getElementById("closeHistoryModalBtn");
  const exportModal = document.getElementById("exportModal");
  const confirmExportBtn = document.getElementById("confirmExportBtn");
  const cancelExportBtn = document.getElementById("cancelExportBtn");
  const historySearchCnpj = document.getElementById("historySearchCnpj");
  const historySearchName = document.getElementById("historySearchName");
  const historyStatusFilter = document.getElementById("historyStatusFilter");
  const historyStartDate = document.getElementById("historyStartDate");
  const historyEndDate = document.getElementById("historyEndDate");
  const filterHistoryBtn = document.getElementById("filterHistoryBtn");
  const clearHistoryFilterBtn = document.getElementById("clearHistoryFilterBtn");
  const historyListContainer = document.getElementById("historyListContainer");
  const historyLoadMoreBtn = document.getElementById("historyLoadMoreBtn");
  const historyCount = document.getElementById("historyCount");

  // --- DASHBOARD ---
  const dashboardModal = document.getElementById("dashboardModal");
  const openDashboardModalBtn = document.getElementById("openDashboardModalBtn");
  const closeDashboardModalBtn = document.getElementById("closeDashboardModalBtn");
  const dashboardPeriodFilter = document.getElementById("dashboardPeriodFilter");
  const refreshDashboardBtn = document.getElementById("refreshDashboardBtn");
  const statusChartCanvas = document.getElementById("statusChart");
  const topDocsList = document.getElementById("topDocsList");
  const topReasonsList = document.getElementById("topReasonsList");
  const dashboardTotalCount = document.getElementById("dashboardTotalCount");
  let statusChartInstance = null;

  // --- WHATSAPP ---
  const sendWppBtn = document.getElementById("sendWppBtn");
  const wppModal = document.getElementById("wppModal");
  const closeWppModalBtn = document.getElementById("closeWppModalBtn");
  const wppContactListContainer = document.getElementById("wppContactListContainer");
  const wppSearchInput = document.getElementById("wppSearchInput");

  // --- CONTATOS ---
  const addContactBtn = document.getElementById("addContactBtn");
  const cancelEditContactBtn = document.getElementById("cancelEditContactBtn");
  const contactFormTitle = document.getElementById("contactFormTitle");
  const contactEditingIdInput = document.getElementById("contactEditingId");
  const contactFavoriteInput = document.getElementById("contactFavoriteInput");
  const contactsSearchInput = document.getElementById("contactsSearchInput");
  const contactsCountEl = document.getElementById("contactsCount");
  const contactsCountBadge = document.getElementById("contactsCountBadge");
  const contactsListContainer = document.getElementById("contactsListContainer");
  const loadContactsCsvBtn = document.getElementById("loadContactsCsvBtn");
  const exportContactsCsvBtn = document.getElementById("exportContactsCsvBtn");
  const contactsCsvFileInput = document.getElementById("contactsCsvFileInput");
  const contactsDbStatus = document.getElementById("contacts-db-status");
  const modalcontactNameInput = document.getElementById("contactNameInput");
  const modalcontactRoleInput = document.getElementById("contactRoleInput");
  const modalcontactSectorInput = document.getElementById("contactSectorInput");
  const modalcontactEmailInput = document.getElementById("contactEmailInput");
  const contactPhoneInputModal = document.getElementById("contactPhoneInput");
  const contactsModal = document.getElementById("contactsModal");
  const openContactsModalBtn = document.getElementById("openContactsModalBtn");
  const closeContactsModalBtn = document.getElementById("closeContactsModalBtn");

  // --- MIGRAÇÃO / SINCRONIZAÇÃO ---
  const migrationBanner = document.getElementById("migrationBanner");
  const migrationBannerText = document.getElementById("migrationBannerText");
  const migrationStartBtn = document.getElementById("migrationStartBtn");
  const migrationStartBtn2 = document.getElementById("migrationStartBtn2");
  const migrationDismissBtn = document.getElementById("migrationDismissBtn");
  const localDataBox = document.getElementById("localDataBox");
  const localDataText = document.getElementById("localDataText");
  const syncDot = document.getElementById("syncDot");
  const syncText = document.getElementById("syncText");

  const manualDocNameWrapper = document.getElementById("manualDocNameWrapper");
  const manualDocNameInput = document.getElementById("manualDocName");

  let qualTecDocs = [];
  fetch("docs-qual-tec.json")
    .then((response) => response.json())
    .then((data) => {
      qualTecDocs = data;
      const listaDocumentos = data.map((doc) => doc.nome);
      docsByCat["Qualificação Técnica"] = listaDocumentos;
      console.log("Lista de Qualificação Técnica atualizada com sucesso.");
    })
    .catch((error) => console.error("Erro ao carregar lista de documentos:", error));

  let motivosIndeferimento = [];
  fetch("motivos-indeferimento.json")
    .then((response) => response.json())
    .then((data) => {
      motivosIndeferimento = Array.isArray(data) ? data : [];
      console.log(`Lista de motivos de indeferimento carregada (${motivosIndeferimento.length} itens).`);
    })
    .catch((error) => console.error("Erro ao carregar lista de motivos de indeferimento:", error));

  // =====================================================================
  // UTILITÁRIOS
  // =====================================================================
  function showToast(message, type = "info", duration = 3000) {
    let container = document.getElementById("toast-container");
    if (!container) {
      container = document.createElement("div");
      container.id = "toast-container";
      container.className = "fixed bottom-5 right-5 z-50 flex flex-col items-end space-y-3 pointer-events-none";
      document.body.appendChild(container);
    }
    if (container.children.length >= 5) {
      hideToast(container.lastElementChild);
    }
    const toast = document.createElement("div");
    let baseClass = `
        relative py-3 px-5 rounded-lg shadow-2xl border font-medium
        flex items-center justify-between max-w-sm text-sm z-[9999]
        opacity-0 transition-all duration-300 ease-in-out transform translate-y-4
        bg-gray-900 dark:bg-slate-950 backdrop-blur-sm
    `;
    if (type === "success") {
      baseClass += " border-green-500 text-green-400 dark:text-green-300 shadow-green-900/20";
    } else if (type === "error") {
      baseClass += " border-red-500 text-red-400 dark:text-red-300 shadow-red-900/20";
    } else {
      baseClass += " border-gray-600 text-gray-200 dark:text-gray-300";
    }
    toast.className = baseClass;
    let closeBtn = "";
    if (duration === 0) {
      closeBtn = `
            <button onclick="hideToast(this.parentElement); event.stopPropagation();"
                    class="ml-4 hover:text-white transition-colors text-lg leading-none opacity-70 hover:opacity-100 pointer-events-auto">
                &times;
            </button>
        `;
      toast.classList.add("pr-2");
    }
    toast.innerHTML = `<span>${escapeHtml(message)}</span>${closeBtn}`;
    container.insertBefore(toast, container.firstChild);
    requestAnimationFrame(() => {
      toast.classList.remove("opacity-0", "translate-y-4");
      toast.classList.add("opacity-100", "translate-y-0");
    });
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

  function hideToast(toastElement = null) {
    const container = document.getElementById("toast-container");
    if (!container) return;
    if (toastElement) {
      toastElement.classList.remove("opacity-100", "translate-y-0");
      toastElement.classList.add("opacity-0", "translate-y-4");
      setTimeout(() => {
        if (toastElement.parentNode) container.removeChild(toastElement);
      }, 300);
    } else {
      Array.from(container.children).forEach((toast) => hideToast(toast));
    }
  }
  window.hideToast = hideToast;

  function renderFooter() {
    const footer = document.getElementById("appVersionInfo");
    if (footer)
      footer.textContent = `${APP_AUTHOR} - ${APP_NAME} - Versão ${APP_VERSION}, de ${APP_VERSION_DATE}`;
  }

  window.escapeHtml = function (text) {
    if (typeof text !== "string") return "";
    const div = document.createElement("div");
    div.textContent = text;
    return div.innerHTML;
  };

  function formatDocument(v) {
    v = v.replace(/\D/g, "");
    if (v.length <= 11) {
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d)/, "$1.$2");
      v = v.replace(/(\d{3})(\d{1,2})$/, "$1-$2");
    } else {
      v = v.replace(/^(\d{2})(\d)/, "$1.$2");
      v = v.replace(/^(\d{2})\.(\d{3})(\d)/, "$1.$2.$3");
      v = v.replace(/\.(\d{3})(\d)/, ".$1/$2");
      v = v.replace(/(\d{4})(\d)/, "$1-$2");
    }
    return v;
  }

  // Máscara do telefone do fornecedor (seção 3) - inalterada
  function formatPhone(v) {
    v = v.replace(/\D/g, "");
    v = v.replace(/^(\d{2})(\d)/g, "($1) $2");
    v = v.replace(/(\d)(\d{4})$/, "$1-$2");
    return v;
  }

  /** Máscara do telefone do modal de contatos: (71) 9 9999-9999 */
  function maskBrPhone(v) {
    let d = (v || "").replace(/\D/g, "");
    if (d.length > 11 && d.startsWith("55")) d = d.slice(2);
    d = d.slice(0, 11);
    if (d.length <= 2) return d.length ? `(${d}` : "";
    const ddd = d.slice(0, 2);
    const rest = d.slice(2);
    if (rest.length <= 4) return `(${ddd}) ${rest}`;
    if (d.length === 11) return `(${ddd}) ${rest.slice(0, 1)} ${rest.slice(1, 5)}-${rest.slice(5)}`;
    if (rest.length <= 8) return `(${ddd}) ${rest.slice(0, 4)}-${rest.slice(4)}`;
    return `(${ddd}) ${rest}`;
  }

  /**
   * Normaliza telefone para o padrão do banco: 55 + DDD + número (12 ou 13 dígitos).
   * Retorna null se inválido.
   */
  function normalizePhone(raw) {
    const d = String(raw || "").replace(/\D/g, "");
    if ((d.length === 12 || d.length === 13) && d.startsWith("55")) return d;
    if (d.length === 10 || d.length === 11) return "55" + d;
    return null;
  }

  /** 5571999998888 -> +55 (71) 9 9999-8888 */
  function formatPhoneDisplay(phone) {
    const d = String(phone || "");
    if (!/^55\d{10,11}$/.test(d)) return d;
    return "+55 " + maskBrPhone(d.slice(2));
  }

  const EMAIL_REGEX = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
  /**
   * Normaliza e-mail opcional.
   * Retorna: null (vazio), string em minúsculas (válido) ou false (inválido).
   */
  function normalizeEmail(raw) {
    const e = String(raw || "").trim().toLowerCase();
    if (!e) return null;
    if (e.length > 254 || !EMAIL_REGEX.test(e)) return false;
    return e;
  }

  /** Texto opcional: vazio vira null; corta no limite. */
  function optText(raw, max) {
    const t = String(raw || "").trim();
    return t ? t.slice(0, max) : null;
  }

  function escapeLike(s) {
    return String(s).replace(/[\\%_]/g, (m) => "\\" + m);
  }

  function downloadBlob(content, filename, type) {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function chunk(arr, size) {
    const out = [];
    for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
    return out;
  }

  function newClientKey() {
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    return "k" + Date.now().toString(36) + Math.random().toString(36).slice(2);
  }

  /** Indicador de sincronização (rodapé) */
  function setSyncStatus(state, text) {
    if (!syncDot || !syncText) return;
    const colors = {
      ok: "bg-green-500",
      loading: "bg-gray-400",
      pending: "bg-amber-500",
      error: "bg-red-500",
    };
    syncDot.className = `inline-block w-2 h-2 rounded-full ${colors[state] || colors.loading}`;
    syncText.textContent = text;
  }

  // =====================================================================
  // INDEXEDDB LEGADO (somente para migração)
  // =====================================================================
  function idbGetAll(storeName) {
    return new Promise((resolve) => {
      if (!db || !db.objectStoreNames.contains(storeName)) return resolve([]);
      const request = db.transaction([storeName], "readonly").objectStore(storeName).getAll();
      request.onsuccess = () => resolve(request.result || []);
      request.onerror = () => resolve([]);
    });
  }

  function idbGetMeta(id) {
    return new Promise((resolve) => {
      if (!db || !db.objectStoreNames.contains("metadata")) return resolve(null);
      const request = db.transaction(["metadata"], "readonly").objectStore("metadata").get(id);
      request.onsuccess = () => resolve(request.result ? request.result.value : null);
      request.onerror = () => resolve(null);
    });
  }

  function idbPutMeta(id, value) {
    return new Promise((resolve, reject) => {
      if (!db || !db.objectStoreNames.contains("metadata")) return reject(new Error("metadata indisponível"));
      const request = db.transaction(["metadata"], "readwrite").objectStore("metadata").put({ id, value });
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject(e.target.error);
    });
  }

  /** Abre o IndexedDB antigo (mesmo schema da versão anterior, sem apagar nada). */
  function openLegacyDb() {
    return new Promise((resolve) => {
      if (!("indexedDB" in window)) return resolve(null);
      const request = indexedDB.open(dbName, dbVersion);
      request.onupgradeneeded = function (event) {
        const udb = event.target.result;
        if (!udb.objectStoreNames.contains("metadata"))
          udb.createObjectStore("metadata", { keyPath: "id" });
        if (!udb.objectStoreNames.contains("history")) {
          const historyStore = udb.createObjectStore("history", { keyPath: "id", autoIncrement: true });
          historyStore.createIndex("timestamp", "timestamp", { unique: false });
        }
        if (!udb.objectStoreNames.contains("contacts")) {
          const contactsStore = udb.createObjectStore("contacts", { keyPath: "id", autoIncrement: true });
          contactsStore.createIndex("name", "name", { unique: false });
        }
      };
      request.onsuccess = (event) => resolve(event.target.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  // =====================================================================
  // MAPEAMENTO DE REGISTROS (legado / backup -> banco)
  // =====================================================================
  const legacyStatusRegex = /foi analisada e \*(.*?)\*/;

  function legacyHistoryToRow(item, uid) {
    if (!item || typeof item.message !== "string" || !item.message) return null;
    const cnpjDigits = String(item.cnpj || "").replace(/\D/g, "");
    if (!cnpjDigits) return null;
    let status = item.status || null;
    if (!status) {
      const m = item.message.match(legacyStatusRegex);
      if (m && m[1]) status = m[1];
      else if (item.message.includes("*Pendente de Envio*")) status = "Pendente de Envio";
      else if (item.message.includes("*Pendente do envio do Termo")) status = "Pendente do Termo";
    }
    const ts = item.timestamp && !isNaN(new Date(item.timestamp)) ? new Date(item.timestamp).toISOString() : new Date().toISOString();
    return {
      user_id: uid,
      client_key: `legacy:${ts}|${cnpjDigits}`,
      cnpj: cnpjDigits,
      company_name: item.companyName || null,
      status,
      registration_type: item.registrationType || null,
      granted_type: null,
      analysis_date: null,
      contact_made: !!item.contactMade,
      contact: null,
      rejected_docs: Array.isArray(item.rejectedDocs) ? item.rejectedDocs : [],
      message: item.message,
      created_at: ts,
    };
  }

  function exportedHistoryToRow(item, uid) {
    if (!item || typeof item.message !== "string" || !item.message || !item.client_key) return null;
    return {
      user_id: uid,
      client_key: String(item.client_key),
      cnpj: String(item.cnpj || "").replace(/\D/g, ""),
      company_name: item.company_name || null,
      status: item.status || null,
      registration_type: item.registration_type || null,
      granted_type: item.granted_type || null,
      analysis_date: item.analysis_date || null,
      contact_made: !!item.contact_made,
      contact: item.contact || null,
      rejected_docs: Array.isArray(item.rejected_docs) ? item.rejected_docs : [],
      message: item.message,
      created_at: item.created_at || new Date().toISOString(),
    };
  }

  function anyHistoryToRow(item, uid) {
    return item && item.client_key ? exportedHistoryToRow(item, uid) : legacyHistoryToRow(item, uid);
  }

  /** Converte contato (legado, backup antigo ou backup novo) para linha do banco. */
  function anyContactToRow(c, uid) {
    if (!c) return null;
    const name = String(c.name || "").trim();
    const phone = normalizePhone(c.phone);
    if (!name || !phone) return null;
    const email = normalizeEmail(c.email);
    return {
      user_id: uid,
      name: name.slice(0, 120),
      role: optText(c.role, 80),
      sector: optText(c.sector, 120),
      phone,
      email: email || null, // e-mail inválido no arquivo é descartado, o contato é mantido
      is_favorite: !!c.is_favorite,
    };
  }

  /** Grava históricos sem duplicar (ON CONFLICT DO NOTHING). Retorna qtd enviada. */
  async function bulkInsertHistory(rows) {
    let sent = 0;
    for (const part of chunk(rows, 500)) {
      const { error } = await supabaseClientCaf
        .from(TBL_HISTORY)
        .upsert(part, { onConflict: "user_id,client_key", ignoreDuplicates: true });
      if (error) throw error;
      sent += part.length;
    }
    return sent;
  }

  /** Grava contatos sem sobrescrever os existentes (mesmo telefone é ignorado). */
  async function bulkInsertContactsKeepExisting(rows) {
    const unique = new Map();
    rows.forEach((r) => { if (!unique.has(r.phone)) unique.set(r.phone, r); });
    const list = [...unique.values()];
    for (const part of chunk(list, 500)) {
      const { error } = await supabaseClientCaf
        .from(TBL_CONTACTS)
        .upsert(part, { onConflict: "user_id,phone", ignoreDuplicates: true });
      if (error) throw error;
    }
    return list.length;
  }

  // =====================================================================
  // MIGRAÇÃO DOS DADOS LOCAIS (IndexedDB -> conta do usuário)
  // =====================================================================
  let legacyCounts = { history: 0, contacts: 0 };

  async function checkLegacyData() {
    db = await openLegacyDb();
    if (!db) return;
    const marker = await idbGetMeta("cloud_migration");
    const [hist, cont] = await Promise.all([idbGetAll("history"), idbGetAll("contacts")]);
    legacyCounts = { history: hist.length, contacts: cont.length };
    const hasData = legacyCounts.history > 0 || legacyCounts.contacts > 0;
    // Se já houve migração neste navegador (por qualquer usuário), não oferece de novo:
    // evita que outro usuário do mesmo computador "herde" os dados de quem migrou.
    if (!hasData || marker) {
      migrationBanner.classList.add("hidden");
      localDataBox.classList.add("hidden");
      return;
    }
    const txt = `Há ${legacyCounts.history} registro(s) de histórico e ${legacyCounts.contacts} contato(s) salvos somente neste navegador. Envie-os para a sua conta para acessá-los de qualquer computador. Os dados locais não serão apagados.`;
    migrationBannerText.textContent = txt;
    localDataText.textContent = txt;
    localDataBox.classList.remove("hidden");
    if (sessionStorage.getItem("caf_migration_dismissed") !== "1") {
      migrationBanner.classList.remove("hidden");
    }
  }

  let migrationRunning = false;
  async function migrateLegacyData() {
    if (migrationRunning) return;
    const email = sessionStorage.getItem("cockpit_user_email") || "seu usuário";
    if (!confirm(`Os dados locais deste navegador serão enviados para a conta de ${email}.\n\nConfirme somente se esses dados forem seus. Deseja continuar?`)) return;
    migrationRunning = true;
    [migrationStartBtn, migrationStartBtn2].forEach((b) => b && (b.disabled = true));
    setSyncStatus("pending", "Migrando...");
    try {
      const uid = await getCurrentUserId();
      const [hist, cont] = await Promise.all([idbGetAll("history"), idbGetAll("contacts")]);
      const historyRows = hist.map((h) => legacyHistoryToRow(h, uid)).filter(Boolean);
      const contactRows = cont.map((c) => anyContactToRow(c, uid)).filter(Boolean);
      const invalidContacts = cont.length - contactRows.length;
      await bulkInsertContactsKeepExisting(contactRows);
      await bulkInsertHistory(historyRows);
      await idbPutMeta("cloud_migration", {
        uid,
        at: new Date().toISOString(),
        history: historyRows.length,
        contacts: contactRows.length,
      });
      migrationBanner.classList.add("hidden");
      localDataBox.classList.add("hidden");
      await loadContacts();
      atualizarStatsExternos();
      let msg = `Migração concluída: ${historyRows.length} registro(s) de histórico e ${contactRows.length} contato(s).`;
      if (invalidContacts > 0) msg += ` ${invalidContacts} contato(s) com telefone inválido foram ignorados.`;
      showToast(msg, "success", 6000);
      setSyncStatus("ok", "Sincronizado");
    } catch (err) {
      console.error("Erro na migração:", err);
      showToast("Falha na migração. Nenhum dado local foi apagado. Tente novamente.", "error", 6000);
      setSyncStatus("error", "Erro de sincronização");
    } finally {
      migrationRunning = false;
      [migrationStartBtn, migrationStartBtn2].forEach((b) => b && (b.disabled = false));
    }
  }

  // =====================================================================
  // FILA DE HISTÓRICO PENDENTE (falha de rede ao salvar)
  // =====================================================================
  function pendingKey() {
    return `caf_pending_history_${currentUserId || "anon"}`;
  }
  function readPending() {
    try { return JSON.parse(localStorage.getItem(pendingKey()) || "[]"); } catch (e) { return []; }
  }
  function writePending(list) {
    if (list.length) localStorage.setItem(pendingKey(), JSON.stringify(list));
    else localStorage.removeItem(pendingKey());
  }

  async function flushPendingHistory() {
    const pending = readPending();
    if (!pending.length) return 0;
    try {
      const uid = await getCurrentUserId();
      const rows = pending.map((r) => ({ ...r, user_id: uid }));
      await bulkInsertHistory(rows);
      writePending([]);
      return rows.length;
    } catch (e) {
      console.warn("Pendências de histórico ainda não enviadas:", e);
      setSyncStatus("pending", `${pending.length} pendente(s) de envio`);
      return 0;
    }
  }

  // =====================================================================
  // INICIALIZAÇÃO
  // =====================================================================
  async function initializeAppLogic() {
    setSyncStatus("loading", "Conectando...");
    try {
      await getCurrentUserId();
    } catch (error) {
      console.error(error);
      setSyncStatus("error", "Sem sessão");
      showToast(error.message, "error", 6000);
      return;
    }
    try {
      await loadContacts();
      const sent = await flushPendingHistory();
      if (sent > 0) showToast(`${sent} registro(s) pendente(s) enviados ao histórico.`, "success");
      if (!readPending().length) setSyncStatus("ok", "Sincronizado");
      atualizarStatsExternos();
    } catch (error) {
      console.error("Erro em initializeAppLogic:", error);
      setSyncStatus("error", "Erro de conexão");
      showToast("Erro ao carregar seus dados do servidor.", "error");
    }
    checkLegacyData().catch((e) => console.warn("Verificação de dados locais:", e));
  }

  window.addEventListener("online", async () => {
    const sent = await flushPendingHistory();
    if (sent > 0) {
      showToast(`${sent} registro(s) pendente(s) enviados ao histórico.`, "success");
      setSyncStatus("ok", "Sincronizado");
      atualizarStatsExternos();
    }
  });

  // =====================================================================
  // EXPORTAÇÃO / IMPORTAÇÃO (.json)
  // =====================================================================
  async function fetchAllHistoryForExport() {
    const all = [];
    const size = 1000;
    for (let from = 0; ; from += size) {
      const { data, error } = await supabaseClientCaf
        .from(TBL_HISTORY)
        .select("client_key, cnpj, company_name, status, registration_type, granted_type, analysis_date, contact_made, contact, rejected_docs, message, created_at")
        .is("deleted_at", null)
        .order("created_at", { ascending: true })
        .range(from, from + size - 1);
      if (error) throw error;
      all.push(...(data || []));
      if (!data || data.length < size) break;
    }
    return all;
  }

  async function processExport(options = {}) {
    const includeHistory = options.includeHistory !== false;
    const includeContacts = options.includeContacts !== false;
    if (!includeHistory && !includeContacts) {
      showToast("Selecione ao menos uma opção para exportar.", "error");
      return false;
    }
    try {
      await getCurrentUserId();
      const exportObj = {
        app: "gerador-caf",
        version: 2,
        exported_at: new Date().toISOString(),
        user_email: sessionStorage.getItem("cockpit_user_email") || null,
      };
      if (includeContacts) {
        const { data, error } = await supabaseClientCaf
          .from(TBL_CONTACTS)
          .select("name, role, sector, phone, email, is_favorite")
          .order("name");
        if (error) throw error;
        exportObj.contacts = data || [];
      }
      if (includeHistory) exportObj.history = await fetchAllHistoryForExport();
      const date = new Date().toISOString().slice(0, 10);
      const filename = `gerador_caf_backup_${date}.json`;
      downloadBlob(JSON.stringify(exportObj, null, 2), filename, "application/json");
      showToast(`Arquivo "${filename}" exportado!`, "success");
      return true;
    } catch (error) {
      console.error("Erro ao exportar:", error);
      showToast("Falha ao exportar os dados.", "error");
      return false;
    }
  }

  /** Importa backup antigo (metadata/history/contacts) ou novo (version 2). Soma, não apaga. */
  async function importDatabase(event) {
    const file = event.target.files[0];
    if (!file) return;
    const importStatus = document.getElementById("importStatus");
    const importLabel = document.getElementById("importDbLabel");
    const exportBtn = document.getElementById("exportDbBtn");
    try {
      const data = JSON.parse(await file.text());
      const hist = Array.isArray(data.history) ? data.history : [];
      const cont = Array.isArray(data.contacts) ? data.contacts : [];
      if (!hist.length && !cont.length) {
        showToast("O arquivo não contém histórico nem contatos.", "error");
        return;
      }
      if (!confirm(`Importar ${hist.length} registro(s) de histórico e ${cont.length} contato(s) para a sua conta?\n\nRegistros já existentes não serão duplicados e nada será apagado.`)) return;
      importStatus.textContent = "Importando... Por favor, aguarde.";
      importLabel.classList.add("opacity-50", "pointer-events-none");
      exportBtn.disabled = true;
      const uid = await getCurrentUserId();
      const historyRows = hist.map((h) => anyHistoryToRow(h, uid)).filter((r) => r && r.cnpj);
      const contactRows = cont.map((c) => anyContactToRow(c, uid)).filter(Boolean);
      await bulkInsertContactsKeepExisting(contactRows);
      await bulkInsertHistory(historyRows);
      await loadContacts();
      atualizarStatsExternos();
      const ignored = hist.length - historyRows.length + (cont.length - contactRows.length);
      showToast(`Importação concluída.${ignored ? ` ${ignored} item(ns) inválido(s) ignorado(s).` : ""}`, "success", 5000);
    } catch (error) {
      console.error("Erro ao importar:", error);
      showToast("Falha ao importar. Verifique se o arquivo é um backup válido.", "error");
    } finally {
      event.target.value = "";
      importStatus.textContent = "";
      importLabel.classList.remove("opacity-50", "pointer-events-none");
      exportBtn.disabled = false;
    }
  }

  // =====================================================================
  // HISTÓRICO
  // =====================================================================
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
  const svgIconReopen = `<svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.8" stroke="currentColor" class="w-4 h-4">
        <path stroke-linecap="round" stroke-linejoin="round" d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931z"/>
    </svg>`;
  const phoneIcon = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" class="w-4 h-4 text-green-500 inline-block align-middle ml-2"><title>Contato telefônico registrado</title>
          <path fill-rule="evenodd" d="M5.847.533A2.21 2.21 0 004.391 0H2.206a2.21 2.21 0 00-2.09 1.501c-.098.29-.135.598-.107.903l.001.012a15.13 15.13 0 002.355 6.637c1.29 1.987 2.615 3.304 4.596 4.587a15.197 15.197 0 006.618 2.35h.014a2.21 2.21 0 002.406-2.204v-.075c-.002-.383-.008-1.771 0-2.087A2.204 2.204 0 0014.1 9.386h-.007a8.626 8.626 0 01-1.884-.47 2.21 2.21 0 00-2.327.497l-.515.513a10.903 10.903 0 01-3.313-3.305l.51-.509.003-.003a2.204 2.204 0 00.498-2.326 8.577 8.577 0 01-.47-1.88v-.007A2.204 2.204 0 005.847.533zM4.401 1.5a.71.71 0 01.708.604c.1.753.285 1.493.55 2.205l.001.001a.703.703 0 01-.157.742l-.924.923a.75.75 0 00-.122.902 12.403 12.403 0 004.655 4.646.75.75 0 00.9-.121l.923-.921.002-.002a.71.71 0 01.746-.157h.002c.713.266 1.454.45 2.209.55a.709.709 0 01.606.715 148.67 148.67 0 000 2.134v.07a.702.702 0 01-.481.671.71.71 0 01-.286.035 13.696 13.696 0 01-5.957-2.117c-1.805-1.168-2.979-2.335-4.153-4.144a13.63 13.630 0 01-2.120-5.972.702.702 0 01.419-.704c.09-.04.187-.06.286-.06H4.4z" clip-rule="evenodd"/>
      </svg>`;

  const statusColorMap = {
    Deferida: "text-green-600",
    "Deferida Parcial": "text-yellow-600",
    Indeferida: "text-red-600",
    "Pendente de Envio": "text-blue-600",
    "Pendente do Termo": "text-indigo-600",
    Contato: "text-teal-600",
  };

  const HISTORY_PAGE_SIZE = 30;
  let historyPage = 0;
  let historyTotal = 0;
  let historyFilters = {};
  const historyItemsById = new Map();
  let lastSavedSignature = null; // anti-duplicidade de cliques repetidos

  /**
   * Salva a mensagem no histórico do usuário. Em caso de falha de rede,
   * guarda numa fila local e reenvia automaticamente depois.
   */
  async function saveMessageToHistory(messageData) {
    const signature = `${messageData.cnpj}|${messageData.status}|${messageData.message}`;
    const now = Date.now();
    if (lastSavedSignature && lastSavedSignature.sig === signature && now - lastSavedSignature.at < 5 * 60 * 1000) {
      return "duplicate";
    }
    const row = {
      client_key: newClientKey(),
      cnpj: String(messageData.cnpj || "").replace(/\D/g, ""),
      company_name: messageData.companyName || null,
      status: messageData.status || null,
      registration_type: messageData.registrationType || null,
      granted_type: messageData.grantedType || null,
      analysis_date: messageData.analysisDate || null,
      contact_made: !!messageData.contactMade,
      contact: messageData.contact || null,
      rejected_docs: messageData.rejectedDocs || [],
      message: messageData.message,
      created_at: new Date(now).toISOString(),
    };
    lastSavedSignature = { sig: signature, at: now };
    try {
      const uid = await getCurrentUserId();
      const { error } = await supabaseClientCaf.from(TBL_HISTORY).insert({ ...row, user_id: uid });
      if (error) throw error;
      setSyncStatus("ok", "Sincronizado");
      atualizarStatsExternos();
      return "saved";
    } catch (err) {
      console.error("Erro ao salvar histórico:", err);
      const pending = readPending();
      pending.push(row);
      writePending(pending);
      setSyncStatus("pending", `${pending.length} pendente(s) de envio`);
      return "queued";
    }
  }

  function readHistoryFiltersFromUI() {
    return {
      cnpj: historySearchCnpj.value.replace(/\D/g, ""),
      name: historySearchName.value.trim(),
      status: historyStatusFilter.value,
      start: historyStartDate.value,
      end: historyEndDate.value,
    };
  }

  function localDayBoundaryISO(yyyyMmDd, endOfDay) {
    const [y, m, d] = yyyyMmDd.split("-").map(Number);
    const dt = endOfDay ? new Date(y, m - 1, d, 23, 59, 59, 999) : new Date(y, m - 1, d, 0, 0, 0, 0);
    return dt.toISOString();
  }

  async function fetchHistoryPage(page, filters) {
    let q = supabaseClientCaf
      .from(TBL_HISTORY)
      .select("id, cnpj, company_name, status, registration_type, granted_type, analysis_date, contact_made, contact, rejected_docs, message, created_at", { count: "exact" })
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .range(page * HISTORY_PAGE_SIZE, page * HISTORY_PAGE_SIZE + HISTORY_PAGE_SIZE - 1);
    if (filters.cnpj) q = q.ilike("cnpj", `%${filters.cnpj}%`);
    if (filters.name) q = q.ilike("company_name", `%${escapeLike(filters.name)}%`);
    if (filters.status) q = q.eq("status", filters.status);
    if (filters.start) q = q.gte("created_at", localDayBoundaryISO(filters.start, false));
    if (filters.end) q = q.lte("created_at", localDayBoundaryISO(filters.end, true));
    const { data, count, error } = await q;
    if (error) throw error;
    return { data: data || [], count: count || 0 };
  }

  function buildHistoryCard(item) {
    const formattedDate = new Date(item.created_at).toLocaleString("pt-BR");
    const status = item.status || "Status Desconhecido";
    const statusColor = statusColorMap[status] || "text-gray-500";
    const contactMadeHtml = item.contact_made ? phoneIcon : "";
    const docDisplay = item.cnpj ? formatDocument(item.cnpj) : "";
    const extra = [];
    if (item.analysis_date) extra.push(`Análise: ${formatDate(item.analysis_date)}`);
    if (item.registration_type) extra.push(`Solicitado: ${escapeHtml(item.registration_type)}`);
    if (item.granted_type && item.granted_type !== item.registration_type) extra.push(`Concedido: ${escapeHtml(item.granted_type)}`);
    const div = document.createElement("div");
    div.className = "history-card border rounded-lg bg-white dark:bg-slate-800 shadow-sm dark:border-slate-700 overflow-hidden";
    div.dataset.id = item.id;
    div.innerHTML = `
      <div class="p-3 flex justify-between items-center gap-2 bg-gray-50 dark:bg-slate-700 border-b dark:border-slate-600">
        <div class="flex-grow min-w-0">
          <p class="font-bold text-blue-700 dark:text-blue-400 truncate">${escapeHtml(item.company_name || "")}</p>
          <p class="text-sm text-gray-600 dark:text-gray-300">${escapeHtml(docDisplay)}</p>
          <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
            <span class="font-bold mr-1 ${statusColor}">${escapeHtml(status)}</span>
            | Gerado em: ${formattedDate}
            ${contactMadeHtml}
          </p>
          ${extra.length ? `<p class="text-[11px] text-gray-400 mt-0.5">${extra.join(" • ")}</p>` : ""}
        </div>
        <div class="flex items-center space-x-1 shrink-0">
          <button data-action="reopen" title="Reabrir no formulário" class="text-amber-600 hover:bg-amber-100 dark:text-amber-400 dark:hover:bg-slate-600 rounded p-2 transition">${svgIconReopen}</button>
          <button data-action="copy" title="Copiar" class="bg-gray-200 text-gray-700 hover:bg-gray-300 dark:bg-slate-600 dark:text-white dark:hover:bg-slate-500 p-2 rounded transition">${svgIconCopy}</button>
          <button data-action="expand" title="Expandir" class="text-blue-600 hover:bg-blue-100 dark:text-blue-400 dark:hover:bg-slate-600 rounded p-2 transition">${svgIconExpand}</button>
          <button data-action="delete" title="Excluir do histórico" class="text-red-500 hover:text-red-700 dark:text-red-400 dark:hover:text-red-300 font-bold text-2xl leading-none px-1">&times;</button>
        </div>
      </div>
      <div class="history-message-content overflow-hidden" style="max-height:0; transition:max-height 0.3s ease-out;">
        <pre class="p-4 text-xs text-gray-800 dark:text-gray-200 whitespace-pre-wrap font-sans break-words">${escapeHtml(item.message)}</pre>
      </div>`;
    return div;
  }

  async function renderHistory(reset = true) {
    if (reset) {
      historyPage = 0;
      historyItemsById.clear();
      historyFilters = readHistoryFiltersFromUI();
      historyListContainer.innerHTML = '<p class="text-gray-500 text-center">Carregando histórico...</p>';
      historyCount.textContent = "";
    }
    historyLoadMoreBtn.disabled = true;
    try {
      await getCurrentUserId();
      const { data, count } = await fetchHistoryPage(historyPage, historyFilters);
      historyTotal = count;
      if (reset) historyListContainer.innerHTML = "";
      if (reset && data.length === 0) {
        historyListContainer.innerHTML = '<p class="text-gray-500 text-center">Nenhum registro encontrado para os filtros aplicados.</p>';
      }
      data.forEach((item) => {
        historyItemsById.set(String(item.id), item);
        historyListContainer.appendChild(buildHistoryCard(item));
      });
      historyCount.textContent = historyTotal ? `Exibindo ${historyItemsById.size} de ${historyTotal} registro(s)` : "";
      historyLoadMoreBtn.classList.toggle("hidden", historyItemsById.size >= historyTotal);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
      historyListContainer.innerHTML = '<p class="text-red-500 text-center">Não foi possível carregar o histórico. Verifique sua conexão.</p>';
    } finally {
      historyLoadMoreBtn.disabled = false;
    }
  }

  async function deleteHistoryItem(id) {
    if (!confirm("Remover este registro do histórico?")) return;
    try {
      const { error } = await supabaseClientCaf
        .from(TBL_HISTORY)
        .update({ deleted_at: new Date().toISOString() })
        .eq("id", id);
      if (error) throw error;
      showToast("Item removido do histórico.", "success");
      renderHistory(true);
      atualizarStatsExternos();
    } catch (err) {
      console.error(err);
      showToast("Erro ao remover item.", "error");
    }
  }

  async function clearHistory() {
    if (!confirm("Tem certeza que deseja apagar TODO o seu histórico de mensagens?\n\nOs registros deixarão de aparecer no histórico e no dashboard.")) return;
    try {
      await getCurrentUserId();
      const { error } = await supabaseClientCaf
        .from(TBL_HISTORY)
        .update({ deleted_at: new Date().toISOString() })
        .is("deleted_at", null);
      if (error) throw error;
      showToast("Histórico limpo com sucesso.", "success");
      renderHistory(true);
      atualizarStatsExternos();
    } catch (err) {
      console.error(err);
      showToast("Erro ao limpar o histórico.", "error");
    }
  }

  /** Recarrega uma análise do histórico no formulário principal. */
  function reopenHistoryItem(item) {
    if (!item) return;
    resetFormFields();
    cnpjInputForDb.value = formatDocument(item.cnpj || "");
    companyNameInputForDb.value = item.company_name || "";
    companyNameResults.innerHTML = "";
    cnpjStatusSpan.textContent = "";
    registrationDateInput.value = "--";
    if (["CRC", "CRS", "Candidato"].includes(item.registration_type)) {
      registrationTypeInput.value = item.registration_type;
    }
    const radio = Array.from(statusRadios).find((r) => r.value === item.status);
    if (radio) radio.checked = true;
    toggleRejectedDocsSection();
    if (item.status === "Deferida Parcial" && item.granted_type) {
      partialRegistrationTypeInput.value = item.granted_type;
    }
    if (item.analysis_date) analysisDateInput.value = item.analysis_date;
    rejectedDocs = Array.isArray(item.rejected_docs) ? item.rejected_docs.map((d) => ({ ...d })) : [];
    renderRejectedDocs();
    const c = item.contact;
    if (item.contact_made) {
      contactMadeCheckbox.checked = true;
      contactDetailsWrapper.classList.remove("hidden");
    }
    if (c) {
      contactNameInput.value = c.name || "";
      if (c.role) contactRoleInput.value = c.role;
      if (contactPhoneInput) contactPhoneInput.value = c.phone || "";
      if (contactSuccessSelect && c.success) contactSuccessSelect.value = c.success;
      const g = document.getElementById(c.gender === "F" ? "contactGenderF" : "contactGenderM");
      if (g) g.checked = true;
    }
    historyModal.classList.add("hidden");
    window.scrollTo({ top: 0, behavior: "smooth" });
    showToast("Análise carregada no formulário. Revise e gere novamente se necessário.", "info", 4000);
  }

  // =====================================================================
  // DASHBOARD
  // =====================================================================
  async function renderDashboard() {
    topDocsList.innerHTML = '<p class="text-gray-500 text-center">Processando...</p>';
    topReasonsList.innerHTML = '<p class="text-gray-500 text-center">Processando...</p>';
    try {
      const historyItems = await loadHistoryForDashboard(dashboardPeriodFilter.value);
      dashboardTotalCount.textContent = historyItems.length;
      if (historyItems.length === 0) {
        topDocsList.innerHTML = '<p class="text-gray-500 text-center">Nenhum dado encontrado.</p>';
        topReasonsList.innerHTML = '<p class="text-gray-500 text-center">Nenhum dado encontrado.</p>';
        if (statusChartInstance) { statusChartInstance.destroy(); statusChartInstance = null; }
        return;
      }
      const stats = processHistoryData(historyItems);
      renderStatusChart(stats.statusCounts);
      renderTopList(topDocsList, stats.docCounts, "Nenhum documento indeferido registrado.");
      renderTopList(topReasonsList, stats.reasonCounts, "Nenhum motivo de indeferimento registrado.");
    } catch (error) {
      console.error("Erro ao renderizar dashboard:", error);
      showToast("Erro ao processar dados do dashboard.", "error");
    }
  }

  async function loadHistoryForDashboard(period = "all") {
    await getCurrentUserId();
    let q = supabaseClientCaf
      .from(TBL_HISTORY)
      .select("status, rejected_docs, message, created_at")
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(1000);
    if (period === "month") {
      const oneMonthAgo = new Date();
      oneMonthAgo.setMonth(oneMonthAgo.getMonth() - 1);
      q = q.gte("created_at", oneMonthAgo.toISOString());
    }
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((r) => ({ status: r.status, message: r.message, rejectedDocs: r.rejected_docs }));
  }

  function processHistoryData(historyItems) {
    const statusCounts = new Map();
    const docCounts = new Map();
    const reasonCounts = new Map();
    historyItems.forEach((item) => {
      let status = item.status;
      if (!status && item.message) {
        const match = item.message.match(legacyStatusRegex);
        if (match && match[1]) status = match[1];
      }
      if (status) statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      if (item.rejectedDocs && Array.isArray(item.rejectedDocs)) {
        item.rejectedDocs.forEach((doc) => {
          const docName = doc.name === "Sócio" && doc.socioName ? `Sócio: ${doc.socioName}` : doc.name;
          docCounts.set(docName, (docCounts.get(docName) || 0) + 1);
          if (doc.reason) reasonCounts.set(doc.reason, (reasonCounts.get(doc.reason) || 0) + 1);
        });
      }
    });
    const sortMap = (map) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
    return {
      statusCounts: new Map([...statusCounts.entries()].sort((a, b) => b[1] - a[1])),
      docCounts: sortMap(docCounts),
      reasonCounts: sortMap(reasonCounts),
    };
  }

  function renderStatusChart(statusData) {
    if (typeof Chart === "undefined") {
      console.warn("Chart.js não carregado.");
      return;
    }
    const ctx = statusChartCanvas.getContext("2d");
    if (statusChartInstance) statusChartInstance.destroy();
    const statusColors = {
      Deferida: "rgba(34, 139, 34, 0.7)",
      Indeferida: "rgba(220, 20, 60, 0.7)",
      "Deferida Parcial": "rgba(255, 165, 0, 0.7)",
      "Pendente de Envio": "rgba(100, 149, 237, 0.7)",
      "Pendente do Termo": "rgba(218, 165, 32, 0.7)",
      Contato: "rgba(20, 184, 166, 0.7)",
      default: "rgba(128, 128, 128, 0.7)",
    };
    const labels = [...statusData.keys()];
    const data = [...statusData.values()];
    const backgroundColors = labels.map((label) => statusColors[label] || statusColors.default);
    statusChartInstance = new Chart(ctx, {
      type: "pie",
      data: {
        labels,
        datasets: [{
          label: "# de Análises",
          data,
          backgroundColor: backgroundColors,
          borderColor: backgroundColors.map((c) => c.replace("0.7", "1")),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: "top" },
          tooltip: {
            callbacks: {
              label: function (context) {
                const label = context.label || "";
                const value = context.raw || 0;
                const total = context.chart.getDatasetMeta(0).total;
                const percentage = ((value / total) * 100).toFixed(1) + "%";
                return `${label}: ${value} (${percentage})`;
              },
            },
          },
        },
      },
    });
  }

  function renderTopList(container, data, emptyMessage) {
    if (data.length === 0) {
      container.innerHTML = `<p class="text-gray-500 text-center">${emptyMessage}</p>`;
      return;
    }
    container.innerHTML = "";
    const ol = document.createElement("ol");
    ol.className = "list-decimal list-inside space-y-2";
    data.forEach(([name, count]) => {
      const li = document.createElement("li");
      li.className = "text-sm text-gray-800 dark:text-gray-200 bg-white dark:bg-slate-800 p-2 border-l-4 border-blue-500 rounded-r-md";
      li.innerHTML = `<span class="font-semibold text-blue-700 dark:text-blue-400">${count}x</span> - ${escapeHtml(String(name))}`;
      ol.appendChild(li);
    });
    container.appendChild(ol);
  }

  // =====================================================================
  // CONTATOS PESSOAIS (lista individual de cada usuário - RLS)
  // =====================================================================
  let contactsCache = [];

  function sortContacts(list) {
    return list.sort((a, b) => {
      if (a.is_favorite !== b.is_favorite) return a.is_favorite ? -1 : 1;
      return (a.name || "").localeCompare(b.name || "", "pt-BR", { sensitivity: "base" });
    });
  }

  async function loadContacts() {
    await getCurrentUserId();
    const { data, error } = await supabaseClientCaf.from(TBL_CONTACTS).select(CONTACT_COLUMNS);
    if (error) throw error;
    contactsCache = sortContacts(data || []);
    renderContactsList();
    return contactsCache;
  }

  function filterContacts(term) {
    const t = normalizeForSearch(term);
    if (!t) return contactsCache;
    const digits = term.replace(/\D/g, "");
    return contactsCache.filter((c) =>
      normalizeForSearch(c.name).includes(t) ||
      normalizeForSearch(c.role).includes(t) ||
      normalizeForSearch(c.sector).includes(t) ||
      normalizeForSearch(c.email).includes(t) ||
      (digits.length >= 3 && String(c.phone).includes(digits)),
    );
  }

  /** Linha "Cargo • Setor" (omite o que estiver vazio). */
  function contactSubtitle(c) {
    return [c.role, c.sector].filter(Boolean).map(escapeHtml).join(" • ");
  }

  function renderContactsList() {
    const total = contactsCache.length;
    if (contactsCountEl) contactsCountEl.textContent = total;
    if (contactsCountBadge) contactsCountBadge.textContent = total;
    const list = filterContacts(contactsSearchInput ? contactsSearchInput.value : "");
    if (total === 0) {
      contactsListContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhum contato cadastrado.</p>';
      return;
    }
    if (list.length === 0) {
      contactsListContainer.innerHTML = '<p class="text-sm text-gray-500 text-center py-4">Nenhum contato encontrado para a busca.</p>';
      return;
    }
    contactsListContainer.innerHTML = "";
    list.forEach((contact) => {
      const sub = contactSubtitle(contact);
      const emailHtml = contact.email
        ? ` • <a href="mailto:${escapeHtml(contact.email)}" class="text-blue-600 dark:text-blue-400 hover:underline">${escapeHtml(contact.email)}</a>`
        : "";
      const div = document.createElement("div");
      div.className = "flex justify-between items-center gap-2 bg-white dark:bg-slate-700 p-2 rounded-lg border dark:border-slate-600 text-sm";
      div.innerHTML = `
        <button data-action="fav" data-id="${contact.id}" title="${contact.is_favorite ? "Remover dos favoritos" : "Marcar como favorito"}"
                class="text-xl leading-none px-1 ${contact.is_favorite ? "text-yellow-500" : "text-gray-300 hover:text-yellow-400"}">★</button>
        <div class="flex-grow min-w-0">
          <p class="font-semibold text-gray-800 dark:text-white truncate">${escapeHtml(contact.name)}</p>
          ${sub ? `<p class="text-xs text-gray-600 dark:text-gray-300 truncate">${sub}</p>` : ""}
          <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${escapeHtml(formatPhoneDisplay(contact.phone))}${emailHtml}</p>
        </div>
        <button data-action="edit" data-id="${contact.id}" title="Editar" class="text-blue-600 dark:text-blue-400 hover:bg-blue-100 dark:hover:bg-slate-600 rounded px-2 py-1 text-xs font-semibold">Editar</button>
        <button data-action="delete" data-id="${contact.id}" title="Excluir" class="text-red-500 hover:text-red-700 font-bold p-1 text-lg leading-none">&times;</button>`;
      contactsListContainer.appendChild(div);
    });
  }

  function resetContactForm() {
    contactEditingIdInput.value = "";
    modalcontactNameInput.value = "";
    modalcontactRoleInput.value = "";
    modalcontactSectorInput.value = "";
    modalcontactEmailInput.value = "";
    contactPhoneInputModal.value = "";
    contactFavoriteInput.checked = false;
    contactFormTitle.textContent = "Novo contato";
    addContactBtn.textContent = "Adicionar Contato";
    cancelEditContactBtn.classList.add("hidden");
  }

  function startEditContact(id) {
    const c = contactsCache.find((x) => x.id === id);
    if (!c) return;
    contactEditingIdInput.value = c.id;
    modalcontactNameInput.value = c.name || "";
    modalcontactRoleInput.value = c.role || "";
    modalcontactSectorInput.value = c.sector || "";
    modalcontactEmailInput.value = c.email || "";
    contactPhoneInputModal.value = maskBrPhone(c.phone);
    contactFavoriteInput.checked = !!c.is_favorite;
    contactFormTitle.textContent = "Editando contato";
    addContactBtn.textContent = "Salvar alterações";
    cancelEditContactBtn.classList.remove("hidden");
    modalcontactNameInput.focus();
  }

  let savingContact = false;
  async function saveContact() {
    if (savingContact) return;
    const name = modalcontactNameInput.value.trim();
    const role = optText(modalcontactRoleInput.value, 80);
    const sector = optText(modalcontactSectorInput.value, 120);
    const phone = normalizePhone(contactPhoneInputModal.value);
    const email = normalizeEmail(modalcontactEmailInput.value);
    const editingId = contactEditingIdInput.value || null;
    if (!name || !contactPhoneInputModal.value.trim()) {
      showToast("Nome e WhatsApp são obrigatórios.", "error");
      return;
    }
    if (!phone) {
      showToast("Telefone inválido. Informe DDD + número (10 ou 11 dígitos).", "error");
      return;
    }
    if (email === false) {
      showToast("E-mail inválido. Corrija ou deixe o campo em branco.", "error");
      modalcontactEmailInput.focus();
      return;
    }
    const dup = contactsCache.find((c) => c.phone === phone && c.id !== editingId);
    if (dup) {
      showToast(`Este telefone já está cadastrado para "${dup.name}".`, "error");
      return;
    }
    savingContact = true;
    addContactBtn.disabled = true;
    try {
      const uid = await getCurrentUserId();
      const payload = { name, role, sector, phone, email, is_favorite: contactFavoriteInput.checked };
      let error;
      if (editingId) {
        ({ error } = await supabaseClientCaf.from(TBL_CONTACTS).update(payload).eq("id", editingId));
      } else {
        ({ error } = await supabaseClientCaf.from(TBL_CONTACTS).insert({ ...payload, user_id: uid }));
      }
      if (error) {
        if (error.code === "23505") throw new Error("Este telefone já está cadastrado.");
        if (error.code === "23514") throw new Error("Dados inválidos: verifique telefone e e-mail.");
        throw error;
      }
      showToast(editingId ? "Contato atualizado!" : "Contato adicionado!", "success");
      resetContactForm();
      await loadContacts();
    } catch (err) {
      console.error(err);
      const known = err.message && (err.message.includes("telefone") || err.message.includes("Dados inválidos"));
      showToast(known ? err.message : "Erro ao salvar contato.", "error");
    } finally {
      savingContact = false;
      addContactBtn.disabled = false;
    }
  }

  async function toggleFavorite(id) {
    const c = contactsCache.find((x) => x.id === id);
    if (!c) return;
    try {
      const { error } = await supabaseClientCaf.from(TBL_CONTACTS).update({ is_favorite: !c.is_favorite }).eq("id", id);
      if (error) throw error;
      c.is_favorite = !c.is_favorite;
      sortContacts(contactsCache);
      renderContactsList();
    } catch (err) {
      console.error(err);
      showToast("Erro ao atualizar favorito.", "error");
    }
  }

  async function deleteContact(id) {
    const c = contactsCache.find((x) => x.id === id);
    if (!c) return;
    if (!confirm(`Remover o contato "${c.name}"?`)) return;
    try {
      const { error } = await supabaseClientCaf.from(TBL_CONTACTS).delete().eq("id", id);
      if (error) throw error;
      if (contactEditingIdInput.value === id) resetContactForm();
      showToast("Contato removido.", "success");
      await loadContacts();
    } catch (err) {
      console.error(err);
      showToast("Erro ao remover contato.", "error");
    }
  }

  function exportContactsCsv() {
    if (!contactsCache.length) {
      showToast("Não há contatos para exportar.", "error");
      return;
    }
    const clean = (s) => String(s || "").replace(/;;/g, ";").replace(/[\r\n]+/g, " ");
    let csvContent = "Nome;;Cargo;;Telefone;;Setor;;Email\n";
    contactsCache.forEach((c) => {
      csvContent += `${clean(c.name)};;${clean(c.role)};;${c.phone};;${clean(c.sector)};;${clean(c.email)}\n`;
    });
    downloadBlob("\uFEFF" + csvContent, "contatos_pessoais_whatsapp.csv", "text/csv;charset=utf-8;");
    showToast("CSV de Contatos exportado!", "success");
  }

  /** Lê CSV em UTF-8 (com ou sem BOM) e, se falhar, em ISO-8859-1. */
  async function readCsvText(file) {
    const buf = await file.arrayBuffer();
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf).replace(/^\uFEFF/, "");
    } catch (e) {
      return new TextDecoder("iso-8859-1").decode(buf);
    }
  }

  /**
   * Linha: Nome;;Cargo;;Telefone[;;Setor[;;Email]]
   * hasSector / hasEmail indicam se a coluna EXISTE na linha (para não
   * apagar dados já cadastrados ao importar arquivos antigos de 3 colunas).
   */
  const contactsParser = (line) => {
    const parts = line.split(";;");
    if (parts.length < 3) return null;
    const name = parts[0] ? parts[0].trim() : "";
    const role = parts[1] ? parts[1].trim() : "";
    const phone = normalizePhone(parts[2]);
    if (!name || !phone) return null;
    const hasSector = parts.length >= 4;
    const hasEmail = parts.length >= 5;
    const email = hasEmail ? normalizeEmail(parts[4]) : null;
    return {
      name,
      role,
      phone,
      hasSector,
      sector: hasSector ? optText(parts[3], 120) : null,
      hasEmail,
      email: email || null,
      emailInvalid: email === false,
    };
  };

  async function importContactsCsv() {
    const file = contactsCsvFileInput.files[0];
    if (!file) {
      showToast("Selecione um arquivo CSV de contatos.", "error");
      return;
    }
    loadContactsCsvBtn.disabled = true;
    contactsDbStatus.className = "text-sm font-medium text-center min-h-[20px] text-blue-600";
    contactsDbStatus.textContent = "Processando...";
    try {
      const uid = await getCurrentUserId();
      const text = await readCsvText(file);
      const lines = text.split(/\r?\n/).filter((l) => l.trim());
      const byPhone = new Map();
      let invalid = 0;
      let invalidEmails = 0;
      lines.forEach((line, idx) => {
        const rec = contactsParser(line);
        if (rec) {
          byPhone.set(rec.phone, rec);
          if (rec.emailInvalid) invalidEmails++;
        } else if (!(idx === 0 && /nome/i.test(line))) {
          invalid++; // ignora cabeçalho
        }
      });
      if (!byPhone.size) {
        contactsDbStatus.textContent = "Nenhum contato válido encontrado no arquivo.";
        contactsDbStatus.className = "text-sm font-medium text-center min-h-[20px] text-red-600";
        return;
      }
      const existingByPhone = new Map(contactsCache.map((c) => [c.phone, c]));
      // Todas as linhas com o MESMO conjunto de colunas (exigência do upsert em lote).
      // Colunas ausentes no arquivo preservam o valor já cadastrado.
      const rows = [...byPhone.values()].map((r) => {
        const ex = existingByPhone.get(r.phone);
        return {
          user_id: uid,
          name: r.name,
          role: r.role || null,
          phone: r.phone,
          sector: r.hasSector ? r.sector : ex ? ex.sector || null : null,
          email: r.hasEmail && !r.emailInvalid ? r.email : ex ? ex.email || null : null,
        };
      });
      const novos = rows.filter((r) => !existingByPhone.has(r.phone)).length;
      const atualizados = rows.length - novos;
      for (const part of chunk(rows, 500)) {
        const { error } = await supabaseClientCaf.from(TBL_CONTACTS).upsert(part, { onConflict: "user_id,phone" });
        if (error) throw error;
      }
      await loadContacts();
      contactsCsvFileInput.value = "";
      let msg = `${novos} novo(s), ${atualizados} atualizado(s)`;
      if (invalid) msg += `, ${invalid} linha(s) inválida(s) ignorada(s)`;
      if (invalidEmails) msg += `, ${invalidEmails} e-mail(s) inválido(s) desconsiderado(s)`;
      contactsDbStatus.textContent = msg + ".";
      contactsDbStatus.className = "text-sm font-medium text-center min-h-[20px] text-green-600";
      showToast("Contatos importados!", "success");
    } catch (err) {
      console.error(err);
      contactsDbStatus.textContent = "Erro ao importar contatos.";
      contactsDbStatus.className = "text-sm font-medium text-center min-h-[20px] text-red-600";
      showToast("Erro ao importar contatos.", "error");
    } finally {
      loadContactsCsvBtn.disabled = false;
    }
  }

  // --- WHATSAPP ---
  function renderWppList() {
    const list = filterContacts(wppSearchInput.value);
    if (contactsCache.length === 0) {
      wppContactListContainer.innerHTML = '<p class="text-center text-red-500">Nenhum contato pessoal cadastrado. Adicione contatos em "Meus Dados" &gt; "Gerenciar Contatos".</p>';
      return;
    }
    if (list.length === 0) {
      wppContactListContainer.innerHTML = '<p class="text-center text-gray-500">Nenhum contato encontrado.</p>';
      return;
    }
    wppContactListContainer.innerHTML = "";
    list.forEach((contact) => {
      const sub = contactSubtitle(contact);
      const button = document.createElement("button");
      button.className = "w-full text-left p-3 bg-gray-50 dark:bg-slate-700 hover:bg-blue-100 dark:hover:bg-slate-600 rounded-lg transition";
      button.dataset.phone = contact.phone;
      button.innerHTML = `
        <p class="font-semibold text-blue-700 dark:text-blue-400">${contact.is_favorite ? '<span class="text-yellow-500">★</span> ' : ""}${escapeHtml(contact.name)}</p>
        <p class="text-sm text-gray-600 dark:text-gray-300">${sub}${sub ? " • " : ""}${escapeHtml(formatPhoneDisplay(contact.phone))}</p>`;
      wppContactListContainer.appendChild(button);
    });
  }

  async function openWppModal() {
    const message = resultText.value;
    if (!message) {
      showToast("Gere uma mensagem antes de enviar.", "error");
      return;
    }
    wppSearchInput.value = "";
    wppContactListContainer.innerHTML = '<p class="text-gray-500 text-center">Carregando contatos...</p>';
    wppModal.classList.remove("hidden");
    try {
      await loadContacts();
    } catch (e) {
      console.error(e);
      showToast("Não foi possível atualizar os contatos. Exibindo a última lista carregada.", "error");
    }
    renderWppList();
    wppSearchInput.focus();
  }

  function handleWppContactClick(event) {
    const targetButton = event.target.closest("button");
    if (!targetButton || !targetButton.dataset.phone) return;
    const phone = targetButton.dataset.phone;
    const encodedMessage = encodeURIComponent(resultText.value);
    window.open(`https://wa.me/${phone}?text=${encodedMessage}`, "_blank");
    wppModal.classList.add("hidden");
  }

  // =====================================================================
  // BUSCA DE EMPRESAS / FAMÍLIAS (inalterado)
  // =====================================================================
  let searchCnpjSeq = 0;
  async function searchCnpj(doc) {
    companyNameResults.innerHTML = "";
    const cleanedDoc = doc.replace(/\D/g, "");
    if (cleanedDoc.length !== 11 && cleanedDoc.length !== 14) {
      companyNameInputForDb.value = "";
      cnpjStatusSpan.textContent = "";
      return;
    }
    cnpjStatusSpan.textContent = "Buscando...";
    cnpjStatusSpan.className = "text-gray-500";
    const mySeq = ++searchCnpjSeq;
    const { data, error } = await supabaseClientCaf
      .from("companies")
      .select("razao_social, data_cadastro, tipo_cadastro")
      .eq("cnpj", cleanedDoc)
      .maybeSingle();
    if (mySeq !== searchCnpjSeq) return;
    if (error) {
      cnpjStatusSpan.textContent = "Erro";
      cnpjStatusSpan.className = "text-red-600";
      registrationDateInput.value = "--";
      registrationTypeInput.value = "CRC";
      console.error("searchCnpj:", error.message);
      return;
    }
    if (data) {
      companyNameInputForDb.value = data.razao_social;
      registrationDateInput.value = formatDate(data.data_cadastro) || "--";
      if (data.tipo_cadastro) {
        const tipo = data.tipo_cadastro.trim().toUpperCase();
        if (tipo === "CRC") registrationTypeInput.value = "CRC";
        else if (tipo === "CRS") registrationTypeInput.value = "CRS";
        else if (tipo === "CANDIDATO") registrationTypeInput.value = "Candidato";
        else registrationTypeInput.value = "CRC";
        cnpjStatusSpan.textContent = "Encontrado";
        cnpjStatusSpan.className = "text-green-600";
      } else {
        registrationTypeInput.value = "CRC";
        cnpjStatusSpan.textContent = "Encontrado (Sem cadastro)";
        cnpjStatusSpan.className = "text-yellow-600";
      }
    } else {
      companyNameInputForDb.value = "";
      registrationDateInput.value = "--";
      registrationTypeInput.value = "CRC";
      cnpjStatusSpan.textContent = "Não encontrado";
      cnpjStatusSpan.className = "text-red-600";
    }
  }

  let searchCompanyByNameSeq = 0;
  async function searchCompanyByName(searchTerm) {
    companyNameResults.innerHTML = "";
    if (searchTerm.length < 5) return;
    const mySeq = ++searchCompanyByNameSeq;
    const { data, error } = await supabaseClientCaf
      .from("companies")
      .select("cnpj, razao_social, data_cadastro, tipo_cadastro")
      .ilike("razao_social", `%${searchTerm}%`)
      .limit(10);
    if (mySeq !== searchCompanyByNameSeq) return;
    if (error) {
      console.error("searchCompanyByName:", error.message);
      cnpjStatusSpan.textContent = "Erro na busca";
      cnpjStatusSpan.className = "text-red-600";
      return;
    }
    const results = (data || []).map((c) => ({
      cnpj: c.cnpj,
      razaoSocial: c.razao_social,
      dataCadastro: formatDate(c.data_cadastro),
      tipoCadastro: c.tipo_cadastro,
    }));
    displayCompanyNameResults(results);
  }

  function debounce(fn, delayMs) {
    let timer = null;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delayMs);
    };
  }
  const debouncedSearchCompanyByName = debounce(searchCompanyByName, 300);

  function displayCompanyNameResults(results) {
    companyNameResults.innerHTML = "";
    results.forEach((company) => {
      const div = document.createElement("div");
      div.className = "p-3 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm bg-white dark:bg-slate-800 dark:text-white border-b dark:border-slate-700";
      div.textContent = company.razaoSocial;
      div.dataset.cnpj = company.cnpj;
      div.dataset.razaoSocial = company.razaoSocial;
      div.dataset.dataCadastro = company.dataCadastro || "";
      div.dataset.tipoCadastro = company.tipoCadastro || "";
      companyNameResults.appendChild(div);
    });
  }

  const docsByCat = {
    "Dados do Fornecedor": ["Documento de Identificação"],
    "Habilitação Jurídica": ["Contrato Social", "Estatuto Social", "Ata", "Sócio", "Dirigente"],
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
    "Qualificação Econômico-Financeira": ["Concordata e Falência", "Balanço 01", "Balanço 02"],
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
  const rejectedDocsListContainer = document.getElementById("rejected-docs-list");
  const companyNameInput = document.getElementById("companyName");
  const analysisDateInput = document.getElementById("analysisDate");
  const registrationTypeInput = document.getElementById("registrationType");
  const registrationDateInput = document.getElementById("registrationDate");
  const docCategoryInput = document.getElementById("docCategory");
  const docNameSelect = document.getElementById("docName");
  const socioNameWrapper = document.getElementById("socioNameWrapper");
  const socioNameInput = document.getElementById("socioName");
  const rejectionReasonInput = document.getElementById("rejectionReason");
  const rejectionReasonResults = document.getElementById("rejectionReasonResults");
  const docNameWrapper = document.getElementById("docNameWrapper");
  const familyAutocompleteWrapper = document.getElementById("familyAutocompleteWrapper");
  const familySearchInput = document.getElementById("familySearchInput");
  const familyResults = document.getElementById("familyResults");
  const contactMadeCheckbox = document.getElementById("contactMade");
  const partialRegistrationWrapper = document.getElementById("partialRegistrationWrapper");
  const partialRegistrationTypeInput = document.getElementById("partialRegistrationType");
  const contactDetailsWrapper = document.getElementById("contactDetailsWrapper");
  const contactNameInput = document.getElementById("contactName");
  const contactRoleInput = document.getElementById("contactRole");
  let rejectedDocs = [];
  let selectedFamilyId = null;
  const contactPhoneInput = document.getElementById("contactPhone");
  const contactSuccessSelect = document.getElementById("contactSuccess");
  const omitLegalFlagCheckbox = document.getElementById("omitLegalFlag");

  function resetFormFields() {
    document.getElementById("statusDeferida").checked = true;
    registrationTypeInput.value = "CRC";
    registrationDateInput.value = "";
    analysisDateInput.value = todayLocalISO();
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
    if (contactGenderM) contactGenderM.checked = true;
  }

  /** Data de hoje no fuso local (evita "amanhã" após 21h em UTC-3). */
  function todayLocalISO() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }

  const populateDocNames = () => {
    const selectedCategory = docCategoryInput.value;
    familyAutocompleteWrapper.classList.add("hidden");
    docNameWrapper.classList.remove("hidden");
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
    if (selectedCategory === "Qualificação Técnica") docNameSelect.value = "outro";
    handleDocNameChange();
  };

  function handleDocNameChange() {
    const selectedDoc = docNameSelect.value;
    manualDocNameWrapper.classList.add("hidden");
    socioNameWrapper.classList.add("hidden");
    if (selectedDoc === "Outros" || selectedDoc === "outro") {
      manualDocNameWrapper.classList.remove("hidden");
      manualDocNameInput.focus();
    } else if (selectedDoc === "Sócio") {
      socioNameWrapper.classList.remove("hidden");
      socioNameInput.focus();
    }
  }

  const updatePartialRegistrationOptions = () => {
    const requestedType = registrationTypeInput.value;
    const partialSelect = partialRegistrationTypeInput;
    const currentVal = partialSelect.value;
    partialSelect.innerHTML = "";
    const addOption = (val) => {
      const opt = document.createElement("option");
      opt.value = val;
      opt.textContent = val;
      partialSelect.appendChild(opt);
    };
    if (requestedType === "CRC") {
      addOption("CRC"); addOption("CRS"); addOption("Candidato");
    } else if (requestedType === "CRS") {
      addOption("CRS"); addOption("Candidato");
    } else if (requestedType === "Candidato") {
      addOption("Candidato");
    }
    const validOptions = Array.from(partialSelect.options).map((o) => o.value);
    if (validOptions.includes(currentVal)) {
      partialSelect.value = currentVal;
    } else {
      if (requestedType === "CRC") partialSelect.value = "CRS";
      else if (requestedType === "CRS") partialSelect.value = "Candidato";
      else partialSelect.value = "Candidato";
    }
  };

  /**
   * Visibilidade de seções e bloqueio de campos por status.
   * - Deferida Parcial / Indeferida: mostra documentos indeferidos
   * - Pendente de Envio / Pendente do Termo: bloqueia data e tipo
   * - Contato: abre os campos de contato e bloqueia apenas a data da análise
   */
  const toggleRejectedDocsSection = () => {
    const selectedStatus = document.querySelector('input[name="status"]:checked').value;
    const analysisFields = document.getElementById("company-data").querySelectorAll('input[type="date"], select');
    const setLocked = (fields, locked) =>
      fields.forEach((f) => {
        f.disabled = locked;
        f.classList.toggle("bg-gray-100", locked);
      });

    partialRegistrationWrapper.classList.toggle("hidden", selectedStatus !== "Deferida Parcial");
    if (selectedStatus === "Deferida Parcial") updatePartialRegistrationOptions();

    rejectedDocsSection.classList.toggle("hidden", !["Deferida Parcial", "Indeferida"].includes(selectedStatus));

    if (selectedStatus === "Contato") {
      contactMadeCheckbox.checked = true;
      contactDetailsWrapper.classList.remove("hidden");
    }

    setLocked(analysisFields, false);
    if (selectedStatus === "Pendente de Envio" || selectedStatus === "Pendente do Termo") {
      setLocked(analysisFields, true);
    } else if (selectedStatus === "Contato") {
      setLocked([analysisDateInput], true);
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return "";
    const [year, month, day] = dateString.split("-");
    return `${day}/${month}/${year}`;
  };

  const renderRejectedDocs = () => {
    rejectedDocsListContainer.innerHTML = "";
    if (rejectedDocs.length === 0) return;
    const heading = document.createElement("h3");
    heading.className = "text-md font-semibold text-gray-600 dark:text-gray-300";
    heading.textContent = "Documentos Adicionados:";
    rejectedDocsListContainer.appendChild(heading);
    rejectedDocs.forEach((doc, index) => {
      const docElement = document.createElement("div");
      docElement.className = "flex justify-between items-center bg-white dark:bg-slate-700 p-3 rounded-lg border dark:border-slate-600";
      let docDisplayName = doc.name;
      if (doc.name === "Sócio" && doc.socioName) docDisplayName += `: ${doc.socioName}`;
      docElement.innerHTML = `
          <div class="text-sm">
              <p class="font-bold text-blue-700 dark:text-blue-400">${escapeHtml(doc.category)}</p>
              <p class="text-gray-800 dark:text-gray-200">${escapeHtml(docDisplayName)}</p>
              <p class="text-gray-500 italic">Motivo: ${escapeHtml(doc.reason)}</p>
          </div>
          <button data-index="${index}" class="remove-doc-btn text-red-500 hover:text-red-700 font-bold p-1">&times;</button>`;
      rejectedDocsListContainer.appendChild(docElement);
    });
  };

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
      const rawName = docNameSelect.value;
      if (rawName === "Outros" || rawName === "outro") {
        name = manualDocNameInput.value.trim();
        if (!name) {
          alert("Por favor, digite o nome do documento.");
          return;
        }
      } else if (rawName === "Sócio") {
        name = "Sócio";
        socioName = socioNameInput.value.trim();
        if (!socioName) {
          alert("Por favor, preencha o nome do sócio.");
          return;
        }
      } else {
        name = rawName;
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
    manualDocNameInput.value = "";
    socioNameInput.value = "";
    manualDocNameWrapper.classList.add("hidden");
    populateDocNames();
    rejectionReasonInput.focus();
  };

  const removeRejectedDoc = (index) => {
    rejectedDocs.splice(Number(index), 1);
    renderRejectedDocs();
  };

  const normalizeForSearch = (text) =>
    (text || "")
      .toString()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim();

  function buscarMotivosSemelhantes(termoDigitado) {
    const termo = normalizeForSearch(termoDigitado);
    if (termo.length < 3 || motivosIndeferimento.length === 0) return [];
    const categoriaAtual = docCategoryInput ? docCategoryInput.value : "";
    const termoPalavras = termo.split(/\s+/).filter(Boolean);
    const candidatos = motivosIndeferimento
      .map((item) => {
        const motivoNormalizado = normalizeForSearch(item.motivo);
        const bate = termoPalavras.every((palavra) => motivoNormalizado.includes(palavra));
        if (!bate) return null;
        const categorias = item.categorias || [];
        const relevanteParaCategoria = !categoriaAtual || categorias.includes(categoriaAtual) || categorias.includes("Todos");
        let score = 0;
        if (motivoNormalizado.startsWith(termo)) score += 2;
        if (relevanteParaCategoria) score += 1;
        return { motivo: item.motivo, score };
      })
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    const vistos = new Set();
    const unicos = [];
    for (const c of candidatos) {
      if (!vistos.has(c.motivo)) {
        vistos.add(c.motivo);
        unicos.push(c.motivo);
      }
    }
    return unicos.slice(0, 8);
  }

  function renderMotivoSuggestions(sugestoes) {
    if (!sugestoes || sugestoes.length === 0) {
      rejectionReasonResults.innerHTML = "";
      rejectionReasonResults.classList.add("hidden");
      return;
    }
    rejectionReasonResults.innerHTML = "";
    sugestoes.forEach((motivo) => {
      const item = document.createElement("div");
      item.className = "px-3 py-2 text-sm text-gray-700 dark:text-gray-200 hover:bg-blue-50 dark:hover:bg-slate-700 cursor-pointer border-b dark:border-slate-700 last:border-b-0";
      item.textContent = motivo;
      item.dataset.motivo = motivo;
      rejectionReasonResults.appendChild(item);
    });
    rejectionReasonResults.classList.remove("hidden");
  }
  let buscaMotivoTimeout = null;

  let searchFamiliesSeq = 0;
  async function searchFamilies(searchTerm) {
    familyResults.innerHTML = "";
    if (!searchTerm) return;
    const mySeq = ++searchFamiliesSeq;
    const { data, error } = await supabaseClientCaf
      .from("qualificacao_tecnica")
      .select("familia, descricao")
      .or(`descricao.ilike.%${searchTerm}%,familia.ilike.%${searchTerm}%`)
      .limit(10);
    if (mySeq !== searchFamiliesSeq) return;
    if (error) {
      console.error("searchFamilies:", error.message);
      return;
    }
    displayFamilyResults((data || []).map((f) => ({ id: f.familia, description: f.descricao })));
  }
  const debouncedSearchFamilies = debounce(searchFamilies, 300);

  function displayFamilyResults(results) {
    familyResults.innerHTML = "";
    if (results.length === 0) {
      familyResults.innerHTML = '<div class="p-3 text-sm text-gray-500 bg-white dark:bg-slate-800 border-b dark:border-slate-700">Nenhuma família encontrada.</div>';
      return;
    }
    results.forEach((family) => {
      const div = document.createElement("div");
      div.className = "p-3 hover:bg-gray-100 dark:hover:bg-slate-700 cursor-pointer text-sm bg-white dark:bg-slate-800 dark:text-white border-b dark:border-slate-700 transition-colors";
      div.textContent = `${family.id} - ${family.description}`;
      div.dataset.id = family.id;
      div.dataset.description = family.description;
      familyResults.appendChild(div);
    });
  }

  // =====================================================================
  // GERAÇÃO DA MENSAGEM (textos inalterados)
  // =====================================================================
  const generateMessage = async () => {
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
    if (status !== "Pendente de Envio" && status !== "Pendente do Termo" && !analysisDate) {
      alert("Por favor, preencha a data da análise.");
      return;
    }
    if (contactMade && (!contactName || !contactRole || !contactPhone)) {
      alert("Por favor, preencha o Nome do Contato e o Cargo.");
      return;
    }
    const legalParagraph = `Importante salientar que as documentações necessárias para registro no Cadastro de Fornecedores do Estado da Bahia – CAF obedecem ao quanto previsto nos art. 62 a 70 e 87 e 88, da Lei Federal nº 14.133/2021 c/c o art. 76 da Lei Estadual nº 14.634/2023.`;
    const finalLegalFooter = omitLegal ? "" : `${legalParagraph}\n\n`;
    const defaultEmailFooter = `O fornecedor é notificado automaticamente por e-mail.`;
    const noEmailFooter = "";
    const cargosFemininos = {
      "Sócio": "Sócia",
      "Diretor": "Diretora",
      "Dirigente": "Dirigente",
      "Presidente": "Presidente",
      "Representante Legal": "Representante Legal",
      "Resposável pelo cadastro": "Responsável pelo cadastro",
    };
    const honorific = contactGender === "M" ? "Sr." : "Sra.";
    const roleString = contactGender === "M" ? contactRole : (cargosFemininos[contactRole] || contactRole);
    const contactMadeSuccessFooter = `O fornecedor é notificado automaticamente por e-mail. Contudo, em contato com ${contactGender === "M" ? "o" : "a"} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, foram esclarecidos os motivos do indeferimento, tendo sido informado que as providências necessárias para regularização já estão sendo adotadas e que será sinalizado quando houver nova solicitação.`;
    const contactMadeFailedFooter = `O fornecedor é notificado automaticamente por e-mail. Contudo, em tentativa de contato telefônico com ${contactGender === "M" ? "o" : "a"} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, não obtivemos êxito, tendo a chamada sido direcionada para a caixa postal.`;
    const contactMadePendenteTermoFooter = `Em contato com ${contactGender === "M" ? "o" : "a"} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, foi esclarecido o motivo da pendência, tendo sido informado que as providências necessárias para o envio do Termo de Concordância já estão sendo adotadas e que será sinalizado quando o envio for realizado.`;
    const contactMadePendenteEnvioFooter = `Em contato com ${contactGender === "M" ? "o" : "a"} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, foi esclarecido o motivo da pendência, tendo sido informado que as providências necessárias para o envio da solicitação já estão sendo adotadas e que será sinalizado quando o envio for realizado.`;
    const contactMadePendenteFailedFooter = `Em tentativa de contato telefônico com ${contactGender === "M" ? "o" : "a"} ${honorific} *${contactName}*, *${roleString}* da empresa, pelo número *${contactPhone}*, não obtivemos êxito, tendo a chamada sido direcionada para a caixa postal. Reiteramos a necessidade de regularização da pendência no CAF Digital para que a solicitação possa ser analisada.`;
    let message = "";
    const cleanDocLength = cnpj.replace(/\D/g, "").length;
    let docIdentifier;
    if (cleanDocLength > 11) docIdentifier = "CNPJ sob o nº";
    else if (cleanDocLength < 11) docIdentifier = "Código nº";
    else docIdentifier = "CPF sob o nº";

    switch (status) {
      case "Deferida":
        message = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, foi analisada e *${status}* em *${analysisDate}* para o tipo de cadastro *${registrationType}*.\n\n${finalLegalFooter}${defaultEmailFooter}`;
        break;
      case "Deferida Parcial":
      case "Indeferida": {
        if (rejectedDocs.length === 0) {
          alert(`Para o status "${status}", é necessário adicionar pelo menos um documento indeferido.`);
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
            if (doc.name === "Sócio" && doc.socioName) docTitle = `*SÓCIO: ${doc.socioName.toUpperCase()}*`;
            else docTitle = `*${doc.name.toUpperCase()}*`;
            docsText += `${docTitle}\n`;
            docsText += `*Motivo*: _${doc.reason}_\n\n`;
          });
        }
        let finalEmailFooter = defaultEmailFooter;
        if (contactMade) {
          finalEmailFooter = contactSuccess === "S" ? contactMadeSuccessFooter : contactMadeFailedFooter;
        }
        let textoDeferidoParcial = "";
        if (status === "Deferida Parcial") {
          const tipoConcedido = partialRegistrationTypeInput.value;
          if (tipoConcedido !== registrationType) {
            textoDeferidoParcial = `Em razão do indeferimento dos documentos listados, o fornecedor não atendeu aos requisitos necessários à habilitação no tipo de cadastro solicitado, tendo sido habilitado no tipo de cadastro *${tipoConcedido}*.\n\n`;
          }
        }
        message = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, foi analisada e *${status}* em *${analysisDate}* para o tipo de cadastro *${registrationType}*, conforme análise abaixo:\n\n${docsText}${textoDeferidoParcial}${finalLegalFooter}${finalEmailFooter}`;
        break;
      }
      case "Pendente de Envio": {
        const baseMessageEnvio = `A solicitação do fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, encontra-se *Pendente de Envio*.\n\nÉ necessário que o fornecedor acesse o CAF Digital, atualize os dados necessários e realize o envio da solicitação para análise pela Comissão de Inscrição e Registro Cadastral.`;
        let finalFooterEnvio = noEmailFooter;
        if (contactMade) {
          finalFooterEnvio = contactSuccess === "S" ? contactMadePendenteEnvioFooter : contactMadePendenteFailedFooter;
        }
        message = `${baseMessageEnvio}\n\n${finalFooterEnvio}`;
        break;
      }
      case "Pendente do Termo": {
        const baseMessageTermo = `A solicitação enviada pelo fornecedor *${companyName}*, inscrito no ${docIdentifier} *${cnpj}*, encontra-se *Pendente do envio do Termo de Concordância e Veracidade*.\n\nO fornecedor poderá realizar o envio do referido Termo por meio do *CAF Digital*, assinando-o eletronicamente com Certificado ICP-Brasil (por exemplo, utilizando o Assinador gov.br), ou optar pela entrega presencial, conforme orientações contidas no próprio Termo.`;
        let finalFooterTermo = noEmailFooter;
        if (contactMade) {
          finalFooterTermo = contactSuccess === "S" ? contactMadePendenteTermoFooter : contactMadePendenteFailedFooter;
        }
        message = `${baseMessageTermo}\n\n${finalFooterTermo}`;
        break;
      }
      case "Contato": {
        if (!contactName || !contactPhone) {
          alert("Por favor, preencha os dados do contato.");
          return;
        }
        const artigo = contactGender === "M" ? "o" : "a";
        const pronome = contactGender === "M" ? "Sr." : "Sra.";
        const cargoFormatado = contactGender === "M" ? contactRole : (cargosFemininos[contactRole] || contactRole);
        if (contactSuccess === "S") {
          message = `Em contato com ${artigo} ${pronome} *${contactName}*, *${cargoFormatado}* da empresa *${companyName}*, inscrita sob o CNPJ nº *${cnpj}*, pelo número *${contactPhone}*, foram esclarecidos os motivos do indeferimento, tendo sido informado que as providências necessárias para regularização já estão sendo adotadas e que será sinalizado quando houver nova solicitação.`;
        } else {
          message = `Em tentativa de contato telefônico com ${artigo} ${pronome} *${contactName}*, *${cargoFormatado}* da empresa *${companyName}*, inscrita sob o CNPJ nº *${cnpj}*, pelo número *${contactPhone}*, não obtivemos êxito, tendo a chamada sido direcionada para a caixa postal.`;
        }
        break;
      }
    }

    resultText.value = message;
    resultSection.classList.remove("hidden");
    resultText.style.height = "auto";
    resultText.style.height = resultText.scrollHeight + 10 + "px";
    resultText.scrollIntoView({ behavior: "smooth", block: "end" });

    const isPending = status === "Pendente de Envio" || status === "Pendente do Termo";
    const messageData = {
      cnpj,
      companyName,
      message,
      status,
      rejectedDocs: rejectedDocs.map((d) => ({ ...d })),
      registrationType,
      grantedType: status === "Deferida Parcial" ? partialRegistrationTypeInput.value : null,
      analysisDate: isPending || status === "Contato" ? null : analysisDateInput.value || null,
      contactMade,
      contact: contactMade
        ? { name: contactName, role: contactRole, phone: contactPhone, gender: contactGender, success: contactSuccess }
        : null,
    };
    const result = await saveMessageToHistory(messageData);
    if (result === "saved") showToast("Mensagem gerada e salva no histórico!", "success");
    else if (result === "duplicate") showToast("Mensagem gerada (já estava registrada no histórico).", "info");
    else showToast("Mensagem gerada. Sem conexão: o registro será enviado ao histórico automaticamente.", "error", 5000);
  };

  const copyToClipboard = (text) => {
    if (!text) return;
    navigator.clipboard
      .writeText(text)
      .then(() => showToast("Texto copiado com sucesso!", "success"))
      .catch((err) => {
        console.error("Falha ao copiar texto: ", err);
        showToast("Erro ao copiar texto.", "error");
      });
  };

  // =====================================================================
  // EVENT LISTENERS
  // =====================================================================
  // --- Modal "Meus Dados" ---
  openDbModalBtn.addEventListener("click", () => dbModal.classList.remove("hidden"));
  closeDbModalBtn.addEventListener("click", () => dbModal.classList.add("hidden"));
  dbModal.addEventListener("click", (e) => {
    if (e.target.id === "dbModal") dbModal.classList.add("hidden");
  });

  // --- Histórico ---
  openHistoryModalBtn.addEventListener("click", () => {
    historyModal.classList.remove("hidden");
    historySearchCnpj.value = "";
    historySearchName.value = "";
    historyStatusFilter.value = "";
    historyStartDate.value = "";
    historyEndDate.value = "";
    renderHistory(true);
  });
  filterHistoryBtn.addEventListener("click", () => renderHistory(true));
  [historySearchCnpj, historySearchName].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") renderHistory(true);
    }),
  );
  clearHistoryFilterBtn.addEventListener("click", () => {
    historySearchCnpj.value = "";
    historySearchName.value = "";
    historyStatusFilter.value = "";
    historyStartDate.value = "";
    historyEndDate.value = "";
    renderHistory(true);
  });
  historyLoadMoreBtn.addEventListener("click", () => {
    historyPage++;
    renderHistory(false);
  });
  historySearchCnpj.addEventListener("input", (e) => {
    e.target.value = formatDocument(e.target.value);
  });
  closeHistoryModalBtn.addEventListener("click", () => historyModal.classList.add("hidden"));
  historyModal.addEventListener("click", (e) => {
    if (e.target.id === "historyModal") historyModal.classList.add("hidden");
  });
  document.getElementById("clearHistoryBtn").addEventListener("click", clearHistory);

  historyListContainer.addEventListener("click", function (e) {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const card = btn.closest(".history-card");
    const item = card ? historyItemsById.get(card.dataset.id) : null;
    if (!item) return;
    const action = btn.dataset.action;
    if (action === "copy") {
      copyToClipboard(item.message);
    } else if (action === "delete") {
      deleteHistoryItem(item.id);
    } else if (action === "reopen") {
      reopenHistoryItem(item);
    } else if (action === "expand") {
      const content = card.querySelector(".history-message-content");
      if (!content.style.maxHeight || content.style.maxHeight === "0px") {
        content.style.maxHeight = content.scrollHeight + "px";
        btn.innerHTML = svgIconCollapse;
        btn.title = "Recolher";
      } else {
        content.style.maxHeight = "0px";
        btn.innerHTML = svgIconExpand;
        btn.title = "Expandir";
      }
    }
  });

  // --- Exportação / Importação ---
  document.getElementById("exportDbBtn").addEventListener("click", () => {
    exportModal.classList.remove("hidden");
  });
  cancelExportBtn.addEventListener("click", () => exportModal.classList.add("hidden"));
  exportModal.addEventListener("click", (e) => {
    if (e.target.id === "exportModal") exportModal.classList.add("hidden");
  });
  confirmExportBtn.addEventListener("click", async () => {
    const includeContacts = document.getElementById("exportContacts").checked;
    const includeHistory = document.getElementById("exportHistory").checked;
    confirmExportBtn.disabled = true;
    const ok = await processExport({ includeContacts, includeHistory });
    confirmExportBtn.disabled = false;
    if (ok) exportModal.classList.add("hidden");
  });
  document.getElementById("importDbFile").addEventListener("change", importDatabase);

  // --- Migração ---
  migrationStartBtn.addEventListener("click", migrateLegacyData);
  migrationStartBtn2.addEventListener("click", migrateLegacyData);
  migrationDismissBtn.addEventListener("click", () => {
    sessionStorage.setItem("caf_migration_dismissed", "1");
    migrationBanner.classList.add("hidden");
  });

  // --- Formulário principal ---
  cnpjInputForDb.addEventListener("input", (e) => {
    e.target.value = formatDocument(e.target.value);
    resetFormFields();
    searchCnpj(e.target.value);
  });

  companyNameInputForDb.addEventListener("input", (e) => {
    const searchTerm = e.target.value;
    if (searchTerm.length === 0) {
      companyNameResults.innerHTML = "";
      cnpjStatusSpan.textContent = "";
    } else if (searchTerm.length >= 5) {
      cnpjStatusSpan.textContent = "Buscando...";
      cnpjStatusSpan.className = "text-gray-500";
      debouncedSearchCompanyByName(searchTerm);
    }
  });

  companyNameResults.addEventListener("click", (e) => {
    if (e.target.tagName === "DIV") {
      const cnpj = e.target.dataset.cnpj;
      const razaoSocial = e.target.dataset.razaoSocial;
      const dataCadastro = e.target.dataset.dataCadastro;
      const tipoCadastro = e.target.dataset.tipoCadastro;
      resetFormFields();
      companyNameInputForDb.value = razaoSocial;
      cnpjInputForDb.value = formatDocument(cnpj);
      registrationDateInput.value = dataCadastro || "--";
      if (tipoCadastro) {
        const tipo = tipoCadastro.trim().toUpperCase();
        if (tipo === "CRC") registrationTypeInput.value = "CRC";
        else if (tipo === "CRS") registrationTypeInput.value = "CRS";
        else if (tipo === "CANDIDATO") registrationTypeInput.value = "Candidato";
        else registrationTypeInput.value = "CRC";
      } else {
        registrationTypeInput.value = "CRC";
      }
      cnpjStatusSpan.textContent = "Encontrado";
      cnpjStatusSpan.className = "text-green-600";
      companyNameResults.innerHTML = "";
    }
  });

  statusRadios.forEach((radio) => radio.addEventListener("change", toggleRejectedDocsSection));
  addDocBtn.addEventListener("click", addRejectedDoc);
  generateBtn.addEventListener("click", generateMessage);
  copyBtn.addEventListener("click", () => copyToClipboard(resultText.value));
  docCategoryInput.addEventListener("change", populateDocNames);
  docNameSelect.addEventListener("change", handleDocNameChange);
  registrationTypeInput.addEventListener("change", () => {
    if (document.querySelector('input[name="status"]:checked').value === "Deferida Parcial") {
      updatePartialRegistrationOptions();
    }
  });
  if (contactPhoneInput) {
    contactPhoneInput.addEventListener("input", (e) => {
      e.target.value = formatPhone(e.target.value);
    });
  }
  familySearchInput.addEventListener("input", (e) => debouncedSearchFamilies(e.target.value));
  familyResults.addEventListener("click", (e) => {
    if (e.target.tagName === "DIV" && e.target.dataset.id) {
      familySearchInput.value = e.target.textContent;
      selectedFamilyId = e.target.dataset.id;
      familyResults.innerHTML = "";
    }
  });
  rejectedDocsListContainer.addEventListener("click", function (e) {
    if (e.target.classList.contains("remove-doc-btn")) {
      removeRejectedDoc(e.target.getAttribute("data-index"));
    }
  });

  rejectionReasonInput.addEventListener("input", (e) => {
    clearTimeout(buscaMotivoTimeout);
    const valor = e.target.value;
    buscaMotivoTimeout = setTimeout(() => {
      renderMotivoSuggestions(buscarMotivosSemelhantes(valor));
    }, 200);
  });
  rejectionReasonResults.addEventListener("mousedown", (e) => {
    const target = e.target.closest("[data-motivo]");
    if (!target) return;
    e.preventDefault();
    rejectionReasonInput.value = target.dataset.motivo;
    renderMotivoSuggestions([]);
    rejectionReasonInput.focus();
  });
  rejectionReasonInput.addEventListener("blur", () => {
    setTimeout(() => renderMotivoSuggestions([]), 150);
  });

  contactMadeCheckbox.addEventListener("change", () => {
    contactDetailsWrapper.classList.toggle("hidden", !contactMadeCheckbox.checked);
  });

  // --- WhatsApp ---
  sendWppBtn.addEventListener("click", openWppModal);
  closeWppModalBtn.addEventListener("click", () => wppModal.classList.add("hidden"));
  wppModal.addEventListener("click", (e) => {
    if (e.target.id === "wppModal") wppModal.classList.add("hidden");
  });
  wppContactListContainer.addEventListener("click", handleWppContactClick);
  wppSearchInput.addEventListener("input", renderWppList);

  // --- Contatos ---
  openContactsModalBtn.addEventListener("click", () => {
    resetContactForm();
    contactsSearchInput.value = "";
    renderContactsList();
    contactsModal.classList.remove("hidden");
    loadContacts().catch((e) => {
      console.error(e);
      showToast("Não foi possível atualizar a lista de contatos.", "error");
    });
  });
  closeContactsModalBtn.addEventListener("click", () => contactsModal.classList.add("hidden"));
  contactsModal.addEventListener("click", (e) => {
    if (e.target.id === "contactsModal") contactsModal.classList.add("hidden");
  });
  addContactBtn.addEventListener("click", saveContact);
  cancelEditContactBtn.addEventListener("click", resetContactForm);
  [modalcontactNameInput, modalcontactRoleInput, modalcontactSectorInput, contactPhoneInputModal, modalcontactEmailInput].forEach((el) =>
    el.addEventListener("keydown", (e) => {
      if (e.key === "Enter") saveContact();
    }),
  );
  contactPhoneInputModal.addEventListener("input", (e) => {
    e.target.value = maskBrPhone(e.target.value);
  });
  contactsSearchInput.addEventListener("input", renderContactsList);
  contactsListContainer.addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-action]");
    if (!btn) return;
    const id = btn.dataset.id;
    if (btn.dataset.action === "edit") startEditContact(id);
    else if (btn.dataset.action === "delete") deleteContact(id);
    else if (btn.dataset.action === "fav") toggleFavorite(id);
  });
  exportContactsCsvBtn.addEventListener("click", exportContactsCsv);
  loadContactsCsvBtn.addEventListener("click", importContactsCsv);

  // --- Dashboard ---
  const closeDashboard = () => {
    dashboardModal.classList.add("hidden");
    if (statusChartInstance) {
      statusChartInstance.destroy();
      statusChartInstance = null;
    }
  };
  openDashboardModalBtn.addEventListener("click", () => {
    dashboardModal.classList.remove("hidden");
    renderDashboard();
  });
  closeDashboardModalBtn.addEventListener("click", closeDashboard);
  dashboardModal.addEventListener("click", (e) => {
    if (e.target.id === "dashboardModal") closeDashboard();
  });
  refreshDashboardBtn.addEventListener("click", renderDashboard);

  // =====================================================================
  // INICIALIZAÇÃO
  // =====================================================================
  analysisDateInput.value = todayLocalISO();
  populateDocNames();
  renderFooter();
  initializeAppLogic();

  const dontShow = localStorage.getItem("dontShowWelcomeGerador");
  if (!dontShow) {
    const modal = document.getElementById("welcomeModalGerador");
    if (modal) setTimeout(() => modal.classList.remove("hidden"), 300);
  }
  window.closeWelcomeModalGerador = function () {
    const modal = document.getElementById("welcomeModalGerador");
    if (modal) {
      modal.classList.add("hidden");
      if (document.getElementById("dontShowGeradorAgain").checked) {
        localStorage.setItem("dontShowWelcomeGerador", "true");
      }
    }
  };
});

// =====================================================================
// INTEGRAÇÃO COM HOME (estatísticas lidas do Supabase)
// =====================================================================
async function gerarEstatisticasGerador() {
  const vazio = { mensagens: 0, deferidas: 0, percentualDeferidas: 0 };
  try {
    await getCurrentUserId();
    const base = () =>
      supabaseClientCaf.from(TBL_HISTORY).select("id", { count: "exact", head: true }).is("deleted_at", null);
    const [{ count: total, error: e1 }, { count: deferidas, error: e2 }] = await Promise.all([
      base(),
      base().eq("status", "Deferida"),
    ]);
    if (e1 || e2) throw e1 || e2;
    const t = total || 0;
    const d = deferidas || 0;
    return {
      mensagens: t,
      deferidas: d,
      percentualDeferidas: t > 0 ? ((d / t) * 100).toFixed(0) : 0,
    };
  } catch (e) {
    console.warn("Stats do gerador indisponíveis:", e);
    return vazio;
  }
}

async function atualizarStatsExternos() {
  try {
    const stats = await gerarEstatisticasGerador();
    localStorage.setItem("stats_gerador", JSON.stringify(stats));
  } catch (e) {
    console.error("Erro ao atualizar stats do gerador:", e);
  }
}

window.addEventListener("message", async (event) => {
  if (event.data && event.data.type === "GET_STATS") {
    const stats = await gerarEstatisticasGerador();
    if (event.source) {
      event.source.postMessage({ type: "STATS_RESPONSE", app: "gerador", data: stats }, event.origin);
    }
  }
});
