// =====================================================================
// Renderização do certificado (A4 paisagem, 1123 × 794 px)
// Usado na galeria, no visualizador, no editor do admin, na impressão
// e na página pública de verificação.
//
// Entrada = "snapshot" gravado no banco no momento da emissão:
// {
//   tipo: 'trilha' | 'referencia',
//   instituicao, subinstituicao, titulo_doc, subtitulo,
//   patente, patente_rotulo, emblema: { t: 'chev'|'star'|'ref', n },
//   cores: { c1, cd, c2 },
//   aluno, texto (com **negrito**), lista_rotulo, lista: [...],
//   media (0-100), selo: 'PRATA' | 'OURO',
//   assinatura: { nome, papel }, codigo
// }
// Nenhum HTML vindo do banco é inserido sem escape.
// =====================================================================
export const CERT_W = 1123, CERT_H = 794;

const FONTES = 'https://fonts.googleapis.com/css2?family=Cinzel:wght@500;700&family=Great+Vibes&family=Homemade+Apple&family=Playfair+Display:ital,wght@0,500;0,700;1,500&display=swap';

export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const cor = (v, padrao) => /^#[0-9a-fA-F]{6}$/.test(v || '') ? v : padrao;

const BRASAO_SYMBOL = `<symbol id="brasao" viewBox="-26 -6 252 262">
  <g fill="var(--c2)" opacity=".95">
    <g><path d="M70.6 208.8 A86 86 0 0 1 54.4 55.1" fill="none" stroke="var(--c2)" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="54.3" cy="209.2" rx="4.2" ry="11.0" transform="rotate(-284.0 54.3 209.2)"/><ellipse cx="60.8" cy="198.6" rx="4.2" ry="9.0" transform="rotate(-208.0 60.8 198.6)"/><ellipse cx="37.7" cy="197.3" rx="4.2" ry="11.0" transform="rotate(-271.4 37.7 197.3)"/><ellipse cx="46.3" cy="188.4" rx="4.2" ry="9.0" transform="rotate(-195.4 46.3 188.4)"/><ellipse cx="24.1" cy="182.1" rx="4.2" ry="11.0" transform="rotate(-258.8 24.1 182.1)"/><ellipse cx="34.5" cy="175.2" rx="4.2" ry="9.0" transform="rotate(-182.8 34.5 175.2)"/><ellipse cx="14.1" cy="164.2" rx="4.2" ry="11.0" transform="rotate(-246.2 14.1 164.2)"/><ellipse cx="25.7" cy="159.8" rx="4.2" ry="9.0" transform="rotate(-170.2 25.7 159.8)"/><ellipse cx="8.3" cy="144.6" rx="4.2" ry="11.0" transform="rotate(-233.6 8.3 144.6)"/><ellipse cx="20.6" cy="142.8" rx="4.2" ry="9.0" transform="rotate(-157.6 20.6 142.8)"/><ellipse cx="6.9" cy="124.2" rx="4.2" ry="11.0" transform="rotate(-221.0 6.9 124.2)"/><ellipse cx="19.3" cy="125.1" rx="4.2" ry="9.0" transform="rotate(-145.0 19.3 125.1)"/><ellipse cx="10.0" cy="104.0" rx="4.2" ry="11.0" transform="rotate(-208.4 10.0 104.0)"/><ellipse cx="21.9" cy="107.6" rx="4.2" ry="9.0" transform="rotate(-132.4 21.9 107.6)"/><ellipse cx="17.4" cy="84.9" rx="4.2" ry="11.0" transform="rotate(-195.8 17.4 84.9)"/><ellipse cx="28.2" cy="91.0" rx="4.2" ry="9.0" transform="rotate(-119.8 28.2 91.0)"/><ellipse cx="28.8" cy="67.9" rx="4.2" ry="11.0" transform="rotate(-183.2 28.8 67.9)"/><ellipse cx="38.0" cy="76.3" rx="4.2" ry="9.0" transform="rotate(-107.2 38.0 76.3)"/><ellipse cx="43.6" cy="53.8" rx="4.2" ry="11.0" transform="rotate(-170.6 43.6 53.8)"/><ellipse cx="50.8" cy="64.0" rx="4.2" ry="9.0" transform="rotate(-94.6 50.8 64.0)"/></g>
    <g transform="translate(200 0) scale(-1 1)"><path d="M70.6 208.8 A86 86 0 0 1 54.4 55.1" fill="none" stroke="var(--c2)" stroke-width="2.2" stroke-linecap="round"/><ellipse cx="54.3" cy="209.2" rx="4.2" ry="11.0" transform="rotate(-284.0 54.3 209.2)"/><ellipse cx="60.8" cy="198.6" rx="4.2" ry="9.0" transform="rotate(-208.0 60.8 198.6)"/><ellipse cx="37.7" cy="197.3" rx="4.2" ry="11.0" transform="rotate(-271.4 37.7 197.3)"/><ellipse cx="46.3" cy="188.4" rx="4.2" ry="9.0" transform="rotate(-195.4 46.3 188.4)"/><ellipse cx="24.1" cy="182.1" rx="4.2" ry="11.0" transform="rotate(-258.8 24.1 182.1)"/><ellipse cx="34.5" cy="175.2" rx="4.2" ry="9.0" transform="rotate(-182.8 34.5 175.2)"/><ellipse cx="14.1" cy="164.2" rx="4.2" ry="11.0" transform="rotate(-246.2 14.1 164.2)"/><ellipse cx="25.7" cy="159.8" rx="4.2" ry="9.0" transform="rotate(-170.2 25.7 159.8)"/><ellipse cx="8.3" cy="144.6" rx="4.2" ry="11.0" transform="rotate(-233.6 8.3 144.6)"/><ellipse cx="20.6" cy="142.8" rx="4.2" ry="9.0" transform="rotate(-157.6 20.6 142.8)"/><ellipse cx="6.9" cy="124.2" rx="4.2" ry="11.0" transform="rotate(-221.0 6.9 124.2)"/><ellipse cx="19.3" cy="125.1" rx="4.2" ry="9.0" transform="rotate(-145.0 19.3 125.1)"/><ellipse cx="10.0" cy="104.0" rx="4.2" ry="11.0" transform="rotate(-208.4 10.0 104.0)"/><ellipse cx="21.9" cy="107.6" rx="4.2" ry="9.0" transform="rotate(-132.4 21.9 107.6)"/><ellipse cx="17.4" cy="84.9" rx="4.2" ry="11.0" transform="rotate(-195.8 17.4 84.9)"/><ellipse cx="28.2" cy="91.0" rx="4.2" ry="9.0" transform="rotate(-119.8 28.2 91.0)"/><ellipse cx="28.8" cy="67.9" rx="4.2" ry="11.0" transform="rotate(-183.2 28.8 67.9)"/><ellipse cx="38.0" cy="76.3" rx="4.2" ry="9.0" transform="rotate(-107.2 38.0 76.3)"/><ellipse cx="43.6" cy="53.8" rx="4.2" ry="11.0" transform="rotate(-170.6 43.6 53.8)"/><ellipse cx="50.8" cy="64.0" rx="4.2" ry="9.0" transform="rotate(-94.6 50.8 64.0)"/></g>
  </g>
  <!-- escudo -->
  <path d="M28 40 H172 V118 C172 170 132 204 100 220 C68 204 28 170 28 118 Z" fill="var(--cd)" stroke="var(--c2)" stroke-width="4" stroke-linejoin="round"/>
  <path d="M38 48 H162 V118 C162 162 128 192 100 207 C72 192 38 162 38 118 Z" fill="none" stroke="var(--c2)" stroke-width="1.4" opacity=".7"/>
  <!-- estrela do topo -->
  <polygon points="100,2 105.5,15 119,15.5 108.5,24 112,37 100,29.5 88,37 91.5,24 81,15.5 94.5,15" fill="var(--c2)"/>
  <!-- sol / luz do saber -->
  <g stroke="var(--c2)" stroke-width="3" stroke-linecap="round">
    <line x1="100" y1="50" x2="100" y2="58"/><line x1="80" y1="57" x2="85" y2="63"/><line x1="120" y1="57" x2="115" y2="63"/>
    <line x1="68" y1="70" x2="76" y2="73"/><line x1="132" y1="70" x2="124" y2="73"/>
  </g>
  <path d="M86 82 A14 14 0 0 1 114 82 Z" fill="var(--c2)"/>
  <!-- livro aberto -->
  <path d="M100 150 C86 138 64 135 46 140 V92 C64 87 86 90 100 102 Z" fill="#fff"/>
  <path d="M100 150 C114 138 136 135 154 140 V92 C136 87 114 90 100 102 Z" fill="#f1f5f9"/>
  <path d="M100 102 V150" stroke="var(--cd)" stroke-width="2"/>
  <g stroke="var(--cd)" stroke-width="1.6" opacity=".55" stroke-linecap="round">
    <path d="M56 104 C68 102 82 104 92 110"/><path d="M56 114 C68 112 82 114 92 120"/><path d="M56 124 C68 122 82 124 92 130"/>
    <path d="M144 104 C132 102 118 104 108 110"/><path d="M144 114 C132 112 118 114 108 120"/><path d="M144 124 C132 122 118 124 108 130"/>
  </g>
  <!-- faixa -->
  <path d="M42 172 H158 L150 186 L158 200 H42 L50 186 Z" fill="var(--c2)"/>
  <text x="100" y="190.5" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="12" letter-spacing="1.5" fill="var(--cd)">CGCF</text>
</symbol>`;

