import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';
import { formatarData } from '../utils/formatters';

const NOME_CATEGORIA = {
  desempenho: 'Desempenho',
  velocidade: 'Velocidade',
  constancia: 'Constância',
  superacao: 'Superação',
};

const ORDEM_CATEGORIA = ['desempenho', 'velocidade', 'constancia', 'superacao'];

/**
 * Conquistas do aluno.
 *
 * Mostra também as que ele ainda não tem — em cinza, mas com a descrição
 * visível. Esconder o que falta tiraria justamente o que dá o que perseguir;
 * é a diferença entre uma vitrine e uma lista de troféus já ganhos.
 */
function ConquistasView() {
  const [itens, setItens] = useState([]);
  const [carregando, setCarregando] = useState(true);

  const carregar = useCallback(
    () =>
      supabase.rpc('exergame_minhas_conquistas').then(({ data, error }) => {
        if (error) toast.error(`Não consegui carregar as conquistas: ${error.message}`);
        setItens(data ?? []);
        setCarregando(false);
      }),
    [],
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const ganhas = useMemo(() => itens.filter((i) => i.ganha_em).length, [itens]);

  const porCategoria = useMemo(() => {
    const mapa = new Map();
    for (const item of itens) {
      if (!mapa.has(item.categoria)) mapa.set(item.categoria, []);
      mapa.get(item.categoria).push(item);
    }
    return ORDEM_CATEGORIA.filter((c) => mapa.has(c)).map((c) => [c, mapa.get(c)]);
  }, [itens]);

  if (carregando) return <p className="estado-vazio">Carregando conquistas…</p>;

  return (
    <>
      <div className="secao-topo">
        <h2>Minhas conquistas</h2>
        <span className="chip">
          {ganhas} de {itens.length}
        </span>
      </div>

      {porCategoria.map(([categoria, lista]) => (
        <section key={categoria} className="grupo-conquistas">
          <h3 className="grupo-conquistas__titulo">{NOME_CATEGORIA[categoria] ?? categoria}</h3>
          <ul className="lista-conquistas">
            {lista.map((c) => (
              <li
                key={c.slug}
                className={`conquista${c.ganha_em ? ' conquista--ganha' : ' conquista--bloqueada'}`}
              >
                <span className="conquista__icone" aria-hidden="true">
                  {c.ganha_em ? c.icone : '🔒'}
                </span>
                <div>
                  <strong>{c.titulo}</strong>
                  <p>{c.descricao}</p>
                  {c.ganha_em && (
                    <small className="texto-ok">Conquistada em {formatarData(c.ganha_em)}</small>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

export default ConquistasView;
