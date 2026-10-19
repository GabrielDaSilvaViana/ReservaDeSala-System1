/**
 * Adaptador SQLite usado SOMENTE nos testes automatizados (npm test).
 *
 * Usa o módulo nativo `node:sqlite` (Node 22+) e converte o database.sql do
 * MySQL para SQLite, para que os testes rodem sem precisar de um MySQL
 * instalado. O sistema em produção continua usando MySQL.
 */
const fs = require('fs');
const path = require('path');

/** Converte o script MySQL do projeto para um script equivalente em SQLite. */
function traduzirSchemaMysql(sql) {
    return sql
        .replace(/^\s*(CREATE DATABASE|USE|SET FOREIGN_KEY_CHECKS|DROP FUNCTION|DROP PROCEDURE)[^;]*;/gim, '')
        .replace(/CHARACTER SET \w+|COLLATE \w+/gi, '')
        .replace(/INT AUTO_INCREMENT PRIMARY KEY/gi, 'INTEGER PRIMARY KEY AUTOINCREMENT')
        .replace(/ENUM\([^)]*\)/gi, 'TEXT')
        .replace(/ON UPDATE CURRENT_TIMESTAMP/gi, '')
        .replace(/DATE_ADD\(CURDATE\(\), INTERVAL (\d+) DAY\)/gi, "date('now','localtime','+$1 days')")
        .replace(/DATE_SUB\(CURDATE\(\), INTERVAL (\d+) DAY\)/gi, "date('now','localtime','-$1 days')")
        .replace(/CURDATE\(\)/gi, "date('now','localtime')");
}

function traduzirErro(erro) {
    const msg = String(erro && erro.message);
    if (/UNIQUE constraint failed/i.test(msg)) erro.code = 'ER_DUP_ENTRY';
    else if (/FOREIGN KEY constraint failed/i.test(msg)) erro.code = 'ER_NO_REFERENCED_ROW_2';
    else if (/CHECK constraint failed/i.test(msg)) erro.code = 'ER_CHECK_CONSTRAINT_VIOLATED';
    else if (/NOT NULL constraint failed/i.test(msg)) erro.code = 'ER_BAD_NULL_ERROR';
    return erro;
}

function criar(arquivo) {
    const { DatabaseSync } = require('node:sqlite');
    const banco = new DatabaseSync(arquivo);
    banco.exec('PRAGMA foreign_keys = ON;');

    const existe = banco.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='salas'").get();
    if (!existe) {
        const script = fs.readFileSync(path.join(__dirname, '..', 'database', 'database.sql'), 'utf8');
        banco.exec(traduzirSchemaMysql(script));
    }

    const executar = (sql, params = []) => {
        const texto = sql.replace(/\s+FOR UPDATE/gi, '');
        const valores = params.map(v => (v === undefined ? null : typeof v === 'boolean' ? Number(v) : v));
        try {
            const comando = banco.prepare(texto);
            if (/^\s*(SELECT|WITH)/i.test(texto)) return comando.all(...valores).map(l => ({ ...l }));
            const r = comando.run(...valores);
            return { insertId: Number(r.lastInsertRowid), affectedRows: r.changes };
        } catch (erro) {
            throw traduzirErro(erro);
        }
    };

    // Fila simples: enquanto uma transação está aberta, os outros comandos esperam.
    let fila = Promise.resolve();

    return {
        async query(sql, params) {
            await fila;
            return executar(sql, params);
        },
        async transacao(fn) {
            let liberar;
            const anterior = fila;
            fila = new Promise(r => { liberar = r; });
            await anterior;
            banco.exec('BEGIN');
            try {
                const retorno = await fn({ query: async (sql, params) => executar(sql, params) });
                banco.exec('COMMIT');
                return retorno;
            } catch (erro) {
                try { banco.exec('ROLLBACK'); } catch (_) { /* ignora */ }
                throw erro;
            } finally {
                liberar();
            }
        },
        async fechar() {
            banco.close();
        }
    };
}

module.exports = { criar, traduzirSchemaMysql };
