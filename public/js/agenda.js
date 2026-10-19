/* ═══════════════════════════════════════════════════════════════════════════
   AGENDA — calendário mensal com reservas e eventos

   Layout:
     - em cima, à esquerda: calendário do mês
     - em cima, à direita (painel pequeno): histórico de reservas
     - embaixo: o que acontece no dia clicado (reservas, eventos e aulas da grade)
═══════════════════════════════════════════════════════════════════════════ */

let agendaMes = null;
let agendaAno = null;
let agendaDiaSel = null;
let agendaHistoricoPagina = 1;
let agendaProfArraste = '';
const AGENDA_HISTORICO_POR_PAGINA = 4;

/** Reservas que aparecem no calendário (canceladas e expiradas ficam de fora). */
function reservasDaAgenda() {
    const porId = new Map();
    [...estado.historico, ...estado.reservas].forEach(r => porId.set(r.id, r));
    return [...porId.values()].filter(r => r.status !== 'cancelada' && r.status !== 'expirada');
}

function classeAgenda(r) {
    if (r.status === 'em_uso') return 'ocupada';
    return r.tipo === 'evento' ? 'evento' : 'reservada';
}

function renderAgenda() {
    currentView = 'agenda';
    andarAtual = null;
    setNavigationSelection('agenda');
    setHeader('Agenda', 'Calendário de reservas e eventos');
    renderStats(estado.salas);

    if (agendaMes === null) {
        const h = partesIso(hoje());
        agendaMes = h.m;
        agendaAno = h.a;
        agendaDiaSel = h.d;
    }

    document.getElementById('roomsContainer').innerHTML = `
        <div class="agenda-wrap" id="agendaWrap">
            <div class="agenda-cal" id="agendaCal"></div>
            <div class="agenda-side">
                <div class="agenda-side-header">
                    <h3><i class="fas fa-history" style="margin-right:6px;color:var(--main-purple)"></i>Histórico de Reservas</h3>
                    <p id="agHistSub">Mais recentes primeiro</p>
                </div>
                <div class="agenda-hist-list" id="agHistList"></div>
                <div class="agenda-hist-pag" id="agHistPag"></div>
            </div>
        </div>

        <div class="historico-section agenda-dia-section" id="agendaDia"></div>

        ${isAdmin ? renderPainelArrasteGrade() : ''}
    `;
    paintCal();
    paintHistoricoLateral();
    if (agendaDiaSel) selectDia(agendaDiaSel);
    else paintDiaVazio();
    if (isAdmin) ativarPainelArrasteGrade();
}

/** Histórico no painel lateral pequeno (cartões compactos, com páginas). */
function paintHistoricoLateral() {
    const lista = document.getElementById('agHistList');
    if (!lista) return;
    const registros = [...estado.historico].sort((a, b) => (b.data + b.inicio).localeCompare(a.data + a.inicio));
    const totalPaginas = Math.max(1, Math.ceil(registros.length / AGENDA_HISTORICO_POR_PAGINA));
    agendaHistoricoPagina = Math.min(Math.max(1, agendaHistoricoPagina), totalPaginas);
    const pagina = registros.slice((agendaHistoricoPagina - 1) * AGENDA_HISTORICO_POR_PAGINA, agendaHistoricoPagina * AGENDA_HISTORICO_POR_PAGINA);

    document.getElementById('agHistSub').textContent = registros.length
        ? `${registros.length} registro${registros.length > 1 ? 's' : ''} · mais recentes primeiro`
        : 'Nenhum registro ainda';

    lista.innerHTML = registros.length ? pagina.map(r => `
        <div class="ag-event-card ag-hist-card ${classeHistoricoLateral(r)}" onclick="abrirReserva(${r.id})">
            <h4>${esc(r.salaNome)}</h4>
            <p class="ag-time"><i class="fas fa-calendar" style="font-size:9px;margin-right:3px"></i>${isoParaBr(r.data)} · ${horarioTexto(r)}${isAdmin && r.codigo ? ` <span class="ag-hist-id">${esc(r.codigo)}</span>` : ''}</p>
            <div class="ag-hist-linha">
                <span class="ag-meta"><i class="fas fa-user" style="font-size:9px;margin-right:3px"></i>${esc(r.responsavel)}</span>
                ${badgeStatusHistorico(statusExibicao(r))}
            </div>
        </div>
    `).join('') : `<div class="ag-empty"><i class="fas fa-history"></i><p>Nenhuma reserva ou<br>evento registrado.</p></div>`;

    document.getElementById('agHistPag').innerHTML = totalPaginas > 1 ? `
        <button class="hst-page-btn" title="Página anterior" ${agendaHistoricoPagina === 1 ? 'disabled' : ''} onclick="mudarPaginaHistoricoAgenda(-1)">
            <i class="fas fa-chevron-left"></i>
        </button>
        <span>Página ${agendaHistoricoPagina} de ${totalPaginas}</span>
        <button class="hst-page-btn" title="Próxima página" ${agendaHistoricoPagina === totalPaginas ? 'disabled' : ''} onclick="mudarPaginaHistoricoAgenda(1)">
            <i class="fas fa-chevron-right"></i>
        </button>` : '';
}

