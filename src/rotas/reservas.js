/**
 * Rotas de reservas, ocupação e eventos.
 */
const express = require('express');
const reservas = require('../servicos/reservas');
const { exigirAdmin } = require('../servicos/admin');
const { rota } = require('../servicos/erros');

const router = express.Router();
const opcoes = req => ({ admin: Boolean(req.admin) });

// Professor reserva uma sala (com crachá, digital ou rosto)
router.post('/reservas', rota(async (req, res) => {
    const { sala, professorId, data, inicio, fim, credencial } = req.body || {};
    res.status(201).json(await reservas.criarReserva({ sala, professorId, data, inicio, fim, credencial }, opcoes(req)));
}));

// Professor ocupa a sala reservada (libera a chave)
router.post('/reservas/:id/ocupar', rota(async (req, res) => {
    res.json(await reservas.ocupar(req.params.id, { credencial: (req.body || {}).credencial }, opcoes(req)));
}));

// Professor desocupa a sala
router.post('/reservas/:id/desocupar', rota(async (req, res) => {
    res.json(await reservas.liberar(req.params.id, { credencial: (req.body || {}).credencial }, opcoes(req)));
}));

// Professor transfere a reserva para outra sala
router.post('/reservas/:id/mudar-sala', rota(async (req, res) => {
    const { novaSala, credencial } = req.body || {};
    res.json(await reservas.mudarSala(req.params.id, { novaSala, credencial }, opcoes(req)));
}));

// Evento: o administrador cria direto; o professor precisa validar a identidade
router.post('/eventos', rota(async (req, res) => {
    const { sala, descricao, responsavel, professorId, data, inicio, fim, credencial } = req.body || {};
    res.status(201).json(await reservas.criarEvento(
        { sala, descricao, responsavel, professorId, data, inicio, fim, credencial }, opcoes(req)));
}));

// ---- Somente administrador ----
router.post('/reservas/:id/ocupacao-forcada', exigirAdmin, rota(async (req, res) => {
    res.json(await reservas.ocupacaoForcada(req.params.id, { professorId: (req.body || {}).professorId }));
}));

// Cancela (se agendada) ou faz a desocupação forçada (se em uso)
router.post('/reservas/:id/remover', exigirAdmin, rota(async (req, res) => {
    res.json(await reservas.removerPeloAdmin(req.params.id));
}));


module.exports = router;
