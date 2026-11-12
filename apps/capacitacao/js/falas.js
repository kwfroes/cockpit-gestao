// =====================================================================
// Falas do Sr. Cockpit – Academia CGCF
//
// Cada fala tem: um texto para o balão, um texto falado (roteiro do áudio) e,
// opcionalmente, um arquivo MP3. Tudo fica na tabela academia_falas (editável no
// painel admin > Falas). Estes textos padrão valem enquanto a tabela não existir,
// ou para qualquer fala que o admin ainda não tenha alterado.
//
// {{campos}} são trocados na hora: veja "vars" em cada fala.
// =====================================================================
export const BUCKET = 'academia-audio';
export const LIMITE_AUDIO_BYTES = 2 * 1024 * 1024;     // mesmo limite do bucket (07_falas.sql)
export const VARIAVEIS_EXEMPLO = { nota: 85, n: 3, minimo: 70, xp: 20 };

export const FALAS_PADRAO = {
    "licao_teoria": {
        "ordem": 1, "momento": "Teoria – ao abrir a tela", "vars": [],
        "variacoes": [
            { texto: "Novo conhecimento desbloqueado! Leia com atenção.", falado: null },
            { texto: "Hora de aprender algo novo. Preste muita atenção aos detalhes.", falado: null },
            { texto: "Mais um conceito importante para o seu radar. Vamos lá!", falado: null }
        ]
    },
    "ex_pratica": {
        "ordem": 2, "momento": "Exercício – ao abrir a questão", "vars": [],
        "variacoes": [
            { texto: "Chegou a hora de praticar! Qual é a resposta correta?", falado: null },
            { texto: "Vamos testar o que você aprendeu. O que você acha?", falado: null },
            { texto: "Mão na massa! Selecione a alternativa certa.", falado: null }
        ]
    },
    "ex_refazer": {
        "ordem": 3, "momento": "Exercício – questão refeita", "vars": [],
        "variacoes": [
            { texto: "Você errou esta antes. Leia com calma e tente de novo.", falado: null },
            { texto: "Essa passou raspando da última vez. Tente novamente!", falado: null },
            { texto: "Atenção redobrada agora. Vamos corrigir aquele errinho.", falado: null }
        ]
    },
    "resp_certa": {
        "ordem": 4, "momento": "Exercício – resposta certa", "vars": [],
        "variacoes": [
            { texto: "Muito bem!", falado: null },
            { texto: "Exatamente! Resposta corretíssima.", falado: null },
            { texto: "Perfeito! Você acertou na mosca.", falado: null }
        ]
    },
    "resp_errada": {
        "ordem": 5, "momento": "Exercício – resposta errada", "vars": [],
        "variacoes": [
            { texto: "Atenção, vamos revisar esse conceito.", falado: null },
            { texto: "Ops, não é bem essa. Vale a pena dar mais uma lida.", falado: null },
            { texto: "Resposta incorreta. Fique de olho na teoria!", falado: null }
        ]
    },
    "sim_abertura": {
        "ordem": 6, "momento": "Simulação – ao abrir", "vars": [],
        "variacoes": [
            { texto: "Você está no CAF Digital. Abra os anexos, analise e decida.", falado: null },
            { texto: "Bem-vindo à simulação. Verifique os documentos com atenção antes de agir.", falado: null },
            { texto: "O processo está na sua mesa. Faça a análise e tome a melhor decisão.", falado: null }
        ]
    },
    "sim_ok": {
        "ordem": 7, "momento": "Simulação – tudo certo", "vars": [],
        "variacoes": [
            { texto: "Análise impecável!", falado: null },
            { texto: "Tudo certo por aqui, excelente trabalho!", falado: null },
            { texto: "Aprovado sem ressalvas. Muito bom!", falado: null }
        ]
    },
    "sim_revisar": {
        "ordem": 8, "momento": "Simulação – com erros", "vars": [],
        "variacoes": [
            { texto: "Revise os pontos marcados em vermelho.", falado: null },
            { texto: "Encontramos algumas inconsistências. Veja os alertas e corrija.", falado: null },
            { texto: "Sua análise deixou passar alguns detalhes. Confira o feedback.", falado: null }
        ]
    },
    "rev_atingiu": {
        "ordem": 9, "momento": "Revisão – nota mínima atingida", "vars": ["nota", "n"],
        "variacoes": [
            { texto: "Você atingiu {{nota}}%! Agora refaça as {{n}} que errou para concluir.", falado: "Você atingiu a nota mínima! Agora refaça as questões que errou para concluir." },
            { texto: "Mandou bem, {{nota}}% de acertos! Só falta corrigir {{n}} para fechar.", falado: "Mandou bem, nota mínima alcançada! Só falta corrigir os erros para fechar." },
            { texto: "Nota {{nota}}% alcançada. Refaça as {{n}} questões pendentes.", falado: "Nota alcançada com sucesso. Refaça as questões pendentes." }
        ]
    },
    "rev_abaixo": {
        "ordem": 10, "momento": "Revisão – abaixo do mínimo", "vars": ["nota", "minimo"],
        "variacoes": [
            { texto: "Você acertou {{nota}}%. O mínimo é {{minimo}}%. Vamos revisar antes de refazer.", falado: "Você ainda não atingiu o mínimo de acertos. Vamos revisar antes de refazer." },
            { texto: "Sua nota foi {{nota}}%, mas a meta é {{minimo}}%. Hora de dar mais uma lida na teoria.", falado: "Ainda não alcançamos a nota mínima. Hora de dar mais uma lida na teoria." },
            { texto: "Com {{nota}}%, ficamos abaixo da meta de {{minimo}}%. Vamos estudar os pontos fracos!", falado: "Ficamos abaixo da meta. Vamos estudar os pontos fracos e tentar de novo!" }
        ]
    },
    "conclusao_xp": {
        "ordem": 11, "momento": "Conclusão – primeira vez", "vars": ["xp"],
        "variacoes": [
            { texto: "Concluído! +{{xp}} XP.", falado: "Concluído! Parabéns!" },
            { texto: "Missão cumprida! Você ganhou {{xp}} XP.", falado: "Missão cumprida! Muito bem!" },
            { texto: "Excelente! Mais {{xp}} XP para a sua conta.", falado: "Excelente! Mais experiência para a sua conta." }
        ]
    },
    "conclusao_repeticao": {
        "ordem": 12, "momento": "Conclusão – já concluída antes", "vars": [],
        "variacoes": [
            { texto: "Concluído! XP e bônus são concedidos só na primeira conclusão.", falado: null },
            { texto: "Revisão finalizada! O XP já foi creditado da primeira vez.", falado: null },
            { texto: "Tudo certo! Treino extra concluído com sucesso.", falado: null }
        ]
    },
    "conclusao_conferencia": {
        "ordem": 13, "momento": "Conclusão – conferência do admin", "vars": [],
        "variacoes": [
            { texto: "Conferência concluída.", falado: null },
            { texto: "Tudo verificado e validado.", falado: null },
            { texto: "Revisão do administrador finalizada com sucesso.", falado: null }
        ]
    }
};

