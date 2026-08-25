# Exergame — contexto do projeto

Documento vivo. Atualize junto com as mudanças de código.

## 1. O que é

Lista de exercícios gamificada para alunos do 5º ano (extensível a outras séries).
O aluno resolve questões de múltipla escolha contra o relógio; acertar rápido e de
primeira vale mais pontos; o ranking da turma fecha o ciclo.

Atores: **aluno** (executa listas, vê pontuação e ranking), **professor** (cria
listas e questões, define o X da dificuldade, acompanha resultados) e **gestor**
(perfil previsto no schema, com leitura ampla; ainda sem telas próprias).

## 2. Stack e por quê

| Camada | Escolha | Observação |
| --- | --- | --- |
| Front | React 19 + Vite, JSX (sem TypeScript) | mesma base do Sist-Gest-Pedag |
| Estilo | CSS próprio em `src/App.css` | sem framework; classes utilitárias compartilhadas |
| Backend | Supabase (Postgres + Auth + RLS + RPC) | dispensa servidor Node/Laravel próprio |
| Testes | Vitest sobre `src/utils` | regras de pontuação e ordenação do ranking |
| Deploy | Vercel (build estático `dist/`) | <https://exergame-iota.vercel.app>, automático a cada push em `main` |

A API REST desenhada na primeira versão do projeto (`POST /auth/login`,
`GET /aluno/listas`, …) foi substituída por PostgREST + RPC do Supabase. O mapa
de equivalência está na §7.

## 3. Modelo de dados

O banco é **compartilhado com o SACP** (Sist-Gest-Pedag) — mesmo projeto
Supabase, `bzajsqxtaypgkejbmtxi`. Daí o prefixo `exergame_` em tudo: o SACP já
tem `turmas`, `alunos` e `professores` em `public`, e os dois sistemas precisam
conviver sem se enxergar.

```
exergame_turmas(id, nome, ano, escola)
exergame_profiles(id→auth.users, nome, matricula, perfil, turma_id)
exergame_listas(id, titulo, disciplina, professor_id, turma_id, ativa)
exergame_questoes(id, lista_id, ordem, enunciado, dificuldade, x_valor)
exergame_alternativas(id, questao_id, ordem, texto, correta)
exergame_execucoes_lista(id, lista_id, aluno_id, iniciado_em, finalizado_em,
                         pt_total, tempo_total_seg, tentativas_totais)
exergame_execucoes_questao(id, execucao_id, questao_id, tentativas, tempo_seg,
                           p_final, acertou, iniciada_em, respondido_em)
```

O gatilho `on_auth_user_created_exergame` roda sobre `auth.users`, que é comum
aos dois sistemas — por isso ele só cria perfil quando o metadata do cadastro
traz `app = 'exergame'`. Um professor que se cadastra no SACP não vira aluno
aqui, e vice-versa. A contrapartida: uma conta que **já existia** no Auth entra
sem perfil — `PerfilPendenteView` cobre esse caso e chama
`exergame_criar_meu_perfil()`. `exergame_profiles` não tem policy de INSERT;
a criação só acontece pelo gatilho ou por essa RPC. Nas consultas do front, os relacionamentos são apelidados
(`turma:exergame_turmas(nome)`) para que o código continue lendo `lista.turma`.

`profiles` substitui a entidade `User` do documento original: o Supabase Auth já
guarda credenciais e hash de senha, então a tabela do app só carrega os dados
pedagógicos. O ranking não é tabela nem view: é a função `exergame_ranking`.

## 4. Autenticação por matrícula

O Supabase Auth só conhece e-mail. A matrícula do aluno é convertida em um e-mail
sintético — `20260017@alunos.exergame.app` — por `matriculaParaEmail()` em
`src/supabaseClient.js`. O domínio vem de `VITE_MATRICULA_EMAIL_DOMAIN` e não
precisa existir de verdade; por isso a confirmação de e-mail precisa estar
desligada no painel do Supabase.

## 5. Pontuação — e por que ela mora no servidor

