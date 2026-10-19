/* ═══════════════════════════════════════════════════════════════════════════
   HISTÓRICO DE RESERVAS
   A página é montada uma vez (filtros + busca) e só a tabela é redesenhada,
   assim o campo de busca não perde o foco enquanto você digita.
═══════════════════════════════════════════════════════════════════════════ */

let histFiltroProf = '';
let histFiltroStatus = '';
let histBusca = '';
let histPagina = 1;
let histPorPagina = 10;

const STATUS_HISTORICO = {
    reservada: ['badge-reservada', 'Reservada'],
    ocupada: ['badge-ocupada', 'Ocupada'],
    concluida: ['badge-concluida', 'Concluída'],
    evento: ['badge-evento', 'Evento'],
    forcada: ['badge-forcada', 'Ocupação Forçada'],
    liberacao: ['badge-liberacao', 'Desocupação Forçada'],
    cancelada: ['badge-cancelada', 'Cancelada'],
    expirada: ['badge-expirada', 'Não utilizada'],
    grade: ['badge-grade', 'Grade Fixa']
};

/** Converte status + marcações da reserva em um status de exibição. */
function statusExibicao(r) {
    if (r.status === 'cancelada') return 'cancelada';
    if (r.status === 'expirada') return 'expirada';
    if (r.tipo === 'evento') return 'evento';
    if (r.liberacaoForcada) return 'liberacao';
    if (r.ocupacaoForcada) return 'forcada';
    if (r.status === 'em_uso') return 'ocupada';
    if (r.status === 'concluida') return 'concluida';
    return 'reservada';
}

function badgeStatusHistorico(status, nomeEvento) {
    const [classe, rotulo] = STATUS_HISTORICO[status] || ['badge-livre', status];
    const badge = `<span class="status-badge ${classe}">${rotulo}</span>`;
    if (status === 'evento' && nomeEvento) {
        return `${badge} <span class="ev-tag" style="color:var(--orange);font-weight:600;margin-left:6px">${esc(nomeEvento)}</span>`;
    }
    return badge;
}

function registrosHistorico() {
    const reservas = estado.historico.map(r => ({
        id: r.codigo || '',
        sala: r.salaNome,
        professor: r.responsavel,
        turma: '—',
        dataTexto: isoParaBr(r.data),
        ordem: r.data + r.inicio,
        horario: horarioTexto(r),
        status: statusExibicao(r),
        evento: r.evento || '',
        tipo: r.tipo,
        ativa: r.status === 'agendada' || r.status === 'em_uso'
    }));
    const aulas = estado.grade.map(a => ({
        id: '',
        sala: nomeSala(a.sala),
        professor: a.professor,
        turma: nomeTurma(a.turma),
        dataTexto: `${estado.dias[a.dia]} (${estado.faixas[a.faixa].label})`,
        ordem: '',
        horario: estado.faixas[a.faixa].label,
        status: 'grade',
        evento: '',
        tipo: 'grade',
        ativa: true
    }));
    return [...reservas, ...aulas];
}

