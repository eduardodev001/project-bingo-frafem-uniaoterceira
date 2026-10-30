-- ============================================================
--  BINGO COMUNITÁRIO - Estrutura do banco de dados PostgreSQL
-- ============================================================
--  Como usar:
--    1) Crie o banco (uma única vez):
--         CREATE DATABASE bingo_comunitario;
--    2) Conectado ao banco, execute este arquivo inteiro, OU
--       simplesmente rode no terminal do projeto:
--         npm run setup-db
--       (o script database/setup.js executa tudo automaticamente)
-- ============================================================

-- ------------------------------------------------------------
-- 1) CONFIGURAÇÕES VISUAIS DO EVENTO (personalização do telão)
--    Uma única linha (id = 1). O cliente edita pela tela
--    "Personalizar" - nome do evento, cores, banner, mensagens.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS configuracoes (
    id              INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
    nome_evento     TEXT    NOT NULL DEFAULT 'Bingo Comunitário',
    subtitulo       TEXT    NOT NULL DEFAULT 'Em prol da nossa comunidade',
    mensagem_rodape TEXT    NOT NULL DEFAULT 'Boa sorte a todos!',
    cor_primaria    TEXT    NOT NULL DEFAULT '#1b4d3e',  -- fundo do telão
    cor_destaque    TEXT    NOT NULL DEFAULT '#f5b301',  -- cor de destaque/bola
    banner_url      TEXT,                                -- caminho do banner enviado
    max_numero      INTEGER NOT NULL DEFAULT 75 CHECK (max_numero IN (75, 90)),
    atualizado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO configuracoes (id) VALUES (1)
ON CONFLICT (id) DO NOTHING;

-- ------------------------------------------------------------
-- 2) RODADAS
--    Cada rodada começa aberta; quando alguém grita BINGO,
--    o operador encerra a rodada e registra o ganhador.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rodadas (
    id            SERIAL PRIMARY KEY,
    numero_rodada INTEGER NOT NULL,                     -- 1ª, 2ª, 3ª rodada do dia
    premio        TEXT,                                 -- ex.: "Cesta básica", "R$ 200"
    status        TEXT NOT NULL DEFAULT 'aberta'
                  CHECK (status IN ('aberta', 'encerrada')),
    iniciada_em   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    encerrada_em  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_rodadas_status ON rodadas (status);

-- ------------------------------------------------------------
-- 3) NÚMEROS SORTEADOS
--    Cada bola cantada em cada rodada, na ordem em que saiu.
--    A restrição UNIQUE impede cantar o mesmo número duas
--    vezes na mesma rodada.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS numeros_sorteados (
    id          SERIAL PRIMARY KEY,
    rodada_id   INTEGER NOT NULL REFERENCES rodadas (id) ON DELETE CASCADE,
    numero      INTEGER NOT NULL CHECK (numero BETWEEN 1 AND 90),
    sorteado_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (rodada_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_numeros_rodada ON numeros_sorteados (rodada_id);

-- Colunas de rodada usadas nas views abaixo (seguras de re-executar)
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS
    tipo TEXT NOT NULL DEFAULT 'comum' CHECK (tipo IN ('comum', 'extra'));
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS nome_cor TEXT;
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS cor_cartela TEXT;
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS ordem_rodada_cor INTEGER;

-- ------------------------------------------------------------
-- 4) GANHADORES
--    Nome, documento e cartela de quem bateu o bingo, para
--    localizar a pessoa depois e entregar o prêmio.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS ganhadores (
    id             SERIAL PRIMARY KEY,
    rodada_id      INTEGER NOT NULL REFERENCES rodadas (id) ON DELETE CASCADE,
    nome           TEXT NOT NULL,
    documento      TEXT,                                -- CPF/RG (opcional)
    telefone       TEXT,
    numero_cartela TEXT NOT NULL,
    premio         TEXT,
    observacoes    TEXT,
    premio_entregue BOOLEAN NOT NULL DEFAULT FALSE,
    registrado_em  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ganhadores_rodada ON ganhadores (rodada_id);

-- Colunas de empate/sorteio (seguras de re-executar; precisam existir antes
-- das views de relatório abaixo)
ALTER TABLE ganhadores ALTER COLUMN documento DROP NOT NULL;
ALTER TABLE ganhadores ADD COLUMN IF NOT EXISTS sorteado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ganhadores ADD COLUMN IF NOT EXISTS houve_empate BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE ganhadores ADD COLUMN IF NOT EXISTS lote_empate TEXT;
CREATE INDEX IF NOT EXISTS idx_ganhadores_lote ON ganhadores (lote_empate);

-- ------------------------------------------------------------
-- 5) EVENTOS
--    Um "evento" é o bingo completo do dia (várias rodadas).
--    Ele é criado na tela "Prêmios & Rodadas", com a quantidade
--    de rodadas planejadas, e concluído ao final do dia.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS eventos (
    id                       SERIAL PRIMARY KEY,
    nome                     TEXT NOT NULL,
    qtde_rodadas_planejadas  INTEGER NOT NULL DEFAULT 1
                             CHECK (qtde_rodadas_planejadas BETWEEN 1 AND 100),
    status                   TEXT NOT NULL DEFAULT 'aberto'
                             CHECK (status IN ('aberto', 'concluido')),
    criado_em                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    concluido_em             TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_eventos_status ON eventos (status);

-- ------------------------------------------------------------
-- 6) PRÊMIOS POR RODADA (planejamento do evento)
--    Ex.: 1ª rodada = cesta básica, 2ª = R$ 200, 3ª = bicicleta.
--    Ao iniciar cada rodada, o prêmio correspondente é
--    preenchido automaticamente no operador e no telão.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS premios_evento (
    id           SERIAL PRIMARY KEY,
    evento_id    INTEGER NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
    ordem_rodada INTEGER NOT NULL CHECK (ordem_rodada >= 1),
    descricao    TEXT NOT NULL,
    UNIQUE (evento_id, ordem_rodada)
);

-- Liga cada rodada ao seu evento (coluna nova, segura de re-executar)
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS
    evento_id INTEGER REFERENCES eventos (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_rodadas_evento ON rodadas (evento_id);

-- ------------------------------------------------------------
-- AJUSTES (seguros de re-executar):
--  - Documento do ganhador passa a ser OPCIONAL (só nome e
--    cartela são obrigatórios).
--  - Empate: quando mais de uma pessoa bate BINGO na mesma
--    rodada, todos são registrados e o sistema SORTEIA quem
--    fica com o prêmio (sorteado = TRUE).
-- ------------------------------------------------------------
ALTER TABLE ganhadores ALTER COLUMN documento DROP NOT NULL;
ALTER TABLE ganhadores ADD COLUMN IF NOT EXISTS
    sorteado BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE ganhadores ADD COLUMN IF NOT EXISTS
    houve_empate BOOLEAN NOT NULL DEFAULT FALSE;

-- Recria a visão de relatório incluindo o nome do evento
DROP VIEW IF EXISTS vw_relatorio_ganhadores;
CREATE VIEW vw_relatorio_ganhadores AS
SELECT
    g.id,
    e.nome                                 AS evento,
    r.numero_rodada,
    g.nome,
    g.documento,
    g.telefone,
    g.numero_cartela,
    COALESCE(g.premio, r.premio)           AS premio,
    g.premio_entregue,
    g.sorteado,
    g.houve_empate,
    g.lote_empate,
    g.registrado_em,
    r.iniciada_em,
    r.encerrada_em,
    (SELECT COUNT(*) FROM numeros_sorteados ns WHERE ns.rodada_id = r.id)   AS qtde_numeros,
    (SELECT STRING_AGG(ns.numero::TEXT, ', ' ORDER BY ns.sorteado_em)
       FROM numeros_sorteados ns WHERE ns.rodada_id = r.id)                 AS numeros_da_rodada
FROM ganhadores g
JOIN rodadas r ON r.id = g.rodada_id
LEFT JOIN eventos e ON e.id = r.evento_id
ORDER BY g.registrado_em DESC;

-- ------------------------------------------------------------
-- 7) RODADAS EXTRAS
--    Rodadas especiais com cartela de cor diferente e prêmio
--    próprio. São cadastradas em "Prêmios & Rodadas" e podem
--    ser acionadas a qualquer momento: após cada BINGO, o
--    operador escolhe qual rodada vai ao ar (comum ou extra).
--    O telão muda o tema para a cor da cartela da extra.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rodadas_extras (
    id           SERIAL PRIMARY KEY,
    evento_id    INTEGER NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
    nome_cor     TEXT NOT NULL,            -- ex.: "Azul", "Rosa", "Verde"
    cor_cartela  TEXT NOT NULL,            -- cor em hexadecimal (#1f6fd0)
    premio       TEXT,
    status       TEXT NOT NULL DEFAULT 'pendente'
                 CHECK (status IN ('pendente', 'realizada')),
    criado_em    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_extras_evento ON rodadas_extras (evento_id, status);

-- Campos novos em rodadas (seguros de re-executar)
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS
    tipo TEXT NOT NULL DEFAULT 'comum' CHECK (tipo IN ('comum', 'extra'));
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS nome_cor TEXT;
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS cor_cartela TEXT;
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS
    rodada_extra_id INTEGER REFERENCES rodadas_extras (id) ON DELETE SET NULL;

-- Recria a visão de relatório incluindo tipo e cor da rodada
DROP VIEW IF EXISTS vw_relatorio_ganhadores;
CREATE VIEW vw_relatorio_ganhadores AS
SELECT
    g.id,
    e.nome                                 AS evento,
    r.numero_rodada,
    r.tipo,
    r.nome_cor,
    r.cor_cartela,
    g.nome,
    g.documento,
    g.telefone,
    g.numero_cartela,
    COALESCE(g.premio, r.premio)           AS premio,
    g.premio_entregue,
    g.sorteado,
    g.houve_empate,
    g.lote_empate,
    g.registrado_em,
    r.iniciada_em,
    r.encerrada_em,
    (SELECT COUNT(*) FROM numeros_sorteados ns WHERE ns.rodada_id = r.id)   AS qtde_numeros,
    (SELECT STRING_AGG(ns.numero::TEXT, ', ' ORDER BY ns.sorteado_em)
       FROM numeros_sorteados ns WHERE ns.rodada_id = r.id)                 AS numeros_da_rodada
FROM ganhadores g
JOIN rodadas r ON r.id = g.rodada_id
LEFT JOIN eventos e ON e.id = r.evento_id
ORDER BY g.registrado_em DESC;

-- ------------------------------------------------------------
-- CORES DAS BOLAS DO TELÃO (personalizáveis na tela Personalizar)
-- ------------------------------------------------------------
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS cor_bola_b TEXT NOT NULL DEFAULT '#7d4bc0';
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS cor_bola_i TEXT NOT NULL DEFAULT '#d03b2f';
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS cor_bola_n TEXT NOT NULL DEFAULT '#f4f4f0';
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS cor_bola_g TEXT NOT NULL DEFAULT '#e0762b';
ALTER TABLE configuracoes ADD COLUMN IF NOT EXISTS cor_bola_o TEXT NOT NULL DEFAULT '#8a5a34';

-- ------------------------------------------------------------
-- 8) PATROCINADORES
--    Logos exibidas em carrossel contínuo no telão, abaixo do
--    painel de números. Gerenciadas na tela "Personalizar".
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS patrocinadores (
    id        SERIAL PRIMARY KEY,
    nome      TEXT,
    logo_url  TEXT NOT NULL,
    ativo     BOOLEAN NOT NULL DEFAULT TRUE,
    criado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------
-- 9) VÁRIOS PRÊMIOS POR RODADA (regra atualizada)
--    Antes: 1 prêmio por rodada, em fila linear pelo evento.
--    Agora: CADA RODADA tem seu próprio conjunto de prêmios.
--    A fila anda DENTRO da rodada; ao iniciar a rodada seguinte,
--    começa no 1º prêmio daquela rodada.
-- ------------------------------------------------------------

-- Cartela comum: ordem_premio identifica o prêmio dentro da rodada
ALTER TABLE premios_evento ADD COLUMN IF NOT EXISTS ordem_premio INTEGER NOT NULL DEFAULT 1;
ALTER TABLE premios_evento DROP CONSTRAINT IF EXISTS premios_evento_evento_id_ordem_rodada_key;
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'premios_evento_rodada_premio_key'
  ) THEN
    ALTER TABLE premios_evento
      ADD CONSTRAINT premios_evento_rodada_premio_key
      UNIQUE (evento_id, ordem_rodada, ordem_premio);
  END IF;
END $$;

-- Cartelas extras: cada cor tem rodadas, e cada rodada tem seus prêmios
ALTER TABLE rodadas_extras ADD COLUMN IF NOT EXISTS ordem_rodada INTEGER NOT NULL DEFAULT 1;
ALTER TABLE rodadas_extras ADD COLUMN IF NOT EXISTS ordem_premio INTEGER NOT NULL DEFAULT 1;

CREATE INDEX IF NOT EXISTS idx_extras_grupo
  ON rodadas_extras (evento_id, nome_cor, ordem_rodada, ordem_premio);

-- Guarda em qual rodada da cor a rodada extra em jogo se refere
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS ordem_rodada_cor INTEGER;

-- ------------------------------------------------------------
-- 10) CORREÇÕES DE PRODUÇÃO
--     lote_empate: agrupa APENAS os ganhadores que bateram bingo
--     no mesmo momento (um empate). Antes, o telão mostrava todos
--     os ganhadores da rodada no sorteio.
-- ------------------------------------------------------------
ALTER TABLE ganhadores ADD COLUMN IF NOT EXISTS lote_empate TEXT;
CREATE INDEX IF NOT EXISTS idx_ganhadores_lote ON ganhadores (lote_empate);

