# Protótipos visuais

Laboratório para experimentar visual e animação **sem tocar no app**. Nada aqui
é importado por `src/`, nada entra no build (`vite build` só olha `index.html` da
raiz e o que `src/` importa). Quebrar um protótipo não quebra o Exergame.

## Como abrir

Com o dev server rodando:

```bash
npm run dev
```

e acesse <http://localhost:5173/prototipos/index.html>.

Precisa ser pelo servidor, não abrindo o arquivo direto: os protótipos carregam
`/src/App.css` para partirem do visual real.

## A ideia

Cada protótipo é **um HTML só, autossuficiente**, que:

1. carrega `/src/App.css` — assim nasce idêntico ao app de hoje;
2. sobrescreve o que quiser num `<style>` no próprio arquivo.

O ganho é que a diferença entre a proposta e o app fica explícita e curta: o
`<style>` do protótipo *é* a lista de mudanças. Quando uma variação for
aprovada, esse bloco vira o patch a aplicar em `src/App.css`.

O HTML das telas foi copiado do app com as mesmas classes, então o que funciona
no protótipo funciona lá.

## Arquivos

| Arquivo | O que é |
| --- | --- |
| `index.html` | índice com links e o que cada um propõe |
| `referencia.html` | o visual de hoje, sem alteração — a régua de comparação |
| `tema-noturno.html` | mesma estrutura, identidade escura |
| `animacoes.html` | bancada para testar comemoração de acerto |

## Criando uma variação nova

Copie `referencia.html`, renomeie, e escreva no `<style>` só o que muda. Se
precisar mexer no HTML (um elemento novo, outra ordem), fique à vontade — é
protótipo. Depois acrescente uma linha em `index.html`.

Duas coisas que vale respeitar, porque valem no app de verdade:

- **Cores saem de variáveis.** O app define a paleta no `:root` de `App.css`
  (`--azul`, `--roxo`, `--fundo`, `--raio`, …). Redefinir essas variáveis muda o
  app inteiro de uma vez; é o caminho mais barato para propor identidade nova.
- **Quem usa isso.** O aluno é criança de 5º ano, muitas vezes no celular da
  família, com internet ruim e em sala barulhenta. O professor está no
  computador, com pressa, entre uma aula e outra. Vale testar as telas estreitas
  (375 px) antes de decidir.
