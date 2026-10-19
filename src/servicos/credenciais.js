/**
 * Verificação de identidade dos professores (crachá, digital ou rosto).
 *
 * Regras:
 *  - Os códigos de crachá e digital são salvos como hash SHA-256: mesmo quem
 *    tiver acesso ao banco não vê o código original.
 *  - O rosto é salvo como um descritor de 128 números calculado pelo
 *    face-api.js no navegador. Dois rostos são da mesma pessoa quando a
 *    distância euclidiana entre os descritores é menor que LIMIAR_FACIAL.
 *  - PRIMEIRO ACESSO: se o professor ainda não tem NENHUMA credencial
 *    cadastrada, a credencial usada é cadastrada automaticamente. Depois disso,
 *    novas credenciais só podem ser cadastradas pelo administrador.
 *  - Um mesmo crachá, digital ou rosto não pode pertencer a dois professores.
 *  - Após várias tentativas erradas o professor fica bloqueado por alguns minutos.
 */
const crypto = require('crypto');
const config = require('../config');
const digital = require('./digital');
const { erro } = require('./erros');

const METODOS = ['cracha', 'digital', 'facial'];
const NOME_METODO = { cracha: 'crachá', digital: 'digital', facial: 'reconhecimento facial' };
const COLUNA = { cracha: 'cracha_hash', digital: 'digital_hash' };

const tentativas = new Map(); // professorId -> { falhas, bloqueadoAte }

function hashCodigo(codigo) {
    return crypto.createHash('sha256').update(String(codigo).trim().toUpperCase(), 'utf8').digest('hex');
}

function validarCodigo(codigo, metodo) {
    const texto = String(codigo ?? '').trim();
    if (!texto) throw erro.requisicao(`Informe o código ${metodo === 'cracha' ? 'do crachá' : 'da digital'}.`);
    if (texto.length > 64 || !/^[\w\-:.]+$/.test(texto)) {
        throw erro.requisicao('Código inválido. Use apenas letras, números, hífen, ponto, dois-pontos ou sublinhado (máx. 64).');
    }
    return texto;
}

function validarDescritor(descritor) {
    if (!Array.isArray(descritor) || descritor.length !== 128 || !descritor.every(n => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) < 10)) {
        throw erro.requisicao('Leitura facial inválida. Tente capturar o rosto novamente.');
    }
    return descritor;
}

function distancia(a, b) {
    let soma = 0;
    for (let i = 0; i < a.length; i++) soma += (a[i] - b[i]) ** 2;
    return Math.sqrt(soma);
}

function lerDescritor(texto) {
    if (!texto) return null;
    try {
        const v = JSON.parse(texto);
        return Array.isArray(v) && v.length === 128 ? v : null;
    } catch (_) {
        return null;
    }
}

/**
 * Valida o formato da credencial.
 * Com o leitor DY50 ativo (DIGITAL_LEITOR=esp32), a digital chega como um
 * token de leitura gerado pelo servidor — o número digitado não é aceito
 * (exceto pelo administrador, que pode definir o número manualmente).
 */
function validarCredencial(credencial, { admin = false } = {}) {
    if (!credencial || !METODOS.includes(credencial.metodo)) {
        throw erro.requisicao('Escolha um método de identificação: digital, facial ou crachá.');
    }
    if (credencial.metodo === 'facial') return { metodo: 'facial', descritor: validarDescritor(credencial.descritor) };
    if (credencial.metodo === 'digital' && digital.usaLeitor() && !admin) {
        if (!credencial.leitura) throw erro.requisicao('Coloque o dedo no leitor de digital.');
        return { metodo: 'digital', codigo: digital.consumirLeitura(credencial.leitura) };
    }
    return { metodo: credencial.metodo, codigo: validarCodigo(credencial.codigo, credencial.metodo) };
}

function verificarBloqueio(professorId) {
    const t = tentativas.get(professorId);
    if (t && t.bloqueadoAte > Date.now()) {
        const seg = Math.ceil((t.bloqueadoAte - Date.now()) / 1000);
        throw erro.muitasTentativas(`Muitas tentativas inválidas para este professor. Aguarde ${seg} segundos.`);
    }
}

function registrarFalha(professorId) {
    const t = tentativas.get(professorId) || { falhas: 0, bloqueadoAte: 0 };
    t.falhas += 1;
    if (t.falhas >= config.regras.maxTentativas) {
        t.falhas = 0;
        t.bloqueadoAte = Date.now() + config.regras.bloqueioMinutos * 60 * 1000;
    }
    tentativas.set(professorId, t);
}

