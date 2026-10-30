/**
 * Telão público. Consulta /api/estado a cada 2 segundos e reage ao que
 * mudou: número novo, troca de rodada, cores da cartela, sorteio de
 * desempate, patrocinadores e comemorações.
 */
const $ = (id) => document.getElementById(id);

let ultimoNumeroExibido = null;
let maxNumeroAtual = 75;

// Letra da coluna conforme o bingo clássico (B-I-N-G-O para 75 bolas)
function letraDoNumero(n, max) {
  if (max !== 75) return ''; // bingo de 90 bolas não usa letras
  if (n <= 15) return 'B';
  if (n <= 30) return 'I';
  if (n <= 45) return 'N';
  if (n <= 60) return 'G';
  return 'O';
}
function classeDaLetra(letra) {
  return letra ? `bola-${letra.toLowerCase()}` : '';
}
const coresColuna = { B: 'var(--col-b)', I: 'var(--col-i)', N: 'var(--col-n)', G: 'var(--col-g)', O: 'var(--col-o)' };

// Monta o painel de números (B-I-N-G-O ou 1–90)
function montarPainel(max) {
  const painel = $('painelNumeros');
  painel.innerHTML = '';
  maxNumeroAtual = max;
  $('qtdeTotal').textContent = max;

  if (max === 75) {
    const letras = ['B', 'I', 'N', 'G', 'O'];
    letras.forEach((letra, i) => {
      const linha = document.createElement('div');
      linha.className = 'linha-painel';

      const rotulo = document.createElement('div');
      rotulo.className = `letra-coluna ${letra === 'N' ? 'n' : ''}`;
      rotulo.style.background = coresColuna[letra];
      rotulo.textContent = letra;
      linha.appendChild(rotulo);

      const nums = document.createElement('div');
      nums.className = 'numeros-coluna';
      for (let n = i * 15 + 1; n <= (i + 1) * 15; n++) {
        const cel = document.createElement('div');
        cel.className = 'celula';
        cel.id = `n-${n}`;
        cel.textContent = n;
        cel.style.setProperty('--cor-cel', coresColuna[letra]);
        nums.appendChild(cel);
      }
      linha.appendChild(nums);
      painel.appendChild(linha);
    });
  } else {
    // Bingo de 90 bolas: grade corrida 1–90
    const grade = document.createElement('div');
    grade.className = 'numeros-coluna';
    grade.style.gridTemplateColumns = 'repeat(10, 1fr)';
    for (let n = 1; n <= 90; n++) {
      const cel = document.createElement('div');
      cel.className = 'celula';
      cel.id = `n-${n}`;
      cel.textContent = n;
      grade.appendChild(cel);
    }
    painel.appendChild(grade);
  }
}

// Aplica a personalização vinda do banco
let corExtraAtiva = null; // quando há rodada extra, o tema usa a cor da cartela

function aplicarConfig(c) {
  // Fundo: cor da cartela extra (escurecida para dar contraste) ou a cor do evento
  const fundo = corExtraAtiva
    ? `color-mix(in srgb, ${corExtraAtiva} 62%, #101418)`
    : c.cor_primaria;
  document.documentElement.style.setProperty('--primaria', fundo);
  document.documentElement.style.setProperty('--destaque', c.cor_destaque);
  // Cores das bolas (personalizáveis na tela Personalizar)
  if (c.cor_bola_b) document.documentElement.style.setProperty('--col-b', c.cor_bola_b);
  if (c.cor_bola_i) document.documentElement.style.setProperty('--col-i', c.cor_bola_i);
  if (c.cor_bola_n) document.documentElement.style.setProperty('--col-n', c.cor_bola_n);
  if (c.cor_bola_g) document.documentElement.style.setProperty('--col-g', c.cor_bola_g);
  if (c.cor_bola_o) document.documentElement.style.setProperty('--col-o', c.cor_bola_o);
  $('nomeEvento').textContent = c.nome_evento;
  $('subtitulo').textContent = c.subtitulo;
  $('mensagemRodape').textContent = c.mensagem_rodape;

  const banner = $('banner');
  if (c.banner_url) { banner.src = c.banner_url; banner.hidden = false; }
  else banner.hidden = true;

  if (parseInt(c.max_numero, 10) !== maxNumeroAtual || !$('painelNumeros').hasChildNodes()) {
    montarPainel(parseInt(c.max_numero, 10));
    ultimoNumeroExibido = null;
  }
}

