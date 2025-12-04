// Espera a página inteira carregar
window.onload = function () {
  // --- Funções Nativas de Data (para substituir date-fns) ---

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
          timeParts[2] || 0
        );
        if (!isNaN(dt.getTime())) return dt;
      }
    }

    // Última tentativa com o parser nativo
    const nativeDt = new Date(dateString);
    if (!isNaN(nativeDt.getTime())) return nativeDt;

    return null; // Retorna nulo se tudo falhar
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
      dateLeft.getDate()
    );
    const utc2 = Date.UTC(
      dateRight.getFullYear(),
      dateRight.getMonth(),
      dateRight.getDate()
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

  // Ajuste no Auto-Load para mostrar botões se der certo
  async function tryAutoLoadJson() {
    try {
      const response = await fetch("./relatorio.json");
      if (response.ok) {
        const jsonOptimized = await response.json();
        const jsonRaw = restoreDataFromImport(jsonOptimized);
        allData = processRawData(jsonRaw);
        filteredData = [...allData];

        initDashboard(allData);
        toggleHeaderButtons(true); // <--- MOSTRA OS BOTÕES

        document.getElementById("uploadScreen").classList.add("hidden");
        document.getElementById("dashboardScreen").classList.remove("hidden");
        console.log("Histórico JSON carregado automaticamente.");
        document.getElementById("uploadStatus").textContent =
          "Histórico carregado.";
        atualizarStatsExternos();
      }
    } catch (error) {
      console.log("Nenhum arquivo relatorio.json encontrado.");
    }
  }
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
  const btnFullReset = document.getElementById("btnFullReset");

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

  // 2. Lógica de RESET (Limpar Tudo - Lixeira)
  if (btnFullReset) {
    btnFullReset.addEventListener("click", resetApplication);
  }

  // Função unificada de Reset
  function resetApplication() {
    if (
      allData.length > 0 &&
      !confirm(
        "Tem certeza? Isso apagará TODOS os dados da tela para começar do zero."
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
  dropzone.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-blue-500", "bg-blue-50");
  });
  dropzone.addEventListener("dragleave", () =>
    dropzone.classList.remove("border-blue-500", "bg-blue-50")
  );
  dropzone.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-blue-500", "bg-blue-50");
    handleFiles(e.dataTransfer.files);
  });
  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFiles(fileInput.files));

  function handleFiles(files) {
    if (files.length === 0) {
      uploadStatus.textContent = "Nenhum arquivo selecionado.";
      return;
    }
    uploadStatus.textContent = `Carregando ${files.length} arquivo(s)...`;

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

            // --- REMOVIDO: toggleHeaderButtons(true) ---
            // (Não existe mais, pois os botões estão sempre visíveis no dashboard)

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

  function processRawData(data) {
    // --- ADICIONADO PARA DEBUG ---
    const rejectedRows = [];
    // ---------------------------

    const processedData = data.map((row) => {
      const dataSolicitacao = _native_safeParseDate(row["Data Solicitacao"]);
      const dataAnalise = _native_safeParseDate(row["Data Análise"]);

      let tempoAnalise = null;
      if (dataSolicitacao && dataAnalise) {
        tempoAnalise = _native_differenceInDays(dataAnalise, dataSolicitacao);
      }

      // --- ADICIONADO PARA DEBUG ---
      // Se a data de análise for nula, guarde a linha para verificação
      if (!dataAnalise && row["Data Análise"]) {
        // Só loga se não for nula mas falhou o parse
        rejectedRows.push(row);
      }
      // ---------------------------

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

    // --- ADICIONADO PARA DEBUG ---
    // Imprime os dados rejeitados no console
    console.warn(`[DEBUG] Linhas totais recebidas do CSV: ${data.length}`);
    console.warn(
      `[DEBUG] Linhas rejeitadas (Data Análise inválida, não-vazia): ${rejectedRows.length}`
    );
    if (rejectedRows.length > 0) {
      console.warn(
        "[DEBUG] Amostra de linhas rejeitadas (primeiras 20):",
        rejectedRows.slice(0, 20)
      );
    }
    // ---------------------------

    // CORREÇÃO: Removemos o filtro! Agora o dashboard vai carregar todas as linhas.
    return processedData;
    // return processedData.filter(row => row._dataAnalise); // <-- FILTRO REMOVIDO
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
      [...years].sort((a, b) => b - a)
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
      (opt) => opt.value === targetYear.toString()
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

  function mergeData(oldData, newData) {
    // Cria um Set com assinaturas únicas dos dados antigos para verificação rápida
    // Assinatura = concatenação de campos chave (Ex: Data + Solicitante + Protocolo)
    const existingSignatures = new Set(
      oldData.map(
        (item) =>
          `${item["Data Solicitacao"]}|${item["Numero Protocolo"]}|${item["Nome Fornecedor"]}`
      )
    );

    const uniqueNewData = newData.filter((item) => {
      const signature = `${item["Data Solicitacao"]}|${item["Numero Protocolo"]}|${item["Nome Fornecedor"]}`;
      return !existingSignatures.has(signature);
    });

    console.log(
      `Merge: ${oldData.length} antigos + ${uniqueNewData.length} novos únicos.`
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
            <div class="bg-white p-4 rounded-lg shadow-md text-center">
                <div class="flex items-center justify-center gap-2">
                    <h4 class="text-sm font-medium text-gray-500 uppercase">${title}</h4>
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
                <p class="text-3xl font-bold text-gray-900 mt-1">${value}</p>
            </div>
        `;
  }

  // RF02: KPIs Gerais
  function renderKPIs(data) {
    const kpiContainer = document.getElementById("kpis");
    if (!data.length) {
      kpiContainer.innerHTML =
        "<p class='col-span-full text-center text-gray-500'>Sem dados para exibir KPIs.</p>";
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
      (d) => d["Situação Solicitação"] === "Deferida"
    ).length;
    const indeferidas = data.filter(
      (d) => d["Situação Solicitação"] === "Indeferida"
    ).length;
    const assinadas = data.filter(
      (d) => d["Assinado Digitalmente"] === "Assinado Digitalmente"
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
              total.toLocaleString("pt-BR")
            )}
            ${renderKpiCard(
              "Tempo Médio",
              `${mediaTempo} dias`,
              "Média de (Data Análise - Data Solicitacao)."
            )}
            ${renderKpiCard(
              "Tempo Mediano",
              `${medianaTempo} dias`,
              "Valor central do tempo de análise. Menos sensível a outliers que a média."
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
        "<tr><td colspan='5' class='text-center py-4 text-gray-500'>Sem dados de equipe para exibir.</td></tr>";
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
        "_diaAnalise"
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
    performanceData.forEach((d) => {
      const row = `
                <tr>
                    <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">${
                      d.nome
                    }</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.totalMes.toLocaleString(
                      "pt-BR"
                    )}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.mediaDiaria.toFixed(
                      1
                    )}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.desvioPadrao.toFixed(
                      2
                    )}</td>
                    <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500">${d.participacao.toFixed(
                      1
                    )}%</td>
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
      "_diaAnalise"
    );
    const sortedEntries = Object.entries(entryByDay).sort(
      ([a], [b]) => _native_safeParseDate(a) - _native_safeParseDate(b)
    );

    createChart("chartEntryVolume", {
      type: "line",
      data: {
        labels: sortedEntries.map(([date]) =>
          _native_formatDate(_native_safeParseDate(date), "dd/MM/yy")
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
      "_mesAnoAnalise"
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
  const loadingIndicator = document.createElement('div');
  loadingIndicator.id = 'pdfLoadingIndicator';
  loadingIndicator.className = 'fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100] hidden text-white text-lg font-bold';
  loadingIndicator.innerHTML = '<div class="bg-blue-700 p-4 rounded-lg shadow-2xl">Gerando Análise e PDF... Aguarde!</div>';
  document.body.appendChild(loadingIndicator);


  /**
   * Função auxiliar para chamar a API Gemini com retry.
   * @param {object} payload Payload da API
   * @returns {Promise<string>} Texto gerado ou string de erro.
   */
  async function callGeminiApi(payload) {
    // >>> IMPORTANTE: PARA FUNCIONAR NO GITHUB PAGES, VOCÊ DEVE INSERIR SUA CHAVE AQUI <<<
    // AVISO: Hardcoding de chaves expõe seu segredo publicamente!
    const apiKey = ""; // <--- SUBSTITUA ESTE VALOR COM SUA CHAVE REAL AQUI!

    if (!apiKey) {
      console.error("ERRO: A chave da API Gemini está ausente.");
      return "Erro ao gerar a análise automática. Chave da API ausente. Por favor, obtenha e insira sua chave da Gemini API no código para uso no GitHub Pages.";
    }

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-preview-09-2025:generateContent?key=${apiKey}`;
    const maxRetries = 3;
    let delay = 1000;

    for (let i = 0; i < maxRetries; i++) {
      try {
        const response = await fetch(apiUrl, {
          method: 'POST',
          // Re-adicionamos o header Content-Type para chamadas fetch padrão em navegadores
          headers: { 'Content-Type': 'application/json' }, 
          body: JSON.stringify(payload)
        });

        const result = await response.json();
        
        if (!response.ok) {
          // Se houver um erro HTTP (ex: 400, 401, 500), mostramos a resposta completa para debug
          console.error(`Erro HTTP ${response.status}. Resposta do servidor:`, result);
          throw new Error(`HTTP error! status: ${response.status}`);
        }

        const text = result.candidates?.[0]?.content?.parts?.[0]?.text;
        
        if (text) {
          return text;
        } else {
          console.warn("Resposta da IA vazia. Objeto de resposta:", result);
          throw new Error("Resposta da IA vazia ou mal formatada.");
        }

      } catch (error) {
        if (i === maxRetries - 1) {
          console.error("Falha final ao chamar a API Gemini:", error);
          return "Erro ao gerar a análise automática. Por favor, verifique a chave inserida e a conexão.";
        }
        // Exponential backoff
        await new Promise(resolve => setTimeout(resolve, delay));
        delay *= 2; 
      }
    }
    return "Erro desconhecido ao comunicar com o serviço de análise.";
  }

  /**
   * Prepara os dados, monta o prompt e chama a API Gemini para gerar o resumo.
   * @param {Array<object>} data Dados filtrados do dashboard.
   * @returns {Promise<string>} Resumo analítico gerado pela IA.
   */
  async function generateAnalysisSummary(data) {
    if (data.length === 0) {
      return "Não há dados no período selecionado para realizar a análise.";
    }

    // 1. Coleta dos KPIs
    const temposAnalise = data
      .map((d) => d._tempoAnalise)
      .filter((t) => t !== null && t >= 0);
    const total = data.length;
    const mediaTempo = stats.mean(temposAnalise).toFixed(1);
    const medianaTempo = stats.median(temposAnalise).toFixed(1);
    const deferidas = data.filter(d => d["Situação Solicitação"] === "Deferida").length;
    const indeferidas = data.filter(d => d["Situação Solicitação"] === "Indeferida").length;
    const taxaDeferimento = total > 0 ? ((deferidas / total) * 100).toFixed(1) : 0;
    const taxaIndeferimento = total > 0 ? ((indeferidas / total) * 100).toFixed(1) : 0;

    // 2. Coleta de Dados Agrupados (Top N)
    const groupedByAnalyst = stats.groupBy(data, "Usuario Analista");
    const performanceData = [];
    for (const [analyst, rows] of Object.entries(groupedByAnalyst)) {
        if (!analyst || analyst === "undefined") continue;
        const dailyCounts = stats.countBy(rows.filter((r) => r._diaAnalise), "_diaAnalise");
        performanceData.push({
            nome: analyst,
            totalMes: rows.length,
            mediaDiaria: (Object.values(dailyCounts).length > 0 ? rows.length / Object.values(dailyCounts).length : 0).toFixed(1),
            desvioPadrao: stats.stdDev(Object.values(dailyCounts)).toFixed(2),
        });
    }
    performanceData.sort((a, b) => b.totalMes - a.totalMes);
    
    // 3. Estrutura de Dados para a IA
    const analysisData = {
        resumoGeral: {
            totalSolicitacoes: total,
            tempoMedioAnaliseDias: mediaTempo,
            tempoMedianoAnaliseDias: medianaTempo,
            taxaDeferimento: `${taxaDeferimento}%`,
            taxaIndeferimento: `${taxaIndeferimento}%`,
        },
        top5AnalistasPorVolume: performanceData.slice(0, 5).map(a => ({
            nome: a.nome,
            volume: a.totalMes,
            consistenciaDesvioPadrao: a.desvioPadrao
        })),
        top3SolicitacoesPorTipo: stats.getTopN(stats.countBy(data, "Tipo Solicitacão"), 3),
        top3SituacaoPorUF: stats.getTopN(stats.countBy(data, "Codigo Uf"), 3),
        
    };
    
    const userQuery = `Gere um resumo executivo em português (2 a 3 parágrafos, máximo 500 caracteres) da performance operacional baseado nestes dados JSON. Foque em destacar os principais pontos de atenção (como gargalos no tempo médio, alta taxa de indeferimento ou baixa consistência dos analistas) e pontos fortes. Dê um tom profissional e direto. Dados para análise: ${JSON.stringify(analysisData)}`;

    const systemPrompt = "Você é um Analista de Performance Sênior. Sua tarefa é transformar dados operacionais brutos em um resumo executivo conciso, profissional e estratégico, focado em insights e acionabilidade.";

    const payload = {
        contents: [{ parts: [{ text: userQuery }] }],
        systemInstruction: { parts: [{ text: systemPrompt }] },
        config: {
            // Garante que o texto seja direto e não divague
            temperature: 0.2,
            maxOutputTokens: 200, 
        }
    };

    return callGeminiApi(payload);
  }
 

// --- 7. EXPORTAÇÃO DE PDF (RF-A02) ---

  const btnPdfHeader = document.getElementById("exportPdfButton");
  const btnPdfDash = document.getElementById("exportPdfButtonDashboard");

  // Adiciona o evento apenas se o botão existir (evita erros)
  // O event listener precisa ser atualizado para chamar a função assíncrona
  if (btnPdfHeader) btnPdfHeader.addEventListener("click", () => exportPDF().catch(console.error));
  if (btnPdfDash) btnPdfDash.addEventListener("click", () => exportPDF().catch(console.error));

  /**
   * Gera o Relatório em PDF. Agora é assíncrona para aguardar a análise da IA.
   */
  async function exportPDF() {
    loadingIndicator.classList.remove('hidden');

    // 1. Acessa o jsPDF e verifica a biblioteca
    const { jsPDF } = window.jspdf;
    if (!jsPDF) {
      console.error("jsPDF não carregado!");
      loadingIndicator.classList.add('hidden');
      return;
    }

    // 2. GERAÇÃO DA ANÁLISE DE IA
    const analysisText = await generateAnalysisSummary(filteredData);
    
    // 3. INICIALIZAÇÃO DO PDF
    const data = filteredData;
    const doc = new jsPDF();
    let currentY = 22; // Posição Y inicial

    // Título do Relatório
    const start = document.getElementById("filterPeriodStart").value || "N/A";
    const end = document.getElementById("filterPeriodEnd").value || "N/A";
    doc.setFontSize(18);
    doc.text("Relatório de Performance Operacional", 14, currentY);
    currentY += 8;
    doc.setFontSize(11);
    doc.text(`Período de Análise: ${start} a ${end}`, 14, currentY);
    currentY += 10;
    
    // 4. ADICIONA O RESUMO DA ANÁLISE (IA)
    doc.setFontSize(14);
    doc.text("Resumo Executivo (Análise de IA)", 14, currentY);
    currentY += 5;
    doc.setFontSize(10);
    
    // Divide o texto da IA em linhas para caber no PDF
    const splitText = doc.splitTextToSize(analysisText, 180); // 180mm de largura
    doc.text(splitText, 14, currentY);
    currentY += splitText.length * 5; // Ajusta Y baseado no número de linhas

    currentY += 10; // Espaço antes dos KPIs

    // 5. Seção de KPIs (RF02)
    doc.setFontSize(14);
    doc.text("Indicadores Chave (KPIs)", 14, currentY);
    currentY += 5;

    // ... (Mantém a lógica de coleta de KPIs do HTML, pois ela é rápida)
    const kpiSection = document.getElementById("kpis");
    let kpiData = [];
    if (kpiSection.querySelector("p.text-gray-500")) {
      kpiData.push(["KPIs", "Sem dados para exibir"]);
    } else {
      kpiData = [
        ["Total Solicitações:", kpiSection.querySelector("div:nth-child(1) p").textContent],
        ["Tempo Médio Análise:", kpiSection.querySelector("div:nth-child(2) p").textContent],
        ["Tempo Mediano Análise:", kpiSection.querySelector("div:nth-child(3) p").textContent],
        ["Taxa Deferimento:", kpiSection.querySelector("div:nth-child(4) p").textContent],
        ["Taxa Indeferimento:", kpiSection.querySelector("div:nth-child(5) p").textContent],
        ["Taxa Assinatura Digital:", kpiSection.querySelector("div:nth-child(6) p").textContent],
      ];
    }

    doc.autoTable({
      startY: currentY,
      head: [["Indicador", "Valor"]],
      body: kpiData,
      theme: "striped",
      headStyles: { fillColor: [41, 128, 186] },
    });
    currentY = doc.autoTable.previous.finalY;

    // 6. Seção Performance da Equipe (Tabela RF03)
    currentY += 15;
    doc.setFontSize(14);
    doc.text("Performance da Equipe", 14, currentY);
    currentY += 5;

    // --- CÁLCULO DE PERFORMANCE PARA O PDF (Garante dados consistentes) ---
    const totalVisivel = data.length;
    const groupedByAnalyst = stats.groupBy(data, "Usuario Analista");
    const performanceData = [];
    const teamHead = [
      "Nome",
      "Total Mês",
      "Média Diária",
      "Desvio Padrão",
      "Participação",
    ];
    let teamBody = [];

    for (const [analyst, rows] of Object.entries(groupedByAnalyst)) {
      if (!analyst || analyst === "undefined") continue;

      const totalMes = rows.length;
      // Cálculo da Média Diária (baseado em dias únicos de trabalho)
      const dailyCounts = stats.countBy(
        rows.filter((r) => r._diaAnalise),
        "_diaAnalise"
      );
      const dailyValues = Object.values(dailyCounts);
      const diasUnicos = dailyValues.length;

      const mediaDiaria = diasUnicos > 0 ? totalMes / diasUnicos : 0;
      const desvioPadrao = stats.stdDev(dailyValues);
      const participacao =
        totalVisivel > 0 ? (totalMes / totalVisivel) * 100 : 0;

      performanceData.push({
        totalMes: totalMes,
        data: [
          analyst,
          totalMes.toLocaleString("pt-BR"),
          mediaDiaria.toFixed(1),
          desvioPadrao.toFixed(2),
          `${participacao.toFixed(1)}%`,
        ],
      });
    }

    // Ordena e monta o corpo da tabela
    performanceData.sort((a, b) => b.totalMes - a.totalMes);
    teamBody = performanceData.map((d) => d.data);
    // ----------------------------------------------------------------------

    if (teamBody.length === 0) {
      doc.setFontSize(11);
      doc.text(
        "Sem dados de equipe para exibir.",
        14,
        currentY + 5
      );
      currentY += 10;
    } else {
      doc.autoTable({
        startY: currentY + 5,
        head: [teamHead], // Usa o novo cabeçalho
        body: teamBody,  // Usa os dados recalculados
        theme: "grid",
      });
      currentY = doc.autoTable.previous.finalY;
    }

    // 7. Gráficos (Opcional, mas incluído com layout em duas colunas)
    try {
      // IDs dos gráficos que queremos exportar
      const chartIds = [
        "chartWorkload",        // Carga de Trabalho
        "chartAnalysisTime",    // Distribuição do Tempo
        "chartEntryVolume",     // Volume de Entrada
        "chartQuality",         // Qualidade por Analista
        "chartMonthlyTrend"     // Tendência Mensal (se estiver visível)
      ];

      let yPos = 30;
      const chartWidth = 90; // Largura do gráfico em mm (para duas colunas)
      const chartHeight = 60; // Altura do gráfico em mm
      const marginX = 14;
      const marginY = 10;
      let xPos = marginX;
      let chartIndex = 0;

      doc.addPage();
      doc.setFontSize(14);
      doc.text("Gráficos de Performance e Eficiência", marginX, 22);

      chartIds.forEach((id) => {
        const chartInstance = chartInstances[id];
        const chartEl = document.getElementById(id);

        // Verifica se a instância existe e se o elemento está visível
        if (chartInstance && chartEl && chartEl.closest('section') && !chartEl.closest('section').classList.contains('hidden')) {
            
          // 1. Converte o gráfico para Base64 (Qualidade 1.0 para nitidez)
          const chartImage = chartEl.toDataURL("image/png", 1.0);

          // 2. Decide a posição (duas colunas)
          if (chartIndex % 2 === 0) {
            // Coluna 1
            xPos = marginX;
          } else {
            // Coluna 2
            xPos = marginX + chartWidth + marginY;
          }

          // 3. Adiciona página se não houver espaço suficiente para mais um gráfico
          if (yPos + chartHeight > 280) {
            doc.addPage();
            yPos = 30;
            doc.setFontSize(14);
            doc.text("Gráficos de Performance e Eficiência (cont.)", marginX, 22);
            xPos = marginX; // Reseta para a primeira coluna
          }

          // 4. Adiciona a imagem ao PDF
          doc.addImage(chartImage, "PNG", xPos, yPos, chartWidth, chartHeight);
          
          // 5. Atualiza a posição Y para a próxima linha
          if (chartIndex % 2 !== 0) {
            yPos += chartHeight + marginY;
          }
          
          chartIndex++;
        }
      });

      // Adicionar uma nova página para os Gráficos de Perfil (Pizza)
      if (chartIndex > 0) {
        doc.addPage();
        doc.setFontSize(14);
        doc.text("Perfil das Solicitações e Geográfico", marginX, 22);

        // Gráficos de Perfil e Geo
        const profileChartIds = [
            "chartReqType",
            "chartCategory",
            "chartTopCities",
            "chartTopUf"
        ];
        
        yPos = 30;
        xPos = marginX;
        chartIndex = 0;
        
        profileChartIds.forEach((id) => {
            const chartInstance = chartInstances[id];
            const chartEl = document.getElementById(id);

            if (chartInstance && chartEl) {
                const chartImage = chartEl.toDataURL("image/png", 1.0);

                if (chartIndex % 2 === 0) {
                    xPos = marginX;
                } else {
                    xPos = marginX + chartWidth + marginY;
                }
                
                if (yPos + chartHeight > 280) {
                    doc.addPage();
                    yPos = 30;
                    doc.setFontSize(14);
                    doc.text("Perfil das Solicitações e Geográfico (cont.)", marginX, 22);
                    xPos = marginX;
                }
                
                doc.addImage(chartImage, "PNG", xPos, yPos, chartWidth, chartHeight);
                
                if (chartIndex % 2 !== 0) {
                    yPos += chartHeight + marginY;
                }
                
                chartIndex++;
            }
        });
      }

    } catch (e) {
      console.error("Erro ao adicionar gráficos ao PDF:", e);
    }
    
    // 8. Finaliza
    doc.save(`Relatorio_Operacional_${start}_a_${end}.pdf`);
    loadingIndicator.classList.add('hidden'); // Esconde o loading
  }
  
  // --- 8. EXPORTAÇÃO JSON E ROTINAS DE DADOS (NOVO) ---

  // Função auxiliar: Transforma Array de Objetos em Formato Matriz (Mais leve)
  function optimizeDataForExport(data) {
    if (!data || data.length === 0) return { cols: [], rows: [] };

    // Pega as chaves do primeiro objeto (ignorando as chaves internas que começam com _)
    const keys = Object.keys(data[0]).filter((k) => !k.startsWith("_"));

    const rows = data.map((obj) => {
      return keys.map((k) => obj[k]); // Mapeia apenas os valores na ordem das chaves
    });

    return { cols: keys, rows: rows };
  }

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
    "analyst-detail-section"
  );
  const analystNameDisplay = document.getElementById("analyst-name-display");
  const analystPagination = document.getElementById("analyst-pagination");
  const btnPagePrev = document.getElementById("btnPagePrev");
  const btnPageNext = document.getElementById("btnPageNext");
  const pageInfo = document.getElementById("pageInfo");
  const analystTableContainer = document.getElementById(
    "analyst-table-container"
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

    if (selectedAnalyst === "all") {
      sectionAnalystDetail.classList.add("hidden");
      return;
    }

    // Mostra a seção
    sectionAnalystDetail.classList.remove("hidden");
    analystNameDisplay.textContent = selectedAnalyst;

    // 1. Carrega e Prepara os Dados
    // Filtra de allData para ter todo o histórico (ou filteredData se quiser respeitar os filtros de data)
    currentAnalystData = [...filteredData];
    // Ordena: Mais recentes primeiro
    currentAnalystData.sort((a, b) => {
      const dateA = a._dataAnalise ? a._dataAnalise.getTime() : 0;
      const dateB = b._dataAnalise ? b._dataAnalise.getTime() : 0;
      return dateB - dateA;
    });

    // 2. Reseta para página 1 e renderiza
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

    // Renderiza Linhas
    analystTableBody.innerHTML = "";
    pageData.forEach((row) => {
      const dataFormatada = row._dataAnalise
        ? _native_formatDate(row._dataAnalise, "dd/MM/yy")
        : "N/A";

      let statusClass = "text-gray-600";
      if (row["Situação Solicitação"] === "Deferida")
        statusClass = "text-green-600 font-bold";
      if (row["Situação Solicitação"] === "Deferida Parcial")
        statusClass = "text-yellow-600 font-bold";
      if (row["Situação Solicitação"] === "Indeferida")
        statusClass = "text-red-600 font-bold";
      if (row["Situação Solicitação"] === "Em Análise")
        statusClass = "text-blue-600 font-bold";

      const tr = `
            <tr class="hover:bg-gray-50 transition-colors">
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${dataFormatada}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-900">${
                  row["CNPJ/CPF"] || ""
                }</td>
                <td class="px-4 py-2 text-sm text-gray-600 truncate max-w-xs" title="${
                  row["Razão Social/Nome"]
                }">${row["Razão Social/Nome"] || ""}</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm ${statusClass}">${
        row["Situação Solicitação"] || ""
      }</td>
                <td class="px-4 py-2 whitespace-nowrap text-sm text-gray-500">${
                  row["Tipo Solicitacão"] || ""
                }</td>
            </tr>
          `;
      analystTableBody.innerHTML += tr;
    });

    // --- NOVA LÓGICA DE ATUALIZAÇÃO DE CONTROLES E CONTAGEM ---

    // 1. Atualiza Controles da Paginação
    pageInfo.textContent = `Pág ${currentPage} de ${totalPages}`;

    btnPagePrev.disabled = currentPage === 1;
    btnPageNext.disabled = currentPage === totalPages;

    // 2. Atualiza a Contagem de Registros
    const startRecord = startIndex + 1;
    const endRecord = Math.min(endIndex, totalRecords);

    analystCountInfo.textContent = `Mostrando de ${startRecord.toLocaleString(
        "pt-BR"
    )} até ${endRecord.toLocaleString(
        "pt-BR"
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
      (d) => d["Situação Solicitação"] === "Indeferida"
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
        event.origin
      );
    }
  });
}; // FECHA O window.onload
