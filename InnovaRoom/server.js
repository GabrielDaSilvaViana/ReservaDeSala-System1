const express = require('express');
const mysql = require('mysql2/promise');
const path = require('path');
const fetch = require('node-fetch');

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname)));

const dbConfig = {
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || 'root123456',
  database: process.env.DB_NAME || 'innovaroom',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
};

const pool = mysql.createPool(dbConfig);

async function query(sql, params = []) {
  const [rows] = await pool.query(sql, params);
  return rows;
}

app.get('/api/ping', async (req, res) => {
  try {
    await query('SELECT 1');
    res.json({ status: 'ok', database: dbConfig.database });
  } catch (error) {
    res.status(500).json({ status: 'error', message: error.message });
  }
});

app.get('/api/rooms', async (req, res) => {
  try {
    const rooms = await query('SELECT * FROM rooms ORDER BY bloco, nome');
    res.json(rooms);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/users/register', async (req, res) => {
  try {
    const { nome, username, cardCode, fingerprintCode } = req.body;
    if (!nome || (!cardCode && !fingerprintCode)) {
      return res.status(400).json({ error: 'Nome e código de crachá ou digital são obrigatórios.' });
    }

    const existing = await query(
      'SELECT * FROM users WHERE card_code = ? OR fingerprint_code = ? OR username = ? LIMIT 1',
      [cardCode || '', fingerprintCode || '', username || '']
    );

    if (existing.length) {
      const user = existing[0];
      const updates = [];
      const params = [];

      if (user.nome !== nome) { updates.push('nome = ?'); params.push(nome); }
      if (cardCode && user.card_code !== cardCode) { updates.push('card_code = ?'); params.push(cardCode); }
      if (fingerprintCode && user.fingerprint_code !== fingerprintCode) { updates.push('fingerprint_code = ?'); params.push(fingerprintCode); }
      if (username && user.username !== username) { updates.push('username = ?'); params.push(username); }

      if (updates.length) {
        await query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, [...params, user.id]);
      }

      const [updated] = await query('SELECT * FROM users WHERE id = ?', [user.id]);
      return res.json(updated);
    }

    const result = await query(
      'INSERT INTO users (nome, username, card_code, fingerprint_code) VALUES (?, ?, ?, ?)',
      [nome, username || null, cardCode || null, fingerprintCode || null]
    );

    const [user] = await query('SELECT * FROM users WHERE id = ?', [result.insertId]);
    res.json(user);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'Código de crachá ou digital já está em uso.' });
    }
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/authenticate', async (req, res) => {
  try {
    const { cardCode, fingerprintCode, roomCode, action = 'authenticate' } = req.body;
    if (!cardCode && !fingerprintCode) {
      return res.status(400).json({ error: 'cardCode ou fingerprintCode deve ser enviado.' });
    }

    const users = await query(
      'SELECT * FROM users WHERE card_code = ? OR fingerprint_code = ? LIMIT 1',
      [cardCode || '', fingerprintCode || '']
    );

    if (!users.length) {
      return res.status(401).json({ error: 'Credencial não encontrada.' });
    }

    const user = users[0];
    let roomId = null;
    let room = null;

    if (roomCode) {
      const rooms = await query('SELECT * FROM rooms WHERE room_code = ? LIMIT 1', [roomCode]);
      if (rooms.length) {
        room = rooms[0];
        roomId = room.id;
      }
    }

    await query(
      'INSERT INTO access_logs (user_id, room_id, action, source) VALUES (?, ?, ?, ?)',
      [user.id, roomId, action, 'hardware']
    );

    res.json({ user, allow: true, room, action });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/reserve', async (req, res) => {
  try {
    const { roomCode, professor, date, startTime, endTime, reservaId } = req.body;
    if (!roomCode || !professor || !date || !startTime || !endTime || !reservaId) {
      return res.status(400).json({ error: 'Faltam dados obrigatórios.' });
    }

    await query('CALL sp_reservar_sala(?, ?, ?, ?, ?, ?)', [
      roomCode,
      professor,
      date,
      startTime,
      endTime,
      reservaId
    ]);
    
    const [room] = await query('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/event', async (req, res) => {
  try {
    const { roomCode, evento, professor, date, startTime, endTime, reservaId } = req.body;
    if (!roomCode || !evento || !professor || !date || !startTime || !endTime || !reservaId) {
      return res.status(400).json({ error: 'Faltam dados obrigatórios.' });
    }

    await query('CALL sp_adicionar_evento(?, ?, ?, ?, ?, ?, ?)', [
      roomCode,
      evento,
      professor,
      date,
      startTime,
      endTime,
      reservaId
    ]);

    const [room] = await query('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/release', async (req, res) => {
  try {
    const { roomCode } = req.body;
    if (!roomCode) {
      return res.status(400).json({ error: 'roomCode é obrigatório.' });
    }

    await query('CALL sp_liberar_sala(?)', [roomCode]);
    const [room] = await query('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    res.json(room);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/release-room', async (req, res) => {
  try {
    const { roomCode, professorName, cardCode, fingerprintCode } = req.body;
    if (!roomCode || !professorName) {
      return res.status(400).json({ error: 'roomCode e nome do professor são obrigatórios.' });
    }
    if (!cardCode && !fingerprintCode) {
      return res.status(400).json({ error: 'Código do crachá ou digital é obrigatório.' });
    }

    const rooms = await query('SELECT * FROM rooms WHERE room_code = ? LIMIT 1', [roomCode]);
    if (!rooms.length) {
      return res.status(404).json({ error: 'Sala não encontrada.' });
    }

    const room = rooms[0];
    if (room.status === 'livre') {
      return res.status(400).json({ error: 'Sala já está livre.' });
    }

    if (room.professor !== professorName) {
      return res.status(403).json({ error: 'Nome do professor não corresponde à reserva.' });
    }

    const users = await query(
      'SELECT * FROM users WHERE (card_code = ? OR fingerprint_code = ?) AND nome = ? LIMIT 1',
      [cardCode || '', fingerprintCode || '', professorName]
    );

    if (!users.length) {
      return res.status(401).json({ error: 'Código de crachá/digital não encontrado ou não corresponde ao professor.' });
    }

    await query('CALL sp_liberar_sala(?)', [roomCode]);
    
    await query(
      'INSERT INTO access_logs (user_id, room_id, action, source) VALUES (?, ?, ?, ?)',
      [users[0].id, room.id, 'release', 'web']
    );

    const [updatedRoom] = await query('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    res.json(updatedRoom);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Forçar ocupação de uma sala (usado pelo admin)
app.post('/api/force-occupy', async (req, res) => {
  try {
    const { roomCode, professor, cardCode, date, startTime, endTime } = req.body;
    console.log('[force-occupy] request payload:', { roomCode, professor, cardCode, date, startTime, endTime });
    if (!roomCode || !professor) return res.status(400).json({ error: 'roomCode e professor são obrigatórios.' });
    if (!cardCode) return res.status(400).json({ error: 'Código do crachá é obrigatório para ocupação forçada.' });

    const rooms = await query('SELECT * FROM rooms WHERE room_code = ? LIMIT 1', [roomCode]);
    if (!rooms.length) return res.status(404).json({ error: 'Sala não encontrada.' });
    const room = rooms[0];
    // Format date/time values as SQL-friendly strings
    const toSqlDate = d => {
      if (!d) return new Date().toISOString().slice(0,10);
      if (d instanceof Date) return d.toISOString().slice(0,10);
      const s = String(d).trim();
      // if format DD/MM/YYYY or D/M/YYYY
      const dm = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dm) {
        const dd = String(dm[1]).padStart(2,'0');
        const mm = String(dm[2]).padStart(2,'0');
        const yyyy = dm[3];
        return `${yyyy}-${mm}-${dd}`;
      }
      // if ISO-like 'YYYY-MM-DD' or 'YYYY-MM-DDT...'
      if (s.indexOf('T') >= 0) return s.split('T')[0];
      // if already in YYYY-MM-DD
      if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
      // fallback: attempt Date parse
      const dt = new Date(s);
      if (!isNaN(dt.getTime())) return dt.toISOString().slice(0,10);
      // final fallback: today's date
      return new Date().toISOString().slice(0,10);
    };
    const toSqlTime = t => {
      if (!t) return new Date().toTimeString().slice(0,8);
      if (typeof t === 'string' && t.indexOf(':') >= 0) return t.length > 8 ? t.slice(0,8) : t;
      if (t instanceof Date) return t.toTimeString().slice(0,8);
      return new Date().toTimeString().slice(0,8);
    };

    // Use provided date/time when informado pelo cliente, caso contrário caia para os valores atuais da sala
    // Try to find a user by cardCode; if not found, allow any code but log a warning.
    const users = await query('SELECT * FROM users WHERE card_code = ? LIMIT 1', [cardCode]);
    const user = users.length ? users[0] : null;
    if (!user) {
      console.warn('[force-occupy] cracha nao encontrado, prosseguindo com codigo fornecido:', cardCode);
    } else if (user.nome && String(user.nome).trim().toLowerCase() !== String(professor).trim().toLowerCase()) {
      console.warn('[force-occupy] cracha encontrado mas nome difere do professor informado:', { cardCode, professor, userNome: user.nome });
      // não bloqueia — apenas registra diferença
    }

    const dataReserva = date ? toSqlDate(date) : toSqlDate(room.data_reserva);
    const horarioInicio = startTime ? toSqlTime(startTime) : toSqlTime(room.horario_inicio);
    const horarioFim = endTime ? toSqlTime(endTime) : (room.horario_fim ? toSqlTime(room.horario_fim) : new Date(Date.now() + 60*60*1000).toTimeString().slice(0,8));

    const reservaId = 'FORCE' + Date.now();

    await query(
      `UPDATE rooms SET status = 'ocupada', professor = ?, reserva_id = ?, data_reserva = ?, horario_inicio = ?, horario_fim = ?, evento = NULL WHERE room_code = ?`,
      [professor, reservaId, dataReserva, horarioInicio, horarioFim, roomCode]
    );

    // Insere histórico como ocupada
    const roomRow = await query('SELECT id FROM rooms WHERE room_code = ? LIMIT 1', [roomCode]);
    const roomId = roomRow[0].id;
    await query(
      'INSERT INTO reservations (room_id, professor, reserva_id, tipo, data_reserva, horario_inicio, horario_fim, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [roomId, professor, reservaId, 'ocupada', dataReserva, horarioInicio, horarioFim, 'completed']
    );

    // registra acesso — se usuário não existir, grava user_id = NULL
    const userId = user ? user.id : null;
    await query('INSERT INTO access_logs (user_id, room_id, action, source) VALUES (?, ?, ?, ?)', [userId, roomId, 'unlock', 'web']);

    const [updated] = await query('SELECT * FROM rooms WHERE room_code = ?', [roomCode]);
    res.json(updated);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/reservations', async (req, res) => {
  try {
    const list = await query(
      `SELECT r.id, rm.room_code, rm.nome AS room_name, r.professor, r.reserva_id, r.tipo, r.evento,
              r.data_reserva, r.horario_inicio, r.horario_fim, r.created_at
       FROM reservations r
       JOIN rooms rm ON rm.id = r.room_id
       ORDER BY r.created_at DESC`
    );
    res.json(list);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Endpoints para persistir a grade semanal
app.get('/api/grade', async (req, res) => {
  try {
    const rows = await query('SELECT * FROM grade_weekly ORDER BY professor, dia, faixa');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/grade', async (req, res) => {
  try {
    const { professor, dia, faixa, sala_code, turma_id } = req.body;
    if (!professor || dia === undefined || faixa === undefined || !sala_code || !turma_id) {
      return res.status(400).json({ error: 'Dados incompletos.' });
    }
    const result = await query('INSERT INTO grade_weekly (professor, dia, faixa, sala_code, turma_id) VALUES (?, ?, ?, ?, ?)',
      [professor, dia, faixa, sala_code, turma_id]);
    const [row] = await query('SELECT * FROM grade_weekly WHERE id = ?', [result.insertId]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/grade/:id', async (req, res) => {
  try {
    const id = req.params.id;
    const { professor, dia, faixa, sala_code, turma_id } = req.body;
    const updates = [];
    const params = [];
    if (professor !== undefined) { updates.push('professor = ?'); params.push(professor); }
    if (dia !== undefined) { updates.push('dia = ?'); params.push(dia); }
    if (faixa !== undefined) { updates.push('faixa = ?'); params.push(faixa); }
    if (sala_code !== undefined) { updates.push('sala_code = ?'); params.push(sala_code); }
    if (turma_id !== undefined) { updates.push('turma_id = ?'); params.push(turma_id); }
    if (!updates.length) return res.status(400).json({ error: 'Nada para atualizar.' });
    params.push(id);
    await query(`UPDATE grade_weekly SET ${updates.join(', ')} WHERE id = ?`, params);
    const [row] = await query('SELECT * FROM grade_weekly WHERE id = ?', [id]);
    res.json(row);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/grade/:id', async (req, res) => {
  try {
    const id = req.params.id;
    await query('DELETE FROM grade_weekly WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/update-room-status', async (req, res) => {
  try {
    const { room_code, status } = req.body;
    
    console.log(`[update-room-status] Recebido: room_code=${room_code}, status=${status}`);
    
    if (!room_code || !status) {
      return res.status(400).json({ error: 'room_code e status são obrigatórios' });
    }

    const rooms = await query('SELECT id FROM rooms WHERE room_code = ?', [room_code]);
    console.log(`[update-room-status] Salas encontradas:`, rooms);
    
    if (rooms.length === 0) {
      return res.status(404).json({ error: 'Sala não encontrada' });
    }

    const roomId = rooms[0].id;
    console.log(`[update-room-status] Room ID: ${roomId}`);

    if (status === 'livre') {
      console.log(`[update-room-status] Limpando dados da sala...`);
      await query('UPDATE rooms SET status = ?, professor = NULL, reserva_id = NULL, data_reserva = NULL, horario_inicio = NULL, horario_fim = NULL, evento = NULL WHERE id = ?', 
        [status, roomId]);
    } else if (status === 'ocupada') {
      console.log(`[update-room-status] Atualizando rooms para ocupada...`);
      await query('UPDATE rooms SET status = ?, evento = NULL WHERE id = ?', [status, roomId]);
    }

    const updatedRooms = await query('SELECT * FROM rooms WHERE id = ?', [roomId]);
    console.log(`[update-room-status] Room atualizada:`, updatedRooms[0]);
    
    res.json(updatedRooms[0]);
  } catch (error) {
    console.error(`[update-room-status] ERRO:`, error.message);
    res.status(500).json({ error: error.message });
  }
});

const ESP32_SOLENOID = {
  // IP DO ESP32: substituir pelo IP real exibido no Monitor Serial do ESP32.
  host: process.env.ESP32_HOST || process.env.ESP32_IP || '10.110.22.30',
  port: Number(process.env.ESP32_PORT || 80),
  token: process.env.ESP32_TOKEN || '',
  timeoutMs: Number(process.env.ESP32_TIMEOUT_MS || 5000)
};

function normalizeEsp32Host(value) {
  const host = String(value || '').trim();
  if (!host) {
    return '10.110.22.30';
  }

  const valid = /^(([0-9]{1,3}\.){3}[0-9]{1,3}|localhost|[a-zA-Z0-9.-]+)$/.test(host);
  if (!valid) {
    throw new Error(`ESP32_HOST/ESP32_IP inválido: "${host}". Use um IP como 10.110.22.30 ou um hostname válido.`);
  }

  return host;
}

ESP32_SOLENOID.host = normalizeEsp32Host(ESP32_SOLENOID.host);

async function fetchEsp32(path, { method = 'GET', allowFailure = false } = {}) {
  const url = `http://${ESP32_SOLENOID.host}:${ESP32_SOLENOID.port}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ESP32_SOLENOID.timeoutMs);

  try {
    console.log(`[ESP32] Requisição ${method} ${url}`);
    const res = await fetch(url, {
      method,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json' }
    });

    const text = await res.text();
    if (!res.ok && !allowFailure) {
      throw new Error(`ESP32 respondeu ${res.status}: ${text || 'erro desconhecido'}`);
    }

    return { ok: res.ok, status: res.status, text, url };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout ao comunicar com o ESP32 em ${url} (${ESP32_SOLENOID.timeoutMs}ms).`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function pingSolenoid() {
  const { ok, text } = await fetchEsp32('/health', { method: 'GET', allowFailure: false });
  if (!ok) {
    throw new Error(`Health check do ESP32 falhou: ${text || 'sem resposta'}`);
  }
  return text || 'ok';
}

async function triggerSolenoid(action = 'unlock', durationMs = 4000) {
  await pingSolenoid();

  const params = new URLSearchParams({ durationMs: String(durationMs) });
  if (ESP32_SOLENOID.token) params.set('token', ESP32_SOLENOID.token);

  const url = `http://${ESP32_SOLENOID.host}:${ESP32_SOLENOID.port}/${action}?${params.toString()}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), ESP32_SOLENOID.timeoutMs);

  try {
    console.log(`[ESP32] Enviando comando ${action} para ${url}`);
    const res = await fetch(url, {
      method: 'POST',
      signal: controller.signal,
      headers: { 'Content-Type': 'text/plain' }
    });
    const text = await res.text();

    if (!res.ok) {
      throw new Error(`ESP32 respondeu ${res.status}: ${text || 'erro desconhecido'}`);
    }

    return { ok: true, message: text || `Comando ${action} enviado ao ESP32.`, action, durationMs };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Timeout ao enviar ${action} para o ESP32 em ${url} (${ESP32_SOLENOID.timeoutMs}ms).`);
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}

app.post('/api/solenoid/unlock', async (req, res) => {
  try {
    const { durationMs = 4000, roomName = 'Sala', reason = 'reserva' } = req.body || {};
    const payload = await triggerSolenoid('unlock', Number(durationMs) || 4000);
    res.json({ ...payload, roomName, reason, success: true });
  } catch (error) {
    console.error('[solenoid/unlock] ERRO:', error.message || error);
    res.status(500).json({ error: error.message || 'Falha ao acionar solenoide no ESP32.' });
  }
});

app.post('/api/solenoid/lock', async (req, res) => {
  try {
    const payload = await triggerSolenoid('lock', 0);
    res.json({ ...payload, success: true });
  } catch (error) {
    console.error('[solenoid/lock] ERRO:', error.message || error);
    res.status(500).json({ error: error.message || 'Falha ao travar solenoide no ESP32.' });
  }
});

const port = Number(process.env.PORT || 3000);
app.listen(port, '0.0.0.0', () => {
  console.log(`Servidor iniciado em http://localhost:${port}`);
});
