/**
 * Rotas da grade semanal (leitura livre, alteração só para o admin).
 */
const express = require('express');
const grade = require('../servicos/grade');
const { exigirAdmin } = require('../servicos/admin');
const { rota } = require('../servicos/erros');

const router = express.Router();

router.get('/grade', rota(async (_req, res) => res.json(await grade.listar())));

router.post('/grade', exigirAdmin, rota(async (req, res) => {
    res.status(201).json(await grade.criar(req.body || {}));
}));

router.put('/grade/:id', exigirAdmin, rota(async (req, res) => {
    res.json(await grade.atualizar(req.params.id, req.body || {}));
}));

router.delete('/grade/:id', exigirAdmin, rota(async (req, res) => {
    await grade.remover(req.params.id);
    res.json({ ok: true });
}));

module.exports = router;
