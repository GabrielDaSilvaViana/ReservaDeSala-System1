/* ═══════════════════════════════════════════════════════════════════════════
   API — comunicação com o servidor
═══════════════════════════════════════════════════════════════════════════ */

const CHAVE_TOKEN_ADMIN = 'innovaroom_admin_token';

/** Token da sessão do administrador (guardado só nesta aba do navegador). */
const sessaoAdmin = {
    obter() {
        try { return sessionStorage.getItem(CHAVE_TOKEN_ADMIN); } catch (_) { return null; }
    },
    salvar(token) {
        try { sessionStorage.setItem(CHAVE_TOKEN_ADMIN, token); } catch (_) { /* sem armazenamento */ }
    },
    limpar() {
        try { sessionStorage.removeItem(CHAVE_TOKEN_ADMIN); } catch (_) { /* sem armazenamento */ }
    }
};

class ErroApi extends Error {
    constructor(mensagem, status) {
        super(mensagem);
        this.status = status;
    }
}

async function apiRequest(metodo, caminho, corpo) {
    const headers = { Accept: 'application/json' };
    if (corpo !== undefined) headers['Content-Type'] = 'application/json';
    const token = sessaoAdmin.obter();
    if (token) headers.Authorization = `Bearer ${token}`;

    let resposta;
    try {
        resposta = await fetch(caminho, {
            method: metodo,
            headers,
            body: corpo !== undefined ? JSON.stringify(corpo) : undefined
        });
    } catch (_) {
        throw new ErroApi('Sem conexão com o servidor. Verifique se o "npm start" está rodando.', 0);
    }

    let dados = null;
    const texto = await resposta.text();
    if (texto) {
        try { dados = JSON.parse(texto); } catch (_) { dados = null; }
    }
    if (!resposta.ok) {
        // Sessão de admin expirada: volta para o modo padrão
        if (resposta.status === 403 && token && typeof aoPerderSessaoAdmin === 'function' && /administrador/i.test(dados?.erro || '')) {
            aoPerderSessaoAdmin();
        }
        throw new ErroApi(dados?.erro || `Erro ${resposta.status} ao comunicar com o servidor.`, resposta.status);
    }
    return dados;
}

const api = {
    get: caminho => apiRequest('GET', caminho),
    post: (caminho, corpo = {}) => apiRequest('POST', caminho, corpo),
    put: (caminho, corpo = {}) => apiRequest('PUT', caminho, corpo),
    del: caminho => apiRequest('DELETE', caminho)
};