/** Cor da borda do cartão do histórico, igual às cores da legenda. */
function classeHistoricoLateral(r) {
    if (r.status === 'cancelada' || r.status === 'expirada' || r.status === 'concluida') return 'inativa';
    return classeAgenda(r);
}

function mudarPaginaHistoricoAgenda(delta) {
    agendaHistoricoPagina += delta;
    paintHistoricoLateral();
}

function mapaDoMes(m, a) {
    const mapa = {};
    reservasDaAgenda().forEach(r => {
        const p = partesIso(r.data);
        if (p.m !== m || p.a !== a) return;
        const tipo = classeAgenda(r);
        if (!mapa[p.d]) mapa[p.d] = [];
        if (!mapa[p.d].includes(tipo)) mapa[p.d].push(tipo);
    });
    return mapa;
}

function paintCal() {
    const cal = document.getElementById('agendaCal');
    if (!cal) return;
    const h = partesIso(hoje());
    const primeiroDia = new Date(agendaAno, agendaMes, 1).getDay();
    const diasNoMes = new Date(agendaAno, agendaMes + 1, 0).getDate();
    const mapa = mapaDoMes(agendaMes, agendaAno);

    cal.innerHTML = `
        <div class="agenda-cal-header">
            <div>
                <h2>${MESES[agendaMes]} ${agendaAno}</h2>
                <p>${diasNoMes} dias · ${Object.keys(mapa).length} dias com atividades</p>
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
    for (let i = 0; i < primeiroDia; i++) {
        const vazio = document.createElement('div');
        vazio.className = 'ag-day empty';
        grid.appendChild(vazio);
    }
    for (let d = 1; d <= diasNoMes; d++) {
        const ehHoje = d === h.d && agendaMes === h.m && agendaAno === h.a;
        const selecionado = d === agendaDiaSel;
        const celula = document.createElement('div');
        celula.className = `ag-day${ehHoje ? ' today' : ''}${selecionado && !ehHoje ? ' selected-day' : ''}`;
        celula.innerHTML = `
            <span class="ag-day-num">${d}</span>
            <div class="ag-dots">${(mapa[d] || []).map(t => `<span class="dot-${t}"></span>`).join('')}</div>
        `;
        celula.addEventListener('click', () => selectDia(d));
        // Administrador pode soltar aqui um bloco da grade para criar um evento nesse dia
        celula.addEventListener('dragover', ev => { if (isAdmin) ev.preventDefault(); });
        celula.addEventListener('drop', ev => {
            if (!isAdmin) return;
            ev.preventDefault();
            try {
                const dados = JSON.parse(ev.dataTransfer.getData('text/plain') || '{}');
                const aula = estado.grade.find(a => a.id === dados.aulaId);
                if (aula) criarEventoDaGrade(aula, montarIso(agendaAno, agendaMes, d));
            } catch (_) { /* arraste inválido */ }
        });
        grid.appendChild(celula);
    }
}

function agendaNavMes(delta) {
    agendaMes += delta;
    if (agendaMes > 11) { agendaMes = 0; agendaAno++; }
    if (agendaMes < 0) { agendaMes = 11; agendaAno--; }
    agendaDiaSel = null;
    paintCal();
    paintDiaVazio();
}

const LEGENDA_AGENDA = `
    <div class="ag-legend">
        <div class="ag-legend-item"><span style="background:var(--purple)"></span>Reservada</div>
        <div class="ag-legend-item"><span style="background:var(--red)"></span>Ocupada</div>
        <div class="ag-legend-item"><span style="background:var(--orange)"></span>Evento</div>
        <div class="ag-legend-item"><span style="background:var(--main-purple)"></span>Aula da grade</div>
    </div>`;

/** Parte de baixo quando nenhum dia está selecionado. */
function paintDiaVazio() {
    const secao = document.getElementById('agendaDia');
    if (!secao) return;
    secao.innerHTML = `
        <div class="section-title agenda-dia-header">
            <div>
                <h2><i class="fas fa-calendar-day" style="margin-right:8px;color:var(--main-purple)"></i>Selecione um dia</h2>
                <p>Clique em qualquer dia do calendário para ver as reservas, eventos e aulas</p>
            </div>
            ${LEGENDA_AGENDA}
        </div>
        <div class="ag-empty"><i class="fas fa-calendar-day"></i><p>Selecione um dia no calendário acima</p></div>`;
}

/** Mostra embaixo tudo o que acontece no dia clicado. */
function selectDia(d) {
    agendaDiaSel = d;
    paintCal();
    const secao = document.getElementById('agendaDia');
    if (!secao) return;
    const iso = montarIso(agendaAno, agendaMes, d);
    const doDia = reservasDaAgenda().filter(r => r.data === iso).sort((a, b) => a.inicio.localeCompare(b.inicio));
    const dia = diaDaSemanaIso(iso);
    const aulas = dia === null ? [] : estado.grade
        .filter(a => a.dia === dia)
        .sort((a, b) => a.faixa - b.faixa || nomeSala(a.sala).localeCompare(nomeSala(b.sala), 'pt-BR', { numeric: true }));
    const total = doDia.length + aulas.length;

    const tabelaReservas = doDia.length ? `
        <div class="historico-table-wrap">
            <table class="historico-table">
                <thead><tr><th>Horário</th><th>Sala</th><th>Responsável</th><th>Status</th></tr></thead>
                <tbody>
                    ${doDia.map(r => `
                        <tr class="agenda-linha ${classeAgenda(r)}" onclick="abrirReserva(${r.id})" title="Ver detalhes">
                            <td class="agenda-hora">${horarioTexto(r)}</td>
                            <td>${esc(r.salaNome)} <small style="color:#9ca3af">${andarDisplay(r.andar)}</small></td>
                            <td>${esc(r.responsavel)}</td>
                            <td>${badgeStatusHistorico(statusExibicao(r), r.evento)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>` : '<p class="agenda-history-empty" style="margin:0 0 4px">Nenhuma reserva ou evento neste dia.</p>';

    const tabelaAulas = aulas.length ? `
        <div class="historico-table-wrap">
            <table class="historico-table">
                <thead><tr><th>Horário</th><th>Sala</th><th>Turma</th><th>Professor</th></tr></thead>
                <tbody>
                    ${aulas.map(a => `
                        <tr class="agenda-linha grade">
                            <td class="agenda-hora">${estado.faixas[a.faixa].label}</td>
                            <td>${esc(nomeSala(a.sala))}</td>
                            <td>${esc(nomeTurma(a.turma))}</td>
                            <td>${esc(a.professor)}</td>
                        </tr>`).join('')}
                </tbody>
            </table>
        </div>` : `<p class="agenda-history-empty" style="margin:0">${dia === null ? 'Fim de semana: sem aulas na grade.' : 'Nenhuma aula da grade neste dia.'}</p>`;

    secao.innerHTML = `
        <div class="section-title agenda-dia-header">
            <div>
                <h2><i class="fas fa-calendar-day" style="margin-right:8px;color:var(--main-purple)"></i>${estado.dias[dia] ? `${estado.dias[dia]}, ` : ''}${isoParaBr(iso)}</h2>
                <p>${total ? `${total} atividade${total > 1 ? 's' : ''} neste dia` : 'Dia livre: sem reservas, eventos ou aulas'}</p>
            </div>
            ${LEGENDA_AGENDA}
        </div>
        <h4 class="agenda-dia-sub"><i class="fas fa-bookmark"></i> Reservas e eventos</h4>
        ${tabelaReservas}
        <h4 class="agenda-dia-sub"><i class="fas fa-chalkboard-teacher"></i> Aulas da grade</h4>
        ${tabelaAulas}
    `;
}

/* ─── Arrastar aula da grade para um dia (somente administrador) ─────────── */
function renderPainelArrasteGrade() {
    const prof = getProfessor(agendaProfArraste);
    const aulas = prof ? estado.grade.filter(a => a.professorId === prof.id).sort((a, b) => a.dia - b.dia || a.faixa - b.faixa) : [];
    return `
        <div class="grade-section">
            <div class="grade-header">
                <div>
                    <h2><i class="fas fa-hand-pointer" style="margin-right:8px;color:var(--main-purple)"></i>Arrastar aula da grade</h2>
                    <p class="grade-sub">Arraste um bloco até um dia do calendário para criar um evento com a sala e o horário dessa aula</p>
                </div>
            </div>
            <div class="grade-filtros">
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Professor</label>
                    <select class="input-field grade-select" id="agendaProfArraste">
                        <option value="">— Selecione um professor —</option>
                        ${estado.professores.map(p => `<option value="${p.id}" ${prof && prof.id === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
                    </select>
                </div>
            </div>
            <div style="display:flex;flex-wrap:wrap;gap:8px">
                ${prof && !aulas.length ? '<p class="grade-sub">Este professor não tem aulas na grade.</p>' : ''}
                ${aulas.map(a => `
                    <div class="gh-aula" draggable="true" ondragstart="iniciarArrasteGrade(event, ${a.id})" style="cursor:grab;min-width:180px">
                        <span class="gh-turma">${esc(nomeTurma(a.turma))}</span>
                        <span class="gh-sala">${esc(nomeSala(a.sala))}</span>
                        <span class="gh-prof">${estado.dias[a.dia]} · ${estado.faixas[a.faixa].label}</span>
                    </div>`).join('')}
            </div>
        </div>`;
}

function ativarPainelArrasteGrade() {
    document.getElementById('agendaProfArraste')?.addEventListener('change', e => {
        agendaProfArraste = e.target.value;
        renderAgenda();
    });
}

async function criarEventoDaGrade(aula, dataIso) {
    const faixa = estado.faixas[aula.faixa];
    const descricao = `Aula: ${nomeTurma(aula.turma)}`;
    if (!confirm(`Criar o evento "${descricao}" na ${nomeSala(aula.sala)} em ${isoParaBr(dataIso)}, ${faixa.label}, com ${aula.professor}?`)) return;
    try {
        const ev = await api.post('/api/eventos', {
            sala: aula.sala,
            professorId: aula.professorId,
            descricao,
            data: dataIso,
            inicio: faixa.inicio,
            fim: faixa.fim
        });
        telaEventoCriado(ev);
        abrirModal();
        await recarregarTudo();
    } catch (e) {
        alert(`Não foi possível criar o evento: ${e.message}`);
    }
}
