// =====================================================================
// Importador de lotes de conteúdo da Academia CGCF
// Uso: importar no admin.js e ligar a um botão (ver LEIA-ME.md)
// Lê data/questoes_lote_v3.json e data/simulacoes_exemplo.json
// Não duplica: lições com o mesmo título no mesmo módulo são ignoradas.
// =====================================================================
export async function popularLoteJSON(logger, url = 'data/questoes_lote_v3.json') {
    logger(`Lendo ${url}...`);
    let lote;
    try {
        const resp = await fetch(url, { cache: 'no-store' });
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        lote = await resp.json();
    } catch (e) { logger(`ERRO ao ler o arquivo: ${e.message}`); return; }

    let inseridas = 0, ignoradas = 0, erros = 0;
    for (const bloco of lote) {
        // 1. Localiza trilha e módulo pelo nome exato
        const { data: trilha } = await window.supabase
            .from('learning_tracks').select('id').eq('titulo', bloco.trilha).maybeSingle();
        if (!trilha) { logger(`ERRO: trilha não encontrada: ${bloco.trilha}`); erros++; continue; }

        const { data: modulo } = await window.supabase
            .from('learning_modules').select('id')
            .eq('track_id', trilha.id).eq('titulo', bloco.modulo).maybeSingle();
        if (!modulo) { logger(`ERRO: módulo não encontrado: ${bloco.modulo}`); erros++; continue; }

        // 2. Lições já existentes (para não duplicar e continuar a numeração)
        const { data: existentes } = await window.supabase
            .from('lessons').select('titulo, ordem').eq('module_id', modulo.id);
        const titulos = new Set((existentes || []).map(l => l.titulo));
        let ordem = Math.max(0, ...(existentes || []).map(l => l.ordem || 0));

        logger(`Módulo: ${bloco.modulo} (${bloco.licoes.length} lições no lote)`);
        for (const l of bloco.licoes) {
            if (titulos.has(l.titulo)) { ignoradas++; continue; }
            // Valida ANTES de inserir: exercício precisa de enunciado e de 2+ alternativas com exatamente 1 correta
            if (l.tipo === 'exercicio') {
                const ops = l.questao?.opcoes;
                if (!l.questao?.enunciado || !Array.isArray(ops) || ops.length < 2 || ops.filter(o => o.correta).length !== 1) {
                    logger(`-- ERRO lote "${l.titulo}": exige enunciado, 2+ alternativas e exatamente 1 correta (ignorada)`); erros++; continue;
                }
            }
            ordem++;
            const registro = {
                module_id: modulo.id, titulo: l.titulo, tipo: l.tipo,
                conteudo_texto: l.conteudo_texto ?? null, ordem,
                xp_recompensa: l.xp_recompensa ?? 10
            };
            if (l.tipo === 'simulacao') registro.cenario = l.cenario;

            const { data: nova, error: errL } = await window.supabase
                .from('lessons').insert([registro]).select('id').single();
            if (errL) { logger(`-- ERRO lição "${l.titulo}": ${errL.message}`); erros++; continue; }

            if (l.tipo === 'exercicio') {
                const q = l.questao;
                const { data: questao, error: errQ } = await window.supabase
                    .from('questions')
                    .insert([{ lesson_id: nova.id, enunciado: q.enunciado, explicacao_feedback: q.explicacao_feedback }])
                    .select('id').single();
                if (errQ) {
                    // Sem questão o engine quebra: remove a lição órfã
                    await window.supabase.from('lessons').delete().eq('id', nova.id);
                    logger(`-- ERRO questão "${l.titulo}": ${errQ.message} (lição removida)`); erros++; continue;
                }
                const { error: errO } = await window.supabase.from('question_options').insert(
                    q.opcoes.map((o, i) => ({ question_id: questao.id, texto_alternativa: o.texto, is_correta: o.correta, ordem: i + 1 }))
                );
                if (errO) {
                    // Desfaz tudo: exercício sem alternativas travaria o aluno
                    await window.supabase.from('questions').delete().eq('id', questao.id);
                    await window.supabase.from('lessons').delete().eq('id', nova.id);
                    logger(`-- ERRO alternativas "${l.titulo}": ${errO.message} (lição removida)`); erros++; continue;
                }
            }
            inseridas++;
        }
    }
    logger(`Concluído: ${inseridas} inseridas, ${ignoradas} já existiam, ${erros} erros.`);
}
