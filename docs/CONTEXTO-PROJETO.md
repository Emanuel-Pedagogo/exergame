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
| `prof-alunos` | `views/ProfessorAlunosView.jsx` | professor |
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
2. **Gestão de turmas parcial.** O professor já cria turmas e monta a lista de
   alunos pela tela `prof-alunos` (§13). Falta renomear/apagar turma e mover
   aluno de uma turma para outra — isso ainda é SQL.
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

## 13. O professor monta a lista da turma

`supabase_exergame_matriculas.sql` + `views/ProfessorAlunosView.jsx`.

**O professor não cria contas.** Criar conta no Supabase exige a chave de
serviço, que dá acesso irrestrito ao banco e por isso não pode viver no
navegador — colocá-la ali entregaria o banco inteiro a quem abrisse o DevTools.
A alternativa seria uma Edge Function; optamos por não introduzir esse
componente. O que o professor faz é **reservar a matrícula** com o nome e a
turma certos, em `exergame_matriculas`. A conta nasce no primeiro acesso do
aluno, que escolhe a própria senha.

Consequência visível na tela: cada linha tem estado — "aguardando 1º acesso" ou
"entrou". Serve de lista de chamada da adesão.

- No primeiro acesso, o gatilho procura a matrícula na lista. Achando, o **nome e
  a turma do pré-cadastro vencem** o que o aluno digitou: o professor escreve o
  nome certo e sabe a turma; a criança erra. Sem pré-cadastro, vale o que o aluno
  digitou — o auto-cadastro avulso continua permitido (decisão do usuário).
- A mesma regra vale nos dois caminhos: gatilho e `exergame_criar_meu_perfil`.
- `exergame_cadastrar_alunos(turma, jsonb)` aceita a turma inteira de uma vez e
  devolve **uma linha por aluno** com o que aconteceu (`cadastrado`,
  `ja_na_lista`, `ja_tem_conta`, `sem_nome`), para a tela explicar em vez de só
  falhar. Matrícula em branco é gerada como ANO+sequencial, pulando as ocupadas.
- A tabela é só para docente (RLS `for all using exergame_eh_docente()`): a lista
  da turma não interessa ao aluno.
- **Ambiguidade que quebrou a primeira versão:** a função devolve uma coluna
  chamada `matricula`, então dentro dela `where matricula = ...` é ambíguo entre
  a saída e a coluna da tabela. Toda referência precisa de alias (`mm.matricula`).

O texto colado é interpretado no cliente por `utils/listaAlunos.js`, que aceita
"nome", "matrícula, nome" e "nome, matrícula", separados por vírgula, ponto e
vírgula ou tabulação, e descarta a numeração da chamada. **O que decide o que é
matrícula não é a posição, e sim ter um dígito** — sem essa regra, "Ana Clara
Souza" virava matrícula "Ana" com nome "Clara Souza".

## 14. Escola como raiz (multi-escola)

`supabase_exergame_escolas.sql`, `supabase_exergame_rls_escolas.sql`,
`supabase_exergame_rpc_escolas.sql`.

O sistema passou a ser vendável para várias escolas, e isso mudou a pergunta que
as policies fazem: onde era "é docente?", agora é **"é docente DESTA escola?"**.
Sem essa troca, a professora da escola A enxergaria os alunos da escola B — dados
de menores, entre clientes diferentes.

- `exergame_escolas` é a raiz; `exergame_vinculos` liga professor↔escola em N:N
  (dar aula em duas escolas é comum, então não daria para pôr `escola_id` no
  profile); `exergame_disciplinas` substitui o texto livre de `listas.disciplina`.
- `turmas` e `listas` ganharam `escola_id` **not null**. Em `listas`, `turma_id`
  nulo significa "todas as turmas daquela escola" — sem `escola_id` isso não
  teria fronteira.
- Funções de apoio: `exergame_minhas_escolas()`, `exergame_na_escola(id)`,
  `exergame_gestor_da_escola(id)`, `exergame_escola_do_aluno()`,
  `exergame_escola_da_turma(id)`, `exergame_posso_ver_lista(id)`,
  `exergame_posso_editar_lista(id)`.
- O papel `gestor` deixou de ser global e passou a ser por escola.

**Quatro furos que existiam antes e que este arquivo fecha** — vale conhecer
porque qualquer policy nova pode reabri-los:

1. `turmas_select` era `using (true)` **para anon**: qualquer pessoa, sem login,
   lia as turmas de todas as escolas. Existia porque o cadastro do aluno mostrava
   um seletor de turma — que por isso **foi removido**; a turma do aluno vem da
   lista feita pelo professor.
2. `profiles_select` entregava todo perfil a qualquer docente.
3. `profiles_update_docente` deixava qualquer docente editar qualquer pessoa.
4. `gestor` global via gabarito e resultado de todas as escolas.

**Como o professor entra numa escola.** Cadastro de professor é livre outra vez
(§12 mudou de sentido): sem escola, ele não vê nada de ninguém, então travar o
cadastro não protegia nada e atrapalhava quem quisesse experimentar. Ao entrar
sem vínculo, cai em `EscolaSetupView` e escolhe: criar a escola (vira gestor
dela) ou entrar na de um colega com código gerado por `exergame_gerar_convite`.
O convite agora autoriza **entrar nesta escola**, não "ser professor".

**Ao mexer em RLS aqui, refaça o teste de isolamento:** monte duas escolas com
dados e tente cruzar a fronteira nos dois sentidos e nos dois papéis (professor e
aluno) — ler lista, gabarito, perfis e lista de turma alheios, renomear turma do
outro, plantar aluno na escola do outro. É essa bateria que sustenta a venda.

## 15. Comemoração do acerto

`utils/magia.js` (som) + `components/EfeitoMagico.jsx` (canvas), portados do app
Participou. O som é sintetizado com Web Audio — sem arquivo, funciona offline. O
efeito fica montado no `App.jsx` o tempo todo: parado não desenha nem consome
quadro, e assim não depende da tela aberta. Respeita `prefers-reduced-motion`.

Três detalhes que já custaram bug:

- **O canvas precisa de z-index acima do modal.** O acerto acontece dentro do
  modal da execução (`.modal-overlay` = 10000, `.confirm-backdrop` = 10060). Com
  o valor 70 que veio do Participou, as faíscas eram desenhadas atrás do fundo
  escuro e não apareciam. Hoje é 10100.
- **`ultimoToque` começa em `-Infinity`, não em 0.** `ctx.currentTime` também
  nasce perto de zero, então com 0 o primeiro acerto era tratado como "toque
  repetido" e saía sem o pó mágico, justo na hora que mais importa.
- O efeito só começa ~180 ms depois do clique, porque espera a RPC de resposta.
  Quem for medir ou capturar, mire ~430 ms.
