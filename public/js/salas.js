/* ═══════════════════════════════════════════════════════════════════════════
   SALAS — modais de reserva, ocupação, desocupação e mudança de sala
═══════════════════════════════════════════════════════════════════════════ */

const overlay = document.getElementById('modalOverlay');
const content = document.getElementById('modalContent');

function abrirModal() {
    content.className = 'modal-card';
    overlay.style.display = 'flex';
}

function closeM() {
    Facial.pararCamera();
    if (typeof solenoidController !== 'undefined') solenoidController.parar();
    overlay.style.display = 'none';
}
overlay.addEventListener('click', e => { if (e.target === overlay) closeM(); });
document.addEventListener('keydown', e => {
    if (e.key !== 'Escape') return;
    if (overlay.style.display === 'flex') closeM();
    else if (cfgOverlay.style.display === 'flex') closeConfig();
});

const cabecalhoModal = (titulo, sub = '') => `
    <div class="modal-header">
        <div>
            <h3>${titulo}</h3>
            ${sub ? `<p class="modal-sub">${sub}</p>` : ''}
        </div>
        <button class="btn-close" onclick="closeM()"><i class="fas fa-times"></i></button>
    </div>`;

/** Clique em um card de sala. */
function openModal(codigo) {
    const sala = getSala(codigo);
    if (!sala) return;
    const reserva = reservaAtualDaSala(sala);
    if (reserva) stepInfo(sala, reserva);
    else stepReservar(sala);
    abrirModal();
}

/** Abre os detalhes de uma reserva específica (usado pela Agenda). */
function abrirReserva(id) {
    const r = getReserva(id);
    if (!r) return;
    const sala = getSala(r.sala) || { codigo: r.sala, nome: r.salaNome, andar: r.andar };
    stepInfo(sala, r);
    abrirModal();
}

function situacaoDaReserva(r) {
    if (r.status === 'em_uso') return 'ocupada';
    if (r.tipo === 'evento') return 'evento';
    return 'reservada';
}

/** Linhas "outras reservas hoje" para ajudar a escolher outro horário. */
function htmlOutrasReservas(codigo, data, ignorarId) {
    const outras = reservasDaSalaNoDia(codigo, data).filter(r => r.id !== ignorarId);
    if (!outras.length) return '';
    return `
        <div class="info-row">
            <span class="lbl"><i class="fas fa-list"></i> Outras neste dia</span>
            <span class="val">${outras.map(r => `${horarioTexto(r)} (${esc(r.tipo === 'evento' ? r.evento : r.responsavel)})`).join('<br>')}</span>
        </div>`;
}

