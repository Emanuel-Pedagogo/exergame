import { useCallback, useEffect, useState } from 'react';
import ModalShell from '../components/ModalShell';
import { supabase } from '../supabaseClient';
import { toast, confirmAction } from '../utils/appFeedback';
import { ROTULO_DIFICULDADE, X_POR_DIFICULDADE } from '../utils/pontuacao';

const ALTERNATIVAS_PADRAO = [
  { texto: '', correta: true },
  { texto: '', correta: false },
  { texto: '', correta: false },
  { texto: '', correta: false },
];

function formVazio(ordem) {
  return {
    id: null,
    ordem,
    enunciado: '',
    dificuldade: 'facil',
    x_valor: X_POR_DIFICULDADE.facil,
    alternativas: ALTERNATIVAS_PADRAO.map((a) => ({ ...a })),
  };
}

/** CRUD de questões e alternativas (RF05–RF06). */
function ProfessorQuestoesView({ lista, onVoltar }) {
  const [questoes, setQuestoes] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    if (!lista) return;
    supabase
      .from('exergame_questoes')
      .select(
        'id, ordem, enunciado, dificuldade, x_valor, alternativas:exergame_alternativas(id, ordem, texto, correta)',
      )
      .eq('lista_id', lista.id)
      .order('ordem')
      .then(({ data, error }) => {
        if (error) toast.error(`Não consegui carregar as questões: ${error.message}`);
        setQuestoes(data ?? []);
        setCarregando(false);
      });
  }, [lista]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  if (!lista) {
    return (
      <p className="estado-vazio">
        Nenhuma lista selecionada.{' '}
        <button type="button" className="link-button" onClick={onVoltar}>
          Voltar
        </button>
      </p>
    );
  }

  const abrirNova = () => setForm(formVazio(questoes.length + 1));

  const abrirEdicao = (q) =>
    setForm({
      id: q.id,
      ordem: q.ordem,
      enunciado: q.enunciado,
      dificuldade: q.dificuldade,
      x_valor: q.x_valor,
      alternativas: [...(q.alternativas ?? [])]
        .sort((a, b) => a.ordem - b.ordem)
        .map((a) => ({ id: a.id, texto: a.texto, correta: a.correta })),
    });

  const alterarAlternativa = (indice, campo, valor) =>
    setForm((f) => ({
      ...f,
      alternativas: f.alternativas.map((a, i) =>
        campo === 'correta'
          ? { ...a, correta: i === indice }
          : i === indice
            ? { ...a, [campo]: valor }
            : a,
      ),
    }));

  const salvar = async (e) => {
    e.preventDefault();
    const preenchidas = form.alternativas.filter((a) => a.texto.trim());
    if (!form.enunciado.trim()) {
      toast.warn('Escreva o enunciado da questão.');
      return;
    }
    if (preenchidas.length < 2) {
      toast.warn('A questão precisa de pelo menos duas alternativas.');
      return;
    }
    if (!preenchidas.some((a) => a.correta)) {
      toast.warn('Marque qual alternativa é a correta.');
      return;
    }

    setSalvando(true);
    try {
      const payload = {
        lista_id: lista.id,
        ordem: form.ordem,
        enunciado: form.enunciado.trim(),
        dificuldade: form.dificuldade,
        x_valor: Number(form.x_valor) || X_POR_DIFICULDADE[form.dificuldade],
      };

      let questaoId = form.id;
      if (questaoId) {
        const { error } = await supabase
          .from('exergame_questoes')
          .update(payload)
          .eq('id', questaoId);
        if (error) throw error;
        const { error: erroDel } = await supabase
          .from('exergame_alternativas')
          .delete()
          .eq('questao_id', questaoId);
        if (erroDel) throw erroDel;
      } else {
        const { data, error } = await supabase
          .from('exergame_questoes')
          .insert(payload)
          .select('id')
          .single();
        if (error) throw error;
        questaoId = data.id;
      }

      const { error: erroAlt } = await supabase.from('exergame_alternativas').insert(
        preenchidas.map((a, i) => ({
          questao_id: questaoId,
          ordem: i + 1,
          texto: a.texto.trim(),
          correta: Boolean(a.correta),
        })),
      );
      if (erroAlt) throw erroAlt;

      toast.success(form.id ? 'Questão atualizada.' : 'Questão criada.');
      setForm(null);
      carregar();
    } catch (erro) {
      toast.error(erro.message);
    } finally {
      setSalvando(false);
    }
  };

  const excluir = async (q) => {
    // A confirmação diz qual questão e de qual lista: era genérica demais, e
    // apagar questão da lista errada não tem como desfazer.
    const trecho = q.enunciado.length > 90 ? `${q.enunciado.slice(0, 90)}…` : q.enunciado;
    const ok = await confirmAction({
      title: `Excluir a questão ${q.ordem} de "${lista.titulo}"?`,
      message: `"${trecho}"\n\nA questão, suas alternativas e as respostas dos alunos serão apagadas. Não dá para desfazer.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('exergame_questoes').delete().eq('id', q.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Questão excluída.');
    carregar();
  };

  return (
    <>
      <div className="secao-topo">
        <div>
          <button type="button" className="link-button" onClick={onVoltar}>
            ← Voltar para as listas
          </button>
          {/* Disciplina e turma junto do título: sem isso, duas listas de nomes
              parecidos ficam indistinguíveis aqui dentro — e excluir questão
              da lista errada não tem volta. */}
          <h2>{lista.titulo}</h2>
          <p className="card-lista__meta">
            <span className="chip">{lista.disc?.nome ?? lista.disciplina ?? 'Sem disciplina'}</span>{' '}
            {lista.turma?.nome ? `· ${lista.turma.nome}` : '· Todas as turmas'} ·{' '}
            {questoes.length} {questoes.length === 1 ? 'questão' : 'questões'}
          </p>
        </div>
        <button type="button" className="btn-primary btn-inline" onClick={abrirNova}>
          Nova questão
        </button>
      </div>

      {carregando && <p className="estado-vazio">Carregando…</p>}
      {!carregando && questoes.length === 0 && (
        <p className="estado-vazio">Esta lista ainda não tem questões.</p>
      )}

      <ol className="lista-questoes">
        {questoes.map((q) => (
          <li key={q.id} className="card-questao">
            <div className="card-questao__cabecalho">
              <span className={`chip chip--${q.dificuldade}`}>
                {ROTULO_DIFICULDADE[q.dificuldade] ?? q.dificuldade} · {q.x_valor} pts
              </span>
              <div className="card-questao__acoes">
                <button type="button" className="btn-secondary" onClick={() => abrirEdicao(q)}>
                  Editar
                </button>
                <button type="button" className="btn-danger" onClick={() => excluir(q)}>
                  Excluir
                </button>
              </div>
            </div>
            <p className="card-questao__enunciado">{q.enunciado}</p>
            <ul className="card-questao__alternativas">
              {[...(q.alternativas ?? [])]
                .sort((a, b) => a.ordem - b.ordem)
                .map((a, i) => (
                  <li key={a.id} className={a.correta ? 'alternativa-correta' : ''}>
                    <span className="alternativa__letra">{String.fromCharCode(65 + i)}</span>
                    {a.texto}
                    {a.correta && <span className="badge-correta">correta</span>}
                  </li>
                ))}
            </ul>
          </li>
        ))}
      </ol>

      <ModalShell open={Boolean(form)} onClose={() => setForm(null)} disabled={salvando} maxWidth={700}>
        {form && (
          <form onSubmit={salvar} className="form-modal">
            <h3>{form.id ? 'Editar questão' : 'Nova questão'}</h3>

            <div className="input-group">
              <label htmlFor="enunciado">Enunciado</label>
              <textarea
                id="enunciado"
                value={form.enunciado}
                onChange={(e) => setForm({ ...form, enunciado: e.target.value })}
              />
            </div>

            <div className="form-linha">
              <div className="input-group">
                <label htmlFor="dificuldade">Dificuldade</label>
                <select
                  id="dificuldade"
                  value={form.dificuldade}
                  onChange={(e) =>
                    setForm({
                      ...form,
                      dificuldade: e.target.value,
                      x_valor: X_POR_DIFICULDADE[e.target.value],
                    })
                  }
                >
                  {Object.entries(ROTULO_DIFICULDADE).map(([valor, rotulo]) => (
                    <option key={valor} value={valor}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </div>

              <div className="input-group">
                <label htmlFor="x_valor">Valor X (pontos iniciais)</label>
                <input
                  id="x_valor"
                  type="number"
                  min="1"
                  value={form.x_valor}
                  onChange={(e) => setForm({ ...form, x_valor: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label htmlFor="ordem">Ordem</label>
                <input
                  id="ordem"
                  type="number"
                  min="1"
                  value={form.ordem}
                  onChange={(e) => setForm({ ...form, ordem: Number(e.target.value) || 1 })}
                />
              </div>
            </div>

            <fieldset className="fieldset-alternativas">
              <legend>Alternativas (marque a correta)</legend>
              {form.alternativas.map((alt, i) => (
                <div key={i} className="linha-alternativa">
                  <input
                    type="radio"
                    name="correta"
                    checked={Boolean(alt.correta)}
                    onChange={() => alterarAlternativa(i, 'correta', true)}
                    aria-label={`Alternativa ${String.fromCharCode(65 + i)} é a correta`}
                  />
                  <input
                    type="text"
                    value={alt.texto}
                    placeholder={`Alternativa ${String.fromCharCode(65 + i)}`}
                    onChange={(e) => alterarAlternativa(i, 'texto', e.target.value)}
                  />
                </div>
              ))}
            </fieldset>

            <div className="form-modal__acoes">
              <button type="button" className="btn-secondary" onClick={() => setForm(null)}>
                Cancelar
              </button>
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </ModalShell>
    </>
  );
}

export default ProfessorQuestoesView;
