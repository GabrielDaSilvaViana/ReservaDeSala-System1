/**
 * Leitor de digital DY50 ligado ao ESP32 (DIGITAL_LEITOR=esp32 no .env).
 *
 * O DY50 guarda as digitais dentro dele e devolve um número (ID) quando
 * reconhece um dedo. Aqui o ID de cada digital é o próprio id do professor.
 *
 * Segurança: o navegador nunca envia o ID diretamente. Ele pede uma leitura,
 * o SERVIDOR conversa com o ESP32 e devolve só um "token de leitura" de uso
 * único (vale 2 minutos). Assim ninguém consegue se passar por outro
 * professor digitando um número.
 *
 * Fluxo com o ESP32 (assíncrono, para não travar a solenoide):
 *   POST /fingerprint/scan          → {"op":N}  começa a esperar um dedo
 *   POST /fingerprint/enroll?id=X   → {"op":N}  começa o cadastro (2 leituras)
 *   GET  /fingerprint/status        → {"op":N,"estado":"...","etapa":"...","id":X,"motivo":"..."}
 *   POST /fingerprint/cancel  |  POST /fingerprint/delete?id=X
 */
const crypto = require('crypto');
const config = require('../config');
const solenoide = require('./solenoide');
const { erro } = require('./erros');

const LEITURA_VALIDADE_MS = 2 * 60 * 1000;
const ESTADOS_FINAIS = ['ok', 'nao_encontrada', 'tempo_esgotado', 'erro', 'concluido', 'cancelado'];
const leituras = new Map(); // token -> { id, expiraEm }
let operacaoEmAndamento = false;

const ETAPAS = {
    coloque_dedo: 'Coloque o dedo no leitor.',
    retire_dedo: 'Retire o dedo do leitor.',
    coloque_novamente: 'Coloque o MESMO dedo novamente.',
    processando: 'Processando a digital...'
};

const MOTIVOS = {
    nao_confere: 'As duas leituras não conferem. Tente de novo com o mesmo dedo.',
    ja_cadastrada: 'Esta digital já está cadastrada no leitor para outra pessoa.',
    falha_salvar: 'O leitor não conseguiu salvar a digital.',
    falha_modelo: 'O leitor não conseguiu gerar o modelo da digital. Tente de novo.',
    falha_busca: 'O leitor não conseguiu pesquisar a digital. Tente de novo.',
    leitor_ausente: 'Leitor DY50 não encontrado pelo ESP32. Confira a ligação: V+ no 5V do ESP32, GND, TX no GPIO 16 e RX no GPIO 17. No Monitor Serial do ESP32, digite r para procurar de novo.',
    id_invalido: 'Número de digital inválido.',
    ocupado: 'O leitor de digital já está em uso. Aguarde alguns segundos.'
};

const usaLeitor = () => config.digital.modo === 'esp32';
const esperar = ms => new Promise(r => setTimeout(r, ms));

function garantirModoLeitor() {
    if (!usaLeitor()) throw erro.requisicao('O leitor de digital não está ativado (DIGITAL_LEITOR=esp32 no .env).');
}

function lerJson(texto) {
    try { return JSON.parse(texto); } catch (_) { throw erro.dispositivo('O ESP32 respondeu em um formato inesperado.'); }
}

/** Inicia uma operação no ESP32 e devolve o número dela. */
async function iniciar(caminho) {
    const { status, texto } = await solenoide.chamarEsp32(caminho, 'POST', { permitirErro: true });
    const json = texto ? (() => { try { return JSON.parse(texto); } catch (_) { return {}; } })() : {};
    if (status === 401) throw erro.dispositivo('O ESP32 recusou o comando: ESP32_TOKEN do .env diferente do secrets.h.');
    if (status === 404) throw erro.dispositivo('O ESP32 está com um firmware antigo, sem suporte ao leitor de digital. Grave o solenoid_arduino.ino novo.');
    if (status >= 400) throw erro.dispositivo(MOTIVOS[json.motivo] || `O ESP32 recusou o comando (HTTP ${status}).`);
    if (typeof json.op !== 'number') throw erro.dispositivo('O ESP32 respondeu em um formato inesperado.');
    return json.op;
}

async function consultar() {
    return lerJson(await solenoide.chamarEsp32('/fingerprint/status', 'GET', { timeoutMs: 3000 }));
}

