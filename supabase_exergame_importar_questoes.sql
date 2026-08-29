-- ============================================================================
-- EXERGAME — importação de questões em lote
--
-- O professor cola a prova inteira (ou escolhe um .txt) e o app monta enunciado,
-- alternativas e gabarito. O interpretador do formato fica no cliente
-- (src/utils/importarQuestoes.js), que mostra uma prévia antes de gravar; aqui
-- é só a gravação.
--
-- POR QUE ISTO É UMA RPC, E NÃO INSERTS DO CLIENTE
--   1. A policy de exergame_alternativas faz um `exists` sobre a questão, que
--      ainda não está visível no snapshot do mesmo comando — inserir questão e
--      alternativas juntas pelo PostgREST é recusado pela RLS.
--   2. Um lote de 20 questões viraria dezenas de idas ao servidor, cada uma
--      podendo falhar no meio e deixar a lista pela metade.
-- ============================================================================

create or replace function public.exergame_importar_questoes(
  p_lista_id uuid,
  p_questoes jsonb
) returns table (ordem int, enunciado text, situacao text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_item      jsonb;
  v_alt       jsonb;
  v_enunciado text;
  v_dific     text;
  v_x         int;
  v_questao   uuid;
  v_proxima   int;
  v_corretas  int;
  v_qtd_alt   int;
begin
  if not public.exergame_posso_editar_lista(p_lista_id) then
    raise exception 'Esta lista não é sua';
  end if;

  -- Continua a numeração existente: importar não apaga o que já havia.
  select coalesce(max(q.ordem), 0) + 1 into v_proxima
  from public.exergame_questoes q where q.lista_id = p_lista_id;

  for v_item in select * from jsonb_array_elements(coalesce(p_questoes, '[]'::jsonb))
  loop
    v_enunciado := nullif(trim(coalesce(v_item->>'enunciado', '')), '');
    v_dific     := lower(coalesce(v_item->>'dificuldade', 'facil'));
    if v_dific not in ('facil', 'media', 'dificil') then
      v_dific := 'facil';
    end if;

    -- Mesma tabela de valores da tela: fácil 100, média 150, difícil 200.
    v_x := case v_dific when 'dificil' then 200 when 'media' then 150 else 100 end;

    select count(*), count(*) filter (where (a->>'correta')::boolean)
      into v_qtd_alt, v_corretas
      from jsonb_array_elements(coalesce(v_item->'alternativas', '[]'::jsonb)) a;

    -- A validação também mora aqui, não só na tela: a RPC é chamável direto.
    if v_enunciado is null then
      ordem := 0; enunciado := ''; situacao := 'sem_enunciado';
      return next; continue;
    end if;
    if v_qtd_alt < 2 then
      ordem := 0; enunciado := v_enunciado; situacao := 'poucas_alternativas';
      return next; continue;
    end if;
    if v_corretas <> 1 then
      ordem := 0; enunciado := v_enunciado; situacao := 'gabarito_invalido';
      return next; continue;
    end if;

    insert into public.exergame_questoes (lista_id, ordem, enunciado, dificuldade, x_valor)
    values (p_lista_id, v_proxima, v_enunciado, v_dific, v_x)
    returning id into v_questao;

    for v_alt in select * from jsonb_array_elements(v_item->'alternativas')
    loop
      insert into public.exergame_alternativas (questao_id, ordem, texto, correta)
      values (
        v_questao,
        (select count(*) + 1 from public.exergame_alternativas a where a.questao_id = v_questao),
        trim(coalesce(v_alt->>'texto', '')),
        coalesce((v_alt->>'correta')::boolean, false)
      );
    end loop;

    ordem := v_proxima; enunciado := v_enunciado; situacao := 'importada';
    return next;
    v_proxima := v_proxima + 1;
  end loop;
end;
$$;
revoke all on function public.exergame_importar_questoes(uuid, jsonb) from public, anon;
grant execute on function public.exergame_importar_questoes(uuid, jsonb) to authenticated;
