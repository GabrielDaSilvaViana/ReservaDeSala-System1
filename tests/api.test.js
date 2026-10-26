/**
 * Testes automatizados da API (rode com:  npm test).
 *
 * Usam um banco SQLite em memória criado a partir do database/database.sql,
 * por isso não precisam de MySQL instalado (requer Node 22 ou superior).
 * A data/hora do servidor é fixada em uma segunda-feira, 10:00.
 */
process.env.DB_CLIENT = 'sqlite';
process.env.SQLITE_FILE = ':memory:';
process.env.INNOVAROOM_AGORA = '2026-10-19T10:00:00';
process.env.INNOVAROOM_ENV_FILE = '/arquivo-inexistente';
process.env.ADMIN_SENHA = 'senha-de-teste';
process.env.SOLENOIDE_MODO = 'simulacao';
process.env.DISPOSITIVO_TOKEN = 'token-do-leitor';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');

const db = require('../src/db');
const admin = require('../src/servicos/admin');
const { criarApp } = require('../server');

let servidor;
let base;
let tokenAdmin;

async function chamar(metodo, caminho, corpo, { token, headers = {} } = {}) {
    const resposta = await fetch(base + caminho, {
        method: metodo,
        headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...headers
        },
        body: corpo === undefined ? undefined : JSON.stringify(corpo)
    });
    const texto = await resposta.text();
    let json = null;
    try { json = JSON.parse(texto); } catch (_) { /* não é JSON */ }
    return { status: resposta.status, json, texto };
}

const professorId = async nome => (await db.query('SELECT id FROM professores WHERE nome = ?', [nome]))[0].id;
const cracha = codigo => ({ metodo: 'cracha', codigo });

before(async () => {
    await admin.garantirAdminInicial();
    servidor = criarApp().listen(0);
    await new Promise(r => servidor.once('listening', r));
    base = `http://127.0.0.1:${servidor.address().port}`;
});

after(async () => {
    servidor.close();
    await db.fechar();
});

test('estado inicial: 38 salas, grade carregada e códigos de reserva ocultos', async () => {
    const r = await chamar('GET', '/api/estado');
    assert.equal(r.status, 200);
    assert.equal(r.json.salas.length, 38);
    assert.equal(r.json.grade.length, 46);
    assert.equal(r.json.professores.length, 12);
    assert.ok(r.json.reservas.every(x => x.codigo === null), 'código RES- não deve ir para quem não é admin');
    const s129 = r.json.salas.find(s => s.codigo === '129');
    assert.equal(s129.status, 'reservada', 'reserva de hoje às 19:00 deixa a sala reservada');
    assert.equal(r.json.salas.find(s => s.codigo === '224').status, 'livre', 'reserva de amanhã não bloqueia a sala hoje');
});

test('arquivos internos não são publicados pelo servidor web', async () => {
    for (const caminho of ['/server.js', '/.env', '/database/database.sql', '/src/config.js', '/esp32/solenoid_arduino/secrets.h']) {
        const r = await chamar('GET', caminho);
        assert.equal(r.status, 404, caminho);
    }
    assert.equal((await chamar('GET', '/')).status, 200);
});

test('primeiro acesso cadastra o crachá e depois exige o mesmo código', async () => {
    const ana = await professorId('Prof. Ana Souza');
    const r1 = await chamar('POST', '/api/reservas', { sala: '115', professorId: ana, data: '2026-10-19', inicio: '13:00', fim: '14:40', credencial: cracha('ANA-1') });
    assert.equal(r1.status, 201, r1.texto);
    assert.equal(r1.json.primeiroAcesso, true);

    const r2 = await chamar('POST', '/api/reservas', { sala: '115', professorId: ana, data: '2026-10-20', inicio: '13:00', fim: '14:40', credencial: cracha('OUTRO') });
    assert.equal(r2.status, 401);

    const r3 = await chamar('POST', '/api/reservas', { sala: '115', professorId: ana, data: '2026-10-20', inicio: '13:00', fim: '14:40', credencial: cracha('ana-1') });
    assert.equal(r3.status, 201, 'código não diferencia maiúsculas/minúsculas');
    assert.equal(r3.json.primeiroAcesso, false);

    const r4 = await chamar('POST', '/api/reservas', { sala: '115', professorId: ana, data: '2026-10-21', inicio: '13:00', fim: '14:40', credencial: { metodo: 'digital', codigo: 'FP-1' } });
    assert.equal(r4.status, 401, 'depois do primeiro acesso, novo método só pelo admin');
});