/* ─── Informações de uma sala reservada / ocupada / com evento ───────────── */
function stepInfo(sala, r) {
    const situacao = situacaoDaReserva(r);
    const ativa = r.status === 'agendada' || r.status === 'em_uso';
    const ehHoje = r.data === hoje();
    let acoes;

    if (isAdmin) {
        const botaoRemover = !ativa ? '' : r.status === 'em_uso'
            ? `<button class="btn-danger" onclick="adminRemoverReserva(${r.id})"><i class="fas fa-door-open"></i> Desocupação Forçada</button>`
            : `<button class="btn-danger" onclick="adminRemoverReserva(${r.id})"><i class="fas fa-trash"></i> ${r.tipo === 'evento' ? 'Remover Evento' : 'Remover Reserva'}</button>`;
        acoes = `
            <div class="modal-actions">
                ${botaoRemover}
                <button class="btn-secondary" onclick="adicionarEvento('${esc(sala.codigo)}')">
                    <i class="fas fa-plus"></i> Adicionar Evento
                </button>
            </div>
            ${r.tipo === 'reserva' && r.status === 'agendada' && ehHoje ? `
            <div class="modal-actions">
                <button class="btn-secondary" onclick="forcarOcupacao(${r.id})">
                    <i class="fas fa-sign-in-alt"></i> Ocupação Forçada
                </button>
            </div>` : ''}
            <button class="btn-outline" onclick="closeM()">Fechar</button>`;
    } else if (r.status === 'em_uso') {
        acoes = `
            <button class="btn-secondary" style="width:100%" onclick="stepLiberarSala(${r.id})">
                <i class="fas fa-unlock"></i> Desocupar Sala
            </button>
            <button class="btn-outline" onclick="closeM()">Fechar</button>`;
    } else if (r.status === 'agendada' && r.tipo === 'reserva') {
        acoes = `
            <div class="modal-actions">
                <button class="btn-secondary" onclick="solicitarMudanca(${r.id})">
                    <i class="fas fa-exchange-alt"></i> Solicitar Mudança
                </button>
                ${ehHoje ? `<button class="btn-sm primary" onclick="ocuparSalaReservada(${r.id})">
                    <i class="fas fa-door-open"></i> Ocupar Sala
                </button>` : ''}
            </div>
            <button class="btn-outline" onclick="closeM()">Fechar</button>`;
    } else {
        acoes = `<button class="btn-outline" onclick="closeM()">Fechar</button>`;
    }

    const podeReservarOutroHorario = Boolean(getSala(sala.codigo));

    content.innerHTML = `
        ${cabecalhoModal(esc(sala.nome), `${andarDisplay(sala.andar)} · Status: ${traduzStatus(situacao)}`)}
        <div class="reserva-info">
            <h4><i class="fas fa-user" style="margin-right:6px"></i>${r.tipo === 'evento' ? 'Informações do Evento' : 'Informações da Reserva'}</h4>
            <div class="info-row">
                <span class="lbl"><i class="fas fa-chalkboard-teacher"></i> ${r.tipo === 'evento' ? 'Responsável' : 'Professor'}</span>
                <span class="val">${esc(r.responsavel)}</span>
            </div>
            ${isAdmin && r.codigo ? `
            <div class="info-row">
                <span class="lbl"><i class="fas fa-hashtag"></i> ID</span>
                <span class="val mono">${esc(r.codigo)}</span>
            </div>` : ''}
            <div class="info-row">
                <span class="lbl"><i class="fas fa-calendar"></i> Data</span>
                <span class="val">${isoParaBr(r.data)}</span>
            </div>
            <div class="info-row">
                <span class="lbl"><i class="fas fa-clock"></i> Horário</span>
                <span class="val">${horarioTexto(r)}</span>
            </div>
            ${r.evento ? `
            <div class="info-row">
                <span class="lbl" style="color:var(--orange)"><i class="fas fa-star"></i> Evento</span>
                <span class="val" style="color:var(--orange)">${esc(r.evento)}</span>
            </div>` : ''}
            ${htmlOutrasReservas(sala.codigo, r.data, r.id)}
        </div>
        ${acoes}
        ${podeReservarOutroHorario ? `
        <button class="btn-outline" onclick="stepCalendar('${esc(sala.codigo)}')">
            <i class="fas fa-calendar-plus"></i> Reservar outro horário
        </button>
        ${isAdmin ? '' : `<button class="btn-outline" onclick="adicionarEvento('${esc(sala.codigo)}')">
            <i class="fas fa-star"></i> Adicionar evento em outro horário
        </button>`}` : ''}
    `;
}

/* ─── Sala livre ─────────────────────────────────────────────────────────── */
function stepReservar(sala) {
    content.innerHTML = `
        ${cabecalhoModal(esc(sala.nome), `${andarDisplay(sala.andar)} · Disponível`)}
        <div class="reserva-info">
            <div class="info-row">
                <span class="lbl">Status</span>
                <span class="status-badge badge-livre">✓ Disponível</span>
            </div>
            <div class="info-row">
                <span class="lbl">Andar</span>
                <span class="val">${andarDisplay(sala.andar)}</span>
            </div>
            ${htmlOutrasReservas(sala.codigo, hoje(), null)}
        </div>
        <button class="btn-black" onclick="stepCalendar('${esc(sala.codigo)}')">
            <i class="fas fa-calendar-plus"></i> Reservar Sala
        </button>
        <button class="btn-secondary" style="width:100%;margin-top:10px" onclick="adicionarEvento('${esc(sala.codigo)}')">
            <i class="fas fa-star"></i> Adicionar Evento
        </button>
        <button class="btn-outline" onclick="closeM()">Cancelar</button>
    `;
}

/* ─── Reserva: escolher dia e horário ────────────────────────────────────── */
let calMesOffset = 0;

