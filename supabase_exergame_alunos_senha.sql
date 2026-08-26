-- ============================================================================
-- EXERGAME — senha definida pelo professor, e edição de aluno
--
-- Os dois caminhos convivem: o professor pode entregar a conta pronta (com
-- senha) ou deixar o aluno criar a dele no primeiro acesso.
--
-- Por que criar conta aqui e não numa Edge Function: o caminho "oficial" seria
-- a Admin API, mas isso introduziria um componente novo (deploy, runtime,
-- manutenção) só para montar uma linha. O hash do Supabase é bcrypt e o
-- pgcrypto está disponível, então a conta é montada no próprio banco.
--
-- Duas pegadinhas que quebraram a primeira versão:
--   1. Não basta inserir em auth.users. Sem a linha correspondente em
--      auth.identities (provider 'email'), o login por e-mail/senha não
--      funciona — a conta existe e recusa a senha certa.
--   2. pgcrypto vive no schema `extensions` no Supabase. Como estas funções
--      fixam `search_path = public` (obrigatório em SECURITY DEFINER), crypt e
--      gen_salt precisam vir qualificados: extensions.crypt(...).
-- ============================================================================

/** Monta a conta do aluno (auth.users + auth.identities). Interna. */
create or replace function public.exergame_criar_conta_aluno(
  p_matricula text,
  p_nome      text,
  p_senha     text,
  p_dominio   text
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_uid   uuid := gen_random_uuid();
  v_email text := lower(trim(p_matricula)) || '@' || p_dominio;
begin
  insert into auth.users (
    instance_id, id, aud, role, email, encrypted_password,
    email_confirmed_at, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data
  ) values (
    '00000000-0000-0000-0000-000000000000',
    v_uid, 'authenticated', 'authenticated', v_email,
    extensions.crypt(p_senha, extensions.gen_salt('bf')),
    now(), now(), now(),
    '{"provider":"email","providers":["email"]}'::jsonb,
    jsonb_build_object('app','exergame','nome',p_nome,'perfil','aluno','matricula',lower(trim(p_matricula)))
  );

  insert into auth.identities (id, user_id, provider_id, identity_data, provider, created_at, updated_at)
  values (
    gen_random_uuid(), v_uid, v_uid::text,
    jsonb_build_object('sub', v_uid::text, 'email', v_email, 'email_verified', true, 'phone_verified', false),
    'email', now(), now()
  );

  return v_uid;
end;
$$;
revoke all on function public.exergame_criar_conta_aluno(text, text, text, text) from public, anon, authenticated;

/**
 * Edita nome e matrícula de um aluno da lista.
 *
 * A matrícula só muda enquanto o aluno não entrou: depois disso ela virou o
 * e-mail de login, e trocá-la por baixo o deixaria de fora sem aviso nenhum.
 * O nome, esse sim, pode ser corrigido sempre — e a correção acompanha o
 * perfil de quem já tem conta.
 */
create or replace function public.exergame_editar_aluno(
  p_id        uuid,
  p_nome      text,
  p_matricula text default null
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_linha     public.exergame_matriculas%rowtype;
  v_nome      text := nullif(trim(coalesce(p_nome,'')), '');
  v_matricula text := lower(nullif(trim(coalesce(p_matricula,'')), ''));
begin
  select * into v_linha from public.exergame_matriculas where id = p_id;
  if not found then
    raise exception 'Aluno não encontrado na lista';
  end if;
  if not public.exergame_na_escola(public.exergame_escola_da_turma(v_linha.turma_id)) then
    raise exception 'Você não tem vínculo com a escola desta turma';
  end if;
  if v_nome is null then
    raise exception 'Informe o nome';
  end if;

  if v_matricula is not null and v_matricula <> v_linha.matricula then
    if v_linha.ativado_em is not null then
      raise exception 'Este aluno já entrou no app: a matrícula é o login dele e não pode mudar';
    end if;
    if v_matricula ~ '[@\s]' or v_matricula !~ '^[a-z0-9._-]+$' then
      raise exception 'Matrícula inválida: use apenas letras e números, sem espaços';
    end if;
    if exists (select 1 from public.exergame_matriculas where matricula = v_matricula and id <> p_id)
       or exists (select 1 from public.exergame_profiles where matricula = v_matricula) then
      raise exception 'Já existe alguém com a matrícula %', v_matricula;
    end if;

    update public.exergame_matriculas set matricula = v_matricula, nome = v_nome where id = p_id;
    return 'nome e matrícula atualizados';
  end if;

  update public.exergame_matriculas set nome = v_nome where id = p_id;

  if v_linha.aluno_id is not null then
    update public.exergame_profiles set nome = v_nome where id = v_linha.aluno_id;
  end if;

  return 'nome atualizado';
end;
$$;
revoke all on function public.exergame_editar_aluno(uuid, text, text) from public, anon;
grant execute on function public.exergame_editar_aluno(uuid, text, text) to authenticated;

/** Define a senha (criando a conta, se ainda não existir) ou redefine. */
create or replace function public.exergame_definir_senha_aluno(
  p_id      uuid,
  p_senha   text,
  p_dominio text default 'alunos.exergame.app'
) returns text
language plpgsql security definer set search_path = public
as $$
declare
  v_linha public.exergame_matriculas%rowtype;
  v_uid   uuid;
begin
  select * into v_linha from public.exergame_matriculas where id = p_id;
  if not found then
    raise exception 'Aluno não encontrado na lista';
  end if;
  if not public.exergame_na_escola(public.exergame_escola_da_turma(v_linha.turma_id)) then
    raise exception 'Você não tem vínculo com a escola desta turma';
  end if;
  if coalesce(length(trim(p_senha)), 0) < 6 then
    raise exception 'A senha precisa ter pelo menos 6 caracteres';
  end if;

  if v_linha.aluno_id is null then
    v_uid := public.exergame_criar_conta_aluno(v_linha.matricula, v_linha.nome, trim(p_senha), p_dominio);
    return 'conta criada com a senha definida';
  end if;

  update auth.users
     set encrypted_password = extensions.crypt(trim(p_senha), extensions.gen_salt('bf')),
         updated_at = now()
   where id = v_linha.aluno_id;

  return 'senha redefinida';
end;
$$;
revoke all on function public.exergame_definir_senha_aluno(uuid, text, text) from public, anon;
grant execute on function public.exergame_definir_senha_aluno(uuid, text, text) to authenticated;

-- ============================================================================
-- exergame_cadastrar_alunos ganhou `senha` opcional por aluno e o parâmetro
-- p_dominio (o mesmo VITE_MATRICULA_EMAIL_DOMAIN do front). Situações novas no
-- retorno: 'conta_criada', 'matricula_invalida', 'senha_curta', 'erro_conta'.
-- A linha da lista entra ANTES da conta, porque o gatilho de novo usuário
-- procura o pré-cadastro para pegar nome e turma; se a criação da conta falhar,
-- a linha é desfeita.
-- ============================================================================
