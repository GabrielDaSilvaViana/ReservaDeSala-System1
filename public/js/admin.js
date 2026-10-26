/* ═══════════════════════════════════════════════════════════════════════════
   ADMINISTRADOR — login, painel, eventos, ocupação forçada, professores
   Toda permissão é conferida no SERVIDOR; aqui só montamos as telas.
═══════════════════════════════════════════════════════════════════════════ */

const cfgOverlay = document.getElementById('configOverlay');
const cfgContent = document.getElementById('configContent');
let adminTab = 'reservas';
let adminTelaLista = false; // true quando o painel mostra uma lista (pode ser atualizado sozinho)

function openConfig() {
    if (isAdmin) renderAdminPanel();
    else renderConfigLogin();
    cfgOverlay.style.display = 'flex';
}

function closeConfig() {
    Facial.pararCamera();
    adminTelaLista = false;
    cfgOverlay.style.display = 'none';
}
cfgOverlay.addEventListener('click', e => { if (e.target === cfgOverlay) closeConfig(); });

const cabecalhoConfig = (titulo, sub, voltar = 'closeConfig()') => `
    <div class="modal-header" style="margin-bottom:16px">
        <div>
            <h3>${titulo}</h3>
            ${sub ? `<p class="modal-sub" style="margin-bottom:0">${sub}</p>` : ''}
        </div>
        <button class="btn-close" onclick="${voltar}"><i class="fas fa-times"></i></button>
    </div>`;

/* ─── Sessão ─────────────────────────────────────────────────────────────── */
function definirModoAdmin(ativo) {
    isAdmin = ativo;
    document.getElementById('adminBadge').style.display = ativo ? 'flex' : 'none';
    atualizarBotoesAdmin();
}

/** Chamado quando o servidor informa que a sessão expirou. */
function aoPerderSessaoAdmin() {
    if (!isAdmin) return;
    sessaoAdmin.limpar();
    definirModoAdmin(false);
    closeConfig();
    renderViewAtual();
    alert('Sua sessão de administrador expirou. Entre novamente.');
}

async function restaurarSessaoAdmin() {
    if (!sessaoAdmin.obter()) return;
    try {
        const sessao = await api.get('/api/admin/sessao');
        if (sessao.admin) definirModoAdmin(true);
        else sessaoAdmin.limpar();
    } catch (_) {
        /* servidor fora do ar: tenta de novo na próxima atualização */
    }
}

function atualizarBotoesAdmin() {
    const existente = document.getElementById('btnNovaReservaAdmin');
    if (isAdmin && !existente) {
        const btn = document.createElement('button');
        btn.id = 'btnNovaReservaAdmin';
        btn.className = 'btn-new';
        btn.innerHTML = '<i class="fas fa-plus" style="margin-right:6px"></i>Nova Reserva';
        btn.onclick = openNovaReservaAdmin;
        document.querySelector('.header-right').prepend(btn);
    } else if (!isAdmin && existente) {
        existente.remove();
    }
}

function openNovaReservaAdmin() {
    const sala = estado.salas.find(s => s.status === 'livre') || estado.salas[0];
    if (!sala) return alert('Nenhuma sala cadastrada.');
    stepCalendar(sala.codigo);
    abrirModal();
}

