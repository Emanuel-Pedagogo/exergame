import { useState } from 'react';
import { supabase, matriculaParaEmail, problemaNaMatricula } from '../supabaseClient';
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
  const [enviando, setEnviando] = useState(false);
  const [form, setForm] = useState({
    nome: '',
    matricula: '',
    email: '',
    senha: '',
  });

  // A lista de turmas deixou de ser pública quando o sistema virou multi-escola:
  // mostrá-la aqui exporia as turmas de todas as escolas a quem nem tem conta.
  // A turma do aluno agora vem do cadastro que o professor fez.

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

    if (ehAluno) {
      const problema = problemaNaMatricula(form.matricula);
      if (problema) {
        toast.warn(problema);
        return;
      }
    }

    const email = ehAluno ? matriculaParaEmail(form.matricula) : form.email.trim().toLowerCase();
    if (!ehAluno && !email) {
      toast.warn('Informe o e-mail.');
      return;
    }

    setEnviando(true);
    try {
      if (modo === 'login') {
        const { error } = await supabase.auth.signInWithPassword({
          email,
          password: senha,
        });
        if (error) throw error;
        toast.success('Bem-vindo de volta!');
        return;
      }

      // O Supabase recusa o domínio sintético da matrícula no cadastro
      // ("Example and test domains are currently not supported"), embora aceite
      // esse mesmo e-mail no login. Por isso a conta do aluno é criada pelo
      // professor, e aqui o caminho fica fechado com uma explicação em vez de
      // um erro em inglês vindo do servidor.
      if (ehAluno) {
        toast.info('A conta do aluno é criada pelo professor. Peça a ele sua matrícula e senha.');
        setModo('login');
        return;
      }

      if (!form.nome.trim()) {
        toast.warn('Informe o nome completo.');
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
      // O aluno cai aqui quando o professor o cadastrou mas ele ainda não fez o
      // primeiro acesso: a matrícula existe na lista da turma, a conta não.
      // Dizer só "matrícula incorreta" mandaria ele conferir o número à toa.
      const msg = /invalid login credentials/i.test(erro.message)
        ? ehAluno
          ? 'Matrícula ou senha incorreta. Se é seu primeiro acesso, toque em "Ainda não tenho conta" para criar sua senha.'
          : 'E-mail ou senha incorreta.'
        : /unable to validate email address/i.test(erro.message)
          ? ehAluno
            ? 'Matrícula em formato inválido. Use apenas letras e números, sem espaços.'
            : 'E-mail em formato inválido.'
          : /user already registered/i.test(erro.message)
            ? ehAluno
              ? 'Já existe uma conta com essa matrícula. Use "Já tenho conta — entrar".'
              : 'Já existe uma conta com esse e-mail. Use "Já tenho conta — entrar".'
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
                autoCapitalize="none"
                spellCheck="false"
                placeholder="Ex.: 20260017"
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

          {modo === 'cadastro' && ehAluno && (
            <p className="card-lista__meta">
              Quem cria a conta do aluno é o professor. Peça a ele sua matrícula e sua senha, e entre
              por “Já tenho conta — entrar”.
            </p>
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
