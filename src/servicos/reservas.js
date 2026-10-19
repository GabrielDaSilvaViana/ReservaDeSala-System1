/**
 * Regras de negócio de salas, reservas e eventos.
 *
 * A situação de cada sala NÃO é guardada na tabela de salas: ela é calculada a
 * partir das reservas, de acordo com a data e a hora atuais:
 *   - 'ocupada'   → existe reserva em_uso (professor pegou a chave)
 *   - 'evento'    → existe evento hoje que ainda não terminou
 *   - 'reservada' → existe reserva hoje que ainda não terminou
 *   - 'livre'     → nada acima
 * Assim uma sala pode ter várias reservas em dias/horários diferentes.
 */
const db = require('../db');
const config = require('../config');
const tempo = require('./tempo');
const credenciais = require('./credenciais');
const solenoide = require('./solenoide');
const { erro } = require('./erros');

const SELECT_RESERVA = `
    SELECT r.id, r.sala_id, s.codigo AS sala_codigo, s.nome AS sala_nome, s.andar,
           r.professor_id, r.responsavel, r.tipo, r.descricao_evento, r.data,
           r.hora_inicio, r.hora_fim, r.status, r.ocupacao_forcada, r.liberacao_forcada,
           r.metodo_autenticacao, r.ocupada_em, r.finalizada_em, r.created_at
      FROM reservas r
      JOIN salas s ON s.id = r.sala_id`;

const codigoReserva = id => `RES-${String(id).padStart(5, '0')}`;
const hhmm = hora => String(hora || '').slice(0, 5);

/** Converte uma linha do banco no formato enviado ao navegador. */
function formatarReserva(r, { admin = false } = {}) {
    return {
        id: r.id,
        codigo: admin ? codigoReserva(r.id) : null,
        sala: r.sala_codigo,
        salaNome: r.sala_nome,
        andar: Number(r.andar),
        professorId: r.professor_id,
        responsavel: r.responsavel,
        tipo: r.tipo,
        evento: r.descricao_evento,
        data: String(r.data).slice(0, 10),
        inicio: hhmm(r.hora_inicio),
        fim: hhmm(r.hora_fim),
        status: r.status,
        ocupacaoForcada: Boolean(Number(r.ocupacao_forcada)),
        liberacaoForcada: Boolean(Number(r.liberacao_forcada)),
        metodo: admin ? r.metodo_autenticacao : null,
        ocupadaEm: r.ocupada_em,
        finalizadaEm: r.finalizada_em
    };
}

async function registrarLog(q, { professorId = null, salaId = null, reservaId = null, acao, origem = 'web', sucesso = true, detalhe = null }) {
    try {
        await q.query(
            'INSERT INTO logs_acesso (professor_id, sala_id, reserva_id, acao, origem, sucesso, detalhe) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [professorId, salaId, reservaId, acao, origem, sucesso ? 1 : 0, detalhe ? String(detalhe).slice(0, 255) : null]
        );
    } catch (e) {
        console.error('[log] Falha ao registrar log de acesso:', e.message);
    }
}

/** Executa `fn` em transação e registra no log as tentativas de credencial recusadas. */
async function comLogDeFalha(info, fn) {
    try {
        return await db.transacao(fn);
    } catch (e) {
        if (e.status === 401 || e.status === 429) {
            await registrarLog(db, { ...info, sucesso: false, detalhe: e.message });
        }
        throw e;
    }
}

// -----------------------------------------------------------------------------
// Manutenção automática (roda a cada 30 s e antes de cada consulta de estado)
// -----------------------------------------------------------------------------
async function manutencao() {
    const { data, hora, dataHora } = tempo.agora();
    const terminou = '(data < ? OR (data = ? AND hora_fim <= ?))';
    // Ocupação que passou do horário → concluída (sala volta a ficar livre)
    await db.query(`UPDATE reservas SET status = 'concluida', finalizada_em = ? WHERE status = 'em_uso' AND ${terminou}`, [dataHora, data, data, hora]);
    // Evento que passou → concluído
    await db.query(`UPDATE reservas SET status = 'concluida', finalizada_em = ? WHERE status = 'agendada' AND tipo = 'evento' AND ${terminou}`, [dataHora, data, data, hora]);
    // Reserva que foi ocupada, teve a chave devolvida e passou do horário → concluída
    await db.query(`UPDATE reservas SET status = 'concluida', finalizada_em = ? WHERE status = 'agendada' AND tipo = 'reserva' AND ocupada_em IS NOT NULL AND ${terminou}`, [dataHora, data, data, hora]);
    // Reserva que passou sem ninguém ocupar → expirada
    await db.query(`UPDATE reservas SET status = 'expirada', finalizada_em = ? WHERE status = 'agendada' AND tipo = 'reserva' AND ${terminou}`, [dataHora, data, data, hora]);
}

