// ============================================================================
// Módulo: Reanálise Jurídica (trilha paralela à de CNAE)
//
// Reaproveita: window.supabaseClient, showToast/showError (globais já
// carregados por script.js/auth.js), o padrão de badge de score
// verde/âmbar/vermelho e o botão IA com spinner já usados na aprovação de
// CNAE (ver script.js: analisarUmaSugestao / abrirModalSugestoesAdmin).
//
// Visibilidade do botão/modais: classe "admin-only" (igual ao botão
// "Exportar JSON"), aplicada hoje via applyFamilyRoleRestrictions() em
// script.js — nenhuma mudança necessária aqui, só usar a mesma classe.
// ============================================================================

const supabase = window.supabaseClient;

const SVG_SPINNER_IA = `<svg class="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle><path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path></svg>`;
const SVG_RAIO_IA = `<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 10V3L4 14h7v7l9-11h-7z"></path></svg>`;

const NOMES_CLUSTER = {
  C1: 'C1 — Engenharia/Arquitetura/Técnicos Industriais',
  C2: 'C2 — Saúde Regulada',
  C3: 'C3 — Vigilância Sanitária Isolada',
  C4: 'C4 — Baixo Risco / Dispensa',
  C5: 'C5 — Conselhos Econômico/Jurídicos',
  C6: 'C6 — Agências Reguladoras Federais',
  C7: 'C7 — Órgãos Estaduais/Setoriais',
  C8: 'C8 — Não Classificado',
};

let filaCarregada = [];
let filaFiltradaAtual = [];
let familiaAbertaAtual = null;
let clustersDicionario = null;
let loteIaEmAndamento = false;
let loteDocumentosEmAndamento = false;
// Map(nome_do_documento -> linha de base_legal_documento) para a família
// atualmente aberta no modal de detalhe — ver carregarBaseLegalDocumentosDaFamilia.
let dicionarioBaseLegalDocumentosAtual = new Map();
// Map(nome_normalizado_do_documento -> status) com TODO o dicionário
// base_legal_documento — carregado uma vez por abertura da fila, usado só
// pra marcar, em cada família da fila, se já dá pra ir rápido (todos os
// documentos exigidos/elegíveis já validados em algum momento, nem que
// tenha sido por outra família que também usa o mesmo documento).
let dicionarioStatusDocumentosGlobal = new Map();
// Reduzido de 20 para 8: cada família carrega base legal + justificativa +
// fontes + alertas (texto mais longo que a aprovação de CNAE); em 20 por
// lote a resposta do Gemini vinha sendo cortada por limite de tokens.
const TAMANHO_LOTE_IA_REANALISE = 8;

// Lote separado para o dicionário de base legal por DOCUMENTO (mais leve que
// a análise por família — cada item é só nome + citação), então comporta
// mais por chamada.
const TAMANHO_LOTE_DOCUMENTOS = 25;

