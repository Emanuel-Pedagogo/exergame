/**
 * Interpreta um lote de questões coladas como texto.
 *
 * O professor já tem as questões escritas em algum lugar; digitar de novo, uma
 * por uma, é o que trava o uso. Aqui ele cola o bloco inteiro e o app monta
 * enunciado, alternativas e gabarito.
 *
 * Formato aceito (o que mais aparece em prova de escola):
 *
 *   1. Qual é a capital do Brasil?
 *   a) São Paulo
 *   *b) Brasília
 *   c) Rio de Janeiro
 *   d) Salvador
 *
 * A correta é marcada com `*`, `(x)`, `[x]` ou `#` — antes da letra ou no fim
 * da linha. A dificuldade é opcional, entre colchetes logo após o número:
 * `1. [média] Quanto é 7 x 8?`. Sem ela, a questão entra como fácil.
 *
 * O que NÃO é adivinhado: se nenhuma alternativa vier marcada, a questão volta
 * com aviso em vez de escolher uma por conta própria — chutar o gabarito seria
 * pior do que pedir a correção.
 */

const DIFICULDADES = {
  facil: 'facil',
  fácil: 'facil',
  media: 'media',
  média: 'media',
  medio: 'media',
  médio: 'media',
  dificil: 'dificil',
  difícil: 'dificil',
};

/** "1.", "1)", "1 -", "Questão 1:" — o que costuma abrir uma questão. */
const INICIO_QUESTAO = /^\s*(?:quest[ãa]o\s*)?(\d{1,3})\s*[.):\-–]\s*/i;

/** "a)", "b.", "(c)", "D -" — o que costuma abrir uma alternativa. */
const INICIO_ALTERNATIVA = /^\s*[*#]?\s*\(?\s*([a-eA-E])\s*[).:\-–]\s*/;

/** Marcas de "esta é a correta", antes da letra ou no fim da linha. */
const MARCA_INICIO = /^\s*(?:\*|#|\(\s*x\s*\)|\[\s*x\s*\])\s*/i;
const MARCA_FIM = /\s*(?:\*|#|\(\s*x\s*\)|\[\s*x\s*\]|\(correta\)|-\s*correta)\s*$/i;

function extrairDificuldade(texto) {
  const m = texto.match(/^\s*\[([^\]]+)\]\s*/);
  if (!m) return { dificuldade: null, resto: texto };
  const chave = m[1].trim().toLowerCase();
  const dificuldade = DIFICULDADES[chave] ?? null;
  // Só consome o colchete se ele era mesmo uma dificuldade; senão pode ser
  // parte do enunciado (uma fórmula, por exemplo).
  return dificuldade
    ? { dificuldade, resto: texto.slice(m[0].length) }
    : { dificuldade: null, resto: texto };
}

function limparMarcas(texto) {
  let correta = false;
  let t = texto;

  if (MARCA_INICIO.test(t)) {
    correta = true;
    t = t.replace(MARCA_INICIO, '');
  }
  if (MARCA_FIM.test(t)) {
    correta = true;
    t = t.replace(MARCA_FIM, '');
  }
  return { texto: t.trim(), correta };
}

export function parsearQuestoes(entrada) {
  const linhas = String(entrada ?? '').split(/\r?\n/);
  const questoes = [];
  let atual = null;

  const fechar = () => {
    if (atual) questoes.push(atual);
    atual = null;
  };

  for (const linhaBruta of linhas) {
    const linha = linhaBruta.trim();
    if (!linha) continue;

    // A marca de correta pode vir antes do "a)", então tiro antes de testar.
    const semMarcaInicial = linha.replace(MARCA_INICIO, '');
    const ehAlternativa = atual && INICIO_ALTERNATIVA.test(semMarcaInicial);
    const inicioQuestao = INICIO_QUESTAO.exec(linha);

    // "1." só abre questão nova quando não é uma alternativa da questão atual.
    if (inicioQuestao && !ehAlternativa) {
      fechar();
      const semNumero = linha.slice(inicioQuestao[0].length);
      const { dificuldade, resto } = extrairDificuldade(semNumero);
      atual = {
        numero: Number(inicioQuestao[1]),
        enunciado: resto.trim(),
        dificuldade: dificuldade ?? 'facil',
        alternativas: [],
      };
      continue;
    }

    if (ehAlternativa) {
      const { texto, correta } = limparMarcas(linha);
      const semLetra = texto.replace(INICIO_ALTERNATIVA, '');
      atual.alternativas.push({ texto: semLetra.trim(), correta });
      continue;
    }

    // Linha solta: continuação do enunciado (questão longa quebrada em linhas)
    // ou da última alternativa.
    if (atual) {
      if (atual.alternativas.length > 0) {
        // A marca de correta pode estar na linha de continuação, não na que
        // abriu a alternativa — sem tratar aqui, o "*" virava parte do texto.
        const ultima = atual.alternativas[atual.alternativas.length - 1];
        const { texto, correta } = limparMarcas(linha);
        ultima.texto = `${ultima.texto} ${texto}`.trim();
        if (correta) ultima.correta = true;
      } else {
        atual.enunciado = `${atual.enunciado} ${linha}`.trim();
      }
    }
  }
  fechar();

  return questoes.map((q) => ({
    ...q,
    problemas: problemasDaQuestao(q),
  }));
}

function problemasDaQuestao(q) {
  const problemas = [];
  if (!q.enunciado) problemas.push('sem enunciado');
  if (q.alternativas.length < 2) problemas.push('precisa de pelo menos 2 alternativas');
  const corretas = q.alternativas.filter((a) => a.correta).length;
  if (corretas === 0) problemas.push('nenhuma alternativa marcada como correta');
  if (corretas > 1) problemas.push('mais de uma alternativa marcada como correta');
  if (q.alternativas.some((a) => !a.texto)) problemas.push('alternativa vazia');
  return problemas;
}

/** Só as questões prontas para gravar. */
export function questoesValidas(lista) {
  return lista.filter((q) => q.problemas.length === 0);
}

export const EXEMPLO_IMPORTACAO = `1. Qual é a capital do Brasil?
a) São Paulo
*b) Brasília
c) Rio de Janeiro
d) Salvador

2. [média] Quanto é 7 x 8?
a) 54
b) 56 *
c) 64
d) 48

3. [difícil] Um pacote tem 12 figurinhas. Quantas figurinhas há em 15 pacotes?
a) 160
b) 170
(x) c) 180
d) 192`;
