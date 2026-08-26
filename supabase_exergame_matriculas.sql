-- ============================================================================
-- EXERGAME — o professor monta a lista da turma
--
-- O aluno continua criando a própria senha (nenhuma conta é criada pelo
-- professor — isso exigiria a chave de serviço, que não pode viver no
-- navegador). O que o professor faz é deixar a matrícula PRÉ-CADASTRADA com o
-- nome e a turma corretos; quando o aluno entra pela primeira vez, o gatilho
-- reconhece a matrícula e usa esses dados em vez do que o aluno digitou.
--
-- Ganhos: nome escrito certo, turma certa, e uma lista de quem já ativou.
-- O auto-cadastro avulso continua funcionando (decisão do usuário).
-- ============================================================================

create table if not exists public.exergame_matriculas (
  id          uuid primary key default gen_random_uuid(),
  matricula   text not null unique,
  nome        text not null,
  turma_id    uuid not null references public.exergame_turmas(id) on delete cascade,
  criado_por  uuid references public.exergame_profiles(id) on delete set null,
  criado_em   timestamptz not null default now(),
  ativado_em  timestamptz,
  aluno_id    uuid references public.exergame_profiles(id) on delete set null
);

comment on table public.exergame_matriculas is
  'Lista da turma feita pelo professor. Uma linha vira conta de verdade quando o aluno faz o primeiro acesso com aquela matrícula.';

create index if not exists exergame_matriculas_turma_idx
  on public.exergame_matriculas (turma_id);

alter table public.exergame_matriculas enable row level security;

-- Só docente. O aluno não precisa (e não deve) ler a lista da turma.
drop policy if exists matriculas_docente on public.exergame_matriculas;
create policy matriculas_docente on public.exergame_matriculas
  for all
  using (public.exergame_eh_docente())
  with check (public.exergame_eh_docente());

-- ------------------------------------------------- cadastro em lote/avulso --
-- Recebe [{"nome":"...","matricula":"..."}, ...]. Matrícula vazia é gerada.
-- Devolve uma linha por aluno para a tela dizer o que aconteceu com cada um.
create or replace function public.exergame_cadastrar_alunos(
  p_turma_id uuid,
  p_alunos   jsonb
) returns table (matricula text, nome text, situacao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item       jsonb;
  v_nome       text;
  v_matricula  text;
  v_seq        int;
  v_ano        text := to_char(now(), 'YYYY');
begin
  if not public.exergame_eh_docente() then
    raise exception 'Apenas professores podem cadastrar alunos';
  end if;

  if not exists (select 1 from public.exergame_turmas where id = p_turma_id) then
    raise exception 'Turma não encontrada';
  end if;

  for v_item in select * from jsonb_array_elements(coalesce(p_alunos, '[]'::jsonb))
  loop
    v_nome      := nullif(trim(coalesce(v_item->>'nome', '')), '');
    v_matricula := lower(nullif(trim(coalesce(v_item->>'matricula', '')), ''));

    if v_nome is null then
      matricula := coalesce(v_matricula, '');
      nome      := '';
      situacao  := 'sem_nome';
      return next;
      continue;
    end if;

    -- Sem matrícula informada: gera ANO + sequencial, pulando as já usadas.
    if v_matricula is null then
      select coalesce(max(substring(m.matricula from '^' || v_ano || '(\d{4})$')::int), 0) + 1
        into v_seq
        from public.exergame_matriculas m
       where m.matricula ~ ('^' || v_ano || '\d{4}$');

      -- Aliases obrigatórios: a função devolve uma coluna chamada "matricula",
      -- então o nome sozinho seria ambíguo entre a saída e a tabela.
      loop
        v_matricula := v_ano || lpad(v_seq::text, 4, '0');
        exit when not exists (
          select 1 from public.exergame_matriculas mm where mm.matricula = v_matricula
          union all
          select 1 from public.exergame_profiles   pp where pp.matricula = v_matricula
        );
        v_seq := v_seq + 1;
      end loop;
    end if;

    -- Já está na lista de alguma turma?
    if exists (select 1 from public.exergame_matriculas m where m.matricula = v_matricula) then
      matricula := v_matricula;
      nome      := v_nome;
      situacao  := 'ja_na_lista';
      return next;
      continue;
    end if;

    -- Já virou conta (aluno se cadastrou sozinho antes)?
    if exists (select 1 from public.exergame_profiles p where p.matricula = v_matricula) then
      matricula := v_matricula;
      nome      := v_nome;
      situacao  := 'ja_tem_conta';
      return next;
      continue;
    end if;

    insert into public.exergame_matriculas (matricula, nome, turma_id, criado_por)
    values (v_matricula, v_nome, p_turma_id, auth.uid());

    matricula := v_matricula;
    nome      := v_nome;
    situacao  := 'cadastrado';
    return next;
  end loop;
end;
$$;

revoke all on function public.exergame_cadastrar_alunos(uuid, jsonb) from public, anon;
grant execute on function public.exergame_cadastrar_alunos(uuid, jsonb) to authenticated;

-- --------------------------------------------------- criação de turma (RF) --
-- A dívida "turmas só por SQL" some para o caso simples: o professor cria a
-- turma que vai usar. Renomear/apagar segue fora do app por ora.
create or replace function public.exergame_criar_turma(
  p_nome   text,
  p_ano    int default null,
  p_escola text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare v_id uuid;
begin
  if not public.exergame_eh_docente() then
    raise exception 'Apenas professores podem criar turmas';
  end if;

  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da turma';
  end if;

  insert into public.exergame_turmas (nome, ano, escola)
  values (trim(p_nome),
          coalesce(p_ano, extract(year from now())::int),
          nullif(trim(coalesce(p_escola, '')), ''))
  returning id into v_id;

  return v_id;
end;
$$;

revoke all on function public.exergame_criar_turma(text, int, text) from public, anon;
grant execute on function public.exergame_criar_turma(text, int, text) to authenticated;

-- ------------------------------------- gatilho: usa a lista no 1º acesso ----
create or replace function public.exergame_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil    text;
  v_nome      text;
  v_matricula text;
  v_turma     uuid;
  v_prev      public.exergame_matriculas%rowtype;
begin
  if coalesce(new.raw_user_meta_data->>'app', '') <> 'exergame' then
    return new;
  end if;

  v_perfil := coalesce(new.raw_user_meta_data->>'perfil', 'aluno');

  if v_perfil not in ('aluno', 'professor') then
    v_perfil := 'aluno';
  end if;

  if v_perfil = 'professor'
     and not public.exergame_consumir_convite(new.raw_user_meta_data->>'codigo_professor') then
    raise exception 'exergame_codigo_professor_invalido';
  end if;

  v_nome      := coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1));
  v_matricula := lower(nullif(trim(coalesce(new.raw_user_meta_data->>'matricula', '')), ''));
  v_turma     := nullif(new.raw_user_meta_data->>'turma_id', '')::uuid;

  -- Pré-cadastro do professor manda no nome e na turma: ele escreveu o nome
  -- certo e sabe a turma; o que o aluno digitou pode estar errado.
  if v_perfil = 'aluno' and v_matricula is not null then
    select * into v_prev
      from public.exergame_matriculas m
     where m.matricula = v_matricula
       and m.ativado_em is null
     limit 1;

    if found then
      v_nome  := v_prev.nome;
      v_turma := v_prev.turma_id;
    end if;
  end if;

  insert into public.exergame_profiles (id, nome, matricula, perfil, turma_id)
  values (new.id, v_nome, v_matricula, v_perfil, v_turma)
  on conflict (id) do nothing;

  if v_prev.id is not null then
    update public.exergame_matriculas
       set ativado_em = now(), aluno_id = new.id
     where id = v_prev.id;
  end if;

  if new.raw_user_meta_data ? 'codigo_professor' then
    update auth.users
       set raw_user_meta_data = raw_user_meta_data - 'codigo_professor'
     where id = new.id;
  end if;

  return new;
