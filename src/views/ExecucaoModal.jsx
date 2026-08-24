import { useCallback, useEffect, useRef, useState } from 'react';
import ModalShell from '../components/ModalShell';
import { supabase } from '../supabaseClient';
import { toast, confirmAction } from '../utils/appFeedback';
import { formatarTempo, medalha } from '../utils/formatters';
import { ROTULO_DIFICULDADE, penalidadeTempo } from '../utils/pontuacao';

/**
 * Execução de uma lista (RF08–RF13).
 *
 * O cronômetro daqui é só exibição. O tempo que conta é medido no servidor,
 * entre exergame_abrir_questao() e exergame_responder() — por isso a prévia
 * de pontos na tela usa o mesmo cálculo, mas o valor final vem da RPC.
 */
function ExecucaoModal({ lista, execucaoId, onFechar }) {
  const [questoes, setQuestoes] = useState([]);
  const [indice, setIndice] = useState(0);
  const [carregando, setCarregando] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [erradas, setErradas] = useState([]);
  const [ultimoResultado, setUltimoResultado] = useState(null);
  const [resumo, setResumo] = useState(null);
  const [segundos, setSegundos] = useState(0);

  const inicioRef = useRef(null);
  const questaoAtual = questoes[indice];

  // ------------------------------------------------------------ carregar --
  useEffect(() => {
    let ativo = true;
    supabase
      .rpc('exergame_obter_questoes', { p_execucao_id: execucaoId })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          toast.error(`Não consegui carregar as questões: ${error.message}`);
          onFechar(false);
          return;
        }
        const linhas = data ?? [];
        setQuestoes(linhas);
        const proxima = linhas.findIndex((q) => !q.acertou);
        setIndice(proxima === -1 ? 0 : proxima);
        setCarregando(false);
      });
    return () => {
      ativo = false;
    };
  }, [execucaoId, onFechar]);

  // ------------------------------------------- abrir a questão no servidor --
  useEffect(() => {
    if (carregando || !questaoAtual || resumo) return;
    let ativo = true;
    supabase
      .rpc('exergame_abrir_questao', {
        p_execucao_id: execucaoId,
        p_questao_id: questaoAtual.questao_id,
      })
      .then(({ data, error }) => {
        if (!ativo) return;
        if (error) {
          toast.error(`Não consegui iniciar a questão: ${error.message}`);
          return;
        }
        setErradas([]);
        setUltimoResultado(null);
        inicioRef.current = data ? new Date(data).getTime() : Date.now();
        setSegundos(Math.max(0, Math.floor((Date.now() - inicioRef.current) / 1000)));
      });
    return () => {
      ativo = false;
    };
  }, [carregando, questaoAtual, execucaoId, resumo]);

  // --------------------------------------------------------- cronômetro ---
  useEffect(() => {
    if (carregando || resumo || !questaoAtual) return undefined;
    const id = window.setInterval(() => {
      if (!inicioRef.current) return;
      setSegundos(Math.max(0, Math.floor((Date.now() - inicioRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [carregando, resumo, questaoAtual]);

  // ---------------------------------------------------------- responder ---
  const responder = async (alternativaId) => {
    if (enviando || !questaoAtual) return;
    setEnviando(true);
    const { data, error } = await supabase.rpc('exergame_responder', {
      p_execucao_id: execucaoId,
      p_questao_id: questaoAtual.questao_id,
      p_alternativa_id: alternativaId,
    });
    setEnviando(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const bruto = Array.isArray(data) ? data[0] : data;
    const resultado = { ...bruto, alternativa_id: alternativaId };
    setUltimoResultado(resultado);

    if (!resultado?.correta) {
      setErradas((prev) => [...prev, alternativaId]);
      toast.warn('Ainda não é essa. Tente de novo!');
      return;
    }

    setQuestoes((prev) =>
      prev.map((q, i) =>
        i === indice
          ? { ...q, acertou: true, p_final: resultado.p_final, tentativas: resultado.tentativas }
          : q,
      ),
    );
  };

  const avancar = async () => {
    const proxima = questoes.findIndex((q, i) => i > indice && !q.acertou);
    if (proxima !== -1) {
      setIndice(proxima);
      return;
    }
    await finalizar();
  };

  const finalizar = useCallback(async () => {
    setEnviando(true);
    const { data, error } = await supabase.rpc('exergame_finalizar_execucao', {
      p_execucao_id: execucaoId,
    });
    setEnviando(false);
    if (error) {
      toast.error(`Não consegui finalizar: ${error.message}`);
      return;
    }
    setResumo(Array.isArray(data) ? data[0] : data);
  }, [execucaoId]);

  const tentarFechar = async () => {
    if (resumo) {
      onFechar(true);
      return;
    }
    const ok = await confirmAction({
      title: 'Sair da lista?',
      message: 'Seu progresso fica salvo e você pode continuar depois.',
      confirmLabel: 'Sair',
      cancelLabel: 'Continuar jogando',
    });
    if (ok) onFechar(true);
  };

  const acertos = questoes.filter((q) => q.acertou).length;
  const ptParcial = questoes.reduce((s, q) => s + (q.acertou ? q.p_final : 0), 0);
  const penalidadeAtual = penalidadeTempo(segundos);

  return (
    <ModalShell open onClose={tentarFechar} disabled={enviando} maxWidth={720}>
      <div className="execucao">
        <header className="execucao__topo">
          <div>
            <p className="execucao__lista">{lista?.titulo ?? 'Lista'}</p>
            {!resumo && (
              <p className="execucao__progresso">
                Questão {indice + 1} de {questoes.length} · {acertos} acertos
              </p>
            )}
          </div>
          <button
            type="button"
            className="execucao__fechar"
            onClick={tentarFechar}
            aria-label="Fechar lista"
          >
            ×
          </button>
        </header>

        {carregando && <p className="estado-vazio">Preparando as questões…</p>}

        {!carregando && resumo && (
          <div className="execucao__resumo">
            <p className="execucao__resumo-icone" aria-hidden="true">🎉</p>
            <h2>Lista concluída!</h2>
            <div className="execucao__resumo-grid">
              <div>
                <span>Pontuação (PT)</span>
                <strong>{resumo.pt_total}</strong>
              </div>
              <div>
                <span>Tempo total</span>
                <strong>{formatarTempo(resumo.tempo_total_seg)}</strong>
              </div>
              <div>
                <span>Tentativas</span>
                <strong>{resumo.tentativas_totais}</strong>
              </div>
              <div>
                <span>Posição</span>
                <strong>{resumo.posicao ? medalha(resumo.posicao) : '—'}</strong>
              </div>
            </div>
            <p className="execucao__resumo-nota">
              {resumo.posicao === 1
                ? 'Você está em primeiro lugar nesta lista!'
                : resumo.posicao
                  ? `Você está em ${resumo.posicao}º lugar nesta lista. Jogue de novo para subir!`
                  : 'Resultado registrado.'}
            </p>
            <button type="button" className="btn-primary" onClick={() => onFechar(true)}>
              Voltar para as listas
            </button>
          </div>
        )}

        {!carregando && !resumo && questaoAtual && (
          <>
            <div className="execucao__hud">
              <span className="hud-item">
                <span className="hud-item__rotulo">Tempo</span>
                <strong className={segundos > 20 ? 'hud-item__valor hud-item__valor--alerta' : 'hud-item__valor'}>
                  {formatarTempo(segundos)}
                </strong>
              </span>
              <span className="hud-item">
                <span className="hud-item__rotulo">Vale</span>
                <strong className="hud-item__valor">{questaoAtual.x_valor} pts</strong>
              </span>
              <span className="hud-item">
                <span className="hud-item__rotulo">Penalidade tempo</span>
                <strong className="hud-item__valor">−{penalidadeAtual}</strong>
              </span>
              <span className="hud-item">
                <span className="hud-item__rotulo">PT parcial</span>
                <strong className="hud-item__valor">{ptParcial}</strong>
              </span>
            </div>

            <div className="execucao__questao">
              <span className={`chip chip--${questaoAtual.dificuldade}`}>
                {ROTULO_DIFICULDADE[questaoAtual.dificuldade] ?? questaoAtual.dificuldade}
              </span>
              <p className="execucao__enunciado">{questaoAtual.enunciado}</p>
            </div>

            <ul className="alternativas">
              {questaoAtual.alternativas.map((alt, i) => {
                const errada = erradas.includes(alt.id);
                const acertada = ultimoResultado?.correta && ultimoResultado.alternativa_id === alt.id;
                return (
                  <li key={alt.id}>
                    <button
                      type="button"
                      className={`alternativa${errada ? ' alternativa--errada' : ''}${
                        acertada ? ' alternativa--certa' : ''
                      }`}
                      disabled={enviando || errada || questaoAtual.acertou}
                      onClick={() => responder(alt.id)}
                    >
                      <span className="alternativa__letra">{String.fromCharCode(65 + i)}</span>
                      <span>{alt.texto}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {questaoAtual.acertou && ultimoResultado?.correta && (
              <div className="execucao__feedback">
                <p>
                  Acertou em {ultimoResultado.tentativas}{' '}
                  {ultimoResultado.tentativas === 1 ? 'tentativa' : 'tentativas'} e{' '}
                  {formatarTempo(ultimoResultado.tempo_seg)} —{' '}
                  <strong>+{ultimoResultado.p_final} pontos</strong>
                </p>
                <button type="button" className="btn-primary" onClick={avancar} disabled={enviando}>
                  {questoes.some((q, i) => i > indice && !q.acertou)
                    ? 'Próxima questão'
                    : 'Finalizar lista'}
                </button>
              </div>
            )}

            {!questaoAtual.acertou && (
              <p className="execucao__dica">
                Responder em menos de 10s não tem penalidade. A partir da 2ª tentativa, −20 pontos.
              </p>
            )}
          </>
        )}
      </div>
    </ModalShell>
  );
}

export default ExecucaoModal;