/** Sugere a próxima faixa da grade que ainda não terminou hoje. */
function horarioSugerido(data) {
    const faixas = estado.faixas.length ? estado.faixas : [{ inicio: '08:00', fim: '10:00' }];
    if (data !== hoje()) return faixas[0];
    const agoraMin = timeToMinutes(horaAgora());
    const proxima = faixas.find(f => timeToMinutes(f.fim) > agoraMin);
    if (proxima) return { inicio: timeToMinutes(proxima.inicio) < agoraMin ? horaAgora() : proxima.inicio, fim: proxima.fim };
    return { inicio: horaAgora(), fim: minutesToTime(Math.min(timeToMinutes(horaAgora()) + 60, 23 * 60 + 59)) };
}

function htmlOcupacaoDoDia(codigo, data) {
    const reservas = reservasDaSalaNoDia(codigo, data).map(r =>
        `<div>• ${horarioTexto(r)} — ${esc(r.tipo === 'evento' ? `Evento: ${r.evento}` : r.responsavel)}</div>`);
    const aulas = aulasDaSalaNoDia(codigo, data).map(a =>
        `<div>• ${estado.faixas[a.faixa].label} — Aula fixa (${esc(getTurma(a.turma)?.nome || a.turma)}, ${esc(a.professor)})</div>`);
    const linhas = [...reservas, ...aulas];
    return linhas.length
        ? `<strong>Horários já ocupados em ${isoParaBr(data)}:</strong>${linhas.join('')}`
        : `Nenhum horário ocupado em ${isoParaBr(data)}.`;
}

function stepCalendar(codigo, offset = 0) {
    const sala = getSala(codigo);
    if (!sala) return;
    calMesOffset = Math.max(0, offset);
    const hj = partesIso(hoje());
    const base = new Date(hj.a, hj.m + calMesOffset, 1);
    const ano = base.getFullYear(), mes = base.getMonth();
    const diasNoMes = new Date(ano, mes + 1, 0).getDate();
    const primeiroDia = new Date(ano, mes, 1).getDay();
    const diaPadrao = calMesOffset === 0 ? hj.d : 1;

    let dias = ['D', 'S', 'T', 'Q', 'Q', 'S', 'S'].map(d => `<div class="cal-dow">${d}</div>`).join('');
    for (let i = 0; i < primeiroDia; i++) dias += '<div class="calendar-day disabled"></div>';
    for (let d = 1; d <= diasNoMes; d++) {
        const iso = montarIso(ano, mes, d);
        const passado = iso < hoje();
        dias += `<div class="calendar-day ${passado ? 'disabled' : ''} ${d === diaPadrao && !passado ? 'selected' : ''}" data-iso="${iso}">${d}</div>`;
    }

    const dataInicial = montarIso(ano, mes, diaPadrao);
    const sugestao = horarioSugerido(dataInicial);

    content.innerHTML = `
        ${cabecalhoModal('Selecionar Horário', esc(sala.nome))}
        <div class="cal-wrap">
            <div class="cal-header">
                <button class="cal-nav-btn" title="Mês anterior" ${calMesOffset === 0 ? 'disabled style="opacity:.3;cursor:default"' : ''}
                    onclick="stepCalendar('${esc(codigo)}', ${calMesOffset - 1})"><i class="fas fa-chevron-left"></i></button>
                <strong>${MESES[mes]} ${ano}</strong>
                <button class="cal-nav-btn" title="Próximo mês" ${calMesOffset >= 11 ? 'disabled style="opacity:.3;cursor:default"' : ''}
                    onclick="stepCalendar('${esc(codigo)}', ${calMesOffset + 1})"><i class="fas fa-chevron-right"></i></button>
            </div>
            <div class="calendar-grid">${dias}</div>
        </div>
        <p class="hint-text" id="ocupacaoDia">${htmlOcupacaoDoDia(codigo, dataInicial)}</p>
        <label class="field-label">Horário de início</label>
        <input type="time" class="input-field" id="timeStart" value="${sugestao.inicio}">
        <label class="field-label">Horário de término</label>
        <input type="time" class="input-field" id="timeEnd" value="${sugestao.fim}">
        <div class="face-auth-status" id="calStatus" style="display:none"></div>
        <button class="btn-black btn-confirm" id="confirmDate"><i class="fas fa-check"></i> Confirmar Horário</button>
        <button class="btn-outline" onclick="openModal('${esc(codigo)}')">Voltar</button>
    `;

    const diasLivres = content.querySelectorAll('.calendar-day[data-iso]:not(.disabled)');
    diasLivres.forEach(el => el.addEventListener('click', () => {
        diasLivres.forEach(x => x.classList.remove('selected'));
        el.classList.add('selected');
        content.querySelector('#ocupacaoDia').innerHTML = htmlOcupacaoDoDia(codigo, el.dataset.iso);
    }));

    content.querySelector('#confirmDate').addEventListener('click', () => {
        const status = content.querySelector('#calStatus');
        const selecionado = content.querySelector('.calendar-day.selected');
        if (!selecionado) return setStatus(status, 'Selecione um dia no calendário.', 'error');
        const data = selecionado.dataset.iso;
        const hi = content.querySelector('#timeStart').value;
        let hf = content.querySelector('#timeEnd').value;
        if (!hi || !hf) return setStatus(status, 'Informe o horário de início e de término.', 'error');

        const ini = timeToMinutes(hi);
        let fim = timeToMinutes(hf);
        if (fim <= ini) return setStatus(status, 'O horário de término deve ser depois do horário de início.', 'error');
        if (data === hoje() && fim <= timeToMinutes(horaAgora())) return setStatus(status, 'Esse horário já passou. Escolha um horário futuro.', 'error');

        const minimo = estado.regras.reservaMinimaMinutos;
        if (fim - ini < minimo) {
            if (!confirm(`O tempo mínimo de reserva é de ${minimo} minutos. Ajustar o término para ${minutesToTime(ini + minimo)}?`)) return;
            fim = ini + minimo;
            hf = minutesToTime(fim);
        }
        const choqueReserva = reservasDaSalaNoDia(codigo, data)
            .some(r => timeToMinutes(r.inicio) < fim && timeToMinutes(r.fim) > ini);
        if (choqueReserva) return setStatus(status, 'Esse horário já está reservado nesta sala. Veja a lista acima.', 'error');

        // Choque com aula fixa da grade: só o professor daquela aula pode reservar.
        // Deixa seguir e o servidor confere quem é o professor escolhido.
        const aulaNoHorario = aulasDaSalaNoDia(codigo, data).find(a => {
            const f = estado.faixas[a.faixa];
            return timeToMinutes(f.inicio) < fim && timeToMinutes(f.fim) > ini;
        });
        if (aulaNoHorario && !confirm(`Atenção: ${aulaNoHorario.professor} tem aula fixa nesta sala nesse horário. Só ele(a) pode reservar. Continuar?`)) return;

        stepAuth(codigo, data, hi, hf);
    });
}

