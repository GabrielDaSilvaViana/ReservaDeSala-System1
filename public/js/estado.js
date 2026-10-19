/* ═══════════════════════════════════════════════════════════════════════════
   ESTADO — dados vindos do servidor (fonte única: o banco de dados)
═══════════════════════════════════════════════════════════════════════════ */

const estado = {
    carregado: false,
    agora: { data: '', hora: '' },
    salas: [],        // { codigo, nome, andar, status, reservaAtualId }
    reservas: [],     // reservas/eventos ativos de hoje em diante
    historico: [],    // todas as reservas (carregado nas telas Agenda e Histórico)
    grade: [],        // { id, professorId, professor, dia, faixa, sala, turma }
    professores: [],
    turmas: [],
    faixas: [],
    dias: [],
    regras: { reservaMinimaMinutos: 5, ocupacaoAntecedenciaMinutos: 30 },
    solenoideModo: 'simulacao',
    esp32Configurado: false,
    digitalModo: 'manual'
};

let isAdmin = false;
let currentView = 'dashboard';
let andarAtual = null;

/* ── Consultas rápidas ───────────────────────────────────────────────────── */
const getSala = codigo => estado.salas.find(s => s.codigo === codigo);
const getReserva = id => estado.reservas.find(r => r.id === Number(id)) || estado.historico.find(r => r.id === Number(id));
const getProfessor = id => estado.professores.find(p => p.id === Number(id));
const getTurma = id => estado.turmas.find(t => t.id === id);
const nomeSala = codigo => getSala(codigo)?.nome || codigo;
const hoje = () => estado.agora.data;
const horaAgora = () => estado.agora.hora.slice(0, 5);

/** Reserva que define a situação atual da sala (ocupação ou próxima de hoje). */
function reservaAtualDaSala(sala) {
    return sala && sala.reservaAtualId ? getReserva(sala.reservaAtualId) : null;
}

/** Reservas/eventos ativos de uma sala em uma data. */
function reservasDaSalaNoDia(codigo, data) {
    return estado.reservas
        .filter(r => r.sala === codigo && r.data === data && (r.status === 'agendada' || r.status === 'em_uso'))
        .sort((a, b) => a.inicio.localeCompare(b.inicio));
}

/** Aulas da grade fixa de uma sala em uma data (de acordo com o dia da semana). */
function aulasDaSalaNoDia(codigo, data) {
    const dia = diaDaSemanaIso(data);
    if (dia === null) return [];
    return estado.grade.filter(a => a.sala === codigo && a.dia === dia).sort((a, b) => a.faixa - b.faixa);
}

/**
 * Verifica no navegador se a sala está livre no intervalo (o servidor confere
 * de novo — isto só serve para mostrar as opções certas na tela).
 */
function salaDisponivel(codigo, data, inicio, fim, { professorId = null, ignorarId = null } = {}) {
    const ini = timeToMinutes(inicio), f = timeToMinutes(fim);
    const choqueReserva = reservasDaSalaNoDia(codigo, data)
        .some(r => r.id !== ignorarId && timeToMinutes(r.inicio) < f && timeToMinutes(r.fim) > ini);
    if (choqueReserva) return false;
    return !aulasDaSalaNoDia(codigo, data).some(a => {
        const faixa = estado.faixas[a.faixa];
        return a.professorId !== Number(professorId) && timeToMinutes(faixa.inicio) < f && timeToMinutes(faixa.fim) > ini;
    });
}

/* ── Carregamento ────────────────────────────────────────────────────────── */
let assinaturaEstado = '';
let assinaturaHistorico = '';

/** Busca o estado no servidor. Retorna true se algo mudou. */
async function carregarEstado() {
    const dados = await api.get('/api/estado');
    const assinatura = JSON.stringify([dados.salas, dados.reservas, dados.grade, dados.professores, dados.admin]);
    const mudou = assinatura !== assinaturaEstado || !estado.carregado;
    assinaturaEstado = assinatura;
    Object.assign(estado, {
        carregado: true,
        agora: dados.agora,
        salas: dados.salas,
        reservas: dados.reservas,
        grade: dados.grade,
        professores: dados.professores,
        turmas: dados.turmas,
        faixas: dados.faixas,
        dias: dados.dias,
        regras: dados.regras,
        solenoideModo: dados.solenoideModo,
        esp32Configurado: Boolean(dados.esp32Configurado),
        digitalModo: dados.digitalModo === 'esp32' ? 'esp32' : 'manual'
    });
    if (isAdmin && !dados.admin) aoPerderSessaoAdmin();
    return mudou;
}

/** Busca o histórico completo. Retorna true se algo mudou. */
async function carregarHistorico() {
    const lista = await api.get('/api/reservas');
    const assinatura = JSON.stringify(lista);
    const mudou = assinatura !== assinaturaHistorico;
    assinaturaHistorico = assinatura;
    estado.historico = lista;
    return mudou;
}

/** Recarrega tudo e redesenha a tela atual. Usado após cada ação. */
async function recarregarTudo() {
    await carregarEstado();
    if (currentView === 'agenda' || currentView === 'historico') await carregarHistorico();
    renderViewAtual();
}

function renderViewAtual() {
    switch (currentView) {
        case 'bloco': andarAtual !== null ? renderBloco(andarAtual) : renderAll(); break;
        case 'agenda': renderAgenda(); break;
        case 'historico': renderHistorico(); break;
        case 'gradeProfessor': renderGradeProfessor(); break;
        default: renderAll();
    }
    renderMenuAndares();
    if (cfgOverlay.style.display === 'flex' && isAdmin) atualizarPainelAdminSeAberto();
}

/* ── Atualização automática a cada 5 segundos ───────────────────────────── */
let atualizando = false;
let falhasSeguidas = 0;

async function atualizacaoAutomatica() {
    if (atualizando || document.hidden) return;
    atualizando = true;
    try {
        let mudou = await carregarEstado();
        if (currentView === 'agenda' || currentView === 'historico') {
            mudou = (await carregarHistorico()) || mudou;
        }
        if (falhasSeguidas > 0) mudou = true;
        falhasSeguidas = 0;
        if (mudou) renderViewAtual();
    } catch (e) {
        falhasSeguidas += 1;
        if (falhasSeguidas === 1) console.warn('Falha ao atualizar dados:', e.message);
        if (falhasSeguidas >= 2) mostrarAvisoConexao(e.message);
    } finally {
        atualizando = false;
    }
}

function mostrarAvisoConexao(mensagem) {
    document.getElementById('modoAtual').textContent = `⚠️ ${mensagem}`;
}
