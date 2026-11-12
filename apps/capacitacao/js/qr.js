// =====================================================================
// Gerador de QR Code (sem dependências) – modo byte, correção M, versões 1 a 10
// (até 213 bytes). Suficiente para a URL de verificação do certificado.
// Validado contra a biblioteca "qrcode" do Python, matriz a matriz, nas 8 máscaras.
// =====================================================================
const EC_M = [ // [codewordsTotais, ecPorBloco, [[nBlocos, dadosPorBloco], ...]]
    null,
    [26, 10, [[1, 16]]], [44, 16, [[1, 28]]], [70, 26, [[1, 44]]], [100, 18, [[2, 32]]],
    [134, 24, [[2, 43]]], [172, 16, [[4, 27]]], [196, 18, [[4, 31]]],
    [242, 22, [[2, 38], [2, 39]]], [292, 22, [[3, 36], [2, 37]]], [346, 26, [[4, 43], [1, 44]]]
];
const ALIGN = [null, [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42], [6, 26, 46], [6, 28, 50]];

// ---------- Reed-Solomon (GF(256), polinômio 0x11D) ----------
const EXP = new Array(512), LOG = new Array(256);
(() => { let x = 1; for (let i = 0; i < 255; i++) { EXP[i] = x; LOG[x] = i; x <<= 1; if (x & 256) x ^= 0x11D; } for (let i = 255; i < 512; i++) EXP[i] = EXP[i - 255]; })();
const gmul = (a, b) => (a === 0 || b === 0) ? 0 : EXP[LOG[a] + LOG[b]];
function rsDivisor(grau) {
    const r = new Array(grau).fill(0); r[grau - 1] = 1; let raiz = 1;
    for (let i = 0; i < grau; i++) {
        for (let j = 0; j < grau; j++) { r[j] = gmul(r[j], raiz); if (j + 1 < grau) r[j] ^= r[j + 1]; }
        raiz = gmul(raiz, 2);
    }
    return r;
}
function rsResto(dados, divisor) {
    const r = new Array(divisor.length).fill(0);
    for (const b of dados) {
        const f = b ^ r.shift(); r.push(0);
        divisor.forEach((c, i) => { r[i] ^= gmul(c, f); });
    }
    return r;
}

// ---------- Dados ----------
function escolherVersao(n) {
    for (let v = 1; v <= 10; v++) {
        const dados = EC_M[v][2].reduce((s, [q, d]) => s + q * d, 0);
        const bitsCont = v <= 9 ? 8 : 16;
        if (n * 8 + 4 + bitsCont <= dados * 8) return v;
    }
    throw new Error('Texto longo demais para o QR Code (máximo 213 bytes).');
}
function codewords(bytes, v) {
    const [total, ecLen, grupos] = EC_M[v];
    const nDados = grupos.reduce((s, [q, d]) => s + q * d, 0);
    const bits = [];
    const put = (val, n) => { for (let i = n - 1; i >= 0; i--) bits.push((val >>> i) & 1); };
    put(0b0100, 4); put(bytes.length, v <= 9 ? 8 : 16);
    bytes.forEach(b => put(b, 8));
    const cap = nDados * 8;
    put(0, Math.min(4, cap - bits.length));
    while (bits.length % 8) bits.push(0);
    for (let pad = 0xEC; bits.length < cap; pad ^= 0xEC ^ 0x11) put(pad, 8);
    const dados = []; for (let i = 0; i < bits.length; i += 8) dados.push(parseInt(bits.slice(i, i + 8).join(''), 2));
    // blocos
    const blocos = []; let pos = 0;
    for (const [q, d] of grupos) for (let k = 0; k < q; k++) { blocos.push(dados.slice(pos, pos + d)); pos += d; }
    const div = rsDivisor(ecLen);
    const eccs = blocos.map(b => rsResto(b, div));
    const out = [];
    const maxD = Math.max(...blocos.map(b => b.length));
    for (let i = 0; i < maxD; i++) blocos.forEach(b => { if (i < b.length) out.push(b[i]); });
    for (let i = 0; i < ecLen; i++) eccs.forEach(e => out.push(e[i]));
    if (out.length !== total) throw new Error('Erro interno no QR (tamanho).');
    return out;
}

