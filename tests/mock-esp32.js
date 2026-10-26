/**
 * ESP32 simulado (para os testes automatizados).
 * Imita as rotas do firmware: /health, /unlock, /lock, /return e /fingerprint/*.
 * Tem 3 solenoides (m.sol[1..3]); m.travada / m.chaveNoLugar / m.devolvendo
 * são atalhos para a solenoide 1, como no firmware antigo.
 */
const http = require('http');

function criarMockEsp32() {
    const m = {
        sol: {},               // estado de cada solenoide: { travada, chaveNoLugar, devolvendo }
        ultimas: [],           // solenoides acionadas (para os testes conferirem)
        devolucoes: 0,
        leitor: true,
        dedo: null,            // "dedo" que será colocado no leitor na próxima operação
        banco: new Map(),      // id -> dedo cadastrado no DY50
        destraves: 0,
        apagados: [],
        op: 0,
        status: { op: 0, estado: 'ocioso', etapa: '', motivo: '', id: -1 }
    };
    for (const n of [1, 2, 3]) m.sol[n] = { travada: true, chaveNoLugar: true, devolvendo: false };
    for (const campo of ['travada', 'chaveNoLugar', 'devolvendo']) {
        Object.defineProperty(m, campo, { get: () => m.sol[1][campo], set: v => { m.sol[1][campo] = v; } });
    }
    const json = (res, codigo, obj) => { res.writeHead(codigo, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(obj)); };
    const finalizar = (estado, id = -1, motivo = '') => { Object.assign(m.status, { estado, id, motivo, etapa: '' }); };

    m.servidor = http.createServer((req, res) => {
        const url = new URL(req.url, 'http://x');
        const caminho = url.pathname;
        const info = n => ({ id: n, locked: m.sol[n].travada, keyPresent: m.sol[n].chaveNoLugar, keyInUse: !m.sol[n].chaveNoLugar, returnMode: m.sol[n].devolvendo });
        if (caminho === '/health') {
            return json(res, 200, { ok: true, device: 'esp32-solenoid', ...info(1), id: undefined, fingerprint: m.leitor, solenoids: [1, 2, 3].map(info) });
        }
        const n = url.searchParams.has('s') ? Number(url.searchParams.get('s')) : 1;
        if (['/return', '/unlock', '/lock'].includes(caminho) && !m.sol[n]) { res.writeHead(400); res.end('SOLENOIDE_INVALIDA'); return; }
        if (caminho === '/return' && req.method === 'POST') {
            if (m.sol[n].chaveNoLugar) { res.writeHead(409); res.end('CHAVE_JA_NO_LUGAR'); return; }
            m.devolucoes += 1;
            m.ultimas.push(`return:${n}`);
            m.sol[n].travada = false;
            m.sol[n].devolvendo = true;
            res.end('RETURN_OK');
            return;
        }
        if (caminho === '/unlock' && req.method === 'POST') {
            m.destraves += 1;
            m.ultimas.push(`unlock:${n}`);
            m.sol[n].travada = false;
            setTimeout(() => { m.sol[n].travada = true; }, 1500);
            res.end('UNLOCK_OK');
            return;
        }
        if (caminho === '/lock') { m.sol[n].travada = true; res.end('LOCK_OK'); return; }
        if (caminho === '/fingerprint/status') return json(res, 200, { ...m.status, leitor: m.leitor });
        if (caminho === '/fingerprint/cancel') { finalizar('cancelado'); return json(res, 200, { ok: true }); }
        if (!m.leitor) return json(res, 503, { motivo: 'leitor_ausente' });
        if (caminho === '/fingerprint/delete') { m.apagados.push(Number(url.searchParams.get('id'))); m.banco.delete(Number(url.searchParams.get('id'))); return json(res, 200, { ok: true }); }
        if (caminho === '/fingerprint/scan') {
            m.op += 1;
            m.status = { op: m.op, estado: 'aguardando', etapa: 'coloque_dedo', motivo: '', id: -1 };
            setTimeout(() => {
                if (!m.dedo) return finalizar('tempo_esgotado');
                const achado = [...m.banco].find(([, d]) => d === m.dedo);
                if (achado) finalizar('ok', achado[0]); else finalizar('nao_encontrada');
            }, 200);
            return json(res, 200, { op: m.op });
        }
        if (caminho === '/fingerprint/enroll') {
            const id = Number(url.searchParams.get('id'));
            m.op += 1;
            m.status = { op: m.op, estado: 'aguardando', etapa: 'coloque_dedo', motivo: '', id: -1 };
            setTimeout(() => { m.status.etapa = 'retire_dedo'; }, 150);
            setTimeout(() => { m.status.etapa = 'coloque_novamente'; }, 300);
            setTimeout(() => {
                const outro = [...m.banco].find(([i, d]) => d === m.dedo && i !== id);
                if (outro) return finalizar('erro', outro[0], 'ja_cadastrada');
                m.banco.set(id, m.dedo);
                finalizar('concluido', id);
            }, 450);
            return json(res, 200, { op: m.op });
        }
        res.writeHead(404); res.end('NAO_ENCONTRADO');
    });
    return m;
}

module.exports = { criarMockEsp32 };