const CANTO_SYMBOL = `<symbol id="canto" viewBox="0 0 74 74">
  <path d="M2 2 H46 M2 2 V46" stroke="var(--cd)" stroke-width="4" fill="none"/>
  <path d="M12 12 H34 M12 12 V34" stroke="var(--c1)" stroke-width="2.5" fill="none"/>
  <circle cx="22" cy="22" r="4.5" fill="var(--c2)" stroke="var(--cd)" stroke-width="1.5"/>
</symbol>`;

export const CERT_CSS = `
.cert, .cert * { -webkit-print-color-adjust: exact; print-color-adjust: exact; box-sizing: border-box; }
.cert { --c1:#38BDF8; --cd:#0369A1; --c2:#FDE68A; position: relative; width: ${CERT_W}px; height: ${CERT_H}px; background: #fffdf8; color: #1e293b; overflow: hidden;
        font-family: "Playfair Display", Georgia, serif; text-align: left; line-height: normal; }
.cert .moldura { position: absolute; inset: 14px; border: 6px solid var(--cd); }
.cert .moldura::before { content: ""; position: absolute; inset: 6px; border: 2px solid var(--c1); }
.cert .moldura::after { content: ""; position: absolute; inset: 14px; border: 1px solid var(--cd); opacity: .55; }
.cert .canto { position: absolute; width: 74px; height: 74px; z-index: 2; }
.cert .canto svg { width: 100%; height: 100%; display: block; }
.cert .c-tl { top: 18px; left: 18px; } .cert .c-tr { top: 18px; right: 18px; transform: scaleX(-1); }
.cert .c-bl { bottom: 18px; left: 18px; transform: scaleY(-1); } .cert .c-br { bottom: 18px; right: 18px; transform: scale(-1,-1); }
.cert .faixa-topo { position: absolute; top: 14px; left: 14px; right: 14px; height: 10px; background: linear-gradient(90deg, var(--cd), var(--c1), var(--cd)); }
.cert .marca { position: absolute; left: 50%; top: 50%; width: 470px; height: 507px; transform: translate(-50%,-50%); opacity: .05; pointer-events: none; display: block; }
.cert .conteudo { position: absolute; inset: 44px 70px 40px; display: flex; flex-direction: column; align-items: center; text-align: center; }
.cert .brasao-topo { width: 84px; height: 94px; margin-top: 2px; filter: drop-shadow(0 2px 3px rgba(0,0,0,.25)); display: block; }
.cert .inst { font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 13px; letter-spacing: .22em; color: var(--cd); margin-top: 6px; }
.cert .inst2 { font-family: Inter, sans-serif; font-size: 10.5px; letter-spacing: .08em; text-transform: uppercase; color: #64748b; margin-top: 3px; }
.cert .titulo { font-family: Cinzel, Georgia, serif; font-weight: 700; font-size: 50px; letter-spacing: .14em; margin: 14px 0 0; color: var(--cd); line-height: 1; }
.cert .sub { font-family: Inter, sans-serif; font-size: 11px; letter-spacing: .3em; text-transform: uppercase; color: #64748b; margin-top: 8px; }
.cert .patente { display: inline-flex; align-items: center; gap: 12px; margin-top: 14px; padding: 6px 22px 6px 14px; border-radius: 999px; background: var(--cd); color: #fff;
                 font-family: Cinzel, Georgia, serif; font-weight: 700; letter-spacing: .14em; font-size: 13px; text-transform: uppercase; border: 2px solid var(--c1); }
.cert .patente .emb { height: 24px; display: flex; align-items: center; }
.cert .patente .emb svg { height: 100%; width: auto; display: block; }
.cert .certifica { font-style: italic; font-size: 16px; color: #475569; margin-top: 16px; }
.cert .aluno { font-family: "Great Vibes", "Brush Script MT", cursive; line-height: 1.05; color: #0f172a; margin-top: 2px; border-bottom: 1.5px solid var(--c1); padding: 0 40px 2px; min-width: 460px; max-width: 940px; }
.cert .texto { font-size: 16.5px; line-height: 1.55; color: #334155; max-width: 800px; margin-top: 12px; }
.cert .texto b { color: var(--cd); }
.cert .lista { font-family: Inter, sans-serif; font-size: 10.5px; line-height: 1.45; color: #64748b; max-width: 820px; margin-top: 8px; }
.cert .rodape { position: absolute; left: 0; right: 0; bottom: 0; height: 168px; display: grid; grid-template-columns: 270px 1fr 1fr; column-gap: 28px; align-items: end; }
.cert .qrbloco { display: flex; gap: 10px; align-items: flex-end; text-align: left; }
.cert .qrbloco .qr { width: 96px; height: 96px; padding: 4px; background: #fff; border: 1px solid #cbd5e1; flex: none; }
.cert .qrbloco .qr svg { width: 100%; height: 100%; display: block; }
.cert .qrbloco .cod { font-family: Inter, sans-serif; font-size: 9px; line-height: 1.4; color: #64748b; padding-bottom: 2px; width: 130px; }
.cert .qrbloco .cod b { display: block; white-space: nowrap; font-size: 11px; color: #0f172a; letter-spacing: .04em; margin-bottom: 2px; }
.cert .assina { text-align: center; padding-bottom: 2px; }
.cert .assina .rubrica { height: 52px; display: flex; align-items: flex-end; justify-content: center; line-height: 1; white-space: nowrap; overflow: hidden; color: #0f172a; }
.cert .assina .rubrica.aluno-r { font-family: "Great Vibes", cursive; }
.cert .assina .rubrica.mentor { font-family: "Homemade Apple", "Brush Script MT", cursive; font-size: 24px; color: var(--cd); }
.cert .assina .linha { border-top: 1.5px solid #475569; margin: 2px 22px 0; padding-top: 5px; font-family: Inter, sans-serif; font-size: 10.5px; font-weight: 700; color: #1e293b; letter-spacing: .03em; }
.cert .assina .papel { font-family: Inter, sans-serif; font-size: 9.5px; color: #64748b; margin-top: 1px; }
.cert .selo { position: absolute; top: 22px; right: 26px; width: 178px; height: 178px; z-index: 5; transform: rotate(9deg); filter: drop-shadow(2px 5px 5px rgba(0,0,0,.35)); }
`;

