-- ============================================================================
-- EXERGAME — escola como raiz (multi-escola / produto)
--
-- Até aqui o sistema tinha um dono só, e as permissões perguntavam apenas
-- "é docente?". Isso basta enquanto o app é de uma escola. No momento em que
-- houver duas escolas clientes, a mesma pergunta deixa a professora da escola A
-- ver os alunos da escola B — dados de menores, entre clientes diferentes.
--
-- Agora tudo pendura em `exergame_escolas`, e a pergunta vira
-- "é docente DESTA escola?". Este arquivo cria a estrutura e migra o que existe;
-- as policies reescritas estão em supabase_exergame_rls_escolas.sql.
--
-- Um professor pode ter vínculo com várias escolas (realidade comum no Brasil),
-- por isso `exergame_vinculos` é N:N e não uma coluna em profiles.
-- ============================================================================

create table if not exists public.exergame_escolas (
  id         uuid primary key default gen_random_uuid(),
  nome       text not null,
  cidade     text,
  uf         text,
  criado_por uuid references public.exergame_profiles(id) on delete set null,
  criado_em  timestamptz not null default now()
);

create table if not exists public.exergame_vinculos (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.exergame_profiles(id) on delete cascade,
  escola_id  uuid not null references public.exergame_escolas(id) on delete cascade,
  papel      text not null default 'professor' check (papel in ('professor', 'gestor')),
  criado_em  timestamptz not null default now(),
  unique (profile_id, escola_id)
);

comment on table public.exergame_vinculos is
  'Quem trabalha em qual escola. Quem cria a escola entra como gestor dela.';

create table if not exists public.exergame_disciplinas (
  id        uuid primary key default gen_random_uuid(),
  escola_id uuid not null references public.exergame_escolas(id) on delete cascade,
  nome      text not null,
  criado_em timestamptz not null default now(),
  unique (escola_id, nome)
);

create index if not exists exergame_vinculos_profile_idx on public.exergame_vinculos (profile_id);
create index if not exists exergame_disciplinas_escola_idx on public.exergame_disciplinas (escola_id);

alter table public.exergame_turmas
  add column if not exists escola_id uuid references public.exergame_escolas(id) on delete cascade;

-- A lista guarda a escola mesmo tendo turma: turma_id nulo significa
-- "todas as turmas desta escola", e sem escola_id isso não teria fronteira.
alter table public.exergame_listas
  add column if not exists escola_id uuid references public.exergame_escolas(id) on delete cascade;
alter table public.exergame_listas
  add column if not exists disciplina_id uuid references public.exergame_disciplinas(id) on delete set null;

create index if not exists exergame_turmas_escola_idx on public.exergame_turmas (escola_id);
create index if not exists exergame_listas_escola_idx on public.exergame_listas (escola_id);

-- ------------------------------------------- quem sou eu, em qual escola ----
-- SECURITY DEFINER: são usadas dentro das policies e não podem disparar
-- recursão ao ler as próprias tabelas protegidas.
create or replace function public.exergame_minhas_escolas()
returns setof uuid
language sql stable security definer set search_path = public
as $$ select escola_id from public.exergame_vinculos where profile_id = auth.uid() $$;

create or replace function public.exergame_na_escola(p_escola_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.exergame_vinculos
     where profile_id = auth.uid() and escola_id = p_escola_id
  )
$$;

create or replace function public.exergame_gestor_da_escola(p_escola_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.exergame_vinculos
     where profile_id = auth.uid() and escola_id = p_escola_id and papel = 'gestor'
  )
$$;

/** Escola do aluno logado, deduzida da turma dele. */
create or replace function public.exergame_escola_do_aluno()
returns uuid
language sql stable security definer set search_path = public
as $$
  select t.escola_id
    from public.exergame_profiles p
    join public.exergame_turmas t on t.id = p.turma_id
   where p.id = auth.uid()
$$;

-- ------------------------------------------------- migração do que existe ---
-- Tudo que havia antes pertencia a uma escola só. Cria essa escola a partir do
-- campo de texto `exergame_turmas.escola`, liga as turmas e listas nela, e
-- transforma as disciplinas (texto livre) em cadastro.
do $$
declare
  v_escola uuid;
  v_prof   uuid;
  v_nome   text;
begin
  if exists (select 1 from public.exergame_escolas) then
    return;  -- já migrado
  end if;

  select id into v_prof
    from public.exergame_profiles
   where perfil in ('professor', 'gestor')
   order by criado_em
   limit 1;

  select coalesce(max(escola), 'Minha escola') into v_nome
    from public.exergame_turmas
   where escola is not null;

  insert into public.exergame_escolas (nome, criado_por)
  values (coalesce(v_nome, 'Minha escola'), v_prof)
  returning id into v_escola;

  -- Todo docente existente vira gestor da escola migrada: antes eles já tinham
  -- poder total, então rebaixar aqui tiraria acesso de quem já usava.
  insert into public.exergame_vinculos (profile_id, escola_id, papel)
  select id, v_escola, 'gestor'
    from public.exergame_profiles
   where perfil in ('professor', 'gestor')
  on conflict (profile_id, escola_id) do nothing;

  update public.exergame_turmas set escola_id = v_escola where escola_id is null;

  insert into public.exergame_disciplinas (escola_id, nome)
  select distinct v_escola, trim(l.disciplina)
    from public.exergame_listas l
   where nullif(trim(coalesce(l.disciplina, '')), '') is not null
  on conflict (escola_id, nome) do nothing;

  update public.exergame_listas l
     set escola_id = v_escola,
         disciplina_id = (
           select d.id from public.exergame_disciplinas d
            where d.escola_id = v_escola and d.nome = trim(l.disciplina)
         )
   where l.escola_id is null;
end $$;

-- Depois da migração não faz sentido turma sem escola.
alter table public.exergame_turmas alter column escola_id set not null;
alter table public.exergame_listas alter column escola_id set not null;
