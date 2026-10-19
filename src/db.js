/**
 * Acesso ao banco de dados.
 *
 * Expõe só três funções para o resto do sistema:
 *   query(sql, params)   → executa um comando e devolve as linhas (SELECT)
 *                          ou { insertId, affectedRows } (INSERT/UPDATE/DELETE)
 *   transacao(async tx => { ... })  → executa vários comandos de forma atômica
 *   fechar()
 *
 * Em produção usa MySQL (mysql2). Para os testes automatizados existe um
 * adaptador SQLite (db-sqlite.js) que segue a mesma interface.
 */
const config = require('./config');

function criarDriverMysql() {
    const mysql = require('mysql2/promise');
    const pool = mysql.createPool({
        host: config.banco.host,
        port: config.banco.porta,
        user: config.banco.usuario,
        password: config.banco.senha,
        database: config.banco.nome,
        charset: 'utf8mb4',
        // Datas voltam como texto 'AAAA-MM-DD' — evita erros de fuso horário
        dateStrings: true,
        waitForConnections: true,
        connectionLimit: 10,
        queueLimit: 0
    });

    return {
        async query(sql, params = []) {
            const [resultado] = await pool.query(sql, params);
            return resultado;
        },
        async transacao(fn) {
            const conexao = await pool.getConnection();
            try {
                await conexao.beginTransaction();
                const tx = {
                    query: async (sql, params = []) => {
                        const [resultado] = await conexao.query(sql, params);
                        return resultado;
                    }
                };
                const retorno = await fn(tx);
                await conexao.commit();
                return retorno;
            } catch (erro) {
                try { await conexao.rollback(); } catch (_) { /* ignora */ }
                throw erro;
            } finally {
                conexao.release();
            }
        },
        async fechar() {
            await pool.end();
        }
    };
}

let driver = null;

function obterDriver() {
    if (!driver) {
        driver = config.banco.cliente === 'sqlite'
            ? require('./db-sqlite').criar(config.banco.arquivoSqlite)
            : criarDriverMysql();
    }
    return driver;
}

module.exports = {
    query: (sql, params = []) => obterDriver().query(sql, params),
    transacao: (fn) => obterDriver().transacao(fn),
    fechar: async () => {
        if (driver) await driver.fechar();
        driver = null;
    }
};
