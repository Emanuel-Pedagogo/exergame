import { useEffect, useState } from 'react';
import { supabase, matriculaParaEmail } from '../supabaseClient';
import { toast } from '../utils/appFeedback';

/**
 * Entrada única do app (RF01–RF03).
 * O aluno entra por matrícula: o Supabase Auth só conhece e-mail, então a
 * matrícula vira um e-mail sintético (ver matriculaParaEmail). Professor e
 * gestor entram com e-mail real.
 */
function LoginView() {
  const [aba, setAba] = useState('aluno');
  const [modo, setModo] = useState('login'); // 'login' | 'cadastro'
  const [turmas, setTurmas] = useState([]);
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    matricula: '',
    email: '',
    senha: '',
    turmaId: '',
    codigo: '',
  });

  useEffect(() => {
    supabase
      .from('exergame_turmas')
      .select('id, nome, ano')
      .order('nome')
      .then(({ data }) => setTurmas(data ?? []));
  }, []);

  const alterar = (campo) => (e) => setForm((f) => ({ ...f, [campo]: e.target.value }));

  const ehAluno = aba === 'aluno';

  const submeter = async (e) => {
    e.preventDefault();
    if (enviando) return;

    const senha = form.senha.trim();
    if (senha.length < 6) {
      toast.warn('A senha precisa ter pelo menos 6 caracteres.');
      return;
    }

    const email = ehAluno ? matriculaParaEmail(form.matricula) : form.email.trim().toLowerCase();
    if (ehAluno && !form.matricula.trim()) {
      toast.warn('Informe a matrícula.');
      return;
    }
    if (!ehAluno && !email) {
      toast.warn('Informe o e-mail.');
      return;
    }

    setEnviando(true);
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
        if (error) throw error;
        toast.success('Bem-vindo de volta!');
        return;
      }

      if (!form.nome.trim()) {
        toast.warn('Informe o nome completo.');
        return;
      }

      if (!ehAluno && !form.codigo.trim()) {
        toast.warn('Informe o código de professor fornecido pela coordenação.');
        return;
      }

      const { data, error } = await supabase.auth.signUp({
        email,
        password: senha,
        options: {
          data: {
            // Marca de origem: o banco é compartilhado com o SACP e o gatilho
            // que cria o profile só age em usuários vindos do Exergame.
            app: 'exergame',
            nome: form.nome.trim(),
            matricula: ehAluno ? form.matricula.trim() : null,
            perfil: ehAluno ? 'aluno' : 'professor',
            turma_id: ehAluno ? form.turmaId || null : null,
            // Quem valida é o gatilho no banco — mandar 'professor' daqui não
            // basta. O gatilho apaga este campo do usuário depois de usá-lo.
            codigo_professor: ehAluno ? null : form.codigo.trim(),
          },
        },
      });
      if (error) throw error;

      if (!data.session) {
        toast.info('Cadastro criado. Confirme o e-mail para entrar.');
        setModo('login');
      } else {
        toast.success('Cadastro concluído. Boa sorte!');
      }
    } catch (erro) {
      // O gatilho aborta o cadastro quando o código não vale; o Auth devolve
      // isso como "Database error saving new user", que não diz nada ao professor.
      const codigoRecusado =
        !ehAluno &&
        modo === 'cadastro' &&
        /codigo_professor_invalido|database error/i.test(erro.message);

      const msg = /invalid login credentials/i.test(erro.message)
        ? ehAluno
          ? 'Matrícula ou senha incorreta.'
          : 'E-mail ou senha incorreta.'
        : codigoRecusado
          ? 'Código de professor inválido, expirado ou já utilizado. Peça um código novo à coordenação.'
          : erro.message;
      toast.error(msg);
    } finally {
      setEnviando(false);
    }
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span aria-hidden="true">🎮</span>
          <h1>Exergame</h1>
          <p>Lista de exercícios gamificada</p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Tipo de acesso">
          <button
            type="button"
            role="tab"
            aria-selected={ehAluno}
            className={`auth-tab${ehAluno ? ' auth-tab--ativa' : ''}`}
            onClick={() => setAba('aluno')}
          >
            Sou aluno
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!ehAluno}
            className={`auth-tab${!ehAluno ? ' auth-tab--ativa' : ''}`}
            onClick={() => setAba('professor')}
          >
            Sou professor
          </button>
        </div>

        <form onSubmit={submeter}>
          {modo === 'cadastro' && (
            <div className="input-group">
              <label htmlFor="nome">Nome completo</label>
              <input id="nome" value={form.nome} onChange={alterar('nome')} autoComplete="name" />
            </div>
          )}

          {ehAluno ? (
            <div className="input-group">
              <label htmlFor="matricula">Matrícula</label>
              <input
                id="matricula"
                inputMode="numeric"
                value={form.matricula}
                onChange={alterar('matricula')}
                autoComplete="username"
              />
            </div>
          ) : (
            <div className="input-group">
              <label htmlFor="email">E-mail</label>
              <input
                id="email"
                type="email"
                value={form.email}
                onChange={alterar('email')}
                autoComplete="email"
              />
            </div>
          )}

          {modo === 'cadastro' && !ehAluno && (
            <div className="input-group">
              <label htmlFor="codigo">Código de professor</label>
              <input
                id="codigo"
                value={form.codigo}
                onChange={alterar('codigo')}
                autoComplete="off"
                spellCheck="false"
                placeholder="Fornecido pela coordenação"
              />
            </div>
          )}

          {modo === 'cadastro' && ehAluno && (
            <div className="input-group">
              <label htmlFor="turma">Turma</label>
              <select id="turma" value={form.turmaId} onChange={alterar('turmaId')}>
                <option value="">Selecione a turma</option>
                {turmas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.nome} ({t.ano})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="input-group">
            <label htmlFor="senha">Senha</label>
            <input
              id="senha"
              type="password"
              value={form.senha}
              onChange={alterar('senha')}
              autoComplete={modo === 'login' ? 'current-password' : 'new-password'}
            />
          </div>

          <button type="submit" className="btn-primary" disabled={enviando}>
            {enviando ? 'Aguarde…' : modo === 'login' ? 'Entrar' : 'Criar conta'}
          </button>
        </form>

        <button
          type="button"
          className="link-button"
          onClick={() => setModo((m) => (m === 'login' ? 'cadastro' : 'login'))}
        >
          {modo === 'login' ? 'Ainda não tenho conta' : 'Já tenho conta — entrar'}
        </button>
      </div>
    </div>
  );
}

export default LoginView;