test('não deixa usar o crachá de outro professor', async () => {
    const carlos = await professorId('Prof. Carlos Lima');
    const r = await chamar('POST', '/api/reservas', { sala: '130', professorId: carlos, data: '2026-10-19', inicio: '13:00', fim: '14:00', credencial: cracha('ANA-1') });
    assert.equal(r.status, 409);
    const [prof] = await db.query('SELECT cracha_hash FROM professores WHERE id = ?', [carlos]);
    assert.equal(prof.cracha_hash, null, 'nada é gravado quando a operação falha');
});

test('conflitos de horário: mesma sala, mesmo professor e grade fixa', async () => {
    const carlos = await professorId('Prof. Carlos Lima');
    const beatriz = await professorId('Prof. Beatriz Nunes');
    const ana = await professorId('Prof. Ana Souza');

    const ok = await chamar('POST', '/api/reservas', { sala: '130', professorId: carlos, data: '2026-10-19', inicio: '13:00', fim: '14:40', credencial: cracha('CARLOS-1') });
    assert.equal(ok.status, 201, ok.texto);

    const sala = await chamar('POST', '/api/reservas', { sala: '130', professorId: beatriz, data: '2026-10-19', inicio: '14:00', fim: '15:00', credencial: cracha('BEA-1') });
    assert.equal(sala.status, 409);
    assert.match(sala.json.erro, /Horário indisponível/);

    const prof = await chamar('POST', '/api/reservas', { sala: '304', professorId: carlos, data: '2026-10-19', inicio: '13:30', fim: '14:00', credencial: cracha('CARLOS-1') });
    assert.equal(prof.status, 409, 'professor não pode reservar duas salas ao mesmo tempo');

    // 133 tem aula fixa da Ana na segunda 07:00–08:40 (faixa 0)
    const grade = await chamar('POST', '/api/reservas', { sala: '133', professorId: carlos, data: '2026-10-26', inicio: '07:30', fim: '08:00', credencial: cracha('CARLOS-1') });
    assert.equal(grade.status, 409);
    assert.match(grade.json.erro, /aula fixa/);

    const dona = await chamar('POST', '/api/reservas', { sala: '133', professorId: ana, data: '2026-10-26', inicio: '07:30', fim: '08:00', credencial: cracha('ANA-1') });
    assert.equal(dona.status, 201, 'a professora da aula pode usar o próprio horário');
});

test('validação de datas e horários', async () => {
    const carlos = await professorId('Prof. Carlos Lima');
    const casos = [
        [{ data: '2026-10-18', inicio: '13:00', fim: '14:00' }, /já passou/],
        [{ data: '2026-10-19', inicio: '08:00', fim: '09:00' }, /já passou/],
        [{ data: '2026-10-20', inicio: '14:00', fim: '13:00' }, /depois do horário de início/],
        [{ data: '2026-10-20', inicio: '14:00', fim: '14:03' }, /mínimo/],
        [{ data: '31/02/2026', inicio: '14:00', fim: '15:00' }, /Data inválida/],
        [{ data: '2026-10-20', inicio: '25:00', fim: '26:00' }, /Horário inválido/]
    ];
    for (const [dados, msg] of casos) {
        const r = await chamar('POST', '/api/reservas', { sala: '304', professorId: carlos, credencial: cracha('CARLOS-1'), ...dados });
        assert.equal(r.status, 400, JSON.stringify(dados));
        assert.match(r.json.erro, msg);
    }
});

