-- ============================================================================
-- EXERGAME — Row Level Security com isolamento por escola
--
-- Substitui as policies de supabase_exergame_rls.sql. A diferença de fundo:
-- onde antes se perguntava "é docente?", agora se pergunta "é docente DESTA
-- escola?". Sem isso, duas escolas clientes enxergam os alunos uma da outra.
--
-- Furos que este arquivo fecha, todos presentes na versão anterior:
--   1. turmas_select era `using (true)` para anon — o mundo inteiro lia a lista
--      de turmas de todas as escolas, sem sequer estar logado.
--   2. profiles_select liberava todo perfil a qualquer docente.
--   3. profiles_update_docente deixava qualquer docente editar qualquer pessoa.
--   4. o papel 'gestor' era global: via gabarito e resultado de todas as escolas.
--
-- Regras de ouro que continuam valendo: o aluno nunca escreve em execucoes_*
-- (só as RPCs SECURITY DEFINER) e nunca lê exergame_alternativas (o gabarito).
-- ============================================================================

-- ------------------------------------------------------------- helpers -----
-- Concentram a condição composta que várias policies precisam. SECURITY DEFINER
-- para não disparar recursão ao ler as tabelas que elas mesmas protegem.

/** Posso enxergar esta lista? (professor dono, docente da escola, ou aluno dela) */
create or replace function public.exergame_posso_ver_lista(p_lista_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.exergame_listas l
     where l.id = p_lista_id
       and (
         l.professor_id = auth.uid()
         or public.exergame_na_escola(l.escola_id)
         or (
           l.ativa
           and l.escola_id = public.exergame_escola_do_aluno()
           and (l.turma_id is null or l.turma_id = public.exergame_turma())
         )
       )
  )
$$;

/** Posso editar esta lista? Só o professor dono, e só dentro da escola dele. */
create or replace function public.exergame_posso_editar_lista(p_lista_id uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
      from public.exergame_listas l
     where l.id = p_lista_id
       and l.professor_id = auth.uid()
       and public.exergame_na_escola(l.escola_id)
  )
$$;

/** Escola a que esta turma pertence. */
create or replace function public.exergame_escola_da_turma(p_turma_id uuid)
returns uuid
language sql stable security definer set search_path = public
as $$ select escola_id from public.exergame_turmas where id = p_turma_id $$;

alter table public.exergame_escolas     enable row level security;
alter table public.exergame_vinculos    enable row level security;
alter table public.exergame_disciplinas enable row level security;

-- -------------------------------------------------------------- escolas ----
drop policy if exists escolas_select on public.exergame_escolas;
create policy escolas_select on public.exergame_escolas
  for select to authenticated
  using (public.exergame_na_escola(id) or id = public.exergame_escola_do_aluno());

-- Criar escola é por RPC (cria escola + vínculo do criador na mesma transação);
-- sem policy de insert, ninguém cria uma escola solta pelo PostgREST.
drop policy if exists escolas_update on public.exergame_escolas;
create policy escolas_update on public.exergame_escolas
  for update to authenticated
  using (public.exergame_gestor_da_escola(id))
  with check (public.exergame_gestor_da_escola(id));

drop policy if exists escolas_delete on public.exergame_escolas;
create policy escolas_delete on public.exergame_escolas
  for delete to authenticated
  using (public.exergame_gestor_da_escola(id));

-- ------------------------------------------------------------- vinculos ----
drop policy if exists vinculos_select on public.exergame_vinculos;
create policy vinculos_select on public.exergame_vinculos
  for select to authenticated
  using (profile_id = auth.uid() or public.exergame_gestor_da_escola(escola_id));

-- Sair da escola (o próprio) ou tirar alguém dela (gestor).
drop policy if exists vinculos_delete on public.exergame_vinculos;
create policy vinculos_delete on public.exergame_vinculos
  for delete to authenticated
  using (profile_id = auth.uid() or public.exergame_gestor_da_escola(escola_id));

-- ---------------------------------------------------------- disciplinas ----
drop policy if exists disciplinas_select on public.exergame_disciplinas;
create policy disciplinas_select on public.exergame_disciplinas
  for select to authenticated
  using (public.exergame_na_escola(escola_id) or escola_id = public.exergame_escola_do_aluno());

drop policy if exists disciplinas_write on public.exergame_disciplinas;
create policy disciplinas_write on public.exergame_disciplinas
  for all to authenticated
  using (public.exergame_na_escola(escola_id))
  with check (public.exergame_na_escola(escola_id));

-- --------------------------------------------------------------- turmas ----
-- Era `using (true)` para anon: qualquer um lia todas as turmas de todas as
-- escolas. A tela de cadastro do aluno dependia disso; agora a turma do aluno
-- vem do pré-cadastro feito pelo professor, então nada precisa ser público.
drop policy if exists turmas_select on public.exergame_turmas;
create policy turmas_select on public.exergame_turmas
  for select to authenticated
  using (public.exergame_na_escola(escola_id) or id = public.exergame_turma());

