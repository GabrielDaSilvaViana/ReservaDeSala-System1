/*
 * InnovaRoom — ESP32 das solenoides (trava das chaves)
 * ---------------------------------------------------------------------------
 * Até 3 solenoides. Cada uma tem um relé e um micro switch:
 *
 *                   relé (IN)          micro switch
 *   Solenoide 1:   D33 (GPIO 33)      D32 (GPIO 32)    ← a que já está montada
 *   Solenoide 2:   D26 (GPIO 26)      D25 (GPIO 25)
 *   Solenoide 3:   D13 (GPIO 13)      D27 (GPIO 27)
 *
 * As solenoides 2 e 3 já ficam prontas: funcionam assim que forem ligadas
 * nesses pinos. Enquanto não estiverem ligadas, nada acontece com elas e a
 * solenoide 1 funciona igual. NÃO ligue nada no D12.
 *
 * Como cada solenoide funciona (o micro switch indica se a chave está no lugar):
 *
 *   Switch PRESSIONADO = chave no lugar       Switch LIVRE = sem chave
 *
 *   1. Normalmente a solenoide fica TRAVADA (sem energia).
 *   2. O sistema manda destravar (POST /unlock?s=N) → solenoide DESTRAVA para
 *      o professor tirar a chave.
 *   3. Quando a chave é retirada (switch fica LIVRE), a solenoide continua
 *      destravada por TEMPO_APOS_RETIRAR_MS (3 s) e TRAVA sozinha.
 *   4. Se ninguém tirar a chave em TEMPO_PARA_RETIRAR_MS (10 s), TRAVA sozinha.
 *   5. Ao devolver a chave, o switch fica pressionado e a solenoide continua
 *      travada.
 *
 * Devolução da chave (POST /return?s=N, depois de ler o QR code no sistema):
 *   1. Só funciona se o switch estiver LIVRE (sem chave no lugar).
 *   2. A solenoide DESTRAVA para o professor colocar a chave.
 *   3. Quando a chave aperta o switch, a solenoide TRAVA (depois de
 *      TEMPO_APOS_DEVOLVER_MS, para a chave assentar).
 *   4. Se ninguém colocar a chave em TEMPO_PARA_DEVOLVER_MS (20 s), TRAVA sozinha.
 *
 * Endpoints HTTP (porta 80). "s" = número da solenoide (1 a 3); sem "s" vale a 1.
 *   GET  /health  → estado da solenoide 1 (locked, keyPresent...) e de todas em "solenoids"
 *   POST /unlock?s=1&durationMs=10000  → destrava (durationMs = prazo para tirar a chave)
 *   POST /lock?s=1                     → trava na hora
 *   POST /return?s=1&durationMs=20000  → destrava para DEVOLVER a chave (409 se a chave já estiver no lugar)
 *
 * Segurança: se ESP32_TOKEN (secrets.h) não estiver vazio, /unlock, /lock e
 * /return só aceitam o cabeçalho  X-Token: <ESP32_TOKEN>  (o servidor envia
 * sozinho quando ESP32_TOKEN está no .env).
 *
 * Leitor de digital DY50 (opcional, USAR_DY50 = 1):
 *   POST /fingerprint/scan         → começa a esperar um dedo  → {"op":N}
 *   POST /fingerprint/enroll?id=X  → cadastra a digital no ID X (2 leituras)
 *   GET  /fingerprint/status       → resultado da última operação
 *   POST /fingerprint/cancel       |  POST /fingerprint/delete?id=X
 *   A leitura roda aos poucos dentro do loop(), sem travar as solenoides.
 *   Precisa da biblioteca "Adafruit Fingerprint Sensor Library"
 *   (Arduino IDE → Ferramentas → Gerenciar Bibliotecas).
 *   Ligação: V+ → 5V (ou VIN) do ESP32 (NÃO no 3V3) | GND → GND
 *            TX do DY50 → RX2 (GPIO 16) | RX do DY50 → TX2 (GPIO 17)
 *
 * Teste pelo Monitor Serial (115200):
 *   1, 2 ou 3 = destravar essa solenoide | 0 = travar todas | i = status
 *   d = devolver chave na solenoide 1 (d2 / d3 = nas outras)
 *   l = ler digital (teste) | r = procurar o DY50 de novo
 *
 * Wi-Fi e token ficam em secrets.h (mesma pasta deste arquivo).
 */
#include <WiFi.h>
#include <WebServer.h>
#include "secrets.h"

// ─── Leitor de digital DY50 ─────────────────────────────────────────────────
// 1 = usa o DY50 (precisa da biblioteca Adafruit Fingerprint Sensor Library)
// 0 = sem leitor (compila sem a biblioteca; a solenoide funciona igual)
#define USAR_DY50 1

