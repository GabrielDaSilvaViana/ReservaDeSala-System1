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

WebServer server(80);

// Variáveis para controlar o solenoide sem bloquear
unsigned long solenoidEndTime = 0;
bool solenoidActive = false;

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
  server.send(200, "application/json", "{\"ok\":true,\"device\":\"esp32-solenoid\"}");
}

void handleUnlock() {
  String durationParam = server.hasArg("durationMs") ? server.arg("durationMs") : "";
  int durationMs = durationParam.toInt();
  if (durationMs <= 0 || durationMs > 30000) {
    durationMs = DEFAULT_UNLOCK_MS;
  }

  Serial.print("[ESP32] Recebido /unlock com durationMs=");
  Serial.println(durationMs);

  // Ativa o solenoide
  setSolenoidState(true);

  // Define quando desativar (sem bloquear)
  solenoidEndTime = millis() + durationMs;

  // Responde imediatamente, não bloqueia
  server.send(200, "text/plain", "UNLOCK_OK");
}

void handleLock() {
  Serial.println("[ESP32] Recebido /lock");
  setSolenoidState(false);
  solenoidEndTime = 0;
  server.send(200, "text/plain", "LOCK_OK");
}

void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(SOLENOID_PIN, OUTPUT);
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
}

void loop() {
  server.handleClient();

  // Verifica se precisa desativar o solenoide (sem bloquear)
  if (solenoidActive && millis() >= solenoidEndTime) {
    Serial.println("[SOLENOID] Tempo expirou, desligando solenoide...");
    setSolenoidState(false);
  }
}
