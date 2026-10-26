# InnovaRoom — Reserva e controle de acesso a salas

Projeto de TCC (SENAI). Sistema web para reservar salas, validar a identidade do professor (crachá, digital ou rosto) e liberar a chave por uma solenoide controlada por um ESP32.

## Requisitos

- **Node.js 18.17 ou superior.** Para rodar os testes (`npm test`), Node 22 ou superior.
- **MySQL 8.0.16 ou superior.**
- Opcional: ESP32 com relé e solenoide (veja [docs/HARDWARE.md](docs/HARDWARE.md)).

## Como rodar

1. **Instale as dependências.** Só é necessário se a pasta `node_modules` não existir:
   ```bash
   npm install
   ```
2. **Configure.** Edite o arquivo `.env`: senha do MySQL, IP do ESP32 e senha inicial do admin. O modelo com todas as opções está em `.env.example`.
3. **Crie o banco.** Atenção: este comando apaga e recria tudo.
   ```bash
   npm run banco:recriar
   ```
   Também dá para abrir `database/database.sql` no MySQL Workbench e executar.
4. **Inicie o servidor:**
   ```bash
   npm start
   ```
5. **Abra o sistema:** acesse **http://localhost:3000**.

### Reconhecimento facial (opcional)

O reconhecimento usa o `face-api.js`, que precisa de modelos de IA (cerca de 7 MB).

- Para baixar os modelos uma única vez (precisa de internet):
  ```bash
  npm run modelos
  ```
- Se você não baixar, o navegador tenta buscar os modelos na internet na hora do uso.
- A câmera só funciona abrindo o sistema por **localhost** (ou https). Por segurança, o navegador bloqueia a câmera em `http://IP-da-rede`.

## Acesso de administrador

- **Login:** engrenagem no canto superior direito.
- **Usuário:** `admin`.
- **Senha:** o valor de `ADMIN_SENHA` no `.env`. O padrão é `admin123`; troque pelo painel em *Alterar senha*.

## Como funciona a identificação do professor

| Situação | O que acontece |
|---|---|
| Professor sem nenhuma credencial | A primeira usada (crachá, digital ou rosto) é cadastrada (**primeiro acesso**). |
| Professor com credencial | Precisa usar uma credencial que já está cadastrada. |
| Cadastrar outro método, trocar ou apagar | Pelo **Painel do Administrador → Professores → Credenciais**. |

Os códigos de crachá e digital são salvos como hash SHA-256. O rosto é salvo como um vetor de 128 números. A comparação é sempre feita no servidor.

## Estrutura

```
server.js               → inicia o servidor web e a API
src/config.js           → lê o .env
src/db.js               → conexão MySQL (e adaptador SQLite só para testes)
src/servicos/           → regras de negócio (reservas, credenciais, admin, grade, ESP32)
src/rotas/              → rotas da API (/api/...)
public/                 → tudo o que o navegador acessa (HTML, CSS, JS)
public/js/              → front-end dividido por tela
database/database.sql   → criação do banco + dados iniciais
esp32/solenoid_arduino/ → firmware do ESP32 (Wi-Fi em secrets.h)
esp32/teste_dy50/       → sketch de diagnóstico do leitor DY50
docs/qrcodes/           → QR code para imprimir e prender na chave (devolução)
public/lib/jsQR.js      → leitor de QR code usado pela câmera (licença Apache 2.0)
public/lib/fontawesome/ → ícones dos botões (funcionam sem internet)
docs/esquema-3-solenoides.png → desenho da ligação do ESP32 com as 3 solenoides
esp32/teste_rele/       → sketch de teste da polaridade do relé
docs/HARDWARE.md        → ligação do ESP32, solenoide, micro switch e DY50
tests/                  → testes automatizados (npm test): API, ESP32 e DY50 simulados
```

## Principais rotas da API

| Método | Rota | Quem pode |
|---|---|---|
| GET | `/api/estado` | todos (dados do painel) |
| GET | `/api/reservas` | todos (histórico; o código RES-xxxxx só aparece para o admin) |
| POST | `/api/reservas` | professor com credencial |
| POST | `/api/reservas/:id/ocupar` · `/desocupar` · `/mudar-sala` | professor da reserva |
| POST | `/api/reservas/:id/remover` · `/ocupacao-forcada` | admin |
| POST | `/api/eventos` | professor com credencial ou admin |
| GET / POST / PUT / DELETE | `/api/grade` | leitura: todos; alterações: admin |
| POST | `/api/solenoide/destravar` | ticket da ocupação ou admin |
| POST | `/api/chave/devolver` | todos (precisa do QR code da chave; só destrava se a chave estiver fora do lugar) |
| POST | `/api/chave/devolvida` | ticket da devolução (a sala ocupada volta para reservada) |
| GET | `/api/solenoide/status?solenoide=2` | todos (estado de uma das 3 solenoides) |
| PUT | `/api/salas/:codigo/solenoide` | admin (em qual solenoide fica a chave da sala) |
| POST | `/api/digital/ler` | todos (lê o DY50 e devolve um token de uso único) |
| POST | `/api/professores/:id/digital/cadastrar` | admin (cadastra a digital no DY50) |
| POST | `/api/porta/digital` | leitor da porta (token) ou admin |
