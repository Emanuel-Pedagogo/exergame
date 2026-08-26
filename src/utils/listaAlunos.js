/**
 * Interpreta a lista de turma que o professor cola na tela.
 *
 * Uma linha por aluno. A matrícula é opcional — sem ela, o banco gera uma
 * (ano + sequencial). Formatos aceitos, porque cada secretaria manda de um
 * jeito e não dá para exigir que o professor formate à mão:
 *
 *   Ana Clara Souza                 -> matrícula gerada
 *   20260101, Ana Clara Souza       -> matrícula primeiro
 *   Ana Clara Souza, 20260101       -> nome primeiro
 *   20260101;Ana Clara Souza        -> ponto e vírgula
 *   20260101 <TAB> Ana Clara Souza  -> colado de planilha
 *   1. Ana Clara Souza              -> numeração da lista de chamada, descartada
 *
 * Quem decide o que é matrícula não é a posição, e sim o formato: matrícula não
 * tem espaço e é curta. Assim as duas ordens funcionam sem o professor pensar.
 */

/**
 * Parece matrícula? Sem espaços, curta — e com pelo menos um dígito.
 *
 * O dígito é o que separa "20260101" de "Ana": sem essa exigência, o primeiro
 * nome de "Ana Clara Souza" era lido como matrícula e o resto como nome.
 * Matrícula sem nenhum número praticamente não existe; nome com número, menos ainda.
 */
function pareceMatricula(texto) {
  return /^[a-z0-9._-]{3,20}$/i.test(texto) && /\d/.test(texto);
}

/** Remove "1." / "12)" / "3 -" do começo da linha (numeração da chamada). */
function semNumeracao(linha) {
  return linha.replace(/^\s*\d{1,3}\s*[.)\-–]\s+/, '');
}

export function parsearListaAlunos(texto) {
  const linhas = String(texto ?? '')
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  return linhas.map((linhaBruta) => {
    const linha = semNumeracao(linhaBruta);
    const partes = linha
      .split(/[;\t,]/)
      .map((p) => p.trim())
      .filter(Boolean);

    if (partes.length === 0) return { nome: '', matricula: '', linha: linhaBruta };

    // Uma coluna só: ou é nome puro, ou o professor colou só matrículas.
    if (partes.length === 1) {
      const unico = partes[0];
      // "20260101 Ana Clara" — separado por espaço, sem vírgula.
      const porEspaco = unico.match(/^([a-z0-9._-]{3,20})\s+(.+)$/i);
      if (porEspaco && pareceMatricula(porEspaco[1]) && /\s|[a-zà-ú]{2}/i.test(porEspaco[2])) {
        return { nome: porEspaco[2].trim(), matricula: porEspaco[1], linha: linhaBruta };
      }
      return { nome: unico, matricula: '', linha: linhaBruta };
    }

    const [a, b] = partes;
    if (pareceMatricula(a) && !pareceMatricula(b)) {
      return { nome: b, matricula: a, linha: linhaBruta };
    }
    if (pareceMatricula(b) && !pareceMatricula(a)) {
      return { nome: a, matricula: b, linha: linhaBruta };
    }
    // Ambíguo (ex.: "Ana, Bia"): trata a primeira parte como nome.
    return { nome: a, matricula: '', linha: linhaBruta };
  });
}

/** Rótulos das situações devolvidas por exergame_cadastrar_alunos. */
export const SITUACAO_ALUNO = {
  cadastrado: 'Cadastrado',
  ja_na_lista: 'Já estava na lista',
  ja_tem_conta: 'Já tem conta no app',
  sem_nome: 'Linha ignorada (sem nome)',
};