#if USAR_DY50
#include <Adafruit_Fingerprint.h>
const int DY50_RX_PIN = 16;          // ESP32 RX2  ← fio TX do DY50
const int DY50_TX_PIN = 17;          // ESP32 TX2  → fio RX do DY50
const uint32_t DY50_BAUD = 57600;    // velocidade padrão do DY50
// Se não responder em 57600, o ESP32 tenta estas outras velocidades
// e também os fios invertidos (16 <-> 17), e avisa no Monitor Serial.
const uint32_t DY50_BAUDS_EXTRA[] = {9600, 115200, 19200, 38400};
HardwareSerial dy50Serial(2);
Adafruit_Fingerprint finger(&dy50Serial);
bool dy50SerialAberta = false;
#endif

// ─── Solenoides: pinos e ajustes de hardware ────────────────────────────────
// A solenoide 1 é a que já está montada (D33 e D32) — NÃO mude esses pinos.
const int NUM_SOLENOIDES = 3;
const int PINO_RELE[NUM_SOLENOIDES]   = {33, 26, 13};   // IN do relé de cada solenoide
const int PINO_SWITCH[NUM_SOLENOIDES] = {32, 25, 27};   // micro switch (INPUT_PULLUP, outra ponta no GND)

// Como o pino do relé deve ficar em cada situação. Opções: PINO_LOW, PINO_HIGH, PINO_SOLTO
// Ajuste com o resultado do sketch esp32/teste_rele/teste_rele.ino:
//   ESTADO_TRAVADO    = o estado do teste em que a solenoide ficou SOLTA (travada)
//   ESTADO_DESTRAVADO = o estado do teste em que a solenoide ficou PUXADA (destravada)
// Vale para os 3 relés (use o mesmo modelo de módulo relé nos três).
enum EstadoPino { PINO_LOW, PINO_HIGH, PINO_SOLTO };
// Resultado do teste na montagem atual: LOW = solta (travada); HIGH e SOLTO = puxada.
const EstadoPino ESTADO_TRAVADO    = PINO_LOW;
const EstadoPino ESTADO_DESTRAVADO = PINO_HIGH;

// Nível lido quando o switch está PRESSIONADO (= chave no lugar).
// HIGH = switch ligado no contato NF (normalmente fechado) — é o caso da montagem atual.
// Se o "i" mostrar "LIVRE (sem chave)" com a chave no lugar, troque para LOW.
const int SWITCH_PRESSED_LEVEL = HIGH;

// ─── Tempos (em milissegundos) ──────────────────────────────────────────────
const unsigned long TEMPO_PARA_RETIRAR_MS = 10000;  // prazo para tirar a chave depois de destravar
const unsigned long TEMPO_APOS_RETIRAR_MS = 3000;   // fica destravada mais 3 s depois que a chave sai
const unsigned long MAX_PRAZO_PARAM_MS = 30000;     // maior durationMs aceito pelo /unlock
const unsigned long TEMPO_PARA_DEVOLVER_MS = 20000; // prazo para colocar a chave na devolução
const unsigned long TEMPO_APOS_DEVOLVER_MS = 500;   // chave apertou o switch: espera assentar e trava
const unsigned long MAX_PRAZO_DEVOLVER_MS = 60000;  // maior durationMs aceito pelo /return
const unsigned long SWITCH_DEBOUNCE_MS = 50;
const unsigned long WIFI_RECONNECT_MS = 10000;

WebServer server(80);

// ─── Estado de cada solenoide ───────────────────────────────────────────────
// (fica aqui em cima porque a Arduino IDE cria as declarações das funções antes
//  da primeira função do arquivo)
struct Trava {
  bool ativa;                    // true = destravada (bobina ligada)
  unsigned long prazo;           // fim do prazo para tirar (ou colocar) a chave
  unsigned long chaveSaiuEm;     // retirada: quando a chave saiu (0 = ainda não saiu)
  bool devolucao;                // true = destravada para DEVOLVER a chave
  unsigned long chaveEntrouEm;   // devolução: quando a chave apertou o switch
  bool chaveNoLugar;             // leitura do switch com debounce
  bool switchBruto;
  unsigned long switchMudouEm;
};
Trava travas[NUM_SOLENOIDES];

unsigned long lastWifiAttempt = 0;
unsigned long devolucaoPendenteEm = 0;   // Monitor Serial: recebeu "d", esperando o número