// ---------- brasão / cantos (definidos uma única vez no documento) ----------
export function defsSvg() {
    return `<svg id="cert-defs" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>${BRASAO_SYMBOL}${CANTO_SYMBOL}</defs></svg>`;
}

// Injeta fontes, CSS e defs na página atual (idempotente)
export function ensureRecursos() {
    if (!document.getElementById('cert-css')) {
        const l = document.createElement('link'); l.rel = 'stylesheet'; l.href = FONTES; l.id = 'cert-fontes'; document.head.appendChild(l);
        const s = document.createElement('style'); s.id = 'cert-css'; s.textContent = CERT_CSS; document.head.appendChild(s);
    }
    if (!document.getElementById('cert-defs')) document.body.insertAdjacentHTML('beforeend', defsSvg());
}

// ---------- peças ----------
function estrela(cx, cy, R, fill) {
    const p = [];
    for (let k = 0; k < 10; k++) { const r = k % 2 ? R * 0.42 : R, a = -Math.PI / 2 + k * Math.PI / 5; p.push((cx + r * Math.cos(a)).toFixed(1) + ',' + (cy + r * Math.sin(a)).toFixed(1)); }
    return `<polygon points="${p.join(' ')}" fill="${fill}"/>`;
}
export function emblemaSvg(e) {
    const t = e?.t, n = Math.min(3, Math.max(1, parseInt(e?.n, 10) || 1));
    if (t === 'chev') {
        let s = '';
        for (let i = 0; i < n; i++) s += `<polyline points="3,${10 + i * 8} 16,${3 + i * 8} 29,${10 + i * 8}" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>`;
        return `<svg viewBox="0 0 32 ${12 + n * 8}">${s}</svg>`;
    }
    if (t === 'star') {
        let s = ''; for (let i = 0; i < n; i++) s += estrela(11 + i * 18, 11, 9, '#fff');
        return `<svg viewBox="0 0 ${18 * n + 4} 22">${s}</svg>`;
    }
    return `<svg viewBox="0 0 60 26"><g fill="#E6C65C"><path d="M6 20 C0 14 2 6 8 2 C6 8 8 14 14 18 Z"/><path d="M54 20 C60 14 58 6 52 2 C54 8 52 14 46 18 Z"/></g>${estrela(30, 13, 11, '#E6C65C')}</svg>`;
}

