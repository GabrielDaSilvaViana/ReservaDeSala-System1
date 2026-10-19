/* ═══════════════════════════════════════════════════════════════════════════
   GRADE HORÁRIA — visualização (todos) e edição (administrador)
   Toda alteração é salva no banco pela API /api/grade.
═══════════════════════════════════════════════════════════════════════════ */

let gradeFiltroProfessor = '';
let gradeFiltroSala = '';
let gradeFiltroTurma = '';
let adminGradeProfSel = '';

const nomeTurma = id => getTurma(id)?.nome || id;

/* ─── Visualização: "Grade do Professor" ─────────────────────────────────── */
function renderGradeProfessor(professor) {
    if (professor !== undefined) gradeFiltroProfessor = professor;
    currentView = 'gradeProfessor';
    andarAtual = null;
    setNavigationSelection('gradeProfessor');
    setHeader('Grade do Professor', 'Grade horária semanal');
    renderStats(estado.salas);
    document.getElementById('roomsContainer').innerHTML = renderGradeHoraria();
}

function filtrarGrade(campo, valor) {
    if (campo === 'professor') gradeFiltroProfessor = valor;
    if (campo === 'sala') gradeFiltroSala = valor;
    if (campo === 'turma') gradeFiltroTurma = valor;
    renderGradeProfessor();
}

function renderGradeHoraria() {
    const aulasFiltradas = estado.grade.filter(a =>
        (!gradeFiltroProfessor || a.professor === gradeFiltroProfessor)
        && (!gradeFiltroSala || a.sala === gradeFiltroSala)
        && (!gradeFiltroTurma || a.turma === gradeFiltroTurma));

    const grade = estado.dias.map(() => estado.faixas.map(() => []));
    aulasFiltradas.forEach(a => grade[a.dia]?.[a.faixa]?.push(a));

    const linhas = estado.faixas.map((faixa, fi) => {
        const colunas = grade.map(dia => {
            const aulas = dia[fi];
            if (!aulas.length) return '<td class="gh-cell vazia"><span class="gh-livre">—</span></td>';
            return `<td class="gh-cell ocupada">${aulas.map(a => `
                <div class="gh-aula">
                    <span class="gh-turma">${esc(nomeTurma(a.turma))}</span>
                    <span class="gh-sala">${esc(nomeSala(a.sala))}</span>
                    ${!gradeFiltroProfessor ? `<span class="gh-prof">${esc(a.professor.replace('Prof. ', ''))}</span>` : ''}
                </div>`).join('')}</td>`;
        }).join('');
        return `<tr><td class="gh-hora">${faixa.label}</td>${colunas}</tr>`;
    }).join('');

    const opcao = (valor, texto, atual) => `<option value="${esc(valor)}" ${atual === valor ? 'selected' : ''}>${esc(texto)}</option>`;
    const professoresComNome = [...new Set(estado.professores.map(p => p.nome))];

    return `
        <div class="grade-section">
            <div class="grade-header">
                <div>
                    <h2><i class="fas fa-table" style="margin-right:8px;color:var(--main-purple)"></i>Grade Horária Semanal</h2>
                    <p class="grade-sub">Visualize a ocupação semanal por professor, sala ou turma</p>
                </div>
            </div>
            <div class="grade-filtros">
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Professor</label>
                    <select class="input-field grade-select" onchange="filtrarGrade('professor', this.value)">
                        <option value="">Todos os professores</option>
                        ${professoresComNome.map(n => opcao(n, n, gradeFiltroProfessor)).join('')}
                    </select>
                </div>
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Sala</label>
                    <select class="input-field grade-select" onchange="filtrarGrade('sala', this.value)">
                        <option value="">Todas as salas</option>
                        ${estado.salas.map(s => opcao(s.codigo, s.nome, gradeFiltroSala)).join('')}
                    </select>
                </div>
                <div class="grade-filtro-group">
                    <label class="field-label" style="margin-top:0">Turma / Curso</label>
                    <select class="input-field grade-select" onchange="filtrarGrade('turma', this.value)">
                        <option value="">Todas as turmas</option>
                        ${estado.turmas.map(t => opcao(t.id, `${t.nome} — ${t.curso}`, gradeFiltroTurma)).join('')}
                    </select>
                </div>
            </div>
            <div class="grade-table-wrap">
                <table class="grade-table">
                    <thead><tr><th class="gh-hora-head">Horário</th>${estado.dias.map(d => `<th>${d}</th>`).join('')}</tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
            ${gradeFiltroProfessor ? renderInfoProfessor(gradeFiltroProfessor) : ''}
        </div>
    `;
}

