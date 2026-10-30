/**
 * Painel do operador: escolhe a rodada, canta os números, corrige erros
 * e registra os ganhadores (com sorteio quando há empate).
 */
const $ = (id) => document.getElementById(id);
let maxNumero = 75;
let numerosMarcados = [];
let premioSugerido = '';  // prêmio que o servidor indicou para a vez

// Modais de erro e confirmação
function mostrarErro(titulo, texto) {
  $('erroTitulo').textContent = titulo || 'Ops!';
  $('erroTexto').textContent = texto || 'Algo não saiu como esperado.';
  if (!$('modalErro').open) $('modalErro').showModal();
}
$('btnFecharErro').addEventListener('click', () => $('modalErro').close());

let resolverConfirma = null;
function confirmar(titulo, texto, rotuloSim = 'Confirmar') {
  $('confirmaTitulo').textContent = titulo;
  $('confirmaTexto').textContent = texto;
  $('btnConfirmaSim').textContent = rotuloSim;
  $('modalConfirma').showModal();
  return new Promise((r) => { resolverConfirma = r; });
}
$('btnConfirmaSim').addEventListener('click', () => {
  $('modalConfirma').close(); resolverConfirma?.(true);
});
$('btnConfirmaNao').addEventListener('click', () => {
  $('modalConfirma').close(); resolverConfirma?.(false);
});

