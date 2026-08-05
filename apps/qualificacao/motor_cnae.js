// ==========================================
// MOTOR DE SUGESTÃO E AUDITORIA DE CNAEs
// ==========================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = 'https://whnzeysvqbtuecxmthht.supabase.co';
const supabaseKey = 'sb_publishable_Gw4cFK56R9kms2ogg50UqA_ZhHi79qw';
const supabase = createClient(supabaseUrl, supabaseKey);

const CONFIG = {
    SCORE_MIN_REGRA1: 4,      // mantido em 4 — não perde cobertura, só passa a trazer mais de 1 candidato
    SCORE_MIN_REGRA2: 5,      // auditoria continua com piso mais alto
    MIN_TERMOS_REGRA2: 3,
    DELTA_MIN_REGRA2: 4,
    JACCARD_MIN_REGRA3: 0.45,
    USUARIO_MOTOR: 'Motor Automático de CNAE',
};

const NOISE_PAT = /INATIVA|TESTE|LEIL[ÃA]O|DESATIVAD/i;

const STOPWORDS = new Set([
    'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'na', 'no', 'nas', 'nos',
    'para', 'por', 'com', 'sem', 'outros', 'outras', 'outro', 'outra',
    'nao', 'especificados', 'especificado', 'especializado', 'especializados',
    'anteriormente', 'geral', 'gerais', 'uso', 'usos', 'diversos', 'diversas',
    'exceto', 'inclusive', 'atividades', 'atividade', 'produtos', 'produto',
    'comercio', 'servicos', 'servico', 'fabricacao', 'varejista', 'varejo',
    'atacadista', 'atacado', 'a', 'o', 'os', 'as', 'ou', 'que', 'se',
    'seu', 'sua', 'seus', 'suas',
]);