```
P  = X - T - QT                       (piso em 0)
T  = 0 (<10s) | 10 (10s–20s) | 20 (>20s)
QT = 0 (<2 tentativas) | 20 (>=2 tentativas)
PT = soma dos P da lista
```

Duas decisões que o documento original não fixava:

1. **P nunca é negativo.** Uma questão de X=30 respondida devagar e na terceira
   tentativa vale 0, não −10.
2. **O tempo é medido pelo Postgres**, entre `exergame_abrir_questao()` e
   `exergame_responder()`. Se o tempo viesse do cliente, bastaria o aluno abrir o
   DevTools para zerar o cronômetro.

Consequência: `execucoes_lista` e `execucoes_questao` **não têm policy de INSERT
ou UPDATE**. Toda gravação passa pelas RPCs `SECURITY DEFINER`. Um `update` direto
na pontuação vindo do navegador afeta zero linhas.

`src/utils/pontuacao.js` espelha a fórmula em JS apenas para a prévia na tela e
para os testes — se a regra mudar, mude nos dois lugares.

## 6. Sigilo do gabarito

`public.alternativas` guarda o campo `correta` e só é legível pelo professor dono
da lista (e pelo gestor). O aluno recebe as alternativas por
`exergame_obter_questoes()`, que devolve `jsonb` com `id` e `texto` — sem o
gabarito. A correção acontece dentro de `exergame_responder()`.

## 7. De REST para RPC

| Endpoint do projeto original | Equivalente aqui |
| --- | --- |
| `POST /auth/login`, `/auth/refresh` | `supabase.auth.signInWithPassword()` (JWT e refresh automáticos) |
| `GET /aluno/listas` | `rpc('exergame_listas_aluno')` |
| `POST /aluno/execucoes/{listaId}/start` | `rpc('exergame_iniciar_execucao')` |
| `GET /aluno/listas/{id}` (questões) | `rpc('exergame_obter_questoes')` |
| — (não existia) | `rpc('exergame_abrir_questao')` — marca o início do cronômetro |
| `POST …/questoes/{qid}/resposta` | `rpc('exergame_responder')` |
| `POST …/{execId}/finish` | `rpc('exergame_finalizar_execucao')` |
| `GET /aluno/ranking?listaId=` | `rpc('exergame_ranking')` |
| `GET/POST/PUT/DELETE /prof/listas`, `/prof/questoes` | PostgREST: `supabase.from('listas'\|'questoes'\|'alternativas')` com RLS |
| `GET /prof/resultados?listaId=` | `rpc('exergame_resultados_lista')` + `rpc('exergame_ranking')` |
| — (não existia) | `rpc('exergame_criar_meu_perfil')` — conta antiga do Auth completa o cadastro |

## 8. Mapa de telas

| `currentView` | Arquivo | Perfil |
| --- | --- | --- |
| (sem sessão) | `views/LoginView.jsx` | — |
| (sessão sem perfil) | `views/PerfilPendenteView.jsx` | — |
| `aluno-home` | `views/AlunoHomeView.jsx` | aluno |
| `aluno-ranking` | `views/RankingView.jsx` | aluno |
| `aluno-historico` | `views/HistoricoView.jsx` | aluno |
| `prof-listas` | `views/ProfessorListasView.jsx` | professor |
| `prof-questoes` | `views/ProfessorQuestoesView.jsx` | professor |
| `prof-resultados` | `views/ProfessorResultadosView.jsx` | professor |
| (modal) | `views/ExecucaoModal.jsx` | aluno |

## 9. Cobertura de requisitos

Atendidos: RF01–RF14, RF16, RF17. RF15 (multiusuário simultâneo) é propriedade da
infraestrutura Supabase/Vercel, não código deste repositório.

## 10. Testes

`src/utils/pontuacao.test.js` cobre penalidades de tempo, de tentativas, piso em
zero, soma do PT e o critério de desempate do ranking. O fluxo de banco (RLS,
RPCs, tentativas de burla) é exercitado por `supabase_exergame_teste_fluxo.sql`
contra um Postgres local — veja o README. Não há suíte E2E.

