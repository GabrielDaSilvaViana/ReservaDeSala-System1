/**
 * Erro com código HTTP. Lançado pelas regras de negócio e convertido em
 * resposta JSON { erro: "mensagem" } pelo tratador central do servidor.
 */
class ErroHttp extends Error {
    constructor(status, mensagem, detalhes = undefined) {
        super(mensagem);
        this.status = status;
        this.detalhes = detalhes;
    }
}

const erro = {
    requisicao: (msg, det) => new ErroHttp(400, msg, det),
    naoAutenticado: (msg = 'Credencial inválida.', det) => new ErroHttp(401, msg, det),
    proibido: (msg = 'Acesso permitido somente ao administrador.', det) => new ErroHttp(403, msg, det),
    naoEncontrado: (msg, det) => new ErroHttp(404, msg, det),
    conflito: (msg, det) => new ErroHttp(409, msg, det),
    muitasTentativas: (msg, det) => new ErroHttp(429, msg, det),
    dispositivo: (msg, det) => new ErroHttp(502, msg, det)
};

/** Envolve uma rota async para que qualquer erro chegue ao tratador central. */
const rota = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

module.exports = { ErroHttp, erro, rota };