test('ocupar, liberar a chave com ticket e desocupar', async () => {
    const ana = await professorId('Prof. Ana Souza');
    const nova = await chamar('POST', '/api/reservas', { sala: '132', professorId: ana, data: '2026-10-19', inicio: '10:00', fim: '10:20', credencial: cracha('ANA-1') });
    assert.equal(nova.status, 201, nova.texto);
    const id = nova.json.reserva.id;

    const cedo = (await chamar('GET', '/api/estado')).json.reservas.find(r => r.sala === '115' && r.data === '2026-10-19');
    const muitoCedo = await chamar('POST', `/api/reservas/${cedo.id}/ocupar`, { credencial: cracha('ANA-1') });
    assert.equal(muitoCedo.status, 400, 'reserva das 13:00 não pode ser ocupada às 10:00');
    assert.match(muitoCedo.json.erro, /a partir das 12:30/);

    const errado = await chamar('POST', `/api/reservas/${id}/ocupar`, { credencial: cracha('X') });
    assert.equal(errado.status, 401);

    const ocupada = await chamar('POST', `/api/reservas/${id}/ocupar`, { credencial: cracha('ANA-1') });
    assert.equal(ocupada.status, 200, ocupada.texto);
    assert.equal(ocupada.json.reserva.status, 'em_uso');
    assert.equal(ocupada.json.solenoide.modo, 'simulacao');
    assert.ok(ocupada.json.ticket);

    const estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '132').status, 'ocupada');

    assert.equal((await chamar('POST', '/api/solenoide/destravar', {})).status, 403, 'sem ticket não destrava');
    const destravar = await chamar('POST', '/api/solenoide/destravar', { ticket: ocupada.json.ticket });
    assert.equal(destravar.status, 200);

    const outro = await chamar('POST', `/api/reservas/${id}/desocupar`, { credencial: cracha('CARLOS-1') });
    assert.equal(outro.status, 401, 'só quem ocupou pode desocupar');

    const desocupar = await chamar('POST', `/api/reservas/${id}/desocupar`, { credencial: cracha('ANA-1') });
    assert.equal(desocupar.status, 200);
    assert.equal(desocupar.json.status, 'concluida');
    assert.equal(desocupar.json.responsavel, 'Prof. Ana Souza');
});

test('mudar de sala exige identidade e respeita conflitos', async () => {
    const ana = await professorId('Prof. Ana Souza');
    const r = await chamar('POST', '/api/reservas', { sala: '306', professorId: ana, data: '2026-10-22', inicio: '19:00', fim: '20:00', credencial: cracha('ANA-1') });
    assert.equal(r.status, 201, r.texto);
    const id = r.json.reserva.id;
    assert.equal((await chamar('POST', `/api/reservas/${id}/mudar-sala`, { novaSala: '305', credencial: cracha('X') })).status, 401);
    // 304 tem aula fixa da Sandra na quinta 19:00 (faixa 6)
    assert.equal((await chamar('POST', `/api/reservas/${id}/mudar-sala`, { novaSala: '304', credencial: cracha('ANA-1') })).status, 409);
    const ok = await chamar('POST', `/api/reservas/${id}/mudar-sala`, { novaSala: '305', credencial: cracha('ANA-1') });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.sala, '305');
});