// -----------------------------------------------------------------------------
// Consultas
// -----------------------------------------------------------------------------
const numeroDaSala = codigo => Number(String(codigo).replace(/\D/g, '')) || 0;

async function listarSalas() {
    const salas = await db.query('SELECT id, codigo, nome, andar FROM salas');
    return salas.sort((a, b) => a.andar - b.andar || numeroDaSala(a.codigo) - numeroDaSala(b.codigo) || a.codigo.localeCompare(b.codigo));
}

/** Reservas que ainda vão acontecer ou estão acontecendo (de hoje em diante). */
async function listarAtivas({ admin = false } = {}) {
    const { data } = tempo.agora();
    const linhas = await db.query(
        `${SELECT_RESERVA} WHERE r.status IN ('agendada', 'em_uso') AND r.data >= ? ORDER BY r.data, r.hora_inicio`,
        [data]
    );
    return linhas.map(r => formatarReserva(r, { admin }));
}

async function listarHistorico({ admin = false, limite = 5000 } = {}) {
    const linhas = await db.query(
        `${SELECT_RESERVA} ORDER BY r.data DESC, r.hora_inicio DESC, r.id DESC LIMIT ?`,
        [Number(limite)]
    );
    return linhas.map(r => formatarReserva(r, { admin }));
}

/** Calcula a situação atual de cada sala a partir das reservas ativas. */
function calcularSituacao(salas, ativas) {
    const { data, hora } = tempo.agora();
    const agoraHHMM = hora.slice(0, 5);
    return salas.map(sala => {
        const daSala = ativas.filter(r => r.sala === sala.codigo);
        const emUso = daSala.find(r => r.status === 'em_uso');
        const hoje = daSala.filter(r => r.status === 'agendada' && r.data === data && r.fim > agoraHHMM);
        const atual = emUso || hoje[0] || null;
        let status = 'livre';
        if (emUso) status = 'ocupada';
        else if (atual) status = atual.tipo === 'evento' ? 'evento' : 'reservada';
        return {
            id: sala.id,
            codigo: sala.codigo,
            nome: sala.nome,
            andar: Number(sala.andar),
            status,
            reservaAtualId: atual ? atual.id : null
        };
    });
}

// -----------------------------------------------------------------------------
// Validações
// -----------------------------------------------------------------------------
async function buscarSala(q, codigo, { bloquear = false } = {}) {
    const texto = String(codigo || '').trim().toUpperCase();
    if (!/^[A-Z0-9]{2,10}$/.test(texto)) throw erro.requisicao('Código de sala inválido.');
    const [sala] = await q.query(`SELECT id, codigo, nome FROM salas WHERE codigo = ?${bloquear ? ' FOR UPDATE' : ''}`, [texto]);
    if (!sala) throw erro.naoEncontrado(`Sala ${texto} não encontrada.`);
    return sala;
}

async function buscarProfessor(q, professorId) {
    const id = Number(professorId);
    if (!Number.isInteger(id) || id <= 0) throw erro.requisicao('Selecione o professor.');
    const [prof] = await q.query('SELECT id, nome FROM professores WHERE id = ? AND ativo = 1', [id]);
    if (!prof) throw erro.naoEncontrado('Professor não encontrado.');
    return prof;
}

async function buscarReserva(q, id, { bloquear = false } = {}) {
    const n = Number(id);
    if (!Number.isInteger(n) || n <= 0) throw erro.requisicao('Reserva inválida.');
    const [r] = await q.query(`${SELECT_RESERVA} WHERE r.id = ?${bloquear ? ' FOR UPDATE' : ''}`, [n]);
    if (!r) throw erro.naoEncontrado('Reserva não encontrada.');
    return r;
}

