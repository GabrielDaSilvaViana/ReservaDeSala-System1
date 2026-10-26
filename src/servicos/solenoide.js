/**
 * Comunicação com o ESP32 que controla a solenoide (trava da chave).
 *
 * Modo (SOLENOIDE_MODO no .env):
 *   'auto'      → usa o ESP32 se ESP32_HOST estiver preenchido (padrão)
 *   'hardware'  → sempre envia o comando ao ESP32
 *   'simulacao' → nada é enviado; a tela só mostra a animação
 *
 * Podem existir até 3 solenoides no mesmo ESP32 (NUM_SOLENOIDES). Cada sala
 * diz em qual solenoide fica a chave dela (coluna salas.solenoide); sala sem
 * solenoide definida usa a SOLENOIDE_PADRAO do .env (1).
 *
 * Também guarda "tickets de destrave": quando um professor ocupa a sala com a
 * identidade validada, o servidor gera um ticket válido por 5 minutos. Só com
 * esse ticket (ou sendo administrador) é possível pedir para destravar de novo.
 */
const crypto = require('crypto');
const config = require('../config');
const { erro } = require('./erros');

const TICKET_VALIDADE_MS = 5 * 60 * 1000;
const tickets = new Map(); // ticket -> { reservaId, salaNome, expiraEm }

const NUM_SOLENOIDES = 3;

/** Confere o número da solenoide (1 a 3). Sem número = solenoide padrão. */
function numeroSolenoide(n) {
    if (n === undefined || n === null || n === '') return config.solenoide.padrao;
    const numero = Number(n);
    if (!Number.isInteger(numero) || numero < 1 || numero > NUM_SOLENOIDES) {
        throw erro.requisicao(`Solenoide inválida: use um número de 1 a ${NUM_SOLENOIDES}.`);
    }
    return numero;
}

const esp32Configurado = () => Boolean(String(config.solenoide.esp32Host || '').trim());

/** Modo que vale de verdade, resolvendo o 'auto'. */
function modoEfetivo() {
    const modo = String(config.solenoide.modo || 'auto').toLowerCase();
    if (modo === 'hardware') return 'hardware';
    if (modo === 'simulacao') return 'simulacao';
    return esp32Configurado() ? 'hardware' : 'simulacao';
}

function urlBase() {
    const host = String(config.solenoide.esp32Host || '').trim();
    if (!host) throw erro.dispositivo('O IP do ESP32 não foi configurado (ESP32_HOST no arquivo .env).');
    if (!/^[a-zA-Z0-9.-]+$/.test(host)) throw erro.dispositivo(`ESP32_HOST inválido: "${host}".`);
    return `http://${host}:${config.solenoide.esp32Porta}`;
}

/**
 * Faz uma requisição ao ESP32.
 * Com `permitirErro: true` devolve { status, texto } mesmo se o ESP32 responder erro HTTP.
 */
async function chamarEsp32(caminho, metodo = 'GET', { permitirErro = false, timeoutMs = config.solenoide.timeoutMs } = {}) {
    const url = `${urlBase()}${caminho}`;
    let resposta;
    try {
        resposta = await fetch(url, {
            method: metodo,
            headers: config.solenoide.esp32Token ? { 'X-Token': config.solenoide.esp32Token } : {},
            signal: AbortSignal.timeout(timeoutMs)
        });
    } catch (e) {
        const motivo = e.name === 'TimeoutError' || e.name === 'AbortError'
            ? `sem resposta em ${timeoutMs} ms`
            : (e.cause && e.cause.code) || e.message;
        throw erro.dispositivo(`Não foi possível comunicar com o ESP32 (${motivo}). Verifique se ele está ligado, na mesma rede e com o IP certo no .env.`);
    }
    const texto = await resposta.text();
    if (permitirErro) return { status: resposta.status, texto };
    if (resposta.status === 401) throw erro.dispositivo('O ESP32 recusou o comando: ESP32_TOKEN do .env diferente do secrets.h.');
    if (!resposta.ok) throw erro.dispositivo(`O ESP32 recusou o comando (HTTP ${resposta.status}): ${texto || 'sem detalhes'}`);
    return texto;
}

/**
 * Destrava a solenoide. `modo` pode forçar 'hardware' ou 'simulacao';
 * se não for informado usa o modo efetivo (.env).
 */
async function destravar({ modo, duracaoMs = config.solenoide.duracaoMs, solenoide } = {}) {
    const numero = numeroSolenoide(solenoide);
    const modoUsado = modo === 'hardware' || modo === 'simulacao' ? modo : modoEfetivo();
    const duracao = Math.min(Math.max(Number(duracaoMs) || config.solenoide.duracaoMs, 3000), 30000);
    if (modoUsado !== 'hardware') {
        return { modo: 'simulacao', ok: true, numero, duracaoMs: duracao, mensagem: 'Modo simulação: nenhum comando foi enviado ao ESP32.' };
    }
    try {
        await chamarEsp32(`/unlock?s=${numero}&durationMs=${duracao}`, 'POST');
        return { modo: 'hardware', ok: true, numero, duracaoMs: duracao, mensagem: `Solenoide ${numero} destravada pelo ESP32.` };
    } catch (e) {
        return { modo: 'hardware', ok: false, numero, duracaoMs: duracao, mensagem: e.message };
    }
}

