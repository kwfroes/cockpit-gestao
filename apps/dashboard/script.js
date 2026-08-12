// Espera a página inteira carregar
window.onload = function () {

  const supabaseClient = window.supabaseClient;

  const RELATORIOS_BUCKET = 'relatorios-caf';
  const RETENTION_MONTHS = 26; // 25 meses fechados + o mês corrente em andamento

  function applyRoleRestrictions() {
      const role = sessionStorage.getItem("cockpit_user_role");
      
      if (role !== "admin") {
          // IDs de todos os botões/áreas que devem sumir para o User comum
          const elementsToHide = [
              "btnGerenciadorMeses", 
              "btnAddCsv", 
              "btnOpenHolidays",
              "exportJsonButton", 
              "exportPdfButton", 
              "exportPdfButtonDashboard",
              "comparison-section" // Caso você tenha uma div isolada para a comparação de analistas
          ];
          
          elementsToHide.forEach(id => {
              const el = document.getElementById(id);
              if (el) el.style.display = "none";
          });

          // Esconde o contêiner inteiro do Filtro de Analista para que ele nem saiba que existe
          // const filterAnalyst = document.getElementById("filterAnalyst");
          //if (filterAnalyst) {
          //    filterAnalyst.closest('div').style.display = "none";
          //}
      }
  }

  applyRoleRestrictions();
  checkWelcomeModal();
  // --- Funções Nativas de Data (para substituir date-fns) ---

  // --- GESTÃO DE TEMA E CHART.JS ---
  function applyTheme(theme) {
    const isDark = theme === "dark";

    if (isDark) document.documentElement.classList.add("dark");
    else document.documentElement.classList.remove("dark");

    // Configura cores globais do Chart.js
    if (window.Chart) {
      Chart.defaults.color = isDark ? "#cbd5e1" : "#374151"; // Texto (slate-300 vs gray-700)
      Chart.defaults.borderColor = isDark ? "#334155" : "#e5e7eb"; // Grades (slate-700 vs gray-200)
    }
  }

  // Ouve mensagem do Cockpit
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "THEME_CHANGE") {
      applyTheme(event.data.theme);
      // Força re-renderização dos gráficos se houver dados
      if (
        typeof updateDashboard === "function" &&
        typeof allData !== "undefined" &&
        allData.length > 0
      ) {
        updateDashboard();
      }
    }
  });

  // Aplica tema inicial baseado no localStorage ou sistema (sem piscar, pois o head já tratou)
  const initialTheme =
    localStorage.getItem("cockpit_theme") ||
    (window.matchMedia("(prefers-color-scheme: dark)").matches
      ? "dark"
      : "light");
  applyTheme(initialTheme);

  /**
   * Converte uma string de data (dd/MM/yyyy HH:mm:ss ou yyyy-MM-dd) para um objeto Date.
   * @param {string} dateString A string da data.
   * @returns {Date|null} O objeto Date ou nulo se inválido.
   */
  function _native_safeParseDate(dateString) {
    if (!dateString) return null;

    // Tenta formato yyyy-MM-dd (comum de input[type=date])
    if (dateString.includes("-")) {
      const parts = dateString.split("T")[0].split("-");
      if (parts.length === 3) {
        // CORREÇÃO: Cria a data no fuso horário local, não UTC
        // new Date(Date.UTC(...)) causava problemas de fuso
        const dt = new Date(parts[0], parts[1] - 1, parts[2]);
        if (!isNaN(dt.getTime())) return dt;
      }
    }

    // Tenta formato dd/MM/yyyy HH:mm:ss (comum do CSV)
    if (dateString.includes("/")) {
      const dateTimeParts = dateString.split(" ");
      const dateParts = dateTimeParts[0].split("/");

      if (dateParts.length === 3) {
        const timeParts = dateTimeParts[1]
          ? dateTimeParts[1].split(":")
          : [0, 0, 0];
        // Ano, Mês (base 0), Dia, Hora, Min, Seg
        const dt = new Date(
          dateParts[2],
          dateParts[1] - 1,
          dateParts[0],
          timeParts[0] || 0,
          timeParts[1] || 0,
          timeParts[2] || 0,
        );
        if (!isNaN(dt.getTime())) return dt;
      }
    }

    // Última tentativa com o parser nativo
    const nativeDt = new Date(dateString);
    if (!isNaN(nativeDt.getTime())) return nativeDt;

    return null; // Retorna nulo se tudo falhar
  }

  // --- HELPER: Verifica Status do Dia (Reutilizável) ---
  function getDayStatus(dateObj) {
    if (!dateObj) return { isWeekend: false, isFixed: false, isMovable: false };

    const dayOfWeek = dateObj.getDay(); // 0=Dom, 6=Sab
    const dd_mm = _native_formatDate(dateObj, "yyyy-MM-dd").substring(5); // MM-DD
    const yyyy_mm_dd = _native_formatDate(dateObj, "yyyy-MM-dd");

    return {
      isWeekend: dayOfWeek === 0 || dayOfWeek === 6,
      isFixed: FIXED_HOLIDAYS.has(dd_mm),
      isMovable: movableHolidays.has(yyyy_mm_dd),
    };
  }

  /**
   * Calcula o tempo útil em milissegundos entre duas datas,
   * descontando Sábados, Domingos e Feriados (Fixos e Móveis).
   */
  function _calcBusinessTimeDiff(start, end) {
    if (!start || !end) return 0;
    if (end < start) return 0;

    const MS_PER_DAY = 24 * 60 * 60 * 1000;
    let totalDuration = end.getTime() - start.getTime();

    // Normaliza datas para iterar dia a dia (zera horas para verificação)
    let current = new Date(start);
    current.setHours(0, 0, 0, 0);

    const endDateZero = new Date(end);
    endDateZero.setHours(0, 0, 0, 0);

    // Loop dia a dia
    while (current <= endDateZero) {
      const dayOfWeek = current.getDay(); // 0 = Dom, 6 = Sab
      const dd_mm = _native_formatDate(current, "yyyy-MM-dd").substring(5); // Pega MM-DD
      const yyyy_mm_dd = _native_formatDate(current, "yyyy-MM-dd");

      const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
      const isFixedHoliday = FIXED_HOLIDAYS.has(dd_mm);

      // --- INÍCIO DA ALTERAÇÃO SOLICITADA ---

      // 1. Verifica Feriado Manual (Salvo no JSON)
      let isMovableHoliday = movableHolidays.has(yyyy_mm_dd);

      // 2. Verifica Feriado Calculado (Novo)
      // Se ainda não achou, calcula os feriados daquele ano específico
      if (!isMovableHoliday) {
        const calculatedMap = getCalculatedHolidays(current.getFullYear());
        if (calculatedMap.has(yyyy_mm_dd)) {
          isMovableHoliday = true;
        }
      }

      // --- FIM DA ALTERAÇÃO SOLICITADA ---

      // Se for dia não-útil
      if (isWeekend || isFixedHoliday || isMovableHoliday) {
        // Calcula quanto desse dia "ruim" está dentro do intervalo
        const overlapStart = new Date(
          Math.max(start.getTime(), current.getTime()),
        );

        const endOfDay = new Date(current);
        endOfDay.setHours(23, 59, 59, 999);
        const overlapEnd = new Date(
          Math.min(end.getTime(), endOfDay.getTime()),
        );

        if (overlapEnd > overlapStart) {
          const deduction = overlapEnd.getTime() - overlapStart.getTime();
          totalDuration -= deduction;
        }
      }

      // Avança um dia
      current.setDate(current.getDate() + 1);
    }

    return Math.max(0, totalDuration);
  }

  /**
   * Retorna o início do dia para um objeto Date.
   * @param {Date} date O objeto Date.
   * @returns {Date} Um novo objeto Date no início do dia.
   */
  function _native_startOfDay(date) {
    if (!date) return null;
    const d = new Date(date);
    d.setHours(0, 0, 0, 0);
    return d;
  }

  /**
   * Calcula a diferença em dias entre duas datas (ignorando o horário).
   * @param {Date} dateLeft A data mais recente.
   * @param {Date} dateRight A data mais antiga.
   * @returns {number|null} A diferença em dias.
   */
  function _native_differenceInDays(dateLeft, dateRight) {
    if (!dateLeft || !dateRight) return null;
    const msPerDay = 1000 * 60 * 60 * 24;
    // Usa UTC para evitar problemas com fuso horário / horário de verão
    const utc1 = Date.UTC(
      dateLeft.getFullYear(),
      dateLeft.getMonth(),
      dateLeft.getDate(),
    );
    const utc2 = Date.UTC(
      dateRight.getFullYear(),
      dateRight.getMonth(),
      dateRight.getDate(),
    );
    return Math.floor((utc1 - utc2) / msPerDay);
  }

  /**
   * Formata um objeto Date para uma string.
   * @param {Date} date O objeto Date.
   * @param {string} format O formato ('yyyy-MM-dd' ou 'dd/MM/yy').
   * @returns {string} A data formatada.
   */
  function _native_formatDate(date, format) {
    if (!date) return "";
    const yyyy = date.getFullYear();
    const mm = (date.getMonth() + 1).toString().padStart(2, "0");
    const dd = date.getDate().toString().padStart(2, "0");

    if (format === "yyyy-MM-dd") {
      return `${yyyy}-${mm}-${dd}`;
    }
    if (format === "dd/MM/yy") {
      return `${dd}/${mm}/${yyyy.toString().substr(-2)}`;
    }
    return date.toLocaleDateString("pt-BR");
  }

  // --- Fim das Funções Nativas de Data ---

  // Estado global da aplicação
  let allData = [];
  let filteredData = [];
  const chartInstances = {}; // Armazena instâncias de gráficos para destruí-las

  //Reorganiza tabela
  let currentSort = { col: null, direction: "asc" };

  // --- LÓGICA DE FERIADOS E DIAS ÚTEIS ---

  // 1. Feriados Fixos (Dia-Mês) - Salvador/BA/Nacional
  const FIXED_HOLIDAYS = new Map([
    ["01-01", "Confraternização Universal"],
    ["04-21", "Tiradentes"],
    ["05-01", "Dia do Trabalhador"],
    ["06-24", "São João"],
    ["07-02", "Independência da Bahia"],
    ["09-07", "Independência do Brasil"],
    ["10-12", "N. Sra. Aparecida"],
    ["10-28", "Servidor Público"],
    ["11-02", "Finados"],
    ["11-15", "Proclamação da República"],
    ["11-20", "Consciência Negra"],
    ["12-08", "Conceição da Praia"],
    ["12-25", "Natal"],
  ]);

  // 2. Feriados Móveis (Carregados do JSON)
  let movableHolidays = new Map();
  async function loadHolidayJson() {
    try {
      const { data, error } = await supabaseClient
        .from("feriados")
        .select("data, nome");
      if (error) throw error;

      movableHolidays.clear();
      (data || []).forEach((row) => movableHolidays.set(row.data, row.nome));
      console.log(`Carregados ${movableHolidays.size} feriados nomeados.`);
    } catch (e) {
      console.log("Erro ao carregar feriados do Supabase. Usando apenas fixos.", e);
    }
  }
  loadHolidayJson(); // Chama ao iniciar

  // --- 2.1 CALCULAR FERIADOS MÓVEIS (Meeus/Jones/Butcher) ---
  function getCalculatedHolidays(ano) {
    const holidaysMap = new Map();

    // Algoritmo de Páscoa
    const a = ano % 19;
    const b = Math.floor(ano / 100);
    const c = ano % 100;
    const d = Math.floor(b / 4);
    const e = b % 4;
    const f = Math.floor((b + 8) / 25);
    const g = Math.floor((b - f + 1) / 3);
    const h = (19 * a + b - d - g + 15) % 30;
    const i = Math.floor(c / 4);
    const k = c % 4;
    const l = (32 + 2 * e + 2 * i - h - k) % 7;
    const m = Math.floor((a + 11 * h + 22 * l) / 451);
    const mes = Math.floor((h + l - 7 * m + 114) / 31);
    const dia = ((h + l - 7 * m + 114) % 31) + 1;

    const pascoa = new Date(ano, mes - 1, dia);

    // Helper para formatar YYYY-MM-DD
    const addDays = (date, days) => {
      const result = new Date(date);
      result.setDate(result.getDate() + days);
      // Formatação manual segura para evitar problemas de fuso horário UTC
      const y = result.getFullYear();
      const m = (result.getMonth() + 1).toString().padStart(2, "0");
      const d = result.getDate().toString().padStart(2, "0");
      return `${y}-${m}-${d}`;
    };

    // Adiciona ao Map
    holidaysMap.set(addDays(pascoa, -51), "Carnaval (Sexta) - Facultativo"); // Nova linha
    holidaysMap.set(addDays(pascoa, -48), "Carnaval (Segunda) - Facultativo"); // Nova linha
    holidaysMap.set(addDays(pascoa, -47), "Carnaval (Terça)");
    holidaysMap.set(addDays(pascoa, -46), "Quarta de Cinzas");
    holidaysMap.set(addDays(pascoa, -2), "Sexta-feira Santa");
    holidaysMap.set(addDays(pascoa, 0), "Páscoa");
    holidaysMap.set(addDays(pascoa, 60), "Corpus Christi");

    return holidaysMap;
  }

  // --- FUNÇÃO AUXILIAR DE VISIBILIDADE (NOVO) ---
  function toggleHeaderButtons(show) {
    const ids = ["btnHeaderReset", "exportJsonButton", "exportPdfButton"];
    ids.forEach((id) => {
      const btn = document.getElementById(id);
      if (btn) {
        if (show) btn.classList.remove("hidden");
        else btn.classList.add("hidden");
      }
    });
  }

  // Carrega os dados publicados no Supabase Storage (bucket relatorios-caf),
  // um mês por vez, em vez do antigo loop relatorio_p1..p10.json local.
  async function tryAutoLoadJson() {
    // Elementos da nova interface de loading
    const progressBar = document.getElementById("loadingProgressBar");
    const percentageText = document.getElementById("loadingPercentage");
    const loadingText = document.getElementById("loadingText");
    const uploadScreen = document.getElementById("uploadScreen");
    const dashboardScreen = document.getElementById("dashboardScreen");
    const btnFallback = document.getElementById("btnFallbackUpload");

    try {
      if (loadingText) loadingText.textContent = "Buscando meses publicados no Supabase...";

      const { data: files, error: listError } = await supabaseClient.storage
        .from(RELATORIOS_BUCKET)
        .list();
      if (listError) throw listError;

      const monthFiles = (files || [])
        .filter((f) => /^\d{4}-\d{2}\.json$/.test(f.name))
        .map((f) => ({ key: f.name.replace(".json", ""), updatedAt: f.updated_at }))
        .sort((a, b) => a.key.localeCompare(b.key));

      let allRawRows = [];

      for (let i = 0; i < monthFiles.length; i++) {
        const { key, updatedAt } = monthFiles[i];
        const isMesCorrente = i === monthFiles.length - 1; // o mais recente ainda está em aberto

        if (loadingText) loadingText.textContent = `Carregando ${key} (${i + 1} de ${monthFiles.length})...`;

        const rows = isMesCorrente
          ? await downloadMonthRaw(key)
          : await downloadMonthRawCached(key, updatedAt);

        allRawRows = allRawRows.concat(rows);

        const progress = ((i + 1) / Math.max(monthFiles.length, 1)) * 100;
        if (progressBar) progressBar.style.width = `${progress}%`;
        if (percentageText) percentageText.textContent = `${Math.round(progress)}%`;
      }

      if (allRawRows.length > 0) {
        if (progressBar) progressBar.style.width = "100%";
        if (percentageText) percentageText.textContent = "100%";
        if (loadingText) loadingText.textContent = "Processando os dados. Quase lá!";

        allData = processRawData(allRawRows); // Aqui ele já filtra pela Regra do RLS
        filteredData = [...allData];

        // Espera meio segundo para o usuário ver o 100% antes de trocar de tela
        setTimeout(() => {
            try {
                // 1. Inicia o dashboard principal
                initDashboard(allData);
                
                // 2. CORREÇÃO DA REGRA DE NEGÓCIO: 
                // Só tenta montar a aba de comparação se for Admin (evita crash por falta de dados)
                const userRole = sessionStorage.getItem("cockpit_user_role");
                if (userRole === "admin" && typeof initComparisonFilters === "function") {
                    initComparisonFilters(allData);
                }

                if (typeof toggleHeaderButtons === "function") toggleHeaderButtons(true);

                // 3. CORREÇÃO DA TELA (Busca Flexível)
                // Procura a tela do dashboard independente do ID que você usou no HTML
                const dashScreen = document.getElementById("dashboardScreen") || 
                                   document.getElementById("dashboard") || 
                                   document.getElementById("mainContent") || 
                                   document.querySelector("main");

                // Transição suave
                uploadScreen.classList.add("opacity-0");
                setTimeout(() => {
                    uploadScreen.classList.remove("flex"); 
                    uploadScreen.classList.add("hidden");
                    if (dashScreen) dashScreen.classList.remove("hidden");
                }, 500);

                if (typeof atualizarStatsExternos === "function") atualizarStatsExternos();

            } catch (err) {
                console.error("Erro interno ao montar o dashboard após o load:", err);
                
                // Fallback Seguro: Se qualquer gráfico quebrar, ele libera a tela mesmo assim
                uploadScreen.classList.remove("flex");
                uploadScreen.classList.add("hidden");
                
                const dashScreen = document.getElementById("dashboardScreen") || 
                                   document.getElementById("dashboard") || 
                                   document.getElementById("mainContent") || 
                                   document.querySelector("main");
                if (dashScreen) dashScreen.classList.remove("hidden");
            }
        }, 600);

      } else {
        // CENÁRIO: Nenhum mês publicado ainda no Supabase
        if (loadingText) loadingText.textContent = "Nenhum mês publicado no Supabase ainda.";
        if (progressBar) progressBar.parentElement.classList.add("hidden");
        if (percentageText) percentageText.parentElement.classList.add("hidden");
        
        // Exibe o link para upload manual caso precise quebrar um galho
        if (btnFallback) btnFallback.classList.remove("hidden");
      }
    } catch (error) {
      console.error("Erro crítico ao carregar dados do Supabase:", error);
      if (loadingText) loadingText.textContent = "Erro ao buscar dados no Supabase.";
      if (btnFallback) btnFallback.classList.remove("hidden");
    }
  }
  
  // Chama a função
  tryAutoLoadJson();

  // --- 1. LÓGICA DE UPLOAD (RF01, RF-A01) ---

  const uploadScreen = document.getElementById("uploadScreen");
  const dashboardScreen = document.getElementById("dashboardScreen");
  const dropzone = document.getElementById("dropzone");
  const fileInput = document.getElementById("fileInput");
  const uploadStatus = document.getElementById("uploadStatus");

  // --- NOVOS ELEMENTOS (Adicionar e Limpar) ---
  const addCsvInput = document.getElementById("addCsvInput");
  const btnAddCsv = document.getElementById("btnAddCsv");

  // --- GERENCIADOR DE MESES (Supabase) ---
  const btnGerenciadorMeses = document.getElementById("btnGerenciadorMeses");
  const monthManagerModal = document.getElementById("monthManagerModal");
  const btnCloseMonthManager = document.getElementById("btnCloseMonthManager");
  const xlsxInput = document.getElementById("xlsxInput");
  const btnXlsxUpload = document.getElementById("btnXlsxUpload");
  const btnMigrarAtual = document.getElementById("btnMigrarAtual");
  const btnMigrarLocais = document.getElementById("btnMigrarLocais");
  const monthManagerStatus = document.getElementById("monthManagerStatus");

  // 1. Lógica de ADICIONAR (Mesclar)
  if (btnAddCsv) {
    btnAddCsv.addEventListener("click", () => {
      addCsvInput.click();
    });
  }

  if (addCsvInput) {
    addCsvInput.addEventListener("change", () => {
      handleFiles(addCsvInput.files);
      addCsvInput.value = ""; // Limpa para permitir selecionar o mesmo arquivo
    });
  }

  // Atualiza allData/filteredData e redesenha, sem reabrir a tela de loading
  // nem re-registrar listeners (evita o problema de duplicar handlers que
  // rodar tryAutoLoadJson() de novo, no meio de uma sessão, causaria).
  async function refreshFromSupabase() {
    const raw = await loadFromSupabase();
    allData = processRawData(raw);
    filteredData = [...allData];
    if (typeof updateDateRangeBadge === "function") updateDateRangeBadge(allData);
    if (typeof populateFilters === "function") populateFilters(allData);
    if (typeof updateDashboard === "function") updateDashboard();
    if (typeof atualizarStatsExternos === "function") atualizarStatsExternos();
  }

  // 2. Lógica do Gerenciador de Meses (Supabase)
  if (btnGerenciadorMeses) {
    btnGerenciadorMeses.addEventListener("click", () => {
      monthManagerModal.classList.remove("hidden");
    });
  }

  if (btnCloseMonthManager) {
    btnCloseMonthManager.addEventListener("click", () => {
      monthManagerModal.classList.add("hidden");
    });
  }

  if (btnXlsxUpload) {
    btnXlsxUpload.addEventListener("click", () => xlsxInput.click());
  }

  if (xlsxInput) {
    xlsxInput.addEventListener("change", async () => {
      const file = xlsxInput.files[0];
      if (!file) return;

      btnXlsxUpload.disabled = true;
      btnMigrarAtual.disabled = true;

      try {
        const { results, ignoradasSemData } = await handleXlsxUpload(file, (msg) => {
          if (monthManagerStatus) monthManagerStatus.textContent = msg;
        });

        const resumo = results
          .map((r) => `${r.month}: ${r.total} linhas (${r.novos} novas)`)
          .join(" · ");

        if (monthManagerStatus) {
          monthManagerStatus.textContent = `Publicado! ${resumo}${
            ignoradasSemData > 0 ? ` — ${ignoradasSemData} linha(s) sem Data Análise ignorada(s)` : ""
          }`;
        }

        await refreshFromSupabase();
      } catch (err) {
        console.error("Erro ao publicar xlsx:", err);
        if (monthManagerStatus) monthManagerStatus.textContent = "Erro ao publicar. Veja o console.";
      } finally {
        btnXlsxUpload.disabled = false;
        btnMigrarAtual.disabled = false;
        xlsxInput.value = "";
      }
    });
  }

  if (btnMigrarAtual) {
    btnMigrarAtual.addEventListener("click", async () => {
      if (allData.length === 0) {
        if (monthManagerStatus) monthManagerStatus.textContent = "Nada carregado na tela pra migrar.";
        return;
      }
      if (!confirm(`Migrar ${allData.length} linhas já carregadas para o Supabase?`)) return;

      btnXlsxUpload.disabled = true;
      btnMigrarAtual.disabled = true;

      try {
        const { results, ignoradasSemData } = await publishMonthlyData(allData, (msg) => {
          if (monthManagerStatus) monthManagerStatus.textContent = msg;
        });

        const resumo = results
          .map((r) => `${r.month}: ${r.total} linhas (${r.novos} novas)`)
          .join(" · ");

        if (monthManagerStatus) {
          monthManagerStatus.textContent = `Migração concluída! ${resumo}${
            ignoradasSemData > 0 ? ` — ${ignoradasSemData} linha(s) sem Data Análise ignorada(s)` : ""
          }`;
        }
      } catch (err) {
        console.error("Erro na migração:", err);
        if (monthManagerStatus) monthManagerStatus.textContent = "Erro na migração. Veja o console.";
      } finally {
        btnXlsxUpload.disabled = false;
        btnMigrarAtual.disabled = false;
      }
    });
  }

  if (btnMigrarLocais) {
    btnMigrarLocais.addEventListener("click", async () => {
      if (!confirm("Isso vai ler relatorio_p1.json a p10.json (o que existir na pasta) e publicar tudo no Supabase. Pode demorar um pouco. Continuar?")) return;

      btnXlsxUpload.disabled = true;
      btnMigrarAtual.disabled = true;
      btnMigrarLocais.disabled = true;

      try {
        const { results, ignoradasSemData, arquivosLidos } = await migrarJsonsLocais((msg) => {
          if (monthManagerStatus) monthManagerStatus.textContent = msg;
        });

        if (arquivosLidos === 0) {
          if (monthManagerStatus) monthManagerStatus.textContent = "Nenhum relatorio_pX.json encontrado na pasta.";
          return;
        }

        const resumo = results
          .map((r) => `${r.month}: ${r.total} linhas (${r.novos} novas)`)
          .join(" · ");

        if (monthManagerStatus) {
          monthManagerStatus.textContent = `${arquivosLidos} arquivo(s) lido(s). ${resumo}${
            ignoradasSemData > 0 ? ` — ${ignoradasSemData} linha(s) sem Data Análise ignorada(s)` : ""
          }`;
        }

        await refreshFromSupabase();
      } catch (err) {
        console.error("Erro ao migrar jsons locais:", err);
        if (monthManagerStatus) monthManagerStatus.textContent = "Erro na migração. Veja o console.";
      } finally {
        btnXlsxUpload.disabled = false;
        btnMigrarAtual.disabled = false;
        btnMigrarLocais.disabled = false;
      }
    });
  }

  // Função unificada de Reset
  function resetApplication() {
    if (
      allData.length > 0 &&
      !confirm(
        "Tem certeza? Isso apagará TODOS os dados da tela para começar do zero.",
      )
    ) {
      return;
    }
    // Zera tudo
    allData = [];
    filteredData = [];
    Object.values(chartInstances).forEach((chart) => chart.destroy());

    // Volta para tela inicial
    dashboardScreen.classList.add("hidden");
    uploadScreen.classList.remove("hidden");
    setTimeout(() => {
      uploadScreen.style.opacity = "1";
    }, 10);

    fileInput.value = "";
    uploadStatus.textContent = "";

    // Limpa filtros
    document.getElementById("filterPeriodStart").value = "";
    document.getElementById("filterPeriodEnd").value = "";
    document.getElementById("filterAnalyst").value = "all";
    document.getElementById("filterSituation").value = "all";
    document.getElementById("filterUf").value = "all";
    document.getElementById("filterMonth").value = "all";
    document.getElementById("filterYear").value = "all";
    atualizarStatsExternos();
  }

  // Eventos de Drag-and-Drop
  if (dropzone) {
      dropzone.addEventListener("dragover", (e) => {
        e.preventDefault();
        dropzone.classList.add("border-blue-500", "bg-blue-50");
      });
      dropzone.addEventListener("dragleave", () =>
        dropzone.classList.remove("border-blue-500", "bg-blue-50"),
      );
      dropzone.addEventListener("drop", (e) => {
        e.preventDefault();
        dropzone.classList.remove("border-blue-500", "bg-blue-50");
        handleFiles(e.dataTransfer.files);
      });
      dropzone.addEventListener("click", () => fileInput.click());
    }

    if (fileInput) {
      fileInput.addEventListener("change", () => handleFiles(fileInput.files));
    }

    function handleFiles(files) {
      if (files.length === 0) {
        if (uploadStatus) uploadStatus.textContent = "Nenhum arquivo selecionado.";
        return;
      }
      if (uploadStatus) uploadStatus.textContent = `Carregando ${files.length} arquivo(s)...`;

    let filesProcessed = 0;
    let consolidatedData = [];

    Array.from(files).forEach((file) => {
      Papa.parse(file, {
        header: true,
        delimiter: ";",
        skipEmptyLines: true,
        complete: (results) => {
          consolidatedData = consolidatedData.concat(results.data);
          filesProcessed++;

          if (filesProcessed === files.length) {
            const newProcessedData = processRawData(consolidatedData);

            // LÓGICA DE MERGE (IMPORTANTE)
            if (allData.length > 0) {
              allData = mergeData(allData, newProcessedData);
            } else {
              allData = newProcessedData;
            }

            filteredData = [...allData];
            initDashboard(allData);
            initComparisonFilters(allData);

            uploadStatus.textContent = `Sucesso! ${allData.length} linhas totais carregadas.`;

            atualizarStatsExternos();

            uploadScreen.style.opacity = "0";
            setTimeout(() => {
              uploadScreen.classList.add("hidden");
              dashboardScreen.classList.remove("hidden");
            }, 500);
          }
        },
        error: (err) => {
          console.error("Erro ao processar:", err);
          uploadStatus.textContent = `Erro ao ler o arquivo.`;
        },
      });
    });
  }

  // --- 2. PROCESSAMENTO DE DADOS ---

    function addDerivedFields(data) {
    const rejectedRows = [];

    const processedData = data.map((row) => {
        const dataSolicitacao = _native_safeParseDate(row["Data Solicitacao"]);
        const dataAnalise = _native_safeParseDate(row["Data Análise"]);

        let tempoAnalise = null;
        if (dataSolicitacao && dataAnalise) {
            const diffMs = _calcBusinessTimeDiff(dataSolicitacao, dataAnalise);
            tempoAnalise = Math.floor(diffMs / (1000 * 60 * 60 * 24));
        }

        if (!dataAnalise && row["Data Análise"]) {
            rejectedRows.push(row);
        }

        return {
            ...row,
            _dataSolicitacao: dataSolicitacao,
            _dataAnalise: dataAnalise,
            _tempoAnalise: tempoAnalise,
            _mesAnoAnalise: dataAnalise
                ? `${dataAnalise.getFullYear()}-${(dataAnalise.getMonth() + 1)
                    .toString()
                    .padStart(2, "0")}`
                : null,
            _diaAnalise: dataAnalise
                ? _native_formatDate(_native_startOfDay(dataAnalise), "yyyy-MM-dd")
                : null,
        };
    });

    console.warn(`[DEBUG] Linhas totais recebidas: ${data.length}`);
    console.warn(`[DEBUG] Linhas rejeitadas (Data Análise inválida, não-vazia): ${rejectedRows.length}`);
    if (rejectedRows.length > 0) {
        console.warn("[DEBUG] Amostra de linhas rejeitadas (primeiras 20):", rejectedRows.slice(0, 20));
    }

    return processedData;
  }

  function processRawData(data) {
    const role = sessionStorage.getItem("cockpit_user_role");
    const csvName = sessionStorage.getItem("cockpit_csv_name") || sessionStorage.getItem("cockpit_user_realname");

    let processedData = addDerivedFields(data);

      // ---------------------------

    // --------------------------------------------------------
    // GATEKEEPER DE DADOS
    // Se não for admin, deleta da memória qualquer linha que 
    // não pertença ao analista logado antes de montar o dash.
    // --------------------------------------------------------
    if (role !== "admin") {
        // Função auxiliar para padronizar os nomes: 
        // Remove acentos, espaços extras e transforma em minúsculas
        const normalizeString = (str) => {
            if (!str) return "";
            return str.toString()
                      .normalize("NFD")               // Separa os acentos das letras
                      .replace(/[\u0300-\u036f]/g, "") // Remove os acentos matematicamente
                      .trim()                         // Remove espaços nas pontas
                      .toLowerCase();                 // Tudo minúsculo
        };

        const safeCsvName = normalizeString(csvName);

        if (safeCsvName === "todos") {
            return processedData;
        }

        return processedData.filter(row => {
            const rowAnalyst = normalizeString(row["Usuario Analista"]);
            return rowAnalyst === safeCsvName;
        });
    }

    return processedData;
  }

  // --- NOVA FUNÇÃO: Badge de Período da Base ---
  function updateDateRangeBadge(data) {
      const badgeEl = document.getElementById("dateRangeBadge");
      if (!badgeEl) return;

      // Filtra as datas válidas
      const validDates = data
          .map(row => row._dataAnalise)
          .filter(d => d instanceof Date && !isNaN(d));

      if (validDates.length === 0) {
          badgeEl.classList.add("hidden");
          return;
      }

      // A MÁGICA AQUI: Usando reduce em vez de spread (...) para evitar estouro de Call Stack
      const minDate = new Date(validDates.reduce((min, p) => p < min ? p : min, validDates[0]));
      const maxDate = new Date(validDates.reduce((max, p) => p > max ? p : max, validDates[0]));

      const minStr = _native_formatDate(minDate, "dd/MM/yy");
      const maxStr = _native_formatDate(maxDate, "dd/MM/yy");

      badgeEl.innerHTML = `<span class="opacity-75 font-normal">Base lida:</span> ${minStr} a ${maxStr}`;
      badgeEl.classList.remove("hidden");
  }

  // --- 3. LÓGICA DE FILTROS (RF07) ---

  const filterControls = [
    "filterPeriodStart", // Mantemos os listeners manuais
    "filterPeriodEnd", // Mantemos os listeners manuais
    "filterAnalyst",
    "filterSituation",
    "filterUf",
  ];

  function initDashboard(data) {
    updateDateRangeBadge(data);
    populateFilters(data);

    // Listeners especiais para os atalhos de Mês/Ano
    // Eles chamam a função que preenche as datas automaticamente
    const monthSelect = document.getElementById("filterMonth");
    const yearSelect = document.getElementById("filterYear");

    if (monthSelect)
      monthSelect.addEventListener("change", applyMonthYearShortcut);
    if (yearSelect)
      yearSelect.addEventListener("change", applyMonthYearShortcut);

    // Listeners padrão para todos os outros filtros (Update direto)
    filterControls.forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.addEventListener("change", updateDashboard);
    });

    updateDashboard();
  }

  function populateFilters(data) {
    const analysts = new Set();
    const situations = new Set();
    const ufs = new Set();
    const years = new Set();

    data.forEach((row) => {
      if (row["Usuario Analista"]) analysts.add(row["Usuario Analista"]);
      if (row["Situação Solicitação"])
        situations.add(row["Situação Solicitação"]);
      if (row["Codigo Uf"]) ufs.add(row["Codigo Uf"]);

      if (row._dataAnalise) {
        years.add(row._dataAnalise.getFullYear());
      }
    });

    populateSelect("filterAnalyst", [...analysts].sort());
    populateSelect("filterSituation", [...situations].sort());
    populateSelect("filterUf", [...ufs].sort());

    // Popula o select de Ano
    populateSelect(
      "filterYear",
      [...years].sort((a, b) => b - a),
    );

    // --- NOVA LÓGICA DE PADRÃO (Mês Anterior) ---

    const today = new Date();
    let targetYear = today.getFullYear();
    let targetMonth = today.getMonth() - 1; // 0-11 (Jan é 0)

    // Ajuste para virada de ano: Se estamos em Janeiro (0), queremos Dezembro (11) do ano passado
    if (targetMonth < 0) {
      targetMonth = 11;
      targetYear -= 1;
    }

    const yearSelect = document.getElementById("filterYear");
    const monthSelect = document.getElementById("filterMonth");

    // Verifica se o ano alvo existe nas opções carregadas (para evitar erro se o CSV for antigo)
    // Convertemos para String pois o value do option é string
    const yearExists = [...yearSelect.options].some(
      (opt) => opt.value === targetYear.toString(),
    );

    if (yearExists) {
      yearSelect.value = targetYear;
      monthSelect.value = targetMonth;

      // Chama a função de atalho para preencher as datas de Início/Fim automaticamente
      // (Certifique-se que a função applyMonthYearShortcut já está definida no seu código)
      if (typeof applyMonthYearShortcut === "function") {
        applyMonthYearShortcut();
      }
    } else {
      // Se não tiver dados do mês/ano anterior, deixa em "Todos"
      yearSelect.value = "all";
      monthSelect.value = "all";
      document.getElementById("filterPeriodStart").value = "";
      document.getElementById("filterPeriodEnd").value = "";
    }
  }

  // --- NOVA FUNÇÃO: O "Atalho" que preenche as datas ---
  function applyMonthYearShortcut() {
    const monthVal = document.getElementById("filterMonth").value;
    const yearVal = document.getElementById("filterYear").value;

    const startInput = document.getElementById("filterPeriodStart");
    const endInput = document.getElementById("filterPeriodEnd");

    // Só aplica se o usuário escolheu PELO MENOS o Ano
    if (yearVal !== "all") {
      const year = parseInt(yearVal);

      if (monthVal !== "all") {
        // Caso 1: Mês + Ano -> Dia 1 até Fim do Mês
        const month = parseInt(monthVal);
        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0); // Último dia do mês

        startInput.value = _native_formatDate(firstDay, "yyyy-MM-dd");
        endInput.value = _native_formatDate(lastDay, "yyyy-MM-dd");
      } else {
        // Caso 2: Só Ano -> Ano inteiro
        const firstDay = new Date(year, 0, 1);
        const lastDay = new Date(year, 11, 31);

        startInput.value = _native_formatDate(firstDay, "yyyy-MM-dd");
        endInput.value = _native_formatDate(lastDay, "yyyy-MM-dd");
      }
      // Atualiza o dashboard
      updateDashboard();
    }
  }

  function populateSelect(id, options) {
    const select = document.getElementById(id);
    // Limpa opções antigas, exceto a primeira ("Todos")
    select.options.length = 1;
    options.forEach((option) => {
      select.add(new Option(option, option));
    });
  }

  function applyFilters() {
    // CORREÇÃO: Verifica se os valores de data existem antes de tentar parsear
    const startInput = document.getElementById("filterPeriodStart");
    const endInput = document.getElementById("filterPeriodEnd");

    const start = startInput.value
      ? _native_startOfDay(_native_safeParseDate(startInput.value))
      : null;
    const end = endInput.value
      ? _native_startOfDay(_native_safeParseDate(endInput.value))
      : null;

    // Verifica se algum filtro de data está *ativamente* sendo usado
    const hasDateFilter = start || end;

    const analyst = document.getElementById("filterAnalyst").value;
    const situation = document.getElementById("filterSituation").value;
    const uf = document.getElementById("filterUf").value;

    const endDate = end ? new Date(end.getTime() + 86400000) : null;

    filteredData = allData.filter((row) => {
      const analysisDate = _native_startOfDay(row._dataAnalise); // null para datas inválidas

      let dateMatch;
      if (!analysisDate) {
        // Se a data da linha é inválida...
        // Só inclua se NENHUM filtro de data estiver ativo.
        dateMatch = !hasDateFilter;
      } else {
        // Se a data da linha é válida, aplica a lógica normal de filtro
        dateMatch =
          (!start || analysisDate >= start) &&
          (!endDate || analysisDate < endDate);
      }

      const analystMatch =
        analyst === "all" || row["Usuario Analista"] === analyst;
      const situationMatch =
        situation === "all" || row["Situação Solicitação"] === situation;
      const ufMatch = uf === "all" || row["Codigo Uf"] === uf;

      return dateMatch && analystMatch && situationMatch && ufMatch;
    });
  }

  // Transforma Array de Objetos em Formato Matriz (Leve)
  function optimizeDataForExport(data) {
    if (data.length === 0) return { cols: [], rows: [] };
    // Pega as chaves do primeiro objeto (ignorando as chaves internas que começam com _)
    const keys = Object.keys(data[0]).filter((k) => !k.startsWith("_"));

    const rows = data.map((obj) => {
      return keys.map((k) => obj[k]); // Mapeia apenas os valores na ordem das chaves
    });

    return { cols: keys, rows: rows };
  }

  // Transforma Formato Matriz de volta em Array de Objetos (Para uso no App)
  function restoreDataFromImport(optimizedData) {
    const { cols, rows } = optimizedData;
    return rows.map((row) => {
      const obj = {};
      cols.forEach((key, index) => {
        obj[key] = row[index];
      });
      return obj;
    });
  }

  // =========================================================
  // MOTOR DE PUBLICAÇÃO MENSAL — SUPABASE STORAGE
  // =========================================================

  async function downloadMonthRaw(monthKey) {
    const { data, error } = await supabaseClient.storage
      .from(RELATORIOS_BUCKET)
      .download(`${monthKey}.json`);
    if (error) return []; // mês ainda não existe
    const text = await data.text();
    return restoreDataFromImport(JSON.parse(text));
  }

  async function uploadMonthRaw(monthKey, rawRows) {
    const optimized = optimizeDataForExport(rawRows);
    const blob = new Blob([JSON.stringify(optimized)], { type: "application/json" });
    const { error } = await supabaseClient.storage
      .from(RELATORIOS_BUCKET)
      .upload(`${monthKey}.json`, blob, { upsert: true, contentType: "application/json" });
    if (error) throw error;
  }

  async function enforceRetention() {
    const { data: files, error } = await supabaseClient.storage.from(RELATORIOS_BUCKET).list();
    if (error || !files) return;

    const monthKeys = files
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f.name))
      .map((f) => f.name.replace(".json", ""))
      .sort();

    const toDelete = monthKeys.slice(0, Math.max(0, monthKeys.length - RETENTION_MONTHS));
    if (toDelete.length > 0) {
      await supabaseClient.storage.from(RELATORIOS_BUCKET).remove(toDelete.map((k) => `${k}.json`));
    }
  }

  // =========================================================
  // CACHE LOCAL (IndexedDB) — evita rebaixar meses fechados
  // toda vez que a página carrega (economiza egress do Supabase)
  // =========================================================
  const CACHE_DB_NAME = "cockpit_dashboard_cache";
  const CACHE_STORE = "meses";

  function openCacheDb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(CACHE_DB_NAME, 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore(CACHE_STORE, { keyPath: "monthKey" });
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function getCachedMonth(monthKey) {
    try {
      const db = await openCacheDb();
      return await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, "readonly");
        const req = tx.objectStore(CACHE_STORE).get(monthKey);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } catch (e) {
      return null; // IndexedDB indisponível (ex: aba anônima) -> segue sem cache
    }
  }

  async function setCachedMonth(monthKey, updatedAt, rawRows) {
    try {
      const db = await openCacheDb();
      await new Promise((resolve, reject) => {
        const tx = db.transaction(CACHE_STORE, "readwrite");
        tx.objectStore(CACHE_STORE).put({ monthKey, updatedAt, rawRows });
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch (e) {
      // Falha ao gravar não é crítica, só perde o ganho de egress dessa vez
    }
  }

  // Usado só na LEITURA (dashboard). O downloadMonthRaw "puro" continua sendo
  // usado pelo publishMonthlyData, que precisa sempre do dado fresco pra mesclar.
  async function downloadMonthRawCached(monthKey, updatedAt) {
    const cached = await getCachedMonth(monthKey);
    if (cached && cached.updatedAt === updatedAt) {
      return cached.rawRows; // veio do IndexedDB, sem egress
    }
    const rawRows = await downloadMonthRaw(monthKey);
    await setCachedMonth(monthKey, updatedAt, rawRows);
    return rawRows;
  }

  // Recebe linhas JÁ processadas (com _mesAnoAnalise), agrupa por mês,
  // mescla com o que já está publicado e sobe. Usada tanto pela migração
  // inicial (a partir do allData já carregado) quanto pelo motor de xlsx.
  async function publishMonthlyData(processedRows, onProgress) {
    const groups = {};
    let ignoradasSemData = 0;

    processedRows.forEach((row) => {
      if (!row._mesAnoAnalise) { ignoradasSemData++; return; }
      (groups[row._mesAnoAnalise] = groups[row._mesAnoAnalise] || []).push(row);
    });

    const results = [];
    for (const key of Object.keys(groups).sort()) {
      if (onProgress) onProgress(`Publicando ${key}...`);

      const newRawObjs = restoreDataFromImport(optimizeDataForExport(groups[key]));
      const existingRaw = await downloadMonthRaw(key);
      const merged = mergeData(existingRaw, newRawObjs);

      await uploadMonthRaw(key, merged);
      results.push({ month: key, total: merged.length, novos: merged.length - existingRaw.length });
    }

    await enforceRetention();
    return { results, ignoradasSemData };
  }

  // Migração única: lê os relatorio_p1..p10.json locais (mesmo padrão do antigo
  // tryAutoLoadJson) e publica tudo no Supabase pelo mesmo motor do xlsx.
  async function migrarJsonsLocais(onProgress) {
    let allRows = [];
    let commonCols = null;
    const maxParts = 10;
    let arquivosLidos = 0;

    for (let i = 1; i <= maxParts; i++) {
      if (onProgress) onProgress(`Lendo relatorio_p${i}.json...`);
      try {
        const response = await fetch(`relatorio_p${i}.json`);
        if (!response.ok) break;
        const part = await response.json();
        if (!commonCols) commonCols = part.cols;
        allRows = allRows.concat(part.rows);
        arquivosLidos++;
      } catch (e) {
        break;
      }
    }

    if (arquivosLidos === 0) {
      return { results: [], ignoradasSemData: 0, arquivosLidos: 0 };
    }

    const rawRows = restoreDataFromImport({ cols: commonCols, rows: allRows });
    const processedRows = addDerivedFields(rawRows);
    const publishResult = await publishMonthlyData(processedRows, onProgress);
    return { ...publishResult, arquivosLidos };
  }

  // Motor XLSX: lê o Excel nativo da fonte e publica direto no Supabase
  async function handleXlsxUpload(file, onProgress) {
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer, { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    // raw: false -> mantém as datas como texto "dd/MM/yyyy HH:mm:ss", igual ao CSV
    const rawRows = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: "" });

    const processedRows = addDerivedFields(rawRows);
    return publishMonthlyData(processedRows, onProgress);
  }

  // Carrega o dashboard direto do Storage (substitui o loop p1..p10 do tryAutoLoadJson)
  async function loadFromSupabase() {
    const { data: files, error } = await supabaseClient.storage.from(RELATORIOS_BUCKET).list();
    if (error || !files || files.length === 0) return [];

    const monthFiles = files
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f.name))
      .map((f) => ({ key: f.name.replace(".json", ""), updatedAt: f.updated_at }))
      .sort((a, b) => a.key.localeCompare(b.key));

    let allRawRows = [];
    for (let i = 0; i < monthFiles.length; i++) {
      const { key, updatedAt } = monthFiles[i];
      const isMesCorrente = i === monthFiles.length - 1;
      const rows = isMesCorrente
        ? await downloadMonthRaw(key)
        : await downloadMonthRawCached(key, updatedAt);
      allRawRows = allRawRows.concat(rows);
    }
    return allRawRows;
  }

  function mergeData(oldData, newData) {

    const existingSignatures = new Set(
      oldData.map((item) => String(item["IdSolicitacao"])),
    );

    const uniqueNewData = newData.filter(
      (item) => !existingSignatures.has(String(item["IdSolicitacao"])),
    );

    console.log(
      `Merge: ${oldData.length} antigos + ${uniqueNewData.length} novos únicos.`,
    );
    return [...oldData, ...uniqueNewData];
  }

  // --- 4. FUNÇÃO PRINCIPAL DE ATUALIZAÇÃO ---

  function updateDashboard() {
    applyFilters();

    // Destrói gráficos antigos antes de criar novos
    Object.values(chartInstances).forEach((chart) => chart.destroy());

    // Renderiza todas as seções
    renderKPIs(filteredData);
    renderTeamPerformance(filteredData);
    renderOperationalEfficiency(filteredData); // Não precisa mais de allData aqui
    renderRequestProfile(filteredData);
    renderGeography(filteredData);

    // 4. LÓGICA ESPECIAL PARA TENDÊNCIA (Ignora datas quebradas, respeita Ano e Analista)
    const selectedAnalyst = document.getElementById("filterAnalyst").value;
    const selectedYear = document.getElementById("filterYear").value;

    // Criamos um dataset específico para a tendência
    const trendData = allData.filter((row) => {
      // Filtro 1: Analista (se não for "todos", tem que bater o nome)
      const matchAnalyst =
        selectedAnalyst === "all" ||
        row["Usuario Analista"] === selectedAnalyst;

      // Filtro 2: Ano (se não for "todos", tem que bater o ano)
      // Isso permite ver a tendência do ano todo de 2025, mesmo se o filtro de data for só "Outubro"
      let matchYear = true;
      if (selectedYear !== "all" && row._dataAnalise) {
        matchYear = row._dataAnalise.getFullYear() === parseInt(selectedYear);
      }

      // Retorna true apenas se passar pelo Analista e pelo Ano
      return matchAnalyst && matchYear;
    });

    // Renderiza a Tendência com esse dado mais "amplo"
    renderTrendChart(trendData);

    if (typeof updateAnalystSectionVisibility === "function") {
      updateAnalystSectionVisibility();
    }
  }

  // --- 5. LÓGICA DE RENDERIZAÇÃO (Gráficos e Tabelas) ---

  // Funções de Cálculo (Helpers)
  const stats = {
    mean: (arr) =>
      arr.length === 0 ? 0 : arr.reduce((a, b) => a + b, 0) / arr.length,
    median: (arr) => {
      if (arr.length === 0) return 0;
      const sorted = [...arr].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 !== 0
        ? sorted[mid]
        : (sorted[mid - 1] + sorted[mid]) / 2;
    },
    stdDev: (arr) => {
      if (arr.length <= 1) return 0;
      const meanVal = stats.mean(arr);
      const variance =
        arr.reduce((sq, n) => sq + Math.pow(n - meanVal, 2), 0) /
        (arr.length - 1);
      return Math.sqrt(variance);
    },
    groupBy: (arr, key) =>
      arr.reduce((acc, item) => {
        (acc[item[key]] = acc[item[key]] || []).push(item);
        return acc;
      }, {}),
    countBy: (arr, key) =>
      arr.reduce((acc, item) => {
        acc[item[key]] = (acc[item[key]] || 0) + 1;
        return acc;
      }, {}),
    getTopN: (countMap, n) =>
      Object.entries(countMap)
        .sort(([, a], [, b]) => b - a)
        .slice(0, n),
  };

  // Renderiza um único KPI Card
  function renderKpiCard(title, value, tooltip) {
    return `
            <div class="bg-white dark:bg-slate-800 p-4 rounded-lg shadow-md text-center">
                <div class="flex items-center justify-center gap-2">
                    <h4 class="text-sm font-medium text-gray-500 dark:text-gray-400 uppercase">${title}</h4>
                    ${
                      tooltip
                        ? `
                    <div class="tooltip-container">
                        <span class="tooltip-icon">i</span>
                        <span class="tooltip-text">${tooltip}</span>
                    </div>
                    `
                        : ""
                    }
                </div>
                <p class="text-3xl font-bold text-gray-900 dark:text-white mt-1">${value}</p>
            </div>
        `;
  }

  // RF02: KPIs Gerais
  function renderKPIs(data) {
    const kpiContainer = document.getElementById("kpis");
    if (!data.length) {
      kpiContainer.innerHTML =
        "<p class='col-span-full text-center text-gray-500 dark:text-gray-400'>Sem dados para exibir KPIs.</p>";
      return;
    }

    const total = data.length;
    // CORREÇÃO: Esta lógica já filtra corretamente (só pega tempos válidos)
    const temposAnalise = data
      .map((d) => d._tempoAnalise)
      .filter((t) => t !== null && t >= 0);

    const mediaTempo = stats.mean(temposAnalise).toFixed(1);
    const medianaTempo = stats.median(temposAnalise).toFixed(1);

    const deferidas = data.filter(
      (d) => d["Situação Solicitação"] === "Deferida",
    ).length;
    const indeferidas = data.filter(
      (d) => d["Situação Solicitação"] === "Indeferida",
    ).length;
    const assinadas = data.filter(
      (d) => d["Assinado Digitalmente"] === "Assinado Digitalmente",
    ).length;

    const taxaDeferimento =
      total > 0 ? ((deferidas / total) * 100).toFixed(1) : 0;
    const taxaIndeferimento =
      total > 0 ? ((indeferidas / total) * 100).toFixed(1) : 0;
    const taxaAssinatura =
      total > 0 ? ((assinadas / total) * 100).toFixed(1) : 0;

    kpiContainer.innerHTML = `
            ${renderKpiCard(
              "Total Solicitações",
              total.toLocaleString("pt-BR"),
            )}
            ${renderKpiCard(
              "Tempo Médio",
              `${mediaTempo} dias`,
              "Média de (Data Análise - Data Solicitacao).",
            )}
            ${renderKpiCard(
              "Tempo Mediano",
              `${medianaTempo} dias`,
              "Valor central do tempo de análise. Menos sensível a outliers que a média.",
            )}
            ${renderKpiCard("Taxa Deferimento", `${taxaDeferimento}%`)}
            ${renderKpiCard("Taxa Indeferimento", `${taxaIndeferimento}%`)}
            ${renderKpiCard("Taxa Ass. Digital", `${taxaAssinatura}%`)}
        `;
  }

  // RF03: Desempenho da Equipe
  function renderTeamPerformance(data) {
    // CORREÇÃO: A participação agora é baseada nos dados filtrados (filteredData)
    // Se quiséssemos a participação do total, usaríamos allData.length
    const totalVisivel = data.length;
    const tableBody = document.getElementById("teamTableBody");
    tableBody.innerHTML = "";

    if (!data.length) {
      tableBody.innerHTML =
        "<tr><td colspan='5' class='text-center py-4 text-gray-500 dark:text-gray-400'>Sem dados de equipe para exibir.</td></tr>";
      return;
    }

    const groupedByAnalyst = stats.groupBy(data, "Usuario Analista");
    const performanceData = [];

    for (const [analyst, rows] of Object.entries(groupedByAnalyst)) {
      if (!analyst || analyst === "undefined") continue;

      const totalMes = rows.length;

      // Cálculo da Média Diária (baseado em dias únicos de trabalho)
      // Esta lógica já filtra corretamente (só pega dias válidos)
      const dailyCounts = stats.countBy(
        rows.filter((r) => r._diaAnalise),
        "_diaAnalise",
      );
      const dailyValues = Object.values(dailyCounts);
      const diasUnicos = dailyValues.length;

      const mediaDiaria = diasUnicos > 0 ? totalMes / diasUnicos : 0;
      const desvioPadrao = stats.stdDev(dailyValues);
      const participacao =
        totalVisivel > 0 ? (totalMes / totalVisivel) * 100 : 0;

      performanceData.push({
        nome: analyst,
        totalMes: totalMes,
        mediaDiaria: mediaDiaria,
        desvioPadrao: desvioPadrao,
        participacao: participacao,
        situations: stats.countBy(rows, "Situação Solicitação"),
      });
    }

    // Ordena por Total Mês (descendente)
    performanceData.sort((a, b) => b.totalMes - a.totalMes);

    // Popula a tabela
    performanceData.forEach((d, index) => {
      const row = `
                <tr class="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-bold text-gray-500 dark:text-gray-400">
                        ${index + 1}º
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                        ${d.nome}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${d.totalMes.toLocaleString("pt-BR")}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${d.mediaDiaria.toFixed(1)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${d.desvioPadrao.toFixed(2)}
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                        ${d.participacao.toFixed(1)}%
                    </td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-center flex justify-center gap-3">
                        <button onclick="window.exportAnalystPDF('${d.nome}')" title="Gerar Relatório PDF" class="text-red-500 hover:text-red-700 transition-transform transform hover:scale-110 text-lg">📄</button>
                        <button onclick="window.exportAnalystCSV('${d.nome}')" title="Gerar Planilha Excel/CSV" class="text-green-500 hover:text-green-700 transition-transform transform hover:scale-110 text-lg">📊</button>
                    </td>
                </tr>
            `;
      tableBody.innerHTML += row;
    });

    // Gráfico de Carga de Trabalho (Barras)
    createChart("chartWorkload", {
      type: "bar",
      data: {
        labels: performanceData.map((d) => d.nome),
        datasets: [
          {
            label: "Total de Análises",
            data: performanceData.map((d) => d.totalMes),
            backgroundColor: "rgba(59, 130, 246, 0.7)",
            borderColor: "rgba(59, 130, 246, 1)",
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        indexAxis: "y", // Gráfico de barras horizontal
        scales: { y: { beginAtZero: true } },
      },
    });

    // Gráfico de Qualidade (Barras Empilhadas)
    const situations = [
      ...new Set(data.map((d) => d["Situação Solicitação"])),
    ].filter(Boolean);
    const situationColors = {
      Deferida: "rgba(22, 163, 74, 0.7)",
      Indeferida: "rgba(220, 38, 38, 0.7)",
      "Deferida Parcial": "rgba(234, 179, 8, 0.7)",
      default: "rgba(156, 163, 175, 0.7)",
    };

    const datasets = situations.map((sit) => {
      return {
        label: sit,
        data: performanceData.map((d) => d.situations[sit] || 0),
        backgroundColor: situationColors[sit] || situationColors.default,
      };
    });

    createChart("chartQuality", {
      type: "bar",
      data: {
        labels: performanceData.map((d) => d.nome),
        datasets: datasets,
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: true },
          y: { stacked: true, beginAtZero: true },
        },
      },
    });
  }

  // RF04: Eficiência Operacional
  function renderOperationalEfficiency(data) {
    // Gráfico de Linha (Volume de Entrada por Dia)
    // Esta lógica já filtra corretamente (só pega dias válidos)
    const entryByDay = stats.countBy(
      data.filter((r) => r._diaAnalise),
      "_diaAnalise",
    );
    const sortedEntries = Object.entries(entryByDay).sort(
      ([a], [b]) => _native_safeParseDate(a) - _native_safeParseDate(b),
    );

    createChart("chartEntryVolume", {
      type: "line",
      data: {
        labels: sortedEntries.map(([date]) =>
          _native_formatDate(_native_safeParseDate(date), "dd/MM/yy"),
        ),
        datasets: [
          {
            label: "Solicitações por Dia",
            data: sortedEntries.map(([, count]) => count),
            borderColor: "rgba(79, 70, 229, 1)",
            backgroundColor: "rgba(79, 70, 229, 0.1)",
            fill: true,
            tension: 0.1,
          },
        ],
      },
      options: { responsive: true },
    });

    // Histograma (Distribuição do Tempo de Análise)
    // Esta lógica já filtra corretamente (só pega tempos válidos)
    const tempos = data
      .map((d) => d._tempoAnalise)
      .filter((t) => t !== null && t >= 0);
    const maxTempo = Math.max(...tempos, 30); // Limite de 30 dias se não houver maior
    const binSize = maxTempo <= 15 ? 1 : maxTempo <= 60 ? 2 : 5; // Tamanho dinâmico do bin
    const bins = {};

    for (let i = 0; i < maxTempo + binSize; i += binSize) {
      const label = `${i}-${i + binSize - 1} dias`;
      bins[label] = 0;
    }

    tempos.forEach((t) => {
      const binIndex = Math.floor(t / binSize) * binSize;
      const label = `${binIndex}-${binIndex + binSize - 1} dias`;
      if (bins[label] !== undefined) {
        bins[label]++;
      }
    });

    createChart("chartAnalysisTime", {
      type: "bar",
      data: {
        labels: Object.keys(bins),
        datasets: [
          {
            label: "Nº de Solicitações",
            data: Object.values(bins),
            backgroundColor: "rgba(217, 119, 6, 0.7)",
          },
        ],
      },
      options: {
        responsive: true,
        scales: { x: { ticks: { maxRotation: 90, minRotation: 45 } } },
      },
    });
  }

  // RF05: Perfil das Solicitações
  function renderRequestProfile(data) {
    renderPieChart("chartReqType", data, "Tipo Solicitacão");
    renderPieChart("chartCategory", data, "Categoria");
    renderPieChart("chartSupplierType", data, "Tipo Fornecedor");
    renderPieChart("chartSimpas", data, "Situação Simpas");
  }

  // RF06: Análise Geográfica
  function renderGeography(data) {
    const cityCounts = stats.countBy(data, "Endereço Cidade");
    const top10Cities = stats.getTopN(cityCounts, 10);

    createChart("chartTopCities", {
      type: "bar",
      data: {
        labels: top10Cities.map(([name]) => name || "N/A"),
        datasets: [
          {
            label: "Top 10 Cidades",
            data: top10Cities.map(([, count]) => count),
            backgroundColor: "rgba(13, 148, 136, 0.7)",
          },
        ],
      },
      options: { responsive: true, indexAxis: "y" },
    });

    const ufCounts = stats.countBy(data, "Codigo Uf");
    const top10Uf = stats.getTopN(ufCounts, 10);

    createChart("chartTopUf", {
      type: "bar",
      data: {
        labels: top10Uf.map(([name]) => name || "N/A"),
        datasets: [
          {
            label: "Top 10 Estados (UF)",
            data: top10Uf.map(([, count]) => count),
            backgroundColor: "rgba(124, 58, 237, 0.7)",
          },
        ],
      },
      options: { responsive: true, indexAxis: "y" },
    });
  }

  // RF-A03: Tendência Mensal
  function renderTrendChart(data) {
    // Recebe allData
    // Esta lógica já filtra corretamente (só pega meses válidos)
    const groupedByMonth = stats.groupBy(
      data.filter((r) => r._mesAnoAnalise),
      "_mesAnoAnalise",
    );
    const months = Object.keys(groupedByMonth).sort();

    if (months.length <= 1) {
      // Só mostra se tiver mais de 1 mês
      document.getElementById("trend").classList.add("hidden");
      return;
    }

    document.getElementById("trend").classList.remove("hidden");

    const totalSolicitacoes = [];
    const tempoMedio = [];

    months.forEach((month) => {
      if (!month || month === "null") return;

      const rows = groupedByMonth[month];
      const tempos = rows
        .map((r) => r._tempoAnalise)
        .filter((t) => t !== null && t >= 0);

      totalSolicitacoes.push(rows.length);
      tempoMedio.push(stats.mean(tempos));
    });

    // Filtra "null" dos labels se houver
    const labels = months.filter((m) => m !== "null");
    if (labels.length <= 1) {
      document.getElementById("trend").classList.add("hidden");
      return;
    }

    createChart("chartMonthlyTrend", {
      type: "line",
      data: {
        labels: labels,
        datasets: [
          {
            label: "Total de Solicitações",
            data: totalSolicitacoes,
            borderColor: "rgba(59, 130, 246, 1)",
            backgroundColor: "rgba(59, 130, 246, 0.1)",
            yAxisID: "yVolume",
          },
          {
            label: "Tempo Médio de Análise (dias)",
            data: tempoMedio,
            borderColor: "rgba(234, 179, 8, 1)",
            backgroundColor: "rgba(234, 179, 8, 0.1)",
            yAxisID: "yTempo",
          },
        ],
      },
      options: {
        responsive: true,
        scales: {
          yVolume: {
            type: "linear",
            display: true,
            position: "left",
            title: { display: true, text: "Volume" },
          },
          yTempo: {
            type: "linear",
            display: true,
            position: "right",
            title: { display: true, text: "Dias" },
            grid: { drawOnChartArea: false }, // Não sobrepor grades
          },
        },
      },
    });
  }

  // --- 6. HELPERS DE GRÁFICOS ---

  function createChart(canvasId, config) {
    // Usa a biblioteca Chart (carregada no index.html)
    const ctx = document.getElementById(canvasId);
    if (!ctx) {
      console.error(`Canvas com id ${canvasId} não encontrado.`);
      return;
    }
    // Destrói gráfico anterior se existir
    if (chartInstances[canvasId]) {
      chartInstances[canvasId].destroy();
    }
    chartInstances[canvasId] = new Chart(ctx, config);
  }

  function renderPieChart(canvasId, data, key) {
    const counts = stats.countBy(data, key);
    const sortedData = Object.entries(counts).sort(([, a], [, b]) => b - a);
    const labels = sortedData.map(([name]) => name || "N/A");
    const values = sortedData.map(([, count]) => count);

    createChart(canvasId, {
      type: "doughnut",
      data: {
        labels: labels,
        datasets: [
          {
            data: values,
            backgroundColor: [
              // Paleta de cores
              "rgba(59, 130, 246, 0.7)",
              "rgba(234, 179, 8, 0.7)",
              "rgba(16, 185, 129, 0.7)",
              "rgba(239, 68, 68, 0.7)",
              "rgba(124, 58, 237, 0.7)",
              "rgba(217, 119, 6, 0.7)",
              "rgba(13, 148, 136, 0.7)",
              "rgba(107, 114, 128, 0.7)",
            ],
          },
        ],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: "bottom", labels: { boxWidth: 12 } } },
      },
    });
  }

  // ==========================================================
  // LÓGICA DE GERAÇÃO DE ANÁLISE (IA)
  // ==========================================================

  // Variável para mostrar/esconder o loading durante a geração do PDF
  const loadingIndicator = document.createElement("div");
  loadingIndicator.id = "pdfLoadingIndicator";
  loadingIndicator.className =
    "fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] hidden text-white text-lg font-bold";
  loadingIndicator.innerHTML =
    '<div class="bg-blue-700 p-4 rounded-lg shadow-2xl">Gerando Análise e PDF... Aguarde!</div>';
  document.body.appendChild(loadingIndicator);

  /**
   * Função auxiliar para chamar a API Gemini com retry.
   * @param {object} payload Payload da API
   * @returns {Promise<string>} Texto gerado ou string de erro.
   */
