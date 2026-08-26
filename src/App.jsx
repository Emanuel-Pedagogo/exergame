import { useCallback, useEffect, useState } from 'react';
import './App.css';
import { supabase } from './supabaseClient';
import { toast } from './utils/appFeedback';
import LoginView from './views/LoginView';
import AlunoHomeView from './views/AlunoHomeView';
import RankingView from './views/RankingView';
import HistoricoView from './views/HistoricoView';
import ProfessorAlunosView from './views/ProfessorAlunosView';
import ProfessorListasView from './views/ProfessorListasView';
import ProfessorQuestoesView from './views/ProfessorQuestoesView';
import ProfessorResultadosView from './views/ProfessorResultadosView';
import ExecucaoModal from './views/ExecucaoModal';
import PerfilPendenteView from './views/PerfilPendenteView';

/**
 * Hub da aplicação. Sem React Router: a navegação é a string `currentView`,
 * persistida em localStorage e espelhada em ?view= — mesmo padrão do
 * Sist-Gest-Pedag. Adicionar uma tela = estender o switch de VIEWS abaixo.
 */

const VIEW_STORAGE_KEY = 'exergame:view';

const VIEWS_ALUNO = ['aluno-home', 'aluno-ranking', 'aluno-historico'];
const VIEWS_DOCENTE = ['prof-listas', 'prof-questoes', 'prof-resultados', 'prof-alunos'];

function viewInicial(perfil) {
  return perfil === 'aluno' ? 'aluno-home' : 'prof-listas';
}

