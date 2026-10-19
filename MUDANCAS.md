# InnovaRoom 2.0 — O que mudou

Este arquivo explica tudo o que foi corrigido e reorganizado no projeto. **O visual não mudou:** cores, fontes, cards, modais e layout continuam os mesmos, porque o `style.css` original foi mantido. Só foram acrescentadas 4 cores de selo no histórico (Concluída, Cancelada, Não utilizada e Desocupação Forçada).

---

## 1. Como rodar a versão nova (passo a passo)

1. Substitua a pasta antiga por esta. O `node_modules` já vem junto. Se der erro, rode `npm install`.
2. Confira o arquivo **`.env`**. Ele já vem com os valores que estavam escritos no código antigo: senha do MySQL `root123456` e ESP32 em `10.110.22.30`.
3. Recrie o banco (o formato mudou, então o banco antigo não serve mais):
   ```bash
   npm run banco:recriar
   ```
4. Rode `npm start` e abra **http://localhost:3000**.
5. Para entrar como administrador: usuário `admin`, senha `admin123`. Troque a senha em *Painel → Alterar senha*.
6. **Opcional:** rode `npm run modelos` uma vez, com internet, para o reconhecimento facial funcionar offline no dia da apresentação.

---

## 2. Nova organização das pastas

| Antes | Agora | Por quê |
|---|---|---|
| `script.js` (3.124 linhas) | `public/js/` com 12 arquivos, um por tela | Fica fácil achar e explicar cada parte |
| `server.js` (572 linhas, tudo junto) | `server.js` + `src/config.js`, `src/db.js`, `src/servicos/*`, `src/rotas/*` | Separação em camadas: rotas → regras → banco |
| `Index.html`, `style.css`, `image.png` na raiz | `public/index.html`, `public/style.css`, `public/image.png` | Só a pasta `public` fica acessível pelo navegador |
| `database.sql` | `database/database.sql` | — |
| `solenoid_arduino.ino` na raiz | `esp32/solenoid_arduino/solenoid_arduino.ino` + `secrets.h` | A Arduino IDE exige a pasta com o mesmo nome; a senha do Wi-Fi saiu do código |
| `dy50/` com 9 `.txt` | `docs/HARDWARE.md` (um guia só) + `public/dy50/` | Os `.txt` contradiziam o código |
| Senhas no código | Arquivo `.env` (modelo em `.env.example`) | Nenhuma senha fica no código-fonte |
| — | `tests/api.test.js` (15 testes automatizados) | Prova que as regras funcionam (`npm test`) |
| — | `scripts/criar-banco.js` e `scripts/baixar-modelos-faciais.js` | Comandos `npm run banco:recriar` e `npm run modelos` |

---

## 3. Correções críticas (o sistema não funcionava direito)

### 3.1 O `database.sql` falhava no meio
- **Problema:** a reserva inicial usava a sala `L319`, que no banco se chamava `S319`. O `INSERT` inteiro das reservas dava erro.
- **Solução:** o script foi reescrito. Todas as referências usam subconsultas que dão erro na hora se a sala não existir. O script foi executado de ponta a ponta nos testes.

### 3.2 Códigos de sala diferentes no JS e no banco
- **Problema:** o JS tinha `L319–L322` e `L330`; o banco tinha `S319–S322` e não tinha `L330`. Arrastar aula para a agenda dava "Sala não encontrada".
- **Solução:** o banco virou a **única fonte** de salas, professores, turmas e grade. O front não tem mais listas fixas. As salas usam os códigos do JS (`L319–L322`, `L330`), porque eram os usados na grade.

### 3.3 Uma sala só podia ter UMA reserva
- **Problema:** a reserva ficava gravada na própria sala (`rooms.status`, `professor`, `data`...). Reservar a S224 para a semana seguinte deixava ela "Reservada" hoje e bloqueada para qualquer horário. O servidor também não verificava conflito: uma reserva nova sobrescrevia até uma sala ocupada.
- **Solução:**
  - Nova tabela **`reservas`**, com várias reservas por sala.
  - A situação da sala (Disponível / Reservada / Ocupada / Evento) é **calculada** pela data e hora atuais.
  - O servidor bloqueia, com mensagem clara:
    - horário que bate com outra reserva ou evento da mesma sala;
    - professor reservando duas salas ao mesmo tempo;
    - horário em que a sala tem **aula fixa na grade** (o professor da própria aula pode usar o horário dele).
  - As reservas usam transação com trava da sala (`SELECT ... FOR UPDATE`), então duas pessoas reservando no mesmo segundo não geram duplicidade.

