/**
 * Prepara o banco com um comando (npm run setup-db): cria o banco caso
 * não exista e aplica database/schema.sql, que é idempotente.
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { Client } = require('pg');

const {
  DB_HOST = 'localhost',
  DB_PORT = 5432,
  DB_NAME = 'bingo_comunitario',
  DB_USER = 'postgres',
  DB_PASSWORD = '',
} = process.env;

async function main() {
  // 1) Conecta no banco padrão "postgres" para poder criar o banco do sistema
  const admin = new Client({
    host: DB_HOST, port: DB_PORT, user: DB_USER,
    password: DB_PASSWORD, database: 'postgres',
  });
  await admin.connect();

  const existe = await admin.query('SELECT 1 FROM pg_database WHERE datname = $1', [DB_NAME]);
  if (existe.rowCount === 0) {
    await admin.query(`CREATE DATABASE ${DB_NAME.replace(/[^a-zA-Z0-9_]/g, '')}`);
    console.log(`✔ Banco "${DB_NAME}" criado.`);
  } else {
    console.log(`✔ Banco "${DB_NAME}" já existe.`);
  }
  await admin.end();

  // 2) Executa o schema no banco do sistema
  const db = new Client({
    host: DB_HOST, port: DB_PORT, user: DB_USER,
    password: DB_PASSWORD, database: DB_NAME,
  });
  await db.connect();
  const schema = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(schema);
  await db.end();

  console.log('✔ Tabelas, índices e view criados com sucesso.');
  console.log('\nTudo pronto! Agora rode:  npm start');
}

main().catch((err) => {
  console.error('\n✖ Erro ao configurar o banco:', err.message);
  console.error('  Verifique o arquivo .env (host, usuário e senha do PostgreSQL).');
  process.exit(1);
});