// Sons (tambor e fanfarra sintetizados - sem arquivos)
// Navegadores exigem um clique antes de tocar áudio; o botão "Ativar som"
// cumpre esse papel. A preferência fica salva para os próximos usos.
let audioCtx = null;
let somAtivo = false;

function iniciarAudio() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
}

function atualizarBotaoSom() {
  const btn = $('btnSom');
  btn.textContent = somAtivo ? '🔊 Som ativado' : '🔇 Ativar som';
  btn.classList.toggle('ativo', somAtivo);
}

$('btnSom').addEventListener('click', () => {
  somAtivo = !somAtivo;
  if (somAtivo) iniciarAudio();
  try { localStorage.setItem('bingo-som', somAtivo ? '1' : '0'); } catch {}
  atualizarBotaoSom();
});

// Se o som já era preferido, o primeiro clique/toque em qualquer lugar reativa
try {
  if (localStorage.getItem('bingo-som') === '1') {
    document.addEventListener('pointerdown', function liga() {
      somAtivo = true;
      iniciarAudio();
      atualizarBotaoSom();
    }, { once: true });
  }
} catch {}

// Uma batida seca de tambor (ruído filtrado com envelope curto)
function batidaTambor(volume = 0.5) {
  if (!somAtivo || !audioCtx) return;
  const t = audioCtx.currentTime;
  const dur = 0.06;
  const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * dur, audioCtx.sampleRate);
  const dados = buffer.getChannelData(0);
  for (let i = 0; i < dados.length; i++) dados[i] = (Math.random() * 2 - 1) * (1 - i / dados.length);
  const fonte = audioCtx.createBufferSource();
  fonte.buffer = buffer;
  const filtro = audioCtx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 180;
  filtro.Q.value = 0.8;
  const ganho = audioCtx.createGain();
  ganho.gain.setValueAtTime(volume, t);
  ganho.gain.exponentialRampToValueAtTime(0.001, t + dur);
  fonte.connect(filtro).connect(ganho).connect(audioCtx.destination);
  fonte.start(t);
}

// Rufar de tambor contínuo; retorna a função que o interrompe
function rufarTambor() {
  if (!somAtivo || !audioCtx) return () => {};
  const intervalo = setInterval(() => batidaTambor(0.35), 55);
  return () => {
    clearInterval(intervalo);
    batidaTambor(0.9); // batida final forte
  };
}

// Uma badalada de sino: fundamental + harmônicos com decaimento longo,
// como o sino que anuncia o ganhador nos bingos tradicionais
function badalada(freq, inicio, dur = 2.4, volume = 0.22) {
  const t = audioCtx.currentTime + inicio;
  // Parciais típicos de sino (levemente inarmônicos)
  const parciais = [
    { mult: 1.0,  vol: 1.0 },
    { mult: 2.0,  vol: 0.42 },
    { mult: 2.98, vol: 0.24 },
    { mult: 4.16, vol: 0.10 },
  ];
  parciais.forEach((p) => {
    const osc = audioCtx.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = freq * p.mult;
    const ganho = audioCtx.createGain();
    ganho.gain.setValueAtTime(0.0001, t);
    ganho.gain.exponentialRampToValueAtTime(volume * p.vol, t + 0.012);
    ganho.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(ganho).connect(audioCtx.destination);
    osc.start(t);
    osc.stop(t + dur + 0.1);
  });
}

// Som de vitória
// 1º) Se existir o arquivo public/sons/vitoria.mp3 (colocado pelo
//     organizador), toca ELE - som real, do jeito que a comunidade quiser.
// 2º) Senão, toca a festa embutida: APLAUSOS sintetizados (multidão)
//     junto com um repique de sinos - festivo e natural.
let audioVitoria = null;
let audioVitoriaVerificado = false;

