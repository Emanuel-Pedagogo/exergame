import { useCallback, useEffect, useState } from 'react';
import ModalShell from '../components/ModalShell';
import { supabase } from '../supabaseClient';
import { toast, confirmAction } from '../utils/appFeedback';

const FORM_VAZIO = { id: null, titulo: '', disciplina: 'Matemática', turma_id: '', ativa: false };

/** CRUD de listas do professor (RF04, RF16). */
function ProfessorListasView({ profile, onAbrirQuestoes, onAbrirResultados }) {
  const [listas, setListas] = useState([]);
  const [turmas, setTurmas] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [form, setForm] = useState(null);
  const [salvando, setSalvando] = useState(false);

  const carregar = useCallback(() => {
    Promise.all([
      supabase
        .from('exergame_listas')
        .select(
          'id, titulo, disciplina, turma_id, ativa, criado_em, turma:exergame_turmas(nome), questoes:exergame_questoes(count)',
        )
        .eq('professor_id', profile.id)
        .order('criado_em', { ascending: false }),
      supabase.from('exergame_turmas').select('id, nome, ano').order('nome'),
    ]).then(([{ data: dadosListas, error }, { data: dadosTurmas }]) => {
      if (error) toast.error(`Não consegui carregar as listas: ${error.message}`);
      setListas(dadosListas ?? []);
      setTurmas(dadosTurmas ?? []);
      setCarregando(false);
    });
  }, [profile.id]);

  useEffect(() => {
    carregar();
  }, [carregar]);

  const salvar = async (e) => {
    e.preventDefault();
    if (!form.titulo.trim()) {
      toast.warn('Informe o título da lista.');
      return;
    }
    setSalvando(true);
    const payload = {
      titulo: form.titulo.trim(),
      disciplina: form.disciplina.trim() || 'Matemática',
      turma_id: form.turma_id || null,
      ativa: form.ativa,
      professor_id: profile.id,
    };
    const { error } = form.id
      ? await supabase.from('exergame_listas').update(payload).eq('id', form.id)
      : await supabase.from('exergame_listas').insert(payload);
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(form.id ? 'Lista atualizada.' : 'Lista criada.');
    setForm(null);
    carregar();
  };

  const alternarAtiva = async (lista) => {
    const { error } = await supabase
      .from('exergame_listas')
      .update({ ativa: !lista.ativa })
      .eq('id', lista.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(lista.ativa ? 'Lista despublicada.' : 'Lista liberada para a turma.');
    carregar();
  };

  const excluir = async (lista) => {
    const ok = await confirmAction({
      title: 'Excluir lista',
      message: `Excluir "${lista.titulo}"? As questões e os resultados dela serão apagados.`,
      confirmLabel: 'Excluir',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('exergame_listas').delete().eq('id', lista.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Lista excluída.');
    carregar();
  };

  return (
    <>
      <div className="secao-topo">
        <h2>Minhas listas</h2>
        <button type="button" className="btn-primary btn-inline" onClick={() => setForm(FORM_VAZIO)}>
          Nova lista
        </button>
      </div>

      {carregando && <p className="estado-vazio">Carregando…</p>}
      {!carregando && listas.length === 0 && (
        <p className="estado-vazio">Você ainda não criou nenhuma lista.</p>
      )}

      <div className="cards-grid">
        {listas.map((lista) => (
          <article key={lista.id} className="card-lista">
            <header>
              <span className="chip">{lista.disciplina}</span>
              <h3>{lista.titulo}</h3>
              <p className="card-lista__meta">
                {lista.turma?.nome ?? 'Todas as turmas'} ·{' '}
                {lista.questoes?.[0]?.count ?? 0} questões ·{' '}
                <span className={lista.ativa ? 'texto-ok' : 'texto-pendente'}>
                  {lista.ativa ? 'liberada' : 'rascunho'}
                </span>
              </p>
            </header>

            <div className="card-lista__acoes card-lista__acoes--empilhado">
              <button type="button" className="btn-primary" onClick={() => onAbrirQuestoes(lista)}>
                Questões
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => onAbrirResultados(lista)}
              >
                Resultados
              </button>
              <button type="button" className="btn-secondary" onClick={() => alternarAtiva(lista)}>
                {lista.ativa ? 'Despublicar' : 'Liberar'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                onClick={() =>
                  setForm({
                    id: lista.id,
                    titulo: lista.titulo,
                    disciplina: lista.disciplina,
                    turma_id: lista.turma_id ?? '',
                    ativa: lista.ativa,
                  })
                }
              >
                Editar
              </button>
              <button type="button" className="btn-danger" onClick={() => excluir(lista)}>
                Excluir
              </button>
            </div>
          </article>
        ))}
      </div>

      <ModalShell open={Boolean(form)} onClose={() => setForm(null)} disabled={salvando}>
        {form && (
          <form onSubmit={salvar} className="form-modal">
            <h3>{form.id ? 'Editar lista' : 'Nova lista'}</h3>

            <div className="input-group">
              <label htmlFor="titulo">Título</label>
              <input
                id="titulo"
                value={form.titulo}
                onChange={(e) => setForm({ ...form, titulo: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="disciplina">Disciplina</label>
              <input
                id="disciplina"
                value={form.disciplina}
                onChange={(e) => setForm({ ...form, disciplina: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="turma">Turma</label>
              <select
                id="turma"
                value={form.turma_id}
                onChange={(e) => setForm({ ...form, turma_id: e.target.value })}
              >
                <option value="">Todas as turmas</option>
                {turmas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.ano})
                  </option>
                ))}
              </select>
            </div>

            <label className="checkbox-linha">
              <input
                type="checkbox"
                checked={form.ativa}
                onChange={(e) => setForm({ ...form, ativa: e.target.checked })}
              />
              Liberar para os alunos agora
            </label>

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

export default ProfessorListasView;
