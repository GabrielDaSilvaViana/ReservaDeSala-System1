/* ═══════════════════════════════════════════════════════════════════════════
   Painel opcional de teste do leitor de digital DY50 + estado da solenoide.

   Como ativar: adicione no final do index.html (depois de main.js):
       <link rel="stylesheet" href="dy50/biometry-ui.css">
       <script src="dy50/dy50_integration.js"></script>

   - "Simular leitura" envia { sala, digital } para /api/porta/digital, que é a
     mesma rota usada pelo ESP32 com o DY50 na porta. No navegador ela só
     funciona com o administrador logado.
   - O estado da trava é lido de /api/solenoide/status (precisa do ESP32 na rede).
═══════════════════════════════════════════════════════════════════════════ */
(function () {
    if (window.__dy50Carregado) return;
    window.__dy50Carregado = true;

    const painel = document.createElement('div');
    painel.id = 'dy50-biometry-panel';
    painel.innerHTML = `
        <div class="dy50-header">Biometria (DY50)</div>
        <div class="dy50-body">
            <div id="dy50-status" class="dy50-status idle">Aguardando leitura</div>
            <select id="dy50-sala" class="dy50-input"></select>
            <input id="dy50-codigo" class="dy50-input" placeholder="ID da digital (ex.: 5)" maxlength="64">
            <div class="dy50-actions">
                <button id="dy50-ler" class="dy50-btn">Simular leitura</button>
                <button id="dy50-trava" class="dy50-btn small" disabled>Trava: ?</button>
            </div>
            <div id="dy50-log" class="dy50-log"></div>
        </div>`;
    document.body.appendChild(painel);

    const $ = id => document.getElementById(id);
    const log = msg => {
        const linha = document.createElement('div');
        linha.textContent = `${new Date().toLocaleTimeString('pt-BR')} — ${msg}`;
        $('dy50-log').prepend(linha);
        while ($('dy50-log').childElementCount > 8) $('dy50-log').lastChild.remove();
    };
    const status = (texto, classe) => { $('dy50-status').textContent = texto; $('dy50-status').className = `dy50-status ${classe}`; };

    function preencherSalas() {
        const select = $('dy50-sala');
        if (select.options.length || typeof estado === 'undefined' || !estado.salas.length) return;
        select.innerHTML = estado.salas.map(s => `<option value="${esc(s.codigo)}">${esc(s.nome)}</option>`).join('');
    }

    async function lerDigital() {
        preencherSalas();
        const sala = $('dy50-sala').value;
        const digital = $('dy50-codigo').value.trim();
        if (!digital) return status('Informe o ID da digital', 'error');
        status('Autenticando...', 'loading');
        try {
            const r = await api.post('/api/porta/digital', { sala, digital });
            status(`Autorizado: ${r.professor}`, 'success');
            log(`${r.professor} → ${r.reserva.salaNome} (${r.solenoide.modo}: ${r.solenoide.mensagem})`);
            if (typeof recarregarTudo === 'function') recarregarTudo().catch(() => {});
        } catch (e) {
            status('Não autorizado', 'error');
            log(e.message);
        }
    }

    // Consulta o estado da trava a cada 2 s; se o ESP32 não responder, espera 15 s.
    async function consultarTrava() {
        let espera = 2000;
        try {
            const r = await api.get('/api/solenoide/status');
            $('dy50-trava').textContent = r.travada ? 'Trava: fechada' : 'Trava: aberta';
            $('dy50-trava').className = `dy50-btn small ${r.travada ? 'locked' : 'unlocked'}`;
        } catch (e) {
            $('dy50-trava').textContent = 'ESP32 offline';
            $('dy50-trava').className = 'dy50-btn small';
            espera = 15000;
        }
        setTimeout(consultarTrava, espera);
    }

    $('dy50-ler').addEventListener('click', lerDigital);
    $('dy50-codigo').addEventListener('keydown', e => { if (e.key === 'Enter') lerDigital(); });
    setTimeout(preencherSalas, 1500);
    consultarTrava();
})();