async function verificarSomPersonalizado() {
  if (audioVitoriaVerificado) return;
  audioVitoriaVerificado = true;
  try {
    const r = await fetch('/sons/vitoria.mp3', { method: 'HEAD' });
    if (r.ok) {
      audioVitoria = new Audio('/sons/vitoria.mp3');
      audioVitoria.preload = 'auto';
    }
  } catch { /* sem som personalizado: usa o embutido */ }
}
verificarSomPersonalizado();

// Uma "palma": estalo curto de ruído filtrado
function palma(inicio, volume) {
  const t = audioCtx.currentTime + inicio;
  const dur = 0.028;
  const buffer = audioCtx.createBuffer(1, Math.ceil(audioCtx.sampleRate * dur), audioCtx.sampleRate);
  const d = buffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const fonte = audioCtx.createBufferSource();
  fonte.buffer = buffer;
  const filtro = audioCtx.createBiquadFilter();
  filtro.type = 'bandpass';
  filtro.frequency.value = 900 + Math.random() * 1600; // cada palma soa diferente
  filtro.Q.value = 1.1;
  const ganho = audioCtx.createGain();
  ganho.gain.setValueAtTime(volume, t);
  ganho.gain.exponentialRampToValueAtTime(0.001, t + dur);
  fonte.connect(filtro).connect(ganho).connect(audioCtx.destination);
  fonte.start(t);
}

// Multidão aplaudindo por ~4,5s: centenas de palmas em momentos e
// timbres aleatórios, crescendo no início e diminuindo no fim
function aplausos(duracao = 4.5) {
  let t = 0;
  while (t < duracao) {
    const progresso = t / duracao;
    // Envelope da empolgação: sobe rápido, sustenta, decai no final
    const energia = progresso < 0.15 ? progresso / 0.15
                  : progresso > 0.75 ? (1 - progresso) / 0.25
                  : 1;
    const densidade = 0.012 + (1 - energia) * 0.05; // mais energia = palmas mais juntas
    palma(t, 0.10 + Math.random() * 0.22 * energia);
    t += densidade + Math.random() * 0.03;
  }
}

// Festa embutida: aplausos + repique de sinos por cima
function festaEmbutida() {
  aplausos(4.5);
  badalada(783.99, 0.15, 1.4, 0.15);   // Sol5
  badalada(1046.5, 0.45, 1.6, 0.17);   // Dó6
  badalada(1318.5, 0.80, 1.8, 0.14);   // Mi6
  badalada(1046.5, 1.60, 1.4, 0.13);   // Dó6
  badalada(1318.5, 2.10, 2.4, 0.13);   // Mi6
  badalada(1567.98, 2.15, 2.4, 0.10);  // Sol6
}

function tocarSino() {
  if (!somAtivo) return;
  if (audioVitoria) {
    audioVitoria.currentTime = 0;
    audioVitoria.play().catch(() => { iniciarAudio(); festaEmbutida(); });
    return;
  }
  if (!audioCtx) return;
  iniciarAudio();
  festaEmbutida();
}

// Confete de comemoração
const CORES_CONFETE = ['var(--col-b)', 'var(--col-i)', 'var(--col-g)', 'var(--col-o)', 'var(--destaque)', '#fff'];
function soltarConfete() {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const antigo = document.querySelector('.confetes');
  if (antigo) antigo.remove();
  const caixa = document.createElement('div');
  caixa.className = 'confetes';
  caixa.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 60; i++) {
    const p = document.createElement('span');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = CORES_CONFETE[i % CORES_CONFETE.length];
    p.style.animationDelay = (Math.random() * 2.5) + 's';
    p.style.animationDuration = (3 + Math.random() * 2.5) + 's';
    p.style.setProperty('--gira', (Math.random() > .5 ? 1 : -1) * (360 + Math.random() * 360) + 'deg');
    caixa.appendChild(p);
  }
  document.body.appendChild(caixa);
  setTimeout(() => caixa.remove(), 9000);
}

// Sorteio de desempate animado no telão
let sorteioAnimado = false;       // já animou para este ganhador?
let sorteioEmAndamento = false;   // animação rodando agora?
let ganhadorAnimadoId = null;