// ─── Estado do leitor DY50 ──────────────────────────────────────────────────
// (fica aqui em cima porque a Arduino IDE cria as declarações das funções antes
//  da primeira função do arquivo, e elas usam o tipo EstadoDigital)
enum EstadoDigital { DIG_OCIOSO, DIG_LENDO, DIG_CAD_1, DIG_CAD_TIRAR, DIG_CAD_2 };
EstadoDigital digEstado = DIG_OCIOSO;
bool leitorOk = false;                 // DY50 respondeu na inicialização?
uint32_t digOp = 0;                    // número da operação atual (o servidor confere)
int digIdAlvo = 0;                     // ID usado no cadastro
unsigned long digInicio = 0;
unsigned long digUltimaConsulta = 0;
const char* digResultado = "ocioso";   // ocioso | aguardando | ok | nao_encontrada | tempo_esgotado | erro | concluido | cancelado
const char* digEtapa = "";             // coloque_dedo | retire_dedo | coloque_novamente | processando
const char* digMotivo = "";            // motivo do erro (o servidor traduz)
int digIdResultado = -1;
bool digTesteSerial = false;           // leitura pedida pelo Monitor Serial
const unsigned long DIG_TEMPO_LEITURA_MS = 10000;
const unsigned long DIG_TEMPO_CADASTRO_MS = 45000;
const unsigned long DIG_INTERVALO_MS = 150;

// ─── Micro switch ───────────────────────────────────────────────────────────
bool readSwitchRaw(int i) {
  return digitalRead(PINO_SWITCH[i]) == SWITCH_PRESSED_LEVEL;
}

void updateSwitch(int i) {
  Trava& t = travas[i];
  bool raw = readSwitchRaw(i);
  if (raw != t.switchBruto) {
    t.switchBruto = raw;
    t.switchMudouEm = millis();
  }
  if (millis() - t.switchMudouEm >= SWITCH_DEBOUNCE_MS && t.chaveNoLugar != raw) {
    t.chaveNoLugar = raw;
    Serial.print("[SWITCH ");
    Serial.print(i + 1);
    Serial.print("] ");
    Serial.println(t.chaveNoLugar ? "PRESSIONADO (chave no lugar)" : "LIVRE (sem chave)");
  }
}

// ─── Relé / solenoide ───────────────────────────────────────────────────────
void aplicarEstado(int pino, EstadoPino estado) {
  if (estado == PINO_SOLTO) {
    pinMode(pino, INPUT);                      // pino desconectado
  } else {
    digitalWrite(pino, estado == PINO_HIGH ? HIGH : LOW);
    pinMode(pino, OUTPUT);
    digitalWrite(pino, estado == PINO_HIGH ? HIGH : LOW);
  }
}

void writeRelay(int i, bool destravar) {
  aplicarEstado(PINO_RELE[i], destravar ? ESTADO_DESTRAVADO : ESTADO_TRAVADO);
}

void lockSolenoid(int i, const char* motivo) {
  Trava& t = travas[i];
  writeRelay(i, false);
  t.ativa = false;
  t.prazo = 0;
  t.chaveSaiuEm = 0;
  t.devolucao = false;
  t.chaveEntrouEm = 0;
  Serial.print("[SOLENOIDE ");
  Serial.print(i + 1);
  Serial.print("] TRAVADA - ");
  Serial.println(motivo);
}

void unlockSolenoid(int i, unsigned long prazoMs) {
  Trava& t = travas[i];
  writeRelay(i, true);
  t.ativa = true;
  t.devolucao = false;
  t.prazo = millis() + prazoMs;
  t.chaveSaiuEm = t.chaveNoLugar ? 0 : millis();   // se já estiver sem chave, começa a contar os 3 s
  Serial.print("[SOLENOIDE ");
  Serial.print(i + 1);
  Serial.print("] DESTRAVADA - prazo para tirar a chave: ");
  Serial.print(prazoMs / 1000);
  Serial.println(" s");
}

// Devolução: destrava (com a mesma função de sempre) e marca o modo devolução.
// Quem trava é atualizarTrava(), quando a chave apertar o switch ou o prazo acabar.
void iniciarDevolucao(int i, unsigned long prazoMs) {
  unlockSolenoid(i, prazoMs);
  travas[i].devolucao = true;
  travas[i].chaveEntrouEm = 0;
  Serial.print("[DEVOLUCAO ");
  Serial.print(i + 1);
  Serial.print("] Coloque a chave no lugar (");
  Serial.print(prazoMs / 1000);
  Serial.println(" s). Ao apertar o switch, a solenoide trava.");
}

