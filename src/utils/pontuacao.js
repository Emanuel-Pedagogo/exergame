/**
 * Regras de pontuação do Exergame — espelho em JS da função SQL
 * public.exergame_pontos_questao(). O servidor é a fonte da verdade:
 * estas funções servem para prévia na tela e para os testes.
 *
 *   P  = X - T - QT   (piso em 0)
 *   T  = 0 (<10s) | 10 (10s a 20s) | 20 (>20s)
 *   QT = 0 (<2 tentativas) | 20 (>= 2 tentativas)
 *   PT = soma dos P da lista
 */

export const PENALIDADE_TEMPO = { rapido: 0, medio: 10, lento: 20 };
export const PENALIDADE_TENTATIVAS = 20;

export const X_POR_DIFICULDADE = { facil: 100, media: 150, dificil: 200 };

export const ROTULO_DIFICULDADE = {
  facil: 'Fácil',
  media: 'Média',
  dificil: 'Difícil',
};

export function penalidadeTempo(tempoSeg) {
  if (tempoSeg < 10) return PENALIDADE_TEMPO.rapido;
  if (tempoSeg <= 20) return PENALIDADE_TEMPO.medio;
  return PENALIDADE_TEMPO.lento;
}

export function penalidadeTentativas(tentativas) {
  return tentativas >= 2 ? PENALIDADE_TENTATIVAS : 0;
}

export function pontosQuestao(xValor, tempoSeg, tentativas) {
  const bruto = xValor - penalidadeTempo(tempoSeg) - penalidadeTentativas(tentativas);
  return Math.max(0, bruto);
}

/** PT da lista: soma dos P de cada questão respondida corretamente. */
export function pontuacaoTotal(execucoesQuestao = []) {
  return execucoesQuestao.reduce((soma, eq) => soma + (eq.acertou ? eq.p_final ?? 0 : 0), 0);
}

/**
 * Ordena o ranking pelo critério do projeto:
 * maior PT > menor tempo total > menos tentativas.
 */
export function ordenarRanking(linhas = []) {
  return [...linhas].sort(
    (a, b) =>
      b.pt_total - a.pt_total ||
      a.tempo_total_seg - b.tempo_total_seg ||
      a.tentativas_totais - b.tentativas_totais,
  );
}
