/** Formata segundos como "1m 05s" (ou "42s" quando não chega a um minuto). */
export function formatarTempo(segundos) {
  const total = Math.max(0, Math.round(segundos ?? 0));
  const min = Math.floor(total / 60);
  const seg = total % 60;
  if (!min) return `${seg}s`;
  return `${min}m ${String(seg).padStart(2, '0')}s`;
}

export function formatarData(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export const MEDALHAS = ['🥇', '🥈', '🥉'];

export function medalha(posicao) {
  return MEDALHAS[posicao - 1] ?? `${posicao}º`;
}
