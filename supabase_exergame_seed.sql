-- ============================================================================
-- EXERGAME — dados de demonstração
-- Antes de rodar: crie o usuário professor pelo app (ou pelo painel do Auth)
-- e substitua :professor_id abaixo pelo uuid dele (tabela public.exergame_profiles).
-- ============================================================================

\set professor_id '00000000-0000-0000-0000-000000000000'

insert into public.exergame_turmas (id, nome, ano, escola)
values ('11111111-1111-1111-1111-111111111111', '5º ano A', 2026, 'Escola Municipal Modelo')
on conflict (id) do nothing;

insert into public.exergame_listas (id, titulo, disciplina, professor_id, turma_id, ativa)
values (
  '22222222-2222-2222-2222-222222222222',
  'Operações com números naturais',
  'Matemática',
  :'professor_id'::uuid,
  '11111111-1111-1111-1111-111111111111',
  true
) on conflict (id) do nothing;

with novas as (
  insert into public.exergame_questoes (lista_id, ordem, enunciado, dificuldade, x_valor) values
    ('22222222-2222-2222-2222-222222222222', 1, 'Quanto é 24 + 18?',            'facil',   100),
    ('22222222-2222-2222-2222-222222222222', 2, 'Quanto é 7 × 8?',              'facil',   100),
    ('22222222-2222-2222-2222-222222222222', 3, 'Quanto é 144 ÷ 12?',           'media',   150),
    ('22222222-2222-2222-2222-222222222222', 4, 'Qual é o resultado de 305 - 87?', 'media', 150),
    ('22222222-2222-2222-2222-222222222222', 5, 'Um pacote tem 12 figurinhas. Quantas figurinhas há em 15 pacotes?', 'dificil', 200)
  returning id, ordem
)
insert into public.exergame_alternativas (questao_id, ordem, texto, correta)
select n.id, v.ordem, v.texto, v.correta
from novas n
join (values
  (1, 1, '42',  true),  (1, 2, '32',  false), (1, 3, '46',  false), (1, 4, '40',  false),
  (2, 1, '54',  false), (2, 2, '56',  true),  (2, 3, '64',  false), (2, 4, '48',  false),
  (3, 1, '12',  true),  (3, 2, '14',  false), (3, 3, '11',  false), (3, 4, '13',  false),
  (4, 1, '218', true),  (4, 2, '228', false), (4, 3, '318', false), (4, 4, '208', false),
  (5, 1, '180', true),  (5, 2, '160', false), (5, 3, '170', false), (5, 4, '192', false)
) as v(q_ordem, ordem, texto, correta) on v.q_ordem = n.ordem;