/* ─── Login ──────────────────────────────────────────────────────────────── */
function renderConfigLogin() {
    adminTelaLista = false;
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
        <form class="config-form" id="formLoginAdmin" autocomplete="off">
            <label class="field-label" style="margin-top:20px">Usuário</label>
            <input type="text" class="input-field" id="usuarioAdmin" value="admin" autocomplete="username">
            <label class="field-label">Senha de Administrador</label>
            <input type="password" class="input-field" id="senhaAdmin" placeholder="Digite a senha" autocomplete="current-password">
            <div class="face-auth-status" id="loginStatus" style="display:none"></div>
            <button class="btn-black" id="btnLoginAdmin" type="submit">
                <i class="fas fa-shield-alt"></i> Entrar como Administrador
            </button>
        </form>
    `;
    const senha = cfgContent.querySelector('#senhaAdmin');
    const status = cfgContent.querySelector('#loginStatus');
    senha.focus();

    cfgContent.querySelector('#formLoginAdmin').addEventListener('submit', e => {
        e.preventDefault();
        const botao = cfgContent.querySelector('#btnLoginAdmin');
        comBotaoOcupado(botao, async () => {
            try {
                const r = await api.post('/api/admin/login', {
                    usuario: cfgContent.querySelector('#usuarioAdmin').value,
                    senha: senha.value
                });
                sessaoAdmin.salvar(r.token);
                definirModoAdmin(true);
                await recarregarTudo();
                renderAdminPanel();
            } catch (erro) {
                senha.classList.add('error');
                senha.value = '';
                senha.focus();
                setStatus(status, erro.message, 'error');
            }
        });
    });
}

async function adminLogout() {
    try { await api.post('/api/admin/logout'); } catch (_) { /* ignora */ }
    sessaoAdmin.limpar();
    definirModoAdmin(false);
    closeConfig();
    await recarregarTudo().catch(() => renderViewAtual());
}

/* ─── Painel ─────────────────────────────────────────────────────────────── */
function atualizarPainelAdminSeAberto() {
    if (adminTelaLista && adminTab !== 'grade') renderAdminPanel();
}

function badgeReserva(r) {
    if (r.status === 'em_uso') return '<span class="status-badge badge-ocupada" style="font-size:10px">Ocupada</span>';
    if (r.tipo === 'evento') return '<span class="status-badge badge-evento" style="font-size:10px">Evento</span>';
    return '<span class="status-badge badge-reservada" style="font-size:10px">Reservada</span>';
}

function cardReservaAdmin(r) {
    const podeForcar = r.tipo === 'reserva' && r.status === 'agendada' && r.data === hoje();
    return `
        <div class="admin-card">
            <div class="admin-card-info">
                <h4>${esc(r.salaNome)} ${badgeReserva(r)}</h4>
                <p><i class="fas fa-user" style="margin-right:4px;font-size:10px"></i>${esc(r.responsavel)} · ${isoParaBr(r.data)} · ${horarioTexto(r)}</p>
                ${r.evento ? `<p class="ev-tag"><i class="fas fa-star" style="margin-right:4px;font-size:10px"></i>${esc(r.evento)}</p>` : ''}
                <p style="margin-top:2px;font-size:11px;color:#9ca3af">${esc(r.codigo || '')}</p>
            </div>
            <div class="admin-card-actions">
                ${podeForcar ? `<button class="btn-sm primary" title="Ocupação forçada" onclick="closeConfig(); forcarOcupacao(${r.id})"><i class="fas fa-sign-in-alt"></i></button>` : ''}
                <button class="btn-sm danger" title="${r.status === 'em_uso' ? 'Desocupação forçada' : 'Remover'}" onclick="adminRemoverReserva(${r.id}, true)"><i class="fas fa-trash"></i></button>
            </div>
        </div>`;
}

const vazio = (icone, texto) => `<div class="empty-state"><i class="fas ${icone}"></i><p>${texto}</p></div>`;

function renderAdminPanel(tab) {
    if (tab) adminTab = tab;
    adminTelaLista = true;
    cfgContent.className = 'modal-card config-modal';

    const reservas = estado.reservas.filter(r => r.tipo === 'reserva');
    const eventos = estado.reservas.filter(r => r.tipo === 'evento');
    let lista = '';

    if (adminTab === 'reservas') {
        lista = reservas.length ? reservas.map(cardReservaAdmin).join('') : vazio('fa-calendar-times', 'Nenhuma reserva ativa.');
    } else if (adminTab === 'eventos') {
        lista = eventos.length ? eventos.map(cardReservaAdmin).join('') : vazio('fa-star', 'Nenhum evento agendado.');
    } else if (adminTab === 'salas') {
        lista = estado.salas.map(s => {
            const r = reservaAtualDaSala(s);
            return `
            <div class="admin-card">
                <div class="admin-card-info">
                    <h4>${esc(s.nome)}</h4>
                    <p>${andarDisplay(s.andar)} · <strong>${traduzStatus(s.status)}</strong>${r ? ` · ${esc(r.responsavel)} (${horarioTexto(r)})` : ''}</p>
                </div>
                <div class="admin-card-actions">
                    <select class="input-field select-solenoide" title="Em qual solenoide fica a chave desta sala" onchange="adminDefinirSolenoide('${esc(s.codigo)}', this.value)">
                        <option value="" ${s.solenoide ? '' : 'selected'}>Solenoide padrão (${estado.solenoidePadrao || 1})</option>
                        ${[1, 2, 3].map(n => `<option value="${n}" ${s.solenoide === n ? 'selected' : ''}>Solenoide ${n}</option>`).join('')}
                    </select>
                    ${r ? `<button class="btn-sm danger" title="${r.status === 'em_uso' ? 'Desocupação forçada' : 'Remover'}" onclick="adminRemoverReserva(${r.id}, true)"><i class="fas fa-trash"></i></button>` : ''}
                    <button class="btn-sm primary" onclick="closeConfig(); adicionarEvento('${esc(s.codigo)}')">Evento</button>
                </div>
            </div>`;
        }).join('');
    } else if (adminTab === 'grade') {
        lista = renderAdminGradeHTML();
    } else if (adminTab === 'professores') {
        lista = renderAdminProfessoresHTML();
    }

    cfgContent.innerHTML = `
        <div class="modal-header" style="margin-bottom:14px">
            <div>
                <h3>Painel do Administrador</h3>
                <p class="modal-sub" style="margin-bottom:0">Gerencie reservas, eventos, grades horárias e professores</p>
            </div>
            <button class="btn-close" onclick="closeConfig()"><i class="fas fa-times"></i></button>
        </div>
        <div class="config-form">
            <div class="admin-tabs">
                <button class="tab-btn ${adminTab === 'reservas' ? 'active' : ''}" onclick="renderAdminPanel('reservas')">
                    <i class="fas fa-calendar-check"></i> Reservas (${reservas.length})
                </button>
                <button class="tab-btn ${adminTab === 'eventos' ? 'active' : ''}" onclick="renderAdminPanel('eventos')">
                    <i class="fas fa-star"></i> Eventos (${eventos.length})
                </button>
                <button class="tab-btn ${adminTab === 'salas' ? 'active' : ''}" onclick="renderAdminPanel('salas')">
                    <i class="fas fa-door-open"></i> Salas
                </button>
                <button class="tab-btn ${adminTab === 'grade' ? 'active' : ''}" onclick="renderAdminPanel('grade')">
                    <i class="fas fa-table"></i> Grade
                </button>
                <button class="tab-btn ${adminTab === 'professores' ? 'active' : ''}" onclick="renderAdminPanel('professores')">
                    <i class="fas fa-chalkboard-teacher"></i> Professores
                </button>
            </div>
            <div class="admin-list" id="adminListContent">${lista}</div>
            <div class="modal-actions" style="margin-top:12px">
                <button class="btn-secondary" onclick="renderTrocarSenha()">
                    <i class="fas fa-key"></i> Alterar senha
                </button>
                <button class="btn-logout" style="flex:1;margin-top:0" onclick="adminLogout()">
                    <i class="fas fa-sign-out-alt" style="margin-right:6px"></i> Sair do modo administrador
                </button>
            </div>
        </div>
    `;
    if (adminTab === 'grade') ativarAdminGrade();
}

/* ─── Remover reserva / desocupação forçada ──────────────────────────────── */
async function adminRemoverReserva(id, doPainel = false) {
    const r = getReserva(id);
    if (!r) return;
    const texto = r.status === 'em_uso'
        ? `Fazer a DESOCUPAÇÃO FORÇADA da ${r.salaNome}? Isso ficará registrado no histórico.`
        : `Remover ${r.tipo === 'evento' ? 'o evento' : 'a reserva'} da ${r.salaNome} (${isoParaBr(r.data)} ${horarioTexto(r)})?`;
    if (!confirm(texto)) return;
    try {
        await api.post(`/api/reservas/${r.id}/remover`);
        await recarregarTudo();
        if (doPainel) renderAdminPanel();
        else closeM();
    } catch (e) {
        alert(`Não foi possível remover: ${e.message}`);
    }
}

/* ─── Solenoide de cada sala ─────────────────────────────────────────────── */
async function adminDefinirSolenoide(codigoSala, valor) {
    try {
        await api.put(`/api/salas/${encodeURIComponent(codigoSala)}/solenoide`, { solenoide: valor ? Number(valor) : null });
        await recarregarTudo();
        renderAdminPanel('salas');
    } catch (e) {
        alert(`Não foi possível mudar a solenoide: ${e.message}`);
        renderAdminPanel('salas');
    }
}

/* ─── Eventos ────────────────────────────────────────────────────────────── */
/*
 * Administrador: escolhe qualquer responsável (professor ou nome livre).
 * Professor: escolhe o próprio nome e valida a identidade, igual à reserva.
 */
function adicionarEvento(codigoSala) {
    closeConfig();
    const sala = getSala(codigoSala);
    if (!sala) return;
    const sugestao = horarioSugerido(hoje());
    const prefixo = isAdmin ? null : novoPrefixoPainel();

    content.innerHTML = `
        ${cabecalhoModal('Adicionar Evento', 'Marque esta sala com um evento importante')}
        <label class="field-label">Sala</label>
        <input type="text" class="input-field" value="${esc(sala.nome)}" disabled>
        <label class="field-label">Descrição do Evento</label>
        <textarea class="input-field" id="eventoDesc" maxlength="120" placeholder="Ex: Reunião de Departamento, Prova Final, etc."></textarea>
        ${isAdmin ? `
        <label class="field-label">Responsável</label>
        <input type="text" class="input-field" id="eventoProf" list="listaProfessoresEvento" maxlength="100" placeholder="Nome do professor ou responsável">
        <datalist id="listaProfessoresEvento">${estado.professores.map(p => `<option value="${esc(p.nome)}">`).join('')}</datalist>` : ''}
        <label class="field-label">Data</label>
        <input type="date" class="input-field" id="eventoData" value="${hoje()}" min="${hoje()}">
        <label class="field-label">Horário</label>
        <div class="time-row">
            <input type="time" class="input-field" id="evHi" value="${sugestao.inicio}">
            <input type="time" class="input-field" id="evHf" value="${sugestao.fim}">
        </div>
        <div class="event-notice">
            A sala será marcada em <strong>laranja</strong> nesse horário e ficará indisponível para reservas.
        </div>
        ${isAdmin ? '' : `
        <label class="field-label">Professor responsável</label>
        ${htmlSelectProfessor('eventoProfSelect')}
        ${htmlPainelIdentificacao(prefixo)}`}
        <div class="face-auth-status" id="eventoStatus" style="display:none"></div>
        <div class="modal-actions">
            <button class="btn-secondary" onclick="closeM()">Cancelar</button>
            <button class="btn-black btn-confirm" id="btnConfEvento" style="flex:1;margin-top:0">
                <i class="fas fa-check"></i> Confirmar Evento
            </button>
        </div>
    `;
    abrirModal();

    const painel = isAdmin ? null : ativarPainelIdentificacao(content, prefixo);
    const selectProf = content.querySelector('#eventoProfSelect');
    if (selectProf) selectProf.addEventListener('change', () => selectProf.classList.remove('error'));

    const botao = content.querySelector('#btnConfEvento');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        const status = content.querySelector('#eventoStatus');
        const descricao = content.querySelector('#eventoDesc').value.trim();
        const data = content.querySelector('#eventoData').value;
        const inicio = content.querySelector('#evHi').value;
        const fim = content.querySelector('#evHf').value;
        if (!descricao) { content.querySelector('#eventoDesc').classList.add('error'); return setStatus(status, 'Informe a descrição do evento.', 'error'); }
        if (!data || !inicio || !fim) return setStatus(status, 'Informe a data e o horário do evento.', 'error');

        const corpo = { sala: sala.codigo, descricao, data, inicio, fim };
        if (isAdmin) {
            const responsavel = content.querySelector('#eventoProf').value.trim();
            if (!responsavel) { content.querySelector('#eventoProf').classList.add('error'); return setStatus(status, 'Informe o responsável.', 'error'); }
            const prof = estado.professores.find(p => p.nome.toLowerCase() === responsavel.toLowerCase());
            Object.assign(corpo, { professorId: prof ? prof.id : null, responsavel });
        } else if (!selectProf.value) {
            selectProf.classList.add('error');
            return setStatus(status, 'Selecione o professor responsável pelo evento.', 'error');
        }

        try {
            setStatus(status, '', 'info');
            if (!isAdmin) {
                corpo.professorId = Number(selectProf.value);
                corpo.credencial = await painel.obterCredencial();
                setStatus(status, 'Validando identidade e salvando o evento...', 'info');
            }
            const ev = await api.post('/api/eventos', corpo);
            Facial.pararCamera();
            telaEventoCriado(ev, painel ? painel.metodo() : null);
            recarregarTudo().catch(() => {});
        } catch (e) {
            setStatus(status, e.message, 'error');
            if (painel && painel.metodo() === 'facial') setStatus(painel.statusFacial, '', 'info');
        }
    }));
}

function telaEventoCriado(ev, metodo = null) {
    content.innerHTML = `
        <div class="success-icon">🌟</div>
        <p class="success-title">Evento Adicionado!</p>
        <p class="success-msg">${esc(ev.salaNome)} foi marcada como evento.</p>
        <div class="reserva-info" style="margin-top:12px">
            <div class="info-row"><span class="lbl">Sala</span><span class="val">${esc(ev.salaNome)}</span></div>
            <div class="info-row"><span class="lbl">Evento</span><span class="val">${esc(ev.evento)}</span></div>
            <div class="info-row"><span class="lbl">Responsável</span><span class="val">${esc(ev.responsavel)}</span></div>
            <div class="info-row"><span class="lbl">Data</span><span class="val">${isoParaBr(ev.data)}</span></div>
            <div class="info-row"><span class="lbl">Horário</span><span class="val">${horarioTexto(ev)}</span></div>
        </div>
        ${ev.primeiroAcesso ? `<div class="event-notice">Primeiro acesso: seu ${NOME_METODO[metodo] || 'método'} foi cadastrado. Use o mesmo nas próximas vezes.</div>` : ''}
        <button class="btn-black" onclick="closeM()"><i class="fas fa-check"></i> Concluir</button>
    `;
}

/* ─── Ocupação forçada (somente administrador) ───────────────────────────── */
function forcarOcupacao(reservaId) {
    const r = getReserva(reservaId);
    if (!r || !isAdmin) return;
    content.innerHTML = `
        ${cabecalhoModal(`Ocupação Forçada — ${esc(r.salaNome)}`, 'Registra a ocupação sem a validação do professor (fica marcada no histórico).')}
        <div class="reserva-info">
            <div class="info-row"><span class="lbl">Reservado para</span><span class="val">${esc(r.responsavel)}</span></div>
            <div class="info-row"><span class="lbl">Horário</span><span class="val">${isoParaBr(r.data)} · ${horarioTexto(r)}</span></div>
        </div>
        <label class="field-label">Professor que vai usar a sala</label>
        ${htmlSelectProfessor('forcaProfSelect', r.professorId)}
        <div class="face-auth-status" id="forcaStatus" style="display:none"></div>
        <div class="modal-actions">
            <button class="btn-secondary" onclick="abrirReserva(${r.id})">Cancelar</button>
            <button class="btn-black btn-confirm" id="btnForcarOcupacao" style="flex:1;margin-top:0"><i class="fas fa-sign-in-alt"></i> Confirmar Ocupação</button>
        </div>
    `;
    abrirModal();
    const botao = content.querySelector('#btnForcarOcupacao');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        const professorId = Number(content.querySelector('#forcaProfSelect').value);
        const status = content.querySelector('#forcaStatus');
        if (!professorId) return setStatus(status, 'Selecione o professor.', 'error');
        try {
            const resultado = await api.post(`/api/reservas/${r.id}/ocupacao-forcada`, { professorId });
            renderSolenoidUnlockScreen(resultado);
            recarregarTudo().catch(() => {});
        } catch (e) {
            setStatus(status, e.message, 'error');
        }
    }));
}

/* ─── Professores e credenciais ──────────────────────────────────────────── */
const seloCredencial = (tem, rotulo) => `<span class="status-badge ${tem ? 'badge-livre' : 'badge-grade'}" style="font-size:10px">${tem ? '✓' : '—'} ${rotulo}</span>`;

function renderAdminProfessoresHTML() {
    const cards = estado.professores.map(p => `
        <div class="admin-card">
            <div class="admin-card-info">
                <h4>${esc(p.nome)}</h4>
                <p style="display:flex;gap:6px;flex-wrap:wrap;margin-top:4px">
                    ${seloCredencial(p.temCracha, 'Crachá')} ${seloCredencial(p.temDigital, 'Digital')} ${seloCredencial(p.temRosto, 'Rosto')}
                </p>
            </div>
            <div class="admin-card-actions">
                <button class="btn-sm primary" onclick="renderCredenciaisProfessor(${p.id})"><i class="fas fa-id-card"></i> Credenciais</button>
            </div>
        </div>`).join('');
    return `
        <div class="admin-card" style="background:white">
            <div class="admin-card-info">
                <h4>Novo professor</h4>
                <p>Professores sem credencial cadastram a primeira no próprio acesso (primeiro uso).</p>
            </div>
            <div class="admin-card-actions" style="align-items:center">
                <input type="text" class="input-field" id="novoProfNome" placeholder="Prof. Nome Sobrenome" maxlength="100" style="margin:0;min-width:220px">
                <button class="btn-sm primary" onclick="adminCriarProfessor()"><i class="fas fa-plus"></i> Adicionar</button>
            </div>
        </div>
        ${cards || vazio('fa-user', 'Nenhum professor cadastrado.')}`;
}

async function adminCriarProfessor() {
    const input = document.getElementById('novoProfNome');
    const nome = input.value.trim();
    if (!nome) { input.classList.add('error'); return; }
    try {
        await api.post('/api/professores', { nome });
        await recarregarTudo();
        renderAdminPanel('professores');
    } catch (e) {
        alert(e.message);
    }
}

function renderCredenciaisProfessor(id) {
    const p = getProfessor(id);
    if (!p) return;
    adminTelaLista = false;
    cfgContent.className = 'modal-card config-modal config-modal--compact';
    cfgContent.innerHTML = `
        ${cabecalhoConfig(`Credenciais — ${esc(p.nome)}`, 'Os códigos são guardados criptografados (hash). Para trocar, basta cadastrar de novo.', "renderAdminPanel('professores')")}
        <div class="config-form">
            <label class="field-label">Crachá ${p.temCracha ? '(cadastrado)' : '(não cadastrado)'}</label>
            <div class="time-row">
                <input type="text" class="input-field" id="credCracha" placeholder="Novo código do crachá" maxlength="64" autocomplete="off">
                <button class="btn-sm primary" style="flex:0 0 auto" onclick="adminSalvarCredencial(${p.id}, 'cracha')">Salvar</button>
                ${p.temCracha ? `<button class="btn-sm danger" style="flex:0 0 auto" title="Remover" onclick="adminRemoverCredencial(${p.id}, 'cracha')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <label class="field-label">Digital ${p.temDigital ? '(cadastrada)' : '(não cadastrada)'}</label>
            ${estado.digitalModo === 'esp32' ? `
            <div class="time-row">
                <button class="btn-secondary" id="btnCadastrarDigital"><i class="fas fa-fingerprint"></i> ${p.temDigital ? 'Cadastrar de novo no leitor' : 'Cadastrar no leitor DY50'}</button>
                ${p.temDigital ? `<button class="btn-sm danger" style="flex:0 0 auto" title="Remover" onclick="adminRemoverCredencial(${p.id}, 'digital')"><i class="fas fa-trash"></i></button>` : ''}
            </div>
            <div class="fingerprint-read-status info" id="digitalCadStatus" style="display:none"></div>` : `
            <div class="time-row">
                <input type="text" class="input-field" id="credDigital" placeholder="ID da digital no leitor" maxlength="64" autocomplete="off">
                <button class="btn-sm primary" style="flex:0 0 auto" onclick="adminSalvarCredencial(${p.id}, 'digital')">Salvar</button>
                ${p.temDigital ? `<button class="btn-sm danger" style="flex:0 0 auto" title="Remover" onclick="adminRemoverCredencial(${p.id}, 'digital')"><i class="fas fa-trash"></i></button>` : ''}
            </div>`}
            <label class="field-label">Rosto ${p.temRosto ? '(cadastrado)' : '(não cadastrado)'}</label>
            <div class="face-auth-panel">
                <div class="face-video-wrap"><video id="credVideo" autoplay muted playsinline class="face-video"></video></div>
                <div class="face-auth-actions">
                    <button class="btn-secondary" id="btnCapturarRosto"><i class="fas fa-camera"></i> Capturar e salvar rosto</button>
                    ${p.temRosto ? `<button class="btn-sm danger" title="Remover rosto" onclick="adminRemoverCredencial(${p.id}, 'facial')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
                <div class="face-auth-status" id="credStatus" style="display:none"></div>
            </div>
            <button class="btn-logout" onclick="adminRemoverCredencial(${p.id}, 'todas')">
                <i class="fas fa-eraser" style="margin-right:6px"></i> Remover todas (o próximo acesso cadastra de novo)
            </button>
            <button class="btn-outline" onclick="Facial.pararCamera(); renderAdminPanel('professores')">Voltar</button>
        </div>
    `;
    const botaoDigital = cfgContent.querySelector('#btnCadastrarDigital');
    botaoDigital?.addEventListener('click', () => comBotaoOcupado(botaoDigital, async () => {
        const status = cfgContent.querySelector('#digitalCadStatus');
        const mostrarStatus = (texto, tipo = 'info') => {
            status.style.display = 'block';
            status.textContent = texto;
            status.className = `fingerprint-read-status ${tipo}`;
        };
        mostrarStatus('Coloque o dedo no leitor.');
        // Mostra as instruções do leitor ("retire o dedo", "coloque de novo"...) enquanto o cadastro roda
        const acompanhar = setInterval(async () => {
            try {
                const s = await api.get('/api/digital/status');
                if (s.estado === 'aguardando' && s.mensagem) mostrarStatus(s.mensagem);
            } catch (_) { /* ignora */ }
        }, 600);
        try {
            await api.post(`/api/professores/${p.id}/digital/cadastrar`);
            clearInterval(acompanhar);
            await recarregarTudo();
            renderCredenciaisProfessor(p.id);
            const novo = cfgContent.querySelector('#digitalCadStatus');
            novo.style.display = 'block';
            novo.textContent = 'Digital cadastrada com sucesso.';
            novo.className = 'fingerprint-read-status success';
        } catch (e) {
            clearInterval(acompanhar);
            mostrarStatus(e.message, 'error');
        }
    }));

    const botao = cfgContent.querySelector('#btnCapturarRosto');
    botao.addEventListener('click', () => comBotaoOcupado(botao, async () => {
        const status = cfgContent.querySelector('#credStatus');
        try {
            const descritor = await Facial.capturarDescritor(cfgContent.querySelector('#credVideo'), m => setStatus(status, m, 'info'));
            await api.put(`/api/professores/${p.id}/credenciais`, { metodo: 'facial', descritor });
            Facial.pararCamera();
            await recarregarTudo();
            renderCredenciaisProfessor(p.id);
            setStatus(cfgContent.querySelector('#credStatus'), 'Rosto cadastrado com sucesso.', 'success');
        } catch (e) {
            setStatus(status, e.message, 'error');
        }
    }));
}

async function adminSalvarCredencial(id, metodo) {
    const input = cfgContent.querySelector(metodo === 'cracha' ? '#credCracha' : '#credDigital');
    const codigo = input.value.trim();
    if (!codigo) { input.classList.add('error'); return; }
    try {
        await api.put(`/api/professores/${id}/credenciais`, { metodo, codigo });
        await recarregarTudo();
        renderCredenciaisProfessor(id);
        setStatus(cfgContent.querySelector('#credStatus'), `${metodo === 'cracha' ? 'Crachá' : 'Digital'} cadastrado(a) com sucesso.`, 'success');
    } catch (e) {
        alert(e.message);
    }
}

async function adminRemoverCredencial(id, metodo) {
    const nomes = { cracha: 'o crachá', digital: 'a digital', facial: 'o rosto', todas: 'TODAS as credenciais' };
    if (!confirm(`Remover ${nomes[metodo]} deste professor?`)) return;
    try {
        await api.del(`/api/professores/${id}/credenciais/${metodo}`);
        Facial.pararCamera();
        await recarregarTudo();
        renderCredenciaisProfessor(id);
    } catch (e) {
        alert(e.message);
    }
}

/* ─── Trocar senha do administrador ──────────────────────────────────────── */
function renderTrocarSenha() {
    adminTelaLista = false;
    cfgContent.className = 'modal-card config-modal config-modal--compact';
    cfgContent.innerHTML = `
        ${cabecalhoConfig('Alterar senha', 'Senha do usuário administrador', 'renderAdminPanel()')}
        <form class="config-form" id="formSenha">
            <label class="field-label">Senha atual</label>
            <input type="password" class="input-field" id="senhaAtual" autocomplete="current-password">
            <label class="field-label">Nova senha (mínimo 6 caracteres)</label>
            <input type="password" class="input-field" id="senhaNova" autocomplete="new-password">
            <label class="field-label">Confirmar nova senha</label>
            <input type="password" class="input-field" id="senhaNova2" autocomplete="new-password">
            <div class="face-auth-status" id="senhaStatus" style="display:none"></div>
            <button class="btn-black btn-confirm" type="submit"><i class="fas fa-key"></i> Salvar nova senha</button>
            <button class="btn-outline" type="button" onclick="renderAdminPanel()">Voltar</button>
        </form>
    `;
    cfgContent.querySelector('#formSenha').addEventListener('submit', async e => {
        e.preventDefault();
        const status = cfgContent.querySelector('#senhaStatus');
        const nova = cfgContent.querySelector('#senhaNova').value;
        if (nova !== cfgContent.querySelector('#senhaNova2').value) return setStatus(status, 'As senhas novas não são iguais.', 'error');
        try {
            await api.post('/api/admin/senha', { senhaAtual: cfgContent.querySelector('#senhaAtual').value, novaSenha: nova });
            setStatus(status, 'Senha alterada com sucesso.', 'success');
            e.target.reset();
        } catch (erro) {
            setStatus(status, erro.message, 'error');
        }
    });
}
