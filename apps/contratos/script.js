// Estado global da aplicação
let db = {
  contratos: [],
  empresas: [],
};
// Variáveis do formulário de contrato
let currentFormStep = 1;
let tempContratoData = {};
let acaoConfirmada = null;

// --- Navegação inteligente pelo Stepper ---
function tentarNavegarParaPasso(passoAlvo) {
  // Não faz nada se clicar no passo atual
  if (passoAlvo === currentFormStep) return;

  // Se estiver voltando (ex: do 3 para o 1), permite sempre
  if (passoAlvo < currentFormStep) {
    showFormStep(passoAlvo);
    return;
  }

  // Se estiver avançando (ex: do 1 para o 3), precisa validar TODOS os passos intermediários
  // Ex: Para ir para o 3, o 1 e o 2 precisam estar válidos.
  for (let i = currentFormStep; i < passoAlvo; i++) {
    if (!validateStep(i)) {
      // Se falhar na validação do passo 'i', para nele e avisa
      return;
    }
    saveStepData(i); // Salva os dados do passo atual antes de avançar
  }

  // Se passou por todas as validações, avança
  showFormStep(passoAlvo);
}

// --- Funções de Formatação ---

function formatCurrency(value) {
  if (typeof value !== "number") {
    value = parseFloat(value) || 0;
  }

  // Detecta se o número tem mais de 2 casas decimais e ajusta a formatação
  const s = String(value);
  const p = s.indexOf(".");
  const decimals = p !== -1 && s.length - p - 1 > 2 ? 3 : 2;

  return value.toLocaleString("pt-BR", {
    style: "currency",
    currency: "BRL",
    minimumFractionDigits: decimals,
    maximumFractionDigits: 3, // Permite até 3
  });
}

function formatDate(dateString) {
  if (!dateString) return "N/D";
  // Adiciona checagem para datas que já possam estar formatadas
  if (dateString.includes("/")) return dateString;

  const parts = dateString.split("-");
  if (parts.length !== 3) return dateString; // Retorna original se formato inesperado

  const [year, month, day] = parts;
  return `${day}/${month}/${year}`;
}

function parseDate(dateString) {
  // Formato DD/MM/YYYY -> YYYY-MM-DD
  if (!dateString || !dateString.includes("/")) return dateString;
  const [day, month, year] = dateString.split("/");
  return `${year}-${month}-${day}`;
}

// --- FUNÇÃO DE COR PARA GRÁFICOS ---
function getItemColor(descricao) {
  const desc = descricao.toLowerCase();
  if (desc.includes("emissão") || desc.includes("cnd")) {
    return "#f97316"; // Laranja (ex: Emissão CND)
  }
  if (desc.includes("faixa 1")) {
    return "#22c55e"; // Verde (ex: Consulta Faixa 1)
  }
  if (desc.includes("faixa 2")) {
    return "#3b82f6"; // Azul (ex: Consulta Faixa 2)
  }
  return "#6b7280"; // Cinza (para outros)
}

// Formata input como BRL (1.000,00)
function formatInputAsBRL(e) {
  let value = e.target.value.replace(/\D/g, ""); // Remove não-numéricos
  if (value.length === 0) {
    e.target.value = "";
    return;
  }

  value = value.padStart(3, "0");

  let cents = value.slice(-2);
  let reais = value.slice(0, -2);

  reais = reais.replace(/^0+/, "") || "0";
  reais = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  e.target.value = `${reais},${cents}`;
}

// Formata input como BRL com 3 casas decimais (ex: 1.000,000)
function formatInputAsBRL_3dec(e) {
  let value = e.target.value.replace(/\D/g, "");
  if (value.length === 0) {
    e.target.value = "";
    return;
  }

  value = value.padStart(4, "0");

  let cents = value.slice(-3); // Pega os 3 últimos dígitos
  let reais = value.slice(0, -3); // Pega o resto

  reais = reais.replace(/^0+/, "") || "0";
  reais = reais.replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  e.target.value = `${reais},${cents}`;
}

// Converte BRL formatado para número (float)
function parseBRL(value) {
  if (typeof value !== "string" || value.length === 0) return 0;
  return parseFloat(value.replace(/\./g, "").replace(",", ".")) || 0;
}

