import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';
import { formatarTempo, medalha } from '../utils/formatters';

/** Ranking comparativo da lista (RF12–RF13). */
function RankingView({ profile, listaInicial }) {
  const [listas, setListas] = useState([]);
  const [listaId, setListaId] = useState(listaInicial?.id ?? '');
  const [linhas, setLinhas] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    supabase.rpc('exergame_listas_aluno').then(({ data, error }) => {
      if (error) {
        toast.error(`Não consegui carregar as listas: ${error.message}`);
        return;
      }
      const opcoes = data ?? [];
      setListas(opcoes);
      setListaId((atual) => atual || opcoes[0]?.lista_id || '');
    });
  }, []);

  const carregar = useCallback((id) => {
    if (!id) return;
    supabase.rpc('exergame_ranking', { p_lista_id: id }).then(({ data, error }) => {
      if (error) toast.error(`Não consegui carregar o ranking: ${error.message}`);
      setLinhas(data ?? []);
      setCarregando(false);
    });
  }, []);

  useEffect(() => {
    carregar(listaId);
  }, [carregar, listaId]);

  const minhaLinha = linhas.find((l) => l.aluno_id === profile.id);

  return (
    <>
      <div className="filter-bar">
        <label htmlFor="ranking-lista">Lista</label>
        <select
          id="ranking-lista"
          value={listaId}
          onChange={(e) => {
            setCarregando(true);
            setListaId(e.target.value);
          }}
        >
          {listas.map((l) => (
            <option key={l.lista_id} value={l.lista_id}>
              {l.titulo}
            </option>
          ))}
        </select>
      </div>

      {minhaLinha && (
        <p className="feedback-posicao">
          Você está em <strong>{minhaLinha.posicao}º</strong> lugar com{' '}
          <strong>{minhaLinha.pt_total} pontos</strong> em{' '}
          {formatarTempo(minhaLinha.tempo_total_seg)}.
        </p>
      )}

      {carregando && <p className="estado-vazio">Carregando ranking…</p>}

      {!carregando && linhas.length === 0 && (
        <p className="estado-vazio">Ninguém concluiu esta lista ainda. Seja o primeiro!</p>
      )}

      {linhas.length > 0 && (
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Aluno</th>
                <th scope="col">PT</th>
                <th scope="col">Tempo</th>
                <th scope="col">Tentativas</th>
              </tr>
            </thead>
            <tbody>
              {linhas.map((l) => (
                <tr key={l.aluno_id} className={l.aluno_id === profile.id ? 'linha--destaque' : ''}>
                  <td>{medalha(l.posicao)}</td>
                  <td>{l.nome}</td>
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
    </>
  );
}

export default RankingView;
