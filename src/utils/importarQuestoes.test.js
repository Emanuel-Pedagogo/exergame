import { describe, it, expect } from 'vitest';
import { parsearQuestoes, questoesValidas, EXEMPLO_IMPORTACAO } from './importarQuestoes';

const simples = `1. Qual é a capital do Brasil?
a) São Paulo
*b) Brasília
c) Rio de Janeiro
d) Salvador`;

describe('parsearQuestoes', () => {
  it('lê uma questão com 4 alternativas e acha a correta', () => {
    const [q] = parsearQuestoes(simples);
    expect(q.enunciado).toBe('Qual é a capital do Brasil?');
    expect(q.alternativas).toHaveLength(4);
    expect(q.alternativas[1]).toEqual({ texto: 'Brasília', correta: true });
    expect(q.alternativas.filter((a) => a.correta)).toHaveLength(1);
    expect(q.problemas).toEqual([]);
  });

  it('não deixa a letra nem a marca sobrarem no texto da alternativa', () => {
    const [q] = parsearQuestoes(simples);
    expect(q.alternativas.map((a) => a.texto)).toEqual([
      'São Paulo',
      'Brasília',
      'Rio de Janeiro',
      'Salvador',
    ]);
  });

  it('aceita a marca de correta no fim da linha', () => {
    const [q] = parsearQuestoes('1. Teste?\na) errada\nb) certa *');
    expect(q.alternativas[1]).toEqual({ texto: 'certa', correta: true });
  });

  it('aceita (x) e [x] como marca', () => {
    const [a] = parsearQuestoes('1. Teste?\na) errada\n(x) b) certa');
    expect(a.alternativas[1].correta).toBe(true);
    const [b] = parsearQuestoes('1. Teste?\na) errada\n[x] b) certa');
    expect(b.alternativas[1].correta).toBe(true);
  });

  it('entende vários jeitos de numerar questão e alternativa', () => {
    const texto = `Questão 1: Primeira?
(a) um *
(b) dois

2 - Segunda?
A. um
B. dois #`;
    const qs = parsearQuestoes(texto);
    expect(qs).toHaveLength(2);
    expect(qs[0].enunciado).toBe('Primeira?');
    expect(qs[1].enunciado).toBe('Segunda?');
    expect(qs[1].alternativas[1].correta).toBe(true);
  });

  it('lê a dificuldade entre colchetes e assume fácil quando não vem', () => {
    const qs = parsearQuestoes(`1. [média] Uma?
a) x *
b) y

2. [difícil] Duas?
a) x *
b) y

3. Três?
a) x *
b) y`);
    expect(qs.map((q) => q.dificuldade)).toEqual(['media', 'dificil', 'facil']);
  });

  it('não confunde colchete do enunciado com dificuldade', () => {
    const [q] = parsearQuestoes('1. [3 + 5] vale quanto?\na) 8 *\nb) 9');
    expect(q.dificuldade).toBe('facil');
    expect(q.enunciado).toBe('[3 + 5] vale quanto?');
  });

  it('junta enunciado quebrado em várias linhas', () => {
    const [q] = parsearQuestoes(`1. Uma comunidade construiu canais
para levar água até a horta.
Sobre isso, é correto dizer:
a) nada *
b) outra coisa`);
    expect(q.enunciado).toBe(
      'Uma comunidade construiu canais para levar água até a horta. Sobre isso, é correto dizer:',
    );
    expect(q.alternativas).toHaveLength(2);
  });

  it('junta alternativa quebrada em várias linhas', () => {
    const [q] = parsearQuestoes(`1. Teste?
a) uma alternativa bem longa
que continua na linha seguinte *
b) curta`);
    expect(q.alternativas[0].texto).toBe(
      'uma alternativa bem longa que continua na linha seguinte',
    );
    expect(q.alternativas[0].correta).toBe(true);
  });

  // O caso que faz um parser ingênuo abrir questão nova no meio da lista:
  // uma alternativa que começa por número.
  it('não abre questão nova quando a alternativa começa com número', () => {
    const [q] = parsearQuestoes(`1. Quanto é 7 x 8?
a) 54
b) 56 *
c) 64`);
    expect(q.alternativas).toHaveLength(3);
    expect(q.alternativas.map((a) => a.texto)).toEqual(['54', '56', '64']);
  });

  it('ignora linhas em branco entre as questões', () => {
    expect(parsearQuestoes(EXEMPLO_IMPORTACAO)).toHaveLength(3);
  });

  it('devolve lista vazia para entrada vazia', () => {
    expect(parsearQuestoes('')).toEqual([]);
    expect(parsearQuestoes(null)).toEqual([]);
    expect(parsearQuestoes('   \n \n ')).toEqual([]);
  });
});

describe('avisos em vez de adivinhação', () => {
  it('avisa quando nenhuma alternativa foi marcada', () => {
    const [q] = parsearQuestoes('1. Teste?\na) um\nb) dois');
    expect(q.problemas).toContain('nenhuma alternativa marcada como correta');
    // e não escolhe uma por conta própria
    expect(q.alternativas.some((a) => a.correta)).toBe(false);
  });

  it('avisa quando há mais de uma correta', () => {
    const [q] = parsearQuestoes('1. Teste?\n*a) um\n*b) dois');
    expect(q.problemas).toContain('mais de uma alternativa marcada como correta');
  });

  it('avisa quando falta alternativa', () => {
    const [q] = parsearQuestoes('1. Teste?\na) só uma *');
    expect(q.problemas).toContain('precisa de pelo menos 2 alternativas');
  });

  it('separa as prontas das que precisam de conserto', () => {
    const qs = parsearQuestoes(`1. Boa?
a) um *
b) dois

2. Ruim?
a) um
b) dois`);
    expect(qs).toHaveLength(2);
    expect(questoesValidas(qs)).toHaveLength(1);
    expect(questoesValidas(qs)[0].enunciado).toBe('Boa?');
  });
});

describe('exemplo que a tela mostra', () => {
  it('é válido de ponta a ponta — senão ensinaria o formato errado', () => {
    const qs = parsearQuestoes(EXEMPLO_IMPORTACAO);
    expect(questoesValidas(qs)).toHaveLength(3);
    expect(qs.map((q) => q.dificuldade)).toEqual(['facil', 'media', 'dificil']);
    expect(qs.map((q) => q.alternativas.find((a) => a.correta)?.texto)).toEqual([
      'Brasília',
      '56',
      '180',
    ]);
  });
});
