import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';
import { formatarData } from '../utils/formatters';

/** Tela inicial do aluno (RF07): listas disponíveis, pontuação e atalho de ranking. */
function AlunoHomeView({ profile, recarregar, onJogar, onVerRanking, onVerConquistas }) {
  const [listas, setListas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [iniciando, setIniciando] = useState(null);
  const [progresso, setProgresso] = useState(null);

  // Estilo .then em vez de async/await: o estado só muda dentro do callback,
  // nunca de forma síncrona no corpo do efeito (react-hooks/set-state-in-effect).
  const carregar = useCallback(() => {
    Promise.all([
      supabase.rpc('exergame_listas_aluno'),
      // XP, nível e sequência vêm do próprio perfil; medalhas, da contagem.
      supabase
        .from('exergame_profiles')
        .select('xp, nivel, sequencia_dias')
        .eq('id', profile.id)
        .maybeSingle(),
      supabase
        .from('exergame_conquistas_aluno')
        .select('conquista_slug', { count: 'exact', head: true })
        .eq('aluno_id', profile.id),
    ]).then(([{ data, error }, { data: perfil }, { count }]) => {
      if (error) toast.error(`Não consegui carregar as listas: ${error.message}`);
      setListas(data ?? []);
      setProgresso(perfil ? { ...perfil, medalhas: count ?? 0 } : null);
      setCarregando(false);
    });
  }, [profile.id]);

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

      {progresso && (
        <section className="painel-nivel">
          <div className="painel-nivel__topo">
            <span className="painel-nivel__selo">Nível {progresso.nivel}</span>
            <span className="painel-nivel__xp">{progresso.xp} XP</span>
          </div>

          {/* 500 XP por nível; a barra mostra o quanto falta para o próximo. */}
          <div
            className="barra-xp"
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={500}
            aria-valuenow={progresso.xp % 500}
            aria-label={`Progresso para o nível ${progresso.nivel + 1}`}
          >
            <div className="barra-xp__preenchida" style={{ width: `${((progresso.xp % 500) / 500) * 100}%` }} />
          </div>
          <p className="painel-nivel__nota">
            faltam <strong>{500 - (progresso.xp % 500)} XP</strong> para o nível {progresso.nivel + 1}
          </p>

          <div className="painel-nivel__selos">
            <button type="button" className="selo-info" onClick={onVerConquistas}>
              <span aria-hidden="true">🏅</span> {progresso.medalhas} conquista
              {progresso.medalhas === 1 ? '' : 's'}
            </button>
            <span className="selo-info">
              <span aria-hidden="true">🔥</span>{' '}
              {progresso.sequencia_dias === 1
                ? '1 dia seguido'
                : `${progresso.sequencia_dias} dias seguidos`}
            </span>
          </div>
        </section>
      )}

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