test('rotas de administrador exigem login', async () => {
    assert.equal((await chamar('POST', '/api/eventos', {})).status, 400, 'sem admin, evento exige professor e identidade');
    assert.equal((await chamar('POST', '/api/grade', {})).status, 403);
    assert.equal((await chamar('POST', '/api/reservas/1/remover')).status, 403);
    assert.equal((await chamar('POST', '/api/reservas/1/ocupacao-forcada')).status, 403);
    assert.equal((await chamar('POST', '/api/admin/login', { usuario: 'admin', senha: 'admin123' })).status, 401);

    const login = await chamar('POST', '/api/admin/login', { usuario: 'admin', senha: 'senha-de-teste' });
    assert.equal(login.status, 200);
    tokenAdmin = login.json.token;
    const [linha] = await db.query("SELECT senha_hash FROM admins WHERE usuario = 'admin'");
    assert.match(linha.senha_hash, /^scrypt\$/, 'senha guardada como hash');
    assert.equal((await chamar('GET', '/api/admin/sessao', undefined, { token: tokenAdmin })).json.admin, true);
});

test('admin: eventos, códigos visíveis, cancelamento e ocupação/desocupação forçadas', async () => {
    const ev = await chamar('POST', '/api/eventos', { sala: '131', descricao: 'Palestra', responsavel: 'Convidado Externo', data: '2026-10-19', inicio: '15:00', fim: '16:00' }, { token: tokenAdmin });
    assert.equal(ev.status, 201, ev.texto);
    assert.equal(ev.json.tipo, 'evento');
    assert.match(ev.json.codigo, /^RES-\d{5}$/);

    let estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '131').status, 'evento', 'evento continua evento (antes virava reserva)');

    const conflito = await chamar('POST', '/api/eventos', { sala: '130', descricao: 'X', responsavel: 'Y', data: '2026-10-19', inicio: '13:30', fim: '14:00' }, { token: tokenAdmin });
    assert.equal(conflito.status, 409);

    const historicoAdmin = (await chamar('GET', '/api/reservas', undefined, { token: tokenAdmin })).json;
    assert.ok(historicoAdmin.every(r => /^RES-/.test(r.codigo)));
    const historicoPublico = (await chamar('GET', '/api/reservas')).json;
    assert.ok(historicoPublico.every(r => r.codigo === null));

    const cancelar = await chamar('POST', `/api/reservas/${ev.json.id}/remover`, undefined, { token: tokenAdmin });
    assert.equal(cancelar.json.status, 'cancelada');

    const s129 = estado.reservas.find(r => r.sala === '129');
    const forcada = await chamar('POST', `/api/reservas/${s129.id}/ocupacao-forcada`, { professorId: await professorId('Prof. Diego Alves') }, { token: tokenAdmin });
    assert.equal(forcada.status, 200, forcada.texto);
    assert.equal(forcada.json.reserva.ocupacaoForcada, true);
    assert.equal(forcada.json.reserva.responsavel, 'Prof. Diego Alves');

    const liberacao = await chamar('POST', `/api/reservas/${s129.id}/remover`, undefined, { token: tokenAdmin });
    assert.equal(liberacao.json.status, 'concluida');
    assert.equal(liberacao.json.liberacaoForcada, true, 'desocupação forçada fica registrada');
    estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '129').status, 'livre');
});

test('professor cria evento validando a própria identidade (sem administrador)', async () => {
    const ana = await professorId('Prof. Ana Souza');
    const dados = { sala: '115', professorId: ana, descricao: 'Reunião de pais', data: '2026-10-23', inicio: '16:00', fim: '17:00' };

    const semCredencial = await chamar('POST', '/api/eventos', dados);
    assert.equal(semCredencial.status, 400, semCredencial.texto);
    const semProfessor = await chamar('POST', '/api/eventos', { ...dados, professorId: null, responsavel: 'Alguém', credencial: cracha('ANA-1') });
    assert.equal(semProfessor.status, 400, 'professor não pode criar evento em nome livre');
    const errada = await chamar('POST', '/api/eventos', { ...dados, credencial: cracha('NAO-E-DA-ANA') });
    assert.equal(errada.status, 401);

    const ok = await chamar('POST', '/api/eventos', { ...dados, responsavel: 'Outro Nome', credencial: cracha('ANA-1') });
    assert.equal(ok.status, 201, ok.texto);
    assert.equal(ok.json.tipo, 'evento');
    assert.equal(ok.json.evento, 'Reunião de pais');
    assert.equal(ok.json.responsavel, 'Prof. Ana Souza', 'responsável é sempre o professor identificado');
    assert.equal(ok.json.codigo, null, 'código RES- continua só para o admin');

    const conflito = await chamar('POST', '/api/eventos', { ...dados, inicio: '16:30', fim: '17:30', credencial: cracha('ANA-1') });
    assert.equal(conflito.status, 409, 'evento respeita os horários já ocupados');

    const estado = (await chamar('GET', '/api/estado')).json;
    assert.ok(estado.reservas.some(r => r.id === ok.json.id && r.tipo === 'evento'));
    const [log] = await db.query("SELECT origem, detalhe FROM logs_acesso WHERE reserva_id = ? AND acao = 'criar_evento'", [ok.json.id]);
    assert.equal(log.origem, 'web');
    assert.match(log.detalhe, /via cracha/);
});