### 3.4 Eventos não eram salvos como evento
- **Problema:** "Adicionar Evento" e o arrastar da grade usavam a rota de reserva comum. Em 5 segundos o evento virava "Reservada" e o nome sumia.
- **Solução:** rota própria `POST /api/eventos`, só para o admin, com verificação de conflito.

### 3.5 Edições da grade se perdiam em 5 segundos
- **Problema:** adicionar ou remover aula só mudava a memória do navegador. A atualização automática apagava tudo, e a grade grande do JS sumia porque o banco só tinha 2 aulas.
- **Solução:** todas as 46 aulas estão no banco. Adicionar, remover, substituir e arrastar salvam pela API (`/api/grade`). As constraints `UNIQUE` impedem professor ou sala com duas aulas no mesmo horário.

### 3.6 Dependência `node-fetch` faltando e timeout do ESP32 quebrado
- **Problema:** o `server.js` usava `node-fetch`, que não estava no `package.json`. A versão que vinha "por acaso" (2.1.2) não suporta cancelamento, então o timeout do ESP32 nunca funcionava.
- **Solução:** passou a usar o `fetch` nativo do Node com `AbortSignal.timeout`. Testado com um ESP32 simulado: responde, recusa token errado e dá timeout em 0,8 s.

### 3.7 Histórico de Reservas
- **Problema:**
  - o código comparava o tipo `'reserva'`, mas o banco gravava `'reservada'`;
  - o ID aparecia para todos;
  - o card "Reservas ativas" ficava sempre em 0;
  - reservas apareciam com o selo "pending";
  - a busca perdia o foco a cada letra.
- **Solução:**
  - o código `RES-00001` agora é enviado **pelo servidor só para o admin** (a coluna ID some para os outros);
  - status corretos;
  - a página é montada uma vez e só a tabela é redesenhada, então a busca funciona normalmente.

### 3.8 Ocupar a sala nunca acionava o hardware e aparecia como "Ocupação Forçada"
- **Problema:** a ocupação normal usava a rota de ocupação forçada, com o crachá fixo `'SIMULACAO'`.
- **Solução:**
  - rota própria `POST /api/reservas/:id/ocupar`, que valida o professor da reserva;
  - com `SOLENOIDE_MODO=hardware`, o ESP32 é acionado automaticamente;
  - o botão **Hardware** da tela reenvia o comando;
  - só ocupações feitas pelo admin aparecem como "Ocupação Forçada".

### 3.9 Firmware do ESP32 não fazia o que a documentação dizia
- **Problema:** a contagem de 5 s nunca era usada (a trava fechava na hora em que o switch estava solto) e o timeout cortava mesmo com o switch pressionado.
- **Solução:** a lógica foi reescrita: destrava, e quando a chave é retirada (switch livre) espera 3 s e trava; se ninguém tirar a chave em 10 s, trava sozinha (veja `docs/HARDWARE.md`). Também foram adicionados:
  - verificação de token (`X-Token`);
  - debounce de verdade;
  - reconexão automática do Wi-Fi;
  - Wi-Fi sem modo de economia (o comando chega na hora);
  - solenoide sempre travada ao ligar a placa;
  - comandos de teste pelo Monitor Serial (`1`, `0`, `i`).

---

## 4. Segurança