function renderHistorico() {
    const jaMontado = currentView === 'historico' && document.getElementById('hstResultados');
    currentView = 'historico';
    andarAtual = null;
    setNavigationSelection('historico');
    setHeader('Histórico de Reservas', 'Todas as reservas, ocupações e eventos registrados');
    renderStats(estado.salas);

    if (!jaMontado) {
        const statusOpts = Object.entries(STATUS_HISTORICO)
            .map(([v, [, l]]) => `<option value="${v}" ${histFiltroStatus === v ? 'selected' : ''}>${l}</option>`).join('');
        document.getElementById('roomsContainer').innerHTML = `
            <div class="hst-wrap">
                <div class="hst-cards" id="hstCards"></div>
                <div class="hst-filters">
                    <div class="hst-filter-group">
                        <i class="fas fa-search hst-search-icon"></i>
                        <input class="hst-search" id="hstBusca" type="text" placeholder="Buscar sala, professor, turma${isAdmin ? ' ou ID' : ''}…" value="${esc(histBusca)}">
                    </div>
                    <select class="input-field hst-select" id="hstProf">
                        <option value="">Todos os professores</option>
                        ${estado.professores.map(p => `<option value="${esc(p.nome)}" ${histFiltroProf === p.nome ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
                    </select>
                    <select class="input-field hst-select" id="hstStatus">
                        <option value="">Todos os status</option>
                        ${statusOpts}
                    </select>
                    <button class="hst-clear" id="hstLimpar" style="display:none"><i class="fas fa-times"></i> Limpar filtros</button>
                </div>
                <div id="hstResultados"></div>
            </div>
        `;
        const busca = document.getElementById('hstBusca');
        busca.addEventListener('input', debounce(() => { histBusca = busca.value; histPagina = 1; renderResultadosHistorico(); }, 150));
        document.getElementById('hstProf').addEventListener('change', e => { histFiltroProf = e.target.value; histPagina = 1; renderResultadosHistorico(); });
        document.getElementById('hstStatus').addEventListener('change', e => { histFiltroStatus = e.target.value; histPagina = 1; renderResultadosHistorico(); });
        document.getElementById('hstLimpar').addEventListener('click', () => {
            histFiltroProf = histFiltroStatus = histBusca = '';
            histPagina = 1;
            busca.value = '';
            document.getElementById('hstProf').value = '';
            document.getElementById('hstStatus').value = '';
            renderResultadosHistorico();
        });
    }
    renderResultadosHistorico();
}

function mudarPaginaHistorico(pagina) {
    histPagina = pagina;
    renderResultadosHistorico();
}

function mudarTamanhoPaginaHistorico(tamanho) {
    histPorPagina = Number(tamanho) || 10;
    histPagina = 1;
    renderResultadosHistorico();
}

function renderResultadosHistorico() {
    const alvo = document.getElementById('hstResultados');
    if (!alvo) return;
    const registros = registrosHistorico();
    const termo = histBusca.trim().toLowerCase();

    const filtrados = registros
        .filter(r => (!histFiltroProf || r.professor === histFiltroProf)
            && (!histFiltroStatus || r.status === histFiltroStatus)
            && (!termo || [r.sala, r.professor, r.turma, isAdmin ? r.id : ''].some(v => String(v).toLowerCase().includes(termo))))
        .sort((a, b) => (b.ordem || '').localeCompare(a.ordem || ''));

    const totalPaginas = Math.max(1, Math.ceil(filtrados.length / histPorPagina));
    histPagina = Math.min(Math.max(1, histPagina), totalPaginas);
    const pagina = filtrados.slice((histPagina - 1) * histPorPagina, histPagina * histPorPagina);

    // Cards de resumo
    const ativas = registros.filter(r => r.tipo === 'reserva' && r.ativa).length;
    const aulas = registros.filter(r => r.tipo === 'grade').length;
    const professores = new Set(registros.map(r => r.professor)).size;
    const salas = new Set(registros.map(r => r.sala)).size;
    document.getElementById('hstCards').innerHTML = `
        <div class="hst-card hst-card-purple"><i class="fas fa-calendar-check"></i>
            <div><span class="hst-card-num">${ativas}</span><span class="hst-card-lbl">Reservas ativas</span></div></div>
        <div class="hst-card hst-card-teal"><i class="fas fa-table"></i>
            <div><span class="hst-card-num">${aulas}</span><span class="hst-card-lbl">Aulas na grade</span></div></div>
        <div class="hst-card hst-card-blue"><i class="fas fa-chalkboard-teacher"></i>
            <div><span class="hst-card-num">${professores}</span><span class="hst-card-lbl">Professores</span></div></div>
        <div class="hst-card hst-card-green"><i class="fas fa-door-open"></i>
            <div><span class="hst-card-num">${salas}</span><span class="hst-card-lbl">Salas envolvidas</span></div></div>
    `;
    document.getElementById('hstLimpar').style.display = (histFiltroProf || histFiltroStatus || histBusca) ? '' : 'none';

    const colunas = isAdmin ? 7 : 6;
    const linhas = pagina.length ? pagina.map(r => {
        const iniciais = r.professor.split(' ').filter((_, i) => i > 0).map(s => s[0]).join('').slice(0, 2) || '?';
        return `
            <tr>
                ${isAdmin ? `<td class="mono hst-id">${esc(r.id || '—')}</td>` : ''}
                <td class="hst-sala">${esc(r.sala)}</td>
                <td class="hst-prof"><span class="hst-avatar">${esc(iniciais)}</span> ${esc(r.professor)}</td>
                <td>${esc(r.turma)}</td>
                <td>${esc(r.dataTexto)}</td>
                <td>${esc(r.horario)}</td>
                <td>${badgeStatusHistorico(r.status, r.evento)}</td>
            </tr>`;
    }).join('') : `
        <tr><td colspan="${colunas}" class="hst-empty">
            <i class="fas fa-search"></i> Nenhum registro encontrado para os filtros selecionados.
        </td></tr>`;

    alvo.innerHTML = `
        <div class="hst-result-count">
            <span>${filtrados.length} registro${filtrados.length !== 1 ? 's' : ''} encontrado${filtrados.length !== 1 ? 's' : ''}</span>
            ${filtrados.length !== registros.length ? `<span class="hst-result-total">de ${registros.length} no total</span>` : ''}
            <label class="hst-page-size">Mostrar
                <select onchange="mudarTamanhoPaginaHistorico(this.value)">
                    ${[10, 25, 50].map(n => `<option value="${n}" ${histPorPagina === n ? 'selected' : ''}>${n}</option>`).join('')}
                </select>
            </label>
        </div>
        <div class="hst-table-wrap">
            <table class="hst-table">
                <thead>
                    <tr>${isAdmin ? '<th>ID</th>' : ''}<th>Sala</th><th>Professor</th><th>Turma</th><th>Data / Dia</th><th>Horário</th><th>Status</th></tr>
                </thead>
                <tbody>${linhas}</tbody>
            </table>
        </div>
        ${filtrados.length ? `
        <div class="hst-pagination">
            <button class="hst-page-btn" ${histPagina === 1 ? 'disabled' : ''} onclick="mudarPaginaHistorico(${histPagina - 1})">
                <i class="fas fa-chevron-left"></i> Anterior
            </button>
            <span>Página ${histPagina} de ${totalPaginas}</span>
            <button class="hst-page-btn" ${histPagina === totalPaginas ? 'disabled' : ''} onclick="mudarPaginaHistorico(${histPagina + 1})">
                Próxima <i class="fas fa-chevron-right"></i>
            </button>
        </div>` : ''}
    `;
}