/** Valida data e horários e devolve os valores normalizados. */
function validarIntervalo({ data, inicio, fim }) {
    const d = tempo.normalizarData(data);
    const hi = tempo.normalizarHora(inicio);
    const hf = tempo.normalizarHora(fim);
    if (!d) throw erro.requisicao('Data inválida.');
    if (!hi || !hf) throw erro.requisicao('Horário inválido.');
    const duracao = tempo.minutosDoDia(hf) - tempo.minutosDoDia(hi);
    if (duracao <= 0) throw erro.requisicao('O horário de término deve ser depois do horário de início.');
    if (duracao < config.regras.reservaMinimaMinutos) {
        throw erro.requisicao(`A reserva deve ter no mínimo ${config.regras.reservaMinimaMinutos} minutos.`);
    }
    const agora = tempo.agora();
    if (d < agora.data) throw erro.requisicao('Não é possível reservar em uma data que já passou.');
    if (d === agora.data && hf <= agora.hora) throw erro.requisicao('Esse horário já passou.');
    if (d > tempo.somarDias(agora.data, 366)) throw erro.requisicao('Reservas só podem ser feitas com até 1 ano de antecedência.');
    return { data: d, inicio: hi, fim: hf };
}

/** Lança erro 409 se o horário bater com outra reserva/evento ou com a grade fixa. */
async function verificarConflitos(q, { salaId, data, inicio, fim, professorId = null, ignorarId = null, tipo = 'reserva' }) {
    const ignorar = ignorarId ? ' AND r.id <> ?' : '';
    const paramsIgnorar = ignorarId ? [ignorarId] : [];

    const daSala = await q.query(
        `${SELECT_RESERVA} WHERE r.sala_id = ? AND r.data = ? AND r.status IN ('agendada', 'em_uso')
           AND r.hora_inicio < ? AND r.hora_fim > ?${ignorar} ORDER BY r.hora_inicio LIMIT 1`,
        [salaId, data, fim, inicio, ...paramsIgnorar]
    );
    if (daSala.length) {
        const c = daSala[0];
        const oque = c.tipo === 'evento' ? `o evento "${c.descricao_evento}"` : `reserva de ${c.responsavel}`;
        throw erro.conflito(`Horário indisponível: a sala já tem ${oque} das ${hhmm(c.hora_inicio)} às ${hhmm(c.hora_fim)}.`);
    }

    if (professorId && tipo === 'reserva') {
        const doProfessor = await q.query(
            `${SELECT_RESERVA} WHERE r.professor_id = ? AND r.tipo = 'reserva' AND r.data = ? AND r.status IN ('agendada', 'em_uso')
               AND r.hora_inicio < ? AND r.hora_fim > ?${ignorar} LIMIT 1`,
            [professorId, data, fim, inicio, ...paramsIgnorar]
        );
        if (doProfessor.length) {
            const c = doProfessor[0];
            throw erro.conflito(`${c.responsavel} já tem a sala ${c.sala_codigo} reservada das ${hhmm(c.hora_inicio)} às ${hhmm(c.hora_fim)} nesse dia.`);
        }
    }

    const dia = tempo.diaDaSemana(data);
    const faixas = dia === null ? [] : tempo.faixasNoIntervalo(inicio, fim);
    if (faixas.length) {
        const aulas = await q.query(
            `SELECT g.faixa, g.professor_id, p.nome AS professor, t.nome AS turma
               FROM grade_semanal g
               JOIN professores p ON p.id = g.professor_id
               JOIN turmas t ON t.id = g.turma_id
              WHERE g.sala_id = ? AND g.dia = ? AND g.faixa IN (${faixas.map(() => '?').join(', ')})
              ORDER BY g.faixa`,
            [salaId, dia, ...faixas]
        );
        // O professor dono da aula pode usar o próprio horário da grade
        const outra = aulas.find(a => Number(a.professor_id) !== Number(professorId));
        if (outra) {
            throw erro.conflito(`Horário indisponível: a sala tem aula fixa na grade (${outra.turma} com ${outra.professor}, ${tempo.FAIXAS_HORARIO[outra.faixa].label}).`);
        }
    }
}

// -----------------------------------------------------------------------------
// Operações
// -----------------------------------------------------------------------------

