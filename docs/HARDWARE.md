# Hardware: ESP32, solenoide, micro switch e leitor DY50

Este guia substitui os 9 arquivos `.txt` da antiga pasta `dy50/`. Aqueles arquivos descreviam um comportamento diferente do que o código fazia.

## 1. ESP32 + solenoide

### Ligação

| ESP32 | Ligado em |
|---|---|
| GPIO 33 | Entrada do módulo relé. O padrão é relé ativo em LOW (`RELAY_ACTIVE_LOW = true`). |
| GPIO 32 | Micro switch. A outra ponta vai no GND; o código usa o pull-up interno. |
| GND | GND comum com o módulo relé. |

A solenoide deve ser alimentada pela fonte própria, pelo contato do relé. Nunca alimente a solenoide direto pelo ESP32.

### Firmware

1. Abra `esp32/solenoid_arduino/solenoid_arduino.ino` na Arduino IDE.
2. Confira o arquivo `secrets.h` na mesma pasta, com o Wi-Fi e o token. O modelo é o `secrets.example.h`.
3. Grave no ESP32 e abra o **Monitor Serial** a 115200. Anote o IP que aparece.
4. No `.env` do servidor:
   ```
   ESP32_HOST=<IP mostrado no Monitor Serial>
   ESP32_TOKEN=<mesmo valor do secrets.h>
   SOLENOIDE_MODO=hardware
   DIGITAL_LEITOR=esp32
   ```

### Comportamento

O micro switch indica se a chave está no lugar: **pressionado = chave no lugar**, **livre = sem chave**.

1. Normalmente a solenoide fica **travada**, inclusive ao ligar a placa.
2. O professor ocupa a sala no sistema e a solenoide **destrava sozinha**. A tela acompanha o estado real da trava e tem o botão **Destravar novamente**, para quando não deu tempo de pegar a chave.
3. Quando a chave é retirada (switch fica livre), a solenoide continua destravada por **3 s** e **trava sozinha**.
4. Se ninguém tirar a chave em **10 s** (`SOLENOIDE_DURACAO_MS` no `.env`), ela trava sozinha.
5. Ao devolver a chave, o switch fica pressionado e a solenoide continua travada.

Os tempos ficam no começo do `.ino`, em `TEMPO_PARA_RETIRAR_MS` e `TEMPO_APOS_RETIRAR_MS`.

> O padrão é `SWITCH_PRESSED_LEVEL = HIGH` (switch no contato NF). Se o comando `i` mostrar "LIVRE (sem chave)" com a chave no lugar, troque para `LOW`.

### Rotas do ESP32

| Rota | Função |
|---|---|
| `GET /health` | Retorna `{"ok":true,"device":"esp32-solenoid","locked":true,"keyPresent":true,"keyInUse":false}` |
| `POST /unlock?durationMs=10000` | Destrava (durationMs = prazo para tirar a chave). Exige o cabeçalho `X-Token` quando o token está configurado. |
| `POST /lock` | Trava na hora. Também exige `X-Token`. |

### Teste rápido

Troque `<IP>` pelo IP do ESP32 e `<token>` pelo token configurado:

```bash
curl http://<IP>/health
curl -X POST -H "X-Token: <token>" "http://<IP>/unlock?durationMs=10000"
```

No sistema, depois de ocupar uma sala, a solenoide destrava sozinha. O botão **Destravar novamente** reenvia o comando (vale por 5 minutos depois da ocupação).

## 2. Leitor de digital DY50

O DY50 é um leitor de digital **serial (UART)**. Ele guarda as digitais dentro dele e devolve um **número (ID)** quando reconhece um dedo. Ele fica ligado no **mesmo ESP32** da solenoide.

### Ligação no ESP32

| DY50 | ESP32 |
|---|---|
| V+ / VCC (normalmente fio vermelho) | **5V** (ou **VIN**) do ESP32. **Não use o 3V3**: o DY50 trabalha entre 3,6 V e 6 V. |
| GND (normalmente fio preto) | GND |
| TX | **GPIO 16** (RX2) |
| RX | **GPIO 17** (TX2) |
| TOUCH / RESET | Não precisa ligar |

> TX de um vai no RX do outro. Os sinais TX/RX do DY50 são de 3,3 V, então podem ir direto no ESP32; só a alimentação vai no 5V.
>
> As cores dos fios variam entre fabricantes. Confira pelo nome escrito na plaquinha do DY50.

Ao ligar a placa, a luz do sensor deve **piscar**. Se não piscar, o problema é a alimentação.

O firmware procura o leitor sozinho ao ligar. Ele tenta 57600 baud (padrão), depois os fios invertidos (16 ↔ 17) e outras velocidades. No Monitor Serial aparece cada tentativa e, no fim, `Leitor DY50: ENCONTRADO (RX=GPIO16, TX=GPIO17, 57600 baud)`. Se encontrar com os fios invertidos, ele avisa, mas funciona assim mesmo.

### Programação

1. Na Arduino IDE: **Ferramentas → Gerenciar Bibliotecas**, procure e instale **"Adafruit Fingerprint Sensor Library"**.
2. Grave o `solenoid_arduino.ino`. No Monitor Serial deve aparecer `Leitor DY50: ENCONTRADO`. Depois de mexer nos fios, digite `r` para procurar de novo sem reiniciar.
3. Teste: digite `l` no Monitor Serial e coloque o dedo. Uma digital ainda não cadastrada aparece como `nao_encontrada`; uma cadastrada aparece com o ID.
4. Sem o DY50 ligado, mude `#define USAR_DY50 1` para `0`. Assim compila sem a biblioteca e a solenoide funciona igual.

