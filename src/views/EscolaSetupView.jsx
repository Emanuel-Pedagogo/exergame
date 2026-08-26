import { useState } from 'react';
import { supabase } from '../supabaseClient';
import { toast } from '../utils/appFeedback';

/**
 * Primeira parada do professor sem escola.
 *
 * Tudo no sistema pendura em uma escola — turmas, alunos, disciplinas e listas.
 * Sem vínculo com alguma, o professor não teria onde pôr nada, e por isso esta
 * tela vem antes do resto em vez de aparecer como um aviso perdido.
 *
 * Dois caminhos: criar a escola (vira gestor dela) ou entrar na de um colega
 * com o código que o gestor gerou.
 */
function EscolaSetupView({ nome, onPronto, onSair }) {
  const [modo, setModo] = useState('criar'); // 'criar' | 'codigo'
  const [form, setForm] = useState({ nome: '', cidade: '', uf: '' });
  const [codigo, setCodigo] = useState('');
  const [enviando, setEnviando] = useState(false);

  const criar = async (e) => {
    e.preventDefault();
    if (!form.nome.trim()) {
      toast.warn('Informe o nome da escola.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.rpc('exergame_criar_escola', {
      p_nome: form.nome.trim(),
      p_cidade: form.cidade.trim() || null,
      p_uf: form.uf.trim() || null,
    });
    setEnviando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Escola criada. Você é o gestor dela.');
    onPronto();
  };

  const entrar = async (e) => {
    e.preventDefault();
    if (!codigo.trim()) {
      toast.warn('Informe o código da escola.');
      return;
    }
    setEnviando(true);
    const { error } = await supabase.rpc('exergame_entrar_na_escola', {
      p_codigo: codigo.trim(),
    });
    setEnviando(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success('Pronto! Você entrou na escola.');
    onPronto();
  };

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="auth-brand">
          <span aria-hidden="true">🏫</span>
          <h1>Sua escola</h1>
          <p>
            Olá, {nome}. Antes de criar turmas e listas, escolha uma escola — é nela que ficam seus
            alunos e seu material.
          </p>
        </div>

        <div className="auth-tabs" role="tablist" aria-label="Como entrar numa escola">
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'criar'}
            className={`auth-tab${modo === 'criar' ? ' auth-tab--ativa' : ''}`}
            onClick={() => setModo('criar')}
          >
            Criar escola
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={modo === 'codigo'}
            className={`auth-tab${modo === 'codigo' ? ' auth-tab--ativa' : ''}`}
            onClick={() => setModo('codigo')}
          >
            Tenho um código
          </button>
        </div>

        {modo === 'criar' ? (
          <form onSubmit={criar}>
            <div className="input-group">
              <label htmlFor="escola-nome">Nome da escola</label>
              <input
                id="escola-nome"
                value={form.nome}
                onChange={(e) => setForm({ ...form, nome: e.target.value })}
                placeholder="Ex.: Escola Municipal Santa Rita"
              />
            </div>

            <div className="input-group">
              <label htmlFor="escola-cidade">Cidade (opcional)</label>
              <input
                id="escola-cidade"
                value={form.cidade}
                onChange={(e) => setForm({ ...form, cidade: e.target.value })}
              />
            </div>

            <div className="input-group">
              <label htmlFor="escola-uf">Estado (opcional)</label>
              <input
                id="escola-uf"
                value={form.uf}
                onChange={(e) => setForm({ ...form, uf: e.target.value })}
                maxLength={2}
                placeholder="PA"
                autoCapitalize="characters"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? 'Criando…' : 'Criar escola'}
            </button>
          </form>
        ) : (
          <form onSubmit={entrar}>
            <div className="input-group">
              <label htmlFor="escola-codigo">Código da escola</label>
              <input
                id="escola-codigo"
                value={codigo}
                onChange={(e) => setCodigo(e.target.value)}
                autoCapitalize="characters"
                spellCheck="false"
                placeholder="Peça ao gestor da escola"
              />
            </div>

            <button type="submit" className="btn-primary" disabled={enviando}>
              {enviando ? 'Entrando…' : 'Entrar na escola'}
            </button>
          </form>
        )}

        <button type="button" className="link-button" onClick={onSair}>
          Sair
        </button>
      </div>
    </div>
  );
}

export default EscolaSetupView;
