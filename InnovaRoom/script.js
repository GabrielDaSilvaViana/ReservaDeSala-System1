// Global error reporter (mostra erros JS na página para diagnóstico rápido)
window.addEventListener('error', function (e) {
    try {
        const existing = document.getElementById('jsErrorBanner');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.id = 'jsErrorBanner';
        banner.style = 'background:#fff6f6;color:#900;border:1px solid #f5c6cb;padding:10px;font-family:Inter,sans-serif;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;max-width:90%;box-shadow:0 2px 6px rgba(0,0,0,0.08)';
        banner.innerText = `Erro de script: ${e.message} (${e.filename}:${e.lineno})`;
        document.body.appendChild(banner);
        console.error('Captured window error:', e.message, e.filename, e.lineno, e.error);
    } catch (err) { console.error('Erro ao renderizar banner de erro:', err); }
});
window.addEventListener('unhandledrejection', function (ev) {
    try {
        const existing = document.getElementById('jsErrorBanner');
        if (existing) existing.remove();
        const banner = document.createElement('div');
        banner.id = 'jsErrorBanner';
        banner.style = 'background:#fff6f6;color:#900;border:1px solid #f5c6cb;padding:10px;font-family:Inter,sans-serif;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;max-width:90%;box-shadow:0 2px 6px rgba(0,0,0,0.08)';
        const reason = ev.reason && ev.reason.message ? ev.reason.message : String(ev.reason);
        banner.innerText = `Unhandled rejection: ${reason}`;
        document.body.appendChild(banner);
        console.error('Unhandled promise rejection:', ev.reason);
    } catch (err) { console.error('Erro ao renderizar banner de rejection:', err); }
});

/* ═══════════════════════════════════════════════════════════════════════════
   DADOS — SENAI
═══════════════════════════════════════════════════════════════════════════ */
const ADMIN_SENHA = 'admin123';
let isAdmin = false;
// Estado atual da view — usado para refrescar sem voltar ao Dashboard
let currentView = 'dashboard';
let lastBloco = null; // { bloco, inicio, fim }
// Filtros usados pela grade horária (declarados globalmente para evitar erros)
let gradeFiltroProfessor = '';
let gradeFilterSala = '';

// ── Lista de professores do SENAI ──────────────────────────────────────────
const professores = [
    'Prof. Ana Souza','Prof. Carlos Lima','Prof. Beatriz Nunes',
    'Prof. Rafael Costa','Prof. Juliana Ferreira','Prof. Marcos Oliveira',
    'Prof. Sandra Rocha','Prof. Diego Alves','Prof. Patrícia Mendes',
    'Prof. Fernando Ramos','Prof. Luciana Teixeira','Prof. Roberto Campos'
];

// ── Turmas e cursos do SENAI ───────────────────────────────────────────────
const turmas = [
    { id: 'T1', nome: 'Mecatrônica I', curso: 'Técnico em Mecatrônica' },
    { id: 'T2', nome: 'Mecatrônica II', curso: 'Técnico em Mecatrônica' },
    { id: 'T3', nome: 'Eletrotécnica I', curso: 'Técnico em Eletrotécnica' },
    { id: 'T4', nome: 'Eletrotécnica II', curso: 'Técnico em Eletrotécnica' },
    { id: 'T5', nome: 'Informática I', curso: 'Técnico em Informática' },
    { id: 'T6', nome: 'Informática II', curso: 'Técnico em Informática' },
    { id: 'T7', nome: 'Automação I', curso: 'Técnico em Automação Industrial' },
    { id: 'T8', nome: 'Automação II', curso: 'Técnico em Automação Industrial' },
    { id: 'T9', nome: 'Eletricista', curso: 'Qualificação em Eletricidade' },
];

// ── Grade horária padrão (turnos SENAI) ────────────────────────────────────
const FAIXAS_HORARIO = [
    { label: '07:00–08:40', inicio: '07:00', fim: '08:40' },
    { label: '08:40–10:20', inicio: '08:40', fim: '10:20' },
    { label: '10:30–12:10', inicio: '10:30', fim: '12:10' },
    { label: '13:00–14:40', inicio: '13:00', fim: '14:40' },
    { label: '14:40–16:20', inicio: '14:40', fim: '16:20' },
    { label: '16:30–18:10', inicio: '16:30', fim: '18:10' },
    { label: '19:00–20:40', inicio: '19:00', fim: '20:40' },
    { label: '20:40–22:00', inicio: '20:40', fim: '22:00' },
];

// Minutos mínimos de reserva por padrão (pode ajustar conforme política)
const MIN_RESERVATION_MINUTES = 5;

function timeToMinutes(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}
const DIAS_SEMANA = ['Segunda','Terça','Quarta','Quinta','Sexta'];

// Grade semanal fixa por professor (sala, turma, faixa)
let gradeSemanal = {
    'Prof. Ana Souza': [
        { dia:0, faixa:0, sala:'S133', turma:'T1' },
        { dia:0, faixa:1, sala:'S133', turma:'T1' },
        { dia:1, faixa:3, sala:'L132', turma:'T3' },
        { dia:2, faixa:0, sala:'S224', turma:'T5' },
        { dia:3, faixa:1, sala:'L229', turma:'T5' },
        { dia:4, faixa:4, sala:'S228', turma:'T7' },
    ],
    'Prof. Carlos Lima': [
        { dia:0, faixa:2, sala:'L137', turma:'T2' },
        { dia:1, faixa:0, sala:'L137', turma:'T2' },
        { dia:2, faixa:3, sala:'L230', turma:'T4' },
        { dia:3, faixa:4, sala:'L334', turma:'T3' },
        { dia:4, faixa:1, sala:'S306', turma:'T8' },
    ],
    'Prof. Beatriz Nunes': [
        { dia:0, faixa:3, sala:'L319', turma:'T5' },
        { dia:1, faixa:3, sala:'L320', turma:'T6' },
        { dia:2, faixa:1, sala:'L321', turma:'T5' },
        { dia:3, faixa:0, sala:'S324', turma:'T6' },
        { dia:4, faixa:3, sala:'L322', turma:'T6' },
    ],
    'Prof. Rafael Costa': [
        { dia:0, faixa:4, sala:'L329', turma:'T7' },
        { dia:1, faixa:2, sala:'L329', turma:'T8' },
        { dia:2, faixa:4, sala:'L310', turma:'T7' },
        { dia:3, faixa:3, sala:'L327', turma:'T2' },
        { dia:4, faixa:0, sala:'L331', turma:'T1' },
    ],
    'Prof. Juliana Ferreira': [
        { dia:0, faixa:1, sala:'S305', turma:'T9' },
        { dia:1, faixa:4, sala:'S305', turma:'T9' },
        { dia:2, faixa:2, sala:'L332', turma:'T3' },
        { dia:3, faixa:2, sala:'S308', turma:'T4' },
        { dia:4, faixa:2, sala:'S215', turma:'T9' },
    ],
    'Prof. Marcos Oliveira': [
        { dia:0, faixa:0, sala:'L216', turma:'T2' },
        { dia:1, faixa:1, sala:'L216', turma:'T1' },
        { dia:2, faixa:5, sala:'L131', turma:'T2' },
        { dia:3, faixa:5, sala:'L131', turma:'T1' },
        { dia:4, faixa:5, sala:'S232', turma:'T3' },
    ],
    'Prof. Sandra Rocha': [
        { dia:0, faixa:6, sala:'S404', turma:'T9' },
        { dia:1, faixa:6, sala:'S333', turma:'T8' },
        { dia:2, faixa:6, sala:'L334', turma:'T8' },
        { dia:3, faixa:6, sala:'S304', turma:'T7' },
        { dia:4, faixa:6, sala:'S304', turma:'T9' },
    ],
    'Prof. Diego Alves': [
        { dia:0, faixa:5, sala:'L135', turma:'T7' },
        { dia:1, faixa:5, sala:'L135', turma:'T8' },
        { dia:2, faixa:3, sala:'L307', turma:'T2' },
        { dia:3, faixa:0, sala:'L307', turma:'T1' },
        { dia:4, faixa:7, sala:'L328', turma:'T7' },
    ],
    'Prof. Patrícia Mendes': [
        { dia:0, faixa:2, sala:'S129', turma:'T5' },
        { dia:1, faixa:2, sala:'S129', turma:'T6' },
        { dia:2, faixa:7, sala:'L315', turma:'T5' },
        { dia:3, faixa:7, sala:'L318', turma:'T6' },
        { dia:4, faixa:6, sala:'L319', turma:'T5' },
    ],
};

const horarios = FAIXAS_HORARIO.map(f => f.label);
const datas = [
    '28/04/2026','29/04/2026','30/04/2026',
    '01/05/2026','02/05/2026','05/05/2026'
];
const eventosNomes = [
    'Reunião de Departamento','Prova Final','Semana Acadêmica',
    'Defesa de TCC','Workshop de Pesquisa','Evento Importante'
];

function rand(arr)  { return arr[Math.floor(Math.random() * arr.length)]; }
function randId()   { return 'RES-' + Math.floor(1000 + Math.random() * 9000); }
function randProfId(){ return 'PROF' + Math.floor(1000 + Math.random() * 9000); }

function normalizarGrupoSala(codigo) {
    const texto = String(codigo || '').trim();

    /*
     * ============================================================
     * 2º ANDAR
     * ============================================================
     *
     * IMPORTANTE:
     * NÃO existe mais regra automática por número.
     *
     * Somente as salas que estiverem nesta lista vão para o 2º andar.
     */

    const salasAndar2 = [
        'S215',
        'L216',
        'S224',
        'S228',
        'L229',
        'L230',
        'S232',
        'S404',

        // Salas transferidas para o 2º andar
        'S308',
        'L315',
        'L323',
        'L324',
        'L327',
        'L328',
        'L330',
        'L331',
        'L334',
        'L319',
        'L320',
        'L321',
        'L322'
    ];

    if (salasAndar2.includes(texto)) {
        return {
            bloco: '2',
            andar: 2
        };
    }

    /*
     * TODAS AS OUTRAS SALAS FICAM NO 1º ANDAR.
     */
    return {
        bloco: 'T',
        andar: 1
    };
}
// ── Mapeamento de códigos de sala → nome SENAI ─────────────────────────────
const NOMES_SALA_SENAI = {
    'S115': 'S115 BIBLIOTECA',
    'S129': 'S129 INFORMÁTICA',
    'S130': 'S130 SALA DE AULA',
    'L131': 'L131 METROLOGIA I',
    'L132': 'L132 METROLOGIA II',
    'S133': 'S133 SALA DE AULA',
    'L135': 'L135 SENAI LAB',
    'L137': 'L137 CAD / CAM',
    'S215': 'S215 PREPARAÇÃO DOCENTE',
    'L216': 'L216 ENSAIOS MECÂNICOS',
    'S224': 'S224 SALA DE AULA',
    'S228': 'S228 SALA DE AULA',
    'L229': 'L229 ELETRÔNICA DIGITAL',
    'L230': 'L230 COMANDOS ACIONAMENTOS',
    'S232': 'S232 TEC. ELETRICIDADE',
    'S304': 'S304 SALA DE AULA',
    'S305': 'S305 AUDITÓRIO',
    'S306': 'S306 SALA DE AULA',
    'L307': 'L307 PROJETOS',
    'S308': 'S308 DESENHO',
    'L310': 'L310 PREPARAÇÃO DOCENTE SUP.',
    'L315': 'L315 INFORMÁTICA',
    'L318': 'L318 SERVIDOR EDUCACIONAL',
    'L319': 'L319 INFORMÁTICA',
    'L320': 'L320 INFORMÁTICA',
    'L321': 'L321 INFORMÁTICA',
    'L322': 'L322 INFORMÁTICA',
    'S323': 'S323 SALA DE AULA',
    'S324': 'S324 INFORMÁTICA',
    'L327': 'L327 CLP',
    'L328': 'L328 HIDRÁULICA',
    'L329': 'L329 ROBÓTICA',
    'L330': 'L330 CLP 2',
    'L331': 'L331 PNEUMÁTICA',
    'L332': 'L332 ELETRÔNICA GERAL',
    'S333': 'S333 DEP. MECATRÔNICA',
    'L334': 'L334 COMANDOS ELÉTRICOS',
    'S404': 'S404 SALA DE AULA - ÁREA 02',
};

// Todos os códigos de sala do SENAI em ordem
const CODIGOS_SENAI = Object.keys(NOMES_SALA_SENAI);