export function normalize(texto) {
    return (texto || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase();
}

export function hasWord(haystackNorm, fraseNorm) {
    if (!fraseNorm) return false;
    const escaped = fraseNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`).test(haystackNorm);
}

export function getTermosExpandidos(descricaoFamilia, relacionadosDict) {
    const norm = normalize(descricaoFamilia);
    const palavras = norm.match(/[a-z]+/g) || [];
    const termos = new Set(palavras.filter(w => !STOPWORDS.has(w) && w.length > 2));

    for (const item of relacionadosDict) {
        const principal = normalize(item['Principal']);
        if (hasWord(norm, principal)) {
            const relacionadas = normalize(item['Relacionadas']).split(', ').filter(Boolean);
            relacionadas.forEach(r => termos.add(r));
        }
    }
    return termos;
}

export function scoreDescricao(termos, descricaoCnae) {
    const cnorm = normalize(descricaoCnae);
    const parteAfirmativa = cnorm.split(/\bexceto\b/)[0];
    let score = 0;
    const termosQueBateram = new Set();

    for (const termo of termos) {
        let bateu = false;
        if (hasWord(parteAfirmativa, termo)) { score += 2; bateu = true; }
        if (parteAfirmativa.startsWith(termo)) { score += 3; bateu = true; }
        if (bateu) termosQueBateram.add(termo);
    }
    return { score, termosQueBateram };
}

export function normDigits(codigo) {
    return (codigo || '').replace(/\D/g, '');
}

// Seções da CNAE que nunca são compatíveis com família de material (Tipo M):
// F=Construção, H=Transporte, I=Alojamento/alimentação, J=Informação/comunicação,
// K=Financeiras, L=Imobiliárias, M=Profissionais/científicas/técnicas,
// N=Administrativas, O=Administração pública, P=Educação, Q=Saúde, R=Artes/cultura,
// S=Outras atividades de serviços, T=Serviços domésticos, U=Organismos internacionais.
// Ficam de fora (permitidas): A=Agricultura, B=Extrativa, C=Indústria (fabricação),
// D=Energia, E=Água/esgoto, G=Comércio — todas produzem ou vendem algo físico.
const SECOES_SERVICO_BLOQUEADAS = new Set(['F', 'H', 'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P', 'Q', 'R', 'S', 'T', 'U']);

// Mantido como rede de segurança: se um CNAE não tiver SECAO mapeada (ex.: código
// novo ainda não catalogado), cai de volta pro regex de texto antigo.
const PREFIXO_SERVICO_BLOQUEADO = /^(servicos?\s+de|manutencao|reparacao|instalacao|montagem|assistencia\s+tecnica)\b/;

export function candidatoBloqueadoParaMaterial(cnae, tipoFamilia) {
    if (tipoFamilia !== 'M') return false;
    // Seção bloqueia o grosso (transporte, construção, serviços profissionais...).
    // Regex continua rodando à parte, sempre — o IBGE classifica "Manutenção e
    // reparação de máquina industrial" dentro da Seção C (junto com fabricação),
    // então só a Seção deixaria passar de novo o bug original (família 66.65).
    if (cnae.SECAO && SECOES_SERVICO_BLOQUEADAS.has(cnae.SECAO)) return true;
    return PREFIXO_SERVICO_BLOQUEADO.test(normalize(cnae.DESCRIÇÃO));
}

export function rodarRegra1(familias, cnaeList, relacionadosDict) {
    const sugestoes = [];
    for (const familia of familias) {
        if ((familia.CNAEs || []).length > 0) continue;
        if (NOISE_PAT.test(familia.Descrição)) continue;

        const termos = getTermosExpandidos(familia.Descrição, relacionadosDict);
        if (termos.size === 0) continue;

        for (const cnae of cnaeList) {
            if (candidatoBloqueadoParaMaterial(cnae, familia.Tipo)) continue;
            const { score } = scoreDescricao(termos, cnae.DESCRIÇÃO);
            if (score < CONFIG.SCORE_MIN_REGRA1) continue;

            sugestoes.push({
                familia_codigo: familia.Família,
                cnae_codigo: cnae.CNAE,
                cnae_descricao: cnae.DESCRIÇÃO,
                regra: 'sem_cnae',
                score: score,
                motivo: `Família sem nenhum CNAE cadastrado. Candidato pelo motor de sugestão (score ${score}).`,
            });
        }
    }
    return sugestoes;
}

export function rodarRegra2(familias, cnaeList, relacionadosDict) {
    const sugestoes = [];
    for (const familia of familias) {
        const cnaesVinculados = familia.CNAEs || [];
        if (cnaesVinculados.length === 0) continue;
        if (NOISE_PAT.test(familia.Descrição)) continue;

        const termos = getTermosExpandidos(familia.Descrição, relacionadosDict);
        if (termos.size === 0) continue;

        const digitosVinculados = new Set(cnaesVinculados.map(c => normDigits(c.codigo)));

        let melhorVinculadoScore = 0;
        for (const c of cnaesVinculados) {
            const { score } = scoreDescricao(termos, c.descricao || '');
            if (score > melhorVinculadoScore) melhorVinculadoScore = score;
        }
        if (melhorVinculadoScore < 1) continue;

        const vinculadoMaisFraco = cnaesVinculados
            .map(c => ({ ...c, s: scoreDescricao(termos, c.descricao || '').score }))
            .sort((a, b) => a.s - b.s)[0];

        for (const cnae of cnaeList) {
            if (digitosVinculados.has(normDigits(cnae.CNAE))) continue;
            if (candidatoBloqueadoParaMaterial(cnae, familia.Tipo)) continue;
            const { score, termosQueBateram } = scoreDescricao(termos, cnae.DESCRIÇÃO);
            if (termosQueBateram.size < CONFIG.MIN_TERMOS_REGRA2) continue;
            if (score < CONFIG.SCORE_MIN_REGRA2) continue;
            if ((score - melhorVinculadoScore) < CONFIG.DELTA_MIN_REGRA2) continue;

            sugestoes.push({
                familia_codigo: familia.Família,
                cnae_codigo: cnae.CNAE,
                cnae_descricao: cnae.DESCRIÇÃO,
                regra: 'auditoria',
                score: score,
                motivo: `Possível opção mais precisa (score ${score}) que o vínculo atual mais fraco: `
                    + `${vinculadoMaisFraco.codigo} - ${vinculadoMaisFraco.descricao} (score ${vinculadoMaisFraco.s}). `
                    + `Revisar se o vínculo antigo deve ser mantido, substituído ou removido manualmente.`,
            });
        }
    }
    return sugestoes;
}

const PREFIXOS_TAG = [
    [/^fabricacao de\s+/, 'fabricacao'],
    [/^producao de\s+/, 'fabricacao'],
    [/^comercio atacadista especializado (de|em)\s+/, 'atacado'],
    [/^comercio atacadista de\s+/, 'atacado'],
    [/^comercio por atacado de\s+/, 'atacado'],
    [/^comercio varejista especializado (de|em)\s+/, 'varejo'],
    [/^comercio varejista de\s+/, 'varejo'],
    [/^comercio a varejo de\s+/, 'varejo'],
];

const STOPWORDS_NUCLEO = new Set([
    'de', 'e', 'em', 'para', 'nao', 'com', 'outros', 'outras', 'exceto',
    'anteriormente', 'especificados', 'uso', 'seus', 'suas', 'o', 'a',
    'os', 'as', 'do', 'da', 'na', 'no', 'por', 'ou',
]);

function tagECore(descricaoCnae) {
    const d = normalize(descricaoCnae);
    for (const [pat, tag] of PREFIXOS_TAG) {
        const m = d.match(pat);
        if (m) return { tag, core: d.slice(m[0].length) };
    }
    return { tag: null, core: null };
}

function tokenSet(texto) {
    const palavras = (texto.match(/[a-z]+/g) || []);
    return new Set(palavras.filter(t => !STOPWORDS_NUCLEO.has(t) && t.length > 2));
}

function jaccard(a, b) {
    if (a.size === 0 || b.size === 0) return 0;
    let inter = 0;
    for (const x of a) if (b.has(x)) inter++;
    const uniao = a.size + b.size - inter;
    return uniao === 0 ? 0 : inter / uniao;
}

export function rodarRegra3(familias, cnaeList) {
    const porTag = { fabricacao: [], atacado: [], varejo: [] };
    for (const cnae of cnaeList) {
        const { tag, core } = tagECore(cnae.DESCRIÇÃO);
        if (!tag) continue;
        porTag[tag].push({ cnae, tokens: tokenSet(core) });
    }

    function melhorMatch(tokensAlvo, tag) {
        let melhor = null;
        let melhorSim = 0;
        for (const cand of porTag[tag]) {
            const sim = jaccard(tokensAlvo, cand.tokens);
            if (sim > melhorSim) { melhorSim = sim; melhor = cand; }
        }
        return melhorSim >= CONFIG.JACCARD_MIN_REGRA3 ? { cand: melhor, sim: melhorSim } : null;
    }

    const cnaeByDigits = new Map(cnaeList.map(c => [normDigits(c.CNAE), c]));
    const sugestoes = [];

    for (const familia of familias) {
        if (familia.Tipo !== 'M') continue;
        if (NOISE_PAT.test(familia.Descrição)) continue;

        const cnaesVinculados = familia.CNAEs || [];
        if (cnaesVinculados.length === 0) continue;

        const digitosVinculados = new Set(cnaesVinculados.map(c => normDigits(c.codigo)));
        const tagsPresentes = new Set();
        for (const c of cnaesVinculados) {
            const master = cnaeByDigits.get(normDigits(c.codigo));
            if (!master) continue;
            const { tag } = tagECore(master.DESCRIÇÃO);
            if (tag) tagsPresentes.add(tag);
        }
        if (tagsPresentes.size === 0) continue;

        const todasTags = new Set(['fabricacao', 'atacado', 'varejo']);
        const tagsFaltando = [...todasTags].filter(t => !tagsPresentes.has(t));
        if (tagsFaltando.length === 0) continue;

        let melhorSugestaoPorTag = {};
        for (const c of cnaesVinculados) {
            const master = cnaeByDigits.get(normDigits(c.codigo));
            if (!master) continue;
            const { tag, core } = tagECore(master.DESCRIÇÃO);
            if (!tag || !core) continue;
            const tokens = tokenSet(core);

            for (const faltando of tagsFaltando) {
                const match = melhorMatch(tokens, faltando);
                if (!match) continue;
                if (digitosVinculados.has(normDigits(match.cand.cnae.CNAE))) continue;
                const atual = melhorSugestaoPorTag[faltando];
                if (!atual || match.sim > atual.sim) {
                    melhorSugestaoPorTag[faltando] = { ...match, origemDescricao: master.DESCRIÇÃO };
                }
            }
        }

        for (const [tagFaltando, info] of Object.entries(melhorSugestaoPorTag)) {
            sugestoes.push({
                familia_codigo: familia.Família,
                cnae_codigo: info.cand.cnae.CNAE,
                cnae_descricao: info.cand.cnae.DESCRIÇÃO,
                regra: 'trio_incompleto',
                score: Math.round(info.sim * 100) / 100,
                motivo: `Trio fabricação/atacado/varejo incompleto — falta a variante "${tagFaltando}" `
                    + `(similaridade ${(info.sim * 100).toFixed(0)}% com o CNAE já vinculado: "${info.origemDescricao}").`,
            });
        }
    }
    return sugestoes;
}

// ==========================================
// REGRA 4 — sugestão de remoção (CNAE já vinculado que hoje cairia no bloqueio material×serviço)
// ==========================================
// Só sugere — nunca remove sozinha. Casos como aeronaves/manutenção industrial
// (que passam no bloqueio hoje por decisão consciente de não automatizar exceção)
// aparecem aqui pra revisão manual caso a caso, como já era o plano.
export function rodarRegra4(familias, cnaeList) {
    const cnaeByDigits = new Map(cnaeList.map(c => [normDigits(c.CNAE), c]));
    const sugestoes = [];

    for (const familia of familias) {
        if (familia.Tipo !== 'M') continue;
        if (NOISE_PAT.test(familia.Descrição)) continue;

        for (const c of familia.CNAEs || []) {
            const master = cnaeByDigits.get(normDigits(c.codigo));
            const cnaeParaChecar = master || { DESCRIÇÃO: c.descricao, SECAO: null };
            if (!candidatoBloqueadoParaMaterial(cnaeParaChecar, familia.Tipo)) continue;

            sugestoes.push({
                familia_codigo: familia.Família,
                cnae_codigo: c.codigo,
                cnae_descricao: c.descricao,
                acao: 'remover',
                regra: 'remocao_bloqueio',
                score: null,
                motivo: `CNAE já vinculado cai no bloqueio material×serviço vigente`
                    + (master && master.SECAO ? ` (Seção ${master.SECAO})` : ' (padrão de texto de serviço/manutenção)')
                    + `. Revisar caso a caso — pode ser exceção legítima (ex.: manutenção de aeronaves).`,
            });
        }
    }
    return sugestoes;
}


async function fetchCnaeDictionary() {
    const resp = await fetch('cnae.json');
    if (!resp.ok) throw new Error('Falha ao carregar cnae.json');
    return resp.json();
}

async function fetchRelacionadosDictionary() {
    const resp = await fetch('relacionados_dictionary.json');
    if (!resp.ok) throw new Error('Falha ao carregar relacionados_dictionary.json');
    return resp.json();
}

async function fetchAllFamilias() {
    let allData = [];
    let from = 0;
    const step = 1000;
    while (true) {
        const { data, error } = await supabase
            .from('qualificacao_tecnica')
            .select('familia, descricao, tipo, cnaes')
            .range(from, from + step - 1);
        if (error) throw error;
        allData.push(...data);
        if (data.length < step) break;
        from += step;
    }
    return allData.map(item => ({
        Família: item.familia,
        Descrição: item.descricao,
        Tipo: item.tipo,
        CNAEs: item.cnaes || [],
    }));
}

async function fetchParesExistentes() {
    const { data, error } = await supabase
        .from('sugestoes_cnae_familia')
        .select('familia_codigo, cnae_codigo, acao');
    if (error) throw error;
    return new Set(data.map(r => `${r.familia_codigo}::${normDigits(r.cnae_codigo)}::${r.acao || 'adicionar'}`));
}

async function inserirSugestoes(sugestoes, paresExistentes) {
    const vistos = new Set(paresExistentes);
    const novas = [];
    for (const s of sugestoes) {
        const acao = s.acao || 'adicionar';
        const chave = `${s.familia_codigo}::${normDigits(s.cnae_codigo)}::${acao}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
    novas.push({
            familia_codigo: s.familia_codigo,
            cnae_codigo: s.cnae_codigo,
            cnae_descricao: s.cnae_descricao,
            usuarios_sugeriram: CONFIG.USUARIO_MOTOR,
            status: 'pendente',
            origem: 'motor_automatico',
            acao: acao,
            regra: s.regra,
            score: s.score,
            motivo: s.motivo,
            gemini_score: s.gemini_score || null,
            gemini_justificativa: s.gemini_justificativa || null,
        });
    }

    const CHUNK = 100;
    let inseridas = 0;
    for (let i = 0; i < novas.length; i += CHUNK) {
        const chunk = novas.slice(i, i + CHUNK);
        const { error } = await supabase.from('sugestoes_cnae_familia').insert(chunk);
        if (error) throw error;
        inseridas += chunk.length;
    }
    return { inseridas, ignoradasPorDuplicidade: sugestoes.length - novas.length };
}

