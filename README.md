<div align="center">

# 🎱 Bingo Comunitário

**Telão, painel do operador e registro de ganhadores para bingos de festas beneficentes.**

Pensado para quem organiza bingo em salão de paróquia, escola ou associação:
roda na própria máquina, sem internet, sem mensalidade e sem dados saindo da organização.

[![Node.js](https://img.shields.io/badge/Node.js-18%2B-339933?logo=node.js&logoColor=white)](https://nodejs.org)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-13%2B-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org)
[![Express](https://img.shields.io/badge/Express-4.x-000000?logo=express&logoColor=white)](https://expressjs.com)
[![License: MIT](https://img.shields.io/badge/License-MIT-f5b301.svg)](LICENSE)

</div>

---

## Por que este projeto existe

Num bingo de comunidade, o sorteio continua sendo feito do jeito de sempre: alguém
gira o globo e canta as bolas. O que costuma faltar é o resto. O público não enxerga
quais números já saíram, ninguém sabe qual prêmio está em jogo, e os ganhadores
acabam anotados num caderno que se perde antes da entrega do prêmio.

Este sistema cuida justamente dessa parte: ele é a **vitrine** e o **caderno de
registros** do evento, enquanto as bolas continuam sendo cantadas por uma pessoa.

Foi construído para um evento real, usado em produção e ajustado depois dele com
base no que deu errado no salão. Os detalhes estão em [Lições de produção](#-lições-de-produção).

---

## ✨ O que ele faz

| | |
|---|---|
| 📺 **Telão para projetar** | Bola gigante no estilo bola de sinuca, painel B-I-N-G-O completo, cores e banner do evento. Atualiza sozinho a cada 2 segundos, em quantas telas você quiser. |
| 🎛️ **Painel do operador** | Canta os números por teclado ou clique, corrige erros, registra ganhadores e decide se a rodada continua ou encerra. |
| 🎲 **Sorteio transparente** | Quando duas pessoas batem juntas, os nomes aparecem no telão para conferência, embaralham ao vivo com rufar de tambor e o vencedor é revelado com sinos e confete. |
| 🎫 **Rodadas sob medida** | Monte a sequência real do evento intercalando cartelas comuns e extras coloridas, cada uma com nome, cor e vários prêmios. |
| 🤝 **Patrocinadores** | Esteira contínua de logos no telão, com envio em massa de arquivos. |
| 📋 **Relatórios** | Ganhadores, cartelas, prêmios e números de cada rodada, com exportação CSV e controle de entrega. |

---

## 🖥️ As quatro telas

| Tela | Endereço | Quem usa |
|---|---|---|
| **Telão** | `http://localhost:3000/` | Projetado para o público |
| **Operador** | `http://localhost:3000/operador` | Quem conduz o bingo |
| **Prêmios e Rodadas** | `http://localhost:3000/premios` | Organização, antes do evento |
| **Relatórios** | `http://localhost:3000/relatorios` | Organização, na entrega dos prêmios |
| **Personalizar** | `http://localhost:3000/personalizar` | Organização, identidade visual |

---

## 🚀 Começando

### Pré-requisitos

- [Node.js](https://nodejs.org) 18 ou superior
- [PostgreSQL](https://www.postgresql.org/download/) 13 ou superior

### Instalação

```bash
git clone https://github.com/eduardodev001/project-bingo-frafem-uniaoterceira.git
cd project-bingo-frafem-uniaoterceira

npm install

# Copie a configuração e informe a senha do seu PostgreSQL
cp .env.example .env     # no Windows: copy .env.example .env

# Cria o banco, as tabelas e a view de relatório
npm run setup-db

npm start
```

Pronto: abra `http://localhost:3000/` para o telão e `http://localhost:3000/operador`
para o painel.

### Jeito ainda mais fácil

No Windows, dois cliques em **`Iniciar-Bingo.bat`** fazem tudo sozinho: checam o
Node, criam a configuração na primeira execução, instalam as dependências, preparam
o banco, sobem o servidor e abrem as telas no navegador. No Linux e no macOS o
equivalente é `./iniciar-bingo.sh`.

---

## 🎤 Como é o dia do evento

1. **Antes de começar**, em *Personalizar*: nome do evento, cores, banner e as logos
   dos patrocinadores. Em *Prêmios e Rodadas*: crie o evento e monte a sequência das
   rodadas na ordem real, misturando comuns e extras.
2. **Projete o telão** na TV ou projetor (`F11` para tela cheia) e clique uma vez em
   **Ativar som**, para liberar o áudio do navegador.
3. **A cada bola cantada**, digite o número e tecle Enter. A bola aparece no telão na hora.
4. **Quando alguém gritar bingo**, confira a cartela e registre o nome. Se mais de uma
   pessoa bateu, projete os nomes para conferência e deixe o sorteio decidir.
5. **Decida o rumo da rodada**: continuar (o próximo prêmio entra em disputa, mantendo
   os números no telão) ou encerrar e seguir para a próxima cartela.
6. **No fim**, conclua o evento e exporte o CSV dos ganhadores.

O guia de bolso para quem vai operar está em **[MANUAL-DO-OPERADOR.md](MANUAL-DO-OPERADOR.md)**,
escrito sem jargão técnico para qualquer voluntário conduzir sozinho.

---

## 🧩 Decisões de projeto

**Roda local, não na nuvem.** Num evento ao vivo, depender do Wi-Fi do salão é o
caminho mais curto para o telão congelar na frente de todo mundo. Tudo roda na
máquina da organização, sem custo recorrente, e os dados pessoais dos ganhadores
nunca saem dali.

**O sorteio é decidido no servidor.** O desempate usa o gerador criptográfico do
Node (`crypto.randomInt`), e a animação apenas apresenta esse resultado. Antes de
sortear, os nomes vão ao telão para conferência pública: no primeiro evento, pessoas
quiseram ver o próprio nome na lista antes da roleta girar.

**A fila de prêmios vive dentro da rodada.** Uma rodada pode entregar vários prêmios
em sequência sem consumir os das próximas, então a rodada seguinte sempre recomeça no
primeiro prêmio dela.

**Som sintetizado, sem arquivos.** Tambor, sinos e aplausos são gerados pela Web Audio
API no próprio navegador: nada para baixar, nada para faltar no meio da festa. Quem
quiser usar uma vinheta própria coloca um `vitoria.mp3` em `public/sons/`.

**Acessibilidade pensada para o público real.** Números marcados usam centro branco com
dígito preto (como bola de sinuca), legíveis sobre qualquer cor de cartela; a tipografia
escala com a altura da tela; e todas as animações respeitam `prefers-reduced-motion`.

---

## 🗄️ Estrutura do banco

| Tabela | Conteúdo |
|---|---|
| `configuracoes` | Identidade visual do telão: nome, cores das bolas, banner, 75 ou 90 bolas |
| `eventos` | O bingo do dia, com status aberto ou concluído |
| `rodadas_planejadas` | Sequência das rodadas, com tipo, nome e cor da cartela |
| `premios_planejados` | Prêmios de cada rodada planejada, na ordem de entrega |
| `rodadas` | Rodadas efetivamente jogadas, ligadas ao planejamento |
| `numeros_sorteados` | Cada bola cantada, na ordem, sem repetição por rodada |
| `ganhadores` | Nome, cartela, prêmio, empate e marcação do sorteado |
| `patrocinadores` | Logos exibidas no carrossel do telão |
| `vw_relatorio_ganhadores` | View que junta ganhador, rodada, prêmio e números |

O arquivo [`database/schema.sql`](database/schema.sql) é comentado e **idempotente**:
pode ser executado quantas vezes for preciso sem perder dados.

---

## 📁 Organização do código

```
bingo-comunitario/
├── server.js               API Express e regras do jogo
├── database/
│   ├── schema.sql          Tabelas, índices e views
│   └── setup.js            Preparação automática do banco
├── public/
│   ├── telao.html          Tela projetada para o público
│   ├── operador.html       Painel de quem conduz
│   ├── premios.html        Planejamento das rodadas
│   ├── relatorios.html     Ganhadores e exportação
│   ├── personalizar.html   Identidade visual e patrocinadores
│   ├── css/ js/            Estilos e scripts de cada tela
│   └── uploads/            Banner e logos enviados no evento
├── Iniciar-Bingo.bat       Atalho de um clique (Windows)
├── iniciar-bingo.sh        Atalho equivalente (Linux e macOS)
└── MANUAL-DO-OPERADOR.md   Guia para voluntários
```

---

## 🔧 Lições de produção

Depois do primeiro evento real, três ajustes nasceram do que falhou no salão:

- **O sorteio mostrava mais nomes do que o esperado.** A busca agrupava por rodada, e
  como uma rodada acumula vários ganhadores, apareciam pessoas já premiadas junto com
  as do empate. Cada bingo passou a receber um identificador de lote.
- **Os prêmios repetiam.** O formulário enviava um valor que podia estar desatualizado
  na tela. O servidor virou a fonte da verdade da fila.
- **Erros de digitação só apareciam no fim da rodada.** Agora qualquer número já
  cantado pode ser removido com um clique na grade.

---

## 🖥️ Montagem com vários telões

Para repetir a mesma imagem em várias TVs, o caminho mais simples é um **splitter
HDMI**: o notebook alimenta o aparelho e ele replica o sinal. Use `Win + P` em modo
*Estender* para manter o painel do operador na tela do notebook e o telão nas TVs.

Se as telas estiverem espalhadas pelo salão, a alternativa é a rede local: cada
aparelho abre `http://IP-DO-NOTEBOOK:3000/` no navegador, sem precisar de internet.

---

## 🤝 Contribuindo

Sugestões e correções são bem-vindas. Abra uma issue descrevendo o cenário do seu
evento, ou envie um pull request. Projetos de comunidade têm necessidades bem
diferentes entre si, e boa parte das funcionalidades aqui nasceu exatamente assim.

---

## 📄 Licença

Distribuído sob a licença MIT. Veja [LICENSE](LICENSE) para mais detalhes.

<div align="center">

Feito para a comunidade, com a torcida de que o próximo prêmio seja seu. 🎉

</div>
