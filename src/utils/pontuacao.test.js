import { describe, it, expect } from 'vitest';
import {
  penalidadeTempo,
  penalidadeTentativas,
  pontosQuestao,
  pontuacaoTotal,
  ordenarRanking,
} from './pontuacao';

describe('penalidadeTempo', () => {
  it('não penaliza abaixo de 10s', () => {
    expect(penalidadeTempo(0)).toBe(0);
    expect(penalidadeTempo(9)).toBe(0);
  });
  it('penaliza 10 entre 10s e 20s (inclusive)', () => {
    expect(penalidadeTempo(10)).toBe(10);
    expect(penalidadeTempo(20)).toBe(10);
  });
  it('penaliza 20 acima de 20s', () => {
    expect(penalidadeTempo(21)).toBe(20);
    expect(penalidadeTempo(600)).toBe(20);
  });
});

describe('penalidadeTentativas', () => {
  it('não penaliza o acerto de primeira', () => {
    expect(penalidadeTentativas(1)).toBe(0);
  });
  it('penaliza 20 a partir da segunda tentativa', () => {
    expect(penalidadeTentativas(2)).toBe(20);
    expect(penalidadeTentativas(5)).toBe(20);
  });
});

describe('pontosQuestao', () => {
  it('acerto imediato mantém o X integral', () => {
    expect(pontosQuestao(100, 4, 1)).toBe(100);
  });
  it('aplica as duas penalidades juntas', () => {
    expect(pontosQuestao(100, 15, 3)).toBe(70);
    expect(pontosQuestao(200, 45, 2)).toBe(160);
  });
  it('nunca devolve pontuação negativa', () => {
    expect(pontosQuestao(30, 100, 4)).toBe(0);
  });
});

describe('pontuacaoTotal', () => {
  it('soma apenas as questões acertadas', () => {
    const execucoes = [
      { acertou: true, p_final: 100 },
      { acertou: false, p_final: 0 },
      { acertou: true, p_final: 80 },
    ];
    expect(pontuacaoTotal(execucoes)).toBe(180);
  });
  it('lista vazia vale zero', () => {
    expect(pontuacaoTotal()).toBe(0);
  });
});

describe('ordenarRanking', () => {
  it('desempata por tempo e depois por tentativas', () => {
    const linhas = [
      { nome: 'C', pt_total: 300, tempo_total_seg: 40, tentativas_totais: 6 },
      { nome: 'A', pt_total: 300, tempo_total_seg: 40, tentativas_totais: 5 },
      { nome: 'B', pt_total: 300, tempo_total_seg: 30, tentativas_totais: 9 },
      { nome: 'D', pt_total: 420, tempo_total_seg: 90, tentativas_totais: 9 },
    ];
    expect(ordenarRanking(linhas).map((l) => l.nome)).toEqual(['D', 'B', 'A', 'C']);
  });
});
