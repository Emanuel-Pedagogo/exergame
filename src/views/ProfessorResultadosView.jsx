import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';
import { formatarTempo, medalha } from '../utils/formatters';

/** Relatório simples por lista (RF16–RF17): ranking + desempenho por questão. */
function ProfessorResultadosView({ profile, listaInicial }) {
  const [listas, setListas] = useState([]);
  const [listaId, setListaId] = useState(listaInicial?.id ?? '');
  const [ranking, setRanking] = useState([]);
  const [porQuestao, setPorQuestao] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase
      .from('exergame_listas')
      .select('id, titulo')
      .eq('professor_id', profile.id)
      .order('criado_em', { ascending: false })
      .then(({ data, error }) => {
        if (error) {
          toast.error(`Não consegui carregar as listas: ${error.message}`);
          return;
        }
        setListas(data ?? []);
        setListaId((atual) => atual || data?.[0]?.id || '');
      });
  }, [profile.id]);

  const carregar = useCallback((id) => {
    if (!id) return;
    Promise.all([
      supabase.rpc('exergame_ranking', { p_lista_id: id }),
      supabase.rpc('exergame_resultados_lista', { p_lista_id: id }),
    ]).then(([{ data: dadosRanking, error: erroRanking }, { data: dadosQuestoes, error: erroQuestoes }]) => {
      if (erroRanking) toast.error(erroRanking.message);
      if (erroQuestoes) toast.error(erroQuestoes.message);
      setRanking(dadosRanking ?? []);
      setPorQuestao(dadosQuestoes ?? []);
      setCarregando(false);
    });
  }, []);

  useEffect(() => {
    carregar(listaId);
  }, [carregar, listaId]);

  const concluintes = ranking.length;
  const mediaPt = concluintes
    ? Math.round(ranking.reduce((s, l) => s + l.pt_total, 0) / concluintes)
    : 0;

  return (
    <>
      <div className="filter-bar">
        <label htmlFor="resultados-lista">Lista</label>
        <select
          id="resultados-lista"
          value={listaId}
          onChange={(e) => {
            setCarregando(true);
            setListaId(e.target.value);
          }}
        >
          {listas.map((l) => (
            <option key={l.id} value={l.id}>
              {l.titulo}
            </option>
          ))}
        </select>
      </div>

      {carregando && <p className="estado-vazio">Carregando resultados…</p>}

      {!carregando && (
        <>
          <div className="metricas">
            <div className="metrica">
              <span>Alunos que concluíram</span>
              <strong>{concluintes}</strong>
            </div>
            <div className="metrica">
              <span>PT médio</span>
              <strong>{mediaPt}</strong>
            </div>
            <div className="metrica">
              <span>Questões</span>
              <strong>{porQuestao.length}</strong>
            </div>
          </div>

          <h3>Ranking da turma</h3>
          {ranking.length === 0 ? (
            <p className="estado-vazio">Ninguém concluiu esta lista ainda.</p>
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Aluno</th>
                    <th scope="col">Matrícula</th>
                    <th scope="col">PT</th>
                    <th scope="col">Tempo</th>
                    <th scope="col">Tentativas</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((l) => (
                    <tr key={l.aluno_id}>
                      <td>{medalha(l.posicao)}</td>
                      <td>{l.nome}</td>
                      <td>{l.matricula ?? '—'}</td>
                      <td>
                        <strong>{l.pt_total}</strong>
                      </td>
                      <td>{formatarTempo(l.tempo_total_seg)}</td>
                      <td>{l.tentativas_totais}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <h3>Desempenho por questão</h3>
          {porQuestao.length === 0 ? (
            <p className="estado-vazio">Esta lista ainda não tem questões.</p>
          ) : (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Questão</th>
                    <th scope="col">Acertos</th>
                    <th scope="col">Tempo médio</th>
                    <th scope="col">Tentativas médias</th>
                    <th scope="col">P médio</th>
                  </tr>
                </thead>
                <tbody>
                  {porQuestao.map((q) => (
                    <tr key={q.questao_id}>
                      <td>{q.ordem}</td>
                      <td className="celula-enunciado">{q.enunciado}</td>
                      <td>
                        {q.acertos}/{q.alunos}
                      </td>
                      <td>{formatarTempo(q.media_tempo)}</td>
                      <td>{q.media_tentativas}</td>
                      <td>{q.media_p}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </>
  );
}

export default ProfessorResultadosView;
