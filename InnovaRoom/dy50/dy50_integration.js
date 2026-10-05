(function(){
    if (window.__dy50_integration_loaded) return; window.__dy50_integration_loaded = true;

    // Cria painel flutuante de biometria
    const panel = document.createElement('div');
    panel.id = 'dy50-biometry-panel';
    panel.innerHTML = `
        <div class="dy50-header">Biometria (DY50)</div>
        <div class="dy50-body">
            <div id="dy50-status" class="dy50-status idle">Aguardando leitor</div>
            <div id="dy50-last" class="dy50-last">Nenhuma leitura</div>
            <div class="dy50-actions">
                <button id="dy50-test-btn" class="dy50-btn">Testar leitura (fallback)</button>
                <button id="dy50-lock-ind" class="dy50-btn small">Estado: travado</button>
            </div>
            <div id="dy50-log" class="dy50-log"></div>
        </div>
    `;
    document.body.appendChild(panel);

    function log(msg){
        const el = document.getElementById('dy50-log');
        const p = document.createElement('div'); p.textContent = `${new Date().toLocaleTimeString()} — ${msg}`;
        el.prepend(p);
        if (el.childElementCount > 8) el.removeChild(el.lastChild);
    }

    function setStatus(text, cls){
        const s = document.getElementById('dy50-status');
        s.textContent = text;
        s.className = 'dy50-status ' + (cls||'');
    }

    function setLockState(unlocked){
        const b = document.getElementById('dy50-lock-ind');
        b.textContent = unlocked ? 'Estado: destrancado' : 'Estado: travado';
        b.className = 'dy50-btn small ' + (unlocked ? 'unlocked' : 'locked');
    }

    // ─── Polling do micro switch (feedback em tempo real) ────────────────────
    let switchPollInterval = null;
    let unlockTime = null;  // Momento em que foi destrancado
    
    async function pollSwitchState(){
        try {
            const resp = await fetch('/api/solenoid/status');
            const json = await resp.json();
            if (resp.ok && json.solenoid) {
                const isLocked = json.solenoid.locked;
                const btn = document.getElementById('dy50-lock-ind');
                if (btn) {
                    const newClass = isLocked ? 'locked' : 'unlocked';
                    if (!btn.className.includes(newClass)) {
                        setLockState(!isLocked);
                    }
                    
                    // Se está destrancada, mostra contador de tempo restante
                    if (!isLocked && unlockTime) {
                        const elapsed = Math.floor((Date.now() - unlockTime) / 1000);
                        const remaining = Math.max(0, 5 - elapsed);  // 5s countdown
                        if (remaining > 0) {
                            btn.textContent = `Destrancado (${remaining}s)`;
                        }
                    }
                }
            }
        } catch (err) {
            console.warn('[dy50] Falha ao consultar estado do switch:', err.message);
        }
    }

    function startSwitchPolling(){
        if (switchPollInterval) return;
        switchPollInterval = setInterval(pollSwitchState, 500);  // Consulta a cada 500ms (mais rápido para contador)
        log('Polling do micro switch iniciado');
    }

    function stopSwitchPolling(){
        if (switchPollInterval) {
            clearInterval(switchPollInterval);
            switchPollInterval = null;
            unlockTime = null;
            log('Polling do micro switch parado');
        }
    }

    async function authenticateFingerprint(code) {
        setStatus('Autenticando...', 'loading');
        log('Fingerprint lida: ' + String(code).slice(0,12));
        try {
            const resp = await fetch('/api/authenticate', {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ fingerprintCode: code, action: 'authenticate' })
            });
            const json = await resp.json();
            if (!resp.ok) throw new Error(json.error || 'Erro ao autenticar');
            setStatus('Autorizado: '+ (json.user?.nome || 'Usuário'), 'success');
            document.getElementById('dy50-last').textContent = 'Último usuário: ' + (json.user?.nome || 'desconhecido');
            log('Autorizado: ' + (json.user?.nome || 'desconhecido'));

            // Dispara solenoide
            try {
                setStatus('Destrancando solenoide...', 'loading');
                const p = await fetch('/api/solenoid/unlock', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ roomName: 'Porta', durationMs: 5000, reason: 'biometria' })
                });
                const pj = await p.json();
                if (!p.ok) throw new Error(pj.error || 'Falha ao acionar solenoide');
                setLockState(true);
                unlockTime = Date.now();  // Marca momento do desbloqueio para mostrar countdown
                setStatus('Porta destrancada (aguardando pressão do switch)', 'success');
                log('Solenoide destrancado: ' + (pj.message || 'OK'));
                // O countdown agora é controlado pelo micro switch
                // Se pressionar: mantém ativo
                // Se liberar: 5s para travar
            } catch (err) {
                setStatus('Erro solenoide', 'error');
                log('Erro ao acionar solenoide: ' + err.message);
            }

        } catch (err) {
            setStatus('Não autorizado', 'error');
            document.getElementById('dy50-last').textContent = 'Autorização falhou';
            log('Autenticação falhou: ' + err.message);
        }
    }

    // Função pública que o middleware/SDK local deve chamar quando houver uma leitura
    window.dy50_onFingerprintScanned = function(fingerprintCode){
        if (!fingerprintCode) return;
        authenticateFingerprint(fingerprintCode).catch(e=>console.error(e));
    };

    // Botão de teste — usa fallback se disponível
    document.getElementById('dy50-test-btn').addEventListener('click', function(){
        // Se existir função fallback para gerar código, use-a
        if (window.dy50_fallback_generate) {
            const code = window.dy50_fallback_generate();
            window.dy50_onFingerprintScanned(code);
            return;
        }
        // Senão pergunta no prompt
        const manual = prompt('Código da digital (string simulada):', 'TEST-DY50-12345');
        if (manual) window.dy50_onFingerprintScanned(manual);
    });

    // Inicia polling do estado da solenoide ao carregar
    startSwitchPolling();

    // Estilo leve para não depender de estilos existentes
    const css = `.dy50-header{font-weight:600;padding:8px 12px;background:#1f6feb;color:#fff;border-radius:8px 8px 0 0}
    #dy50-biometry-panel{position:fixed;right:18px;bottom:18px;z-index:99999;width:260px;background:#fff;border-radius:8px;box-shadow:0 8px 24px rgba(0,0,0,0.12);font-family:Inter,Arial,Helvetica,sans-serif;overflow:hidden}
    .dy50-body{padding:12px}
    .dy50-status{padding:10px;border-radius:6px;text-align:center;margin-bottom:8px}
    .dy50-status.idle{background:#f3f4f6;color:#333}
    .dy50-status.loading{background:#fff4e5;color:#a46a00}
    .dy50-status.success{background:#e9f7ef;color:#0b6623}
    .dy50-status.error{background:#fff0f0;color:#8a1f1f}
    .dy50-actions{display:flex;gap:6px}
    .dy50-btn{flex:1;padding:8px;border-radius:6px;border:1px solid #ddd;background:#f8f9fb;cursor:pointer}
    .dy50-btn.small{padding:6px;font-size:12px}
    .dy50-btn.unlocked{background:#e9f7ef;border-color:#c5efd6}
    .dy50-btn.locked{background:#fff0f0;border-color:#f1c0c0}
    .dy50-log{margin-top:8px;font-size:12px;color:#444;max-height:80px;overflow:auto}
    `;
    const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

})();