/** Professor reserva uma sala (precisa validar a identidade). */
async function criarReserva({ sala: codigoSala, professorId, data, inicio, fim, credencial }, { admin = false } = {}) {
    const intervalo = validarIntervalo({ data, inicio, fim });
    let info = { acao: 'reservar', professorId: Number(professorId) || null };
    return comLogDeFalha(info, async tx => {
        const sala = await buscarSala(tx, codigoSala, { bloquear: true });
        info.salaId = sala.id;
        const prof = await buscarProfessor(tx, professorId);
        const auth = await credenciais.verificar(tx, prof.id, credencial);
        await verificarConflitos(tx, { salaId: sala.id, ...intervalo, professorId: prof.id });

        const r = await tx.query(
            `INSERT INTO reservas (sala_id, professor_id, responsavel, tipo, data, hora_inicio, hora_fim, status, metodo_autenticacao)
             VALUES (?, ?, ?, 'reserva', ?, ?, ?, 'agendada', ?)`,
            [sala.id, prof.id, prof.nome, intervalo.data, intervalo.inicio, intervalo.fim, auth.metodo]
        );
        await registrarLog(tx, { professorId: prof.id, salaId: sala.id, reservaId: r.insertId, acao: 'reservar', detalhe: `via ${auth.metodo}` });
        const nova = await buscarReserva(tx, r.insertId);
        return { reserva: formatarReserva(nova, { admin }), primeiroAcesso: auth.primeiroAcesso };
    });
}

/**
 * Cria um evento em uma sala.
 *  - Administrador: pode informar qualquer responsável (professor ou nome livre).
 *  - Professor: precisa escolher o próprio nome e validar a identidade
 *    (crachá, digital ou rosto), igual a uma reserva.
 */
async function criarEvento({ sala: codigoSala, descricao, responsavel, professorId, data, inicio, fim, credencial }, { admin = false } = {}) {
    const intervalo = validarIntervalo({ data, inicio, fim });
    const desc = String(descricao || '').trim();
    if (!desc) throw erro.requisicao('Informe a descrição do evento.');
    if (desc.length > 120) throw erro.requisicao('A descrição do evento deve ter no máximo 120 caracteres.');
    if (!admin && !professorId) throw erro.requisicao('Selecione o professor responsável pelo evento.');

    const info = { acao: 'criar_evento', professorId: Number(professorId) || null };
    return comLogDeFalha(info, async tx => {
        const sala = await buscarSala(tx, codigoSala, { bloquear: true });
        info.salaId = sala.id;
        let prof = null;
        let nomeResponsavel = String(responsavel || '').trim();
        if (professorId) {
            prof = await buscarProfessor(tx, professorId);
            nomeResponsavel = prof.nome;
        }
        if (!nomeResponsavel) throw erro.requisicao('Informe o responsável pelo evento.');
        if (nomeResponsavel.length > 100) throw erro.requisicao('O nome do responsável deve ter no máximo 100 caracteres.');

        const auth = admin ? { metodo: 'admin', primeiroAcesso: false } : await credenciais.verificar(tx, prof.id, credencial);

        await verificarConflitos(tx, { salaId: sala.id, ...intervalo, professorId: prof ? prof.id : null, tipo: 'evento' });
        const r = await tx.query(
            `INSERT INTO reservas (sala_id, professor_id, responsavel, tipo, descricao_evento, data, hora_inicio, hora_fim, status, metodo_autenticacao)
             VALUES (?, ?, ?, 'evento', ?, ?, ?, ?, 'agendada', ?)`,
            [sala.id, prof ? prof.id : null, nomeResponsavel, desc, intervalo.data, intervalo.inicio, intervalo.fim, auth.metodo]
        );
        await registrarLog(tx, {
            professorId: prof ? prof.id : null, salaId: sala.id, reservaId: r.insertId, acao: 'criar_evento',
            origem: admin ? 'admin' : 'web', detalhe: admin ? desc : `${desc} (via ${auth.metodo})`
        });
        const evento = formatarReserva(await buscarReserva(tx, r.insertId), { admin });
        return admin ? evento : { ...evento, primeiroAcesso: auth.primeiroAcesso };
    });
}

