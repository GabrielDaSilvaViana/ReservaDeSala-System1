/**
 * Cria (ou recria do zero) o banco de dados do InnovaRoom no MySQL.
 * Uso:  npm run banco:recriar
 *
 * ATENÇÃO: apaga todas as reservas, grade e credenciais cadastradas.
 * Usa as configurações de conexão do arquivo .env.
 */
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const config = require('../src/config');

async function main() {
    if (!process.argv.includes('--confirmar')) {
        console.log('Este comando APAGA e recria o banco. Rode com:  npm run banco:recriar');
        process.exit(1);
    }
    const arquivo = path.join(__dirname, '..', 'database', 'database.sql');
    let sql = fs.readFileSync(arquivo, 'utf8');
    if (config.banco.nome !== 'innovaroom') {
        sql = sql.replace(/\binnovaroom\b/g, config.banco.nome);
    }

    console.log(`Conectando ao MySQL em ${config.banco.host}:${config.banco.porta} como "${config.banco.usuario}"...`);
    const conexao = await mysql.createConnection({
        host: config.banco.host,
        port: config.banco.porta,
        user: config.banco.usuario,
        password: config.banco.senha,
        multipleStatements: true,
        charset: 'utf8mb4'
    });
    try {
        await conexao.query(sql);
        const [[{ salas }]] = await conexao.query(`SELECT COUNT(*) AS salas FROM \`${config.banco.nome}\`.salas`);
        console.log(`✅ Banco "${config.banco.nome}" criado com sucesso (${salas} salas).`);
        console.log('   Agora rode:  npm start');
    } finally {
        await conexao.end();
    }
}

main().catch(e => {
    console.error('❌ Falha ao criar o banco:', e.code === 'ER_ACCESS_DENIED_ERROR'
        ? 'usuário ou senha do MySQL incorretos (DB_USER / DB_PASSWORD no .env).'
        : e.code === 'ECONNREFUSED' ? 'o MySQL não está rodando ou o host/porta está errado.' : e.message);
    process.exit(1);
});
