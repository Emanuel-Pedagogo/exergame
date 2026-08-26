import { useEffect, useRef } from 'react';
import { ouvirMagia } from '../utils/magia';

const LIMITE_PARTICULAS = 700;

/**
 * Paletas por tipo de comemoração. O Participou escolhe a cor pelo matiz do
 * aluno; aqui não há aluno para colorir, então o que muda é o motivo: acerto de
 * questão sai dourado, fim de lista sai colorido e mais forte.
 */
const PALETAS = {
  // Confete colorido, não só dourado: a comemoração precisa saltar por cima do
  // fundo escuro do modal, e criança responde melhor a cor viva do que a brilho.
  acerto: {
    faiscas: ['#ffd166', '#4cc9f0', '#57e389', '#f72585', '#b5179e', '#ffea00', '#ff8fab', '#fff4d6'],
    anel: '#ffd166',
    anel2: '#4cc9f0',
    clarao: '255, 213, 120',
  },
  conclusao: {
    faiscas: ['#ffd166', '#4cc9f0', '#57e389', '#f72585', '#7209b7', '#ffea00', '#ff70a6', '#3a86ff'],
    anel: '#f72585',
    anel2: '#4cc9f0',
    clarao: '200, 190, 255',
  },
};

/** Converte "#rrggbb" em "r, g, b" para poder variar a opacidade no desenho. */
function componentes(cor) {
  const n = parseInt(cor.slice(1), 16);
  return `${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}`;
}

function aleatorio(minimo, maximo) {
  return minimo + Math.random() * (maximo - minimo);
}

/**
 * Camada que cobre a tela inteira e desenha a comemoração: estouro de faíscas
 * de onde saiu o toque, anel se abrindo, poeira cintilando e um clarão curto.
 *
 * Fica por cima de tudo mas não recebe toque nenhum, então não atrapalha o
 * clique nas alternativas. A animação só roda enquanto há faísca viva — parada,
 * não consome nada.
 *
 * Respeita "reduzir movimento" do sistema: quem marcou essa preferência recebe
 * só o som, sem a tela piscando.
 */
