\set ON_ERROR_STOP on
\set QUIET on

-- Permissões que o Supabase concede por padrão ao papel authenticated.
grant usage on schema public to anon, authenticated;
grant all on all tables in schema public to anon, authenticated;
grant all on all sequences in schema public to anon, authenticated;
grant usage on schema auth to anon, authenticated;
grant select on auth.users to authenticated;

insert into public.exergame_turmas (id, nome, ano, escola)
values ('11111111-1111-1111-1111-111111111111', '5º ano A', 2026, 'Escola Modelo');

insert into auth.users (id, email, raw_user_meta_data) values
 ('aaaaaaaa-0000-0000-0000-000000000001', 'prof@escola.br',
  '{"app":"exergame","nome":"Professora Ana","perfil":"professor"}'),
 ('bbbbbbbb-0000-0000-0000-000000000002', '20260017@alunos.exergame.app',
  '{"app":"exergame","nome":"Bruno Aluno","perfil":"aluno","matricula":"20260017","turma_id":"11111111-1111-1111-1111-111111111111"}'),
 ('cccccccc-0000-0000-0000-000000000003', '20260018@alunos.exergame.app',
  '{"app":"exergame","nome":"Carla Aluna","perfil":"aluno","matricula":"20260018","turma_id":"11111111-1111-1111-1111-111111111111"}');

\echo '>> 1. Trigger criou os profiles:'
select nome, perfil, matricula from public.exergame_profiles order by nome;

-- ============================ PROFESSOR ====================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';

insert into public.exergame_listas (id, titulo, disciplina, professor_id, turma_id, ativa)
values ('22222222-2222-2222-2222-222222222222', 'Operações', 'Matemática',
        'aaaaaaaa-0000-0000-0000-000000000001',
        '11111111-1111-1111-1111-111111111111', true);

insert into public.exergame_questoes (id, lista_id, ordem, enunciado, dificuldade, x_valor) values
 ('33333333-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222',1,'24 + 18?','facil',100),
 ('33333333-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222',2,'7 x 8?','media',150);

insert into public.exergame_alternativas (id, questao_id, ordem, texto, correta) values
 ('44444444-0000-0000-0000-000000000001','33333333-0000-0000-0000-000000000001',1,'42',true),
 ('44444444-0000-0000-0000-000000000002','33333333-0000-0000-0000-000000000001',2,'32',false),
 ('44444444-0000-0000-0000-000000000003','33333333-0000-0000-0000-000000000002',1,'54',false),
 ('44444444-0000-0000-0000-000000000004','33333333-0000-0000-0000-000000000002',2,'56',true);

\echo '>> 2. Professor enxerga o gabarito (esperado: 4 linhas):'
select count(*) as alternativas_visiveis_professor from public.exergame_alternativas;

commit;

-- ============================== ALUNO 1 =====================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'bbbbbbbb-0000-0000-0000-000000000002';

\echo '>> 3. Aluno NAO enxerga a tabela de alternativas (esperado: 0):'
select count(*) as alternativas_visiveis_aluno from public.exergame_alternativas;

\echo '>> 4. Painel do aluno:'
select titulo, qtd_questoes, melhor_pt from public.exergame_listas_aluno();

select public.exergame_iniciar_execucao('22222222-2222-2222-2222-222222222222') as exec_id \gset

\echo '>> 5. Questoes servidas ao aluno (sem o campo correta):'
select ordem, enunciado, x_valor, alternativas from public.exergame_obter_questoes(:'exec_id'::uuid);

-- Q1: erra uma vez e acerta -> 2 tentativas, tempo < 10s => 100 - 0 - 20 = 80
select public.exergame_abrir_questao(:'exec_id'::uuid, '33333333-0000-0000-0000-000000000001');
\echo '>> 6. Q1 primeira tentativa (errada):'
select * from public.exergame_responder(:'exec_id'::uuid,'33333333-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000002');
\echo '>> 7. Q1 segunda tentativa (certa) — esperado p_final = 80:'
select * from public.exergame_responder(:'exec_id'::uuid,'33333333-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001');

-- Q2: acerta de primeira e rápido => 150 - 0 - 0 = 150
select public.exergame_abrir_questao(:'exec_id'::uuid, '33333333-0000-0000-0000-000000000002');
\echo '>> 8. Q2 acerto de primeira — esperado p_final = 150:'
select * from public.exergame_responder(:'exec_id'::uuid,'33333333-0000-0000-0000-000000000002','44444444-0000-0000-0000-000000000004');

\echo '>> 9. Finalizar — esperado PT = 230, posicao 1:'
select * from public.exergame_finalizar_execucao(:'exec_id'::uuid);

commit;

-- ============================== ALUNO 2 =====================================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
select public.exergame_iniciar_execucao('22222222-2222-2222-2222-222222222222') as exec2 \gset
select public.exergame_abrir_questao(:'exec2'::uuid,'33333333-0000-0000-0000-000000000001');
select public.exergame_responder(:'exec2'::uuid,'33333333-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001');
select public.exergame_finalizar_execucao(:'exec2'::uuid);

\echo '>> 10. Ranking visto pelo aluno 2 (Bruno 230 > Carla 100):'
select posicao, nome, pt_total, tempo_total_seg, tentativas_totais
from public.exergame_ranking('22222222-2222-2222-2222-222222222222');

commit;

-- ======================= TENTATIVAS DE BURLAR ===============================
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'cccccccc-0000-0000-0000-000000000003';
\echo '>> 11. Aluno tentando gravar pontuacao direto (esperado: 0 linhas afetadas):'
update public.exergame_execucoes_lista set pt_total = 99999 where aluno_id = 'cccccccc-0000-0000-0000-000000000003';
\echo '>> 12. Aluno tentando responder pela execucao do colega (esperado: erro):'
do $$
begin
  perform public.exergame_responder(
    (select id from public.exergame_execucoes_lista where aluno_id = 'bbbbbbbb-0000-0000-0000-000000000002' limit 1),
    '33333333-0000-0000-0000-000000000001','44444444-0000-0000-0000-000000000001');
  raise notice 'FALHA: deveria ter dado erro';
exception when others then
  raise notice 'OK — bloqueado: %', sqlerrm;
end $$;
\echo '>> 13. Aluno tentando criar lista (esperado: erro de RLS):'
do $$
begin
  insert into public.exergame_listas (titulo, professor_id) values ('Hack','cccccccc-0000-0000-0000-000000000003');
  raise notice 'FALHA: deveria ter dado erro';
exception when others then
  raise notice 'OK — bloqueado: %', sqlerrm;
end $$;
commit;

\echo '>> 14. Resultados por questao (professor):'
begin;
set local role authenticated;
set local request.jwt.claim.sub = 'aaaaaaaa-0000-0000-0000-000000000001';
select ordem, acertos, alunos, media_tentativas, media_p from public.exergame_resultados_lista('22222222-2222-2222-2222-222222222222');
commit;
