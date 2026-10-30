/**
 * Bingo Comunitário: servidor Express + PostgreSQL.
 * Serve quatro telas (telão, operador, relatórios, personalizar) e a API
 * que o telão consulta a cada 2 segundos para se manter sincronizado.
 */
require('dotenv').config();
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const multer = require('multer');
const { Pool } = require('pg');

const app = express();
const PORT = process.env.PORT || 3000;

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'bingo_comunitario',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
});

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Upload de banner (imagem enviada pelo cliente)
const pastaUploads = path.join(__dirname, 'public', 'uploads');
if (!fs.existsSync(pastaUploads)) fs.mkdirSync(pastaUploads, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, pastaUploads),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `banner-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8 MB
  fileFilter: (_req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Envie uma imagem PNG, JPG, WEBP ou GIF.'), ok);
  },
});

//  CONFIGURAÇÕES (personalização do telão)
app.get('/api/config', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM configuracoes WHERE id = 1');
    res.json(rows[0]);
  } catch (e) { erro(res, e); }
});

app.put('/api/config', async (req, res) => {
  try {
    const { nome_evento, subtitulo, mensagem_rodape, cor_primaria, cor_destaque, max_numero,
            cor_bola_b, cor_bola_i, cor_bola_n, cor_bola_g, cor_bola_o } = req.body;
    const { rows } = await pool.query(
      `UPDATE configuracoes SET
         nome_evento     = COALESCE($1, nome_evento),
         subtitulo       = COALESCE($2, subtitulo),
         mensagem_rodape = COALESCE($3, mensagem_rodape),
         cor_primaria    = COALESCE($4, cor_primaria),
         cor_destaque    = COALESCE($5, cor_destaque),
         max_numero      = COALESCE($6, max_numero),
         cor_bola_b      = COALESCE($7, cor_bola_b),
         cor_bola_i      = COALESCE($8, cor_bola_i),
         cor_bola_n      = COALESCE($9, cor_bola_n),
         cor_bola_g      = COALESCE($10, cor_bola_g),
         cor_bola_o      = COALESCE($11, cor_bola_o),
         atualizado_em   = NOW()
       WHERE id = 1 RETURNING *`,
      [nome_evento, subtitulo, mensagem_rodape, cor_primaria, cor_destaque, max_numero,
       cor_bola_b, cor_bola_i, cor_bola_n, cor_bola_g, cor_bola_o]
    );
    res.json(rows[0]);
  } catch (e) { erro(res, e); }
});

app.post('/api/config/banner', upload.single('banner'), async (req, res) => {
  try {
    const url = `/uploads/${req.file.filename}`;
    await pool.query('UPDATE configuracoes SET banner_url = $1, atualizado_em = NOW() WHERE id = 1', [url]);
    res.json({ banner_url: url });
  } catch (e) { erro(res, e); }
});

app.delete('/api/config/banner', async (_req, res) => {
  try {
    await pool.query('UPDATE configuracoes SET banner_url = NULL, atualizado_em = NOW() WHERE id = 1');
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

//  EVENTOS E PRÊMIOS (planejamento do bingo do dia)
async function eventoAberto(client = pool) {
  return (await client.query(
    "SELECT * FROM eventos WHERE status = 'aberto' ORDER BY id DESC LIMIT 1"
  )).rows[0] || null;
}

/**
 * Fila de prêmios do modelo legado (eventos criados antes da sequência
 * planejada). A fila anda DENTRO da rodada: a rodada seguinte sempre
 * recomeça no primeiro prêmio dela, nunca consome os das próximas.
 */
async function premioComumDaRodada(client, eventoId, numeroRodada, posicao) {
  return (await client.query(
    `SELECT descricao FROM premios_evento
      WHERE evento_id = $1 AND ordem_rodada = $2 AND ordem_premio = $3`,
    [eventoId, numeroRodada, posicao]
  )).rows[0]?.descricao || null;
}

async function proximoPremioComum(client, eventoId) {
  const feitas = (await client.query(
    "SELECT COUNT(*)::int AS n FROM rodadas WHERE evento_id = $1 AND tipo = 'comum'",
    [eventoId]
  )).rows[0].n;
  const premio = await premioComumDaRodada(client, eventoId, feitas + 1, 1);
  return { entregues: feitas, premio, proxima_rodada: feitas + 1 };
}

app.get('/api/eventos/atual', async (_req, res) => {
  try {
    const evento = await eventoAberto();
    if (!evento) return res.json({ evento: null });
    const premios = (await pool.query(
      `SELECT ordem_rodada, ordem_premio, descricao FROM premios_evento
        WHERE evento_id = $1 ORDER BY ordem_rodada, ordem_premio`,
      [evento.id]
    )).rows;
    const rodadas = (await pool.query(
      `SELECT r.numero_rodada, r.status, r.premio, r.tipo, r.nome_cor, r.cor_cartela,
              r.ordem_rodada_cor,
              (SELECT COUNT(*)::int FROM ganhadores g2 WHERE g2.rodada_id = r.id AND g2.sorteado)
                AS premios_entregues,
              (SELECT STRING_AGG(g3.nome, ', ' ORDER BY g3.id)
                 FROM ganhadores g3 WHERE g3.rodada_id = r.id AND g3.sorteado) AS ganhador
         FROM rodadas r
        WHERE r.evento_id = $1 ORDER BY r.iniciada_em`,
      [evento.id]
    )).rows;
    const extras = (await pool.query(
      'SELECT * FROM rodadas_extras WHERE evento_id = $1 ORDER BY nome_cor, ordem_rodada, ordem_premio',
      [evento.id]
    )).rows;
    const premiosComunsEntregues = (await proximoPremioComum(pool, evento.id)).entregues;
    const config_rodadas = (await pool.query(
      'SELECT ordem_rodada, nome, cor FROM rodadas_config WHERE evento_id = $1 ORDER BY ordem_rodada',
      [evento.id]
    )).rows;
    res.json({ evento, premios, rodadas, extras, config_rodadas,
               premios_comuns_entregues: premiosComunsEntregues });
  } catch (e) { erro(res, e); }
});

app.post('/api/eventos', async (req, res) => {
  const client = await pool.connect();
  try {
    const { nome, qtde_rodadas, premios } = req.body;
    if (!nome || !nome.trim()) return res.status(400).json({ erro: 'Informe o nome do evento.' });
    const qtde = parseInt(qtde_rodadas, 10);
    if (!qtde || qtde < 1 || qtde > 100) {
      return res.status(400).json({ erro: 'A quantidade de rodadas deve estar entre 1 e 100.' });
    }
    if (await eventoAberto()) {
      return res.status(409).json({ erro: 'Já existe um evento aberto. Conclua-o antes de criar outro.' });
    }
    await client.query('BEGIN');
    const evento = (await client.query(
      'INSERT INTO eventos (nome, qtde_rodadas_planejadas) VALUES ($1, $2) RETURNING *',
      [nome.trim(), qtde]
    )).rows[0];
    // identidades[i] = { nome, cor } de cada rodada comum
    const identidades = Array.isArray(req.body.identidades) ? req.body.identidades : [];
    for (let i = 1; i <= qtde; i++) {
      const id = identidades[i - 1] || {};
      await client.query(
        `INSERT INTO rodadas_config (evento_id, ordem_rodada, nome, cor)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (evento_id, ordem_rodada)
         DO UPDATE SET nome = EXCLUDED.nome, cor = EXCLUDED.cor`,
        [evento.id, i, (id.nome || '').trim() || null, id.cor || null]
      );
    }
    // premios = matriz: premios[rodada-1] = ["prêmio 1", "prêmio 2", ...]
    for (let i = 1; i <= qtde; i++) {
      const daRodada = Array.isArray(premios?.[i - 1]) ? premios[i - 1] : [premios?.[i - 1]];
      let pos = 0;
      for (const p of daRodada) {
        const desc = String(p || '').trim();
        if (!desc) continue;
        pos++;
        await client.query(
          `INSERT INTO premios_evento (evento_id, ordem_rodada, ordem_premio, descricao)
           VALUES ($1, $2, $3, $4)`,
          [evento.id, i, pos, desc]
        );
      }
    }
    await client.query('COMMIT');
    res.status(201).json(evento);
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally { client.release(); }
});

app.put('/api/eventos/atual', async (req, res) => {
  const client = await pool.connect();
  try {
    const evento = await eventoAberto();
    if (!evento) return res.status(404).json({ erro: 'Nenhum evento aberto para editar.' });

    const { nome, qtde_rodadas, premios } = req.body;
    const qtde = parseInt(qtde_rodadas, 10);
    if (!qtde || qtde < 1 || qtde > 100) {
      return res.status(400).json({ erro: 'A quantidade de rodadas deve estar entre 1 e 100.' });
    }
    const realizadas = (await pool.query(
      "SELECT COUNT(*)::int AS n FROM rodadas WHERE evento_id = $1 AND tipo = 'comum'", [evento.id]
    )).rows[0].n;
    if (qtde < realizadas) {
      return res.status(400).json({
        erro: `Este evento já teve ${realizadas} rodada(s) comum(ns); a quantidade não pode ser menor que isso.`,
      });
    }
    await client.query('BEGIN');
    await client.query(
      'UPDATE eventos SET nome = COALESCE($1, nome), qtde_rodadas_planejadas = $2 WHERE id = $3',
      [nome?.trim() || null, qtde, evento.id]
    );
    const identidades = Array.isArray(req.body.identidades) ? req.body.identidades : [];
    for (let i = 1; i <= qtde; i++) {
      const idr = identidades[i - 1] || {};
      await client.query(
        `INSERT INTO rodadas_config (evento_id, ordem_rodada, nome, cor)
         VALUES ($1, $2, $3, $4)
         ON CONFLICT (evento_id, ordem_rodada)
         DO UPDATE SET nome = EXCLUDED.nome, cor = EXCLUDED.cor`,
        [evento.id, i, (idr.nome || '').trim() || null, idr.cor || null]
      );
    }
    await client.query('DELETE FROM premios_evento WHERE evento_id = $1', [evento.id]);
    for (let i = 1; i <= qtde; i++) {
      const daRodada = Array.isArray(premios?.[i - 1]) ? premios[i - 1] : [premios?.[i - 1]];
      let pos = 0;
      for (const p of daRodada) {
        const desc = String(p || '').trim();
        if (!desc) continue;
        pos++;
        await client.query(
          `INSERT INTO premios_evento (evento_id, ordem_rodada, ordem_premio, descricao)
           VALUES ($1, $2, $3, $4)`,
          [evento.id, i, pos, desc]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true });
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally { client.release(); }
});

app.post('/api/eventos/atual/concluir', async (_req, res) => {
  try {
    const evento = await eventoAberto();
    if (!evento) return res.status(404).json({ erro: 'Nenhum evento aberto para concluir.' });
    const rodadaAberta = (await pool.query(
      "SELECT id FROM rodadas WHERE status = 'aberta' AND evento_id = $1", [evento.id]
    )).rowCount > 0;
    if (rodadaAberta) {
      return res.status(409).json({ erro: 'Há uma rodada em andamento. Encerre-a (BINGO) antes de concluir o evento.' });
    }
    const { rows } = await pool.query(
      "UPDATE eventos SET status = 'concluido', concluido_em = NOW() WHERE id = $1 RETURNING *",
      [evento.id]
    );
    res.json(rows[0]);
  } catch (e) { erro(res, e); }
});

//  PATROCINADORES (logos no carrossel contínuo do telão)
const uploadLogo = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, pastaUploads),
    filename: (_req, file, cb) => {
      const ext = path.extname(file.originalname).toLowerCase();
      cb(null, `logo-${Date.now()}${ext}`);
    },
  }),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = ['.png', '.jpg', '.jpeg', '.webp', '.gif', '.svg'].includes(
      path.extname(file.originalname).toLowerCase()
    );
    cb(ok ? null : new Error('Envie uma imagem PNG, JPG, WEBP, GIF ou SVG.'), ok);
  },
});

app.get('/api/patrocinadores', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM patrocinadores ORDER BY id');
    res.json(rows);
  } catch (e) { erro(res, e); }
});

// Aceita 1 ou VÁRIAS logos de uma vez. Quando vêm várias, o nome de cada
// patrocinador é deduzido do nome do arquivo (logo-mercado-do-joao.png ->
// "Mercado Do Joao"), e pode ser ajustado depois na própria tela.
app.post('/api/patrocinadores', uploadLogo.array('logo', 40), async (req, res) => {
  try {
    const arquivos = req.files || [];
    if (arquivos.length === 0) return res.status(400).json({ erro: 'Nenhuma logo enviada.' });

    const nomeInformado = (req.body.nome || '').trim();
    const criados = [];
    for (const arq of arquivos) {
      let nome = arquivos.length === 1 ? nomeInformado : '';
      if (!nome) {
        nome = path.parse(arq.originalname).name
          .replace(/^logo[-_\s]*/i, '')
          .replace(/[-_]+/g, ' ')
          .replace(/\s+/g, ' ')
          .trim()
          .replace(/\b\w/g, (c) => c.toUpperCase());
      }
      const { rows } = await pool.query(
        'INSERT INTO patrocinadores (nome, logo_url) VALUES ($1, $2) RETURNING *',
        [nome || null, `/uploads/${arq.filename}`]
      );
      criados.push(rows[0]);
    }
    res.status(201).json({ criados: criados.length, patrocinadores: criados });
  } catch (e) { erro(res, e); }
});

app.patch('/api/patrocinadores/:id/nome', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE patrocinadores SET nome = $1 WHERE id = $2 RETURNING *',
      [(req.body.nome || '').trim() || null, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { erro(res, e); }
});

app.patch('/api/patrocinadores/:id/ativo', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE patrocinadores SET ativo = $1 WHERE id = $2 RETURNING *',
      [!!req.body.ativo, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { erro(res, e); }
});

app.delete('/api/patrocinadores/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'DELETE FROM patrocinadores WHERE id = $1 RETURNING logo_url',
      [req.params.id]
    );
    // Remove o arquivo da logo (melhor esforço)
    if (rows[0]?.logo_url) {
      const arq = path.join(__dirname, 'public', rows[0].logo_url.replace(/^\//, ''));
      fs.unlink(arq, () => {});
    }
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

//  ESTADO DO JOGO (o telão consulta esta rota a cada 2s)
app.get('/api/estado', async (_req, res) => {
  try {
    const config = (await pool.query('SELECT * FROM configuracoes WHERE id = 1')).rows[0];
    const evento = await eventoAberto();
    const rodada = (await pool.query(
      "SELECT * FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1"
    )).rows[0] || null;

    let numeros = [];
    if (rodada) {
      numeros = (await pool.query(
        'SELECT numero, sorteado_em FROM numeros_sorteados WHERE rodada_id = $1 ORDER BY sorteado_em',
        [rodada.id]
      )).rows;
    }

    const ultimoGanhador = (await pool.query(
      'SELECT * FROM vw_relatorio_ganhadores WHERE sorteado LIMIT 1'
    )).rows[0] || null;

    const ganhadoresRecentes = (await pool.query(
      `SELECT nome, numero_cartela, premio, numero_rodada, tipo, nome_cor, cor_cartela
         FROM vw_relatorio_ganhadores WHERE sorteado LIMIT 8`
    )).rows;

    // Nomes dos empatados da última rodada (para a animação de sorteio no telão)
    // Empatados = apenas os do MESMO lote de bingo (não a rodada inteira)
    let empatados = [];
    if (ultimoGanhador?.houve_empate) {
      empatados = (await pool.query(
        `SELECT nome, numero_cartela FROM ganhadores
          WHERE lote_empate = (SELECT lote_empate FROM ganhadores WHERE id = $1)
            AND lote_empate IS NOT NULL
          ORDER BY id`,
        [ultimoGanhador.id]
      )).rows;
    }

    // Prêmio em disputa e total, sempre do conjunto DESTA rodada
    if (rodada) {
      rodada.premios_entregues = (await pool.query(
        'SELECT COUNT(*)::int AS n FROM ganhadores WHERE rodada_id = $1 AND sorteado',
        [rodada.id]
      )).rows[0].n;
      if (rodada.planejada_id) {
        rodada.premio_em_disputa = (await pool.query(
          'SELECT descricao FROM premios_planejados WHERE rodada_id = $1 AND NOT entregue ORDER BY ordem LIMIT 1',
          [rodada.planejada_id]
        )).rows[0]?.descricao || null;
        rodada.total_premios_rodada = (await pool.query(
          'SELECT COUNT(*)::int AS n FROM premios_planejados WHERE rodada_id = $1',
          [rodada.planejada_id]
        )).rows[0].n;
      } else {
        rodada.premio_em_disputa = rodada.premios_entregues === 0 ? rodada.premio : null;
        rodada.total_premios_rodada = 1;
      }
    }

    let rodadasRealizadas = 0;
    let extras = [];
    let ultimaRodada = null;
    let proximoComum = null;
    if (evento) {
      proximoComum = await proximoPremioComum(pool, evento.id);
      rodadasRealizadas = (await pool.query(
        "SELECT COUNT(*)::int AS n FROM rodadas WHERE evento_id = $1 AND tipo = 'comum'",
        [evento.id]
      )).rows[0].n;
      extras = (await pool.query(
        'SELECT * FROM rodadas_extras WHERE evento_id = $1 ORDER BY id',
        [evento.id]
      )).rows;
      // Última rodada (aberta ou encerrada): o telão mantém a cor de fundo
      // dela até que outra rodada seja iniciada
      ultimaRodada = (await pool.query(
        'SELECT tipo, nome_cor, cor_cartela FROM rodadas WHERE evento_id = $1 ORDER BY iniciada_em DESC LIMIT 1',
        [evento.id]
      )).rows[0] || null;
    }

    res.json({
      config, evento, rodada, numeros,
      rodadas_realizadas: rodadasRealizadas,
      extras,
      extras_pendentes: extras.filter((e) => e.status === 'pendente'),
      ultima_rodada: ultimaRodada,
      // Sequência de rodadas ainda pendentes (para o seletor do operador)
      planejadas_pendentes: evento ? await (async () => {
        const rs = (await pool.query(
          "SELECT * FROM rodadas_planejadas WHERE evento_id = $1 AND status = 'pendente' ORDER BY ordem",
          [evento.id]
        )).rows;
        for (const r of rs) {
          const ps = (await pool.query(
            'SELECT descricao FROM premios_planejados WHERE rodada_id = $1 AND NOT entregue ORDER BY ordem',
            [r.id]
          )).rows;
          r.premios = ps.map((p) => p.descricao);
        }
        return rs;
      })() : [],
      disputa: disputaEmConferencia,
      proximo_premio_comum: proximoComum,
      config_rodadas: evento ? (await pool.query(
        'SELECT ordem_rodada, nome, cor FROM rodadas_config WHERE evento_id = $1 ORDER BY ordem_rodada',
        [evento.id]
      )).rows : [],
      patrocinadores: (await pool.query(
        'SELECT id, nome, logo_url FROM patrocinadores WHERE ativo ORDER BY id'
      )).rows,
      ultimo_ganhador: ultimoGanhador,
      ganhadores_recentes: ganhadoresRecentes,
      empatados,
    });
  } catch (e) { erro(res, e); }
});

//  DISPUTA EM CONFERÊNCIA (antes do sorteio)
//  O operador projeta no telão os nomes que vão disputar, para
//  cada pessoa conferir se está na lista e se o nome está certo.
//  Fica só em memória: é um estado efêmero do momento.
let disputaEmConferencia = null;

app.post('/api/disputa', async (req, res) => {
  try {
    const participantes = (Array.isArray(req.body.participantes) ? req.body.participantes : [])
      .map((p) => ({
        nome: String(p.nome || '').trim(),
        numero_cartela: String(p.numero_cartela || '').trim(),
      }))
      .filter((p) => p.nome);
    if (participantes.length === 0) {
      return res.status(400).json({ erro: 'Informe ao menos um nome para exibir no telão.' });
    }
    // A conferência é um estado de tela: se o banco oscilar, ela ainda
    // precisa aparecer no telão (é o que o público está esperando ver)
    let rodada = null;
    try {
      rodada = (await pool.query(
        "SELECT id, premio FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1"
      )).rows[0] || null;
    } catch { /* segue sem o prêmio do banco */ }
    disputaEmConferencia = {
      participantes,
      premio: (req.body.premio || '').trim() || rodada?.premio || null,
      rodada_id: rodada?.id || null,
      em: Date.now(),
    };
    res.status(201).json({ ok: true, total: participantes.length });
  } catch (e) { erro(res, e); }
});

app.delete('/api/disputa', (_req, res) => {
  disputaEmConferencia = null;
  res.json({ ok: true });
});

//  PLANEJAMENTO DO EVENTO (fila única de rodadas)
//  O evento é criado só com o nome; depois monta-se a sequência
//  de rodadas (comuns e extras intercaladas), cada uma com nome,
//  cor e seus próprios prêmios.

async function listarPlanejadas(eventoId) {
  const rodadas = (await pool.query(
    'SELECT * FROM rodadas_planejadas WHERE evento_id = $1 ORDER BY ordem',
    [eventoId]
  )).rows;
  for (const r of rodadas) {
    r.premios = (await pool.query(
      'SELECT id, ordem, descricao, entregue FROM premios_planejados WHERE rodada_id = $1 ORDER BY ordem',
      [r.id]
    )).rows;
  }
  return rodadas;
}

app.get('/api/planejamento', async (_req, res) => {
  try {
    const evento = await eventoAberto();
    if (!evento) return res.json({ evento: null, rodadas: [] });
    res.json({ evento, rodadas: await listarPlanejadas(evento.id) });
  } catch (e) { erro(res, e); }
});

app.put('/api/planejamento', async (req, res) => {
  const client = await pool.connect();
  try {
    const evento = await eventoAberto();
    if (!evento) return res.status(409).json({ erro: 'Nenhum evento aberto.' });
    const lista = Array.isArray(req.body.rodadas) ? req.body.rodadas : [];

    await client.query('BEGIN');
    // Rodadas já realizadas são preservadas; as pendentes são regravadas
    const realizadas = (await client.query(
      "SELECT id FROM rodadas_planejadas WHERE evento_id = $1 AND status = 'realizada'",
      [evento.id]
    )).rows.map((r) => r.id);

    await client.query(
      "DELETE FROM rodadas_planejadas WHERE evento_id = $1 AND status = 'pendente'",
      [evento.id]
    );

    let ordem = 0;
    for (const r of lista) {
      ordem++;
      if (r.id && realizadas.includes(r.id)) {
        // só atualiza ordem/nome/cor do que já rolou
        await client.query(
          'UPDATE rodadas_planejadas SET ordem = $1, nome = $2, cor = $3 WHERE id = $4',
          [ordem, (r.nome || '').trim() || null, r.cor || null, r.id]
        );
        continue;
      }
      const premios = (Array.isArray(r.premios) ? r.premios : [])
        .map((p) => String(p || '').trim()).filter(Boolean);
      if (premios.length === 0) continue; // rodada sem prêmio não entra
      const nova = (await client.query(
        `INSERT INTO rodadas_planejadas (evento_id, ordem, tipo, nome, cor)
         VALUES ($1, $2, $3, $4, $5) RETURNING id`,
        [evento.id, ordem, r.tipo === 'extra' ? 'extra' : 'comum',
         (r.nome || '').trim() || null, r.cor || null]
      )).rows[0];
      for (let i = 0; i < premios.length; i++) {
        await client.query(
          'INSERT INTO premios_planejados (rodada_id, ordem, descricao) VALUES ($1, $2, $3)',
          [nova.id, i + 1, premios[i]]
        );
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, rodadas: await listarPlanejadas(evento.id) });
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally { client.release(); }
});

//  RODADAS EXTRAS (cartelas coloridas com prêmio próprio)
app.get('/api/rodadas-extras', async (_req, res) => {
  try {
    const evento = await eventoAberto();
    if (!evento) return res.json([]);
    const { rows } = await pool.query(
      'SELECT * FROM rodadas_extras WHERE evento_id = $1 ORDER BY id',
      [evento.id]
    );
    res.json(rows);
  } catch (e) { erro(res, e); }
});

app.post('/api/rodadas-extras', async (req, res) => {
  const client = await pool.connect();
  try {
    const evento = await eventoAberto();
    if (!evento) return res.status(409).json({ erro: 'Crie o evento antes de cadastrar rodadas extras.' });
    const { nome_cor, cor_cartela } = req.body;
    if (!nome_cor?.trim() || !/^#[0-9a-fA-F]{6}$/.test(cor_cartela || '')) {
      return res.status(400).json({ erro: 'Informe o nome da cor (ex.: Azul) e escolha a cor da cartela.' });
    }
    // rodadas = [[premio1, premio2], [premio1], ...]  -> cada item é uma
    // RODADA da cartela, com seu próprio conjunto de prêmios.
    let rodadas = Array.isArray(req.body.rodadas) ? req.body.rodadas : null;
    if (!rodadas) {
      // Compatibilidade: premios[] soltos viram 1 rodada com esses prêmios
      const soltos = Array.isArray(req.body.premios) ? req.body.premios : [req.body.premio];
      rodadas = [soltos];
    }
    rodadas = rodadas
      .map((r) => (Array.isArray(r) ? r : [r]).map((p) => String(p || '').trim()).filter(Boolean))
      .filter((r) => r.length > 0);
    if (rodadas.length === 0) {
      return res.status(400).json({ erro: 'Adicione ao menos uma rodada com prêmio para esta cartela.' });
    }

    await client.query('BEGIN');
    // Continua a numeração de rodadas já cadastradas para esta cor
    const base = (await client.query(
      `SELECT COALESCE(MAX(ordem_rodada), 0) AS n FROM rodadas_extras
        WHERE evento_id = $1 AND nome_cor = $2 AND cor_cartela = $3`,
      [evento.id, nome_cor.trim(), cor_cartela]
    )).rows[0].n;

    let totalPremios = 0;
    for (let i = 0; i < rodadas.length; i++) {
      const ordemRodada = Number(base) + i + 1;
      for (let j = 0; j < rodadas[i].length; j++) {
        await client.query(
          `INSERT INTO rodadas_extras
             (evento_id, nome_cor, cor_cartela, premio, ordem_rodada, ordem_premio)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [evento.id, nome_cor.trim(), cor_cartela, rodadas[i][j], ordemRodada, j + 1]
        );
        totalPremios++;
      }
    }
    await client.query('COMMIT');
    res.status(201).json({ rodadas_criadas: rodadas.length, premios_criados: totalPremios });
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally { client.release(); }
});