test('salas sem sigla: bancos antigos com S/L são ajustados ao ligar o servidor', async () => {
    const { removerSiglasDasSalas } = require('../src/servicos/migracoes');
    assert.equal(await removerSiglasDasSalas(), 0, 'banco novo já vem sem sigla');
    const estado = (await chamar('GET', '/api/estado')).json;
    assert.ok(estado.salas.every(s => /^\d+$/.test(s.codigo) && !/^[SL]\d/.test(s.nome)), 'nenhuma sala com sigla');

    await db.query("INSERT INTO salas (codigo, nome, andar) VALUES ('S901', 'S901 SALA TESTE', 1), ('L902', 'L902 LAB TESTE', 2), ('L129', 'L129 REPETIDA', 1)");
    const sala = (await db.query("SELECT id FROM salas WHERE codigo = 'S901'"))[0].id;
    await db.query(`INSERT INTO reservas (sala_id, professor_id, responsavel, data, hora_inicio, hora_fim, status) VALUES (?, NULL, 'Teste', '2026-10-25', '10:00:00', '11:00:00', 'agendada')`, [sala]);

    assert.equal(await removerSiglasDasSalas(), 2);
    const [s901] = await db.query("SELECT id, nome FROM salas WHERE codigo = '901'");
    assert.equal(s901.id, sala, 'mesma sala, só mudou o código');
    assert.equal(s901.nome, '901 SALA TESTE');
    assert.equal((await db.query("SELECT nome FROM salas WHERE codigo = '902'"))[0].nome, '902 LAB TESTE');
    assert.equal((await db.query("SELECT COUNT(*) AS n FROM salas WHERE codigo = 'L129'"))[0].n, 1, 'não duplica código já existente');
    const [r] = await db.query('SELECT s.codigo FROM reservas r JOIN salas s ON s.id = r.sala_id WHERE r.sala_id = ?', [sala]);
    assert.equal(r.codigo, '901', 'reserva continua ligada à sala');
    assert.equal(await removerSiglasDasSalas(), 0, 'rodar de novo não muda nada');

    await db.query('DELETE FROM reservas WHERE sala_id = ?', [sala]);
    await db.query("DELETE FROM salas WHERE codigo IN ('901', '902', 'L129')");
});

test('admin: grade é salva no banco e respeita conflitos', async () => {
    const ana = await professorId('Prof. Ana Souza');
    const carlos = await professorId('Prof. Carlos Lima');
    const nova = await chamar('POST', '/api/grade', { professorId: ana, dia: 4, faixa: 7, sala: '115', turma: 'T1' }, { token: tokenAdmin });
    assert.equal(nova.status, 201, nova.texto);
    const conflitoSala = await chamar('POST', '/api/grade', { professorId: carlos, dia: 4, faixa: 7, sala: '115', turma: 'T2' }, { token: tokenAdmin });
    assert.equal(conflitoSala.status, 409);
    const conflitoProf = await chamar('POST', '/api/grade', { professorId: ana, dia: 4, faixa: 7, sala: '130', turma: 'T2' }, { token: tokenAdmin });
    assert.equal(conflitoProf.status, 409);
    const mover = await chamar('PUT', `/api/grade/${nova.json.id}`, { dia: 3, faixa: 7 }, { token: tokenAdmin });
    assert.equal(mover.status, 200);
    assert.equal(mover.json.dia, 3);
    assert.equal((await chamar('DELETE', `/api/grade/${nova.json.id}`, undefined, { token: tokenAdmin })).status, 200);
    assert.equal((await chamar('GET', '/api/grade')).json.length, 46);
});

