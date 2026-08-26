import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  // Falha cedo e com mensagem clara — melhor do que um 401 opaco na primeira query.
  console.error(
    'Configure VITE_SUPABASE_URL e VITE_SUPABASE_ANON_KEY em .env.local (veja .env.example).',
  );
}

export const supabase = createClient(supabaseUrl ?? '', supabaseAnonKey ?? '');

/** Domínio sintético que transforma a matrícula do aluno em e-mail do Auth. */
export const MATRICULA_DOMAIN =
  import.meta.env.VITE_MATRICULA_EMAIL_DOMAIN || 'alunos.exergame.app';

/** matrícula "20260017" -> "20260017@alunos.exergame.app" */
export function matriculaParaEmail(matricula) {
  return `${String(matricula).trim().toLowerCase()}@${MATRICULA_DOMAIN}`;
}

/**
 * Valida a matrícula ANTES de virar e-mail sintético.
 *
 * Sem isto, "fulano@gmail.com" no campo Matrícula produzia
 * "fulano@gmail.com@alunos.exergame.app" — dois @, e-mail inválido — e o Auth
 * respondia "Unable to validate email address: invalid format", que não diz
 * nada a um aluno do 5º ano. Acentos e espaços davam no mesmo.
 *
 * @returns {string|null} mensagem do problema, ou null se estiver tudo certo.
 */
export function problemaNaMatricula(matricula) {
  const valor = String(matricula ?? '').trim();

  if (!valor) return 'Informe a matrícula.';
  if (valor.includes('@')) {
    return 'Isso parece um e-mail. O aluno entra com a matrícula — se você é professor, use a aba "Sou professor".';
  }
  if (/\s/.test(valor)) return 'A matrícula não pode ter espaços.';
  if (!/^[a-z0-9._-]+$/i.test(valor)) {
    return 'A matrícula aceita apenas letras e números (sem acentos).';
  }
  return null;
}