app.put('/api/rodadas-extras/cartela', async (req, res) => {
  const client = await pool.connect();
  try {
    const evento = await eventoAberto();
    if (!evento) return res.status(409).json({ erro: 'Nenhum evento aberto.' });
    const { nome_cor_atual, cor_atual, nome_cor, cor_cartela, rodadas } = req.body;
    if (!nome_cor?.trim() || !/^#[0-9a-fA-F]{6}$/.test(cor_cartela || '')) {
      return res.status(400).json({ erro: 'Informe o nome da cor e escolha a cor da cartela.' });
    }
    const lista = (Array.isArray(rodadas) ? rodadas : [])
      .map((r) => (Array.isArray(r) ? r : []).map((p) => String(p || '').trim()).filter(Boolean))
      .filter((r) => r.length > 0);

    await client.query('BEGIN');
    // Renomeia/recolore tudo da cartela (inclusive o que já foi realizado)
    await client.query(
      `UPDATE rodadas_extras SET nome_cor = $1, cor_cartela = $2
        WHERE evento_id = $3 AND nome_cor = $4 AND cor_cartela = $5`,
      [nome_cor.trim(), cor_cartela, evento.id, nome_cor_atual, cor_atual]
    );
    // Rodadas já realizadas ficam intactas; as pendentes são regravadas
    const realizadas = (await client.query(
      `SELECT DISTINCT ordem_rodada FROM rodadas_extras
        WHERE evento_id = $1 AND nome_cor = $2 AND cor_cartela = $3 AND status = 'realizada'
        ORDER BY ordem_rodada`,
      [evento.id, nome_cor.trim(), cor_cartela]
    )).rows.map((r) => r.ordem_rodada);

    await client.query(
      `DELETE FROM rodadas_extras
        WHERE evento_id = $1 AND nome_cor = $2 AND cor_cartela = $3 AND status = 'pendente'`,
      [evento.id, nome_cor.trim(), cor_cartela]
    );
    const base = realizadas.length ? Math.max(...realizadas) : 0;
    let total = 0;
    for (let i = 0; i < lista.length; i++) {
      for (let j = 0; j < lista[i].length; j++) {
        await client.query(
          `INSERT INTO rodadas_extras
             (evento_id, nome_cor, cor_cartela, premio, ordem_rodada, ordem_premio)
           VALUES ($1, $2, $3, $4, $5, $6)`,
          [evento.id, nome_cor.trim(), cor_cartela, lista[i][j], base + i + 1, j + 1]
        );
        total++;
      }
    }
    await client.query('COMMIT');
    res.json({ ok: true, rodadas: lista.length, premios: total });
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally { client.release(); }
});

app.delete('/api/rodadas-extras/:id', async (req, res) => {
  try {
    const { rows } = await pool.query(
      "DELETE FROM rodadas_extras WHERE id = $1 AND status = 'pendente' RETURNING id",
      [req.params.id]
    );
    if (rows.length === 0) {
      return res.status(409).json({ erro: 'Só é possível excluir rodadas extras que ainda não foram realizadas.' });
    }
    res.json({ ok: true });
  } catch (e) { erro(res, e); }
});

//  RODADAS
app.post('/api/rodadas', async (req, res) => {
  const client = await pool.connect();
  try {
    const evento = await eventoAberto();
    if (!evento) {
      return res.status(409).json({ erro: 'Nenhum evento aberto. Crie o evento na tela "Prêmios & Rodadas".' });
    }
    if ((await pool.query("SELECT id FROM rodadas WHERE status = 'aberta'")).rowCount > 0) {
      return res.status(409).json({ erro: 'Já existe uma rodada aberta. Encerre-a antes de iniciar outra.' });
    }

    await client.query('BEGIN');

    // Rodada escolhida pelo operador, ou a próxima pendente da sequência
    const escolhidaId = req.body.planejada_id ? parseInt(req.body.planejada_id, 10) : null;
    const plan = (await client.query(
      escolhidaId
        ? `SELECT * FROM rodadas_planejadas
            WHERE id = $1 AND evento_id = $2 AND status = 'pendente' FOR UPDATE`
        : `SELECT * FROM rodadas_planejadas
            WHERE evento_id = $2 AND status = 'pendente' ORDER BY ordem LIMIT 1 FOR UPDATE`,
      escolhidaId ? [escolhidaId, evento.id] : [null, evento.id]
    )).rows[0];

    if (!plan) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        erro: 'Não há rodadas pendentes no planejamento. Adicione novas rodadas em "Prêmios & Rodadas" ou conclua o evento.',
      });
    }

    // 1º prêmio ainda não entregue desta rodada
    const premioLinha = (await client.query(
      'SELECT * FROM premios_planejados WHERE rodada_id = $1 AND NOT entregue ORDER BY ordem LIMIT 1',
      [plan.id]
    )).rows[0];
    const premio = (req.body.premio || '').trim() || premioLinha?.descricao || null;
    if (!premio) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        erro: `A rodada "${plan.nome || plan.tipo}" está sem prêmio. Informe um prêmio sobressalente antes de iniciar.`,
      });
    }

    // Numeração dentro do tipo (para relatórios)
    const num = (await client.query(
      'SELECT COALESCE(MAX(numero_rodada), 0) + 1 AS n FROM rodadas WHERE evento_id = $1 AND tipo = $2',
      [evento.id, plan.tipo]
    )).rows[0].n;

    const { rows } = await client.query(
      `INSERT INTO rodadas
         (numero_rodada, premio, evento_id, tipo, nome_cor, cor_cartela, planejada_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [num, premio, evento.id, plan.tipo, plan.nome, plan.cor, plan.id]
    );
    await client.query("UPDATE rodadas_planejadas SET status = 'realizada' WHERE id = $1", [plan.id]);
    await client.query('COMMIT');
    res.status(201).json(rows[0]);
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally {
    client.release();
  }
});

// Cantar um número na rodada aberta
app.post('/api/rodadas/atual/numeros', async (req, res) => {
  try {
    const numero = parseInt(req.body.numero, 10);
    const config = (await pool.query('SELECT max_numero FROM configuracoes WHERE id = 1')).rows[0];
    if (!numero || numero < 1 || numero > config.max_numero) {
      return res.status(400).json({ erro: `Informe um número entre 1 e ${config.max_numero}.` });
    }
    const rodada = (await pool.query("SELECT id FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1")).rows[0];
    if (!rodada) return res.status(409).json({ erro: 'Nenhuma rodada aberta. Inicie uma nova rodada primeiro.' });

    const { rows } = await pool.query(
      `INSERT INTO numeros_sorteados (rodada_id, numero) VALUES ($1, $2)
       ON CONFLICT (rodada_id, numero) DO NOTHING RETURNING *`,
      [rodada.id, numero]
    );
    if (rows.length === 0) return res.status(409).json({ erro: `O número ${numero} já foi cantado nesta rodada.` });
    res.status(201).json(rows[0]);
  } catch (e) { erro(res, e); }
});

// Remover QUALQUER número já cantado na rodada (corrige erro de digitação
// percebido tarde, sem precisar desfazer tudo)
app.delete('/api/rodadas/atual/numeros/:numero', async (req, res) => {
  try {
    const numero = parseInt(req.params.numero, 10);
    const rodada = (await pool.query(
      "SELECT id FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1"
    )).rows[0];
    if (!rodada) return res.status(409).json({ erro: 'Nenhuma rodada aberta.' });
    const { rows } = await pool.query(
      'DELETE FROM numeros_sorteados WHERE rodada_id = $1 AND numero = $2 RETURNING numero',
      [rodada.id, numero]
    );
    if (rows.length === 0) {
      return res.status(404).json({ erro: `O número ${numero} não está na lista desta rodada.` });
    }
    res.json({ removido: rows[0].numero });
  } catch (e) { erro(res, e); }
});

app.delete('/api/rodadas/atual/numeros/ultimo', async (_req, res) => {
  try {
    const rodada = (await pool.query("SELECT id FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1")).rows[0];
    if (!rodada) return res.status(409).json({ erro: 'Nenhuma rodada aberta.' });
    const { rows } = await pool.query(
      `DELETE FROM numeros_sorteados WHERE id = (
         SELECT id FROM numeros_sorteados WHERE rodada_id = $1 ORDER BY sorteado_em DESC LIMIT 1
       ) RETURNING numero`,
      [rodada.id]
    );
    res.json({ removido: rows[0]?.numero ?? null });
  } catch (e) { erro(res, e); }
});

// Cancelar rodada iniciada por engano: só é permitido enquanto NENHUM
// número foi cantado. A rodada é removida e, se era extra, a rodada
// extra volta para "pendente" (pode ser escolhida de novo).
app.post('/api/rodadas/atual/cancelar', async (_req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rodada = (await client.query(
      "SELECT * FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1 FOR UPDATE"
    )).rows[0];
    if (!rodada) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Nenhuma rodada aberta para cancelar.' });
    }
    const qtde = (await client.query(
      'SELECT COUNT(*)::int AS n FROM numeros_sorteados WHERE rodada_id = $1', [rodada.id]
    )).rows[0].n;
    if (qtde > 0) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        erro: `Esta rodada já tem ${qtde} número(s) cantado(s) e não pode ser cancelada. ` +
              'Use "Desfazer último" para corrigir números, ou encerre a rodada normalmente.',
      });
    }
    // Devolve a rodada planejada e seus prêmios para "pendente"
    if (rodada.planejada_id) {
      await client.query(
        "UPDATE rodadas_planejadas SET status = 'pendente' WHERE id = $1", [rodada.planejada_id]
      );
      await client.query(
        'UPDATE premios_planejados SET entregue = FALSE WHERE rodada_id = $1', [rodada.planejada_id]
      );
    }
    // Compatibilidade com eventos criados no modelo antigo
    // Extra: devolve TODOS os prêmios daquela rodada da cor para "pendente"
    // (com vários prêmios por rodada, mais de um pode ter sido consumido)
    if (rodada.tipo === 'extra' && rodada.ordem_rodada_cor) {
      await client.query(
        `UPDATE rodadas_extras SET status = 'pendente'
          WHERE evento_id = $1 AND nome_cor = $2 AND cor_cartela = $3 AND ordem_rodada = $4`,
        [rodada.evento_id, rodada.nome_cor, rodada.cor_cartela, rodada.ordem_rodada_cor]
      );
    } else if (rodada.rodada_extra_id) {
      await client.query(
        "UPDATE rodadas_extras SET status = 'pendente' WHERE id = $1",
        [rodada.rodada_extra_id]
      );
    }
    await client.query('DELETE FROM rodadas WHERE id = $1', [rodada.id]);
    await client.query('COMMIT');
    res.json({ ok: true, cancelada: rodada.tipo === 'extra' ? `Extra - Cartela ${rodada.nome_cor}` : `${rodada.numero_rodada}ª` });
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally {
    client.release();
  }
});

// Alguém gritou BINGO! → encerra a rodada e registra o(s) ganhador(es).
// Obrigatórios: apenas NOME e NÚMERO DA CARTELA.
// Se houver EMPATE (2+ ganhadores), o sistema SORTEIA quem fica com o
// prêmio: todos ficam registrados, e o sorteado recebe sorteado = TRUE.
app.post('/api/rodadas/atual/encerrar', async (req, res) => {
  const client = await pool.connect();
  try {
    // Aceita { ganhadores: [...] } (novo) ou os campos soltos (compatibilidade)
    let lista = Array.isArray(req.body.ganhadores) && req.body.ganhadores.length
      ? req.body.ganhadores
      : [req.body];
    lista = lista.map((g) => ({
      nome: String(g.nome || '').trim(),
      documento: String(g.documento || '').trim() || null,
      telefone: String(g.telefone || '').trim() || null,
      numero_cartela: String(g.numero_cartela || '').trim(),
    }));
    if (lista.some((g) => !g.nome || !g.numero_cartela)) {
      return res.status(400).json({ erro: 'Preencha nome e número da cartela de cada ganhador.' });
    }

    disputaEmConferencia = null; // registrou: sai o modo conferência
    const houveEmpate = lista.length > 1;
    // Identificador do lote: agrupa SÓ quem bateu bingo neste momento
    const loteEmpate = crypto.randomUUID();
    // Sorteio imparcial do desempate (gerador criptográfico do Node)
    const indiceSorteado = houveEmpate ? crypto.randomInt(lista.length) : 0;

    await client.query('BEGIN');
    const rodada = (await client.query(
      "SELECT * FROM rodadas WHERE status = 'aberta' ORDER BY id DESC LIMIT 1 FOR UPDATE"
    )).rows[0];
    if (!rodada) {
      await client.query('ROLLBACK');
      return res.status(409).json({ erro: 'Nenhuma rodada aberta para encerrar.' });
    }

    // Quantos prêmios já foram entregues NESTA rodada (fila anda por entrega)
    const entreguesNaRodada = (await client.query(
      'SELECT COUNT(*)::int AS n FROM ganhadores WHERE rodada_id = $1 AND sorteado',
      [rodada.id]
    )).rows[0].n;

    // Prêmio deste ganhador: manual, ou o próximo NÃO ENTREGUE do
    // conjunto desta rodada planejada (nunca puxa de outra rodada)
    let premio = (req.body.premio || '').trim() || null;
    let premioLinhaId = null;
    if (!premio && rodada.planejada_id) {
      const linha = (await client.query(
        `SELECT * FROM premios_planejados
          WHERE rodada_id = $1 AND NOT entregue ORDER BY ordem LIMIT 1 FOR UPDATE`,
        [rodada.planejada_id]
      )).rows[0];
      if (linha) { premio = linha.descricao; premioLinhaId = linha.id; }
    } else if (!premio) {
      premio = entreguesNaRodada === 0 ? rodada.premio : null;
    }
    if (!premio) {
      await client.query('ROLLBACK');
      return res.status(409).json({
        erro: 'Sem prêmio disponível para este ganhador. Informe o prêmio no campo antes de salvar.',
      });
    }
    const continuar = req.body.continuar === true;
    const observacoes = (req.body.observacoes || '').trim() || null;
    let sorteado = null;

    for (let i = 0; i < lista.length; i++) {
      const g = lista[i];
      const ehSorteado = i === indiceSorteado;
      const inserido = (await client.query(
        `INSERT INTO ganhadores
           (rodada_id, nome, documento, telefone, numero_cartela,
            premio, observacoes, sorteado, houve_empate, lote_empate)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
        [rodada.id, g.nome, g.documento, g.telefone, g.numero_cartela,
         ehSorteado ? premio : null, ehSorteado ? observacoes : null,
         ehSorteado, houveEmpate, loteEmpate]
      )).rows[0];
      if (ehSorteado) sorteado = inserido;
    }

    if (premioLinhaId) {
      await client.query('UPDATE premios_planejados SET entregue = TRUE WHERE id = $1', [premioLinhaId]);
    } else if (rodada.planejada_id) {
      // prêmio informado manualmente: marca o próximo da fila como usado
      await client.query(
        `UPDATE premios_planejados SET entregue = TRUE WHERE id = (
           SELECT id FROM premios_planejados WHERE rodada_id = $1 AND NOT entregue
           ORDER BY ordem LIMIT 1)`,
        [rodada.planejada_id]
      );
    }

    if (continuar) {
      // Para CONTINUAR é obrigatório existir o PRÓXIMO prêmio na fila.
      // Se acabou, o operador informa um sobressalente - que entra na fila
      // oficialmente (comum: lista planejada; extra: nova pendente da cor).
      // O próximo prêmio tem que existir NESTA rodada planejada
      let proximoDisputa = null;
      if (rodada.planejada_id) {
        proximoDisputa = (await client.query(
          'SELECT descricao FROM premios_planejados WHERE rodada_id = $1 AND NOT entregue ORDER BY ordem LIMIT 1',
          [rodada.planejada_id]
        )).rows[0]?.descricao || null;
      }
      // Sem prêmio? O sobressalente entra NESTA rodada
      const sobressalente = (req.body.premio_sobressalente || '').trim();
      if (!proximoDisputa && sobressalente && rodada.planejada_id) {
        const pos = (await client.query(
          'SELECT COALESCE(MAX(ordem), 0) + 1 AS n FROM premios_planejados WHERE rodada_id = $1',
          [rodada.planejada_id]
        )).rows[0].n;
        await client.query(
          'INSERT INTO premios_planejados (rodada_id, ordem, descricao) VALUES ($1, $2, $3)',
          [rodada.planejada_id, pos, sobressalente]
        );
        proximoDisputa = sobressalente;
      }
      if (!proximoDisputa) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          erro: 'A fila de prêmios desta cartela acabou. Para CONTINUAR a rodada, informe um ' +
                '"próximo prêmio (sobressalente)" no formulário - ou salve ENCERRANDO a rodada.',
        });
      }
    } else {
      await client.query(
        "UPDATE rodadas SET status = 'encerrada', encerrada_em = NOW() WHERE id = $1", [rodada.id]
      );
    }
    await client.query('COMMIT');
    res.status(201).json({
      rodada_encerrada: continuar ? null : rodada.numero_rodada,
      rodada_continua: continuar,
      numero_rodada: rodada.numero_rodada,
      houve_empate: houveEmpate,
      total_empatados: lista.length,
      ganhador: sorteado,
    });
  } catch (e) {
    await client.query('ROLLBACK');
    erro(res, e);
  } finally {
    client.release();
  }
});