| Problema antes | Como ficou |
|---|---|
| Senha do admin `admin123` escrita no JS e mostrada na tela ("Dica: admin123") | Login no servidor, senha guardada como hash **scrypt**, sessão por token, bloqueio após 5 tentativas erradas, opção de trocar a senha |
| Qualquer pessoa podia chamar a API e abrir a porta (`/api/solenoid/unlock`) | Rotas de admin exigem login. Destravar exige o "ticket" gerado quando o professor ocupa a sala com a identidade validada (vale 5 min) |
| O servidor publicava a pasta inteira: dava para baixar `server.js`, `database.sql` e o `.ino` com a **senha do Wi-Fi do SENAI** | Só a pasta `public/` é publicada (há teste automático para isso) |
| Reconhecimento facial falso: comparava o brilho de uma grade 8×8 da imagem inteira e **qualquer imagem passava** | Usa o **face-api.js de verdade**: detecta o rosto e gera um descritor de 128 números. A **comparação é feita no servidor** (distância < 0,5). Também recusa quando há mais de um rosto na câmera e não deixa o mesmo rosto em dois professores |
| O botão "Registrar rosto" ficava na tela de autenticação, então qualquer um se cadastrava como qualquer professor | Cadastro só no **primeiro acesso** (professor sem nenhuma credencial) ou pelo admin |
| Digitar o crachá de outro professor **renomeava o dono do crachá** | O crachá, a digital e o rosto são exclusivos por professor. Tentar usar o de outro dá erro 409 |
| Crachá e digital salvos em texto puro | Salvos como hash SHA-256 |
| `/api/authenticate` sempre respondia `allow: true` | Substituída por `/api/porta/digital`, que exige o token do dispositivo e uma reserva válida para aquela sala naquele horário |
| Ocupação Forçada aparecia para qualquer usuário, com crachá `12345` pré-preenchido e aceitando crachá inexistente | Só para o admin, que escolhe o professor. Fica registrada no histórico |
| Nomes e descrições digitados eram inseridos como HTML (XSS) | Todo texto passa pela função `esc()` antes de ir para a tela (há teste disso) |
| ESP32 aceitava `/unlock` de qualquer um na rede | Token `X-Token` (configure `ESP32_TOKEN` nos dois lados) |
| Senha do MySQL e do Wi-Fi no código | `.env` e `secrets.h`, ambos no `.gitignore` |
| — | Log de auditoria (`logs_acesso`): reservas, ocupações, desocupações, tentativas de credencial erradas, ações do admin |

---

## 5. Outros bugs corrigidos

- O título do topo não voltava para "Dashboard" depois de visitar a Agenda ou o Histórico.
- Ao desocupar, a tela mostrava o professor como **"null"**.
- O card continuava vermelho depois de desocupar; agora atualiza na hora.
- A Agenda mostrava "null/MM/AAAA" depois de trocar de mês.
- O calendário da reserva só mostrava o mês atual; agora navega até 12 meses.
- Era possível reservar um horário que já passou; agora o servidor e a tela bloqueiam.
- A liberação automática de salas rodava no navegador (sem página aberta, nada acontecia) e só para salas "ocupadas". Agora roda **no servidor a cada 30 s**:
  - ocupação que passou do horário → concluída;
  - reserva que ninguém ocupou → **"Não utilizada"**;
  - evento que terminou → concluído.
- "Solicitar Mudança" dizia que a sala atual ficaria reservada, mas liberava. Agora:
  - o texto está correto;
  - a mudança exige a identidade do professor (antes qualquer um mudava);
  - só aparecem salas livres naquele horário;
  - a reserva mantém o mesmo ID.
- O botão de Ocupação Forçada disparava duas vezes (dois listeners).
- O botão Cancelar da ocupação forçada abria o painel de admin escondido.
- O select de professor da aba Grade do admin mostrava o professor errado selecionado.
- O filtro "Turma" da grade escolhia um professor qualquer que tivesse a turma; agora filtra pela turma de verdade.
- Arrastar a grade para a Agenda era impossível, porque o modal do admin cobria o calendário. Agora há um painel **"Arrastar aula da grade"** dentro da própria Agenda (só para o admin).
- Datas viravam o dia seguinte depois das 21h (o uso de `toISOString()` convertia para UTC); agora tudo usa o horário local.
- Erros do banco apareciam crus para o usuário; agora as mensagens são amigáveis e o detalhe vai só para o console do servidor.
- O banner vermelho de erro de JavaScript aparecia para o usuário; agora só aparece abrindo com `?debug` no endereço.
- Na tela de sala, o campo "Bloco" mostrava "T" ou "2"; agora mostra o andar.
- `Index.html` com "I" maiúsculo dava 404 em servidor Linux; agora é `index.html`.

---

## 6. Melhorias adicionadas

