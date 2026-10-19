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

async function aplicarMigracoes() {
    await removerSiglasDasSalas();
}

module.exports = { aplicarMigracoes, removerSiglasDasSalas };