export default function EfeitoMagico() {
  const telaRef = useRef(null);
  const cena = useRef({
    particulas: [],
    aneis: [],
    clarao: 0,
    corClarao: PALETAS.acerto.clarao,
    rodando: false,
  });

  useEffect(() => {
    const tela = telaRef.current;
    if (!tela) return undefined;

    const reduzir = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    const pincel = tela.getContext('2d');
    let largura = 0;
    let altura = 0;

    const redimensionar = () => {
      const escala = Math.min(window.devicePixelRatio || 1, 2);
      largura = window.innerWidth;
      altura = window.innerHeight;
      tela.width = Math.floor(largura * escala);
      tela.height = Math.floor(altura * escala);
      tela.style.width = `${largura}px`;
      tela.style.height = `${altura}px`;
      pincel.setTransform(escala, 0, 0, escala, 0, 0);
    };

    redimensionar();
    window.addEventListener('resize', redimensionar);

    let anterior = 0;

    const desenhar = (agora) => {
      const c = cena.current;
      const passo = anterior ? Math.min((agora - anterior) / 1000, 0.05) : 0.016;
      anterior = agora;

      pincel.clearRect(0, 0, largura, altura);

      if (c.clarao > 0) {
        c.clarao = Math.max(0, c.clarao - passo * 3.2);
        const brilho = pincel.createRadialGradient(
          largura / 2,
          altura / 2,
          0,
          largura / 2,
          altura / 2,
          Math.max(largura, altura) * 0.75,
        );
        brilho.addColorStop(0, `rgba(${c.corClarao}, ${0.3 * c.clarao})`);
        brilho.addColorStop(1, `rgba(${c.corClarao}, 0)`);
        pincel.fillStyle = brilho;
        pincel.fillRect(0, 0, largura, altura);
      }

      pincel.globalCompositeOperation = 'lighter';

      c.aneis = c.aneis.filter((anel) => {
        anel.vida -= passo;
        if (anel.vida <= 0) return false;
        const andamento = 1 - anel.vida / anel.duracao;
        const raio = anel.raioFinal * (1 - Math.pow(1 - andamento, 3));
        pincel.beginPath();
        pincel.arc(anel.x, anel.y, raio, 0, Math.PI * 2);
        pincel.strokeStyle = `rgba(${anel.cor}, ${0.75 * (1 - andamento)})`;
        pincel.lineWidth = anel.espessura * (1 - andamento * 0.7);
        pincel.stroke();
        return true;
      });

      c.particulas = c.particulas.filter((p) => {
        p.vida -= passo;
        if (p.vida <= 0) return false;
        p.vx *= 0.985;
        p.vy = p.vy * 0.985 + p.gravidade * passo;
        p.x += p.vx * passo;
        p.y += p.vy * passo;
        p.giro += passo * 6;

        const restante = p.vida / p.duracao;
        const cintilar = p.cintila ? 0.55 + 0.45 * Math.sin(p.giro * 2.2) : 1;
        const opacidade = Math.min(1, restante * 1.6) * cintilar;
        const tamanho = p.tamanho * (0.4 + restante * 0.6);

        pincel.globalAlpha = opacidade;
        pincel.fillStyle = p.cor;
        pincel.beginPath();
        pincel.arc(p.x, p.y, tamanho, 0, Math.PI * 2);
        pincel.fill();

        // risco de luz nas faíscas maiores
        if (p.tamanho > 2.4) {
          pincel.globalAlpha = opacidade * 0.5;
          pincel.fillRect(p.x - tamanho * 3, p.y - tamanho * 0.18, tamanho * 6, tamanho * 0.36);
          pincel.fillRect(p.x - tamanho * 0.18, p.y - tamanho * 3, tamanho * 0.36, tamanho * 6);
        }
        pincel.globalAlpha = 1;
        return true;
      });

      pincel.globalCompositeOperation = 'source-over';

      if (c.particulas.length === 0 && c.aneis.length === 0 && c.clarao <= 0) {
        c.rodando = false;
        anterior = 0;
        pincel.clearRect(0, 0, largura, altura);
        return;
      }
      requestAnimationFrame(desenhar);
    };

    const disparar = ({ x, y, peso = 1, tipo = 'acerto' } = {}) => {
      if (reduzir?.matches) return;

      const c = cena.current;
      const paleta = PALETAS[tipo] ?? PALETAS.acerto;
      const forca = peso >= 2 ? 1.6 : 1;
      const origemX = Number.isFinite(x) ? x : largura / 2;
      const origemY = Number.isFinite(y) ? y : altura / 2;
      const escolherCor = () => paleta.faiscas[Math.floor(Math.random() * paleta.faiscas.length)];

      // Estouro no ponto do toque — bem mais denso e rápido que o do Participou,
      // porque aqui ele disputa atenção com o modal inteiro atrás.
      const quantidade = Math.round(90 * forca);
      for (let i = 0; i < quantidade; i++) {
        const angulo = aleatorio(0, Math.PI * 2);
        const velocidade = aleatorio(160, 720) * forca;
        const duracao = aleatorio(0.7, 1.4);
        c.particulas.push({
          x: origemX,
          y: origemY,
          vx: Math.cos(angulo) * velocidade,
          vy: Math.sin(angulo) * velocidade,
          gravidade: aleatorio(320, 640),
          tamanho: aleatorio(2.4, 7),
          cor: escolherCor(),
          vida: duracao,
          duracao,
          giro: aleatorio(0, 6),
          cintila: false,
        });
      }

      // Chuva de confete caindo do alto da tela: é o que dá a sensação de festa
      // em vez de só um brilho no lugar do toque.
      const confete = Math.round(40 * forca);
      for (let i = 0; i < confete; i++) {
        const duracao = aleatorio(1.1, 1.9);
        c.particulas.push({
          x: aleatorio(0, largura),
          y: aleatorio(-40, altura * 0.25),
          vx: aleatorio(-60, 60),
          vy: aleatorio(120, 300),
          gravidade: aleatorio(60, 160),
          tamanho: aleatorio(2, 5),
          cor: escolherCor(),
          vida: duracao,
          duracao,
          giro: aleatorio(0, 6),
          cintila: false,
        });
      }

      const poeira = Math.round(45 * forca);
      for (let i = 0; i < poeira; i++) {
        const duracao = aleatorio(0.9, 1.7);
        c.particulas.push({
          x: aleatorio(0, largura),
          y: aleatorio(0, altura),
          vx: aleatorio(-36, 36),
          vy: aleatorio(-90, -22),
          gravidade: aleatorio(-30, 20),
          tamanho: aleatorio(1.6, 3.6),
          cor: escolherCor(),
          vida: duracao,
          duracao,
          giro: aleatorio(0, 6),
          cintila: true,
        });
      }

      if (c.particulas.length > LIMITE_PARTICULAS) {
        c.particulas.splice(0, c.particulas.length - LIMITE_PARTICULAS);
      }

      // Dois anéis em cores diferentes, o segundo saindo um pouco depois e indo
      // mais longe: dá profundidade à onda de choque.
      c.aneis.push({
        x: origemX,
        y: origemY,
        raioFinal: aleatorio(190, 260) * forca,
        espessura: 6 * forca,
        vida: 0.6,
        duracao: 0.6,
        cor: componentes(paleta.anel),
      });
      c.aneis.push({
        x: origemX,
        y: origemY,
        raioFinal: aleatorio(280, 380) * forca,
        espessura: 3 * forca,
        vida: 0.75,
        duracao: 0.75,
        cor: componentes(paleta.anel2 ?? paleta.anel),
      });

      c.corClarao = paleta.clarao;
      c.clarao = Math.min(1.4, c.clarao + 0.9 * forca);

      if (!c.rodando) {
        c.rodando = true;
        requestAnimationFrame(desenhar);
      }
    };

    const parar = ouvirMagia(disparar);
    return () => {
      parar();
      window.removeEventListener('resize', redimensionar);
    };
  }, []);

  return (
    <canvas
      ref={telaRef}
      className="tela-magica"
      aria-hidden="true"
      /* Acima de tudo: o acerto acontece dentro do modal da execução, cujo
         overlay é z-index 10000 (e o de confirmação, 10060). Com um valor
         menor, as faíscas eram desenhadas atrás do fundo escuro do modal e
         simplesmente não apareciam. Não recebe toque, então ficar por cima do
         modal não atrapalha o clique nas alternativas. */
      style={{ position: 'fixed', inset: 0, pointerEvents: 'none', zIndex: 10100 }}
    />
  );
}