test('reconhecimento facial: cadastro pelo admin e comparação no servidor', async () => {
    const rafael = await professorId('Prof. Rafael Costa');
    const rosto = Array.from({ length: 128 }, (_, i) => Math.sin(i) / 4);
    const parecido = rosto.map(v => v + 0.01);
    const diferente = rosto.map((v, i) => (i % 2 ? v + 0.3 : v - 0.3));

    assert.equal((await chamar('PUT', `/api/professores/${rafael}/credenciais`, { metodo: 'facial', descritor: rosto }, { token: tokenAdmin })).status, 200);
    const outroProf = await professorId('Prof. Diego Alves');
    assert.equal((await chamar('PUT', `/api/professores/${outroProf}/credenciais`, { metodo: 'facial', descritor: parecido }, { token: tokenAdmin })).status, 409, 'mesmo rosto em dois professores');

    const negado = await chamar('POST', '/api/reservas', { sala: '306', professorId: rafael, data: '2026-10-20', inicio: '19:00', fim: '20:00', credencial: { metodo: 'facial', descritor: diferente } });
    assert.equal(negado.status, 401);
    const aceito = await chamar('POST', '/api/reservas', { sala: '306', professorId: rafael, data: '2026-10-20', inicio: '19:00', fim: '20:00', credencial: { metodo: 'facial', descritor: parecido } });
    assert.equal(aceito.status, 201, aceito.texto);

    const invalido = await chamar('POST', '/api/reservas', { sala: '306', professorId: rafael, data: '2026-10-21', inicio: '19:00', fim: '20:00', credencial: { metodo: 'facial', descritor: [1, 2, 3] } });
    assert.equal(invalido.status, 400);

    const lista = (await chamar('GET', '/api/professores', undefined, { token: tokenAdmin })).json;
    assert.equal(lista.find(p => p.id === rafael).temRosto, true);
    assert.equal((await chamar('GET', '/api/professores')).json[0].temRosto, undefined, 'público não vê credenciais');
});

test('leitor de digital na porta exige token do dispositivo', async () => {
    const beatriz = await professorId('Prof. Beatriz Nunes');
    await chamar('PUT', `/api/professores/${beatriz}/credenciais`, { metodo: 'digital', codigo: '7' }, { token: tokenAdmin });
    const r = await chamar('POST', '/api/reservas', { sala: '323', professorId: beatriz, data: '2026-10-19', inicio: '10:00', fim: '11:00', credencial: { metodo: 'digital', codigo: '7' } });
    assert.equal(r.status, 201, r.texto);

    assert.equal((await chamar('POST', '/api/porta/digital', { sala: '323', digital: '7' })).status, 403);
    assert.equal((await chamar('POST', '/api/porta/digital', { sala: '323', digital: '7' }, { headers: { 'X-Dispositivo-Token': 'errado' } })).status, 403);
    assert.equal((await chamar('POST', '/api/porta/digital', { sala: '323', digital: '99' }, { headers: { 'X-Dispositivo-Token': 'token-do-leitor' } })).status, 401);
    const ok = await chamar('POST', '/api/porta/digital', { sala: '323', digital: '7' }, { headers: { 'X-Dispositivo-Token': 'token-do-leitor' } });
    assert.equal(ok.status, 200, ok.texto);
    assert.equal(ok.json.reserva.status, 'em_uso');
});

