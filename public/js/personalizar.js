/**
 * Identidade visual do telão: textos, cores, tipo de bingo, banner do
 * evento e logos dos patrocinadores.
 */
const $ = (id) => document.getElementById(id);

function avisar(msg, tipo = 'ok') {
  const el = $('aviso');
  el.textContent = msg;
  el.className = `aviso mostrar ${tipo}`;
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.remove('mostrar'), 4000);
}

function atualizarPrevia() {
  const previa = $('previa');
  previa.style.setProperty('--previa-fundo', $('corPrimaria').value);
  previa.style.setProperty('--previa-destaque', $('corDestaque').value);
  $('previaNome').textContent = $('nomeEvento').value || 'Bingo Comunitário';
  $('previaSub').textContent = $('subtitulo').value || 'Em prol da nossa comunidade';
}

async function carregar() {
  const r = await fetch('/api/config');
  const c = await r.json();
  $('nomeEvento').value = c.nome_evento;
  $('subtitulo').value = c.subtitulo;
  $('mensagemRodape').value = c.mensagem_rodape;
  $('corPrimaria').value = c.cor_primaria;
  $('corDestaque').value = c.cor_destaque;
  $('maxNumero').value = c.max_numero;
  $('corBolaB').value = c.cor_bola_b || '#7d4bc0';
  $('corBolaI').value = c.cor_bola_i || '#d03b2f';
  $('corBolaN').value = c.cor_bola_n || '#f4f4f0';
  $('corBolaG').value = c.cor_bola_g || '#e0762b';
  $('corBolaO').value = c.cor_bola_o || '#8a5a34';

  if (c.banner_url) {
    $('bannerAtual').src = c.banner_url;
    $('bannerAtual').hidden = false;
    $('btnRemoverBanner').hidden = false;
  } else {
    $('bannerAtual').hidden = true;
    $('btnRemoverBanner').hidden = true;
  }
  atualizarPrevia();
}

$('btnSalvar').addEventListener('click', async () => {
  try {
    const r = await fetch('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nome_evento: $('nomeEvento').value.trim(),
        subtitulo: $('subtitulo').value.trim(),
        mensagem_rodape: $('mensagemRodape').value.trim(),
        cor_primaria: $('corPrimaria').value,
        cor_destaque: $('corDestaque').value,
        max_numero: parseInt($('maxNumero').value, 10),
        cor_bola_b: $('corBolaB').value,
        cor_bola_i: $('corBolaI').value,
        cor_bola_n: $('corBolaN').value,
        cor_bola_g: $('corBolaG').value,
        cor_bola_o: $('corBolaO').value,
      }),
    });
    if (!r.ok) throw new Error();
    avisar('Personalização salva! O telão atualiza sozinho em instantes.');
  } catch {
    avisar('Não foi possível salvar. Verifique o servidor e tente novamente.', 'erro');
  }
});

$('arquivoBanner').addEventListener('change', async () => {
  const arquivo = $('arquivoBanner').files[0];
  if (!arquivo) return;
  const form = new FormData();
  form.append('banner', arquivo);
  try {
    const r = await fetch('/api/config/banner', { method: 'POST', body: form });
    if (!r.ok) throw new Error();
    avisar('Banner enviado com sucesso!');
    $('arquivoBanner').value = '';
    carregar();
  } catch {
    avisar('Não foi possível enviar o banner. Use PNG, JPG, WEBP ou GIF até 8 MB.', 'erro');
  }
});

$('btnRemoverBanner').addEventListener('click', async () => {
  try {
    await fetch('/api/config/banner', { method: 'DELETE' });
    avisar('Banner removido.');
    carregar();
  } catch {
    avisar('Não foi possível remover o banner.', 'erro');
  }
});

['corPrimaria', 'corDestaque', 'nomeEvento', 'subtitulo'].forEach((id) =>
  $(id).addEventListener('input', atualizarPrevia)
);

carregar().catch(() => avisar('Não foi possível carregar as configurações.', 'erro'));