function avisar(msg, tipo = 'ok') {
  const el = $('aviso');
  el.textContent = msg;
  el.className = `aviso mostrar ${tipo}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('mostrar'), 4000);
}

async function api(url, opcoes = {}) {
  const r = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opcoes,
  });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Erro inesperado.');
  return dados;
}

// Grade clicável
function montarGrade() {
  const grade = $('gradeOperador');
  grade.innerHTML = '';
  for (let n = 1; n <= maxNumero; n++) {
    const b = document.createElement('button');
    b.type = 'button';
    b.textContent = n;
    b.id = `op-${n}`;
    b.title = `Clique para cantar o ${n} (se já estiver marcado, remove)`;
    b.addEventListener('click', () => {
      if (numerosMarcados.includes(n)) removerNumero(n);
      else cantar(n);
    });
    grade.appendChild(b);
  }
}

function pintarGrade() {
  document.querySelectorAll('.grade-operador button').forEach((b) => b.classList.remove('marcado', 'ultimo'));
  numerosMarcados.forEach((n) => $(`op-${n}`)?.classList.add('marcado'));
  const ultimo = numerosMarcados[numerosMarcados.length - 1];
  if (ultimo) {
    $(`op-${ultimo}`)?.classList.add('ultimo');
    $('ultimoCantado').textContent = `Último: ${ultimo}`;
  } else {
    $('ultimoCantado').textContent = '';
  }
}

// Estado
async function carregar() {
  const estado = await api('/api/estado');
  maxNumero = parseInt(estado.config.max_numero, 10);
  $('entradaNumero').max = maxNumero;

  const evento = estado.evento;

  if (estado.rodada) {
    $('cartaoSemEvento').hidden = true;
    $('cartaoNovaRodada').hidden = true;
    $('cartaoRodada').hidden = false;
    if (estado.rodada.tipo === 'extra') {
      $('rodadaAtual').innerHTML =
        `EXTRA <span class="selo-extra" style="background:${estado.rodada.cor_cartela}">Cartela ${estado.rodada.nome_cor}</span>`;
      $('totalRodadas').textContent = '';
    } else {
      $('rodadaAtual').textContent = `${estado.rodada.numero_rodada}ª`;
      $('totalRodadas').textContent = evento ? `de ${evento.qtde_rodadas_planejadas}` : '';
    }
    const emDisputa = estado.rodada.premio_em_disputa;
    const jaEntregues = estado.rodada.premios_entregues || 0;
    premioSugerido = emDisputa || '';
    const ordinal = jaEntregues + 1;
    const totalRod = estado.rodada.total_premios_rodada || 0;
    $('premioAtual').textContent =
      (emDisputa
        ? `🏆 ${ordinal}º${totalRod ? ' de ' + totalRod : ''} prêmio desta rodada: ${emDisputa}`
        : '⚠ Esta rodada não tem mais prêmios - informe um sobressalente para continuar') +
      (jaEntregues > 0 ? ` · ${jaEntregues} já entregue(s) nesta rodada` : '');
    if (!$('modalGanhador').open) $('gPremio').value = emDisputa || '';
    numerosMarcados = estado.numeros.map((n) => n.numero);
    // Cancelar só é possível enquanto nenhum número foi cantado
    $('btnCancelarRodada').hidden = numerosMarcados.length > 0;
    if ($('gradeOperador').childElementCount !== maxNumero) montarGrade();
    pintarGrade();
    return;
  }

  $('cartaoRodada').hidden = true;

  if (!evento) {
    $('cartaoSemEvento').hidden = false;
    $('cartaoNovaRodada').hidden = true;
    return;
  }

  // Evento aberto, sem rodada em andamento → escolher a próxima da sequência
  $('cartaoSemEvento').hidden = true;
  $('cartaoNovaRodada').hidden = false;

  const pendentes = estado.planejadas_pendentes || [];
  const feitas = (estado.rodadas_realizadas || 0);

  $('tituloNovaRodada').textContent = `Escolha a próxima rodada - ${evento.nome}`;
  $('andamentoEvento').textContent = pendentes.length
    ? `${pendentes.length} rodada(s) pendente(s) na sequência. A primeira da lista é a próxima planejada.`
    : 'Todas as rodadas planejadas foram realizadas. Adicione novas em Prêmios & Rodadas ou conclua o evento.';

  const selecaoAnterior = document.querySelector('input[name="proximaRodada"]:checked')?.value || null;
  const caixa = $('opcoesRodada');
  caixa.innerHTML = '';

  pendentes.forEach((p, i) => {
    const nome = p.nome || (p.tipo === 'extra' ? 'Cartela extra' : 'Cartela comum');
    const cor = p.cor || (p.tipo === 'extra' ? '#e0509a' : '#1b4d3e');
    const premios = (p.premios || []);
    caixa.insertAdjacentHTML('beforeend', `
      <label class="opcao-rodada">
        <input type="radio" name="proximaRodada" value="${p.id}">
        <span class="bolinha-cor" style="background:${cor}"></span>
        <span class="info">
          <strong>${nome}</strong>
          ${p.tipo === 'extra' ? `<span class="selo-extra" style="background:${cor}">EXTRA</span>` : ''}
          ${i === 0 ? '<span class="selo aberta">próxima da sequência</span>' : ''}<br>
          <small>${premios.length} prêmio(s)${premios[0] ? ' · 1º: ' + premios[0] : ''}</small>
        </span>
      </label>`);
  });

  const radios = [...caixa.querySelectorAll('input[name="proximaRodada"]')];
  const restaurar = radios.find((r) => r.value === selecaoAnterior);
  if (restaurar) restaurar.checked = true;
  else if (radios[0]) radios[0].checked = true;

  if (radios.length === 0) {
    caixa.innerHTML = '<p style="font-size:.92rem;color:var(--tinta-suave)">Nenhuma rodada pendente no planejamento.</p>';
  }
  $('btnIniciar').disabled = radios.length === 0;
  $('btnConcluirEvento').hidden = false;
}

$('btnConcluirEvento').addEventListener('click', async () => {
  if (!confirm('Concluir o evento do bingo? Não será possível iniciar novas rodadas nele.')) return;
  try {
    await api('/api/eventos/atual/concluir', { method: 'POST' });
    avisar('Evento concluído! Obrigado e até o próximo bingo. 🎉');
    await carregar();
  } catch (e) { mostrarErro('Não foi possível concluir', e.message); }
});

// Ações
async function cantar(numero) {
  if (!numero) return;
  try {
    await api('/api/rodadas/atual/numeros', {
      method: 'POST',
      body: JSON.stringify({ numero }),
    });
    $('entradaNumero').value = '';
    await carregar();
  } catch (e) {
    mostrarErro('Número não aceito', e.message);
  }
  $('entradaNumero').focus();
}

$('btnIniciar').addEventListener('click', async () => {
  try {
    const sel = document.querySelector('input[name="proximaRodada"]:checked');
    if (!sel) return mostrarErro('Nenhuma rodada selecionada', 'Escolha qual rodada vai ao ar antes de iniciar.');
    await api('/api/rodadas', {
      method: 'POST',
      body: JSON.stringify({
        planejada_id: parseInt(sel.value, 10),
        premio: $('premioNovo').value.trim() || null,
      }),
    });
    $('premioNovo').value = '';
    avisar('Rodada iniciada. Boa sorte!');
    await carregar();
    $('entradaNumero').focus();
  } catch (e) { mostrarErro('Não foi possível iniciar a rodada', e.message); }
});

$('btnCantar').addEventListener('click', () => cantar(parseInt($('entradaNumero').value, 10)));
$('entradaNumero').addEventListener('keydown', (ev) => {
  if (ev.key === 'Enter') cantar(parseInt($('entradaNumero').value, 10));
});

async function removerNumero(n) {
  const ok = await confirmar(
    `Remover o número ${n}?`,
    `O número ${n} sai da lista desta rodada e some do telão. Use isto quando o número foi digitado por engano.`,
    'Sim, remover número'
  );
  if (!ok) return;
  try {
    await api(`/api/rodadas/atual/numeros/${n}`, { method: 'DELETE' });
    avisar(`Número ${n} removido da rodada.`);
    await carregar();
  } catch (e) { mostrarErro('Não foi possível remover o número', e.message); }
  $('entradaNumero').focus();
}

$('btnCancelarRodada').addEventListener('click', async () => {
  if (!confirm('Cancelar esta rodada e voltar para a escolha? (permitido porque nenhum número foi cantado)')) return;
  try {
    const r = await api('/api/rodadas/atual/cancelar', { method: 'POST' });
    avisar(`Rodada ${r.cancelada} cancelada. Escolha a rodada correta abaixo.`);
    await carregar();
  } catch (e) { mostrarErro('Não foi possível concluir', e.message); }
});

$('btnDesfazer').addEventListener('click', async () => {
  try {
    const r = await api('/api/rodadas/atual/numeros/ultimo', { method: 'DELETE' });
    if (r.removido) avisar(`Número ${r.removido} removido.`);
    await carregar();
  } catch (e) { mostrarErro('Não foi possível desfazer', e.message); }
});

// Bingo / ganhador(es)
function blocoGanhador() {
  const div = document.createElement('div');
  div.className = 'bloco-ganhador';
  div.innerHTML = `
    <div class="cabecalho-bloco">
      <strong class="titulo-bloco"></strong>
      <button type="button" class="remover" hidden>✕ Remover</button>
    </div>
    <div class="linha-form" style="margin-bottom:0">
      <div class="campo">
        <label>Nome completo *</label>
        <input type="text" class="g-nome" required>
      </div>
      <div class="campo" style="flex:0 1 180px">
        <label>Nº da cartela *</label>
        <input type="text" class="g-cartela" required>
      </div>
    </div>`;
  div.querySelector('.remover').addEventListener('click', () => {
    div.remove();
    renumerarGanhadores();
  });
  return div;
}

function renumerarGanhadores() {
  const blocos = [...$('listaGanhadores').children];
  blocos.forEach((b, i) => {
    b.querySelector('.titulo-bloco').textContent =
      blocos.length > 1 ? `Ganhador ${i + 1}` : 'Ganhador';
    b.querySelector('.remover').hidden = blocos.length <= 1;
  });
}

async function prepararModalGanhador() {
  try {
    const e = await api('/api/estado');
    if (e.rodada) {
      premioSugerido = e.rodada.premio_em_disputa || '';
      $('gPremio').value = premioSugerido;
      const pos = (e.rodada.premios_entregues || 0) + 1;
      const tot = e.rodada.total_premios_rodada || 0;
      $('tituloPremioVez').textContent = premioSugerido
        ? `Prêmio da vez: ${pos}º${tot ? ' de ' + tot : ''} - ${premioSugerido}`
        : 'Esta rodada não tem mais prêmios na fila - informe o prêmio abaixo';
    }
  } catch { /* usa o que já está na tela */ }
  $('statusConferencia').style.display = 'none';
  $('listaGanhadores').innerHTML = '';
  $('listaGanhadores').appendChild(blocoGanhador());
  renumerarGanhadores();
  $('gObs').value = '';
  $('gSobressalente').value = '';
}

// Conferência no telão antes do sorteio
function lerParticipantes() {
  return [...$('listaGanhadores').children].map((b) => ({
    nome: b.querySelector('.g-nome').value.trim(),
    numero_cartela: b.querySelector('.g-cartela').value.trim(),
  })).filter((p) => p.nome);
}

$('btnMostrarTelao').addEventListener('click', async () => {
  const participantes = lerParticipantes();
  if (participantes.length === 0) {
    return mostrarErro('Nenhum nome preenchido',
      'Digite o nome (e a cartela) de quem bateu bingo antes de projetar no telão.');
  }
  try {
    await api('/api/disputa', {
      method: 'POST',
      body: JSON.stringify({ participantes, premio: $('gPremio').value.trim() || null }),
    });
    const el = $('statusConferencia');
    el.style.display = 'block';
    el.className = 'aviso ok mostrar';
    el.textContent = `✔ ${participantes.length} nome(s) no telão. O público pode conferir; ` +
      'atualize aqui se corrigir algo, e depois salve/sorteie normalmente.';
  } catch (e) { mostrarErro('Não foi possível exibir no telão', e.message); }
});

async function limparConferencia() {
  try { await fetch('/api/disputa', { method: 'DELETE' }); } catch {}
  const el = $('statusConferencia');
  el.style.display = 'none';
  el.classList.remove('mostrar');
}

$('btnAddGanhador').addEventListener('click', () => {
  $('listaGanhadores').appendChild(blocoGanhador());
  renumerarGanhadores();
});

$('btnBingo').addEventListener('click', async () => {
  await prepararModalGanhador();
  $('modalGanhador').showModal();
});
$('btnCancelarGanhador').addEventListener('click', () => {
  $('modalGanhador').close();
  limparConferencia();
});
$('btnFecharSorteio').addEventListener('click', () => $('modalSorteio').close());

// Embaralha visualmente os nomes até revelar o sorteado
function animarSorteio(nomes, vencedorTexto) {
  const alvo = $('sorteioVencedor');
  const btn = $('btnFecharSorteio');
  btn.disabled = true;
  btn.textContent = 'Sorteando...';
  alvo.classList.remove('revelado');
  alvo.classList.add('embaralhando');

  let i = Math.floor(Math.random() * nomes.length);
  let atraso = 70; // começa rápido e vai desacelerando, como uma roleta

  (function passo() {
    alvo.textContent = nomes[i % nomes.length];
    i++;
    atraso *= 1.13;
    if (atraso < 650) {
      setTimeout(passo, atraso);
    } else {
      // Revelação do vencedor
      alvo.classList.remove('embaralhando');
      alvo.classList.add('revelado');
      alvo.textContent = vencedorTexto;
      btn.disabled = false;
      btn.textContent = '✔ Aceitar resultado';
    }
  })();
}

async function salvarGanhadores(continuar) {
  try {
    const ganhadores = [...$('listaGanhadores').children].map((b) => ({
      nome: b.querySelector('.g-nome').value.trim(),
      numero_cartela: b.querySelector('.g-cartela').value.trim(),
    }));
    if (ganhadores.length === 0 || ganhadores.some((g) => !g.nome || !g.numero_cartela)) {
      return mostrarErro('Faltam dados do ganhador', 'Preencha o nome e o número da cartela de cada pessoa antes de salvar.');
    }
    const r = await api('/api/rodadas/atual/encerrar', {
      method: 'POST',
      body: JSON.stringify({
        ganhadores,
        continuar,
        // Só envia prêmio manual se o operador realmente alterou o campo;
        // caso contrário o servidor resolve pela fila da rodada (evita travar
        // no 1º prêmio quando a tela está com valor antigo)
        premio: (() => {
          const v = $('gPremio').value.trim();
          return (!v || v === premioSugerido.trim()) ? null : v;
        })(),
        premio_sobressalente: continuar ? ($('gSobressalente').value.trim() || null) : null,
        observacoes: $('gObs').value.trim() || null,
      }),
    });
    $('modalGanhador').close();

    if (r.houve_empate) {
      $('sorteioEmpatados').textContent =
        `${r.total_empatados} pessoas bateram BINGO na ${r.numero_rodada}ª rodada. ` +
        'Embaralhando os nomes...';
      $('modalSorteio').showModal();
      animarSorteio(
        ganhadores.map((g) => g.nome),
        `${r.ganhador.nome} - cartela ${r.ganhador.numero_cartela}`
      );
    } else if (r.rodada_continua) {
      avisar(`Ganhador ${r.ganhador.nome} registrado - a rodada CONTINUA com os mesmos números!`);
    } else {
      avisar(`Rodada ${r.rodada_encerrada}ª encerrada. Ganhador ${r.ganhador.nome} registrado!`);
    }
    await carregar();
    if (r.rodada_continua) $('entradaNumero').focus();
  } catch (e) { mostrarErro('Não foi possível concluir', e.message); }
}

$('btnSalvarContinuar').addEventListener('click', () => salvarGanhadores(true));
$('btnSalvarEncerrar').addEventListener('click', () => salvarGanhadores(false));

carregar().catch(() => mostrarErro('Sem conexão com o servidor', 'Verifique se a janela preta do sistema continua aberta e tente novamente.'));
setInterval(() => carregar().catch(() => {}), 5000);