// Capitaliza a primeira letra de cada palavra
function capitalizeWords(str) {
  if (typeof str !== "string") return "";
  const exceptions = ["de", "da", "do", "dos", "das"];
  return str
    .toLowerCase()
    .split(" ")
    .map((word) => {
      if (exceptions.includes(word)) {
        return word;
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

// Formata o input para capitalizar
function formatInputAsCapitalized(e) {
  const start = e.target.selectionStart;
  const end = e.target.selectionEnd;
  e.target.value = capitalizeWords(e.target.value);
  e.target.setSelectionRange(start, end); // Preserva posição do cursor
}

// Reseta o estado visual do formulário (para Novo/Editar/Aditivo)
function resetarFormularioContrato() {
  document.getElementById("form-contrato").reset();

  // Limpa IDs de controle
  document.getElementById("contrato-id").value = "";
  document.getElementById("contrato-parentId").value = "";

  // Reseta o stepper
  document.getElementById("stepper-contrato").style.display = "flex";

  // Oculta seção de aditivo
  const fieldsetAditivo = document.getElementById("fieldset-aditivo");
  fieldsetAditivo.style.display = "none";
  fieldsetAditivo.querySelectorAll("select, input").forEach((el) => {
    el.removeAttribute("required");
  });

  // Reseta labels
  document.getElementById("label-valor-total").textContent = "Valor Total (R$)";
  document.getElementById("label-data-fim").textContent = "Data Fim";

  // Oculta as seções dinâmicas do aditivo
  document.getElementById("aditivo-valor-fields").style.display = "none";
  document.getElementById("aditivo-prazo-fields").style.display = "none";
  document.getElementById("aditivo-gestor-fiscal-fields").style.display =
    "none";

  // Limpa container de fiscais
  document.getElementById("fiscais-container").innerHTML = "";

  // Limpa dados temporários
  tempContratoData = { unidade: {}, empresa: {} };

  // Limpa links dos processos
  document.getElementById("contrato-link-sei").value = "";
  document.getElementById("aditivo-link-sei").value = "";

  // Reseta dropdown de aditivo (para o Termo de Cooperação)
  const aditivoTipoSelect = document.getElementById("aditivo-tipo");
  Array.from(aditivoTipoSelect.options).forEach((option) => {
    option.style.display = "block";
  });
}

// --- NOVA FUNÇÃO PARA RENDERIZAR GRÁFICO DETALHADO ---
function atualizarGraficoDetalhado(pagamentos) {
  const container = document.getElementById("container-grafico-detalhado");
  const filtroAnoVal = document.getElementById("filtro-ano").value;
  const filtroMesVal = document.getElementById("filtro-mes").value;

  if (!container) return;

  // --- LÓGICA DE DADOS (Semelhante à anterior) ---

  // 1. Encontra todos os itens únicos primeiro
  const itensMasterSet = new Set();
  pagamentos.forEach((p) => {
    if (p.detalhes) {
      p.detalhes.forEach((item) =>
        itensMasterSet.add(item.descricao || "Item não descrito")
      );
    }
  });
  // Ordena para que a legenda seja consistente
  const itensMasterList = [...itensMasterSet].sort();

  // 2. Processa os dados com base nos filtros
  const dadosItens = {}; // Para o gráfico de Mês Específico
  const dadosMensais = {}; // Para o gráfico de Linha Anual

  let totalMesEspecifico = 0;
  let maxValorItemIndividual = 0; // Para escalar o eixo Y do gráfico de linha

  // Inicializa os 12 meses com todos os itens zerados
  for (let i = 0; i < 12; i++) {
    // 0 = Jan, 11 = Dez
    dadosMensais[i] = {};
    itensMasterList.forEach((desc) => (dadosMensais[i][desc] = 0));
  }

  pagamentos.forEach((p) => {
    if (!p.periodoAte || !p.detalhes) return;

    const dataCompetencia = new Date(p.periodoAte + "T00:00:00");
    const ano = dataCompetencia.getFullYear().toString();
    const mes = dataCompetencia.getMonth(); // 0-11

    // Filtra por ANO
    if (filtroAnoVal === "todos" || ano === filtroAnoVal) {
      p.detalhes.forEach((item) => {
        const qtd = parseFloat(item.quantidade) || 0;
        const valUnit = parseFloat(item.valorUnitario) || 0;
        const valorTotalItem = qtd * valUnit;
        const desc = item.descricao || "Item não descrito";

        // Acumula para o gráfico MENSAL (de Linha)
        dadosMensais[mes][desc] =
          (dadosMensais[mes][desc] || 0) + valorTotalItem;

        // Encontra o novo valor máximo para a escala do eixo Y
        if (dadosMensais[mes][desc] > maxValorItemIndividual) {
          maxValorItemIndividual = dadosMensais[mes][desc];
        }

        // Acumula para o gráfico de ITENS (se filtro de MÊS específico)
        if (filtroMesVal !== "todos" && mes.toString() === filtroMesVal) {
          dadosItens[desc] = (dadosItens[desc] || 0) + valorTotalItem;
          totalMesEspecifico += valorTotalItem;
        }
      });
    }
  });

  // --- LÓGICA DE RENDERIZAÇÃO ATUALIZADA ---
  let html = "";

  if (filtroMesVal !== "todos") {
    // --- GRÁFICO 2: BARRAS SIMPLES POR ITEM (Mês específico) ---
    // (Esta parte não muda)
    html = '<div class="space-y-2 p-2">';
    const itensOrdenados = Object.keys(dadosItens).sort(
      (a, b) => dadosItens[b] - dadosItens[a]
    );

    if (itensOrdenados.length === 0) {
      html =
        '<div class="text-gray-500 text-center p-4">Sem dados detalhados para este mês.</div>';
    } else {
      itensOrdenados.forEach((desc) => {
        const valor = dadosItens[desc];
        const perc =
          totalMesEspecifico > 0 ? (valor / totalMesEspecifico) * 100 : 0;
        const cor = getItemColor(desc);

        html += `
                    <div class="flex items-center" title="${desc}: ${formatCurrency(
          valor
        )}">
                        <span class="text-xs text-gray-700 w-24 truncate" style="color: ${cor}">${desc}</span>
                        <div class="flex-1 bg-gray-200 rounded-full h-5 ml-2">
                            <div class="h-5 rounded-full flex items-center px-2" style="width: ${perc}%; background-color: ${cor}">
                                <span class="text-xs font-bold text-white">${formatCurrency(
                                  valor
                                )}</span>
                            </div>
                        </div>
                    </div>`;
      });
    }
    html += "</div>";
  } else {
    // --- GRÁFICO 1: GRÁFICO DE LINHA SVG (Ano inteiro) ---

    // 1. Criar a Legenda primeiro
    html = '<div class="flex flex-wrap justify-center gap-x-4 gap-y-1 mb-3">';
    itensMasterList.forEach((desc) => {
      // Só mostra na legenda se o item tiver algum valor no ano
      const temValorNoAno = Object.keys(dadosMensais).some(
        (mes) => dadosMensais[mes][desc] > 0
      );
      if (temValorNoAno) {
        html += `
                    <div class="flex items-center">
                        <div class="w-3 h-3 rounded-full mr-1" style="background-color: ${getItemColor(
                          desc
                        )}"></div>
                        <span class="text-xs text-gray-700">${desc}</span>
                    </div>
                `;
      }
    });
    html += "</div>";

    // 2. Criar o Gráfico de Linha SVG
    const svgHeight = 150; // Altura do canvas SVG
    const svgWidth = 500; // Largura (para cálculo de precisão)
    const pX = 20; // Padding X (para labels)
    const pY = 10; // Padding Y (para pico)
    const chartWidth = svgWidth - pX * 2;
    const chartHeight = svgHeight - pY * 2;

    let polylines = ""; // Onde as linhas <polyline> serão armazenadas

    // Cria uma <polyline> para cada item
    itensMasterList.forEach((desc) => {
      let points = ""; // String de pontos "x1,y1 x2,y2..."
      for (let i = 0; i < 12; i++) {
        // 0 = Jan, 11 = Dez
        const valorItem = dadosMensais[i][desc] || 0;

        // Calcula Coordenada X (12 pontos no eixo X)
        const x = pX + i * (chartWidth / 11);

        // Calcula Coordenada Y (Eixo Y é invertido no SVG, 0 é o topo)
        let y = pY + chartHeight; // Ponto base (fundo do gráfico)
        if (maxValorItemIndividual > 0) {
          y =
            pY +
            (chartHeight - (valorItem / maxValorItemIndividual) * chartHeight);
        }

        points += `${x},${y} `;
      }

      // Adiciona a linha (polyline) ao SVG
      polylines += `
                <polyline fill="none" 
                          stroke="${getItemColor(desc)}" 
                          stroke-width="3" 
                          points="${points.trim()}" />
            `;
    });

    // Adiciona labels dos meses (Jan, Fev...) abaixo do gráfico
    let monthLabels = "";
    const nomesMeses = [
      "Jan",
      "Fev",
      "Mar",
      "Abr",
      "Mai",
      "Jun",
      "Jul",
      "Ago",
      "Set",
      "Out",
      "Nov",
      "Dez",
    ];
    for (let i = 0; i < 12; i++) {
      const x = pX + i * (chartWidth / 11);
      // y = altura do SVG + 15px de margem
      monthLabels += `<text x="${x}" y="${
        svgHeight + 15
      }" text-anchor="middle" font-size="12" fill="#6b7280">${
        nomesMeses[i]
      }</text>`;
    }

    // Adiciona linhas de grade horizontais (Ex: 0%, 50%, 100%)
    let gridLines = "";
    for (let i = 0; i <= 2; i++) {
      // 0, 1, 2
      const y = pY + i * (chartHeight / 2);
      gridLines += `<line x1="${pX}" y1="${y}" x2="${
        pX + chartWidth
      }" y2="${y}" stroke="#e5e7eb" stroke-width="1" />`;
      // Adiciona o label do eixo Y
      const valorLabel = maxValorItemIndividual * (1 - i / 2);
      if (i < 2) {
        // Não mostra o label do 0
        gridLines += `<text x="${pX - 5}" y="${
          y + 3
        }" text-anchor="end" font-size="10" fill="#9ca3af">${formatCurrency(
          valorLabel
        )}</text>`;
      }
    }

    // Monta o SVG final
    html += `
            <div class="w-full overflow-x-auto">
                <svg width="100%" height="${
                  svgHeight + 20
                }" viewBox="0 0 ${svgWidth} ${svgHeight + 20}">
                    ${gridLines}
                    ${polylines}
                    ${monthLabels}
                </svg>
            </div>`;
  }

  container.innerHTML = html;
}

// Preenche o formulário com dados de um contrato existente
function preencherFormularioContrato(contrato) {
  // --- ETAPA 1: Unidade ---
  document.getElementById("unidade-nome").value = contrato.unidade.nome || "";
  document.getElementById("unidade-cnpj").value = contrato.unidade.cnpj || "";
  document.getElementById("unidade-endereco").value =
    contrato.unidade.endereco || "";
  document.getElementById("unidade-rep").value = contrato.unidade.rep || "";

  // --- ETAPA 2: Empresa ---
  document.getElementById("empresa-nome").value = contrato.empresa.nome || "";
  document.getElementById("empresa-cnpj").value = contrato.empresa.cnpj || "";
  document.getElementById("empresa-endereco").value =
    contrato.empresa.endereco || "";
  document.getElementById("empresa-rep").value = contrato.empresa.rep || "";

  // --- ETAPA 3: Dados do Contrato ---
  document.getElementById("contrato-processo-sei").value =
    contrato.processoSei || "";
  document.getElementById("contrato-numero").value =
    contrato.numeroContrato || "";
  document.getElementById("contrato-tipo").value = contrato.tipoContrato || "";
  document.getElementById("contrato-objeto").value = contrato.objeto || "";
  document.getElementById("contrato-tempo").value =
    contrato.tempoContrato || "";
  document.getElementById("contrato-data-assinatura").value =
    contrato.dataAssinatura || "";
  document.getElementById("contrato-data-inicio").value =
    contrato.dataInicio || "";
  document.getElementById("contrato-link-sei").value = contrato.linkSei || "";

  // Formatação de Valores e Datas (Etapa 3)
  document.getElementById("contrato-estimativa-mensal").value = (
    contrato.estimativaMensal || 0
  )
    .toString()
    .replace(".", ",");
  formatInputAsBRL({
    target: document.getElementById("contrato-estimativa-mensal"),
  });

  document.getElementById("contrato-valor-total").value = (
    contrato.valorTotal || 0
  )
    .toString()
    .replace(".", ",");
  formatInputAsBRL({ target: document.getElementById("contrato-valor-total") });

  document.getElementById("contrato-data-fim").value = contrato.dataFim || "";

  // --- ETAPA 4: Gestão e Fiscalização (NOVO) ---

  // 1. Preencher Gestor (Com limpeza de segurança)
  if (contrato.gestorInicial) {
    document.getElementById("contrato-gestor-nome").value =
      contrato.gestorInicial.nome || "";
    document.getElementById("contrato-gestor-matricula").value =
      contrato.gestorInicial.matricula || "";
  } else {
    // Importante: Limpa se o contrato não tiver gestor inicial definido
    document.getElementById("contrato-gestor-nome").value = "";
    document.getElementById("contrato-gestor-matricula").value = "";
  }

  // 2. Preencher Fiscais
  const containerFiscais = document.getElementById("fiscais-container-step4");
  // Segurança: só executa se o elemento existir no HTML
  if (containerFiscais) {
    containerFiscais.innerHTML = ""; // Limpa linhas anteriores

    if (contrato.fiscaisIniciais && contrato.fiscaisIniciais.length > 0) {
      // Recria as linhas salvas
      contrato.fiscaisIniciais.forEach((f) => {
        adicionarNovaLinhaFiscal("fiscais-container-step4");
        const lastRow = containerFiscais.lastElementChild;
        if (lastRow) {
          lastRow.querySelector(".fiscal-nome").value = f.nome || "";
          lastRow.querySelector(".fiscal-matricula").value = f.matricula || "";
        }
      });
    } else {
      // Se não tiver fiscais, adiciona uma linha em branco padrão
      adicionarNovaLinhaFiscal("fiscais-container-step4");
    }
  }

  // Formata os campos de moeda
  // ATENÇÃO: Os campos valorTotal e dataFim estão no formulário de aditivo
  // Mas no modo "Editar", eles representam o valor *original*
  // A lógica de `saveStepData` e `salvarContrato` cuida disso.
  document.getElementById("contrato-valor-total").value = (
    contrato.valorTotal || 0
  )
    .toString()
    .replace(".", ",");
  formatInputAsBRL({ target: document.getElementById("contrato-valor-total") });

  document.getElementById("contrato-data-fim").value = contrato.dataFim;

  document.getElementById("contrato-estimativa-mensal").value = (
    contrato.estimativaMensal || 0
  )
    .toString()
    .replace(".", ",");
  formatInputAsBRL({
    target: document.getElementById("contrato-estimativa-mensal"),
  });

  // Salva os dados no objeto temporário
  saveStepData(1);
  saveStepData(2);
  saveStepData(3);
  saveStepData(4);
}

// Função central para abrir o modal de contrato (Novo, Editar, Aditivo)
function abrirModalContratoForm(modo, contratoId) {
  // 1. RESET TOTAL DO FORMULÁRIO
  resetarFormularioContrato();

  // 2. LIMPEZA ESPECÍFICA DA ETAPA 4 (sempre, independente do modo)
  document.getElementById("contrato-gestor-nome").value = "";
  document.getElementById("contrato-gestor-matricula").value = "";
  const containerFiscaisStep4 = document.getElementById(
    "fiscais-container-step4"
  );
  if (containerFiscaisStep4) {
    containerFiscaisStep4.innerHTML = "";
    adicionarNovaLinhaFiscal("fiscais-container-step4"); // Garante uma linha vazia
  }

  // 3. ATUALIZA DATALISTS (sempre que abrir o modal)
  if (typeof atualizarDatalistsContrato === "function") {
    atualizarDatalistsContrato();
  }

  // ===================================================================
  // MODO NOVO
  // ===================================================================
  if (modo === "Novo") {
    document.getElementById("modal-contrato-titulo").textContent =
      "Novo Contrato";
    document.getElementById("btn-form-salvar").textContent = "Salvar Contrato";

    // Campos de valor e prazo são obrigatórios no contrato principal
    document.getElementById("aditivo-valor-fields").style.display = "grid";
    document.getElementById("aditivo-prazo-fields").style.display = "grid";
    document
      .getElementById("contrato-valor-total")
      .setAttribute("required", "required");
    document
      .getElementById("contrato-data-fim")
      .setAttribute("required", "required");

    // Preenche unidade padrão automaticamente
    const unidadePadrao = db.empresas.find((e) => e.isPadrao);
    if (unidadePadrao) {
      document.getElementById("unidade-cnpj").value = unidadePadrao.cnpj;
      if (typeof onCNPJChange === "function") {
        onCNPJChange("unidade");
      }
    }

    // Stepper visível + começa na etapa 1
    document.getElementById("stepper-contrato").style.display = "flex";
    showFormStep(1);
    atualizarCamposPorTipoContrato();
  }

  // ===================================================================
  // MODO EDITAR (contrato principal)
  // ===================================================================
  else if (modo === "Editar") {
    const contrato = db.contratos.find((c) => c.id === contratoId);
    if (!contrato) return;

    document.getElementById("modal-contrato-titulo").textContent =
      "Editar Contrato";
    document.getElementById("btn-form-salvar").textContent =
      "Salvar Alterações";
    document.getElementById("contrato-id").value = contrato.id;

    preencherFormularioContrato(contrato);

    // Valor e prazo continuam obrigatórios
    document.getElementById("aditivo-valor-fields").style.display = "grid";
    document.getElementById("aditivo-prazo-fields").style.display = "grid";
    document
      .getElementById("contrato-valor-total")
      .setAttribute("required", "required");
    document
      .getElementById("contrato-data-fim")
      .setAttribute("required", "required");

    document.getElementById("stepper-contrato").style.display = "flex";
    showFormStep(1);
    atualizarCamposPorTipoContrato();
  }

  // ===================================================================
  // MODOS ADITIVO E EDITAR ADITIVO
  // ===================================================================
  else if (modo === "Aditivo" || modo === "EditarAditivo") {
    const isEdicao = modo === "EditarAditivo";
    const aditivoId = isEdicao ? contratoId : null;
    const paiId = isEdicao
      ? db.contratos.find((c) => c.id === contratoId)?.parentId || contratoId
      : contratoId;

    const contratoPai = db.contratos.find((c) => c.id === paiId);
    if (!contratoPai) return;

    const aditivo = isEdicao
      ? db.contratos.find((c) => c.id === contratoId)
      : null;

    if (!isEdicao || (isEdicao && aditivo && aditivo.parentId)) {
      // Título e botão
      document.getElementById("modal-contrato-titulo").textContent = isEdicao
        ? "Editar Termo Aditivo"
        : "Novo Termo Aditivo";
      document.getElementById("btn-form-salvar").textContent = isEdicao
        ? "Salvar Alterações"
        : "Salvar Aditivo";

      // IDs ocultos
      if (isEdicao) document.getElementById("contrato-id").value = aditivo.id;
      document.getElementById("contrato-parentId").value = contratoPai.id;

      // Preenche dados do PAI (unidade, empresa, objeto, etc.)
      preencherFormularioContrato(contratoPai);

      // Dados comuns que podem ser sobrescritos pelo aditivo
      document.getElementById("contrato-processo-sei").value = isEdicao
        ? aditivo.processoSei
        : "";
      document.getElementById("contrato-numero").value = isEdicao
        ? aditivo.numeroContrato
        : "";
      document.getElementById("contrato-tipo").value = contratoPai.tipoContrato;
      document.getElementById("contrato-objeto").value = contratoPai.objeto;
      document.getElementById("contrato-tempo").value =
        contratoPai.tempoContrato;
      document.getElementById("contrato-data-assinatura").value = isEdicao
        ? aditivo.dataAssinatura
        : "";
      document.getElementById("contrato-data-inicio").value =
        contratoPai.dataInicio;

      // Estimativa mensal (só aparece em alguns tipos)
      const estimativaInput = document.getElementById(
        "contrato-estimativa-mensal"
      );
      if (estimativaInput) {
        estimativaInput.value = isEdicao
          ? (aditivo.estimativaMensal || 0).toString().replace(".", ",")
          : "";
        formatInputAsBRL({ target: estimativaInput });
      }

      // Restrição para Cooperação Técnica
      if (contratoPai.tipoContrato === "Cooperacao Tecnica") {
        const selectTipo = document.getElementById("aditivo-tipo");
        selectTipo.value = "Prazo";
        Array.from(selectTipo.options).forEach((opt) => {
          opt.style.display =
            opt.value === "Prazo" || opt.value === "" ? "" : "none";
        });
      }

      // === SEÇÃO ADITIVO ===
      const fieldsetAditivo = document.getElementById("fieldset-aditivo");
      fieldsetAditivo.style.display = "block";

      // Campos obrigatórios comuns do aditivo
      fieldsetAditivo
        .querySelectorAll(
          "#aditivo-tipo, #aditivo-numero, #aditivo-processo-sei, #aditivo-data-assinatura, #aditivo-justificativa"
        )
        .forEach((el) => el.setAttribute("required", "required"));

      if (isEdicao && aditivo.aditivo) {
        document.getElementById("aditivo-tipo").value =
          aditivo.aditivo.tipo || "";
        document.getElementById("aditivo-numero").value =
          aditivo.aditivo.numero || "";
        document.getElementById("aditivo-processo-sei").value =
          aditivo.aditivo.processoSei || "";
        document.getElementById("aditivo-justificativa").value =
          aditivo.aditivo.justificativa || "";
        document.getElementById("aditivo-data-assinatura").value =
          aditivo.aditivo.dataAssinatura || "";
        document.getElementById("aditivo-link-sei").value =
          aditivo.aditivo.linkSei || "";

        // Campos específicos por tipo de aditivo
        if (aditivo.aditivo.tipo === "Valor" && aditivo.valorTotal != null) {
          document.getElementById("contrato-valor-total").value =
            aditivo.valorTotal.toString().replace(".", ",");
          formatInputAsBRL({
            target: document.getElementById("contrato-valor-total"),
          });
        } else if (aditivo.aditivo.tipo === "Prazo" && aditivo.dataFim) {
          document.getElementById("contrato-data-fim").value = aditivo.dataFim;
        } else if (aditivo.aditivo.tipo === "GestorFiscal") {
          // Gestor (se houver)
          if (aditivo.aditivo.gestor) {
            document.getElementById("aditivo-gestor-nome").value =
              aditivo.aditivo.gestor.nome || "";
            document.getElementById("aditivo-gestor-matricula").value =
              aditivo.aditivo.gestor.matricula || "";
          }
          // Fiscais do aditivo (container próprio, não o do step4)
          const containerFiscaisAditivo =
            document.getElementById("fiscais-container");
          containerFiscaisAditivo.innerHTML = "";
          if (aditivo.aditivo.fiscais && aditivo.aditivo.fiscais.length > 0) {
            aditivo.aditivo.fiscais.forEach((f) => {
              adicionarNovaLinhaFiscal(); // usa o container padrão do aditivo
              const ultimaLinha = containerFiscaisAditivo.lastElementChild;
              ultimaLinha.querySelector(".fiscal-nome").value = f.nome;
              ultimaLinha.querySelector(".fiscal-matricula").value =
                f.matricula;
            });
          } else {
            adicionarNovaLinhaFiscal(); // linha em branco
          }
        }
      } else {
        // Novo aditivo → limpa campos específicos
        document.getElementById("contrato-valor-total").value = "";
        document.getElementById("contrato-data-fim").value =
          contratoPai.dataFim || "";
      }

      // Atualiza visibilidade dos campos do aditivo
      atualizarCamposAditivo();

      // Oculta stepper e vai direto para a etapa 3
      document.getElementById("stepper-contrato").style.display = "none";
      showFormStep(3);
      atualizarCamposPorTipoContrato();
    }
  }

  // ===================================================================
  // FINALIZAÇÃO COMUM
  // ===================================================================
  document.getElementById("modal-contrato").classList.add("z-60");
  abrirModal("modal-contrato");
}

// Função para abrir o modal de confirmação exclusão
function abrirModalConfirmacao(mensagem, callback) {
  document.getElementById("confirmacao-mensagem").textContent = mensagem;
  acaoConfirmada = callback; // Armazena a função a ser executada

  // Garante que o modal de confirmação apareça sobre qualquer outro modal
  document.getElementById("modal-confirmacao").classList.add("z-60");
  abrirModal("modal-confirmacao");
}

// Mostra/oculta campos do aditivo base_TIPO
function atualizarCamposAditivo() {
  const tipo = document.getElementById("aditivo-tipo").value;

  // Seleciona os containers
  const valorFields = document.getElementById("aditivo-valor-fields");
  const prazoFields = document.getElementById("aditivo-prazo-fields");
  const gestorFields = document.getElementById("aditivo-gestor-fiscal-fields");
  const fiscaisContainer = document.getElementById("fiscais-container");

  // Seleciona os inputs que podem ser required
  const valorInput = document.getElementById("contrato-valor-total");
  const prazoInput = document.getElementById("contrato-data-fim");
  const gestorNomeInput = document.getElementById("aditivo-gestor-nome");

  // Reseta tudo (exceto o container de fiscais se já estiver preenchido no modo Edição)
  [valorFields, prazoFields, gestorFields].forEach(
    (f) => (f.style.display = "none")
  );
  [valorInput, prazoInput, gestorNomeInput].forEach((i) =>
    i.removeAttribute("required")
  );
  // Limpa fiscais SOMENTE se não for tipo Gestor (para preservar na edição)
  if (tipo !== "GestorFiscal") {
    fiscaisContainer.innerHTML = "";
  }

  // Atualiza labels (elas estão dentro das seções agora)
  document.getElementById("label-valor-total").textContent =
    "Valor Aditado (R$)";
  document.getElementById("label-data-fim").textContent = "Nova Data Fim";

  if (tipo === "Valor") {
    valorFields.style.display = "grid";
    valorInput.setAttribute("required", "required");
  } else if (tipo === "Prazo") {
    prazoFields.style.display = "grid";
    prazoInput.setAttribute("required", "required");
    valorFields.style.display = "grid";
  } else if (tipo === "GestorFiscal") {
    gestorFields.style.display = "block";
    gestorNomeInput.setAttribute("required", "required"); // Pelo menos o gestor é obrigatório

    // Só adiciona a primeira linha se o container estiver vazio
    if (fiscaisContainer.innerHTML.trim() === "") {
      adicionarNovaLinhaFiscal();
    }
  }
  // Se for 'Outro' ou 'Selecione', nada aparece.
}

// Adiciona uma linha de fiscal no formulário
function adicionarNovaLinhaFiscal(containerId = "fiscais-container") {
  const template = document.getElementById("template-fiscal-row");
  const container = document.getElementById(containerId);

  if (!container) return;

  const novaLinha = template.content.cloneNode(true);

  novaLinha
    .querySelector(".btn-remover-fiscal")
    .addEventListener("click", (e) => {
      e.target.closest(".fiscal-row").remove();
    });

  container.appendChild(novaLinha);
}

// Mostra/oculta campos de VALOR base_TIPO DE CONTRATO
function atualizarCamposPorTipoContrato() {
  const tipoContrato = document.getElementById("contrato-tipo").value;
  const estimativaMensalContainer = document
    .getElementById("contrato-estimativa-mensal")
    .closest("div");
  const valorTotalContainer = document.getElementById("aditivo-valor-fields"); // O campo de valor total

  const estimativaMensalInput = document.getElementById(
    "contrato-estimativa-mensal"
  );
  const valorTotalInput = document.getElementById("contrato-valor-total");

  // Verifica se estamos no formulário de Contrato Pai (Novo ou Editar), e não de Aditivo
  const parentId = document.getElementById("contrato-parentId").value;
  const isNovoOuEditarPai = !parentId;

  if (tipoContrato === "Cooperacao Tecnica") {
    // É Termo de Cooperação: ESCONDE e REMOVE 'required'
    estimativaMensalContainer.style.display = "none";
    estimativaMensalInput.removeAttribute("required");

    if (isNovoOuEditarPai) {
      valorTotalContainer.style.display = "none";
      valorTotalInput.removeAttribute("required");
    }
  } else {
    // Outros tipos: MOSTRA e ADICIONA 'required'
    estimativaMensalContainer.style.display = "block";
    estimativaMensalInput.setAttribute("required", "required");

    if (isNovoOuEditarPai) {
      valorTotalContainer.style.display = "grid";
      valorTotalInput.setAttribute("required", "required");
    }
  }
}

// --- Funções de Cálculo ---

// --- CÁLCULOS COM STATUS TEMPORAL ---
function calcularResumoContrato(contratoPai) {
  const aditivos = db.contratos.filter((c) => c.parentId === contratoPai.id);
  const todosContratos = [contratoPai, ...aditivos];

  // Zera horas para comparação justa de datas
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  let valorTotalAgregado = parseFloat(contratoPai.valorTotal) || 0;
  let dataFimAgregada = new Date(contratoPai.dataFim + "T00:00:00");
  const dataInicio = new Date(contratoPai.dataInicio + "T00:00:00");
  const dataAssinatura = new Date(contratoPai.dataAssinatura + "T00:00:00");

  let totalPagoAgregado = 0; // Dinheiro que já saiu (Realizado)
  let totalProgramadoAgregado = 0; // Dinheiro futuro (Programado)

  todosContratos.forEach((c) => {
    // Soma pagamentos
    if (c.pagamentos) {
      c.pagamentos.forEach((p) => {
        const val = parseFloat(p.valorPago) || 0;
        // Se for TRD, nunca soma no saldo do contrato
        if (p.isTRD) return;

        const dataPagamento = new Date(p.data + "T00:00:00");

        if (dataPagamento > hoje) {
          totalProgramadoAgregado += val;
        } else {
          totalPagoAgregado += val;
        }
      });
    }

    // Lógica de Aditivos (Valor e Prazo)
    if (c.aditivo) {
      if (c.aditivo.tipo === "Valor" || c.aditivo.tipo === "Prazo") {
        valorTotalAgregado += parseFloat(c.valorTotal) || 0;
      }
      if (c.aditivo.tipo === "Prazo") {
        const novaDataFim = new Date(c.dataFim + "T00:00:00");
        if (novaDataFim > dataFimAgregada) {
          dataFimAgregada = novaDataFim;
        }
      }
    }
  });

  const valorRestante = valorTotalAgregado - totalPagoAgregado;

  // Definição do Status do Contrato
  let statusContrato = "Vigente";
  let statusCor = "text-green-600 bg-green-50";

  if (dataAssinatura > hoje) {
    statusContrato = "Em Formalização";
    statusCor = "text-purple-600 bg-purple-50";
  } else if (dataInicio > hoje) {
    statusContrato = "A Iniciar";
    statusCor = "text-yellow-600 bg-yellow-50";
  } else if (dataFimAgregada < hoje) {
    statusContrato = "Vencido/Encerrado";
    statusCor = "text-red-600 bg-red-100";
  }

  // Cálculos de Dias
  let diasTotais = 0;
  let diasPassados = 0;
  let diasRestantesNum = 0;
  let percTempo = 0;

  if (!isNaN(dataInicio.getTime()) && !isNaN(dataFimAgregada.getTime())) {
    diasTotais =
      Math.ceil((dataFimAgregada - dataInicio) / (1000 * 60 * 60 * 24)) + 1;

    if (hoje < dataInicio) {
      diasPassados = 0;
      diasRestantesNum = diasTotais;
    } else if (hoje > dataFimAgregada) {
      diasPassados = diasTotais;
      diasRestantesNum = 0;
    } else {
      diasPassados = Math.ceil((hoje - dataInicio) / (1000 * 60 * 60 * 24)) + 1;
      diasRestantesNum = diasTotais - diasPassados;
    }

    if (diasTotais > 0) {
      percTempo = (diasPassados / diasTotais) * 100;
    }
  }

  const percValor =
    valorTotalAgregado > 0 ? (totalPagoAgregado / valorTotalAgregado) * 100 : 0;

  return {
    totalPago: totalPagoAgregado,
    totalProgramado: totalProgramadoAgregado, // Novo campo
    valorTotal: valorTotalAgregado,
    valorRestante: valorRestante,
    diasRestantes: `${diasRestantesNum} dias`,
    diasPassadosNum: diasPassados,
    diasRestantesNum: diasRestantesNum,
    percValor: Math.min(100, percValor),
    percTempo: Math.min(100, percTempo),
    dataFimFinal: dataFimAgregada.toISOString().split("T")[0],
    status: statusContrato, // Novo campo
    statusCor: statusCor, // Novo campo
  };
}

// --- Funções de Renderização ---

// --- FUNÇÃO RENDERIZAR CARDS COM STATUS ---
function renderizarContratos() {
  const listaContratos = document.getElementById("lista-contratos");
  const msgSemContratos = document.getElementById("msg-sem-contratos");
  listaContratos.innerHTML = "";

  if (!msgSemContratos) return;

  const contratosPai = db.contratos.filter((c) => !c.parentId);

  if (contratosPai.length === 0) {
    msgSemContratos.style.display = "block";
    if (!document.body.classList.contains("loading")) {
      msgSemContratos.textContent = "Nenhum contrato cadastrado.";
    }
    return;
  }

  msgSemContratos.style.display = "none";
  const template = document.getElementById("template-card-contrato");

  contratosPai.forEach((contrato) => {
    const card = template.content.cloneNode(true);
    const resumo = calcularResumoContrato(contrato);

    // Injeta Badge de Status ao lado do Processo
    const divTopo = card.querySelector(".mb-2");
    divTopo.innerHTML = `
            <div class="flex justify-between items-start">
                <span class="text-sm text-gray-500">${contrato.processoSei}</span>
                <span class="text-xs font-bold px-2 py-1 rounded-full ${resumo.statusCor}">${resumo.status}</span>
            </div>
        `;

    card.querySelector('[data-field="objeto"]').textContent = contrato.objeto;
    card.querySelector('[data-field="empresaNome"]').textContent =
      contrato.empresa.nome;

    // Exibe Total Pago + Programado (se houver)
    let htmlValores = formatCurrency(resumo.totalPago);
    if (resumo.totalProgramado > 0) {
      htmlValores += ` <span class="text-xs text-yellow-600 font-semibold" title="Programado">(+${formatCurrency(
        resumo.totalProgramado
      )} prog.)</span>`;
    }

    card.querySelector('[data-field="totalPago"]').innerHTML = htmlValores;
    card.querySelector('[data-field="valorTotal"]').textContent =
      formatCurrency(resumo.valorTotal);
    card.querySelector(
      '[data-field="progressoValor"]'
    ).style.width = `${resumo.percValor}%`;

    card.querySelector('[data-field="diasRestantes"]').textContent =
      resumo.diasRestantes;
    card.querySelector(
      '[data-field="progressoTempo"]'
    ).style.width = `${resumo.percTempo}%`;

    card.querySelector(".btn-visualizar-contrato").dataset.id = contrato.id;
    card.querySelector(".btn-abrir-modal-pagamento").dataset.id = contrato.id;

    listaContratos.appendChild(card);
  });
}

// --- FUNÇÃO COMPLETA: VISUALIZAR CONTRATO (Gráficos + Status Programado) ---
function renderizarModalVisualizar(contratoId) {
  const contratoPai = db.contratos.find((c) => c.id === contratoId);
  if (!contratoPai) return;

  const body = document.getElementById("visualizar-contrato-body");
  const resumo = calcularResumoContrato(contratoPai);
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);

  // Pega os aditivos
  const aditivos = db.contratos.filter((c) => c.parentId === contratoPai.id);

  // Agrega pagamentos
  let pagamentos = [
    ...(contratoPai.pagamentos || []).map((p) => ({
      ...p,
      origemContratoId: contratoPai.id,
    })),
  ];

  aditivos.forEach((ad) => {
    if (ad.pagamentos && ad.pagamentos.length > 0) {
      const pagamentosAditivo = ad.pagamentos.map((p) => ({
        ...p,
        origemContratoId: ad.id,
      }));
      pagamentos = pagamentos.concat(pagamentosAditivo);
    }
  });

  // Ordenação dos Pagamentos
  pagamentos.sort((a, b) => {
    const dataA = a.periodoDe ? new Date(a.periodoDe + "T00:00:00") : null;
    const dataB = b.periodoDe ? new Date(b.periodoDe + "T00:00:00") : null;
    if (dataA && !dataB) return -1;
    if (!dataA && dataB) return 1;
    if (!dataA && !dataB) {
      return new Date(a.data + "T00:00:00") - new Date(b.data + "T00:00:00");
    }
    if (dataA.getTime() === dataB.getTime()) {
      return new Date(a.data + "T00:00:00") - new Date(b.data + "T00:00:00");
    }
    return dataA - dataB;
  });

  // --- SEPARAÇÃO: REALIZADO vs PROGRAMADO (Para Gráficos) ---
  // Os gráficos só devem considerar o que já aconteceu (<= hoje) e que não é TRD (TRD distorce análise de saldo)
  const pagamentosRealizados = pagamentos.filter((p) => {
    const d = new Date(p.data + "T00:00:00");
    return d <= hoje; // Apenas passados ou hoje
  });

  // --- CÁLCULO DOS DADOS PARA GRÁFICOS ---
  const pagamentosPorAno = {};
  const consumoPorItem = {};
  let valorTotalItens = 0;
  let maxValorAno = 0;

  // Dados para KPI de média mensal (apenas realizados e com data fim)
  const pagamentosComData = pagamentosRealizados.filter((p) => p.periodoAte);
  let mesesDePagamento = 0;

  if (pagamentosComData.length > 0) {
    const datas = pagamentosComData.map(
      (p) => new Date(p.periodoAte + "T00:00:00")
    );
    const minData = new Date(Math.min.apply(null, datas));
    const maxData = new Date(Math.max.apply(null, datas));
    const diasDePagamento = (maxData - minData) / (1000 * 60 * 60 * 24);
    mesesDePagamento = diasDePagamento / 30.44;
    if (mesesDePagamento < 1) mesesDePagamento = 1;
  }

  pagamentosRealizados.forEach((p) => {
    // 1. Gráfico Anual
    if (p.periodoAte && p.valorPago > 0) {
      const ano = new Date(p.periodoAte + "T00:00:00").getFullYear();
      pagamentosPorAno[ano] = (pagamentosPorAno[ano] || 0) + p.valorPago;
      if (pagamentosPorAno[ano] > maxValorAno)
        maxValorAno = pagamentosPorAno[ano];
    }
    // 2. Gráfico de Itens
    if (p.detalhes) {
      p.detalhes.forEach((item) => {
        const qtd = parseFloat(item.quantidade) || 0;
        const valUnit = parseFloat(item.valorUnitario) || 0;
        const valorTotalItem = qtd * valUnit;
        if (valorTotalItem > 0) {
          const descricao = item.descricao || "Item não descrito";
          consumoPorItem[descricao] =
            (consumoPorItem[descricao] || 0) + valorTotalItem;
          valorTotalItens += valorTotalItem;
        }
      });
    }
  });

  const dadosConsumo = Object.keys(consumoPorItem)
    .map((desc) => ({
      descricao: desc,
      total: consumoPorItem[desc],
      percentual:
        valorTotalItens > 0
          ? (consumoPorItem[desc] / valorTotalItens) * 100
          : 0,
    }))
    .sort((a, b) => b.total - a.total);

  // --- CÁLCULO DE KPIs ---
  const gastoMedioMensalReal =
    mesesDePagamento > 0 ? resumo.totalPago / mesesDePagamento : 0;
  const percentDesvio =
    contratoPai.estimativaMensal > 0 && gastoMedioMensalReal > 0
      ? (gastoMedioMensalReal / contratoPai.estimativaMensal - 1) * 100
      : 0;

  // Burn Rate usa o saldo restante REAL (descontando o que já foi pago)
  const diasRestantesValor =
    gastoMedioMensalReal > 0
      ? (resumo.valorRestante / gastoMedioMensalReal) * 30.44
      : Infinity;
  const alertaBurnRate =
    diasRestantesValor < resumo.diasRestantesNum &&
    diasRestantesValor !== Infinity;

  // --- GESTOR/FISCAL ---
  let gestorAtual = contratoPai.gestorInicial || { nome: "N/D", matricula: "" };
  let fiscaisAtuais = contratoPai.fiscaisIniciais || [];

  // 2. Verifica Aditivos (em ordem cronológica) para ver se houve alteração
  // Nota: 'aditivos' já deve estar filtrado pelo parentId
  aditivos.forEach((ad) => {
    if (ad.aditivo && ad.aditivo.tipo === "GestorFiscal") {
      if (ad.aditivo.gestor && ad.aditivo.gestor.nome) {
        gestorAtual = ad.aditivo.gestor;
      }
      if (ad.aditivo.fiscais && ad.aditivo.fiscais.length > 0) {
        fiscaisAtuais = ad.aditivo.fiscais;
      }
    }
  });

  // --- RENDERIZAÇÃO DOS CONTEÚDOS ---

  // Helpers
  const renderField = (label, value, extraClass = "") => `
        <div class="grid grid-cols-3 gap-2 ${extraClass}">
            <span class="text-sm font-semibold text-gray-700 col-span-1">${label}:</span>
            <span class="text-sm text-gray-900 col-span-2">${
              value || "N/D"
            }</span>
        </div>`;

  const renderSection = (title, content, actions = "") => `
        <fieldset class="border border-gray-300 p-4 rounded-lg">
            <legend class="text-lg font-semibold px-2 flex justify-between items-center w-full">
                <span>${title}</span>
                <div>${actions}</div>
            </legend>
            <div class="space-y-2">${content}</div>
        </fieldset>`;

  const contratoActions = `<button class="btn-editar-contrato-form text-sm bg-yellow-500 hover:bg-yellow-600 text-white font-bold py-1 px-3 rounded-lg shadow-sm" data-id="${contratoPai.id}">Editar Contrato</button>
         <button class="btn-adicionar-aditivo text-sm bg-blue-500 hover:bg-blue-600 text-white font-bold py-1 px-3 rounded-lg shadow-sm ml-2" data-id="${contratoPai.id}">+ Adicionar Aditivo</button>`;

  const unidadeContent =
    renderField("Razão Social", contratoPai.unidade.nome) +
    renderField("CNPJ", contratoPai.unidade.cnpj) +
    renderField("Endereço", contratoPai.unidade.endereco) +
    renderField("Representante", contratoPai.unidade.rep);
  const empresaContent =
    renderField("Razão Social", contratoPai.empresa.nome) +
    renderField("CNPJ", contratoPai.empresa.cnpj) +
    renderField("Endereço", contratoPai.empresa.endereco) +
    renderField("Representante", contratoPai.empresa.rep);

  const contratoContent = [
    renderField(
      "Status",
      `<span class="px-2 py-0.5 rounded text-xs font-bold ${resumo.statusCor}">${resumo.status}</span>`
    ),
    renderField("Nº do Contrato", contratoPai.numeroContrato) +
      renderField(
        "Nº Processo SEI",
        contratoPai.linkSei
          ? `<a href="${contratoPai.linkSei}" target="_blank" class="text-blue-600 hover:underline">${contratoPai.processoSei}</a>`
          : contratoPai.processoSei || "N/D"
      ) +
      renderField("Tipo de Contrato", contratoPai.tipoContrato) +
      renderField("Objeto", contratoPai.objeto),
    renderField("Valor Total", formatCurrency(resumo.valorTotal), "font-bold"),
    renderField("Data Fim", formatDate(resumo.dataFimFinal), "font-bold"),
    renderField("Total Pago", formatCurrency(resumo.totalPago)),

    // Item Condicional (Só aparece se > 0)
    resumo.totalProgramado > 0
      ? renderField(
          "Total Programado",
          formatCurrency(resumo.totalProgramado),
          "text-yellow-600 font-bold"
        )
      : null,

    renderField("Valor Restante", formatCurrency(resumo.valorRestante)),
    renderField("Dias Restantes", resumo.diasRestantes),

    renderField(
      "Gestor Atual",
      `${gestorAtual.nome} ${
        gestorAtual.matricula ? `(Mat. ${gestorAtual.matricula})` : ""
      }`,
      "font-bold bg-yellow-50 p-1 rounded-md"
    ),

    renderField(
      "Fiscais Atuais",
      fiscaisAtuais.length > 0
        ? fiscaisAtuais
            .map(
              (f) => `${f.nome} ${f.matricula ? `(Mat. ${f.matricula})` : ""}`
            )
            .join("<br>") // <--- Use <br> para HTML
        : "N/D",
      "font-bold bg-yellow-50 p-1 rounded-md"
    ),
  ]
    .filter(Boolean)
    .join("");

  // Tabela Aditivos (com Badge de Futuro)
  let aditivosContent =
    '<h4 class="font-semibold mb-2">Histórico de Aditivos</h4>';
  if (aditivos.length === 0) {
    aditivosContent +=
      '<p class="text-gray-500 text-sm">Nenhum aditivo registrado.</p>';
  } else {
    aditivosContent += `<div class="overflow-x-auto border rounded-lg"><table class="min-w-full divide-y divide-gray-200">
            <thead class="bg-gray-50">
                <tr>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Número</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data Assin.</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Processo</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Justificativa</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor/Prazo/Gestor</th>
                    <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                </tr>
            </thead>
            <tbody class="bg-white divide-y divide-gray-200">`;

    aditivos.forEach((ad) => {
      const dataAssin = new Date(ad.aditivo.dataAssinatura + "T00:00:00");
      const isFuturo = dataAssin > hoje;
      const badgeFuturo = isFuturo
        ? '<span class="ml-2 text-[10px] bg-purple-100 text-purple-800 px-1 rounded border border-purple-200">Em Tramitação</span>'
        : "";

      // Informação extra
      let infoExtra = "N/A";

      if (ad.aditivo.tipo === "Valor") {
        infoExtra = formatCurrency(ad.valorTotal);
      } else if (ad.aditivo.tipo === "Prazo") {
        infoExtra = `Fim: ${formatDate(ad.dataFim)}`;
      } else if (ad.aditivo.tipo === "GestorFiscal") {
        const parts = [];
        // Adiciona Gestor
        if (ad.aditivo.gestor && ad.aditivo.gestor.nome) {
          parts.push(`<strong>Gestor:</strong> ${ad.aditivo.gestor.nome}`);
        }
        // Adiciona Fiscais (se houver)
        if (ad.aditivo.fiscais && ad.aditivo.fiscais.length > 0) {
          const nomesFiscais = ad.aditivo.fiscais.map((f) => f.nome).join(", ");
          parts.push(`<strong>Fiscais:</strong> ${nomesFiscais}`);
        }
        // Junta tudo com quebra de linha
        infoExtra = parts.join("<br>") || "Dados incompletos";
      }

      aditivosContent += `<tr>
                <td class="px-4 py-3 text-sm">${ad.aditivo.numero || "N/D"}</td>
                <td class="px-4 py-3 text-sm">${ad.aditivo.tipo}</td>
                <td class="px-4 py-3 text-sm">${formatDate(
                  ad.aditivo.dataAssinatura
                )} ${badgeFuturo}</td>
                <td class="px-4 py-3 text-sm">
                    ${
                      ad.aditivo.linkSei
                        ? `<a href="${ad.aditivo.linkSei}" target="_blank" class="text-blue-600 hover:underline">${ad.aditivo.processoSei}</a>`
                        : ad.aditivo.processoSei || "N/D"
                    }
                </td>
                <td class="px-4 py-3 text-sm">${
                  ad.aditivo.justificativa || "N/D"
                }</td>
                <td class="px-4 py-3 text-sm">${infoExtra}</td>
                <td class="px-4 py-3 text-sm">
                    <button class="btn-detalhar-aditivo text-blue-600 hover:text-blue-800" data-aditivo-id="${
                      ad.id
                    }" data-pai-id="${contratoPai.id}">Detalhar</button>
                    <button class="btn-editar-aditivo text-yellow-600 hover:text-yellow-800 ml-2" data-aditivo-id="${
                      ad.id
                    }">Editar</button>
                </td>
            </tr>`;
    });
    aditivosContent += "</tbody></table></div>";
  }

  // Tabela Pagamentos (com destaque Amarelo para Programado)
  let pagamentosContent = `
        <h4 class="font-semibold mb-2">Histórico de Pagamentos</h4>
        <div class="overflow-x-auto border rounded-lg">
            <table class="min-w-full divide-y divide-gray-200">
                <thead class="bg-gray-50">
                    <tr>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Data</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Período</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NF</th>
                        <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Proc. Pag. SEI</th> <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Ações</th>
                     </tr>
                </thead>
                <tbody class="bg-white divide-y divide-gray-200 border border-gray-200">
                    ${
                      pagamentos.length === 0
                        ? `<tr><td colspan="6" class="px-4 py-4 text-center text-gray-500">Nenhum pagamento.</td></tr>`
                        : pagamentos
                            .map((p) => {
                              const dataPagto = new Date(p.data + "T00:00:00");
                              const isProgramado = dataPagto > hoje;
                              const rowClass = isProgramado
                                ? "bg-yellow-50"
                                : p.origemContratoId !== contratoPai.id
                                ? "bg-blue-50"
                                : "";
                              const statusLabel = isProgramado
                                ? '<span class="ml-2 text-[10px] bg-yellow-200 text-yellow-800 px-1.5 py-0.5 rounded font-bold uppercase border border-yellow-300">Programado</span>'
                                : "";

                              return `<tr class="${rowClass}">
                                <td class="px-4 py-3 text-sm">
                                    ${formatDate(p.data)} 
                                    ${
                                      p.origemContratoId !== contratoPai.id
                                        ? '<span class="text-blue-500 text-xs block">(Aditivo)</span>'
                                        : ""
                                    }
                                    ${statusLabel}
                                </td>
                                <td class="px-4 py-3 text-sm">${
                                  p.periodoDe
                                    ? `${formatDate(
                                        p.periodoDe
                                      )} a ${formatDate(p.periodoAte)}`
                                    : "N/D"
                                }</td>
                                <td class="px-4 py-3 text-sm">
                                    ${formatCurrency(p.valorPago)}
                                    ${
                                      p.isTRD
                                        ? '<span class="ml-1 px-2 py-0.5 bg-red-100 text-red-800 text-xs font-semibold rounded-full">TRD</span>'
                                        : ""
                                    }
                                </td>
                                <td class="px-4 py-3 text-sm">${
                                  p.notaFiscal
                                }</td>
                                
                                <td class="px-4 py-3 text-sm">
                                    ${
                                      p.linkPagamentoSei
                                        ? `<a href="${p.linkPagamentoSei}" target="_blank" class="text-blue-600 hover:underline">${p.processoPagamentoSei}</a>`
                                        : p.processoPagamentoSei || "N/D"
                                    }
                                </td>

                                <td class="px-4 py-3 text-sm">
                                    <button class="btn-editar-pagamento text-yellow-600 hover:text-yellow-800" data-contrato-id="${
                                      p.origemContratoId
                                    }" data-pagamento-id="${
                                p.id
                              }" data-contrato-pai-id="${
                                contratoPai.id
                              }">Editar</button>
                                    <button class="btn-detalhar-pagamento text-blue-600 hover:text-blue-800 ml-2" data-contrato-id="${
                                      p.origemContratoId
                                    }" data-pagamento-id="${
                                p.id
                              }" data-contrato-pai-id="${
                                contratoPai.id
                              }">Detalhar</button>
                                    <button class="btn-excluir-pagamento text-red-600 hover:text-red-800 ml-2" data-contrato-id="${
                                      p.origemContratoId
                                    }" data-pagamento-id="${
                                p.id
                              }" data-contrato-pai-id="${
                                contratoPai.id
                              }">Excluir</button>
                                </td>
                            </tr>`;
                            })
                            .join("")
                    }
                </tbody>
            </table>
    </div>`;

  // --- HTML DOS GRÁFICOS E KPIs (Recuperado) ---
  const corValor = "#3b82f6";
  const corTempo = "#16a34a";
  const corFundo = "#e5e7eb";

  // Tabela Consumo Item (Com fix de 2 casas decimais)
  let htmlConsumoItens =
    '<div class="overflow-y-auto max-h-48 border rounded-lg"><table class="min-w-full divide-y divide-gray-200"><thead class="bg-gray-50 sticky top-0 z-10"><tr><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Item</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor Total</th><th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">% do Total</th></tr></thead><tbody class="bg-white divide-y divide-gray-200">';
  if (dadosConsumo.length === 0) {
    htmlConsumoItens +=
      '<tr><td colspan="3" class="px-4 py-3 text-center text-gray-500">Nenhum item processado nos pagamentos realizados.</td></tr>';
  } else {
    dadosConsumo.forEach((d) => {
      const valorFormatado2Casas = d.total.toLocaleString("pt-BR", {
        style: "currency",
        currency: "BRL",
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      });
      htmlConsumoItens += `<tr>
                <td class="px-4 py-2 text-sm text-gray-900">${d.descricao}</td>
                <td class="px-4 py-2 text-sm text-gray-700">${valorFormatado2Casas}</td>
                <td class="px-4 py-2 text-sm text-gray-700">
                    <div class="flex items-center"><span class="w-16">${d.percentual.toFixed(
                      1
                    )}%</span>
                    <div class="w-full bg-gray-200 rounded-full h-2.5 ml-2"><div class="bg-green-600 h-2.5 rounded-full" style="width: ${d.percentual.toFixed(
                      1
                    )}%"></div></div></div>
                </td>
            </tr>`;
    });
  }
  htmlConsumoItens += "</tbody></table></div>";

  const kpiBoxClass =
    "flex flex-col items-center justify-center p-4 bg-gray-50 rounded-lg border";
  const kpiLabelClass = "text-sm font-medium text-gray-600";
  const kpiValueClass = "text-2xl font-bold text-gray-900";

  // Montagem do bloco de Gráficos
  const graficosHTML = `
        <fieldset class="border border-gray-300 p-4 rounded-lg">
            <legend class="text-lg font-semibold px-2">Resumo Visual (Agregado)</legend>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
                <div class="flex flex-col items-center">
                    <h4 class="font-semibold text-gray-700 mb-3">Progresso do Valor</h4>
                    <div class="donut-chart-container relative">
                        <div class="donut-chart" style="background: conic-gradient(${corValor} 0% ${
    resumo.percValor
  }%, ${corFundo} ${resumo.percValor}% 100%);">
                            <div class="donut-chart-center"><span>${resumo.percValor.toFixed(
                              0
                            )}%</span></div>
                        </div>
                    </div>
                    <div class="mt-3 text-center space-y-1">
                        <div class="text-sm">Total Pago: ${formatCurrency(
                          resumo.totalPago
                        )}</div>
                        <div class="text-sm">Restante: ${formatCurrency(
                          resumo.valorRestante
                        )}</div>
                    </div>
                </div>
                <div class="flex flex-col items-center">
                    <h4 class="font-semibold text-gray-700 mb-3">Progresso do Tempo</h4>
                    <div class="donut-chart-container relative">
                        <div class="donut-chart" style="background: conic-gradient(${corTempo} 0% ${
    resumo.percTempo
  }%, ${corFundo} ${resumo.percTempo}% 100%);">
                            <div class="donut-chart-center"><span>${resumo.percTempo.toFixed(
                              0
                            )}%</span></div>
                        </div>
                    </div>
                     <div class="mt-3 text-center space-y-1">
                        <div class="text-sm">Dias Passados: ${
                          resumo.diasPassadosNum
                        }</div>
                        <div class="text-sm">Dias Restantes: ${
                          resumo.diasRestantesNum
                        }</div>
                    </div>
                </div>
            </div>
        </fieldset>

        <fieldset class="border border-gray-300 p-4 rounded-lg mt-6">
            <legend class="text-lg font-semibold px-2">Análise Financeira (KPIs)</legend>
            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
                <div class="${kpiBoxClass}">
                    <span class="${kpiLabelClass}">Gasto Médio Mensal (Real)</span>
                    <span class="${kpiValueClass}">${formatCurrency(
    gastoMedioMensalReal
  )}</span>
                    <span class="${kpiLabelClass} mt-1">(Estimativa: ${formatCurrency(
    contratoPai.estimativaMensal
  )})</span>
                </div>
                <div class="${kpiBoxClass} ${
    percentDesvio > 10
      ? "bg-red-50 border-red-300"
      : "bg-green-50 border-green-300"
  }">
                    <span class="${kpiLabelClass}">Desvio da Estimativa</span>
                    <span class="${kpiValueClass} ${
    percentDesvio > 10 ? "text-red-700" : "text-green-700"
  }">${percentDesvio >= 0 ? "+" : ""}${percentDesvio.toFixed(1)}%</span>
                </div>
                <div class="${kpiBoxClass} ${
    alertaBurnRate ? "bg-red-50 border-red-300" : "bg-gray-50"
  }">
                    <span class="${kpiLabelClass}">Previsão (Dias Restantes)</span>
                    <div class="flex items-baseline space-x-2">
                        <span class="${kpiValueClass} ${
    alertaBurnRate ? "text-red-700" : ""
  }">${diasRestantesValor.toFixed(0)} dias</span>
                        <span class="${kpiLabelClass}">vs</span>
                        <span class="${kpiValueClass}">${
    resumo.diasRestantesNum
  } dias</span>
                    </div>
                </div>
            </div>
        </fieldset>

        <fieldset class="border border-gray-300 p-4 rounded-lg mt-6">
            <legend class="text-lg font-semibold px-2">Análises Detalhadas</legend>
            <div class="grid grid-cols-1 lg:grid-cols-1 gap-6 pt-2">
                <div>
                    <h4 class="font-semibold text-gray-700 mb-3 text-center">Consumo por Competência</h4>
                    <div class="grid grid-cols-2 gap-2 mb-3">
                        <select id="filtro-ano" class="p-2 border rounded-md w-full bg-white"></select>
                        <select id="filtro-mes" class="p-2 border rounded-md w-full bg-white">
                            <option value="todos">Todos os Meses</option>
                            <option value="0">Janeiro</option>
                            <option value="1">Fevereiro</option>
                            <option value="2">Março</option>
                            <option value="3">Abril</option>
                            <option value="4">Maio</option>
                            <option value="5">Junho</option>
                            <option value="6">Julho</option>
                            <option value="7">Agosto</option>
                            <option value="8">Setembro</option>
                            <option value="9">Outubro</option>
                            <option value="10">Novembro</option>
                            <option value="11">Dezembro</option>
                        </select>
                    </div>
                    <div id="container-grafico-detalhado" class="min-h-[200px]"></div>
                </div>
                <div>
                    <h4 class="font-semibold text-gray-700 mb-3 text-center">Consumo por Item (Período Total)</h4>
                    ${htmlConsumoItens}
                </div>
            </div>
        </fieldset>
    `;

  // Renderiza HTML Principal
  body.innerHTML = `
        <div id="visualizar-contrato-graficos" class="mb-6">${graficosHTML}</div>
        ${renderSection("Dados do Contrato", contratoContent, contratoActions)}
        ${renderSection("Histórico de Aditivos", aditivosContent)}
        ${renderSection("Unidade Contratante", unidadeContent)}
        ${renderSection("Empresa Contratada", empresaContent)}
        ${pagamentosContent}
    `;

  // Atualiza botão PDF
  const btnExportarPDF = document.querySelector(
    "#modal-visualizar-contrato #btn-exportar-pdf"
  );
  if (btnExportarPDF) {
    const newBtn = btnExportarPDF.cloneNode(true);
    btnExportarPDF.parentNode.replaceChild(newBtn, btnExportarPDF);
    newBtn.addEventListener("click", () => {
      exportarDetalhesPDF(contratoPai.id);
    });
  }

  // --- LISTENERS DE GRÁFICO ---
  const selectAno = document.getElementById("filtro-ano");
  const anosUnicos = new Set(
    pagamentosRealizados
      .map((p) =>
        p.periodoAte ? new Date(p.periodoAte + "T00:00:00").getFullYear() : null
      )
      .filter((ano) => ano)
  );

  [...anosUnicos]
    .sort((a, b) => b - a)
    .forEach((ano) => {
      const option = document.createElement("option");
      option.value = ano;
      option.text = ano;
      selectAno.appendChild(option);
    });
  document.getElementById("filtro-mes").value = "todos";

  // Nota: Usamos pagamentosRealizados aqui para o gráfico não mostrar futuro
  document
    .getElementById("filtro-ano")
    .addEventListener("change", () =>
      atualizarGraficoDetalhado(pagamentosRealizados)
    );
  document
    .getElementById("filtro-mes")
    .addEventListener("change", () =>
      atualizarGraficoDetalhado(pagamentosRealizados)
    );

  atualizarGraficoDetalhado(pagamentosRealizados);
}

