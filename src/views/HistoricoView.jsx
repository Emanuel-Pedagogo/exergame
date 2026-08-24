import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';
import { formatarData, formatarTempo } from '../utils/formatters';

/** Histórico do aluno (RF17): pontuação, tentativas e tempo por execução. */
function HistoricoView({ profile, recarregar }) {
  const [execucoes, setExecucoes] = useState([]);
  const [carregando, setCarregando] = useState(true);

  useEffect(() => {
    let ativo = true;
    supabase
      .from('exergame_execucoes_lista')
      .select(
        'id, iniciado_em, finalizado_em, pt_total, tempo_total_seg, tentativas_totais, lista:exergame_listas(titulo, disciplina)',
      )
      .eq('aluno_id', profile.id)
      .order('iniciado_em', { ascending: false })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) toast.error(`Não consegui carregar o histórico: ${error.message}`);
        setExecucoes(data ?? []);
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [profile.id, recarregar]);

  if (carregando) return <p className="estado-vazio">Carregando histórico…</p>;
  if (execucoes.length === 0) {
    return <p className="estado-vazio">Você ainda não jogou nenhuma lista.</p>;
  }

  return (
    <div className="tabela-wrapper">
      <table className="tabela">
        <thead>
          <tr>
            <th scope="col">Lista</th>
            <th scope="col">Data</th>
            <th scope="col">PT</th>
            <th scope="col">Tempo</th>
            <th scope="col">Tentativas</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {execucoes.map((e) => (
            <tr key={e.id}>
              <td>
                {e.lista?.titulo ?? '—'}
                <span className="celula-nota">{e.lista?.disciplina}</span>
              </td>
              <td>{formatarData(e.iniciado_em)}</td>
              <td>{e.finalizado_em ? <strong>{e.pt_total}</strong> : '—'}</td>
              <td>{e.finalizado_em ? formatarTempo(e.tempo_total_seg) : '—'}</td>
              <td>{e.tentativas_totais}</td>
              <td>
                <span className={`chip ${e.finalizado_em ? 'chip--ok' : 'chip--pendente'}`}>
                  {e.finalizado_em ? 'Concluída' : 'Em andamento'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default HistoricoView;