// ---------- Matriz ----------
const bit = (x, i) => ((x >>> i) & 1) !== 0;
function montar(v, cw, mascara) {
    const n = 17 + 4 * v;
    const M = Array.from({ length: n }, () => new Array(n).fill(false));
    const F = Array.from({ length: n }, () => new Array(n).fill(false));
    const set = (x, y, c) => { if (x >= 0 && x < n && y >= 0 && y < n) { M[y][x] = c; F[y][x] = true; } };
    for (let i = 0; i < n; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
    const finder = (cx, cy) => { for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) { const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx + dx, cy + dy, d !== 2 && d !== 4); } };
    finder(3, 3); finder(n - 4, 3); finder(3, n - 4);
    const pos = ALIGN[v];
    for (let i = 0; i < pos.length; i++) for (let j = 0; j < pos.length; j++) {
        if ((i === 0 && j === 0) || (i === 0 && j === pos.length - 1) || (i === pos.length - 1 && j === 0)) continue;
        for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(pos[i] + dx, pos[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
    }
    const formato = (m) => {
        const data = (0 << 3) | m;                  // nível M = 00
        let rem = data; for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
        const bits = ((data << 10) | rem) ^ 0x5412;
        for (let i = 0; i <= 5; i++) set(8, i, bit(bits, i));
        set(8, 7, bit(bits, 6)); set(8, 8, bit(bits, 7)); set(7, 8, bit(bits, 8));
        for (let i = 9; i < 15; i++) set(14 - i, 8, bit(bits, i));
        for (let i = 0; i < 8; i++) set(n - 1 - i, 8, bit(bits, i));
        for (let i = 8; i < 15; i++) set(8, n - 15 + i, bit(bits, i));
        set(8, n - 8, true);
    };
    formato(0);   // reserva as áreas (sobrescrito depois)
    if (v >= 7) {
        let rem = v; for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1F25);
        const bits = (v << 12) | rem;
        for (let i = 0; i < 18; i++) { const a = n - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, bit(bits, i)); set(b, a, bit(bits, i)); }
    }
    // dados em zigue-zague
    let k = 0;
    for (let dir = n - 1; dir >= 1; dir -= 2) {
        if (dir === 6) dir = 5;
        for (let vert = 0; vert < n; vert++) for (let j = 0; j < 2; j++) {
            const x = dir - j, sobe = ((dir + 1) & 2) === 0, y = sobe ? n - 1 - vert : vert;
            if (!F[y][x] && k < cw.length * 8) { M[y][x] = bit(cw[k >>> 3], 7 - (k & 7)); k++; }
        }
    }
    const inverte = [(x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
        (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => (x * y) % 2 + (x * y) % 3 === 0,
        (x, y) => ((x * y) % 2 + (x * y) % 3) % 2 === 0, (x, y) => ((x + y) % 2 + (x * y) % 3) % 2 === 0];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (!F[y][x] && inverte[mascara](x, y)) M[y][x] = !M[y][x];
    formato(mascara);
    return M;
}
function penalidade(M) {
    const n = M.length; let p = 0;
    const linhas = [...M, ...Array.from({ length: n }, (_, x) => M.map(r => r[x]))];
    for (const l of linhas) {
        let run = 1;
        for (let i = 1; i <= n; i++) { if (i < n && l[i] === l[i - 1]) run++; else { if (run >= 5) p += 3 + run - 5; run = 1; } }
        const s = l.map(c => c ? 1 : 0).join('');
        for (const padrao of ['10111010000', '00001011101']) { let i = -1; while ((i = s.indexOf(padrao, i + 1)) !== -1) p += 40; }
    }
    for (let y = 0; y < n - 1; y++) for (let x = 0; x < n - 1; x++) { const c = M[y][x]; if (c === M[y][x + 1] && c === M[y + 1][x] && c === M[y + 1][x + 1]) p += 3; }
    const escuros = M.reduce((s, r) => s + r.filter(Boolean).length, 0);
    p += 10 * Math.floor(Math.abs(escuros * 20 - n * n * 10) / (n * n));
    return p;
}

export function qrMatriz(texto, { mascara } = {}) {
    const bytes = Array.from(new TextEncoder().encode(texto));
    const v = escolherVersao(bytes.length);
    const cw = codewords(bytes, v);
    if (mascara != null) return montar(v, cw, mascara);
    let melhor = null, pior = Infinity;
    for (let m = 0; m < 8; m++) { const M = montar(v, cw, m); const p = penalidade(M); if (p < pior) { pior = p; melhor = M; } }
    return melhor;
}

// SVG pronto (com zona de silêncio de 'margem' módulos)
export function qrSvg(texto, { margem = 0 } = {}) {
    const M = qrMatriz(texto), n = M.length, t = n + margem * 2;
    let d = '';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (M[y][x]) d += `M${x + margem} ${y + margem}h1v1h-1z`;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${t} ${t}" shape-rendering="crispEdges"><rect width="${t}" height="${t}" fill="#fff"/><path d="${d}" fill="#111"/></svg>`;
}