/** Descobre qual solenoide o QR code lido abre (null se não for de nenhuma). */
function solenoideDoQrCode(texto) {
    const lido = String(texto || '').trim();
    if (!lido) return null;
    const achado = Object.entries(config.devolucao.qrcodes).find(([, codigo]) => codigo && codigo === lido);
    return achado ? Number(achado[0]) : null;
}

/**
 * Destrava a solenoide para DEVOLVER a chave.
 * O ESP32 trava sozinho quando a chave aperta o micro switch
 * (ou quando o prazo acaba). Se a chave já estiver no lugar, não destrava.
 */
async function destravarParaDevolucao({ modo, duracaoMs = config.devolucao.tempoMs, solenoide } = {}) {
    const numero = numeroSolenoide(solenoide);
    const modoUsado = modo === 'hardware' || modo === 'simulacao' ? modo : modoEfetivo();
    const duracao = Math.min(Math.max(Number(duracaoMs) || 20000, 3000), 60000);
    if (modoUsado !== 'hardware') {
        return { modo: 'simulacao', ok: true, numero, duracaoMs: duracao, mensagem: 'Modo simulação: nenhum comando foi enviado ao ESP32.' };
    }
    try {
        const { status, texto } = await chamarEsp32(`/return?s=${numero}&durationMs=${duracao}`, 'POST', { permitirErro: true });
        if (status === 409) {
            return { modo: 'hardware', ok: false, numero, chaveJaNoLugar: true, duracaoMs: duracao, mensagem: `A chave já está no lugar na solenoide ${numero}. Não há chave para devolver.` };
        }
        if (status === 401) throw erro.dispositivo('O ESP32 recusou o comando: ESP32_TOKEN do .env diferente do secrets.h.');
        if (status === 404) throw erro.dispositivo('O ESP32 não conhece a devolução de chave. Grave a versão nova do solenoid_arduino.ino.');
        if (status === 400) throw erro.dispositivo(`O ESP32 não conhece a solenoide ${numero}. Grave a versão nova do solenoid_arduino.ino.`);
        if (status < 200 || status >= 300) throw erro.dispositivo(`O ESP32 recusou o comando (HTTP ${status}): ${texto || 'sem detalhes'}`);
        return { modo: 'hardware', ok: true, numero, duracaoMs: duracao, mensagem: `Solenoide ${numero} destravada para devolver a chave.` };
    } catch (e) {
        return { modo: 'hardware', ok: false, numero, duracaoMs: duracao, mensagem: e.message };
    }
}

async function travar({ solenoide } = {}) {
    const numero = numeroSolenoide(solenoide);
    if (!esp32Configurado()) {
        return { modo: 'simulacao', ok: true, numero, mensagem: 'Modo simulação: nenhum comando foi enviado ao ESP32.' };
    }
    await chamarEsp32(`/lock?s=${numero}`, 'POST');
    return { modo: 'hardware', ok: true, numero, mensagem: `Solenoide ${numero} travada.` };
}

/** Estado de uma solenoide, lido do /health do ESP32. */
async function status({ solenoide } = {}) {
    const numero = numeroSolenoide(solenoide);
    const texto = await chamarEsp32('/health', 'GET', { timeoutMs: Math.min(config.solenoide.timeoutMs, 3000) });
    let json;
    try {
        json = JSON.parse(texto);
    } catch (_) {
        throw erro.dispositivo('O ESP32 respondeu em um formato inesperado.');
    }
    // Firmware novo: lista "solenoids". Firmware antigo: só a solenoide 1, nos campos de cima.
    let dados = Array.isArray(json.solenoids) ? json.solenoids.find(x => Number(x.id) === numero) : null;
    if (!dados) {
        if (numero !== 1) throw erro.dispositivo(`O ESP32 não informou a solenoide ${numero}. Grave a versão nova do solenoid_arduino.ino.`);
        dados = json;
    }
    return {
        dispositivo: json.device || 'esp32',
        solenoide: numero,
        travada: dados.locked === true,
        chaveEmUso: typeof dados.keyInUse === 'boolean' ? dados.keyInUse : null,
        devolvendo: dados.returnMode === true,
        leitorDigital: typeof json.fingerprint === 'boolean' ? json.fingerprint : null,
        verificadoEm: new Date().toISOString()
    };
}

function criarTicket(reservaId, salaNome, solenoide) {
    const ticket = crypto.randomBytes(24).toString('hex');
    tickets.set(ticket, { reservaId, salaNome, solenoide: numeroSolenoide(solenoide), expiraEm: Date.now() + TICKET_VALIDADE_MS });
    for (const [t, info] of tickets) if (info.expiraEm < Date.now()) tickets.delete(t);
    return ticket;
}

function validarTicket(ticket) {
    const info = tickets.get(String(ticket || ''));
    if (!info || info.expiraEm < Date.now()) return null;
    return info;
}

module.exports = {
    destravar,
    destravarParaDevolucao,
    solenoideDoQrCode,
    travar,
    status,
    criarTicket,
    validarTicket,
    chamarEsp32,
    numeroSolenoide,
    NUM_SOLENOIDES,
    modoEfetivo,
    esp32Configurado
};