const BORDA_SELO = (() => {
    const pts = [];
    for (let i = 0; i < 336; i++) { const a = i / 336 * Math.PI * 2, r = 91 + 5 * Math.cos(a * 28); pts.push((100 + r * Math.cos(a)).toFixed(1) + ',' + (100 + r * Math.sin(a)).toFixed(1)); }
    return 'M' + pts.join(' L') + ' Z';
})();
const METAL = { PRATA: ['#f8fafc', '#cbd5e1', '#64748b'], OURO: ['#fff3b0', '#f2c230', '#9a6b00'] };

export function seloSvg(nivel, media, uid) {
    const n = nivel === 'OURO' ? 'OURO' : 'PRATA', [m1, m2, m3] = METAL[n];
    return `<svg class="selo" viewBox="0 0 200 200" style="--m1:${m1};--m2:${m2};--m3:${m3}">
      <defs>
        <radialGradient id="gS-${uid}" cx="35%" cy="30%" r="85%"><stop offset="0" stop-color="${m1}"/><stop offset=".55" stop-color="${m2}"/><stop offset="1" stop-color="${m3}"/></radialGradient>
        <linearGradient id="gA-${uid}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${m3}"/><stop offset=".5" stop-color="${m1}"/><stop offset="1" stop-color="${m3}"/></linearGradient>
        <path id="aT-${uid}" d="M 36,100 a 64,64 0 1,1 128,0"/><path id="aB-${uid}" d="M 30,100 a 70,70 0 0,0 140,0"/>
      </defs>
      <path d="${BORDA_SELO}" fill="url(#gS-${uid})" stroke="${m3}" stroke-width="1.5"/>
      <circle cx="100" cy="100" r="76" fill="none" stroke="url(#gA-${uid})" stroke-width="3"/>
      <circle cx="100" cy="100" r="52" fill="#fff" fill-opacity=".55" stroke="${m3}" stroke-width="1.2"/>
      <text font-family="Cinzel, Georgia, serif" font-weight="700" font-size="11.5" letter-spacing="2" fill="#1f2937"><textPath href="#aT-${uid}" startOffset="50%" text-anchor="middle">APROVEITAMENTO</textPath></text>
      <text font-family="Cinzel, Georgia, serif" font-weight="700" font-size="11" letter-spacing="2.4" fill="#1f2937"><textPath href="#aB-${uid}" startOffset="50%" text-anchor="middle">ACADEMIA CGCF</textPath></text>
      <g style="--cd:#334155;--c2:#fff8dc;--c1:#334155"><use href="#brasao" x="71" y="50" width="58" height="61"/></g>
      <path d="M50 113 H150 L145 125 L150 137 H50 L55 125 Z" fill="#1f2937"/>
      <text x="100" y="129.5" text-anchor="middle" font-family="Cinzel, Georgia, serif" font-weight="700" font-size="11.5" letter-spacing="1.2" fill="#fff">${n} · ${parseInt(media, 10) || 0}%</text>
    </svg>`;
}