// O que cada solenoide faz sozinha (chamado no loop() para cada uma)
void atualizarTrava(int i) {
  Trava& t = travas[i];
  if (!t.ativa) return;
  unsigned long agora = millis();

  // ── Devolução da chave: trava quando a chave apertar o switch ──
  if (t.devolucao) {
    if (t.chaveNoLugar) {
      if (t.chaveEntrouEm == 0) {
        t.chaveEntrouEm = agora;
        Serial.print("[DEVOLUCAO ");
        Serial.print(i + 1);
        Serial.println("] Chave colocada. Travando...");
      } else if (agora - t.chaveEntrouEm >= TEMPO_APOS_DEVOLVER_MS) {
        lockSolenoid(i, "chave devolvida");
      }
    } else {
      t.chaveEntrouEm = 0;   // a chave saiu antes de travar: espera de novo
      if ((long)(agora - t.prazo) >= 0) {
        lockSolenoid(i, "ninguem devolveu a chave no prazo");
      }
    }
    return;
  }

  if (!t.chaveNoLugar) {
    // A chave saiu: espera 3 s e trava
    if (t.chaveSaiuEm == 0) {
      t.chaveSaiuEm = agora;
      Serial.print("[SWITCH ");
      Serial.print(i + 1);
      Serial.println("] Chave retirada: travando em 3 segundos...");
    } else if (agora - t.chaveSaiuEm >= TEMPO_APOS_RETIRAR_MS) {
      lockSolenoid(i, "chave retirada");
    }
    return;
  }

  // Chave ainda no lugar (ou foi colocada de volta): cancela a contagem
  t.chaveSaiuEm = 0;

  // Ninguém tirou a chave dentro do prazo
  if ((long)(agora - t.prazo) >= 0) {
    lockSolenoid(i, "ninguem retirou a chave no prazo");
  }
}

// ─── Leitor de digital DY50: máquina de estados (não bloqueia o loop) ──────

void digFinalizar(const char* resultado, int id, const char* motivo) {
  digEstado = DIG_OCIOSO;
  digResultado = resultado;
  digIdResultado = id;
  digMotivo = motivo;
  digEtapa = "";
  Serial.print("[DIGITAL] ");
  Serial.print(resultado);
  if (id >= 0) {
    Serial.print(" (ID ");
    Serial.print(id);
    Serial.print(")");
  }
  if (strlen(motivo)) {
    Serial.print(" - ");
    Serial.print(motivo);
  }
  Serial.println();
  digTesteSerial = false;
}

void digIniciar(EstadoDigital estado, int idAlvo) {
  digOp++;
  digEstado = estado;
  digIdAlvo = idAlvo;
  digInicio = millis();
  digUltimaConsulta = 0;
  digResultado = "aguardando";
  digEtapa = "coloque_dedo";
  digMotivo = "";
  digIdResultado = -1;
}

void atualizarDigital() {
#if USAR_DY50
  if (digEstado == DIG_OCIOSO) return;
  unsigned long agora = millis();
  if (agora - digUltimaConsulta < DIG_INTERVALO_MS) return;
  digUltimaConsulta = agora;

  unsigned long limite = (digEstado == DIG_LENDO) ? DIG_TEMPO_LEITURA_MS : DIG_TEMPO_CADASTRO_MS;
  if (agora - digInicio > limite) {
    digFinalizar("tempo_esgotado", -1, "");
    return;
  }

  uint8_t p;
  switch (digEstado) {
    case DIG_LENDO:
      if (finger.getImage() != FINGERPRINT_OK) return;              // ainda sem dedo
      if (finger.image2Tz(1) != FINGERPRINT_OK) return;             // imagem ruim: tenta de novo
      p = finger.fingerFastSearch();
      if (p == FINGERPRINT_OK) digFinalizar("ok", finger.fingerID, "");
      else if (p == FINGERPRINT_NOTFOUND) digFinalizar("nao_encontrada", -1, "");
      else digFinalizar("erro", -1, "falha_busca");
      return;

    case DIG_CAD_1:
      if (finger.getImage() != FINGERPRINT_OK) return;
      if (finger.image2Tz(1) != FINGERPRINT_OK) return;
      // Não deixa cadastrar um dedo que já pertence a outro ID
      p = finger.fingerFastSearch();
      if (p == FINGERPRINT_OK && finger.fingerID != digIdAlvo) {
        digFinalizar("erro", finger.fingerID, "ja_cadastrada");
        return;
      }
      digEstado = DIG_CAD_TIRAR;
      digEtapa = "retire_dedo";
      Serial.println("[DIGITAL] Retire o dedo");
      return;

    case DIG_CAD_TIRAR:
      if (finger.getImage() != FINGERPRINT_NOFINGER) return;
      digEstado = DIG_CAD_2;
      digEtapa = "coloque_novamente";
      Serial.println("[DIGITAL] Coloque o mesmo dedo novamente");
      return;

    case DIG_CAD_2:
      if (finger.getImage() != FINGERPRINT_OK) return;
      if (finger.image2Tz(2) != FINGERPRINT_OK) return;
      digEtapa = "processando";
      p = finger.createModel();
      if (p == FINGERPRINT_ENROLLMISMATCH) { digFinalizar("erro", -1, "nao_confere"); return; }
      if (p != FINGERPRINT_OK) { digFinalizar("erro", -1, "falha_modelo"); return; }
      p = finger.storeModel(digIdAlvo);
      if (p == FINGERPRINT_OK) digFinalizar("concluido", digIdAlvo, "");
      else digFinalizar("erro", -1, "falha_salvar");
      return;

    default:
      return;
  }
#endif
}

