#!/usr/bin/env bash
# 🎱 Bingo Comunitário - iniciar com 1 clique (Linux/Mac)
# Primeira vez: dê permissão com  chmod +x iniciar-bingo.sh
cd "$(dirname "$0")"

echo "======================================================"
echo "  🎱 BINGO COMUNITÁRIO - Iniciando o sistema..."
echo "======================================================"

if ! command -v node >/dev/null 2>&1; then
  echo "[ERRO] Node.js não encontrado. Instale em https://nodejs.org e tente de novo."
  read -r -p "Pressione Enter para sair..."
  exit 1
fi

if [ ! -f .env ]; then
  cp .env.example .env
  echo "[PRIMEIRA EXECUÇÃO] Edite o arquivo .env com a senha do seu PostgreSQL."
  "${EDITOR:-nano}" .env
fi

if [ ! -d node_modules ]; then
  echo "Instalando dependências (apenas na primeira vez)..."
  npm install || { echo "[ERRO] Falha no npm install."; exit 1; }
fi

echo "Verificando o banco de dados..."
node database/setup.js || {
  echo "[ERRO] Não consegui falar com o PostgreSQL. Confira o serviço e a senha no .env."
  read -r -p "Pressione Enter para sair..."
  exit 1
}

( sleep 3
  xdg-open "http://localhost:3000/operador" 2>/dev/null || open "http://localhost:3000/operador"
  xdg-open "http://localhost:3000/" 2>/dev/null || open "http://localhost:3000/"
) &

echo
echo "Sistema no ar! NÃO feche este terminal durante o evento."
node server.js