// --- FUNÇÃO RENDERIZAR MODAL DETALHES DO ADITIVO ---
function renderizarModalDetalharAditivo(aditivoId, contratoPaiId) {
  const aditivo = db.contratos.find((c) => c.id === aditivoId);
  const contratoPai = db.contratos.find((c) => c.id === contratoPaiId);

  if (!aditivo || !contratoPai) {
    mostrarToast("Erro ao encontrar aditivo ou contrato pai.", true);
    return;
  }

  document.getElementById(
    "detalhe-aditivo-titulo"
  ).textContent = `Detalhes do ${aditivo.aditivo.numero} Termo Aditivo`;

  // 1. Renderiza os Detalhes do Aditivo
  const infoContainer = document.getElementById("detalhe-aditivo-info");
  const valorAditado = parseFloat(aditivo.valorTotal) || 0;
  const novaDataFim = aditivo.dataFim
    ? formatDate(aditivo.dataFim)
    : "Não altera";

  infoContainer.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="space-y-2">
                <div class="grid grid-cols-3 gap-2">
                    <span class="text-sm font-semibold text-gray-700 col-span-1">Tipo:</span>
                    <span class="text-sm text-gray-900 col-span-2">${
                      aditivo.aditivo.tipo
                    }</span>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <span class="text-sm font-semibold text-gray-700 col-span-1">Processo SEI:</span>
                    <span class="text-sm text-gray-900 col-span-2">${
                      aditivo.aditivo.processoSei
                    }</span>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <span class="text-sm font-semibold text-gray-700 col-span-1">Data Assinatura:</span>
                    <span class="text-sm text-gray-900 col-span-2">${formatDate(
                      aditivo.aditivo.dataAssinatura
                    )}</span>
                </div>
            </div>
            <div class="space-y-2">
                <div class="grid grid-cols-3 gap-2 bg-blue-50 p-1 rounded">
                    <span class="text-sm font-bold text-blue-800 col-span-1">Valor Aditado:</span>
                    <span class="text-sm font-bold text-blue-800 col-span-2">${formatCurrency(
                      valorAditado
                    )}</span>
                </div>
                <div class="grid grid-cols-3 gap-2 bg-green-50 p-1 rounded">
                    <span class="text-sm font-bold text-green-800 col-span-1">Nova Data Fim:</span>
                    <span class="text-sm font-bold text-green-800 col-span-2">${novaDataFim}</span>
                </div>
                <div class="grid grid-cols-3 gap-2">
                    <span class="text-sm font-semibold text-gray-700 col-span-1">Justificativa:</span>
                    <span class="text-sm text-gray-900 col-span-2">${
                      aditivo.aditivo.justificativa
                    }</span>
                </div>
            </div>
        </div>
    `;

  // 2. Lógica de Pagamentos e Consumo
  const pagamentosContainer = document.getElementById(
    "detalhe-aditivo-pagamentos"
  );

  let pagamentosFiltrados = [];
  let totalConsumidoAditivo = 0; // Apenas pagamentos normais
  let totalConsumidoTRD = 0; // Apenas TRD
  let podeFiltrar = false;
  let mensagemErro = "";

  if (aditivo.aditivo.tipo === "GestorFiscal") {
    mensagemErro =
      "Aditivos de Gestor/Fiscal não possuem pagamentos associados.";
  } else if (
    aditivo.aditivo.tipo === "Valor" ||
    aditivo.aditivo.tipo === "Outro"
  ) {
    mensagemErro = `Não é possível filtrar pagamentos por data automaticamente para aditivos puramente de Valor/Outros.<br>Valor do Aditivo: <b>${formatCurrency(
      valorAditado
    )}</b>`;
  } else {
    // Aditivo de Prazo (Lógica de Datas)
    const todosInstrumentos = [
      contratoPai,
      ...db.contratos.filter(
        (c) => c.parentId === contratoPaiId && c.aditivo.tipo === "Prazo"
      ),
    ].sort(
      (a, b) =>
        new Date(a.dataFim + "T00:00:00") - new Date(b.dataFim + "T00:00:00")
    );

    const indexAtual = todosInstrumentos.findIndex((c) => c.id === aditivoId);

    if (indexAtual > 0) {
      const instrumentoAnterior = todosInstrumentos[indexAtual - 1];
      const dataFimAnterior = new Date(
        instrumentoAnterior.dataFim + "T00:00:00"
      );
      const dataInicioAditivo = new Date(dataFimAnterior);
      dataInicioAditivo.setDate(dataInicioAditivo.getDate() + 1);
      const dataFimAditivo = new Date(aditivo.dataFim + "T00:00:00");

      pagamentosFiltrados = contratoPai.pagamentos.filter((p) => {
        if (!p.periodoAte) return false;
        const dataPagamento = new Date(p.periodoAte + "T00:00:00");
        return (
          dataPagamento >= dataInicioAditivo && dataPagamento <= dataFimAditivo
        );
      });
      podeFiltrar = true;
    } else {
      mensagemErro = "Erro ao calcular período de vigência.";
    }
  }

  // Renderiza HTML baseados no cálculo acima
  if (!podeFiltrar) {
    pagamentosContainer.innerHTML = `<div class="text-gray-500 text-center p-4">${mensagemErro}</div>`;
  } else {
    // Calcula totais separando TRD
    pagamentosFiltrados.forEach((p) => {
      const val = parseFloat(p.valorPago) || 0;
      if (p.isTRD) {
        totalConsumidoTRD += val;
      } else {
        totalConsumidoAditivo += val;
      }
    });

    const totalGeralPeriodo = totalConsumidoAditivo + totalConsumidoTRD;

    // Card de Consumo
    const resumoContrato = calcularResumoContrato(contratoPai);
    const valorBasePorcentagem =
      valorAditado > 0 ? valorAditado : resumoContrato.valorTotal;
    const textoBase =
      valorAditado > 0 ? "do valor aditado" : "do valor total do contrato";

    // A porcentagem considera APENAS o valor consumido do aditivo (sem TRD)
    const porcentagem =
      valorBasePorcentagem > 0
        ? (totalConsumidoAditivo / valorBasePorcentagem) * 100
        : 0;

    let corTexto = "text-green-600";
    if (porcentagem > 100) corTexto = "text-red-600";
    else if (porcentagem > 90) corTexto = "text-yellow-600";

    // Monta o HTML do Card de Consumo
    let infoConsumoHtml = "";

    if (totalConsumidoTRD > 0) {
      // --- VERSÃO COM TRD (DETALHADA) ---
      infoConsumoHtml = `
            <div class="flex flex-col p-4 bg-gray-50 border border-gray-200 rounded-lg mb-4 shadow-sm">
                <div class="text-center mb-2 border-b pb-2">
                    <span class="text-xs uppercase tracking-wider text-gray-500 font-semibold">Total Pago no Período</span>
                    <div class="text-2xl font-bold text-gray-800">${formatCurrency(
                      totalGeralPeriodo
                    )}</div>
                </div>
                
                <div class="grid grid-cols-2 gap-4 text-center">
                    <div>
                        <span class="text-xs text-gray-500 block">Consumo do Aditivo</span>
                        <span class="text-sm font-bold text-blue-600 block">${formatCurrency(
                          totalConsumidoAditivo
                        )}</span>
                        <span class="text-xs ${corTexto} block mt-1 font-medium">${porcentagem.toFixed(
        1
      )}% ${textoBase}</span>
                    </div>
                    <div class="border-l pl-4">
                        <span class="text-xs text-gray-500 block">Pagamentos via TRD</span>
                        <span class="text-sm font-bold text-red-600 block">${formatCurrency(
                          totalConsumidoTRD
                        )}</span>
                        <span class="text-xs text-gray-400 block mt-1">(Não consome saldo)</span>
                    </div>
                </div>

                <div class="w-full bg-gray-200 rounded-full h-1.5 mt-3">
                    <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${Math.min(
                      porcentagem,
                      100
                    )}%"></div>
                </div>
            </div>`;
    } else {
      // --- VERSÃO PADRÃO (SEM TRD) ---
      infoConsumoHtml = `
            <div class="flex flex-col items-center justify-center p-3 bg-gray-50 border border-gray-200 rounded-lg mb-4">
                <span class="text-xs uppercase tracking-wider text-gray-500 font-semibold">Consumido no Período</span>
                <div class="text-2xl font-bold text-gray-800 mt-1">${formatCurrency(
                  totalConsumidoAditivo
                )}</div>
                <div class="text-sm font-medium ${corTexto} mt-1">
                    ${porcentagem.toFixed(1)}% ${textoBase}
                </div>
                <div class="w-full bg-gray-200 rounded-full h-1.5 mt-2 max-w-xs">
                    <div class="bg-blue-600 h-1.5 rounded-full" style="width: ${Math.min(
                      porcentagem,
                      100
                    )}%"></div>
                </div>
            </div>`;
    }

    // Tabela
    let htmlTabela = "";
    if (pagamentosFiltrados.length === 0) {
      htmlTabela = `<p class="text-gray-500 text-center">Nenhum pagamento encontrado no período.</p>`;
    } else {
      htmlTabela = `
                <div class="overflow-x-auto border rounded-lg">
                <table class="min-w-full divide-y divide-gray-200">
                    <thead class="bg-gray-50">
                        <tr>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Período (Ref)</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Valor Pago</th>
                            <th class="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">NF</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white divide-y divide-gray-200">
                        ${pagamentosFiltrados
                          .map(
                            (p) => `
                            <tr>
                                <td class="px-4 py-3 text-sm font-semibold text-gray-800">${
                                  p.periodoDe
                                    ? `${formatDate(
                                        p.periodoDe
                                      )} a ${formatDate(p.periodoAte)}`
                                    : "N/D"
                                }</td>
                                <td class="px-4 py-3 text-sm font-bold text-blue-600">
                                    ${formatCurrency(p.valorPago)}
                                    ${
                                      p.isTRD
                                        ? '<span class="ml-2 px-2 py-0.5 bg-red-100 text-red-800 text-[10px] uppercase font-bold rounded-full">TRD</span>'
                                        : ""
                                    }
                                </td>
                                <td class="px-4 py-3 text-sm text-gray-600">${
                                  p.notaFiscal
                                }</td>
                            </tr>
                        `
                          )
                          .join("")}
                    </tbody>
                </table>
                </div>`;
    }
    pagamentosContainer.innerHTML = infoConsumoHtml + htmlTabela;
  }

  // --- 3. INJEÇÃO DO BOTÃO PDF ---
  const modalFooter = document.querySelector(
    "#modal-detalhes-aditivo .flex.justify-end"
  );
  const btnExistente = document.getElementById("btn-pdf-aditivo");
  if (btnExistente) btnExistente.remove();

  const btnPdf = document.createElement("button");
  btnPdf.id = "btn-pdf-aditivo";
  btnPdf.type = "button";
  btnPdf.className =
    "bg-red-600 hover:bg-red-700 text-white font-bold py-2 px-4 rounded-lg mr-2";
  btnPdf.textContent = "Exportar PDF";
  btnPdf.onclick = function () {
    exportarAditivoPDF(aditivoId, contratoPaiId);
  };
  modalFooter.insertBefore(btnPdf, modalFooter.firstChild);

  abrirModal("modal-detalhes-aditivo");
}

function renderizarModalDetalhesPagamento(contratoId, pagamentoId) {
  const contrato = db.contratos.find((c) => c.id === contratoId);
  if (!contrato) return;
  const pagamento = contrato.pagamentos.find((p) => p.id === pagamentoId);
  if (!pagamento) return;

  // Define os IDs no modal
  document.getElementById("detalhe-contrato-id").value = contratoId;
  document.getElementById("detalhe-pagamento-id").value = pagamentoId;

  document.getElementById("detalhe-pagamento-info").textContent = `NF: ${
    pagamento.notaFiscal
  } - Valor Total: ${formatCurrency(pagamento.valorPago)}`;

  const listaItens = document.getElementById("lista-detalhes-itens");
  listaItens.innerHTML = "";

  let totalItens = 0;

  if (!pagamento.detalhes || pagamento.detalhes.length === 0) {
    listaItens.innerHTML = `<tr><td colspan="5" class="px-4 py-4 text-center text-gray-500">Nenhum item detalhado.</td></tr>`;
  } else {
    pagamento.detalhes.forEach((item) => {
      const valorTotalItem =
        (parseFloat(item.quantidade) || 0) *
        (parseFloat(item.valorUnitario) || 0);
      totalItens += valorTotalItem;

      const row = `
                <tr>
                    <td class="px-4 py-3 text-sm">${item.descricao}</td>
                    <td class="px-4 py-3 text-sm">${item.quantidade}</td>
                    <td class="px-4 py-3 text-sm">${formatCurrency(
                      item.valorUnitario
                    )}</td>
                    <td class="px-4 py-3 text-sm">${formatCurrency(
                      valorTotalItem
                    )}</td>
                    <td class="px-4 py-3 text-sm">
                        <button class="btn-excluir-item-detalhe text-red-600 hover:text-red-800" data-item-id="${
                          item.id
                        }">Excluir</button>
                    </td>
                </tr>
            `;
      listaItens.innerHTML += row;
    });
  }

  document.getElementById("detalhe-item-total-geral").textContent =
    formatCurrency(totalItens);
  document.getElementById("form-detalhe-item").reset();
}

// --- Funções de UI (Formulário Contrato) ---

function showFormStep(step) {
  currentFormStep = step;
  document
    .querySelectorAll("#form-contrato .form-step")
    .forEach((s) => (s.style.display = "none"));

  const currentStepEl = document.getElementById(`form-step-${step}`);
  if (currentStepEl) {
    currentStepEl.style.display = "block";
  }

  const stepper = document.getElementById("stepper-contrato");
  if (stepper.style.display === "none") return;

  // Atualiza as cores das bolinhas (agora até 4)
  for (let i = 1; i <= 4; i++) {
    const dot = document.getElementById(`step-dot-${i}`);
    if (!dot) continue;

    dot.classList.remove(
      "bg-blue-600",
      "bg-green-600",
      "bg-gray-300",
      "text-white",
      "text-gray-600"
    );

    if (i < step) {
      dot.classList.add("bg-green-600", "text-white"); // Passos concluídos
    } else if (i === step) {
      dot.classList.add("bg-blue-600", "text-white"); // Passo atual
    } else {
      dot.classList.add("bg-gray-300", "text-gray-600"); // Passos futuros
    }
  }

  // Controle dos botões Inferiores
  document.getElementById("btn-form-anterior").style.display =
    step === 1 ? "none" : "inline-block";

  // O botão "Próximo" some no último passo (4)
  document.getElementById("btn-form-proximo").style.display =
    step === 4 ? "none" : "inline-block";

  // O botão "Salvar" só aparece no último passo (4)
  document.getElementById("btn-form-salvar").style.display =
    step === 4 ? "inline-block" : "none";
}

function validateStep(step) {
  const stepElement = document.getElementById(`form-step-${step}`);
  if (!stepElement) return false;

  // Procura por inputs requeridos que estão visíveis
  const inputs = stepElement.querySelectorAll(
    "input[required], select[required], textarea[required]"
  );
  for (const input of inputs) {
    // Verifica se o input (ou seu fieldset pai) está visível
    if (input.offsetParent !== null) {
      if (!input.value) {
        const label =
          input.placeholder || input.labels?.[0]?.textContent || "Campo";
        mostrarToast(`Erro: O campo "${label}" é obrigatório.`, true);
        input.focus();
        return false;
      }
    }
  }
  return true;
}

function saveStepData(step) {
  if (step === 1) {
    tempContratoData.unidade = {
      nome: document.getElementById("unidade-nome").value,
      cnpj: document.getElementById("unidade-cnpj").value,
      endereco: document.getElementById("unidade-endereco").value,
      rep: document.getElementById("unidade-rep").value,
    };
  } else if (step === 2) {
    tempContratoData.empresa = {
      nome: document.getElementById("empresa-nome").value,
      cnpj: document.getElementById("empresa-cnpj").value,
      endereco: document.getElementById("empresa-endereco").value,
      rep: document.getElementById("empresa-rep").value,
    };
  } else if (step === 3) {
    tempContratoData.processoSei = document.getElementById(
      "contrato-processo-sei"
    ).value;
    tempContratoData.numeroContrato =
      document.getElementById("contrato-numero").value;
    tempContratoData.tipoContrato =
      document.getElementById("contrato-tipo").value;
    tempContratoData.objeto = document.getElementById("contrato-objeto").value;
    tempContratoData.estimativaMensal = parseBRL(
      document.getElementById("contrato-estimativa-mensal").value
    );
    tempContratoData.tempoContrato =
      document.getElementById("contrato-tempo").value;
    tempContratoData.dataAssinatura = document.getElementById(
      "contrato-data-assinatura"
    ).value;
    tempContratoData.dataInicio = document.getElementById(
      "contrato-data-inicio"
    ).value;
    tempContratoData.linkSei =
      document.getElementById("contrato-link-sei").value.trim() || null;

    const valorTotalInput = document.getElementById("contrato-valor-total");
    const dataFimInput = document.getElementById("contrato-data-fim");
    if (valorTotalInput)
      tempContratoData.valorTotal = parseBRL(valorTotalInput.value);
    if (dataFimInput) tempContratoData.dataFim = dataFimInput.value;
  } else if (step === 4) {
    // --- NOVO: Captura dados do Passo 4 ---
    tempContratoData.gestorInicial = {
      nome: document.getElementById("contrato-gestor-nome").value,
      matricula: document.getElementById("contrato-gestor-matricula").value,
    };

    tempContratoData.fiscaisIniciais = [];
    const fiscalRows = document.querySelectorAll(
      "#fiscais-container-step4 .fiscal-row"
    );
    fiscalRows.forEach((row) => {
      const nome = row.querySelector(".fiscal-nome").value;
      const matricula = row.querySelector(".fiscal-matricula").value;
      if (nome) {
        tempContratoData.fiscaisIniciais.push({
          nome: nome,
          matricula: matricula,
        });
      }
    });
  }
}

// --- Funções de Manipulação de Dados (CRUD) ---

// --- LÓGICA DO BANCO DE EMPRESAS ---

// Extrai empresas dos contratos antigos para popular o banco inicialmente
function extrairEmpresasDeContratosExistentes(contratos) {
  const mapa = new Map();

  contratos.forEach((c) => {
    // Unidade
    if (c.unidade?.cnpj) {
      if (!mapa.has(c.unidade.cnpj)) {
        mapa.set(c.unidade.cnpj, {
          id: `emp_${Date.now()}_u`,
          cnpj: c.unidade.cnpj,
          nome: c.unidade.nome,
          endereco: c.unidade.endereco,
          representantes: [c.unidade.rep],
          isPadrao: false,
        });
      } else {
        // Adiciona representante se não existir
        const emp = mapa.get(c.unidade.cnpj);
        if (!emp.representantes.includes(c.unidade.rep))
          emp.representantes.push(c.unidade.rep);
      }
    }
    // Empresa
    if (c.empresa?.cnpj) {
      if (!mapa.has(c.empresa.cnpj)) {
        mapa.set(c.empresa.cnpj, {
          id: `emp_${Date.now()}_e`,
          cnpj: c.empresa.cnpj,
          nome: c.empresa.nome,
          endereco: c.empresa.endereco,
          representantes: [c.empresa.rep],
          isPadrao: false,
        });
      } else {
        const emp = mapa.get(c.empresa.cnpj);
        if (!emp.representantes.includes(c.empresa.rep))
          emp.representantes.push(c.empresa.rep);
      }
    }
  });

  db.empresas = Array.from(mapa.values());
}

function renderizarBancoEmpresas() {
  const tbody = document.getElementById("lista-banco-empresas");
  tbody.innerHTML = "";

  db.empresas.forEach((emp) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
            <td class="px-4 py-2 text-sm">${emp.cnpj}</td>
            <td class="px-4 py-2 text-sm">${emp.nome}</td>
            <td class="px-4 py-2 text-center">
                ${
                  emp.isPadrao
                    ? '<span class="text-xs bg-purple-100 text-purple-800 px-2 py-1 rounded-full font-bold">Unidade Padrão</span>'
                    : ""
                }
            </td>
            <td class="px-4 py-2 text-sm">
                <button class="btn-editar-empresa text-blue-600 hover:underline mr-2" data-id="${
                  emp.id
                }">Editar</button>
                <button class="btn-excluir-empresa text-red-600 hover:underline" data-id="${
                  emp.id
                }">Excluir</button>
            </td>
        `;
    tbody.appendChild(tr);
  });
}

