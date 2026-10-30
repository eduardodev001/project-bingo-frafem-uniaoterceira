/**
 * Planejamento do evento em dois passos: criar o evento (apenas o nome) e
 * montar a sequência de rodadas, intercalando comuns e extras, cada uma
 * com nome, cor e seu próprio conjunto de prêmios.
 */
const $ = (id) => document.getElementById(id);

function avisar(msg, tipo = 'ok') {
  const el = $('aviso');
  el.textContent = msg;
  el.className = `aviso mostrar ${tipo}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('mostrar'), 5000);
}

async function api(url, opcoes = {}) {
  const r = await fetch(url, { headers: { 'Content-Type': 'application/json' }, ...opcoes });
  const dados = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(dados.erro || 'Erro inesperado.');
  return dados;
}

function corClara(hex) {
  const n = parseInt((hex || '#ffffff').slice(1), 16);
  return (0.299 * ((n >> 16) & 255) + 0.587 * ((n >> 8) & 255) + 0.114 * (n & 255)) > 165;
}

let eventoAtual = null;

function criarCartaoRodada(dados = {}) {
  const tipo = dados.tipo === 'extra' ? 'extra' : 'comum';
  const realizada = dados.status === 'realizada';
  const card = document.createElement('div');
  card.className = `rodada-card${realizada ? ' realizada' : ''}`;
  card.dataset.tipo = tipo;
  if (dados.id) card.dataset.id = dados.id;
  if (realizada) card.dataset.realizada = '1';

  card.innerHTML = `
    <div class="cab-rodada">
      <span class="num-ordem"></span>
      <span class="tag-tipo ${tipo}">${tipo === 'extra' ? '★ Extra' : 'Comum'}</span>
      <input type="text" class="nome-rodada" placeholder="${
        tipo === 'extra' ? 'Nome da cartela (ex.: Rosa, Azul...)' : 'Nome da cartela (ex.: Branca, Comum...)'
      }" style="flex:1 1 240px">
      <input type="color" class="cor-rodada-input" title="Cor desta cartela no telão">
      ${realizada ? '<span class="selo aberta">✔ Já realizada</span>' : `
        <button type="button" class="btn-neutro mini mover" data-dir="-1" title="Subir">↑</button>
        <button type="button" class="btn-neutro mini mover" data-dir="1" title="Descer">↓</button>
        <button type="button" class="btn-neutro mini add-premio">＋ prêmio</button>
        <button type="button" class="btn-perigo mini rem-rodada" title="Remover rodada">✕</button>`}
    </div>
    <div class="premios-lista"></div>`;

  const inNome = card.querySelector('.nome-rodada');
  const inCor = card.querySelector('.cor-rodada-input');
  inNome.value = dados.nome || '';
  inCor.value = dados.cor || (tipo === 'extra' ? '#e0509a' : '#1b4d3e');
  if (realizada) { inNome.disabled = true; inCor.disabled = true; }

  const pintar = () => {
    card.style.setProperty('--cor-rodada', inCor.value);
    card.querySelector('.num-ordem').style.color = corClara(inCor.value) ? '#333' : '#fff';
  };
  inCor.addEventListener('input', pintar);
  pintar();

  const lista = card.querySelector('.premios-lista');
  const premios = dados.premios && dados.premios.length ? dados.premios : [{ descricao: '' }];
  premios.forEach((p) => addPremio(lista, p.descricao ?? p, p.entregue));
  if (!realizada) {
    card.querySelector('.add-premio').addEventListener('click', () => {
      addPremio(lista, '', false);
      renumerarPremios(card);
    });
    card.querySelector('.rem-rodada').addEventListener('click', () => {
      card.remove();
      renumerarSequencia();
    });
    card.querySelectorAll('.mover').forEach((b) => {
      b.addEventListener('click', () => mover(card, parseInt(b.dataset.dir, 10)));
    });
  }
  renumerarPremios(card);
  return card;
}

function addPremio(lista, valor = '', entregue = false) {
  const div = document.createElement('div');
  div.className = 'premio-item';
  div.innerHTML = `
    <span class="pos"></span>
    <input type="text" placeholder="Prêmio (ex.: cesta básica, R$ 200, ventilador...)">
    ${entregue ? '<span class="entregue">✔ Entregue</span>'
               : '<button type="button" class="btn-neutro mini rem-premio">✕</button>'}`;
  const input = div.querySelector('input');
  input.value = valor || '';
  if (entregue) { input.disabled = true; input.title = 'Prêmio já entregue'; }
  const rem = div.querySelector('.rem-premio');
  if (rem) rem.addEventListener('click', () => {
    const card = div.closest('.rodada-card');
    div.remove();
    renumerarPremios(card);
  });
  lista.appendChild(div);
}

function renumerarPremios(card) {
  [...card.querySelectorAll('.premio-item')].forEach((d, i) => {
    d.querySelector('.pos').textContent = `${i + 1}º`;
  });
}

function mover(card, dir) {
  const pai = card.parentElement;
  const itens = [...pai.children];
  const i = itens.indexOf(card);
  const j = i + dir;
  if (j < 0 || j >= itens.length) return;
  if (dir === -1) pai.insertBefore(card, itens[j]);
  else pai.insertBefore(itens[j], card);
  renumerarSequencia();
}

function renumerarSequencia() {
  const cards = [...$('listaSequencia').children];
  cards.forEach((c, i) => { c.querySelector('.num-ordem').textContent = i + 1; });
  $('vazioSeq').hidden = cards.length > 0;
  const pendentes = cards.filter((c) => !c.dataset.realizada).length;
  const premios = cards.reduce((n, c) => n + c.querySelectorAll('.premio-item').length, 0);
  $('resumoSeq').textContent = `${cards.length} rodada(s) · ${premios} prêmio(s) · ${pendentes} pendente(s)`;
}

$('btnAddComum').addEventListener('click', () => {
  $('listaSequencia').appendChild(criarCartaoRodada({ tipo: 'comum' }));
  renumerarSequencia();
});
$('btnAddExtra').addEventListener('click', () => {
  $('listaSequencia').appendChild(criarCartaoRodada({ tipo: 'extra' }));
  renumerarSequencia();
});

$('btnSalvarSeq').addEventListener('click', async () => {
  try {
    const rodadas = [...$('listaSequencia').children].map((c) => ({
      id: c.dataset.id ? parseInt(c.dataset.id, 10) : null,
      tipo: c.dataset.tipo,
      nome: c.querySelector('.nome-rodada').value.trim(),
      cor: c.querySelector('.cor-rodada-input').value,
      premios: [...c.querySelectorAll('.premio-item input')]
        .map((i) => i.value.trim()).filter(Boolean),
    }));
    const semPremio = rodadas.find((r) => !c_realizada(r) && r.premios.length === 0);
    if (semPremio) {
      return avisar('Toda rodada precisa de pelo menos 1 prêmio. Preencha ou remova a rodada vazia.', 'erro');
    }
    await api('/api/planejamento', { method: 'PUT', body: JSON.stringify({ rodadas }) });
    avisar('Sequência salva! O operador já pode iniciar as rodadas na ordem definida.');
    carregar();
  } catch (e) { avisar(e.message, 'erro'); }
});
function c_realizada(r) {
  const el = [...$('listaSequencia').children].find((c) => parseInt(c.dataset.id, 10) === r.id);
  return el?.dataset.realizada === '1';
}

$('btnCriarEvento').addEventListener('click', async () => {
  try {
    await api('/api/eventos', {
      method: 'POST',
      body: JSON.stringify({ nome: $('nomeEventoNovo').value, qtde_rodadas: 1, premios: [] }),
    });
    avisar('Evento criado! Agora monte a sequência de rodadas abaixo.');
    carregar();
  } catch (e) { avisar(e.message, 'erro'); }
});

$('btnSalvarNome').addEventListener('click', async () => {
  try {
    await api('/api/eventos/atual', {
      method: 'PUT',
      body: JSON.stringify({ nome: $('nomeEventoEdit').value, qtde_rodadas: 1 }),
    });
    avisar('Nome do evento atualizado.');
    carregar();
  } catch (e) { avisar(e.message, 'erro'); }
});

$('btnConcluirEvento').addEventListener('click', () => {
  const cards = [...$('listaSequencia').children];
  const feitas = cards.filter((c) => c.dataset.realizada).length;
  $('resumoConcluir').textContent =
    `"${eventoAtual.nome}" - ${feitas} de ${cards.length} rodadas realizadas.`;
  $('modalConcluir').showModal();
});
$('btnCancelarConcluir').addEventListener('click', () => $('modalConcluir').close());
$('btnConfirmarConcluir').addEventListener('click', async () => {
  try {
    await api('/api/eventos/atual/concluir', { method: 'POST' });
    $('modalConcluir').close();
    avisar('Evento concluído! Obrigado e até o próximo bingo. 🎉');
    carregar();
  } catch (e) {
    $('modalConcluir').close();
    avisar(e.message, 'erro');
  }
});

async function carregar() {
  const dados = await api('/api/planejamento');
  eventoAtual = dados.evento;

  if (!eventoAtual) {
    $('cartaoCriar').hidden = false;
    $('cartaoEvento').hidden = true;
    $('cartaoSequencia').hidden = true;
    return;
  }
  $('cartaoCriar').hidden = true;
  $('cartaoEvento').hidden = false;
  $('cartaoSequencia').hidden = false;
  $('tituloEvento').textContent = eventoAtual.nome;
  $('nomeEventoEdit').value = eventoAtual.nome;

  const lista = $('listaSequencia');
  lista.innerHTML = '';
  (dados.rodadas || []).forEach((r) => lista.appendChild(criarCartaoRodada(r)));
  renumerarSequencia();

  // Andamento visual
  const and = $('andamentoRodadas');
  and.innerHTML = '';
  (dados.rodadas || []).forEach((r, i) => {
    const b = document.createElement('span');
    b.className = `bolinha-and ${r.status === 'realizada' ? '' : 'pendente'}`;
    if (r.status === 'realizada') b.style.background = r.cor || '#888';
    b.textContent = i + 1;
    b.title = `${r.nome || (r.tipo === 'extra' ? 'Extra' : 'Comum')} - ${
      r.status === 'realizada' ? 'realizada' : 'pendente'}`;
    and.appendChild(b);
  });
  const feitas = (dados.rodadas || []).filter((r) => r.status === 'realizada').length;
  $('resumoAndamento').textContent =
    `${feitas} de ${(dados.rodadas || []).length} rodadas realizadas.`;
}

carregar().catch(() => avisar('Não foi possível conectar ao servidor.', 'erro'));
