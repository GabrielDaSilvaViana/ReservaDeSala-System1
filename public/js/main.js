/* ═══════════════════════════════════════════════════════════════════════════
   INICIALIZAÇÃO
═══════════════════════════════════════════════════════════════════════════ */

/** Abre Agenda/Histórico já com o histórico atualizado do banco. */
async function irParaHistorico() {
    renderHistorico();
    try { if (await carregarHistorico()) renderHistorico(); } catch (e) { setHeader('Histórico de Reservas', `⚠️ ${e.message}`); }
}

async function irParaAgenda() {
    renderAgenda();
    try { if (await carregarHistorico()) renderAgenda(); } catch (e) { setHeader('Agenda', `⚠️ ${e.message}`); }
}

async function iniciarAplicacao() {
    await restaurarSessaoAdmin();
    try {
        await carregarEstado();
        renderMenuAndares();
        renderAll();
    } catch (e) {
        setHeader('Dashboard', `⚠️ ${e.message}`);
        document.getElementById('roomsContainer').innerHTML = `
            <div class="empty-state">
                <i class="fas fa-plug"></i>
                <p>Não foi possível carregar as salas.<br>${esc(e.message)}</p>
            </div>`;
    }
    // Mantém a tela sincronizada com o banco (outras pessoas podem reservar ao mesmo tempo)
    setInterval(atualizacaoAutomatica, 5000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) atualizacaoAutomatica(); });
}

iniciarAplicacao();