// Variável temporária para representantes no modal de edição
let tempRepresentantes = [];

function renderizarTagsRepresentantes() {
  const container = document.getElementById("lista-representantes-tags");
  container.innerHTML = "";
  tempRepresentantes.forEach((rep, index) => {
    const tag = document.createElement("li");
    tag.className =
      "bg-blue-100 text-blue-800 px-2 py-1 rounded flex items-center text-sm";
    tag.innerHTML = `
            ${rep}
            <button type="button" class="ml-2 text-red-600 font-bold hover:text-red-800" onclick="removerRepTemp(${index})">&times;</button>
        `;
    container.appendChild(tag);
  });
}

function removerRepTemp(index) {
  tempRepresentantes.splice(index, 1);
  renderizarTagsRepresentantes();
}

function abrirModalEditarEmpresa(empId = null) {
  document.getElementById("form-cadastro-empresa").reset();
  tempRepresentantes = [];
  document.getElementById("banco-empresa-id").value = "";

  if (empId) {
    const emp = db.empresas.find((e) => e.id === empId);
    if (emp) {
      document.getElementById("banco-empresa-id").value = emp.id;
      document.getElementById("banco-cnpj").value = emp.cnpj;
      document.getElementById("banco-nome").value = emp.nome;
      document.getElementById("banco-endereco").value = emp.endereco;
      document.getElementById("banco-is-padrao").checked = emp.isPadrao;
      tempRepresentantes = [...emp.representantes];
    }
  }

  renderizarTagsRepresentantes();
  abrirModal("modal-form-empresa-banco");
}

