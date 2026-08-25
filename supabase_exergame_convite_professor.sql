-- ============================================================================
-- EXERGAME — fecha o cadastro de professor com código de convite
--
-- Antes disto, quem escolhesse "Sou professor" na tela de cadastro virava
-- professor: tanto o gatilho de novo usuário quanto exergame_criar_meu_perfil
-- confiavam no campo `perfil` mandado pelo navegador. Como o app é público e a
-- chave anon está no bundle, bastava uma chamada à API para se promover.
--
-- Agora virar professor exige um código de convite, guardado no banco e
-- validado no servidor. O aluno segue se cadastrando livremente.
-- ============================================================================

-- ---------------------------------------------------------------- convites --
create table if not exists public.exergame_convites_professor (
  codigo     text primary key,
  descricao  text,
  criado_em  timestamptz not null default now(),
  expira_em  timestamptz,
  usos_max   int,                       -- null = ilimitado
  usos       int not null default 0,
  ativo      boolean not null default true
);

comment on table public.exergame_convites_professor is
  'Códigos que autorizam o cadastro de professor. Nunca legível pelo cliente: '
  'só as funções SECURITY DEFINER abaixo tocam nesta tabela.';

alter table public.exergame_convites_professor enable row level security;

-- Sem policy nenhuma: com RLS ligada, isso já nega tudo via PostgREST. Os
-- revokes tornam a intenção explícita e sobrevivem a um "grant all" futuro
-- rodado por engano sobre o schema.
revoke all on public.exergame_convites_professor from anon, authenticated;

-- ------------------------------------------------------- consumo do código --
-- Interna por definição: se o cliente pudesse chamá-la, daria para descobrir
-- códigos por tentativa e erro (e cada tentativa gastaria um uso).
create or replace function public.exergame_consumir_convite(p_codigo text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_ok boolean;
begin
  if coalesce(trim(p_codigo), '') = '' then
    return false;
  end if;

  update public.exergame_convites_professor
     set usos = usos + 1
   where codigo = upper(trim(p_codigo))
     and ativo
     and (expira_em is null or expira_em > now())
     and (usos_max is null or usos < usos_max)
  returning true into v_ok;

  return coalesce(v_ok, false);
end;
$$;

revoke all on function public.exergame_consumir_convite(text) from public, anon, authenticated;

-- ------------------------------------------- gatilho de criação de usuário --
create or replace function public.exergame_handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_perfil text;
begin
  -- Este banco é compartilhado com o SACP: só criamos profile para usuários
  -- que se cadastraram PELO Exergame (metadata app = 'exergame').
  if coalesce(new.raw_user_meta_data->>'app', '') <> 'exergame' then
    return new;
  end if;

  v_perfil := coalesce(new.raw_user_meta_data->>'perfil', 'aluno');

  -- 'gestor' existe no schema, mas nunca por auto-cadastro.
  if v_perfil not in ('aluno', 'professor') then
    v_perfil := 'aluno';
  end if;

  if v_perfil = 'professor'
     and not public.exergame_consumir_convite(new.raw_user_meta_data->>'codigo_professor') then
    -- Aborta o cadastro inteiro: o usuário não chega a existir no Auth.
    raise exception 'exergame_codigo_professor_invalido';
  end if;

  insert into public.exergame_profiles (id, nome, matricula, perfil, turma_id)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'nome', split_part(new.email, '@', 1)),
    nullif(new.raw_user_meta_data->>'matricula', ''),
    v_perfil,
    nullif(new.raw_user_meta_data->>'turma_id', '')::uuid
  )
  on conflict (id) do nothing;

  -- O código não precisa ficar gravado no usuário depois de usado.
  -- (UPDATE não redispara este gatilho, que é AFTER INSERT.)
  if new.raw_user_meta_data ? 'codigo_professor' then
    update auth.users
       set raw_user_meta_data = raw_user_meta_data - 'codigo_professor'
     where id = new.id;
  end if;

  return new;
end;
$$;

-- ------------------------------------ conta antiga do Auth completa o perfil --
-- Assinatura muda (ganha p_codigo), então a antiga precisa sair — senão as duas
-- coexistem como sobrecarga e a chamada de 4 argumentos continua sem exigir código.
drop function if exists public.exergame_criar_meu_perfil(text, text, text, uuid);

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

  if p_perfil = 'professor' and not public.exergame_consumir_convite(p_codigo) then
    raise exception 'Código de professor inválido, expirado ou esgotado';
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

revoke all on function public.exergame_criar_meu_perfil(text, text, text, uuid, text) from public;
revoke execute on function public.exergame_criar_meu_perfil(text, text, text, uuid, text) from anon;
grant execute on function public.exergame_criar_meu_perfil(text, text, text, uuid, text) to authenticated;

-- ============================================================================
-- Para emitir um código (rode no SQL Editor, como dono do projeto):
--
--   insert into public.exergame_convites_professor (codigo, descricao, usos_max, expira_em)
--   values ('ESCOLA-MODELO-2026', 'Professores da Escola Modelo', 10, now() + interval '90 days');
--
-- Para revogar:  update public.exergame_convites_professor set ativo = false where codigo = '...';
-- Para conferir: select codigo, usos, usos_max, ativo, expira_em from public.exergame_convites_professor;
-- ============================================================================