/** Analisa um LOTE de sugestões numa única chamada à Edge Function —
 *  1 requisição ao Gemini, N pares dentro dela, em vez de 1 requisição
 *  por par (é isso que evita estourar o RPM do plano gratuito).
 *  itens: [{id, familia, cnae}, ...] — grava o resultado de cada um
 *  no banco (updates individuais, mas isso não é o gargalo — o
 *  gargalo era a chamada ao Gemini, que agora é só 1). */
window.analisarLoteSugestoes = async function (itens) {
    const { data, error } = await supabase.functions.invoke('analisar-afinidade-cnae', {
        body: { pares: itens }
    });
    if (error) throw error;
    if (!Array.isArray(data)) {
        throw new Error('Resposta inesperada da IA (não veio como lista).');
    }

    for (const r of data) {
        if (r.score === null || r.score === undefined) continue;
        const { error: updErr } = await supabase
            .from('sugestoes_cnae_familia')
            .update({ gemini_score: r.score, gemini_justificativa: r.justificativa })
            .eq('id', r.id);
        if (updErr) console.error('Falha ao gravar resultado da IA para', r.id, updErr);
    }
    return data;
};

// ==========================================
// MODAL DE PROGRESSO (etapas visíveis em vez do botão só "travado")
// ==========================================
const ETAPAS_MOTOR = [
    { id: 'dados', label: 'Carregando catálogo de CNAEs e famílias' },
    { id: 'regras', label: 'Rodando regras 1, 2, 3 e 4' },
    { id: 'gravando', label: 'Gravando sugestões na fila' },
];

