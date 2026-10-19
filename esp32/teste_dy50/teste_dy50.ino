/*
 * InnovaRoom - Teste do leitor de digital DY50
 *
 * Sketch só para diagnóstico: descobre se o ESP32 enxerga o DY50,
 * em quais pinos e em qual velocidade. Depois fica lendo o dedo.
 *
 * Como usar:
 *   1. Grave este sketch no ESP32 (precisa da "Adafruit Fingerprint Sensor Library").
 *   2. Abra o Monitor Serial em 115200.
 *   3. Leia o resultado. Se encontrar, coloque o dedo no sensor para testar.
 *   4. Depois grave de novo o solenoid_arduino.ino.
 *
 * Ligação esperada:
 *   DY50 V+  -> 5V (ou VIN) do ESP32     (NÃO use o 3V3)
 *   DY50 GND -> GND do ESP32
 *   DY50 TX  -> GPIO 16 (RX2)
 *   DY50 RX  -> GPIO 17 (TX2)
 */
#include <Adafruit_Fingerprint.h>

const int PINO_A = 16;
const int PINO_B = 17;
const uint32_t VELOCIDADES[] = {57600, 9600, 115200, 19200, 38400};

// Mantém a solenoide travada durante o teste (mesmo ajuste do solenoid_arduino.ino)
const int SOLENOID_PIN = 33;

HardwareSerial dy50Serial(2);
Adafruit_Fingerprint finger(&dy50Serial);
bool aberta = false;
bool encontrado = false;

bool testar(int rx, int tx, uint32_t baud) {
  if (aberta) {
    dy50Serial.end();
    delay(20);
  }
  dy50Serial.begin(baud, SERIAL_8N1, rx, tx);
  aberta = true;
  delay(100);
  while (dy50Serial.available()) dy50Serial.read();
  Serial.print("  RX=GPIO");
  Serial.print(rx);
  Serial.print(" TX=GPIO");
  Serial.print(tx);
  Serial.print(" ");
  Serial.print(baud);
  Serial.print(" baud... ");
  bool ok = finger.verifyPassword();
  Serial.println(ok ? "RESPONDEU" : "sem resposta");
  return ok;
}

void procurar() {
  encontrado = false;
  Serial.println();
  Serial.println("Procurando o DY50...");
  const int n = sizeof(VELOCIDADES) / sizeof(VELOCIDADES[0]);
  for (int i = 0; i < n && !encontrado; i++) {
    if (testar(PINO_A, PINO_B, VELOCIDADES[i])) {
      encontrado = true;
      Serial.println(">> ENCONTRADO com a ligacao certa (TX do DY50 no 16, RX do DY50 no 17).");
    } else if (testar(PINO_B, PINO_A, VELOCIDADES[i])) {
      encontrado = true;
      Serial.println(">> ENCONTRADO, mas com os fios invertidos (TX do DY50 no 17, RX do DY50 no 16).");
      Serial.println("   O solenoid_arduino.ino aceita assim mesmo, mas o ideal e trocar os fios.");
    }
  }

  if (!encontrado) {
    Serial.println();
    Serial.println(">> DY50 NAO RESPONDEU em nenhuma combinacao. Confira:");
    Serial.println("   1) A luz (azul/vermelha) do sensor pisca quando o ESP32 liga?");
    Serial.println("      Nao pisca = problema de alimentacao: V+ no 5V/VIN e GND no GND.");
    Serial.println("   2) Os fios de sinal estao nos pinos 16 e 17 (RX2/TX2)?");
    Serial.println("   3) Conectores bem encaixados (o cabo do DY50 e fino e solta facil).");
    Serial.println("   4) Se a placa for ESP32-WROVER, os pinos 16/17 sao da memoria PSRAM:");
    Serial.println("      use outros pinos (ex.: 25 e 26) e ajuste aqui e no solenoid_arduino.ino.");
    Serial.println("Digite r para procurar de novo.");
    return;
  }

  if (finger.getParameters() == FINGERPRINT_OK) {
    Serial.print("   Capacidade: ");
    Serial.print(finger.capacity);
    Serial.println(" digitais");
  }
  finger.getTemplateCount();
  Serial.print("   Digitais cadastradas: ");
  Serial.println(finger.templateCount);
  Serial.println();
  Serial.println("Coloque o dedo no sensor para testar a leitura. (r = procurar de novo)");
}

void setup() {
  pinMode(SOLENOID_PIN, OUTPUT);
  digitalWrite(SOLENOID_PIN, LOW);  // solenoide travada

  Serial.begin(115200);
  delay(1500);  // tempo para o DY50 ligar e para abrir o Monitor Serial
  Serial.println();
  Serial.println("=== InnovaRoom - Teste do DY50 ===");
  procurar();
}

void loop() {
  while (Serial.available()) {
    char c = Serial.read();
    if (c == 'r' || c == 'R') procurar();
  }
  if (!encontrado) return;

  uint8_t p = finger.getImage();
  if (p == FINGERPRINT_NOFINGER) {
    delay(100);
    return;
  }
  if (p != FINGERPRINT_OK) {
    Serial.println("Erro de comunicacao ao ler a imagem.");
    delay(500);
    return;
  }

  Serial.print("Dedo detectado. ");
  if (finger.image2Tz() != FINGERPRINT_OK) {
    Serial.println("Imagem ruim, tente de novo.");
  } else if (finger.fingerFastSearch() == FINGERPRINT_OK) {
    Serial.print("Digital cadastrada: ID ");
    Serial.print(finger.fingerID);
    Serial.print(" (confianca ");
    Serial.print(finger.confidence);
    Serial.println(")");
  } else {
    Serial.println("Leitura OK, mas essa digital nao esta cadastrada (normal se ainda nao cadastrou).");
  }

  // espera tirar o dedo
  while (finger.getImage() == FINGERPRINT_OK) delay(100);
}
