import { useCallback, useEffect, useMemo, useState } from 'react';
import ModalShell from '../components/ModalShell';
import { supabase } from '../supabaseClient';
import { toast, confirmAction } from '../utils/appFeedback';
import { parsearListaAlunos, SITUACAO_ALUNO } from '../utils/listaAlunos';

/**
 * Lista da turma montada pelo professor.
 *
 * O professor não cria contas — isso exigiria a chave de serviço, que não pode
 * viver no navegador. Ele deixa a matrícula reservada com o nome e a turma
 * certos; a conta nasce quando o aluno faz o primeiro acesso e escolhe a senha.
 * Por isso cada linha tem um estado: "aguardando 1º acesso" ou "entrou".
 */
function ProfessorAlunosView() {
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(null); // 'um' | 'lote' | 'turma'
  const [form, setForm] = useState({ nome: '', matricula: '' });
  const [lote, setLote] = useState('');
  const [novaTurma, setNovaTurma] = useState({ nome: '', ano: String(new Date().getFullYear()) });
  const [relatorio, setRelatorio] = useState(null);

  // Os setState ficam todos dentro do .then(): chamá-los direto no corpo do
  // efeito dispara renders em cascata (regra react-hooks/set-state-in-effect).
  // Mesmo padrão das outras telas do professor.
  const carregarTurmas = useCallback(
    () =>
      supabase
        .from('exergame_turmas')
        .select('id, nome, ano')
        .order('nome')
        .then(({ data }) => {
          const lista = data ?? [];
          setTurmas(lista);
          setTurmaId((atual) => atual || lista[0]?.id || '');
          if (lista.length === 0) setCarregando(false);
          return lista;
        }),
    [],
  );

  const carregarAlunos = useCallback(() => {
    if (!turmaId) {
      return Promise.resolve().then(() => {
        setAlunos([]);
        setCarregando(false);
      });
    }
    return supabase
      .from('exergame_matriculas')
      .select('id, matricula, nome, ativado_em, criado_em')
      .eq('turma_id', turmaId)
      .order('nome')
      .then(({ data, error }) => {
        if (error) toast.error(`Não consegui carregar a lista: ${error.message}`);
        setAlunos(data ?? []);
        setCarregando(false);
      });
  }, [turmaId]);

  useEffect(() => {
    carregarTurmas();
  }, [carregarTurmas]);

  useEffect(() => {
    carregarAlunos();
  }, [carregarAlunos]);

  const resumo = useMemo(() => {
    const entraram = alunos.filter((a) => a.ativado_em).length;
    return { total: alunos.length, entraram, aguardando: alunos.length - entraram };
  }, [alunos]);

  const previaLote = useMemo(() => parsearListaAlunos(lote), [lote]);

  const enviar = async (linhas) => {
    if (linhas.length === 0) {
      toast.warn('Nenhum aluno para cadastrar.');
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.rpc('exergame_cadastrar_alunos', {
      p_turma_id: turmaId,
      p_alunos: linhas.map(({ nome, matricula }) => ({ nome, matricula })),
    });
    setSalvando(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const novos = (data ?? []).filter((r) => r.situacao === 'cadastrado').length;
    const repetidos = (data ?? []).length - novos;
    toast.success(
      novos === 1 ? '1 aluno cadastrado.' : `${novos} alunos cadastrados.`,
    );
    setModal(null);
    setForm({ nome: '', matricula: '' });
    setLote('');
    if (repetidos > 0) setRelatorio(data);
    carregarAlunos();
  };

  const criarTurma = async (e) => {
    e.preventDefault();
    if (!novaTurma.nome.trim()) {
      toast.warn('Informe o nome da turma.');
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.rpc('exergame_criar_turma', {
      p_nome: novaTurma.nome.trim(),
      p_ano: Number(novaTurma.ano) || null,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Turma criada.');
    setModal(null);
    setNovaTurma({ nome: '', ano: String(new Date().getFullYear()) });
    await carregarTurmas();
    if (data) setTurmaId(data);
  };

  const remover = async (aluno) => {
    if (aluno.ativado_em) {
      toast.warn('Este aluno já entrou no app. Remover a linha não apaga a conta dele.');
      return;
    }
    const ok = await confirmAction({
      title: 'Tirar da lista',
      message: `Tirar ${aluno.nome} da lista da turma? A matrícula ${aluno.matricula} fica livre de novo.`,
      confirmLabel: 'Tirar da lista',
      danger: true,
    });
    if (!ok) return;
    const { error } = await supabase.from('exergame_matriculas').delete().eq('id', aluno.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Aluno tirado da lista.');
    carregarAlunos();
  };

  return (
    <>
      <div className="secao-topo">
        <h2>Alunos da turma</h2>
        <div className="card-lista__acoes">
          <button type="button" className="btn-secondary btn-inline" onClick={() => setModal('turma')}>
            Nova turma
          </button>
          <button
            type="button"
            className="btn-secondary btn-inline"
            onClick={() => setModal('lote')}
            disabled={!turmaId}
          >
            Colar lista
          </button>
          <button
            type="button"
            className="btn-primary btn-inline"
            onClick={() => setModal('um')}
            disabled={!turmaId}
          >
            Adicionar aluno
          </button>
        </div>
      </div>

      {turmas.length === 0 ? (
        <p className="estado-vazio">
          Você ainda não tem turmas. Crie uma turma para começar a montar a lista.
        </p>
      ) : (
        <div className="input-group">
          <label htmlFor="turma-alunos">Turma</label>
          <select id="turma-alunos" value={turmaId} onChange={(e) => setTurmaId(e.target.value)}>
            {turmas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.nome} ({t.ano})
              </option>
            ))}
          </select>
        </div>
      )}

      {turmaId && !carregando && alunos.length > 0 && (
        <p className="card-lista__meta">
          {resumo.total} na lista · <span className="texto-ok">{resumo.entraram} já entraram</span> ·{' '}
          <span className="texto-pendente">{resumo.aguardando} aguardando o 1º acesso</span>
        </p>
      )}

      {carregando && <p className="estado-vazio">Carregando…</p>}

      {!carregando && turmaId && alunos.length === 0 && (
        <p className="estado-vazio">
          Nenhum aluno nesta turma ainda. Use “Colar lista” para cadastrar a turma inteira de uma vez.
        </p>
      )}

      {alunos.length > 0 && (
        <div className="tabela-wrapper">
          <table className="tabela">
            <thead>
              <tr>
                <th>Nome</th>
                <th>Matrícula</th>
                <th>Situação</th>
                <th aria-label="Ações" />
              </tr>
            </thead>
            <tbody>
              {alunos.map((aluno) => (
                <tr key={aluno.id}>
                  <td>{aluno.nome}</td>
                  <td>
                    <code>{aluno.matricula}</code>
                  </td>
                  <td>
                    {aluno.ativado_em ? (
                      <span className="texto-ok">Entrou</span>
                    ) : (
                      <span className="texto-pendente">Aguardando 1º acesso</span>
                    )}
                  </td>
                  <td>
                    {!aluno.ativado_em && (
                      <button type="button" className="btn-danger" onClick={() => remover(aluno)}>
                        Tirar
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alunos.length > 0 && (
        <p className="card-lista__meta">
          Entregue a cada aluno a matrícula dele. No primeiro acesso, ele escolhe a própria senha em
          “Sou aluno → Ainda não tenho conta”.
        </p>
      )}

      {/* ---------------------------------------------------------- um aluno */}
      <ModalShell open={modal === 'um'} onClose={() => setModal(null)} disabled={salvando}>
        <form
          className="form-modal"
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.nome.trim()) {
              toast.warn('Informe o nome do aluno.');
              return;
            }
            enviar([{ nome: form.nome.trim(), matricula: form.matricula.trim() }]);
          }}
        >
          <h3>Adicionar aluno</h3>

          <div className="input-group">
            <label htmlFor="aluno-nome">Nome completo</label>
            <input
              id="aluno-nome"
              value={form.nome}
              onChange={(e) => setForm({ ...form, nome: e.target.value })}
            />
          </div>

          <div className="input-group">
            <label htmlFor="aluno-matricula">Matrícula (opcional)</label>
            <input
              id="aluno-matricula"
              value={form.matricula}
              onChange={(e) => setForm({ ...form, matricula: e.target.value })}
              autoCapitalize="none"
              spellCheck="false"
              placeholder="Deixe em branco para gerar automaticamente"
            />
          </div>

          <div className="card-lista__acoes">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Salvando…' : 'Adicionar'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
          </div>
        </form>
      </ModalShell>

      {/* -------------------------------------------------------- turma nova */}
      <ModalShell open={modal === 'turma'} onClose={() => setModal(null)} disabled={salvando}>
        <form className="form-modal" onSubmit={criarTurma}>
          <h3>Nova turma</h3>

          <div className="input-group">
            <label htmlFor="turma-nome">Nome</label>
            <input
              id="turma-nome"
              value={novaTurma.nome}
              onChange={(e) => setNovaTurma({ ...novaTurma, nome: e.target.value })}
              placeholder="Ex.: 5º ano B"
            />
          </div>

          <div className="input-group">
            <label htmlFor="turma-ano">Ano</label>
            <input
              id="turma-ano"
              inputMode="numeric"
              value={novaTurma.ano}
              onChange={(e) => setNovaTurma({ ...novaTurma, ano: e.target.value })}
            />
          </div>

          <div className="card-lista__acoes">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Criando…' : 'Criar turma'}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ------------------------------------------------------------- lote */}
      <ModalShell open={modal === 'lote'} onClose={() => setModal(null)} disabled={salvando}>
        <form
          className="form-modal"
          onSubmit={(e) => {
            e.preventDefault();
            enviar(previaLote.filter((a) => a.nome));
          }}
        >
          <h3>Colar lista da turma</h3>

          <div className="input-group">
            <label htmlFor="lote">Um aluno por linha</label>
            <textarea
              id="lote"
              rows={10}
              value={lote}
              onChange={(e) => setLote(e.target.value)}
              spellCheck="false"
              placeholder={'Ana Clara Souza\n20260102, Bruno Lima\nCarla Menezes, 20260103'}
            />
          </div>

          <p className="card-lista__meta">
            Pode colar direto da lista de chamada ou da planilha. A matrícula é opcional — sem ela, o
            app gera uma. A numeração (1., 2.) é ignorada.
          </p>

          {previaLote.length > 0 && (
            <div className="tabela-wrapper">
              <table className="tabela">
                <thead>
                  <tr>
                    <th>Nome</th>
                    <th>Matrícula</th>
                  </tr>
                </thead>
                <tbody>
                  {previaLote.map((a, i) => (
                    <tr key={`${a.linha}-${i}`}>
                      <td>{a.nome || <span className="texto-pendente">linha ignorada</span>}</td>
                      <td>
                        {a.matricula ? (
                          <code>{a.matricula}</code>
                        ) : (
                          <span className="texto-pendente">será gerada</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="card-lista__acoes">
            <button type="submit" className="btn-primary" disabled={salvando || previaLote.length === 0}>
              {salvando
                ? 'Cadastrando…'
                : `Cadastrar ${previaLote.filter((a) => a.nome).length} aluno(s)`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
          </div>
        </form>
      </ModalShell>

      {/* --------------------------------- o que não entrou, e por quê ----- */}
      <ModalShell open={Boolean(relatorio)} onClose={() => setRelatorio(null)}>
        <div className="form-modal">
          <h3>Resultado do cadastro</h3>
          <div className="tabela-wrapper">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Matrícula</th>
                  <th>Situação</th>
                </tr>
              </thead>
              <tbody>
                {(relatorio ?? []).map((r, i) => (
                  <tr key={`${r.matricula}-${i}`}>
                    <td>{r.nome || '—'}</td>
                    <td>
                      <code>{r.matricula}</code>
                    </td>
                    <td className={r.situacao === 'cadastrado' ? 'texto-ok' : 'texto-pendente'}>
                      {SITUACAO_ALUNO[r.situacao] ?? r.situacao}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-primary" onClick={() => setRelatorio(null)}>
            Entendi
          </button>
        </div>
      </ModalShell>
    </>
  );
}

export default ProfessorAlunosView;