function animarSorteioTelao(empatados, ganhador) {
  sorteioEmAndamento = true;
  const titulo = $('esperaTitulo');
  const texto = $('esperaTexto');
  texto.textContent = `${empatados.length} pessoas bateram BINGO! Embaralhando os nomes para o sorteio do prêmio...`;
  titulo.classList.add('embaralhando');

  const pararTambor = rufarTambor(); // 🥁 rufar durante o embaralhamento

  const nomes = empatados.map((e) => e.nome);
  let i = Math.floor(Math.random() * nomes.length);
  let atraso = 90;

  (function passo() {
    titulo.textContent = `🎲 ${nomes[i % nomes.length]}`;
    i++;
    atraso *= 1.12;
    if (atraso < 700) {
      setTimeout(passo, atraso);
    } else {
      pararTambor();     // 🥁 batida final
      tocarSino();       // 🔔 sino da revelação
      titulo.classList.remove('embaralhando');
      titulo.classList.add('revelado');
      titulo.textContent = `🎲 ${ganhador.nome} venceu o sorteio!`;
      texto.textContent =
        `Houve empate na rodada e o sorteio decidiu. Cartela ${ganhador.numero_cartela}` +
        (ganhador.premio ? ` · Prêmio: ${ganhador.premio}` : '') +
        ' - aguarde a próxima rodada.';
      soltarConfete();
      sorteioEmAndamento = false;
      sorteioAnimado = true;
      setTimeout(() => titulo.classList.remove('revelado'), 1200);
    }
  })();
}

// Atualiza bola gigante, fila e painel
let primeiraCarga = true;

let disputaExibida = null;

function atualizarDisputa(disputa) {
  const tela = $('telaDisputa');
  if (!disputa) {
    tela.hidden = true;
    disputaExibida = null;
    return;
  }
  const chave = JSON.stringify(disputa.participantes) + disputa.em;
  tela.hidden = false;
  if (chave === disputaExibida) return; // já está exibindo: não reinicia a animação
  disputaExibida = chave;

  $('disputaTitulo').textContent = disputa.participantes.length > 1
    ? 'Confira se o seu nome está na lista'
    : 'Conferindo o ganhador';
  $('disputaPremio').textContent = disputa.premio ? `🏆 Disputando: ${disputa.premio}` : '';

  const lista = $('disputaLista');
  lista.innerHTML = '';
  disputa.participantes.forEach((p, i) => {
    const d = document.createElement('div');
    d.className = 'disputa-nome';
    d.style.animationDelay = (i * 0.09) + 's';
    d.innerHTML = `
      <span class="n">${p.nome}</span>
      ${p.numero_cartela ? `<span class="c">Cartela ${p.numero_cartela}</span>` : ''}`;
    lista.appendChild(d);
  });
}