function salvarEmpresaBanco(e) {
  e.preventDefault();
  const id = document.getElementById("banco-empresa-id").value;
  const isPadrao = document.getElementById("banco-is-padrao").checked;

  // Se marcou como padrão, remove o padrão das outras
  if (isPadrao) {
    db.empresas.forEach((emp) => (emp.isPadrao = false));
  }

  const dados = {
    cnpj: document.getElementById("banco-cnpj").value,
    nome: document.getElementById("banco-nome").value,
    endereco: document.getElementById("banco-endereco").value,
    representantes: tempRepresentantes,
    isPadrao: isPadrao,
  };

  if (id) {
    const index = db.empresas.findIndex((e) => e.id === id);
    if (index > -1) {
      db.empresas[index] = { ...db.empresas[index], ...dados };
      mostrarToast("Empresa atualizada!");
    }
  } else {
    dados.id = `emp_${Date.now()}`;
    db.empresas.push(dados);
    mostrarToast("Empresa cadastrada!");
  }

  renderizarBancoEmpresas();
  atualizarDatalistsContrato(); // Atualiza as sugestões no form de contrato
  fecharModal("modal-form-empresa-banco");
}

// ATUALIZADO: para lidar com Edição e Aditivos
function salvarContrato(e) {
  e.preventDefault();
  const id = document.getElementById("contrato-id").value;
  const parentId = document.getElementById("contrato-parentId").value;

  // Se for Contrato Pai, valida até o passo 4. Se for Aditivo, valida passo 3.
  if (!parentId) {
    if (!validateStep(4)) return;
    saveStepData(4);
  } else {
    if (!validateStep(3)) return;
    saveStepData(3);
  }

  const contratoData = structuredClone(tempContratoData);

  // Lógica de Aditivo (Mantida)
  if (parentId) {
    contratoData.aditivo = {
      tipo: document.getElementById("aditivo-tipo").value,
      numero: document.getElementById("aditivo-numero").value,
      processoSei: document.getElementById("aditivo-processo-sei").value,
      linkSei: document.getElementById("aditivo-link-sei").value.trim() || null,
      justificativa: document.getElementById("aditivo-justificativa").value,
      dataAssinatura: document.getElementById("aditivo-data-assinatura").value,
    };
    // ... (Mantenha sua lógica de salvar campos específicos de aditivo Valor/Prazo/Gestor aqui) ...
  }

  if (id) {
    // --- MODO EDITAR ---
    const index = db.contratos.findIndex((c) => c.id === id);
    if (index > -1) {
      db.contratos[index] = {
        ...db.contratos[index],
        ...contratoData,
      };
      mostrarToast("Contrato atualizado com sucesso!");
    }
  } else {
    // --- MODO NOVO ---
    contratoData.id = `contrato_${Date.now()}`;
    contratoData.pagamentos = [];

    if (parentId) {
      contratoData.parentId = parentId;
      mostrarToast("Aditivo salvo com sucesso!");
    } else {
      // É UM NOVO CONTRATO PAI
      // Salva com as propriedades .gestorInicial e .fiscaisIniciais (vindas do step 4)
      mostrarToast("Contrato salvo com sucesso!");
    }
    db.contratos.push(contratoData);
  }

  renderizarContratos();
  fecharModal("modal-contrato");
  atualizarStatsExternos();

  // Atualiza modal visualizar se estiver aberto
  if (
    document.getElementById("modal-visualizar-contrato").style.display ===
    "block"
  ) {
    renderizarModalVisualizar(parentId || id);
  }

  resetarFormularioContrato();
}