/** Confere se a reserva pode ser ocupada agora. */
function validarJanelaDeOcupacao(r, { admin = false } = {}) {
    if (r.tipo !== 'reserva') throw erro.requisicao('Eventos não precisam ser ocupados.');
    if (r.status === 'em_uso') throw erro.conflito('Esta sala já está ocupada.');
    if (r.status !== 'agendada') throw erro.conflito('Esta reserva não está mais ativa.');
    const agora = tempo.agora();
    const data = String(r.data).slice(0, 10);
    if (data !== agora.data) throw erro.requisicao(`Esta reserva é para ${data.split('-').reverse().join('/')}. A sala só pode ser ocupada no dia da reserva.`);
    if (agora.hora >= r.hora_fim) throw erro.requisicao('O horário desta reserva já terminou.');
    if (!admin) {
        const liberaEm = tempo.minutosDoDia(r.hora_inicio) - config.regras.ocupacaoAntecedenciaMinutos;
        if (tempo.minutosDoDia(agora.hora) < liberaEm) {
            throw erro.requisicao(`A sala só pode ser ocupada a partir das ${tempo.horaDeMinutos(Math.max(liberaEm, 0)).slice(0, 5)} (${config.regras.ocupacaoAntecedenciaMinutos} min antes do início).`);
        }
    }
}

async function aposOcupar(reserva, { modoSolenoide } = {}) {
    const ticket = solenoide.criarTicket(reserva.id, reserva.salaNome);
    const resultado = await solenoide.destravar({ modo: modoSolenoide });
    return { reserva, ticket, solenoide: resultado };
}

/** Professor ocupa a sala reservada (valida identidade e libera a chave). */
async function ocupar(id, { credencial }, { origem = 'web', admin = false } = {}) {
    let info = { acao: 'ocupar', reservaId: Number(id) || null, origem };
    const reserva = await comLogDeFalha(info, async tx => {
        const r = await buscarReserva(tx, id, { bloquear: true });
        Object.assign(info, { professorId: r.professor_id, salaId: r.sala_id });
        validarJanelaDeOcupacao(r);
        const auth = await credenciais.verificar(tx, r.professor_id, credencial);
        const { dataHora } = tempo.agora();
        await tx.query(
            `UPDATE reservas SET status = 'em_uso', ocupada_em = ?, metodo_autenticacao = ? WHERE id = ?`,
            [dataHora, auth.metodo, r.id]
        );
        await registrarLog(tx, { professorId: r.professor_id, salaId: r.sala_id, reservaId: r.id, acao: 'ocupar', origem, detalhe: `via ${auth.metodo}` });
        return formatarReserva(await buscarReserva(tx, r.id), { admin });
    });
    return aposOcupar(reserva);
}

/** Administrador força a ocupação (ex.: professor esqueceu o crachá ou foi substituído). */
async function ocupacaoForcada(id, { professorId }) {
    const reserva = await db.transacao(async tx => {
        const r = await buscarReserva(tx, id, { bloquear: true });
        validarJanelaDeOcupacao(r, { admin: true });
        let prof = { id: r.professor_id, nome: r.responsavel };
        if (professorId && Number(professorId) !== Number(r.professor_id)) {
            prof = await buscarProfessor(tx, professorId);
        }
        const { dataHora } = tempo.agora();
        await tx.query(
            `UPDATE reservas SET status = 'em_uso', ocupacao_forcada = 1, metodo_autenticacao = 'admin',
                    ocupada_em = ?, professor_id = ?, responsavel = ? WHERE id = ?`,
            [dataHora, prof.id, prof.nome, r.id]
        );
        await registrarLog(tx, { professorId: prof.id, salaId: r.sala_id, reservaId: r.id, acao: 'ocupacao_forcada', origem: 'admin' });
        return formatarReserva(await buscarReserva(tx, r.id), { admin: true });
    });
    return aposOcupar(reserva);
}

