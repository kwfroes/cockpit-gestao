const WORKER_URL = "https://cockpit-storage-worker.kwfroes.workers.dev";

let currentUser = null;
let currentProfile = null;
let currentPath = "/";
let filesData = [];
let foldersData = [];
let teamProfiles = [];
let activeTab = "all";
let currentShareFileId = null;

let chatMode = "general"; // "general" | "direct"
let targetUserId = null;
let arquivoAnexado = null; // { id, nome, storage_key, mime_type, tamanho_bytes }
let meusArquivosParaAnexo = [];

document.addEventListener("DOMContentLoaded", async () => {
  // Sincronizador de tema com escuta ativa do Cockpit
  initThemeSync();

  if (typeof checkAuth === "function") {
    await checkAuth();
  }

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user) {
    window.location.href = "../../index.html";
    return;
  }
  currentUser = user;

  await loadUserProfile();
  await loadTeamProfiles();
  await loadStorageContent();
  await loadMessages();
  setupEvents();
  setupRealtime();
});

// Listener do tema IDÊNTICO ao apps/matrix
function initThemeSync() {
  const savedTheme = localStorage.getItem("cockpit_theme") || "light";
  document.documentElement.classList.toggle("dark", savedTheme === "dark");

  window.addEventListener("message", (e) => {
    if (e.data && e.data.type === "THEME_CHANGE") {
      const isDark = e.data.theme === "dark";
      if (window.tailwind) window.tailwind.config.darkMode = 'class';
      document.documentElement.classList.toggle("dark", isDark);
      document.body.style.backgroundColor = ""; 
      document.body.style.color = "";
      localStorage.setItem("cockpit_theme", e.data.theme);
    }
  });
}

// Retorna o nome formatado usando os campos reais da sua tabela profiles
function getDisplayName(p) {
  if (!p) return "Usuário";
  return p.apelido || p.name || p.email?.split("@")[0] || "Colega";
}

// Cota do Perfil
async function loadUserProfile() {
  const { data } = await supabaseClient
    .from("profiles")
    .select("id, name, apelido, email, storage_used_bytes, storage_quota_bytes, coordenacao")
    .eq("id", currentUser.id)
    .single();

  if (data) {
    currentProfile = data;
    renderQuota(data.storage_used_bytes || 0, data.storage_quota_bytes || 524288000);
    montarSeletorDeEscopoMural();
    atualizarNotificacoes();
  }
}

function renderQuota(used, quota) {
  const pct = Math.min(100, Math.round((used / quota) * 100));
  const usedMB = (used / (1024 * 1024)).toFixed(1);
  const quotaMB = (quota / (1024 * 1024)).toFixed(0);

  document.getElementById("quota-text").textContent = `${usedMB} MB de ${quotaMB} MB`;
  document.getElementById("quota-pct").textContent = `${pct}%`;
  
  const bar = document.getElementById("quota-bar");
  bar.style.width = `${pct}%`;
  bar.className = pct >= 90 ? "bg-rose-500 h-full transition-all" : pct >= 70 ? "bg-amber-500 h-full transition-all" : "bg-blue-600 h-full transition-all";
}

// Carregar Colegas (Agora usando 'name' e 'apelido')
async function loadTeamProfiles() {
  const { data, error } = await supabaseClient
    .from("profiles")
    .select("id, name, apelido, email, status")
    .neq("id", currentUser.id)
    .or("status.is.null,status.neq.inativo");

  teamProfiles = data || [];

  const select = document.getElementById("chat-target-user");
  if (teamProfiles.length === 0) {
    select.innerHTML = `<option value="">Nenhum colega encontrado</option>`;
  } else {
    select.innerHTML = `<option value="">Selecione um colega...</option>` + teamProfiles.map(p => `
      <option value="${p.id}">👤 ${escapeHtml(getDisplayName(p))}</option>
    `).join("");
  }
}

