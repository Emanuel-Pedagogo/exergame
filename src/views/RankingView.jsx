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

  // Dois rankings que medem coisas diferentes: o da lista mostra quem foi melhor
  // naquela lista; o geral soma o XP de sempre, então aparece quem pratica com
  // constância — inclusive quem começou devagar.
  const [aba, setAba] = useState('lista'); // 'lista' | 'geral'
  const [linhasXp, setLinhasXp] = useState([]);
  const [carregandoXp, setCarregandoXp] = useState(true);

  useEffect(() => {
    if (aba !== 'geral') return;
    supabase.rpc('exergame_ranking_xp').then(({ data, error }) => {
      if (error) toast.error(`Não consegui carregar o ranking geral: ${error.message}`);
      setLinhasXp(data ?? []);
      setCarregandoXp(false);
    });
  }, [aba]);

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

  const minhaLinhaXp = linhasXp.find((l) => l.aluno_id === profile.id);

  return (
    <>
      <div className="auth-tabs" role="tablist" aria-label="Tipo de ranking">
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'lista'}
          className={`auth-tab${aba === 'lista' ? ' auth-tab--ativa' : ''}`}
          onClick={() => setAba('lista')}
        >
          Por lista
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={aba === 'geral'}
          className={`auth-tab${aba === 'geral' ? ' auth-tab--ativa' : ''}`}
          onClick={() => setAba('geral')}
        >
          Geral (XP)
        </button>
      </div>

      {aba === 'geral' && (
        <>
          {minhaLinhaXp && (
            <p className="feedback-posicao">
              Você está em <strong>{minhaLinhaXp.posicao}º</strong> na turma, com{' '}
              <strong>{minhaLinhaXp.xp} XP</strong> — nível {minhaLinhaXp.nivel}.
            </p>
          )}

          {carregandoXp && <p className="estado-vazio">Carregando ranking…</p>}

          {!carregandoXp && linhasXp.length === 0 && (
            <p className="estado-vazio">Ninguém da turma pontuou ainda.</p>
          )}

          {linhasXp.length > 0 && (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th scope="col">#</th>
                    <th scope="col">Aluno</th>
                    <th scope="col">XP</th>
                    <th scope="col">Nível</th>
                    <th scope="col">🏅</th>
                    <th scope="col">🔥</th>
                  </tr>
                </thead>
                <tbody>
                  {linhasXp.map((l) => (
                    <tr
                      key={l.aluno_id}
                      className={l.aluno_id === profile.id ? 'linha--destaque' : ''}
                    >
                      <td>{medalha(l.posicao)}</td>
                      <td>{l.nome}</td>
                      <td>
                        <strong>{l.xp}</strong>
                      </td>
                      <td>{l.nivel}</td>
                      <td>{l.medalhas}</td>
                      <td>{l.sequencia}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {aba === 'lista' && (
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
      )}
    </>
  );
}

export default RankingView;