test('manutenção automática: reservas vencidas expiram e ocupações terminam', async () => {
    const sala = (await db.query("SELECT id FROM salas WHERE codigo = '324'"))[0].id;
    const prof = await professorId('Prof. Sandra Rocha');
    await db.query(`INSERT INTO reservas (sala_id, professor_id, responsavel, data, hora_inicio, hora_fim, status) VALUES (?, ?, 'Prof. Sandra Rocha', '2026-10-19', '08:00:00', '09:00:00', 'agendada')`, [sala, prof]);
    await db.query(`INSERT INTO reservas (sala_id, professor_id, responsavel, data, hora_inicio, hora_fim, status) VALUES (?, ?, 'Prof. Sandra Rocha', '2026-10-18', '19:00:00', '20:00:00', 'em_uso')`, [sala, prof]);
    const estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '324').status, 'livre');
    const status = (await db.query('SELECT status FROM reservas WHERE sala_id = ? ORDER BY id', [sala])).map(r => r.status);
    assert.deepEqual(status, ['expirada', 'concluida']);
});

test('devolver a chave em modo simulação', async () => {
    assert.equal((await chamar('POST', '/api/chave/devolver', {})).status, 400);
    assert.equal((await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-9' })).status, 400, 'só existem as solenoides 1, 2 e 3');
    const s2 = await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-2' });
    assert.equal(s2.status, 200, s2.texto);
    assert.equal(s2.json.solenoide, 2);
    const r = await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-1' });
    assert.equal(r.status, 200, r.texto);
    assert.equal(r.json.ok, true);
    assert.equal(r.json.modo, 'simulacao');
    assert.equal(r.json.solenoide, 1);
});

test('devolver a chave de sala ocupada: volta para reservada, pode ocupar de novo ou desocupar', async () => {
    const diego = await professorId('Prof. Diego Alves');
    const reserva = await chamar('POST', '/api/reservas', { sala: '304', professorId: diego, data: '2026-10-19', inicio: '10:00', fim: '11:00', credencial: cracha('DIEGO-1') });
    assert.equal(reserva.status, 201, reserva.texto);
    const id = reserva.json.reserva.id;

    // Ainda não está ocupada: não há chave dela para devolver
    assert.equal((await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-1', reservaId: id })).status, 409);

    assert.equal((await chamar('POST', `/api/reservas/${id}/ocupar`, { credencial: cracha('DIEGO-1') })).status, 200);
    // A sala 304 fica na fileira do meio do 1º andar → solenoide 2
    const outroQr = await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-1', reservaId: id });
    assert.equal(outroQr.status, 409, 'QR code de outra solenoide é recusado');
    const dev = await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-2', reservaId: id });
    assert.equal(dev.status, 200, dev.texto);
    assert.ok(dev.json.ticket, 'devolve um ticket para confirmar');
    assert.equal(dev.json.reserva.id, id);

    assert.equal((await chamar('POST', '/api/chave/devolvida', { ticket: 'inventado' })).status, 403);
    const ok = await chamar('POST', '/api/chave/devolvida', { ticket: dev.json.ticket });
    assert.equal(ok.status, 200, ok.texto);
    assert.equal(ok.json.status, 'agendada');
    assert.ok(ok.json.ocupadaEm, 'continua marcada como já ocupada');
    assert.equal((await chamar('POST', '/api/chave/devolvida', { ticket: dev.json.ticket })).status, 403, 'ticket vale uma vez só');

    let estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '304').status, 'reservada', 'sala volta para reservada');

    // Pode ocupar de novo
    assert.equal((await chamar('POST', `/api/reservas/${id}/ocupar`, { credencial: cracha('DIEGO-1') })).status, 200);
    estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '304').status, 'ocupada');

    // Devolve de novo e desocupa direto da reserva (sem estar "em uso")
    const dev2 = await chamar('POST', '/api/chave/devolver', { qrcode: 'INNOVAROOM-SOLENOIDE-2', reservaId: id });
    assert.equal((await chamar('POST', '/api/chave/devolvida', { ticket: dev2.json.ticket })).json.status, 'agendada');
    assert.equal((await chamar('POST', `/api/reservas/${id}/desocupar`, { credencial: cracha('ERRADO') })).status, 401);
    const fim = await chamar('POST', `/api/reservas/${id}/desocupar`, { credencial: cracha('DIEGO-1') });
    assert.equal(fim.status, 200, fim.texto);
    assert.equal(fim.json.status, 'concluida');
    estado = (await chamar('GET', '/api/estado')).json;
    assert.equal(estado.salas.find(s => s.codigo === '304').status, 'livre');

    // Reserva nunca ocupada não pode ser "desocupada"
    const outra = await chamar('POST', '/api/reservas', { sala: '304', professorId: diego, data: '2026-10-19', inicio: '11:30', fim: '12:00', credencial: cracha('DIEGO-1') });
    assert.equal((await chamar('POST', `/api/reservas/${outra.json.reserva.id}/desocupar`, { credencial: cracha('DIEGO-1') })).status, 409);
});

