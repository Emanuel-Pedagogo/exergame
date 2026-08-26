# Exergame — Lista de Exercícios Gamificada

Aplicação web para alunos do 5º ano (extensível a outras séries) resolverem listas
de exercícios com pontuação, cronômetro, tentativas e ranking.

**Stack:** React 19 + Vite (JSX), Supabase (Auth / Postgres / RLS / RPC), CSS próprio,
deploy na Vercel — a mesma base do `Sist-Gest-Pedag`.

**No ar:** <https://exergame-iota.vercel.app> — publicado a cada push em `main`.
O sufixo `-iota` não é enfeite: `exergame.vercel.app` pertence a outro projeto,
sem relação com este.

## Como rodar

```bash
npm install
cp .env.example .env.local     # preencha URL e anon key do projeto Supabase
npm run dev                    # http://localhost:5173
npm test                       # Vitest sobre as regras de pontuação
npx eslint src                 # lint
npm run build                  # build de produção -> dist/
```

## Banco de dados

O Exergame divide o projeto Supabase com o **SACP** (Sist-Gest-Pedag). Por isso
todas as tabelas levam o prefixo `exergame_` e o gatilho que cria o perfil só
age em usuários cujo metadata traz `app = 'exergame'` — nada aqui toca as
tabelas do outro sistema.

Aplique os arquivos SQL na ordem, pelo SQL Editor do Supabase ou pelo MCP:

1. `supabase_exergame_schema.sql` — tabelas, índices, trigger que cria o `profile`
2. `supabase_exergame_rls.sql` — Row Level Security
3. `supabase_exergame_rpc.sql` — RPCs de execução, pontuação e ranking
4. `supabase_exergame_convite_professor.sql` — exige código de convite para virar
   professor (sem ele, qualquer um se cadastra como professor)
5. `supabase_exergame_matriculas.sql` — o professor monta a lista da turma e cria turmas
6. `supabase_exergame_escolas.sql` — escola como raiz, vínculos e disciplinas
7. `supabase_exergame_rls_escolas.sql` — **RLS com isolamento por escola** (substitui as policies do passo 2)
8. `supabase_exergame_rpc_escolas.sql` — criar/entrar em escola, convite por escola, turma e disciplina
9. `supabase_exergame_alunos_senha.sql` — professor define senha do aluno e edita a lista
10. `supabase_exergame_seed.sql` — dados de demonstração (opcional)

> O seed insere as questões e suas alternativas num único comando (`with novas as
> (insert ...)`). Isso só funciona com RLS desligada — como superusuário no SQL
> Editor. Rodando como professor autenticado, a policy de `exergame_alternativas`
> faz um `exists` sobre a questão, que ainda não está visível no snapshot do
> próprio comando, e o insert é recusado. Para criar conteúdo **pelo app** ou
> como professor: insira as questões em um statement e as alternativas em outro.

### Cadastro de professor

Virar professor exige um código de convite — o aluno se cadastra livremente.
Para emitir um, no SQL Editor:

```sql
insert into public.exergame_convites_professor (codigo, descricao, usos_max, expira_em)
values ('ESCOLA-MODELO-2026', 'Professores da Escola Modelo', 10, now() + interval '90 days');
```

Conferir o uso: `select codigo, usos, usos_max, ativo, expira_em from public.exergame_convites_professor;`
Revogar: `update public.exergame_convites_professor set ativo = false where codigo = '...';`

O código é comparado em maiúsculas e sem espaços nas pontas, então o professor
pode digitá-lo como quiser. Detalhes do desenho em `docs/CONTEXTO-PROJETO.md` §12.

No painel do Supabase, em **Authentication → Providers → Email**, desligue
"Confirm email" para que aluno e professor entrem logo após o cadastro
(o aluno usa um e-mail sintético que ninguém recebe).

## Regras de pontuação

```
Por questão:  P  = X - T - QT        (mínimo 0)
              X  = valor da questão conforme a dificuldade
              T  = 0 (<10s) | 10 (10s–20s) | 20 (>20s)
              QT = 0 (<2 tentativas) | 20 (>=2 tentativas)
Por lista:    PT = soma dos P
Ranking:      maior PT > menor tempo total > menos tentativas
```

O cálculo roda no **servidor** (`exergame_responder`), com o tempo medido pelo
Postgres entre `exergame_abrir_questao` e a resposta. O cronômetro da tela é
apenas exibição.

## Teste do banco sem Supabase

`supabase_exergame_stub_local.sql` + `supabase_exergame_teste_fluxo.sql` sobem um
stub do ambiente Supabase (schema `auth`, `auth.uid()`, papéis) em um Postgres
local e exercitam o fluxo inteiro — inclusive as tentativas de burlar a pontuação.

```bash
createdb exergame_test
psql -d exergame_test -c "create extension if not exists pgcrypto;"
psql -d exergame_test -f supabase_exergame_stub_local.sql
psql -d exergame_test -f supabase_exergame_schema.sql
psql -d exergame_test -f supabase_exergame_rls.sql
psql -d exergame_test -f supabase_exergame_rpc.sql
psql -d exergame_test -f supabase_exergame_teste_fluxo.sql
```
