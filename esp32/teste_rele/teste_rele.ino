/*
 * TESTE DO RELÉ / SOLENOIDE — InnovaRoom
 * Grave, abra o Monitor Serial (115200) e observe a solenoide e o LED do relé.
 * O teste repete 3 estados do pino (GPIO 33), 5 segundos cada:
 *   A) pino em LOW    B) pino em HIGH    C) pino SOLTO (desconectado)
 * Anote em quais estados a solenoide fica PUXADA (destravada).
 */
const int PINO = 33;

void estado(const char* nome, int modo, int nivel) {
  Serial.println();
  Serial.print(">>> ESTADO ");
  Serial.println(nome);
  if (modo == OUTPUT) {
    pinMode(PINO, OUTPUT);
    digitalWrite(PINO, nivel);
  } else {
    pinMode(PINO, INPUT);
  }
  for (int i = 5; i > 0; i--) {
    Serial.print("   ");
    Serial.print(i);
    Serial.println(" s ... a solenoide esta PUXADA ou SOLTA? o LED do rele acendeu?");
    delay(1000);
  }
}

void setup() {
  pinMode(PINO, INPUT);
  Serial.begin(115200);
  delay(1000);
  Serial.println("=== TESTE DO RELE (GPIO 33) ===");
}

void loop() {
  estado("A: pino em LOW", OUTPUT, LOW);
  estado("B: pino em HIGH", OUTPUT, HIGH);
  estado("C: pino SOLTO", INPUT, 0);
}