### No sistema

No `.env`, deixe `DIGITAL_LEITOR=esp32` e reinicie o `npm start`.

1. **Cadastro (administrador):** abra **Painel do Administrador → Professores → Credenciais → "Cadastrar no leitor DY50"**. O professor coloca o dedo, retira e coloca **o mesmo dedo** de novo; a tela mostra cada passo. A digital fica salva no DY50 com o ID igual ao número do professor no sistema.
2. **Uso (professor):** nas telas de reservar, ocupar, desocupar e mudar de sala, escolha **Digital** e clique em confirmar. A tela pede para colocar o dedo no leitor.
3. **Remover:** o botão de lixeira da digital apaga do sistema **e** do DY50.

**Segurança:** o navegador nunca envia o número da digital. O servidor lê o DY50 e entrega um "token de leitura" que vale uma única vez por 2 minutos, então ninguém consegue se passar por outro professor digitando um número.

Para voltar à simulação (código digitado na tela), use `DIGITAL_LEITOR=manual` no `.env`.

### Leitor na porta (opcional, uso futuro)

O servidor também tem a rota `POST /api/porta/digital` (cabeçalho `X-Dispositivo-Token`, corpo `{"sala":"129","digital":"5"}`). Ela serve para um segundo ESP32 instalado na porta que leia a digital sozinho, sem o computador.

## 3. Solução de problemas

### A solenoide fica puxada (destravada) quando deveria estar travada
1. Grave o sketch **`esp32/teste_rele/teste_rele.ino`** e abra o Monitor Serial (115200). Ele repete 3 estados do GPIO 33, 5 s cada: **A = LOW**, **B = HIGH**, **C = SOLTO**.
2. Anote em qual estado a solenoide fica **solta (travada)** e em qual fica **puxada (destravada)**.
3. No `solenoid_arduino.ino`, ajuste as duas linhas e grave de novo:
   ```cpp
   const EstadoPino ESTADO_TRAVADO    = PINO_LOW;   // estado em que ficou SOLTA
   const EstadoPino ESTADO_DESTRAVADO = PINO_HIGH;  // estado em que ficou PUXADA
   ```
   Na montagem atual o resultado foi: A (LOW) solta; B (HIGH) e C (SOLTO) puxada.
   Como o pino fica "solto" por uma fração de segundo enquanto o ESP32 liga, coloque um **resistor de 10 kΩ entre o GPIO 33 e o GND**. Assim a solenoide não dá um "pulso" ao ligar a placa.
4. Se a solenoide ficar **puxada nos 3 estados**, o problema é a ligação, não o código:
   - **Se o LED do relé muda nos estados:** confira os contatos do relé (COM e NA).
   - **Se o LED do relé não muda:** confira o fio do GPIO 33 até o IN do relé e o GND comum.

### "Leitor DY50: NAO ENCONTRADO"
Faça nesta ordem:
1. **Alimentação.** O V+ do DY50 tem que estar no pino **5V** (ou VIN) do ESP32, não no 3V3. Ao ligar, a luz do sensor deve piscar. Se não piscar, nada abaixo vai resolver.
2. **GND** do DY50 no GND do ESP32.
3. **Sinais.** TX do DY50 no **GPIO 16 (RX2)** e RX do DY50 no **GPIO 17 (TX2)**. O firmware também testa invertido, então se só isso estiver errado ele encontra mesmo assim.
4. **Encaixe.** O cabinho do DY50 é fino e solta fácil. Confira se cada fio está firme no jumper.
5. **Teste isolado.** Grave o **`esp32/teste_dy50/teste_dy50.ino`**. Ele testa todas as combinações de pino e velocidade, mostra o resultado e lê o dedo. Depois grave de novo o `solenoid_arduino.ino`.
6. **Placa ESP32-WROVER.** Nela os pinos 16 e 17 são usados pela memória interna (PSRAM) e não servem para o DY50. Use outros pinos, por exemplo 25 e 26, e troque `DY50_RX_PIN` e `DY50_TX_PIN` no começo do `.ino` (e `PINO_A`/`PINO_B` no teste).

Depois de cada ajuste, digite `r` no Monitor Serial para procurar o leitor de novo.

### "Não foi possível comunicar com o ESP32"
1. No Monitor Serial, digite `i` e confira se o Wi-Fi aparece como **CONECTADO** e qual é o **IP**.
2. Coloque esse IP em `ESP32_HOST` no `.env` e **reinicie o `npm start`**. O IP pode mudar quando o ESP32 reconecta.
3. No computador do servidor, abra `http://<IP>/health` no navegador:
   - **Abriu:** a rede está ok; o problema é o `.env`. Confira `ESP32_HOST` e, se usar token, `ESP32_TOKEN` igual ao `secrets.h`.
   - **Não abriu:** o computador e o ESP32 não estão se enxergando. O computador precisa estar na **mesma rede** (`WIFI_IOT_CFP601`). Algumas redes isolam os aparelhos entre si (isolamento de clientes); se for o caso, use um roteador ou o hotspot do celular para os dois.
4. Para ver a mensagem exata do servidor, abra `http://localhost:3000/api/solenoide/status`.
