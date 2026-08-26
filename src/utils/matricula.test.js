import { describe, it, expect } from 'vitest';
import { problemaNaMatricula, matriculaParaEmail } from '../supabaseClient';

describe('problemaNaMatricula', () => {
  it('aceita matrícula numérica comum', () => {
    expect(problemaNaMatricula('20260017')).toBeNull();
  });

  it('aceita letras, ponto, hífen e underscore', () => {
    expect(problemaNaMatricula('5A-017')).toBeNull();
    expect(problemaNaMatricula('turma.017')).toBeNull();
    expect(problemaNaMatricula('aluno_017')).toBeNull();
  });

  it('ignora espaços nas pontas', () => {
    expect(problemaNaMatricula('  20260017  ')).toBeNull();
  });

  it('cobra o preenchimento', () => {
    expect(problemaNaMatricula('')).toMatch(/informe/i);
    expect(problemaNaMatricula('   ')).toMatch(/informe/i);
    expect(problemaNaMatricula(null)).toMatch(/informe/i);
    expect(problemaNaMatricula(undefined)).toMatch(/informe/i);
  });

  // O caso que gerou o erro em inglês: e-mail digitado no campo Matrícula
  // virava "fulano@gmail.com@alunos.exergame.app".
  it('reconhece e-mail e aponta a aba do professor', () => {
    const msg = problemaNaMatricula('emanuel.pereira@gmail.com');
    expect(msg).toMatch(/e-mail/i);
    expect(msg).toMatch(/professor/i);
  });

  it('recusa espaço no meio', () => {
    expect(problemaNaMatricula('2026 0017')).toMatch(/espaço/i);
  });

  it('recusa acento, que quebraria o e-mail sintético', () => {
    expect(problemaNaMatricula('joão')).toMatch(/letras e números/i);
  });
});

describe('matriculaParaEmail', () => {
  it('monta o e-mail sintético em minúsculas', () => {
    expect(matriculaParaEmail('20260017')).toBe('20260017@alunos.exergame.app');
    expect(matriculaParaEmail(' 5A-017 ')).toBe('5a-017@alunos.exergame.app');
  });

  it('gera exatamente um @ para toda matrícula aprovada', () => {
    for (const m of ['20260017', '5A-017', 'turma.017', 'aluno_017']) {
      expect(problemaNaMatricula(m)).toBeNull();
      expect(matriculaParaEmail(m).split('@')).toHaveLength(2);
    }
  });
});
