#include <WiFi.h>
#include <WebServer.h>

const char* WIFI_SSID = "WIFI_IOT_CFP601";
const char* WIFI_PASSWORD = "iot@senai601";

const int SOLENOID_PIN = 33;
// Ajuste este valor conforme o módulo de relé/solenoide:
// - true  => active low (ativa com LOW, desativa com HIGH)
// - false => active high (ativa com HIGH, desativa com LOW)
const bool RELAY_ACTIVE_LOW = true;
const int DEFAULT_UNLOCK_MS = 4000;

// ─── Micro Switch para feedback de estado ───────────────────────────────
const int MICRO_SWITCH_PIN = 32;  // GPIO 32 — detecta o estado real da trava
const bool SWITCH_PRESSED_LEVEL = LOW; // Ajuste conforme o hardware real:
                                      // LOW => switch pressionado = chave em uso
                                      // HIGH => switch pressionado = chave travada
bool switchState = false;            // false = liberado, true = pressionado
unsigned long lastSwitchRead = 0;
const unsigned long SWITCH_DEBOUNCE_MS = 50;

// ─── Controle condicional por micro switch ──────────────────────────────
unsigned long unlockRequestTime = 0;  // Momento em que /unlock foi chamado
unsigned long switchReleaseTime = 0;   // Momento em que o switch foi liberado
const unsigned long RELEASE_COUNTDOWN_MS = 5000;  // 5s após soltar o switch
bool isControlledBySwitch = false;     // Flag: solenoide está em modo "aguardar liberação"
unsigned long unlockDurationMs = DEFAULT_UNLOCK_MS;

WebServer server(80);

// Variáveis para controlar o solenoide sem bloquear
unsigned long solenoidEndTime = 0;
bool solenoidActive = false;

bool isSwitchPressed() {
  return digitalRead(MICRO_SWITCH_PIN) == SWITCH_PRESSED_LEVEL;
}

void setSolenoidState(bool enabled) {
  const int activeLevel = RELAY_ACTIVE_LOW ? LOW : HIGH;
  const int inactiveLevel = RELAY_ACTIVE_LOW ? HIGH : LOW;

  digitalWrite(SOLENOID_PIN, enabled ? activeLevel : inactiveLevel);
  solenoidActive = enabled;

  Serial.print("[SOLENOID] Estado: ");
  Serial.print(enabled ? "ATIVADO" : "DESATIVADO");
  Serial.print(" | GPIO=");
  Serial.print(digitalRead(SOLENOID_PIN));
  Serial.print(" | activeLevel=");
  Serial.print(activeLevel);
  Serial.print(" | inactiveLevel=");
  Serial.println(inactiveLevel);
}

void handleHealth() {
  bool currentSwitch = isSwitchPressed();
  String lockState = currentSwitch ? "unlocked" : "locked";

  String response = "{\"ok\":true,\"device\":\"esp32-solenoid\",\"solenoid\":\"" + lockState + "\",\"locked\":" + (currentSwitch ? "false" : "true") + "}";
  server.send(200, "application/json", response);
}

void handleUnlock() {
  String durationParam = server.hasArg("durationMs") ? server.arg("durationMs") : "";
  int durationMs = durationParam.toInt();
  if (durationMs <= 0 || durationMs > 30000) {
    durationMs = DEFAULT_UNLOCK_MS;
  }

  Serial.print("[ESP32] Recebido /unlock com durationMs=");
  Serial.println(durationMs);

  unlockDurationMs = (unsigned long)durationMs;
  unlockRequestTime = millis();
  solenoidEndTime = unlockRequestTime + unlockDurationMs;

  setSolenoidState(true);
  isControlledBySwitch = true;
  switchReleaseTime = 0;

  Serial.println("[SWITCH-CONTROL] Modo ativado: enquanto o switch estiver pressionado a chave fica liberada.");
  server.send(200, "text/plain", "UNLOCK_OK");
}

void handleLock() {
  Serial.println("[ESP32] Recebido /lock");
  setSolenoidState(false);
  solenoidEndTime = 0;
  isControlledBySwitch = false;
  switchReleaseTime = 0;
  server.send(200, "text/plain", "LOCK_OK");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(SOLENOID_PIN, OUTPUT);
  pinMode(MICRO_SWITCH_PIN, INPUT_PULLUP);
  setSolenoidState(false);

  Serial.println();
  Serial.println("=== ESP32 Solenoid ===");
  Serial.print("Conectando ao WiFi: ");
  Serial.println(WIFI_SSID);

  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);

  unsigned long inicio = millis();
  while (WiFi.status() != WL_CONNECTED && millis() - inicio < 20000) {
    delay(500);
    Serial.print(".");
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println();
    Serial.println("WiFi conectado!");
    Serial.print("IP: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println();
    Serial.println("NAO CONECTOU NO WIFI.");
    Serial.print("Status WiFi: ");
    Serial.println(WiFi.status());
  }

  server.on("/", HTTP_GET, handleHealth);
  server.on("/health", HTTP_GET, handleHealth);
  server.on("/unlock", HTTP_POST, handleUnlock);
  server.on("/lock", HTTP_POST, handleLock);

  server.begin();
  Serial.println("Servidor HTTP do ESP32 iniciado");

  switchState = isSwitchPressed();
  Serial.print("[SWITCH] Estado inicial: ");
  Serial.println(switchState ? "PRESSIONADO" : "LIBERADO");
}

void loop() {
  server.handleClient();

  if (millis() - lastSwitchRead >= SWITCH_DEBOUNCE_MS) {
    lastSwitchRead = millis();
    bool currentSwitchState = isSwitchPressed();

    if (currentSwitchState != switchState) {
      switchState = currentSwitchState;
      Serial.print("[SWITCH] Mudança detectada: ");
      Serial.println(switchState ? "PRESSIONADO" : "LIBERADO");
    }
  }

  if (isControlledBySwitch && solenoidActive) {
    bool switchPressed = isSwitchPressed();

    if (!switchPressed) {
      // O switch foi liberado após o comando de destravar.
      Serial.println("[SWITCH-CONTROL] Switch liberado: trancando solenoide novamente.");
      setSolenoidState(false);
      isControlledBySwitch = false;
      switchReleaseTime = 0;
      solenoidEndTime = 0;
    } else {
      // Enquanto o switch estiver pressionado, a chave continua em uso e a solenoide permanece liberada.
      switchReleaseTime = 0;
    }
  }

  // Segurança extra: timeout do comando de desbloqueio
  if (solenoidActive && solenoidEndTime > 0 && millis() >= solenoidEndTime) {
    Serial.println("[SOLENOID] Timeout do desbloqueio atingido. Desligando solenoide.");
    setSolenoidState(false);
    isControlledBySwitch = false;
    switchReleaseTime = 0;
    solenoidEndTime = 0;
  }
}