// **negrito** → <b>, depois de escapar tudo
export const formatarTexto = t => esc(t).replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');

let _uid = 0;
export function renderCertificado(s, { qr = '' } = {}) {
    const uid = 'c' + (++_uid);
    const c = s.cores || {};
    const nome = String(s.aluno || '');
    const tamNome = nome.length <= 28 ? 56 : nome.length <= 38 ? 46 : nome.length <= 50 ? 38 : 32;
    const tamRub = nome.length <= 28 ? 30 : nome.length <= 45 ? 24 : 20;
    const ass = s.assinatura || {};
    const lista = Array.isArray(s.lista) ? s.lista.map(esc).join(' · ') : '';
    const estilo = `--c1:${cor(c.c1, '#38BDF8')};--cd:${cor(c.cd, '#0369A1')};--c2:${cor(c.c2, '#FDE68A')}`;
    return `<div class="cert" style="${estilo}">
  <div class="faixa-topo"></div><div class="moldura"></div>
  <div class="canto c-tl"><svg><use href="#canto"/></svg></div><div class="canto c-tr"><svg><use href="#canto"/></svg></div>
  <div class="canto c-bl"><svg><use href="#canto"/></svg></div><div class="canto c-br"><svg><use href="#canto"/></svg></div>
  <svg class="marca" viewBox="-26 -6 252 262"><use href="#brasao"/></svg>
  ${seloSvg(s.selo, s.media, uid)}
  <div class="conteudo">
    <svg class="brasao-topo" viewBox="-26 -6 252 262"><use href="#brasao"/></svg>
    <div class="inst">${esc(s.instituicao || 'ACADEMIA CGCF')}</div>
    <div class="inst2">${esc(s.subinstituicao || '')}</div>
    <div class="titulo">${esc(s.titulo_doc || 'CERTIFICADO')}</div>
    <div class="sub">${esc(s.subtitulo || '')}</div>
    <div class="patente"><span class="emb">${emblemaSvg(s.emblema)}</span><span>${esc(s.patente_rotulo || 'Patente · ')}${esc(s.patente || '')}</span></div>
    <div class="certifica">Certificamos que</div>
    <div class="aluno" style="font-size:${tamNome}px">${esc(nome)}</div>
    <div class="texto">${formatarTexto(s.texto)}</div>
    <div class="lista"><b>${esc(s.lista_rotulo || '')}</b> ${lista}</div>
    <div class="rodape">
      <div class="qrbloco"><div class="qr">${qr}</div><div class="cod"><b>${esc(s.codigo || '')}</b>Autenticidade: leia o QR Code ou informe o código na página de verificação.</div></div>
      <div class="assina"><div class="rubrica aluno-r" style="font-size:${tamRub}px">${esc(nome)}</div><div class="linha">${esc(nome)}</div><div class="papel">Aluno</div></div>
      <div class="assina"><div class="rubrica mentor">${esc(ass.nome || '')}</div><div class="linha">${esc(ass.nome || '')}</div><div class="papel">${esc(ass.papel || '')}</div></div>
    </div>
  </div>
</div>`;
}

