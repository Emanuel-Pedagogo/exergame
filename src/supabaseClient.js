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