// Patrocinadores (logos do carrossel do telão)
async function carregarPatrocinadores() {
  const r = await fetch('/api/patrocinadores');
  const lista = await r.json();
  const caixa = $('listaPatro');
  caixa.innerHTML = '';
  if (!lista.length) {
    caixa.innerHTML = '<p style="font-size:.88rem;color:var(--tinta-suave)">Nenhuma logo cadastrada ainda.</p>';
    return;
  }
  lista.forEach((p) => {
    const card = document.createElement('div');
    card.style.cssText =
      'border:1px solid var(--borda);border-radius:12px;padding:10px;width:190px;' +
      'display:flex;flex-direction:column;gap:8px;background:#fff;' +
      (p.ativo ? '' : 'opacity:.5');
    card.innerHTML = `
      <img src="${p.logo_url}" alt="${p.nome || 'Logo'}"
           style="height:70px;object-fit:contain;background:#fafafa;border-radius:8px;padding:4px">
      <input type="text" class="patro-nome" data-id="${p.id}" value="${(p.nome || '').replace(/"/g, '&quot;')}"
             placeholder="Nome do patrocinador"
             style="font-size:.82rem;padding:5px 7px;border:1px solid var(--borda);border-radius:7px;width:100%">
      <div style="display:flex;gap:6px">
        <button type="button" class="btn-neutro patro-toggle" data-id="${p.id}" data-ativo="${p.ativo}"
                style="flex:1;padding:6px 8px;font-size:.8rem">
          ${p.ativo ? '⏸ Desativar' : '▶ Ativar'}
        </button>
        <button type="button" class="btn-perigo patro-del" data-id="${p.id}"
                style="padding:6px 10px;font-size:.8rem">✕</button>
      </div>`;
    caixa.appendChild(card);
  });

  caixa.querySelectorAll('.patro-nome').forEach((inp) => {
    inp.addEventListener('change', async () => {
      await fetch(`/api/patrocinadores/${inp.dataset.id}/nome`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ nome: inp.value }),
      });
      avisar('Nome do patrocinador atualizado.');
    });
  });
  caixa.querySelectorAll('.patro-toggle').forEach((b) => {
    b.addEventListener('click', async () => {
      await fetch(`/api/patrocinadores/${b.dataset.id}/ativo`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ativo: b.dataset.ativo !== 'true' }),
      });
      avisar('Logo atualizada. O telão reflete em instantes.');
      carregarPatrocinadores();
    });
  });
  caixa.querySelectorAll('.patro-del').forEach((b) => {
    b.addEventListener('click', async () => {
      if (!confirm('Excluir esta logo do carrossel?')) return;
      await fetch(`/api/patrocinadores/${b.dataset.id}`, { method: 'DELETE' });
      avisar('Logo excluída.');
      carregarPatrocinadores();
    });
  });
}

$('btnAddPatro').addEventListener('click', async () => {
  const arquivos = [...$('patroArquivo').files];
  if (arquivos.length === 0) {
    return avisar('Escolha um ou mais arquivos de logo antes de adicionar.', 'erro');
  }
  const form = new FormData();
  arquivos.forEach((a) => form.append('logo', a));
  form.append('nome', $('patroNome').value.trim());
  const btn = $('btnAddPatro');
  btn.disabled = true;
  btn.textContent = `Enviando ${arquivos.length} logo(s)...`;
  try {
    const r = await fetch('/api/patrocinadores', { method: 'POST', body: form });
    if (!r.ok) throw new Error();
    const d = await r.json();
    $('patroNome').value = '';
    $('patroArquivo').value = '';
    avisar(`${d.criados} logo(s) adicionada(s)! Já entram no carrossel do telão.`);
    carregarPatrocinadores();
  } catch {
    avisar('Não foi possível enviar. Use PNG, JPG, WEBP, GIF ou SVG, até 8 MB cada.', 'erro');
  } finally {
    btn.disabled = false;
    btn.textContent = '＋ Adicionar logo(s)';
  }
});

carregarPatrocinadores().catch(() => {});
