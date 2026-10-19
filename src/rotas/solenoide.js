/**
 * Rotas da solenoide (ESP32) e do leitor de digital na porta.
 */
const crypto = require('crypto');
const express = require('express');
const config = require('../config');
const solenoide = require('../servicos/solenoide');
const reservas = require('../servicos/reservas');
const digital = require('../servicos/digital');
const { exigirAdmin } = require('../servicos/admin');
const { erro, rota } = require('../servicos/erros');

const router = express.Router();

/**
 * Destrava a solenoide.
 * Precisa do "ticket" entregue quando o professor ocupou a sala
 * (válido por 5 minutos) ou de uma sessão de administrador.
 */
router.post('/solenoide/destravar', rota(async (req, res) => {
    const { ticket, modo } = req.body || {};
    const info = ticket ? solenoide.validarTicket(ticket) : null;
    if (!info && !req.admin) throw erro.proibido('Ocupe a sala com sua identidade validada para liberar a chave.');
    const resultado = await solenoide.destravar({ modo: modo === 'hardware' ? 'hardware' : modo === 'simulacao' ? 'simulacao' : undefined });
    if (info) {
        await reservas.registrarLog(require('../db'), { reservaId: info.reservaId, acao: 'destravar', detalhe: `${resultado.modo}: ${resultado.ok ? 'ok' : 'falhou'}` });
    }
    res.json(resultado);
}));

router.post('/solenoide/travar', exigirAdmin, rota(async (_req, res) => {
    res.json(await solenoide.travar());
}));

router.get('/solenoide/status', rota(async (_req, res) => {
    res.json(await solenoide.status());
}));

/** Lê um dedo no DY50 (ligado ao ESP32) e devolve um token de leitura de uso único. */
router.post('/digital/ler', rota(async (_req, res) => {
    res.json(await digital.lerDigital());
}));

/** Situação do leitor (usada pela tela de cadastro para mostrar "retire o dedo" etc.). */
router.get('/digital/status', rota(async (_req, res) => {
    res.json(await digital.situacao());
}));

/**
 * Leitor de digital instalado na porta (ESP32 + DY50).
 * O dispositivo deve enviar o cabeçalho X-Dispositivo-Token igual ao
 * DISPOSITIVO_TOKEN do .env. O administrador logado também pode simular.
 * Corpo: { sala: "129", digital: "ID-da-digital" }
 */
router.post('/porta/digital', rota(async (req, res) => {
    const token = req.get('x-dispositivo-token') || '';
    const esperado = Buffer.from(config.dispositivoToken || '');
    const recebido = Buffer.from(token);
    const dispositivoOk = esperado.length > 0 && esperado.length === recebido.length && crypto.timingSafeEqual(esperado, recebido);
    if (!dispositivoOk && !req.admin) throw erro.proibido('Dispositivo não autorizado.');
    const { sala, digital } = req.body || {};
    res.json(await reservas.autenticarNaPorta({ sala, digital }));
}));

module.exports = router;