function normalizarNomeDocumento(nome) {
  return (nome || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

// Blindagem contra a IA sugerir algo que não faz sentido: "adicionar" um
// documento que já está na lista atual da família, ou "remover" um
// documento que nem está lá. O prompt já pede pra IA conferir isso antes de
// responder (gerar-fundamentacao-legal, regra 7), mas instrução em prompt
// não é garantia — então filtra de novo aqui, antes de gravar a sugestão,
// comparando por nome normalizado (sem acento/maiúscula) pra não deixar
// passar por uma diferença boba de grafia.
function filtrarSugestoesDocumentosValidas(sugestoes, exigidosAtuais, elegiveisAtuais) {
  const exigidosNorm = new Set((exigidosAtuais || []).map(normalizarNomeDocumento));
  const elegiveisNorm = new Set((elegiveisAtuais || []).map(normalizarNomeDocumento));

  return (sugestoes || []).filter((s) => {
    if (!s || !s.nome) return false;
    const nomeNorm = normalizarNomeDocumento(s.nome);
    const jaEstaEmAlgumaLista = exigidosNorm.has(nomeNorm) || elegiveisNorm.has(nomeNorm);

    if (s.acao === 'remover') {
      // só faz sentido remover algo que de fato está em alguma das listas
      return jaEstaEmAlgumaLista;
    }
    // "adicionar" só faz sentido se o documento AINDA NÃO estiver em
    // nenhuma das duas listas — é exatamente o erro visto na prática: a IA
    // sugeriu "adicionar" documentos que já estavam em exigidos (e até já
    // validados no dicionário).
    return !jaEstaEmAlgumaLista;
  });
}

// Quando a IA roda de novo (uma família ou em lote), o resultado SUBSTITUI
// gemini_sugestao_documentos inteiro — o que apagaria sugestões manuais do
// analista (e também o "aplicado: true" de sugestões já aplicadas antes).
// Esta função preserva tudo que é manual ou já aplicado, e só acrescenta as
// sugestões novas da IA que não dupliquem (mesma ação + mesmo documento) o
// que já está preservado.
function mesclarSugestoesDocumentos(novasSugestoesIA, sugestoesExistentes) {
  const preservadas = (sugestoesExistentes || []).filter((s) => s.origem === 'manual' || s.aplicado === true);
  const chaves = new Set(preservadas.map((s) => `${s.acao}|${normalizarNomeDocumento(s.nome)}`));
  const novasFiltradas = (novasSugestoesIA || [])
    .filter((s) => !chaves.has(`${s.acao}|${normalizarNomeDocumento(s.nome)}`))
    .map((s) => ({ ...s, origem: s.origem || 'ia' }));
  return [...preservadas, ...novasFiltradas];
}

function corBadgeScore(score) {
  if (score === null || score === undefined) return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  if (score >= 8) return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800';
  if (score >= 4) return 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400 border-amber-200 dark:border-amber-800';
  return 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-400 border-red-200 dark:border-red-800';
}

async function carregarDicionarioClusters() {
  if (clustersDicionario) return clustersDicionario;
  try {
    const resp = await fetch('./archives/clusters_juridicos.json');
    clustersDicionario = await resp.json();
  } catch (e) {
    console.warn('Não foi possível carregar archives/clusters_juridicos.json', e);
    clustersDicionario = {};
  }
  return clustersDicionario;
}

// ----------------------------------------------------------------------------
// Dicionário compartilhado base_legal_documento: analisa com IA só os
// documentos que AINDA NÃO têm nenhuma entrada (nem sugerida, nem validada)
// — reaproveita o que já foi analisado em qualquer família anterior, em vez
// de reanalisar o mesmo conselho/documento toda vez que aparece numa família
// diferente. Retorna { novos, jaExistentes }.
// ----------------------------------------------------------------------------
async function sugerirBaseLegalDocumentos(nomesDocumentos) {
  const nomesUnicos = [...new Set(nomesDocumentos.filter(Boolean))];
  if (nomesUnicos.length === 0) return { novos: 0, jaExistentes: 0 };

  const { data: existentes, error: errExistentes } = await supabase
    .from('base_legal_documento')
    .select('documento')
    .in('documento', nomesUnicos);
  if (errExistentes) throw errExistentes;

  const jaExistentesSet = new Set((existentes || []).map((r) => r.documento));
  const faltantes = nomesUnicos.filter((n) => !jaExistentesSet.has(n));
  if (faltantes.length === 0) return { novos: 0, jaExistentes: nomesUnicos.length };

  let novos = 0;

  for (let i = 0; i < faltantes.length; i += TAMANHO_LOTE_DOCUMENTOS) {
    const lote = faltantes.slice(i, i + TAMANHO_LOTE_DOCUMENTOS);
    const { data: resultados, error } = await supabase.functions.invoke('gerar-base-legal-documento', {
      body: { documentos: lote },
    });
    if (error) throw error;
    if (!Array.isArray(resultados)) throw new Error('Resposta inesperada da IA (documentos).');

    const linhas = resultados.map((r) => ({
      documento: r.documento,
      base_legal: r.base_legal ?? null,
      status: 'sugerido_ia',
      gemini_score: r.score ?? null,
      gemini_justificativa: r.justificativa ?? null,
      gemini_fontes: r.fontes ?? [],
      gemini_alertas: r.alertas ?? [],
      gemini_analisado_em: new Date().toISOString(),
    }));

    const { error: errUpsert } = await supabase
      .from('base_legal_documento')
      .upsert(linhas, { onConflict: 'documento' });
    if (errUpsert) throw errUpsert;

    // Mantém o dicionário global em memória em dia (mesmo cache usado pro
    // selo "✅ Docs validados" da fila) — essas entradas entram como
    // 'sugerido_ia', então sozinhas não acendem o selo de nenhuma família,
    // mas já deixam o cache correto pra quando forem validadas de fato.
    for (const l of linhas) dicionarioStatusDocumentosGlobal.set(normalizarNomeDocumento(l.documento), l.status);

    novos += linhas.length;
    // (o log em sistema_logs já é feito dentro da Edge Function, com a
    // service role key — não repete aqui pelo client pra não depender de
    // RLS de insert em sistema_logs, que esse client não deveria ter.)
  }

  return { novos, jaExistentes: nomesUnicos.length - faltantes.length };
}

async function registrarHistorico(familiaCodigo, tipoEvento, payload) {
  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
  const { error } = await supabase.from('qualificacao_reanalise_historico').insert([{
    familia_codigo: familiaCodigo,
    tipo_evento: tipoEvento,
    payload,
    usuario,
  }]);
  if (error) console.error('Falha ao gravar histórico de reanálise:', error);
}

// ----------------------------------------------------------------------------
// Fila de trabalho
// ----------------------------------------------------------------------------
window.abrirModalReanaliseJuridica = async () => {
  document.getElementById('modal-reanalise-juridica').classList.remove('hidden');
  await carregarDicionarioClusters();
  await carregarFilaReanalise();
};

window.fecharModalReanaliseJuridica = () => {
  document.getElementById('modal-reanalise-juridica').classList.add('hidden');
};

// Supabase/PostgREST corta em 1000 linhas por requisição por padrão — com
// 1.120 famílias isso já estoura. Pagina em blocos de 1000, mesmo padrão já
// usado no carregamento principal do app (fetchAllQualificacoes).
async function buscarFilaReanaliseCompleta() {
  const TAMANHO_PAGINA = 1000;
  let desde = 0;
  let todas = [];
  while (true) {
    // vw_fila_reanalise já vem ordenada por escopo -> status -> cluster
    // (ordem da Fase 3 da metodologia) -> família; .range() preserva essa
    // ordem e só pagina sobre ela.
    const { data, error } = await supabase
      .from('vw_fila_reanalise')
      .select('*')
      .range(desde, desde + TAMANHO_PAGINA - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    todas = todas.concat(data);
    if (data.length < TAMANHO_PAGINA) break;
    desde += TAMANHO_PAGINA;
  }
  return todas;
}

// Carrega documento -> status de TODA a tabela base_legal_documento (uma
// chamada só, independente de quantas famílias tem a fila) — usado pra
// marcar quais famílias já estão com os documentos 100% validados.
async function carregarDicionarioStatusDocumentos() {
  const { data, error } = await supabase
    .from('base_legal_documento')
    .select('documento, status');
  if (error) {
    console.warn('Falha ao buscar dicionário de status de documentos:', error);
    dicionarioStatusDocumentosGlobal = new Map();
    return;
  }
  dicionarioStatusDocumentosGlobal = new Map(
    (data || []).map((r) => [normalizarNomeDocumento(r.documento), r.status])
  );
}

// Marca, em cada item da fila, se TODOS os documentos (exigidos + elegíveis)
// já estão com status 'validado' no dicionário — famílias sem nenhum
// documento na lista não contam (não há nada pra "já estar pronto").
function marcarFamiliasComDocumentosValidados(itens) {
  for (const item of itens) {
    const nomes = [
      ...(item.documentos_exigidos_atual || []),
      ...(item.documentos_elegiveis_atual || []),
    ];
    item.todosDocumentosValidados =
      nomes.length > 0 &&
      nomes.every((nome) => dicionarioStatusDocumentosGlobal.get(normalizarNomeDocumento(nome)) === 'validado');
  }
}

// Atualiza, EM MEMÓRIA, os campos de uma família já carregada na fila —
// evita o refetch completo (1.120 famílias + dicionário inteiro) toda vez
// que algo muda numa família só, que era o que deixava o fluxo "abrir
// família -> validar -> volta pra lista" lento. filaFiltradaAtual aponta
// pros MESMOS objetos de filaCarregada (filter() não clona), então um
// Object.assign aqui já reflete nos dois arrays.
function sincronizarItemFilaLocal(familiaCodigo, patch) {
  const item = filaCarregada.find((i) => i.familia_codigo === familiaCodigo);
  if (item) Object.assign(item, patch);
}

async function carregarFilaReanalise() {
  const container = document.getElementById('reanalise-fila-lista');
  container.innerHTML = `<p class="text-center text-sm text-slate-500 dark:text-slate-400 py-8 animate-pulse">Carregando fila...</p>`;

  try {
    const [fila] = await Promise.all([
      buscarFilaReanaliseCompleta(),
      carregarDicionarioStatusDocumentos(),
    ]);
    filaCarregada = fila;
    marcarFamiliasComDocumentosValidados(filaCarregada);
  } catch (error) {
    container.innerHTML = `<p class="text-center py-8 text-red-500">Erro ao buscar a fila: ${error.message}</p>`;
    return;
  }

  aplicarFiltrosReanalise();
}

window.aplicarFiltrosReanalise = () => {
  const escopo = document.getElementById('reanalise-filtro-escopo').value;
  const status = document.getElementById('reanalise-filtro-status').value;
  const cluster = document.getElementById('reanalise-filtro-cluster').value;
  const soDocumentosValidados = document.getElementById('reanalise-filtro-docs-validados')?.checked || false;

  const filtradas = filaCarregada.filter((item) =>
    (!escopo || item.escopo === escopo) &&
    (!status || item.status === status) &&
    (!cluster || item.cluster === cluster) &&
    (!soDocumentosValidados || item.todosDocumentosValidados)
  );

  // Pedido: famílias com sugestão da IA (status 'sugerido_ia') ficam no
  // topo da lista, pra priorizar quem já foi analisado e só falta validar.
  // As já 'validado' continuam por último (mesma lógica de antes, fim de
  // fluxo); o resto mantém a ordem que já vinha de vw_fila_reanalise
  // (escopo -> status -> cluster -> código) dentro de cada grupo, já que
  // Array.prototype.sort é estável.
  const prioridadeOrdenacao = (item) =>
    item.status === 'sugerido_ia' ? 0 : item.status === 'validado' ? 2 : 1;
  filtradas.sort((a, b) => prioridadeOrdenacao(a) - prioridadeOrdenacao(b));

  filaFiltradaAtual = filtradas;

  const elegiveisIA = filtradas.filter((f) => f.gemini_score === null || f.gemini_score === undefined);
  const contador = document.getElementById('reanalise-contador');
  if (contador) contador.textContent = `${filtradas.length} de ${filaCarregada.length} famílias`;

  const btnLote = document.getElementById('btn-sugerir-ia-lote');
  if (btnLote) {
    const qtdLote = Math.min(elegiveisIA.length, TAMANHO_LOTE_IA_REANALISE);
    btnLote.disabled = qtdLote === 0 || loteIaEmAndamento;
    btnLote.dataset.qtd = qtdLote;
    // querySelector pode voltar null se o <span class="qtd-lote"> não foi
    // colado dentro do botão no index.html — nesse caso só pula a contagem
    // em vez de quebrar o resto da função (que ainda precisa renderizar a fila).
    const spanQtd = btnLote.querySelector('.qtd-lote');
    if (spanQtd) {
      spanQtd.textContent =
        elegiveisIA.length > TAMANHO_LOTE_IA_REANALISE
          ? `${qtdLote} de ${elegiveisIA.length} sem sugestão`
          : `${qtdLote} sem sugestão`;
    }
  }

  renderizarFilaReanalise(filtradas);
};

// ----------------------------------------------------------------------------
// Sugestão de IA EM LOTE, sobre o filtro atualmente aplicado na fila (ex.:
// filtra cluster=C1 e clica aqui pra mandar até 20 famílias de uma vez, numa
// única chamada — mesmo padrão/limite já usado na aprovação de CNAE).
// ----------------------------------------------------------------------------
window.sugerirFundamentacaoEmLote = async () => {
  if (loteIaEmAndamento) {
    if (typeof showToast === 'function') showToast('Já tem um lote de IA rodando — aguarde terminar.');
    return;
  }

  const candidatos = filaFiltradaAtual
    .filter((f) => f.gemini_score === null || f.gemini_score === undefined)
    .slice(0, TAMANHO_LOTE_IA_REANALISE);

  if (candidatos.length === 0) {
    if (typeof showToast === 'function') showToast('Nada pra analisar nesse filtro — todas já têm sugestão da IA.');
    return;
  }

  const btnLote = document.getElementById('btn-sugerir-ia-lote');
  await executarLoteIA(candidatos, btnLote, `Analisando ${candidatos.length} famílias...`);
};

// Botão "🤖 Sugerir IA + lote" dentro do modal de detalhe de UMA família:
// manda essa família (se ainda não analisada) + até TAMANHO_LOTE_IA_DETALHE-1
// outras famílias do filtro atual que também ainda não foram analisadas,
// numa única chamada de lote — economiza clique de quem já está vendo uma
// família sem sugestão e quer aproveitar a mesma chamada pra adiantar outras.
const TAMANHO_LOTE_IA_DETALHE = TAMANHO_LOTE_IA_REANALISE;

window.sugerirFundamentacaoIALoteDetalhe = async () => {
  if (loteIaEmAndamento) {
    if (typeof showToast === 'function') showToast('Já tem um lote de IA rodando — aguarde terminar.');
    return;
  }

  const f = familiaAbertaAtual;
  if (!f) return;

  if (f.gemini_score !== null && f.gemini_score !== undefined) {
    if (typeof showToast === 'function') showToast('Essa família já foi analisada pela IA — nada foi enviado.');
    return;
  }

  const outras = filaFiltradaAtual
    .filter((item) => item.familia_codigo !== f.familia_codigo && (item.gemini_score === null || item.gemini_score === undefined))
    .slice(0, TAMANHO_LOTE_IA_DETALHE - 1);

  const candidatos = [
    { familia_codigo: f.familia_codigo, descricao: f.descricao, tipo: f.tipo, cluster: f.cluster },
    ...outras,
  ];

  const btn = document.getElementById('btn-sugerir-ia-lote-detalhe');
  await executarLoteIA(candidatos, btn, `Analisando ${candidatos.length} famílias...`);
};

// Núcleo compartilhado pelo lote da fila (botão do topo) e pelo lote
// disparado de dentro do modal de detalhe — a única diferença entre os dois
// é como a lista de `candidatos` é montada antes de chegar aqui.
async function executarLoteIA(candidatos, btnLote, textoCarregando) {
  loteIaEmAndamento = true;
  const textoOriginalBtn = btnLote ? btnLote.innerHTML : '';
  if (btnLote) {
    btnLote.disabled = true;
    btnLote.innerHTML = `${SVG_SPINNER_IA} ${textoCarregando}`;
  }

  try {
    await carregarDicionarioClusters();

    // vw_fila_reanalise não traz documentos/base legal atual — busca os
    // dados completos só das famílias deste lote.
    const codigos = candidatos.map((c) => c.familia_codigo);
    const { data: linhasCompletas, error: errBusca } = await supabase
      .from('qualificacao_reanalise_juridica')
      .select('familia_codigo, tipo, cluster, documentos_exigidos_atual, documentos_elegiveis_atual, base_legal_atual, observacao_original, anotacao_pendencia, gemini_sugestao_documentos')
      .in('familia_codigo', codigos);
    if (errBusca) throw errBusca;

    const porCodigo = new Map(linhasCompletas.map((l) => [l.familia_codigo, l]));

    const itens = candidatos.map((c) => {
      const completo = porCodigo.get(c.familia_codigo) || {};
      return {
        id: c.familia_codigo,
        familia: c.descricao,
        tipo: completo.tipo ?? c.tipo,
        cluster: completo.cluster ?? c.cluster,
        documentos_exigidos_atual: completo.documentos_exigidos_atual || [],
        documentos_elegiveis_atual: completo.documentos_elegiveis_atual || [],
        base_legal_atual: completo.base_legal_atual || null,
        observacao_original: completo.observacao_original || null,
        anotacao_pendencia: completo.anotacao_pendencia || null,
        gemini_sugestao_documentos_existente: completo.gemini_sugestao_documentos || [],
      };
    });

    // contexto_cluster: uma entrada por cluster distinto presente no lote
    // (normalmente só 1, já que o filtro de cluster costuma estar ativo).
    const contextoCluster = {};
    for (const item of itens) {
      if (item.cluster && clustersDicionario?.[item.cluster] && !contextoCluster[item.cluster]) {
        contextoCluster[item.cluster] = clustersDicionario[item.cluster].base_legal_tipica;
      }
    }

    // Preenche o dicionário de base legal por documento ANTES do resumo
    // geral por família — reaproveita qualquer documento (ex.: CREA) já
    // analisado em outra família qualquer, só manda pra IA o que é
    // realmente novo neste lote.
    const nomesDocumentosLote = itens.flatMap((item) => [
      ...(item.documentos_exigidos_atual || []),
      ...(item.documentos_elegiveis_atual || []),
    ]);
    const { novos: documentosNovos } = await sugerirBaseLegalDocumentos(nomesDocumentosLote);

    const { data: resultados, error } = await supabase.functions.invoke('gerar-fundamentacao-legal', {
      body: { itens, contexto_cluster: contextoCluster },
    });
    if (error) throw error;
    if (!Array.isArray(resultados)) throw new Error('Resposta inesperada da IA.');

    const porId = new Map(resultados.map((r) => [String(r.id), r]));
    const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
    let sucesso = 0;

    for (const item of itens) {
      const r = porId.get(String(item.id));
      if (!r) continue;

      const atualizacao = {
        gemini_sugestao_base_legal: r.base_legal_sugerida ?? null,
        gemini_sugestao_documentos: mesclarSugestoesDocumentos(
          filtrarSugestoesDocumentosValidas(
            r.documentos_sugeridos,
            item.documentos_exigidos_atual,
            item.documentos_elegiveis_atual
          ),
          item.gemini_sugestao_documentos_existente
        ),
        gemini_score: r.score ?? null,
        gemini_justificativa: r.justificativa ?? null,
        gemini_fontes: r.fontes ?? [],
        gemini_alertas: r.alertas ?? [],
        gemini_analisado_em: new Date().toISOString(),
        status: 'sugerido_ia',
      };

      const { error: errUpdate } = await supabase
        .from('qualificacao_reanalise_juridica')
        .update(atualizacao)
        .eq('familia_codigo', item.id);

      if (!errUpdate) {
        sucesso++;
        await supabase.from('qualificacao_reanalise_historico').insert([{
          familia_codigo: item.id,
          tipo_evento: 'sugestao_ia',
          payload: { sugestao: r, modo: 'lote' },
          usuario,
        }]);
        sincronizarItemFilaLocal(item.id, {
          status: 'sugerido_ia',
          gemini_score: atualizacao.gemini_score,
          gemini_analisado_em: atualizacao.gemini_analisado_em,
        });

        // Se a família que está aberta no modal de detalhe foi uma das
        // atualizadas por este lote (caso do botão dentro do próprio
        // modal), reflete a sugestão nela também e redesenha o modal — do
        // contrário o analista veria o score mudar na lista atrás mas o
        // modal aberto continuaria mostrando "nenhuma sugestão ainda".
        if (familiaAbertaAtual && familiaAbertaAtual.familia_codigo === item.id) {
          Object.assign(familiaAbertaAtual, atualizacao);
          renderizarDetalheReanalise();
        }
      }
    }

    const sufixoDocumentos = documentosNovos > 0 ? ` + ${documentosNovos} documentos novos no dicionário.` : '';
    if (typeof showToast === 'function') showToast(`IA concluiu ${sucesso} de ${itens.length} famílias do lote.${sufixoDocumentos}`);
    // Antes recarregava a fila inteira do zero (1.120 famílias + dicionário)
    // só pra refletir os ~8 scores novos deste lote — agora cada família já
    // foi sincronizada em memória acima, então só precisa reaplicar os
    // filtros (sem rede) pra lista reordenar/mostrar os badges novos.
    aplicarFiltrosReanalise();
  } catch (err) {
    console.error('Falha no lote de IA da reanálise:', err);
    if (typeof showError === 'function') showError('Erro na IA', err.message || 'Falha ao analisar o lote. Tente novamente.');
  } finally {
    loteIaEmAndamento = false;
    if (btnLote) { btnLote.disabled = false; btnLote.innerHTML = textoOriginalBtn; }
  }
}

function renderizarFilaReanalise(itens) {
  const container = document.getElementById('reanalise-fila-lista');

  if (itens.length === 0) {
    container.innerHTML = `<div class="text-center p-8 bg-white dark:bg-slate-800 rounded-xl border border-dashed dark:border-slate-700">
      <p class="text-slate-500 dark:text-slate-400">Nenhuma família neste filtro.</p>
    </div>`;
    return;
  }

  container.innerHTML = itens.map((item) => {
    const corEscopo = item.escopo === 'prioritario'
      ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/40 dark:text-indigo-400'
      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400';

    const corStatus = {
      pendente: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
      em_analise: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
      aguardando_terceiro: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
      sugerido_ia: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
      validado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
    }[item.status] || 'bg-slate-100 text-slate-600';

    const badgeScore = item.gemini_score !== null && item.gemini_score !== undefined
      ? `<span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${corBadgeScore(item.gemini_score)}">🤖 ${item.gemini_score}/10</span>`
      : '';

    return `
    <div onclick="abrirDetalheReanalise('${item.familia_codigo}')"
         class="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-wrap items-center gap-3 cursor-pointer hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-700 transition-all">
      <span class="font-mono font-bold text-xs text-slate-700 dark:text-slate-300 shrink-0">${item.familia_codigo}</span>
      <span class="flex-1 min-w-[180px] text-xs text-slate-600 dark:text-slate-400 truncate">${item.descricao ?? ''}</span>
      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${corEscopo}">${item.escopo}</span>
      ${item.cluster ? `<span class="px-2 py-0.5 rounded text-[10px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400">${item.cluster}</span>` : ''}
      <span class="px-2 py-0.5 rounded text-[10px] font-bold uppercase ${corStatus}">${item.status.replace('_', ' ')}</span>
      ${badgeScore}
      ${item.todosDocumentosValidados && item.status !== 'validado'
        ? `<span title="Todos os documentos exigidos/elegíveis desta família já têm base legal validada no dicionário — a decisão final tende a ser rápida." class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800">✅ Docs validados</span>`
        : ''}
      ${item.anotacao_pendencia ? `<span title="${item.anotacao_pendencia}" class="text-amber-500">⚠️</span>` : ''}
    </div>`;
  }).join('');
}

// ----------------------------------------------------------------------------
// Detalhe de uma família + sugestão de IA + validação
// ----------------------------------------------------------------------------
window.abrirDetalheReanalise = async (familiaCodigo) => {
  const { data, error } = await supabase
    .from('qualificacao_reanalise_juridica')
    .select('*')
    .eq('familia_codigo', familiaCodigo)
    .single();

  if (error || !data) {
    if (typeof showError === 'function') showError('Erro', 'Família não encontrada na reanálise.');
    return;
  }

  familiaAbertaAtual = data;

  // Marca como em_analise na primeira abertura (máquina de estados do spec)
  if (data.status === 'pendente') {
    await supabase.from('qualificacao_reanalise_juridica')
      .update({ status: 'em_analise' })
      .eq('familia_codigo', familiaCodigo);
    familiaAbertaAtual.status = 'em_analise';
    await registrarHistorico(familiaCodigo, 'edicao_manual', { de: 'pendente', para: 'em_analise' });
    sincronizarItemFilaLocal(familiaCodigo, { status: 'em_analise' });
  }

  await carregarBaseLegalDocumentosDaFamilia(data);
  renderizarDetalheReanalise();
  document.getElementById('modal-detalhe-reanalise').classList.remove('hidden');
};

// Busca no dicionário compartilhado (base_legal_documento) só os documentos
// desta família — guarda num Map(documento -> linha) em
// dicionarioBaseLegalDocumentosAtual, usado pela renderização e pela
// decisão de quais documentos ainda precisam de análise da IA.
async function carregarBaseLegalDocumentosDaFamilia(f) {
  const nomes = [...new Set([
    ...(f.documentos_exigidos_atual || []),
    ...(f.documentos_elegiveis_atual || []),
  ])];
  dicionarioBaseLegalDocumentosAtual = new Map();
  if (nomes.length === 0) return;

  const { data, error } = await supabase
    .from('base_legal_documento')
    .select('*')
    .in('documento', nomes);
  if (error) {
    console.warn('Falha ao buscar base_legal_documento:', error);
    return;
  }
  for (const row of data || []) {
    dicionarioBaseLegalDocumentosAtual.set(row.documento, row);
  }
}

window.fecharDetalheReanalise = () => {
  document.getElementById('modal-detalhe-reanalise').classList.add('hidden');
  familiaAbertaAtual = null;
  // Antes isto chamava carregarFilaReanalise() — um refetch completo (1.120
  // famílias + a tabela inteira de base_legal_documento) toda vez que
  // fechava UMA família. Como cada ação relevante (abrir, sugerir IA,
  // validar, validar documento) já sincroniza o item certo em memória via
  // sincronizarItemFilaLocal/marcarFamiliasComDocumentosValidados, só
  // precisa reaplicar os filtros (sem rede) pra lista atrás refletir o que
  // mudou. Reabrir o módulo do zero (abrirModalReanaliseJuridica) continua
  // fazendo o refetch completo normalmente.
  aplicarFiltrosReanalise();
};

function renderizarDetalheReanalise() {
  const f = familiaAbertaAtual;
  const clusterInfo = f.cluster ? clustersDicionario?.[f.cluster] : null;

  document.getElementById('detalhe-reanalise-cluster').textContent =
    (clusterInfo ? NOMES_CLUSTER[f.cluster] : f.escopo === 'secundario' ? 'Sem cluster — hoje só ATC' : 'Sem cluster atribuído');
  document.getElementById('detalhe-reanalise-titulo').textContent = `${f.familia_codigo} — ${f.descricao ?? ''}`;

  const alertasC6 = f.cluster === 'C6'
    ? `<p class="text-[10px] text-amber-600 dark:text-amber-400 italic">⚠️ Cluster C6: agências reguladoras mudam resoluções com frequência — confirme vigência manualmente mesmo com score alto.</p>`
    : '';

  // Base legal por documento: lida do dicionário compartilhado
  // (base_legal_documento), não mais de um campo da própria família — o
  // mesmo documento (ex.: CREA) aparece em várias famílias e usa a mesma
  // entrada, então corrigir/validar aqui vale pra todas elas.
  const nomesDocumentos = [...new Set([
    ...(f.documentos_exigidos_atual || []),
    ...(f.documentos_elegiveis_atual || []),
  ])];
  const blocoBaseLegalPorDocumento = nomesDocumentos.length > 0
    ? `<div class="space-y-1 pt-1">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Base legal por documento</p>
          <button type="button" onclick="sugerirBaseLegalDocumentosDaFamiliaAberta()"
            class="text-[10px] font-bold text-violet-600 dark:text-violet-400 hover:underline" ${loteDocumentosEmAndamento ? 'disabled' : ''}>
            ${loteDocumentosEmAndamento ? 'Analisando...' : '🤖 Preencher faltantes com IA'}
          </button>
        </div>
        ${nomesDocumentos.map(nome => {
          const d = dicionarioBaseLegalDocumentosAtual.get(nome);
          const statusBadge = !d
            ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 font-bold uppercase shrink-0">sem análise</span>`
            : d.status === 'validado'
              ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-400 font-bold uppercase shrink-0">validado</span>`
              : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 font-bold uppercase shrink-0">sugerido ia</span>`;
          return `
          <div class="flex flex-col sm:flex-row sm:items-start gap-1 sm:gap-3 text-xs bg-white dark:bg-slate-850 p-2 rounded border dark:border-slate-700">
            <span class="font-bold text-slate-700 dark:text-slate-200 sm:w-1/3 shrink-0">${nome}</span>
            <span class="text-slate-600 dark:text-slate-400 flex-1">${d?.base_legal ?? '—'}</span>
            ${statusBadge}
            ${d && d.status !== 'validado'
              ? `<button type="button" onclick="validarBaseLegalDocumento('${nome.replace(/'/g, "\\'")}')" class="text-[9px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline shrink-0">validar</button>`
              : ''}
          </div>`;
        }).join('')}
      </div>`
    : '';

  // Ajustes de documento: tanto sugestões da IA (ao analisar a família)
  // quanto sugestões que o próprio analista adiciona manualmente (origem:
  // 'manual') — ambas passam pelo mesmo "Aplicar esta sugestão na família".
  // Fica fora do badge de score de propósito: um analista pode querer
  // sugerir manualmente incluir/excluir um documento numa família que ainda
  // nem foi analisada pela IA.
  const sugestoesDocumentos = f.gemini_sugestao_documentos || [];
  const blocoSugestoesDocumentos = `<div class="p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-900/30 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">⚠️ Ajustes nos documentos desta família</p>
          <div class="flex items-center gap-2 shrink-0">
            ${(f.gemini_score === null || f.gemini_score === undefined)
              ? `<button type="button" id="btn-sugerir-ia-lote-detalhe" onclick="sugerirFundamentacaoIALoteDetalhe()"
                  class="admin-only text-[9px] font-bold text-violet-600 dark:text-violet-400 hover:underline"
                  title="Manda esta família + até ${TAMANHO_LOTE_IA_DETALHE - 1} outras do filtro atual que ainda não têm sugestão da IA, numa única chamada de lote">
                  🤖 Sugerir IA + lote
                </button>`
              : ''}
            ${sugestoesDocumentos.length > 0
              ? `<button type="button" onclick="limparSugestoesDocumentosInvalidas()"
                  class="admin-only text-[9px] font-bold text-slate-500 dark:text-slate-400 hover:underline"
                  title="Remove da lista abaixo qualquer sugestão de 'adicionar' um documento que já está nos exigidos/elegíveis atuais, ou de 'remover' um que nem está lá">
                  🧹 Limpar inválidas
                </button>`
              : ''}
          </div>
        </div>
        ${sugestoesDocumentos.length === 0
          ? `<p class="text-xs text-slate-400 italic">Nenhum ajuste sugerido (nem pela IA, nem manualmente) ainda.</p>`
          : sugestoesDocumentos.map((s, idx) => {
              const origemBadge = s.origem === 'manual'
                ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 font-bold uppercase shrink-0" title="Adicionado por ${s.criado_por ?? '—'} em ${s.criado_em ? new Date(s.criado_em).toLocaleDateString('pt-BR') : '—'}">✍️ Manual</span>`
                : `<span class="text-[9px] px-1.5 py-0.5 rounded bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-400 font-bold uppercase shrink-0">🤖 IA</span>`;
              return `
          <div class="text-xs bg-white dark:bg-slate-850 p-2 rounded border dark:border-slate-700 space-y-1">
            <p class="flex items-center flex-wrap gap-1.5">
              <span class="font-black uppercase ${s.acao === 'remover' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}">${s.acao === 'remover' ? 'Remover' : 'Adicionar'}</span>
              <span class="font-bold text-slate-700 dark:text-slate-200">${s.nome ?? '—'}</span>
              <span class="text-slate-400 dark:text-slate-500">(${s.tipo === 'elegivel' ? 'elegível' : 'exigido'})</span>
              ${origemBadge}
            </p>
            <p class="text-slate-600 dark:text-slate-400">${s.motivo ?? ''}</p>
            <p class="text-slate-500 dark:text-slate-400"><span class="font-bold">Base legal:</span> ${s.base_legal ?? '—'}</p>
            ${s.aplicado
              ? `<p class="text-[10px] font-bold text-emerald-600 dark:text-emerald-400">✅ Aplicado em ${new Date(s.aplicado_em).toLocaleDateString('pt-BR')} por ${s.aplicado_por ?? '—'} — aguardando ciência de um gestor CGCF na tela principal.</p>`
              : `<button type="button" onclick="aplicarSugestaoDocumento(${idx})"
                  class="admin-only text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                  title="Grava de verdade esta mudança em documentos_exigidos/documentos_elegiveis da família, e sinaliza na tela principal até um gestor CGCF dar ciência">
                  ✓ Aplicar esta sugestão na família
                </button>`}
          </div>`;
            }).join('')}
        <details class="admin-only pt-1">
          <summary class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer select-none">+ Adicionar sugestão manual</summary>
          <div class="mt-2 p-2 bg-white dark:bg-slate-850 rounded border dark:border-slate-700 space-y-2">
            <div class="grid grid-cols-2 gap-2">
              <select id="manual-sugestao-acao" class="p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none">
                <option value="adicionar">Adicionar</option>
                <option value="remover">Remover</option>
              </select>
              <select id="manual-sugestao-tipo" class="p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none">
                <option value="exigido">Exigido</option>
                <option value="elegivel">Elegível</option>
              </select>
            </div>
            <input type="text" id="manual-sugestao-nome" list="valid-docs-list" placeholder="Nome do documento"
              class="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none">
            <textarea id="manual-sugestao-motivo" rows="2" placeholder="Motivo (obrigatório)"
              class="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none"></textarea>
            <input type="text" id="manual-sugestao-base-legal" placeholder="Base legal (opcional — deixe em branco se não tiver certeza)"
              class="w-full p-1.5 text-xs border rounded dark:bg-slate-800 dark:border-slate-700 dark:text-white outline-none">
            <button type="button" onclick="adicionarSugestaoDocumentoManual()"
              class="w-full bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider transition-colors">
              + Adicionar sugestão
            </button>
          </div>
        </details>
      </div>`;

  const badgeIA = f.gemini_score !== null && f.gemini_score !== undefined
    ? `<div class="p-3 bg-slate-50 dark:bg-slate-900/50 rounded-lg border border-slate-200 dark:border-slate-700 space-y-2">
        <span class="px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider border ${corBadgeScore(f.gemini_score)}">🤖 Score IA: ${f.gemini_score}/10</span>
        <p class="text-xs text-slate-600 dark:text-slate-400">${f.gemini_justificativa ?? ''}</p>
        ${(f.gemini_alertas || []).map(a => `<p class="text-[10px] text-red-500">⚠️ ${a}</p>`).join('')}
      </div>`
    : `<p class="text-xs text-slate-400 italic">Nenhuma sugestão da IA ainda.</p>`;

  document.getElementById('detalhe-reanalise-corpo').innerHTML = `
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
      <div class="bg-red-50 dark:bg-red-900/10 p-3 rounded-lg border border-red-100 dark:border-red-900/30">
        <p class="font-bold text-red-600 dark:text-red-400 uppercase mb-1 text-[10px]">Documentos Exigidos (atual)</p>
        <p class="text-slate-600 dark:text-slate-300">${(f.documentos_exigidos_atual || []).join(', ') || '—'}</p>
      </div>
      <div class="bg-emerald-50 dark:bg-emerald-900/10 p-3 rounded-lg border border-emerald-100 dark:border-emerald-900/30">
        <p class="font-bold text-emerald-600 dark:text-emerald-400 uppercase mb-1 text-[10px]">Documentos Elegíveis (atual)</p>
        <p class="text-slate-600 dark:text-slate-300">${(f.documentos_elegiveis_atual || []).join(', ') || '—'}</p>
      </div>
    </div>

    <div class="text-xs">
      <p class="font-bold text-slate-500 dark:text-slate-400 uppercase mb-1 text-[10px]">Base Legal Atual</p>
      <p class="text-slate-700 dark:text-slate-300 bg-slate-50 dark:bg-slate-900/50 p-2 rounded border dark:border-slate-700">${f.base_legal_atual ?? '—'}</p>
    </div>

    ${f.anotacao_pendencia ? `<p class="text-xs text-amber-600 dark:text-amber-400">⚠️ Pendência sinalizada: ${f.anotacao_pendencia}</p>` : ''}
    ${alertasC6}

    ${blocoBaseLegalPorDocumento}

    ${badgeIA}

    ${blocoSugestoesDocumentos}

    <div class="space-y-2 border-t dark:border-slate-800 pt-4">
      <div class="flex items-center justify-between">
        <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Decisão Final — Base Legal</label>
        <button type="button" onclick="preencherDecisaoComDocumentosValidados()"
          class="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline" title="Substitui o texto abaixo pela lista dos documentos já validados — não salva sozinho, só preenche o campo">
          ↻ Preencher com documentos validados
        </button>
      </div>
      <textarea id="input-decisao-base-legal" rows="3" class="w-full p-2 text-xs border rounded-lg dark:bg-slate-850 dark:border-slate-700 dark:text-white">${f.decisao_base_legal ?? f.gemini_sugestao_base_legal ?? ''}</textarea>

      <label class="block text-[10px] font-bold text-slate-500 dark:text-slate-400 uppercase">Observação da Decisão</label>
      <textarea id="input-decisao-observacao" rows="2" class="w-full p-2 text-xs border rounded-lg dark:bg-slate-850 dark:border-slate-700 dark:text-white">${f.decisao_observacao ?? ''}</textarea>
      <p class="text-[10px] text-slate-400 dark:text-slate-500 italic">A decisão fica só em qualificacao_reanalise_juridica (ligada por familia_codigo) — nada é copiado pra qualificacao_tecnica; quem precisar das duas informações consulta as duas tabelas.</p>
    </div>
  `;

  // "Sugerir Fundamentação (IA)" é uma ação de uma vez só por família — depois
  // que f.gemini_score já está preenchido, fica desabilitado/apagado pra
  // deixar claro que essa família já foi analisada (evita cliques repetidos
  // que não fariam nada além de re-perguntar a mesma coisa pra IA).
  const btnSugerirIA = document.getElementById('btn-sugerir-ia-reanalise');
  if (btnSugerirIA) {
    const jaAnalisada = f.gemini_score !== null && f.gemini_score !== undefined;
    btnSugerirIA.disabled = jaAnalisada;
    btnSugerirIA.classList.toggle('opacity-40', jaAnalisada);
    btnSugerirIA.classList.toggle('cursor-not-allowed', jaAnalisada);
    btnSugerirIA.title = jaAnalisada ? 'Esta família já foi analisada pela IA.' : '';
  }
}

// Monta um texto a partir dos documentos JÁ VALIDADOS da família aberta e
// substitui o conteúdo do textarea "Decisão Final — Base Legal" — não salva
// nada sozinho (só quando o analista clicar em "Validar" da família), e só
// conta documento com status 'validado' (nunca puxa sugestão de IA ainda
// não confirmada pra dentro da decisão final).
window.preencherDecisaoComDocumentosValidados = () => {
  const f = familiaAbertaAtual;
  if (!f) return;

  const nomes = [...new Set([
    ...(f.documentos_exigidos_atual || []),
    ...(f.documentos_elegiveis_atual || []),
  ])];

  // Só as leis em si, sem repetir o nome do documento na frente — e
  // deduplicadas, já que vários documentos podem citar a mesma norma
  // (ex.: 14.133/2021 aparecendo em mais de um item).
  const leis = [];
  const pendentes = [];
  for (const nome of nomes) {
    const d = dicionarioBaseLegalDocumentosAtual.get(nome);
    if (d && d.status === 'validado' && d.base_legal) {
      if (!leis.includes(d.base_legal)) leis.push(d.base_legal);
    } else {
      pendentes.push(nome);
    }
  }

  if (leis.length === 0) {
    if (typeof showToast === 'function') showToast('Nenhum documento validado ainda nesta família — valide pelo menos um antes.');
    return;
  }

  document.getElementById('input-decisao-base-legal').value = leis.map((l) => `- ${l}`).join('\n');

  if (pendentes.length > 0 && typeof showToast === 'function') {
    showToast(`Preenchido com ${leis.length} norma(s) de documentos validados. ${pendentes.length} documento(s) ainda sem validação não entraram.`);
  }
};

// Analisa com IA só os documentos (exigidos + elegíveis) da família aberta
// que ainda não têm entrada em base_legal_documento. Útil quando o lote
// nunca passou por esta família específica ainda.
window.sugerirBaseLegalDocumentosDaFamiliaAberta = async () => {
  const f = familiaAbertaAtual;
  if (!f || loteDocumentosEmAndamento) return;

  loteDocumentosEmAndamento = true;
  renderizarDetalheReanalise();

  try {
    const nomes = [
      ...(f.documentos_exigidos_atual || []),
      ...(f.documentos_elegiveis_atual || []),
    ];
    const { novos, jaExistentes } = await sugerirBaseLegalDocumentos(nomes);
    await carregarBaseLegalDocumentosDaFamilia(f);
    if (typeof showToast === 'function') {
      showToast(novos > 0
        ? `${novos} documento(s) novo(s) analisados. ${jaExistentes} já estavam no dicionário.`
        : 'Todos os documentos desta família já estavam no dicionário.');
    }
  } catch (err) {
    console.error('Falha ao sugerir base legal por documento:', err);
    if (typeof showError === 'function') showError('Erro na IA', err.message || 'Falha ao analisar os documentos.');
  } finally {
    loteDocumentosEmAndamento = false;
    renderizarDetalheReanalise();
  }
};

// Marca um documento do dicionário compartilhado como validado — passa a
// valer pra TODAS as famílias que usam esse mesmo documento, não só a
// aberta agora. Permite corrigir o texto no mesmo passo.
// Nome do documento sendo validado no momento (estado do modal pequeno
// #modal-validar-documento, ver ui/index_html_snippet.html).
let documentoEmValidacao = null;

window.validarBaseLegalDocumento = (nomeDocumento) => {
  const atual = dicionarioBaseLegalDocumentosAtual.get(nomeDocumento);
  documentoEmValidacao = nomeDocumento;

  document.getElementById('validar-documento-titulo').textContent = nomeDocumento;
  document.getElementById('input-validar-documento-base-legal').value = atual?.base_legal ?? '';
  document.getElementById('modal-validar-documento').classList.remove('hidden');
};

window.fecharModalValidarDocumento = () => {
  document.getElementById('modal-validar-documento').classList.add('hidden');
  documentoEmValidacao = null;
};

window.confirmarValidarDocumento = async () => {
  if (!documentoEmValidacao) return;
  const nomeDocumento = documentoEmValidacao;
  const textoFinal = document.getElementById('input-validar-documento-base-legal').value.trim();

  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
  const { error } = await supabase
    .from('base_legal_documento')
    .upsert({
      documento: nomeDocumento,
      base_legal: textoFinal,
      status: 'validado',
      validado_por: usuario,
      validado_em: new Date().toISOString(),
    }, { onConflict: 'documento' });

  if (error) {
    if (typeof showError === 'function') showError('Erro', 'Falha ao validar documento: ' + error.message);
    return;
  }

  // Atualiza o cache em memória usado pro selo "✅ Docs validados" da fila —
  // validar ESTE documento pode destravar o selo de várias famílias de uma
  // vez (qualquer uma que exija/aceite o mesmo documento), então recalcula
  // todo mundo (em memória, sem rede) em vez de só a família aberta agora.
  dicionarioStatusDocumentosGlobal.set(normalizarNomeDocumento(nomeDocumento), 'validado');
  marcarFamiliasComDocumentosValidados(filaCarregada);

  window.fecharModalValidarDocumento();
  if (typeof showToast === 'function') showToast(`"${nomeDocumento}" validado — vale pra todas as famílias que usam esse documento.`);
  if (familiaAbertaAtual) {
    await carregarBaseLegalDocumentosDaFamilia(familiaAbertaAtual);
    renderizarDetalheReanalise();
  }
};

// Aplica de verdade uma sugestão de "documento a mais/a menos" (vinda de
// gemini_sugestao_documentos) na família: inclui/exclui o nome em
// qualificacao_tecnica.documentos_exigidos ou documentos_elegiveis, e grava
// uma linha em qualificacao_documento_alteracoes (migration 006) pra
// sinalizar a mudança no card da tela principal até um gestor CGCF dar
// ciência. Diferente da "Decisão Final — Base Legal" (que fica isolada em
// qualificacao_reanalise_juridica): isto GRAVA na tabela principal, por ser
// uma ação explícita e auditada, não uma propagação automática de texto.
// Deixa o analista sugerir manualmente incluir/excluir um documento da
// família aberta — mesma estrutura de dado e mesmo fluxo de "Aplicar esta
// sugestão na família" das sugestões da IA (aplicarSugestaoDocumento não
// faz distinção de origem). Diferença: aqui é uma ação deliberada do
// analista, então os erros (documento já na lista, documento inexistente,
// motivo em branco) são avisados na hora em vez de só filtrados em
// silêncio como no caminho da IA.
window.adicionarSugestaoDocumentoManual = async () => {
  const f = familiaAbertaAtual;
  if (!f) return;

  const acao = document.getElementById('manual-sugestao-acao').value;
  const tipo = document.getElementById('manual-sugestao-tipo').value;
  const nome = document.getElementById('manual-sugestao-nome').value.trim();
  const motivo = document.getElementById('manual-sugestao-motivo').value.trim();
  const baseLegal = document.getElementById('manual-sugestao-base-legal').value.trim();

  if (!nome) {
    if (typeof showError === 'function') showError('Atenção', 'Informe o nome do documento.');
    return;
  }
  if (!motivo) {
    if (typeof showError === 'function') showError('Atenção', 'Informe o motivo da sugestão.');
    return;
  }

  const nomeNorm = normalizarNomeDocumento(nome);
  const exigidosNorm = new Set((f.documentos_exigidos_atual || []).map(normalizarNomeDocumento));
  const elegiveisNorm = new Set((f.documentos_elegiveis_atual || []).map(normalizarNomeDocumento));
  const jaEstaEmAlgumaLista = exigidosNorm.has(nomeNorm) || elegiveisNorm.has(nomeNorm);

  if (acao === 'adicionar' && jaEstaEmAlgumaLista) {
    if (typeof showError === 'function') showError('Atenção', `"${nome}" já está na lista de documentos desta família — não faz sentido sugerir adicionar.`);
    return;
  }
  if (acao === 'remover' && !jaEstaEmAlgumaLista) {
    if (typeof showError === 'function') showError('Atenção', `"${nome}" não está na lista de documentos desta família — não há o que remover.`);
    return;
  }

  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
  const novaSugestao = {
    acao,
    tipo,
    nome,
    motivo,
    base_legal: baseLegal || 'não identificada com segurança',
    origem: 'manual',
    criado_por: usuario,
    criado_em: new Date().toISOString(),
  };

  const sugestoesAtualizadas = [...(f.gemini_sugestao_documentos || []), novaSugestao];

  const { error } = await supabase
    .from('qualificacao_reanalise_juridica')
    .update({ gemini_sugestao_documentos: sugestoesAtualizadas })
    .eq('familia_codigo', f.familia_codigo);

  if (error) {
    if (typeof showError === 'function') showError('Erro', 'Falha ao adicionar sugestão: ' + error.message);
    return;
  }

  familiaAbertaAtual.gemini_sugestao_documentos = sugestoesAtualizadas;
  await registrarHistorico(f.familia_codigo, 'edicao_manual', { sugestao_documento_manual_adicionada: novaSugestao });

  if (typeof showToast === 'function') showToast('Sugestão manual adicionada.');
  renderizarDetalheReanalise();
};

window.aplicarSugestaoDocumento = async (idx) => {
  const f = familiaAbertaAtual;
  if (!f) return;
  const sugestoes = f.gemini_sugestao_documentos || [];
  const s = sugestoes[idx];
  if (!s || s.aplicado) return;

  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
  const coluna = s.tipo === 'elegivel' ? 'documentos_elegiveis' : 'documentos_exigidos';

  try {
    const { data: familiaTecnica, error: errBusca } = await supabase
      .from('qualificacao_tecnica')
      .select(coluna)
      .eq('familia', f.familia_codigo)
      .single();
    if (errBusca) throw errBusca;

    const listaAtual = familiaTecnica?.[coluna] || [];
    let novaLista;
    if (s.acao === 'remover') {
      novaLista = listaAtual.filter((d) => d !== s.nome);
    } else {
      novaLista = listaAtual.includes(s.nome) ? listaAtual : [...listaAtual, s.nome];
    }

    const { error: errUpdate } = await supabase
      .from('qualificacao_tecnica')
      .update({ [coluna]: novaLista })
      .eq('familia', f.familia_codigo);
    if (errUpdate) throw errUpdate;

    const { error: errAlteracao } = await supabase
      .from('qualificacao_documento_alteracoes')
      .insert([{
        familia_codigo: f.familia_codigo,
        tipo_lista: s.tipo === 'elegivel' ? 'elegivel' : 'exigido',
        acao: s.acao === 'remover' ? 'excluir' : 'incluir',
        documento: s.nome,
        motivo: s.motivo ?? null,
        base_legal: s.base_legal ?? null,
        aplicado_por: usuario,
      }]);
    if (errAlteracao) throw errAlteracao;

    // Marca a sugestão como aplicada dentro do próprio JSON, pra não mostrar
    // o botão "Aplicar" de novo nem reaplicar duas vezes.
    sugestoes[idx] = { ...s, aplicado: true, aplicado_por: usuario, aplicado_em: new Date().toISOString() };
    const { error: errSugestao } = await supabase
      .from('qualificacao_reanalise_juridica')
      .update({ gemini_sugestao_documentos: sugestoes })
      .eq('familia_codigo', f.familia_codigo);
    if (errSugestao) throw errSugestao;

    familiaAbertaAtual.gemini_sugestao_documentos = sugestoes;
    await registrarHistorico(f.familia_codigo, 'edicao_manual', { aplicou_sugestao_documento: s });

    if (typeof showToast === 'function') showToast(`"${s.nome}" ${s.acao === 'remover' ? 'removido dos' : 'incluído nos'} documentos ${s.tipo === 'elegivel' ? 'elegíveis' : 'exigidos'} — sinalizado na tela principal até um gestor CGCF dar ciência.`);
    renderizarDetalheReanalise();
  } catch (err) {
    console.error('Falha ao aplicar sugestão de documento:', err);
    if (typeof showError === 'function') showError('Erro', err.message || 'Falha ao aplicar a sugestão nesta família.');
  }
};

// Reaplica filtrarSugestoesDocumentosValidas em cima de uma sugestão que já
// foi salva antes desse filtro existir (ou que por algum motivo escapou
// dele) — não chama a IA de novo, só reconfere contra os documentos
// exigidos/elegíveis atuais da família e remove o que não faz sentido.
window.limparSugestoesDocumentosInvalidas = async () => {
  const f = familiaAbertaAtual;
  if (!f) return;

  const antes = (f.gemini_sugestao_documentos || []).length;
  const filtradas = filtrarSugestoesDocumentosValidas(
    f.gemini_sugestao_documentos,
    f.documentos_exigidos_atual,
    f.documentos_elegiveis_atual
  );
  const removidas = antes - filtradas.length;

  if (removidas === 0) {
    if (typeof showToast === 'function') showToast('Nenhuma sugestão inválida encontrada — já estava tudo certo.');
    return;
  }

  const { error } = await supabase
    .from('qualificacao_reanalise_juridica')
    .update({ gemini_sugestao_documentos: filtradas })
    .eq('familia_codigo', f.familia_codigo);

  if (error) {
    if (typeof showError === 'function') showError('Erro', 'Falha ao limpar sugestões: ' + error.message);
    return;
  }

  familiaAbertaAtual.gemini_sugestao_documentos = filtradas;
  if (typeof showToast === 'function') showToast(`${removidas} sugestão(ões) inválida(s) removida(s).`);
  renderizarDetalheReanalise();
};

window.sugerirFundamentacaoIA = async () => {
  const f = familiaAbertaAtual;
  if (!f) return;
  if (f.gemini_score !== null && f.gemini_score !== undefined) {
    if (typeof showToast === 'function') showToast('Essa família já foi analisada pela IA.');
    return;
  }

  const btn = document.getElementById('btn-sugerir-ia-reanalise');
  const textoOriginal = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = `${SVG_SPINNER_IA} Consultando IA...`;

  try {
    const contextoCluster = {};
    if (f.cluster && clustersDicionario?.[f.cluster]) {
      contextoCluster[f.cluster] = clustersDicionario[f.cluster].base_legal_tipica;
    }

    const { data, error } = await supabase.functions.invoke('gerar-fundamentacao-legal', {
      body: {
        itens: [{
          id: f.familia_codigo,
          familia: f.descricao,
          tipo: f.tipo,
          cluster: f.cluster,
          documentos_exigidos_atual: f.documentos_exigidos_atual,
          documentos_elegiveis_atual: f.documentos_elegiveis_atual,
          base_legal_atual: f.base_legal_atual,
          observacao_original: f.observacao_original,
          anotacao_pendencia: f.anotacao_pendencia,
        }],
        contexto_cluster: contextoCluster,
      },
    });
    if (error) throw error;
    if (!Array.isArray(data) || data.length === 0) throw new Error('Resposta vazia da IA.');

    const sugestao = data[0];

    const atualizacao = {
      gemini_sugestao_base_legal: sugestao.base_legal_sugerida ?? null,
      gemini_sugestao_documentos: mesclarSugestoesDocumentos(
        filtrarSugestoesDocumentosValidas(
          sugestao.documentos_sugeridos,
          f.documentos_exigidos_atual,
          f.documentos_elegiveis_atual
        ),
        f.gemini_sugestao_documentos
      ),
      gemini_score: sugestao.score ?? null,
      gemini_justificativa: sugestao.justificativa ?? null,
      gemini_fontes: sugestao.fontes ?? [],
      gemini_alertas: sugestao.alertas ?? [],
      gemini_analisado_em: new Date().toISOString(),
      status: 'sugerido_ia',
    };

    const { error: errUpdate } = await supabase
      .from('qualificacao_reanalise_juridica')
      .update(atualizacao)
      .eq('familia_codigo', f.familia_codigo);
    if (errUpdate) throw errUpdate;

    Object.assign(familiaAbertaAtual, atualizacao);
    await registrarHistorico(f.familia_codigo, 'sugestao_ia', { sugestao }, );
    sincronizarItemFilaLocal(f.familia_codigo, {
      status: 'sugerido_ia',
      gemini_score: atualizacao.gemini_score,
      gemini_analisado_em: atualizacao.gemini_analisado_em,
    });

    if (typeof showToast === 'function') showToast('Sugestão da IA recebida.');
    renderizarDetalheReanalise();
  } catch (err) {
    console.error(err);
    if (typeof showError === 'function') showError('Erro na IA', err.message || 'Falha ao consultar a IA.');
  } finally {
    btn.disabled = false;
    btn.innerHTML = textoOriginal;
  }
};

window.validarReanalise = async () => {
  const f = familiaAbertaAtual;
  if (!f) return;

  const decisaoBaseLegal = document.getElementById('input-decisao-base-legal').value.trim();
  const decisaoObservacao = document.getElementById('input-decisao-observacao').value.trim();
  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';

  if (!decisaoBaseLegal) {
    if (typeof showError === 'function') showError('Atenção', 'Preencha a base legal da decisão antes de validar.');
    return;
  }

  try {
    // Decisão de arquitetura: qualificacao_reanalise_juridica fica ligada a
    // qualificacao_tecnica só por familia_codigo (FK) — não propaga/copia
    // nada pra lá. Quem precisar das duas informações junta as duas tabelas
    // na consulta, em vez de duplicar dado.
    const atualizacao = {
      decisao_base_legal: decisaoBaseLegal,
      decisao_observacao: decisaoObservacao || null,
      status: 'validado',
      validado_por: usuario,
      validado_em: new Date().toISOString(),
      // Promove escopo se uma família secundária ganhou exigência adicional na reanálise
      ...(f.escopo === 'secundario' && decisaoBaseLegal !== f.base_legal_atual
        ? { escopo: 'prioritario' }
        : {}),
    };

    const { error } = await supabase
      .from('qualificacao_reanalise_juridica')
      .update(atualizacao)
      .eq('familia_codigo', f.familia_codigo);
    if (error) throw error;

    await registrarHistorico(f.familia_codigo, 'validacao', { ...atualizacao });
    if (atualizacao.escopo === 'prioritario' && f.escopo === 'secundario') {
      await registrarHistorico(f.familia_codigo, 'promocao_escopo', { de: 'secundario', para: 'prioritario' });
    }

    // Pega a posição desta família na lista filtrada ANTES de sincronizar —
    // depois de marcar como 'validado' ela pode sair do filtro atual (ex.:
    // filtro de status = "sugerido_ia"), então "próxima" é quem já estava
    // logo depois dela na lista que o analista estava vendo.
    const listaAntes = filaFiltradaAtual;
    const idxAtual = listaAntes.findIndex((i) => i.familia_codigo === f.familia_codigo);
    const proxima = idxAtual >= 0 ? listaAntes[idxAtual + 1] : null;

    sincronizarItemFilaLocal(f.familia_codigo, {
      status: 'validado',
      tem_decisao_final: true,
      ...(atualizacao.escopo ? { escopo: atualizacao.escopo } : {}),
    });

    if (typeof showToast === 'function') showToast('Reanálise validada com sucesso.');

    // Pedido: economizar clique e tempo de carregamento — em vez de fechar e
    // voltar pra lista (que antes disparava um refetch completo da fila),
    // já abre direto o modal da próxima família do filtro atual. Só volta
    // pra lista quando acabam as famílias desse filtro.
    if (proxima) {
      await abrirDetalheReanalise(proxima.familia_codigo);
    } else {
      fecharDetalheReanalise();
      if (typeof showToast === 'function') showToast('Essa era a última família deste filtro.');
    }
  } catch (err) {
    console.error(err);
    if (typeof showError === 'function') showError('Erro', 'Falha ao validar a reanálise.');
  }
};

// ----------------------------------------------------------------------------
// Badge de pendentes no botão do header (chamado também por applyFamilyRoleRestrictions
// indiretamente; opcional — chame onde o app já chama carregarContadorSugestoes())
// ----------------------------------------------------------------------------
window.carregarContadorReanalisePendentes = async () => {
  const badge = document.getElementById('badge-reanalise-pendentes');
  if (!badge) return;

  const { count, error } = await supabase
    .from('qualificacao_reanalise_juridica')
    .select('*', { count: 'exact', head: true })
    .eq('escopo', 'prioritario')
    .in('status', ['pendente', 'aguardando_terceiro']);

  if (error || !count) {
    badge.classList.add('hidden');
    return;
  }
  badge.textContent = count;
  badge.classList.remove('hidden');
};

// Devolve um Set com os familia_codigo que têm pelo menos uma alteração de
// documento (migration 006) ainda sem ciência — usado pela tela principal
// (script.js) pra pintar o badge no card e pro filtro "pendente de ciência".
// Uma chamada só, reaproveitada tanto no carregamento quanto a cada refresh
// do filtro (ver patch pendente em ui/patch_pendencias_documento.md).
window.buscarFamiliasComAlteracaoPendente = async () => {
  const { data, error } = await supabase
    .from('vw_documento_alteracoes_pendentes')
    .select('familia_codigo');
  if (error) {
    console.warn('Falha ao buscar famílias com alteração pendente:', error);
    return new Set();
  }
  return new Set((data || []).map((r) => r.familia_codigo));
};

// ----------------------------------------------------------------------------
// Integração com o modal PRINCIPAL de família (abrirModalDetalheFamilia em
// script.js) — leitura, sem edição. Ver patch_modal_detalhe_familia.md.
// ----------------------------------------------------------------------------
window.carregarFundamentacaoLegalModal = async (familiaCodigo) => {
  const container = document.getElementById('fundamentacao-legal-modal');
  if (!container) return; // modal fechado antes da resposta chegar

  const { data, error } = await supabase
    .from('qualificacao_reanalise_juridica')
    .select('status, escopo, cluster, base_legal_atual, decisao_base_legal, validado_por, validado_em')
    .eq('familia_codigo', familiaCodigo)
    .single();

  // Se ainda não existe reanálise pra essa família (ex.: cadastrada depois do
  // último seed), não quebra o modal — só avisa.
  if (error || !data) {
    container.innerHTML = `<span class="not-italic text-slate-400">Reanálise jurídica ainda não cadastrada para esta família.</span>`;
    return;
  }

  const foiValidado = data.status === 'validado' && data.decisao_base_legal;
  const texto = foiValidado ? data.decisao_base_legal : data.base_legal_atual;

  const corStatus = {
    pendente: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400',
    em_analise: 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-400',
    aguardando_terceiro: 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-400',
    sugerido_ia: 'bg-violet-100 text-violet-700 dark:bg-violet-900/40 dark:text-violet-400',
    validado: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400',
  }[data.status] || 'bg-slate-100 text-slate-600';

  // Alterações de documento (incluir/excluir) já aplicadas na família a
  // partir de uma sugestão da IA, e ainda sem ciência de um gestor CGCF —
  // ver migration 006_documento_alteracoes.sql. Mostrado aqui porque este é
  // o modal que qualquer usuário já abre na tela principal ao clicar na
  // família (abrirModalDetalheFamilia), sem precisar entrar no módulo de
  // Reanálise Jurídica pra perceber a mudança.
  const { data: pendentes, error: errPendentes } = await supabase
    .from('qualificacao_documento_alteracoes')
    .select('*')
    .eq('familia_codigo', familiaCodigo)
    .is('ciente_em', null)
    .order('aplicado_em', { ascending: false });

  const blocoAlteracoesPendentes = !errPendentes && pendentes && pendentes.length > 0
    ? `<div class="mt-3 p-3 bg-amber-50 dark:bg-amber-900/10 rounded-lg border border-amber-200 dark:border-amber-900/30 space-y-2">
        <div class="flex items-center justify-between gap-2">
          <p class="text-[10px] font-bold text-amber-700 dark:text-amber-400 uppercase">⚠️ ${pendentes.length} alteração(ões) de documento aguardando ciência</p>
          <button type="button" onclick="darCienciaTodasAlteracoesFamilia('${familiaCodigo}')"
            class="admin-only text-[10px] font-bold text-amber-700 dark:text-amber-400 hover:underline shrink-0">
            Dar ciência em todas
          </button>
        </div>
        ${pendentes.map((p) => `
          <div class="text-xs bg-white dark:bg-slate-850 p-2 rounded border dark:border-slate-700 space-y-1">
            <p>
              <span class="font-black uppercase ${p.acao === 'excluir' ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}">${p.acao === 'excluir' ? 'Removido' : 'Incluído'}</span>
              <span class="font-bold text-slate-700 dark:text-slate-200"> ${p.documento}</span>
              <span class="text-slate-400 dark:text-slate-500"> (${p.tipo_lista === 'elegivel' ? 'elegível' : 'exigido'})</span>
            </p>
            ${p.motivo ? `<p class="text-slate-600 dark:text-slate-400">${p.motivo}</p>` : ''}
            <p class="text-[9px] text-slate-400">Por ${p.aplicado_por ?? '—'} em ${new Date(p.aplicado_em).toLocaleDateString('pt-BR')}</p>
            <button type="button" onclick="darCienciaAlteracao('${p.id}', '${familiaCodigo}')"
              class="admin-only text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">
              Dar ciência
            </button>
          </div>
        `).join('')}
      </div>`
    : '';

  container.classList.remove('italic', 'text-slate-400');
  container.innerHTML = `
    <div class="flex flex-wrap items-center gap-2 mb-2">
      <span class="px-2 py-0.5 rounded text-[9px] font-bold uppercase ${corStatus}">${foiValidado ? 'Validado' : data.status.replace('_', ' ')}</span>
      ${data.cluster ? `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-600 dark:bg-slate-900 dark:text-slate-400">${data.cluster}</span>` : ''}
      ${data.escopo === 'secundario' ? `<span class="px-2 py-0.5 rounded text-[9px] font-bold bg-slate-100 text-slate-500 dark:bg-slate-900 dark:text-slate-500">Hoje só ATC</span>` : ''}
    </div>
    <p>${texto || '<span class="italic text-slate-400">Sem base legal registrada ainda.</span>'}</p>
    ${foiValidado ? `<p class="text-[9px] text-slate-400 mt-2">Validado por ${data.validado_por} em ${new Date(data.validado_em).toLocaleDateString('pt-BR')}</p>` : ''}
    ${blocoAlteracoesPendentes}
  `;
};

// Dar ciência numa alteração de documento específica — restrito a
// admin/gestor CGCF responsável (mesma policy de escrita da migration 006).
// Recarrega o próprio bloco pra sumir o item assim que confirmado.
window.darCienciaAlteracao = async (id, familiaCodigo) => {
  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
  const { error } = await supabase
    .from('qualificacao_documento_alteracoes')
    .update({ ciente_por: usuario, ciente_em: new Date().toISOString() })
    .eq('id', id);

  if (error) {
    if (typeof showError === 'function') showError('Erro', 'Falha ao dar ciência: ' + error.message);
    return;
  }
  if (typeof showToast === 'function') showToast('Ciência registrada.');
  await window.carregarFundamentacaoLegalModal(familiaCodigo);
};

window.darCienciaTodasAlteracoesFamilia = async (familiaCodigo) => {
  const usuario = sessionStorage.getItem('cockpit_user_realname') || 'Usuário do Sistema';
  const { error } = await supabase
    .from('qualificacao_documento_alteracoes')
    .update({ ciente_por: usuario, ciente_em: new Date().toISOString() })
    .eq('familia_codigo', familiaCodigo)
    .is('ciente_em', null);

  if (error) {
    if (typeof showError === 'function') showError('Erro', 'Falha ao dar ciência: ' + error.message);
    return;
  }
  if (typeof showToast === 'function') showToast('Ciência registrada em todas as alterações desta família.');
  await window.carregarFundamentacaoLegalModal(familiaCodigo);
};

// Abre o modal de detalhe da reanálise direto por código de família, sem
// precisar passar pela tela de fila primeiro (usado pelo link "Ver na
// Reanálise Jurídica" dentro do modal principal de família).
window.abrirDetalheReanaliseDireto = async (familiaCodigo) => {
  await carregarDicionarioClusters();
  await abrirDetalheReanalise(familiaCodigo);
};