#if USAR_DY50
// Abre a serial do DY50 com os pinos/velocidade dados e pergunta se ele responde.
bool testarDy50(int rx, int tx, uint32_t baud) {
  if (dy50SerialAberta) {
    dy50Serial.end();
    delay(20);
  }
  dy50Serial.begin(baud, SERIAL_8N1, rx, tx);
  dy50SerialAberta = true;
  delay(100);
  while (dy50Serial.available()) dy50Serial.read();  // descarta lixo da linha
  return finger.verifyPassword();
}

bool tentarDy50(int rx, int tx, uint32_t baud) {
  Serial.print("[DIGITAL]   RX=GPIO");
  Serial.print(rx);
  Serial.print(" TX=GPIO");
  Serial.print(tx);
  Serial.print(" ");
  Serial.print(baud);
  Serial.print(" baud... ");
  bool ok = testarDy50(rx, tx, baud);
  Serial.println(ok ? "RESPONDEU" : "sem resposta");
  return ok;
}
#endif

void iniciarLeitorDigital() {
#if USAR_DY50
  leitorOk = false;
  Serial.println("[DIGITAL] Procurando o leitor DY50...");
  delay(500);  // o DY50 leva um tempo para ligar

  int rx = DY50_RX_PIN, tx = DY50_TX_PIN;
  uint32_t baud = DY50_BAUD;

  // 1) Ligação e velocidade padrão (3 tentativas)
  for (int i = 0; i < 3 && !leitorOk; i++) leitorOk = tentarDy50(rx, tx, baud);

  // 2) Fios invertidos, velocidade padrão
  if (!leitorOk) {
    rx = DY50_TX_PIN; tx = DY50_RX_PIN;
    leitorOk = tentarDy50(rx, tx, baud);
  }

  // 3) Outras velocidades, nas duas ordens de fios
  const int nExtra = sizeof(DY50_BAUDS_EXTRA) / sizeof(DY50_BAUDS_EXTRA[0]);
  for (int i = 0; i < nExtra && !leitorOk; i++) {
    baud = DY50_BAUDS_EXTRA[i];
    rx = DY50_RX_PIN; tx = DY50_TX_PIN;
    leitorOk = tentarDy50(rx, tx, baud);
    if (!leitorOk) {
      rx = DY50_TX_PIN; tx = DY50_RX_PIN;
      leitorOk = tentarDy50(rx, tx, baud);
    }
  }

  if (leitorOk) {
    Serial.print("[DIGITAL] Leitor DY50: ENCONTRADO (RX=GPIO");
    Serial.print(rx);
    Serial.print(", TX=GPIO");
    Serial.print(tx);
    Serial.print(", ");
    Serial.print(baud);
    Serial.println(" baud)");
    if (rx != DY50_RX_PIN) {
      Serial.println("[DIGITAL] Aviso: os fios TX/RX estao invertidos em relacao ao guia, mas funciona assim.");
    }
  } else {
    // Volta para a configuração padrão, para o comando 'r' tentar de novo depois
    testarDy50(DY50_RX_PIN, DY50_TX_PIN, DY50_BAUD);
    Serial.println("[DIGITAL] Leitor DY50: NAO ENCONTRADO");
    Serial.println("[DIGITAL]   1) V+ do DY50 no pino 5V (ou VIN) do ESP32, nao no 3V3");
    Serial.println("[DIGITAL]   2) GND do DY50 no GND do ESP32");
    Serial.println("[DIGITAL]   3) TX do DY50 no GPIO16 (RX2) e RX do DY50 no GPIO17 (TX2)");
    Serial.println("[DIGITAL]   4) A luz do sensor pisca ao ligar? Se nao, e alimentacao.");
    Serial.println("[DIGITAL]   Depois de arrumar, digite r no Monitor Serial para procurar de novo.");
  }
#endif
}

// ─── Rotas HTTP ─────────────────────────────────────────────────────────────
bool authorized() {
  if (strlen(ESP32_TOKEN) == 0) return true;
  return server.header("X-Token") == ESP32_TOKEN;
}

// Lê ?s=1..3 (sem "s" = solenoide 1). Devolve o índice (0..2) ou -1 se for inválido.
int solenoideDaRequisicao() {
  if (!server.hasArg("s")) return 0;
  long s = server.arg("s").toInt();
  if (s < 1 || s > NUM_SOLENOIDES) return -1;
  return (int)s - 1;
}

