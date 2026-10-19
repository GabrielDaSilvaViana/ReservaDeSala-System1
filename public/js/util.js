/* ═══════════════════════════════════════════════════════════════════════════
   UTILITÁRIOS — funções pequenas usadas em todo o front-end
═══════════════════════════════════════════════════════════════════════════ */

/**
 * Escapa texto antes de colocar dentro do HTML (evita que um nome ou descrição
 * digitada como <script>... seja executada — proteção contra XSS).
 */
function esc(valor) {
    return String(valor ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

const MESES = [
    'Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho',
    'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'
];
const DOW = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

const doisDigitos = n => String(n).padStart(2, '0');

/** '2026-10-19' → '19/10/2026' */
function isoParaBr(iso) {
    if (!iso) return '—';
    const [a, m, d] = String(iso).slice(0, 10).split('-');
    return `${d}/${m}/${a}`;
}

/** (ano, mês 0-11, dia) → '2026-10-19' */
function montarIso(ano, mes, dia) {
    return `${ano}-${doisDigitos(mes + 1)}-${doisDigitos(dia)}`;
}

/** '2026-10-19' → { a, m (0-11), d } */
function partesIso(iso) {
    const [a, m, d] = String(iso).split('-').map(Number);
    return { a, m: m - 1, d };
}

/** 'HH:MM' → minutos desde 00:00 */
function timeToMinutes(hhmm) {
    if (!hhmm) return 0;
    const [h, m] = String(hhmm).split(':').map(Number);
    return h * 60 + m;
}

function minutesToTime(total) {
    return `${doisDigitos(Math.floor(total / 60))}:${doisDigitos(total % 60)}`;
}

/** 0 = segunda ... 4 = sexta; null no fim de semana */
function diaDaSemanaIso(iso) {
    const { a, m, d } = partesIso(iso);
    const semana = new Date(a, m, d).getDay();
    return semana >= 1 && semana <= 5 ? semana - 1 : null;
}

function horarioTexto(r) {
    return r ? `${r.inicio}–${r.fim}` : '—';
}

function traduzStatus(s) {
    return { livre: 'Disponível', reservada: 'Reservada', ocupada: 'Ocupada', evento: 'Evento' }[s] || s;
}

function debounce(fn, ms) {
    let t = null;
    return (...args) => {
        clearTimeout(t);
        t = setTimeout(() => fn(...args), ms);
    };
}

/** Mostra uma mensagem de status dentro de um modal (reaproveita o estilo .face-auth-status). */
function setStatus(el, mensagem, tipo = 'info') {
    if (!el) return;
    el.textContent = mensagem;
    el.className = `face-auth-status ${tipo}`;
    el.style.display = mensagem ? 'block' : 'none';
}

/** Desabilita o botão enquanto uma ação assíncrona roda (evita clique duplo). */
async function comBotaoOcupado(botao, acao) {
    if (!botao || botao.disabled) return;
    const html = botao.innerHTML;
    botao.disabled = true;
    botao.style.opacity = '0.7';
    try {
        return await acao();
    } finally {
        botao.disabled = false;
        botao.style.opacity = '';
        botao.innerHTML = html;
    }
}

/* Em modo diagnóstico (abra a página com ?debug) os erros de script aparecem na tela. */
if (new URLSearchParams(location.search).has('debug')) {
    const mostrarErro = texto => {
        document.getElementById('jsErrorBanner')?.remove();
        const banner = document.createElement('div');
        banner.id = 'jsErrorBanner';
        banner.style = 'background:#fff6f6;color:#900;border:1px solid #f5c6cb;padding:10px;position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;max-width:90%;';
        banner.innerText = texto;
        document.body.appendChild(banner);
    };
    window.addEventListener('error', e => mostrarErro(`Erro de script: ${e.message} (${e.filename}:${e.lineno})`));
    window.addEventListener('unhandledrejection', e => mostrarErro(`Erro: ${e.reason && e.reason.message ? e.reason.message : e.reason}`));
}