function renderInfoProfessor(nome) {
    const aulas = estado.grade.filter(a => a.professor === nome);
    const salas = [...new Set(aulas.map(a => a.sala))];
    const turmasUsadas = [...new Set(aulas.map(a => a.turma))];
    const cursos = [...new Set(turmasUsadas.map(t => getTurma(t)?.curso).filter(Boolean))];
    return `
        <div class="grade-prof-info">
            <div class="gpi-header">
                <i class="fas fa-chalkboard-teacher"></i>
                <div>
                    <strong>${esc(nome)}</strong>
                    <span>${aulas.length} aulas/semana</span>
                </div>
            </div>
            <div class="gpi-body">
                <div class="gpi-item">
                    <span class="gpi-label"><i class="fas fa-door-open"></i> Salas</span>
                    <span>${salas.map(c => esc(nomeSala(c))).join(' · ') || '—'}</span>
                </div>
                <div class="gpi-item">
                    <span class="gpi-label"><i class="fas fa-users"></i> Turmas</span>
                    <span>${turmasUsadas.map(t => esc(nomeTurma(t))).join(' · ') || '—'}</span>
                </div>
                <div class="gpi-item">
                    <span class="gpi-label"><i class="fas fa-graduation-cap"></i> Cursos</span>
                    <span>${cursos.map(esc).join(' · ') || '—'}</span>
                </div>
            </div>
        </div>
    `;
}