/** Espera a operação `op` terminar no ESP32. */
async function aguardar(op, limiteMs) {
    const fim = Date.now() + limiteMs;
    while (Date.now() < fim) {
        await esperar(300);
        const s = await consultar();
        if (s.op === op && ESTADOS_FINAIS.includes(s.estado)) return s;
    }
    try { await solenoide.chamarEsp32('/fingerprint/cancel', 'POST', { permitirErro: true }); } catch (_) { /* ignora */ }
    throw erro.dispositivo('O leitor de digital não respondeu a tempo.');
}

async function exclusivo(fn) {
    if (operacaoEmAndamento) throw erro.conflito(MOTIVOS.ocupado);
    operacaoEmAndamento = true;
    try {
        return await fn();
    } finally {
        operacaoEmAndamento = false;
    }
}

/** Lê um dedo no DY50 e devolve um token de leitura de uso único. */
async function lerDigital() {
    garantirModoLeitor();
    return exclusivo(async () => {
        const op = await iniciar('/fingerprint/scan');
        const r = await aguardar(op, config.digital.tempoLeituraMs);
        if (r.estado === 'ok' && Number.isInteger(r.id) && r.id > 0) {
            const token = crypto.randomBytes(24).toString('hex');
            leituras.set(token, { id: r.id, expiraEm: Date.now() + LEITURA_VALIDADE_MS });
            for (const [t, info] of leituras) if (info.expiraEm < Date.now()) leituras.delete(t);
            return { leitura: token };
        }
        if (r.estado === 'nao_encontrada') throw erro.naoAutenticado('Digital não cadastrada no leitor. Peça ao administrador para cadastrar a sua digital.');
        if (r.estado === 'tempo_esgotado') throw erro.requisicao('Nenhum dedo foi colocado no leitor. Tente de novo.');
        if (r.estado === 'cancelado') throw erro.requisicao('Leitura cancelada.');
        throw erro.dispositivo(MOTIVOS[r.motivo] || 'Falha no leitor de digital.');
    });
}

/** Troca o token de leitura pelo ID da digital (só funciona uma vez). */
function consumirLeitura(token) {
    const chave = String(token || '');
    const info = leituras.get(chave);
    leituras.delete(chave);
    if (!info || info.expiraEm < Date.now()) throw erro.requisicao('A leitura da digital expirou. Coloque o dedo no leitor de novo.');
    return String(info.id);
}

/** Cadastra no DY50 a digital do professor (ID = id do professor). */
async function cadastrar(professorId) {
    garantirModoLeitor();
    const id = Number(professorId);
    if (!Number.isInteger(id) || id < 1 || id > 1000) throw erro.requisicao(MOTIVOS.id_invalido);
    return exclusivo(async () => {
        const op = await iniciar(`/fingerprint/enroll?id=${id}`);
        const r = await aguardar(op, config.digital.tempoCadastroMs);
        if (r.estado === 'concluido') return { id };
        if (r.estado === 'tempo_esgotado') throw erro.requisicao('Tempo esgotado. Comece o cadastro de novo e siga as instruções.');
        if (r.estado === 'cancelado') throw erro.requisicao('Cadastro cancelado.');
        throw erro.requisicao(MOTIVOS[r.motivo] || 'Não foi possível cadastrar a digital.');
    });
}

/** Apaga a digital do DY50 (melhor esforço: não falha se o ESP32 estiver fora). */
async function apagar(professorId) {
    if (!usaLeitor()) return;
    try {
        await solenoide.chamarEsp32(`/fingerprint/delete?id=${Number(professorId)}`, 'POST', { permitirErro: true });
    } catch (e) {
        console.warn('[digital] Não foi possível apagar a digital no leitor:', e.message);
    }
}

/** Situação atual do leitor, em texto, para a tela acompanhar o cadastro. */
async function situacao() {
    garantirModoLeitor();
    const s = await consultar();
    let mensagem = '';
    if (s.estado === 'aguardando') mensagem = ETAPAS[s.etapa] || 'Aguardando o leitor...';
    else if (s.estado === 'erro') mensagem = MOTIVOS[s.motivo] || 'Falha no leitor.';
    return { estado: s.estado, mensagem, leitor: s.leitor !== false };
}

module.exports = { usaLeitor, lerDigital, consumirLeitura, cadastrar, apagar, situacao };
