/**
 * Testes do ESP32 (destrave automático) e do leitor de digital DY50,
 * usando um ESP32 simulado na rede local.  Rode com:  npm test
 */
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { criarMockEsp32 } = require('./mock-esp32');

const mock = criarMockEsp32();
let servidor, base, db, tokenAdmin;

async function chamar(metodo, caminho, corpo, token) {
    const r = await fetch(base + caminho, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    const texto = await r.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (_) { /* não é JSON */ }
    return { status: r.status, json, texto };
}

before(async () => {
    await new Promise(r => mock.servidor.listen(0, '127.0.0.1', r));
    Object.assign(process.env, {
        DB_CLIENT: 'sqlite', SQLITE_FILE: ':memory:', INNOVAROOM_AGORA: '2026-10-19T10:00:00',
        INNOVAROOM_ENV_FILE: '/arquivo-inexistente', ADMIN_SENHA: 'senha-de-teste',
        ESP32_HOST: '127.0.0.1', ESP32_PORT: String(mock.servidor.address().port), ESP32_TIMEOUT_MS: '2000',
        DIGITAL_LEITOR: 'esp32', DIGITAL_TEMPO_LEITURA_MS: '3000', DIGITAL_TEMPO_CADASTRO_MS: '3000'
    });
    delete process.env.SOLENOIDE_MODO; // padrão 'auto'
    db = require('../src/db');
    await require('../src/servicos/admin').garantirAdminInicial();
    servidor = require('../server').criarApp().listen(0);
    await new Promise(r => servidor.once('listening', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
    tokenAdmin = (await chamar('POST', '/api/admin/login', { usuario: 'admin', senha: 'senha-de-teste' })).json.token;
});

after(async () => {
    servidor.close();
    mock.servidor.close();
    await db.fechar();
});

const idProf = async nome => (await db.query('SELECT id FROM professores WHERE nome = ?', [nome]))[0].id;

test('modo automático: com ESP32_HOST preenchido a solenoide usa o hardware', async () => {
    const e = (await chamar('GET', '/api/estado')).json;
    assert.equal(e.solenoideModo, 'hardware');
    assert.equal(e.esp32Configurado, true);
    assert.equal(e.digitalModo, 'esp32');
});

test('cadastro da digital no leitor pelo administrador', async () => {
    const ana = await idProf('Prof. Ana Souza');
    mock.dedo = 'dedo-ana';
    assert.equal((await chamar('POST', `/api/professores/${ana}/digital/cadastrar`)).status, 403, 'só admin');
    const r = await chamar('POST', `/api/professores/${ana}/digital/cadastrar`, undefined, tokenAdmin);
    assert.equal(r.status, 200, r.texto);
    assert.equal(mock.banco.get(ana), 'dedo-ana', 'digital salva no DY50 com o ID do professor');
    const lista = (await chamar('GET', '/api/professores', undefined, tokenAdmin)).json;
    assert.equal(lista.find(p => p.id === ana).temDigital, true);

    const carlos = await idProf('Prof. Carlos Lima');
    const dup = await chamar('POST', `/api/professores/${carlos}/digital/cadastrar`, undefined, tokenAdmin);
    assert.equal(dup.status, 400);
    assert.match(dup.json.erro, /já está cadastrada/);
});

test('leitura real da digital: token de uso único, sem aceitar número digitado', async () => {
    const ana = await idProf('Prof. Ana Souza');
    mock.dedo = 'dedo-ana';
    const leitura = await chamar('POST', '/api/digital/ler');
    assert.equal(leitura.status, 200, leitura.texto);
    assert.ok(leitura.json.leitura);
    assert.equal(leitura.json.id, undefined, 'o ID não vai para o navegador');

    const reserva = await chamar('POST', '/api/reservas', { sala: '304', professorId: ana, data: '2026-10-19', inicio: '10:00', fim: '11:00', credencial: { metodo: 'digital', leitura: leitura.json.leitura } });
    assert.equal(reserva.status, 201, reserva.texto);

    const repetida = await chamar('POST', '/api/reservas', { sala: '305', professorId: ana, data: '2026-10-20', inicio: '10:00', fim: '11:00', credencial: { metodo: 'digital', leitura: leitura.json.leitura } });
    assert.equal(repetida.status, 400, 'token já usado');

    const digitado = await chamar('POST', '/api/reservas', { sala: '305', professorId: ana, data: '2026-10-20', inicio: '10:00', fim: '11:00', credencial: { metodo: 'digital', codigo: String(ana) } });
    assert.equal(digitado.status, 400, 'número digitado não vale com o leitor ativo');

    mock.dedo = 'dedo-desconhecido';
    const desconhecido = await chamar('POST', '/api/digital/ler');
    assert.equal(desconhecido.status, 401);
    assert.match(desconhecido.json.erro, /não cadastrada/);

    mock.dedo = null;
    const semDedo = await chamar('POST', '/api/digital/ler');
    assert.equal(semDedo.status, 400);
    assert.match(semDedo.json.erro, /Nenhum dedo/);
});

test('ocupar a sala destrava a solenoide automaticamente e "destravar novamente" funciona', async () => {
    const reserva = (await chamar('GET', '/api/estado')).json.reservas.find(r => r.sala === '304');
    mock.dedo = 'dedo-ana';
    const { leitura } = (await chamar('POST', '/api/digital/ler')).json;
    const antes = mock.destraves;
    const ocupar = await chamar('POST', `/api/reservas/${reserva.id}/ocupar`, { credencial: { metodo: 'digital', leitura } });
    assert.equal(ocupar.status, 200, ocupar.texto);
    assert.equal(ocupar.json.solenoide.modo, 'hardware');
    assert.equal(ocupar.json.solenoide.ok, true);
    assert.equal(mock.destraves, antes + 1, 'o servidor mandou destravar sem precisar de botão');

    const status = (await chamar('GET', '/api/solenoide/status')).json;
    assert.equal(status.travada, false);
    assert.equal(status.leitorDigital, true);

    const denovo = await chamar('POST', '/api/solenoide/destravar', { ticket: ocupar.json.ticket });
    assert.equal(denovo.json.ok, true);
    assert.equal(mock.destraves, antes + 2);
});

test('leitor desconectado e remoção da digital', async () => {
    mock.leitor = false;
    const r = await chamar('POST', '/api/digital/ler');
    assert.equal(r.status, 502);
    assert.match(r.json.erro, /DY50 não encontrado/);
    mock.leitor = true;

    const ana = await idProf('Prof. Ana Souza');
    assert.equal((await chamar('DELETE', `/api/professores/${ana}/credenciais/digital`, undefined, tokenAdmin)).status, 200);
    assert.deepEqual(mock.apagados, [ana], 'digital apagada também do DY50');
});
