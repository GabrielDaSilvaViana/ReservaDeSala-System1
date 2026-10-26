/**
 * Rotas de consulta (leitura) usadas pelo painel.
 */
const express = require('express');
const reservas = require('../servicos/reservas');
const grade = require('../servicos/grade');
const professores = require('../servicos/professores');
const tempo = require('../servicos/tempo');
const config = require('../config');
const solenoide = require('../servicos/solenoide');
const { rota } = require('../servicos/erros');

const router = express.Router();

/** Tudo o que o painel precisa em uma única chamada (atualizada a cada 5 s). */
router.get('/estado', rota(async (req, res) => {
    const admin = Boolean(req.admin);
    await reservas.manutencao();
    const [salas, ativas, aulas, profs, turmas] = await Promise.all([
        reservas.listarSalas(),
        reservas.listarAtivas({ admin }),
        grade.listar(),
        professores.listar({ admin }),
        professores.listarTurmas()
    ]);
    res.json({
        agora: tempo.agora(),
        admin,
        salas: reservas.calcularSituacao(salas, ativas),
        reservas: ativas,
        grade: aulas,
        professores: profs,
        turmas,
        faixas: tempo.FAIXAS_HORARIO,
        dias: tempo.DIAS_SEMANA,
        regras: {
            reservaMinimaMinutos: config.regras.reservaMinimaMinutos,
            ocupacaoAntecedenciaMinutos: config.regras.ocupacaoAntecedenciaMinutos
        },
        solenoideModo: solenoide.modoEfetivo(),
        solenoidePadrao: config.solenoide.padrao,
        esp32Configurado: solenoide.esp32Configurado(),
        digitalModo: config.digital.modo === 'esp32' ? 'esp32' : 'manual'
    });
}));

/** Histórico completo de reservas e eventos (o código RES-xxxxx só aparece para o admin). */
router.get('/reservas', rota(async (req, res) => {
    await reservas.manutencao();
    res.json(await reservas.listarHistorico({ admin: Boolean(req.admin) }));
}));

router.get('/ping', rota(async (_req, res) => {
    await require('../db').query('SELECT 1 AS ok');
    res.json({ status: 'ok' });
}));

module.exports = router;
