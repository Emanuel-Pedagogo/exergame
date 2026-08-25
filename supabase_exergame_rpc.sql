-- ============================================================================
-- EXERGAME — RPCs de execução, pontuação e ranking
-- Toda a pontuação é calculada AQUI, no servidor. O cronômetro do cliente é
-- só exibição: o tempo que vale é o intervalo entre exergame_abrir_questao()
-- e exergame_responder(), medido pelo Postgres.
-- ============================================================================

-- ------------------------------------------------------------- fórmula ----
-- P = X - T - QT   (piso em 0)
--   T  = 0 (<10s) | 10 (10s a 20s) | 20 (>20s)
--   QT = 0 (<2 tentativas) | 20 (>=2 tentativas)
create or replace function public.exergame_pontos_questao(
  p_x_valor int, p_tempo_seg int, p_tentativas int
) returns int
language sql
immutable
as $$
  select greatest(
    0,
    p_x_valor
      - case when p_tempo_seg < 10 then 0
             when p_tempo_seg <= 20 then 10
             else 20 end
      - case when p_tentativas >= 2 then 20 else 0 end
  );
$$;

-- ------------------------------------------------- iniciar / retomar ------
create or replace function public.exergame_iniciar_execucao(p_lista_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_aluno uuid := auth.uid();
  v_turma uuid;
  v_exec  uuid;
begin
  if v_aluno is null then
    raise exception 'Não autenticado';
  end if;

  select turma_id into v_turma from public.exergame_profiles where id = v_aluno;

  if not exists (
    select 1 from public.exergame_listas l
    where l.id = p_lista_id
      and l.ativa
      and (l.turma_id is null or l.turma_id = v_turma)
  ) then
    raise exception 'Lista indisponível para este aluno';
  end if;

  -- Retoma uma execução em aberto, se houver.
  select id into v_exec
  from public.exergame_execucoes_lista
  where lista_id = p_lista_id and aluno_id = v_aluno and finalizado_em is null
  order by iniciado_em desc
  limit 1;

  if v_exec is null then
    insert into public.exergame_execucoes_lista (lista_id, aluno_id)
    values (p_lista_id, v_aluno)
    returning id into v_exec;

    insert into public.exergame_execucoes_questao (execucao_id, questao_id)
    select v_exec, q.id from public.exergame_questoes q where q.lista_id = p_lista_id;
  end if;

  return v_exec;
end;
$$;

-- ------------------------------------------- questões sem o gabarito ------
create or replace function public.exergame_obter_questoes(p_execucao_id uuid)
returns table (
  questao_id   uuid,
  ordem        int,
  enunciado    text,
  dificuldade  text,
  x_valor      int,
  tentativas   int,
  acertou      boolean,
  p_final      int,
  alternativas jsonb
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.exergame_execucoes_lista e
    where e.id = p_execucao_id and e.aluno_id = auth.uid()
  ) then
    raise exception 'Execução não pertence a este usuário';
  end if;

  return query
  select q.id, q.ordem, q.enunciado, q.dificuldade, q.x_valor,
         coalesce(eq.tentativas, 0), coalesce(eq.acertou, false),
         coalesce(eq.p_final, 0),
         (select coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'texto', a.texto)
                          order by a.ordem), '[]'::jsonb)
            from public.exergame_alternativas a where a.questao_id = q.id) as alternativas
  from public.exergame_questoes q
  join public.exergame_execucoes_lista e on e.id = p_execucao_id
  left join public.exergame_execucoes_questao eq
         on eq.execucao_id = p_execucao_id and eq.questao_id = q.id
  where q.lista_id = e.lista_id
  order by q.ordem, q.criado_em;
end;
$$;

