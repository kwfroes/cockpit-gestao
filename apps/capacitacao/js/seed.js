// Módulo para inserir dados no banco caso esteja vazio
export async function popularTrilhasEModulos(logger) {
    const trilhas = [
        { titulo: "Fundamentos Legais e Institucionais", nivel: "Inicial", descricao: "Compreensão sobre os fundamentos jurídicos, administrativos e institucionais do Cadastro de Fornecedores." },
        { titulo: "Análise Documental e Qualificação", nivel: "Intermediário", descricao: "Desenvolver a capacidade de examinar documentos, identificar inconsistências e verificar o atendimento às exigências cadastrais." },
        { titulo: "Utilização dos Sistemas e Procedimentos Operacionais", nivel: "Intermediário", descricao: "Desenvolver o domínio operacional dos sistemas utilizados no processo de cadastramento e análise de fornecedores." },
        { titulo: "Atendimento e Suporte ao Fornecedor", nivel: "Avançado", descricao: "Desenvolver a capacidade de orientar fornecedores com clareza, objetividade e segurança." },
        { titulo: "Análise Avançada e Tomada de Decisão", nivel: "Especialista", descricao: "Preparar o analista para lidar com situações complexas que exigem interpretação, julgamento técnico e aplicação integrada dos conhecimentos adquiridos." }
    ];

    const modulosMatriz = [
        // Trilha 0 (Fundamentos)
        ["Administração Pública e Contratações", "Legislação do Cadastro de Fornecedores", "Responsabilidade do Analista", "Proteção de Dados e Segurança da Informação"],
        // Trilha 1 (Análise Documental)
        ["Identificação do Fornecedor", "Habilitação Jurídica", "Regularidade Fiscal e Trabalhista", "Qualificação Técnica", "Qualificação Econômico-Financeira", "Análise Crítica de Documentos"],
        // Trilha 2 (Sistemas)
        ["Estrutura e Funcionamento do CAF Digital", "Gestão das Solicitações", "Análise de Famílias", "Certificados Cadastrais", "Integrações e Validações", "Procedimentos e Tratamento de Exceções"],
        // Trilha 3 (Atendimento)
        ["Comunicação Institucional", "Orientação ao Fornecedor", "Atendimento de Casos Complexos", "Gestão de Demandas", "Qualidade do Atendimento"],
        // Trilha 4 (Avançado)
        ["Casos Complexos de Análise", "Interpretação Normativa Aplicada", "Análise Integrada", "Simulações de Análise", "Avaliação de Competência"]
    ];

    logger("Iniciando verificação de trilhas...");
    
    for (let i = 0; i < trilhas.length; i++) {
        // Verifica se a trilha existe
        let { data: trackExistente, error: errGet } = await window.supabase
            .from('learning_tracks')
            .select('id')
            .eq('titulo', trilhas[i].titulo)
            .maybeSingle();

        let trackId;

        if (!trackExistente) {
            logger(`Inserindo trilha: ${trilhas[i].titulo}`);
            const { data: newTrack, error: errInsert } = await window.supabase
                .from('learning_tracks')
                .insert([trilhas[i]])
                .select('id')
                .single();
            if(errInsert) { logger(`Erro trilha: ${errInsert.message}`); continue; }
            trackId = newTrack.id;
        } else {
            trackId = trackExistente.id;
        }

        // Inserir módulos
        const modsParaInserir = modulosMatriz[i];
        for (let j = 0; j < modsParaInserir.length; j++) {
            const tituloMod = modsParaInserir[j];
            const { data: modExistente } = await window.supabase
                .from('learning_modules')
                .select('id')
                .eq('track_id', trackId)
                .eq('titulo', tituloMod)
                .maybeSingle();
            
            if(!modExistente) {
                logger(`-- Inserindo módulo: ${tituloMod}`);
                await window.supabase
                    .from('learning_modules')
                    .insert([{ track_id: trackId, titulo: tituloMod, ordem: j + 1 }]);
            }
        }
    }
    logger("Finalizado inserção de Trilhas e Módulos.");
}

export async function popularLicoesEQuestoes(logger) {
    logger("Buscando o Módulo: Legislação do Cadastro de Fornecedores...");
    
    const { data: modulo } = await window.supabase
        .from('learning_modules')
        .select('id')
        .eq('titulo', 'Legislação do Cadastro de Fornecedores')
        .maybeSingle();
        
    if(!modulo) {
        logger("ERRO: Módulo 'Legislação do Cadastro de Fornecedores' não encontrado. Execute o passo 1 primeiro.");
        return;
    }

    const moduleId = modulo.id;
    
    const licoes = [
        {
            titulo: "Regulamentação do Sistema de Registro Cadastral",
            tipo: "teoria",
            conteudo_texto: "O Sistema de Registro Cadastral (SRC) reúne os registros dos fornecedores aptos a contratar com o Estado. O Decreto Estadual nº 23.059/2024 regulamenta este registro, definindo as regras de inscrição, atualização, suspensão e cancelamento. O SRC garante a habilitação jurídica, técnica, fiscal e econômico-financeira de forma unificada.",
            ordem: 1,
            xp_recompensa: 10
        },
        {
            titulo: "Teste de Compreensão Normativa",
            tipo: "exercicio",
            conteudo_texto: null,
            ordem: 2,
            xp_recompensa: 20
        }
    ];

    for(let i=0; i < licoes.length; i++) {
        let { data: licaoExistente } = await window.supabase
            .from('lessons')
            .select('id')
            .eq('module_id', moduleId)
            .eq('titulo', licoes[i].titulo)
            .maybeSingle();

        let licaoId;
        if(!licaoExistente) {
            logger(`Inserindo lição: ${licoes[i].titulo}`);
            const { data: novaLicao, error: errLicao } = await window.supabase
                .from('lessons')
                .insert([{ ...licoes[i], module_id: moduleId }])
                .select('id')
                .single();
            if(errLicao) { logger(`Erro na lição: ${errLicao.message}`); continue; }
            licaoId = novaLicao.id;
        } else {
            licaoId = licaoExistente.id;
            logger(`Lição ${licoes[i].titulo} já existe.`);
        }

        // Se for a lição de exercício, insere a questão
        if(licoes[i].tipo === "exercicio" && !licaoExistente) {
            logger(`-- Inserindo questão para a lição...`);
            const { data: questao } = await window.supabase
                .from('questions')
                .insert([{
                    lesson_id: licaoId,
                    enunciado: "Qual decreto estadual regulamenta atualmente o Sistema de Registro Cadastral (SRC) e disciplina as regras de inscrição e cancelamento no Estado da Bahia?",
                    explicacao_feedback: "O Decreto Estadual nº 23.059/2024 é a norma central e atualizada que estrutura o SRC, consolidando as regras após a vigência da nova Lei de Licitações (14.133/21)."
                }])
                .select('id')
                .single();

            if(questao) {
                logger(`---- Inserindo alternativas...`);
                await window.supabase.from('question_options').insert([
                    { question_id: questao.id, texto_alternativa: "Instrução nº 017/2022", is_correta: false, ordem: 1 },
                    { question_id: questao.id, texto_alternativa: "Decreto Estadual nº 23.059/2024", is_correta: true, ordem: 2 },
                    { question_id: questao.id, texto_alternativa: "Decreto Estadual nº 21.451/2022", is_correta: false, ordem: 3 },
                    { question_id: questao.id, texto_alternativa: "Lei Estadual nº 14.634/2023", is_correta: false, ordem: 4 }
                ]);
            }
        }
    }
    
    logger("Inserção de questões de exemplo concluída com sucesso.");
}
