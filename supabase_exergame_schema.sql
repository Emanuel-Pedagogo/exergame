-- ============================================================================
-- EXERGAME — schema base (tabelas, índices, trigger de perfil)
-- Aplicar uma única vez em um projeto Supabase novo.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------- turmas ---
create table if not exists public.exergame_turmas (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null,
  ano         int  not null default extract(year from now()),
  escola      text,
  criado_em   timestamptz not null default now()
);

-- -------------------------------------------------------------- profiles ---
-- 1:1 com auth.users. Aluno entra por matrícula (convertida em e-mail
-- sintético no cliente); professor/gestor entram por e-mail real.
create table if not exists public.exergame_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  nome        text not null,
  matricula   text unique,
  perfil      text not null default 'aluno'
              check (perfil in ('aluno', 'professor', 'gestor')),
  turma_id    uuid references public.exergame_turmas(id) on delete set null,
  criado_em   timestamptz not null default now()
);

create index if not exists idx_exergame_profiles_turma on public.exergame_profiles(turma_id);

-- Cria o profile automaticamente quando um usuário é criado no Auth.
create or replace function public.exergame_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Este banco é compartilhado com o SACP: só criamos profile para usuários
  -- que se cadastraram PELO Exergame (metadata app = 'exergame').
  if coalesce(new.raw_user_meta_data->>'app', '') <> 'exergame' then
    return new;
  end if;

  insert into public.exergame_profiles (id, nome, matricula, perfil, turma_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'matricula', ''),
    coalesce(new.raw_user_meta_data->>'perfil', 'aluno'),
    nullif(new.raw_user_meta_data->>'turma_id', '')::uuid
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

-- Nome do gatilho com prefixo próprio para não colidir com nada do SACP.
drop trigger if exists on_auth_user_created_exergame on auth.users;
create trigger on_auth_user_created_exergame
  after insert on auth.users
  for each row execute function public.exergame_handle_new_user();

-- ---------------------------------------------------------------- listas ---
create table if not exists public.exergame_listas (
  id           uuid primary key default gen_random_uuid(),
  titulo       text not null,
  disciplina   text not null default 'Matemática',
  professor_id uuid not null references public.exergame_profiles(id) on delete cascade,
  turma_id     uuid references public.exergame_turmas(id) on delete set null,
  ativa        boolean not null default false,
  criado_em    timestamptz not null default now()
);

create index if not exists idx_exergame_listas_professor on public.exergame_listas(professor_id);
create index if not exists idx_exergame_listas_turma_ativa on public.exergame_listas(turma_id, ativa);

-- -------------------------------------------------------------- questoes ---
-- x_valor é o X do enunciado: valor inicial da questão conforme a dificuldade.
create table if not exists public.exergame_questoes (
  id          uuid primary key default gen_random_uuid(),
  lista_id    uuid not null references public.exergame_listas(id) on delete cascade,
  ordem       int  not null default 1,
  enunciado   text not null,
  dificuldade text not null default 'facil'
              check (dificuldade in ('facil', 'media', 'dificil')),
  x_valor     int  not null default 100 check (x_valor > 0),
  criado_em   timestamptz not null default now()
);

create index if not exists idx_exergame_questoes_lista on public.exergame_questoes(lista_id, ordem);

-- ---------------------------------------------------------- alternativas ---
-- A coluna `correta` NUNCA é lida pelo aluno: RLS libera SELECT apenas para o
-- professor dono da lista. O aluno recebe as alternativas sem esse campo,
-- via RPC exergame_obter_questoes().
create table if not exists public.exergame_alternativas (
  id         uuid primary key default gen_random_uuid(),
  questao_id uuid not null references public.exergame_questoes(id) on delete cascade,
  ordem      int  not null default 1,
  texto      text not null,
  correta    boolean not null default false
);

create index if not exists idx_exergame_alternativas_questao on public.exergame_alternativas(questao_id, ordem);

-- ------------------------------------------------------- execucoes_lista ---
create table if not exists public.exergame_execucoes_lista (
  id                uuid primary key default gen_random_uuid(),
  lista_id          uuid not null references public.exergame_listas(id) on delete cascade,
  aluno_id          uuid not null references public.exergame_profiles(id) on delete cascade,
  iniciado_em       timestamptz not null default now(),
  finalizado_em     timestamptz,
  pt_total          int not null default 0,
  tempo_total_seg   int not null default 0,
  tentativas_totais int not null default 0
);

create index if not exists idx_exergame_exec_lista_aluno on public.exergame_execucoes_lista(aluno_id, lista_id);
create index if not exists idx_exergame_exec_lista_ranking
  on public.exergame_execucoes_lista(lista_id, pt_total desc, tempo_total_seg asc)
  where finalizado_em is not null;

-- ----------------------------------------------------- execucoes_questao ---
create table if not exists public.exergame_execucoes_questao (
  id           uuid primary key default gen_random_uuid(),
  execucao_id  uuid not null references public.exergame_execucoes_lista(id) on delete cascade,
  questao_id   uuid not null references public.exergame_questoes(id) on delete cascade,
  tentativas   int not null default 0,
  tempo_seg    int not null default 0,
  p_final      int not null default 0,
  acertou      boolean not null default false,
  iniciada_em  timestamptz,
  respondido_em timestamptz,
  unique (execucao_id, questao_id)
);

create index if not exists idx_exergame_exec_questao_execucao on public.exergame_execucoes_questao(execucao_id);