/* ─── Reserva: identificação do professor ────────────────────────────────── */
function htmlSelectProfessor(id, selecionado = '') {
    return `
        <select class="input-field" id="${id}">
            <option value="">Selecione um professor</option>
            ${estado.professores.map(p => `<option value="${p.id}" ${Number(selecionado) === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
        </select>`;
}

function stepAuth(codigo, data, hi, hf) {
    const sala = getSala(codigo);
    const prefixo = novoPrefixoPainel();
    content.innerHTML = `
        ${cabecalhoModal('Autenticação', `${esc(sala.nome)} · ${isoParaBr(data)} · ${hi}–${hf}`)}
        <p class="modal-sub">Escolha um método para validar sua identidade</p>
        <label class="field-label">Nome do Professor</label>
        ${htmlSelectProfessor('nomeProfSelect')}
        ${htmlPainelIdentificacao(prefixo)}
        <div class="face-auth-status" id="authStatus" style="display:none"></div>
        <button class="btn-black btn-confirm" id="btnFinalizar"><i class="fas fa-shield-alt"></i> Confirmar Identidade</button>
        <button class="btn-outline" onclick="Facial.pararCamera(); stepCalendar('${esc(codigo)}', calMesOffset)">Voltar</button>
    `;
    const painel = ativarPainelIdentificacao(content, prefixo);
    const select = content.querySelector('#nomeProfSelect');
    const status = content.querySelector('#authStatus');
    select.addEventListener('change', () => select.classList.remove('error'));

    const botao = content.querySelector('#btnFinalizar');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        if (!select.value) {
            select.classList.add('error');
            return setStatus(status, 'Selecione o nome do professor.', 'error');
        }
        try {
            setStatus(status, '', 'info');
            const credencial = await painel.obterCredencial();
            setStatus(status, 'Validando identidade e salvando a reserva...', 'info');
            const resultado = await api.post('/api/reservas', {
                sala: codigo, professorId: Number(select.value), data, inicio: hi, fim: hf, credencial
            });
            Facial.pararCamera();
            telaReservaConfirmada(resultado.reserva, resultado.primeiroAcesso, painel.metodo());
            recarregarTudo().catch(() => {});
        } catch (e) {
            setStatus(status, e.message, 'error');
            if (painel.metodo() === 'facial') setStatus(painel.statusFacial, '', 'info');
        }
    }));
}

const NOME_METODO = { cracha: 'crachá', digital: 'digital', facial: 'rosto' };

function telaReservaConfirmada(r, primeiroAcesso, metodo) {
    content.innerHTML = `
        <div class="solenoid-screen">
            <div class="solenoid-title">Reserva confirmada</div>
            <p class="solenoid-sub">A sala <strong>${esc(r.salaNome)}</strong> foi reservada. No horário da reserva, use <strong>Ocupar Sala</strong> para liberar a chave.</p>
            <div class="solenoid-panel">
                <div class="solenoid-row"><span class="lbl">Sala</span><span class="val">${esc(r.salaNome)}</span></div>
                <div class="solenoid-row"><span class="lbl">Professor</span><span class="val">${esc(r.responsavel)}</span></div>
                ${isAdmin && r.codigo ? `<div class="solenoid-row"><span class="lbl">Reserva</span><span class="val">${esc(r.codigo)}</span></div>` : ''}
                <div class="solenoid-row"><span class="lbl">Data</span><span class="val">${isoParaBr(r.data)}</span></div>
                <div class="solenoid-row"><span class="lbl">Horário</span><span class="val">${horarioTexto(r)}</span></div>
            </div>
            ${primeiroAcesso ? `<div class="event-notice">Primeiro acesso: seu ${NOME_METODO[metodo] || 'método'} foi cadastrado. Use o mesmo nas próximas vezes.</div>` : ''}
            <button class="btn-black" onclick="closeM()">
                <i class="fas fa-check"></i> Concluir
            </button>
        </div>
    `;
}

/* ─── Ocupar a sala reservada (libera a chave) ───────────────────────────── */
function ocuparSalaReservada(reservaId) {
    const r = getReserva(reservaId);
    if (!r) return;
    const prefixo = novoPrefixoPainel();
    content.innerHTML = `
        ${cabecalhoModal('Validar ocupação', 'A ocupação só prossegue após validar a identidade do professor da reserva.')}
        <label class="field-label">Professor</label>
        <input type="text" class="input-field" value="${esc(r.responsavel)}" disabled>
        ${htmlPainelIdentificacao(prefixo)}
        <div class="face-auth-status" id="ocupStatus" style="display:none"></div>
        <button class="btn-black btn-confirm" id="btnConfirmarOcupacao"><i class="fas fa-door-open"></i> Confirmar ocupação</button>
        <button class="btn-outline" onclick="Facial.pararCamera(); abrirReserva(${r.id})">Voltar</button>
    `;
    const painel = ativarPainelIdentificacao(content, prefixo);
    const status = content.querySelector('#ocupStatus');
    const botao = content.querySelector('#btnConfirmarOcupacao');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        try {
            setStatus(status, '', 'info');
            const credencial = await painel.obterCredencial();
            setStatus(status, 'Validando identidade...', 'info');
            const resultado = await api.post(`/api/reservas/${r.id}/ocupar`, { credencial });
            Facial.pararCamera();
            renderSolenoidUnlockScreen(resultado);
            recarregarTudo().catch(() => {});
        } catch (e) {
            setStatus(status, e.message, 'error');
        }
    }));
}

/* ─── Tela da solenoide (chave liberada) ─────────────────────────────────── */
/*
 * Ao ocupar a sala o SERVIDOR já manda o ESP32 destravar (modo hardware).
 * Esta tela só mostra o resultado e acompanha o estado real da trava,
 * consultando o ESP32 a cada 1 s. O botão "Destravar novamente" serve para
 * quando o professor não pegou a chave a tempo.
 * Não tem botão de confirmar: depois que a chave é retirada e a solenoide
 * trava, a tela fecha sozinha. O "X" fecha a qualquer momento.
 */
class SolenoidController {
    constructor() {
        this.state = 'locked';
        this.log = [];
        this.onStateChange = null;
        this.timeoutId = null;
        this.monitorId = null;
        this.fecharId = null;
    }

    notificar() {
        if (this.onStateChange) this.onStateChange({ state: this.state, log: [...this.log] });
    }

    addLog(mensagem) {
        const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        this.log.push(`${hora} — ${mensagem}`);
        if (this.log.length > 6) this.log.shift();
        this.notificar();
    }

    setState(state) {
        if (this.state === state) return;
        this.state = state;
        this.notificar();
    }

    parar() {
        clearTimeout(this.timeoutId);
        clearInterval(this.monitorId);
        clearTimeout(this.fecharId);
        this.timeoutId = null;
        this.monitorId = null;
        this.fecharId = null;
    }
}

const solenoidController = new SolenoidController();

/**
 * Mostra o resultado da liberação da chave.
 * `resultado` = { reserva, ticket, solenoide: { modo, ok, mensagem, duracaoMs } }
 */
function renderSolenoidUnlockScreen(resultado) {
    const { reserva: r, ticket } = resultado;
    const hardware = resultado.solenoide.modo === 'hardware';
    const ctl = solenoidController;
    ctl.parar();

    content.innerHTML = `
        <div class="solenoid-screen">
            <button class="btn-close solenoid-close" onclick="closeM()" title="Fechar"><i class="fas fa-times"></i></button>
            <div class="solenoid-badges">
                <span class="solenoid-pill active"><i class="fas fa-key"></i> ${hardware ? 'Modo Hardware' : 'Modo Simulação'}</span>
                <span class="solenoid-pill" id="solenoidPill2"><i class="fas fa-door-open"></i> ${hardware ? 'ESP32' : 'Visual de teste'}</span>
            </div>
            <div class="solenoid-visual unlocking" id="solenoidVisual">
                <div class="solenoid-lock">
                    <div class="solenoid-core"></div>
                </div>
                <div class="solenoid-led" id="solenoidLed"></div>
            </div>
            <div class="solenoid-title" id="solenoidTitulo">Liberando a chave...</div>
            <p class="solenoid-sub" id="solenoidSub"></p>
            <div class="solenoid-panel">
                <div class="solenoid-row"><span class="lbl">Sala</span><span class="val">${esc(r.salaNome)}</span></div>
                <div class="solenoid-row"><span class="lbl">Professor</span><span class="val">${esc(r.responsavel)}</span></div>
                ${isAdmin && r.codigo ? `<div class="solenoid-row"><span class="lbl">Reserva</span><span class="val">${esc(r.codigo)}</span></div>` : ''}
                <div class="solenoid-row"><span class="lbl">Horário</span><span class="val">${horarioTexto(r)}</span></div>
            </div>
            <div class="solenoid-log" id="solenoidLog"></div>
            <div class="solenoid-actions">
                <button class="btn-secondary" id="btnSolNovamente"><i class="fas fa-unlock"></i> Destravar novamente</button>
            </div>
        </div>
    `;

    const visual = content.querySelector('#solenoidVisual');
    const led = content.querySelector('#solenoidLed');
    const logBox = content.querySelector('#solenoidLog');
    const sub = content.querySelector('#solenoidSub');
    const titulo = content.querySelector('#solenoidTitulo');

    ctl.log = [];
    ctl.state = 'unlocking';
    ctl.onStateChange = ({ state, log }) => {
        if (!visual.isConnected) { ctl.parar(); return; }
        visual.classList.remove('unlocking', 'unlocked', 'locked');
        visual.classList.add(state);
        led.style.background = state === 'unlocked' ? '#22c55e' : state === 'unlocking' ? '#f59e0b' : '#ef4444';
        logBox.innerHTML = log.map(item => `<div>${esc(item)}</div>`).join('');
    };

    const mostrar = (textoTitulo, textoSub) => {
        titulo.textContent = textoTitulo;
        sub.innerHTML = textoSub;
    };

    /** Acompanha a trava de verdade pelo ESP32 até ela travar de novo. */
    const monitorarHardware = duracaoMs => {
        const fim = Date.now() + duracaoMs + 15000;
        let consultas = 0;
        let viuDestravada = false;
        let chaveRetirada = false;
        ctl.monitorId = setInterval(async () => {
            if (!visual.isConnected || Date.now() > fim) { ctl.parar(); return; }
            consultas += 1;
            let st;
            try { st = await api.get('/api/solenoide/status'); } catch (_) { return; }
            if (!visual.isConnected) return;
            if (!st.travada) {
                viuDestravada = true;
                ctl.setState('unlocked');
            }
            if (st.chaveEmUso && !chaveRetirada) {
                chaveRetirada = true;
                ctl.addLog('Chave retirada. A solenoide trava em 3 segundos.');
                mostrar('Chave retirada', `Bom uso da sala <strong>${esc(r.salaNome)}</strong>!`);
            }
            if (st.travada && (viuDestravada || consultas >= 2)) {
                ctl.setState('locked');
                ctl.parar();
                if (chaveRetirada) {
                    ctl.addLog('Solenoide travada novamente.');
                    mostrar('Tudo certo!', `Bom uso da sala <strong>${esc(r.salaNome)}</strong>! Esta tela fecha sozinha.`);
                    ctl.fecharId = setTimeout(() => { if (visual.isConnected) closeM(); }, 3000);
                } else {
                    ctl.addLog('Ninguém retirou a chave: a solenoide travou.');
                    mostrar('Solenoide travada', 'Não pegou a chave a tempo? Clique em <strong>Destravar novamente</strong>.');
                }
            }
        }, 1000);
    };

    const aplicarResultado = res => {
        ctl.parar();
        ctl.addLog(res.mensagem);
        const segundos = Math.round((res.duracaoMs || 10000) / 1000);
        if (!res.ok) {
            ctl.setState('locked');
            mostrar('Não foi possível destravar', 'Confira o ESP32 e clique em <strong>Destravar novamente</strong>.');
            return;
        }
        ctl.setState('unlocked');
        mostrar('Chave liberada', `Retire a chave da sala <strong>${esc(r.salaNome)}</strong> em até <strong>${segundos} segundos</strong>.`);
        if (res.modo === 'hardware') {
            monitorarHardware(res.duracaoMs || 10000);
        } else {
            ctl.timeoutId = setTimeout(() => {
                ctl.setState('locked');
                ctl.addLog('Simulação: solenoide travada novamente.');
                mostrar('Solenoide travada', 'Não pegou a chave a tempo? Clique em <strong>Destravar novamente</strong>.');
            }, res.duracaoMs || 10000);
        }
    };

    ctl.notificar();
    ctl.addLog(`Ocupação registrada para ${r.salaNome}.`);
    if (!hardware && !estado.esp32Configurado) {
        ctl.addLog('Para acionar o ESP32, preencha ESP32_HOST no arquivo .env.');
    }
    aplicarResultado(resultado.solenoide);

    const botao = content.querySelector('#btnSolNovamente');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        ctl.parar();
        ctl.setState('unlocking');
        mostrar('Liberando a chave...', '');
        ctl.addLog('Enviando comando para destravar...');
        try {
            aplicarResultado(await api.post('/api/solenoide/destravar', { ticket }));
        } catch (e) {
            ctl.setState('locked');
            ctl.addLog(e.message);
            mostrar('Não foi possível destravar', esc(e.message));
        }
    }));
}

/* ─── Desocupar a sala ───────────────────────────────────────────────────── */
function stepLiberarSala(reservaId) {
    const r = getReserva(reservaId);
    if (!r) return;
    const prefixo = novoPrefixoPainel();
    content.innerHTML = `
        ${cabecalhoModal('Desocupar Sala', esc(r.salaNome))}
        <p class="modal-sub">Para desocupar a sala, valide a identidade do professor que está com ela:</p>
        <label class="field-label">Professor</label>
        <input type="text" class="input-field" value="${esc(r.responsavel)}" disabled>
        ${htmlPainelIdentificacao(prefixo)}
        <div class="face-auth-status" id="libStatus" style="display:none"></div>
        <div class="modal-actions">
            <button class="btn-secondary" onclick="Facial.pararCamera(); abrirReserva(${r.id})">Voltar</button>
            <button class="btn-black btn-confirm" id="btnLiberarConfirm" style="flex:1;margin-top:0">
                <i class="fas fa-check"></i> Desocupar
            </button>
        </div>
    `;
    const painel = ativarPainelIdentificacao(content, prefixo);
    const status = content.querySelector('#libStatus');
    const botao = content.querySelector('#btnLiberarConfirm');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        try {
            setStatus(status, '', 'info');
            const credencial = await painel.obterCredencial();
            setStatus(status, 'Validando identidade...', 'info');
            const finalizada = await api.post(`/api/reservas/${r.id}/desocupar`, { credencial });
            Facial.pararCamera();
            content.innerHTML = `
                <div class="success-icon">✓</div>
                <p class="success-title">Sala Desocupada!</p>
                <p class="success-msg">${esc(finalizada.salaNome)} foi liberada com sucesso.</p>
                <div class="reserva-info" style="margin-top:12px">
                    <div class="info-row"><span class="lbl">Sala</span><span class="val">${esc(finalizada.salaNome)}</span></div>
                    <div class="info-row"><span class="lbl">Professor</span><span class="val">${esc(finalizada.responsavel)}</span></div>
                    <div class="info-row"><span class="lbl">Horário</span><span class="val">${horarioTexto(finalizada)}</span></div>
                </div>
                <p class="success-msg" id="desocupadaAviso">Esta tela fecha sozinha em 3 segundos.</p>
            `;
            const aviso = content.querySelector('#desocupadaAviso');
            setTimeout(() => { if (aviso.isConnected) closeM(); }, 3000);
            recarregarTudo().catch(() => {});
        } catch (e) {
            setStatus(status, e.message, 'error');
        }
    }));
}

/* ─── Mudança de sala ────────────────────────────────────────────────────── */
function solicitarMudanca(reservaId) {
    const r = getReserva(reservaId);
    if (!r) return;
    const livres = estado.salas.filter(s => s.codigo !== r.sala
        && salaDisponivel(s.codigo, r.data, r.inicio, r.fim, { professorId: r.professorId }));
    if (!livres.length) {
        alert('Nenhuma outra sala está livre nesse horário.');
        return;
    }
    const prefixo = novoPrefixoPainel();
    content.innerHTML = `
        ${cabecalhoModal('Solicitar Mudança de Sala', `${isoParaBr(r.data)} · ${horarioTexto(r)}`)}
        <p class="modal-sub">A reserva será transferida para a nova sala e a sala atual ficará livre nesse horário.</p>
        <label class="field-label">Sala Atual</label>
        <input type="text" class="input-field" value="${esc(r.salaNome)}" disabled>
        <label class="field-label">Nova Sala (livres nesse horário)</label>
        <select class="input-field" id="novaSalaSelect">
            ${livres.map(s => `<option value="${esc(s.codigo)}">${esc(s.nome)}</option>`).join('')}
        </select>
        <label class="field-label">Professor</label>
        <input type="text" class="input-field" value="${esc(r.responsavel)}" disabled>
        ${htmlPainelIdentificacao(prefixo)}
        <div class="face-auth-status" id="mudStatus" style="display:none"></div>
        <button class="btn-black btn-confirm" id="btnConfirmarMudanca"><i class="fas fa-exchange-alt"></i> Confirmar Mudança</button>
        <button class="btn-outline" onclick="Facial.pararCamera(); abrirReserva(${r.id})">Voltar</button>
    `;
    const painel = ativarPainelIdentificacao(content, prefixo);
    const status = content.querySelector('#mudStatus');
    const botao = content.querySelector('#btnConfirmarMudanca');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        const novaSala = content.querySelector('#novaSalaSelect').value;
        try {
            setStatus(status, '', 'info');
            const credencial = await painel.obterCredencial();
            setStatus(status, 'Validando identidade...', 'info');
            const atualizada = await api.post(`/api/reservas/${r.id}/mudar-sala`, { novaSala, credencial });
            Facial.pararCamera();
            content.innerHTML = `
                <div class="success-icon">🔄</div>
                <p class="success-title">Mudança Confirmada!</p>
                <p class="success-msg">A reserva foi transferida para a nova sala e a sala anterior ficou livre nesse horário.</p>
                <div class="reserva-info" style="margin-top:12px">
                    <div class="info-row"><span class="lbl">Sala Anterior</span><span class="val">${esc(r.salaNome)}</span></div>
                    <div class="info-row"><span class="lbl">Nova Sala</span><span class="val">${esc(atualizada.salaNome)}</span></div>
                    <div class="info-row"><span class="lbl">Horário</span><span class="val">${isoParaBr(atualizada.data)} · ${horarioTexto(atualizada)}</span></div>
                </div>
                <button class="btn-black" onclick="closeM()"><i class="fas fa-check"></i> Concluir</button>
            `;
            recarregarTudo().catch(() => {});
        } catch (e) {
            setStatus(status, e.message, 'error');
        }
    }));
}