function atualizarJogo(estado) {
  const { rodada, numeros, ultimo_ganhador, evento, empatados } = estado;
  atualizarDisputa(estado.disputa);

  // Ganhador novo? (vale para os dois cenários: rodada encerrada OU
  // rodada que CONTINUA depois de um bingo no meio dela)
  const idGanhador = ultimo_ganhador?.id ?? null;
  const ganhadorNovo = idGanhador !== ganhadorAnimadoId;
  if (ganhadorNovo) {
    ganhadorAnimadoId = idGanhador;
    sorteioAnimado = false;
  }
  const celebrar = ganhadorNovo && idGanhador && !primeiraCarga;
  primeiraCarga = false;

  // Sem rodada aberta → tela de espera/comemoração/encerramento
  const espera = $('telaEspera');
  if (!rodada) {
    ocultarToast();
    espera.hidden = false;

    if (celebrar && !ultimo_ganhador.houve_empate) {
      soltarConfete();
      tocarSino(); // 🔔 comemoração do ganhador
    }
    if (sorteioEmAndamento) return; // deixa a animação terminar em paz

    if (!evento && ultimo_ganhador) {
      // Evento concluído: agradecimento
      $('esperaTitulo').textContent = '🏁 Bingo encerrado!';
      $('esperaTexto').textContent =
        `Obrigado pela participação de todos! Último ganhador: ${ultimo_ganhador.nome}, ` +
        `cartela ${ultimo_ganhador.numero_cartela}. Até o próximo bingo!`;
    } else if (ultimo_ganhador && ultimo_ganhador.houve_empate && !sorteioAnimado) {
      animarSorteioTelao(empatados || [], ultimo_ganhador);
    } else if (ultimo_ganhador && ultimo_ganhador.houve_empate) {
      $('esperaTitulo').textContent = `🎲 ${ultimo_ganhador.nome} venceu o sorteio!`;
      $('esperaTexto').textContent =
        `Houve empate na rodada e o sorteio decidiu. Cartela ${ultimo_ganhador.numero_cartela}` +
        (ultimo_ganhador.premio ? ` · Prêmio: ${ultimo_ganhador.premio}` : '') +
        ' - aguarde a próxima rodada.';
    } else if (ultimo_ganhador) {
      $('esperaTitulo').textContent = `🎱 ${ultimo_ganhador.nome} bateu BINGO!`;
      $('esperaTexto').textContent =
        `Cartela ${ultimo_ganhador.numero_cartela}` +
        (ultimo_ganhador.premio ? ` · Prêmio: ${ultimo_ganhador.premio}` : '') +
        ' - aguarde a próxima rodada.';
    } else {
      $('esperaTitulo').textContent = 'Já vamos começar!';
      $('esperaTexto').textContent = 'Prepare sua cartela: a primeira rodada começa em instantes.';
    }
    return;
  }
  espera.hidden = true;

  // BINGO no meio da rodada (o operador escolheu CONTINUAR):
  // celebra com aviso, confete e som, sem interromper o jogo
  if (celebrar) {
    mostrarToast(ultimo_ganhador);
    soltarConfete();
    tocarSino();
  }

  // Rodada extra: faixa de destaque no cabeçalho
  const faixaExtra = $('faixaExtra');
  const rodadaEhExtra = rodada.tipo === 'extra' && rodada.cor_cartela;
  if (rodadaEhExtra) {
    $('numeroRodada').textContent = 'EXTRA';
    $('numeroRodada').style.fontSize = '';
    const premioExtra = rodada.premio_em_disputa || rodada.premio;
    const ordExtra = (rodada.premios_entregues || 0) + 1;
    const totExtra = rodada.total_premios_rodada || 0;
    $('premioRodada').textContent =
      `🎫 Cartela ${rodada.nome_cor}` +
      (premioExtra
        ? ` · 🏆 ${totExtra > 1 ? ordExtra + 'º de ' + totExtra + ': ' : ''}${premioExtra}`
        : '');
    faixaExtra.hidden = false;
    faixaExtra.textContent = `★ RODADA EXTRA - CARTELA ${String(rodada.nome_cor || '').toUpperCase()} ★`;
    faixaExtra.style.background = rodada.cor_cartela;
  } else {
    const premioComum = rodada.premio_em_disputa || rodada.premio;
    const ordComum = (rodada.premios_entregues || 0) + 1;
    const totComum = rodada.total_premios_rodada || 0;
    // Se a rodada comum tem NOME configurado, o telão mostra a cartela
    // (mais claro para o público do que "2ª de 3")
    if (rodada.nome_cor) {
      $('numeroRodada').textContent = String(rodada.nome_cor).toUpperCase();
      $('numeroRodada').style.fontSize = 'clamp(1.1rem, 2.2vw, 1.9rem)';
      faixaExtra.hidden = false;
      faixaExtra.textContent = `★ CARTELA ${String(rodada.nome_cor).toUpperCase()} ★`;
      faixaExtra.style.background = rodada.cor_cartela || 'var(--destaque)';
    } else {
      $('numeroRodada').textContent = evento
        ? `${rodada.numero_rodada}ª/${evento.qtde_rodadas_planejadas}`
        : `${rodada.numero_rodada}ª`;
      $('numeroRodada').style.fontSize = '';
      faixaExtra.hidden = true;
    }
    $('premioRodada').textContent = premioComum
      ? `🏆 ${totComum > 1 ? ordComum + 'º de ' + totComum + ': ' : ''}${premioComum}`
      : '';
  }
  // Painel: marca todos os números da rodada
  document.querySelectorAll('.celula.marcada').forEach((c) => c.classList.remove('marcada', 'recente'));
  numeros.forEach((n) => $(`n-${n.numero}`)?.classList.add('marcada'));

  const lista = numeros.map((n) => n.numero);
  const ultimo = lista[lista.length - 1] ?? null;

  $('qtdeSorteados').textContent = lista.length;

  // Bola gigante
  const bola = $('bolaGigante');
  if (ultimo === null) {
    bola.className = 'bola gigante vazia';
    $('bolaLetra').textContent = '';
    $('bolaNumero').textContent = '?';
  } else {
    const letra = letraDoNumero(ultimo, maxNumeroAtual);
    bola.className = `bola gigante ${classeDaLetra(letra)}`;
    $('bolaLetra').textContent = letra;
    $('bolaNumero').textContent = ultimo;
    $(`n-${ultimo}`)?.classList.add('recente');

    if (ultimo !== ultimoNumeroExibido) {
      bola.classList.remove('animar');
      void bola.offsetWidth; // reinicia a animação
      bola.classList.add('animar');
    }
  }
  ultimoNumeroExibido = ultimo;

  // Bolas anteriores (as 5 antes da última)
  const fila = $('bolasAnteriores');
  fila.innerHTML = '';
  lista.slice(-6, -1).reverse().forEach((n) => {
    const letra = letraDoNumero(n, maxNumeroAtual);
    const b = document.createElement('div');
    b.className = `bola ${classeDaLetra(letra)}`;
    b.innerHTML = `<div class="janela"><span class="numero">${n}</span></div>`;
    fila.appendChild(b);
  });

  // Esteira de logos dos patrocinadores (abaixo do painel)
  atualizarPatrocinadores(estado.patrocinadores || []);
}