end;
$$;

-- ---------------------------- mesma regra para quem já existia no Auth ------
create or replace function public.exergame_criar_meu_perfil(
  p_nome      text,
  p_perfil    text,
  p_matricula text default null,
  p_turma_id  uuid default null,
  p_codigo    text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid       uuid := auth.uid();
  v_matricula text := lower(nullif(trim(coalesce(p_matricula, '')), ''));
  v_nome      text := trim(coalesce(p_nome, ''));
  v_turma     uuid := p_turma_id;
  v_prev      public.exergame_matriculas%rowtype;
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;

  if exists (select 1 from public.exergame_profiles where id = v_uid) then
    raise exception 'Esta conta já tem perfil no Exergame';
  end if;

  if v_nome = '' then
    raise exception 'Informe o nome';
  end if;

  if p_perfil not in ('aluno', 'professor') then
    raise exception 'Perfil inválido';
  end if;

  if p_perfil = 'aluno' and v_matricula is null then
    raise exception 'Informe a matrícula';
  end if;

  if p_perfil = 'professor' and not public.exergame_consumir_convite(p_codigo) then
    raise exception 'Código de professor inválido, expirado ou esgotado';
  end if;

  if p_perfil = 'aluno' then
    select * into v_prev
      from public.exergame_matriculas m
     where m.matricula = v_matricula
       and m.ativado_em is null
     limit 1;

    if found then
      v_nome  := v_prev.nome;
      v_turma := v_prev.turma_id;
    end if;
  end if;

  insert into public.exergame_profiles (id, nome, matricula, perfil, turma_id)
  values (
    v_uid,
    v_nome,
    case when p_perfil = 'aluno' then v_matricula else null end,
    p_perfil,
    case when p_perfil = 'aluno' then v_turma else null end
  );

  if v_prev.id is not null then
    update public.exergame_matriculas
       set ativado_em = now(), aluno_id = v_uid
     where id = v_prev.id;
  end if;
end;
$$;

revoke all on function public.exergame_criar_meu_perfil(text, text, text, uuid, text) from public;
revoke execute on function public.exergame_criar_meu_perfil(text, text, text, uuid, text) from anon;
grant execute on function public.exergame_criar_meu_perfil(text, text, text, uuid, text) to authenticated;