/** Garante que o crachá/digital/rosto não pertence a outro professor. */
async function garantirExclusividade(q, professorId, cred) {
    if (cred.metodo === 'facial') {
        const outros = await q.query('SELECT id, nome, rosto_descritor FROM professores WHERE id <> ? AND rosto_descritor IS NOT NULL', [professorId]);
        for (const p of outros) {
            const d = lerDescritor(p.rosto_descritor);
            if (d && distancia(d, cred.descritor) < config.regras.limiarFacial) {
                throw erro.conflito('Este rosto já está cadastrado para outro professor.');
            }
        }
        return;
    }
    const coluna = COLUNA[cred.metodo];
    const [dono] = await q.query(`SELECT id FROM professores WHERE ${coluna} = ? AND id <> ? LIMIT 1`, [hashCodigo(cred.codigo), professorId]);
    if (dono) throw erro.conflito(`Este código de ${NOME_METODO[cred.metodo]} já está cadastrado para outro professor.`);
}

async function salvarCredencial(q, professorId, cred) {
    if (cred.metodo === 'facial') {
        const arredondado = cred.descritor.map(n => Math.round(n * 1e6) / 1e6);
        await q.query('UPDATE professores SET rosto_descritor = ? WHERE id = ?', [JSON.stringify(arredondado), professorId]);
    } else {
        await q.query(`UPDATE professores SET ${COLUNA[cred.metodo]} = ? WHERE id = ?`, [hashCodigo(cred.codigo), professorId]);
    }
}

/**
 * Confere a credencial do professor. Lança erro 401 se não conferir.
 * Retorna { metodo, primeiroAcesso } — primeiroAcesso = true quando a
 * credencial acabou de ser cadastrada.
 */
async function verificar(q, professorId, credencialBruta) {
    const cred = validarCredencial(credencialBruta);
    verificarBloqueio(professorId);

    const [prof] = await q.query(
        'SELECT id, nome, cracha_hash, digital_hash, rosto_descritor FROM professores WHERE id = ? AND ativo = 1',
        [professorId]
    );
    if (!prof) throw erro.naoEncontrado('Professor não encontrado.');

    const temAlguma = Boolean(prof.cracha_hash || prof.digital_hash || prof.rosto_descritor);

    if (!temAlguma) {
        await garantirExclusividade(q, prof.id, cred);
        await salvarCredencial(q, prof.id, cred);
        return { metodo: cred.metodo, primeiroAcesso: true };
    }

    let confere;
    if (cred.metodo === 'facial') {
        const salvo = lerDescritor(prof.rosto_descritor);
        if (!salvo) throw erro.naoAutenticado(`${prof.nome} não tem rosto cadastrado. Use outro método ou peça ao administrador para cadastrar.`);
        confere = distancia(salvo, cred.descritor) < config.regras.limiarFacial;
    } else {
        const salvo = prof[COLUNA[cred.metodo]];
        if (!salvo) throw erro.naoAutenticado(`${prof.nome} não tem ${NOME_METODO[cred.metodo]} cadastrado. Use outro método ou peça ao administrador para cadastrar.`);
        const recebido = Buffer.from(hashCodigo(cred.codigo), 'hex');
        confere = crypto.timingSafeEqual(recebido, Buffer.from(salvo, 'hex'));
    }

    if (!confere) {
        registrarFalha(prof.id);
        throw erro.naoAutenticado(cred.metodo === 'facial'
            ? 'O rosto não corresponde ao professor selecionado.'
            : `Código de ${NOME_METODO[cred.metodo]} incorreto para ${prof.nome}.`);
    }
    tentativas.delete(prof.id);
    return { metodo: cred.metodo, primeiroAcesso: false };
}

/** Procura o professor dono de um código de digital (leitor físico na porta). */
async function professorPorDigital(q, codigo) {
    const texto = validarCodigo(codigo, 'digital');
    const [prof] = await q.query('SELECT id, nome FROM professores WHERE digital_hash = ? AND ativo = 1 LIMIT 1', [hashCodigo(texto)]);
    return prof || null;
}

/** Uso do administrador: cadastra ou troca uma credencial do professor. */
async function definirPeloAdmin(q, professorId, credencialBruta) {
    const cred = validarCredencial(credencialBruta, { admin: true });
    const [prof] = await q.query('SELECT id FROM professores WHERE id = ?', [professorId]);
    if (!prof) throw erro.naoEncontrado('Professor não encontrado.');
    await garantirExclusividade(q, professorId, cred);
    await salvarCredencial(q, professorId, cred);
    tentativas.delete(professorId);
}

/** Uso do administrador: remove uma credencial (ou todas). */
async function removerPeloAdmin(q, professorId, metodo) {
    const colunas = metodo === 'todas'
        ? ['cracha_hash', 'digital_hash', 'rosto_descritor']
        : [metodo === 'facial' ? 'rosto_descritor' : COLUNA[metodo]].filter(Boolean);
    if (!colunas.length) throw erro.requisicao('Método inválido.');
    const r = await q.query(`UPDATE professores SET ${colunas.map(c => `${c} = NULL`).join(', ')} WHERE id = ?`, [professorId]);
    if (!r.affectedRows) throw erro.naoEncontrado('Professor não encontrado.');
    tentativas.delete(professorId);
}

module.exports = {
    METODOS,
    hashCodigo,
    distancia,
    verificar,
    professorPorDigital,
    definirPeloAdmin,
    removerPeloAdmin
};