//  RELATÓRIOS
app.get('/api/relatorios/ganhadores', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM vw_relatorio_ganhadores');
    res.json(rows);
  } catch (e) { erro(res, e); }
});

app.patch('/api/ganhadores/:id/entrega', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'UPDATE ganhadores SET premio_entregue = $1 WHERE id = $2 RETURNING *',
      [!!req.body.entregue, req.params.id]
    );
    res.json(rows[0]);
  } catch (e) { erro(res, e); }
});

app.get('/api/relatorios/ganhadores.csv', async (_req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM vw_relatorio_ganhadores');
    const cab = ['Evento', 'Rodada', 'Tipo', 'Nome', 'Documento', 'Telefone', 'Cartela', 'Prêmio', 'Empate',
                 'Ficou com o prêmio', 'Entregue', 'Data', 'Qtde números', 'Números da rodada'];
    const esc = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const linhas = rows.map((r) => [
      r.evento,
      r.tipo === 'extra' ? `Extra ${r.numero_rodada}` : `${r.numero_rodada}ª`,
      r.tipo === 'extra' ? `Extra - Cartela ${r.nome_cor || ''}` : 'Comum',
      r.nome, r.documento, r.telefone, r.numero_cartela, r.premio,
      r.houve_empate ? 'Sim' : 'Não',
      r.sorteado ? 'Sim' : 'Não',
      r.premio_entregue ? 'Sim' : 'Não',
      new Date(r.registrado_em).toLocaleString('pt-BR'),
      r.qtde_numeros, r.numeros_da_rodada,
    ].map(esc).join(';'));
    const csv = '\uFEFF' + [cab.map(esc).join(';'), ...linhas].join('\r\n');
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="ganhadores-bingo.csv"');
    res.send(csv);
  } catch (e) { erro(res, e); }
});

const tela = (arquivo) => (_req, res) => res.sendFile(path.join(__dirname, 'public', arquivo));
app.get('/', tela('telao.html'));
app.get('/operador', tela('operador.html'));
app.get('/premios', tela('premios.html'));
app.get('/relatorios', tela('relatorios.html'));
app.get('/personalizar', tela('personalizar.html'));

function erro(res, e) {
  console.error(e);
  res.status(500).json({ erro: 'Erro interno. Verifique a conexão com o banco de dados.' });
}

app.listen(PORT, () => {
  console.log('======================================================');
  console.log('  🎱 BINGO COMUNITÁRIO no ar!');
  console.log(`  Telão .......... http://localhost:${PORT}/`);
  console.log(`  Operador ....... http://localhost:${PORT}/operador`);
  console.log(`  Prêmios ........ http://localhost:${PORT}/premios`);
  console.log(`  Relatórios ..... http://localhost:${PORT}/relatorios`);
  console.log(`  Personalizar ... http://localhost:${PORT}/personalizar`);
  console.log('======================================================');
});
