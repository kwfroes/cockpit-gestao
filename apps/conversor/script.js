// ==========================================
// FUNÇÕES GERAIS (COMPARTILHADAS)
// ==========================================
function showToast(message) {
    const toast = document.getElementById("toast");
    toast.innerText = message;
    toast.className = "show";
    setTimeout(() => { toast.className = toast.className.replace("show", ""); }, 3000);
}

function downloadBlob(content, filename) {
    const blob = new Blob(["\uFEFF" + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

// ==========================================
// FERRAMENTA 1: FILTRO DE CSV
// ==========================================
let filteredData = [];
let headers = [];

function processarCSV() {
    const fileInput = document.getElementById('csvFile');
    const startInput = document.getElementById('filterStart');
    const endInput = document.getElementById('filterEnd');
    
    if (!fileInput.files.length) return alert("Selecione um arquivo CSV na Ferramenta 1.");
    if (!startInput.value || !endInput.value) return alert("Preencha o período completo.");

    const file = fileInput.files[0];
    const [startYearStr, startMonthStr] = startInput.value.split('-');
    const [endYearStr, endMonthStr] = endInput.value.split('-');
    
    // Converte para inteiros para comparação (Ex: 202503)
    const rangeStart = parseInt(startYearStr) * 100 + parseInt(startMonthStr);
    const rangeEnd = parseInt(endYearStr) * 100 + parseInt(endMonthStr);

    filteredData = [];
    headers = [];
    
    // UI Updates
    document.getElementById('btnProcess').disabled = true;
    document.getElementById('progressContainer').classList.remove('hidden');
    document.getElementById('statusText').classList.remove('hidden');
    document.getElementById('resultArea').classList.add('hidden');
    document.getElementById('progressBar').style.width = "0%";
    
    let rowCount = 0;
    const fileSize = file.size;

    Papa.parse(file, {
        header: true, delimiter: ";", skipEmptyLines: true, worker: true,
        step: function(results) {
            if (results.meta && results.meta.cursor) {
                const percent = Math.round((results.meta.cursor / fileSize) * 100);
                document.getElementById('progressBar').style.width = percent + "%";
                document.getElementById('statusText').innerText = `Lendo linha ${rowCount}...`;
            }
            rowCount++;
            const row = results.data;
            const dataAnalise = row['Data Análise'];
            
            if (dataAnalise && typeof dataAnalise === 'string') {
                const parts = dataAnalise.split(' ')[0].split('/');
                if (parts.length === 3) {
                    const mes = parseInt(parts[1]);
                    const ano = parseInt(parts[2]);
                    const rowValue = (ano * 100) + mes;
                    if (rowValue >= rangeStart && rowValue <= rangeEnd) filteredData.push(row);
                }
            }
            if (headers.length === 0 && results.meta.fields) headers = results.meta.fields;
        },
        complete: function() {
            document.getElementById('progressBar').style.width = "100%";
            document.getElementById('statusText').innerText = "Concluído!";
            document.getElementById('btnProcess').disabled = false;
            
            document.getElementById('totalLines').innerText = rowCount.toLocaleString();
            document.getElementById('foundLines').innerText = filteredData.length.toLocaleString();
            document.getElementById('resultArea').classList.remove('hidden');
            
            const btn = document.getElementById('btnDownload');
            btn.onclick = function() {
                if (filteredData.length === 0) return alert("Sem dados.");
                const csvOutput = Papa.unparse({ fields: headers, data: filteredData }, { delimiter: ";" });
                downloadBlob(csvOutput, `Relatorio_Filtrado_${startInput.value}_ate_${endInput.value}.csv`);
            };
            showToast(`Concluído! ${filteredData.length} registros filtrados.`);
        },
        error: function(err) {
            console.error(err);
            alert("Erro: " + err.message);
            document.getElementById('btnProcess').disabled = false;
        }
    });
}

    // ==========================================
    // FERRAMENTA 2: MERGE EXCEL + BASE ESTÁTICA (JSON)
    // ==========================================

    async function converterExcelEMerge() {
    const excelInput = document.getElementById('xlsxFile');
    // Nota: O input 'csvExtraFile' não é mais necessário no HTML, pode ocultá-lo.
    
    if (!excelInput.files.length) return alert("Falta selecionar o arquivo Excel.");
    
    const excelFile = excelInput.files[0];
    
    document.getElementById('btnConvert').disabled = true;
    document.getElementById('loaderConvert').classList.remove('hidden');
    document.getElementById('resultConvert').classList.add('hidden');
    document.getElementById('convertStatus').innerText = "Iniciando processo...";

    setTimeout(async () => {
        try {
            // --- PASSO 1: Ler o Excel Principal (Prioritário) ---
            document.getElementById('convertStatus').innerText = "Processando Excel...";
            const arrayBuffer = await excelFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const jsonDataExcel = XLSX.utils.sheet_to_json(worksheet, { 
                raw: false, dateNF: 'dd/mm/yyyy', defval: "" 
            });

            // Processa e Limpa o Excel
            const listaExcelProcessada = jsonDataExcel.map(linha => {
                let cpfBruto = linha["CPF_CNPJ"] ? String(linha["CPF_CNPJ"]) : "";
                // Limpeza segura: remove tudo que não é letra ou número
                let cpfLimpo = cpfBruto.replace(/[^a-zA-Z0-9]/g, '');

                let nomeLimpo = linha["NOME_FORNECEDOR"] ? String(linha["NOME_FORNECEDOR"]).trim() : "";
                let dataRaw = linha["DATA_CADASTRO"] ? String(linha["DATA_CADASTRO"]).trim() : "";
                let tipoRaw = linha["TIPO_DE_CADASTRO"] ? String(linha["TIPO_DE_CADASTRO"]).trim() : "";

                return { 
                    "CPF_CNPJ": cpfLimpo, 
                    "NOME_FORNECEDOR": nomeLimpo, 
                    "DATA_CADASTRO": dataRaw === "" ? "0" : dataRaw, 
                    "TIPO_DE_CADASTRO": tipoRaw === "" ? "null" : tipoRaw 
                };
            });

            // --- PASSO 2: Carregar Base Estática (JSON) ---
            document.getElementById('convertStatus').innerText = "Buscando base de dados...";
            
            // Busca o arquivo JSON que você salvou na pasta
            const response = await fetch('./arquives/banco_dados_estatico.json');
            if (!response.ok) throw new Error("Não foi possível carregar o banco_dados_estatico.json");
            const listaEstatica = await response.json();

            // --- PASSO 3: Deduplicação Inteligente ---
            document.getElementById('convertStatus').innerText = "Cruzando dados...";

            // Cria um "Conjunto" (Set) com todos os CNPJs do Excel para busca instantânea
            const cnpjsNoExcel = new Set(listaExcelProcessada.map(item => item.CPF_CNPJ));

            // Filtra a base estática: Mantém apenas quem NÃO está no Excel
            const listaEstaticaFiltrada = listaEstatica.filter(item => {
                // Se o CNPJ não existe no Excel, mantemos este item
                return !cnpjsNoExcel.has(item.CPF_CNPJ);
            });

            // --- PASSO 4: Merge (Unificação) ---
            const listaFinal = [...listaExcelProcessada, ...listaEstaticaFiltrada];

            // --- PASSO 5: Gerar CSV ---
            document.getElementById('convertStatus').innerText = "Gerando arquivo final...";
            const csvOutput = Papa.unparse(listaFinal, { 
                delimiter: ";;", 
                quotes: false 
            });

            // Stats atualizados
            document.getElementById('countExcel').innerText = listaExcelProcessada.length.toLocaleString();
            document.getElementById('countCsv').innerText = listaEstaticaFiltrada.length.toLocaleString() + " (novos)";
            document.getElementById('countTotal').innerText = listaFinal.length.toLocaleString();

            // Link de Download
            const link = document.getElementById('downloadLinkConvert');
            const fileName = excelFile.name.replace(/\.[^/.]+$/, "") + "_UNIFICADO.csv";
            const blob = new Blob(["\uFEFF" + csvOutput], { type: 'text/csv;charset=utf-8;' });
            link.href = URL.createObjectURL(blob);
            link.download = fileName;

            document.getElementById('resultConvert').classList.remove('hidden');
            showToast(`Sucesso! ${listaEstatica.length - listaEstaticaFiltrada.length} duplicados removidos.`);

        } catch (error) {
            console.error(error);
            alert("Erro no processo: " + error.message);
        } finally {
            document.getElementById('loaderConvert').classList.add('hidden');
            document.getElementById('btnConvert').disabled = false;
        }
    }, 100);
}


// ==========================================
// FERRAMENTA 3: CONVERSOR VIA SERVIDOR (PYTHON/RENDER)
// ==========================================
async function converterExcelGenerico() {
    const fileInput = document.getElementById('xlsxGenFile');
    const btn = document.getElementById('btnGenConvert');
    const loader = document.getElementById('loaderGen');
    const statusText = document.getElementById('statusGen');

    // CONFIGURE AQUI O SEU SEU SERVIDOR NO RENDER
    const API_URL = "https://api-cockpit-python.onrender.com"; // ← troque se for outro app

    if (!fileInput.files.length) return alert("Selecione um arquivo Excel.");

    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);

    btn.disabled = true;
    loader.classList.remove('hidden');
    statusText.innerText = "Enviando para o servidor (1ª vez do dia pode levar até 1 min)...";

    showToast("Iniciando upload para nuvem...");

    try {
        const response = await fetch(`${API_URL}/converter`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            const errorText = await response.text();
            throw new Error(errorText || "Erro no servidor Render (pode ser timeout do plano free)");
        }

        statusText.innerText = "Processamento concluído! Baixando...";
        const blob = await response.blob();
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = downloadUrl;
        a.download = file.name.replace(/\.[^/.]+$/, "") + "_CONVERTIDO.csv";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        window.URL.revokeObjectURL(downloadUrl);

        showToast("Conversão concluída com sucesso!");
    } catch (error) {
        console.error(error);
        alert("Erro na conversão: " + error.message);
    } finally {
        btn.disabled = false;
        loader.classList.add('hidden');
        statusText.innerText = "";
    }
}