// Helpers para integração com backend
async function apiPost(path, data) {
    try {
        const res = await fetch(path, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Erro de comunicação com o servidor');
        return json;
    } catch (error) {
        console.warn('API POST failed:', path, error.message);
        throw error;
    }
}

async function registerUser(nome, cardCode, fingerprintCode) {
    if (!cardCode && !fingerprintCode) return null;
    try {
        return await apiPost('/api/users/register', {
            nome,
            cardCode: cardCode || null,
            fingerprintCode: fingerprintCode || null
        });
    } catch (error) {
        console.warn('Falha ao registrar credenciais do usuário:', error.message);
        return null;
    }
}

const statusPool = ['livre','reservada','ocupada','evento'];

// ── Gera salas usando nomes reais do SENAI ─────────────────────────────────
function gerarSalasSenai() {
    const fixedStatuses = [
        'livre','reservada','ocupada','evento','livre','livre',
        'reservada','ocupada','livre','evento','reservada','livre',
        'ocupada','livre','reservada','livre','livre','reservada',
        'ocupada','livre','livre','evento','livre','reservada',
        'livre','livre','reservada','livre','livre','ocupada',
        'livre','reservada','livre','livre','ocupada','livre','livre'
    ];
    const profsFix = professores.slice(0, 5);
    return CODIGOS_SENAI.map((codigo, i) => {
        const status = fixedStatuses[i % fixedStatuses.length];
        const { bloco, andar } = normalizarGrupoSala(codigo);

        return {
            id: codigo,
            nome: NOMES_SALA_SENAI[codigo],
            codigo,
            bloco,
            andar,
            status,
            professor: status !== 'livre' ? profsFix[i % profsFix.length] : null,
            reservaId: status !== 'livre' ? randProfId() : null,
            data:      status !== 'livre' ? datas[i % datas.length] : null,
            horario:   status !== 'livre' ? horarios[i % horarios.length] : null,
            evento:    status === 'evento' ? eventosNomes[i % eventosNomes.length] : null,
        };
    });
}

let todasSalas = gerarSalasSenai();
// Mantém compatibilidade com código que usa salasA/salasB
let salasA = todasSalas.filter(s => s.andar === 1);
let salasB = todasSalas.filter(s => s.andar === 2);

/* ═══════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS
═══════════════════════════════════════════════════════════════════════════ */
function traduzStatus(s) {
    return { livre:'Disponível', reservada:'Reservada', ocupada:'Ocupada', evento:'Evento' }[s] || s;
}
function formatDateFromSql(value) {
    if (!value) return null;
    if (typeof value === 'string' && value.includes('T')) value = value.split('T')[0];
    const partes = String(value).split('-');
    if (partes.length === 3) return `${partes[2]}/${partes[1]}/${partes[0]}`;
    return value;
}
function getSala(id) { return todasSalas.find(s => s.id === id); }
function primeiraSalaLivre() { return todasSalas.find(s => s.status === 'livre')?.id; }
function getTurma(id) { return turmas.find(t => t.id === id); }

class SolenoidController {
    constructor({ mode = 'simulacao', onStateChange = null } = {}) {
        this.mode = mode;
        this.state = 'locked';
        this.log = [];
        this.onStateChange = onStateChange;
        this.timeoutId = null;
    }

    addLog(message) {
        const stamp = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.log.push(`${stamp} — ${message}`);
        if (this.log.length > 6) this.log.shift();
        if (this.onStateChange) this.onStateChange({ state: this.state, log: [...this.log] });
    }

    setState(state, meta = {}) {
        this.state = state;
        this.meta = meta;
        if (this.onStateChange) this.onStateChange({ state, log: [...this.log], ...meta });
    }

    clearTimer() {
        if (this.timeoutId) {
            clearTimeout(this.timeoutId);
            this.timeoutId = null;
        }
    }

    async unlock({ roomName = 'hardware', durationMs = 4000, reason = 'reserva' } = {}) {
        this.clearTimer();
        this.setState('unlocking');
        this.addLog(`${reason === 'reserva' ? 'Reserva' : 'Ação'} recebida para ${roomName || 'a sala'}`);

        if (this.mode === 'hardware') {
            this.addLog('Módulo de solenoide conectado. Enviando comando ao ESP32...');
            try {
                const payload = await apiPost('/api/solenoid/unlock', { roomName, durationMs, reason });
                this.addLog(payload?.message || 'Comando enviado ao ESP32 com sucesso.');
            } catch (err) {
                this.addLog('Falha na comunicação com o ESP32.');
                throw err;
            }
        } else {
            this.addLog('Modo simulação ativo. Exibindo liberação visual...');
            await new Promise(resolve => setTimeout(resolve, 300));
        }

        this.setState('unlocked', { roomName, unlockedAt: new Date() });
        this.addLog('Solenoide destrancado com sucesso.');

        this.timeoutId = setTimeout(() => {
            this.setState('locked');
            this.addLog('Solenoide travado automaticamente após o ciclo.');
        }, durationMs);

        return { state: this.state, mode: this.mode, unlockedAt: new Date() };
    }

lock() {
        this.clearTimer();
        this.setState('locked');
        this.addLog('Travamento manual aplicado.');
    }
}

function getSolenoidController() {
    if (!window.__solenoidController) {
        window.__solenoidController = new SolenoidController();
    }
    return window.__solenoidController;
}

function blocoDisplay(b) {
    if (b === 'T') return '1º Andar';
    if (b === '3') return '1º Andar';
    if (b === '2') return '2º Andar';
    return 'Bloco ' + b;
}

function setNavigationSelection(view, floor = null) {
    document.querySelectorAll('.nav-item, .sub-item, .nav-dropdown').forEach(item => item.classList.remove('active'));
    if (floor !== null) {
        document.querySelector(`.sub-item[data-floor="${floor}"]`)?.classList.add('active');
        document.querySelector(`.nav-dropdown[data-floor-toggle="${floor}"]`)?.classList.add('active');
        return;
    }
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
}

/* ═══════════════════════════════════════════════════════════════════════════
   STATS
═══════════════════════════════════════════════════════════════════════════ */
function renderStats(salas) {
    const c = { livre:0, reservada:0, ocupada:0, evento:0 };
    salas.forEach(s => c[s.status]++);
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card border-green"><p>Disponíveis</p><h2 class="txt-green">${c.livre}</h2></div>
        <div class="stat-card border-purple"><p>Reservadas</p><h2 class="txt-purple">${c.reservada}</h2></div>
        <div class="stat-card border-red"><p>Ocupadas</p><h2 class="txt-red">${c.ocupada}</h2></div>
        <div class="stat-card border-orange"><p>Eventos</p><h2 class="txt-orange">${c.evento}</h2></div>
        <div class="stat-card border-main"><p>Total Salas</p><h2 class="txt-main">${salas.length}</h2></div>
    `;
}

/* ═══════════════════════════════════════════════════════════════════════════
   RENDER BLOCOS
═══════════════════════════════════════════════════════════════════════════ */
function renderBlocoSection(salas, blocoLabel, badgeClass) {
    if (!salas.length) return '';
    const cards = salas.map(sala => `
        <div class="room-card ${sala.status}" onclick="openModal('${sala.id}')">
            <h3>${sala.nome}</h3>
            <p class="status-label">${traduzStatus(sala.status)}</p>
            ${sala.professor ? `<p class="room-meta"><i class="fas fa-user" style="font-size:10px;margin-right:4px"></i>${sala.professor}</p>` : ''}
            ${sala.evento ? `<p class="room-evento"><i class="fas fa-star" style="font-size:10px;margin-right:4px"></i>${sala.evento}</p>` : ''}
        </div>
    `).join('');

    return `
        <div class="bloco-section">
            <div class="section-title">
                <h2>${blocoLabel} <span class="bloco-badge ${badgeClass}">${salas.length} salas</span></h2>
                <p>${salas.filter(s => s.status === 'livre').length} disponíveis · ${salas.filter(s => s.status === 'ocupada').length} ocupadas</p>
            </div>
            <div class="room-grid">${cards}</div>
        </div>
    `;
}

function renderAll() {
    currentView = 'dashboard';
    setNavigationSelection('dashboard');
    renderStats(todasSalas);
    const por_andar = {};
    todasSalas.forEach(s => {
        if (!por_andar[s.andar]) por_andar[s.andar] = [];
        por_andar[s.andar].push(s);
    });
    document.getElementById('roomsContainer').innerHTML =
        Object.keys(por_andar).sort().map(andar => {
            const label = blocoDisplay(por_andar[andar][0].bloco);
            return renderBlocoSection(por_andar[andar], label, `badge-a${andar}`);
        }).join('');
}

function renderBloco(bloco, inicio, fim) {
    currentView = 'bloco';
    lastBloco = { bloco, inicio, fim };
    // Mantém compatibilidade com navegação do sidebar (agora filtra por andar)
    const andarNum = bloco === 'A' ? 1 : bloco === 'B' ? 2 : parseInt(bloco);
    setNavigationSelection('bloco', andarNum);
    const fonte = todasSalas.filter(s => s.andar === andarNum);
    const filtradas = fonte.slice(inicio - 1, fim);
    renderStats(filtradas);
    document.getElementById('roomsContainer').innerHTML =
        renderBlocoSection(filtradas, blocoDisplay(filtradas[0]?.bloco || bloco), '');
}

/* ═══════════════════════════════════════════════════════════════════════════
   SIDEBAR
═══════════════════════════════════════════════════════════════════════════ */
function toggleMenu(id) {
    const m = document.getElementById(id);
    m.style.display = m.style.display === 'flex' ? 'none' : 'flex';
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL GERAL (reservas / info)
═══════════════════════════════════════════════════════════════════════════ */
const overlay = document.getElementById('modalOverlay');
const content = document.getElementById('modalContent');

function openModal(id) {
    if (!id) return;
    const sala = getSala(id);
    if (!sala) return;
    sala.status === 'livre' ? stepReservar(sala) : stepInfo(sala);
    overlay.style.display = 'flex';
}
function closeM() { overlay.style.display = 'none'; }
overlay.addEventListener('click', e => { if (e.target === overlay) closeM(); });

function openNovaReserva() {
    const sala = todasSalas.find(s => s.status === 'livre');
    if (sala) openModal(sala.id);
    else alert('Nenhuma sala disponível no momento.');
}

/* ─── Info de sala ocupada/reservada/evento ─────────────────────────────── */
function stepInfo(sala) {
    const badgeMap = { reservada:'badge-reservada', ocupada:'badge-ocupada', evento:'badge-evento' };
    const iconMap  = { reservada:'fas fa-calendar-check', ocupada:'fas fa-door-open', evento:'fas fa-star' };

    const adminActions = isAdmin ? `
        <div class="modal-actions">
            <button class="btn-danger" onclick="adminRemoverReserva('${sala.id}')">
                <i class="fas fa-trash"></i> Remover Reserva
            </button>
            <button class="btn-secondary" onclick="adminAdicionarEvento('${sala.id}')">
                <i class="fas fa-plus"></i> Adicionar Evento
            </button>
        </div>
    ` : sala.status === 'ocupada' ? `
        <button class="btn-secondary" onclick="stepLiberarSala('${sala.id}')">
            <i class="fas fa-unlock"></i> Desocupar Sala
        </button>
        <button class="btn-outline" onclick="closeM()">Fechar</button>
    ` : sala.status === 'reservada' ? `
        <div class="modal-actions">
            <button class="btn-secondary" onclick="solicitarMudanca('${sala.id}')">
                <i class="fas fa-exchange-alt"></i> Solicitar Mudança
            </button>
            <button class="btn-sm primary" onclick="ocuparSalaReservada('${sala.id}')">
                <i class="fas fa-door-open"></i> Ocupar Sala
            </button>
            ${sala.status === 'reservada' ? `<button class="btn-sm primary js-forcar" data-room="${sala.id}"><i class="fas fa-sign-in-alt"></i> Ocupação Forçada</button>` : ''}
        </div>
        <button class="btn-outline" onclick="closeM()">Fechar</button>
    ` : `<button class="btn-outline" onclick="closeM()">Fechar</button>`;

    content.innerHTML = `
        <div class="modal-header">
            <div>
                <h3>${sala.nome}</h3>
                <p class="modal-sub">Andar ${sala.andar} · Status: ${traduzStatus(sala.status)}</p>
            </div>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <div class="reserva-info">
            <h4><i class="fas fa-user" style="margin-right:6px"></i>Informações da Reserva</h4>
            <div class="info-row">
                <span class="lbl"><i class="fas fa-chalkboard-teacher"></i> Professor</span>
                <span class="val">${sala.professor}</span>
            </div>
            ${isAdmin ? `
            <div class="info-row">
                <span class="lbl"><i class="fas fa-hashtag"></i> ID</span>
                <span class="val mono">${sala.reservaId}</span>
            </div>
            ` : ''}
            <div class="info-row">
                <span class="lbl"><i class="fas fa-calendar"></i> Data</span>
                <span class="val">${sala.data}</span>
            </div>
            <div class="info-row">
                <span class="lbl"><i class="fas fa-clock"></i> Horário</span>
                <span class="val">${sala.horario}</span>
            </div>
            ${sala.evento ? `
            <div class="info-row">
                <span class="lbl" style="color:var(--orange)"><i class="fas fa-star"></i> Evento</span>
                <span class="val" style="color:var(--orange)">${sala.evento}</span>
            </div>` : ''}
        </div>
        ${adminActions}
    `;

    // Attach click listener for the forced-occupy button (delegated) to avoid inline onclick issues
    const btnForcar = content.querySelector('.js-forcar');
    if (btnForcar) {
        btnForcar.addEventListener('click', (e) => {
            const rid = btnForcar.dataset.room;
            console.log('DEBUG: js-forcar clicked, room=', rid);
            try { forcarOcupacao(rid); } catch (err) { console.error('Erro ao disparar forcarOcupacao:', err); }
        });
    }
}

/* ─── Reserva: passo 1 ──────────────────────────────────────────────────── */
function stepReservar(sala) {
    content.innerHTML = `
        <div class="modal-header">
            <div>
                <h3>${sala.nome}</h3>
                <p class="modal-sub">${blocoDisplay(sala.bloco)} · Andar ${sala.andar} · Disponível</p>
            </div>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <div class="reserva-info">
            <div class="info-row">
                <span class="lbl">Status</span>
                <span class="status-badge badge-livre">✓ Disponível</span>
            </div>
            <div class="info-row">
                <span class="lbl">Bloco</span>
                <span class="val">${sala.bloco}</span>
            </div>
        </div>
        <button class="btn-black" onclick="stepCalendar('${sala.id}')">
            <i class="fas fa-calendar-plus"></i> Reservar Sala
        </button>
        <button class="btn-outline" onclick="closeM()">Cancelar</button>
    `;
}

function stepCalendar(salaId) {
    const agora = new Date();
    const diaAtual = agora.getDate();
    const mesAtual = agora.getMonth();
    const anoAtual = agora.getFullYear();
    const diasNoMes = new Date(anoAtual, mesAtual + 1, 0).getDate();
    const primeiroDia = new Date(anoAtual, mesAtual, 1).getDay();
    
    const diasSemana = ['D','S','T','Q','Q','S','S'];
    let daysHTML = diasSemana.map(d => `<div class="cal-dow">${d}</div>`).join('');
    
    // Células vazias antes do dia 1
    for (let i = 0; i < primeiroDia; i++) daysHTML += `<div class="calendar-day disabled"></div>`;
    
    // Dias do mês
    for (let i = 1; i <= diasNoMes; i++) {
        const dis = i < diaAtual ? 'disabled' : '';
        const sel = i === diaAtual ? 'selected' : '';
        daysHTML += `<div class="calendar-day ${dis} ${sel}" data-day="${i}">${i}</div>`;
    }

    const mesNome = MESES[mesAtual];
    content.innerHTML = `
        <div class="modal-header">
            <h3>Selecionar Horário</h3>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <div class="cal-wrap">
            <div class="cal-header"><strong>${mesNome} ${anoAtual}</strong></div>
            <div class="calendar-grid">${daysHTML}</div>
        </div>
        <label class="field-label">Horário de início</label>
        <input type="time" class="input-field" id="timeStart" value="08:00">
        <label class="field-label">Horário de término</label>
        <input type="time" class="input-field" id="timeEnd" value="10:00">
        <button class="btn-black" id="confirmDate"><i class="fas fa-check"></i> Confirmar Horário</button>
        <button class="btn-outline" onclick="openModal('${salaId}')">Voltar</button>
    `;

    const days = content.querySelectorAll('.calendar-day:not(.disabled)');
    days.forEach(d => d.onclick = () => { days.forEach(el => el.classList.remove('selected')); d.classList.add('selected'); });

    document.getElementById('confirmDate').onclick = () => {
        const sel = content.querySelector('.calendar-day.selected');
        const dia = sel ? sel.dataset.day : diaAtual;
        let hi  = document.getElementById('timeStart').value;
        let hf  = document.getElementById('timeEnd').value;
        const mesFormatado = String(mesAtual + 1).padStart(2, '0');

        // validação de duração mínima
        const startMin = timeToMinutes(hi);
        let endMin = timeToMinutes(hf);
        if (endMin <= startMin) {
            alert('Horário de término deve ser posterior ao horário de início.');
            return;
        }
        const diff = endMin - startMin;
        if (diff < MIN_RESERVATION_MINUTES) {
            const autoAdjust = confirm(`O tempo mínimo de reserva é de ${MIN_RESERVATION_MINUTES} minutos. Deseja ajustar o horário de término para ${MIN_RESERVATION_MINUTES} minutos após o início?`);
            if (autoAdjust) {
                endMin = startMin + MIN_RESERVATION_MINUTES;
                const hh = String(Math.floor(endMin / 60)).padStart(2,'0');
                const mm = String(endMin % 60).padStart(2,'0');
                hf = `${hh}:${mm}`;
            } else {
                return;
            }
        }

        stepAuth(salaId, `${String(dia).padStart(2,'0')}/${mesFormatado}/${anoAtual}`, hi, hf);
    };
}

/* ─── Reserva: autenticação ─────────────────────────────────────────────── */
let faceApiState = { ready: true, loading: false, error: null };
let faceAuthStream = null;
let faceReferenceCanvas = null;
let faceReferenceContext = null;

function getFaceReferenceKey() { return 'innovaroom_face_reference'; }

function saveFaceReference(label, descriptor) {
    const payload = { label, descriptor: Array.from(descriptor) };
    localStorage.setItem(getFaceReferenceKey(), JSON.stringify(payload));
    return payload;
}

function drawFacePreview(videoEl) {
    if (!faceReferenceCanvas) {
        faceReferenceCanvas = document.createElement('canvas');
        faceReferenceContext = faceReferenceCanvas.getContext('2d');
    }

    if (!faceReferenceContext || !videoEl || videoEl.videoWidth <= 0 || videoEl.videoHeight <= 0) {
        return null;
    }

    faceReferenceCanvas.width = videoEl.videoWidth;
    faceReferenceCanvas.height = videoEl.videoHeight;
    faceReferenceContext.drawImage(videoEl, 0, 0, faceReferenceCanvas.width, faceReferenceCanvas.height);
    return faceReferenceContext.getImageData(0, 0, faceReferenceCanvas.width, faceReferenceCanvas.height);
}

function loadFaceReference() {
    try {
        const raw = localStorage.getItem(getFaceReferenceKey());
        return raw ? JSON.parse(raw) : null;
    } catch (err) {
        console.warn('Falha ao carregar referência facial salva:', err);
        return null;
    }
}

function setFaceStatus(el, message, type = 'info') {
    if (!el) return;
    el.textContent = message;
    el.className = `face-auth-status ${type}`;
}

async function ensureFaceApiReady() {
    if (faceApiState.ready) return;
    if (faceApiState.loading) return;
    faceApiState.loading = true;
    try {
        if (!window.FaceFallback) {
            throw new Error('Fallback facial não carregou corretamente.');
        }
        faceApiState.ready = true;
        faceApiState.error = null;
    } catch (err) {
        faceApiState.error = err.message || 'Erro ao carregar fallback facial.';
        throw new Error('Não foi possível preparar o reconhecimento facial local.');
    } finally {
        faceApiState.loading = false;
    }
}

async function startFaceCamera(videoEl) {
    if (!videoEl) throw new Error('Vídeo de câmera não encontrado.');
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Este navegador não suporta acesso à câmera.');
    }
    if (faceAuthStream) {
        faceAuthStream.getTracks().forEach(track => track.stop());
    }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        faceAuthStream = stream;
        videoEl.srcObject = stream;
        await videoEl.play();
        return stream;
    } catch (err) {
        if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
            throw new Error('A câmera foi bloqueada. Permita o acesso à câmera no navegador.');
        }
        if (err.name === 'NotFoundError') {
            throw new Error('Nenhuma câmera foi encontrada neste dispositivo.');
        }
        throw new Error(`Falha ao abrir a câmera: ${err.message || err.name || 'erro desconhecido'}`);
    }
}

function stopFaceCamera() {
    if (faceAuthStream) {
        faceAuthStream.getTracks().forEach(track => track.stop());
        faceAuthStream = null;
    }
}

async function captureFaceDescriptor(videoEl) {
    if (!videoEl || videoEl.readyState < 2) {
        throw new Error('A câmera ainda não está pronta. Tente novamente.');
    }

    const imageData = drawFacePreview(videoEl);
    if (!imageData) {
        throw new Error('Não foi possível capturar uma imagem da câmera.');
    }

    const descriptor = window.FaceFallback.createFaceDescriptorFromImageData(imageData, imageData.width, imageData.height);
    if (!descriptor || descriptor.length === 0) {
        throw new Error('Nenhum rosto foi detectado na câmera. Posicione o rosto bem na frente da câmera.');
    }

    return descriptor;
}

async function registerFaceFromCamera(videoEl, label) {
    await ensureFaceApiReady();
    await startFaceCamera(videoEl);
    const descriptor = await captureFaceDescriptor(videoEl);
    return saveFaceReference(label, descriptor);
}

async function verifyFaceFromCamera(videoEl, label) {
    await ensureFaceApiReady();
    await startFaceCamera(videoEl);
    const reference = loadFaceReference();
    if (!reference) throw new Error('Nenhum rosto foi registrado ainda. Clique em “Registrar rosto” primeiro.');

    const descriptor = await captureFaceDescriptor(videoEl);
    const referenceDescriptor = new Float32Array(reference.descriptor || []);
    const similarity = window.FaceFallback.compareFaceDescriptors(referenceDescriptor, descriptor);
    const ok = similarity >= 0.82 && reference.label === label;

    return { ok, distance: 1 - similarity, label: reference.label, similarity };
}

async function stepAuth(salaId, data, hi, hf) {
    content.innerHTML = `
        <div class="modal-header">
            <h3>Autenticação</h3>
            <button class="btn-close" onclick="closeM(); stopFaceCamera()"><i class="fas fa-times"></i></button>
        </div>
        <p class="modal-sub">Escolha um método para validar sua identidade</p>
        <label class="field-label">Nome do Professor</label>
        <select class="input-field" id="nomeProfSelect">
            <option value="">Selecione um professor</option>
            ${professores.map(p=>`<option value="${p}">${p}</option>`).join('')}
        </select>
        <div class="auth-container">
            <div class="auth-box" id="auth-digital">
                <i class="fas fa-fingerprint"></i><small>Digital</small>
            </div>
            <div class="auth-box selected" id="auth-facial">
                <i class="fas fa-user-circle"></i><small>Facial</small>
            </div>
            <div class="auth-box" id="auth-card">
                <i class="fas fa-id-card"></i><small>Crachá</small>
            </div>
        </div>
        <div class="face-auth-panel" id="faceAuthPanel">
            <div class="face-video-wrap">
                <video id="faceVideo" autoplay muted class="face-video"></video>
            </div>
            <div class="face-auth-actions">
                <button class="btn-black" id="btnRegisterFace"><i class="fas fa-camera"></i> Registrar rosto</button>
                <button class="btn-secondary" id="btnVerifyFace"><i class="fas fa-check-circle"></i> Verificar rosto</button>
            </div>
            <div class="face-auth-status info" id="faceStatus">A câmera será iniciada quando você clicar em registrar ou verificar.</div>
        </div>
        <div class="auth-credential-panel" id="cardAuthPanel" style="display:none">
            <label class="field-label" for="cardCodeInput">Código do Crachá</label>
            <input type="text" class="input-field" id="cardCodeInput" placeholder="Ex: RFID-123456">
        </div>
        <div class="auth-credential-panel" id="fingerprintAuthPanel" style="display:none">
            <label class="field-label" for="fingerprintCodeInput">Código da Digital</label>
            <input type="text" class="input-field" id="fingerprintCodeInput" placeholder="Ex: FP-98765">
            <div class="fingerprint-read-status info" id="fingerprintReadStatus">Digital ainda não foi lida.</div>
        </div>
        <button class="btn-black" id="btnFinalizar"><i class="fas fa-shield-alt"></i> Confirmar Identidade</button>
        <button class="btn-outline" onclick="stopFaceCamera(); stepCalendar('${salaId}')">Voltar</button>
    `;

    const fingerprintInput = content.querySelector('#fingerprintCodeInput');
    const fingerprintStatus = content.querySelector('#fingerprintReadStatus');

    const updateFingerprintStatus = () => {
        if (!fingerprintInput || !fingerprintStatus) return;
        const hasValue = fingerprintInput.value.trim().length > 0;
        fingerprintStatus.textContent = hasValue ? 'Digital lida com sucesso.' : 'Digital ainda não foi lida.';
        fingerprintStatus.className = `fingerprint-read-status ${hasValue ? 'success' : 'info'}`;
    };

    if (fingerprintInput) {
        fingerprintInput.addEventListener('input', updateFingerprintStatus);
        updateFingerprintStatus();
    }

    content.querySelectorAll('.auth-box').forEach(box => {
        box.onclick = () => {
            content.querySelectorAll('.auth-box').forEach(b => b.classList.remove('selected'));
            box.classList.add('selected');
            content.querySelector('#faceAuthPanel').style.display = box.id === 'auth-facial' ? 'block' : 'none';
            content.querySelector('#cardAuthPanel').style.display = box.id === 'auth-card' ? 'block' : 'none';
            const isFingerprint = box.id === 'auth-digital';
            content.querySelector('#fingerprintAuthPanel').style.display = isFingerprint ? 'block' : 'none';
            if (fingerprintStatus) {
                fingerprintStatus.style.display = isFingerprint ? 'block' : 'none';
            }
            updateFingerprintStatus();
        };
    });

    const faceVideo = content.querySelector('#faceVideo');
    const faceStatus = content.querySelector('#faceStatus');
    const registerBtn = content.querySelector('#btnRegisterFace');
    const verifyBtn = content.querySelector('#btnVerifyFace');

    registerBtn.onclick = async () => {
        const sel = content.querySelector('#nomeProfSelect');
        const nome = sel.value.trim();
        if (!nome) { sel.classList.add('error'); setFaceStatus(faceStatus, 'Selecione o nome do professor antes de registrar o rosto.', 'error'); return; }
        try {
            setFaceStatus(faceStatus, 'Aguardando câmera e detectando rosto...', 'info');
            const ref = await registerFaceFromCamera(faceVideo, nome);
            setFaceStatus(faceStatus, `Rosto registrado para ${ref.label}.`, 'success');
        } catch (err) {
            setFaceStatus(faceStatus, err.message || 'Falha no registro facial.', 'error');
        }
    };

    verifyBtn.onclick = async () => {
        const sel = content.querySelector('#nomeProfSelect');
        const nome = sel.value.trim();
        if (!nome) { sel.classList.add('error'); setFaceStatus(faceStatus, 'Selecione o nome do professor antes de verificar o rosto.', 'error'); return; }
        try {
            setFaceStatus(faceStatus, 'Verificando rosto com a câmera...', 'info');
            const result = await verifyFaceFromCamera(faceVideo, nome);
            if (result.ok) {
                setFaceStatus(faceStatus, `Rosto confirmado para ${nome}.`, 'success');
            } else {
                setFaceStatus(faceStatus, `Rosto não corresponde ao perfil salvo.`, 'error');
            }
        } catch (err) {
            setFaceStatus(faceStatus, err.message || 'Falha na verificação facial.', 'error');
        }
    };

    document.getElementById('btnFinalizar').onclick = async () => {
        const sel = document.getElementById('nomeProfSelect');
        const nome = sel.value.trim();
        const cardCode = document.getElementById('cardCodeInput').value.trim();
        const fingerprintCode = document.getElementById('fingerprintCodeInput').value.trim();
        if (!nome) { sel.classList.add('error'); return; }

        const selectedAuthBox = content.querySelector('.auth-box.selected');
        if (selectedAuthBox && selectedAuthBox.id === 'auth-facial') {
            try {
                setFaceStatus(faceStatus, 'Validando rosto antes de confirmar...', 'info');
                const result = await verifyFaceFromCamera(faceVideo, nome);
                if (!result.ok) {
                    setFaceStatus(faceStatus, 'Autenticação facial não foi confirmada.', 'error');
                    return;
                }
            } catch (err) {
                setFaceStatus(faceStatus, err.message || 'Falha na autenticação facial.', 'error');
                return;
            }
        } else if (selectedAuthBox && selectedAuthBox.id === 'auth-card' && !cardCode) {
            alert('Informe o código do crachá para continuar.');
            return;
        } else if (selectedAuthBox && selectedAuthBox.id === 'auth-digital' && !fingerprintCode) {
            alert('Informe o código da digital para continuar.');
            return;
        }

        await registerUser(nome, cardCode, fingerprintCode);
        await finalizarReserva(salaId, nome, data, `${hi}–${hf}`, hi, hf);
    };
}

/* ─── Reserva: finalizar ────────────────────────────────────────────────── */
async function renderSolenoidUnlockScreen(sala, { mode = 'hardware', durationMs = 4000, reservationId = null } = {}) {
    const controller = getSolenoidController();
    controller.mode = mode;
    const labelMode = mode === 'hardware' ? 'Modo Hardware' : 'Modo Simulação';
    const labelState = mode === 'hardware' ? 'Módulo ativo' : 'Visual de teste';

    content.innerHTML = `
        <div class="solenoid-screen">
            <div class="solenoid-badges">
                <span class="solenoid-pill active"><i class="fas fa-key"></i> ${labelMode}</span>
                <span class="solenoid-pill"><i class="fas fa-door-open"></i> ${labelState}</span>
            </div>
            <div class="solenoid-visual unlocking" id="solenoidVisual">
                <div class="solenoid-lock">
                    <div class="solenoid-core"></div>
                </div>
                <div class="solenoid-led" id="solenoidLed"></div>
            </div>
            <div class="solenoid-title">Chave liberada</div>
            <p class="solenoid-sub">A sala <strong>${sala.nome}</strong> foi reservada e o solenoide foi ativado visualmente para liberar a chave.</p>
            <div class="solenoid-panel">
                <div class="solenoid-row"><span class="lbl">Sala</span><span class="val">${sala.nome}</span></div>
                <div class="solenoid-row"><span class="lbl">Professor</span><span class="val">${sala.professor || '—'}</span></div>
                <div class="solenoid-row"><span class="lbl">Reserva</span><span class="val">${reservationId || sala.reservaId || '—'}</span></div>
                <div class="solenoid-row"><span class="lbl">Horário</span><span class="val">${sala.horario || '—'}</span></div>
            </div>
            <div class="solenoid-log" id="solenoidLog">
                <div>Iniciando sequência de desbloqueio...</div>
            </div>
            <div class="solenoid-actions">
                <button class="btn-secondary" onclick="renderSolenoidUnlockScreen(getSala('${sala.id}'), { mode: 'simulacao', reservationId: '${reservationId || sala.reservaId || ''}' })">
                    <i class="fas fa-play"></i> Simulação
                </button>
                <button class="btn-black small" onclick="renderSolenoidUnlockScreen(getSala('${sala.id}'), { mode: 'hardware', reservationId: '${reservationId || sala.reservaId || ''}' })">
                    <i class="fas fa-microchip"></i> Hardware
                </button>
            </div>
            <button class="btn-black" onclick="closeM(); sincronizarComBanco().then(() => renderAll())" style="margin-top:10px">
                <i class="fas fa-check"></i> Concluir
            </button>
        </div>
    `;

    const visual = content.querySelector('#solenoidVisual');
    const led = content.querySelector('#solenoidLed');
    const logBox = content.querySelector('#solenoidLog');

    const updateUI = ({ state, log }) => {
        visual.classList.remove('unlocking', 'unlocked', 'locked');
        visual.classList.add(state);
        const label = state === 'unlocked' ? 'Desbloqueado' : state === 'unlocking' ? 'Desbloqueando...' : 'Travado';
        const subtitle = state === 'unlocked'
            ? 'O solenoide está destrancado e a chave pode ser retirada.'
            : state === 'unlocking'
                ? 'A sequência de liberação está em andamento.'
                : 'O mecanismo foi travado.';
        const statusLine = content.querySelector('.solenoid-sub');
        if (statusLine) statusLine.innerHTML = `A sala <strong>${sala.nome}</strong> foi reservada e o solenoide está <strong>${label.toLowerCase()}</strong>.<br>${subtitle}`;
        if (led) {
            led.style.background = state === 'unlocked' ? '#22c55e' : state === 'unlocking' ? '#f59e0b' : '#ef4444';
        }
        if (logBox && log) {
            logBox.innerHTML = log.map(item => `<div>${item}</div>`).join('');
        }
    };

    controller.onStateChange = updateUI;
    controller.unlock({ roomName: sala.nome, durationMs, reason: 'reserva' }).catch(err => {
        console.warn('Falha ao executar solenoide:', err);
        controller.addLog('Falha na sequência do solenoide.');
    });
}

async function finalizarReserva(salaId, nomeProfessor, data, horario, startTime, endTime) {
    const sala = getSala(salaId);
    const novoId = randProfId();
    sala.status = 'reservada';
    sala.professor = nomeProfessor;
    sala.reservaId = novoId;
    sala.data = data;
    sala.horario = horario;
    sala.evento = null;

    try {
        const room = await apiPost('/api/reserve', {
            roomCode: sala.id,
            professor: nomeProfessor,
            date: data,
            startTime,
            endTime,
            reservaId: novoId
        });
        if (room) {
            sala.status = room.status || 'reservada';
            sala.professor = room.professor || nomeProfessor;
            sala.reservaId = room.reserva_id || novoId;
            sala.data = room.data_reserva ? formatDateFromSql(room.data_reserva) : data;
            sala.horario = room.horario_inicio && room.horario_fim
                ? `${room.horario_inicio.substring(0, 5)}–${room.horario_fim.substring(0, 5)}`
                : `${startTime}–${endTime}`;
        }
    } catch (error) {
        console.warn('Não foi possível salvar a reserva no backend:', error.message);
    }

    content.innerHTML = `
        <div class="solenoid-screen">
            <div class="solenoid-title">Reserva confirmada</div>
            <p class="solenoid-sub">A sala <strong>${sala.nome}</strong> foi reservada no banco e permanece aguardando ocupação manual para liberar a chave.</p>
            <div class="solenoid-panel">
                <div class="solenoid-row"><span class="lbl">Sala</span><span class="val">${sala.nome}</span></div>
                <div class="solenoid-row"><span class="lbl">Professor</span><span class="val">${sala.professor || '—'}</span></div>
                <div class="solenoid-row"><span class="lbl">Reserva</span><span class="val">${sala.reservaId || '—'}</span></div>
                <div class="solenoid-row"><span class="lbl">Horário</span><span class="val">${sala.horario || '—'}</span></div>
            </div>
            <button class="btn-black" onclick="closeM(); sincronizarComBanco().then(() => renderAll())">
                <i class="fas fa-check"></i> Concluir
            </button>
        </div>
    `;
}

async function confirmarOcupacaoAutenticada(salaId) {
    const sala = getSala(salaId);
    if (!sala) return;

    sala.status = 'ocupada';
    sala.evento = null;

    const controller = getSolenoidController();
    controller.mode = 'simulacao';
    renderSolenoidUnlockScreen(sala, { mode: 'simulacao', reservationId: sala.reservaId, reason: 'ocupacao' });

    try {
        await apiPost('/api/force-occupy', {
            roomCode: sala.id,
            professor: sala.professor || 'Professor',
            cardCode: 'SIMULACAO',
            date: sala.data || '',
            startTime: sala.horario ? sala.horario.split('–')[0].trim() : null,
            endTime: sala.horario ? sala.horario.split('–')[1].trim() : null
        });
    } catch (error) {
        console.warn('Falha ao persistir ocupação manual no backend:', error.message);
    }
}

async function ocuparSalaReservada(salaId) {
    const sala = getSala(salaId);
    if (!sala) return;

    content.innerHTML = `
        <div class="modal-header">
            <div>
                <h3>Validar ocupação</h3>
                <p class="modal-sub">A ocupação só prossegue após uma validação válida.</p>
            </div>
            <button class="btn-close" onclick="closeM(); stopFaceCamera()"><i class="fas fa-times"></i></button>
        </div>
        <label class="field-label">Nome do Professor</label>
        <input type="text" class="input-field" id="nomeProfOcupacao" value="${sala.professor || ''}" placeholder="Nome do professor">
        <div class="auth-container">
            <div class="auth-box" id="auth-digital-ocupar">
                <i class="fas fa-fingerprint"></i><small>Digital</small>
            </div>
            <div class="auth-box selected" id="auth-facial-ocupar">
                <i class="fas fa-user-circle"></i><small>Facial</small>
            </div>
            <div class="auth-box" id="auth-card-ocupar">
                <i class="fas fa-id-card"></i><small>Crachá</small>
            </div>
        </div>
        <div class="face-auth-panel" id="faceAuthPanelOcupar">
            <div class="face-video-wrap">
                <video id="faceVideoOcupar" autoplay muted class="face-video"></video>
            </div>
            <div class="face-auth-actions">
                <button class="btn-black" id="btnVerifyFaceOcupar"><i class="fas fa-check-circle"></i> Verificar rosto</button>
            </div>
            <div class="face-auth-status info" id="faceStatusOcupar">A câmera será iniciada quando você clicar em verificar.</div>
        </div>
        <div class="auth-credential-panel" id="cardAuthPanelOcupar" style="display:none">
            <label class="field-label" for="cardCodeOcupar">Código do Crachá</label>
            <input type="text" class="input-field" id="cardCodeOcupar" placeholder="Ex: RFID-123456">
        </div>
        <div class="auth-credential-panel" id="fingerprintAuthPanelOcupar" style="display:none">
            <label class="field-label" for="fingerprintCodeOcupar">Código da Digital</label>
            <input type="text" class="input-field" id="fingerprintCodeOcupar" placeholder="Ex: FP-98765">
        </div>
        <button class="btn-black" id="btnConfirmarOcupacao"><i class="fas fa-door-open"></i> Confirmar ocupação</button>
        <button class="btn-outline" onclick="stopFaceCamera(); closeM()">Cancelar</button>
    `;

    const facePanel = content.querySelector('#faceAuthPanelOcupar');
    const faceStatus = content.querySelector('#faceStatusOcupar');
    const faceVideo = content.querySelector('#faceVideoOcupar');

    content.querySelectorAll('.auth-box').forEach(box => {
        box.onclick = () => {
            content.querySelectorAll('.auth-box').forEach(b => b.classList.remove('selected'));
            box.classList.add('selected');
            facePanel.style.display = box.id === 'auth-facial-ocupar' ? 'block' : 'none';
            content.querySelector('#cardAuthPanelOcupar').style.display = box.id === 'auth-card-ocupar' ? 'block' : 'none';
            content.querySelector('#fingerprintAuthPanelOcupar').style.display = box.id === 'auth-digital-ocupar' ? 'block' : 'none';
        };
    });

    content.querySelector('#btnVerifyFaceOcupar').onclick = async () => {
        const nome = (content.querySelector('#nomeProfOcupacao').value || '').trim() || sala.professor || 'Professor';
        if (!nome) {
            setFaceStatus(faceStatus, 'Informe o nome do professor antes de verificar o rosto.', 'error');
            return;
        }
        try {
            setFaceStatus(faceStatus, 'Verificando rosto com a câmera...', 'info');
            const result = await verifyFaceFromCamera(faceVideo, nome);
            if (result.ok) {
                setFaceStatus(faceStatus, `Rosto confirmado para ${nome}.`, 'success');
            } else {
                setFaceStatus(faceStatus, 'Rosto não corresponde ao perfil salvo.', 'error');
            }
        } catch (err) {
            setFaceStatus(faceStatus, err.message || 'Falha na verificação facial.', 'error');
        }
    };

    content.querySelector('#btnConfirmarOcupacao').onclick = async () => {
        const selectedBox = content.querySelector('.auth-box.selected');
        const cardCode = (content.querySelector('#cardCodeOcupar').value || '').trim();
        const fingerprintCode = (content.querySelector('#fingerprintCodeOcupar').value || '').trim();

        if (!selectedBox) {
            setFaceStatus(faceStatus, 'Escolha um método de validação.', 'error');
            return;
        }

        if (selectedBox.id === 'auth-facial-ocupar') {
            try {
                setFaceStatus(faceStatus, 'Validando rosto antes de ocupar...', 'info');
                const nome = (content.querySelector('#nomeProfOcupacao').value || '').trim() || sala.professor || 'Professor';
                const result = await verifyFaceFromCamera(faceVideo, nome);
                if (!result.ok) {
                    setFaceStatus(faceStatus, 'Autenticação facial não foi confirmada.', 'error');
                    return;
                }
            } catch (err) {
                setFaceStatus(faceStatus, err.message || 'Falha na autenticação facial.', 'error');
                return;
            }
        } else if (selectedBox.id === 'auth-card-ocupar') {
            if (!cardCode) {
                setFaceStatus(faceStatus, 'Informe o código do crachá para continuar.', 'error');
                return;
            }
        } else if (selectedBox.id === 'auth-digital-ocupar') {
            if (!fingerprintCode) {
                setFaceStatus(faceStatus, 'Informe o código da digital para continuar.', 'error');
                return;
            }
        }

        await confirmarOcupacaoAutenticada(salaId);
    };
}

/* ═══════════════════════════════════════════════════════════════════════════
   CONFIGURAÇÕES — MODAL DO GESTOR
═══════════════════════════════════════════════════════════════════════════ */
const cfgOverlay = document.getElementById('configOverlay');
const cfgContent = document.getElementById('configContent');
let adminTab = 'reservas';

function openConfig() {
    if (isAdmin) renderAdminPanel();
    else         renderConfigLogin();
    cfgOverlay.style.display = 'flex';
}
function closeConfig() { cfgOverlay.style.display = 'none'; }
cfgOverlay.addEventListener('click', e => { if (e.target === cfgOverlay) closeConfig(); });

/* ─── Tela de login ─────────────────────────────────────────────────────── */
function renderConfigLogin() {
    // use a compact variant for the simple login screen
    cfgContent.className = 'modal-card config-modal config-modal--compact';
    cfgContent.innerHTML = `
        <div class="modal-header">
            <div>
                <div class="config-icon-wrap"><i class="fas fa-shield-alt"></i></div>
                <h3>Configurações</h3>
                <p class="modal-sub" style="margin-bottom:0">Acesso ao modo administrador</p>
            </div>
            <button class="btn-close" onclick="closeConfig()"><i class="fas fa-times"></i></button>
        </div>
        <div class="config-form">
            <label class="field-label" style="margin-top:20px">Senha de Administrador</label>
            <input type="password" class="input-field" id="senhaAdmin" placeholder="Digite a senha" autocomplete="off">
            <p class="hint-text">Dica: <code>admin123</code></p>
            <button class="btn-black" id="btnLoginAdmin">
                <i class="fas fa-shield-alt"></i> Entrar como Administrador
            </button>
        </div>
    `;

    const inp = cfgContent.querySelector('#senhaAdmin');
    inp.focus();

    cfgContent.querySelector('#btnLoginAdmin').onclick = () => {
        if (inp.value === ADMIN_SENHA) {
            isAdmin = true;
            document.getElementById('adminBadge').style.display = 'flex'; atualizarBotoesAdmin();
            document.getElementById('modoAtual').textContent = '🔒 Modo Administrador ativo';
            renderAdminPanel();
        } else {
            inp.classList.add('error');
            inp.value = '';
            inp.placeholder = 'Senha incorreta!';
            inp.focus();
        }
    };

    inp.addEventListener('keydown', e => { if (e.key === 'Enter') cfgContent.querySelector('#btnLoginAdmin').click(); });
}

/* ─── Painel admin ──────────────────────────────────────────────────────── */
/* ─── Painel admin ──────────────────────────────────────────────────────── */
let adminGradeProfSel = '';

function renderAdminPanel(tab) {
    if (tab) adminTab = tab;
    const targetContent = isAdmin ? cfgContent : content;
    const targetOverlay = isAdmin ? cfgOverlay : overlay;
    targetContent.className = isAdmin ? 'modal-card config-modal' : 'modal-card';

    const reservadas = todasSalas.filter(s => s.status === 'reservada' || s.status === 'ocupada');
    const eventos    = todasSalas.filter(s => s.status === 'evento');

    let listaHTML = '';

    if (adminTab === 'reservas') {
        listaHTML = !reservadas.length
            ? `<div class="empty-state"><i class="fas fa-calendar-times"></i><p>Nenhuma reserva ativa.</p></div>`
            : reservadas.map(s => `
                <div class="admin-card">
                    <div class="admin-card-info">
                        <h4>${s.nome} <span class="status-badge ${s.status==='ocupada'?'badge-ocupada':'badge-reservada'}" style="font-size:10px">${traduzStatus(s.status)}</span></h4>
                        <p><i class="fas fa-user" style="margin-right:4px;font-size:10px"></i>${s.professor} · ${s.data} · ${s.horario}</p>
                        <p style="margin-top:2px;font-size:11px;color:#9ca3af">${s.reservaId}</p>
                    </div>
                    <div class="admin-card-actions">
                        <button class="btn-sm danger" onclick="adminRemoverReserva('${s.id}',true)"><i class="fas fa-trash"></i></button>
                
                    </div>
                </div>`).join('');

    } else if (adminTab === 'eventos') {
        listaHTML = !eventos.length
            ? `<div class="empty-state"><i class="fas fa-star"></i><p>Nenhum evento cadastrado.</p></div>`
            : eventos.map(s => `
                <div class="admin-card">
                    <div class="admin-card-info">
                        <h4>${s.nome} <span class="status-badge badge-evento" style="font-size:10px">Evento</span></h4>
                        <p><i class="fas fa-user" style="margin-right:4px;font-size:10px"></i>${s.professor} · ${s.data} · ${s.horario}</p>
                        <p class="ev-tag"><i class="fas fa-star" style="margin-right:4px;font-size:10px"></i>${s.evento}</p>
                    </div>
                    <div class="admin-card-actions">
                        <button class="btn-sm danger" onclick="adminRemoverReserva('${s.id}',true)"><i class="fas fa-trash"></i></button>
                    </div>
                </div>`).join('');

    } else if (adminTab === 'salas') {
        listaHTML = todasSalas.map(s => `
            <div class="admin-card">
                <div class="admin-card-info">
                    <h4>${s.nome}</h4>
                    <p>${blocoDisplay(s.bloco)} · <strong>${traduzStatus(s.status)}</strong></p>
                </div>
                <div class="admin-card-actions">
                    ${s.status !== 'livre'  ? `<button class="btn-sm danger"  onclick="adminRemoverReserva('${s.id}',true)"><i class="fas fa-trash"></i></button>` : ''}
                    ${s.status !== 'evento' ? `<button class="btn-sm primary" onclick="closeConfig();adminAdicionarEvento('${s.id}')">Evento</button>` : ''}
                </div>
            </div>`).join('');

    } else if (adminTab === 'grade') {
        listaHTML = renderAdminGradeHTML();
    }

    cfgContent.innerHTML = `
        <div class="modal-header" style="margin-bottom:14px">
            <div>
                <h3>Painel do Administrador</h3>
                <p class="modal-sub" style="margin-bottom:0">Gerencie reservas, eventos e grades horárias</p>
            </div>
            <button class="btn-close" onclick="closeConfig()"><i class="fas fa-times"></i></button>
        </div>

        <div class="config-form">
            <div class="admin-tabs">
            <button class="tab-btn ${adminTab==='reservas'?'active':''}" onclick="renderAdminPanel('reservas')">
                <i class="fas fa-calendar-check"></i> Reservas (${reservadas.length})
            </button>
            <button class="tab-btn ${adminTab==='eventos'?'active':''}" onclick="renderAdminPanel('eventos')">
                <i class="fas fa-star"></i> Eventos (${eventos.length})
            </button>
            <button class="tab-btn ${adminTab==='salas'?'active':''}" onclick="renderAdminPanel('salas')">
                <i class="fas fa-door-open"></i> Salas
            </button>
            <button class="tab-btn ${adminTab==='grade'?'active':''}" onclick="renderAdminPanel('grade')">
                <i class="fas fa-table"></i> Grade
            </button>
        </div>

            <div class="admin-list" id="adminListContent">${listaHTML}</div>

            <button class="btn-logout" onclick="adminLogout()">
                <i class="fas fa-sign-out-alt" style="margin-right:6px"></i> Sair do modo administrador
            </button>
        </div>
    `;

    if (adminTab === 'grade') reativarSelectGrade();
}

/* ─── Renderiza o HTML da aba Grade dentro do painel admin ─────────────── */
function renderAdminGradeHTML() {
    const prof = adminGradeProfSel;
    const aulas = prof ? (gradeSemanal[prof] || []) : [];

    const profOptions = professores.map(p =>
        `<option value="${p}" ${gradeFiltroProfessor === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    const statsBar = prof ? `
        <div class="ag-stats-bar">
            <span><i class="fas fa-book"></i> ${aulas.length} aula(s)/semana</span>
            <span><i class="fas fa-door-open"></i> ${[...new Set(aulas.map(a=>a.sala))].length} sala(s)</span>
            <span><i class="fas fa-users"></i> ${[...new Set(aulas.map(a=>a.turma))].length} turma(s)</span>
        </div>` : '';

    let tabelaHTML = '';
    if (prof) {
        const g = Array.from({length: FAIXAS_HORARIO.length}, () => Array(5).fill(null));
        // store the original aula object so we keep id and other fields
        aulas.forEach(a => { g[a.faixa][a.dia] = a; });

        const cabDias = DIAS_SEMANA.map(d => `<th class="ag-th-dia">${d}</th>`).join('');

        const linhas = FAIXAS_HORARIO.map((faixa, fi) => {
            const cols = g[fi].map((aula, di) => {
                if (!aula) {
                    return `<td class="ag-cell vazia" ondragover="event.preventDefault()" ondrop="handleGradeDrop(event, ${fi}, ${di})">
                        <button class="ag-btn-add" title="Adicionar aula"
                            onclick="adminAdicionarAula('${prof}',${fi},${di})">
                            <i class="fas fa-plus"></i>
                        </button>
                    </td>`;
                }
                const t = getTurma(aula.turma);
                const nomeTurma = t ? t.nome : aula.turma;
                const nomeSala  = NOMES_SALA_SENAI[aula.sala] || aula.sala;
                return `<td class="ag-cell preenchida" ondragover="event.preventDefault()" ondrop="handleGradeDrop(event, ${fi}, ${di})">
                    <div class="ag-bloco" draggable="true" 
                        ondragstart="startGradeDrag(event, '${prof.replace(/'/g,"\\'")}', ${fi}, ${di}, '${(aula.sala||'').toString().replace(/'/g,"\\'")}', '${(aula.turma||'').toString().replace(/'/g,"\\'")}', '${String(aula.id||'').replace(/'/g,"\\'")}')">
                        <span class="ag-bloco-turma">${nomeTurma}</span>
                        <span class="ag-bloco-sala">${nomeSala}</span>
                        <button class="ag-btn-del" title="Remover aula"
                            onclick="adminRemoverAula('${prof}',${fi},${di})">
                            <i class="fas fa-times"></i>
                        </button>
                    </div>
                </td>`;
            }).join('');
            return `<tr>
                <td class="ag-hora">${faixa.label}</td>
                ${cols}
            </tr>`;
        }).join('');

        tabelaHTML = `
            <div class="ag-table-scroll">
                <table class="ag-edit-table">
                    <thead><tr><th class="ag-th-hora">Horário</th>${cabDias}</tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>`;
    }

    return `
        <div class="ag-edit-wrap">
            <div class="ag-edit-top">
                <div class="ag-edit-selector">
                    <i class="fas fa-chalkboard-teacher ag-edit-icon"></i>
                    <div>
                        <label class="field-label" style="margin-top:0">Professor</label>
                        <select class="input-field" id="adminGradeProfSel" style="margin-top:4px">
                            <option value="">— Selecione um professor —</option>
                            ${profOptions}
                        </select>
                    </div>
                </div>
                ${prof ? `<button class="btn-sm primary" onclick="adminAdicionarAulaLivre('${prof}')">
                    <i class="fas fa-plus"></i> Nova aula
                </button>` : ''}
            </div>
            ${statsBar}
            ${prof
                ? tabelaHTML
                : `<div class="empty-state" style="padding:36px 20px">
                    <i class="fas fa-table" style="font-size:32px;opacity:.3;display:block;margin-bottom:12px"></i>
                    <p>Selecione um professor para ver e editar a sua grade semanal.</p>
                   </div>`
            }
        </div>`;
}

/* ─── Remover uma aula da grade ─────────────────────────────────────────── */
function adminRemoverAula(prof, faixa, dia) {
    if (!confirm(`Remover esta aula de ${DIAS_SEMANA[dia]} – ${FAIXAS_HORARIO[faixa].label}?`)) return;
    if (!gradeSemanal[prof]) return;
    gradeSemanal[prof] = gradeSemanal[prof].filter(a => !(a.faixa === faixa && a.dia === dia));
    adminGradeProfSel = prof;
    document.getElementById('adminListContent').innerHTML = renderAdminGradeHTML();
    reativarSelectGrade();
    if (document.getElementById('gpcProfSelect')) renderGradeProfessor(prof);
}

/* ─── Adicionar aula em célula específica ────────────────────────────────── */
function adminAdicionarAula(prof, faixa, dia) {
    const salaOptions  = CODIGOS_SENAI.map(c =>
        `<option value="${c}">${NOMES_SALA_SENAI[c]}</option>`).join('');
    const turmaOptions = turmas.map(t =>
        `<option value="${t.id}">${t.nome} — ${t.curso}</option>`).join('');

    cfgContent.innerHTML = `
        <div class="modal-header" style="margin-bottom:16px">
            <div>
                <h3>Adicionar Aula</h3>
                <p class="modal-sub" style="margin-bottom:0">
                    <i class="fas fa-user" style="margin-right:4px"></i>${prof} &nbsp;·&nbsp;
                    <i class="fas fa-calendar-day" style="margin-right:4px"></i>${DIAS_SEMANA[dia]} &nbsp;·&nbsp;
                    <i class="fas fa-clock" style="margin-right:4px"></i>${FAIXAS_HORARIO[faixa].label}
                </p>
            </div>
            <button class="btn-close" onclick="renderAdminPanel('grade')"><i class="fas fa-times"></i></button>
        </div>
        <label class="field-label">Sala</label>
        <select class="input-field" id="novaAulaSala">${salaOptions}</select>
        <label class="field-label">Turma / Curso</label>
        <select class="input-field" id="novaAulaTurma">${turmaOptions}</select>
        <div class="modal-actions" style="margin-top:20px">
            <button class="btn-secondary" onclick="renderAdminPanel('grade')">Cancelar</button>
            <button class="btn-black" style="flex:1;margin-top:0"
                onclick="adminSalvarAula('${prof}',${faixa},${dia})">
                <i class="fas fa-check"></i> Salvar Aula
            </button>
        </div>`;
}

/* ─── Botão "Nova aula" — abre formulário completo ───────────────────────── */
function adminAdicionarAulaLivre(prof) {
    const diaOptions   = DIAS_SEMANA.map((d,i)  => `<option value="${i}">${d}</option>`).join('');
    const faixaOptions = FAIXAS_HORARIO.map((f,i)=> `<option value="${i}">${f.label}</option>`).join('');
    const salaOptions  = CODIGOS_SENAI.map(c =>
        `<option value="${c}">${NOMES_SALA_SENAI[c]}</option>`).join('');
    const turmaOptions = turmas.map(t =>
        `<option value="${t.id}">${t.nome} — ${t.curso}</option>`).join('');

    cfgContent.innerHTML = `
        <div class="modal-header" style="margin-bottom:16px">
            <div>
                <h3>Nova Aula</h3>
                <p class="modal-sub" style="margin-bottom:0">
                    <i class="fas fa-user" style="margin-right:4px"></i>${prof}
                </p>
            </div>
            <button class="btn-close" onclick="renderAdminPanel('grade')"><i class="fas fa-times"></i></button>
        </div>
        <label class="field-label">Dia da Semana</label>
        <select class="input-field" id="novaAulaDia">${diaOptions}</select>
        <label class="field-label">Faixa Horária</label>
        <select class="input-field" id="novaAulaFaixa">${faixaOptions}</select>
        <label class="field-label">Sala</label>
        <select class="input-field" id="novaAulaSala">${salaOptions}</select>
        <label class="field-label">Turma / Curso</label>
        <select class="input-field" id="novaAulaTurma">${turmaOptions}</select>
        <div class="modal-actions" style="margin-top:20px">
            <button class="btn-secondary" onclick="renderAdminPanel('grade')">Cancelar</button>
            <button class="btn-black" style="flex:1;margin-top:0"
                onclick="adminSalvarAulaLivre('${prof}')">
                <i class="fas fa-check"></i> Salvar Aula
            </button>
        </div>`;
}

/* ─── Persistir nova aula (célula específica) ─────────────────────────────── */
function adminSalvarAula(prof, faixa, dia) {
    const sala  = document.getElementById('novaAulaSala').value;
    const turma = document.getElementById('novaAulaTurma').value;
    if (!gradeSemanal[prof]) gradeSemanal[prof] = [];
    gradeSemanal[prof] = gradeSemanal[prof].filter(a => !(a.faixa === faixa && a.dia === dia));
    gradeSemanal[prof].push({ dia, faixa, sala, turma });
    adminGradeProfSel = prof;
    renderAdminPanel('grade');
    if (document.getElementById('gpcProfSelect')) renderGradeProfessor(prof);
}

/* ─── Persistir nova aula (formulário livre) ──────────────────────────────── */
function adminSalvarAulaLivre(prof) {
    const dia   = parseInt(document.getElementById('novaAulaDia').value);
    const faixa = parseInt(document.getElementById('novaAulaFaixa').value);
    const sala  = document.getElementById('novaAulaSala').value;
    const turma = document.getElementById('novaAulaTurma').value;
    if (!gradeSemanal[prof]) gradeSemanal[prof] = [];
    const jaExiste = gradeSemanal[prof].some(a => a.faixa === faixa && a.dia === dia);
    if (jaExiste) {
        if (!confirm(`Já existe uma aula no ${DIAS_SEMANA[dia]} às ${FAIXAS_HORARIO[faixa].label}. Deseja substituir?`)) return;
        gradeSemanal[prof] = gradeSemanal[prof].filter(a => !(a.faixa === faixa && a.dia === dia));
    }
    gradeSemanal[prof].push({ dia, faixa, sala, turma });
    adminGradeProfSel = prof;
    renderAdminPanel('grade');
    if (document.getElementById('gpcProfSelect')) renderGradeProfessor(prof);
}

/* ─── Reativa o listener do select após re-render in-place ───────────────── */
function reativarSelectGrade() {
    const sel = document.getElementById('adminGradeProfSel');
    if (!sel) return;
    sel.value = adminGradeProfSel;
    sel.addEventListener('change', () => {
        adminGradeProfSel = sel.value;
        document.getElementById('adminListContent').innerHTML = renderAdminGradeHTML();
        reativarSelectGrade();
    });
}


async function adminRemoverReserva(salaId, noPanel) {
    const sala = getSala(salaId);
    if (!sala) return;
    if (!confirm(`Remover reserva da ${sala.nome}?`)) return;

    try {
        await apiPost('/api/release', { roomCode: salaId });
        await sincronizarComBanco();
        renderAll();
        if (noPanel) renderAdminPanel();
        else closeM();
    } catch (error) {
        alert('Falha ao remover reserva: ' + (error.message || 'Erro de comunicação com o servidor'));
    }
}

function adminAdicionarEvento(salaId) {
    // Abre no modal principal (fora do config)
    closeConfig();
    const sala = getSala(salaId);
    if (!sala) return;

    content.innerHTML = `
        <div class="modal-header">
            <div>
                <h3>Adicionar Evento</h3>
                <p class="modal-sub">Marque esta sala com um evento importante</p>
            </div>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <label class="field-label">Sala</label>
        <input type="text" class="input-field" value="${sala.nome}" disabled>
        <label class="field-label">Descrição do Evento</label>
        <textarea class="input-field" id="eventoDesc" placeholder="Ex: Reunião de Departamento, Prova Final, etc."></textarea>
        <label class="field-label">Professor Responsável</label>
        <input type="text" class="input-field" id="eventoProf" placeholder="Nome do professor ou responsável">
        <label class="field-label">Data</label>
        <input type="text" class="input-field" id="eventoData" placeholder="DD/MM/AAAA" value="${rand(datas)}">
        <label class="field-label">Horário</label>
        <div class="time-row">
            <input type="time" class="input-field" id="evHi" value="08:00">
            <input type="time" class="input-field" id="evHf" value="10:00">
        </div>
        <div class="event-notice">
            A sala será marcada em <strong>laranja</strong> e ficará indisponível para reservas regulares.
        </div>
        <div class="modal-actions">
            <button class="btn-secondary" onclick="closeM()">Cancelar</button>
            <button class="btn-black" id="btnConfEvento" style="flex:1;margin-top:0">
                <i class="fas fa-star"></i> Adicionar Evento
            </button>
        </div>
    `;
    overlay.style.display = 'flex';

    document.getElementById('btnConfEvento').onclick = async () => {
        const desc = document.getElementById('eventoDesc').value.trim();
        const prof = document.getElementById('eventoProf').value.trim();
        const data = document.getElementById('eventoData').value.trim();
        const hi   = document.getElementById('evHi').value;
        const hf   = document.getElementById('evHf').value;

        if (!desc) { document.getElementById('eventoDesc').classList.add('error'); return; }
        if (!prof) { document.getElementById('eventoProf').classList.add('error'); return; }

        sala.status = 'evento';
        sala.evento = desc;
        sala.professor = prof;
        sala.reservaId = randProfId();
        sala.data = data || rand(datas);
        sala.horario = `${hi}–${hf}`;

        // Persistir no backend
        try {
            const res = await apiPost('/api/reserve', {
                roomCode: sala.id,
                professor: sala.professor,
                date: sala.data,
                startTime: hi,
                endTime: hf,
                reservaId: sala.reservaId,
                tipo: 'evento',
                evento: sala.evento
            });
            if (res) {
                sala.status = res.status || sala.status;
                sala.professor = res.professor || sala.professor;
                sala.reservaId = res.reserva_id || sala.reservaId;
                sala.data = res.data_reserva || sala.data;
                sala.horario = res.horario || sala.horario || `${hi}–${hf}`;
                sala.evento = res.evento || sala.evento;
            }
        } catch (err) {
            console.warn('Falha ao salvar evento no backend:', err.message || err);
        }

        renderAll();

        content.innerHTML = `
            <div class="success-icon">🌟</div>
            <p class="success-title">Evento Adicionado!</p>
            <p class="success-msg">${sala.nome} foi marcada como evento.</p>
            <div class="reserva-info" style="margin-top:12px">
                <div class="info-row"><span class="lbl">Sala</span><span class="val">${sala.nome}</span></div>
                <div class="info-row"><span class="lbl">Evento</span><span class="val">${desc}</span></div>
                <div class="info-row"><span class="lbl">Responsável</span><span class="val">${prof}</span></div>
                <div class="info-row"><span class="lbl">Horário</span><span class="val">${hi}–${hf}</span></div>
            </div>
            <button class="btn-black" onclick="closeM()"><i class="fas fa-check"></i> Concluir</button>
        `;
    };
}

function devolverChave(salaId) {
    const sala = getSala(salaId);
    if (!sala) return;
    sala.status = 'livre';
    sala.professor = null;
    sala.reservaId = null;
    sala.data = null;
    sala.horario = null;
    sala.evento = null;
    renderAll();
    closeM();
}

function solicitarMudanca(salaId) {
    const salaAtual = getSala(salaId);
    if (!salaAtual) return;

    const salasLivres = todasSalas.filter(s => s.status === 'livre' && s.id !== salaId);
    if (!salasLivres.length) {
        alert('Nenhuma sala disponível para mudança.');
        return;
    }

    content.innerHTML = `
        <div class="modal-header">
            <h3>Solicitar Mudança de Sala</h3>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <p class="modal-sub">Selecione a nova sala desejada. A sala atual permanecerá reservada.</p>
        <label class="field-label">Sala Atual</label>
        <input type="text" class="input-field" value="${salaAtual.nome}" disabled>
        <label class="field-label">Nova Sala</label>
        <select class="input-field" id="novaSalaSelect">
            ${salasLivres.map(s => `<option value="${s.id}">${s.nome}</option>`).join('')}
        </select>
        <button class="btn-black" onclick="confirmarMudanca('${salaId}')">
            <i class="fas fa-exchange-alt"></i> Confirmar Mudança
        </button>
        <button class="btn-outline" onclick="openModal('${salaId}')">Voltar</button>
    `;
}

async function confirmarMudanca(salaAtualId) {
    const novaSalaId = document.getElementById('novaSalaSelect').value;
    const salaAtual = getSala(salaAtualId);
    const novaSala = getSala(novaSalaId);
    if (!salaAtual || !novaSala) return;

    if (!salaAtual.data || !salaAtual.horario || !salaAtual.professor) {
        alert('Não foi possível solicitar mudança: dados da reserva original estão incompletos.');
        return;
    }

    const horarioParts = salaAtual.horario.split('–').map(s => s.trim());
    if (horarioParts.length !== 2) {
        alert('Horário inválido para a reserva atual.');
        return;
    }

    const [inicio, fim] = horarioParts;
    const reservaId = randProfId();

    try {
        await apiPost('/api/reserve', {
            roomCode: novaSalaId,
            professor: salaAtual.professor,
            date: salaAtual.data,
            startTime: `${inicio}:00`,
            endTime: `${fim}:00`,
            reservaId
        });

        await apiPost('/api/release', { roomCode: salaAtualId });
        await sincronizarComBanco();
        renderAll();

        content.innerHTML = `
            <div class="success-icon">🔄</div>
            <p class="success-title">Mudança Confirmada!</p>
            <p class="success-msg">A reserva foi transferida para a nova sala e a sala anterior foi liberada.</p>
            <div class="reserva-info" style="margin-top:12px">
                <div class="info-row"><span class="lbl">Sala Anterior</span><span class="val">${salaAtual.nome}</span></div>
                <div class="info-row"><span class="lbl">Nova Sala</span><span class="val">${novaSala.nome}</span></div>
            </div>
            <button class="btn-black" onclick="closeM()"><i class="fas fa-check"></i> Concluir</button>
        `;
    } catch (error) {
        alert('Falha ao solicitar mudança: ' + (error.message || 'Erro de comunicação com o servidor'));
    }
}

/* ═══════════════════════════════════════════════════════════════════════════
   SINCRONIZAÇÃO COM BACKEND (INIT)
═══════════════════════════════════════════════════════════════════════════ */
async function sincronizarComBanco() {
    try {
        console.log('🔄 Sincronizando dados do banco...');
        const rooms = await fetch('/api/rooms').then(r => r.json());
        if (!Array.isArray(rooms)) {
            throw new Error(rooms?.error || 'Resposta inválida ao carregar salas');
        }
        console.log('📦 Dados brutos do banco:', rooms.filter(r => r.status !== 'livre').slice(0, 3));
        
        if (rooms && rooms.length > 0) {
            // Quando o banco retorna salas, usamos o banco como fonte única
            const dbSalas = rooms.map(r => {
                const codigo = r.room_code || r.roomCode || r.codigo || r.room_code;
                const nome = r.nome || r.room_name || codigo;
                const { bloco: grupoBloco, andar: grupoAndar } = normalizarGrupoSala(codigo);
                const bloco = r.bloco || grupoBloco || (codigo ? String(codigo)[0] : '');
                const andar = grupoAndar;
                let data = null;
                if (r.data_reserva) {
                    let dataStr = r.data_reserva;
                    if (typeof dataStr === 'string' && dataStr.includes('T')) dataStr = dataStr.split('T')[0];
                    const partes = String(dataStr).split('-');
                    if (partes.length === 3) data = `${partes[2]}/${partes[1]}/${partes[0]}`;
                    else data = dataStr;
                }
                let horario = null;
                if (r.horario_inicio && r.horario_fim) {
                    const inicio = r.horario_inicio.substring(0,5);
                    const fim = r.horario_fim.substring(0,5);
                    horario = `${inicio}–${fim}`;
                } else if (r.horario) horario = r.horario;

                return {
                    id: codigo,
                    nome,
                    codigo,
                    bloco,
                    andar,
                    status: r.status || 'livre',
                    professor: r.professor || null,
                    reservaId: r.reserva_id || null,
                    data: data || null,
                    horario: horario || null,
                    evento: r.evento || null
                };
            });

            // Substitui a lista local pela do banco (fonte única)
            todasSalas = dbSalas;
            salasA = todasSalas.filter(s => s.andar === 1);
            salasB = todasSalas.filter(s => s.andar === 2);

            // Carrega grade semanal persistida no backend e popula `gradeSemanal`
            try {
                const gradeRows = await fetch('/api/grade').then(r => r.json());
                // Constrói map professor => lista de aulas
                const map = {};
                if (Array.isArray(gradeRows)) {
                    gradeRows.forEach(rw => {
                        if (!map[rw.professor]) map[rw.professor] = [];
                        map[rw.professor].push({ id: rw.id, dia: rw.dia, faixa: rw.faixa, sala: rw.sala_code, turma: rw.turma_id });
                    });
                } else {
                    console.warn('Resposta inesperada de /api/grade:', gradeRows);
                }
                // Se não houver dados no banco, mantemos a grade local existente
                if (Object.keys(map).length) {
                    gradeSemanal = map;
                }
            } catch (err) {
                console.warn('Falha ao carregar grade do backend:', err.message || err);
            }

            return;
        }

        // fallback: se não houver salas no banco, mantém/mistura com a lista local
        if (rooms && rooms.length > 0) {
            rooms.forEach(r => {
                // Tenta encontrar por código exato
                let sala = todasSalas.find(s => s.id === r.room_code);
                // Se não encontrou, tenta por nome parcial
                if (!sala && r.nome) {
                    sala = todasSalas.find(s => s.nome && s.nome.includes(r.nome));
                }
                // Se ainda não encontrou, tenta por código contido em nome/codigo
                if (!sala && r.room_code) {
                    sala = todasSalas.find(s => (s.codigo && s.codigo.includes(r.room_code)) || (s.nome && s.nome.includes(r.room_code)));
                }

                // Se não existir localmente, cria uma sala mínima baseada no registro do banco
                if (!sala) {
                    const codigo = r.room_code || r.roomCode || r.codigo || '';
                    const { bloco: grupoBloco, andar: grupoAndar } = normalizarGrupoSala(codigo);
                    const bloco = r.bloco || grupoBloco || (codigo ? String(codigo)[0] : '');
                    const andar = grupoAndar;
                    sala = {
                        id: r.room_code,
                        nome: r.nome || r.room_code,
                        codigo: r.room_code,
                        bloco: bloco || '',
                        andar: andar,
                        status: 'livre',
                        professor: null,
                        reservaId: null,
                        data: null,
                        horario: null,
                        evento: null
                    };
                    todasSalas.push(sala);
                }

                // Atualiza campos a partir do banco
                sala.status = r.status;
                sala.professor = r.professor;
                sala.reservaId = r.reserva_id || null;
                sala.data = r.data_reserva || r.data;
                sala.horario = (r.horario_inicio && r.horario_fim) ? `${r.horario_inicio}–${r.horario_fim}` : sala.horario;
                sala.evento = r.evento;
            });
        }
        console.log('✅ Sincronização completa');
    } catch (error) {
        console.error('❌ Erro ao sincronizar com banco:', error.message);
    }
}

async function verificarHorariosOcupados() {
    const agora = new Date();
    const horaAtual = String(agora.getHours()).padStart(2, '0') + ':' + String(agora.getMinutes()).padStart(2, '0');
    const dataAtualStr = `${String(agora.getDate()).padStart(2,'0')}/${String(agora.getMonth()+1).padStart(2,'0')}/${agora.getFullYear()}`;

    for (const sala of todasSalas) {
        if (sala.status === 'ocupada' && sala.data && sala.horario) {
            const [inicio, fim] = sala.horario.split('–').map(s => s.trim());
            const dataCoincide = sala.data === dataAtualStr;
            const horaAtualMinutos = parseInt(horaAtual.split(':')[0]) * 60 + parseInt(horaAtual.split(':')[1]);
            const fimMinutos = parseInt(fim.split(':')[0]) * 60 + parseInt(fim.split(':')[1]);
            if (dataCoincide && horaAtualMinutos >= fimMinutos) {
                try {
                    sala.status = 'livre';
                    sala.professor = null; sala.reservaId = null; sala.data = null; sala.horario = null;
                    renderAll();
                    const response = await fetch('/api/update-room-status', {
                        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ room_code: sala.id, status: 'livre' })
                    });
                    if (!response.ok) throw new Error(`HTTP ${response.status}`);
                } catch (err) {
                    console.error('Erro:', err.message);
                }
            }
        }
    }
}

