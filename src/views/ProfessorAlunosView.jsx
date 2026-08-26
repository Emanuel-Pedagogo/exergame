import { useCallback, useEffect, useMemo, useState } from 'react';
import ModalShell from '../components/ModalShell';
import { supabase, MATRICULA_DOMAIN } from '../supabaseClient';
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
function ProfessorAlunosView({ escolaId }) {
  const [turmas, setTurmas] = useState([]);
  const [turmaId, setTurmaId] = useState('');
  const [alunos, setAlunos] = useState([]);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [modal, setModal] = useState(null); // 'um' | 'lote' | 'turma' | 'editar' | 'senha'
  const [form, setForm] = useState({ nome: '', matricula: '', senha: '' });
  const [edicao, setEdicao] = useState(null); // aluno em edição
  const [senhaForm, setSenhaForm] = useState({ aluno: null, senha: '' });
  const [loteSenha, setLoteSenha] = useState('');
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
        .eq('escola_id', escolaId)
        .order('nome')
        .then(({ data }) => {
          const lista = data ?? [];
          setTurmas(lista);
          setTurmaId((atual) => atual || lista[0]?.id || '');
          if (lista.length === 0) setCarregando(false);
          return lista;
        }),
    [escolaId],
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
      p_alunos: linhas.map(({ nome, matricula, senha }) => ({ nome, matricula, senha })),
      p_dominio: MATRICULA_DOMAIN,
    });
    setSalvando(false);

    if (error) {
      toast.error(error.message);
      return;
    }

    const oks = ['cadastrado', 'conta_criada'];
    const novos = (data ?? []).filter((r) => oks.includes(r.situacao)).length;
    const problemas = (data ?? []).length - novos;
    toast.success(novos === 1 ? '1 aluno cadastrado.' : `${novos} alunos cadastrados.`);
    setModal(null);
    setForm({ nome: '', matricula: '', senha: '' });
    setLote('');
    if (problemas > 0) setRelatorio(data);
    carregarAlunos();
  };

  const salvarEdicao = async (e) => {
    e.preventDefault();
    if (!edicao.nome.trim()) {
      toast.warn('Informe o nome.');
      return;
    }
    setSalvando(true);
    const { error } = await supabase.rpc('exergame_editar_aluno', {
      p_id: edicao.id,
      p_nome: edicao.nome.trim(),
      p_matricula: edicao.ativado_em ? null : edicao.matricula.trim(),
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Aluno atualizado.');
    setModal(null);
    setEdicao(null);
    carregarAlunos();
  };

  const criarContasDaTurma = async (e) => {
    e.preventDefault();
    const senha = loteSenha.trim();
    if (senha && senha.length < 6) {
      toast.warn('A senha precisa ter pelo menos 6 caracteres — ou deixe em branco.');
      return;
    }
    const ok = await confirmAction({
      title: 'Criar contas da turma',
      message: senha
        ? `Criar a conta de ${resumo.aguardando} aluno(s) com a senha "${senha}". Todos ficam com a mesma senha até trocarem.`
        : `Criar a conta de ${resumo.aguardando} aluno(s) usando a própria matrícula como senha. É fácil de distribuir, mas fraco — peça que troquem depois.`,
      confirmLabel: 'Criar contas',
    });
    if (!ok) return;

    setSalvando(true);
    const { data, error } = await supabase.rpc('exergame_criar_contas_turma', {
      p_turma_id: turmaId,
      p_senha: senha || null,
      p_dominio: MATRICULA_DOMAIN,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    const criadas = (data ?? []).filter((r) => r.situacao === 'conta_criada').length;
    toast.success(`${criadas} conta(s) criada(s). Os alunos já podem entrar.`);
    setModal(null);
    setLoteSenha('');
    if ((data ?? []).length > criadas) setRelatorio(data);
    carregarAlunos();
  };

  const salvarSenha = async (e) => {
    e.preventDefault();
    if (senhaForm.senha.trim().length < 6) {
      toast.warn('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }
    setSalvando(true);
    const { data, error } = await supabase.rpc('exergame_definir_senha_aluno', {
      p_id: senhaForm.aluno.id,
      p_senha: senhaForm.senha.trim(),
      p_dominio: MATRICULA_DOMAIN,
    });
    setSalvando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(
      data === 'conta criada com a senha definida'
        ? 'Conta criada. O aluno já pode entrar com a matrícula e essa senha.'
        : 'Senha redefinida.',
    );
    setModal(null);
    setSenhaForm({ aluno: null, senha: '' });
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
      p_escola_id: escolaId,
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
          {resumo.total} na lista · <span className="texto-ok">{resumo.entraram} com conta</span> ·{' '}
          <span className="texto-pendente">{resumo.aguardando} sem conta ainda</span>
        </p>
      )}

      {resumo.aguardando > 0 && (
        <div className="aviso-acao">
          <p>
            <strong>
              {resumo.aguardando} aluno(s) ainda não têm conta e por isso não conseguem entrar.
            </strong>{' '}
            Crie as contas de uma vez e entregue a senha à turma.
          </p>
          <button type="button" className="btn-primary btn-inline" onClick={() => setModal('contas')}>
            Criar contas da turma
          </button>
        </div>
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
                      <span className="texto-ok">Tem conta</span>
                    ) : (
                      <span className="texto-pendente">Sem conta</span>
                    )}
                  </td>
                  <td>
                    <div className="card-lista__acoes">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setEdicao({ ...aluno });
                          setModal('editar');
                        }}
                      >
                        Editar
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => {
                          setSenhaForm({ aluno, senha: '' });
                          setModal('senha');
                        }}
                      >
                        {aluno.ativado_em ? 'Trocar senha' : 'Definir senha'}
                      </button>
                      {!aluno.ativado_em && (
                        <button type="button" className="btn-danger" onClick={() => remover(aluno)}>
                          Tirar
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {alunos.length > 0 && (
        <p className="card-lista__meta">
          <strong>Sem conta</strong> quer dizer que a matrícula está reservada, mas o aluno ainda não
          consegue entrar. O aluno não cria a própria conta: quem cria é você, por “Definir senha” ou
          pelo botão que cria as contas da turma toda.
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

          <div className="input-group">
            <label htmlFor="aluno-senha">Senha inicial (opcional)</label>
            <input
              id="aluno-senha"
              value={form.senha}
              onChange={(e) => setForm({ ...form, senha: e.target.value })}
              autoComplete="off"
              spellCheck="false"
              placeholder="Mínimo 6 caracteres"
            />
            <small className="card-lista__meta">
              Com senha, a conta já sai pronta e o aluno só entra. Sem senha, ele cria a dele no
              primeiro acesso, em “Ainda não tenho conta”.
            </small>
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

      {/* ------------------------------------------ contas da turma em lote */}
      <ModalShell open={modal === 'contas'} onClose={() => setModal(null)} disabled={salvando}>
        <form className="form-modal" onSubmit={criarContasDaTurma}>
          <h3>Criar contas da turma</h3>
          <p className="card-lista__meta">
            Vou criar a conta de <strong>{resumo.aguardando}</strong> aluno(s) que ainda não têm. Quem
            já entrou não é afetado.
          </p>

          <div className="input-group">
            <label htmlFor="lote-senha">Senha para todos (opcional)</label>
            <input
              id="lote-senha"
              value={loteSenha}
              onChange={(e) => setLoteSenha(e.target.value)}
              autoComplete="off"
              spellCheck="false"
              placeholder="Em branco = a própria matrícula vira a senha"
            />
            <small className="card-lista__meta">
              Deixar em branco é o mais prático no primeiro dia: cada aluno entra com a matrícula nos
              dois campos. Como é fraco, peça que troquem a senha depois.
            </small>
          </div>

          <div className="card-lista__acoes">
            <button type="submit" className="btn-primary" disabled={salvando}>
              {salvando ? 'Criando…' : `Criar ${resumo.aguardando} conta(s)`}
            </button>
            <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
              Cancelar
            </button>
          </div>
        </form>
      </ModalShell>

      {/* ----------------------------------------------------- editar aluno */}
      <ModalShell open={modal === 'editar'} onClose={() => setModal(null)} disabled={salvando}>
        {edicao && (
          <form className="form-modal" onSubmit={salvarEdicao}>
            <h3>Editar aluno</h3>

            <div className="input-group">
              <label htmlFor="edit-nome">Nome completo</label>
              <input
                id="edit-nome"
                value={edicao.nome}
                onChange={(e) => setEdicao({ ...edicao, nome: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="edit-matricula">Matrícula</label>
              <input
                id="edit-matricula"
                value={edicao.matricula}
                onChange={(e) => setEdicao({ ...edicao, matricula: e.target.value })}
                autoCapitalize="none"
                spellCheck="false"
                disabled={Boolean(edicao.ativado_em)}
              />
              {edicao.ativado_em && (
                <small className="card-lista__meta">
                  Este aluno já entrou no app. A matrícula é o login dele, então não pode mudar —
                  corrigir aqui o deixaria de fora sem aviso.
                </small>
              )}
            </div>

            <div className="card-lista__acoes">
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
      </ModalShell>

      {/* ------------------------------------------------ definir/trocar senha */}
      <ModalShell open={modal === 'senha'} onClose={() => setModal(null)} disabled={salvando}>
        {senhaForm.aluno && (
          <form className="form-modal" onSubmit={salvarSenha}>
            <h3>{senhaForm.aluno.ativado_em ? 'Trocar senha' : 'Definir senha'}</h3>
            <p className="card-lista__meta">
              {senhaForm.aluno.nome} · matrícula <code>{senhaForm.aluno.matricula}</code>
            </p>

            <div className="input-group">
              <label htmlFor="senha-aluno">Nova senha</label>
              <input
                id="senha-aluno"
                value={senhaForm.senha}
                onChange={(e) => setSenhaForm({ ...senhaForm, senha: e.target.value })}
                autoComplete="off"
                spellCheck="false"
                placeholder="Mínimo 6 caracteres"
              />
              <small className="card-lista__meta">
                {senhaForm.aluno.ativado_em
                  ? 'A senha antiga deixa de valer na hora. Avise o aluno.'
                  : 'A conta é criada agora. O aluno entra com a matrícula e esta senha, sem precisar se cadastrar.'}
              </small>
            </div>

            <div className="card-lista__acoes">
              <button type="submit" className="btn-primary" disabled={salvando}>
                {salvando ? 'Salvando…' : 'Salvar senha'}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setModal(null)}>
                Cancelar
              </button>
            </div>
          </form>
        )}
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