// Toast: BINGO no meio da rodada
let toastTimer = null;
function mostrarToast(g) {
  const t = $('toastGanhador');
  t.innerHTML = `
    <span class="toast-titulo">🎱 BINGO! ${g.nome}</span>
    <span class="toast-detalhe">Cartela ${g.numero_cartela}${g.premio ? ' · 🏆 ' + g.premio : ''}${g.houve_empate ? ' · 🎲 venceu o sorteio' : ''}<br>A rodada continua para o próximo prêmio!</span>`;
  t.hidden = false;
  t.classList.remove('saindo');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(ocultarToast, 8000);
}
function ocultarToast() {
  const t = $('toastGanhador');
  if (!t.hidden) {
    t.classList.add('saindo');
    setTimeout(() => { t.hidden = true; t.classList.remove('saindo'); }, 400);
  }
}

// Esteira contínua de patrocinadores
let listaPatrocinadores = null;

function atualizarPatrocinadores(lista) {
  const faixa = $('faixaPatrocinadores');
  const chave = JSON.stringify(lista.map((p) => p.id + p.logo_url));
  if (chave === listaPatrocinadores) return; // nada mudou: não reinicia a esteira
  listaPatrocinadores = chave;

  if (!lista.length) { faixa.hidden = true; return; }
  faixa.hidden = false;

  const trilho = $('trilhoPatrocinadores');
  const itens = lista.map((p) => `
    <div class="logo-patro">
      <img src="${p.logo_url}" alt="${(p.nome || 'Patrocinador').replace(/"/g, '&quot;')}">
    </div>`).join('');
  // Sequência duplicada = loop contínuo sem "salto"
  trilho.innerHTML = itens + itens;
  // Velocidade agradável e constante, proporcional à quantidade de logos
  trilho.style.animationDuration = Math.max(22, lista.length * 9) + 's';
}

async function ciclo() {
  try {
    const r = await fetch('/api/estado');
    if (!r.ok) return;
    const estado = await r.json();
    // Cor de fundo: segue o tipo da rodada em andamento OU da última
    // encerrada, até que outra rodada seja iniciada. Cartela comum usa
    // a cor padrão do evento (verde); extras usam a cor da cartela.
    const ref = estado.rodada || estado.ultima_rodada;
    corExtraAtiva = (ref && ref.tipo === 'extra' && ref.cor_cartela) ? ref.cor_cartela : null;
    aplicarConfig(estado.config);
    atualizarJogo(estado);
  } catch {
    /* servidor fora do ar momentaneamente: tenta de novo no próximo ciclo */
  }
}

ciclo();
setInterval(ciclo, 2000);
