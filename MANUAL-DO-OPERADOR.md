# 🎱 Manual do Operador - Bingo Comunitário

> Guia rápido para quem vai operar o sistema no dia do evento.
> Não é preciso saber nada de computador além de clicar e digitar.

## Antes do evento começar

1. **Ligue o sistema:** dê dois cliques em **`Iniciar-Bingo.bat`** (na pasta do
   projeto). Uma janela preta vai abrir - **não feche essa janela** durante o
   evento; é ela que mantém o bingo no ar.
2. Duas abas abrem sozinhas no navegador: o **Telão** e o **Operador**.
3. Arraste a aba do **Telão** para a TV (tecla `Win + P` → *Estender*) e aperte
   **F11** nela para tela cheia. Clique uma vez em **"🔇 Ativar som"** no canto
   da tela do telão.
4. Na tela do **Operador**, confira se a sequência de rodadas já está montada.
   Se não estiver, vá em **Prêmios & Rodadas**: crie o evento (só o nome) e
   monte a sequência na ordem real, misturando rodadas comuns e extras.

> 🤝 As **logos dos patrocinadores** cadastradas em *Personalizar* passam em
> carrossel contínuo no telão durante todo o bingo, abaixo do painel de números.

## Durante o bingo - o ciclo de cada rodada

1. **Escolha a próxima rodada** (cada cartela aparece com seu nome e cor) e
   clique em **▶ Iniciar rodada selecionada**. O telão atualiza sozinho.
   - **Iniciou a rodada errada?** Enquanto nenhum número foi cantado, aparece
     o botão **⬅ Cancelar rodada (escolher outra)** - clique nele e escolha a
     correta. Se era uma extra, ela volta para a lista.
2. A cada bola cantada, **digite o número e aperte Enter**
   (ou clique no número na grade). Ele aparece na hora no telão.
3. **Errou o número?** Clique em **↩ Desfazer último** para tirar o mais
   recente, ou **clique no número na grade** para remover qualquer um que
   já tenha sido cantado (útil quando o erro só é percebido no fim da rodada).
4. Alguém gritou **BINGO!** → clique no botão vermelho, afira a cartela e
   preencha **nome** e **número da cartela**. Depois escolha:
   - **🔁 Salvar e CONTINUAR a rodada** - mantém todos os números no telão e
     coloca o **próximo prêmio da fila** em disputa (ótimo para quem faltou
     1 ou 2 números). Pode repetir várias vezes na mesma rodada.
   - **🏁 Salvar e ENCERRAR a rodada** - fecha a rodada e volta à escolha.
   Cada rodada tem **seus próprios prêmios** (definidos em Prêmios & Rodadas).
   Ao continuar, entra o próximo prêmio DAQUELA rodada - o painel mostra
   "2º de 3 prêmios desta rodada". Quando a rodada acaba e você inicia a
   próxima, ela começa sempre no 1º prêmio dela.
   ⚠ **Sem prêmio, não há rodada:** se a fila da cartela acabar, o sistema
   exige um **prêmio sobressalente** (campo próprio no formulário) para
   continuar ou iniciar - sem informá-lo, a ação é bloqueada.
   - **Mais de uma pessoa bateu junto?** Clique em
     **＋ Adicionar outro ganhador (empate)** e cadastre todas. Depois clique em
     **👁 Mostrar nomes no telão** para o público conferir se está na lista e se
     o nome está escrito certo (corrija e clique de novo se precisar). Em seguida
     o telão embaralha os nomes ao vivo, com tambor, e revela quem fica com o
     prêmio ao som do sino. Clique em **✔ Aceitar resultado**.
5. Repita o ciclo até acabar as rodadas.

## No fim do evento

1. Clique em **🏁 Concluir evento do bingo** (o telão mostra o agradecimento).
2. Abra **Relatórios** para ver todos os ganhadores e, se precisar,
   **⬇ Exportar CSV** (abre no Excel). Marque **"Entregue"** conforme os
   prêmios forem retirados.
3. Pode fechar a janela preta e desligar tudo.

## Se algo der errado

| Problema | O que fazer |
|---|---|
| Telão não atualiza | Aperte **F5** na TV; confira se a janela preta continua aberta. |
| "Número já foi cantado" | Está tudo certo - o sistema só não deixa repetir bola na mesma rodada. |
| Fechei a janela preta sem querer | Dê dois cliques de novo em `Iniciar-Bingo.bat`. Nada se perde: rodada, números e ganhadores ficam salvos no banco. |
| Sem som no telão | Clique uma vez em qualquer lugar da página do telão e confira o botão **🔊** no canto. |
