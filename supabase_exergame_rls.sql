-- ============================================================================
-- EXERGAME — Row Level Security
-- Regra de ouro: o aluno NUNCA escreve direto em execucoes_*; toda gravação
-- passa pelas RPCs SECURITY DEFINER de supabase_exergame_rpc.sql. E o aluno
-- NUNCA lê public.exergame_alternativas (é lá que mora o gabarito).
-- ============================================================================

-- ------------------------------------------------------------- helpers ----
-- SECURITY DEFINER para poder ler profiles sem disparar recursão nas policies
-- que usam estas funções.
create or replace function public.exergame_perfil()
returns text
language sql
stable
security definer
set search_path = public
as $$ select perfil from public.exergame_profiles where id = auth.uid() $$;

create or replace function public.exergame_turma()
returns uuid
language sql
stable
security definer
set search_path = public
as $$ select turma_id from public.exergame_profiles where id = auth.uid() $$;

create or replace function public.exergame_eh_docente()
returns boolean
language sql
stable
security definer
set search_path = public
as $$ select coalesce(public.exergame_perfil() in ('professor', 'gestor'), false) $$;

alter table public.exergame_turmas             enable row level security;
alter table public.exergame_profiles           enable row level security;
alter table public.exergame_listas             enable row level security;
alter table public.exergame_questoes           enable row level security;
alter table public.exergame_alternativas       enable row level security;
alter table public.exergame_execucoes_lista    enable row level security;
alter table public.exergame_execucoes_questao  enable row level security;

-- --------------------------------------------------------------- turmas ---
drop policy if exists turmas_select on public.exergame_turmas;
-- anon também lê: a tela de cadastro do aluno precisa listar as turmas.
create policy turmas_select on public.exergame_turmas
  for select to anon, authenticated using (true);

drop policy if exists turmas_write on public.exergame_turmas;
create policy turmas_write on public.exergame_turmas
  for all to authenticated
  using (public.exergame_eh_docente())
  with check (public.exergame_eh_docente());

-- ------------------------------------------------------------- profiles ---
drop policy if exists profiles_select on public.exergame_profiles;
create policy profiles_select on public.exergame_profiles
  for select to authenticated
  using (id = auth.uid() or public.exergame_eh_docente());

drop policy if exists profiles_update_self on public.exergame_profiles;
create policy profiles_update_self on public.exergame_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and perfil = public.exergame_perfil());

drop policy if exists profiles_update_docente on public.exergame_profiles;
create policy profiles_update_docente on public.exergame_profiles
  for update to authenticated
  using (public.exergame_eh_docente())
  with check (public.exergame_eh_docente());

-- --------------------------------------------------------------- listas ---
drop policy if exists listas_select on public.exergame_listas;
create policy listas_select on public.exergame_listas
  for select to authenticated
  using (
    professor_id = auth.uid()
    or public.exergame_perfil() = 'gestor'
    or (ativa and (turma_id is null or turma_id = public.exergame_turma()))
  );

drop policy if exists listas_write on public.exergame_listas;
create policy listas_write on public.exergame_listas
  for all to authenticated
  using (professor_id = auth.uid())
  with check (professor_id = auth.uid() and public.exergame_eh_docente());

-- ------------------------------------------------------------- questoes ---
-- Enunciado é visível para quem enxerga a lista; o gabarito não está aqui.
drop policy if exists questoes_select on public.exergame_questoes;
create policy questoes_select on public.exergame_questoes
  for select to authenticated
  using (exists (select 1 from public.exergame_listas l where l.id = lista_id));

drop policy if exists questoes_write on public.exergame_questoes;
create policy questoes_write on public.exergame_questoes
  for all to authenticated
  using (exists (select 1 from public.exergame_listas l
                 where l.id = lista_id and l.professor_id = auth.uid()))
  with check (exists (select 1 from public.exergame_listas l
                      where l.id = lista_id and l.professor_id = auth.uid()));

-- --------------------------------------------------------- alternativas ---
-- Só o professor dono (e o gestor) leem esta tabela — ela contém `correta`.
drop policy if exists alternativas_select on public.exergame_alternativas;
create policy alternativas_select on public.exergame_alternativas
  for select to authenticated
  using (
    public.exergame_perfil() = 'gestor'
    or exists (select 1 from public.exergame_questoes q
               join public.exergame_listas l on l.id = q.lista_id
               where q.id = questao_id and l.professor_id = auth.uid())
  );

drop policy if exists alternativas_write on public.exergame_alternativas;
create policy alternativas_write on public.exergame_alternativas
  for all to authenticated
  using (exists (select 1 from public.exergame_questoes q
                 join public.exergame_listas l on l.id = q.lista_id
                 where q.id = questao_id and l.professor_id = auth.uid()))
  with check (exists (select 1 from public.exergame_questoes q
                      join public.exergame_listas l on l.id = q.lista_id
                      where q.id = questao_id and l.professor_id = auth.uid()));

-- ------------------------------------------------------ execucoes_lista ---
-- Somente leitura para o cliente. Escrita: apenas RPCs SECURITY DEFINER.
drop policy if exists execucoes_lista_select on public.exergame_execucoes_lista;
create policy execucoes_lista_select on public.exergame_execucoes_lista
  for select to authenticated
  using (
    aluno_id = auth.uid()
    or public.exergame_perfil() = 'gestor'
    or exists (select 1 from public.exergame_listas l
               where l.id = lista_id and l.professor_id = auth.uid())
  );

-- ---------------------------------------------------- execucoes_questao ---
drop policy if exists execucoes_questao_select on public.exergame_execucoes_questao;
create policy execucoes_questao_select on public.exergame_execucoes_questao
  for select to authenticated
  using (exists (
    select 1 from public.exergame_execucoes_lista e
    where e.id = execucao_id
      and (
        e.aluno_id = auth.uid()
        or public.exergame_perfil() = 'gestor'
        or exists (select 1 from public.exergame_listas l
                   where l.id = e.lista_id and l.professor_id = auth.uid())
      )
  ));
