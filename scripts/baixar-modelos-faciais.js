/**
 * Baixa os modelos de IA usados no reconhecimento facial (face-api.js) para
 * public/models. Assim o reconhecimento funciona mesmo SEM internet no dia da
 * apresentação. Precisa de internet só na hora de rodar este comando.
 *
 * Uso:  npm run modelos
 */
const fs = require('fs');
const path = require('path');

const DESTINO = path.join(__dirname, '..', 'public', 'models');
const FONTES = [
    'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights',
    'https://raw.githubusercontent.com/justadudewhohacks/face-api.js/master/weights'
];
const MODELOS = ['tiny_face_detector_model', 'face_landmark_68_model', 'face_recognition_model'];

async function baixar(url) {
    const resposta = await fetch(url, { signal: AbortSignal.timeout(60000) });
    if (!resposta.ok) throw new Error(`HTTP ${resposta.status}`);
    return Buffer.from(await resposta.arrayBuffer());
}

async function baixarModelo(base, modelo) {
    const manifestoNome = `${modelo}-weights_manifest.json`;
    const manifesto = await baixar(`${base}/${manifestoNome}`);
    fs.writeFileSync(path.join(DESTINO, manifestoNome), manifesto);
    const arquivos = JSON.parse(manifesto.toString('utf8')).flatMap(grupo => grupo.paths);
    for (const arquivo of arquivos) {
        fs.writeFileSync(path.join(DESTINO, arquivo), await baixar(`${base}/${arquivo}`));
        console.log(`   ✓ ${arquivo}`);
    }
}

async function main() {
    fs.mkdirSync(DESTINO, { recursive: true });
    for (const modelo of MODELOS) {
        let ok = false;
        for (const base of FONTES) {
            try {
                console.log(`Baixando ${modelo}...`);
                await baixarModelo(base, modelo);
                ok = true;
                break;
            } catch (e) {
                console.warn(`   (falhou em ${new URL(base).host}: ${e.message})`);
            }
        }
        if (!ok) {
            console.error(`❌ Não foi possível baixar ${modelo}. Verifique a internet ou baixe manualmente a pasta "weights"`);
            console.error('   do repositório github.com/justadudewhohacks/face-api.js para public/models.');
            process.exit(1);
        }
    }
    console.log(`✅ Modelos salvos em ${DESTINO}`);
}

main();