- **Aba "Professores" no painel do admin:** cadastrar professor e cadastrar, trocar ou remover crachá, digital e rosto (com câmera).
- **Alterar a senha do admin** pelo painel.
- **Desocupação forçada** pelo admin, registrada no histórico (item que estava pendente na sua lista).
- Novos status no histórico: Concluída, Cancelada, Não utilizada, Ocupação Forçada, Desocupação Forçada e Grade Fixa.
- Ao escolher o dia da reserva, a tela mostra **os horários já ocupados** naquele dia (reservas e aulas fixas).
- O card da sala reservada mostra o horário da reserva. A tela da sala mostra as outras reservas do dia e o botão **"Reservar outro horário"**.
- **Primeiro acesso:** o professor sem credencial cadastra a primeira usada, sem depender do admin.
- Bloqueio temporário depois de 5 credenciais erradas seguidas.
- A ocupação só é liberada a partir de **30 min antes** do horário da reserva. O valor pode ser mudado em `OCUPACAO_ANTECEDENCIA_MIN`.
- Botões ficam desativados enquanto a ação roda (evita clique duplo). A tecla Esc fecha os modais.
- Se o MySQL estiver desligado ou a senha estiver errada, o servidor explica o que fazer ao iniciar.
- Menu de andares gerado automaticamente a partir das salas do banco.

---

## 7. Itens da sua lista (`Lista do que adicionar e mudar Tcc.txt`)

| Item | Situação |
|---|---|
| Segurança ao desocupar (PIN/digital) | ✅ Agora valida de verdade no servidor (crachá, digital ou rosto do professor que ocupou) |
| Desocupação forçada que aparece no histórico | ✅ **Feito** ("Desocupação Forçada" no histórico) |
| Tela de admin maior | ✅ Mantido |
| Arrastar bloco da grade para a data | ✅ **Agora funciona de verdade** (painel na Agenda) |
| Tipo do evento no histórico | ✅ Mantido |
| ID só para admin | ✅ **Corrigido** (antes estava quebrado) |
| Mostrar salas ocupadas nos cards | ✅ Mantido |
| Tirar o ID da tela da sala | ✅ Também removido da confirmação e da Agenda para quem não é admin |
| Tempo mínimo baseado no horário | ⚠️ Continua um mínimo fixo (5 min, ajustável em `RESERVA_MIN_MINUTOS`), agora validado também no servidor. A regra "depende do horário" não ficou clara para implementar; me explique o que você quer |
| Andares com a faixa de números das salas | ⏳ Não feito (você disse que pediria depois). O menu de andares já é montado pelo banco, então ficou fácil adicionar |

---

## 8. Decisões que você precisa conferir

1. **Códigos das salas:** usei `L319, L320, L321, L322` e `L330` (como no JS). Se o certo for `S319...`, mude no `database/database.sql`.
2. **Andar das salas:** mantive exatamente o que aparecia na tela antes. As salas `S3xx` (S304, S305, S306, L307, L310, L318, S323, S324, L329, L332, S333) estão no **1º andar**, e a lista de "transferidas" no 2º andar. A antiga lista tinha `L323` e `L324`, que não existem. Para mudar, edite a coluna `andar` no SQL.
3. **Banco novo:** as tabelas mudaram de nome (`salas`, `reservas`, `professores`, `grade_semanal`, `turmas`, `logs_acesso`, `admins`). As antigas são apagadas pelo script.
4. **Stored procedures** (`sp_reservar_sala` etc.) foram removidas. As regras agora ficam no Node, com transações, porque precisam verificar conflitos e credenciais. Se o professor da banca valorizar procedures, dá para recriar algumas.
5. **Reservas de exemplo:** são criadas com datas relativas ao dia em que você roda o script (hoje às 19:00 e às 20:40, amanhã, daqui a 3 dias e algumas no passado para o histórico).
6. **Micro switch:** considerei que "pressionado = chave em uso", como estava no código antigo. Se for o contrário no seu circuito, troque `SWITCH_PRESSED_LEVEL` no `.ino`.

---

## 9. Arquivos removidos

