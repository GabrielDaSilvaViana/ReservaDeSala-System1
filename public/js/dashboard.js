/* ═══════════════════════════════════════════════════════════════════════════
   DASHBOARD — cards das salas, estatísticas e menu de andares
═══════════════════════════════════════════════════════════════════════════ */

function andarDisplay(andar) {
    return `${andar}º Andar`;
}

/** Atualiza o título e o subtítulo do topo da página. */
function setHeader(titulo, subtitulo) {
    document.getElementById('tituloPagina').textContent = titulo;
    document.getElementById('modoAtual').textContent = subtitulo;
}

function subtituloModo() {
    return isAdmin ? '🔒 Modo Administrador ativo' : 'Modo padrão';
}

function setNavigationSelection(view, andar = null) {
    document.querySelectorAll('.nav-item, .sub-item, .nav-dropdown').forEach(item => item.classList.remove('active'));
    if (andar !== null) {
        document.querySelector(`.sub-item[data-floor="${andar}"]`)?.classList.add('active');
        document.querySelector(`.nav-dropdown[data-floor-toggle="${andar}"]`)?.classList.add('active');
        return;
    }
    document.querySelector(`.nav-item[data-view="${view}"]`)?.classList.add('active');
}

/* ── Menu lateral de andares (gerado a partir das salas do banco) ────────── */
let assinaturaMenu = '';

function renderMenuAndares() {
    const andares = [...new Set(estado.salas.map(s => s.andar))].sort((a, b) => a - b);
    const assinatura = andares.join(',');
    if (assinatura === assinaturaMenu) return;
    assinaturaMenu = assinatura;
    document.getElementById('menuAndares').innerHTML = andares.map(andar => `
        <div class="nav-dropdown" data-floor-toggle="${andar}" onclick="toggleMenu('menuAndar${andar}')">
            <span><i class="fas fa-layer-group"></i> ${andarDisplay(andar)}</span>
            <i class="fas fa-chevron-down"></i>
        </div>
        <div class="sub-menu" id="menuAndar${andar}">
            <div class="sub-item" data-floor="${andar}" onclick="renderBloco(${andar})">Todas</div>
        </div>
    `).join('');
    if (currentView === 'bloco' && andarAtual !== null) setNavigationSelection('bloco', andarAtual);
}

function toggleMenu(id) {
    const menu = document.getElementById(id);
    if (menu) menu.style.display = menu.style.display === 'flex' ? 'none' : 'flex';
}

/* ── Estatísticas ────────────────────────────────────────────────────────── */
function renderStats(salas) {
    const c = { livre: 0, reservada: 0, ocupada: 0, evento: 0 };
    salas.forEach(s => { c[s.status] = (c[s.status] || 0) + 1; });
    document.getElementById('statsGrid').innerHTML = `
        <div class="stat-card border-green"><p>Disponíveis</p><h2 class="txt-green">${c.livre}</h2></div>
        <div class="stat-card border-purple"><p>Reservadas</p><h2 class="txt-purple">${c.reservada}</h2></div>
        <div class="stat-card border-red"><p>Ocupadas</p><h2 class="txt-red">${c.ocupada}</h2></div>
        <div class="stat-card border-orange"><p>Eventos</p><h2 class="txt-orange">${c.evento}</h2></div>
        <div class="stat-card border-main"><p>Total Salas</p><h2 class="txt-main">${salas.length}</h2></div>
    `;
}

/* ── Cards das salas ─────────────────────────────────────────────────────── */
function renderBlocoSection(salas, titulo) {
    if (!salas.length) return '';
    const cards = salas.map(sala => {
        const r = reservaAtualDaSala(sala);
        return `
        <div class="room-card ${sala.status}" onclick="openModal('${esc(sala.codigo)}')">
            <h3>${esc(sala.nome)}</h3>
            <p class="status-label">${traduzStatus(sala.status)}</p>
            ${r ? `<p class="room-meta"><i class="fas fa-user" style="font-size:10px;margin-right:4px"></i>${esc(r.responsavel)}</p>` : ''}
            ${r && r.status === 'agendada' ? `<p class="room-meta"><i class="fas fa-clock" style="font-size:10px;margin-right:4px"></i>${horarioTexto(r)}</p>` : ''}
            ${r && r.evento ? `<p class="room-evento"><i class="fas fa-star" style="font-size:10px;margin-right:4px"></i>${esc(r.evento)}</p>` : ''}
        </div>`;
    }).join('');

    const livres = salas.filter(s => s.status === 'livre').length;
    const ocupadas = salas.filter(s => s.status === 'ocupada').length;
    return `
        <div class="bloco-section">
            <div class="section-title">
                <h2>${esc(titulo)} <span class="bloco-badge">${salas.length} salas</span></h2>
                <p>${livres} disponíveis · ${ocupadas} ocupadas</p>
            </div>
            <div class="room-grid">${cards}</div>
        </div>
    `;
}

function renderAll() {
    currentView = 'dashboard';
    andarAtual = null;
    setNavigationSelection('dashboard');
    setHeader('Dashboard', subtituloModo());
    renderStats(estado.salas);

    const andares = [...new Set(estado.salas.map(s => s.andar))].sort((a, b) => a - b);
    document.getElementById('roomsContainer').innerHTML = andares.length
        ? andares.map(andar => renderBlocoSection(estado.salas.filter(s => s.andar === andar), andarDisplay(andar))).join('')
        : '<div class="empty-state"><i class="fas fa-door-closed"></i><p>Nenhuma sala cadastrada no banco de dados.</p></div>';
}

/** Mostra só as salas de um andar (menu lateral). */
function renderBloco(andar) {
    currentView = 'bloco';
    andarAtual = Number(andar);
    setNavigationSelection('bloco', andarAtual);
    setHeader(andarDisplay(andarAtual), subtituloModo());
    const salas = estado.salas.filter(s => s.andar === andarAtual);
    renderStats(salas);
    document.getElementById('roomsContainer').innerHTML = renderBlocoSection(salas, andarDisplay(andarAtual))
        || '<div class="empty-state"><i class="fas fa-door-closed"></i><p>Nenhuma sala neste andar.</p></div>';
}