void handleHealth() {
  Trava& t1 = travas[0];
  String json = "{\"ok\":true,\"device\":\"esp32-solenoid\",\"locked\":";
  json += t1.ativa ? "false" : "true";
  json += ",\"keyPresent\":";
  json += t1.chaveNoLugar ? "true" : "false";
  json += ",\"keyInUse\":";
  json += t1.chaveNoLugar ? "false" : "true";
  json += ",\"returnMode\":";
  json += (t1.ativa && t1.devolucao) ? "true" : "false";
  json += ",\"fingerprint\":";
  json += leitorOk ? "true" : "false";
  json += ",\"solenoids\":[";
  for (int i = 0; i < NUM_SOLENOIDES; i++) {
    Trava& t = travas[i];
    if (i > 0) json += ",";
    json += "{\"id\":";
    json += i + 1;
    json += ",\"locked\":";
    json += t.ativa ? "false" : "true";
    json += ",\"keyPresent\":";
    json += t.chaveNoLugar ? "true" : "false";
    json += ",\"keyInUse\":";
    json += t.chaveNoLugar ? "false" : "true";
    json += ",\"returnMode\":";
    json += (t.ativa && t.devolucao) ? "true" : "false";
    json += "}";
  }
  json += "]}";
  server.send(200, "application/json", json);
}

void handleUnlock() {
  if (!authorized()) {
    server.send(401, "text/plain", "TOKEN_INVALIDO");
    return;
  }
  int i = solenoideDaRequisicao();
  if (i < 0) {
    server.send(400, "text/plain", "SOLENOIDE_INVALIDA");
    return;
  }
  unsigned long prazo = TEMPO_PARA_RETIRAR_MS;
  if (server.hasArg("durationMs")) {
    long valor = server.arg("durationMs").toInt();
    if (valor >= 3000 && valor <= (long)MAX_PRAZO_PARAM_MS) prazo = (unsigned long)valor;
  }
  Serial.print("[HTTP] /unlock solenoide ");
  Serial.println(i + 1);
  unlockSolenoid(i, prazo);
  server.send(200, "text/plain", "UNLOCK_OK");
}

void handleReturn() {
  if (!authorized()) {
    server.send(401, "text/plain", "TOKEN_INVALIDO");
    return;
  }
  int i = solenoideDaRequisicao();
  if (i < 0) {
    server.send(400, "text/plain", "SOLENOIDE_INVALIDA");
    return;
  }
  if (travas[i].chaveNoLugar) {
    // A chave já está no lugar: não há o que devolver (e não destrava)
    server.send(409, "text/plain", "CHAVE_JA_NO_LUGAR");
    return;
  }
  unsigned long prazo = TEMPO_PARA_DEVOLVER_MS;
  if (server.hasArg("durationMs")) {
    long valor = server.arg("durationMs").toInt();
    if (valor >= 3000 && valor <= (long)MAX_PRAZO_DEVOLVER_MS) prazo = (unsigned long)valor;
  }
  Serial.print("[HTTP] /return solenoide ");
  Serial.println(i + 1);
  iniciarDevolucao(i, prazo);
  server.send(200, "text/plain", "RETURN_OK");
}

void handleLock() {
  if (!authorized()) {
    server.send(401, "text/plain", "TOKEN_INVALIDO");
    return;
  }
  int i = solenoideDaRequisicao();
  if (i < 0) {
    server.send(400, "text/plain", "SOLENOIDE_INVALIDA");
    return;
  }
  Serial.print("[HTTP] /lock solenoide ");
  Serial.println(i + 1);
  lockSolenoid(i, "comando /lock");
  server.send(200, "text/plain", "LOCK_OK");
}

// ─── Rotas HTTP do leitor de digital ────────────────────────────────────────
bool podeUsarLeitor() {
  if (!authorized()) {
    server.send(401, "application/json", "{\"motivo\":\"token\"}");
    return false;
  }
  if (!leitorOk) {
    server.send(503, "application/json", "{\"motivo\":\"leitor_ausente\"}");
    return false;
  }
  if (digEstado != DIG_OCIOSO) {
    server.send(409, "application/json", "{\"motivo\":\"ocupado\"}");
    return false;
  }
  return true;
}

void responderOp() {
  server.send(200, "application/json", String("{\"op\":") + digOp + "}");
}

void handleFpScan() {
  if (!podeUsarLeitor()) return;
  digIniciar(DIG_LENDO, 0);
  Serial.println("[DIGITAL] Aguardando dedo para leitura...");
  responderOp();
}

void handleFpEnroll() {
  if (!podeUsarLeitor()) return;
  long id = server.hasArg("id") ? server.arg("id").toInt() : 0;
  if (id < 1 || id > 1000) {
    server.send(400, "application/json", "{\"motivo\":\"id_invalido\"}");
    return;
  }
  digIniciar(DIG_CAD_1, (int)id);
  Serial.print("[DIGITAL] Cadastro no ID ");
  Serial.print(id);
  Serial.println(": coloque o dedo");
  responderOp();
}

