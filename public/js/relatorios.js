/**
 * Relatório de ganhadores: quem levou cada prêmio, os números da rodada
 * e o controle de entrega.
 */
const $ = (id) => document.getElementById(id);

function avisar(msg, tipo = 'ok') {
  const el = $('aviso');
  el.textContent = msg;
  el.className = `aviso mostrar ${tipo}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('mostrar'), 4000);
}

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

async function carregar() {
  const r = await fetch('/api/relatorios/ganhadores');
  const lista = await r.json();

  const corpo = $('corpoTabela');
  corpo.innerHTML = '';
  $('vazio').hidden = lista.length > 0;

  lista.forEach((g) => {
    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${esc(g.evento) || '-'}</td>
      <td>
        ${g.tipo === 'extra'
          ? `<strong>Extra ${g.numero_rodada}</strong><br>
             <span class="selo" style="background:${esc(g.cor_cartela) || '#888'};color:#fff">
               Cartela ${esc(g.nome_cor) || ''}
             </span>`
          : `<strong>${g.numero_rodada}ª</strong>`}
      </td>
      <td>
        ${esc(g.nome)}${g.telefone ? `<br><small>${esc(g.telefone)}</small>` : ''}
        ${g.houve_empate
          ? `<br><span class="selo ${g.sorteado ? 'aberta' : 'pendente'}">
               ${g.sorteado ? '🎲 Venceu o sorteio' : 'Empate - não sorteado'}
             </span>`
          : ''}
      </td>
      <td>${esc(g.documento) || '-'}</td>
      <td>${esc(g.numero_cartela)}</td>
      <td>${g.sorteado ? (esc(g.premio) || '-') : '-'}</td>
      <td>${new Date(g.registrado_em).toLocaleString('pt-BR')}</td>
      <td class="numeros-rodada">${g.qtde_numeros} bolas: ${esc(g.numeros_da_rodada) || '-'}</td>
      <td>
        ${g.sorteado ? `
        <label style="display:flex;align-items:center;gap:6px;cursor:pointer">
          <input type="checkbox" data-id="${g.id}" ${g.premio_entregue ? 'checked' : ''}>
          <span class="selo ${g.premio_entregue ? 'aberta' : 'pendente'}">
            ${g.premio_entregue ? 'Entregue' : 'Pendente'}
          </span>
        </label>` : '-'}
      </td>`;
    corpo.appendChild(tr);
  });

  corpo.querySelectorAll('input[type="checkbox"]').forEach((chk) => {
    chk.addEventListener('change', async () => {
      try {
        await fetch(`/api/ganhadores/${chk.dataset.id}/entrega`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ entregue: chk.checked }),
        });
        avisar('Situação de entrega atualizada.');
        carregar();
      } catch {
        avisar('Não foi possível atualizar. Tente novamente.', 'erro');
      }
    });
  });
}

carregar().catch(() => avisar('Não foi possível carregar os relatórios.', 'erro'));