/** Professor desocupa a sala (precisa validar a identidade). */
async function liberar(id, { credencial }, { admin = false } = {}) {
    let info = { acao: 'desocupar', reservaId: Number(id) || null };
    return comLogDeFalha(info, async tx => {
        const r = await buscarReserva(tx, id, { bloquear: true });
        Object.assign(info, { professorId: r.professor_id, salaId: r.sala_id });
        // Pode desocupar a sala ocupada ou a reserva que já foi ocupada e teve a chave devolvida
        const devolvida = r.status === 'agendada' && r.tipo === 'reserva' && r.ocupada_em;
        if (r.status !== 'em_uso' && !devolvida) throw erro.conflito('Esta sala não está ocupada.');
        if (!r.professor_id) throw erro.requisicao('Esta ocupação não tem professor vinculado. Peça ao administrador para desocupar.');
        const auth = await credenciais.verificar(tx, r.professor_id, credencial);
        const { dataHora } = tempo.agora();
        await tx.query(`UPDATE reservas SET status = 'concluida', finalizada_em = ? WHERE id = ?`, [dataHora, r.id]);
        await registrarLog(tx, { professorId: r.professor_id, salaId: r.sala_id, reservaId: r.id, acao: 'desocupar', detalhe: `via ${auth.metodo}` });
        return formatarReserva(await buscarReserva(tx, r.id), { admin });
    });
}

/**
 * Administrador remove uma reserva/evento.
 *  - agendada → cancelada
 *  - em_uso   → concluída com "desocupação forçada" (aparece no histórico)
 */
async function removerPeloAdmin(id) {
    return db.transacao(async tx => {
        const r = await buscarReserva(tx, id, { bloquear: true });
        const { dataHora } = tempo.agora();
        if (r.status === 'agendada' && r.ocupada_em) {
            // Já foi usada (chave devolvida): encerra como desocupação forçada, não como cancelada
            await tx.query(`UPDATE reservas SET status = 'concluida', liberacao_forcada = 1, finalizada_em = ? WHERE id = ?`, [dataHora, r.id]);
            await registrarLog(tx, { professorId: r.professor_id, salaId: r.sala_id, reservaId: r.id, acao: 'desocupacao_forcada', origem: 'admin' });
        } else if (r.status === 'agendada') {
            await tx.query(`UPDATE reservas SET status = 'cancelada', finalizada_em = ? WHERE id = ?`, [dataHora, r.id]);
            await registrarLog(tx, { professorId: r.professor_id, salaId: r.sala_id, reservaId: r.id, acao: r.tipo === 'evento' ? 'cancelar_evento' : 'cancelar_reserva', origem: 'admin' });
        } else if (r.status === 'em_uso') {
            await tx.query(`UPDATE reservas SET status = 'concluida', liberacao_forcada = 1, finalizada_em = ? WHERE id = ?`, [dataHora, r.id]);
            await registrarLog(tx, { professorId: r.professor_id, salaId: r.sala_id, reservaId: r.id, acao: 'desocupacao_forcada', origem: 'admin' });
        } else {
            throw erro.conflito('Esta reserva já foi finalizada.');
        }
        return formatarReserva(await buscarReserva(tx, r.id), { admin: true });
    });
}

/** Reserva ocupada (em uso), para conferir antes de devolver a chave. */
async function reservaEmUso(id) {
    const r = await buscarReserva(db, id);
    if (r.status !== 'em_uso') throw erro.conflito('Esta sala não está ocupada, então não há chave dela para devolver.');
    return formatarReserva(r);
}

/**
 * A chave foi devolvida: a sala deixa de estar "ocupada" e volta a ficar
 * "reservada" (a reserva continua valendo até o horário de término).
 * Depois o professor pode ocupar de novo ou desocupar de vez.
 */
async function voltarParaReservada(id) {
    return db.transacao(async tx => {
        const r = await buscarReserva(tx, id, { bloquear: true });
        if (r.status !== 'em_uso') throw erro.conflito('Esta sala não está mais ocupada.');
        await tx.query(`UPDATE reservas SET status = 'agendada' WHERE id = ?`, [r.id]);
        await registrarLog(tx, { professorId: r.professor_id, salaId: r.sala_id, reservaId: r.id, acao: 'devolver_chave', detalhe: 'chave devolvida: sala voltou para reservada' });
        return formatarReserva(await buscarReserva(tx, r.id));
    });
}