function salvarPagamento(e) {
  e.preventDefault();
  const contratoId = document.getElementById("pagamento-contrato-id").value;
  const pagamentoId = document.getElementById("pagamento-id").value;
  const contrato = db.contratos.find((c) => c.id === contratoId);
  let novoPagamentoIdParaDetalhe = null;

  if (!contrato) {
    mostrarToast("Erro: Contrato não encontrado", true);
    return;
  }

  const pagamentoData = {
    data: document.getElementById("pagamento-data").value,
    valorPago: parseBRL(document.getElementById("pagamento-valor").value),
    notaFiscal: document.getElementById("pagamento-nf").value,
    processoPagamentoSei: document.getElementById("pagamento-processo-sei")
      .value,
    linkPagamentoSei:
      document.getElementById("pagamento-link-sei").value.trim() || null,
    periodoDe: document.getElementById("pagamento-periodo-de").value,
    periodoAte: document.getElementById("pagamento-periodo-ate").value,
    isTRD: document.getElementById("pagamento-is-trd").checked,
  };

  if (pagamentoId) {
    // Editar pagamento existente
    const index = contrato.pagamentos.findIndex((p) => p.id === pagamentoId);
    if (index > -1) {
      contrato.pagamentos[index] = {
        ...contrato.pagamentos[index], // Preserva ID e detalhes
        ...pagamentoData, // Sobrescreve com novos dados
      };
      mostrarToast("Pagamento atualizado!");
    }
  } else {
    // Novo pagamento
    const novoPagamento = {
      ...pagamentoData,
      id: `pag_${Date.now()}`,
      detalhes: [],
    };
    contrato.pagamentos.push(novoPagamento);
    novoPagamentoIdParaDetalhe = novoPagamento.id;
    mostrarToast("Pagamento adicionado!");
  }

  renderizarContratos(); // Atualiza o card com o novo valor pago

  // ATUALIZADO: para re-renderizar o modal PAI
  if (
    document.getElementById("modal-visualizar-contrato").style.display ===
    "block"
  ) {
    const contratoDono = db.contratos.find((c) => c.id === contratoId);
    const contratoPaiId = contratoDono.parentId || contratoDono.id;
    renderizarModalVisualizar(contratoPaiId);
  }

  fecharModal("modal-pagamento");
  atualizarStatsExternos();

  if (novoPagamentoIdParaDetalhe) {
    renderizarModalDetalhesPagamento(contratoId, novoPagamentoIdParaDetalhe);
    abrirModal("modal-detalhes-pagamento");
  }
}

function salvarDetalheItem(e) {
  e.preventDefault();
  const contratoId = document.getElementById("detalhe-contrato-id").value;
  const pagamentoId = document.getElementById("detalhe-pagamento-id").value;

  const contrato = db.contratos.find((c) => c.id === contratoId);
  if (!contrato) return;
  const pagamento = contrato.pagamentos.find((p) => p.id === pagamentoId);
  if (!pagamento) return;

  const novoItem = {
    id: `item_${Date.now()}`,
    descricao: document.getElementById("detalhe-item-desc").value,
    quantidade: parseFloat(document.getElementById("detalhe-item-qtd").value),
    valorUnitario: parseBRL(
      document.getElementById("detalhe-item-valor").value
    ),
  };

  if (!pagamento.detalhes) {
    pagamento.detalhes = [];
  }

  pagamento.detalhes.push(novoItem);
  renderizarModalDetalhesPagamento(contratoId, pagamentoId);
}

function excluirPagamento(contratoId, pagamentoId) {
  const contrato = db.contratos.find((c) => c.id === contratoId);
  if (!contrato) return;

  contrato.pagamentos = contrato.pagamentos.filter((p) => p.id !== pagamentoId);

  renderizarContratos(); // Atualiza card

  // Re-renderiza o modal de visualização (a função já está no event listener)
  mostrarToast("Pagamento excluído");
}

function excluirItemDetalhe(contratoId, pagamentoId, itemId) {
  const contrato = db.contratos.find((c) => c.id === contratoId);
  if (!contrato) return;
  const pagamento = contrato.pagamentos.find((p) => p.id === pagamentoId);
  if (!pagamento || !pagamento.detalhes) return;

  pagamento.detalhes = pagamento.detalhes.filter((item) => item.id !== itemId);

  renderizarModalDetalhesPagamento(contratoId, pagamentoId);

  // Re-renderiza o modal de visualização (a função já está no event listener)
}

// --- Funções de Manipulação de Dados (Import/Export) ---

async function carregarDados() {
  try {
    const response = await fetch("dados.json");
    if (!response.ok) {
      throw new Error("Arquivo dados.json não encontrado ou inválido.");
    }
    const data = await response.json();
    if (data && data.contratos) {
      db = data;
      mostrarToast("Dados carregados com sucesso!");
      if (
        (!data.empresas || data.empresas.length === 0) &&
        data.contratos.length > 0
      ) {
        extrairEmpresasDeContratosExistentes(data.contratos);
      }
    }
  } catch (error) {
    console.warn(error.message);
    mostrarToast("Nenhum dado local encontrado. Começando do zero.", true);
  } finally {
    document.body.classList.remove("loading");
    renderizarContratos();
  }

  atualizarStatsExternos();
}

function exportarDados() {
  try {
    const dataStr = JSON.stringify(db, null, 2);
    const blob = new Blob([dataStr], { type: "application/json" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = "dados.json";
    document.body.appendChild(a);
    a.click();

    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    mostrarToast("Dados exportados com sucesso!");
  } catch (error) {
    console.error("Erro ao exportar dados:", error);
    mostrarToast("Erro ao exportar dados.", true);
  }
}

// --- Função de Exportar PDF ---

function exportarDetalhesPDF(contratoPaiId) {
  // ATUALIZADO: Pega o PAI e TODOS os aditivos/pagamentos
  const contratoPai = db.contratos.find((c) => c.id === contratoPaiId);
  if (!contratoPai) {
    mostrarToast("Erro ao gerar PDF: Contrato não encontrado", true);
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });
  const resumo = calcularResumoContrato(contratoPai);
  const aditivos = db.contratos.filter((c) => c.parentId === contratoPai.id);

  let pagamentos = [
    ...(contratoPai.pagamentos || []).map((p) => ({
      ...p,
      origemContratoId: contratoPai.id,
    })),
  ];
  aditivos.forEach((ad) => {
    if (ad.pagamentos && ad.pagamentos.length > 0) {
      pagamentos = pagamentos.concat(
        ad.pagamentos.map((p) => ({
          ...p,
          origemContratoId: ad.id,
          origemAditivo: ad.aditivo.processoSei,
        }))
      );
    }
  });
  pagamentos.sort((a, b) => new Date(a.data) - new Date(b.data));

  // Encontra o último gestor/fiscal
  let gestorAtual = { nome: "N/D", matricula: "" };
  let fiscaisAtuais = [];
  [...aditivos].reverse().forEach((ad) => {
    if (ad.aditivo && ad.aditivo.tipo === "GestorFiscal") {
      if (
        gestorAtual.nome === "N/D" &&
        ad.aditivo.gestor &&
        ad.aditivo.gestor.nome
      ) {
        gestorAtual = ad.aditivo.gestor;
      }
      if (
        fiscaisAtuais.length === 0 &&
        ad.aditivo.fiscais &&
        ad.aditivo.fiscais.length > 0
      ) {
        fiscaisAtuais = ad.aditivo.fiscais;
      }
    }
  });

  // --- Configuração do Rodapé (Paginação e Data) ---
  const addFooter = () => {
    const pageCount = doc.internal.getNumberOfPages();
    const dataEmissao = new Date().toLocaleString("pt-BR");

    doc.setFontSize(8);
    doc.setTextColor(100);

    for (let i = 1; i <= pageCount; i++) {
      doc.setPage(i);
      doc.text(`Emitido em: ${dataEmissao}`, 14, 287);
      doc.text(`Página ${i}/${pageCount}`, 190, 287);
    }
  };

  // --- Página 1: Detalhes do Contrato ---
  doc.setFontSize(18);
  doc.text("Relatório de Acompanhamento de Contrato", 14, 22);
  doc.setFontSize(11);
  doc.setTextColor(100);

  const dadosContrato = [
    ["Nº Processo SEI", contratoPai.processoSei],
    ["Nº do Contrato", contratoPai.numeroContrato],
    ["Tipo de Contrato", contratoPai.tipoContrato],
    ["Objeto", contratoPai.objeto],
    ["Valor Inicial", formatCurrency(contratoPai.valorTotal)],
    ["Valor Total (c/ Aditivos)", formatCurrency(resumo.valorTotal)],
    ["Estimativa Mensal", formatCurrency(contratoPai.estimativaMensal)],
    ["Data Início", formatDate(contratoPai.dataInicio)],
    ["Data Fim (c/ Aditivos)", formatDate(resumo.dataFimFinal)],
    ["Total Pago", formatCurrency(resumo.totalPago)],
    ["Valor Restante", formatCurrency(resumo.valorRestante)],
    ["Dias Restantes", resumo.diasRestantes],
    [
      "Gestor Atual",
      `${gestorAtual.nome} ${
        gestorAtual.matricula ? "(Mat. " + gestorAtual.matricula + ")" : ""
      }`,
    ],
    [
      "Fiscais Atuais",
      fiscaisAtuais
        .map(
          (f) => `${f.nome} ${f.matricula ? "(Mat. " + f.matricula + ")" : ""}`
        )
        .join(", ") || "N/D",
    ],
  ];

  doc.autoTable({
    head: [["Dados do Contrato", ""]],
    body: dadosContrato,
    startY: 30,
    headStyles: { fillColor: [22, 160, 133] },
    theme: "striped",
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: "auto" },
    },
    didParseCell: function (data) {
      if (data.row.index === 3 && data.column.index === 1) {
        // Objeto
        data.cell.styles.cellWidth = "wrap";
      }
      if (
        data.row.index === 5 ||
        data.row.index === 8 ||
        data.row.index === 12 ||
        data.row.index === 13
      ) {
        // Campos agregados/atuais
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  const dadosUnidade = [
    ["Razão Social", contratoPai.unidade.nome],
    ["CNPJ", contratoPai.unidade.cnpj],
    ["Endereço", contratoPai.unidade.endereco],
    ["Representante", contratoPai.unidade.rep],
  ];
  doc.autoTable({
    head: [["Unidade Contratante", ""]],
    body: dadosUnidade,
    startY: doc.autoTable.previous.finalY + 10,
    headStyles: { fillColor: [44, 62, 80] },
    theme: "striped",
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: "auto" },
    },
  });

  const dadosEmpresa = [
    ["Razão Social", contratoPai.empresa.nome],
    ["CNPJ", contratoPai.empresa.cnpj],
    ["Endereço", contratoPai.empresa.endereco],
    ["Representante", contratoPai.empresa.rep],
  ];
  doc.autoTable({
    head: [["Empresa Contratada", ""]],
    body: dadosEmpresa,
    startY: doc.autoTable.previous.finalY + 10,
    headStyles: { fillColor: [44, 62, 80] },
    theme: "striped",
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 50 },
      1: { cellWidth: "auto" },
    },
  });

  // --- Aditivos (Página 2) ---
  if (aditivos.length > 0) {
    doc.addPage(); // <<<< MODIFICAÇÃO: Força nova página
    doc.setFontSize(16);
    doc.text("Histórico de Aditivos", 14, 22);

    const headAditivos = [
      [
        "Número",
        "Tipo",
        "Data Assin.",
        "Processo Aditivo",
        "Justificativa",
        "Valor/Prazo/Gestor",
      ],
    ];
    const bodyAditivos = aditivos.map((ad) => {
      let infoExtra = "N/A";
      if (ad.aditivo.tipo === "Valor") {
        infoExtra = formatCurrency(ad.valorTotal);
      } else if (ad.aditivo.tipo === "Prazo") {
        infoExtra = `Nova Data Fim: ${formatDate(ad.dataFim)}`;
      } else if (ad.aditivo.tipo === "GestorFiscal" && ad.aditivo.gestor) {
        infoExtra = `Gestor: ${ad.aditivo.gestor.nome}`;
      }
      return [
        ad.aditivo.numero,
        ad.aditivo.tipo,
        formatDate(ad.aditivo.dataAssinatura),
        ad.aditivo.processoSei,
        ad.aditivo.justificativa,
        infoExtra,
      ];
    });

    doc.autoTable({
      head: headAditivos,
      body: bodyAditivos,
      startY: 30, // <<<< MODIFICAÇÃO: Começa do topo
      headStyles: { fillColor: [96, 108, 119] }, // Cinza
      theme: "striped",
    });
  }

  // --- Página 3+: Histórico de Pagamentos ---
  doc.addPage();
  doc.setFontSize(16);
  doc.text("Histórico de Pagamentos (Consolidado)", 14, 22);
  let startY = 30; // <<<< MODIFICAÇÃO: Renomeada ou resetada

  if (pagamentos.length === 0) {
    doc.setFontSize(11);
    doc.setTextColor(100);
    doc.text("Nenhum pagamento registrado.", 14, 30);
  } else {
    pagamentos.forEach((p, index) => {
      const headPagamento = [
        ["Data", "Período", "Valor Pago", "NF", "Proc. Pag. SEI"],
      ];
      const bodyPagamento = [
        [
          formatDate(p.data) +
            (p.origemAditivo ? `\n(Aditivo ${p.origemAditivo})` : ""),
          p.periodoDe
            ? `${formatDate(p.periodoDe)} a ${formatDate(p.periodoAte)}`
            : "N/D",
          formatCurrency(p.valorPago),
          p.notaFiscal,
          p.processoPagamentoSei,
        ],
      ];

      // Verifica se precisa de nova página ANTES de desenhar
      let requiredHeight = 20; // Altura estimada do pagto + detalhes
      if (p.detalhes && p.detalhes.length > 0) {
        requiredHeight += (p.detalhes.length + 2) * 8;
      }
      if (startY + requiredHeight > 280) {
        doc.addPage();
        startY = 22;
      }

      doc.autoTable({
        head: headPagamento,
        body: bodyPagamento,
        startY: startY,
        theme: "grid",
        headStyles: { fillColor: [96, 108, 119], fontSize: 9 },
        bodyStyles: {
          fontSize: 9,
          fillColor: p.origemAditivo ? [235, 248, 255] : [255, 255, 255],
        }, // Azul claro para aditivo
      });
      startY = doc.autoTable.previous.finalY;

      // Tabela de Detalhes
      if (p.detalhes && p.detalhes.length > 0) {
        let totalItens = 0;
        const bodyDetalhes = p.detalhes.map((item) => {
          const valorTotalItem =
            (parseFloat(item.quantidade) || 0) *
            (parseFloat(item.valorUnitario) || 0);
          totalItens += valorTotalItem;
          return [
            item.descricao,
            item.quantidade,
            formatCurrency(item.valorUnitario),
            formatCurrency(valorTotalItem),
          ];
        });
        bodyDetalhes.push([
          {
            content: "Total dos Itens:",
            colSpan: 3,
            styles: { halign: "right", fontStyle: "bold" },
          },
          {
            content: formatCurrency(totalItens),
            styles: { fontStyle: "bold" },
          },
        ]);

        doc.autoTable({
          head: [["Descrição", "Qtd.", "Valor Unit.", "Total Item"]],
          body: bodyDetalhes,
          startY: startY,
          theme: "striped",
          margin: { left: 20, right: 14 },
          headStyles: {
            fillColor: [236, 240, 241],
            textColor: [44, 62, 80],
            fontSize: 8,
          },
          bodyStyles: { fontSize: 8 },
          didParseCell: function (data) {
            if (data.row.index === bodyDetalhes.length - 1) {
              data.cell.styles.fillColor = [245, 245, 245];
            }
          },
        });
        startY = doc.autoTable.previous.finalY + 5;
      } else {
        startY += 5;
      }
      if (index < pagamentos.length - 1) {
        startY += 5;
      }
    });
  }

  addFooter();
  doc.save(
    `Relatorio_${contratoPai.objeto.substring(0, 20).replace(/\s+/g, "_")}_${
      contratoPai.processoSei
    }.pdf`
  );
  mostrarToast("Relatório PDF gerado!");
}