const ICONE_PENDENTE = `<svg class="w-5 h-5 text-slate-300 dark:text-slate-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" stroke-width="2"></circle></svg>`;
const ICONE_ATIVO = `<svg class="w-5 h-5 text-blue-500 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
const ICONE_CONCLUIDO = `<svg class="w-5 h-5 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;

function criarModalProgressoMotor() {
    const antigo = document.getElementById('modal-progresso-motor');
    if (antigo) antigo.remove();

    const modal = document.createElement('div');
    modal.id = 'modal-progresso-motor';
    modal.className = 'fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-[200] flex items-center justify-center p-4 animate-fade-in';
    modal.innerHTML = `
        <div id="caixa-modal-progresso-motor" class="bg-white dark:bg-slate-800 rounded-xl shadow-2xl w-full max-w-md p-6 border border-slate-200 dark:border-slate-700 animate-scale-up">
            <div class="flex items-center gap-3 mb-5">
                <div class="w-10 h-10 bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-full flex items-center justify-center shrink-0">
                    <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>
                </div>
                <div>
                    <h3 class="font-bold text-slate-800 dark:text-slate-100 text-sm uppercase tracking-wide">Motor de CNAE</h3>
                    <p class="text-xs text-slate-500 dark:text-slate-400">Não feche esta aba até concluir</p>
                </div>
            </div>
            <div id="lista-etapas-motor" class="space-y-3">
                ${ETAPAS_MOTOR.map(e => `
                    <div id="etapa-motor-${e.id}" class="flex items-center gap-3 text-sm">
                        <span class="etapa-icone shrink-0">${ICONE_PENDENTE}</span>
                        <span class="etapa-label text-slate-400 dark:text-slate-500">${e.label}</span>
                    </div>
                `).join('')}
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function atualizarEtapaMotor(id, status, textoExtra = null) {
    const linha = document.getElementById(`etapa-motor-${id}`);
    if (!linha) return;
    const icone = linha.querySelector('.etapa-icone');
    const label = linha.querySelector('.etapa-label');
    if (status === 'ativo') {
        icone.innerHTML = ICONE_ATIVO;
        label.className = 'etapa-label text-slate-800 dark:text-slate-100 font-semibold';
    } else if (status === 'concluido') {
        icone.innerHTML = ICONE_CONCLUIDO;
        label.className = 'etapa-label text-slate-500 dark:text-slate-400';
    }
    if (textoExtra) label.textContent = textoExtra;
}

window.fecharModalProgressoMotor = function () {
    const modal = document.getElementById('modal-progresso-motor');
    if (modal) modal.remove();
};

const ICONE_CHECK_GRANDE = `<svg class="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5 13l4 4L19 7"></path></svg>`;

function linhaResumo(icone, label, valor) {
    return `
        <div class="flex items-center justify-between bg-slate-50 dark:bg-slate-900/50 rounded-lg px-3 py-2 border border-slate-200 dark:border-slate-700">
            <span class="text-sm text-slate-700 dark:text-slate-300">${icone} ${label}</span>
            <span class="font-bold text-slate-800 dark:text-slate-100">${valor}</span>
        </div>`;
}

/** Troca o conteúdo do modal de progresso por uma tela de resumo —
 *  fica aberta até a pessoa clicar em "Fechar" ou até o timeout automático. */
function exibirResumoMotor({ r1, r2, r3, r4, inseridas, ignoradas }) {
    const caixa = document.getElementById('caixa-modal-progresso-motor');
    if (!caixa) return;

    caixa.innerHTML = `
        <div class="flex flex-col items-center text-center gap-4">
            <div class="w-14 h-14 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center">
                ${ICONE_CHECK_GRANDE}
            </div>
            <div>
                <h3 class="font-bold text-slate-800 dark:text-slate-100 text-base">Motor concluído</h3>
                <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">Use o botão IA em cada sugestão para analisar sob demanda.</p>
            </div>
            <div class="w-full flex flex-col gap-2 text-left">
                ${linhaResumo('🤖', 'Regra 1 — sem CNAE', r1)}
                ${linhaResumo('🔍', 'Regra 2 — auditoria', r2)}
                ${linhaResumo('🧩', 'Regra 3 — trio incompleto', r3)}
                ${linhaResumo('🗑️', 'Regra 4 — sugestão de remoção', r4)}
            </div>
            <div class="w-full pt-3 border-t border-slate-200 dark:border-slate-700 text-sm">
                <span class="font-bold text-emerald-600 dark:text-emerald-400">${inseridas}</span>
                <span class="text-slate-600 dark:text-slate-300"> nova${inseridas === 1 ? '' : 's'} na fila</span>
                <span class="text-slate-400 mx-1">·</span>
                <span class="text-slate-500 dark:text-slate-400">${ignoradas} já existia${ignoradas === 1 ? '' : 'm'}</span>
            </div>
            <button type="button" onclick="fecharModalProgressoMotor()"
                class="mt-1 px-5 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 text-xs font-bold uppercase tracking-wider rounded-lg transition-colors">
                Fechar
            </button>
        </div>
    `;

    // Fecha sozinho depois de um tempo, caso a pessoa não feche na mão
    setTimeout(() => {
        if (document.getElementById('modal-progresso-motor')) fecharModalProgressoMotor();
    }, 8000);
}

window.rodarMotorCNAE = async function () {
    const btn = document.getElementById('btn-motor-cnae');
    if (btn) btn.disabled = true;

    criarModalProgressoMotor();

    try {
        atualizarEtapaMotor('dados', 'ativo');
        const [cnaeList, relacionadosDict, familias, paresExistentes] = await Promise.all([
            fetchCnaeDictionary(),
            fetchRelacionadosDictionary(),
            fetchAllFamilias(),
            fetchParesExistentes(),
        ]);
        atualizarEtapaMotor('dados', 'concluido');

        atualizarEtapaMotor('regras', 'ativo');
        const r1 = rodarRegra1(familias, cnaeList, relacionadosDict);
        const r2 = rodarRegra2(familias, cnaeList, relacionadosDict);
        const r3 = rodarRegra3(familias, cnaeList);
        const r4 = rodarRegra4(familias, cnaeList);
        const todas = [...r1, ...r2, ...r3, ...r4];
        atualizarEtapaMotor('regras', 'concluido', `Regras concluídas — ${todas.length} sugestões candidatas`);

        atualizarEtapaMotor('gravando', 'ativo');
        const resultado = await inserirSugestoes(todas, paresExistentes);
        atualizarEtapaMotor('gravando', 'concluido');

        // Pequena pausa pra pessoa ver as etapas verdes antes de virar o resumo
        await new Promise(r => setTimeout(r, 700));

        const resumo = `Motor concluído — Regra 1 (sem CNAE): ${r1.length} · `
            + `Regra 2 (auditoria): ${r2.length} · Regra 3 (trio incompleto): ${r3.length} · `
            + `Regra 4 (remoção): ${r4.length}. `
            + `${resultado.inseridas} novas sugestões na fila `
            + `(${resultado.ignoradasPorDuplicidade} já existiam e foram ignoradas).`;
        console.log(resumo); // mantido só pro console — a pessoa já vê o resumo no modal

        exibirResumoMotor({
            r1: r1.length,
            r2: r2.length,
            r3: r3.length,
            r4: r4.length,
            inseridas: resultado.inseridas,
            ignoradas: resultado.ignoradasPorDuplicidade,
        });
        if (typeof window.carregarContadorSugestoes === 'function') window.carregarContadorSugestoes();
    } catch (err) {
        console.error('Erro no motor de CNAE:', err);
        fecharModalProgressoMotor();
        if (typeof window.showError === 'function') {
            window.showError('Erro no Motor de CNAE', err.message || String(err));
        }
    } finally {
        if (btn) btn.disabled = false;
    }
};