-- ------------------------------------------------------------
-- 11) IDENTIDADE DAS RODADAS COMUNS
--     Cada rodada comum pode ter nome e cor próprios (ex.: "Cartela
--     Branca", "Rodada da Sorte"), igual às extras. Assim o telão
--     mostra o nome da cartela em jogo, e não o número planejado.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rodadas_config (
    id           SERIAL PRIMARY KEY,
    evento_id    INTEGER NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
    ordem_rodada INTEGER NOT NULL,
    nome         TEXT,
    cor          TEXT,
    UNIQUE (evento_id, ordem_rodada)
);

-- ------------------------------------------------------------
-- 12) FILA ÚNICA DE RODADAS PLANEJADAS (nova regra)
--     O evento é criado só com o nome. Depois monta-se a
--     SEQUÊNCIA de rodadas, cada uma marcada como comum ou
--     extra, podendo intercalar livremente. Cada rodada tem
--     nome, cor e seu próprio conjunto de prêmios.
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS rodadas_planejadas (
    id          SERIAL PRIMARY KEY,
    evento_id   INTEGER NOT NULL REFERENCES eventos (id) ON DELETE CASCADE,
    ordem       INTEGER NOT NULL,
    tipo        TEXT NOT NULL DEFAULT 'comum' CHECK (tipo IN ('comum', 'extra')),
    nome        TEXT,
    cor         TEXT,
    status      TEXT NOT NULL DEFAULT 'pendente'
                CHECK (status IN ('pendente', 'realizada')),
    criado_em   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_planejadas_evento
  ON rodadas_planejadas (evento_id, status, ordem);

CREATE TABLE IF NOT EXISTS premios_planejados (
    id         SERIAL PRIMARY KEY,
    rodada_id  INTEGER NOT NULL REFERENCES rodadas_planejadas (id) ON DELETE CASCADE,
    ordem      INTEGER NOT NULL,
    descricao  TEXT NOT NULL,
    entregue   BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE INDEX IF NOT EXISTS idx_premios_planejados
  ON premios_planejados (rodada_id, entregue, ordem);

-- Liga a rodada em jogo ao seu planejamento
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS
    planejada_id INTEGER REFERENCES rodadas_planejadas (id) ON DELETE SET NULL;