/*
/**
 * ESTA FUNÇÃO ESTÁ DESATIVADA (COMENTADA).
 * Realiza a chamada direta para a API do Gemini via Fetch.
 * @param {Object} payload - O corpo da requisição contendo o prompt e configurações.
 */
/*
async function callGeminiApi(payload) {
    // --- CONFIGURAÇÃO DE SEGURANÇA ---
    // AVISO: Hardcoding de chaves expõe seu segredo publicamente!
    const apiKey = ""; // <--- ESPAÇO PARA A CHAVE DO USUÁRIO

    // Verifica se o usuário esqueceu de preencher a chave
    if (!apiKey) {
      console.error("ERRO: A chave da API Gemini está ausente.");
      return "Erro ao gerar a análise automática. Chave da API ausente. Por favor, obtenha e insira sua chave da Gemini API no código para uso no GitHub Pages.";
    }

    // URL do endpoint oficial do Google para o modelo Gemini 2.5 Flash
    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    
    // Configurações para tentativas em caso de erro de instabilidade
    const maxRetries = 3;
    let delay = 1000; // Começa com 1 segundo de espera

    for (let i = 0; i < maxRetries; i++) {
      try {
        // Realiza a chamada POST para o Google
        const response = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        const result = await response.json();

        // Tratamento de Erros HTTP (ex: erro 429 por excesso de requisições ou 403 por chave inválida)
        if (!response.ok) {
          console.error(
            `Erro HTTP ${response.status}. Resposta do servidor:`,
            result,
          );
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        // Navega pela estrutura do JSON do Google para encontrar o texto gerado
        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;

        if (text) {
          return text; // Sucesso: retorna o resumo gerado
        } else {
          console.warn("Resposta da IA vazia. Objeto de resposta:", result);
          throw new Error("Resposta da IA vazia ou mal formatada.");
        }
      } catch (error) {
        // Se for a última tentativa e falhar, exibe erro fatal
        if (i === maxRetries - 1) {
          console.error("Falha final ao chamar a API Gemini:", error);
          return "Erro ao gerar a análise automática. Por favor, verifique a chave inserida e a conexão.";
        }
        
        // Estratégia de "Exponential Backoff": espera um pouco antes de tentar de novo
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2; // Dobra o tempo para a próxima tentativa
      }
    }
    return "Erro desconhecido ao comunicar com o serviço de análise.";
}
*/

  /**
   * Prepara os dados, monta o prompt e chama a API Gemini para gerar o resumo.
   * @param {Array<object>} data Dados filtrados do dashboard.
   * @returns {Promise<string>} Resumo analítico gerado pela IA.
   */