let CACHE = null;          // { chave: { texto, texto_falado, audio_path, variacoes } }  (null = ainda não carregou)
let carregando = null;

const reVar = /\{\{(\w+)\}\}/g;
export const aplicarVars = (t, vars = {}) => String(t ?? '').replace(reVar, (_, k) => (k in vars ? String(vars[k]) : ''));
export const variaveisDe = t => [...new Set([...String(t ?? '').matchAll(reVar)].map(m => m[1]))];

export function urlAudio(path) {
    if (!path) return '';
    try { return window.supabase.storage.from(BUCKET).getPublicUrl(path).data.publicUrl || ''; }
    catch { return ''; }
}

// Nunca lança erro: se a tabela não existir ou a rede falhar, o app usa os textos padrão.
export function carregarFalas() {
    if (CACHE) return Promise.resolve(CACHE);
    if (!carregando) {
        carregando = (async () => {
            try {
                const { data, error } = await window.supabase.from('academia_falas').select('chave, texto, texto_falado, audio_path, variacoes');
                if (error) throw error;
                CACHE = Object.fromEntries((data || []).map(r => [r.chave, r]));
            } catch (e) {
                console.warn('Falas do Sr. Cockpit: usando os textos padrão.', e?.message || e);
                CACHE = {};
            } finally { carregando = null; }
            return CACHE;
        })();
    }
    return carregando;
}
export function invalidarFalas() { CACHE = null; }

const ultimaVariacao = {};
const cacheSorteio = {};

// Devolve { texto (balão), falado (o que a voz diz), audio (URL do mp3 ou '') }
export function montarFala(chave, vars = {}) {
    const def = FALAS_PADRAO[chave];
    if (!def) return { texto: '', falado: '', audio: '' };

    const reg = CACHE ? CACHE[chave] : null;
    const lista = (Array.isArray(reg?.variacoes) && reg.variacoes.length > 0)
        ? reg.variacoes
        : def.variacoes;

    // Lógica de sorteio da variação (com trava de 100ms para evitar re-sorteio em chamadas simultâneas)
    const total = lista.length;
    let idx = 0;
    const agora = Date.now();

    if (cacheSorteio[chave] && (agora - cacheSorteio[chave].tempo < 100)) {
        idx = cacheSorteio[chave].idx;
    } else {
        if (total > 1) {
            do {
                idx = Math.floor(Math.random() * total);
            } while (idx === ultimaVariacao[chave]);
        }
        ultimaVariacao[chave] = idx;
        cacheSorteio[chave] = { tempo: agora, idx };
    }

    const variacao = lista[idx] || def.variacoes[idx] || def.variacoes[0];
    const padraoVar = def.variacoes[idx] || def.variacoes[0];

    const textoBase = (variacao.texto || '').trim() || padraoVar.texto || '';
    const faladoBase = (variacao.falado || variacao.texto_falado || '').trim() || padraoVar.falado || textoBase;

    // Áudio: se a variação (ou o registro legado) tem upload no Supabase, usa a URL do bucket.
    // Senão, puxa do Git local (ex: ./audio/resp_certa_1.mp3)
    const audioPath = variacao.audio_path || (idx === 0 ? reg?.audio_path : null);
    const audioBase = audioPath
        ? urlAudio(audioPath)
        : `./audio/${chave}_${idx + 1}.mp3`;

    return {
        texto: aplicarVars(textoBase, vars),
        falado: aplicarVars(faladoBase, vars),
        audio: audioBase
    };
}