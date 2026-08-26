/**
 * Som e efeito de acerto — a mesma "mágica" do app Participou.
 *
 * O som é sintetizado na hora com Web Audio: nada de arquivo de áudio, para o
 * app continuar leve e funcionar offline. O efeito visual é só avisado por aqui
 * e desenhado pelo componente EfeitoMagico.
 *
 * `peso` 1 = acerto de questão; 2 = fim de lista (mais notas, mais faísca).
 */

let ouvinte = null;

/** O componente do efeito se registra aqui. Devolve a função de desinscrever. */
export function ouvirMagia(callback) {
  ouvinte = callback;
  return () => {
    if (ouvinte === callback) ouvinte = null;
  };
}

export function dispararMagia(detalhe = {}) {
  if (detalhe.efeito !== false) ouvinte?.(detalhe);
  if (detalhe.som !== false) tocarMagia(detalhe.peso);
}

// ---------- som ----------

let contexto = null;
// -Infinity, e não 0: `ctx.currentTime` começa perto de zero quando o contexto
// acabou de ser criado, então com 0 aqui o PRIMEIRO acerto era classificado como
// "toque seguido" — saía com volume reduzido e sem o pó mágico, justamente na
// hora que mais importa. (O mesmo detalhe existe no Participou.)
let ultimoToque = -Infinity;

function pegarContexto() {
  try {
    if (!contexto) {
      const Contexto = window.AudioContext || window.webkitAudioContext;
      if (!Contexto) return null;
      contexto = new Contexto();
    }
    // o navegador suspende o áudio até haver um toque do usuário
    if (contexto.state === 'suspended') contexto.resume();
    return contexto;
  } catch {
    return null;
  }
}

/** Guarda o ruído branco uma vez só, para o pó mágico não recriar buffer a cada toque. */
let bufferRuido = null;
function pegarRuido(ctx) {
  if (bufferRuido && bufferRuido.sampleRate === ctx.sampleRate) return bufferRuido;
  const duracao = 0.5;
  const total = Math.floor(ctx.sampleRate * duracao);
  bufferRuido = ctx.createBuffer(1, total, ctx.sampleRate);
  const dados = bufferRuido.getChannelData(0);
  for (let i = 0; i < total; i++) {
    // ruído que já nasce sumindo, para soar como brilho e não como chiado
    dados[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / total, 2);
  }
  return bufferRuido;
}

// dó maior pentatônica, região aguda: soa como sino/brilho em qualquer combinação
const ARPEJO_SIMPLES = [1046.5, 1567.98, 2093.0];
const ARPEJO_FORTE = [1046.5, 1318.51, 1567.98, 2093.0, 2637.02];

export function tocarMagia(peso = 1) {
  const ctx = pegarContexto();
  if (!ctx) return;

  const agora = ctx.currentTime;
  const seguidos = agora - ultimoToque < 0.12;
  ultimoToque = agora;

  const mestre = ctx.createGain();
  // toques em sequência abaixam o volume para não empilhar e estourar
  mestre.gain.value = seguidos ? 0.09 : 0.16;
  mestre.connect(ctx.destination);

  const notas = peso >= 2 ? ARPEJO_FORTE : ARPEJO_SIMPLES;

  notas.forEach((frequencia, i) => {
    const inicio = agora + i * 0.042;

    const sino = ctx.createOscillator();
    sino.type = 'triangle';
    sino.frequency.setValueAtTime(frequencia, inicio);
    const ganho = ctx.createGain();
    ganho.gain.setValueAtTime(0.0001, inicio);
    ganho.gain.exponentialRampToValueAtTime(0.9, inicio + 0.008);
    ganho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.44);
    sino.connect(ganho);
    ganho.connect(mestre);
    sino.start(inicio);
    sino.stop(inicio + 0.46);

    // harmônico levemente desafinado: é o que dá o ar de mágica, não de bipe
    const brilho = ctx.createOscillator();
    brilho.type = 'sine';
    brilho.frequency.setValueAtTime(frequencia * 2.008, inicio);
    const ganhoBrilho = ctx.createGain();
    ganhoBrilho.gain.setValueAtTime(0.0001, inicio);
    ganhoBrilho.gain.exponentialRampToValueAtTime(0.28, inicio + 0.006);
    ganhoBrilho.gain.exponentialRampToValueAtTime(0.0001, inicio + 0.3);
    brilho.connect(ganhoBrilho);
    ganhoBrilho.connect(mestre);
    brilho.start(inicio);
    brilho.stop(inicio + 0.32);
  });

  // pó mágico: ruído agudo subindo, curtinho
  if (!seguidos) {
    const fonte = ctx.createBufferSource();
    fonte.buffer = pegarRuido(ctx);
    const filtro = ctx.createBiquadFilter();
    filtro.type = 'bandpass';
    filtro.Q.value = 1.2;
    filtro.frequency.setValueAtTime(2600, agora);
    filtro.frequency.exponentialRampToValueAtTime(9000, agora + 0.34);
    const ganhoPo = ctx.createGain();
    ganhoPo.gain.setValueAtTime(0.0001, agora);
    ganhoPo.gain.exponentialRampToValueAtTime(0.2, agora + 0.02);
    ganhoPo.gain.exponentialRampToValueAtTime(0.0001, agora + 0.4);
    fonte.connect(filtro);
    filtro.connect(ganhoPo);
    ganhoPo.connect(mestre);
    fonte.start(agora);
    fonte.stop(agora + 0.45);
  }
}

/**
 * Som curto e grave para a resposta errada.
 *
 * Existe para o erro não passar em silêncio enquanto o acerto canta — mas é
 * deliberadamente discreto e sem dissonância: errar aqui é parte de aprender, e
 * o aluno tenta de novo na mesma questão. Nada de som de "perdeu".
 */
export function tocarErro() {
  const ctx = pegarContexto();
  if (!ctx) return;
  const agora = ctx.currentTime;

  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.setValueAtTime(330, agora);
  osc.frequency.exponentialRampToValueAtTime(247, agora + 0.16);

  const ganho = ctx.createGain();
  ganho.gain.setValueAtTime(0.0001, agora);
  ganho.gain.exponentialRampToValueAtTime(0.11, agora + 0.02);
  ganho.gain.exponentialRampToValueAtTime(0.0001, agora + 0.24);

  osc.connect(ganho);
  ganho.connect(ctx.destination);
  osc.start(agora);
  osc.stop(agora + 0.26);
}
