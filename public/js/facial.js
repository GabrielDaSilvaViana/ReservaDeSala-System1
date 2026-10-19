/* ═══════════════════════════════════════════════════════════════════════════
   RECONHECIMENTO FACIAL (face-api.js)

   Fluxo:
   1. Carrega a biblioteca (/vendor/face-api.min.js) e os modelos de IA
      (pasta public/models — baixe com "npm run modelos"; se não existir,
      tenta baixar da internet).
   2. Abre a câmera, detecta o rosto e calcula um descritor de 128 números.
   3. O descritor é enviado ao servidor, que compara com o rosto cadastrado
      do professor. A decisão final é sempre do servidor.
═══════════════════════════════════════════════════════════════════════════ */

const Facial = (() => {
    const FONTES_MODELOS = [
        '/models',
        'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights'
    ];
    let promessaModelos = null;
    let streamAtual = null;

    function carregarBiblioteca() {
        if (window.faceapi) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = '/vendor/face-api.min.js';
            script.onload = resolve;
            script.onerror = () => reject(new Error('Biblioteca de reconhecimento facial não encontrada. Rode "npm install" na pasta do projeto.'));
            document.head.appendChild(script);
        });
    }

    function carregarModelos() {
        if (promessaModelos) return promessaModelos;
        promessaModelos = (async () => {
            await carregarBiblioteca();
            for (const base of FONTES_MODELOS) {
                try {
                    await faceapi.nets.tinyFaceDetector.loadFromUri(base);
                    await faceapi.nets.faceLandmark68Net.loadFromUri(base);
                    await faceapi.nets.faceRecognitionNet.loadFromUri(base);
                    return;
                } catch (e) {
                    console.warn(`[facial] Não foi possível carregar os modelos de ${base}:`, e.message);
                }
            }
            throw new Error('Modelos de reconhecimento facial não encontrados. Rode "npm run modelos" (com internet) e reinicie o servidor.');
        })();
        promessaModelos.catch(() => { promessaModelos = null; });
        return promessaModelos;
    }

    async function iniciarCamera(video) {
        if (!video) throw new Error('Área de vídeo não encontrada.');
        if (!window.isSecureContext) {
            throw new Error('O navegador só libera a câmera em http://localhost ou em https. Abra o sistema pelo endereço localhost.');
        }
        if (!navigator.mediaDevices?.getUserMedia) throw new Error('Este navegador não suporta acesso à câmera.');
        pararCamera();
        try {
            streamAtual = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
        } catch (e) {
            if (e.name === 'NotAllowedError') throw new Error('A câmera foi bloqueada. Permita o acesso à câmera no navegador.');
            if (e.name === 'NotFoundError') throw new Error('Nenhuma câmera foi encontrada neste computador.');
            throw new Error(`Falha ao abrir a câmera: ${e.message || e.name}`);
        }
        video.srcObject = streamAtual;
        await video.play().catch(() => {});
        // Espera o primeiro quadro chegar
        for (let i = 0; i < 30 && video.readyState < 2; i++) await new Promise(r => setTimeout(r, 100));
    }

    function pararCamera() {
        if (streamAtual) {
            streamAtual.getTracks().forEach(t => t.stop());
            streamAtual = null;
        }
    }

    /**
     * Captura o rosto da câmera e devolve o descritor (array de 128 números).
     * Tenta por alguns segundos até encontrar exatamente um rosto.
     */
    async function capturarDescritor(video, aoInformar = () => {}) {
        aoInformar('Carregando reconhecimento facial...');
        await carregarModelos();
        if (!streamAtual || video.srcObject !== streamAtual) {
            aoInformar('Abrindo a câmera...');
            await iniciarCamera(video);
        }
        aoInformar('Procurando o rosto... olhe para a câmera.');
        const opcoes = new faceapi.TinyFaceDetectorOptions({ inputSize: 320, scoreThreshold: 0.5 });
        for (let tentativa = 0; tentativa < 12; tentativa++) {
            const deteccoes = await faceapi.detectAllFaces(video, opcoes).withFaceLandmarks().withFaceDescriptors();
            if (deteccoes.length > 1) {
                aoInformar('Mais de um rosto na câmera. Deixe apenas uma pessoa na frente.');
            } else if (deteccoes.length === 1) {
                return Array.from(deteccoes[0].descriptor);
            }
            await new Promise(r => setTimeout(r, 300));
        }
        throw new Error('Nenhum rosto foi detectado. Fique de frente para a câmera, em um local iluminado, e tente de novo.');
    }

    return { carregarModelos, iniciarCamera, pararCamera, capturarDescritor };
})();
