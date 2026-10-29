document.addEventListener("DOMContentLoaded", () => {
  // 1. Captura a instância global do Supabase (ISSO RESOLVE O ERRO DE UNDEFINED)
  const supabase = window.supabaseClient;

  // =========================================================
  // MÓDULO SR. COCKPIT (CHATBOT UI & ANIMAÇÕES)
  // =========================================================
  const chatWindow = document.getElementById('cockpitChatWindow');
  const triggerBtn = document.getElementById('srCockpitTrigger');
  const mainIcon = document.getElementById('srCockpitMainIcon');
  const statusIcon = document.getElementById('srCockpitStatusIcon');
  const chatForm = document.getElementById('cockpitChatForm');
  const chatMessages = document.getElementById('cockpitChatMessages');

  // Configurações da conversa
  const STORAGE_KEY = 'cockpit_chat_history';
  const MAX_HISTORICO_ENVIADO = 6;    // últimas mensagens enviadas à IA (3 perguntas + 3 respostas)
  const MAX_HISTORICO_SALVO = 20;     // últimas mensagens guardadas na sessão
  const MAX_LINHAS_PREVIA = 100;      // linhas exibidas na tabela (o CSV leva todas)
  const ROTULOS_CONSULTA = {
    consultar_familia: 'Família',
    pesquisar_familias_catalogo: 'Busca de famílias',
    listar_itens_familia: 'Itens da família',
    pesquisar_itens_catalogo: 'Busca de itens',
    buscar_familias_por_cnae: 'Busca por CNAE',
    listar_familias_por_filtro: 'Filtro de famílias',
    opcoes_itens: 'Opções de itens',
    sortear_itens: 'Novas opções de itens',
    escolha_itens: 'Itens marcados',
    familias_semelhantes: 'Famílias parecidas',
    listar_demandas: 'Demandas',
    consultar_demanda: 'Detalhe da demanda',
    resumo_demandas: 'Resumo de demandas',
    minhas_notificacoes_demandas: 'Notificações de demandas',
    listar_recorrencias_demandas: 'Demandas recorrentes',
    listar_contratos_a_vencer: 'Contratos a vencer',
    consultar_contrato: 'Detalhe do contrato'
  };

  // Expressões do Sr. Cockpit (guia de personagem). Se o arquivo de uma expressão ainda não existir,
    const IMG_BASE = 'assets/img/chatbot/';
  const EXPRESSOES = {
    idle: 'sr-cockpit-icone.png',
    thinking: 'sr-cockpit-analisando.png',
    analisando: 'sr-cockpit-analisando.png',
    success: 'sr-cockpit-sucesso.png',
    sucesso: 'sr-cockpit-sucesso.png',
    alert: 'sr-cockpit-alerta.png',
    alerta: 'sr-cockpit-alerta.png',
    alegria: 'sr-cockpit-alegria.png',
    pensativo: 'sr-cockpit-pensativo.png',
    ironia: 'sr-cockpit-ironia.png',
    cafe: 'sr-cockpit-cafe.png'
  };
  const EXPRESSAO_RESERVA = { alegria: 'idle', pensativo: 'analisando', ironia: 'sucesso', cafe: 'sucesso' };

  function definirImagem(img, chave) {
    const nome = EXPRESSOES[chave] || EXPRESSOES.idle;
    img.onerror = () => {
      img.onerror = null;
      img.src = IMG_BASE + EXPRESSOES[EXPRESSAO_RESERVA[chave] || 'idle'];
    };
    img.src = IMG_BASE + nome;
  }

  let isSending = false;
  let historico = carregarHistorico();

  // ---------------------------------------------------------
  // Histórico da conversa (sessionStorage: some ao fechar a aba)
  // ---------------------------------------------------------
  function carregarHistorico() {
    try {
      const salvo = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '[]');
      if (!Array.isArray(salvo)) return [];
      return salvo.filter(m => m && (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string');
    } catch (_e) {
      return [];
    }
  }

  function salvarHistorico() {
    try {
      historico = historico.slice(-MAX_HISTORICO_SALVO);
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(historico));
    } catch (_e) { /* storage indisponível: segue sem persistir */ }
  }

  // ---------------------------------------------------------
  // Função para abrir/fechar a janela
  // ---------------------------------------------------------
  window.toggleCockpitChat = function() {
    const isHidden = chatWindow.classList.contains('hidden');
    if (isHidden) {
      // Abrir Janela
      chatWindow.classList.remove('hidden');
      chatWindow.classList.add('flex');
      // Animação de entrada
      setTimeout(() => {
        chatWindow.classList.remove('opacity-0', 'scale-95');
        chatWindow.classList.add('opacity-100', 'scale-100');
      }, 10);
      // Altera o botão principal para parecer inativo/ocupado
      mainIcon.classList.add('opacity-50', 'scale-90');
      // Foca no input
      document.getElementById('cockpitInput').focus();
      // Limpa a badge se existir
      const badge = document.getElementById('srCockpitBadge');
      if (badge) badge.classList.remove('scale-100');
      chatMessages.scrollTop = chatMessages.scrollHeight;
    } else {
      // Fechar Janela
      chatWindow.classList.remove('opacity-100', 'scale-100');
      chatWindow.classList.add('opacity-0', 'scale-95');
      // Restaura o ícone principal
      mainIcon.classList.remove('opacity-50', 'scale-90');
      setTimeout(() => {
        chatWindow.classList.add('hidden');
        chatWindow.classList.remove('flex');
      }, 300);
    }
  };

  // Lógica de simulação (Troca de expressões do boneco)
  function setCockpitState(state) {
    if (statusIcon && EXPRESSOES[state]) {
      statusIcon.classList.add('scale-75', 'opacity-50');
      setTimeout(() => {
        definirImagem(statusIcon, state);
        statusIcon.classList.remove('scale-75', 'opacity-50');
        statusIcon.classList.add('scale-100', 'opacity-100');
      }, 150);
    }
  }

  // ---------------------------------------------------------
  // Construção das mensagens (DOM seguro: nada digitado pelo
  // usuário é interpretado como HTML)
  // ---------------------------------------------------------
  function scrollParaFim() {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }

  function marcar(el) {
    el.setAttribute('data-cockpit-msg', '1'); // permite limpar tudo em "Nova conversa"
    return el;
  }

  function criarMensagemUsuario(texto) {
    const wrapper = marcar(document.createElement('div'));
    wrapper.className = 'flex items-start justify-end gap-2 mb-3';
    const bolha = document.createElement('div');
    bolha.className = 'bg-blue-600 text-white p-3 rounded-2xl rounded-tr-sm shadow-sm text-xs max-w-[85%] whitespace-pre-wrap break-words';
    bolha.textContent = texto;
    wrapper.appendChild(bolha);
    return wrapper;
  }

  function criarIndicadorDigitando() {
    const wrapper = marcar(document.createElement('div'));
    wrapper.className = 'flex items-start gap-2 mb-3';
    const img = document.createElement('img');
    img.src = IMG_BASE + EXPRESSOES.analisando;
    img.className = 'w-8 h-8 mt-1 drop-shadow-sm';
    const bolha = document.createElement('div');
    bolha.className = 'bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm shadow-sm text-xs text-slate-500 italic';
    bolha.textContent = 'Analisando dados...';
    wrapper.append(img, bolha);
    return wrapper;
  }

  // Converte Markdown em HTML sanitizado. Retorna null se não for possível sanitizar.
  function renderMarkdownSeguro(md) {
    try {
      if (typeof marked === 'undefined' || typeof DOMPurify === 'undefined') return null;
      return DOMPurify.sanitize(marked.parse(md));
    } catch (_e) {
      return null;
    }
  }

  function formatarConsultas(consultas) {
    if (!Array.isArray(consultas) || consultas.length === 0) return '';
    const vistos = new Set();
    const partes = [];
    consultas.forEach(c => {
      const rotulo = ROTULOS_CONSULTA[c.ferramenta] || 'Consulta';
      const texto = c.parametro ? `${rotulo} (${c.parametro})` : rotulo;
      if (!vistos.has(texto)) { vistos.add(texto); partes.push(texto); }
    });
    return 'Consultado: ' + partes.join('; ');
  }

  // ---------------------------------------------------------
  // Tabelas e CSV montados pelo sistema (sem IA)
  // ---------------------------------------------------------
  function textoCelula(valor) {
    if (valor === null || valor === undefined) return '';
    if (Array.isArray(valor)) return valor.join(' | ');
    return String(valor);
  }

  // Escapa uma célula do CSV (aspas, ; e quebras de linha) e neutraliza fórmulas do Excel (=, +, -, @)
  function escaparCelulaCsv(valor) {
    let s = textoCelula(valor);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    if (/[";\r\n]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }

  // CSV com separador ";" e BOM UTF-8: abre direto no Excel em português, com acentos corretos
  function gerarCsv(anexo) {
    const colunas = Array.isArray(anexo.colunas) ? anexo.colunas : [];
    const linhas = Array.isArray(anexo.linhas) ? anexo.linhas : [];
    const cabecalho = colunas.map(c => escaparCelulaCsv(c.rotulo)).join(';');
    const corpo = linhas.map(l => colunas.map(c => escaparCelulaCsv(l[c.chave])).join(';'));
    return '\ufeff' + [cabecalho, ...corpo].join('\r\n');
  }

  function baixarCsv(anexo) {
    const blob = new Blob([gerarCsv(anexo)], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = String(anexo.arquivo || 'cockpit.csv').replace(/[^\w.\-]+/g, '_');
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function criarAnexo(anexo) {
    const colunas = Array.isArray(anexo.colunas) ? anexo.colunas : [];
    const linhas = Array.isArray(anexo.linhas) ? anexo.linhas : [];

    const box = document.createElement('div');
    box.className = 'mt-3 border border-slate-200 dark:border-slate-600 rounded-lg overflow-hidden';

    // Cabeçalho: título + botão de CSV
    const topo = document.createElement('div');
    topo.className = 'flex items-center justify-between gap-2 px-2 py-1.5 bg-slate-50 dark:bg-slate-800 text-[10px]';
    const titulo = document.createElement('span');
    titulo.className = 'font-semibold text-slate-600 dark:text-slate-300 truncate';
    titulo.textContent = anexo.titulo || 'Resultado';
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shrink-0 px-2 py-1 rounded bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-medium transition-colors';
    btn.textContent = 'Baixar CSV';
    btn.addEventListener('click', () => baixarCsv(anexo));
    topo.append(titulo, btn);
    box.appendChild(topo);

    // Tabela (rolável)
    const rolagem = document.createElement('div');
    rolagem.className = 'max-h-56 overflow-auto';
    const tabela = document.createElement('table');
    tabela.className = 'min-w-full text-[10px] text-left';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    colunas.forEach(c => {
      const th = document.createElement('th');
      th.className = 'sticky top-0 bg-slate-100 dark:bg-slate-700 px-2 py-1 font-semibold whitespace-nowrap';
      th.textContent = c.rotulo;
      trh.appendChild(th);
    });
    thead.appendChild(trh);
    const tbody = document.createElement('tbody');
    linhas.slice(0, MAX_LINHAS_PREVIA).forEach(l => {
      const tr = document.createElement('tr');
      colunas.forEach(c => {
        const td = document.createElement('td');
        td.className = 'px-2 py-1 border-t border-slate-100 dark:border-slate-600 align-top';
        td.textContent = textoCelula(l[c.chave]);
        tr.appendChild(td);
      });
      tbody.appendChild(tr);
    });
    tabela.append(thead, tbody);
    rolagem.appendChild(tabela);
    box.appendChild(rolagem);

    // Nota de rodapé quando a tabela mostra menos do que existe
    const total = Number(anexo.total) || linhas.length;
    let nota = '';
    if (linhas.length > MAX_LINHAS_PREVIA) {
      nota = `Prévia das ${MAX_LINHAS_PREVIA} primeiras linhas de ${total}. O CSV traz ${linhas.length}.`;
    } else if (anexo.truncado || total > linhas.length) {
      nota = `Exibindo ${linhas.length} de ${total}. Refine a busca para ver o restante.`;
    }
    if (nota) {
      const rodape = document.createElement('div');
      rodape.className = 'px-2 py-1 text-[10px] text-slate-400';
      rodape.textContent = nota;
      box.appendChild(rodape);
    }
    return box;
  }

  // ---------------------------------------------------------
  // Caixa de escolha ("minha empresa vende X, em qual família entra?")
  // O usuário marca os itens que mais se parecem com o que fornece, ou pede outras opções.
  // ---------------------------------------------------------
  function criarCartaoEscolha(escolha) {
    const opcoes = Array.isArray(escolha.opcoes) ? escolha.opcoes : [];
    const maxSorteios = Number(escolha.maxSorteios) || 0;
    const rodada = Number(escolha.rodada) || 0;
    const sorteiosRestantes = Math.max(0, maxSorteios - rodada);
    const temMais = (Number(escolha.restantes) || 0) > 0;

    const box = document.createElement('div');
    box.className = 'mt-3 border border-blue-200 dark:border-slate-500 rounded-lg overflow-hidden';

    const topo = document.createElement('div');
    topo.className = 'px-2 py-1.5 bg-blue-50 dark:bg-slate-800 text-[10px] font-semibold text-blue-700 dark:text-blue-300';
    topo.textContent = 'Qual destes itens se parece com o que sua empresa fornece? (marque um ou mais)';
    box.appendChild(topo);

    const lista = document.createElement('div');
    lista.className = 'divide-y divide-slate-100 dark:divide-slate-600';
    const caixas = [];

    opcoes.forEach(op => {
      const rotulo = document.createElement('label');
      rotulo.className = 'flex items-start gap-2 px-2 py-2 cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors';
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.value = String(op.item_codigo);
      cb.className = 'mt-0.5 shrink-0';
      const txt = document.createElement('div');
      txt.className = 'min-w-0';
      const linhaItem = document.createElement('div');
      linhaItem.className = 'text-[11px] leading-snug break-words';
      linhaItem.textContent = op.texto || '';
      const linhaFamilia = document.createElement('div');
      linhaFamilia.className = 'text-[10px] text-slate-400';
      linhaFamilia.textContent = `Família ${op.familia_codigo || ''}${op.familia_descricao ? ' — ' + op.familia_descricao : ''}`;
      txt.append(linhaItem, linhaFamilia);
      rotulo.append(cb, txt);
      lista.appendChild(rotulo);
      cb.addEventListener('change', atualizar);
      caixas.push(cb);
    });
    box.appendChild(lista);

    const acoes = document.createElement('div');
    acoes.className = 'flex flex-wrap items-center gap-2 px-2 py-2 bg-slate-50 dark:bg-slate-800';
    const btnConfirmar = document.createElement('button');
    btnConfirmar.type = 'button';
    btnConfirmar.className = 'px-3 py-1.5 rounded bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    btnConfirmar.textContent = 'Confirmar seleção';
    btnConfirmar.disabled = true;
    const btnNenhum = document.createElement('button');
    btnNenhum.type = 'button';
    btnNenhum.className = 'px-3 py-1.5 rounded border border-slate-300 dark:border-slate-500 text-slate-600 dark:text-slate-200 hover:bg-white dark:hover:bg-slate-700 text-[11px] transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
    btnNenhum.textContent = (sorteiosRestantes > 0 && temMais)
      ? `Nenhum desses — ver outras opções (${sorteiosRestantes} ${sorteiosRestantes === 1 ? 'restante' : 'restantes'})`
      : 'Nenhum desses';
    acoes.append(btnConfirmar, btnNenhum);
    box.appendChild(acoes);

    function atualizar() {
      btnConfirmar.disabled = !caixas.some(c => c.checked);
    }

    function travar(travado) {
      caixas.forEach(c => { c.disabled = travado; });
      btnNenhum.disabled = travado;
      if (travado) btnConfirmar.disabled = true; else atualizar();
      if (travado) box.classList.add('opacity-60'); else box.classList.remove('opacity-60');
    }

    function estado(extra) {
      return Object.assign({
        termo: escolha.termo,
        natureza: escolha.natureza,
        rodada: escolha.rodada,
        origem: escolha.origem,
        mostrados: escolha.mostrados
      }, extra || {});
    }

    btnConfirmar.addEventListener('click', () => {
      if (isSending) return;
      const ids = caixas.filter(c => c.checked).map(c => c.value);
      if (ids.length === 0) return;
      travar(true);
      const rotulo = `Selecionei ${ids.length} ${ids.length === 1 ? 'opção' : 'opções'}`;
      enviar({
        textoUsuario: rotulo,
        corpo: { acao: 'escolher_itens', query: escolha.origem || escolha.termo, escolha: estado({ selecionados: ids }) },
        semHistorico: true,
        perguntaHistorico: escolha.origem
      }).then(ok => { if (!ok) travar(false); });
    });

    btnNenhum.addEventListener('click', () => {
      if (isSending) return;
      travar(true);
      enviar({
        textoUsuario: 'Nenhum desses',
        corpo: { acao: 'sortear_itens', query: escolha.origem || escolha.termo, escolha: estado() },
        semHistorico: true,
        perguntaHistorico: escolha.origem
      }).then(ok => { if (!ok) travar(false); });
    });

    return box;
  }

  // Botões de sugestão (ex.: "Ver família 42.20", "Perguntar ao Sr. Cockpit (IA)")
  function criarSugestoes(sugestoes) {
    const validas = (Array.isArray(sugestoes) ? sugestoes : [])
      .filter(s => s && typeof s.rotulo === 'string' && typeof s.pergunta === 'string' && s.rotulo && s.pergunta)
      .slice(0, 5);
    if (validas.length === 0) return null;

    const linha = document.createElement('div');
    linha.className = 'mt-3 flex flex-wrap gap-1.5';
    const botoes = [];
    function travar(travado) { botoes.forEach(b => { b.disabled = travado; }); }

    validas.forEach(s => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'px-2.5 py-1 rounded-full border border-blue-300 dark:border-slate-500 text-blue-700 dark:text-blue-300 text-[10px] hover:bg-blue-50 dark:hover:bg-slate-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
      b.textContent = s.rotulo;
      b.addEventListener('click', () => {
        if (isSending) return;
        travar(true);
        const corpo = s.forcarIa ? { acao: 'forcar_ia', query: s.pergunta } : { query: s.pergunta };
        enviar({ textoUsuario: s.forcarIa ? s.rotulo : s.pergunta, corpo, semHistorico: false })
          .then(ok => { if (!ok) travar(false); });
      });
      botoes.push(b);
      linha.appendChild(b);
    });
    return linha;
  }

  function criarMensagemBot(markdown, consultas, anexos, humor, extras) {
    const wrapper = marcar(document.createElement('div'));
    wrapper.className = 'flex items-start gap-2 mb-3';

    const img = document.createElement('img');
    definirImagem(img, humor || 'sucesso');
    img.className = 'w-8 h-8 mt-1 drop-shadow-sm';

    const bolha = document.createElement('div');
    bolha.className = 'bg-white dark:bg-slate-700 p-3 rounded-2xl rounded-tl-sm shadow-sm text-xs text-slate-700 dark:text-slate-200 w-full overflow-x-auto';

    // Resposta (Markdown -> HTML sanitizado, com classe cockpit-markdown)
    const conteudo = document.createElement('div');
    conteudo.className = 'cockpit-markdown';
    const html = renderMarkdownSeguro(markdown);
    if (html !== null) {
      conteudo.innerHTML = html;
      conteudo.querySelectorAll('a').forEach(a => {
        a.target = '_blank';
        a.rel = 'noopener noreferrer';
      });
    } else {
      conteudo.classList.add('whitespace-pre-wrap');
      conteudo.textContent = markdown;
    }
    bolha.appendChild(conteudo);

    // Caixa de escolha de itens (quando o sistema precisa entender melhor o que a empresa fornece)
    if (extras && extras.escolha && Array.isArray(extras.escolha.opcoes) && extras.escolha.opcoes.length > 0) {
      bolha.appendChild(criarCartaoEscolha(extras.escolha));
    }

    // Tabelas/CSV montados pelo sistema com a lista completa
    if (Array.isArray(anexos)) {
      anexos.forEach(a => { if (a && Array.isArray(a.linhas)) bolha.appendChild(criarAnexo(a)); });
    }

    // Botões de sugestão
    if (extras && extras.sugestoes) {
      const sug = criarSugestoes(extras.sugestoes);
      if (sug) bolha.appendChild(sug);
    }

    // Rodapé: o que foi consultado + botão copiar (as mensagens de contexto não têm rodapé)
    if (!(extras && extras.semRodape)) {
    const rodape = document.createElement('div');
    rodape.className = 'mt-2 pt-2 border-t border-slate-100 dark:border-slate-600 flex items-center justify-between gap-2 text-[10px] text-slate-400';
    const info = document.createElement('span');
    info.className = 'truncate';
    info.textContent = formatarConsultas(consultas);
    if (info.textContent) info.title = info.textContent;
    const btnCopiar = document.createElement('button');
    btnCopiar.type = 'button';
    btnCopiar.className = 'shrink-0 hover:text-blue-500 transition-colors';
    btnCopiar.textContent = 'Copiar';
    btnCopiar.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(markdown);
        btnCopiar.textContent = 'Copiado!';
      } catch (_e) {
        btnCopiar.textContent = 'Não foi possível copiar';
      }
      setTimeout(() => { btnCopiar.textContent = 'Copiar'; }, 1500);
    });
    rodape.append(info, btnCopiar);
    bolha.appendChild(rodape);
    }

    wrapper.append(img, bolha);
    return wrapper;
  }

  function criarMensagemErro(mensagem) {
    const wrapper = marcar(document.createElement('div'));
    wrapper.className = 'flex items-start gap-2 mb-3';
    const img = document.createElement('img');
    definirImagem(img, 'alerta');
    img.className = 'w-8 h-8 mt-1 drop-shadow-sm';
    const bolha = document.createElement('div');
    bolha.className = 'bg-red-50 dark:bg-red-900/30 p-3 rounded-2xl rounded-tl-sm shadow-sm border border-red-200 text-xs text-red-700 dark:text-red-300';
    bolha.textContent = `Não consegui concluir a consulta agora. ${mensagem}`;
    wrapper.append(img, bolha);
    return wrapper;
  }

  // ---------------------------------------------------------
  // Sugestões rápidas e estado de envio
  // ---------------------------------------------------------
  function setSugestoesVisiveis(visivel) {
    const box = document.getElementById('cockpitSuggestions');
    if (box) box.classList.toggle('hidden', !visivel);
  }


  // ---------------------------------------------------------
  // CONTEXTO POR MÓDULO: boas-vindas e sugestões que mudam conforme a tela
  //
  //   chaves  -> trechos do hash da URL (#...) que identificam o módulo (minúsculas, SEM acento).
  //              Confira com location.hash no console, em cada módulo, e ajuste aqui se precisar.
  //   pool    -> perguntas possíveis; a cada abertura são sorteadas algumas (sem repetir as últimas
  //              mostradas nem as que o usuário já fez nesta conversa).
  // Para um novo módulo (ex.: Contratos), basta acrescentar um bloco igual aos abaixo.
  // ---------------------------------------------------------
  const QTD_SUGESTOES = 4;
  const AVISAR_COM_BADGE = true;   // balão vermelho no botão flutuante quando o usuário muda de módulo
  const CHAVE_RECENTES = 'cockpit_sugestoes_recentes';

  const MODULOS_CONTEXTO = {
    demandas: {
      app: 'demandas',          // nome do módulo em profiles.allowed_apps (sem o #)
      titulo: 'Gestão de Demandas',
      chaves: ['demanda'],
      boasVindas: 'Olá! Você está em Gestão de Demandas. Posso mostrar o que está atrasado, o que vence hoje ou nesta semana, resumir os números, detalhar uma demanda pelo ID (REQ-…) e ver as suas notificações. Eu só consulto: criar e alterar demandas é na própria tela.',
      aviso: 'Vi que você foi para **Gestão de Demandas**. Posso mostrar atrasadas, prazos da semana, resumo e notificações.',
      pool: [
        { rotulo: 'Minhas demandas atrasadas', pergunta: 'Quais são as minhas demandas atrasadas?' },
        { rotulo: 'Resumo das demandas', pergunta: 'Como estão as demandas?' },
        { rotulo: 'Vencem esta semana', pergunta: 'O que vence esta semana?' },
        { rotulo: 'Vencem hoje', pergunta: 'O que vence hoje?' },
        { rotulo: 'Demandas urgentes', pergunta: 'Demandas urgentes' },
        { rotulo: 'Sem responsável', pergunta: 'Demandas sem responsável' },
        { rotulo: 'Minhas notificações', pergunta: 'Tenho notificações?' },
        { rotulo: 'Em andamento', pergunta: 'Demandas em andamento' },
        { rotulo: 'Demandas recorrentes', pergunta: 'Quais as demandas recorrentes?' },
        { rotulo: 'Minhas de prioridade alta', pergunta: 'Minhas demandas de prioridade alta' },
        { rotulo: 'O que priorizar nas atrasadas?', pergunta: 'Analise as demandas atrasadas e sugira o que priorizar' }
      ]
    },
    contratos: {
      app: 'contratos',
      titulo: 'Contratos Públicos',
      chaves: ['contrat'],
      boasVindas: 'Olá! Você está em Contratos Públicos. Posso mostrar quais contratos vencem nos próximos dias, quais já venceram e detalhar um contrato pelo número. Eu só consulto: criar e alterar contratos é na própria tela.',
      aviso: 'Você agora está em **Contratos Públicos**. Posso mostrar vencimentos, contratos já vencidos e detalhar um contrato pelo número.',
      pool: [
        { rotulo: 'Vencem em 30 dias', pergunta: 'Contratos vencendo em 30 dias' },
        { rotulo: 'A vencer em 90 dias', pergunta: 'Contratos a vencer em 90 dias' },
        { rotulo: 'Vencem esta semana', pergunta: 'Contratos vencendo esta semana' },
        { rotulo: 'Já vencidos', pergunta: 'Contratos vencidos' },
        { rotulo: 'Vencem hoje', pergunta: 'Quais contratos vencem hoje?' },
        { rotulo: 'Vencem neste mês', pergunta: 'Quantos contratos vencem neste mês?' },
        { rotulo: 'Vencem em 60 dias', pergunta: 'Contratos vencendo em 60 dias' }
      ]
    },
    qualificacao: {
      app: 'qualificacao',
      titulo: 'Qualificação Técnica',
      chaves: ['qualific'],
      boasVindas: 'Olá! Você está em Qualificação Técnica. Posso consultar famílias, itens, documentos exigidos e CNAEs vinculados, e ajudar a descobrir em qual família uma atividade entra (ex.: "minha empresa vende ferramentas").',
      aviso: 'Você agora está em **Qualificação Técnica**. Posso consultar famílias, itens, documentos exigidos e CNAEs.',
      pool: [
        { rotulo: 'Documentos da família 04.37', pergunta: 'Qual a descrição e os documentos exigidos da família 04.37?' },
        { rotulo: 'Itens da família 04.37', pergunta: 'Quais itens fazem parte da família 04.37?' },
        { rotulo: 'Famílias de ar condicionado', pergunta: 'Quais famílias envolvem ar condicionado?' },
        { rotulo: 'Minha empresa vende ferramentas', pergunta: 'Minha empresa vende ferramentas, em qual família entra?' },
        { rotulo: 'Vendo carros, quais famílias?', pergunta: 'Vendo carros, quais as famílias?' },
        { rotulo: 'Famílias de limpeza', pergunta: 'Quais famílias envolvem limpeza?' },
        { rotulo: 'Famílias de informática', pergunta: 'Quais famílias envolvem informática?' }
      ]
    }
  };

  // Tela sem módulo reconhecido (início, outros módulos): apresentação geral + mistura dos conjuntos liberados
  const TEXTO_DEMANDAS_GERAL = 'as suas demandas (prazos, atrasos e notificações)';
  const TEXTO_QUALIF_GERAL = 'famílias, itens, CNAEs e documentos da Qualificação Técnica';
  const TEXTO_CONTRATOS_GERAL = 'os vencimentos de contratos';

  function boasVindasGeral() {
    const itens = [];
    if (moduloLiberado('demandas')) itens.push(TEXTO_DEMANDAS_GERAL);
    if (moduloLiberado('contratos')) itens.push(TEXTO_CONTRATOS_GERAL);
    if (moduloLiberado('qualificacao')) itens.push(TEXTO_QUALIF_GERAL);
    const abertura = 'Olá! Sou o Sr. Cockpit. Como posso ajudar com a gestão hoje?';
    if (itens.length === 0) return `${abertura} Posso tirar dúvidas sobre as regras do sistema. Os módulos que consulto (Demandas, Contratos e Qualificação Técnica) ainda não estão liberados no seu acesso.`;
    return `${abertura} Posso consultar ${itens.join(', ')} e tirar dúvidas sobre as regras do sistema.`;
  }

  // ---------------------------------------------------------
  // PERMISSÕES: só sugere e comenta módulos que o usuário pode abrir (profiles.allowed_apps).
  // Isto é só experiência: quem realmente barra o acesso aos dados é a Edge Function.
  // Se não conseguir ler a permissão, não esconde nada (appsPermitidos = null).
  // ---------------------------------------------------------
  let appsPermitidos = null;   // null = desconhecido; senão { admin: boolean, apps: string[] }

  const semHashMinusculo = v => normalizarTexto(v).trim().replace(/^#/, '');

  function moduloLiberado(chave) {
    if (!appsPermitidos) return true;
    if (appsPermitidos.admin) return true;
    const app = MODULOS_CONTEXTO[chave] && MODULOS_CONTEXTO[chave].app;
    return !app || appsPermitidos.apps.includes(app);
  }

  async function carregarPermissoes() {
    try {
      const { data: sessao } = await supabase.auth.getSession();
      const uid = sessao && sessao.session && sessao.session.user && sessao.session.user.id;
      if (!uid) return;
      const { data, error } = await supabase.from('profiles').select('role, allowed_apps').eq('id', uid).single();
      if (error || !data) return;
      appsPermitidos = {
        admin: semHashMinusculo(data.role) === 'admin',
        apps: Array.isArray(data.allowed_apps) ? data.allowed_apps.map(semHashMinusculo) : []
      };
    } catch (_e) { /* sem permissão lida: mantém tudo visível */ }
  }

  function normalizarTexto(t) {
    return String(t || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
  }

  function chaveModulo() {
    const hash = normalizarTexto(window.location.hash);
    for (const chave of Object.keys(MODULOS_CONTEXTO)) {
      if (MODULOS_CONTEXTO[chave].chaves.some(c => hash.includes(c))) return chave;
    }
    return '';
  }

  // Módulo da tela só vale para o contexto se o usuário tem acesso a ele
  function chaveModuloLiberado() {
    const chave = chaveModulo();
    return chave && moduloLiberado(chave) ? chave : '';
  }

  function lerRecentes() {
    try {
      const o = JSON.parse(localStorage.getItem(CHAVE_RECENTES) || '{}');
      return (o && typeof o === 'object') ? o : {};
    } catch (_e) { return {}; }
  }

  function salvarRecentes(chave, rotulos) {
    try {
      const o = lerRecentes();
      o[chave] = rotulos;
      localStorage.setItem(CHAVE_RECENTES, JSON.stringify(o));
    } catch (_e) { /* sem storage: só não lembra o que foi mostrado */ }
  }

  function embaralhar(lista) {
    return lista.map(v => [Math.random(), v]).sort((a, b) => a[0] - b[0]).map(x => x[1]);
  }

  // Sorteia `quantidade` sugestões de um conjunto: prefere as que não foram mostradas nas últimas
  // aberturas e descarta as que o usuário já perguntou nesta conversa.
  function sortearSugestoes(pool, quantidade, memoria) {
    const jaPerguntadas = new Set(historico.filter(m => m.role === 'user').map(m => normalizarTexto(m.content)));
    let base = pool.filter(s => !jaPerguntadas.has(normalizarTexto(s.pergunta)));
    if (base.length < quantidade) base = pool;
    const recentes = lerRecentes()[memoria] || [];
    const novas = embaralhar(base.filter(s => !recentes.includes(s.rotulo)));
    const antigas = embaralhar(base.filter(s => recentes.includes(s.rotulo)));
    const escolhidas = [...novas, ...antigas].slice(0, quantidade);
    const janela = Math.max(quantidade, Math.floor(pool.length / 2));
    salvarRecentes(memoria, [...escolhidas.map(s => s.rotulo), ...recentes].slice(0, janela));
    return escolhidas;
  }

  function sugestoesDoContexto(chave, quantidade) {
    if (chave && MODULOS_CONTEXTO[chave]) return sortearSugestoes(MODULOS_CONTEXTO[chave].pool, quantidade, chave);
    // Geral: divide entre os módulos liberados (se for só um, ele preenche tudo)
    const chaves = Object.keys(MODULOS_CONTEXTO).filter(moduloLiberado);
    if (chaves.length === 0) return [];
    const parte = Math.ceil(quantidade / chaves.length);
    const mistura = [];
    chaves.forEach(k => mistura.push(...sortearSugestoes(MODULOS_CONTEXTO[k].pool, parte, 'geral_' + k)));
    return embaralhar(mistura).slice(0, quantidade);
  }

  function criarChipSugestao(s) {
    const b = document.createElement('button');
    b.type = 'button';
    b.setAttribute('data-cockpit-suggest', s.pergunta);
    b.className = 'text-left text-[11px] px-3 py-1.5 rounded-full border border-blue-200 dark:border-slate-600 text-blue-700 dark:text-blue-300 bg-white dark:bg-slate-800 hover:bg-blue-50 dark:hover:bg-slate-700 transition-colors';
    b.textContent = s.rotulo;
    b.addEventListener('click', () => {
      if (isSending) return;
      enviarMensagem(s.pergunta);
    });
    return b;
  }

  // Mensagens de contexto ("agora você está em ...") não contam como conversa
  function conversaEmAndamento() {
    return !!(chatMessages && chatMessages.querySelector('[data-cockpit-msg]:not([data-cockpit-ctx])'));
  }

  // ---------------------------------------------------------
  // CONSCIÊNCIA DE CONTEXTO: o chat sabe o que está apresentando e percebe quando o app mudou
  //
  //   chatMostrando  -> app que o chat apresentou por último (boas-vindas, sugestões ou aviso de contexto)
  //   Ao reabrir o chat (ou ao trocar de app com o chat aberto), compara com o app atual. Se mudou e já existe
  //   conversa, acrescenta no fim um aviso curto com sugestões do app novo; a conversa é preservada.
  //   Os avisos não vão para o histórico da IA, e um aviso novo substitui o anterior se nada foi dito entre eles.
  //   Apps sem dados para o bot (Atos Normativos, Vistoria etc.) também ganham aviso: o bot diz onde você está
  //   e o que ainda pode consultar. Os nomes saem de APPS_EXTRAS (acrescente os que faltarem).
  // ---------------------------------------------------------
  const APPS_EXTRAS = {
    legislacao: { titulo: 'Atos Normativos', chaves: ['legisl'] },
    gerador: { titulo: 'Gerador de Mensagens', chaves: ['gerador'] },
    regmap: { titulo: 'RegMap', chaves: ['regmap'] },
    conversor: { titulo: 'Conversor CSV', chaves: ['conversor'] },
    usuarios: { titulo: 'Gerenciar Usuários', chaves: ['usuario'] },
    vistoria: { titulo: 'Vistoria Física', chaves: ['vistoria'] },
    quiz: { titulo: 'Sala Ativa', chaves: ['quiz'] },
    dashboard: { titulo: 'Dashboard', chaves: ['dashboard'] }
  };

  let chatMostrando = null;   // null = ainda não apresentou nada

  // Chave do app atual para fins de apresentação: 'home' | módulo com dados | app extra | '' (desconhecido)
  function appPresentavel() {
    if (estaNaHome()) return 'home';
    const hash = normalizarTexto(window.location.hash);
    for (const k of Object.keys(MODULOS_CONTEXTO)) {
      if (MODULOS_CONTEXTO[k].chaves.some(c => hash.includes(c))) return moduloLiberado(k) ? k : '';
    }
    for (const k of Object.keys(APPS_EXTRAS)) {
      if (APPS_EXTRAS[k].chaves.some(c => hash.includes(c))) return k;
    }
    return '';
  }

  function lista_ptbr(itens) {
    if (itens.length <= 1) return itens.join('');
    return itens.slice(0, -1).join(', ') + ' e ' + itens[itens.length - 1];
  }

  function nomesModulosLiberados() {
    const nomes = [];
    if (moduloLiberado('demandas')) nomes.push('Demandas');
    if (moduloLiberado('contratos')) nomes.push('Contratos');
    if (moduloLiberado('qualificacao')) nomes.push('Qualificação Técnica');
    return nomes;
  }

  function boasVindasOutroApp(titulo) {
    const nomes = nomesModulosLiberados();
    const ajuda = nomes.length ? `consultar ${lista_ptbr(nomes)} e ` : '';
    return `Olá! Você está em ${titulo}. Ainda não consulto os dados deste módulo, mas posso ${ajuda}tirar dúvidas sobre as regras do sistema.`;
  }

  // Texto e sugestões do aviso de contexto para o app informado (null = nada a dizer)
  async function montarAvisoContexto(app) {
    if (MODULOS_CONTEXTO[app]) {
      return { texto: MODULOS_CONTEXTO[app].aviso, sugestoes: sortearSugestoes(MODULOS_CONTEXTO[app].pool, 3, app), humor: 'idle' };
    }
    if (app === 'home') {
      try { await carregarResumoHome(false); } catch (_e) { /* segue sem resumo */ }
      if (appPresentavel() !== 'home') return null;   // o usuário já saiu enquanto carregava
      const resumo = resumoHome ? textoResumo(resumoHome) : '';
      return { texto: `De volta ao **Início**.${resumo ? ' ' + resumo : ''}`, sugestoes: sugestoesHome(3), humor: algoPendente(resumoHome) ? 'alerta' : 'idle' };
    }
    if (APPS_EXTRAS[app]) {
      const nomes = nomesModulosLiberados();
      const ajuda = nomes.length ? `consultar ${lista_ptbr(nomes)} e ` : '';
      return {
        texto: `Você agora está em **${APPS_EXTRAS[app].titulo}**. Ainda não consulto os dados deste módulo, mas posso ${ajuda}tirar dúvidas sobre as regras do sistema.`,
        sugestoes: sugestoesDoContexto('', 3),
        humor: 'idle'
      };
    }
    return null;
  }

  // Acrescenta o aviso no fim da conversa (substitui o aviso anterior se nada foi dito depois dele)
  function anexarAvisoContexto(app, aviso) {
    const ultimo = Array.from(chatMessages.querySelectorAll('[data-cockpit-msg]')).pop();
    if (ultimo && ultimo.hasAttribute('data-cockpit-ctx')) {
      if (ultimo.getAttribute('data-cockpit-ctx') === app) { chatMostrando = app; return; }
      ultimo.remove();
    }
    const holder = marcar(document.createElement('div'));
    holder.setAttribute('data-cockpit-ctx', app);
    holder.className = 'mb-3';
    const sep = document.createElement('div');
    sep.className = 'flex items-center gap-2 my-2 text-[10px] text-slate-400';
    const l1 = document.createElement('span'); l1.className = 'flex-1 h-px bg-slate-200 dark:bg-slate-600';
    const l2 = document.createElement('span'); l2.className = 'flex-1 h-px bg-slate-200 dark:bg-slate-600';
    const rot = document.createElement('span');
    rot.textContent = app === 'home' ? 'Início' : ((MODULOS_CONTEXTO[app] && MODULOS_CONTEXTO[app].titulo) || (APPS_EXTRAS[app] && APPS_EXTRAS[app].titulo) || 'Novo app');
    sep.append(l1, rot, l2);
    const msg = criarMensagemBot(aviso.texto, [], [], aviso.humor || 'idle', { sugestoes: aviso.sugestoes, semRodape: true });
    msg.removeAttribute('data-cockpit-msg');   // quem conta como "mensagem" é o holder
    holder.append(sep, msg);
    chatMessages.appendChild(holder);
    scrollParaFim();
    chatMostrando = app;
  }

  // Compara o app atual com o que o chat está apresentando e atualiza se for diferente
  async function sincronizarContexto() {
    const app = appPresentavel();
    if (app === chatMostrando) return;
    if (!conversaEmAndamento()) { renderizarContexto(); return; }   // sem conversa: refaz boas-vindas e sugestões
    if (!app) { chatMostrando = app; return; }                      // app desconhecido: não inventa aviso
    const aviso = await montarAvisoContexto(app);
    if (!aviso || appPresentavel() !== app || !conversaEmAndamento()) return;
    anexarAvisoContexto(app, aviso);
  }

  // Atualiza o texto de boas-vindas e os botões de sugestão conforme o módulo atual
  function renderizarContexto() {
    const app = appPresentavel();
    if (chatMessages) chatMessages.querySelectorAll('[data-cockpit-ctx]').forEach(el => el.remove());   // avisos antigos
    const texto = document.querySelector('#cockpitWelcome > div');
    if (texto) {
      texto.textContent = app === 'home' ? boasVindasHome()
        : MODULOS_CONTEXTO[app] ? MODULOS_CONTEXTO[app].boasVindas
        : APPS_EXTRAS[app] ? boasVindasOutroApp(APPS_EXTRAS[app].titulo)
        : boasVindasGeral();
    }
    const box = document.getElementById('cockpitSuggestions');
    if (box) {
      box.replaceChildren();
      const lista = app === 'home' ? sugestoesHome(QTD_SUGESTOES)
        : MODULOS_CONTEXTO[app] ? sugestoesDoContexto(app, QTD_SUGESTOES)
        : sugestoesDoContexto('', QTD_SUGESTOES);
      lista.forEach(s => box.appendChild(criarChipSugestao(s)));
    }
    chatMostrando = app;
  }

  // ---------------------------------------------------------
  // HOME: posição do bot, resumo do dia, bolha de aviso e sugestões guiadas pelo que está pendente
  //
  //   POSICAO_NA_HOME  'acima'    -> o bot sobe e fica empilhado acima do botão de apps (recomendado, funciona no celular)
  //                    'esquerda' -> o bot vai para a esquerda do botão de apps
  //                    'nenhuma'  -> não mexe na posição
  //   O resumo vem de uma consulta leve às demandas em que o usuário é responsável (mesma base do radar da Home).
  //   Nada disso gasta IA.
  // ---------------------------------------------------------
  const POSICAO_NA_HOME = 'acima';
  const DISTANCIA_BOTAO_APPS = '6rem';     // 1,5rem de margem + 3,5rem do botão + folga
  const ATRASO_BOLHA_MS = 2500;            // espera o modal de boas-vindas da Home sair da frente
  const DURACAO_BOLHA_MS = 15000;
  const RESUMO_VALIDADE_MS = 3 * 60 * 1000;
  const BOLHA_SEMPRE = false;              // true = também cumprimenta quando não há nada pendente
  const CHAVE_BOLHA = 'cockpit_bolha_home';

  let resumoHome = null;                   // { atrasadas, hoje, semana, aguardando, total }
  let resumoHomeEm = 0;
  let timerBolha = null;

  // A Home é o app padrão: hash vazio ou #home
  function estaNaHome() {
    const h = normalizarTexto(window.location.hash).replace('#', '').trim();
    return h === '' || h.startsWith('home');
  }

  // 'home' | chave do módulo liberado | '' (outros módulos)
  function contextoAtual() {
    return estaNaHome() ? 'home' : chaveModuloLiberado();
  }

  function chatFechado() {
    return !!chatWindow && chatWindow.classList.contains('hidden');
  }

  function hojeBahia() {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Bahia' }).format(new Date());   // AAAA-MM-DD
  }

  function diasEntre(a, b) {
    return Math.round((Date.parse(a + 'T12:00:00Z') - Date.parse(b + 'T12:00:00Z')) / 86400000);
  }

  function saudacaoHora() {
    const h = Number(new Date().toLocaleString('en-US', { timeZone: 'America/Bahia', hour: 'numeric', hour12: false })) % 24;
    return h >= 5 && h < 12 ? 'Bom dia' : h < 18 ? 'Boa tarde' : 'Boa noite';
  }

  function nomeCurto() {
    const apelido = (localStorage.getItem('cockpit_username') || '').trim();
    if (apelido) return apelido;
    const real = (sessionStorage.getItem('cockpit_user_realname') || '').trim();
    return real ? real.split(/\s+/)[0] : '';
  }

  const pl = (n, s, p) => (n === 1 ? s : p);

  // Texto do resumo (com **negrito** para a bolha; o chat remove os asteriscos)
  function textoResumo(r) {
    const partes = [];
    if (r.temDemandas) {
      let t;
      if (r.atrasadas > 0) {
        t = `**${r.atrasadas}** ${pl(r.atrasadas, 'demanda atrasada', 'demandas atrasadas')}`;
        if (r.hoje > 0) t += ` e **${r.hoje}** ${pl(r.hoje, 'vence hoje', 'vencem hoje')}`;
        t += '.';
      } else if (r.hoje > 0) {
        t = `Nada atrasado, mas **${r.hoje}** ${pl(r.hoje, 'demanda vence hoje', 'demandas vencem hoje')}.`;
      } else if (r.semana > 0) {
        t = `Nada atrasado nem para hoje. **${r.semana}** ${pl(r.semana, 'demanda vence', 'demandas vencem')} nesta semana.`;
      } else if (r.total > 0) {
        t = 'Nenhum prazo apertado nos próximos 7 dias.';
      } else {
        t = 'Você não tem demandas ativas no momento.';
      }
      if (r.aguardando > 0) t += ` **${r.aguardando}** ${pl(r.aguardando, 'aguarda', 'aguardam')} o seu ciente.`;
      partes.push(t);
    }
    if (r.temContratos) {
      if (r.c30 > 0) partes.push(`**${r.c30}** ${pl(r.c30, 'contrato vence', 'contratos vencem')} em até 30 dias.`);
      else if (!r.temDemandas) {
        partes.push(r.c90 > 0
          ? `Nenhum contrato vence em 30 dias (**${r.c90}** ${pl(r.c90, 'vence', 'vencem')} em até 90).`
          : 'Nenhum contrato vence nos próximos 90 dias.');
      }
    }
    return partes.join(' ');
  }

  // O que pede ação agora: atrasadas, vencendo hoje e contratos a vencer em 30 dias
  function totalUrgente(r) {
    if (!r) return 0;
    return (r.temDemandas ? r.atrasadas + r.hoje : 0) + (r.temContratos ? r.c30 : 0);
  }

  function algoPendente(r) {
    return !!r && ((r.temDemandas && (r.atrasadas > 0 || r.hoje > 0 || r.aguardando > 0)) || (r.temContratos && r.c30 > 0));
  }

  function boasVindasHome() {
    if (!resumoHome) return boasVindasGeral();
    const nome = nomeCurto();
    const abertura = `${saudacaoHora()}${nome ? ', ' + nome : ''}!`;
    const resumo = textoResumo(resumoHome).replace(/\*\*/g, '');
    const posso = ['detalhar o que for preciso'];
    if (moduloLiberado('qualificacao')) posso.push('consultar famílias e CNAEs da Qualificação Técnica');
    return `${abertura} ${resumo} Posso ${posso.join(', ')} e tirar dúvidas sobre as regras do sistema.`;
  }

  // Sugestões da Home: primeiro as que dependem do que está pendente, depois uma mistura dos módulos liberados
  function sugestoesHome(quantidade) {
    const lista = [];
    const r = resumoHome;
    if (moduloLiberado('demandas')) {
      if (r && r.temDemandas && r.atrasadas > 0) lista.push({ rotulo: `Minhas atrasadas (${r.atrasadas})`, pergunta: 'Minhas demandas atrasadas' });
      if (r && r.temDemandas && r.hoje > 0) lista.push({ rotulo: `Vencem hoje (${r.hoje})`, pergunta: 'Minhas demandas vencendo hoje' });
    }
    if (r && r.temContratos && r.c30 > 0) lista.push({ rotulo: `Contratos a vencer (${r.c30})`, pergunta: 'Contratos vencendo em 30 dias' });
    if (moduloLiberado('demandas')) lista.push({ rotulo: 'Resumo do meu dia', pergunta: 'Quantas demandas tenho?' });
    const jaTem = new Set(lista.map(x => normalizarTexto(x.pergunta)));
    sugestoesDoContexto('', quantidade).forEach(x => {
      if (!jaTem.has(normalizarTexto(x.pergunta))) { lista.push(x); jaTem.add(normalizarTexto(x.pergunta)); }
    });
    return lista.slice(0, quantidade);
  }

  // Na Home o botão de apps (canto inferior direito, dentro do iframe) ficava coberto pelo bot
  function aplicarPosicaoBot() {
    const mod = document.getElementById('srCockpitModule');
    if (!mod) return;
    mod.style.transition = 'bottom 300ms ease, right 300ms ease';
    const naHome = estaNaHome() && POSICAO_NA_HOME !== 'nenhuma';
    mod.style.bottom = naHome && POSICAO_NA_HOME === 'acima' ? DISTANCIA_BOTAO_APPS : '';
    mod.style.right = naHome && POSICAO_NA_HOME === 'esquerda' ? DISTANCIA_BOTAO_APPS : '';
    // com o bot mais alto, a janela precisa de um teto menor para não sair pela parte de cima
    if (chatWindow) chatWindow.style.maxHeight = naHome ? 'calc(100vh - 13rem)' : '';
  }

  function somaDiasISO(iso, dias) {
    const d = new Date(iso + 'T12:00:00Z');
    d.setUTCDate(d.getUTCDate() + dias);
    return d.toISOString().slice(0, 10);
  }

  // Consultas leves (RLS do próprio usuário): demandas ativas em que ele é responsável
  // e contratos principais que vencem em até 90 dias (a mesma regra do radar de contratos da Home)
  async function carregarResumoHome(forcar) {
    const querDemandas = moduloLiberado('demandas');
    const querContratos = moduloLiberado('contratos');
    if (!querDemandas && !querContratos) { resumoHome = null; return null; }
    if (!forcar && resumoHome && Date.now() - resumoHomeEm < RESUMO_VALIDADE_MS) return resumoHome;
    const nome = sessionStorage.getItem('cockpit_user_realname');
    const hoje = hojeBahia();

    const buscarDemandas = async () => {
      if (!querDemandas || !nome) return null;
      try {
        const { data, error } = await supabase.from('demandas')
          .select('id, status, prazo_limite')
          .eq('responsavel_nome', nome)
          .neq('status', 'Concluído')
          .neq('status', 'Cancelado');
        if (error || !Array.isArray(data)) return null;
        const d = { atrasadas: 0, hoje: 0, semana: 0, aguardando: 0, total: data.length };
        data.forEach(x => {
          if (x.status === 'Pendente') d.aguardando++;
          if (!x.prazo_limite) return;
          const dif = diasEntre(x.prazo_limite, hoje);
          if (dif < 0) d.atrasadas++;
          else if (dif === 0) d.hoje++;
          else if (dif <= 7) d.semana++;
        });
        return d;
      } catch (_e) { return null; }
    };

    const buscarContratos = async () => {
      if (!querContratos) return null;
      try {
        const { data, error } = await supabase.from('contratos')
          .select('id, dataFim')
          .not('dataFim', 'is', null)
          .is('parentId', null)
          .gte('dataFim', hoje)
          .lte('dataFim', somaDiasISO(hoje, 90));
        if (error || !Array.isArray(data)) return null;
        return { c90: data.length, c30: data.filter(c => diasEntre(String(c.dataFim).slice(0, 10), hoje) <= 30).length };
      } catch (_e) { return null; }
    };

    const [d, c] = await Promise.all([buscarDemandas(), buscarContratos()]);
    if (!d && !c) return resumoHome;   // falhou tudo: mantém o que já havia
    resumoHome = Object.assign(
      { temDemandas: !!d, temContratos: !!c, atrasadas: 0, hoje: 0, semana: 0, aguardando: 0, total: 0, c30: 0, c90: 0 },
      d || {}, c || {}
    );
    resumoHomeEm = Date.now();
    return resumoHome;
  }

  // **negrito** -> <strong>, sem interpretar HTML
  function escreverComNegrito(el, texto) {
    texto.split('**').forEach((parte, i) => {
      if (!parte) return;
      if (i % 2 === 1) { const b = document.createElement('strong'); b.textContent = parte; el.appendChild(b); }
      else el.appendChild(document.createTextNode(parte));
    });
  }

  // Ícone do bot (botão flutuante): expressão de alerta enquanto a bolha pede atenção
  let iconeEmAlerta = false;
  function definirIconeAlerta(ligado) {
    const icone = document.getElementById('srCockpitMainIcon');
    if (!icone) return;
    if (ligado && !iconeEmAlerta) { iconeEmAlerta = true; definirImagem(icone, 'alerta'); }
    else if (!ligado && iconeEmAlerta) { iconeEmAlerta = false; definirImagem(icone, 'idle'); }
  }

  function removerBolhaHome() {
    clearTimeout(timerBolha);
    definirIconeAlerta(false);
    const b = document.getElementById('srCockpitBolha');
    if (!b) return;
    b.classList.add('opacity-0');
    setTimeout(() => b.remove(), 300);
  }

  function abrirComPergunta(pergunta) {
    removerBolhaHome();
    if (chatFechado()) window.toggleCockpitChat();
    if (pergunta) setTimeout(() => { if (!isSending) enviarMensagem(pergunta); }, 400);
  }

  // Bolha ao lado do bot, uma vez por dia de sessão, só se houver algo que peça ação
  function mostrarBolhaHome() {
    const r = resumoHome;
    if (!estaNaHome() || !chatFechado() || !r) return;
    if (!BOLHA_SEMPRE && !algoPendente(r)) return;
    const dia = hojeBahia();
    try { if (sessionStorage.getItem(CHAVE_BOLHA) === dia) return; sessionStorage.setItem(CHAVE_BOLHA, dia); } catch (_e) {}
    if (document.getElementById('srCockpitBolha')) return;

    const mod = document.getElementById('srCockpitModule');
    const gatilho = document.getElementById('srCockpitTrigger');
    if (!mod || !gatilho) return;

    const nome = nomeCurto();
    let perguntaAcao, rotuloAcao;
    if (r.temDemandas && r.atrasadas > 0) { perguntaAcao = 'Minhas demandas atrasadas'; rotuloAcao = 'Ver atrasadas'; }
    else if (r.temDemandas && r.hoje > 0) { perguntaAcao = 'Minhas demandas vencendo hoje'; rotuloAcao = 'Ver o que vence hoje'; }
    else if (r.temContratos && r.c30 > 0) { perguntaAcao = 'Contratos vencendo em 30 dias'; rotuloAcao = 'Ver contratos a vencer'; }
    else { perguntaAcao = 'Quantas demandas tenho?'; rotuloAcao = 'Ver meu resumo'; }

    const b = document.createElement('div');
    b.id = 'srCockpitBolha';
    b.setAttribute('role', 'status');
    b.className = 'relative max-w-[260px] mb-2 mr-1 p-3 pr-7 rounded-2xl rounded-br-sm bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs leading-snug shadow-xl border border-slate-200 dark:border-slate-600 cursor-pointer transition-all duration-300 opacity-0 translate-y-1';

    const titulo = document.createElement('div');
    titulo.className = 'font-bold mb-1';
    titulo.textContent = `${saudacaoHora()}${nome ? ', ' + nome : ''}!`;
    const corpo = document.createElement('div');
    escreverComNegrito(corpo, textoResumo(r));
    const acao = document.createElement('div');
    acao.className = 'mt-2 text-[11px] font-semibold text-blue-600 dark:text-blue-300';
    acao.textContent = rotuloAcao + ' →';
    const fechar = document.createElement('button');
    fechar.type = 'button';
    fechar.setAttribute('aria-label', 'Dispensar');
    fechar.className = 'absolute top-1 right-2 text-slate-400 hover:text-slate-600 dark:hover:text-white text-base leading-none';
    fechar.textContent = '×';
    fechar.addEventListener('click', e => { e.stopPropagation(); removerBolhaHome(); });
    b.append(titulo, corpo, acao, fechar);
    b.addEventListener('click', () => abrirComPergunta(perguntaAcao));

    mod.insertBefore(b, gatilho);
    requestAnimationFrame(() => requestAnimationFrame(() => { b.classList.remove('opacity-0', 'translate-y-1'); }));
    if (totalUrgente(r) > 0) definirIconeAlerta(true);   // o bot "faz cara de alerta" enquanto a bolha está aberta
    timerBolha = setTimeout(removerBolhaHome, DURACAO_BOLHA_MS);
  }

  // Número no balão vermelho do bot: quanto pede ação agora (atrasadas + vencendo hoje)
  function atualizarSeloHome() {
    const selo = document.getElementById('srCockpitBadge');
    const r = resumoHome;
    if (!selo || !r || !estaNaHome() || !chatFechado()) return;
    const n = totalUrgente(r);
    if (n <= 0) return;
    selo.textContent = n > 9 ? '9+' : String(n);
    selo.title = textoResumo(r).replace(/\*\*/g, '');
    selo.classList.remove('scale-0');
    selo.classList.add('scale-100');
  }

  // Ao entrar na Home (carga ou troca de módulo): posição, resumo, chips, bolha e selo
  function prepararHome() {
    aplicarPosicaoBot();
    if (!estaNaHome()) { removerBolhaHome(); return Promise.resolve(); }
    return carregarResumoHome(false).then(() => {
      if (!estaNaHome()) return;
      if (!conversaEmAndamento()) renderizarContexto();
      setTimeout(() => { if (estaNaHome()) { mostrarBolhaHome(); atualizarSeloHome(); } }, ATRASO_BOLHA_MS);
    });
  }

  function setEnviando(enviando) {
    const input = document.getElementById('cockpitInput');
    const btn = chatForm ? chatForm.querySelector('button[type="submit"]') : null;
    if (input) input.disabled = enviando;
    if (btn) btn.disabled = enviando;
  }

  function moduloAtual() {
    // Chave canônica quando o módulo é reconhecido (demandas, qualificacao); senão, o hash bruto
    return chaveModulo() || (window.location.hash || '').replace('#', '').slice(0, 30);   // o servidor valida o acesso
  }

  // Extrai a mensagem amigável devolvida pela Edge Function (status não-2xx)
  async function extrairMensagemErro(err) {
    try {
      if (err && err.context && typeof err.context.json === 'function') {
        const corpo = await err.context.json();
        if (corpo && corpo.error) return corpo.error;
      }
    } catch (_e) { /* usa a mensagem padrão abaixo */ }
    return (err && err.message) ? err.message : 'Erro desconhecido.';
  }

  // ---------------------------------------------------------
  // Envio (pergunta digitada, clique em sugestão, escolha de itens)
  //   textoUsuario     texto exibido na bolha do usuário
  //   corpo            campos extras do pedido (acao, query, escolha...)
  //   semHistorico     true = não envia o histórico (a caixa de escolha não usa IA)
  //   perguntaHistorico pergunta original a guardar no histórico quando a conversa terminar
  // Devolve true se deu certo.
  // ---------------------------------------------------------
  async function enviar({ textoUsuario, corpo = {}, semHistorico = false, perguntaHistorico = null }) {
    isSending = true;
    setEnviando(true);
    setSugestoesVisiveis(false);
    let sucesso = false;

    // 1. Renderiza a mensagem do usuário
    chatMessages.appendChild(criarMensagemUsuario(textoUsuario));
    scrollParaFim();

    // 2. Muda o estado do personagem para "Analisando" (Engrenagem/Pensativo)
    setCockpitState('thinking');
    const typingEl = criarIndicadorDigitando();
    chatMessages.appendChild(typingEl);
    scrollParaFim();

    // 3. Chamada real à Edge Function
    try {
      if (!supabase) throw new Error('Conexão com o sistema indisponível. Recarregue a página.');

      const pedido = Object.assign({
        query: textoUsuario,
        history: semHistorico ? [] : historico.slice(-MAX_HISTORICO_ENVIADO),
        module: moduloAtual()
      }, corpo);

      const { data, error } = await supabase.functions.invoke('cockpit-ai', { body: pedido });

      typingEl.remove();

      // Se a internet falhar, a sessão expirar ou a function estiver offline
      if (error) throw new Error(await extrairMensagemErro(error));

      // Se a nossa Edge Function capturou um erro interno
      if (data && data.error) throw new Error(data.error);
      if (!data || typeof data.reply !== 'string') throw new Error('Resposta vazia do assistente.');

      // Humor (expressão do personagem) enviado pelo servidor nas respostas do sistema; padrão: sucesso
      const humor = (data.humor && EXPRESSOES[data.humor]) ? data.humor : 'sucesso';
      chatMessages.appendChild(criarMensagemBot(
        data.reply, data.consultas, data.anexos, humor,
        { escolha: data.escolha, sugestoes: data.sugestoes }
      ));
      scrollParaFim();

      // Só guarda no histórico quando a conversa termina (a caixa de escolha ainda está aberta = pergunta em andamento)
      if (!data.escolha) {
        historico.push({ role: 'user', content: perguntaHistorico || corpo.query || textoUsuario });
        historico.push({ role: 'assistant', content: data.reply });
        salvarHistorico();
      }

      // Muda a expressão (sucesso, ironia, pensativo...) e depois de 3 segundos volta a Idle
      setCockpitState(humor);
      setTimeout(() => setCockpitState('idle'), 3000);
      sucesso = true;
    } catch (err) {
      console.error("Erro na IA:", err);
      typingEl.remove();
      chatMessages.appendChild(criarMensagemErro(err.message));
      scrollParaFim();
      setCockpitState('alert');
      setTimeout(() => setCockpitState('idle'), 4000);
    } finally {
      isSending = false;
      setEnviando(false);
      const input = document.getElementById('cockpitInput');
      if (input) input.focus();
    }
    return sucesso;
  }

  function enviarMensagem(text) {
    return enviar({ textoUsuario: text });
  }

  // Evento de Envio de Mensagem
  if (chatForm) {
    chatForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const input = document.getElementById('cockpitInput');
      const text = input.value.trim();
      if (!text || isSending) return;
      input.value = '';
      enviarMensagem(text);
    });
  }

  // Sugestões rápidas e boas-vindas conforme o módulo (os botões são criados por renderizarContexto)
  let moduloExibido = appPresentavel();
  aplicarPosicaoBot();
  renderizarContexto();
  // Lê as permissões do usuário e refaz o contexto (só se ainda não houver conversa na tela)
  carregarPermissoes().then(() => {
    moduloExibido = appPresentavel();
    if (!conversaEmAndamento()) renderizarContexto();
    prepararHome();
  });

  // Ao abrir o chat sem conversa em andamento, sorteia novas sugestões (a lista muda a cada abertura)
  const alternarOriginal = window.toggleCockpitChat;
  window.toggleCockpitChat = function() {
    const abrindo = chatWindow && chatWindow.classList.contains('hidden');
    if (abrindo) {
      removerBolhaHome();
      if (!conversaEmAndamento()) renderizarContexto();   // sem conversa: sorteia novas sugestões
      else sincronizarContexto();                          // com conversa: se o app mudou, acrescenta o aviso
    }
    const retorno = alternarOriginal.apply(this, arguments);
    const selo = document.getElementById('srCockpitBadge');
    if (abrindo && selo) { selo.classList.remove('scale-100'); selo.classList.add('scale-0'); }   // esconde o balão ao abrir
    return retorno;
  };

  // Ao trocar de app: com o chat aberto, atualiza na hora; com o chat fechado, só sinaliza no botão
  // (o aviso de contexto é montado quando o chat for reaberto, e só se o app ainda for diferente)
  window.addEventListener('hashchange', () => {
    const nova = appPresentavel();
    if (nova === moduloExibido) return;
    const anterior = moduloExibido;
    moduloExibido = nova;
    aplicarPosicaoBot();
    const aberto = !chatFechado();
    if (nova === 'home') {   // Home: resumo, bolha e selo cuidam do resto
      prepararHome();
      if (aberto && conversaEmAndamento()) sincronizarContexto();
      return;
    }
    removerBolhaHome();
    if (anterior === 'home') {   // o número do selo era da Home: apaga ao sair
      const seloHome = document.getElementById('srCockpitBadge');
      if (seloHome) { seloHome.classList.remove('scale-100'); seloHome.classList.add('scale-0'); seloHome.textContent = '1'; seloHome.title = ''; }
    }
    if (!conversaEmAndamento()) renderizarContexto();
    else if (aberto) sincronizarContexto();
    const badge = document.getElementById('srCockpitBadge');
    if (AVISAR_COM_BADGE && !aberto && nova && badge) { badge.textContent = '1'; badge.title = ''; badge.classList.remove('scale-0'); badge.classList.add('scale-100'); }
  });

  // Nova conversa: limpa mensagens, histórico e volta às sugestões
  window.novaConversaCockpit = function() {
    if (isSending) return;
    historico = [];
    try { sessionStorage.removeItem(STORAGE_KEY); } catch (_e) {}
    chatMessages.querySelectorAll('[data-cockpit-msg]').forEach(el => el.remove());
    renderizarContexto();
    setSugestoesVisiveis(true);
    setCockpitState('idle');
    const input = document.getElementById('cockpitInput');
    if (input) input.focus();
  };

  // Restaura a conversa da sessão (ex.: após recarregar a página)
  if (chatMessages && historico.length > 0) {
    setSugestoesVisiveis(false);
    historico.forEach(m => {
      chatMessages.appendChild(m.role === 'user' ? criarMensagemUsuario(m.content) : criarMensagemBot(m.content, [], [], undefined, null));
    });
    scrollParaFim();
  }

  // Ao sair do sistema, apaga a conversa para o próximo usuário da mesma aba
  if (supabase && supabase.auth && typeof supabase.auth.onAuthStateChange === 'function') {
    supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        historico = [];
        try { sessionStorage.removeItem(STORAGE_KEY); } catch (_e) {}
      }
    });
  }

  // =========================================================
  // CONTROLO DE EXPANSÃO DA JANELA DO CHAT
  // =========================================================
  let isChatExpanded = false;
  window.toggleExpandChat = function() {
    // Substitua 'cockpitChatWindow' pelo ID exato da caixa principal do chat no seu HTML se for diferente
    const chatWindow = document.getElementById('cockpitChatWindow');
    const expandIcon = document.getElementById('expandChatIcon');
    if (!chatWindow) return;
    isChatExpanded = !isChatExpanded;
    // Garante transição fluida nas dimensões e posicionamento
    chatWindow.classList.add('transition-all', 'duration-300', 'ease-in-out');
    if (isChatExpanded) {
      // Modo Expandido: Dobra a largura e ganha mais altura vertical
      // Remove classes padrão de tamanho fixo e aplica tamanhos maiores
      chatWindow.classList.remove('w-80', 'sm:w-96', 'h-[500px]', 'max-h-[80vh]');
      chatWindow.classList.add('w-[92vw]', 'sm:w-[650px]', 'h-[80vh]', 'max-h-[85vh]');
      // Altera o ícone para "recolher" (minimizar de volta ao tamanho normal)
      if (expandIcon) {
        expandIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 9V4m0 5H4m5 0L3.5 3.5M15 9v-5m0 5h5m-5 0l5.5-5.5M9 15v5m0-5H4m5 0l-5.5 5.5m11-5.5v5m0-5h5m-5 0l5.5 5.5"></path>';
      }
    } else {
      // Modo Normal: Retorna ao tamanho padrão compacto
      chatWindow.classList.remove('w-[92vw]', 'sm:w-[650px]', 'h-[80vh]', 'max-h-[85vh]');
      chatWindow.classList.add('w-80', 'sm:w-96', 'h-[500px]', 'max-h-[80vh]');
      // Retorna o ícone original de expandir
      if (expandIcon) {
        expandIcon.innerHTML = '<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 4l-5-5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4"></path>';
      }
    }
  };
});