// Configuração de Eventos
function setupEvents() {
  const fileInput = document.getElementById("file-input");
  const fabUpload = document.getElementById("fab-upload");
  const dragOverlay = document.getElementById("drag-overlay");

  // 1. Clique no botão flutuante (+) abre o seletor nativo
  if (fabUpload && fileInput) {
    fabUpload.addEventListener("click", () => fileInput.click());
  }

  if (fileInput) {
    fileInput.addEventListener("change", (e) => {
      if (e.target.files?.length) {
        handleFilesUpload(e.target.files);
        fileInput.value = "";
      }
    });
  }

  // 2. Drag & Drop em tela cheia restrito ao Drive
  window.addEventListener("dragenter", (e) => {
    if (e.dataTransfer?.types?.includes("Files") && dragOverlay) {
      dragOverlay.classList.remove("hidden");
    }
  });

  window.addEventListener("dragover", (e) => {
    e.preventDefault();
  });

  window.addEventListener("dragleave", (e) => {
    if (dragOverlay && (e.clientX <= 0 || e.clientY <= 0 || e.clientX >= window.innerWidth || e.clientY >= window.innerHeight)) {
      dragOverlay.classList.add("hidden");
    }
  });

  window.addEventListener("drop", (e) => {
    e.preventDefault();
    if (dragOverlay) dragOverlay.classList.add("hidden");
    if (e.dataTransfer?.files?.length) {
      handleFilesUpload(e.dataTransfer.files);
    }
  });

  // 3. Modal Nova Pasta
  document.getElementById("btn-nova-pasta").addEventListener("click", () => {
    document.getElementById("folder-name-input").value = "";
    document.getElementById("folder-modal").style.display = "block";
    document.getElementById("folder-name-input").focus();
  });

  document.getElementById("folder-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const nome = document.getElementById("folder-name-input").value.trim().replace(/[/\\?%*:|"<>]/g, "");
    if (!nome) return;

    const { error } = await supabaseClient.from("storage_pastas").insert([{
      user_id: currentUser.id,
      autor_nome: getDisplayName(currentProfile),
      nome: nome,
      caminho_pai: currentPath
    }]);

    if (error) {
      console.error("Erro ao criar pasta no Supabase:", error);
      if (error.code === "23505") {
        showToast("Já existe uma pasta com este nome aqui.");
      } else {
        showToast(error.message || "Erro de permissão ao criar pasta.");
      }
    } else {
      showToast("Pasta criada com sucesso!");
      closeFolderModal();
      await loadStorageContent();
    }
  });

  // 4. Filtros
  document.querySelectorAll(".filter-tab").forEach(tab => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".filter-tab").forEach(t => {
        t.className = "filter-tab px-3 py-1.5 rounded-lg font-medium transition text-slate-600 dark:text-slate-400 hover:text-slate-900";
      });
      tab.className = "filter-tab px-3 py-1.5 rounded-lg font-medium transition bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white";
      activeTab = tab.dataset.tab;
      if (activeTab === "shared") marcarCompartilhamentosComoVistos();

      const ehLixeira = activeTab === "lixeira";
      document.getElementById("btn-nova-pasta").classList.toggle("hidden", ehLixeira);
      document.getElementById("btn-esvaziar-lixeira").classList.toggle("hidden", !ehLixeira);
      document.getElementById("btn-esvaziar-lixeira").classList.toggle("flex", ehLixeira);

      if (ehLixeira) {
        loadLixeira();
      } else if (activeTab === "shared") {
        loadSharedContent();
      } else {
        loadStorageContent();
      }
    });
  });

  document.getElementById("btn-esvaziar-lixeira").addEventListener("click", esvaziarLixeira);

  document.getElementById("search-input").addEventListener("input", renderContent);

  // 5. Toggle Chat
  const chatPanel = document.getElementById("chat-panel");
  document.getElementById("btn-toggle-chat").addEventListener("click", () => {
    chatPanel.classList.toggle("hidden");
    if (!chatPanel.classList.contains("hidden")) marcarMensagensComoVistas();
  });
  document.getElementById("btn-close-chat").addEventListener("click", () => chatPanel.classList.add("hidden"));

  // 6. Abas Geral vs Privado
  const tabGeneral = document.getElementById("tab-chat-general");
  const tabDirect = document.getElementById("tab-chat-direct");
  const dmContainer = document.getElementById("dm-select-container");
  const muralScopeContainer = document.getElementById("mural-scope-container");
  const selectUser = document.getElementById("chat-target-user");

  tabGeneral.addEventListener("click", () => {
    chatMode = "general";
    targetUserId = null;
    tabGeneral.className = "py-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400 font-bold transition";
    tabDirect.className = "py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition";
    dmContainer.classList.add("hidden");
    muralScopeContainer.classList.remove("hidden");
    loadMessages();
  });

  tabDirect.addEventListener("click", () => {
    chatMode = "direct";
    tabDirect.className = "py-1.5 rounded-lg bg-white dark:bg-slate-800 shadow-sm text-blue-600 dark:text-blue-400 font-bold transition";
    tabGeneral.className = "py-1.5 rounded-lg text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition";
    dmContainer.classList.remove("hidden");
    muralScopeContainer.classList.add("hidden");
    targetUserId = selectUser.value || null;
    loadMessages();
  });

  selectUser.addEventListener("change", (e) => {
    targetUserId = e.target.value || null;
    loadMessages();
  });

  // 7. Enviar Mensagem (texto e/ou arquivo anexado)
  document.getElementById("chat-form").addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("chat-input");
    const conteudo = input.value.trim();
    if (!conteudo && !arquivoAnexado) return;

    if (chatMode === "direct" && !targetUserId) {
      showToast("Selecione um colega para enviar a mensagem privada.");
      return;
    }

    // No mural, lê o escopo escolhido (Geral / Diretoria / Coordenação / Setor)
    let escopoTipo = "geral", escopoValor = null;
    if (chatMode === "general") {
      const valorSelect = document.getElementById("mural-scope").value;
      if (valorSelect && valorSelect !== "geral") {
        const separador = valorSelect.indexOf(":");
        escopoTipo = valorSelect.slice(0, separador);
        escopoValor = valorSelect.slice(separador + 1);
      }
    }

    // Anexar = compartilhar de verdade: numa DM, libera só pro destinatário; no mural
    // "Geral" o arquivo vira público; num mural com escopo, libera pra quem está dentro
    // daquela diretoria/coordenação/setor — igual ao botão "Compartilhar", só que em lote.
    if (arquivoAnexado) {
      try {
        if (chatMode === "direct") {
          await compartilharArquivoComUsuario(arquivoAnexado.id, targetUserId);
        } else if (escopoTipo === "geral") {
          await supabaseClient.from("storage_arquivos").update({ is_public: true }).eq("id", arquivoAnexado.id);
        } else {
          await compartilharComEscopo(arquivoAnexado.id, escopoValor);
        }
      } catch (err) {
        showToast("Erro ao compartilhar o arquivo anexado.");
        return;
      }
    }

    input.value = "";
    const anexoEnviado = arquivoAnexado;
    removerAnexo();

    await supabaseClient.from("storage_mensagens").insert([{
      remetente_id: currentUser.id,
      remetente_nome: getDisplayName(currentProfile),
      destinatario_id: chatMode === "direct" ? targetUserId : null,
      conteudo: conteudo || null,
      arquivo_id: anexoEnviado ? anexoEnviado.id : null,
      escopo_tipo: chatMode === "direct" ? "geral" : escopoTipo,
      escopo_valor: chatMode === "direct" ? null : escopoValor
    }]);
  });

  // Compartilha um arquivo com todo mundo cuja coordenação bate com o prefixo do escopo
  async function compartilharComEscopo(arquivoId, escopoValor) {
    const { data: pessoas } = await supabaseClient
      .from("profiles")
      .select("id")
      .like("coordenacao", `${escopoValor}%`)
      .neq("id", currentUser.id);

    for (const pessoa of (pessoas || [])) {
      await compartilharArquivoComUsuario(arquivoId, pessoa.id);
    }
  }

  // 8. Anexo de arquivo do Drive na mensagem
  document.getElementById("btn-abrir-anexo").addEventListener("click", toggleAnexoPicker);
  document.getElementById("btn-remover-anexo").addEventListener("click", removerAnexo);
  document.getElementById("btn-anexo-upload-novo").addEventListener("click", () => {
    document.getElementById("anexo-upload-input").click();
  });
  document.getElementById("anexo-upload-input").addEventListener("change", (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (file) enviarArquivoNovoNoChat(file);
  });
}

