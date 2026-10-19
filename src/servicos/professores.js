/**
 * Cadastro de professores e de suas credenciais (uso do administrador).
 */
const db = require('../db');
const credenciais = require('./credenciais');
const digital = require('./digital');
const { erro } = require('./erros');

async function listar({ admin = false } = {}) {
    const linhas = await db.query(
        `SELECT id, nome, cracha_hash, digital_hash, rosto_descritor
           FROM professores WHERE ativo = 1 ORDER BY id`
    );
    return linhas.map(p => {
        const base = { id: p.id, nome: p.nome };
        if (!admin) return base;
        return {
            ...base,
            temCracha: Boolean(p.cracha_hash),
            temDigital: Boolean(p.digital_hash),
            temRosto: Boolean(p.rosto_descritor)
        };
    });
}

async function listarTurmas() {
    return db.query('SELECT id, nome, curso FROM turmas ORDER BY id');
}

async function criar(nome) {
    const texto = String(nome || '').trim().replace(/\s+/g, ' ');
    if (texto.length < 3) throw erro.requisicao('Informe o nome completo do professor.');
    if (texto.length > 100) throw erro.requisicao('O nome deve ter no máximo 100 caracteres.');
    try {
        const r = await db.query('INSERT INTO professores (nome) VALUES (?)', [texto]);
        return { id: r.insertId, nome: texto };
    } catch (e) {
        if (e.code === 'ER_DUP_ENTRY') throw erro.conflito('Já existe um professor com esse nome.');
        throw e;
    }
}

async function definirCredencial(professorId, credencial) {
    await db.transacao(tx => credenciais.definirPeloAdmin(tx, Number(professorId), credencial));
}

async function removerCredencial(professorId, metodo) {
    if (!['cracha', 'digital', 'facial', 'todas'].includes(metodo)) throw erro.requisicao('Método inválido.');
    await credenciais.removerPeloAdmin(db, Number(professorId), metodo);
    if (metodo === 'digital' || metodo === 'todas') await digital.apagar(professorId);
}

/** Cadastra a digital do professor no leitor DY50 e vincula ao cadastro dele. */
async function cadastrarDigitalNoLeitor(professorId) {
    const id = Number(professorId);
    const [prof] = await db.query('SELECT id FROM professores WHERE id = ? AND ativo = 1', [id]);
    if (!prof) throw erro.naoEncontrado('Professor não encontrado.');
    await digital.cadastrar(id);
    await definirCredencial(id, { metodo: 'digital', codigo: String(id) });
}

module.exports = { listar, listarTurmas, criar, definirCredencial, removerCredencial, cadastrarDigitalNoLeitor };
