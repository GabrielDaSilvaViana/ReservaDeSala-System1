/**
 * Rotas do administrador: login, professores e credenciais.
 */
const express = require('express');
const admin = require('../servicos/admin');
const professores = require('../servicos/professores');
const { rota } = require('../servicos/erros');

const router = express.Router();

router.post('/admin/login', rota(async (req, res) => {
    const { usuario, senha } = req.body || {};
    res.json(await admin.login(usuario, senha, req.ip));
}));

router.post('/admin/logout', (req, res) => {
    if (req.admin) admin.logout(req.admin.token);
    res.json({ ok: true });
});

router.get('/admin/sessao', (req, res) => {
    res.json({ admin: Boolean(req.admin), usuario: req.admin ? req.admin.usuario : null });
});

router.post('/admin/senha', admin.exigirAdmin, rota(async (req, res) => {
    const { senhaAtual, novaSenha } = req.body || {};
    await admin.trocarSenha(req.admin.adminId, senhaAtual, novaSenha);
    res.json({ ok: true });
}));

router.get('/professores', rota(async (req, res) => {
    res.json(await professores.listar({ admin: Boolean(req.admin) }));
}));

router.post('/professores', admin.exigirAdmin, rota(async (req, res) => {
    res.status(201).json(await professores.criar((req.body || {}).nome));
}));

// Cadastra/troca uma credencial: { metodo: 'cracha'|'digital'|'facial', codigo?, descritor? }
router.put('/professores/:id/credenciais', admin.exigirAdmin, rota(async (req, res) => {
    await professores.definirCredencial(req.params.id, req.body || {});
    res.json({ ok: true });
}));

// Cadastra a digital no leitor DY50 (o professor coloca o dedo 2 vezes)
router.post('/professores/:id/digital/cadastrar', admin.exigirAdmin, rota(async (req, res) => {
    await professores.cadastrarDigitalNoLeitor(req.params.id);
    res.json({ ok: true });
}));

// Remove uma credencial: metodo = cracha | digital | facial | todas
router.delete('/professores/:id/credenciais/:metodo', admin.exigirAdmin, rota(async (req, res) => {
    await professores.removerCredencial(req.params.id, req.params.metodo);
    res.json({ ok: true });
}));

module.exports = router;
