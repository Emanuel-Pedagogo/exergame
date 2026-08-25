import { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';

/**
 * Tela para a conta que está autenticada mas ainda não tem perfil no Exergame.
 *
 * Acontece com quem já existia no Supabase Auth antes do Exergame — o banco é
 * compartilhado com o SACP, e o gatilho que cria o perfil só dispara quando um
 * usuário é criado. Sem esta tela o app voltava para o login sem explicar nada.
 */
function PerfilPendenteView({ email, onCriado, onSair }) {
  const [perfil, setPerfil] = useState('professor');
  const [nome, setNome] = useState('');
  const [matricula, setMatricula] = useState('');
  const [turmaId, setTurmaId] = useState('');
  const [codigo, setCodigo] = useState('');
  const [turmas, setTurmas] = useState([]);
  const [enviando, setEnviando] = useState(false);

  useEffect(() => {
    supabase
      .from('exergame_turmas')
      .select('id, nome, ano')
      .order('nome')
      .then(({ data }) => setTurmas(data ?? []));
  }, []);

  const criar = async (e) => {
    e.preventDefault();
    if (enviando) return;

    if (perfil === 'professor' && !codigo.trim()) {
      toast.warn('Informe o código de professor fornecido pela coordenação.');
      return;
    }

    setEnviando(true);
    const { error } = await supabase.rpc('exergame_criar_meu_perfil', {
      p_nome: nome,
      p_perfil: perfil,
      p_matricula: perfil === 'aluno' ? matricula : null,
      p_turma_id: perfil === 'aluno' ? turmaId || null : null,
      p_codigo: perfil === 'professor' ? codigo.trim() : null,
    });
    setEnviando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Perfil criado. Bem-vindo ao Exergame!');
    onCriado();
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span aria-hidden="true">🎮</span>
          <h1>Falta o seu perfil</h1>
          <p>
            A conta {email} entrou, mas ainda não tem um perfil no Exergame. Complete o
            cadastro abaixo para continuar.
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Tipo de perfil">
          <button
            type="button"
            role="tab"
            aria-selected={perfil === 'aluno'}
            className={`auth-tab${perfil === 'aluno' ? ' auth-tab--ativa' : ''}`}
            onClick={() => setPerfil('aluno')}
          >
            Sou aluno
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={perfil === 'professor'}
            className={`auth-tab${perfil === 'professor' ? ' auth-tab--ativa' : ''}`}
            onClick={() => setPerfil('professor')}
          >
            Sou professor
          </button>
        </div>

        <form onSubmit={criar}>
          <div className="input-group">
            <label htmlFor="perfil-nome">Nome completo</label>
            <input
              id="perfil-nome"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              autoComplete="name"
            />
          </div>

          {perfil === 'professor' && (
            <div className="input-group">
              <label htmlFor="perfil-codigo">Código de professor</label>
              <input
                id="perfil-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoComplete="off"
                spellCheck="false"
                placeholder="Fornecido pela coordenação"
              />
            </div>
          )}

          {perfil === 'aluno' && (
            <>
              <div className="input-group">
                <label htmlFor="perfil-matricula">Matrícula</label>
                <input
                  id="perfil-matricula"
                  inputMode="numeric"
                  value={matricula}
                  onChange={(e) => setMatricula(e.target.value)}
                />
              </div>

              <div className="input-group">
                <label htmlFor="perfil-turma">Turma</label>
                <select
                  id="perfil-turma"
                  value={turmaId}
                  onChange={(e) => setTurmaId(e.target.value)}
                >
                  <option value="">Selecione a turma</option>
                  {turmas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.nome} ({t.ano})
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}

          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Criando…' : 'Criar meu perfil'}
          </button>
        </form>

        <button type="button" className="link-button" onClick={onSair}>
          Sair e entrar com outra conta
        </button>
      </div>
    </div>
  );
}

export default PerfilPendenteView;