// Atualiza dados e pinta a view atual sem forçar voltar ao Dashboard
async function refreshView() {
    await sincronizarComBanco();
    await verificarHorariosOcupados();
    if (document.getElementById('agendaWrap')) { renderAgenda(); return; }
    switch (currentView) {
        case 'dashboard':
            renderAll(); break;
        case 'bloco':
            if (lastBloco) renderBloco(lastBloco.bloco, lastBloco.inicio, lastBloco.fim);
            else renderAll();
            break;
        case 'gradeProfessor':
            renderGradeProfessor(); break;
        case 'historico':
            renderHistorico(); break;
        case 'agenda':
            renderAgenda(); break;
        default:
            renderAll(); break;
    }
}

// Verificar a cada 5 segundos
setInterval(() => { refreshView().catch(err => console.error(err)); }, 5000);

// Inicialização — respeita a view atual se a Agenda já estiver aberta
sincronizarComBanco().then(() => { if (document.getElementById('agendaWrap')) renderAgenda(); else renderAll(); });

/* ═══════════════════════════════════════════════════════════════════════════
   AGENDA — CALENDÁRIO MENSAL COM EVENTOS
═══════════════════════════════════════════════════════════════════════════ */

// Estado do calendário (inicializa com data atual)
const _now_init = new Date();
let agendaMes = _now_init.getMonth();
let agendaAno = _now_init.getFullYear();
let agendaDiaSel = _now_init.getDate();
let agendaHistoricoPagina = 1;
const AGENDA_HISTORICO_POR_PAGINA = 10;
let agendaMesInicializado = false;