void handleFpDelete() {
  if (!podeUsarLeitor()) return;
  long id = server.hasArg("id") ? server.arg("id").toInt() : 0;
  if (id < 1 || id > 1000) {
    server.send(400, "application/json", "{\"motivo\":\"id_invalido\"}");
    return;
  }
#if USAR_DY50
  uint8_t p = finger.deleteModel((uint16_t)id);
  server.send(p == FINGERPRINT_OK ? 200 : 500, "application/json", p == FINGERPRINT_OK ? "{\"ok\":true}" : "{\"motivo\":\"falha_apagar\"}");
#endif
}

void handleFpCancel() {
  if (!authorized()) {
    server.send(401, "application/json", "{\"motivo\":\"token\"}");
    return;
  }
  if (digEstado != DIG_OCIOSO) digFinalizar("cancelado", -1, "");
  server.send(200, "application/json", "{\"ok\":true}");
}

void handleFpStatus() {
  if (!authorized()) {
    server.send(401, "application/json", "{\"motivo\":\"token\"}");
    return;
  }
  String json = String("{\"op\":") + digOp;
  json += ",\"estado\":\"";
  json += digResultado;
  json += "\",\"etapa\":\"";
  json += digEtapa;
  json += "\",\"motivo\":\"";
  json += digMotivo;
  json += "\",\"id\":";
  json += digIdResultado;
  json += ",\"leitor\":";
  json += leitorOk ? "true" : "false";
  json += "}";
  server.send(200, "application/json", json);
}

void handleNotFound() {
  server.send(404, "text/plain", "NAO_ENCONTRADO");
}

// ─── Wi-Fi ──────────────────────────────────────────────────────────────────
void connectWifi() {
  Serial.print("[WIFI] Conectando em ");
  Serial.println(WIFI_SSID);
  WiFi.mode(WIFI_STA);
  WiFi.setSleep(false);   // sem economia de energia: responde aos comandos na hora
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("[WIFI] Conectado! IP: ");
    Serial.println(WiFi.localIP());
    Serial.println("[WIFI] Coloque esse IP em ESP32_HOST no arquivo .env do servidor.");
  } else {
    Serial.println("[WIFI] Nao conectou. Tentando de novo em segundo plano.");
  }
  lastWifiAttempt = millis();
}

// ─── Diagnóstico pelo Monitor Serial ────────────────────────────────────────
void printStatus() {
  Serial.println("------ STATUS ------");
  Serial.print("Wi-Fi: ");
  Serial.println(WiFi.status() == WL_CONNECTED ? "CONECTADO" : "DESCONECTADO");
  Serial.print("Rede: ");
  Serial.println(WIFI_SSID);
  Serial.print("IP do ESP32 (coloque no .env em ESP32_HOST): ");
  Serial.println(WiFi.localIP());
  for (int i = 0; i < NUM_SOLENOIDES; i++) {
    Trava& t = travas[i];
    Serial.print("Solenoide ");
    Serial.print(i + 1);
    Serial.print(" (rele GPIO ");
    Serial.print(PINO_RELE[i]);
    Serial.print(", switch GPIO ");
    Serial.print(PINO_SWITCH[i]);
    Serial.print("): ");
    Serial.print(t.ativa ? (t.devolucao ? "DESTRAVADA (devolucao da chave)" : "DESTRAVADA") : "TRAVADA");
    Serial.print(" | switch ");
    Serial.println(t.chaveNoLugar ? "PRESSIONADO (chave no lugar)" : "LIVRE (sem chave)");
  }
  Serial.print("Token: ");
  Serial.println(strlen(ESP32_TOKEN) ? "configurado" : "desativado");
  Serial.print("Leitor DY50: ");
#if USAR_DY50
  if (leitorOk) {
    finger.getTemplateCount();
    Serial.print("ENCONTRADO (");
    Serial.print(finger.templateCount);
    Serial.println(" digitais cadastradas)");
  } else {
    Serial.println("NAO ENCONTRADO");
  }
#else
  Serial.println("desativado (USAR_DY50 = 0)");
#endif
  Serial.println("--------------------");
}

void pedirDevolucaoSerial(int i) {
  if (travas[i].chaveNoLugar) {
    Serial.print("[DEVOLUCAO ");
    Serial.print(i + 1);
    Serial.println("] A chave ja esta no lugar (switch pressionado).");
  } else {
    iniciarDevolucao(i, TEMPO_PARA_DEVOLVER_MS);
  }
}