/** Professor transfere a reserva para outra sala livre no mesmo horário. */
async function mudarSala(id, { novaSala, credencial }, { admin = false } = {}) {
    let info = { acao: 'mudar_sala', reservaId: Number(id) || null };
    return comLogDeFalha(info, async tx => {
        const r = await buscarReserva(tx, id, { bloquear: true });
        Object.assign(info, { professorId: r.professor_id, salaId: r.sala_id });
        if (r.tipo !== 'reserva') throw erro.requisicao('Somente reservas de professor podem mudar de sala.');
        if (r.status !== 'agendada') throw erro.conflito('Só é possível mudar de sala antes de ocupar.');
        const destino = await buscarSala(tx, novaSala, { bloquear: true });
        if (destino.id === r.sala_id) throw erro.requisicao('Escolha uma sala diferente da atual.');
        const auth = await credenciais.verificar(tx, r.professor_id, credencial);
        const data = String(r.data).slice(0, 10);
        await verificarConflitos(tx, {
            salaId: destino.id, data, inicio: r.hora_inicio, fim: r.hora_fim,
            professorId: r.professor_id, ignorarId: r.id
        });
        await tx.query('UPDATE reservas SET sala_id = ? WHERE id = ?', [destino.id, r.id]);
        await registrarLog(tx, {
            professorId: r.professor_id, salaId: destino.id, reservaId: r.id, acao: 'mudar_sala',
            detalhe: `${r.sala_codigo} → ${destino.codigo} via ${auth.metodo}`
        });
        return formatarReserva(await buscarReserva(tx, r.id), { admin });
    });
}

/**
 * Leitor de digital na porta (ex.: ESP32 + DY50). Se o professor tiver uma
 * reserva para agora naquela sala, a sala é ocupada e a solenoide destravada.
 */
async function autenticarNaPorta({ sala: codigoSala, digital }) {
    const sala = await buscarSala(db, codigoSala);
    const prof = await credenciais.professorPorDigital(db, digital);
    if (!prof) {
        await registrarLog(db, { salaId: sala.id, acao: 'porta_digital', origem: 'dispositivo', sucesso: false, detalhe: 'digital não cadastrada' });
        throw erro.naoAutenticado('Digital não cadastrada.');
    }
    const { data, hora } = tempo.agora();
    const candidatas = await db.query(
        `${SELECT_RESERVA} WHERE r.sala_id = ? AND r.professor_id = ? AND r.tipo = 'reserva' AND r.data = ?
           AND r.status IN ('agendada', 'em_uso') AND r.hora_fim > ? ORDER BY r.hora_inicio`,
        [sala.id, prof.id, data, hora]
    );
    const emUso = candidatas.find(r => r.status === 'em_uso');
    if (emUso) {
        await registrarLog(db, { professorId: prof.id, salaId: sala.id, reservaId: emUso.id, acao: 'porta_digital', origem: 'dispositivo', detalhe: 'reabrir' });
        return { permitido: true, professor: prof.nome, ...(await aposOcupar(formatarReserva(emUso))) };
    }
    const agendada = candidatas[0];
    if (!agendada) {
        await registrarLog(db, { professorId: prof.id, salaId: sala.id, acao: 'porta_digital', origem: 'dispositivo', sucesso: false, detalhe: 'sem reserva agora' });
        throw erro.proibido(`${prof.nome} não tem reserva para a sala ${sala.codigo} agora.`);
    }
    const reserva = await db.transacao(async tx => {
        const r = await buscarReserva(tx, agendada.id, { bloquear: true });
        validarJanelaDeOcupacao(r);
        const agora = tempo.agora();
        await tx.query(`UPDATE reservas SET status = 'em_uso', ocupada_em = ?, metodo_autenticacao = 'digital' WHERE id = ?`, [agora.dataHora, r.id]);
        await registrarLog(tx, { professorId: prof.id, salaId: sala.id, reservaId: r.id, acao: 'ocupar', origem: 'dispositivo', detalhe: 'via digital (porta)' });
        return formatarReserva(await buscarReserva(tx, r.id));
    });
    return { permitido: true, professor: prof.nome, ...(await aposOcupar(reserva)) };
}

module.exports = {
    codigoReserva,
    formatarReserva,
    manutencao,
    listarSalas,
    listarAtivas,
    listarHistorico,
    calcularSituacao,
    criarReserva,
    criarEvento,
    ocupar,
    ocupacaoForcada,
    liberar,
    removerPeloAdmin,
    mudarSala,
    reservaEmUso,
    voltarParaReservada,
    autenticarNaPorta,
    registrarLog
};