Em 25/08/2026 o fluxo foi validado também **contra o banco de produção**, com
dados descartáveis criados e removidos em seguida: gatilho de criação de perfil,
sigilo do gabarito, penalidade por tentativa (100→80), penalidade por tempo
(14 s → 100→90), soma do PT, ordenação do ranking, e cinco tentativas de burla —
todas bloqueadas.

**Armadilha ao medir tempo.** `exergame_responder` calcula o tempo com `now()`,
que no Postgres é o horário de **início da transação**. No app isso é correto,
porque PostgREST abre uma transação por chamada. Mas um teste que chame
`exergame_abrir_questao` e `exergame_responder` dentro da mesma transação vai
medir sempre `tempo_seg = 0` e parecer um bug de pontuação — não é, e `pg_sleep`
não resolve. Para exercitar a penalidade de tempo, as duas chamadas precisam
estar em transações separadas.

## 11. Dívidas conhecidas

1. ~~**Cadastro de professor é aberto.**~~ Resolvido em 25/08/2026 com código de
   convite — ver §12.
2. **Sem gestão de turmas na interface.** As turmas são inseridas via SQL; falta
   uma tela para o gestor/professor criar turmas e mover alunos.
3. **Banco compartilhado com o SACP.** Funciona e não custa nada, mas mistura
   dois sistemas no mesmo Postgres. Se o Exergame crescer, o caminho é um
   projeto Supabase próprio (US$ 10/mês) e a remoção dos prefixos.
4. **Sem `supabase/migrations/`.** Cada mudança é um novo `supabase_*.sql` na raiz,
   aplicado à mão — mesma dívida do Sist-Gest-Pedag.
5. **Sem tela de gestor.** O perfil existe no schema e nas policies, mas cai na
   interface do professor.
6. **Questões só de múltipla escolha.** Resposta aberta e numérica exigiriam outro
   caminho de correção em `exergame_responder`.
7. **Sem Capacitor/Android.** O app é responsivo e roda no navegador do celular;
   empacotar segue o mesmo roteiro do Sist-Gest-Pedag, se for necessário.

## 12. Quem pode virar professor

Até 25/08/2026 qualquer um: a tela mandava `perfil: 'professor'` no cadastro e o
servidor aceitava. Como o app é público e a chave `anon` está no bundle, não era
preciso nem usar a tela — bastava uma chamada à API.

Agora virar professor exige um **código de convite**
(`supabase_exergame_convite_professor.sql`). O aluno segue se cadastrando livre.

- `exergame_convites_professor` guarda os códigos, com validade (`expira_em`),
  limite de usos (`usos_max`) e chave de desligar (`ativo`). A tabela tem RLS
  ligada e **nenhuma policy**, mais `revoke` para `anon`/`authenticated`: nem
  logado o cliente lê, escreve ou descobre um código.
- `exergame_consumir_convite()` valida e gasta um uso numa tacada só (o `update
  … returning` evita corrida entre dois cadastros simultâneos). É `SECURITY
  DEFINER` e **sem execute para o cliente** — se fosse chamável, daria para
  descobrir códigos por tentativa e erro.
- Os **dois** caminhos de criação de perfil exigem o código quando o perfil pedido
  é `professor`: o gatilho `exergame_handle_new_user` (cadastro novo) e a RPC
  `exergame_criar_meu_perfil` (conta que já existia no Auth). Fechar só um deixaria
  o outro aberto.
- Perfil desconhecido (`gestor`, qualquer outro) cai para `aluno` em vez de dar
  erro. `gestor` continua existindo no schema, mas nunca por auto-cadastro.
- O código digitado é apagado do `raw_user_meta_data` depois de usado.
- Auto-promoção depois de criado já era barrada pela policy `profiles_update_self`
  (`with check … perfil = exergame_perfil()`), que impede o próprio usuário de
  trocar seu campo `perfil`. Note que `profiles_update_docente` permite a um
  professor mudar o perfil de qualquer um — outra razão para o portão de entrada.

Emitir, conferir e revogar códigos: instruções no rodapé do arquivo SQL.