- **`face-fallback.js`:** o "reconhecimento" falso. Substituído pelo `face-api.js` real (`public/js/facial.js`).
- **`face-api.min.js`:** era um arquivo vazio de 2 linhas. A biblioteca real vem do pacote `face-api.js` já instalado.
- **`dy50/*.txt` (9 arquivos):** substituídos por `docs/HARDWARE.md`.
- **`dy50/download_drivers.ps1`:** apontava para `example.com`. O DY50 é serial (UART) e não usa driver de Windows.
- **`dy50/dy50_fallback.js`:** juntado ao `public/dy50/dy50_integration.js`.
- **`biometry-ui.css`:** movido para `public/dy50/`.
- **Código morto do `script.js`:** `gerarSalasSenai` (status aleatórios), `devolverChave`, `openNovaReserva`, `salasA/salasB`, `statusPool`, logs `DEBUG`.

---

## 10. Como foi testado

- **15 testes automatizados da API:** `npm test`, com o banco criado a partir do próprio `database.sql`. Eles cobrem:
  - primeiro acesso;
  - crachá errado e crachá de outro professor;
  - conflitos de sala, de professor e de grade;
  - datas e horários inválidos;
  - ocupar, desocupar e mudar de sala;
  - ticket da solenoide;
  - login de admin e permissões;
  - eventos;
  - ocupação e desocupação forçadas;
  - grade;
  - reconhecimento facial;
  - leitor da porta;
  - expiração automática;
  - arquivos que não podem ser publicados.
- **Teste completo no navegador (Chromium):** reservar, errar o crachá, ocupar, desocupar, Agenda, Histórico (busca e ID), Grade, login de admin, adicionar aula (persistiu depois da atualização), criar evento (e conferir que continua evento), ocupação e desocupação forçadas, arrastar da grade para a Agenda. Nenhum erro de JavaScript.
- **Fluxo facial no navegador:** testado com detector simulado (cadastro no primeiro acesso, rosto diferente recusado, rosto certo aceito).
- **Comunicação com o ESP32:** testada contra um ESP32 simulado (sucesso, token errado, timeout e dispositivo desligado).
- **Firmware:** compilado contra cabeçalhos simulados para verificar a sintaxe.
- **Visual:** capturas de tela de antes e depois de todas as telas, para garantir o mesmo layout.

### O que eu não consegui testar aqui (teste no seu computador)
- **MySQL real:** o ambiente onde trabalhei não tinha MySQL. Os testes usam SQLite com o mesmo script. O SQL foi escrito para MySQL 8 e revisado, mas rode `npm run banco:recriar` e me avise se aparecer qualquer erro.
- **Reconhecimento facial com câmera e modelos reais:** os modelos precisam de internet (`npm run modelos`).
- **ESP32 físico:** grave o firmware novo e teste com o `curl` do `docs/HARDWARE.md`.

---

## 11. Limitações conhecidas (bom saber para a banca)

- O reconhecimento facial **não detecta foto** (não tem "prova de vida"). Uma foto impressa do professor pode enganar a câmera. Em produção seria preciso uma câmera com sensor de profundidade ou um teste de piscar.
- **Crachá e digital digitados** na tela simulam os leitores físicos. A integração real da digital é pela rota `/api/porta/digital`, com o ESP32 e o DY50.
- **Ícones e fonte** vêm da internet (Font Awesome e Google Fonts), como antes. Sem internet, os ícones somem, mas o sistema funciona.
- A câmera só abre em `http://localhost`. Acessando de outro computador pelo IP, use crachá ou digital, ou configure https.

---

## 12. Atualização: destrave automático e leitor de digital DY50

### Solenoide
- Ao chegar na tela da chave, a solenoide **destrava sozinha**; não precisa apertar nada.
- A tela acompanha o **estado real** da trava pelo ESP32: "Chave liberada", "Chave retirada" e "Solenoide travada".
- Se o professor não pegar a chave a tempo, o botão **"Destravar novamente"** destrava de novo. Ele vale por 5 minutos depois da ocupação.
- `SOLENOIDE_MODO` ganhou o valor `auto` (padrão): usa o ESP32 sempre que `ESP32_HOST` estiver preenchido.
- O firmware da solenoide **não foi alterado**. A lógica (pinos LOW/HIGH, switch, 10 s / 3 s) continua idêntica à versão que funcionou.

### Leitor de digital DY50 (antes não funcionava)
- **Antes:** o sistema só tinha um campo onde se digitava um "código da digital". Nenhum código lia o sensor de verdade.
- **Agora:**
  - o DY50 é ligado ao mesmo ESP32 (GPIO 16/17) e lido pela biblioteca Adafruit Fingerprint;
  - o administrador cadastra a digital pelo painel (Professores → Credenciais → "Cadastrar no leitor DY50");
  - o professor só escolhe **Digital** e coloca o dedo.
