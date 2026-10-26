/**
 * Ajustes automáticos em bancos que já existiam antes de uma atualização.
 *
 * Rodam toda vez que o servidor liga, mas só mudam alguma coisa na primeira
 * vez (depois não encontram mais nada para mudar). Assim não é preciso
 * recriar o banco nem perder reservas e credenciais já cadastradas.
 */
const db = require('../db');

/**
 * Remove as siglas "S" e "L" das salas: "S129" → "129" e
 * "S129 INFORMÁTICA" → "129 INFORMÁTICA".
 *
 * Reservas e grade guardam o id da sala (não o código), então continuam
 * ligadas às mesmas salas. Se já existir uma sala com o número sem sigla,
 * aquela sala é mantida como está para não haver código repetido.
 */
async function removerSiglasDasSalas() {
    const salas = await db.query('SELECT id, codigo, nome FROM salas');
    const codigos = new Set(salas.map(s => s.codigo));
    let alteradas = 0;

    for (const sala of salas) {
        const m = /^[SL](\d+)$/.exec(sala.codigo);
        if (!m) continue;
        const novoCodigo = m[1];
        if (codigos.has(novoCodigo)) {
            console.warn(`[banco] Sala ${sala.codigo} mantida: já existe uma sala ${novoCodigo}.`);
            continue;
        }
        const novoNome = sala.nome.startsWith(sala.codigo)
            ? novoCodigo + sala.nome.slice(sala.codigo.length)
            : sala.nome;
        await db.query('UPDATE salas SET codigo = ?, nome = ? WHERE id = ?', [novoCodigo, novoNome, sala.id]);
        codigos.delete(sala.codigo);
        codigos.add(novoCodigo);
        alteradas += 1;
    }

    if (alteradas) console.log(`🔧 Siglas S/L removidas de ${alteradas} sala(s).`);
    return alteradas;
}

/**
 * Coluna salas.solenoide (em qual das 3 solenoides fica a chave da sala).
 * Em banco antigo a coluna é criada e as salas do 1º andar são divididas em
 * 3 fileiras, na ordem em que aparecem no painel: fileira de cima → solenoide 1,
 * do meio → 2, de baixo → 3. Só divide se nenhuma sala tiver solenoide ainda.
 */
async function garantirSolenoideDasSalas() {
    let criou = false;
    try {
        await db.query('SELECT solenoide FROM salas LIMIT 1');
    } catch (_) {
        await db.query('ALTER TABLE salas ADD COLUMN solenoide TINYINT NULL');
        criou = true;
    }
    const [{ total }] = await db.query('SELECT COUNT(*) AS total FROM salas WHERE solenoide IS NOT NULL');
    if (Number(total) > 0) return 0;

    const numero = codigo => Number(String(codigo).replace(/\D/g, '')) || 0;
    const salas = (await db.query('SELECT id, codigo FROM salas WHERE andar = 1'))
        .sort((a, b) => numero(a.codigo) - numero(b.codigo) || a.codigo.localeCompare(b.codigo));
    if (!salas.length) return 0;
    const porFileira = Math.ceil(salas.length / 3);
    for (let i = 0; i < salas.length; i++) {
        await db.query('UPDATE salas SET solenoide = ? WHERE id = ?', [Math.floor(i / porFileira) + 1, salas[i].id]);
    }
    console.log(`🔧 ${criou ? 'Coluna "solenoide" criada. ' : ''}Salas do 1º andar divididas nas solenoides 1, 2 e 3 (${porFileira} por fileira).`);
    return salas.length;
}

async function aplicarMigracoes() {
    await removerSiglasDasSalas();
    await garantirSolenoideDasSalas();
}

module.exports = { aplicarMigracoes, removerSiglasDasSalas, garantirSolenoideDasSalas };
