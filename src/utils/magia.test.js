import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

/**
 * Testa a mecânica da comemoração sem navegador: quem escuta o efeito, o que é
 * disparado, e se o som é mesmo sintetizado (em vez de silêncio silencioso).
 *
 * A Web Audio é dublada — o que se verifica é a partitura: quantos osciladores,
 * em que frequências, e se o "pó mágico" entra no primeiro toque.
 */

let criados;

function faseFalsa() {
  return {
    value: 0,
    setValueAtTime: vi.fn(),
    exponentialRampToValueAtTime: vi.fn(),
  };
}

function contextoFalso() {
  return {
    currentTime: 0,
    state: 'running',
    destination: {},
    sampleRate: 48000,
    resume: vi.fn(),
    createGain: () => ({ gain: faseFalsa(), connect: vi.fn() }),
    createOscillator: () => {
      const osc = {
        type: '',
        frequency: faseFalsa(),
        connect: vi.fn(),
        start: vi.fn(),
        stop: vi.fn(),
      };
      criados.osciladores.push(osc);
      return osc;
    },
    createBufferSource: () => {
      criados.fontesDeRuido++;
      return { buffer: null, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    },
    createBiquadFilter: () => ({
      type: '',
      Q: { value: 0 },
      frequency: faseFalsa(),
      connect: vi.fn(),
    }),
    createBuffer: (canais, tamanho) => ({
      sampleRate: 48000,
      getChannelData: () => new Float32Array(tamanho),
    }),
  };
}

beforeEach(() => {
  criados = { osciladores: [], fontesDeRuido: 0 };
  // Os testes rodam em Node, onde não existe `window` — e é de lá que o módulo
  // pega a Web Audio. Sem este stub o áudio simplesmente não acontece, e o teste
  // passaria a impressão de que o som some.
  vi.stubGlobal('window', { AudioContext: vi.fn(contextoFalso) });
  vi.resetModules();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('dispararMagia', () => {
  it('avisa quem estiver ouvindo, repassando ponto e tipo', async () => {
    const { ouvirMagia, dispararMagia } = await import('./magia');
    const ouvinte = vi.fn();
    ouvirMagia(ouvinte);

    dispararMagia({ x: 10, y: 20, peso: 2, tipo: 'conclusao' });

    expect(ouvinte).toHaveBeenCalledTimes(1);
    expect(ouvinte.mock.calls[0][0]).toMatchObject({ x: 10, y: 20, peso: 2, tipo: 'conclusao' });
  });

  it('para de avisar depois de desinscrever', async () => {
    const { ouvirMagia, dispararMagia } = await import('./magia');
    const ouvinte = vi.fn();
    const parar = ouvirMagia(ouvinte);
    parar();

    dispararMagia({ peso: 1 });
    expect(ouvinte).not.toHaveBeenCalled();
  });

  it('deixa tocar só o som quando o efeito é dispensado', async () => {
    const { ouvirMagia, dispararMagia } = await import('./magia');
    const ouvinte = vi.fn();
    ouvirMagia(ouvinte);

    dispararMagia({ efeito: false });
    expect(ouvinte).not.toHaveBeenCalled();
    expect(criados.osciladores.length).toBeGreaterThan(0);
  });

  it('não quebra quando ninguém está ouvindo', async () => {
    const { dispararMagia } = await import('./magia');
    expect(() => dispararMagia({ peso: 1 })).not.toThrow();
  });
});

describe('tocarMagia', () => {
  it('toca o arpejo simples no acerto: 3 notas, cada uma com seu harmônico', async () => {
    const { tocarMagia } = await import('./magia');
    tocarMagia(1);
    expect(criados.osciladores).toHaveLength(6);
  });

  it('toca o arpejo completo no fim da lista: 5 notas', async () => {
    const { tocarMagia } = await import('./magia');
    tocarMagia(2);
    expect(criados.osciladores).toHaveLength(10);
  });

  // O bug que os espiões pegaram no navegador: com `ultimoToque` iniciando em 0
  // e ctx.currentTime também perto de 0, o primeiro acerto era tratado como
  // "toque seguido" e saía sem o pó mágico — logo no momento mais importante.
  it('inclui o pó mágico já no primeiro toque', async () => {
    const { tocarMagia } = await import('./magia');
    tocarMagia(1);
    expect(criados.fontesDeRuido).toBe(1);
  });

  it('usa notas agudas, na faixa de sino', async () => {
    const { tocarMagia } = await import('./magia');
    tocarMagia(1);
    const frequencias = criados.osciladores.flatMap((o) =>
      o.frequency.setValueAtTime.mock.calls.map((c) => c[0]),
    );
    expect(Math.min(...frequencias)).toBeGreaterThan(1000);
    expect(frequencias).toContain(1046.5);
  });

  it('não quebra onde não existe Web Audio', async () => {
    vi.stubGlobal('window', {});
    vi.resetModules();
    const { tocarMagia } = await import('./magia');
    expect(() => tocarMagia(1)).not.toThrow();
  });
});

describe('tocarErro', () => {
  it('toca uma nota só, grave e curta — sem drama', async () => {
    const { tocarErro } = await import('./magia');
    tocarErro();
    expect(criados.osciladores).toHaveLength(1);
    const [osc] = criados.osciladores;
    const freqInicial = osc.frequency.setValueAtTime.mock.calls[0][0];
    expect(freqInicial).toBeLessThan(500);
  });
});
