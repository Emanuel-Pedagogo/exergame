# CLAUDE.md

Orientações para o Claude Code trabalhar neste repositório.

**Leia `docs/CONTEXTO-PROJETO.md` primeiro** — modelo de domínio, decisões e
dívidas conhecidas. Este arquivo só traz comandos e a orientação de arquitetura.

Atalhos para quem está chegando: **§19** diz onde o projeto está hoje, **§20** é
o guia para mexer no visual (tokens, classes reusadas, pilha de z-index) e
**§21** lista o que vem depois.

O app é um **produto sendo preparado para venda a várias escolas** — o
isolamento entre escolas (§14) é o que sustenta isso, e nenhuma mudança deve
afrouxá-lo. No ar em <https://exergame-iota.vercel.app>.

## Comandos

```bash
npm install
npm run dev        # Vite (localhost:5173)
npm test           # Vitest
npx eslint src     # lint (use este, não `npm run lint` sobre a raiz)
npm run build      # produção -> dist/
```

## Arquitetura

SPA React 19 + Vite sobre Supabase. Mesmas convenções do `Sist-Gest-Pedag`:

- **Sem React Router.** A navegação é a string `currentView` em `src/App.jsx`,
  persistida em `localStorage` e espelhada em `?view=`. Nova tela = estender o
  bloco de renderização de `App.jsx`, não criar rota.
- **Sem camada de serviço.** As telas chamam `supabase.from(...)` / `.rpc(...)`
  diretamente. É deliberado — não extraia repositórios sem necessidade.
- **A pontuação é responsabilidade do servidor.** `src/utils/pontuacao.js` é um
  espelho em JS da função SQL `exergame_pontos_questao`, usado só para prévia na
  tela e para os testes. Nunca grave pontuação a partir do cliente: `execucoes_lista`
  e `execucoes_questao` não têm policy de INSERT/UPDATE — tudo passa pelas RPCs
  `SECURITY DEFINER`.
- **O gabarito nunca chega ao navegador do aluno.** `public.alternativas` só é
  legível pelo professor dono (RLS); o aluno recebe as alternativas sem o campo
  `correta`, via `exergame_obter_questoes`.
- **O banco é compartilhado com o SACP.** Mesmo projeto Supabase; por isso todas
  as tabelas têm prefixo `exergame_` e o gatilho de novo usuário só age quando o
  metadata traz `app = 'exergame'`. Nunca crie tabela sem o prefixo aqui, e não
  toque em nada que comece com `sacp_` ou nas tabelas do outro sistema.
- **Mudanças de schema são arquivos SQL na raiz** (`supabase_*.sql`), aplicados
  manualmente — não há `supabase/migrations/`. Mesmo padrão do Sist-Gest-Pedag.
- **Feedback ao usuário** passa por `toast` / `confirmAction` de
  `src/utils/appFeedback.js` — nunca `alert()` / `confirm()` nativos. Modais
  estendem `src/components/ModalShell.jsx` e reusam `.btn-primary`,
  `.btn-secondary`, `.input-group`.
- **Estilo é um arquivo só:** `src/App.css`, sem framework, com as cores em
  variáveis no `:root`. Antes de criar classe nova, procure a existente — as
  telas compartilham `.card-lista`, `.tabela-wrapper`, `.form-modal`, `.chip` e
  companhia. Detalhes e a pilha de z-index em `docs/CONTEXTO-PROJETO.md` §20.
- **Efeitos com `useEffect` não devem depender de objeto de estado que o próprio
  fluxo reescreve.** Foi assim que a tela de execução travou: o efeito dependia
  do objeto da questão, que era recriado ao marcar acerto, e o efeito reagia
  limpando o resultado. Dependa do id.
- **Interface e textos em português do Brasil**, inclusive mensagens de commit.
- Só faça commit/push quando o usuário pedir.