/* ─── Edição (aba "Grade" do painel do administrador) ───────────────────── */
function renderAdminGradeHTML() {
    const prof = getProfessor(adminGradeProfSel);
    const aulas = prof ? estado.grade.filter(a => a.professorId === prof.id) : [];

    let tabela = '';
    if (prof) {
        const linhas = estado.faixas.map((faixa, fi) => {
            const colunas = estado.dias.map((_, di) => {
                const aula = aulas.find(a => a.faixa === fi && a.dia === di);
                const soltar = `ondragover="event.preventDefault()" ondrop="handleGradeDrop(event, ${fi}, ${di})"`;
                if (!aula) {
                    return `<td class="ag-cell vazia" ${soltar}>
                        <button class="ag-btn-add" title="Adicionar aula" onclick="adminAdicionarAula(${fi}, ${di})"><i class="fas fa-plus"></i></button>
                    </td>`;
                }
                return `<td class="ag-cell preenchida" ${soltar}>
                    <div class="ag-bloco" draggable="true" ondragstart="iniciarArrasteGrade(event, ${aula.id})" title="Arraste para mudar o horário">
                        <span class="ag-bloco-turma">${esc(nomeTurma(aula.turma))}</span>
                        <span class="ag-bloco-sala">${esc(nomeSala(aula.sala))}</span>
                        <button class="ag-btn-del" title="Remover aula" onclick="adminRemoverAula(${aula.id})"><i class="fas fa-times"></i></button>
                    </div>
                </td>`;
            }).join('');
            return `<tr><td class="ag-hora">${faixa.label}</td>${colunas}</tr>`;
        }).join('');
        tabela = `
            <div class="ag-table-scroll">
                <table class="ag-edit-table">
                    <thead><tr><th class="ag-th-hora">Horário</th>${estado.dias.map(d => `<th class="ag-th-dia">${d}</th>`).join('')}</tr></thead>
                    <tbody>${linhas}</tbody>
                </table>
            </div>
            <p class="hint-text">Dica: arraste um bloco para outra célula para mudar o dia/horário da aula.</p>`;
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
                            ${estado.professores.map(p => `<option value="${p.id}" ${prof && prof.id === p.id ? 'selected' : ''}>${esc(p.nome)}</option>`).join('')}
                        </select>
                    </div>
                </div>
                ${prof ? `<button class="btn-sm primary" onclick="adminAdicionarAula()"><i class="fas fa-plus"></i> Nova aula</button>` : ''}
            </div>
            ${prof ? `
            <div class="ag-stats-bar">
                <span><i class="fas fa-book"></i> ${aulas.length} aula(s)/semana</span>
                <span><i class="fas fa-door-open"></i> ${new Set(aulas.map(a => a.sala)).size} sala(s)</span>
                <span><i class="fas fa-users"></i> ${new Set(aulas.map(a => a.turma)).size} turma(s)</span>
            </div>` : ''}
            ${prof ? tabela : `
            <div class="empty-state" style="padding:36px 20px">
                <i class="fas fa-table" style="font-size:32px;opacity:.3;display:block;margin-bottom:12px"></i>
                <p>Selecione um professor para ver e editar a sua grade semanal.</p>
            </div>`}
        </div>`;
}

function ativarAdminGrade() {
    const select = document.getElementById('adminGradeProfSel');
    if (!select) return;
    select.addEventListener('change', () => {
        adminGradeProfSel = select.value;
        atualizarAdminGrade();
    });
}

function atualizarAdminGrade() {
    const alvo = document.getElementById('adminListContent');
    if (!alvo || adminTab !== 'grade') return;
    alvo.innerHTML = renderAdminGradeHTML();
    ativarAdminGrade();
}

/** Formulário de nova aula (faixa/dia opcionais = escolher no formulário). */
function adminAdicionarAula(faixa = null, dia = null) {
    const prof = getProfessor(adminGradeProfSel);
    if (!prof) return;
    adminTelaLista = false;
    const fixo = faixa !== null && dia !== null;
    cfgContent.className = 'modal-card config-modal config-modal--compact';
    cfgContent.innerHTML = `
        ${cabecalhoConfig(fixo ? 'Adicionar Aula' : 'Nova Aula',
            `<i class="fas fa-user" style="margin-right:4px"></i>${esc(prof.nome)}${fixo ? ` &nbsp;·&nbsp; ${estado.dias[dia]} &nbsp;·&nbsp; ${estado.faixas[faixa].label}` : ''}`,
            "renderAdminPanel('grade')")}
        <div class="config-form">
            ${fixo ? '' : `
            <label class="field-label">Dia da Semana</label>
            <select class="input-field" id="novaAulaDia">${estado.dias.map((d, i) => `<option value="${i}">${d}</option>`).join('')}</select>
            <label class="field-label">Faixa Horária</label>
            <select class="input-field" id="novaAulaFaixa">${estado.faixas.map((f, i) => `<option value="${i}">${f.label}</option>`).join('')}</select>`}
            <label class="field-label">Sala</label>
            <select class="input-field" id="novaAulaSala">${estado.salas.map(s => `<option value="${esc(s.codigo)}">${esc(s.nome)}</option>`).join('')}</select>
            <label class="field-label">Turma / Curso</label>
            <select class="input-field" id="novaAulaTurma">${estado.turmas.map(t => `<option value="${esc(t.id)}">${esc(t.nome)} — ${esc(t.curso)}</option>`).join('')}</select>
            <div class="face-auth-status" id="aulaStatus" style="display:none"></div>
            <div class="modal-actions" style="margin-top:20px">
                <button class="btn-secondary" onclick="renderAdminPanel('grade')">Cancelar</button>
                <button class="btn-black btn-confirm" id="btnSalvarAula" style="flex:1;margin-top:0"><i class="fas fa-check"></i> Salvar Aula</button>
            </div>
        </div>`;

    const botao = cfgContent.querySelector('#btnSalvarAula');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        const diaFinal = fixo ? dia : Number(cfgContent.querySelector('#novaAulaDia').value);
        const faixaFinal = fixo ? faixa : Number(cfgContent.querySelector('#novaAulaFaixa').value);
        const existente = estado.grade.find(a => a.professorId === prof.id && a.dia === diaFinal && a.faixa === faixaFinal);
        const dados = {
            professorId: prof.id,
            dia: diaFinal,
            faixa: faixaFinal,
            sala: cfgContent.querySelector('#novaAulaSala').value,
            turma: cfgContent.querySelector('#novaAulaTurma').value
        };
        try {
            if (existente) {
                if (!confirm(`Já existe uma aula de ${prof.nome} em ${estado.dias[diaFinal]} às ${estado.faixas[faixaFinal].label}. Substituir?`)) return;
                await api.put(`/api/grade/${existente.id}`, dados);
            } else {
                await api.post('/api/grade', dados);
            }
            await recarregarTudo();
            renderAdminPanel('grade');
        } catch (e) {
            setStatus(cfgContent.querySelector('#aulaStatus'), e.message, 'error');
        }
    }));
}

async function adminRemoverAula(id) {
    const aula = estado.grade.find(a => a.id === id);
    if (!aula || !confirm(`Remover esta aula de ${estado.dias[aula.dia]} – ${estado.faixas[aula.faixa].label}?`)) return;
    try {
        await api.del(`/api/grade/${id}`);
        await recarregarTudo();
        atualizarAdminGrade();
    } catch (e) {
        alert(e.message);
    }
}

/* ─── Arrastar e soltar ──────────────────────────────────────────────────── */
function iniciarArrasteGrade(evento, aulaId) {
    evento.dataTransfer.setData('text/plain', JSON.stringify({ aulaId }));
    evento.dataTransfer.effectAllowed = 'copyMove';
}

/** Soltar um bloco em outra célula da grade do admin = mudar dia/horário. */
async function handleGradeDrop(evento, faixa, dia) {
    evento.preventDefault();
    if (!isAdmin) return;
    let dados;
    try { dados = JSON.parse(evento.dataTransfer.getData('text/plain') || '{}'); } catch (_) { return; }
    const aula = estado.grade.find(a => a.id === dados.aulaId);
    if (!aula || (aula.faixa === faixa && aula.dia === dia)) return;
    const salaOcupada = estado.grade.find(a => a.sala === aula.sala && a.dia === dia && a.faixa === faixa && a.professorId !== aula.professorId);
    if (salaOcupada) {
        alert(`A sala ${aula.sala} já tem aula de ${salaOcupada.professor} em ${estado.dias[dia]} – ${estado.faixas[faixa].label}.`);
        return;
    }
    try {
        const alvo = estado.grade.find(a => a.professorId === aula.professorId && a.dia === dia && a.faixa === faixa);
        if (alvo) {
            if (!confirm('Já existe uma aula neste horário para o professor. Substituir?')) return;
            await api.del(`/api/grade/${alvo.id}`);
        }
        await api.put(`/api/grade/${aula.id}`, { dia, faixa });
        await recarregarTudo();
        atualizarAdminGrade();
    } catch (e) {
        alert(`Não foi possível mover a aula: ${e.message}`);
        await recarregarTudo().catch(() => {});
        atualizarAdminGrade();
    }
}
