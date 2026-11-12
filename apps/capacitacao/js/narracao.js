// =====================================================================
// Narração do Sr. Cockpit – Academia CGCF
//
// Fala o balão "Sr. Cockpit diz:" (#mascote-fala) e coloca um botão de silenciar dentro dele.
//   1) se a fala tem MP3 (data-audio, vindo de falas.js) -> toca o MP3
//   2) senão -> lê o texto falado com a voz do navegador (Web Speech API)
//   3) se o MP3 falhar (arquivo removido/ilegível) -> cai para a voz do navegador
//
// O engine.js grava no balão: data-chave, data-falado e data-audio. Se algum deles faltar
// (versão antiga do engine), a narração usa o texto visível, como antes.
// A preferência de silenciar fica salva neste navegador.
// =====================================================================

const CHAVE_MUDO = 'academia_narracao_mudo';
const FALA_PADRAO_HTML = 'Leia atentamente as orientações antes de avançar.';   // texto inicial de lesson.html (não é narrado)
const ATRASO_MS = 120;   // junta chamadas seguidas e evita o bug de "cancel + speak" do Chrome

// Pronúncia da voz do navegador (não afeta MP3): [expressão, como falar]. Edite à vontade.
const PRONUNCIA = [
    [/\+\s*(\d+)\s*XP\b/gi, 'mais $1 pontos de experiência'],
    [/\bXP\b/g, 'pontos de experiência'],
    [/\bCAF\b/g, 'cê á éfe'],
    [/(\d+)\s*%/g, '$1 por cento']
];
const VOZES_PREFERIDAS = [/antonio.*(natural|online)/i, /(natural|online).*antonio/i, /francisca.*(natural|online)/i, /(natural|online)/i, /google/i, /antonio|daniel|felipe|ricardo/i];

const sintese = window.speechSynthesis;
const temVoz = !!sintese && typeof window.SpeechSynthesisUtterance === 'function';
const temAudio = typeof window.Audio === 'function';

let voz = null;
let pendente = null;
let player = null;

const mudo = () => localStorage.getItem(CHAVE_MUDO) === '1';

// ---------------------------------------------------------------------
// Voz do navegador
// ---------------------------------------------------------------------
function escolherVoz() {
    if (!temVoz) return;
    const todas = sintese.getVoices() || [];
    const pt = todas.filter(v => /^pt([-_]BR)?$/i.test(v.lang) || /^pt[-_]BR/i.test(v.lang));
    const base = pt.length ? pt : todas.filter(v => /^pt/i.test(v.lang));
    for (const re of VOZES_PREFERIDAS) {
        const achada = base.find(v => re.test(v.name));
        if (achada) { voz = achada; return; }
    }
    voz = base[0] || null;
}
if (temVoz) { escolherVoz(); sintese.addEventListener?.('voiceschanged', escolherVoz); }

export function textoParaFalar(t) {
    let s = String(t || '');
    for (const [re, novo] of PRONUNCIA) s = s.replace(re, novo);
    s = s.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}★☆✔✘✓✗→←↑↓•·]/gu, ' ');
    return s.replace(/\s+/g, ' ').trim();
}

function falarVoz(texto) {
    if (!temVoz) return;
    const t = textoParaFalar(texto);
    sintese.cancel();
    if (!t) return;
    const u = new SpeechSynthesisUtterance(t);
    u.lang = 'pt-BR';
    if (voz) u.voice = voz;
    u.rate = 1; u.pitch = 1; u.volume = 1;
    u.onerror = e => { if (e.error && e.error !== 'canceled' && e.error !== 'interrupted') console.debug('Narração indisponível:', e.error); };
    sintese.speak(u);
}

// ---------------------------------------------------------------------
// MP3
// ---------------------------------------------------------------------
function pararAudio() {
    if (!player) return;
    const a = player; player = null;
    a.onended = a.onerror = null;
    try { a.pause(); } catch { /* ignora */ }
}

function tocarMp3(url, textoFalado) {
    const a = new Audio(url);
    player = a;
    a.onended = () => { if (player === a) player = null; };
    a.onerror = () => { if (player === a) { player = null; falarVoz(textoFalado); } };   // arquivo sumiu/ilegível
    const p = a.play();
    if (p && p.catch) p.catch(e => { if (e?.name !== 'AbortError') console.debug('Áudio não iniciado:', e?.name || e); });
}