void handleSerial() {
  while (Serial.available()) {
    char c = Serial.read();
    // "d" seguido de 1, 2 ou 3 = devolução nessa solenoide ("d" sozinho = solenoide 1)
    if (devolucaoPendenteEm) {
      devolucaoPendenteEm = 0;
      if (c >= '1' && c < '1' + NUM_SOLENOIDES) {
        pedirDevolucaoSerial(c - '1');
        continue;
      }
      pedirDevolucaoSerial(0);
    }
    if (c >= '1' && c < '1' + NUM_SOLENOIDES) {
      Serial.print("[TESTE] Destravando a solenoide ");
      Serial.print(c);
      Serial.println("...");
      unlockSolenoid(c - '1', TEMPO_PARA_RETIRAR_MS);
    } else if (c == 'd' || c == 'D') {
      devolucaoPendenteEm = millis() ? millis() : 1;
    } else if (c == '0') {
      for (int i = 0; i < NUM_SOLENOIDES; i++) lockSolenoid(i, "teste pelo Serial");
    } else if (c == 'i' || c == 'I') {
      printStatus();
    } else if (c == 'l' || c == 'L') {
      if (!leitorOk) {
        Serial.println("[DIGITAL] Leitor DY50 nao encontrado.");
      } else if (digEstado != DIG_OCIOSO) {
        Serial.println("[DIGITAL] Leitor ocupado.");
      } else {
        digIniciar(DIG_LENDO, 0);
        digTesteSerial = true;
        Serial.println("[DIGITAL] Coloque o dedo no leitor (10 s)...");
      }
    } else if (c == 'r' || c == 'R') {
#if USAR_DY50
      if (digEstado != DIG_OCIOSO) {
        Serial.println("[DIGITAL] Leitor ocupado. Tente de novo em alguns segundos.");
      } else {
        iniciarLeitorDigital();
      }
#else
      Serial.println("[DIGITAL] Leitor desativado (USAR_DY50 = 0).");
#endif
    }
  }
  // Recebeu só "d" (sem Enter e sem número): devolução na solenoide 1
  if (devolucaoPendenteEm && millis() - devolucaoPendenteEm > 1500) {
    devolucaoPendenteEm = 0;
    pedirDevolucaoSerial(0);
  }
}

// ─── Setup / Loop ───────────────────────────────────────────────────────────
void setup() {
  // PRIMEIRA coisa: todas as solenoides travadas ao ligar a placa
  for (int i = 0; i < NUM_SOLENOIDES; i++) writeRelay(i, false);
  for (int i = 0; i < NUM_SOLENOIDES; i++) pinMode(PINO_SWITCH[i], INPUT_PULLUP);

  Serial.begin(115200);
  delay(500);

  for (int i = 0; i < NUM_SOLENOIDES; i++) {
    travas[i].switchBruto = travas[i].chaveNoLugar = readSwitchRaw(i);
    travas[i].switchMudouEm = millis();
    lockSolenoid(i, "inicializacao");
  }

  Serial.println();
  Serial.println("=== InnovaRoom - ESP32 Solenoides ===");
  iniciarLeitorDigital();
  connectWifi();

  const char* headers[] = {"X-Token"};
  server.collectHeaders(headers, 1);
  server.on("/", HTTP_GET, handleHealth);
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/unlock", HTTP_POST, handleUnlock);
  server.on("/lock", HTTP_POST, handleLock);
  server.on("/return", HTTP_POST, handleReturn);
  server.on("/fingerprint/scan", HTTP_POST, handleFpScan);
  server.on("/fingerprint/enroll", HTTP_POST, handleFpEnroll);
  server.on("/fingerprint/delete", HTTP_POST, handleFpDelete);
  server.on("/fingerprint/cancel", HTTP_POST, handleFpCancel);
  server.on("/fingerprint/status", HTTP_GET, handleFpStatus);
  server.onNotFound(handleNotFound);
  server.begin();
  Serial.println("[HTTP] Servidor iniciado na porta 80");
  Serial.println("Comandos no Monitor Serial: 1/2/3 = destravar | 0 = travar todas | d (d2, d3) = devolver chave | i = status | l = ler digital | r = procurar DY50");
  printStatus();
}

void loop() {
  server.handleClient();
  for (int i = 0; i < NUM_SOLENOIDES; i++) updateSwitch(i);
  handleSerial();
  atualizarDigital();

  // Reconecta o Wi-Fi se a conexão cair
  if (WiFi.status() != WL_CONNECTED && millis() - lastWifiAttempt > WIFI_RECONNECT_MS) {
    Serial.println("[WIFI] Conexao perdida. Reconectando...");
    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    lastWifiAttempt = millis();
  }

  // Avisa no Serial quando o Wi-Fi conectar (o IP pode mudar a cada conexão)
  static bool wasConnected = false;
  bool connected = WiFi.status() == WL_CONNECTED;
  if (connected && !wasConnected) {
    Serial.print("[WIFI] Conectado. IP: ");
    Serial.println(WiFi.localIP());
  }
  wasConnected = connected;

  // Cada solenoide trava sozinha (chave retirada, devolvida ou prazo esgotado)
  for (int i = 0; i < NUM_SOLENOIDES; i++) atualizarTrava(i);
}
