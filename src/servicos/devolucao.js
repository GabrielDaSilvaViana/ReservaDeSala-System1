/**
 * Devolução da chave com QR code.
 *
 *  1. iniciar(): o navegador leu o QR code preso na chave. Se o QR for de uma
 *     solenoide conhecida, ela destrava no modo devolução (o ESP32 trava
 *     sozinho quando a chave aperta o micro switch). Se a chave for de uma
 *     sala ocupada, devolve um "ticket de devolução".
 *  2. confirmar(): com o ticket, depois que a chave está no lugar, a sala
 *     volta de "ocupada" para "reservada". No modo hardware o servidor
 *     confere no ESP32 se a chave está mesmo no lugar e a solenoide travada.
 */
const crypto = require('crypto');
const db = require('../db');
const solenoide = require('./solenoide');
const reservas = require('./reservas');
const { erro } = require('./erros');

const tickets = new Map(); // ticket -> { reservaId, modo, expiraEm }

function limparExpirados() {
    for (const [t, info] of tickets) if (info.expiraEm < Date.now()) tickets.delete(t);
}

async function iniciar({ qrcode, reservaId }) {
    const numero = solenoide.solenoideDoQrCode(qrcode);
    if (!numero) {
        await reservas.registrarLog(db, { acao: 'devolver_chave', sucesso: false, detalhe: 'QR code não reconhecido' });
        throw erro.requisicao('QR code não reconhecido. Use o QR code preso na chave.');
    }

    const temReserva = reservaId !== undefined && reservaId !== null && reservaId !== '';
    const reserva = temReserva ? await reservas.reservaEmUso(reservaId) : null;

    const resultado = await solenoide.destravarParaDevolucao();
    await reservas.registrarLog(db, {
        reservaId: reserva ? reserva.id : null,
        professorId: reserva ? reserva.professorId : null,
        acao: 'devolver_chave',
        sucesso: resultado.ok,
        detalhe: `solenoide ${numero} (${resultado.modo}): ${resultado.ok ? 'destravada para devolução' : resultado.mensagem}`
    });

    const resposta = { ...resultado, solenoide: numero };
    if (resultado.ok && reserva) {
        limparExpirados();
        const ticket = crypto.randomBytes(24).toString('hex');
        tickets.set(ticket, { reservaId: reserva.id, modo: resultado.modo, expiraEm: Date.now() + resultado.duracaoMs + 2 * 60 * 1000 });
        resposta.ticket = ticket;
        resposta.reserva = reserva;
    }
    return resposta;
}

async function confirmar({ ticket }) {
    const info = tickets.get(String(ticket || ''));
    if (!info || info.expiraEm < Date.now()) {
        tickets.delete(String(ticket || ''));
        throw erro.proibido('Esta devolução expirou. Leia o QR code da chave de novo.');
    }
    if (info.modo === 'hardware') {
        const st = await solenoide.status();
        if (!st.travada || st.chaveEmUso !== false) {
            throw erro.conflito('A chave ainda não foi detectada no lugar.');
        }
    }
    tickets.delete(String(ticket));
    return reservas.voltarParaReservada(info.reservaId);
}

module.exports = { iniciar, confirmar };