// --- EXPORTAR PDF DE UM ADITIVO ESPECÍFICO ---
function exportarAditivoPDF(aditivoId, contratoPaiId) {
  const aditivo = db.contratos.find((c) => c.id === aditivoId);
  const contratoPai = db.contratos.find((c) => c.id === contratoPaiId);

  if (!aditivo || !contratoPai) {
    mostrarToast("Erro: Dados para exportação não encontrados.", true);
    return;
  }

  const { jsPDF } = window.jspdf;
  const doc = new jsPDF({ orientation: "p", unit: "mm", format: "a4" });

  // --- Título ---
  doc.setFontSize(16);
  doc.text(`Detalhamento do ${aditivo.aditivo.numero} Termo Aditivo`, 14, 20);
  doc.setFontSize(10);
  doc.setTextColor(100);
  doc.text(`Gerado em: ${new Date().toLocaleString("pt-BR")}`, 14, 26);

  // --- Bloco 1: Vinculação ao Contrato Pai ---
  const dadosContrato = [
    ["Contrato Principal", contratoPai.numeroContrato],
    ["Processo SEI (Pai)", contratoPai.processoSei],
    ["Objeto", contratoPai.objeto],
    ["Empresa", contratoPai.empresa.nome],
  ];

  doc.autoTable({
    head: [["Vinculação - Contrato Original", ""]],
    body: dadosContrato,
    startY: 35,
    headStyles: { fillColor: [44, 62, 80] },
    theme: "striped",
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 45 },
      1: { cellWidth: "auto" },
    },
  });

  // --- Bloco 2: Informações do Aditivo ---
  const valorAditado = parseFloat(aditivo.valorTotal) || 0;
  const novaDataFim = aditivo.dataFim
    ? formatDate(aditivo.dataFim)
    : "Não altera";

  const dadosAditivo = [
    ["Tipo de Aditivo", aditivo.aditivo.tipo],
    ["Número", aditivo.aditivo.numero],
    ["Processo SEI (Aditivo)", aditivo.aditivo.processoSei],
    ["Data Assinatura", formatDate(aditivo.aditivo.dataAssinatura)],
    ["Justificativa", aditivo.aditivo.justificativa],
    ["Valor Aditado", formatCurrency(valorAditado)],
    ["Nova Data Fim", novaDataFim],
  ];

  if (aditivo.aditivo.gestor) {
    dadosAditivo.push(["Gestor Nomeado", aditivo.aditivo.gestor.nome]);
  }

  doc.autoTable({
    head: [["Detalhes do Termo Aditivo", ""]],
    body: dadosAditivo,
    startY: doc.autoTable.previous.finalY + 10,
    headStyles: { fillColor: [22, 160, 133] },
    theme: "striped",
    columnStyles: {
      0: { fontStyle: "bold", cellWidth: 45 },
      1: { cellWidth: "auto" },
    },
    didParseCell: function (data) {
      if (
        data.section === "body" &&
        (data.row.index === 5 || data.row.index === 6)
      ) {
        data.cell.styles.fontStyle = "bold";
      }
    },
  });

  // --- Bloco 3: Cálculos de Consumo (COM TRD) ---
  if (aditivo.aditivo.tipo !== "GestorFiscal") {
    let pagamentosFiltrados = [];
    let totalConsumidoAditivo = 0;
    let totalConsumidoTRD = 0;
    let textoPeriodo = "Período não aplicável";

    // Lógica de datas (Igual ao Modal)
    const todosInstrumentos = [
      contratoPai,
      ...db.contratos.filter(
        (c) => c.parentId === contratoPaiId && c.aditivo.tipo === "Prazo"
      ),
    ].sort(
      (a, b) =>
        new Date(a.dataFim + "T00:00:00") - new Date(b.dataFim + "T00:00:00")
    );

    const indexAtual = todosInstrumentos.findIndex((c) => c.id === aditivoId);

    if (
      indexAtual > 0 &&
      (aditivo.aditivo.tipo === "Prazo" || aditivo.aditivo.tipo === "Valor")
    ) {
      const instrumentoAnterior = todosInstrumentos[indexAtual - 1];
      const dataFimAnterior = new Date(
        instrumentoAnterior.dataFim + "T00:00:00"
      );
      const dataInicioAditivo = new Date(dataFimAnterior);
      dataInicioAditivo.setDate(dataInicioAditivo.getDate() + 1);
      const dataFimAditivo = new Date(aditivo.dataFim + "T00:00:00");

      textoPeriodo = `${formatDate(
        dataInicioAditivo.toISOString().split("T")[0]
      )} a ${formatDate(aditivo.dataFim)}`;

      pagamentosFiltrados = contratoPai.pagamentos.filter((p) => {
        if (!p.periodoAte) return false;
        const dataPagamento = new Date(p.periodoAte + "T00:00:00");
        return (
          dataPagamento >= dataInicioAditivo && dataPagamento <= dataFimAditivo
        );
      });

      // Separa TRD vs Aditivo
      pagamentosFiltrados.forEach((p) => {
        const val = parseFloat(p.valorPago) || 0;
        if (p.isTRD) {
          totalConsumidoTRD += val;
        } else {
          totalConsumidoAditivo += val;
        }
      });
    }

    // Monta os dados da tabela de resumo
    let percTexto = "0%";
    const resumoContrato = calcularResumoContrato(contratoPai);

    if (valorAditado > 0) {
      const perc = (totalConsumidoAditivo / valorAditado) * 100;
      percTexto = `${perc.toFixed(2)}% do valor deste aditivo`;
    } else {
      const perc =
        resumoContrato.valorTotal > 0
          ? (totalConsumidoAditivo / resumoContrato.valorTotal) * 100
          : 0;
      percTexto = `${perc.toFixed(2)}% do valor total do contrato`;
    }

    const dadosConsumo = [
      ["Período de Vigência", textoPeriodo],
      ["Consumo do Aditivo", formatCurrency(totalConsumidoAditivo)], // Apenas valor "Limpo"
      ["Representatividade", percTexto],
    ];

    // SE HOUVER TRD, ADICIONA LINHAS EXTRAS
    if (totalConsumidoTRD > 0) {
      // Adiciona linha de Total Geral antes
      dadosConsumo.splice(1, 0, [
        "Total Geral Pago no Período",
        formatCurrency(totalConsumidoAditivo + totalConsumidoTRD),
      ]);
      // Adiciona linha de TRD no final
      dadosConsumo.push([
        "Pagamentos via TRD",
        `${formatCurrency(totalConsumidoTRD)} (Não consome saldo do aditivo)`,
      ]);
    }

    doc.autoTable({
      head: [["Análise de Execução Financeira", ""]],
      body: dadosConsumo,
      startY: doc.autoTable.previous.finalY + 10,
      headStyles: { fillColor: [243, 156, 18] }, // Laranja
      theme: "grid",
      columnStyles: { 0: { fontStyle: "bold", cellWidth: 60 } },
      didParseCell: function (data) {
        // Destaca em vermelho a linha de TRD
        if (
          totalConsumidoTRD > 0 &&
          data.section === "body" &&
          data.row.index === dadosConsumo.length - 1
        ) {
          data.cell.styles.textColor = [200, 0, 0];
        }
      },
    });

    // --- Bloco 4: Lista de Pagamentos ---
    if (pagamentosFiltrados.length > 0) {
      const rowsPagamentos = pagamentosFiltrados.map((p) => [
        formatDate(p.data),
        p.periodoDe
          ? `${formatDate(p.periodoDe)} a ${formatDate(p.periodoAte)}`
          : "N/D",
        p.notaFiscal,
        formatCurrency(p.valorPago) + (p.isTRD ? " (TRD)" : ""),
      ]);

      const totalGeral = totalConsumidoAditivo + totalConsumidoTRD;

      doc.autoTable({
        head: [["Data Pagto", "Período Ref.", "NF", "Valor"]],
        body: rowsPagamentos,
        startY: doc.autoTable.previous.finalY + 10,
        headStyles: { fillColor: [127, 140, 141] }, // Cinza
        theme: "striped",
        foot: [["", "", "Total Geral:", formatCurrency(totalGeral)]],
        footStyles: {
          fontStyle: "bold",
          fillColor: [240, 240, 240],
          textColor: [0, 0, 0],
        },
        showFoot: "lastPage",
        didParseCell: function (data) {
          // Se a linha contiver "(TRD)", pinta de vermelho claro
          if (data.section === "body" && data.column.index === 3) {
            if (data.cell.text[0].includes("(TRD)")) {
              data.cell.styles.textColor = [180, 0, 0];
            }
          }
        },
      });
    } else if (aditivo.aditivo.tipo === "Prazo") {
      doc.setFontSize(10);
      doc.text(
        "Nenhum pagamento registrado neste período de vigência.",
        14,
        doc.autoTable.previous.finalY + 15
      );
    }
  }

  // --- Rodapé ---
  const pageCount = doc.internal.getNumberOfPages();
  for (let i = 1; i <= pageCount; i++) {
    doc.setPage(i);
    doc.setFontSize(8);
    doc.text(`Página ${i}/${pageCount}`, 190, 287);
  }

  doc.save(`Aditivo_${aditivo.aditivo.numero}_${contratoPai.processoSei}.pdf`);
  mostrarToast("PDF do Aditivo gerado com sucesso!");
}

// --- Funções de UI (Modal, Toast) ---

function abrirModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = "block";
  }
}

function fecharModal(id) {
  const modal = document.getElementById(id);
  if (modal) {
    modal.style.display = "none";
    // Remove a classe z-60 ao fechar
    modal.classList.remove("z-60");
  }
}

function fecharTodosModais() {
  document.querySelectorAll(".modal").forEach((modal) => {
    modal.style.display = "none";
    // Remove a classe z-60 ao fechar
    modal.classList.remove("z-60");
  });
}

function mostrarToast(message, isError = false) {
  const toast = document.getElementById("toast");
  toast.textContent = message;
  toast.className = "show";
  toast.style.backgroundColor = isError ? "#dc3545" : "#333";

  setTimeout(() => {
    toast.className = toast.className.replace("show", "");
  }, 3000);
}

// --- Event Listeners ---

