import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';
import { formatarData } from '../utils/formatters';

/** Tela inicial do aluno (RF07): listas disponíveis, pontuação e atalho de ranking. */
function AlunoHomeView({ profile, recarregar, onJogar, onVerRanking }) {
  const [listas, setListas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(null);

  // Estilo .then em vez de async/await: o estado só muda dentro do callback,
  // nunca de forma síncrona no corpo do efeito (react-hooks/set-state-in-effect).
  const carregar = useCallback(() => {
    supabase.rpc('exergame_listas_aluno').then(({ data, error }) => {
      if (error) toast.error(`Não consegui carregar as listas: ${error.message}`);
      setListas(data ?? []);
      setCarregando(false);
    });
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar, recarregar]);

  const pontuacaoGeral = listas.reduce((soma, l) => soma + (l.melhor_pt ?? 0), 0);

  const jogar = async (lista) => {
    setIniciando(lista.lista_id);
    const { data, error } = await supabase.rpc('exergame_iniciar_execucao', {
      p_lista_id: lista.lista_id,
    });
    setIniciando(null);
    if (error) {
      toast.error(`Não consegui abrir a lista: ${error.message}`);
      return;
    }
    onJogar(lista, data);
  };

  return (
    <>
      <section className="painel-destaque">
        <div>
          <p className="painel-destaque__rotulo">Sua pontuação total</p>
          <p className="painel-destaque__valor">{pontuacaoGeral}</p>
          <p className="painel-destaque__nota">
            soma da melhor pontuação de cada lista concluída
          </p>
        </div>
        <span className="painel-destaque__icone" aria-hidden="true">🏆</span>
      </section>

      {carregando && <p className="estado-vazio">Carregando listas…</p>}

      {!carregando && listas.length === 0 && (
        <p className="estado-vazio">
          Nenhuma lista liberada para a sua turma ainda.
          {!profile.turma_id && ' Peça ao professor para vincular você a uma turma.'}
        </p>
      )}

      <div className="cards-grid">
        {listas.map((lista) => (
          <article key={lista.lista_id} className="card-lista">
            <header>
              <span className="chip">{lista.disciplina}</span>
              <h2>{lista.titulo}</h2>
            </header>

            <dl className="card-lista__dados">
              <div>
                <dt>Questões</dt>
                <dd>{lista.qtd_questoes}</dd>
              </div>
              <div>
                <dt>Melhor PT</dt>
                <dd>{lista.melhor_pt}</dd>
              </div>
              <div>
                <dt>Última vez</dt>
                <dd>{formatarData(lista.ultima_execucao)}</dd>
              </div>
            </dl>

            <div className="card-lista__acoes">
              <button
                type="button"
                className="btn-primary"
                disabled={iniciando === lista.lista_id || lista.qtd_questoes === 0}
                onClick={() => jogar(lista)}
              >
                {lista.qtd_questoes === 0
                  ? 'Sem questões'
                  : lista.em_andamento
                    ? 'Continuar'
                    : lista.ultima_execucao
                      ? 'Jogar de novo'
                      : 'Começar'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onVerRanking({ id: lista.lista_id, titulo: lista.titulo })}
              >
                Ranking
              </button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}

export default AlunoHomeView;