-- ------------------------------------------- marcar abertura da questão ---
create or replace function public.exergame_abrir_questao(
  p_execucao_id uuid, p_questao_id uuid
) returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare v_agora timestamptz := now();
begin
  if not exists (
    select 1 from public.exergame_execucoes_lista e
    where e.id = p_execucao_id and e.aluno_id = auth.uid() and e.finalizado_em is null
  ) then
    raise exception 'Execução inválida ou já finalizada';
  end if;

  insert into public.exergame_execucoes_questao (execucao_id, questao_id, iniciada_em)
  values (p_execucao_id, p_questao_id, v_agora)
  on conflict (execucao_id, questao_id) do update
    set iniciada_em = coalesce(exergame_execucoes_questao.iniciada_em, v_agora)
  returning iniciada_em into v_agora;

  return v_agora;
end;
$$;

-- --------------------------------------------------------- responder -----
create or replace function public.exergame_responder(
  p_execucao_id uuid, p_questao_id uuid, p_alternativa_id uuid
) returns table (
  correta      boolean,
  tentativas   int,
  tempo_seg    int,
  p_final      int,
  encerrada    boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista_id   uuid;
  v_x          int;
  v_correta    boolean;
  v_iniciada   timestamptz;
  v_tentativas int;
  v_tempo      int;
  v_p          int;
  v_ja_acertou boolean;
begin
  select e.lista_id into v_lista_id
  from public.exergame_execucoes_lista e
  where e.id = p_execucao_id and e.aluno_id = auth.uid() and e.finalizado_em is null;

  if v_lista_id is null then
    raise exception 'Execução inválida ou já finalizada';
  end if;

  select q.x_valor into v_x
  from public.exergame_questoes q
  where q.id = p_questao_id and q.lista_id = v_lista_id;

  if v_x is null then
    raise exception 'Questão não pertence a esta lista';
  end if;

  select a.correta into v_correta
  from public.exergame_alternativas a
  where a.id = p_alternativa_id and a.questao_id = p_questao_id;

  if v_correta is null then
    raise exception 'Alternativa não pertence a esta questão';
  end if;

  select eq.iniciada_em, eq.tentativas, eq.acertou
    into v_iniciada, v_tentativas, v_ja_acertou
  from public.exergame_execucoes_questao eq
  where eq.execucao_id = p_execucao_id and eq.questao_id = p_questao_id
  for update;

  if v_ja_acertou then
    raise exception 'Questão já respondida corretamente';
  end if;

  v_tentativas := coalesce(v_tentativas, 0) + 1;
  v_tempo := greatest(0, floor(extract(epoch from (now() - coalesce(v_iniciada, now()))))::int);
  v_p := case when v_correta
              then public.exergame_pontos_questao(v_x, v_tempo, v_tentativas)
              else 0 end;

  update public.exergame_execucoes_questao eq
     set tentativas   = v_tentativas,
         acertou      = v_correta,
         tempo_seg    = v_tempo,
         p_final      = v_p,
         respondido_em = case when v_correta then now() else eq.respondido_em end
   where eq.execucao_id = p_execucao_id and eq.questao_id = p_questao_id;

  return query select v_correta, v_tentativas, v_tempo, v_p, v_correta;
end;
$$;

-- -------------------------------------------------------- finalizar ------
create or replace function public.exergame_finalizar_execucao(p_execucao_id uuid)
returns table (
  pt_total          int,
  tempo_total_seg   int,
  tentativas_totais int,
  posicao           int
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lista uuid;
  v_pt int; v_tempo int; v_tent int; v_pos int;
begin
  select e.lista_id into v_lista
  from public.exergame_execucoes_lista e
  where e.id = p_execucao_id and e.aluno_id = auth.uid();

  if v_lista is null then
    raise exception 'Execução não pertence a este usuário';
  end if;

  select coalesce(sum(eq.p_final), 0),
         coalesce(sum(eq.tempo_seg), 0),
         coalesce(sum(eq.tentativas), 0)
    into v_pt, v_tempo, v_tent
  from public.exergame_execucoes_questao eq
  where eq.execucao_id = p_execucao_id;

  update public.exergame_execucoes_lista e
     set pt_total = v_pt,
         tempo_total_seg = v_tempo,
         tentativas_totais = v_tent,
         finalizado_em = coalesce(e.finalizado_em, now())
   where e.id = p_execucao_id;

  select r.posicao into v_pos
  from public.exergame_ranking(v_lista) r
  where r.aluno_id = auth.uid();

  return query select v_pt, v_tempo, v_tent, coalesce(v_pos, 0);
end;
$$;

-- ---------------------------------------------------------- ranking ------
-- Melhor execução finalizada de cada aluno.
-- Desempate: maior PT > menor tempo total > menos tentativas.
create or replace function public.exergame_ranking(p_lista_id uuid)
returns table (
  posicao           int,
  aluno_id          uuid,
  nome              text,
  matricula         text,
  pt_total          int,
  tempo_total_seg   int,
  tentativas_totais int
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.exergame_listas l
    where l.id = p_lista_id
      and (
        l.professor_id = auth.uid()
        or public.exergame_perfil() = 'gestor'
        or (l.ativa and (l.turma_id is null or l.turma_id = public.exergame_turma()))
      )
  ) then
    raise exception 'Sem acesso ao ranking desta lista';
  end if;

  return query
  with melhores as (
    select distinct on (e.aluno_id)
           e.aluno_id, e.pt_total, e.tempo_total_seg, e.tentativas_totais
    from public.exergame_execucoes_lista e
    where e.lista_id = p_lista_id and e.finalizado_em is not null
    order by e.aluno_id, e.pt_total desc, e.tempo_total_seg asc, e.tentativas_totais asc
  )
  select row_number() over (
           order by m.pt_total desc, m.tempo_total_seg asc, m.tentativas_totais asc
         )::int,
         m.aluno_id, p.nome, p.matricula,
         m.pt_total, m.tempo_total_seg, m.tentativas_totais
  from melhores m
  join public.exergame_profiles p on p.id = m.aluno_id
  order by m.pt_total desc, m.tempo_total_seg asc, m.tentativas_totais asc;
end;
$$;

-- ------------------------------------ painel do aluno (listas + status) ---
create or replace function public.exergame_listas_aluno()
returns table (
  lista_id       uuid,
  titulo         text,
  disciplina     text,
  turma_id       uuid,
  qtd_questoes   int,
  melhor_pt      int,
  ultima_execucao timestamptz,
  em_andamento   uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare v_aluno uuid := auth.uid();
begin
  return query
  select l.id, l.titulo, l.disciplina, l.turma_id,
         (select count(*)::int from public.exergame_questoes q where q.lista_id = l.id),
         (select coalesce(max(e.pt_total), 0) from public.exergame_execucoes_lista e
           where e.lista_id = l.id and e.aluno_id = v_aluno and e.finalizado_em is not null),
         (select max(e.finalizado_em) from public.exergame_execucoes_lista e
           where e.lista_id = l.id and e.aluno_id = v_aluno),
         (select e.id from public.exergame_execucoes_lista e
           where e.lista_id = l.id and e.aluno_id = v_aluno and e.finalizado_em is null
           order by e.iniciado_em desc limit 1)
  from public.exergame_listas l
  where l.ativa
    and (l.turma_id is null
         or l.turma_id = (select p.turma_id from public.exergame_profiles p where p.id = v_aluno))
  order by l.criado_em desc;
end;
$$;

-- -------------------------------------- resultados por questão (docente) --
create or replace function public.exergame_resultados_lista(p_lista_id uuid)
returns table (
  questao_id     uuid,
  ordem          int,
  enunciado      text,
  x_valor        int,
  alunos         int,
  acertos        int,
  media_tempo    numeric,
  media_tentativas numeric,
  media_p        numeric
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.exergame_listas l
    where l.id = p_lista_id
      and (l.professor_id = auth.uid() or public.exergame_perfil() = 'gestor')
  ) then
    raise exception 'Sem acesso aos resultados desta lista';
  end if;

  return query
  -- Só entram respostas de execuções concluídas e questões efetivamente abertas
  -- (as linhas criadas em branco no início da execução ficam de fora).
  select q.id, q.ordem, q.enunciado, q.x_valor,
         count(eq.id)::int,
         count(*) filter (where eq.acertou)::int,
         round(coalesce(avg(eq.tempo_seg) filter (where eq.acertou), 0), 1),
         round(coalesce(avg(eq.tentativas), 0), 1),
         round(coalesce(avg(eq.p_final) filter (where eq.acertou), 0), 1)
  from public.exergame_questoes q
  left join public.exergame_execucoes_questao eq
         on eq.questao_id = q.id
        and eq.tentativas > 0
        and exists (select 1 from public.exergame_execucoes_lista e
                    where e.id = eq.execucao_id and e.finalizado_em is not null)
  where q.lista_id = p_lista_id
  group by q.id, q.ordem, q.enunciado, q.x_valor
  order by q.ordem;
end;
$$;

-- --------------------------------------------------------- permissões ----
revoke all on function public.exergame_iniciar_execucao(uuid) from public;
revoke all on function public.exergame_obter_questoes(uuid) from public;
revoke all on function public.exergame_abrir_questao(uuid, uuid) from public;
revoke all on function public.exergame_responder(uuid, uuid, uuid) from public;
revoke all on function public.exergame_finalizar_execucao(uuid) from public;
revoke all on function public.exergame_ranking(uuid) from public;
revoke all on function public.exergame_listas_aluno() from public;
revoke all on function public.exergame_resultados_lista(uuid) from public;

grant execute on function public.exergame_iniciar_execucao(uuid) to authenticated;
grant execute on function public.exergame_obter_questoes(uuid) to authenticated;
grant execute on function public.exergame_abrir_questao(uuid, uuid) to authenticated;
grant execute on function public.exergame_responder(uuid, uuid, uuid) to authenticated;
grant execute on function public.exergame_finalizar_execucao(uuid) to authenticated;
grant execute on function public.exergame_ranking(uuid) to authenticated;
grant execute on function public.exergame_listas_aluno() to authenticated;
grant execute on function public.exergame_resultados_lista(uuid) to authenticated;

-- ------------------------------- perfil para conta já existente no Auth ---
-- O banco é dividido com o SACP: uma conta criada lá (antes do Exergame) entra
-- sem perfil, porque o gatilho só dispara na criação do usuário. Esta função
-- deixa a própria pessoa completar o cadastro. Só age sobre auth.uid() e só
-- quando ainda não existe perfil — por isso exergame_profiles não tem policy
-- de INSERT: a criação passa exclusivamente por aqui.
create or replace function public.exergame_criar_meu_perfil(
  p_nome      text,
  p_perfil    text,
  p_matricula text default null,
  p_turma_id  uuid default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if exists (select 1 from public.exergame_profiles where id = v_uid) then
    raise exception 'Esta conta já tem perfil no Exergame';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome';
  end if;

  if p_perfil not in ('aluno', 'professor') then
    raise exception 'Perfil inválido';
  end if;

  if p_perfil = 'aluno' and coalesce(trim(p_matricula), '') = '' then
    raise exception 'Informe a matrícula';
  end if;

  insert into public.exergame_profiles (id, nome, matricula, perfil, turma_id)
  values (
    v_uid,
    trim(p_nome),
    case when p_perfil = 'aluno' then trim(p_matricula) else null end,
    p_perfil,
    case when p_perfil = 'aluno' then p_turma_id else null end
  );
end;
$$;

revoke all on function public.exergame_criar_meu_perfil(text, text, text, uuid) from public;
revoke execute on function public.exergame_criar_meu_perfil(text, text, text, uuid) from anon;
grant execute on function public.exergame_criar_meu_perfil(text, text, text, uuid) to authenticated;