// Converte "DD/MM/AAAA" → { d, m, y }
function parseData(str) {
    if (!str) return null;
    const [d, m, y] = str.split('/').map(Number);
    return { d, m: m - 1, y };
}

// Retorna salas com ocorrência no dia/mes/ano dado
function salasDoDia(d, m, y) {
    return todasSalas.filter(s => {
        const pd = parseData(s.data);
        return pd && pd.d === d && pd.m === m && pd.y === y;
    });
}

// Retorna objeto com dias que têm eventos: { "DD": [tipos...] }
function mapEventosMes(m, y) {
    const map = {};
    todasSalas.forEach(s => {
        const pd = parseData(s.data);
        if (pd && pd.m === m && pd.y === y) {
            if (!map[pd.d]) map[pd.d] = [];
            if (!map[pd.d].includes(s.status)) map[pd.d].push(s.status);
        }
    });
    return map;
}

const MESES = [
    'Janeiro','Fevereiro','Março','Abril','Maio','Junho',
    'Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'
];
const DOW = ['Dom','Seg','Ter','Qua','Qui','Sex','Sáb'];

function renderGradeHoraria(filtroProf, filtroSala) {
    gradeFiltroProfessor = filtroProf || '';
    gradeFilterSala = filtroSala || '';
    const salaOptions = CODIGOS_SENAI.map(c =>
        `<option value="${c}" ${gradeFilterSala === c ? 'selected' : ''}>${NOMES_SALA_SENAI[c] || c}</option>`
    ).join('');

    // ── Monta estrutura: grade[dia][faixa] = lista de aulas
    const grade = Array.from({length:5}, () => Array.from({length: FAIXAS_HORARIO.length}, () => []));

    Object.entries(gradeSemanal).forEach(([prof, aulas]) => {
        if (gradeFiltroProfessor && prof !== gradeFiltroProfessor) return;
        aulas.forEach(a => {
            if (gradeFilterSala && a.sala !== gradeFilterSala) return;
            const turmaObj = getTurma(a.turma);
            grade[a.dia][a.faixa].push({
                prof,
                sala: a.sala,
                salaDisplay: NOMES_SALA_SENAI[a.sala] || a.sala,
                turma: turmaObj ? turmaObj.nome : a.turma,
                curso: turmaObj ? turmaObj.curso : '',
            });
        });
    });

    const profOptions = professores.map(p =>
        `<option value="${p}" ${gradeFiltroProfessor === p ? 'selected' : ''}>${p}</option>`
    ).join('');

    // ── Renderiza a tabela
    const cabecalho = DIAS_SEMANA.map(d => `<th>${d}</th>`).join('');

    const linhas = FAIXAS_HORARIO.map((faixa, fi) => {
        const colunas = grade.map((dia, di) => {
            const aulas = dia[fi];
            if (!aulas.length) return `<td class="gh-cell vazia"><span class="gh-livre">—</span></td>`;
            const items = aulas.map(a => `
                <div class="gh-aula" draggable="${isAdmin}"
                    ondragstart="startGradeDrag(event, '${(a.prof||'').replace(/'/g,"\\'")}', ${fi}, ${di}, '${(a.sala||'').toString().replace(/'/g,"\\'")}', '${(a.turma||'').toString().replace(/'/g,"\\'")}', '${String(a.id||'').replace(/'/g,"\\'")}')">
                    <span class="gh-turma">${a.turma}</span>
                    <span class="gh-sala">${a.salaDisplay}</span>
                    ${!gradeFiltroProfessor ? `<span class="gh-prof">${(a.prof||'').replace('Prof. ','')}</span>` : ''}
                </div>
            `).join('');
            return `<td class="gh-cell ocupada">${items}</td>`;
        }).join('');
        return `
            <tr>
                <td class="gh-hora">${faixa.label}</td>
                ${colunas}
            </tr>`;
    }).join('');

    return `
        <div class="grade-section">
            <div class="grade-header">
                <div>
                    <h2><i class="fas fa-table" style="margin-right:8px;color:var(--main-purple)"></i>Grade Horária Semanal</h2>
                    <p class="grade-sub">Visualize a ocupação semanal por professor ou sala</p>
                </div>
            </div>
            <div class="grade-filtros">
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Professor</label>
                    <select class="input-field grade-select" id="gradeProfSel" onchange="renderGradeHoraria(this.value, document.getElementById('gradeSalaSel').value)">
                        <option value="">Todos os professores</option>
                        ${profOptions}
                    </select>
                </div>
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Sala</label>
                    <select class="input-field grade-select" id="gradeSalaSel" onchange="renderGradeHoraria(document.getElementById('gradeProfSel').value, this.value)">
                        <option value="">Todas as salas</option>
                        ${salaOptions}
                    </select>
                </div>
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Turma / Curso</label>
                    <select class="input-field grade-select" id="gradeTurmaSel" onchange="filtrarGradePorTurma(this.value)">
                        <option value="">Todas as turmas</option>
                        ${turmas.map(t => `<option value="${t.id}">${t.nome} — ${t.curso}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div class="grade-table-wrap">
                <table class="grade-table">
                    <thead>
                        <tr>
                            <th class="gh-hora-head">Horário</th>
                            ${cabecalho}
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
            ${gradeFiltroProfessor ? renderInfoProfessor(gradeFiltroProfessor) : ''}
        </div>
    `;
}

let gradeProfAtual = '';

function renderGradeProfessor(professor = gradeProfAtual) {
    currentView = 'gradeProfessor';
    gradeProfAtual = professor || '';
    setNavigationSelection('gradeProfessor');

    document.querySelector('header h1').textContent = 'Grade do Professor';
    document.getElementById('modoAtual').textContent = 'Grade horária semanal';
    renderStats(todasSalas);
    document.getElementById('roomsContainer').innerHTML = renderGradeHoraria(gradeProfAtual, '');
}

function filtrarGradePorTurma(turmaId) {
    if (!turmaId) { renderGradeHoraria('',''); return; }
    // Encontra qual professor leciona para essa turma
    let profEncontrado = '';
    Object.entries(gradeSemanal).forEach(([prof, aulas]) => {
        if (aulas.some(a => a.turma === turmaId)) profEncontrado = prof;
    });
    renderGradeHoraria(profEncontrado, '');
    // Atualiza selects
    const ps = document.getElementById('gradeProfSel');
    const ts = document.getElementById('gradeTurmaSel');
    if (ps) ps.value = profEncontrado;
    if (ts) ts.value = turmaId;
}

function renderInfoProfessor(prof) {
    const aulas = gradeSemanal[prof] || [];
    const salasUsadas = [...new Set(aulas.map(a => a.sala))];
    const turmasUsadas = [...new Set(aulas.map(a => a.turma))];
    const cursos = [...new Set(turmasUsadas.map(tid => { const t = getTurma(tid); return t ? t.curso : ''; }).filter(Boolean))];

    return `
        <div class="grade-prof-info">
            <div class="gpi-header">
                <i class="fas fa-chalkboard-teacher"></i>
                <div>
                    <strong>${prof}</strong>
                    <span>${aulas.length} aulas/semana</span>
                </div>
            </div>
            <div class="gpi-body">
                <div class="gpi-item">
                    <span class="gpi-label"><i class="fas fa-door-open"></i> Salas</span>
                    <span>${salasUsadas.map(c => NOMES_SALA_SENAI[c]||c).join(' · ')}</span>
                </div>
                <div class="gpi-item">
                    <span class="gpi-label"><i class="fas fa-users"></i> Turmas</span>
                    <span>${turmasUsadas.map(tid => { const t = getTurma(tid); return t ? t.nome : tid; }).join(' · ')}</span>
                </div>
                <div class="gpi-item">
                    <span class="gpi-label"><i class="fas fa-graduation-cap"></i> Cursos</span>
                    <span>${cursos.join(' · ')}</span>
                </div>
            </div>
        </div>
    `;
}

/* ═══════════════════════════════════════════════════════════════════════════
   HISTÓRICO DE RESERVAS — VIEW DEDICADA
═══════════════════════════════════════════════════════════════════════════ */
let histFiltroProf   = '';
let histFiltroStatus = '';
let histBusca        = '';
let histPagina       = 1;
let histPorPagina    = 10;

async function renderHistorico(filtroProf, filtroStatus, busca, pagina, porPagina) {
    currentView = 'historico';
    const mudouFiltro = filtroProf !== undefined || filtroStatus !== undefined || busca !== undefined;
    if (filtroProf   !== undefined) histFiltroProf   = filtroProf;
    if (filtroStatus !== undefined) histFiltroStatus = filtroStatus;
    if (busca        !== undefined) histBusca        = busca;
    if (porPagina !== undefined) histPorPagina = Number(porPagina) || 10;
    if (pagina !== undefined) histPagina = Number(pagina) || 1;
    else if (mudouFiltro) histPagina = 1;

    // ── nav ativo
    setNavigationSelection('historico');

    document.querySelector('header h1').textContent = 'Histórico de Reservas';
    document.getElementById('modoAtual').textContent = 'Todas as reservas e ocupações registradas';

    // Tenta buscar o histórico persistido no backend (fonte primária)
    let registros = [];
    try {
        const resp = await fetch('/api/reservations');
        if (resp.ok) {
            const rows = await resp.json();
            registros = rows.map(r => {
                // formata data YYYY-MM-DD → DD/MM/YYYY quando aplicável
                let data = r.data_reserva || r.data || null;
                if (data && typeof data === 'string' && data.indexOf('T') >= 0) data = data.split('T')[0];
                if (data && typeof data === 'string' && data.indexOf('-') >= 0) {
                    const p = data.split('-'); if (p.length === 3) data = `${p[2]}/${p[1]}/${p[0]}`;
                }
                let horario = '—';
                if (r.horario_inicio && r.horario_fim) horario = `${r.horario_inicio.substring(0,5)}–${r.horario_fim.substring(0,5)}`;
                else if (r.horario) horario = r.horario;

                const tipoVal = (r.tipo && String(r.tipo).toLowerCase()) || '';
                const reservaId = r.reserva_id || r.id || '';
                const isForcada = reservaId && String(reservaId).startsWith('FORCE');
                const tipoFinal = isForcada ? 'forcada' : (tipoVal || 'reserva');
                const statusVal = tipoFinal === 'evento' ? 'evento' : (tipoFinal === 'forcada' ? 'forcada' : (tipoFinal === 'ocupada' ? 'ocupada' : (r.status || 'reservada')));
                return {
                    id:        reservaId || '—',
                    sala:      r.nome || r.room_name || r.room_code || '—',
                    professor: r.professor || '—',
                    data:      data || '—',
                    horario:   horario || '—',
                    status:    statusVal,
                    turma:     r.turma || r.turma_id || '—',
                    evento:    r.evento || '',
                    tipo:      tipoFinal,
                };
            });
        } else {
            throw new Error('Falha ao obter reservations');
        }
    } catch (err) {
        // Fallback: monta lista a partir do estado local (quando backend indisponível)
        registros = [];
        todasSalas.filter(s => s.status !== 'livre').forEach(s => {
            const isForcadaLocal = s.reservaId && String(s.reservaId).startsWith('FORCE');
            registros.push({
                id:        s.reservaId || '—',
                sala:      s.nome,
                professor: s.professor || '—',
                data:      s.data || '—',
                horario:   s.horario || '—',
                status:    isForcadaLocal ? 'forcada' : s.status,
                turma:     '—',
                evento:    s.evento || '',
                tipo:      isForcadaLocal ? 'forcada' : 'reserva',
            });
        });
    }
    Object.entries(gradeSemanal).forEach(([prof, aulas]) => {
        aulas.forEach(a => {
            const turmaObj = getTurma(a.turma);
            registros.push({
                id:        '—',
                sala:      NOMES_SALA_SENAI[a.sala] || a.sala,
                professor: prof,
                data:      DIAS_SEMANA[a.dia] + ' (' + FAIXAS_HORARIO[a.faixa].label + ')',
                horario:   FAIXAS_HORARIO[a.faixa].label,
                status:    'grade',
                turma:     turmaObj ? turmaObj.nome : a.turma,
                evento:    '',
                tipo:      'grade',
            });
        });
    });

    // ── Aplica filtros
    let filtrados = registros.filter(r => {
        const matchProf   = !histFiltroProf   || r.professor === histFiltroProf;
        const matchStatus = !histFiltroStatus || r.status    === histFiltroStatus;
        const termo       = histBusca.toLowerCase();
        const matchBusca  = !termo ||
            r.sala.toLowerCase().includes(termo)      ||
            r.professor.toLowerCase().includes(termo) ||
            r.id.toLowerCase().includes(termo)        ||
            r.turma.toLowerCase().includes(termo);
        return matchProf && matchStatus && matchBusca;
    });

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / histPorPagina));
    histPagina = Math.min(Math.max(1, histPagina), totalPaginas);
    const inicioPagina = (histPagina - 1) * histPorPagina;
    const registrosPagina = filtrados.slice(inicioPagina, inicioPagina + histPorPagina);

    // ── Contagens para os cards de resumo
    const totalRes    = registros.filter(r => r.tipo === 'reserva').length;
    const totalGrade  = registros.filter(r => r.tipo === 'grade').length;
    const profUnicos  = [...new Set(registros.map(r => r.professor).filter(p => p !== '—'))].length;
    const salasUnicas = [...new Set(registros.map(r => r.sala))].length;

    // ── Selects de filtro
    const profOptions = professores.map(p =>
        `<option value="${p}" ${histFiltroProf===p?'selected':''}>${p}</option>`
    ).join('');

    const statusOpts = [
        { v:'reservada', l:'Reservada' },
        { v:'ocupada',   l:'Ocupada'   },
        { v:'evento',    l:'Evento'    },
        { v:'grade',     l:'Grade Fixa'},
    ].map(o => `<option value="${o.v}" ${histFiltroStatus===o.v?'selected':''}>${o.l}</option>`).join('');

    // ── Badge de status
    const badgeStatus = (s, eventoNome) => {
                const map = {
                    reservada: ['badge-reservada','Reservada'],
                    ocupada:   ['badge-ocupada',  'Ocupada'],
                    evento:    ['badge-evento',   'Evento'],
                    grade:     ['badge-grade',    'Grade Fixa'],
                    forcada:   ['badge-forcada',  'Ocupação Forçada']
                };
        const [cls, label] = map[s] || ['badge-livre', s];
        const badge = `<span class="status-badge ${cls}">${label}</span>`;
        if (s === 'evento' && eventoNome) {
            return badge + ` <span class="ev-tag" style="color:var(--orange);font-weight:600;margin-left:6px">${eventoNome}</span>`;
        }
        return badge;
    };

    // ── Linhas da tabela
    const linhas = filtrados.length
        ? registrosPagina.map(r => {
            const displayId = (isAdmin || r.tipo !== 'reserva') ? r.id : '—';
            const avatar = r.professor.split(' ').filter((_,i)=>i>0).map(s=>s[0]).join('').slice(0,2) || '?';
            return `
            <tr>
                <td class="mono hst-id">${displayId}</td>
                <td class="hst-sala">${r.sala}</td>
                <td class="hst-prof">
                    <span class="hst-avatar">${avatar}</span>
                    ${r.professor}
                </td>
                <td>${r.turma}</td>
                <td>${r.data}</td>
                <td>${r.horario}</td>
                <td>${badgeStatus(r.status, r.evento)}</td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="7" class="hst-empty">
                <i class="fas fa-search"></i>
                Nenhum registro encontrado para os filtros selecionados.
           </td></tr>`;

    // ── Monta a página
    renderStats(todasSalas);
    document.getElementById('roomsContainer').innerHTML = `
        <div class="hst-wrap">

            <!-- Cards de resumo -->
            <div class="hst-cards">
                <div class="hst-card hst-card-purple">
                    <i class="fas fa-calendar-check"></i>
                    <div><span class="hst-card-num">${totalRes}</span><span class="hst-card-lbl">Reservas ativas</span></div>
                </div>
                <div class="hst-card hst-card-teal">
                    <i class="fas fa-table"></i>
                    <div><span class="hst-card-num">${totalGrade}</span><span class="hst-card-lbl">Aulas na grade</span></div>
                </div>
                <div class="hst-card hst-card-blue">
                    <i class="fas fa-chalkboard-teacher"></i>
                    <div><span class="hst-card-num">${profUnicos}</span><span class="hst-card-lbl">Professores</span></div>
                </div>
                <div class="hst-card hst-card-green">
                    <i class="fas fa-door-open"></i>
                    <div><span class="hst-card-num">${salasUnicas}</span><span class="hst-card-lbl">Salas envolvidas</span></div>
                </div>
            </div>

            <!-- Barra de filtros -->
            <div class="hst-filters">
                <div class="hst-filter-group">
                    <i class="fas fa-search hst-search-icon"></i>
                    <input
                        class="hst-search"
                        type="text"
                        placeholder="Buscar sala, professor, turma ou ID…"
                        value="${histBusca}"
                        oninput="renderHistorico(undefined, undefined, this.value)"
                    >
                </div>
                <select class="input-field hst-select"
                    onchange="renderHistorico(this.value, undefined, undefined)">
                    <option value="">Todos os professores</option>
                    ${profOptions}
                </select>
                <select class="input-field hst-select"
                    onchange="renderHistorico(undefined, this.value, undefined)">
                    <option value="">Todos os status</option>
                    ${statusOpts}
                </select>
                ${(histFiltroProf || histFiltroStatus || histBusca) ? `
                <button class="hst-clear" onclick="renderHistorico('','','')">
                    <i class="fas fa-times"></i> Limpar filtros
                </button>` : ''}
            </div>

            <!-- Contador de resultados -->
            <div class="hst-result-count">
                <span>${filtrados.length} registro${filtrados.length !== 1 ? 's' : ''} encontrado${filtrados.length !== 1 ? 's' : ''}</span>
                ${filtrados.length !== registros.length ? `<span class="hst-result-total">de ${registros.length} no total</span>` : ''}
                <label class="hst-page-size">Mostrar
                    <select onchange="renderHistorico(undefined, undefined, undefined, 1, this.value)">
                        ${[10, 25, 50].map(size => `<option value="${size}" ${histPorPagina === size ? 'selected' : ''}>${size}</option>`).join('')}
                    </select>
                </label>
            </div>

            <!-- Tabela -->
            <div class="hst-table-wrap">
                <table class="hst-table">
                    <thead>
                        <tr>
                            <th>ID</th>
                            <th>Sala</th>
                            <th>Professor</th>
                            <th>Turma</th>
                            <th>Data / Dia</th>
                            <th>Horário</th>
                            <th>Status</th>
                        </tr>
                    </thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>

            ${filtrados.length ? `
            <div class="hst-pagination">
                <button class="hst-page-btn" ${histPagina === 1 ? 'disabled' : ''}
                    onclick="renderHistorico(undefined, undefined, undefined, ${histPagina - 1})">
                    <i class="fas fa-chevron-left"></i> Anterior
                </button>
                <span>Página ${histPagina} de ${totalPaginas}</span>
                <button class="hst-page-btn" ${histPagina === totalPaginas ? 'disabled' : ''}
                    onclick="renderHistorico(undefined, undefined, undefined, ${histPagina + 1})">
                    Próxima <i class="fas fa-chevron-right"></i>
                </button>
            </div>` : ''}

        </div>
    `;
}

function renderAgenda() {
    currentView = 'agenda';
    // Atualiza nav ativo
    setNavigationSelection('agenda');

    document.querySelector('header h1').textContent = 'Agenda';
    document.getElementById('modoAtual').textContent = 'Calendário de reservas e eventos';

    if (!agendaMesInicializado) {
        const atividades = todasSalas
            .map(sala => parseData(sala.data))
            .filter(Boolean)
            .sort((a, b) => new Date(b.y, b.m, b.d) - new Date(a.y, a.m, a.d));
        const mesAtualTemAtividades = atividades.some(data => data.m === agendaMes && data.y === agendaAno);
        if (!mesAtualTemAtividades && atividades.length) {
            agendaMes = atividades[0].m;
            agendaAno = atividades[0].y;
            agendaDiaSel = atividades[0].d;
        }
        agendaMesInicializado = true;
    }

    renderStats(todasSalas);
    const registrosAgenda = todasSalas.filter(s => s.status !== 'livre');
    const totalPaginasAgenda = Math.max(1, Math.ceil(registrosAgenda.length / AGENDA_HISTORICO_POR_PAGINA));
    agendaHistoricoPagina = Math.min(Math.max(1, agendaHistoricoPagina), totalPaginasAgenda);
    const inicioAgenda = (agendaHistoricoPagina - 1) * AGENDA_HISTORICO_POR_PAGINA;
    const registrosAgendaPagina = registrosAgenda.slice(inicioAgenda, inicioAgenda + AGENDA_HISTORICO_POR_PAGINA);
    document.getElementById('roomsContainer').innerHTML = `
        <div class="agenda-wrap" id="agendaWrap">
            <div class="agenda-cal" id="agendaCal"></div>
            <div class="agenda-side">
                <div class="agenda-side-header">
                    <h3 id="agSideTitle">Selecione um dia</h3>
                    <p id="agSideSub">Clique em qualquer dia para ver os detalhes</p>
                    <div class="ag-legend" style="margin-top:10px">
                        <div class="ag-legend-item"><span style="background:var(--purple)"></span>Reservada</div>
                        <div class="ag-legend-item"><span style="background:var(--red)"></span>Ocupada</div>
                        <div class="ag-legend-item"><span style="background:var(--orange)"></span>Evento</div>
                    </div>
                </div>
                <div class="agenda-day-list" id="agDayList">
                    <div class="ag-empty">
                        <i class="fas fa-calendar-day"></i>
                        <p>Selecione um dia no<br>calendário ao lado</p>
                    </div>
                </div>
            </div>
        </div>

        <div class="historico-section">
            <div class="section-title" style="margin-bottom:14px">
                <h2><i class="fas fa-history" style="margin-right:8px;color:var(--main-purple)"></i>Histórico de Reservas</h2>
            </div>
            <div class="historico-table-wrap">
                <table class="historico-table">
                    <thead>
                        <tr>
                            <th>ID</th><th>Sala</th><th>Professor</th><th>Data</th><th>Horário</th><th>Status</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${registrosAgendaPagina.map(s => `
                            <tr>
                                <td class="mono">${s.reservaId||'—'}</td>
                                <td>${s.nome}</td>
                                <td>${s.professor||'—'}</td>
                                <td>${s.data}</td>
                                <td>${s.horario}</td>
                                <td><span class="status-badge badge-${s.status}">${traduzStatus(s.status)}</span></td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>
            </div>
            ${registrosAgenda.length ? `
            <div class="agenda-history-pagination">
                <button class="hst-page-btn" ${agendaHistoricoPagina === 1 ? 'disabled' : ''}
                    onclick="mudarPaginaHistoricoAgenda(-1)">
                    <i class="fas fa-chevron-left"></i> Anterior
                </button>
                <span>${registrosAgenda.length} registros · Página ${agendaHistoricoPagina} de ${totalPaginasAgenda}</span>
                <button class="hst-page-btn" ${agendaHistoricoPagina === totalPaginasAgenda ? 'disabled' : ''}
                    onclick="mudarPaginaHistoricoAgenda(1)">
                    Próxima <i class="fas fa-chevron-right"></i>
                </button>
            </div>` : '<p class="agenda-history-empty">Nenhuma reserva ou evento registrado.</p>'}
        </div>
    `;
    paintCal();
    // Seleciona hoje automaticamente
    selectDia(agendaDiaSel, agendaMes, agendaAno);
}

function mudarPaginaHistoricoAgenda(delta) {
    agendaHistoricoPagina += delta;
    renderAgenda();
}

function paintCal() {
    const cal = document.getElementById('agendaCal');
    if (!cal) return;

    const now = new Date();
    const hoje = { d: now.getDate(), m: now.getMonth(), y: now.getFullYear() };
    const primeiroDia = new Date(agendaAno, agendaMes, 1).getDay(); // 0=dom
    const diasNoMes   = new Date(agendaAno, agendaMes + 1, 0).getDate();
    const eventMap    = mapEventosMes(agendaMes, agendaAno);

    // Cabeçalho do mês
    cal.innerHTML = `
        <div class="agenda-cal-header">
            <div>
                <h2>${MESES[agendaMes]} ${agendaAno}</h2>
                <p>${diasNoMes} dias · ${Object.keys(eventMap).length} dias com atividades</p>
            </div>
            <div class="cal-nav">
                <button class="cal-nav-btn" onclick="agendaNavMes(-1)"><i class="fas fa-chevron-left"></i></button>
                <button class="cal-nav-btn" onclick="agendaNavMes(1)"><i class="fas fa-chevron-right"></i></button>
            </div>
        </div>

        <div class="agenda-grid" id="agGrid">
            ${DOW.map(d => `<div class="ag-dow">${d}</div>`).join('')}
        </div>
    `;

    const grid = cal.querySelector('#agGrid');

    // Células vazias antes do dia 1
    for (let i = 0; i < primeiroDia; i++) {
        const blank = document.createElement('div');
        blank.className = 'ag-day empty';
        grid.appendChild(blank);
    }

    // Dias do mês
    for (let d = 1; d <= diasNoMes; d++) {
        const isToday   = d === hoje.d && agendaMes === hoje.m && agendaAno === hoje.y;
        const isSel     = d === agendaDiaSel;
        const tipos     = eventMap[d] || [];

        const dots = tipos.map(t => `<span class="dot-${t}"></span>`).join('');

        const cell = document.createElement('div');
        cell.className = `ag-day${isToday ? ' today' : ''}${isSel && !isToday ? ' selected-day' : ''}`;
        cell.innerHTML = `
            <span class="ag-day-num">${d}</span>
            <div class="ag-dots">${dots}</div>
        `;
        cell.addEventListener('click', () => selectDia(d, agendaMes, agendaAno));
        // Permitir drop apenas para administradores
        cell.addEventListener('dragover', ev => { if (isAdmin) ev.preventDefault(); });
        cell.addEventListener('drop', ev => {
            if (!isAdmin) return;
            ev.preventDefault();
            try {
                const raw = ev.dataTransfer.getData('text/plain');
                if (!raw) return;
                const payload = JSON.parse(raw);
                // Cria evento imediatamente com os dados do bloco arrastado
                createEventFromGrade(payload, d, agendaMes, agendaAno);
            } catch (err) {
                console.warn('Erro no drop do bloco da grade:', err);
            }
        });
        grid.appendChild(cell);
    }
}

function agendaNavMes(delta) {
    agendaMes += delta;
    if (agendaMes > 11) { agendaMes = 0; agendaAno++; }
    if (agendaMes < 0)  { agendaMes = 11; agendaAno--; }
    agendaDiaSel = null;
    paintCal();
    renderDayList([], null, null, null);
}

function selectDia(d, m, y) {
    agendaDiaSel = d;
    // Repinta para refletir seleção
    paintCal();

    const salas = salasDoDia(d, m, y);
    const label = `${String(d).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}`;
    renderDayList(salas, d, m, y, label);
}

function renderDayList(salas, d, m, y, label) {
    const title   = document.getElementById('agSideTitle');
    const sub     = document.getElementById('agSideSub');
    const dayList = document.getElementById('agDayList');
    if (!dayList) return;

    if (label) {
        title.textContent = label;
        sub.textContent   = salas.length
            ? `${salas.length} atividade${salas.length > 1 ? 's' : ''} encontrada${salas.length > 1 ? 's' : ''}`
            : 'Nenhuma atividade neste dia';
    }

    if (!salas.length) {
        dayList.innerHTML = `
            <div class="ag-empty">
                <i class="fas fa-coffee"></i>
                <p>Dia livre!<br>Sem reservas ou eventos.</p>
            </div>`;
        return;
    }

    dayList.innerHTML = salas.map(s => `
        <div class="ag-event-card ${s.status}" onclick="openModal('${s.id}')">
            <h4>${s.nome} <small style="font-weight:500;color:#9ca3af">${blocoDisplay(s.bloco)}</small></h4>
            <p class="ag-meta"><i class="fas fa-user" style="font-size:9px;margin-right:3px"></i>${s.professor}</p>
            <p class="ag-time"><i class="fas fa-clock" style="font-size:9px;margin-right:3px"></i>${s.horario}</p>
            ${s.evento ? `<p class="ag-ev-name"><i class="fas fa-star" style="font-size:9px;margin-right:3px"></i>${s.evento}</p>` : ''}
        </div>
    `).join('');
}

/* ═══════════════════════════════════════════════════════════════════════════
   BOTÃO NOVA RESERVA — apenas para admin (injetado dinamicamente)
═══════════════════════════════════════════════════════════════════════════ */
function atualizarBotoesAdmin() {
    const existing = document.getElementById('btnNovaReservaAdmin');
    if (isAdmin && !existing) {
        const btn = document.createElement('button');
        btn.id = 'btnNovaReservaAdmin';
        btn.className = 'btn-new';
        btn.innerHTML = '<i class="fas fa-plus" style="margin-right:6px"></i>Nova Reserva';
        btn.onclick = openNovaReservaAdmin;
        document.querySelector('.header-right').prepend(btn);
    } else if (!isAdmin && existing) {
        existing.remove();
    }
}

function openNovaReservaAdmin() {
    const sala = todasSalas.find(s => s.status === 'livre');
    if (sala) openModal(sala.id);
    else alert('Nenhuma sala disponível no momento.');
}

/* ─── Liberar/Desocupar Sala (integração backend) ───────────────────────────── */
function stepLiberarSala(salaId) {
    const sala = getSala(salaId);
    if (!sala) return;
    
    content.innerHTML = `
        <div class="modal-header">
            <div>
                <h3>Desocupar Sala</h3>
                <p class="modal-sub">${sala.nome}</p>
            </div>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <p class="modal-sub">Para desocupar a sala, informe seus dados:</p>
        <label class="field-label">Seu Nome</label>
        <input type="text" class="input-field" id="liberarNome" placeholder="Digite seu nome completo">
        <label class="field-label">Código do Crachá</label>
        <input type="text" class="input-field" id="liberarCard" placeholder="Ex: RFID-123456">
        <label class="field-label">OU Código da Digital</label>
        <input type="text" class="input-field" id="liberarFinger" placeholder="Ex: FP-98765">
        <p class="hint-text">Informe o código do crachá OU da digital.</p>
        <div class="modal-actions">
            <button class="btn-secondary" onclick="stepInfo(getSala('${salaId}'))">Voltar</button>
            <button class="btn-black" id="btnLiberarConfirm" style="flex:1;margin-top:0">
                <i class="fas fa-check"></i> Desocupar
            </button>
        </div>
    `;
    
    document.getElementById('btnLiberarConfirm').onclick = async () => {
        const nome = document.getElementById('liberarNome').value.trim();
        const card = document.getElementById('liberarCard').value.trim();
        const finger = document.getElementById('liberarFinger').value.trim();
        
        if (!nome) {
            alert('Informe seu nome completo.');
            return;
        }
        if (!card && !finger) {
            alert('Informe o código do crachá ou da digital.');
            return;
        }
        
        try {
            const res = await apiPost('/api/release-room', {
                roomCode: sala.id,
                professorName: nome,
                cardCode: card || null,
                fingerprintCode: finger || null
            });
            
            sala.status = 'livre';
            sala.professor = null;
            sala.reservaId = null;
            sala.data = null;
            sala.horario = null;
            sala.evento = null;
            
            content.innerHTML = `
                <div class="success-icon">✓</div>
                <p class="success-title">Sala Desocupada!</p>
                <p class="success-msg">${sala.nome} foi liberada com sucesso.</p>
                <div class="reserva-info" style="margin-top:12px">
                    <div class="info-row"><span class="lbl">Sala</span><span class="val">${sala.nome}</span></div>
                    <div class="info-row"><span class="lbl">Professor</span><span class="val">${sala.professor}</span></div>
                    <div class="info-row"><span class="lbl">Horário</span><span class="val">${sala.horario||''}</span></div>
                </div>
                <div style="text-align:center;margin-top:14px">
                    <button class="btn-black" onclick="closeM(); renderStats(todasSalas)"><i class="fas fa-check"></i> Fechar</button>
                </div>
            `;
        } catch (error) {
            alert('Erro ao desocupar: ' + error.message);
        }
    };
}

// Sair do modo administrador
function adminLogout() {
    isAdmin = false;
    const badge = document.getElementById('adminBadge');
    if (badge) badge.style.display = 'none';
    atualizarBotoesAdmin();
    const modo = document.getElementById('modoAtual');
    if (modo) modo.textContent = 'Modo padrão';
    closeConfig();
}

// Inicia drag de bloco da grade — dados: prof, faixa, dia, sala, turma
function startGradeDrag(e, prof, faixa, dia, sala, turma, id) {
    try {
        const payload = { prof, faixa, dia, sala, turma, id };
        e.dataTransfer.setData('text/plain', JSON.stringify(payload));
        e.dataTransfer.effectAllowed = 'copyMove';
    } catch (err) {
        console.warn('Erro ao iniciar drag:', err);
    }
}

// Cria um evento imediatamente a partir de um bloco da grade arrastado
async function createEventFromGrade(payload, d, m, y) {
    try {
        const salaCode = payload.sala || payload.salaCode;
        const sala = getSala(salaCode);
        if (!sala) {
            alert('Sala não encontrada para criar evento.');
            return;
        }

        const turmaObj = getTurma(payload.turma || payload.turmaId);
        const turmaNome = turmaObj ? turmaObj.nome : (payload.turma || payload.turmaId || 'Aula');
        const dataStr = `${String(d).padStart(2,'0')}/${String(m+1).padStart(2,'0')}/${y}`;
        const faixaLabel = FAIXAS_HORARIO[payload.faixa] ? FAIXAS_HORARIO[payload.faixa].label : '';

        // Prepara dados locais
        sala.status = 'evento';
        sala.evento = `Aula: ${turmaNome}`;
        sala.professor = payload.prof || sala.professor || '—';
        sala.reservaId = randProfId();
        sala.data = dataStr;
        sala.horario = faixaLabel || sala.horario;

        // Tenta persistir no backend usando o mesmo endpoint de reserva (tipo: evento)
        try {
            const times = (faixaLabel || '').split('–').map(s => s.trim());
            const start = times[0] || null;
            const end = times[1] || null;
            const payloadApi = {
                roomCode: sala.id,
                professor: sala.professor,
                date: dataStr,
                startTime: start,
                endTime: end,
                reservaId: sala.reservaId,
                tipo: 'evento',
                evento: sala.evento
            };
            const res = await apiPost('/api/reserve', payloadApi).catch(e => { throw e; });
            if (res) {
                sala.status = res.status || sala.status;
                sala.professor = res.professor || sala.professor;
                sala.reservaId = res.reserva_id || sala.reservaId;
                sala.data = res.data_reserva || sala.data;
                sala.horario = res.horario || sala.horario || (start && end ? `${start}–${end}` : sala.horario);
                sala.evento = res.evento || sala.evento;
            }
        } catch (err) {
            console.warn('Falha ao persistir evento no backend:', err.message || err);
        }

        // Atualiza views
        renderAgenda();
        if (currentView === 'gradeProfessor') renderGradeProfessor(gradeProfAtual);
        renderStats(todasSalas);

        // Mostra confirmação rápida no modal
        content.innerHTML = `
            <div class="success-icon">🌟</div>
            <p class="success-title">Evento Criado</p>
            <p class="success-msg">${sala.nome} marcada como evento.</p>
            <div class="reserva-info" style="margin-top:12px">
                <div class="info-row"><span class="lbl">Sala</span><span class="val">${sala.nome}</span></div>
                <div class="info-row"><span class="lbl">Evento</span><span class="val">${sala.evento}</span></div>
                <div class="info-row"><span class="lbl">Responsável</span><span class="val">${sala.professor}</span></div>
                <div class="info-row"><span class="lbl">Horário</span><span class="val">${sala.horario}</span></div>
            </div>
            <button class="btn-black" onclick="closeM(); renderAgenda()"><i class="fas fa-check"></i> Fechar</button>
        `;
    } catch (err) {
        console.warn('Erro ao criar evento do bloco da grade:', err);
        alert('Não foi possível criar o evento. Veja o console.');
    }
}

async function handleGradeDrop(ev, targetFaixa, targetDia) {
    if (!isAdmin) return;
    ev.preventDefault();
    try {
        const raw = ev.dataTransfer.getData('text/plain');
        if (!raw) return;
        const payload = JSON.parse(raw);
        const prof = payload.prof;
        const sala = payload.sala || payload.salaCode;
        const turma = payload.turma || payload.turmaId;
        if (!prof) return;

        if (!gradeSemanal[prof]) gradeSemanal[prof] = [];

        // Se já existe aula no target, pedir confirmação para substituir
        const existeTarget = gradeSemanal[prof].some(a => a.faixa === targetFaixa && a.dia === targetDia);
        if (existeTarget) {
            if (!confirm('Já existe uma aula neste horário para o professor. Substituir?')) return;
            gradeSemanal[prof] = gradeSemanal[prof].filter(a => !(a.faixa === targetFaixa && a.dia === targetDia));
        }

        // Remove a ocorrência original (se achar)
        gradeSemanal[prof] = gradeSemanal[prof].filter(a => !(a.faixa === payload.faixa && a.dia === payload.dia && a.sala === sala && a.turma === turma));

        // Persiste a mudança no backend se possível
        if (payload.id) {
            try {
                const res = await fetch(`/api/grade/${payload.id}`, {
                    method: 'PUT', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ dia: targetDia, faixa: targetFaixa, sala_code: sala, turma_id: turma, professor: prof })
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Erro ao atualizar grade');
                const updated = await res.json();
                // Adiciona entrada atualizada
                if (!gradeSemanal[prof]) gradeSemanal[prof] = [];
                gradeSemanal[prof].push({ id: updated.id, dia: updated.dia, faixa: updated.faixa, sala: updated.sala_code, turma: updated.turma_id });
            } catch (err) {
                console.warn('Falha ao salvar alteração da grade no backend:', err);
                // Em caso de falha, adiciona localmente para não perder mudança
                gradeSemanal[prof].push({ id: payload.id, dia: targetDia, faixa: targetFaixa, sala: sala, turma: turma });
            }
        } else {
            try {
                const res = await fetch('/api/grade', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ professor: prof, dia: targetDia, faixa: targetFaixa, sala_code: sala, turma_id: turma })
                });
                if (!res.ok) throw new Error((await res.json()).error || 'Erro ao criar grade');
                const created = await res.json();
                gradeSemanal[prof].push({ id: created.id, dia: created.dia, faixa: created.faixa, sala: created.sala_code, turma: created.turma_id });
            } catch (err) {
                console.warn('Falha ao criar entrada da grade no backend:', err);
                gradeSemanal[prof].push({ dia: targetDia, faixa: targetFaixa, sala: sala, turma: turma });
            }
        }

        // Atualiza views
        adminGradeProfSel = prof;
        if (document.getElementById('adminListContent')) document.getElementById('adminListContent').innerHTML = renderAdminGradeHTML();
        reativarSelectGrade();
        if (document.getElementById('gpcProfSelect')) renderGradeProfessor(prof);
    } catch (err) {
        console.warn('Erro ao processar drop da grade:', err);
    }
}