async function toggleAnexoPicker() {
  const painel = document.getElementById("anexo-picker");
  const abrindo = painel.classList.contains("hidden");
  painel.classList.toggle("hidden");
  if (!abrindo) return;

  const lista = document.getElementById("anexo-picker-lista");
  lista.innerHTML = `<p class="text-xs text-slate-400 italic px-2 py-2">Carregando seus arquivos...</p>`;

  const { data } = await supabaseClient
    .from("storage_arquivos")
    .select("id, nome, tamanho_bytes, storage_key, mime_type")
    .eq("user_id", currentUser.id)
    .is("excluido_em", null)
    .order("created_at", { ascending: false })
    .limit(50);

  meusArquivosParaAnexo = data || [];

  if (meusArquivosParaAnexo.length === 0) {
    lista.innerHTML = `<p class="text-xs text-slate-400 italic px-2 py-2">Você ainda não tem arquivos no Drive.</p>`;
    return;
  }

  lista.innerHTML = meusArquivosParaAnexo.map(f => `
    <button type="button" onclick="selecionarAnexo('${f.id}')" class="flex items-center justify-between gap-2 px-2.5 py-2 rounded-lg hover:bg-white dark:hover:bg-slate-800 text-left transition">
      <span class="flex items-center gap-2 min-w-0">
        <span class="text-base shrink-0">📄</span>
        <span class="text-xs font-medium text-slate-700 dark:text-slate-200 truncate">${escapeHtml(f.nome)}</span>
      </span>
      <span class="text-[10px] text-slate-400 shrink-0">${(f.tamanho_bytes / (1024 * 1024)).toFixed(1)} MB</span>
    </button>
  `).join("");
}

function selecionarAnexo(id) {
  const arquivo = meusArquivosParaAnexo.find(f => f.id === id);
  if (!arquivo) return;
  selecionarAnexoObjeto(arquivo);
}

function removerAnexo() {
  arquivoAnexado = null;
  document.getElementById("anexo-chip").classList.add("hidden");
  document.getElementById("anexo-chip").classList.remove("flex");
}

// Compartilha com uma pessoa específica (mesmo efeito do botão "Compartilhar" da tabela),
// sem duplicar se já estava compartilhado.
async function compartilharArquivoComUsuario(arquivoId, userId) {
  const { data: existente } = await supabaseClient
    .from("storage_compartilhamentos")
    .select("id")
    .eq("arquivo_id", arquivoId)
    .eq("compartilhado_com", userId)
    .maybeSingle();

  if (!existente) {
    await supabaseClient.from("storage_compartilhamentos").insert([{ arquivo_id: arquivoId, compartilhado_com: userId }]);
  }
}

// ========================================================
// MURAL COM ESCOPO (Geral / Diretoria / Coordenação / Setor)
// ========================================================
function montarSeletorDeEscopoMural() {
  const select = document.getElementById("mural-scope");
  if (!select || !currentProfile) return;

  const partes = (currentProfile.coordenacao || "").split("/").filter(Boolean);
  const [dir, coord, setor] = partes;

  const opcoes = [{ value: "geral", label: "🌐 Geral (todo o Cockpit)" }];
  if (dir) opcoes.push({ value: `diretoria:${dir}`, label: `🏢 Diretoria: ${dir}` });
  if (dir && coord) opcoes.push({ value: `coordenacao:${dir}/${coord}`, label: `🏬 Coordenação: ${dir}/${coord}` });
  if (dir && coord && setor) opcoes.push({ value: `setor:${dir}/${coord}/${setor}`, label: `👥 Setor: ${dir}/${coord}/${setor}` });

  select.innerHTML = opcoes.map(o => `<option value="${o.value}">${escapeHtml(o.label)}</option>`).join("");
}

function rotuloEscopo(tipo, valor) {
  if (tipo === "diretoria") return `🏢 Diretoria: ${valor}`;
  if (tipo === "coordenacao") return `🏬 Coordenação: ${valor}`;
  if (tipo === "setor") return `👥 Setor: ${valor}`;
  return null;
}

// ========================================================
// ANEXO NO CHAT: enviar arquivo novo (até 10MB), direto pra pasta "Chat"
// ========================================================
async function garantirPastaChat() {
  const { data: existente } = await supabaseClient
    .from("storage_pastas")
    .select("id")
    .eq("user_id", currentUser.id)
    .eq("caminho_pai", "/")
    .eq("nome", "Chat")
    .is("excluido_em", null)
    .maybeSingle();

  if (!existente) {
    await supabaseClient.from("storage_pastas").insert([{
      user_id: currentUser.id,
      autor_nome: getDisplayName(currentProfile),
      nome: "Chat",
      caminho_pai: "/"
    }]);
  }
}

async function enviarArquivoNovoNoChat(file) {
  const LIMITE_CHAT_BYTES = 10 * 1024 * 1024;
  if (file.size > LIMITE_CHAT_BYTES) {
    showToast('Arquivos enviados direto pelo chat devem ter até 10MB. Use o botão "+" do Drive para arquivos maiores.');
    return;
  }

  const lista = document.getElementById("anexo-picker-lista");
  const avisoAnterior = lista.innerHTML;
  lista.innerHTML = `<p class="text-xs text-blue-500 italic px-2 py-2">Enviando "${escapeHtml(file.name)}"...</p>`;

  try {
    await garantirPastaChat();

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storageKey = `users/${currentUser.id}/${Date.now()}_${safeName}`;
    await uploadToWorker(file, storageKey, () => {});

    const { data: novoArquivo, error } = await supabaseClient.from("storage_arquivos").insert([{
      user_id: currentUser.id,
      autor_nome: getDisplayName(currentProfile),
      nome: file.name,
      storage_key: storageKey,
      tamanho_bytes: file.size,
      mime_type: file.type || "application/octet-stream",
      caminho: "/Chat/"
    }]).select().single();

    if (error) throw error;

    selecionarAnexoObjeto(novoArquivo);
    await loadUserProfile();
  } catch (err) {
    showToast("Erro ao enviar arquivo: " + err.message);
    lista.innerHTML = avisoAnterior;
  }
}

function selecionarAnexoObjeto(arquivo) {
  arquivoAnexado = arquivo;
  document.getElementById("anexo-picker").classList.add("hidden");
  document.getElementById("anexo-chip-nome").textContent = arquivo.nome;
  document.getElementById("anexo-chip").classList.remove("hidden");
  document.getElementById("anexo-chip").classList.add("flex");
  document.getElementById("chat-input").focus();
}

