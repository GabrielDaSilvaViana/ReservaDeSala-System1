/**
 * Grade horária semanal fixa (aulas de cada professor).
 * Toda alteração é salva no banco — nada fica só na memória do navegador.
 */
const db = require('../db');
const tempo = require('./tempo');
const { erro } = require('./erros');

const SELECT_GRADE = `
    SELECT g.id, g.professor_id, p.nome AS professor, g.dia, g.faixa,
           s.codigo AS sala, g.turma_id AS turma
      FROM grade_semanal g
      JOIN professores p ON p.id = g.professor_id
      JOIN salas s ON s.id = g.sala_id`;

const formatar = g => ({
    id: g.id,
    professorId: g.professor_id,
    professor: g.professor,
    dia: Number(g.dia),
    faixa: Number(g.faixa),
    sala: g.sala,
    turma: g.turma
});

async function listar() {
    const linhas = await db.query(`${SELECT_GRADE} ORDER BY p.nome, g.dia, g.faixa`);
    return linhas.map(formatar);
}

async function validar(q, dados) {
    const dia = Number(dados.dia);
    const faixa = Number(dados.faixa);
    if (!Number.isInteger(dia) || dia < 0 || dia >= tempo.DIAS_SEMANA.length) throw erro.requisicao('Dia da semana inválido.');
    if (!Number.isInteger(faixa) || faixa < 0 || faixa >= tempo.FAIXAS_HORARIO.length) throw erro.requisicao('Faixa de horário inválida.');

    const [prof] = await q.query('SELECT id, nome FROM professores WHERE id = ? AND ativo = 1', [Number(dados.professorId)]);
    if (!prof) throw erro.requisicao('Professor não encontrado.');
    const [sala] = await q.query('SELECT id, codigo, nome FROM salas WHERE codigo = ?', [String(dados.sala || '').toUpperCase()]);
    if (!sala) throw erro.requisicao('Sala não encontrada.');
    const [turma] = await q.query('SELECT id, nome FROM turmas WHERE id = ?', [String(dados.turma || '')]);
    if (!turma) throw erro.requisicao('Turma não encontrada.');
    return { dia, faixa, prof, sala, turma };
}

/** Mensagens claras para os conflitos (antes de bater na constraint do banco). */
async function verificarConflitos(q, { dia, faixa, prof, sala }, ignorarId = null) {
    const ignorar = ignorarId ? ' AND g.id <> ?' : '';
    const extra = ignorarId ? [ignorarId] : [];
    const label = `${tempo.DIAS_SEMANA[dia]}, ${tempo.FAIXAS_HORARIO[faixa].label}`;

    const [doProf] = await q.query(`${SELECT_GRADE} WHERE g.professor_id = ? AND g.dia = ? AND g.faixa = ?${ignorar}`, [prof.id, dia, faixa, ...extra]);
    if (doProf) throw erro.conflito(`${prof.nome} já tem aula em ${label} (sala ${doProf.sala}).`);

    const [daSala] = await q.query(`${SELECT_GRADE} WHERE g.sala_id = ? AND g.dia = ? AND g.faixa = ?${ignorar}`, [sala.id, dia, faixa, ...extra]);
    if (daSala) throw erro.conflito(`A sala ${sala.codigo} já tem aula em ${label} com ${daSala.professor}.`);
}

function traduzirErroBanco(e) {
    if (e.code === 'ER_DUP_ENTRY') return erro.conflito('Já existe uma aula nesse horário para este professor ou nesta sala.');
    return e;
}

async function criar(dados) {
    try {
        return await db.transacao(async tx => {
            const v = await validar(tx, dados);
            await verificarConflitos(tx, v);
            const r = await tx.query(
                'INSERT INTO grade_semanal (professor_id, dia, faixa, sala_id, turma_id) VALUES (?, ?, ?, ?, ?)',
                [v.prof.id, v.dia, v.faixa, v.sala.id, v.turma.id]
            );
            const [linha] = await tx.query(`${SELECT_GRADE} WHERE g.id = ?`, [r.insertId]);
            return formatar(linha);
        });
    } catch (e) {
        throw traduzirErroBanco(e);
    }
}

async function atualizar(id, dados) {
    try {
        return await db.transacao(async tx => {
            const [atual] = await tx.query(`${SELECT_GRADE} WHERE g.id = ?`, [Number(id)]);
            if (!atual) throw erro.naoEncontrado('Aula não encontrada.');
            const v = await validar(tx, {
                professorId: dados.professorId ?? atual.professor_id,
                dia: dados.dia ?? atual.dia,
                faixa: dados.faixa ?? atual.faixa,
                sala: dados.sala ?? atual.sala,
                turma: dados.turma ?? atual.turma
            });
            await verificarConflitos(tx, v, atual.id);
            await tx.query(
                'UPDATE grade_semanal SET professor_id = ?, dia = ?, faixa = ?, sala_id = ?, turma_id = ? WHERE id = ?',
                [v.prof.id, v.dia, v.faixa, v.sala.id, v.turma.id, atual.id]
            );
            const [linha] = await tx.query(`${SELECT_GRADE} WHERE g.id = ?`, [atual.id]);
            return formatar(linha);
        });
    } catch (e) {
        throw traduzirErroBanco(e);
    }
}

async function remover(id) {
    const r = await db.query('DELETE FROM grade_semanal WHERE id = ?', [Number(id)]);
    if (!r.affectedRows) throw erro.naoEncontrado('Aula não encontrada.');
}

module.exports = { listar, criar, atualizar, remover };