// Abre modal para ocupação forçada de uma reserva (escolher professor + código do crachá)
function forcarOcupacao(salaId) {
    console.log('DEBUG: forcarOcupacao invoked, salaId=', salaId, 'isAdmin=', isAdmin);
    let sala;
    try {
        sala = getSala(salaId);
        if (!sala) return alert('Sala não encontrada.');
    } catch(err) {
        console.error('DEBUG: erro ao obter sala em forcarOcupacao', err);
        return;
    }
    const targetContent = isAdmin ? cfgContent : content;
    const targetOverlay = isAdmin ? cfgOverlay : overlay;
    targetContent.className = isAdmin ? 'modal-card config-modal' : 'modal-card';
    // Preenche valores padrão de data/horário se existirem
    const defaultDate = sala.data || '';
    let defaultHi = '';
    let defaultHf = '';
    if (sala.horario && sala.horario.includes('–')) {
        const parts = sala.horario.split('–').map(s => s.trim());
        defaultHi = parts[0] || '';
        defaultHf = parts[1] || '';
    }
    // Tentativa de pré-preencher o código do crachá usado na reserva, se disponível.
    // Se não houver, usar 12345 conforme solicitado.
      
    const defaultCard = sala.cardCode || sala.card_code || sala.cracha || sala.reserva_card || sala.card || '12345';

    targetContent.innerHTML = `
        <div class="modal-header">
            <div>
                <h3>Ocupação Forçada — ${sala.nome}</h3>
                <p class="modal-sub">Registrar ocupação imediata para uma reserva existente</p>
            </div>
            <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
        </div>
        <label class="field-label">Professor</label>
        <select class="input-field" id="forcaProfSelect">
            <option value="">— Selecione um professor —</option>
            ${professores.map(p=>`<option value="${p}">${p}</option>`).join('')}
        </select>
        <label class="field-label">Data (DD/MM/AAAA)</label>
        <input type="text" class="input-field" id="forcaData" value="${defaultDate}" placeholder="DD/MM/AAAA">
        <div class="time-row">
            <div style="flex:1">
                <label class="field-label">Horário de início</label>
                <input type="time" class="input-field" id="forcaHi" value="${defaultHi}">
            </div>
            <div style="flex:1;margin-left:8px">
                <label class="field-label">Horário de término</label>
                <input type="time" class="input-field" id="forcaHf" value="${defaultHf}">
            </div>
        </div>
        <label class="field-label">Código do Crachá (obrigatório)</label>
        <input type="text" class="input-field" id="forcaCardCode" value="${defaultCard}" placeholder="Ex: RFID-123456">
        <p class="hint-text">Informe o código do crachá do professor para autorizar a ocupação.</p>
        <div class="modal-actions">
            <button class="btn-secondary" onclick="renderAdminPanel('reservas')">Cancelar</button>
            <button class="btn-black" id="btnForcarOcupacao"><i class="fas fa-sign-in-alt"></i> Confirmar Ocupação</button>
        </div>
    `;

    // mostra o overlay correto
    targetOverlay.style.display = 'flex';

    const btnConfirm = targetContent.querySelector('#btnForcarOcupacao');
    if (btnConfirm) {
        btnConfirm.addEventListener('click', async () => {
            console.log('DEBUG: btnForcarOcupacao clicked for sala=', sala.id);
            const prof = targetContent.querySelector('#forcaProfSelect').value.trim();
            const card = targetContent.querySelector('#forcaCardCode').value.trim();
            const data = targetContent.querySelector('#forcaData').value.trim();
            const hi = targetContent.querySelector('#forcaHi').value;
            const hf = targetContent.querySelector('#forcaHf').value;
            if (!prof) { alert('Selecione o professor responsável pela ocupação.'); return; }
            if (!card) { alert('Informe o código do crachá do professor.'); return; }
            if (hi && hf && timeToMinutes(hf) <= timeToMinutes(hi)) { alert('Horário de término deve ser posterior ao início.'); return; }

            if (!confirm(`Confirma forçar a ocupação de ${sala.nome} para ${prof} na data ${data || sala.data || 'hoje'} às ${hi || ''}–${hf || ''}?`)) return;

            try {
                console.log('DEBUG: sending force-occupy payload', { roomCode: sala.id, professor: prof, cardCode: card, date: data, startTime: hi, endTime: hf });
                const res = await fetch('/api/force-occupy', {
                    method: 'POST', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ roomCode: sala.id, professor: prof, cardCode: card || null, date: data || null, startTime: hi || null, endTime: hf || null })
                });
                if (!res.ok) {
                    const txt = await res.text();
                    let msg = 'Falha na ocupação';
                    try { const j = JSON.parse(txt); msg = j.error || txt; } catch(e) { msg = txt || msg; }
                    throw new Error(msg);
                }
                const updated = await res.json();

                // Atualiza sala localmente
                sala.status = updated.status || 'ocupada';
                sala.professor = updated.professor || prof;
                sala.reservaId = updated.reserva_id || sala.reservaId || randProfId();
                sala.data = updated.data_reserva || data || sala.data;
                sala.horario = (updated.horario_inicio && updated.horario_fim) ? `${updated.horario_inicio}–${updated.horario_fim}` : (hi && hf ? `${hi}–${hf}` : sala.horario);

            // Mostra confirmação amigável
            targetContent.innerHTML = `
                <div class="modal-header">
                    <h3>Ocupação Registrada</h3>
                    <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
                </div>
                <div class="success-icon">✅</div>
                <p class="success-title">Sala marcada como ocupada</p>
                <div class="reserva-info" style="margin-top:12px">
                    <div class="info-row"><span class="lbl">Sala</span><span class="val">${sala.nome}</span></div>
                    <div class="info-row"><span class="lbl">Professor</span><span class="val">${sala.professor}</span></div>
                    <div class="info-row"><span class="lbl">Horário</span><span class="val">${sala.horario||''}</span></div>
                </div>
                <div style="text-align:center;margin-top:14px">
                    <button class="btn-black" onclick="closeM(); renderStats(todasSalas)"><i class="fas fa-check"></i> Fechar</button>
                </div>
            `;

        } catch (err) {
            alert('Erro ao forçar ocupação: ' + (err.message || err));
        }
    });
    }
}

// Delegated click handler for dynamic .js-forcar buttons (covers cases where listener wasn't attached)
document.addEventListener('click', (e) => {
    const btn = e.target.closest && e.target.closest('.js-forcar');
    if (!btn) return;
    const rid = btn.dataset.room;
    console.log('DEBUG-DELEG: js-forcar clicked, room=', rid);
    try { forcarOcupacao(rid); } catch (err) { console.error('Erro ao chamar forcarOcupacao (deleg):', err); }
});