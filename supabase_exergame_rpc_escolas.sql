-- ============================================================================
-- EXERGAME — RPCs do modelo multi-escola
--
-- Aplicar depois de supabase_exergame_escolas.sql e
-- supabase_exergame_rls_escolas.sql.
--
-- Mudança de sentido do convite: ele deixou de autorizar "virar professor" e
-- passou a autorizar "entrar NESTA escola". Com o isolamento por escola, um
-- professor recém-cadastrado não enxerga nada de ninguém — ele começa sem
-- escola — então travar o cadastro deixou de proteger algo e só atrapalhava
-- quem quisesse experimentar o produto.
-- ============================================================================

alter table public.exergame_convites_professor
  add column if not exists escola_id uuid references public.exergame_escolas(id) on delete cascade;

-- Convites do modelo antigo (sem escola) não significam mais nada.
update public.exergame_convites_professor set ativo = false where escola_id is null;

/** Cria a escola e vincula quem criou como gestor, na mesma transação. */
create or replace function public.exergame_criar_escola(
  p_nome   text,
  p_cidade text default null,
  p_uf     text default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;
  if not public.exergame_eh_docente() then
    raise exception 'Apenas professores podem criar escolas';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da escola';
  end if;

  insert into public.exergame_escolas (nome, cidade, uf, criado_por)
  values (trim(p_nome), nullif(trim(coalesce(p_cidade,'')),''), nullif(trim(coalesce(p_uf,'')),''), v_uid)
  returning id into v_id;

  insert into public.exergame_vinculos (profile_id, escola_id, papel)
  values (v_uid, v_id, 'gestor');

  return v_id;
end;
$$;
revoke all on function public.exergame_criar_escola(text, text, text) from public, anon;
grant execute on function public.exergame_criar_escola(text, text, text) to authenticated;

/** Entra numa escola existente pelo código que o gestor gerou. */
create or replace function public.exergame_entrar_na_escola(p_codigo text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_escola uuid; v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'Não autenticado';
  end if;
  if not public.exergame_eh_docente() then
    raise exception 'Apenas professores entram em escolas por código';
  end if;

  -- Valida e gasta o uso num comando só, para dois cadastros simultâneos não
  -- ocuparem a mesma vaga.
  update public.exergame_convites_professor
     set usos = usos + 1
   where codigo = upper(trim(coalesce(p_codigo,'')))
     and ativo
     and escola_id is not null
     and (expira_em is null or expira_em > now())
     and (usos_max is null or usos < usos_max)
  returning escola_id into v_escola;

  if v_escola is null then
    raise exception 'Código inválido, expirado ou esgotado';
  end if;

  insert into public.exergame_vinculos (profile_id, escola_id, papel)
  values (v_uid, v_escola, 'professor')
  on conflict (profile_id, escola_id) do nothing;

  return v_escola;
end;
$$;
revoke all on function public.exergame_entrar_na_escola(text) from public, anon;
grant execute on function public.exergame_entrar_na_escola(text) to authenticated;

/** Só o gestor da escola gera convite para ela. */
create or replace function public.exergame_gerar_convite(
  p_escola_id uuid,
  p_usos_max  int default 10,
  p_dias      int default 90
) returns text
language plpgsql security definer set search_path = public
as $$
declare v_codigo text;
begin
  if not public.exergame_gestor_da_escola(p_escola_id) then
    raise exception 'Apenas o gestor da escola gera convites';
  end if;

  v_codigo := 'ESC-' || upper(substring(encode(gen_random_bytes(6),'hex') from 1 for 8));

  insert into public.exergame_convites_professor (codigo, descricao, usos_max, expira_em, escola_id)
  values (v_codigo,
          'Convite para ' || (select nome from public.exergame_escolas where id = p_escola_id),
          p_usos_max,
          now() + make_interval(days => greatest(p_dias, 1)),
          p_escola_id);

  return v_codigo;
end;
$$;
revoke all on function public.exergame_gerar_convite(uuid, int, int) from public, anon;
grant execute on function public.exergame_gerar_convite(uuid, int, int) to authenticated;

-- A turma agora nasce dentro de uma escola: a assinatura antiga
-- (p_nome, p_ano, p_escola text) sai de cena para não deixar uma sobrecarga
-- capaz de criar turma sem escola.
drop function if exists public.exergame_criar_turma(text, int, text);
create or replace function public.exergame_criar_turma(
  p_escola_id uuid,
  p_nome      text,
  p_ano       int default null
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.exergame_na_escola(p_escola_id) then
    raise exception 'Você não tem vínculo com esta escola';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da turma';
  end if;

  insert into public.exergame_turmas (nome, ano, escola_id)
  values (trim(p_nome), coalesce(p_ano, extract(year from now())::int), p_escola_id)
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.exergame_criar_turma(uuid, text, int) from public, anon;
grant execute on function public.exergame_criar_turma(uuid, text, int) to authenticated;

/** Disciplina da escola. Repetir o nome não cria duplicata. */
create or replace function public.exergame_criar_disciplina(p_escola_id uuid, p_nome text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare v_id uuid;
begin
  if not public.exergame_na_escola(p_escola_id) then
    raise exception 'Você não tem vínculo com esta escola';
  end if;
  if coalesce(trim(p_nome), '') = '' then
    raise exception 'Informe o nome da disciplina';
  end if;

  insert into public.exergame_disciplinas (escola_id, nome)
  values (p_escola_id, trim(p_nome))
  on conflict (escola_id, nome) do update set nome = excluded.nome
  returning id into v_id;

  return v_id;
end;
$$;
revoke all on function public.exergame_criar_disciplina(uuid, text) from public, anon;
grant execute on function public.exergame_criar_disciplina(uuid, text) to authenticated;

-- ============================================================================
-- As versões atualizadas de exergame_cadastrar_alunos (que agora valida vínculo
-- com a escola DA TURMA, em vez de "é docente?"), exergame_handle_new_user e
-- exergame_criar_meu_perfil (cadastro livre; a turma do aluno vem da lista do
-- professor) foram aplicadas junto desta migração. Ver
-- supabase_exergame_matriculas.sql para o corpo delas — a única diferença é a
-- troca da checagem exergame_eh_docente() por
-- exergame_na_escola(exergame_escola_da_turma(...)), e a remoção da exigência
-- de código no cadastro de professor.
-- ============================================================================