- A leitura roda em segundo plano no ESP32, sem travar a solenoide (testado em simulação as duas coisas ao mesmo tempo).
- **Segurança:** o servidor lê o dedo e entrega um token de uso único. O número da digital nunca passa pelo navegador.
- O mesmo dedo não pode ser cadastrado para duas pessoas.
- Remover a digital no painel apaga também do DY50.
- **Sem o DY50 ligado:** o ESP32 avisa "leitor não encontrado" e a solenoide continua funcionando. `USAR_DY50 0` compila sem a biblioteca.

### Reconhecimento facial
- Conferido: a biblioteca carrega e tem todas as funções usadas, e os nomes dos arquivos dos modelos batem com o que ela procura.
- Para funcionar de verdade, precisa:
  1. rodar `npm run modelos` uma vez, com internet;
  2. abrir o sistema por `http://localhost:3000`, porque o navegador só libera a câmera em localhost ou https.
- O primeiro uso de um professor sem credencial cadastra o rosto. Também é possível cadastrar pelo painel (Credenciais → "Capturar e salvar rosto").

### Testes novos
- 5 testes automáticos com um ESP32 simulado (`tests/hardware.test.js`): destrave automático, "destravar novamente", cadastro e leitura da digital, token de uso único, dedo desconhecido, leitor desconectado e remoção.
- **Simulação do firmware**, com relógio e sensor falsos: 26 cenários, todos passando.
- **Teste no navegador** do fluxo completo: cadastrar a digital → reservar com a digital → dedo errado recusado → ocupar → destrava sozinha → trava → "Destravar novamente".

## 13. Correção: DY50 não encontrado pelo ESP32

### Causa mais provável: alimentação
- A versão anterior deste guia dizia "na dúvida, comece com 3,3 V". **Isso estava errado.**
- O DY50 trabalha entre **3,6 V e 6 V**. No pino 3V3 ele não liga direito e não responde.
- **Correção:** ligar o V+ do DY50 no pino **5V (ou VIN)** do ESP32. Os sinais TX/RX continuam direto nos GPIO 16 e 17.

### Firmware (`solenoid_arduino.ino`)
- **Detecção automática.** Ao ligar, o ESP32:
  - espera o DY50 ligar;
  - tenta 3 vezes em 57600 baud;
  - depois tenta os fios invertidos (16 ↔ 17) e as velocidades 9600, 115200, 19200 e 38400.
- Cada tentativa aparece no Monitor Serial. No fim mostra a combinação que funcionou ou uma lista do que conferir.
- **Novo comando `r`** no Monitor Serial: procura o leitor de novo, sem reiniciar a placa.
- A solenoide **não foi alterada**:
  - foram conferidas por comparação de texto as funções `aplicarEstado`, `writeRelay`, `lockSolenoid`, `unlockSolenoid` e o `loop`;
  - também foram conferidos os ajustes LOW/HIGH e do switch;
  - a busca roda depois de a solenoide já estar travada.

### Novo sketch de diagnóstico: `esp32/teste_dy50/teste_dy50.ino`
- Testa todas as combinações de pinos e velocidades e diz se os fios estão invertidos.
- Mostra quantas digitais estão cadastradas e lê o dedo em tempo real.
- Mantém a solenoide travada durante o teste.

### Outros
- `docs/HARDWARE.md`:
  - tabela de ligação corrigida (5V);
  - nova seção "Leitor DY50: NAO ENCONTRADO", passo a passo.
- A mensagem do sistema para leitor ausente agora diz para ligar no 5V e usar o comando `r`.

### Como foi testado
- **Simulação do firmware:** 35 cenários, todos passando. São os 26 anteriores mais 9 de detecção: fios invertidos, outras velocidades, leitor ausente, e a solenoide e a leitura funcionando depois de procurar de novo.
- **Compilação:** conferida também no modo da Arduino IDE (declarações automáticas) e com `USAR_DY50 0`.

## 14. Alterações pedidas (19/10)

