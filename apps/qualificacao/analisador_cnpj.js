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
            const matchCnpj = texto.match(/\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/);
            const cnpj = matchCnpj ? matchCnpj[0] : "CNPJ não encontrado";

            const matchNome = texto.match(/NOME EMPRESARIAL\s+(.*?)\s+(?:TÍTULO DO ESTABELECIMENTO|PORTE DA EMPRESA|CÓDIGO E DESCRIÇÃO)/);
            const razaoSocial = matchNome ? matchNome[1].trim() : "Razão Social não encontrada";

            // ==========================================
            // NOVO: ISOLAMENTO DO ESCOPO (SCOPE SLICING)
            // ==========================================
            
            // Esta Regex procura o texto que começa com Atividade Principal OU Secundária 
            // e termina EXATAMENTE antes de "CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA"
            const regexBlocos = /CÓDIGO E DESCRIÇÃO DA(?:S)? ATIVIDADE(?:S)? ECONÔMICA(?:S)? (?:PRINCIPAL|SECUNDÁRIAS)(.*?)(?:CÓDIGO E DESCRIÇÃO DA NATUREZA JURÍDICA)/g;

            let textoCnaesValidos = "";
            let matchBloco;
            
            // Extrai os blocos de todas as páginas e junta tudo em uma variável só
            while ((matchBloco = regexBlocos.exec(texto)) !== null) {
                textoCnaesValidos += " " + matchBloco[1];
            }

            // TRAVA DE SEGURANÇA: Se a Receita Federal mudar o layout e a busca falhar, 
            // o sistema não quebra e volta a pesquisar no documento inteiro.
            if (!textoCnaesValidos.trim()) {
                console.warn("⚠️ [AVISO] Títulos não encontrados. Recorrendo à leitura do documento completo.");
                textoCnaesValidos = texto; 
            }

            // ==========================================
            
            // Agora a caça aos CNAEs roda APENAS dentro do texto isolado
            const regexCnae = /\d{2}[\.\s]*\d{2}[-\s]*\d[-\/\s]*\d{2}/g;
            const matches = [...textoCnaesValidos.matchAll(regexCnae)];

            const cnaesNormalizados = [];
            const cnaesDetalhados = [];
            const codigosVistos = new Set();

            for (let i = 0; i < matches.length; i++) {
                const currentMatch = matches[i];
                const rawCode = currentMatch[0];
                const num = rawCode.replace(/\D/g, ''); 
                const formattedCode = `${num.substring(0, 2)}.${num.substring(2, 4)}-${num.substring(4, 5)}/${num.substring(5, 7)}`;

                if (!codigosVistos.has(formattedCode)) {
                    codigosVistos.add(formattedCode);
                    cnaesNormalizados.push(formattedCode);

                    // A extração da descrição fica muito mais precisa no texto recortado
                    const startIndex = currentMatch.index + rawCode.length;
                    const endIndex = (i + 1 < matches.length) ? matches[i+1].index : startIndex + 150;
                    
                let rawDesc = textoCnaesValidos.substring(startIndex, endIndex);
                
                // Exclui o cabeçalho de atividade secundária (ou principal, se houver quebra de página)
                rawDesc = rawDesc.replace(/CÓDIGO E DESCRIÇÃO DA(?:S)? ATIVIDADE(?:S)? ECONÔMICA(?:S)?\s+(?:PRINCIPAL|SECUNDÁRIAS)/gi, '');
                
                // --- Limpeza do "Não informada" ---
                rawDesc = rawDesc.replace(/Não informada/gi, '');
                
                // Remove hífen do início e espaços em branco que sobraram
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
                cnaes: cnaesNormalizados, 
                cnaesDetalhados: cnaesDetalhados
            };
        },

    // --- NOVA FUNÇÃO: Busca o JSON diretamente da pasta ---
    async carregarBaseJSON() {
        try {
            const resposta = await fetch('qualificacao_tecnica.json');
            
            if (!resposta.ok) {
                throw new Error(`Erro HTTP: ${resposta.status}`);
            }
            
            const dados = await resposta.json();
            console.log("📂 [DEBUG] Base JSON carregada com sucesso pelo Analisador!");
            return dados;
            
        } catch (erro) {
            console.error("⚠️ [ERRO] Falha ao ler o arquivo qualificacao_tecnica.json:", erro);
            return []; 
        }
    },

    // O parâmetro mudou: agora ele recebe a base diretamente da nova função
    cruzarComFamilias(cnaesEmpresa, baseFamilias) {
        if (!baseFamilias || baseFamilias.length === 0) {
            console.warn("⚠️ [ERRO] A base de famílias está vazia. O JSON não carregou!");
            return [];
        }

        const cnaesNumericosEmpresa = cnaesEmpresa.map(cnae => cnae.replace(/\D/g, ''));

        const familias = baseFamilias.filter(familia => {
            // O JSON antigo usava CNAEs, o novo formato usa um array. Adicionado suporte seguro:
            let listaCnaes = familia.CNAEs || [];
            if (listaCnaes.length === 0) return false;
            
            return listaCnaes.some(cnaeFamilia => {
                if (!cnaeFamilia || !cnaeFamilia.codigo) return false;
                const cnaeLimpoJSON = cnaeFamilia.codigo.replace(/\D/g, '');
                return cnaesNumericosEmpresa.includes(cnaeLimpoJSON);
            });
        });
        
        console.log(`✅ [DEBUG] ${familias.length} famílias deram match com o JSON local!`);
        return familias;
    },

    async processar(file) {
        const texto = await this.extrairDadosPdf(file);
        const info = this.extrairInformacoes(texto);
        
        // O Analisador vai lá e busca o JSON por conta própria
        const baseFamilias = await this.carregarBaseJSON();
        
        // Cruza os dados
        const familiasHabilitadas = this.cruzarComFamilias(info.cnaes, baseFamilias);
        
        return {
            cnpj: info.cnpj,
            razaoSocial: info.razaoSocial,
            totalCnaesEncontrados: info.cnaes.length,
            cnaes: info.cnaes,
            cnaesDetalhados: info.cnaesDetalhados,
            familiasHabilitadas: familiasHabilitadas
        };
    }
};