// ========================================================
// COPIAR ARQUIVO PARTILHADO PARA O MEU PRÓPRIO DRIVE
// (cópia de verdade no R2 — sobrevive se o dono original excluir o dele)
// ========================================================
async function copiarParaMeuDrive(storageKeyOrigem, nomeOriginal, mimeType) {
  try {
    const token = await getAuthToken();
    if (!token) return showToast("Sessão expirada. Faça login novamente.");

    const safeName = nomeOriginal.replace(/[^a-zA-Z0-9.-]/g, "_");
    const novaKey = `users/${currentUser.id}/${Date.now()}_${safeName}`;

    const res = await fetch(`${WORKER_URL}/${novaKey}`, {
      method: "POST",
      headers: { "Authorization": `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ origem: storageKeyOrigem })
    });
    const resultado = await res.json();
    if (!res.ok) throw new Error(resultado.error || "Falha ao copiar");

    await supabaseClient.from("storage_arquivos").insert([{
      user_id: currentUser.id,
      autor_nome: getDisplayName(currentProfile),
      nome: nomeOriginal,
      storage_key: novaKey,
      tamanho_bytes: resultado.tamanho,
      mime_type: mimeType || "application/octet-stream",
      caminho: "/"
    }]);

    showToast(`"${nomeOriginal}" copiado para o seu Drive.`);
    await loadUserProfile();
    if (activeTab === "shared") await loadSharedContent(); else await loadStorageContent();
  } catch (err) {
    showToast("Erro ao copiar: " + err.message);
  }
}

// ========================================================
// NOTIFICAÇÕES (badge do menu lateral + sino global do Cockpit)
// ========================================================
function chaveVistoEm(tipo) {
  return `cockpit_drive_${tipo}_visto_em_${currentUser.id}`;
}

async function atualizarNotificacoes() {
  if (!currentUser || !currentProfile) return;

  const vistoMsgs = localStorage.getItem(chaveVistoEm("msgs")) || "1970-01-01T00:00:00Z";
  const vistoShares = localStorage.getItem(chaveVistoEm("shares")) || "1970-01-01T00:00:00Z";

  const { count: naoLidas } = await supabaseClient
    .from("storage_mensagens")
    .select("id", { count: "exact", head: true })
    .eq("destinatario_id", currentUser.id)
    .neq("remetente_id", currentUser.id)
    .gt("created_at", vistoMsgs);

  const { count: novosCompartilhamentos } = await supabaseClient
    .from("storage_compartilhamentos")
    .select("id", { count: "exact", head: true })
    .eq("compartilhado_com", currentUser.id)
    .gt("created_at", vistoShares);

  const usado = currentProfile.storage_used_bytes || 0;
  const cota = currentProfile.storage_quota_bytes || 524288000;
  const cotaBaixa = cota > 0 && (usado / cota) >= 0.9;

  const total = (naoLidas || 0) + (novosCompartilhamentos || 0) + (cotaBaixa ? 1 : 0);

  window.parent.postMessage({ type: "UPDATE_NOTIFICATIONS", appName: "drive", count: total }, "*");
}

function marcarMensagensComoVistas() {
  localStorage.setItem(chaveVistoEm("msgs"), new Date().toISOString());
  atualizarNotificacoes();
}

function marcarCompartilhamentosComoVistos() {
  localStorage.setItem(chaveVistoEm("shares"), new Date().toISOString());
  atualizarNotificacoes();
}

function closeFolderModal() {
  document.getElementById("folder-modal").style.display = "none";
}

// Pastas e Arquivos
async function loadStorageContent() {
  renderBreadcrumbs();

  const { data: pastas } = await supabaseClient
    .from("storage_pastas")
    .select("*")
    .eq("caminho_pai", currentPath)
    .is("excluido_em", null)
    .order("nome", { ascending: true });

  foldersData = pastas || [];

  const { data: arquivos } = await supabaseClient
    .from("storage_arquivos")
    .select("*, storage_compartilhamentos(compartilhado_com)")
    .eq("caminho", currentPath)
    .is("excluido_em", null)
    .order("created_at", { ascending: false });

  filesData = arquivos || [];
  renderContent();
}

// Aba "Partilhados": arquivos de outras pessoas visíveis pra mim (compartilhado ou público).
// Não filtra por pasta — a RLS de storage_pastas restringe cada um às próprias pastas, então
// um arquivo compartilhado normalmente mora numa pasta que eu nem enxergo; por isso a busca
// aqui é achatada (todas as pastas), e não pelo caminho atual.
async function loadSharedContent() {
  foldersData = [];

  const { data: arquivos } = await supabaseClient
    .from("storage_arquivos")
    .select("*, storage_compartilhamentos(compartilhado_com)")
    .neq("user_id", currentUser.id)
    .is("excluido_em", null)
    .order("created_at", { ascending: false });

  filesData = arquivos || [];
  renderContent();
}

// Lixeira: só os meus próprios itens excluídos (RLS já restringe pastas ao dono；
// para arquivos, reforça aqui pois a RLS também libera itens compartilhados comigo).
async function loadLixeira() {
  const { data: pastas } = await supabaseClient
    .from("storage_pastas")
    .select("*")
    .eq("user_id", currentUser.id)
    .not("excluido_em", "is", null)
    .order("excluido_em", { ascending: false });

  foldersData = pastas || [];

  const { data: arquivos } = await supabaseClient
    .from("storage_arquivos")
    .select("*")
    .eq("user_id", currentUser.id)
    .not("excluido_em", "is", null)
    .order("excluido_em", { ascending: false });

  filesData = arquivos || [];
  renderContent();
}

function renderBreadcrumbs() {
  const container = document.getElementById("breadcrumbs");
  const partes = currentPath.split("/").filter(Boolean);

  let html = `<button onclick="navigateTo('/')" class="hover:text-blue-500 font-medium">Início</button>`;
  let pathAcumulado = "/";

  partes.forEach(parte => {
    pathAcumulado += parte + "/";
    const dest = pathAcumulado;
    html += ` <span class="text-slate-400">/</span> <button onclick="navigateTo('${dest}')" class="hover:text-blue-500 font-medium">${parte}</button>`;
  });

  container.innerHTML = html;
}

function navigateTo(novoCaminho) {
  currentPath = novoCaminho;
  loadStorageContent();
}

function renderContent() {
  const tbody = document.getElementById("files-tbody");
  const query = document.getElementById("search-input").value.toLowerCase();
  const ehLixeira = activeTab === "lixeira";

  let fPastas = foldersData.filter(f => f.nome.toLowerCase().includes(query));
  let fArquivos = filesData.filter(f => f.nome.toLowerCase().includes(query));

  // "shared" e "lixeira" já vêm filtrados certinhos do loader (loadSharedContent/loadLixeira).
  // "mine" ainda filtra por dono em cima do que já está escopado no caminho atual.
  if (activeTab === "mine") {
    fPastas = fPastas.filter(f => f.user_id === currentUser.id);
    fArquivos = fArquivos.filter(f => f.user_id === currentUser.id);
  }

  if (fPastas.length === 0 && fArquivos.length === 0) {
    const msg = ehLixeira ? "A lixeira está vazia." : activeTab === "shared" ? "Nada foi compartilhado com você ainda." : "Esta pasta está vazia.";
    tbody.innerHTML = `<tr><td colspan="5" class="py-12 text-center text-slate-400">${msg}</td></tr>`;
    return;
  }

  const foldersRows = fPastas.map(pasta => {
    const isOwner = pasta.user_id === currentUser.id;
    const targetPath = `${currentPath}${pasta.nome}/`;
    const nomeSeguro = escapeHtml(pasta.nome);
    const dataRef = ehLixeira ? pasta.excluido_em : pasta.created_at;

    const acoes = ehLixeira
      ? `<button onclick="restaurarPasta('${pasta.id}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-emerald-600" title="Restaurar">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H9M3 10l4-4M3 10l4 4"/></svg>
         </button>
         <button onclick="excluirPastaDefinitivo('${pasta.id}', '${pasta.nome}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-rose-500" title="Excluir definitivamente">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
         </button>`
      : (isOwner ? `<button onclick="deleteFolder('${pasta.id}', '${escapeHtml(pasta.nome).replace(/'/g, "\\'")}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-rose-500" title="Mover para a lixeira">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
         </button>` : '');

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition ${ehLixeira ? '' : 'cursor-pointer'}" ${ehLixeira ? '' : `onclick="navigateTo('${targetPath}')"`}>
        <td class="py-3 px-4 flex items-center gap-3 font-semibold text-slate-700 dark:text-slate-200">
          <span class="text-xl">📁</span>
          <span>${nomeSeguro}</span>
        </td>
        <td class="py-3 px-4 text-slate-400 text-xs">Pasta</td>
        <td class="py-3 px-4 text-slate-500 text-xs">${escapeHtml(pasta.autor_nome || "—")}</td>
        <td class="py-3 px-4 text-slate-500 text-xs">${new Date(dataRef).toLocaleDateString('pt-BR')}</td>
        <td class="py-3 px-4 text-right" onclick="event.stopPropagation()">${acoes}</td>
      </tr>
    `;
  }).join("");

  const filesRows = fArquivos.map(file => {
    const isOwner = file.user_id === currentUser.id;
    const formattedSize = (file.tamanho_bytes / (1024 * 1024)).toFixed(2) + " MB";
    const dataRef = ehLixeira ? file.excluido_em : file.created_at;
    const date = new Date(dataRef).toLocaleDateString('pt-BR');
    const nomeSeguro = escapeHtml(file.nome);
    const nomeJs = file.nome.replace(/'/g, "\\'");

    const acoes = ehLixeira
      ? `<button onclick="restaurarArquivo('${file.id}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-emerald-600" title="Restaurar">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 10h10a5 5 0 015 5v0a5 5 0 01-5 5H9M3 10l4-4M3 10l4 4"/></svg>
         </button>
         <button onclick="excluirArquivoDefinitivo('${file.id}', '${file.storage_key}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-rose-500" title="Excluir definitivamente">
           <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
         </button>`
      : `<button onclick="previewFile('${file.storage_key}', '${nomeJs}', '${file.mime_type || ''}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Visualizar">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
            <button onclick="downloadFile('${file.storage_key}', '${nomeJs}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-blue-600 dark:text-blue-400" title="Baixar">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
            ${isOwner ? `
                <button onclick="openShareModal('${file.id}', '${nomeJs}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300" title="Compartilhar">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"/></svg>
                </button>
                <button onclick="deleteFile('${file.id}', '${file.storage_key}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-rose-500" title="Mover para a lixeira">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"/></svg>
                </button>
            ` : `
                <button onclick="copiarParaMeuDrive('${file.storage_key}', '${nomeJs}', '${file.mime_type || ''}')" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 text-emerald-600" title="Copiar para o meu Drive (fica independente se o dono apagar)">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>
                </button>
            `}`;

    return `
      <tr class="hover:bg-slate-50 dark:hover:bg-slate-700/30 transition" ${ehLixeira ? '' : `ondblclick="previewFile('${file.storage_key}', '${nomeJs}', '${file.mime_type || ''}')"`}>
        <td class="py-3 px-4 flex items-center gap-3">
          <span class="text-xl">📄</span>
          <span class="font-medium truncate max-w-xs md:max-w-md">${nomeSeguro}</span>
        </td>
        <td class="py-3 px-4 text-slate-500">${formattedSize}</td>
        <td class="py-3 px-4 text-slate-500">${escapeHtml(file.autor_nome || "—")}</td>
        <td class="py-3 px-4 text-slate-500">${date}</td>
        <td class="py-3 px-4 text-right">
            <div class="flex items-center justify-end gap-1 sm:gap-2">${acoes}</div>
        </td>
      </tr>
    `;
  }).join("");

  tbody.innerHTML = foldersRows + filesRows;
}

// Upload
async function handleFilesUpload(filesList) {
  const files = Array.from(filesList);
  const queueSection = document.getElementById("upload-queue");
  const queueItems = document.getElementById("queue-items");
  queueSection.classList.remove("hidden");

  for (const file of files) {
    const used = currentProfile?.storage_used_bytes || 0;
    const quota = currentProfile?.storage_quota_bytes || 524288000;
    if (used + file.size > quota) {
      showToast(`Espaço insuficiente para "${file.name}"!`);
      continue;
    }

    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, "_");
    const storageKey = `users/${currentUser.id}/${Date.now()}_${safeName}`;

    const itemEl = document.createElement("div");
    itemEl.className = "flex flex-col gap-1 text-xs border-b border-slate-100 dark:border-slate-700/50 pb-2";
    itemEl.innerHTML = `
      <div class="flex justify-between font-medium">
        <span class="truncate max-w-[200px]">${file.name}</span>
        <span class="pct-label">0%</span>
      </div>
      <div class="w-full bg-slate-200 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
        <div class="bar-progress bg-blue-600 h-full w-0 transition-all"></div>
      </div>
    `;
    queueItems.appendChild(itemEl);

    try {
      await uploadToWorker(file, storageKey, (pct) => {
        itemEl.querySelector(".pct-label").textContent = `${pct}%`;
        itemEl.querySelector(".bar-progress").style.width = `${pct}%`;
      });

      await supabaseClient.from("storage_arquivos").insert([{
        user_id: currentUser.id,
        autor_nome: getDisplayName(currentProfile),
        nome: file.name,
        storage_key: storageKey,
        tamanho_bytes: file.size,
        mime_type: file.type || "application/octet-stream",
        caminho: currentPath
      }]);

      showToast(`"${file.name}" enviado com sucesso!`);
      itemEl.remove();
    } catch (err) {
      itemEl.querySelector(".pct-label").textContent = "Erro!";
      showToast(`Falha ao enviar ${file.name}`);
    }
  }

  if (queueItems.children.length === 0) queueSection.classList.add("hidden");
  await loadUserProfile();
  await loadStorageContent();
}

async function getAuthToken() {
  const { data: { session } } = await supabaseClient.auth.getSession();
  return session ? session.access_token : null;
}

function uploadToWorker(file, key, onProgress) {
  return new Promise(async (resolve, reject) => {
    const token = await getAuthToken();
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", `${WORKER_URL}/${key}`, true);
    xhr.setRequestHeader("Content-Type", file.type || "application/octet-stream");
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300) ? resolve() : reject(new Error("Falha no upload"));
    xhr.onerror = () => reject(new Error("Erro de rede R2"));
    xhr.send(file);
  });
}

// Mover para a lixeira (não toca no R2 — só marca excluido_em; some do uso mas não da cota
// até ser esvaziada de verdade, já que o arquivo continua ocupando espaço no R2).
async function deleteFile(id, storageKey) {
  if (!confirm("Mover este arquivo para a lixeira?")) return;
  const { error } = await supabaseClient.from("storage_arquivos").update({ excluido_em: new Date().toISOString() }).eq("id", id);
  if (error) { showToast("Erro ao mover para a lixeira."); return; }
  showToast("Arquivo movido para a lixeira.");
  await loadStorageContent();
}

// Move a pasta E tudo que está dentro dela (recursivamente, por prefixo de caminho)
async function deleteFolder(folderId, folderName) {
  if (!confirm(`Mover a pasta "${folderName}" (e tudo dentro dela) para a lixeira?`)) return;

  const prefixo = `${currentPath}${folderName}/`;
  const agora = new Date().toISOString();

  await supabaseClient.from("storage_pastas").update({ excluido_em: agora }).eq("id", folderId);
  await supabaseClient.from("storage_pastas").update({ excluido_em: agora }).like("caminho_pai", `${prefixo}%`);
  await supabaseClient.from("storage_arquivos").update({ excluido_em: agora }).eq("caminho", prefixo);
  await supabaseClient.from("storage_arquivos").update({ excluido_em: agora }).like("caminho", `${prefixo}%`);

  showToast("Pasta movida para a lixeira.");
  await loadStorageContent();
}

async function restaurarArquivo(id) {
  await supabaseClient.from("storage_arquivos").update({ excluido_em: null }).eq("id", id);
  showToast("Arquivo restaurado.");
  await loadLixeira();
}

// Restaura a pasta e tudo que foi excluído junto com ela (mesmo prefixo de caminho)
async function restaurarPasta(folderId) {
  const pasta = foldersData.find(f => f.id === folderId);
  if (!pasta) return;

  const prefixo = `${pasta.caminho_pai}${pasta.nome}/`;

  await supabaseClient.from("storage_pastas").update({ excluido_em: null }).eq("id", folderId);
  await supabaseClient.from("storage_pastas").update({ excluido_em: null }).like("caminho_pai", `${prefixo}%`);
  await supabaseClient.from("storage_arquivos").update({ excluido_em: null }).eq("caminho", prefixo);
  await supabaseClient.from("storage_arquivos").update({ excluido_em: null }).like("caminho", `${prefixo}%`);

  showToast("Pasta restaurada.");
  await loadLixeira();
}

// Exclusão de verdade: some do R2 e do banco. Só chamado de dentro da lixeira.
async function excluirArquivoDefinitivo(id, storageKey) {
  if (!confirm("Excluir este arquivo definitivamente? Essa ação não pode ser desfeita.")) return;
  try {
    const token = await getAuthToken();
    await fetch(`${WORKER_URL}/${storageKey}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
    await supabaseClient.from("storage_arquivos").delete().eq("id", id);
    showToast("Arquivo excluído definitivamente.");
    await loadUserProfile();
    await loadLixeira();
  } catch (err) {
    showToast("Erro ao excluir arquivo.");
  }
}

async function excluirPastaDefinitivo(folderId, folderName) {
  if (!confirm(`Excluir a pasta "${folderName}" e tudo dentro dela definitivamente? Essa ação não pode ser desfeita.`)) return;

  const pasta = foldersData.find(f => f.id === folderId);
  if (!pasta) { showToast("Não foi possível localizar a pasta."); return; }

  const prefixo = `${pasta.caminho_pai}${pasta.nome}/`;
  const { data: arquivosDaPasta } = await supabaseClient
    .from("storage_arquivos")
    .select("id, storage_key")
    .eq("user_id", currentUser.id)
    .not("excluido_em", "is", null)
    .or(`caminho.eq.${prefixo},caminho.like.${prefixo}%`);

  await excluirArquivosDoR2(arquivosDaPasta || []);

  await supabaseClient.from("storage_pastas").delete().eq("id", folderId);
  await supabaseClient.from("storage_pastas").delete().like("caminho_pai", `${prefixo}%`);

  showToast("Pasta excluída definitivamente.");
  await loadUserProfile();
  await loadLixeira();
}

// Esvazia toda a lixeira do usuário de uma vez (arquivos + pastas)
async function esvaziarLixeira() {
  if (!confirm("Excluir definitivamente TUDO que está na lixeira? Essa ação não pode ser desfeita.")) return;

  const { data: arquivos } = await supabaseClient
    .from("storage_arquivos")
    .select("id, storage_key")
    .eq("user_id", currentUser.id)
    .not("excluido_em", "is", null);

  await excluirArquivosDoR2(arquivos || []);

  await supabaseClient.from("storage_arquivos").delete().eq("user_id", currentUser.id).not("excluido_em", "is", null);
  await supabaseClient.from("storage_pastas").delete().eq("user_id", currentUser.id).not("excluido_em", "is", null);

  showToast("Lixeira esvaziada.");
  await loadUserProfile();
  await loadLixeira();
}

// Helper: remove uma lista de arquivos do R2 via Worker (usado pela exclusão definitiva)
async function excluirArquivosDoR2(lista) {
  const token = await getAuthToken();
  for (const arquivo of lista) {
    try {
      await fetch(`${WORKER_URL}/${arquivo.storage_key}`, { method: "DELETE", headers: { "Authorization": `Bearer ${token}` } });
    } catch (err) {
      console.error("Erro ao excluir do R2:", arquivo.storage_key, err);
    }
  }
}

// Mensagens
async function loadMessages() {
  const container = document.getElementById("messages-container");

  if (chatMode === "direct" && !targetUserId) {
    container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Selecione um colega acima para iniciar a conversa privada.</p>`;
    return;
  }

  let query = supabaseClient.from("storage_mensagens").select("*, storage_arquivos(nome, storage_key, mime_type, tamanho_bytes)");

  if (chatMode === "general") {
    query = query.is("destinatario_id", null);
  } else {
    query = query.or(`and(remetente_id.eq.${currentUser.id},destinatario_id.eq.${targetUserId}),and(remetente_id.eq.${targetUserId},destinatario_id.eq.${currentUser.id})`);
  }

  const { data } = await query.order("created_at", { ascending: true }).limit(50);
  renderMessages(data || []);
}

function renderMessages(msgs) {
  const container = document.getElementById("messages-container");
  if (msgs.length === 0) {
    container.innerHTML = `<p class="text-center text-xs text-slate-400 py-8">Nenhuma mensagem aqui ainda.</p>`;
    return;
  }

  container.innerHTML = msgs.map(m => {
    const isMe = m.remetente_id === currentUser.id;
    const arquivo = m.storage_arquivos; // null se a RLS bloquear (arquivo não compartilhado com quem vê)

    let blocoAnexo = "";
    if (m.arquivo_id) {
      if (arquivo) {
        const nomeJs = arquivo.nome.replace(/'/g, "\\'");
        const tamanho = (arquivo.tamanho_bytes / (1024 * 1024)).toFixed(2) + " MB";
        blocoAnexo = `
          <div class="mt-1.5 p-2.5 rounded-xl border ${isMe ? 'border-blue-400/40 bg-blue-500/20' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-800'} flex items-center gap-2">
            <span class="text-lg shrink-0">📄</span>
            <span class="min-w-0 flex-1">
              <span class="block text-[11px] font-bold truncate ${isMe ? 'text-white' : 'text-slate-700 dark:text-slate-200'}">${escapeHtml(arquivo.nome)}</span>
              <span class="block text-[10px] ${isMe ? 'text-blue-100' : 'text-slate-400'}">${tamanho}</span>
            </span>
            <button type="button" onclick="previewFile('${arquivo.storage_key}', '${nomeJs}', '${arquivo.mime_type || ''}')" class="p-1 rounded-md ${isMe ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}" title="Visualizar">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"/></svg>
            </button>
            <button type="button" onclick="downloadFile('${arquivo.storage_key}', '${nomeJs}')" class="p-1 rounded-md ${isMe ? 'hover:bg-white/20 text-white' : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300'}" title="Baixar">
              <svg class="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4"/></svg>
            </button>
          </div>`;
      } else {
        blocoAnexo = `<div class="mt-1.5 p-2 rounded-xl border border-dashed ${isMe ? 'border-blue-300/50 text-blue-100' : 'border-slate-300 text-slate-400'} text-[10px] italic">Arquivo não disponível.</div>`;
      }
    }

    const rotulo = (!m.destinatario_id && m.escopo_tipo !== "geral") ? rotuloEscopo(m.escopo_tipo, m.escopo_valor) : null;

    return `
      <div class="flex flex-col ${isMe ? 'items-end' : 'items-start'}">
        <span class="text-[10px] text-slate-400 mb-0.5 flex items-center gap-1.5">
          ${escapeHtml(m.remetente_nome)}
          ${rotulo ? `<span class="px-1.5 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 text-[9px] font-bold">${escapeHtml(rotulo)}</span>` : ''}
        </span>
        <div class="px-3 py-2 rounded-2xl text-xs max-w-[85%] whitespace-pre-wrap break-words ${isMe ? 'bg-blue-600 text-white rounded-tr-none' : 'bg-slate-100 dark:bg-slate-700 text-slate-800 dark:text-slate-100 rounded-tl-none'}">
          ${m.conteudo ? escapeHtml(m.conteudo) : ''}
          ${blocoAnexo}
        </div>
      </div>
    `;
  }).join("");
  container.scrollTop = container.scrollHeight;
}

let mensagensChannel = null;

function setupRealtime() {
  // Se já existe um canal (ex.: setupRealtime rodou de novo sem a página recarregar
  // de verdade), derruba o anterior antes de criar outro — evita o erro "cannot add
  // postgres_changes callbacks ... after subscribe()".
  if (mensagensChannel) {
    supabaseClient.removeChannel(mensagensChannel);
    mensagensChannel = null;
  }

  mensagensChannel = supabaseClient
    .channel("storage_mensagens_realtime")
    .on("postgres_changes", { event: "INSERT", schema: "public", table: "storage_mensagens" }, payload => {
      const msg = payload.new;
      if (chatMode === "general" && !msg.destinatario_id) {
        loadMessages();
      } else if (
        chatMode === "direct" && targetUserId && (
          (msg.remetente_id === targetUserId && msg.destinatario_id === currentUser.id) ||
          (msg.remetente_id === currentUser.id && msg.destinatario_id === targetUserId)
        )
      ) {
        loadMessages();
      }

      // Recalcula o badge de notificações se chegou uma DM nova pra mim (mesmo com o
      // painel de chat fechado ou numa conversa diferente)
      if (msg.destinatario_id === currentUser.id && msg.remetente_id !== currentUser.id) {
        atualizarNotificacoes();
      }
    })
    .subscribe();
}

// Compartilhamento
async function openShareModal(fileId, fileName) {
  currentShareFileId = fileId;
  document.getElementById("share-file-name").textContent = `Arquivo: ${fileName}`;
  
  const { data: shares } = await supabaseClient.from("storage_compartilhamentos").select("compartilhado_com").eq("arquivo_id", fileId);
  const sharedIds = new Set(shares?.map(s => s.compartilhado_com) || []);

  const listEl = document.getElementById("users-share-list");
  if (teamProfiles.length === 0) {
    listEl.innerHTML = `<p class="text-xs text-slate-400 text-center py-4">Nenhum colega encontrado para partilhar.</p>`;
  } else {
    listEl.innerHTML = teamProfiles.map(p => `
      <label class="flex items-center justify-between p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700/50 cursor-pointer">
        <span class="text-xs font-medium">${escapeHtml(getDisplayName(p))}</span>
        <input type="checkbox" onchange="toggleShare('${p.id}', this.checked)" ${sharedIds.has(p.id) ? 'checked' : ''} class="w-4 h-4 rounded text-blue-600">
      </label>
    `).join("");
  }

  document.getElementById("share-modal").style.display = "block";
}

function closeShareModal() {
  document.getElementById("share-modal").style.display = "none";
  loadStorageContent();
}

async function toggleShare(targetId, shouldShare) {
  if (shouldShare) {
    await supabaseClient.from("storage_compartilhamentos").insert([{
      arquivo_id: currentShareFileId,
      compartilhado_com: targetId
    }]);
  } else {
    await supabaseClient.from("storage_compartilhamentos").delete()
      .eq("arquivo_id", currentShareFileId)
      .eq("compartilhado_com", targetId);
  }
}

function showToast(msg) {
  const toast = document.getElementById("toast");
  toast.textContent = msg;
  toast.className = "show";
  setTimeout(() => toast.className = toast.className.replace("show", ""), 3000);
}

let currentPreviewBlobUrl = null;

async function previewFile(storageKey, fileName, mimeType) {
  const modal = document.getElementById("preview-modal");
  const title = document.getElementById("preview-title");
  const icon = document.getElementById("preview-icon");
  const body = document.getElementById("preview-body");
  const btnDownload = document.getElementById("preview-btn-download");

  title.textContent = fileName;
  btnDownload.onclick = () => downloadFile(storageKey, fileName);
  body.innerHTML = `<div class="flex flex-col items-center gap-2 text-slate-400 text-sm"><span class="animate-spin text-2xl">⏳</span> Carregando visualização...</div>`;
  modal.style.display = "block";

  const ext = fileName.split(".").pop().toLowerCase();

  try {
    const token = await getAuthToken();
    if (!token) throw new Error("Sessão expirada. Faça login novamente.");

    // URL autenticada de streaming direto
    const streamUrl = `${WORKER_URL}/${storageKey}?token=${encodeURIComponent(token)}`;

    // 1. VÍDEO (.mp4, .webm, etc.) - Toca na hora por streaming
    if (["mp4", "webm", "ogg", "mov"].includes(ext)) {
      icon.textContent = "🎬";
      body.innerHTML = `
        <video controls autoplay playsinline class="max-h-full max-w-full rounded-lg shadow-2xl bg-black">
          <source src="${streamUrl}" type="video/mp4">
          Seu navegador não suporta a tag de vídeo.
        </video>
      `;
    }
    // 2. ÁUDIO (.mp3, .wav, etc.)
    else if (["mp3", "wav", "aac"].includes(ext)) {
      icon.textContent = "🎵";
      body.innerHTML = `
        <div class="flex flex-col items-center gap-4 bg-white dark:bg-slate-800 p-8 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700">
          <span class="text-5xl">🎧</span>
          <audio controls autoplay class="w-72">
            <source src="${streamUrl}">
          </audio>
        </div>
      `;
    }
    // 3. IMAGENS (.png, .jpg, etc.)
    else if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(ext)) {
      icon.textContent = "🖼️";
      body.innerHTML = `<img src="${streamUrl}" class="max-h-full max-w-full object-contain rounded-lg shadow">`;
    }
    // 4. PDF (Leitor nativo do browser)
    else if (ext === "pdf") {
      icon.textContent = "📕";
      body.innerHTML = `<iframe src="${streamUrl}#toolbar=1" class="w-full h-full rounded-lg border-0 bg-white"></iframe>`;
    }
    // 5. TEXTO PLANO / LINKS (.txt, .json, .csv, .md, .log)
    else if (["txt", "json", "csv", "md", "log", "js", "html", "css", "sql"].includes(ext)) {
      icon.textContent = "📝";
      const res = await fetch(streamUrl);
      const text = await res.text();
      body.innerHTML = `
        <pre class="w-full h-full p-4 bg-white dark:bg-slate-900 text-slate-800 dark:text-slate-100 font-mono text-xs overflow-auto rounded-lg shadow-inner whitespace-pre-wrap select-text border border-slate-200 dark:border-slate-800">${escapeHtml(text)}</pre>
      `;
    }
    // 6. DOCUMENTO WORD (.docx)
    else if (ext === "docx") {
      icon.textContent = "📘";
      const res = await fetch(streamUrl);
      const blob = await res.blob();
      
      body.innerHTML = `
        <div id="docx-wrapper" class="w-full h-full overflow-auto bg-slate-200 dark:bg-slate-950 p-4 flex justify-center">
          <div id="docx-target" class="bg-white text-slate-900 shadow-xl p-8 max-w-3xl w-full min-h-full rounded-lg"></div>
        </div>
      `;
      const target = document.getElementById("docx-target");
      await window.docx.renderAsync(blob, target);
    }
    // 7. APRESENTAÇÕES (.pptx) OU PLANILHAS (.xlsx)
    else {
      icon.textContent = ext === "pptx" ? "📊" : "📦";
      body.innerHTML = `
        <div class="flex flex-col items-center gap-3 text-center p-8 bg-white dark:bg-slate-800 rounded-2xl shadow border border-slate-200 dark:border-slate-700 max-w-md">
          <span class="text-5xl">${ext === "pptx" ? "📊" : "📁"}</span>
          <p class="font-bold text-sm text-slate-800 dark:text-slate-100">${escapeHtml(fileName)}</p>
          <p class="text-xs text-slate-400">Visualização de apresentações e planilhas é otimizada via download para manter a velocidade do Cockpit.</p>
          <button onclick="downloadFile('${storageKey}', '${fileName.replace(/'/g, "\\'")}')" class="mt-2 px-5 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold transition shadow-lg flex items-center gap-2">
            <span>📥</span> Baixar Arquivo
          </button>
        </div>
      `;
    }
  } catch (err) {
    body.innerHTML = `<p class="text-rose-500 text-sm font-semibold p-4 text-center">Erro ao carregar o arquivo: ${err.message}</p>`;
  }
}

// Download Seguro Direto (Usa o gerenciador de downloads nativo do navegador, sem travar a aba)
async function downloadFile(storageKey, fileName) {
  try {
    const token = await getAuthToken();
    if (!token) return showToast("Sessão expirada. Faça login novamente.");

    // dl=1 faz o Worker responder com Content-Disposition: attachment — necessário porque
    // o atributo `download` do <a> é ignorado pelo navegador quando o link é cross-origin
    // (o Worker fica num domínio diferente do Cockpit), então sem isso o arquivo abriria
    // inline na aba em vez de baixar.
    const downloadUrl = `${WORKER_URL}/${storageKey}?token=${encodeURIComponent(token)}&dl=1&nome=${encodeURIComponent(fileName)}`;
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } catch (err) {
    showToast("Erro ao iniciar download");
  }
}

function closePreviewModal() {
  const modal = document.getElementById("preview-modal");
  const body = document.getElementById("preview-body");
  modal.style.display = "none";
  body.innerHTML = "";
  if (currentPreviewBlobUrl) {
    window.URL.revokeObjectURL(currentPreviewBlobUrl);
    currentPreviewBlobUrl = null;
  }
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}