function App() {
  const [carregando, setCarregando] = useState(true);
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [currentView, setCurrentView] = useState(() => {
    const daUrl = new URLSearchParams(window.location.search).get('view');
    return daUrl || localStorage.getItem(VIEW_STORAGE_KEY) || 'aluno-home';
  });

  // Contexto de navegação: lista selecionada (professor) e execução aberta (aluno)
  const [listaSelecionada, setListaSelecionada] = useState(null);
  const [execucaoAberta, setExecucaoAberta] = useState(null);
  const [recarregar, setRecarregar] = useState(0);

  const navigate = useCallback((viewId, contexto = null) => {
    if (contexto !== null) setListaSelecionada(contexto);
    setCurrentView(viewId);
    localStorage.setItem(VIEW_STORAGE_KEY, viewId);
    const url = new URL(window.location.href);
    url.searchParams.set('view', viewId);
    window.history.replaceState({}, '', url);
  }, []);

  const carregarProfile = useCallback(async (userId) => {
    const { data, error } = await supabase
      .from('exergame_profiles')
      .select('id, nome, matricula, perfil, turma_id, turma:exergame_turmas(nome)')
      .eq('id', userId)
      .maybeSingle();
    if (error) {
      toast.error(`Não consegui carregar seu perfil: ${error.message}`);
      return null;
    }
    return data;
  }, []);

  useEffect(() => {
    let ativo = true;

    supabase.auth.getSession().then(async ({ data }) => {
      if (!ativo) return;
      setSession(data.session);
      if (data.session) setProfile(await carregarProfile(data.session.user.id));
      setCarregando(false);
    });

    const { data: sub } = supabase.auth.onAuthStateChange(async (_evento, novaSessao) => {
      if (!ativo) return;
      setSession(novaSessao);
      if (novaSessao) {
        const p = await carregarProfile(novaSessao.user.id);
        setProfile(p);
        if (p) {
          const permitidas = p.perfil === 'aluno' ? VIEWS_ALUNO : VIEWS_DOCENTE;
          setCurrentView((atual) => (permitidas.includes(atual) ? atual : viewInicial(p.perfil)));
        }
      } else {
        setProfile(null);
      }
    });

    return () => {
      ativo = false;
      sub.subscription.unsubscribe();
    };
  }, [carregarProfile]);

  const sair = async () => {
    await supabase.auth.signOut();
    localStorage.removeItem(VIEW_STORAGE_KEY);
    setCurrentView('aluno-home');
    setListaSelecionada(null);
  };

  const abrirExecucao = (lista, execucaoId) => setExecucaoAberta({ lista, execucaoId });

  const fecharExecucao = (houveMudanca) => {
    setExecucaoAberta(null);
    if (houveMudanca) setRecarregar((n) => n + 1);
  };

  if (carregando) {
    return (
      <div className="app-loading">
        <div className="spinner" aria-hidden="true" />
        <p>Carregando o Exergame…</p>
      </div>
    );
  }

  if (!session) {
    return <LoginView />;
  }

  // Sessão válida sem perfil: conta que já existia no Auth (o banco é dividido
  // com o SACP) e nunca passou pelo gatilho que cria o perfil do Exergame.
  if (!profile) {
    return (
      <PerfilPendenteView
        email={session.user.email}
        onCriado={async () => setProfile(await carregarProfile(session.user.id))}
        onSair={sair}
      />
    );
  }

  const ehAluno = profile.perfil === 'aluno';
  const abas = ehAluno
    ? [
        { id: 'aluno-home', rotulo: 'Minhas listas' },
        { id: 'aluno-ranking', rotulo: 'Ranking' },
        { id: 'aluno-historico', rotulo: 'Histórico' },
      ]
    : [
        { id: 'prof-listas', rotulo: 'Listas' },
        { id: 'prof-alunos', rotulo: 'Alunos' },
        { id: 'prof-resultados', rotulo: 'Resultados' },
      ];

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header__brand">
          <span className="app-header__logo" aria-hidden="true">🎮</span>
          <div>
            <h1>Exergame</h1>
            <p className="app-header__sub">
              {profile.nome}
              {profile.matricula ? ` · matrícula ${profile.matricula}` : ''}
              {profile.turma?.nome ? ` · ${profile.turma.nome}` : ''}
            </p>
          </div>
        </div>
        <button type="button" className="btn-secondary btn-inline" onClick={sair}>
          Sair
        </button>
      </header>

      <nav className="app-tabs" aria-label="Navegação principal">
        {abas.map((aba) => (
          <button
            key={aba.id}
            type="button"
            className={`app-tab${currentView === aba.id ? ' app-tab--ativa' : ''}`}
            aria-current={currentView === aba.id ? 'page' : undefined}
            onClick={() => navigate(aba.id)}
          >
            {aba.rotulo}
          </button>
        ))}
      </nav>

      <main className="app-main">
        {currentView === 'aluno-home' && (
          <AlunoHomeView
            profile={profile}
            recarregar={recarregar}
            onJogar={abrirExecucao}
            onVerRanking={(lista) => navigate('aluno-ranking', lista)}
          />
        )}
        {currentView === 'aluno-ranking' && (
          <RankingView profile={profile} listaInicial={listaSelecionada} />
        )}
        {currentView === 'aluno-historico' && (
          <HistoricoView profile={profile} recarregar={recarregar} />
        )}
        {currentView === 'prof-listas' && (
          <ProfessorListasView
            profile={profile}
            onAbrirQuestoes={(lista) => navigate('prof-questoes', lista)}
            onAbrirResultados={(lista) => navigate('prof-resultados', lista)}
          />
        )}
        {currentView === 'prof-questoes' && (
          <ProfessorQuestoesView lista={listaSelecionada} onVoltar={() => navigate('prof-listas')} />
        )}
        {currentView === 'prof-alunos' && <ProfessorAlunosView />}
        {currentView === 'prof-resultados' && (
          <ProfessorResultadosView profile={profile} listaInicial={listaSelecionada} />
        )}
      </main>

      {execucaoAberta && (
        <ExecucaoModal
          lista={execucaoAberta.lista}
          execucaoId={execucaoAberta.execucaoId}
          onFechar={fecharExecucao}
        />
      )}
    </div>
  );
}

export default App;
