/**
 * Autenticação do administrador.
 *
 * - A senha é guardada no banco como hash scrypt (com "sal" aleatório).
 * - Ao entrar, o servidor gera um token de sessão aleatório que o navegador
 *   envia no cabeçalho "Authorization: Bearer <token>" em cada requisição.
 * - As rotas administrativas usam o middleware `exigirAdmin`.
 */
const crypto = require('crypto');
const db = require('../db');
const config = require('../config');
const { erro } = require('./erros');

const sessoes = new Map(); // token -> { adminId, usuario, expiraEm }
const tentativasLogin = new Map(); // ip -> { falhas, bloqueadoAte }

function gerarHashSenha(senha) {
    const sal = crypto.randomBytes(16).toString('hex');
    const hash = crypto.scryptSync(String(senha), sal, 64).toString('hex');
    return `scrypt$${sal}$${hash}`;
}

function conferirSenha(senha, armazenado) {
    const partes = String(armazenado || '').split('$');
    if (partes.length !== 3 || partes[0] !== 'scrypt') return false;
    const [, sal, hashSalvo] = partes;
    const hash = crypto.scryptSync(String(senha), sal, 64);
    const esperado = Buffer.from(hashSalvo, 'hex');
    return esperado.length === hash.length && crypto.timingSafeEqual(hash, esperado);
}

/** Cria o usuário "admin" na primeira execução, se ainda não houver nenhum administrador. */
async function garantirAdminInicial() {
    const [linha] = await db.query('SELECT COUNT(*) AS total FROM admins');
    if (Number(linha.total) > 0) return false;
    await db.query('INSERT INTO admins (usuario, senha_hash) VALUES (?, ?)', ['admin', gerarHashSenha(config.admin.senhaInicial)]);
    return true;
}

function verificarBloqueio(ip) {
    const t = tentativasLogin.get(ip);
    if (t && t.bloqueadoAte > Date.now()) {
        const seg = Math.ceil((t.bloqueadoAte - Date.now()) / 1000);
        throw erro.muitasTentativas(`Muitas tentativas de login. Aguarde ${seg} segundos.`);
    }
}

function registrarFalha(ip) {
    const t = tentativasLogin.get(ip) || { falhas: 0, bloqueadoAte: 0 };
    t.falhas += 1;
    if (t.falhas >= config.regras.maxTentativas) {
        t.falhas = 0;
        t.bloqueadoAte = Date.now() + config.regras.bloqueioMinutos * 60 * 1000;
    }
    tentativasLogin.set(ip, t);
}

async function login(usuario, senha, ip) {
    verificarBloqueio(ip);
    const nome = String(usuario || '').trim();
    if (!nome || !senha) throw erro.requisicao('Informe usuário e senha.');
    const [admin] = await db.query('SELECT id, usuario, senha_hash FROM admins WHERE usuario = ? LIMIT 1', [nome]);
    if (!admin || !conferirSenha(senha, admin.senha_hash)) {
        registrarFalha(ip);
        throw erro.naoAutenticado('Usuário ou senha incorretos.');
    }
    tentativasLogin.delete(ip);
    const token = crypto.randomBytes(32).toString('hex');
    sessoes.set(token, {
        adminId: admin.id,
        usuario: admin.usuario,
        expiraEm: Date.now() + config.admin.duracaoSessaoHoras * 60 * 60 * 1000
    });
    return { token, usuario: admin.usuario };
}

function logout(token) {
    sessoes.delete(token);
}

async function trocarSenha(adminId, senhaAtual, novaSenha) {
    if (!novaSenha || String(novaSenha).length < 6) throw erro.requisicao('A nova senha deve ter pelo menos 6 caracteres.');
    const [admin] = await db.query('SELECT senha_hash FROM admins WHERE id = ?', [adminId]);
    if (!admin || !conferirSenha(senhaAtual, admin.senha_hash)) throw erro.naoAutenticado('Senha atual incorreta.');
    await db.query('UPDATE admins SET senha_hash = ? WHERE id = ?', [gerarHashSenha(novaSenha), adminId]);
}

function sessaoDaRequisicao(req) {
    const cabecalho = req.get('authorization') || '';
    const m = cabecalho.match(/^Bearer\s+([a-f0-9]{64})$/i);
    if (!m) return null;
    const sessao = sessoes.get(m[1]);
    if (!sessao) return null;
    if (sessao.expiraEm < Date.now()) {
        sessoes.delete(m[1]);
        return null;
    }
    return { ...sessao, token: m[1] };
}

/** Middleware: preenche req.admin quando houver sessão válida (não bloqueia). */
function identificarAdmin(req, _res, next) {
    req.admin = sessaoDaRequisicao(req);
    next();
}

/** Middleware: só deixa passar o administrador logado. */
function exigirAdmin(req, _res, next) {
    if (!req.admin) return next(erro.proibido('Faça login como administrador para realizar esta ação.'));
    next();
}

module.exports = {
    gerarHashSenha,
    conferirSenha,
    garantirAdminInicial,
    login,
    logout,
    trocarSenha,
    identificarAdmin,
    exigirAdmin
};
