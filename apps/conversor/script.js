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
// FERRAMENTA 2: MERGE EXCEL + CSV
// ==========================================

// Função auxiliar para ler o CSV Extra
function lerCSVExtra(file) {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true, delimiter: ";", skipEmptyLines: true,
            complete: function(results) { resolve(results.data); },
            error: function(err) { reject(err); }
        });
    });
}

async function converterExcelEMerge() {
    const excelInput = document.getElementById('xlsxFile');
    const csvExtraInput = document.getElementById('csvExtraFile');
    
    if (!excelInput.files.length) return alert("Falta selecionar o arquivo Excel.");
    if (!csvExtraInput.files.length) return alert("Falta selecionar o arquivo CSV Complementar.");
    
    const excelFile = excelInput.files[0];
    const csvFile = csvExtraInput.files[0];
    
    document.getElementById('btnConvert').disabled = true;
    document.getElementById('loaderConvert').classList.remove('hidden');
    document.getElementById('resultConvert').classList.add('hidden');
    document.getElementById('convertStatus').innerText = "Iniciando processo...";

    setTimeout(async () => {
        try {
            // --- PASSO 1: Ler o CSV Complementar ---
            document.getElementById('convertStatus').innerText = "Lendo CSV Complementar...";
            const dadosCSVBrutos = await lerCSVExtra(csvFile);
            
            const listaCSVProcessada = dadosCSVBrutos.map(linha => {
                let cnpjBruto = linha["CNPJ"] ? String(linha["CNPJ"]) : "";
                
                // REGEX PERMISSIVA: Mantém Letras (estrangeiros) e Números. Remove apenas símbolos (. - /)
                let cnpjLimpo = cnpjBruto.replace(/[^a-zA-Z0-9]/g, ''); 

                let razaoLimpa = linha["RAZÃO SOCIAL"] ? String(linha["RAZÃO SOCIAL"]).trim() : "";

                return { 
                    "CPF_CNPJ": cnpjLimpo, 
                    "NOME_FORNECEDOR": razaoLimpa, 
                    "DATA_CADASTRO": "0",    // Regra Fixa
                    "TIPO_DE_CADASTRO": "null" // Regra Fixa
                };
            });

            // --- PASSO 2: Ler o Excel Principal ---
            document.getElementById('convertStatus').innerText = "Lendo Excel Principal...";
            const arrayBuffer = await excelFile.arrayBuffer();
            const workbook = XLSX.read(arrayBuffer, { type: 'array', cellDates: true });
            const firstSheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[firstSheetName];

            const jsonDataExcel = XLSX.utils.sheet_to_json(worksheet, { 
                raw: false, dateNF: 'dd/mm/yyyy', defval: "" 
            });

            const listaExcelProcessada = jsonDataExcel.map(linha => {
                let cpfBruto = linha["CPF_CNPJ"] ? String(linha["CPF_CNPJ"]) : "";
                
                // REGEX PERMISSIVA: Mantém Letras e Números
                let cpfLimpo = cpfBruto.replace(/[^a-zA-Z0-9]/g, '');

                let nomeLimpo = linha["NOME_FORNECEDOR"] ? String(linha["NOME_FORNECEDOR"]).trim() : "";
                
                // Regra DATA_CADASTRO: Se vazio -> "0"
                let dataRaw = linha["DATA_CADASTRO"] ? String(linha["DATA_CADASTRO"]).trim() : "";
                let dataFinal = dataRaw === "" ? "0" : dataRaw;

                // Regra TIPO_DE_CADASTRO: Se vazio -> "null"
                let tipoRaw = linha["TIPO_DE_CADASTRO"] ? String(linha["TIPO_DE_CADASTRO"]).trim() : "";
                let tipoFinal = tipoRaw === "" ? "null" : tipoRaw;

                return { 
                    "CPF_CNPJ": cpfLimpo, 
                    "NOME_FORNECEDOR": nomeLimpo, 
                    "DATA_CADASTRO": dataFinal, 
                    "TIPO_DE_CADASTRO": tipoFinal 
                };
            });

            // --- PASSO 3: Merge (Unificação) ---
            document.getElementById('convertStatus').innerText = "Unificando listas...";
            
            // Une os dois arrays
            const listaFinal = [...listaExcelProcessada, ...listaCSVProcessada];

            // --- PASSO 4: Gerar CSV ---
            const csvOutput = Papa.unparse(listaFinal, { 
                delimiter: ";;", 
                quotes: false 
            });

            // Stats
            document.getElementById('countExcel').innerText = listaExcelProcessada.length.toLocaleString();
            document.getElementById('countCsv').innerText = listaCSVProcessada.length.toLocaleString();
            document.getElementById('countTotal').innerText = listaFinal.length.toLocaleString();

            // Link de Download
            const link = document.getElementById('downloadLinkConvert');
            const fileName = excelFile.name.replace(/\.[^/.]+$/, "") + "_UNIFICADO.csv";
            const blob = new Blob(["\uFEFF" + csvOutput], { type: 'text/csv;charset=utf-8;' });
            link.href = URL.createObjectURL(blob);
            link.download = fileName;

            document.getElementById('resultConvert').classList.remove('hidden');
            showToast("Sucesso! Merge concluído.");

        } catch (error) {
            console.error(error);
            alert("Erro no processo: " + error.message);
        } finally {
            document.getElementById('loaderConvert').classList.add('hidden');
            document.getElementById('btnConvert').disabled = false;
        }
    }, 100);
}