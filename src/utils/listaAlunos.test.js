import { describe, it, expect } from 'vitest';
import { parsearListaAlunos } from './listaAlunos';

const nomesEMatriculas = (texto) =>
  parsearListaAlunos(texto).map(({ nome, matricula }) => ({ nome, matricula }));

describe('parsearListaAlunos', () => {
  it('aceita só o nome, deixando a matrícula para o banco gerar', () => {
    expect(nomesEMatriculas('Ana Clara Souza\nBruno Lima')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '' },
      { nome: 'Bruno Lima', matricula: '' },
    ]);
  });

  it('entende matrícula antes do nome', () => {
    expect(nomesEMatriculas('20260101, Ana Clara Souza')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '20260101' },
    ]);
  });

  it('entende nome antes da matrícula', () => {
    expect(nomesEMatriculas('Ana Clara Souza, 20260101')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '20260101' },
    ]);
  });

  it('aceita ponto e vírgula e tabulação (colado de planilha)', () => {
    expect(nomesEMatriculas('20260101;Ana Clara Souza')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '20260101' },
    ]);
    expect(nomesEMatriculas('20260102\tBruno Lima')).toEqual([
      { nome: 'Bruno Lima', matricula: '20260102' },
    ]);
  });

  it('separa matrícula e nome quando só há espaço entre eles', () => {
    expect(nomesEMatriculas('20260101 Ana Clara Souza')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '20260101' },
    ]);
  });

  it('descarta a numeração da lista de chamada', () => {
    expect(nomesEMatriculas('1. Ana Clara Souza\n2) Bruno Lima\n3 - Carla Menezes')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '' },
      { nome: 'Bruno Lima', matricula: '' },
      { nome: 'Carla Menezes', matricula: '' },
    ]);
  });

  it('não confunde nome composto curto com matrícula', () => {
    expect(nomesEMatriculas('Ana Souza')).toEqual([{ nome: 'Ana Souza', matricula: '' }]);
  });

  it('ignora linhas em branco e espaços sobrando', () => {
    expect(nomesEMatriculas('\n  Ana Clara Souza  \n\n\n  Bruno Lima\n')).toEqual([
      { nome: 'Ana Clara Souza', matricula: '' },
      { nome: 'Bruno Lima', matricula: '' },
    ]);
  });

  it('devolve lista vazia para entrada vazia ou nula', () => {
    expect(parsearListaAlunos('')).toEqual([]);
    expect(parsearListaAlunos('   \n  ')).toEqual([]);
    expect(parsearListaAlunos(null)).toEqual([]);
    expect(parsearListaAlunos(undefined)).toEqual([]);
  });

  it('guarda a linha original para a tela mostrar o que veio de onde', () => {
    expect(parsearListaAlunos('1. Ana, 20260101')[0].linha).toBe('1. Ana, 20260101');
  });

  it('aguenta uma turma inteira de uma vez', () => {
    const turma = Array.from({ length: 30 }, (_, i) => `Aluno ${i + 1}`).join('\n');
    const resultado = parsearListaAlunos(turma);
    expect(resultado).toHaveLength(30);
    expect(resultado.every((a) => a.nome && !a.matricula)).toBe(true);
  });
});