// ---------------------------------------------------------------------
// Controle
// ---------------------------------------------------------------------
export function pararNarracao() {
    clearTimeout(pendente); pendente = null;
    pararAudio();
    if (temVoz) sintese.cancel();
}

function narrar({ audio, falado }) {
    if (mudo()) return;
    clearTimeout(pendente);
    pendente = setTimeout(() => {
        pararAudio();
        if (temVoz) sintese.cancel();
        if (audio && temAudio) tocarMp3(audio, falado);
        else falarVoz(falado);
    }, ATRASO_MS);
}

// Fala imediata com a voz do navegador (prévia no painel admin; ignora o "mudo")
export function falarAgora(texto) { pararNarracao(); falarVoz(texto); }

// ---------------------------------------------------------------------
// Botão dentro do balão
// ---------------------------------------------------------------------
const ICONE_SOM = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15.536 8.464a5 5 0 010 7.072M18.364 5.636a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5.586v12.828a1 1 0 01-1.707.707L5.586 15z"/></svg>';
const ICONE_MUDO = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707A1 1 0 0112 5.586v12.828a1 1 0 01-1.707.707L5.586 15z"/><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 14l4-4m0 4l-4-4"/></svg>';

function pintarBotao(btn) {
    const m = mudo();
    btn.innerHTML = m ? ICONE_MUDO : ICONE_SOM;
    btn.setAttribute('aria-pressed', String(m));
    const rotulo = m ? 'Ativar a narração do Sr. Cockpit' : 'Silenciar a narração do Sr. Cockpit';
    btn.title = rotulo; btn.setAttribute('aria-label', rotulo);
    btn.style.opacity = m ? '.6' : '1';
}

function falaDoBalao() {
    const fala = document.getElementById('mascote-fala');
    if (!fala) return null;
    const t = fala.textContent.trim();
    return { audio: fala.dataset.audio || '', falado: (fala.dataset.falado || t).trim(), texto: t };
}

function garantirBotao() {
    const caixa = document.getElementById('mascote-container');
    if (!caixa || !(temVoz || temAudio)) return;
    let btn = document.getElementById('mascote-mudo');
    if (!btn) {
        btn = document.createElement('button');
        btn.id = 'mascote-mudo'; btn.type = 'button';
        btn.className = 'ml-auto self-start shrink-0 p-1.5 rounded-lg text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-800/40 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-400';
        btn.onclick = () => {
            if (mudo()) {
                localStorage.removeItem(CHAVE_MUDO); pintarBotao(btn);
                const f = falaDoBalao();
                if (f && f.texto && f.texto !== FALA_PADRAO_HTML) narrar(f);
            } else {
                localStorage.setItem(CHAVE_MUDO, '1'); pintarBotao(btn); pararNarracao();
            }
        };
        pintarBotao(btn);
        caixa.appendChild(btn);
    }
}

// ---------------------------------------------------------------------
// Observa a tela: nova fala => narra; saiu da lição => para
// ---------------------------------------------------------------------
let tinhaBalao = false;
function aoMudar(registros) {
    const fala = document.getElementById('mascote-fala');
    if (!fala) {                                  // saiu da lição (ou ainda não abriu)
        if (tinhaBalao) { tinhaBalao = false; pararNarracao(); }
        return;
    }
    tinhaBalao = true;
    garantirBotao();
    const mexeu = registros.some(r => r.target === fala || fala.contains(r.target)
        || [...r.addedNodes].some(n => n.nodeType === 1 && (n === fala || n.contains(fala))));
    if (!mexeu) return;
    const f = falaDoBalao();
    if (!f.texto || f.texto === FALA_PADRAO_HTML) return;   // texto inicial do lesson.html
    narrar(f);
}

function iniciar() {
    if (!(temVoz || temAudio)) return;
    const raiz = document.getElementById('router-view') || document.body;
    new MutationObserver(aoMudar).observe(raiz, { childList: true, subtree: true, characterData: true });
    aoMudar([]);
}

window.addEventListener('pagehide', pararNarracao);
document.addEventListener('visibilitychange', () => { if (document.hidden) pararNarracao(); });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
else iniciar();
