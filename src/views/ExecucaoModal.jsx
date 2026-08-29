import { useCallback, useEffect, useRef, useState } from 'react';
import ModalShell from '../components/ModalShell';
import { supabase } from '../supabaseClient';
import { toast, confirmAction } from '../utils/appFeedback';
import { formatarTempo, medalha } from '../utils/formatters';
import { ROTULO_DIFICULDADE, penalidadeTempo } from '../utils/pontuacao';
import { dispararMagia, tocarErro } from '../utils/magia';

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
  // O efeito de abrir a questão precisa depender do ID, não do objeto: acertar
  // reescreve o objeto da questão (para marcar `acertou`), e depender dele fazia
  // o efeito rodar de novo e limpar `ultimoResultado`. Sem esse resultado o
  // bloco "Próxima questão" some, e como as alternativas já estão desabilitadas
  // pelo acerto, a tela ficava sem nenhuma saída — travada.
  const questaoAtualId = questaoAtual?.questao_id;

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
    if (carregando || !questaoAtualId || resumo) return undefined;
    let ativo = true;
    supabase
      .rpc('exergame_abrir_questao', {
        p_execucao_id: execucaoId,
        p_questao_id: questaoAtualId,
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
  }, [carregando, questaoAtualId, execucaoId, resumo]);

  // --------------------------------------------------------- cronômetro ---
  useEffect(() => {
    if (carregando || resumo || !questaoAtualId) return undefined;
    const id = window.setInterval(() => {
      if (!inicioRef.current) return;
      setSegundos(Math.max(0, Math.floor((Date.now() - inicioRef.current) / 1000)));
    }, 250);
    return () => window.clearInterval(id);
  }, [carregando, resumo, questaoAtualId]);

  // ---------------------------------------------------------- responder ---
  const responder = async (alternativaId, evento) => {
    if (enviando || !questaoAtual) return;
    // Guarda o ponto do toque antes da chamada: é de lá que as faíscas saem, e
    // depois do await o evento já não serve.
    const origem = evento?.currentTarget?.getBoundingClientRect?.();
    const ponto = origem
      ? { x: origem.left + origem.width / 2, y: origem.top + origem.height / 2 }
      : {};
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
      tocarErro();
      toast.warn('Ainda não é essa. Tente de novo!');
      return;
    }

    dispararMagia({ ...ponto, peso: 1, tipo: 'acerto' });

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
    const fim = Array.isArray(data) ? data[0] : data;
    setResumo(fim);

    // Fim de lista é a comemoração grande: arpejo completo e faísca colorida,
    // saindo do centro da tela em vez de um botão.
    dispararMagia({ peso: 2, tipo: 'conclusao' });

    // Subir de nível ou ganhar medalha rende uma segunda salva, logo depois —
    // separada para o aluno perceber que aconteceu algo além de terminar.
    if (fim?.subiu_de_nivel || (fim?.conquistas ?? []).length > 0) {
      window.setTimeout(() => dispararMagia({ peso: 2, tipo: 'conclusao' }), 650);
    }
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
            {resumo.xp_ganho > 0 && (
              <div className="ganho-xp">
                <p className="ganho-xp__valor">+{resumo.xp_ganho} XP</p>
                {resumo.subiu_de_nivel ? (
                  <p className="ganho-xp__nivel">
                    🎉 Você chegou ao <strong>nível {resumo.nivel}</strong>!
                  </p>
                ) : (
                  <p className="ganho-xp__nivel">
                    Nível {resumo.nivel} · faltam{' '}
                    <strong>{500 - (resumo.xp_total % 500)} XP</strong> para o próximo
                  </p>
                )}
              </div>
            )}

            {(resumo.conquistas ?? []).length > 0 && (
              <div className="medalhas-novas">
                <p className="medalhas-novas__titulo">
                  {resumo.conquistas.length === 1 ? 'Nova conquista!' : 'Novas conquistas!'}
                </p>
                <ul>
                  {resumo.conquistas.map((c) => (
                    <li key={c.slug}>
                      <span className="medalha__icone" aria-hidden="true">{c.icone}</span>
                      <span>
                        <strong>{c.titulo}</strong>
                        <br />
                        <small>{c.descricao}</small>
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

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
                      onClick={(e) => responder(alt.id, e)}
                    >
                      <span className="alternativa__letra">{String.fromCharCode(65 + i)}</span>
                      <span>{alt.texto}</span>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Basta a questão estar acertada para o botão aparecer. Amarrar isso
                também a `ultimoResultado` deixava a tela sem saída sempre que o
                resultado se perdia — por exemplo ao reabrir uma questão já
                respondida, quando as alternativas já nascem desabilitadas. */}
            {questaoAtual.acertou && (
              <div className="execucao__feedback">
                {ultimoResultado?.correta ? (
                  <p>
                    Acertou em {ultimoResultado.tentativas}{' '}
                    {ultimoResultado.tentativas === 1 ? 'tentativa' : 'tentativas'} e{' '}
                    {formatarTempo(ultimoResultado.tempo_seg)} —{' '}
                    <strong>+{ultimoResultado.p_final} pontos</strong>
                  </p>
                ) : (
                  <p>
                    Você já acertou esta questão —{' '}
                    <strong>+{questaoAtual.p_final} pontos</strong>
                  </p>
                )}
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