### Salas sem as siglas S e L
- As salas agora aparecem só com o número, por exemplo "129 INFORMÁTICA" em vez de "S129 INFORMÁTICA".
- **Banco que já existe:** não precisa recriar. Ao ligar o servidor (`npm start`), as siglas são removidas sozinhas e aparece a mensagem `Siglas S/L removidas de 38 sala(s)`.
  - Reservas, histórico, grade e credenciais continuam iguais, porque são ligados ao id da sala e não ao código.
  - Isso acontece só na primeira vez; depois não muda mais nada.
- **Banco novo** (`npm run banco:recriar`): já é criado sem as siglas.

### Agenda: histórico e atividades do dia trocados de lugar
- **Painel pequeno ao lado do calendário:** agora mostra o **Histórico de Reservas**, em cartões compactos com páginas (4 por página), mais recentes primeiro.
- **Parte de baixo (onde ficava o histórico):** mostra o que acontece no **dia clicado no calendário**:
  - **Reservas e eventos** do dia; clicar numa linha abre os detalhes;
  - **Aulas da grade** daquele dia da semana (horário, sala, turma e professor).

### Sem botão de confirmar ao retirar e repor a chave
- **Retirar a chave:** a tela da solenoide não tem mais o botão "Concluir".
  - Quando a chave é retirada e a solenoide trava de novo, a tela mostra "Tudo certo!" e **fecha sozinha** em 3 segundos.
  - Se ninguém tirar a chave, a tela continua aberta com o botão **Destravar novamente**.
  - O "X" no canto fecha a tela a qualquer momento.
- **Repor a chave (desocupar a sala):** a tela "Sala Desocupada!" não tem mais o botão "Fechar" e **fecha sozinha** em 3 segundos.

### Professor pode criar eventos
- O botão **Adicionar Evento** aparece para todos:
  - sala livre: "Adicionar Evento";
  - sala reservada: "Adicionar evento em outro horário".
- O professor escolhe o próprio nome e valida a identidade (crachá, digital ou rosto), igual a uma reserva. O responsável do evento é sempre o professor identificado.
- Continuam valendo as mesmas regras de conflito: horários já reservados e aulas da grade de outro professor.
- Remover um evento continua sendo só do administrador. O administrador também continua podendo criar eventos com qualquer responsável.

### Botões de confirmação em verde
- Ficaram verdes:
  - Confirmar Horário, Confirmar Identidade, Confirmar ocupação, Desocupar, Confirmar Mudança e Confirmar Evento;
  - do painel do administrador: Confirmar Ocupação (forçada), Salvar Aula e Salvar nova senha.
- O resto da aparência não mudou.

### Como foi testado
- **22 testes automáticos passando.** São os 20 anteriores e 2 novos:
  - evento criado por professor: sem credencial, credencial errada, conflito de horário e log;
  - remoção das siglas num banco antigo: mantém as reservas ligadas e não duplica código.
- **Teste no navegador, com o ESP32 simulado:**
  - salas sem sigla;
  - professor criando evento com crachá (e crachá errado recusado);
  - botões verdes;
  - agenda invertida;
  - ocupar → tirar a chave → a tela fecha sozinha;
  - desocupar → a tela fecha sozinha.

## 15. Devolver a chave com QR code

### Como funciona
1. Botão **Devolver Chave**: fica no menu lateral (ícone de chave verde) e também na sala ocupada, ao lado de "Desocupar Sala".
2. **Câmera:**
   - a câmera abre e lê o QR code preso na chave;
   - a leitura é feita no próprio navegador, com a biblioteca jsQR, que agora vem junto no projeto (`public/lib`) e funciona sem internet;
   - se a câmera não ler, dá para digitar o código.
3. **Servidor:** confere de qual solenoide é o QR code e manda o ESP32 destravar no **modo devolução**.
4. **Colocar a chave:**
   - o professor coloca a chave, ela aperta o micro switch e a solenoide **trava**;
   - a tela acompanha ("Chave colocada" → "Chave devolvida!") e **fecha sozinha**.
5. **Ninguém colocou a chave:** em 20 s a solenoide trava sozinha e a tela oferece "Ler o QR code de novo".
6. **Chave já no lugar:** a solenoide **não destrava**. Assim ninguém consegue abrir a trava com o QR code para pegar uma chave guardada.