/*
/**
 * ESTA FUNÇÃO ESTÁ DESATIVADA (COMENTADA), MAS MANTIDA PARA REFERÊNCIA FUTURA.
 * Gera um resumo executivo de performance operacional utilizando a API do Gemini.
 * @param {Array} data - Array de objetos contendo os dados brutos das solicitações.
 */
/*
async function generateAnalysisSummary(data) {
    // Validação inicial: evita chamadas desnecessárias à API se não houver dados
    if (data.length === 0) {
      return "Não há dados no período selecionado para realizar a análise.";
    }

    // --- 1. COLETA E CÁLCULO DE KPIs ---
    // Extrai e limpa os tempos de análise (remove nulos e valores negativos)
    const temposAnalise = data
      .map((d) => d._tempoAnalise)
      .filter((t) => t !== null && t >= 0);
    
    const total = data.length;
    
    // Cálculos estatísticos básicos de tempo e volume
    const mediaTempo = stats.mean(temposAnalise).toFixed(1);
    const medianaTempo = stats.median(temposAnalise).toFixed(1);
    
    // Filtros para determinar o desfecho das solicitações
    const deferidas = data.filter(
      (d) => d["Situação Solicitação"] === "Deferida",
    ).length;
    const indeferidas = data.filter(
      (d) => d["Situação Solicitação"] === "Indeferida",
    ).length;

    // Cálculo percentual de conversão/decisão
    const taxaDeferimento = total > 0 ? ((deferidas / total) * 100).toFixed(1) : 0;
    const taxaIndeferimento = total > 0 ? ((indeferidas / total) * 100).toFixed(1) : 0;

    // --- 2. COLETA DE DADOS AGRUPADOS (Métricas de Analistas) ---
    const groupedByAnalyst = stats.groupBy(data, "Usuario Analista");
    const performanceData = [];

    for (const [analyst, rows] of Object.entries(groupedByAnalyst)) {
      // Ignora registros sem analista identificado
      if (!analyst || analyst === "undefined") continue;

      // Conta solicitações por dia para calcular média e consistência
      const dailyCounts = stats.countBy(
        rows.filter((r) => r._diaAnalise),
        "_diaAnalise",
      );

      performanceData.push({
        nome: analyst,
        totalMes: rows.length,
        // Média de entregas por dia trabalhado
        mediaDiaria: (Object.values(dailyCounts).length > 0
          ? rows.length / Object.values(dailyCounts).length
          : 0
        ).toFixed(1),
        // Desvio Padrão: indica se o analista é constante ou oscila muito na produtividade
        desvioPadrao: stats.stdDev(Object.values(dailyCounts)).toFixed(2),
      });
    }

    // Ordena do maior volume para o menor para identificar os "Top Performers"
    performanceData.sort((a, b) => b.totalMes - a.totalMes);

    // --- 3. ESTRUTURAÇÃO DO OBJETO PARA A IA ---
    // Aqui consolidamos apenas o que é relevante para o "insight" da IA
    const analysisData = {
      resumoGeral: {
        totalSolicitacoes: total,
        tempoMedioAnaliseDias: mediaTempo,
        tempoMedianoAnaliseDias: medianaTempo,
        taxaDeferimento: `${taxaDeferimento}%`,
        taxaIndeferimento: `${taxaIndeferimento}%`,
      },
      top5AnalistasPorVolume: performanceData.slice(0, 5).map((a) => ({
        nome: a.nome,
        volume: a.totalMes,
        consistenciaDesvioPadrao: a.desvioPadrao,
      })),
      top3SolicitacoesPorTipo: stats.getTopN(
        stats.countBy(data, "Tipo Solicitacão"),
        3,
      ),
      top3SituacaoPorUF: stats.getTopN(stats.countBy(data, "Codigo Uf"), 3),
    };

    // --- 4. CONFIGURAÇÃO DO PROMPT E CHAMADA DA API ---
    const userQuery = `Gere um resumo executivo em português (2 a 3 parágrafos, máximo 500 caracteres) da performance operacional baseado nestes dados JSON. Foque em destacar os principais pontos de atenção e pontos fortes. Dados para análise: ${JSON.stringify(analysisData)}`;

    const systemPrompt =
      "Você é um Analista de Performance Sênior. Sua tarefa é transformar dados operacionais brutos em um resumo executivo conciso, profissional e estratégico.";

    const payload = {
      contents: [{ parts: [{ text: userQuery }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      config: {
        temperature: 0.2,
        maxOutputTokens: 200,
      },
    };

    return callGeminiApi(payload);
}
*/

  // --- 7. EXPORTAÇÃO DE PDF (RF-A02) ---

  const btnPdfHeader = document.getElementById("exportPdfButton");
  const btnPdfDash = document.getElementById("exportPdfButtonDashboard");

  // Adiciona o evento apenas se o botão existir (evita erros)
  // O event listener precisa ser atualizado para chamar a função assíncrona
  if (btnPdfHeader)
    btnPdfHeader.addEventListener("click", () =>
      exportPDF().catch(console.error),
    );
  if (btnPdfDash)
    btnPdfDash.addEventListener("click", () =>
      exportPDF().catch(console.error),
    );


