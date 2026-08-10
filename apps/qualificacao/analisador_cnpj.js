// Configuração do worker do PDF.js
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/2.16.105/pdf.worker.min.js';

const AnalisadorCnpj = {
    async extrairDadosPdf(file) {
        try {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let textoCompleto = "";

            for (let i = 1; i <= pdf.numPages; i++) {
                const pagina = await pdf.getPage(i);
                const conteudo = await pagina.getTextContent();
                const textoPagina = conteudo.items.map(item => item.str).join(" ");
                textoCompleto += textoPagina + " ";
            }
            return textoCompleto;
        } catch (erro) {
            console.error("Erro ao ler PDF:", erro);
            throw new Error("Não foi possível ler o arquivo PDF.");
        }
    },

    extrairInformacoes(texto) {
        // Verifica se é um CCMEI
        const isMEI = texto.includes("Certificado da Condição de Microempreendedor Individual");

        let cnpj = "CNPJ não encontrado";
        let razaoSocial = "Razão Social não encontrada";
        let dataAbertura = "-";
        let porte = "NÃO INFORMADO";
        let textoCnaesValidos = "";

        // Pega o CNPJ (A regra funciona para os dois documentos)
        const matchCnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
        if (matchCnpj) cnpj = matchCnpj[0];

        if (isMEI) {
            console.log("📄 [DEBUG] Documento identificado como CCMEI.");
            
            // Extrai Razão Social do CCMEI
            const matchNomeMei = texto.match(/Nome Empresarial\s+(.*?)\s+Capital Social/i);
            if (matchNomeMei) razaoSocial = matchNomeMei[1].trim();

            // Extrai Data de Abertura (Geralmente a primeira data no padrão logo após o CNPJ)
            const matchAberturaMei = texto.match(/Data de Abertura\s*.*?\s*(\d{2}\/\d{2}\/\d{4})/i);
            if (matchAberturaMei) dataAbertura = matchAberturaMei[1];

            // Porte do MEI é sempre ME
            porte = "ME";

            // Isola o bloco de CNAEs do CCMEI (pega tudo a partir de Atividade Principal)
            const matchBlocoCnaeMei = texto.match(/Atividade Principal \(CNAE\)(.*)Termo de Ciência/is);
            if (matchBlocoCnaeMei) {
                textoCnaesValidos = matchBlocoCnaeMei[1];
            } else {
                textoCnaesValidos = texto; // Fallback
            }

        } else {
            console.log("📄 [DEBUG] Documento identificado como Comprovante CNPJ padrão.");
            
            // Extrai Razão Social
            const matchNome = texto.match(/NOME EMPRESARIAL\s+(.*?)\s+(?:TÍTULO DO ESTABELECIMENTO|PORTE DA EMPRESA|CÓDIGO E DESCRIÇÃO)/);
            if (matchNome) razaoSocial = matchNome[1].trim();

            // Extrai Data de Abertura
            const matchAbertura = texto.match(/DATA DE ABERTURA\s*(\d{2}\/\d{2}\/\d{4})/i);
            if (matchAbertura) dataAbertura = matchAbertura[1];

            // Extrai Porte
            const matchPorte = texto.match(/PORTE\s*([A-ZÀ-Úa-zà-ú\s]+?)(?=\s+CÓDIGO|\s+CÓDIGO E DESCRIÇÃO|$)/i);
            if (matchPorte) {
                let porteBruto = matchPorte[1].trim();
                if (porteBruto.includes("ME")) porte = "ME";
                else if (porteBruto.includes("EPP")) porte = "EPP";
                else if (porteBruto.includes("DEMAIS")) porte = "DEMAIS";
            }

            // Isola o bloco de CNAEs do Comprovante Padrão (Scope Slicing)
            const regexBlocos = /C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DA(?:S)? ATIVIDADE(?:S)? ECON[ÔO]MICA(?:S)? (?:PRINCIPAL|SECUND[ÁA]RIAS)(.*?)(?:C[ÓO]DIGO E DESCRI[ÇC][ÃA]O DA NATUREZA JUR[ÍI]DICA)/ig;
            let matchBloco;
            while ((matchBloco = regexBlocos.exec(texto)) !== null) {
                textoCnaesValidos += " " + matchBloco[1];
            }
            
            if (!textoCnaesValidos.trim()) {
                console.warn("⚠️ [AVISO] Títulos não encontrados. Recorrendo à leitura do documento completo.");
                textoCnaesValidos = texto; 
            }
        }

        // ==========================================
        // EXTRAÇÃO DE CNAES E DESCRIÇÕES (FALLBACK)
        // ==========================================
        const regexCnae = /\d{2}[\.\s]*\d{2}[-\s]*\d[-\/\s]*\d{2}|\d{4}[-\.]?\d[-\/\s]*\d{2}/g;
        const matches = [...textoCnaesValidos.matchAll(regexCnae)];

        const cnaesNormalizados = [];
        const cnaesDetalhados = [];
        const codigosVistos = new Set();

        for (let i = 0; i < matches.length; i++) {
            const currentMatch = matches[i];
            const rawCode = currentMatch[0];
            const num = rawCode.replace(/\D/g, ''); 
            
            const formattedCode = `${num.substring(0, 4)}-${num.substring(4, 5)}/${num.substring(5, 7)}`;

            if (!codigosVistos.has(formattedCode)) {
                codigosVistos.add(formattedCode);
                cnaesNormalizados.push(formattedCode);

                const startIndex = currentMatch.index + rawCode.length;
                const endIndex = (i + 1 < matches.length) ? matches[i+1].index : startIndex + 150;
                
                let rawDesc = textoCnaesValidos.substring(startIndex, endIndex);
                
                const regexCorte = /C[ÓO]DIGO E DESCRI[ÇC][ÃA]O|Ocupa[çc][õo]es Secund[áa]rias|N[ãa]o informada/i;
                const corteMatch = rawDesc.match(regexCorte);
                
                if (corteMatch) {
                    rawDesc = rawDesc.substring(0, corteMatch.index);
                }
                
                rawDesc = rawDesc.replace(/^[-\s]+/, '').trim();
                
                cnaesDetalhados.push({
                    codigo: formattedCode,
                    descricao: rawDesc || "Descrição não informada"
                });
            }
        }

        console.log(`🔍 [DEBUG] Foram extraídos ${cnaesDetalhados.length} CNAEs detalhados do bloco isolado.`);

        return { 
            cnpj, 
            razaoSocial, 
            dataAbertura, 
            porte,
            cnaes: cnaesNormalizados, 
            cnaesDetalhados: cnaesDetalhados
        };
    },

    async carregarBaseJSON() {
        try {
            const resposta = await fetch('qualificacao_tecnica.json');
            if (!resposta.ok) throw new Error(`Erro HTTP: ${resposta.status}`);
            return await resposta.json();
        } catch (erro) {
            console.error("⚠️ [ERRO] Falha ao ler o arquivo qualificacao_tecnica.json:", erro);
            return []; 
        }
    },

    // --- NOVA FUNÇÃO: Busca o dicionário de CNAEs limpos ---
    async carregarDicionarioCNAE() {
        try {
            const resposta = await fetch('cnae.json');
            if (resposta.ok) return await resposta.json();
        } catch (erro) {
            console.warn("⚠️ [AVISO] Dicionário cnae.json não encontrado. Usando descrições sujas do PDF.");
        }
        return [];
    },

    cruzarComFamilias(cnaesEmpresa, baseFamilias) {
        if (!baseFamilias || baseFamilias.length === 0) {
            console.warn("⚠️ [ERRO] A base de famílias está vazia. O JSON não carregou!");
            return [];
        }

        const cnaesNumericosEmpresa = cnaesEmpresa.map(cnae => cnae.replace(/\D/g, ''));

        return baseFamilias.filter(familia => {
            let listaCnaes = familia.CNAEs || [];
            if (listaCnaes.length === 0) return false;
            
            return listaCnaes.some(cnaeFamilia => {
                if (!cnaeFamilia || !cnaeFamilia.codigo) return false;
                const cnaeLimpoJSON = cnaeFamilia.codigo.replace(/\D/g, '');
                return cnaesNumericosEmpresa.includes(cnaeLimpoJSON);
            });
        });
    },

    async processar(file) {
        const texto = await this.extrairDadosPdf(file);
        const info = this.extrairInformacoes(texto);
        
        // Busca as duas bases locais em paralelo
        const [baseFamilias, dicionarioCnae] = await Promise.all([
            this.carregarBaseJSON(),
            this.carregarDicionarioCNAE()
        ]);
        
        // ==========================================
        // CASCATA DE LIMPEZA EM LOTE: 1º Local -> 2º API (Batch) -> 3º PDF
        // ==========================================
        const cnaesParaBuscarNaApi = [];
        const mapaDescricoesLimpas = new Map();

        // 1º TENTATIVA: Procura no arquivo local cnae.json (Instantâneo)
        info.cnaesDetalhados.forEach(cnaePdf => {
            let achouLocal = false;
            if (dicionarioCnae.length > 0) {
                const oficial = dicionarioCnae.find(c => c.CNAE === cnaePdf.codigo);
                if (oficial) {
                    mapaDescricoesLimpas.set(cnaePdf.codigo, oficial.DESCRIÇÃO);
                    achouLocal = true;
                }
            }
            // Se não achou localmente, enfileira para buscar na API
            if (!achouLocal) {
                cnaesParaBuscarNaApi.push(cnaePdf.codigo);
            }
        });

        // 2º TENTATIVA: Bate na API do IBGE usando Lote (Pipe '|')
        if (cnaesParaBuscarNaApi.length > 0) {
            try {
                // Remove a formatação e junta tudo com pipe: ex "1234500|9876500|1111100"
                const codigosPipe = cnaesParaBuscarNaApi.map(codigo => codigo.replace(/\D/g, '')).join('|');
                
                const response = await fetch(`https://servicodados.ibge.gov.br/api/v2/cnae/subclasses/${codigosPipe}`);
                
                if (response.ok) {
                    const data = await response.json();
                    
                    // A API retorna um Objeto se for 1 CNAE, ou Array se forem vários. Normalizamos para Array.
                    const itensApi = Array.isArray(data) ? data : [data];
                    
                    itensApi.forEach(item => {
                        if (item && item.id && item.descricao) {
                            // Formata o ID que volta da API (ex: 1113502) para o padrão com máscara (ex: 1113-5/02)
                            const formatado = `${item.id.substring(0, 4)}-${item.id.substring(4, 5)}/${item.id.substring(5, 7)}`;
                            mapaDescricoesLimpas.set(formatado, item.descricao);
                            console.log(`🌐 [DEBUG] Descrição do CNAE ${formatado} recuperada em LOTE via API do IBGE.`);
                        }
                    });
                }
            } catch (err) {
                console.warn(`⚠️ [AVISO] Falha ao consultar a API do IBGE em lote. Usando fallback.`, err);
            }
        }

        // 3º TENTATIVA: Reconstrói a lista final (Usa as limpas do mapa, ou a suja do PDF se tudo falhou)
        info.cnaesDetalhados = info.cnaesDetalhados.map(cnaePdf => {
            if (mapaDescricoesLimpas.has(cnaePdf.codigo)) {
                return { codigo: cnaePdf.codigo, descricao: mapaDescricoesLimpas.get(cnaePdf.codigo) };
            }
            return cnaePdf; // Fallback extremo para a descrição do PDF
        });
        
        const familiasHabilitadas = this.cruzarComFamilias(info.cnaes, baseFamilias);
        
        return {
            cnpj: info.cnpj,
            razaoSocial: info.razaoSocial,
            dataAbertura: info.dataAbertura,
            porte: info.porte,              
            totalCnaesEncontrados: info.cnaes.length,
            cnaes: info.cnaes,
            cnaesDetalhados: info.cnaesDetalhados,
            familiasHabilitadas: familiasHabilitadas
        };
    }
};