// Documento completo para imprimir / salvar em PDF (A4 paisagem, sem margens)
export function documentoImpressao(certHtml, titulo) {
    return `<!DOCTYPE html><html lang="pt-BR"><head><meta charset="utf-8"><title>${esc(titulo || 'Certificado')}</title>
<link href="${FONTES}" rel="stylesheet"><style>${CERT_CSS}
html,body{margin:0;padding:0}
@page{size:A4 landscape;margin:0}
@media screen{body{background:#e2e8f0;display:flex;justify-content:center;padding:16px}}
</style></head><body>${defsSvg()}${certHtml}
<script>(document.fonts&&document.fonts.ready?document.fonts.ready:Promise.resolve()).then(function(){setTimeout(function(){window.print()},500)})<\/script></body></html>`;
}

// Miniatura em escala (largura em px)
export function miniatura(certHtml, largura) {
    const k = largura / CERT_W;
    return `<div style="width:${largura}px;height:${Math.round(CERT_H * k)}px;overflow:hidden;position:relative;border-radius:6px;box-shadow:0 2px 10px rgba(0,0,0,.25)">
      <div style="position:absolute;left:0;top:0;width:${CERT_W}px;height:${CERT_H}px;transform:scale(${k});transform-origin:0 0">${certHtml}</div></div>`;
}

// Monta a URL de verificação (a base vem da configuração; senão, a página ao lado do app)
export function urlVerificacao(codigo, base) {
    let b = (base || '').trim();
    if (!b) { const u = new URL('verificar.html', location.href); u.search = ''; u.hash = ''; b = u.href; }
    return b + (b.includes('?') ? '&' : '?') + 'c=' + encodeURIComponent(codigo);
}
