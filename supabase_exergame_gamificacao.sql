-- ============================================================================
-- EXERGAME — XP, nível, sequência e conquistas
--
-- Mesma ideia do app Karaokê de Leitura: além da pontuação de cada lista (PT,
-- que é por execução e serve ao ranking daquela lista), o aluno acumula XP que
-- nunca zera, sobe de nível e desbloqueia conquistas.
--
-- POR QUE O XP NÃO É O PT DE TODA EXECUÇÃO
-- No Karaokê, reler o mesmo texto é bom e cada leitura vale XP cheio. Aqui o
-- aluno decoraria as respostas: refazer a mesma lista renderia XP cheio para
-- sempre, e o ranking passaria a medir persistência mecânica, não aprendizado.
-- Por isso:
--   1ª conclusão da lista .......... XP = PT inteiro
--   refazer ........................ XP = 20% do PT
--   + bônus de superação ........... XP = quanto passou do próprio recorde
-- Repetir continua valendo a pena — mais ainda se for para melhorar —, sem
-- transformar repetição em atalho.
-- ============================================================================

alter table public.exergame_profiles
  add column if not exists xp                int not null default 0,
  add column if not exists nivel             int not null default 1,
  add column if not exists sequencia_dias    int not null default 0,
  add column if not exists ultimo_dia_ativo  date;

comment on column public.exergame_profiles.xp is
  'XP acumulado, nunca zera. O PT continua sendo a pontuação de cada execução.';

/** 500 XP por nível, igual ao Karaokê de Leitura. */
create or replace function public.exergame_nivel_do_xp(p_xp int)
returns int
language sql immutable
as $$ select greatest(1, (coalesce(p_xp, 0) / 500) + 1) $$;

-- ----------------------------------------------------------- conquistas ----
create table if not exists public.exergame_conquistas (
  slug      text primary key,
  titulo    text not null,
  descricao text not null,
  icone     text not null,
  categoria text not null check (categoria in ('desempenho','velocidade','constancia','superacao')),
  ordem     int  not null default 0
);

create table if not exists public.exergame_conquistas_aluno (
  aluno_id       uuid not null references public.exergame_profiles(id) on delete cascade,
  conquista_slug text not null references public.exergame_conquistas(slug) on delete cascade,
  ganha_em       timestamptz not null default now(),
  primary key (aluno_id, conquista_slug)
);

alter table public.exergame_conquistas       enable row level security;
alter table public.exergame_conquistas_aluno enable row level security;

-- O catálogo é público para quem está logado: o aluno precisa ver o que ainda
-- não conquistou, senão não há o que perseguir.
drop policy if exists conquistas_leitura on public.exergame_conquistas;
create policy conquistas_leitura on public.exergame_conquistas
  for select to authenticated using (true);

-- Cada um vê as suas; o docente vê as de quem está nas turmas da escola dele.
drop policy if exists conquistas_aluno_leitura on public.exergame_conquistas_aluno;
create policy conquistas_aluno_leitura on public.exergame_conquistas_aluno
  for select to authenticated
  using (
    aluno_id = auth.uid()
    or exists (
      select 1 from public.exergame_profiles p
       where p.id = aluno_id
         and p.turma_id is not null
         and public.exergame_na_escola(public.exergame_escola_da_turma(p.turma_id))
    )
  );

-- Sem policy de escrita em lugar nenhum: quem concede conquista é a RPC
-- SECURITY DEFINER ao finalizar a lista. Um insert vindo do navegador não passa.

insert into public.exergame_conquistas (slug, titulo, descricao, icone, categoria, ordem) values
  ('primeira-lista',   'Primeira lista',    'Você concluiu sua primeira lista.',                        '🎯', 'desempenho', 1),
  ('sem-tropecos',     'Sem tropeços',      'Concluiu uma lista acertando tudo de primeira.',           '💯', 'desempenho', 2),
  ('nota-maxima',      'Nota máxima',       'Fez a pontuação máxima possível de uma lista.',            '👑', 'desempenho', 3),
  ('relampago',        'Relâmpago',         'Respondeu uma questão em menos de 10 segundos.',           '⚡', 'velocidade', 4),
  ('lista-relampago',  'Lista relâmpago',   'Concluiu uma lista inteira sem nenhuma perda por tempo.',  '🚀', 'velocidade', 5),
  ('sequencia-3',      'Três dias seguidos','Praticou em 3 dias seguidos.',                             '🔥', 'constancia', 6),
  ('sequencia-7',      'Uma semana inteira','Praticou em 7 dias seguidos.',                             '🏕️', 'constancia', 7),
  ('listas-5',         '5 listas',          'Concluiu 5 listas.',                                       '📚', 'constancia', 8),
  ('listas-10',        '10 listas',         'Concluiu 10 listas.',                                      '📗', 'constancia', 9),
  ('listas-25',        '25 listas',         'Concluiu 25 listas.',                                      '🏆', 'constancia', 10),
  ('superou-se',       'Superou-se',        'Refez uma lista e bateu o próprio recorde.',               '📈', 'superacao', 11),
  ('nivel-5',          'Nível 5',           'Chegou ao nível 5.',                                       '⭐', 'superacao', 12)
