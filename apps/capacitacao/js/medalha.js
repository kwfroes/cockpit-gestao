// Regras de estrelas e cores das medalhas (compartilhado entre mapa, módulo e engine)
export function estrelasDoScore(score) {
    if (score == null) return 0;
    if (score >= 0.9) return 3;
    if (score >= 0.7) return 2;
    return 1;
}
export const MEDALHAS = {
    0: { nome: 'Concluído', bg: '#10B981', borda: '#047857' },
    1: { nome: 'Bronze',    bg: '#CD7F32', borda: '#8A5320' },
    2: { nome: 'Prata',     bg: '#AEB6BF', borda: '#6B7480' },
    3: { nome: 'Ouro',      bg: '#F5B301', borda: '#B07F00' }
};
export function htmlEstrelas(n, tamanho = 'text-base') {
    if (!n) return '';
    const cor = MEDALHAS[n].bg;
    return [1, 2, 3].map(i => i <= n
        ? `<span class="${tamanho} leading-none" style="color:${cor};text-shadow:0 1px 0 ${MEDALHAS[n].borda}">★</span>`
        : `<span class="${tamanho} leading-none text-slate-300 dark:text-slate-600">★</span>`).join('');
}