drop policy if exists turmas_write on public.exergame_turmas;
create policy turmas_write on public.exergame_turmas
  for all to authenticated
  using (public.exergame_na_escola(escola_id))
  with check (public.exergame_na_escola(escola_id));

-- ------------------------------------------------------------- profiles ----
-- O docente vê apenas quem está nas turmas das escolas dele — não o sistema todo.
drop policy if exists profiles_select on public.exergame_profiles;
create policy profiles_select on public.exergame_profiles
  for select to authenticated
  using (
    id = auth.uid()
    or (turma_id is not null and public.exergame_na_escola(public.exergame_escola_da_turma(turma_id)))
  );

drop policy if exists profiles_update_self on public.exergame_profiles;
create policy profiles_update_self on public.exergame_profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and perfil = public.exergame_perfil());

drop policy if exists profiles_update_docente on public.exergame_profiles;
create policy profiles_update_docente on public.exergame_profiles
  for update to authenticated
  using (
    turma_id is not null
    and public.exergame_na_escola(public.exergame_escola_da_turma(turma_id))
  )
  with check (
    turma_id is not null
    and public.exergame_na_escola(public.exergame_escola_da_turma(turma_id))
  );

-- --------------------------------------------------------------- listas ----
drop policy if exists listas_select on public.exergame_listas;
create policy listas_select on public.exergame_listas
  for select to authenticated
  using (
    professor_id = auth.uid()
    or public.exergame_na_escola(escola_id)
    or (
      ativa
      and escola_id = public.exergame_escola_do_aluno()
      and (turma_id is null or turma_id = public.exergame_turma())
    )
  );

drop policy if exists listas_write on public.exergame_listas;
create policy listas_write on public.exergame_listas
  for all to authenticated
  using (professor_id = auth.uid() and public.exergame_na_escola(escola_id))
  with check (
    professor_id = auth.uid()
    and public.exergame_eh_docente()
    and public.exergame_na_escola(escola_id)
  );

-- ------------------------------------------------------------- questoes ----
drop policy if exists questoes_select on public.exergame_questoes;
create policy questoes_select on public.exergame_questoes
  for select to authenticated
  using (public.exergame_posso_ver_lista(lista_id));

drop policy if exists questoes_write on public.exergame_questoes;
create policy questoes_write on public.exergame_questoes
  for all to authenticated
  using (public.exergame_posso_editar_lista(lista_id))
  with check (public.exergame_posso_editar_lista(lista_id));

-- --------------------------------------------------------- alternativas ----
-- Contém `correta`. Só o professor dono — o gestor deixou de ver o gabarito de
-- todas as escolas, e passa a ver apenas como docente das listas dele.
drop policy if exists alternativas_select on public.exergame_alternativas;
create policy alternativas_select on public.exergame_alternativas
  for select to authenticated
  using (exists (
    select 1 from public.exergame_questoes q
     where q.id = questao_id and public.exergame_posso_editar_lista(q.lista_id)
  ));

drop policy if exists alternativas_write on public.exergame_alternativas;
create policy alternativas_write on public.exergame_alternativas
  for all to authenticated
  using (exists (
    select 1 from public.exergame_questoes q
     where q.id = questao_id and public.exergame_posso_editar_lista(q.lista_id)
  ))
  with check (exists (
    select 1 from public.exergame_questoes q
     where q.id = questao_id and public.exergame_posso_editar_lista(q.lista_id)
  ));

-- ------------------------------------------------------ execucoes_lista ----
drop policy if exists execucoes_lista_select on public.exergame_execucoes_lista;
create policy execucoes_lista_select on public.exergame_execucoes_lista
  for select to authenticated
  using (
    aluno_id = auth.uid()
    or exists (
      select 1 from public.exergame_listas l
       where l.id = lista_id
         and (l.professor_id = auth.uid() or public.exergame_gestor_da_escola(l.escola_id))
    )
  );

-- ---------------------------------------------------- execucoes_questao ----
drop policy if exists execucoes_questao_select on public.exergame_execucoes_questao;
create policy execucoes_questao_select on public.exergame_execucoes_questao
  for select to authenticated
  using (exists (
    select 1 from public.exergame_execucoes_lista e
     where e.id = execucao_id
       and (
         e.aluno_id = auth.uid()
         or exists (
           select 1 from public.exergame_listas l
            where l.id = e.lista_id
              and (l.professor_id = auth.uid() or public.exergame_gestor_da_escola(l.escola_id))
         )
       )
  ));

-- ----------------------------------------------------------- matriculas ----
-- A lista da turma é da escola dona da turma.
drop policy if exists matriculas_docente on public.exergame_matriculas;
create policy matriculas_docente on public.exergame_matriculas
  for all to authenticated
  using (public.exergame_na_escola(public.exergame_escola_da_turma(turma_id)))
  with check (public.exergame_na_escola(public.exergame_escola_da_turma(turma_id)));