### QR codes e 3 solenoides
- Por enquanto existe **só a solenoide 1**. O QR code dela é `INNOVAROOM-SOLENOIDE-1`, já pronto para imprimir em `docs/qrcodes/qrcode-solenoide-1.png`.
- Um QR code diferente é recusado ("QR code não reconhecido") e o ESP32 nem é acionado.
- **Para as próximas 2 solenoides:**
  - já existe o lugar certo no código (`src/config.js`, `devolucao.qrcodes`): basta acrescentar `QRCODE_SOLENOIDE_2` e `QRCODE_SOLENOIDE_3` no `.env`;
  - também vai ser preciso dizer qual ESP32/pino cada uma usa. Essa parte fica para quando as solenoides chegarem.

### Firmware (`solenoid_arduino.ino`): grave de novo no ESP32
- **Nova rota `POST /return`** e **comando `d`** no Monitor Serial, para testar a devolução.
- A devolução é um **modo separado**, que trava quando a chave **entra**. Isso é o contrário da retirada, que trava 3 s depois que a chave **sai**.
- As funções da solenoide **não foram alteradas**: `aplicarEstado`, `writeRelay`, `lockSolenoid`, `unlockSolenoid`, a leitura do switch e toda a lógica da retirada (10 s / 3 s). Foi conferido por comparação de texto.
- O `/health` agora também informa `returnMode`.

### Como foi testado
- **Simulação do firmware: 54 cenários**, todos passando. Os novos:
  - chave já no lugar → 409 e não destrava;
  - sem chave → destrava e não trava em 3 s;
  - colocou a chave → trava;
  - encostou e tirou → espera de novo;
  - ninguém devolveu em 20 s → trava;
  - `/unlock` no meio da devolução vira retirada normal;
  - a retirada continua igual depois de uma devolução.
- **24 testes automáticos da API**, todos passando: QR certo, QR errado, chave já no lugar e log de acesso.
- **Teste no navegador com câmera simulada mostrando o QR code impresso:**
  - leitura real pela câmera;
  - destrave, chave colocada, trava e fechamento sozinho;
  - chave já no lugar;
  - ninguém colocou a chave;
  - QR de outra solenoide recusado;
  - código digitado.
- O QR code impresso também foi conferido com outro leitor (OpenCV).

## 16. Ao devolver a chave, a sala volta para "Reservada"

### O que mudou
- **Sala ocupada → Reservada:**
  - ao devolver a chave de uma sala ocupada, ela sai de **Ocupada** e volta para **Reservada**;
  - a reserva continua valendo até o horário de término;
  - na sala aparece "Chave: Devolvida · a reserva continua até HH:MM".
- **Botões na sala reservada:**
  - **Ocupar Sala**: ocupar de novo, liberando a chave com a identidade, como sempre;
  - **Desocupar Sala**: encerrar de vez a reserva, com a identidade do professor. A sala fica livre.
- **Qual sala:**
  - pelo botão **Devolver Chave** da sala ocupada, a sala já vem escolhida;
  - pelo menu lateral, a tela pergunta "Sala desta chave", com as salas ocupadas e a opção "Nenhuma sala (só guardar a chave)";
  - se houver só uma sala ocupada, ela já vem marcada.
- **Confirmação no ESP32:** a sala só volta para reservada depois que o servidor confere que a chave está no lugar e a solenoide travada. Isso usa um ticket da devolução, que vale uma vez só.
- **Fim do horário:** se ninguém desocupar, ao passar do horário a reserva fica **Concluída**, e não "Não utilizada".
- **Remoção pelo administrador:** se a reserva já foi usada, conta como "Desocupação Forçada", e não como "Cancelada".
- **Firmware:** sem mudanças nesta etapa. Vale o `solenoid_arduino.ino` da seção 15.

### Como foi testado
- **27 testes automáticos**, todos passando. Os novos:
  - devolver → reservada → ocupar de novo → devolver → desocupar;
  - ticket falso ou usado duas vezes é recusado;
  - reserva nunca ocupada não pode ser "desocupada";
  - no modo hardware, a sala só volta para reservada com a chave detectada;
  - fim do horário → concluída.
- **Teste no navegador (simulação e hardware):** ocupar → Devolver Chave → câmera lê o QR → "voltou para reservada" → a sala aparece como Reservada com Ocupar e Desocupar → desocupar → livre.