/**
 * Gera o Relatório em PDF com estrutura executiva, distribuído por páginas.
 * Inclui KPIs, análise de equipe, traduções de categorias e segurança de layout.
 */
async function exportPDF(overrideAnalyst = null) {
    if (!filteredData || filteredData.length === 0) {
        alert("Não há dados filtrados para exportar.");
        return;
    }

    const { jsPDF } = window.jspdf;
    const doc = new jsPDF({
        orientation: "portrait",
        unit: "mm",
        format: "a4"
    });

    // 1. FUNÇÃO AUXILIAR GLOBAL DO ESCOPO
    function formatarTempoPreciso(ms) {
        if (ms < 0 || isNaN(ms) || ms === null) return "0d 00h00m";
        const totalMinutos = Math.floor(ms / 60000);
        const totalHoras = Math.floor(totalMinutos / 60);
        const dias = Math.floor(totalHoras / 24);
        const horas = totalHoras % 24;
        const minutos = totalMinutos % 60;
        return `${dias}d ${horas.toString().padStart(2, '0')}h${minutos.toString().padStart(2, '0')}m`;
    }

    const loadingIndicator = document.getElementById("pdfLoadingIndicator");
    if (loadingIndicator) loadingIndicator.classList.remove("hidden");

    try {
        await new Promise(resolve => setTimeout(resolve, 400));

        const MARGIN_LEFT = 14;
        const PAGE_WIDTH = 210 - (MARGIN_LEFT * 2);
        let currentY = 20;

        const analistaFiltro = overrideAnalyst || document.getElementById("filterAnalyst")?.value || "all";        
        const dataInicio = document.getElementById("filterPeriodStart")?.value || "---";
        const dataFim = document.getElementById("filterPeriodEnd")?.value || "---";
        const nomeRelatorioAnalista = analistaFiltro === 'all' ? 'Geral' : analistaFiltro;
        const safeFileName = `Relatorio_CAF_${nomeRelatorioAnalista.replace(/\s/g, '_')}_${dataInicio}_a_${dataFim}`.replace(/[/\\?%*:|"<>]/g, '-');

        // 2. PRÉ-PROCESSAMENTO GLOBAL 
        const pdfData = analistaFiltro !== 'all' 
            ? filteredData.filter(d => d["Usuario Analista"] === analistaFiltro)
            : filteredData;

        if (pdfData.length === 0) {
            alert(`Não há registros suficientes para ${analistaFiltro} no período.`);
            if (loadingIndicator) loadingIndicator.classList.add("hidden");
            return;
        }

        const total = pdfData.length;
        
        const milissegundosFiltrados = filteredData.map(r => {
            return _calcBusinessTimeDiff(r._dataSolicitacao, r._dataAnalise);
        }).filter(ms => ms !== null && ms >= 0);

        const mediaMsGlobal = milissegundosFiltrados.length > 0 ? stats.mean(milissegundosFiltrados) : 0;
        const medianaMsGlobal = milissegundosFiltrados.length > 0 ? stats.median(milissegundosFiltrados) : 0;
        
        const tempoRealMedia = formatarTempoPreciso(mediaMsGlobal);
        const tempoRealMediana = formatarTempoPreciso(medianaMsGlobal);

        const temposDias = filteredData.map(d => d._tempoAnalise).filter(t => t !== null && t >= 0);
        const mediaDias = stats.mean(temposDias);
        const medianaDias = stats.median(temposDias);

        const deferidas = filteredData.filter(d => d["Situação Solicitação"] === "Deferida").length;
        const indeferidas = filteredData.filter(d => d["Situação Solicitação"] === "Indeferida").length;
        
        // Ajuste aqui: Se _tempoAnalise calcula em dias úteis, usamos ele para o SLA de 5 dias úteis
        const dentroSla = temposDias.filter(t => t <= 5).length;
        const taxaSla = total > 0 ? ((dentroSla / total) * 100).toFixed(1) : "0.0";

        // =========================================================================
        // PÁGINA 1: CAPA E RESUMO EXECUTIVO
        // =========================================================================
        doc.setFontSize(22);
        doc.setTextColor(41, 128, 186);
        doc.text("Relatório de Performance Operacional", MARGIN_LEFT, currentY);
        
        currentY += 12;
        doc.setDrawColor(41, 128, 186);
        doc.line(MARGIN_LEFT, currentY, MARGIN_LEFT + PAGE_WIDTH, currentY);
        
        currentY += 15;
        doc.setFontSize(12);
        doc.setTextColor(60);
        doc.text(`Analista: ${nomeRelatorioAnalista === 'all' ? 'Todos' : nomeRelatorioAnalista}`, MARGIN_LEFT, currentY);
        doc.text(`Período: ${dataInicio} até ${dataFim}`, MARGIN_LEFT, currentY + 7);
        doc.text(`Data de Geração: ${new Date().toLocaleString('pt-BR')}`, MARGIN_LEFT, currentY + 14);

        currentY += 30;
        doc.setFontSize(14);
        doc.setTextColor(41, 128, 186);
        doc.text("Resumo Executivo", MARGIN_LEFT, currentY);
        
        currentY += 8;
        doc.setFontSize(11);
        doc.setTextColor(100);
        
        const resumoTexto = `No período analisado, foram processadas ${total.toLocaleString('pt-BR')} solicitações. ` + 
                           `A eficiência média de análise foi de ${tempoRealMedia}, com um índice de ` + 
                           `cumprimento de SLA (até 5 dias) de ${taxaSla}%. ${analistaFiltro === 'all' ? 'A equipe apresentou a distribuição de carga detalhada a seguir.' : 'O analista manteve a consistência de entrega conforme os indicadores de desempenho.'}`;
        
        doc.text(doc.splitTextToSize(resumoTexto, PAGE_WIDTH), MARGIN_LEFT, currentY);

        // =========================================================================
        // PÁGINA 2: KPIs GERAIS
        // =========================================================================
        doc.addPage();
        currentY = 20;
        doc.setFontSize(16);
        doc.setTextColor(41, 128, 186);
        doc.text("Indicadores Chave de Desempenho (KPIs)", MARGIN_LEFT, currentY);
        
        doc.autoTable({
            startY: currentY + 8,
            head: [["Indicador", "Valor", "Análise"]],
            body: [
                ["Total de Solicitações", `${total.toLocaleString('pt-BR')}`, "Volume total processado."],
                ["Tempo Médio", `${tempoRealMedia}`, `Média real (${mediaDias.toFixed(1)} dias).`],
                ["Tempo Mediano", `${tempoRealMediana}`, `Valor central (${medianaDias.toFixed(1)} dias).`],
                ["Taxa de Deferimento", `${((deferidas / total) * 100).toFixed(1)}%`, "Percentual de aceites."],
                ["Índice de SLA (5 dias)", `${taxaSla}%`, "Aderência ao prazo regulamentar."]
            ],
            theme: "striped",
            headStyles: { fillColor: [41, 128, 186] },
            margin: { left: MARGIN_LEFT }
        });

        currentY = doc.lastAutoTable.finalY + 15;
        const notaKpi = `Destaque: O tempo mediano de ${tempoRealMediana} indica que a maior parte das demandas é resolvida neste prazo.`;
        doc.text(doc.splitTextToSize(notaKpi, PAGE_WIDTH), MARGIN_LEFT, currentY);

        // =========================================================================
        // PÁGINA 3: DESEMPENHO E RANKING
        // =========================================================================
        doc.addPage();
        currentY = 20;
        doc.setFontSize(16);
        doc.setTextColor(41, 128, 186);
        doc.text("Análise de Produtividade por Analista", MARGIN_LEFT, currentY);

        const situacaoVal = document.getElementById("filterSituation")?.value || "all";
        const ufVal = document.getElementById("filterUf")?.value || "all";
        
        const equipeNoPeriodo = allData.filter(row => {
            const analysisDate = _native_startOfDay(row._dataAnalise);
            const startDt = dataInicio !== "---" ? _native_startOfDay(_native_safeParseDate(dataInicio)) : null;
            const endDt = dataFim !== "---" ? _native_startOfDay(_native_safeParseDate(dataFim)) : null;
            const endLimit = endDt ? new Date(endDt.getTime() + 86400000) : null;
            
            return (!startDt || analysisDate >= startDt) && 
                   (!endLimit || analysisDate < endLimit) &&
                   (situacaoVal === "all" || row["Situação Solicitação"] === situacaoVal) &&
                   (ufVal === "all" || row["Codigo Uf"] === ufVal);
        });

        const totalEquipePeriodo = equipeNoPeriodo.length;
        const groupedByAnalyst = stats.groupBy(equipeNoPeriodo, "Usuario Analista");
        let teamData = [];

        for (const [name, rows] of Object.entries(groupedByAnalyst)) {
            if (!name || name === "undefined" || name === "null") continue;
            
            const dailyCounts = stats.countBy(rows.filter(r => r._diaAnalise), "_diaAnalise");
            const dailyValues = Object.values(dailyCounts);
            
            const milissegundosDoAnalista = rows.map(r => {
                return _calcBusinessTimeDiff(r._dataSolicitacao, r._dataAnalise);
            }).filter(ms => ms !== null && ms >= 0);
            
            const mediaMsAnalista = milissegundosDoAnalista.length > 0 ? stats.mean(milissegundosDoAnalista) : 0;
            const tempoFormatadoAnalista = formatarTempoPreciso(mediaMsAnalista);
            
            teamData.push({
                nome: name,
                total: rows.length,
                media: (rows.length / (dailyValues.length || 1)).toFixed(1),
                desvio: stats.stdDev(dailyValues),
                participacao: ((rows.length / totalEquipePeriodo) * 100).toFixed(1),
                tempoMedioMs: mediaMsAnalista,
                tempoMedioFormatado: tempoFormatadoAnalista
            });
        }

        teamData.sort((a, b) => b.total - a.total);

        const filteredTableRows = teamData
            .filter(item => analistaFiltro === "all" || item.nome === analistaFiltro)
            .map(item => [
                item.nome,
                item.total,
                item.media,
                Number(item.desvio).toFixed(2),
                item.participacao + "%"
            ]);

        doc.autoTable({
            startY: currentY + 8,
            head: [["Analista", "Total", "Média Diária", "Desvio Padrão", "Participação"]],
            body: filteredTableRows,
            theme: "grid",
            headStyles: { fillColor: [70, 70, 70] },
            columnStyles: { 
                1: { halign: 'center' }, 2: { halign: 'center' }, 
                3: { halign: 'center' }, 4: { halign: 'center' } 
            },
            margin: { left: MARGIN_LEFT }
        });

        currentY = doc.lastAutoTable.finalY + 15;
        doc.setFontSize(11);
        doc.setTextColor(100);

        let notaEquipe = "";
        if (analistaFiltro !== 'all') {
            const indexNoRanking = teamData.findIndex(a => a.nome === analistaFiltro);
            const posicao = indexNoRanking + 1;
            const dados = teamData[indexNoRanking];

            if (dados) {
                notaEquipe = `Análise: O analista ${analistaFiltro} apresentou o ${posicao}º maior volume de conclusões, ` +
                             `representando ${dados.participacao}% de participação em relação à equipe no período analisado. ` +
                             `A média diária do analista foi de ${dados.media} solicitações, com o tempo médio de atendimento de ${dados.tempoMedioFormatado}.`;
            } else {
                notaEquipe = `Análise: O analista selecionado não possui registros para o período/filtros atuais.`;
            }
        } else {
            const topAnalyst = teamData[0] ? teamData[0].nome : "N/A";
            const topPart = teamData[0] ? teamData[0].participacao : "0";
            const listaDesvios = teamData.map(d => d.desvio);
            const mediaDesvios = listaDesvios.length > 0 ? stats.mean(listaDesvios).toFixed(2) : "0.00";
            const statusFluxo = mediaDesvios > 2.5 ? "volatilidade acentuada" : "boa constância e estabilidade";

            notaEquipe = `Análise: O analista ${topAnalyst} liderou o volume de entregas com ${topPart}% de participação. ` +
                         `Globalmente, a equipe apresentou um tempo médio de resposta de ${tempoRealMedia}, com ${taxaSla}% de aderência ao SLA (5 dias). ` +
                         `O desvio padrão médio de ${mediaDesvios} indica uma ${statusFluxo} no fluxo produtivo do período.`;
        }

        doc.text(doc.splitTextToSize(notaEquipe, PAGE_WIDTH), MARGIN_LEFT, currentY);

        // =========================================================================
        // SEÇÃO DEDICADA: PERFORMANCE MENSAL (Com Média Diária e Notas Explicativas)
        // =========================================================================
        doc.addPage();
        currentY = 20;
        doc.setFontSize(16);
        doc.setTextColor(41, 128, 186);
        doc.text("Performance Mensal", MARGIN_LEFT, currentY);

        // Helper para calcular a quantidade de dias úteis de um determinado mês
        function getDiasUteisMes(year, monthIdx) {
            const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
            const calculatedMap = getCalculatedHolidays(year);
            let diasUteis = 0;

            for (let d = 1; d <= daysInMonth; d++) {
                const currentDate = new Date(year, monthIdx, d);
                const dayOfWeek = currentDate.getDay();
                if (dayOfWeek === 0 || dayOfWeek === 6) continue; // Pula fins de semana

                const yyyy = currentDate.getFullYear();
                const mm = (currentDate.getMonth() + 1).toString().padStart(2, "0");
                const dd = currentDate.getDate().toString().padStart(2, "0");
                const yyyy_mm_dd = `${yyyy}-${mm}-${dd}`;
                const dd_mm = `${mm}-${dd}`;

                const isFixed = FIXED_HOLIDAYS.has(dd_mm);
                const isMovable = movableHolidays.has(yyyy_mm_dd) || calculatedMap.has(yyyy_mm_dd);

                if (!isFixed && !isMovable) {
                    diasUteis++;
                }
            }
            return diasUteis > 0 ? diasUteis : 1;
        }

        // Helper para formatar milissegundos ou dias em texto amigável
        function formatarTempoMedioAmigavel(diasMedios) {
            if (diasMedios === null || isNaN(diasMedios) || diasMedios <= 0) {
                return "< 1 hora";
            }

            const totalMinutos = Math.round(diasMedios * 24 * 60);
            const totalHoras = Math.floor(totalMinutos / 60);
            const minutos = totalMinutos % 60;
            const dias = Math.floor(totalHoras / 24);
            const horasRestantes = totalHoras % 24;

            if (dias > 0) {
                return horasRestantes > 0 ? `${dias}d ${horasRestantes}h` : `${dias}d`;
            }
            if (totalHoras > 0) {
                return minutos > 0 ? `${totalHoras}h ${minutos}m` : `${totalHoras}h`;
            }
            return `${totalMinutos}m`;
        }

        // Helper para agrupar solicitações por Mês/Ano e calcular métricas
        function gerarLinhasPerformanceMensal(dataSet) {
            const grouped = {};

            dataSet.forEach(row => {
                if (!row._dataAnalise) return;
                const yyyy = row._dataAnalise.getFullYear();
                const mm = (row._dataAnalise.getMonth() + 1).toString().padStart(2, "0");
                const key = `${yyyy}-${mm}`;

                if (!grouped[key]) {
                    grouped[key] = {
                        year: yyyy,
                        monthIdx: row._dataAnalise.getMonth(),
                        deferida: 0,
                        deferidaParcial: 0,
                        indeferida: 0,
                        total: 0,
                        tempos: []
                    };
                }

                const sit = row["Situação Solicitação"];
                if (sit === "Deferida") grouped[key].deferida++;
                else if (sit === "Deferida Parcial") grouped[key].deferidaParcial++;
                else if (sit === "Indeferida") grouped[key].indeferida++;

                grouped[key].total++;

                if (row._tempoAnalise !== null && row._tempoAnalise >= 0) {
                    grouped[key].tempos.push(row._tempoAnalise);
                }
            });

            const monthNames = [
                "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
                "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"
            ];

            return Object.keys(grouped).sort().map(key => {
                const item = grouped[key];
                const diasUteis = getDiasUteisMes(item.year, item.monthIdx);
                const mediaDiaria = (item.total / diasUteis).toFixed(1).replace('.', ',');
                
                const mediaDias = item.tempos.length > 0 ? stats.mean(item.tempos) : 0;
                const tempoFormatado = formatarTempoMedioAmigavel(mediaDias);

                return [
                    `${monthNames[item.monthIdx]}/${item.year}`,
                    item.deferida.toLocaleString('pt-BR'),
                    item.deferidaParcial.toLocaleString('pt-BR'),
                    item.indeferida.toLocaleString('pt-BR'),
                    item.total.toLocaleString('pt-BR'),
                    mediaDiaria,
                    tempoFormatado
                ];
            });
        }

        currentY += 8;
        doc.setFontSize(12);
        doc.setTextColor(60);

        if (analistaFiltro === 'all') {
            // 1. NENHUM ANALISTA SELECIONADO: EXIBE SOMENTE A TABELA GERAL (EQUIPE)
            doc.text("Análise Geral (Todos os Analistas)", MARGIN_LEFT, currentY);

            const linhasGeral = gerarLinhasPerformanceMensal(equipeNoPeriodo);

            doc.autoTable({
                startY: currentY + 4,
                head: [["Mês", "Deferida", "Deferida Parcial", "Indeferida", "Total", "Média Diária", "Tempo Médio"]],
                body: linhasGeral.length > 0 ? linhasGeral : [["-", "0", "0", "0", "0", "0,0", "0,0 dias"]],
                theme: "striped",
                headStyles: { fillColor: [41, 128, 186] },
                styles: { fontSize: 8.5, cellPadding: 2.5 },
                columnStyles: {
                    0: { halign: 'left' },
                    1: { halign: 'center' },
                    2: { halign: 'center' },
                    3: { halign: 'center' },
                    4: { halign: 'center' },
                    5: { halign: 'center' },
                    6: { halign: 'center' }
                },
                margin: { left: MARGIN_LEFT }
            });
        } else {
            // 2. ANALISTA ESPECÍFICO SELECIONADO: EXIBE SOMENTE A TABELA INDIVIDUAL
            doc.text(`Análise Individual (${analistaFiltro})`, MARGIN_LEFT, currentY);

            const dadosAnalistaIndividual = equipeNoPeriodo.filter(row => row["Usuario Analista"] === analistaFiltro);
            const linhasIndividual = gerarLinhasPerformanceMensal(dadosAnalistaIndividual);

            doc.autoTable({
                startY: currentY + 4,
                head: [["Mês", "Deferida", "Deferida Parcial", "Indeferida", "Total", "Média Diária", "Tempo Médio"]],
                body: linhasIndividual.length > 0 ? linhasIndividual : [["-", "0", "0", "0", "0", "0,0", "0,0 dias"]],
                theme: "grid",
                headStyles: { fillColor: [70, 70, 70] },
                styles: { fontSize: 8.5, cellPadding: 2.5 },
                columnStyles: {
                    0: { halign: 'left' },
                    1: { halign: 'center' },
                    2: { halign: 'center' },
                    3: { halign: 'center' },
                    4: { halign: 'center' },
                    5: { halign: 'center' },
                    6: { halign: 'center' }
                },
                margin: { left: MARGIN_LEFT }
            });
        }

        // =========================================================================
        // OBSERVAÇÕES E NOTAS EXPLICATIVAS ABAIXO DA TABELA
        // =========================================================================
        currentY = doc.lastAutoTable.finalY + 8;
        doc.setFontSize(8.5);
        doc.setTextColor(100);

        const obsTexto = "Notas Explicativas:\n" +
            "• Tempo Médio: Tempo decorrido entre a solicitação e a análise, exibido em formato  de dias, horas ou minutos, considerando apenas dias úteis.\n" +
            "• Média Diária: Calculada com base no total de análises concluídas dividido pelo número de dias úteis do mês.";

        const obsLinhas = doc.splitTextToSize(obsTexto, PAGE_WIDTH);
        doc.text(obsLinhas, MARGIN_LEFT, currentY);


        // =========================================================================
        // PÁGINA 4: PERFIL DAS SOLICITAÇÕES
        // =========================================================================
        doc.addPage();
        currentY = 20;
        doc.setFontSize(16);
        doc.setTextColor(41, 128, 186);
        doc.text("Perfil e Distribuição das Demandas", MARGIN_LEFT, currentY);

        const profileSections = [
            { label: "Tipo de Fornecedor", key: "Tipo Fornecedor" },
            { label: "Categoria", key: "Categoria" },
            { label: "Tipo de Solicitação", key: "Tipo Solicitacão" }
        ];

        const categoriasMap = {
            "NO": "Normal - NO", "ME": "Microempresa - ME", "EPP": "Empresa de Pequeno Porte - EPP",
            "MEI": "Microempreendedor Individual - MEI", "EC": "Economia Solidária - EC",
            "ES": "Especial - ES", "AF": "Agricultura Familiar - AF"
        };

        profileSections.forEach((section) => {
            const counts = stats.countBy(pdfData, section.key);
            const tableBody = Object.entries(counts)
                .sort((a, b) => b[1] - a[1])
                .map(([name, count]) => {
                    let treatedName = name || "Não Informado";
                    if (section.key === "Tipo Fornecedor") {
                        if (treatedName.toLowerCase() === "juridica") treatedName = "Jurídica";
                        if (treatedName.toLowerCase() === "fisica") treatedName = "Física";
                    }
                    if (section.key === "Categoria") {
                        treatedName = categoriasMap[treatedName] || treatedName;
                    }
                    return [treatedName, count, `${((count / total) * 100).toFixed(1)}%`];
                });

            doc.autoTable({
                startY: currentY + 8,
                head: [[section.label, "Qtd", "%"]],
                body: tableBody,
                theme: "grid",
                styles: { fontSize: 9 },
                headStyles: { fillColor: [100, 100, 100] },
                margin: { left: MARGIN_LEFT }
            });
            currentY = doc.lastAutoTable.finalY + 12;
            if (currentY > 240) { doc.addPage(); currentY = 20; }
        });

        // =========================================================================
        // PÁGINA 5: ANÁLISE VISUAL
        // =========================================================================
        const isFiltroGlobalAtivoParaOAnalista = document.getElementById("filterAnalyst")?.value === analistaFiltro;

        if (analistaFiltro === 'all' || isFiltroGlobalAtivoParaOAnalista) {
            doc.addPage();
            currentY = 20;
            doc.setFontSize(16);
            doc.setTextColor(41, 128, 186);
            doc.text("Análise Gráfica de Tendências", MARGIN_LEFT, currentY);

            const chartsToExport = [
                { id: "chartWorkload", title: "Carga de Trabalho por Analista", note: "Distribuição proporcional da carga processada." },
                { id: "chartMonthlyTrend", title: "Tendência Mensal de Volume", note: "Histórico de entrada e agilidade de resposta." },
                { id: "chartAnalysisTime", title: "Distribuição do Tempo de Resposta", note: "Frequência de conclusão por faixa de dias." }
            ];

            for (const chart of chartsToExport) {
                const canvas = document.getElementById(chart.id);
                if (canvas && canvas.offsetParent !== null) {
                    if (currentY > 210) { doc.addPage(); currentY = 20; }
                    
                    doc.setFontSize(12);
                    doc.setTextColor(41, 128, 186);
                    doc.text(chart.title, MARGIN_LEFT, currentY + 5);
                    
                    const imgData = canvas.toDataURL("image/png", 2.0);
                    doc.addImage(imgData, 'PNG', MARGIN_LEFT, currentY + 10, 180, 70);
                    
                    currentY += 85;
                    doc.setFontSize(9);
                    doc.setTextColor(150);
                    doc.text(chart.note, MARGIN_LEFT, currentY);
                    currentY += 10;
                }
            }
        }

        // --- RODAPÉ DINÂMICO ---
        const pageCount = doc.internal.getNumberOfPages();
        for (let i = 1; i <= pageCount; i++) {
            doc.setPage(i);
            doc.setFontSize(8);
            doc.setTextColor(150);
            doc.text(`Relatório de Performance Operacional | Página ${i} de ${pageCount}`, MARGIN_LEFT, 288);
        }

        doc.save(`${safeFileName}.pdf`);

    } catch (error) {
        console.error("Erro no PDF:", error);
        alert("Erro ao gerar PDF.");
    } finally {
        if (loadingIndicator) loadingIndicator.classList.add("hidden");
    }
}


  // --- 8. EXPORTAÇÃO JSON E ROTINAS DE DADOS (NOVO) ---
  // Evento do Botão Exportar JSON
  const btnExportJson = document.getElementById("exportJsonButton");
  if (btnExportJson) {
    btnExportJson.addEventListener("click", () => {
      if (allData.length === 0) {
        alert("Não há dados para exportar.");
        return;
      }

      // 1. Limpa dados calculados (chaves começadas com '_') para economizar espaço
      // Precisamos salvar apenas os dados "crus" que vieram do CSV original
      const cleanData = allData.map((row) => {
        const newRow = { ...row };
        Object.keys(newRow).forEach((key) => {
          if (key.startsWith("_")) delete newRow[key];
        });
        return newRow;
      });

      // 2. Otimiza o formato (Matriz: cols + rows)
      const optimizedJson = optimizeDataForExport(cleanData);
      const jsonString = JSON.stringify(optimizedJson);

      // 3. Cria e dispara o download
      const blob = new Blob([jsonString], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "relatorio.json"; // Nome padrão para facilitar o carregamento futuro
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    });
  }

  // --- 9. DETALHAMENTO DO ANALISTA COM PAGINAÇÃO ---

  const sectionAnalystDetail = document.getElementById(
    "analyst-detail-section",
  );
  const analystNameDisplay = document.getElementById("analyst-name-display");
  const analystPagination = document.getElementById("analyst-pagination");
  const btnPagePrev = document.getElementById("btnPagePrev");
  const btnPageNext = document.getElementById("btnPageNext");
  const pageInfo = document.getElementById("pageInfo");
  const analystTableContainer = document.getElementById(
    "analyst-table-container",
  );
  const analystTableBody = document.getElementById("analyst-table-body");
  const analystMsg = document.getElementById("analyst-msg");
  const analystCountInfo = document.getElementById("analyst-count-info");

  // Variáveis de Estado da Paginação
  let currentAnalystData = [];
  let currentPage = 1;
  const itemsPerPage = 20;

  // Chamada dentro do updateDashboard
  function updateAnalystSectionVisibility() {
        const selectedAnalyst = document.getElementById("filterAnalyst").value;
        const thAnalista = document.querySelector('th[data-col="analista"]'); // Pega o cabeçalho novo

        sectionAnalystDetail.classList.remove("hidden");
        
        if (selectedAnalyst === "all") {
            analystNameDisplay.textContent = "Equipe Geral";
            if (thAnalista) thAnalista.classList.remove("hidden"); // MOSTRA se for geral
        } else {
            analystNameDisplay.textContent = selectedAnalyst;
            if (thAnalista) thAnalista.classList.add("hidden");    // OCULTA se for individual
        }

        currentAnalystData = [...filteredData];

        currentSort = { col: "dataAnalise", direction: "desc" };
        if (typeof updateSortIcons === "function") {
            updateSortIcons();
        }

        currentAnalystData.sort((a, b) => {
            const dateA = a._dataAnalise ? a._dataAnalise.getTime() : 0;
            const dateB = b._dataAnalise ? b._dataAnalise.getTime() : 0;
            return dateB - dateA;
        });

        currentPage = 1;
        renderAnalystTable();
   }

  function renderAnalystTable() {
    // Verifica se há dados
    if (currentAnalystData.length === 0) {
      analystTableContainer.classList.add("hidden");
      analystPagination.classList.add("hidden");
      analystMsg.classList.remove("hidden");
      analystCountInfo.classList.add("hidden");
      return;
    }

    analystTableContainer.classList.remove("hidden");
    analystMsg.classList.add("hidden");
    analystPagination.classList.remove("hidden");
    analystCountInfo.classList.remove("hidden");

    // Cálculos de Paginação
    const totalRecords = currentAnalystData.length;
    const totalPages = Math.ceil(currentAnalystData.length / itemsPerPage);

    // Garante limites seguros
    if (currentPage < 1) currentPage = 1;
    if (currentPage > totalPages) currentPage = totalPages;

    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    const pageData = currentAnalystData.slice(startIndex, endIndex);

    // --- HELPER LOCAL: Formata Texto (agora recebe ms direto) ---
    function formatDurationText(diffMs) {
      if (diffMs < 0) return "0m";

      const minutesTotal = Math.floor(diffMs / 60000);
      const hoursTotal = Math.floor(minutesTotal / 60);
      const days = Math.floor(hoursTotal / 24);
      const hours = hoursTotal % 24;
      const minutes = minutesTotal % 60;

      if (days > 0) return `${days}d ${hours}h`; // Removi o "(útil)" pois o badge já indica status
      if (hours > 0) return `${hours}h ${minutes}m`;
      return `${minutes}m`;
    }
    // ------------------------------------------------------------

    // Renderiza Linhas
    analystTableBody.innerHTML = "";

 pageData.forEach((row) => {
      const dataFormatada = row._dataAnalise
        ? _native_formatDate(row._dataAnalise, "dd/MM/yy")
        : "N/A";

      // --- LÓGICA DE COR DA DATA ---
      const statusDia = getDayStatus(row._dataAnalise);
      let dateColorClass = "text-gray-500 dark:text-gray-400";
      let dateTitle = ""; 

      if (statusDia.isWeekend || statusDia.isFixed || statusDia.isMovable) {
        dateColorClass = "text-[#380000] dark:text-red-300 font-medium";
        if (statusDia.isWeekend) dateTitle = "Fim de Semana";
        else if (statusDia.isFixed) dateTitle = "Feriado Fixo";
        else if (statusDia.isMovable) dateTitle = "Feriado Cadastrado";
      }

      // 1. CALCULA O TEMPO ÚTIL
      const rawDiff = _calcBusinessTimeDiff(row._dataSolicitacao, row._dataAnalise);

      // 2. FORMATA O TEXTO PARA EXIBIÇÃO
      const tempoTexto = formatDurationText(rawDiff);

      // 3. LÓGICA DO TERMÔMETRO (Cores)
      const oneDayMs = 24 * 60 * 60 * 1000;
      let badgeClass = "";

      if (rawDiff <= 2 * oneDayMs) {
        badgeClass = "bg-green-100 text-green-800 border border-green-200 dark:bg-green-900/30 dark:text-green-300 dark:border-green-800";
      } else if (rawDiff <= 4 * oneDayMs) {
        badgeClass = "bg-yellow-100 text-yellow-800 border border-yellow-200 dark:bg-yellow-900/30 dark:text-yellow-300 dark:border-yellow-800";
      } else if (rawDiff <= 5 * oneDayMs) {
        badgeClass = "bg-orange-100 text-orange-800 border border-orange-200 dark:bg-orange-900/30 dark:text-orange-300 dark:border-orange-800";
      } else {
        badgeClass = "bg-red-100 text-red-800 border border-red-200 dark:bg-red-900/30 dark:text-red-300 dark:border-red-800";
      }

      let statusClass = "text-gray-600 dark:text-gray-400"; 
      if (row["Situação Solicitação"] === "Deferida") statusClass = "text-green-600 dark:text-green-400 font-bold";
      if (row["Situação Solicitação"] === "Deferida Parcial") statusClass = "text-yellow-600 dark:text-yellow-400 font-bold";
      if (row["Situação Solicitação"] === "Indeferida") statusClass = "text-red-600 dark:text-red-400 font-bold";
      if (row["Situação Solicitação"] === "Em Análise") statusClass = "text-blue-600 dark:text-blue-400 font-bold";

      // --- LOGICA DINÂMICA DA COLUNA ANALISTA ---
      const selectedAnalyst = document.getElementById("filterAnalyst").value;
      const tdAnalista = selectedAnalyst === "all" 
        ? `<td class="px-4 py-2 text-sm text-gray-900 dark:text-white font-medium">${row["Usuario Analista"] || "N/A"}</td>` 
        : "";

      const tr = `
            <tr class="hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors">
                <td class="px-4 py-2 whitespace-nowrap text-sm ${dateColorClass}" title="${dateTitle}">
                    ${dataFormatada}
                </td>

                ${tdAnalista}
                
                <td class="px-4 py-2 whitespace-nowrap">
                    <span class="px-2 py-1 rounded-full text-xs font-semibold ${badgeClass}">
                        ${tempoTexto}
                    </span>
                </td>

                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  ${row["CNPJ/CPF"] || ""}
                </td>
                <td class="px-4 py-2 text-sm text-gray-600 dark:text-gray-300 truncate max-w-xs" title="${row["Razão Social/Nome"]}">
                  ${row["Razão Social/Nome"] || ""}
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm ${statusClass}">
                  ${row["Situação Solicitação"] || ""}
                </td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">
                  ${row["Tipo Solicitacão"] || ""}
                </td>
            </tr>
          `;
      analystTableBody.innerHTML += tr;
    });

    // --- LÓGICA DE ATUALIZAÇÃO DE CONTROLES E CONTAGEM ---

    // 1. Atualiza Controles da Paginação
    pageInfo.textContent = `Pág ${currentPage} de ${totalPages}`;

    btnPagePrev.disabled = currentPage === 1;
    btnPageNext.disabled = currentPage === totalPages;

    // 2. Atualiza a Contagem de Registros
    const startRecord = startIndex + 1;
    const endRecord = Math.min(endIndex, totalRecords);

    analystCountInfo.textContent = `Mostrando de ${startRecord.toLocaleString(
      "pt-BR",
    )} até ${endRecord.toLocaleString(
      "pt-BR",
    )} de ${totalRecords.toLocaleString("pt-BR")} registros.`;
  }

  // Atualiza Controles
  //pageInfo.textContent = `Pág ${currentPage} de ${totalPages}`;

  //btnPagePrev.disabled = currentPage === 1;
  // btnPageNext.disabled = currentPage === totalPages;
  // }

  // Event Listeners da Paginação
  if (btnPagePrev) {
    btnPagePrev.addEventListener("click", () => {
      if (currentPage > 1) {
        currentPage--;
        renderAnalystTable();
      }
    });
  }

  if (btnPageNext) {
    btnPageNext.addEventListener("click", () => {
      const totalPages = Math.ceil(currentAnalystData.length / itemsPerPage);
      if (currentPage < totalPages) {
        currentPage++;
        renderAnalystTable();
      }
    });
  }

  // ==========================================================
  // INTEGRAÇÃO COM HOME (DASHBOARD)
  // ==========================================================

  function gerarEstatisticasDashboard() {
    // Usa a variável 'allData' que já existe neste escopo
    if (!allData) return { solicitacoes: 0, indeferidas: 0 };

    const total = allData.length;
    const indeferidas = allData.filter(
      (d) => d["Situação Solicitação"] === "Indeferida",
    ).length;

    return {
      solicitacoes: total,
      indeferidas: indeferidas,
    };
  }

  function atualizarStatsExternos() {
    try {
      const stats = gerarEstatisticasDashboard();
      // Salva com a chave 'stats_dashboard' que a Home espera
      localStorage.setItem("stats_dashboard", JSON.stringify(stats));
      // console.log('Stats Dashboard atualizados:', stats);
    } catch (e) {
      console.error("Erro ao atualizar stats do dashboard:", e);
    }
  }

  // Listener para o PostMessage
  window.addEventListener("message", (event) => {
    if (event.data && event.data.type === "GET_STATS") {
      const stats = gerarEstatisticasDashboard();
      event.source.postMessage(
        {
          type: "STATS_RESPONSE",
          app: "dashboard", // Identificador para a Home saber quem respondeu
          data: stats,
        },
        event.origin,
      );
    }
  });

  // --- GERENCIADOR DE FERIADOS E CALENDÁRIO VISUAL (Atualizado com Modal de Nome) ---

  const modalHolidays = document.getElementById("holidayModal");
  const btnOpenHolidays = document.getElementById("btnOpenHolidays");
  const btnCloseHolidays = document.getElementById("btnCloseHolidays");
  const btnDownloadHolidays = document.getElementById("btnDownloadHolidays");
  const holidayListDisplay = document.getElementById("holidayListDisplay");
  const countHolidaysSpan = document.getElementById("countHolidays");

  // Elementos do Calendário
  const calGrid = document.getElementById("calGrid");
  const calMonthYear = document.getElementById("calMonthYear");
  const btnCalPrev = document.getElementById("calPrevMonth");
  const btnCalNext = document.getElementById("calNextMonth");
  const btnAddSelected = document.getElementById("btnAddSelected");

  // --- NOVOS ELEMENTOS DO MODAL DE NOME ---
  const nameModal = document.getElementById("nameModal");
  const inputHolidayName = document.getElementById("inputHolidayName");
  const btnCancelName = document.getElementById("btnCancelName");
  const btnConfirmName = document.getElementById("btnConfirmName");

  // Estado do Calendário
  let calDate = new Date();
  let tempHolidaysMap = new Map();
  let pendingSelection = new Set();
  let onNameConfirmAction = null; // Variável para o callback do modal

  // --- LÓGICA DO MODAL DE NOME ---
  function openNameModal(initialValue, callback) {
    inputHolidayName.value = initialValue || "";
    onNameConfirmAction = callback;
    nameModal.classList.remove("hidden");
    setTimeout(() => inputHolidayName.focus(), 100);
  }

  function closeNameModal() {
    nameModal.classList.add("hidden");
    onNameConfirmAction = null;
  }

  if (btnCancelName) btnCancelName.addEventListener("click", closeNameModal);

  if (btnConfirmName) {
    btnConfirmName.addEventListener("click", () => {
      const name = inputHolidayName.value.trim();
      if (name && onNameConfirmAction) {
        onNameConfirmAction(name);
        closeNameModal();
      } else if (!name) {
        alert("Por favor, digite um nome.");
        inputHolidayName.focus();
      }
    });
  }

  if (inputHolidayName) {
    inputHolidayName.addEventListener("keyup", (e) => {
      if (e.key === "Enter") btnConfirmName.click();
    });
  }

  // 1. Abertura do Modal Principal
  if (btnOpenHolidays) {
    btnOpenHolidays.addEventListener("click", () => {
      tempHolidaysMap = new Map(movableHolidays);
      pendingSelection.clear();
      calDate = new Date();
      calDate.setDate(1);

      renderHolidayList();
      renderCalendar();
      modalHolidays.classList.remove("hidden");
    });
  }

  if (btnCloseHolidays) {
    btnCloseHolidays.addEventListener("click", () =>
      modalHolidays.classList.add("hidden"),
    );
  }

  // 2. Navegação do Calendário
  if (btnCalPrev) btnCalPrev.addEventListener("click", () => changeMonth(-1));
  if (btnCalNext) btnCalNext.addEventListener("click", () => changeMonth(1));

  function changeMonth(delta) {
    calDate.setMonth(calDate.getMonth() + delta);
    renderCalendar();
  }

  // 3. Renderização do Calendário
  function renderCalendar() {
    if (!calGrid) return;
    calGrid.innerHTML = "";

    const calFooterList = document.getElementById("calFooterList");
    if (calFooterList) calFooterList.innerHTML = "";

    const year = calDate.getFullYear();
    const month = calDate.getMonth();

    // 1. Gera os feriados matemáticos para ESTE ano (Ex: Páscoa, Carnaval...)
    const calculatedHolidays = getCalculatedHolidays(year);

    const monthNames = [
      "Janeiro",
      "Fevereiro",
      "Março",
      "Abril",
      "Maio",
      "Junho",
      "Julho",
      "Agosto",
      "Setembro",
      "Outubro",
      "Novembro",
      "Dezembro",
    ];
    calMonthYear.textContent = `${monthNames[month]} ${year}`;

    const firstDayOfMonth = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    // Array para o rodapé
    let holidaysInThisMonth = [];

    // Espaços vazios para o alinhamento da semana
    for (let i = 0; i < firstDayOfMonth; i++) {
      const emptyCell = document.createElement("div");
      calGrid.appendChild(emptyCell);
    }

    // Loop pelos dias do mês
    for (let d = 1; d <= daysInMonth; d++) {
      const currentDate = new Date(year, month, d);
      const yyyy_mm_dd = _native_formatDate(currentDate, "yyyy-MM-dd");
      const dd_mm = yyyy_mm_dd.substring(5);

      const isWeekend =
        currentDate.getDay() === 0 || currentDate.getDay() === 6;

      // Verifica Fixo (Laranja)
      const isFixed = FIXED_HOLIDAYS.has(dd_mm);
      const fixedName = isFixed ? FIXED_HOLIDAYS.get(dd_mm) : null;

      // Verifica Manual (Vermelho)
      const isSaved = tempHolidaysMap.has(yyyy_mm_dd);
      const savedName = isSaved ? tempHolidaysMap.get(yyyy_mm_dd) : null;

      // Verifica Calculado/Automático (Roxo)
      const isCalculated = calculatedHolidays.has(yyyy_mm_dd);
      const calculatedName = isCalculated
        ? calculatedHolidays.get(yyyy_mm_dd)
        : null;

      const isSelected = pendingSelection.has(yyyy_mm_dd);

      const btn = document.createElement("button");
      btn.textContent = d;

      let classes = [
        "h-10",
        "w-full",
        "rounded-lg",
        "text-sm",
        "flex",
        "items-center",
        "justify-center",
        "transition-all",
        "relative",
      ];

      // --- LÓGICA DE PRIORIDADE VISUAL ---
      if (isSelected) {
        classes.push(
          "bg-blue-600",
          "dark:bg-blue-600", // Azul sólido funciona bem em ambos
          "text-white",
          "font-bold",
          "shadow-md",
          "scale-105",
          "dark:shadow-blue-900/50", // Sombra colorida no dark
        );
      } else if (isSaved) {
        classes.push(
          "bg-red-500",
          "dark:bg-red-600", // Vermelho sólido
          "text-white",
          "hover:bg-red-600",
          "dark:hover:bg-red-500",
          "font-medium",
        );
        btn.title = savedName + " (Manual)";
      } else if (isCalculated) {
        // ROXO: Pastel no Light vs Escuro/Neon no Dark
        classes.push(
          "bg-purple-200",
          "dark:bg-purple-900/60",
          "text-purple-900",
          "dark:text-purple-200",
          "font-bold",
          "border",
          "border-purple-300",
          "dark:border-purple-700",
        );
        btn.title = calculatedName + " (Calculado)";
      } else if (isFixed) {
        // LARANJA: Pastel no Light vs Escuro/Neon no Dark
        classes.push(
          "bg-orange-200",
          "dark:bg-orange-900/60",
          "text-orange-900",
          "dark:text-orange-200",
          "font-bold",
          "border",
          "border-orange-300",
          "dark:border-orange-700",
        );
        btn.title = fixedName + " (Fixo)";
      } else if (isWeekend) {
        classes.push(
          "bg-gray-100",
          "dark:bg-slate-800",
          "text-gray-400",
          "dark:text-slate-500",
          "dark:border",
          "dark:border-slate-700", // Adiciona borda no dark para separar
        );
      } else {
        classes.push(
          "bg-white",
          "dark:bg-slate-700", // Fundo Branco (Dia) vs Slate (Noite)
          "text-gray-700",
          "dark:text-gray-200", // Texto Escuro (Dia) vs Claro (Noite)
          "border",
          "dark:border-slate-600", // Borda Padrão vs Borda Escura
          "hover:bg-gray-50",
          "dark:hover:bg-slate-600", // Hover claro vs Hover escuro
          "hover:border-blue-300", // Mantém o azul no hover em ambos
        );
      }

      btn.className = classes.join(" ");

      // Evento de Clique
      btn.addEventListener("click", () => {
        if (isCalculated || isFixed) {
          alert(
            `Este é um feriado automático (${calculatedName || fixedName}). Você não precisa adicioná-lo manualmente.`,
          );
        } else {
          toggleDateSelection(yyyy_mm_dd);
        }
      });

      calGrid.appendChild(btn);

      // Coleta para o rodapé conforme o tipo detectado
      if (isSaved)
        holidaysInThisMonth.push({ day: d, name: savedName, type: "manual" });
      else if (isCalculated)
        holidaysInThisMonth.push({
          day: d,
          name: calculatedName,
          type: "calculado",
        });
      else if (isFixed)
        holidaysInThisMonth.push({ day: d, name: fixedName, type: "fixo" });
    }

    // --- RENDERIZAÇÃO DO RODAPÉ ---
    if (calFooterList) {
      if (holidaysInThisMonth.length === 0) {
        calFooterList.innerHTML = `<li class="text-gray-400 italic text-xs pl-2">Nenhum feriado registrado.</li>`;
      } else {
        // Ordena os feriados por dia do mês
        holidaysInThisMonth.sort((a, b) => a.day - b.day);

        holidaysInThisMonth.forEach((h) => {
          const li = document.createElement("li");
          li.className = "flex items-center gap-2";

          let colorClass = "bg-gray-400";
          if (h.type === "manual") colorClass = "bg-red-500";
          if (h.type === "fixo") colorClass = "bg-orange-400";
          if (h.type === "calculado") colorClass = "bg-purple-500";

          li.innerHTML = `
                    <span class="w-2 h-2 rounded-full ${colorClass}"></span>
                    <span class="font-bold w-6 text-right text-gray-700 dark:text-gray-300">${h.day}:</span>
                    <span class="truncate text-xs text-gray-700 dark:text-gray-300" title="${h.name}">${h.name}</span>
                `;
          calFooterList.appendChild(li);
        });
      }
    }

    // Atualiza o botão de ação (Adicionar Selecionados)
    if (btnAddSelected) {
      const count = pendingSelection.size;
      btnAddSelected.textContent =
        count > 0
          ? `Adicionar ${count} dia(s)...`
          : "Selecione dias no calendário";
      btnAddSelected.disabled = count === 0;

      if (count > 0) {
        btnAddSelected.classList.replace("bg-gray-400", "bg-blue-600");
      } else {
        btnAddSelected.classList.replace("bg-blue-600", "bg-gray-400");
      }
    }
  }

  function toggleDateSelection(dateStr) {
    if (tempHolidaysMap.has(dateStr)) {
      const currentName = tempHolidaysMap.get(dateStr);
      if (
        confirm(`"${currentName}" (${dateStr})\n\nDeseja remover este feriado?`)
      ) {
        tempHolidaysMap.delete(dateStr);
        renderHolidayList();
        renderCalendar();
      }
      return;
    }

    if (pendingSelection.has(dateStr)) {
      pendingSelection.delete(dateStr);
    } else {
      pendingSelection.add(dateStr);
    }
    renderCalendar();
  }

  // 4. Botão "Adicionar Selecionados" (ATUALIZADO COM MODAL)
  if (btnAddSelected) {
    btnAddSelected.addEventListener("click", () => {
      openNameModal("Feriado/Facultativo", (typedName) => {
        pendingSelection.forEach((date) => {
          tempHolidaysMap.set(date, typedName);
        });
        pendingSelection.clear();
        renderHolidayList();
        renderCalendar();
      });
    });
  }

  // 5. Lista Lateral (ATUALIZADO COM MODAL DE EDIÇÃO)
  function renderHolidayList() {
    if (!holidayListDisplay) return;
    holidayListDisplay.innerHTML = "";

    if (countHolidaysSpan) countHolidaysSpan.textContent = tempHolidaysMap.size;

    const sortedKeys = [...tempHolidaysMap.keys()].sort();

    if (sortedKeys.length === 0) {
      holidayListDisplay.innerHTML = `
          <div class="text-center p-4 text-gray-400 flex flex-col items-center">
              <span class="text-2xl mb-2">📅</span>
              <p>Nenhum feriado extra cadastrado.</p>
          </div>`;
      return;
    }

    sortedKeys.forEach((date) => {
      const name = tempHolidaysMap.get(date);
      const li = document.createElement("li");
      li.className =
        "flex justify-between items-center bg-white dark:bg-slate-900 p-3 rounded shadow-sm border-l-4 border-red-500 hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors group";

      const dt = _native_safeParseDate(date);
      const diaSemana = dt
        ? dt.toLocaleDateString("pt-BR", { weekday: "short" })
        : "";
      const dataFormatada = _native_formatDate(dt, "dd/MM/yy");

      li.innerHTML = `
          <div class="flex flex-col cursor-pointer flex-grow" title="Clique para editar nome">
              <div class="flex items-center gap-2">
                  <span class="font-bold text-gray-800 dark:text-gray-100">${dataFormatada}</span>
                  <span class="text-xs text-blue-600 font-semibold uppercase tracking-wide px-1 bg-blue-50 dark:bg-blue-900/40 rounded border border-blue-100 dark:border-blue-800 dark:text-blue-300">${name}</span>
              </div>
              <span class="text-xs text-gray-500 dark:text-gray-400 uppercase">${diaSemana}</span>
          </div>
          <button class="text-gray-300 dark:text-gray-500 hover:text-red-600 dark:hover:text-red-400 transition-colors p-2" title="Remover">
              ✕
          </button>
        `;

      li.querySelector("div").addEventListener("click", () => {
        openNameModal(name, (newName) => {
          tempHolidaysMap.set(date, newName);
          renderHolidayList();
          renderCalendar();
        });
      });

      li.querySelector("button").addEventListener("click", (e) => {
        e.stopPropagation();
        if (confirm(`Remover "${name}"?`)) {
          tempHolidaysMap.delete(date);
          renderHolidayList();
          renderCalendar();
        }
      });

      holidayListDisplay.appendChild(li);
    });
  }

  async function syncFeriadosToSupabase(mapaFeriados) {
    const { data: existentes, error: selError } = await supabaseClient
      .from("feriados")
      .select("data");
    if (selError) throw selError;

    const datasNovas = new Set(mapaFeriados.keys());
    const datasParaApagar = (existentes || [])
      .map((r) => r.data)
      .filter((d) => !datasNovas.has(d));

    if (datasParaApagar.length > 0) {
      const { error: delError } = await supabaseClient
        .from("feriados")
        .delete()
        .in("data", datasParaApagar);
      if (delError) throw delError;
    }

    const linhas = [...mapaFeriados.entries()].map(([data, nome]) => ({ data, nome }));
    if (linhas.length > 0) {
      const { error: upsertError } = await supabaseClient
        .from("feriados")
        .upsert(linhas, { onConflict: "data" });
      if (upsertError) throw upsertError;
    }
  }

  if (btnDownloadHolidays) {
    btnDownloadHolidays.addEventListener("click", async () => {
      btnDownloadHolidays.disabled = true;
      try {
        await syncFeriadosToSupabase(tempHolidaysMap);
        movableHolidays = new Map(tempHolidaysMap);
        modalHolidays.classList.add("hidden");
        alert("Feriados publicados no Supabase! O Dashboard será recalculado agora.");
        updateDashboard();
      } catch (err) {
        console.error("Erro ao publicar feriados no Supabase:", err);
        alert("Erro ao publicar feriados. Veja o console.");
      } finally {
        btnDownloadHolidays.disabled = false;
      }
    });
  }

  //----------------------------------------------------------------------------------------//
  //----------------------------------------------------------------------------------------//

  // --- LÓGICA DE ORDENAÇÃO DA TABELA DE ANALISTAS ---

  // Adiciona eventos de clique aos cabeçalhos
  const headers = document.querySelectorAll(
    "#analyst-detail-section th[data-col]",
  );
  headers.forEach((th) => {
    th.addEventListener("click", () => {
      const col = th.getAttribute("data-col");
      handleSort(col);
    });
  });

  function handleSort(column) {
    // 1. Define a direção (inverte se clicar na mesma coluna)
    if (currentSort.col === column) {
      currentSort.direction = currentSort.direction === "asc" ? "desc" : "asc";
    } else {
      currentSort.col = column;
      currentSort.direction = "asc"; // Padrão ao clicar em nova coluna
    }

    // 2. Atualiza Ícones Visuais
    updateSortIcons();

    // 3. Executa a Ordenação no Array de Dados (currentAnalystData)
    currentAnalystData.sort((a, b) => {
      let valA, valB;

      // Extrai os valores baseado na coluna
      switch (column) {
        case "dataAnalise":
          valA = a._dataAnalise ? a._dataAnalise.getTime() : 0;
          valB = b._dataAnalise ? b._dataAnalise.getTime() : 0;
          break;

        case "analista":
          valA = (a["Usuario Analista"] || "").toLowerCase();
          valB = (b["Usuario Analista"] || "").toLowerCase();
          break;

        case "tempo":
          // Usa a mesma função de cálculo de dias úteis para ordenar
          valA = _calcBusinessTimeDiff(a._dataSolicitacao, a._dataAnalise);
          valB = _calcBusinessTimeDiff(b._dataSolicitacao, b._dataAnalise);
          break;

        case "cnpj":
          // Remove pontuação para ordenar como número puro
          const cleanA = (a["CNPJ/CPF"] || "").replace(/\D/g, "");
          const cleanB = (b["CNPJ/CPF"] || "").replace(/\D/g, "");
          // Compara como números se possível, senão string
          valA = cleanA ? Number(cleanA) : 0;
          valB = cleanB ? Number(cleanB) : 0;
          break;

        case "razao":
          valA = (a["Razão Social/Nome"] || "").toLowerCase();
          valB = (b["Razão Social/Nome"] || "").toLowerCase();
          break;

        case "situacao":
          valA = (a["Situação Solicitação"] || "").toLowerCase();
          valB = (b["Situação Solicitação"] || "").toLowerCase();
          break;

        case "tipo":
          valA = (a["Tipo Solicitacão"] || "").toLowerCase();
          valB = (b["Tipo Solicitacão"] || "").toLowerCase();
          break;

        default:
          return 0;
      }

      // Comparação Genérica
      if (valA < valB) return currentSort.direction === "asc" ? -1 : 1;
      if (valA > valB) return currentSort.direction === "asc" ? 1 : -1;
      return 0;
    });

    // 4. Volta para a página 1 e renderiza
    currentPage = 1;
    renderAnalystTable();
  }

  function updateSortIcons() {
    headers.forEach((th) => {
      const col = th.getAttribute("data-col");
      const iconSpan = th.querySelector(".sort-icon");

      if (col === currentSort.col) {
        // Coluna ativa: mostra seta correta
        iconSpan.textContent = currentSort.direction === "asc" ? "↑" : "↓";
        iconSpan.classList.add("text-blue-600", "font-bold");
        iconSpan.classList.remove("text-gray-400");
      } else {
        // Coluna inativa: mostra neutro
        iconSpan.textContent = "⇅";
        iconSpan.classList.remove("text-blue-600", "font-bold");
        iconSpan.classList.add("text-gray-400");
      }
    });
  }



      
      window.closeWelcomeModal = function() {
          const dontShow = document.getElementById("dontShowDashboardAgain").checked;
          if (dontShow) {
              localStorage.setItem("intro_dashboard_shown", "true");
          }
          document.getElementById("welcomeModalDashboard").style.display = "none";
      };


  // Função para verificar se deve mostrar o modal ao carregar
  function checkWelcomeModal() {
      const hasShown = localStorage.getItem("intro_dashboard_shown");
      if (!hasShown) {
          const modal = document.getElementById("welcomeModalDashboard");
          if (modal) {
              modal.style.display = "flex";
              modal.classList.remove("hidden");
          }
      }
  }

  function initComparisonFilters(data) {
    const analysts = [...new Set(data.map(d => d["Usuario Analista"]))].filter(Boolean).sort();
    ["compareAnalyst1", "compareAnalyst2", "compareAnalyst3"].forEach(id => {
        const sel = document.getElementById(id);
        analysts.forEach(a => sel.add(new Option(a, a)));
    });

    document.getElementById("btnRunComparison").addEventListener("click", runComparison);
}

function runComparison() {
    const selectedNames = [
        document.getElementById("compareAnalyst1").value,
        document.getElementById("compareAnalyst2").value,
        document.getElementById("compareAnalyst3").value
    ].filter(v => v !== "none");

    if (selectedNames.length < 2) {
        alert("Selecione pelo menos 2 analistas para comparar.");
        return;
    }

    // 1. IMPORTANTE: Primeiro aplicamos os filtros normais (Data, UF, etc)
    // Isso garante que estamos comparando dentro do período certo.
    applyFilters(); 

    // 2. Agora restringimos o resultado APENAS aos nomes selecionados na comparação
    filteredData = filteredData.filter(d => selectedNames.includes(d["Usuario Analista"]));

    // 3. Ajustamos o seletor principal de Analista para "Todos" 
    // para evitar que o applyFilters() dentro do updateDashboard sobrescreva a lista.
    document.getElementById("filterAnalyst").value = "all";

    // 4. Renderizamos os gráficos e KPIs com esse novo set de dados
    // Chamamos as funções de renderização diretamente para pular o applyFilters() automático
    renderKPIs(filteredData);
    renderTeamPerformance(filteredData);
    renderOperationalEfficiency(filteredData);
    renderRequestProfile(filteredData);
    renderGeography(filteredData);

    // Esconde a seção de radar que você não quer mais
    document.getElementById("comparison-results").classList.add("hidden");

    window.scrollTo({ top: 0, behavior: 'smooth' });
    console.log("Comparação aplicada para:", selectedNames);
}

function renderComparisonCharts(data) {
    const ctx = document.getElementById('chartComparisonRadar');
    if (chartInstances['chartComparisonRadar']) chartInstances['chartComparisonRadar'].destroy();

    // Normalização para o Radar (0-100)
    const datasets = data.map((d, i) => {
        const colors = ['rgba(59, 130, 246', 'rgba(234, 179, 8', 'rgba(16, 185, 129'];
        return {
            label: d.nome,
            data: [
                Math.min(d.total / 2, 100), // Ex: 200 analises = 100 pts
                Math.max(100 - (d.SLA * 10), 0), // Menor SLA = Mais pontos
                d.qualidade,
                d.assinatura
            ],
            backgroundColor: `${colors[i]}, 0.2)`,
            borderColor: `${colors[i]}, 1)`,
            borderWidth: 2
        };
    });

    chartInstances['chartComparisonRadar'] = new Chart(ctx, {
        type: 'radar',
        data: {
            labels: ['Volume', 'Velocidade (SLA)', 'Qualidade', 'Ass. Digital'],
            datasets: datasets
        },
        options: { scales: { r: { suggestMin: 0, suggestMax: 100 } } }
    });
}

// ==========================================================
  // EXPORTAÇÕES INDIVIDUAIS DO ANALISTA (CHAMADAS PELA TABELA)
  // ==========================================================
  
  // Wrapper Global para o botão PDF da Tabela
  window.exportAnalystPDF = function(analystName) {
      exportPDF(analystName).catch(console.error);
  };

  // Lógica Global do Gerador de Planilha (CSV) para Excel
  window.exportAnalystCSV = function(analystName) {
      // 1. Pega os dados que já estão filtrados por data globalmente,
      //    e restringe apenas ao analista clicado.
      const dataToExport = filteredData.filter(row => row["Usuario Analista"] === analystName);

      if (dataToExport.length === 0) {
          alert(`Não há registros de análises para ${analystName} no período selecionado.`);
          return;
      }

      // 2. Faz o de/para formatando a saída de acordo com o padrão exigido
      const csvData = dataToExport.map(row => {
          // Traduz a Situação
          let tipoSolicitacaoOriginal = (row["Tipo Solicitacão"] || "").toLowerCase();
          let tipoFinal = row["Tipo Solicitacão"] || "";
          
          if (tipoSolicitacaoOriginal.includes("nova")) {
              tipoFinal = "Inscrição";
          } else if (tipoSolicitacaoOriginal.includes("altera")) {
              tipoFinal = "Atualização";
          }

          // Cálculo do Status SLA
          const tempoDias = row._tempoAnalise !== null && row._tempoAnalise >= 0 ? row._tempoAnalise : -1;
          let slaStatus = "N/A";
          if (tempoDias >= 0) {
              slaStatus = tempoDias <= 5 ? "No Prazo" : "Atrasado";
          }

          const protocoloStr = row["Num Solicitacao"] || row["IdSolicitacao"] || "";
          const cnpjStr = row["CNPJ/CPF"] || "";

          // Formatação limpa de objeto
          return {
              "Protocolo": protocoloStr ? protocoloStr + "\t" : "",
              "CNPJ/CPF": cnpjStr ? cnpjStr + "\t" : "",
              "Razão Social / Solicitante": row["Razão Social/Nome"] || "",
              "Data Solicitação": row["Data Solicitacao"] || "",
              "Data Análise": row["Data Análise"] || "",
              "Tempo de Análise (Dias Úteis)": tempoDias >= 0 ? tempoDias : "0",
              "Status do SLA": slaStatus,
              "Situação": row["Situação Solicitação"] || "",
              "Tipo Solicitação": tipoFinal,
              "Categoria": row["Categoria"] || "",
              "Analista Responsável": row["Usuario Analista"] || ""
          };
      });

      // 3. Utiliza a biblioteca PapaParse (já instanciada no HTML) para montar o CSV
      // Utilizamos o delimitador ';' nativo para Excel Português
      const csvString = Papa.unparse(csvData, {
          delimiter: ";",
          header: true
      });

      // 4. Adiciona Byte Order Mark (BOM) para o Excel reconhecer acentos sem quebrar
      const blob = new Blob(["\uFEFF" + csvString], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      
      const safeName = analystName.replace(/\s/g, '_');
      a.download = `Relatorio_CAF_${safeName}.csv`;
      
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
  };

}; // FECHA O window.onload