// 'DOMContentLoaded' é o evento correto para scripts externos
document.addEventListener("DOMContentLoaded", () => {
  document.body.classList.add("loading");
  carregarDados();

  document
    .getElementById("btn-adicionar-fiscal-step4")
    .addEventListener("click", () => {
      adicionarNovaLinhaFiscal("fiscais-container-step4");
    });

  document
    .getElementById("btn-exportar")
    .addEventListener("click", exportarDados);

  // Abrir Banco de Empresas
  document
    .getElementById("btn-gerenciar-empresas")
    .addEventListener("click", () => {
      renderizarBancoEmpresas();
      abrirModal("modal-gerenciar-empresas");
    });

  // Nova Empresa no Banco
  document.getElementById("btn-nova-empresa").addEventListener("click", () => {
    abrirModalEditarEmpresa();
  });

  // Adicionar Representante na Lista (Modal Banco)
  document.getElementById("btn-add-rep-lista").addEventListener("click", () => {
    const input = document.getElementById("novo-representante-input");
    const valor = input.value.trim();
    if (valor) {
      tempRepresentantes.push(valor);
      renderizarTagsRepresentantes();
      input.value = "";
      input.focus();
    }
  });

  // Salvar Empresa Banco
  document
    .getElementById("form-cadastro-empresa")
    .addEventListener("submit", salvarEmpresaBanco);

  // Event Delegation para botões da tabela de empresas
  document
    .getElementById("lista-banco-empresas")
    .addEventListener("click", (e) => {
      if (e.target.classList.contains("btn-editar-empresa")) {
        abrirModalEditarEmpresa(e.target.dataset.id);
      }
      if (e.target.classList.contains("btn-excluir-empresa")) {
        const id = e.target.dataset.id;
        abrirModalConfirmacao("Excluir esta empresa do banco?", () => {
          db.empresas = db.empresas.filter((e) => e.id !== id);
          renderizarBancoEmpresas();
          atualizarDatalistsContrato();
        });
      }
    });

  // Listeners inteligentes no Form de Contrato (Substitui os antigos 'blur')
  ["unidade", "empresa"].forEach((tipo) => {
    const inputCnpj = document.getElementById(`${tipo}-cnpj`);

    // Quando seleciona do datalist ou sai do campo
    inputCnpj.addEventListener("change", () => onCNPJChange(tipo));
    // inputCnpj.addEventListener('blur', () => onCNPJChange(tipo)); // Opcional se change não pegar tudo
  });

  // ATUALIZADO: Botão Abrir Modal Contrato (Novo)
  document
    .getElementById("btn-abrir-modal-contrato")
    .addEventListener("click", () => {
      abrirModalContratoForm("Novo", null);
    });

  // Botões de navegação do formulário de contrato
  document.getElementById("btn-form-proximo").addEventListener("click", () => {
    if (validateStep(currentFormStep)) {
      saveStepData(currentFormStep);
      showFormStep(currentFormStep + 1);
    }
  });

  document.getElementById("btn-form-anterior").addEventListener("click", () => {
    saveStepData(currentFormStep);
    showFormStep(currentFormStep - 1);
  });

  // Adicionar listeners de máscara de moeda
  document.querySelectorAll(".currency-input").forEach((input) => {
    input.addEventListener("input", formatInputAsBRL);
  });
  document.querySelectorAll(".currency-input-3dec").forEach((input) => {
    input.addEventListener("input", formatInputAsBRL_3dec);
  });

  // Listener para o dropdown de tipo de aditivo
  document
    .getElementById("aditivo-tipo")
    .addEventListener("change", atualizarCamposAditivo);

  // Listener para o atualizar campos por tipo de contrato
  document
    .getElementById("contrato-tipo")
    .addEventListener("change", atualizarCamposPorTipoContrato);

  // Listener para o botão "+ Adicionar Fiscal"
  document
    .getElementById("btn-adicionar-fiscal")
    .addEventListener("click", adicionarNovaLinhaFiscal);

  // Botão "+ Novo Pagamento" dentro do modal de Detalhes da NF
  document
    .getElementById("btn-detalhes-novo-pagamento")
    .addEventListener("click", () => {
      // Pega o ID do contrato que "possui" o pagamento (pode ser o PAI ou um Aditivo)
      // Este ID foi salvo no modal quando ele foi aberto
      const contratoDonoId = document.getElementById(
        "detalhe-contrato-id"
      ).value;
      const contratoDono = db.contratos.find((c) => c.id === contratoDonoId);

      if (!contratoDono) {
        mostrarToast(
          "Erro: Não foi possível identificar o contrato de origem.",
          true
        );
        return;
      }

      // Descobre o ID do Contrato PAI
      // Se o 'contratoDono' for um aditivo, ele terá um 'parentId'. Se não, ele é o PAI.
      const contratoPaiId = contratoDono.parentId || contratoDono.id;
      const contratoPai = db.contratos.find((c) => c.id === contratoPaiId);

      if (!contratoPai) {
        mostrarToast("Erro: Contrato principal não encontrado.", true);
        return;
      }

      // Fecha o modal de detalhes
      fecharModal("modal-detalhes-pagamento");

      // Abre o modal de pagamento, pré-preenchido com dados do PAI
      // (Exatamente como se clicasse "+ Pagamento" no card)
      document.getElementById("form-pagamento").reset();
      document.getElementById("pagamento-contrato-id").value = contratoPai.id; // O ID do PAI
      document.getElementById("pagamento-id").value = ""; // Limpa ID do pagamento (é um NOVO pagto)
      document.getElementById(
        "pagamento-contrato-objeto"
      ).textContent = `Contrato: ${contratoPai.objeto}`;

      document.getElementById("modal-pagamento-titulo").textContent =
        "Adicionar Pagamento";
      document.getElementById("modal-pagamento-submit-btn").textContent =
        "Adicionar Pagamento";
      document.getElementById("pagamento-data").value = new Date()
        .toISOString()
        .split("T")[0];

      abrirModal("modal-pagamento");
    });

  // Adicionar listeners de capitalização
  document.querySelectorAll(".capitalize-input").forEach((input) => {
    input.addEventListener("input", formatInputAsCapitalized);
  });

  // Botões de Fechar Modal
  document.querySelectorAll(".modal-close").forEach((btn) => {
    btn.addEventListener("click", () => {
      const modal = btn.closest(".modal");
      if (modal) {
        fecharModal(modal.id);
      }
    });
  });

  // Fechar modal clicando fora do conteúdo
  window.addEventListener("click", (event) => {
    if (event.target.classList.contains("modal")) {
      fecharModal(event.target.id);
    }
  });

  // Submit Forms
  document
    .getElementById("form-contrato")
    .addEventListener("submit", salvarContrato);
  document
    .getElementById("form-pagamento")
    .addEventListener("submit", salvarPagamento);
  document
    .getElementById("form-detalhe-item")
    .addEventListener("submit", salvarDetalheItem);

  // --- Lógica do Modal de Confirmação ---
  document
    .getElementById("btn-confirmacao-sim")
    .addEventListener("click", () => {
      if (typeof acaoConfirmada === "function") {
        acaoConfirmada(); // Executa a ação (ex: excluirPagamento)
      }
      acaoConfirmada = null;
      fecharModal("modal-confirmacao");
      atualizarStatsExternos();
    });

  // Limpa a ação se o usuário clicar "Cancelar" ou no "X"
  document
    .querySelectorAll("#modal-confirmacao .modal-close")
    .forEach((btn) => {
      btn.addEventListener("click", () => {
        acaoConfirmada = null;
        fecharModal("modal-confirmacao");
      });
    });

  // ===== NOVOS LISTENERS PARA AUTO-PREENCHIMENTO (INÍCIO) =====
  // ==========================================================

  // Procura por CNPJ de Unidade
  document.getElementById("unidade-cnpj").addEventListener("blur", (e) => {
    const cnpjInput = e.target.value.replace(/\D/g, ""); // Limpa formatação do input
    if (cnpjInput.length < 14) return; // Não procura se não for um CNPJ completo

    let dadosEncontrados = null;
    for (const contrato of db.contratos) {
      // Procura primeiro em Unidades
      if (
        contrato.unidade &&
        contrato.unidade.cnpj &&
        contrato.unidade.cnpj.replace(/\D/g, "") === cnpjInput
      ) {
        dadosEncontrados = contrato.unidade;
        break;
      }
      // Procura também em Empresas (caso um fornecedor vire unidade)
      if (
        contrato.empresa &&
        contrato.empresa.cnpj &&
        contrato.empresa.cnpj.replace(/\D/g, "") === cnpjInput
      ) {
        dadosEncontrados = contrato.empresa;
        break;
      }
    }

    if (dadosEncontrados) {
      document.getElementById("unidade-nome").value = dadosEncontrados.nome;
      document.getElementById("unidade-endereco").value =
        dadosEncontrados.endereco;
      document.getElementById("unidade-rep").value = dadosEncontrados.rep;
      // Re-executa a capitalização nos campos preenchidos
      formatInputAsCapitalized({
        target: document.getElementById("unidade-nome"),
      });
      formatInputAsCapitalized({
        target: document.getElementById("unidade-rep"),
      });
      mostrarToast("Unidade preenchida automaticamente.");
    }
  });

  // Procura por CNPJ de Empresa
  document.getElementById("empresa-cnpj").addEventListener("blur", (e) => {
    const cnpjInput = e.target.value.replace(/\D/g, ""); // Limpa formatação do input
    if (cnpjInput.length < 14) return;

    let dadosEncontrados = null;
    for (const contrato of db.contratos) {
      // Procura primeiro em Empresas
      if (
        contrato.empresa &&
        contrato.empresa.cnpj &&
        contrato.empresa.cnpj.replace(/\D/g, "") === cnpjInput
      ) {
        dadosEncontrados = contrato.empresa;
        break;
      }
      // Procura também em Unidades (caso uma unidade vire fornecedor)
      if (
        contrato.unidade &&
        contrato.unidade.cnpj &&
        contrato.unidade.cnpj.replace(/\D/g, "") === cnpjInput
      ) {
        dadosEncontrados = contrato.unidade;
        break;
      }
    }

    if (dadosEncontrados) {
      document.getElementById("empresa-nome").value = dadosEncontrados.nome;
      document.getElementById("empresa-endereco").value =
        dadosEncontrados.endereco;
      document.getElementById("empresa-rep").value = dadosEncontrados.rep;
      // Re-executa a capitalização nos campos preenchidos
      formatInputAsCapitalized({
        target: document.getElementById("empresa-nome"),
      });
      formatInputAsCapitalized({
        target: document.getElementById("empresa-rep"),
      });
      mostrarToast("Empresa preenchida automaticamente.");
    }
  });

  // Event Delegation para botões dinâmicos
  document.body.addEventListener("click", (e) => {
    // Botão "Ver Detalhes" no Card
    if (e.target.classList.contains("btn-visualizar-contrato")) {
      const contratoId = e.target.dataset.id;
      renderizarModalVisualizar(contratoId);
      abrirModal("modal-visualizar-contrato");
    }

    // Botão "+ Pagamento" no Card
    if (e.target.classList.contains("btn-abrir-modal-pagamento")) {
      const contratoId = e.target.dataset.id;
      const contrato = db.contratos.find((c) => c.id === contratoId);
      if (contrato) {
        document.getElementById("form-pagamento").reset();
        // O pagamento é sempre associado ao contrato PAI
        document.getElementById("pagamento-contrato-id").value = contrato.id;
        //document.getElementById('pagamento-link-sei').value = pagamento.linkPagamentoSei || '';
        document.getElementById("pagamento-id").value = "";
        document.getElementById(
          "pagamento-contrato-objeto"
        ).textContent = `Contrato: ${contrato.objeto}`;

        document.getElementById("modal-pagamento-titulo").textContent =
          "Adicionar Pagamento";
        document.getElementById("modal-pagamento-submit-btn").textContent =
          "Adicionar Pagamento";
        document.getElementById("pagamento-data").value = new Date()
          .toISOString()
          .split("T")[0];
        abrirModal("modal-pagamento");
      }
    }

    // --- LISTENERS DE ADITIVO/EDIÇÃO ---

    // Botão "Editar Contrato" (dentro do modal visualizar)
    if (e.target.classList.contains("btn-editar-contrato-form")) {
      const contratoId = e.target.dataset.id;
      abrirModalContratoForm("Editar", contratoId);
    }

    // Botão "+ Adicionar Aditivo" (dentro do modal visualizar)
    if (e.target.classList.contains("btn-adicionar-aditivo")) {
      const contratoPaiId = e.target.dataset.id;
      abrirModalContratoForm("Aditivo", contratoPaiId);
    }

    // Botão "Editar Aditivo" (dentro do modal visualizar)
    if (e.target.classList.contains("btn-editar-aditivo")) {
      const aditivoId = e.target.dataset.aditivoId;
      abrirModalContratoForm("EditarAditivo", aditivoId);
    }

    // Botão "Detalhar Aditivo" (dentro do modal visualizar)
    if (e.target.classList.contains("btn-detalhar-aditivo")) {
      const { aditivoId, paiId } = e.target.dataset;
      renderizarModalDetalharAditivo(aditivoId, paiId);
    }

    // Botão "Editar" Pagamento
    if (e.target.classList.contains("btn-editar-pagamento")) {
      const { contratoId, pagamentoId, contratoPaiId } = e.target.dataset;
      const contrato = db.contratos.find((c) => c.id === contratoId); // Contrato dono (pai ou aditivo)
      const pagamento = contrato?.pagamentos.find((p) => p.id === pagamentoId);

      if (pagamento) {
        const contratoPai = db.contratos.find((c) => c.id === contratoPaiId); // Contrato pai (para o título)

        document.getElementById("form-pagamento").reset();
        document.getElementById("pagamento-contrato-id").value = contratoId; // O ID do dono do pagto
        document.getElementById("pagamento-id").value = pagamentoId;

        document.getElementById("pagamento-contrato-objeto").textContent =
          "Contrato: " + contratoPai.objeto;
        document.getElementById("pagamento-data").value = pagamento.data || "";

        const valorFormatado = (pagamento.valorPago || 0)
          .toFixed(2)
          .replace(".", ",");
        document.getElementById("pagamento-valor").value = valorFormatado;

        // Aplica a máscara visualmente (agora com os zeros corretos)
        formatInputAsBRL({
          target: document.getElementById("pagamento-valor"),
        });

        document.getElementById("pagamento-nf").value =
          pagamento.notaFiscal || "";
        document.getElementById("pagamento-processo-sei").value =
          pagamento.processoPagamentoSei || "";

        // --- CORREÇÃO DO LINK SEI ---
        // Preenche o campo com o valor salvo
        document.getElementById("pagamento-link-sei").value =
          pagamento.linkPagamentoSei || "";

        document.getElementById("pagamento-periodo-de").value =
          pagamento.periodoDe || "";
        document.getElementById("pagamento-periodo-ate").value =
          pagamento.periodoAte || "";
        document.getElementById("pagamento-is-trd").checked =
          pagamento.isTRD || false;

        document.getElementById("modal-pagamento-titulo").textContent =
          "Editar Pagamento";
        document.getElementById("modal-pagamento-submit-btn").textContent =
          "Salvar Alterações";

        abrirModal("modal-pagamento");
      }
    }

    // Botão "Detalhar" Pagamento
    if (e.target.classList.contains("btn-detalhar-pagamento")) {
      const { contratoId, pagamentoId } = e.target.dataset;
      renderizarModalDetalhesPagamento(contratoId, pagamentoId);
      abrirModal("modal-detalhes-pagamento");
    }

    // Botão "Excluir" Pagamento
    if (e.target.classList.contains("btn-excluir-pagamento")) {
      const { contratoId, pagamentoId, contratoPaiId } = e.target.dataset;

      // Refatorado para usar o modal de confirmação
      abrirModalConfirmacao(
        "Tem certeza que deseja excluir este pagamento? Esta ação não pode ser desfeita.",
        () => {
          // Esta é a função (callback) que será executada se o usuário clicar "Excluir"
          excluirPagamento(contratoId, pagamentoId);
          renderizarModalVisualizar(contratoPaiId);
        }
      );
    }

    // Botão "Excluir" Item Detalhe
    if (e.target.classList.contains("btn-excluir-item-detalhe")) {
      // Pega os IDs antes de abrir o modal
      const contratoId = document.getElementById("detalhe-contrato-id").value;
      const pagamentoId = document.getElementById("detalhe-pagamento-id").value;
      const itemId = e.target.dataset.itemId;

      // Refatorado para usar o modal de confirmação
      abrirModalConfirmacao(
        "Tem certeza que deseja excluir este item da nota fiscal?",
        () => {
          // Esta é a função (callback)
          excluirItemDetalhe(contratoId, pagamentoId, itemId);

          // Re-renderiza o modal principal (se estiver aberto)
          if (
            document.getElementById("modal-visualizar-contrato").style
              .display === "block"
          ) {
            const contratoDono = db.contratos.find((c) => c.id === contratoId);
            const contratoPaiId = contratoDono.parentId || contratoDono.id;
            renderizarModalVisualizar(contratoPaiId);
          }
        }
      );
    }
  });
});

// ==========================================================
// INTEGRAÇÃO COM HOME (DASHBOARD)
// ==========================================================

/**
 * Calcula estatísticas rápidas para o Dashboard da Home
 * Baseado na função existente calcularResumoContrato
 */
function gerarEstatisticasContratos() {
  // Pega apenas contratos pai
  const contratosPai = db.contratos.filter((c) => !c.parentId);

  let totalValorGerido = 0;
  let contratosAtivos = 0;
  let contratosVencendo = 0; // Menos de 90 dias
  let pagamentosTotal = 0; // Quantidade de lançamentos de pagamentos

  contratosPai.forEach((contrato) => {
    // Reutiliza sua lógica robusta de cálculo (inclui aditivos)
    const resumo = calcularResumoContrato(contrato);

    // Conta pagamentos (incluindo os dos aditivos, que já estão no objeto contrato se carregado corretamente,
    // mas aqui vamos iterar no DB global para garantir)
    const aditivos = db.contratos.filter((c) => c.parentId === contrato.id);
    const familia = [contrato, ...aditivos];

    familia.forEach((c) => {
      if (c.pagamentos) pagamentosTotal += c.pagamentos.length;
    });

    // Lógica de Ativos vs Vencidos
    if (resumo.status !== "Vencido/Encerrado") {
      totalValorGerido += resumo.valorTotal;
      contratosAtivos++;

      // Regra de Urgência: Menos de 90 dias e positivo
      if (resumo.diasRestantesNum < 90 && resumo.diasRestantesNum >= 0) {
        contratosVencendo++;
      }
    }
  });

  return {
    ativos: contratosAtivos,
    vencendo: contratosVencendo,
    valorTotal: totalValorGerido,
    qtdPagamentos: pagamentosTotal,
  };
}

// 1. Listener para comunicação via PostMessage (Iframe <-> Parent)
window.addEventListener("message", (event) => {
  // Segurança básica: verifica se a mensagem pede stats
  if (event.data && event.data.type === "GET_STATS") {
    const stats = gerarEstatisticasContratos();

    // Responde para quem chamou (A Home)
    event.source.postMessage(
      {
        type: "STATS_RESPONSE",
        app: "contratos",
        data: stats,
      },
      event.origin
    );
  }
});

// 2. Função para atualizar o LocalStorage (Fallback)
function atualizarStatsExternos() {
  const stats = gerarEstatisticasContratos();
  localStorage.setItem("stats_contratos", JSON.stringify(stats));
}
