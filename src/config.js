/**
 * Configurações do servidor.
 *
 * Os valores vêm de variáveis de ambiente ou do arquivo `.env` na raiz do
 * projeto (veja `.env.example`). Assim nenhuma senha fica escrita no código.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..');

/** Lê o arquivo .env (formato CHAVE=valor) sem precisar de biblioteca extra. */
function carregarArquivoEnv(arquivo) {
    if (!fs.existsSync(arquivo)) return;
    const linhas = fs.readFileSync(arquivo, 'utf8').split(/\r?\n/);
    for (const linha of linhas) {
        const texto = linha.trim();
        if (!texto || texto.startsWith('#')) continue;
        const m = texto.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
        if (!m) continue;
        let valor = m[2].trim();
        if ((valor.startsWith('"') && valor.endsWith('"')) || (valor.startsWith("'") && valor.endsWith("'"))) {
            valor = valor.slice(1, -1);
        }
        // Variáveis já definidas no sistema têm prioridade sobre o .env
        if (process.env[m[1]] === undefined) process.env[m[1]] = valor;
    }
}

carregarArquivoEnv(process.env.INNOVAROOM_ENV_FILE || path.join(RAIZ, '.env'));

const env = (nome, padrao = '') => (process.env[nome] !== undefined ? process.env[nome] : padrao);
const envNumero = (nome, padrao) => {
    const n = Number(env(nome, ''));
    return Number.isFinite(n) && env(nome, '') !== '' ? n : padrao;
};

const config = {
    raiz: RAIZ,
    porta: envNumero('PORT', 3000),
    host: env('HOST', '0.0.0.0'),

    banco: {
        // 'mysql' (padrão) ou 'sqlite' (somente para testes automatizados — Node 22+)
        cliente: env('DB_CLIENT', 'mysql'),
        host: env('DB_HOST', 'localhost'),
        porta: envNumero('DB_PORT', 3306),
        usuario: env('DB_USER', 'root'),
        senha: env('DB_PASSWORD', ''),
        nome: env('DB_NAME', 'innovaroom'),
        arquivoSqlite: env('SQLITE_FILE', ':memory:')
    },

    admin: {
        // Usada apenas na PRIMEIRA execução, para criar o usuário "admin".
        senhaInicial: env('ADMIN_SENHA', 'admin123'),
        duracaoSessaoHoras: envNumero('ADMIN_SESSAO_HORAS', 8)
    },

    regras: {
        // Duração mínima de uma reserva, em minutos
        reservaMinimaMinutos: envNumero('RESERVA_MIN_MINUTOS', 5),
        // Quantos minutos antes do início a sala já pode ser ocupada
        ocupacaoAntecedenciaMinutos: envNumero('OCUPACAO_ANTECEDENCIA_MIN', 30),
        // Distância máxima entre dois rostos para considerar a mesma pessoa (face-api.js)
        limiarFacial: envNumero('LIMIAR_FACIAL', 0.5),
        // Tentativas erradas de credencial antes de bloquear temporariamente
        maxTentativas: envNumero('MAX_TENTATIVAS', 5),
        bloqueioMinutos: envNumero('BLOQUEIO_MIN', 2)
    },

    solenoide: {
        // 'auto' (padrão) = usa o ESP32 se ESP32_HOST estiver preenchido
        // 'hardware' = sempre aciona o ESP32 | 'simulacao' = só animação na tela
        modo: env('SOLENOIDE_MODO', 'auto'),
        // Prazo para o professor tirar a chave depois de destravar (o ESP32 trava 3 s após a chave sair)
        duracaoMs: envNumero('SOLENOIDE_DURACAO_MS', 10000),
        // Solenoide usada pelas salas que não têm uma definida (1 a 3)
        padrao: Math.min(Math.max(Math.round(envNumero('SOLENOIDE_PADRAO', 1)), 1), 3),
        esp32Host: env('ESP32_HOST', ''),
        esp32Porta: envNumero('ESP32_PORT', 80),
        esp32Token: env('ESP32_TOKEN', ''),
        timeoutMs: envNumero('ESP32_TIMEOUT_MS', 5000)
    },

    devolucao: {
        // Conteúdo do QR code de cada solenoide (o QR fica preso na chave).
        // As imagens prontas para imprimir estão em docs/qrcodes/.
        qrcodes: {
            1: env('QRCODE_SOLENOIDE_1', 'INNOVAROOM-SOLENOIDE-1'),
            2: env('QRCODE_SOLENOIDE_2', 'INNOVAROOM-SOLENOIDE-2'),
            3: env('QRCODE_SOLENOIDE_3', 'INNOVAROOM-SOLENOIDE-3')
        },
        // Prazo para colocar a chave depois de destravar (o ESP32 trava ao apertar o switch)
        tempoMs: envNumero('DEVOLUCAO_TEMPO_MS', 20000)
    },

    digital: {
        // 'manual' = código da digital digitado na tela (simulação)
        // 'esp32'  = leitura real pelo DY50 ligado ao ESP32
        modo: env('DIGITAL_LEITOR', 'manual'),
        tempoLeituraMs: envNumero('DIGITAL_TEMPO_LEITURA_MS', 15000),
        tempoCadastroMs: envNumero('DIGITAL_TEMPO_CADASTRO_MS', 60000)
    },

    // Token que leitores físicos (ex.: ESP32 com DY50) enviam em /api/porta/digital
    dispositivoToken: env('DISPOSITIVO_TOKEN', ''),

    // SOMENTE PARA TESTES: fixa a data/hora "atual" do servidor (ex.: 2026-10-19T10:00:00)
    agoraFixo: env('INNOVAROOM_AGORA', '')
};

module.exports = config;
