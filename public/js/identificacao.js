/* ═══════════════════════════════════════════════════════════════════════════
   PAINEL DE IDENTIFICAÇÃO (Digital / Facial / Crachá)

   Componente único, usado ao reservar, ocupar, desocupar e mudar de sala.
   Ele só COLETA a credencial; quem confere é o servidor.
═══════════════════════════════════════════════════════════════════════════ */

let contadorPainel = 0;

/** HTML do painel. `prefixo` deixa os ids únicos dentro do modal. */
function htmlPainelIdentificacao(prefixo) {
    return `
        <div class="auth-container" id="${prefixo}-metodos">
            <div class="auth-box" data-metodo="digital">
                <i class="fas fa-fingerprint"></i><small>Digital</small>
            </div>
            <div class="auth-box selected" data-metodo="facial">
                <i class="fas fa-user-circle"></i><small>Facial</small>
            </div>
            <div class="auth-box" data-metodo="cracha">
                <i class="fas fa-id-card"></i><small>Crachá</small>
            </div>
        </div>
        <div class="face-auth-panel" id="${prefixo}-painel-facial">
            <div class="face-video-wrap">
                <video id="${prefixo}-video" autoplay muted playsinline class="face-video"></video>
            </div>
            <div class="face-auth-actions">
                <button type="button" class="btn-secondary" id="${prefixo}-camera"><i class="fas fa-camera"></i> Ativar câmera</button>
            </div>
            <div class="face-auth-status info" id="${prefixo}-status-facial">O rosto é capturado ao confirmar. Se quiser, ative a câmera antes para se posicionar.</div>
        </div>
        <div class="auth-credential-panel" id="${prefixo}-painel-cracha" style="display:none">
            <label class="field-label" for="${prefixo}-cracha">Código do Crachá</label>
            <input type="text" class="input-field" id="${prefixo}-cracha" placeholder="Ex: RFID-123456" autocomplete="off" maxlength="64">
        </div>
        <div class="auth-credential-panel" id="${prefixo}-painel-digital" style="display:none">
            ${estado.digitalModo === 'esp32' ? `
            <div class="fingerprint-read-status info" id="${prefixo}-status-digital">Ao confirmar, coloque o dedo no leitor de digital.</div>` : `
            <label class="field-label" for="${prefixo}-digital">Código da Digital</label>
            <input type="text" class="input-field" id="${prefixo}-digital" placeholder="Ex: FP-98765" autocomplete="off" maxlength="64">
            <div class="fingerprint-read-status info" id="${prefixo}-status-digital">Digital ainda não foi lida.</div>`}
        </div>
        <p class="hint-text">Primeiro acesso? A credencial usada agora fica cadastrada para você.</p>
    `;
}

/**
 * Liga os eventos do painel que já está no DOM.
 * Retorna { metodo(), obterCredencial(), statusFacial }.
 */
function ativarPainelIdentificacao(raiz, prefixo) {
    const $ = id => raiz.querySelector(`#${prefixo}-${id}`);
    const video = $('video');
    const statusFacial = $('status-facial');
    const inputDigital = $('digital');
    const statusDigital = $('status-digital');
    let metodoAtual = 'facial';

    const mostrar = metodo => {
        metodoAtual = metodo;
        raiz.querySelectorAll(`#${prefixo}-metodos .auth-box`).forEach(b => b.classList.toggle('selected', b.dataset.metodo === metodo));
        $('painel-facial').style.display = metodo === 'facial' ? 'block' : 'none';
        $('painel-cracha').style.display = metodo === 'cracha' ? 'block' : 'none';
        $('painel-digital').style.display = metodo === 'digital' ? 'block' : 'none';
        if (metodo !== 'facial') Facial.pararCamera();
        if (metodo === 'cracha') $('cracha').focus();
        if (metodo === 'digital' && inputDigital) inputDigital.focus();
    };

    raiz.querySelectorAll(`#${prefixo}-metodos .auth-box`).forEach(box => {
        box.addEventListener('click', () => mostrar(box.dataset.metodo));
    });

    const statusDaDigital = (texto, tipo) => {
        statusDigital.textContent = texto;
        statusDigital.className = `fingerprint-read-status ${tipo}`;
    };

    // Modo simulação: o código da digital é digitado
    inputDigital?.addEventListener('input', () => {
        const lida = inputDigital.value.trim().length > 0;
        statusDaDigital(lida ? 'Digital lida.' : 'Digital ainda não foi lida.', lida ? 'success' : 'info');
    });

    $('camera').addEventListener('click', async () => {
        try {
            setStatus(statusFacial, 'Abrindo a câmera...', 'info');
            await Facial.iniciarCamera(video);
            setStatus(statusFacial, 'Câmera ativa. Centralize o rosto e clique em confirmar.', 'success');
            Facial.carregarModelos().catch(e => setStatus(statusFacial, e.message, 'error'));
        } catch (e) {
            setStatus(statusFacial, e.message, 'error');
        }
    });

    return {
        metodo: () => metodoAtual,
        statusFacial,
        /** Coleta a credencial escolhida. Lança erro com mensagem amigável. */
        async obterCredencial() {
            if (metodoAtual === 'cracha') {
                const codigo = $('cracha').value.trim();
                if (!codigo) throw new Error('Informe o código do crachá.');
                return { metodo: 'cracha', codigo };
            }
            if (metodoAtual === 'digital') {
                if (!inputDigital) {
                    // Leitor DY50 real: o servidor lê o dedo e devolve um token de uso único
                    statusDaDigital('Coloque o dedo no leitor de digital...', 'info');
                    try {
                        const { leitura } = await api.post('/api/digital/ler');
                        statusDaDigital('Digital lida. Validando...', 'success');
                        return { metodo: 'digital', leitura };
                    } catch (e) {
                        statusDaDigital(e.message, 'error');
                        throw e;
                    }
                }
                const codigo = inputDigital.value.trim();
                if (!codigo) throw new Error('Informe o código da digital.');
                return { metodo: 'digital', codigo };
            }
            const descritor = await Facial.capturarDescritor(video, msg => setStatus(statusFacial, msg, 'info'));
            setStatus(statusFacial, 'Rosto capturado. Validando...', 'info');
            return { metodo: 'facial', descritor };
        }
    };
}

/** Atalho: gera um prefixo único. */
function novoPrefixoPainel() {
    contadorPainel += 1;
    return `ident${contadorPainel}`;
}
