/* ═══════════════════════════════════════════════════════════════════════════
   DEVOLVER A CHAVE (leitura de QR code)

   1. O professor clica em "Devolver Chave" e a câmera abre.
   2. Ele mostra o QR code preso na chave. A biblioteca jsQR (public/lib)
      lê o código no próprio navegador.
   3. O servidor confere de qual solenoide é o QR code e manda o ESP32
      destravar no modo devolução.
   4. O professor coloca a chave: ela aperta o micro switch e o ESP32 trava.
      A tela acompanha pelo /api/solenoide/status e fecha sozinha.
   5. Se a chave era de uma sala ocupada, a sala volta para "reservada"
      (a reserva continua valendo). Para encerrar de vez: "Desocupar Sala".

   Hoje existe só a solenoide 1. Os QR codes ficam no .env (QRCODE_SOLENOIDE_1).
═══════════════════════════════════════════════════════════════════════════ */

const Devolucao = (() => {
    let stream = null;
    let timerLeitura = null;
    let timerMonitor = null;
    let timerFechar = null;
    let timerSimulacao = null;
    let promessaBiblioteca = null;

    function carregarBiblioteca() {
        if (window.jsQR) return Promise.resolve();
        if (promessaBiblioteca) return promessaBiblioteca;
        promessaBiblioteca = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/lib/jsQR.js';
            script.onload = resolve;
            script.onerror = () => {
                promessaBiblioteca = null;
                reject(new Error('Leitor de QR code não encontrado (arquivo public/lib/jsQR.js).'));
            };
            document.head.appendChild(script);
        });
        return promessaBiblioteca;
    }

    async function abrirCamera(video) {
        if (!window.isSecureContext) {
            throw new Error('O navegador só libera a câmera em http://localhost ou em https. Abra o sistema pelo endereço localhost.');
        }
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não suporta acesso à câmera.');
        pararCamera();
        try {
            stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } }, audio: false });
        } catch (e) {
            if (e.name === 'NotAllowedError') throw new Error('A câmera foi bloqueada. Permita o acesso à câmera no navegador.');
            if (e.name === 'NotFoundError') throw new Error('Nenhuma câmera foi encontrada neste computador.');
            throw new Error(`Falha ao abrir a câmera: ${e.message || e.name}`);
        }
        video.srcObject = stream;
        await video.play().catch(() => {});
    }

    function pararCamera() {
        clearInterval(timerLeitura);
        timerLeitura = null;
        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }
    }

    /** Para tudo (câmera e acompanhamento da solenoide). Chamado ao fechar o modal. */
    function parar() {
        pararCamera();
        clearInterval(timerMonitor);
        clearTimeout(timerFechar);
        clearTimeout(timerSimulacao);
        timerMonitor = timerFechar = timerSimulacao = null;
    }

    /** Campo "de qual sala é a chave" (salas ocupadas agora). */
    function htmlSalaDaChave(reservaId) {
        const ocupadas = estado.reservas.filter(r => r.status === 'em_uso');
        if (!ocupadas.length) return '';
        const escolhida = reservaId ? Number(reservaId) : (ocupadas.length === 1 ? ocupadas[0].id : null);
        return `
            <label class="field-label">Sala desta chave</label>
            <select class="input-field" id="qrSala">
                ${escolhida ? '' : '<option value="">Selecione a sala</option>'}
                ${ocupadas.map(r => `<option value="${r.id}" ${r.id === escolhida ? 'selected' : ''}>${esc(r.salaNome)} — ${esc(r.responsavel)}</option>`).join('')}
                <option value="nenhuma">Nenhuma sala (só guardar a chave)</option>
            </select>
            <p class="hint-text">A sala escolhida volta a ficar <strong>reservada</strong>. Para encerrar a reserva, use <strong>Desocupar Sala</strong>.</p>`;
    }

    /* ─── Passo 1: ler o QR code ─────────────────────────────────────────── */
    function abrir(reservaId = null) {
        parar();
        if (typeof closeConfig === 'function') closeConfig();
        content.innerHTML = `
            ${cabecalhoModal('Devolver a chave', 'Mostre para a câmera o QR code preso na chave')}
            ${htmlSalaDaChave(reservaId)}
            <div class="face-video-wrap qr-video-wrap">
                <video id="qrVideo" autoplay muted playsinline class="face-video qr-video"></video>
                <div class="qr-mira"></div>
            </div>
            <div class="face-auth-status info" id="qrStatus">Abrindo a câmera...</div>
            <details class="qr-manual">
                <summary>A câmera não lê? Digite o código do QR</summary>
                <div class="time-row" style="margin-top:8px">
                    <input type="text" class="input-field" id="qrManual" maxlength="120" placeholder="Ex: INNOVAROOM-SOLENOIDE-1" autocomplete="off">
                    <button class="btn-secondary" id="qrManualBtn" style="flex:0 0 auto">Enviar</button>
                </div>
            </details>
            <button class="btn-outline" onclick="closeM()">Cancelar</button>
        `;
        abrirModal();

        const video = content.querySelector('#qrVideo');
        const status = content.querySelector('#qrStatus');
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d', { willReadFrequently: true });
        let enviando = false;
        let ultimo = { texto: '', em: 0 };

        const selectSala = content.querySelector('#qrSala');
        if (selectSala) selectSala.addEventListener('change', () => { selectSala.classList.remove('error'); ultimo = { texto: '', em: 0 }; });

        const tentar = async texto => {
            if (enviando) return;
            if (selectSala && !selectSala.value) {
                selectSala.classList.add('error');
                setStatus(status, 'QR code lido. Escolha acima de qual sala é esta chave.', 'error');
                return;
            }
            // Não reenvia o mesmo QR recusado várias vezes por segundo
            if (texto === ultimo.texto && Date.now() - ultimo.em < 3000) return;
            ultimo = { texto, em: Date.now() };
            enviando = true;
            setStatus(status, 'QR code lido. Liberando a solenoide...', 'info');
            try {
                const sala = selectSala && selectSala.value !== 'nenhuma' ? Number(selectSala.value) : null;
                const resultado = await api.post('/api/chave/devolver', { qrcode: texto, reservaId: sala });
                if (!video.isConnected) return;
                pararCamera();
                telaDevolucao(resultado);
            } catch (e) {
                if (video.isConnected) setStatus(status, `${e.message} Tente de novo.`, 'error');
            } finally {
                enviando = false;
            }
        };

        content.querySelector('#qrManualBtn').addEventListener('click', () => {
            const texto = content.querySelector('#qrManual').value.trim();
            if (texto) { ultimo = { texto: '', em: 0 }; tentar(texto); }
        });

        (async () => {
            try {
                await carregarBiblioteca();
                await abrirCamera(video);
                if (!video.isConnected) { pararCamera(); return; }
                setStatus(status, 'Procurando o QR code... aproxime a chave da câmera.', 'info');
            } catch (e) {
                pararCamera();
                if (video.isConnected) setStatus(status, e.message, 'error');
                return;
            }
            timerLeitura = setInterval(() => {
                if (!video.isConnected) { pararCamera(); return; }
                if (enviando || video.readyState < 2 || !video.videoWidth) return;
                const escala = Math.min(1, 640 / video.videoWidth);
                const w = Math.round(video.videoWidth * escala);
                const h = Math.round(video.videoHeight * escala);
                canvas.width = w;
                canvas.height = h;
                ctx.drawImage(video, 0, 0, w, h);
                const codigo = window.jsQR(ctx.getImageData(0, 0, w, h).data, w, h, { inversionAttempts: 'attemptBoth' });
                if (codigo && codigo.data) tentar(codigo.data.trim());
            }, 250);
        })();
    }

    /* ─── Passo 2: solenoide destravada, esperando a chave ───────────────── */
    function telaDevolucao(res) {
        const hardware = res.modo === 'hardware';
        const segundos = Math.round((res.duracaoMs || 20000) / 1000);
        content.innerHTML = `
            <div class="solenoid-screen">
                <button class="btn-close solenoid-close" onclick="closeM()" title="Fechar"><i class="fas fa-times"></i></button>
                <div class="solenoid-badges">
                    <span class="solenoid-pill active"><i class="fas fa-key"></i> Devolução da chave</span>
                    <span class="solenoid-pill">${hardware ? `Solenoide ${res.solenoide || 1}` : 'Modo Simulação'}</span>
                </div>
                <div class="solenoid-visual locked" id="devVisual">
                    <div class="solenoid-lock"><div class="solenoid-core"></div></div>
                    <div class="solenoid-led" id="devLed"></div>
                </div>
                <div class="solenoid-title" id="devTitulo"></div>
                <p class="solenoid-sub" id="devSub"></p>
                <div class="solenoid-log" id="devLog"></div>
                <div class="solenoid-actions" id="devAcoes" style="display:none">
                    <button class="btn-secondary" onclick="Devolucao.abrir()"><i class="fas fa-qrcode"></i> Ler o QR code de novo</button>
                </div>
            </div>
        `;
        const visual = content.querySelector('#devVisual');
        const led = content.querySelector('#devLed');
        const titulo = content.querySelector('#devTitulo');
        const sub = content.querySelector('#devSub');
        const logBox = content.querySelector('#devLog');
        const acoes = content.querySelector('#devAcoes');
        const linhas = [];

        const log = msg => {
            const hora = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            linhas.push(`${hora} — ${msg}`);
            if (linhas.length > 6) linhas.shift();
            logBox.innerHTML = linhas.map(l => `<div>${esc(l)}</div>`).join('');
        };
        const estadoVisual = estado => {
            visual.classList.remove('unlocking', 'unlocked', 'locked');
            visual.classList.add(estado);
            led.style.background = estado === 'unlocked' ? '#22c55e' : estado === 'unlocking' ? '#f59e0b' : '#ef4444';
        };
        const mostrar = (t, s) => { titulo.textContent = t; sub.innerHTML = s; };
        const fecharDepois = ms => { timerFechar = setTimeout(() => { if (visual.isConnected) closeM(); }, ms); };
        const concluido = async () => {
            estadoVisual('locked');
            log('Chave devolvida. Solenoide travada.');
            if (!res.ticket) {
                mostrar('Chave devolvida!', 'Obrigado! A chave está guardada. Esta tela fecha sozinha.');
                fecharDepois(3000);
                return;
            }
            mostrar('Chave devolvida!', 'Atualizando a sala...');
            // A sala volta para "reservada" (o servidor confere a chave no ESP32)
            for (let tentativa = 0; tentativa < 4; tentativa++) {
                try {
                    const r = await api.post('/api/chave/devolvida', { ticket: res.ticket });
                    if (!visual.isConnected) return;
                    log(`${r.salaNome} voltou para Reservada.`);
                    mostrar('Chave devolvida!', `A sala <strong>${esc(r.salaNome)}</strong> voltou para <strong>reservada</strong> até ${esc(r.fim)}. Para encerrar, use <strong>Desocupar Sala</strong>. Esta tela fecha sozinha.`);
                    recarregarTudo().catch(() => {});
                    fecharDepois(4000);
                    return;
                } catch (e) {
                    if (e.status !== 409 || tentativa === 3) {
                        if (!visual.isConnected) return;
                        log(e.message);
                        mostrar('Chave guardada', `Mas não foi possível atualizar a sala: ${esc(e.message)}`);
                        return;
                    }
                    await new Promise(ok => setTimeout(ok, 1000));
                }
            }
        };
        const semChave = () => {
            estadoVisual('locked');
            log('Ninguém colocou a chave: a solenoide travou.');
            mostrar('Solenoide travada', 'A chave não foi colocada a tempo. Leia o QR code de novo para tentar outra vez.');
            acoes.style.display = 'flex';
        };

        if (!res.ok) {
            estadoVisual('locked');
            log(res.mensagem);
            if (res.chaveJaNoLugar) {
                mostrar('A chave já está no lugar', 'O sensor já detecta uma chave guardada, então a solenoide não foi destravada.');
            } else {
                mostrar('Não foi possível destravar', 'Confira o ESP32 e leia o QR code de novo.');
                acoes.style.display = 'flex';
            }
            return;
        }

        estadoVisual('unlocked');
        log(res.mensagem);
        if (res.reserva) log(`Chave da sala ${res.reserva.salaNome}.`);
        mostrar('Coloque a chave no lugar', `A solenoide destravou. Coloque a chave em até <strong>${segundos} segundos</strong>; ela trava sozinha quando a chave encostar no sensor.`);

        if (!hardware) {
            // Simulação: sem sensor de verdade, considera a chave colocada após 3 s
            timerSimulacao = setTimeout(() => {
                if (!visual.isConnected) return;
                log('Simulação: chave colocada no lugar.');
                concluido();
            }, 3000);
            return;
        }

        // Hardware: acompanha a trava e o micro switch pelo ESP32
        const fim = Date.now() + (res.duracaoMs || 20000) + 10000;
        let chaveColocada = false;
        let consultas = 0;
        timerMonitor = setInterval(async () => {
            if (!visual.isConnected || Date.now() > fim) { clearInterval(timerMonitor); return; }
            consultas += 1;
            let st;
            try { st = await api.get('/api/solenoide/status'); } catch (_) { return; }
            if (!visual.isConnected || !timerMonitor) return;
            if (st.chaveEmUso === false && !chaveColocada) {
                chaveColocada = true;
                log('Chave colocada no lugar.');
                mostrar('Chave colocada', 'Travando a solenoide...');
            }
            if (st.travada && consultas >= 1) {
                clearInterval(timerMonitor);
                timerMonitor = null;
                if (chaveColocada || st.chaveEmUso === false) concluido();
                else semChave();
            }
        }, 1000);
    }

    return { abrir, parar };
})();

function abrirDevolucaoChave(reservaId = null) {
    Devolucao.abrir(reservaId);
}