on conflict (slug) do update
  set titulo = excluded.titulo, descricao = excluded.descricao,
      icone = excluded.icone, categoria = excluded.categoria, ordem = excluded.ordem;

-- ------------------------------------------ finalizar: XP, nível, medalhas --
-- O retorno ganhou colunas (xp, nível, conquistas), e o Postgres não deixa
-- `create or replace` mudar o tipo de retorno — daí o drop antes.
drop function if exists public.exergame_finalizar_execucao(uuid);

create or replace function public.exergame_finalizar_execucao(p_execucao_id uuid)
returns table (
  pt_total          int,
  tempo_total_seg   int,
  tentativas_totais int,
  posicao           int,
  xp_ganho          int,
  xp_total          int,
  nivel             int,
  subiu_de_nivel    boolean,
  conquistas        jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_lista uuid;
  v_pt int; v_tempo int; v_tent int; v_pos int;
  v_recorde int;
  v_ja_concluiu boolean;
  v_xp_ganho int;
  v_perfil public.exergame_profiles%rowtype;
  v_nivel_antes int;
  v_nivel_depois int;
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
  v_novas jsonb := '[]'::jsonb;
  v_qtd_questoes int;
  v_pt_maximo int;
  v_sem_penalidade_tempo boolean;
  v_tudo_de_primeira boolean;
  v_teve_relampago boolean;
  v_total_concluidas int;

  v_slug text;
begin
  select e.lista_id into v_lista
  from public.exergame_execucoes_lista e
  where e.id = p_execucao_id and e.aluno_id = v_uid;

  if v_lista is null then
    raise exception 'Execução não pertence a este usuário';
  end if;

  select coalesce(sum(eq.p_final), 0),
         coalesce(sum(eq.tempo_seg), 0),
         coalesce(sum(eq.tentativas), 0),
         bool_and(eq.tempo_seg < 10),
         bool_and(eq.tentativas <= 1),
         bool_or(eq.tempo_seg < 10)
    into v_pt, v_tempo, v_tent, v_sem_penalidade_tempo, v_tudo_de_primeira, v_teve_relampago
  from public.exergame_execucoes_questao eq
  where eq.execucao_id = p_execucao_id and eq.acertou;

  -- Recorde anterior nesta lista, sem contar a execução atual.
  select max(e.pt_total) into v_recorde
  from public.exergame_execucoes_lista e
  where e.aluno_id = v_uid and e.lista_id = v_lista
    and e.finalizado_em is not null and e.id <> p_execucao_id;

  v_ja_concluiu := v_recorde is not null;

  update public.exergame_execucoes_lista e
     set pt_total = v_pt,
         tempo_total_seg = v_tempo,
         tentativas_totais = v_tent,
         finalizado_em = coalesce(e.finalizado_em, now())
   where e.id = p_execucao_id;

  -- XP: cheio na estreia; 20% ao refazer, mais o quanto superou o recorde.
  if not v_ja_concluiu then
    v_xp_ganho := v_pt;
  else
    v_xp_ganho := round(v_pt * 0.2) + greatest(0, v_pt - v_recorde);
  end if;

  select * into v_perfil from public.exergame_profiles where id = v_uid;
  v_nivel_antes := public.exergame_nivel_do_xp(v_perfil.xp);

  -- Sequência de dias: continua se jogou ontem, recomeça se faltou.
  update public.exergame_profiles p
     set xp = p.xp + v_xp_ganho,
         nivel = public.exergame_nivel_do_xp(p.xp + v_xp_ganho),
         sequencia_dias = case
           when p.ultimo_dia_ativo = v_hoje then greatest(p.sequencia_dias, 1)
           when p.ultimo_dia_ativo = v_hoje - 1 then p.sequencia_dias + 1
           else 1
         end,
         ultimo_dia_ativo = v_hoje
   where p.id = v_uid
  returning * into v_perfil;

  v_nivel_depois := v_perfil.nivel;

  -- ---------------------------------------------------------- conquistas --
  select count(*) into v_total_concluidas
  from public.exergame_execucoes_lista e
  where e.aluno_id = v_uid and e.finalizado_em is not null;

  select count(*), coalesce(sum(q.x_valor), 0) into v_qtd_questoes, v_pt_maximo
  from public.exergame_questoes q where q.lista_id = v_lista;

  for v_slug in
    select s from unnest(array[
      case when v_total_concluidas >= 1 then 'primeira-lista' end,
      case when v_tudo_de_primeira and v_qtd_questoes > 0 then 'sem-tropecos' end,
      case when v_pt_maximo > 0 and v_pt >= v_pt_maximo then 'nota-maxima' end,
      case when v_teve_relampago then 'relampago' end,
      case when v_sem_penalidade_tempo and v_qtd_questoes > 0 then 'lista-relampago' end,
      case when v_perfil.sequencia_dias >= 3 then 'sequencia-3' end,
      case when v_perfil.sequencia_dias >= 7 then 'sequencia-7' end,
      case when v_total_concluidas >= 5 then 'listas-5' end,
      case when v_total_concluidas >= 10 then 'listas-10' end,
      case when v_total_concluidas >= 25 then 'listas-25' end,
      case when v_ja_concluiu and v_pt > v_recorde then 'superou-se' end,
      case when v_nivel_depois >= 5 then 'nivel-5' end
    ]) as s
    where s is not null
  loop
    insert into public.exergame_conquistas_aluno (aluno_id, conquista_slug)
    values (v_uid, v_slug)
    on conflict do nothing;

    if found then
      v_novas := v_novas || (
        select jsonb_build_object('slug', c.slug, 'titulo', c.titulo,
                                  'descricao', c.descricao, 'icone', c.icone)
        from public.exergame_conquistas c where c.slug = v_slug
      );
    end if;
  end loop;

  select r.posicao into v_pos
  from public.exergame_ranking(v_lista) r
  where r.aluno_id = v_uid;

  return query select v_pt, v_tempo, v_tent, coalesce(v_pos, 0),
                      v_xp_ganho, v_perfil.xp, v_nivel_depois,
                      v_nivel_depois > v_nivel_antes, v_novas;
end;
$$;
revoke all on function public.exergame_finalizar_execucao(uuid) from public, anon;
grant execute on function public.exergame_finalizar_execucao(uuid) to authenticated;

-- --------------------------------------------------- ranking geral por XP --
/**
 * Ranking da turma por XP acumulado.
 *
 * Diferente de exergame_ranking (que é por lista e mede o desempenho naquela
 * lista), este soma o esforço ao longo do tempo — quem pratica sempre aparece,
 * não só quem foi rápido num dia.
 */
create or replace function public.exergame_ranking_xp(p_turma_id uuid default null)
returns table (
  posicao   int,
  aluno_id  uuid,
  nome      text,
  xp        int,
  nivel     int,
  sequencia int,
  medalhas  int
)
language sql stable security definer set search_path = public
as $$
  -- Turma alvo: a do aluno logado, ou a que o docente pediu. O docente só
  -- enxerga turma de escola em que tem vínculo — sem isso o ranking viraria
  -- uma porta lateral para ver alunos de outra escola.
  with alvo as (
    select coalesce(p_turma_id, public.exergame_turma()) as turma_id
  )
  select
    rank() over (order by p.xp desc, p.nome)::int,
    p.id, p.nome, p.xp, p.nivel, p.sequencia_dias,
    (select count(*)::int from public.exergame_conquistas_aluno ca where ca.aluno_id = p.id)
  from public.exergame_profiles p, alvo a
  where p.perfil = 'aluno'
    and p.turma_id = a.turma_id
    and (
      a.turma_id = public.exergame_turma()
      or public.exergame_na_escola(public.exergame_escola_da_turma(a.turma_id))
    )
  order by 1
$$;
revoke all on function public.exergame_ranking_xp(uuid) from public, anon;
grant execute on function public.exergame_ranking_xp(uuid) to authenticated;

/** Conquistas do aluno logado: as ganhas e as que ainda faltam. */
create or replace function public.exergame_minhas_conquistas()
returns table (
  slug      text,
  titulo    text,
  descricao text,
  icone     text,
  categoria text,
  ganha_em  timestamptz
)
language sql stable security definer set search_path = public
as $$
  select c.slug, c.titulo, c.descricao, c.icone, c.categoria, ca.ganha_em
  from public.exergame_conquistas c
  left join public.exergame_conquistas_aluno ca
         on ca.conquista_slug = c.slug and ca.aluno_id = auth.uid()
  order by (ca.ganha_em is null), c.ordem
$$;
revoke all on function public.exergame_minhas_conquistas() from public, anon;
grant execute on function public.exergame_minhas_conquistas() to authenticated;
