/**
 * InnovaRoom — servidor web e API.
 *
 * Inicie com:  npm start
 * Depois abra: http://localhost:3000
 */
const path = require('path');
const fs = require('fs');
const express = require('express');
const config = require('./src/config');
const db = require('./src/db');
const admin = require('./src/servicos/admin');
const reservas = require('./src/servicos/reservas');
const { ErroHttp } = require('./src/servicos/erros');

function criarApp() {
    const app = express();
    app.disable('x-powered-by');
    app.use(express.json({ limit: '50kb' }));

    // Cabeçalhos básicos de segurança
    app.use((_req, res, next) => {
        res.set('X-Content-Type-Options', 'nosniff');
        res.set('X-Frame-Options', 'SAMEORIGIN');
        res.set('Referrer-Policy', 'same-origin');
        next();
    });

    // Somente a pasta "public" é acessível pelo navegador.
    // (Antes o projeto inteiro era publicado, inclusive server.js e o .ino com a senha do Wi-Fi.)
    app.use(express.static(path.join(__dirname, 'public'), { index: 'index.html' }));

    // Biblioteca de reconhecimento facial (vem do pacote face-api.js já instalado)
    const faceApiDist = path.join(__dirname, 'node_modules', 'face-api.js', 'dist');
    if (fs.existsSync(faceApiDist)) app.use('/vendor', express.static(faceApiDist));

    // API
    app.use('/api', admin.identificarAdmin);
    app.use('/api', require('./src/rotas/estado'));
    app.use('/api', require('./src/rotas/reservas'));
    app.use('/api', require('./src/rotas/grade'));
    app.use('/api', require('./src/rotas/admin'));
    app.use('/api', require('./src/rotas/solenoide'));

    app.use('/api', (_req, res) => res.status(404).json({ erro: 'Rota não encontrada.' }));

    // Tratador central de erros: sempre responde JSON { erro: "..." }
    // eslint-disable-next-line no-unused-vars
    app.use((err, req, res, _next) => {
        if (err instanceof ErroHttp) {
            return res.status(err.status).json({ erro: err.message, ...(err.detalhes ? { detalhes: err.detalhes } : {}) });
        }
        if (err.type === 'entity.parse.failed') return res.status(400).json({ erro: 'JSON inválido.' });
        if (err.type === 'entity.too.large') return res.status(413).json({ erro: 'Requisição muito grande.' });
        if (err.code === 'ER_LOCK_DEADLOCK' || err.code === 'ER_LOCK_WAIT_TIMEOUT') {
            return res.status(409).json({ erro: 'Outra pessoa alterou esta sala ao mesmo tempo. Tente novamente.' });
        }
        if (err.code === 'ECONNREFUSED' || err.code === 'ER_ACCESS_DENIED_ERROR' || err.code === 'ER_BAD_DB_ERROR') {
            console.error(`[banco] ${err.code}: ${err.message}`);
            return res.status(503).json({ erro: 'Banco de dados indisponível. Verifique se o MySQL está ligado e as configurações do .env.' });
        }
        console.error(`[erro] ${req.method} ${req.originalUrl}:`, err);
        res.status(500).json({ erro: 'Erro interno do servidor.' });
    });

    return app;
}

async function iniciar() {
    try {
        await db.query('SELECT 1 FROM salas LIMIT 1');
    } catch (e) {
        console.error('\n❌ Não foi possível acessar o banco de dados.');
        if (e.code === 'ER_BAD_DB_ERROR' || e.code === 'ER_NO_SUCH_TABLE' || /no such table/i.test(e.message)) {
            console.error('   O banco "innovaroom" ainda não foi criado. Rode:  npm run banco:recriar');
        } else if (e.code === 'ECONNREFUSED') {
            console.error('   O MySQL não está rodando ou o host/porta do .env está errado.');
        } else if (e.code === 'ER_ACCESS_DENIED_ERROR') {
            console.error('   Usuário ou senha do MySQL incorretos (DB_USER / DB_PASSWORD no .env).');
        } else {
            console.error('  ', e.message);
        }
        process.exit(1);
    }

    try {
        await require('./src/servicos/migracoes').aplicarMigracoes();
    } catch (e) {
        console.error('[banco] Não foi possível aplicar os ajustes automáticos:', e.message);
    }

    if (await admin.garantirAdminInicial()) {
        console.log('👤 Usuário administrador criado: "admin" (senha definida em ADMIN_SENHA no .env).');
        if (config.admin.senhaInicial === 'admin123') {
            console.warn('⚠️  A senha do admin é a padrão "admin123". Troque no painel do administrador.');
        }
    }

    await reservas.manutencao();
    setInterval(() => reservas.manutencao().catch(e => console.error('[manutencao]', e.message)), 30 * 1000).unref();

    const app = criarApp();
    app.listen(config.porta, config.host, () => {
        console.log(`✅ InnovaRoom rodando em http://localhost:${config.porta}`);
        const solenoide = require('./src/servicos/solenoide');
        console.log(`   Solenoide: modo ${solenoide.modoEfetivo()}${config.solenoide.esp32Host ? ` (ESP32 em ${config.solenoide.esp32Host})` : ''}`);
        console.log(`   Digital: ${config.digital.modo === 'esp32' ? 'leitor DY50 pelo ESP32' : 'código digitado (simulação)'}`);
    });
}

if (require.main === module) {
    iniciar();
}

module.exports = { criarApp };