test('reserva com chave devolvida que passa do horário vira concluída (não "não utilizada")', async () => {
    const sala = (await db.query("SELECT id FROM salas WHERE codigo = '306'"))[0].id;
    const r = await db.query(`INSERT INTO reservas (sala_id, professor_id, responsavel, data, hora_inicio, hora_fim, status, ocupada_em) VALUES (?, NULL, 'Teste', '2026-10-19', '07:00:00', '08:00:00', 'agendada', '2026-10-19 07:05:00')`, [sala]);
    await chamar('GET', '/api/estado');
    const [linha] = await db.query('SELECT status FROM reservas WHERE id = ?', [r.insertId]);
    assert.equal(linha.status, 'concluida');
});

test('solenoide das salas: banco antigo ganha a coluna e o 1º andar é dividido em 3 fileiras', async () => {
    const { garantirSolenoideDasSalas } = require('../src/servicos/migracoes');
    const salasAndar1 = await db.query("SELECT codigo, solenoide FROM salas WHERE andar = 1");
    const por = n => salasAndar1.filter(s => Number(s.solenoide) === n).map(s => s.codigo).sort((a, b) => a - b);
    assert.deepEqual(por(1), ['115', '129', '130', '131', '132', '133', '135'], 'fileira de cima');
    assert.deepEqual(por(2), ['137', '304', '305', '306', '307', '310', '318'], 'fileira do meio');
    assert.deepEqual(por(3), ['323', '324', '329', '332', '333'], 'fileira de baixo');
    assert.equal(await garantirSolenoideDasSalas(), 0, 'já definido: não mexe');

    // Simula um banco de antes desta versão (sem nenhuma solenoide definida)
    const antes = await db.query('SELECT id, solenoide FROM salas');
    await db.query('UPDATE salas SET solenoide = NULL');
    assert.equal(await garantirSolenoideDasSalas(), 19);
    const depois = await db.query('SELECT id, solenoide FROM salas');
    assert.deepEqual(depois.map(s => s.solenoide === null ? null : Number(s.solenoide)), antes.map(s => s.solenoide === null ? null : Number(s.solenoide)), 'mesma divisão do banco novo');
});

test('erros comuns respondem JSON amigável', async () => {
    assert.equal((await chamar('GET', '/api/nao-existe')).status, 404);
    const json = await fetch(base + '/api/reservas', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{quebrado' });
    assert.equal(json.status, 400);
    assert.equal((await chamar('POST', '/api/reservas', { sala: 'XYZ999', professorId: 1, data: '2026-10-20', inicio: '10:00', fim: '11:00', credencial: cracha('A') })).status, 404);
    assert.equal((await chamar('POST', '/api/reservas/abc/ocupar', { credencial: cracha('A') })).status, 400);
});
