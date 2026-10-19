/**
 * Funções de data e hora.
 *
 * Todas as datas trafegam no formato ISO 'AAAA-MM-DD' e as horas como
 * 'HH:MM:SS', no fuso horário local do computador que roda o servidor.
 */
const config = require('../config');

const FAIXAS_HORARIO = [
    { inicio: '07:00', fim: '08:40' },
    { inicio: '08:40', fim: '10:20' },
    { inicio: '10:30', fim: '12:10' },
    { inicio: '13:00', fim: '14:40' },
    { inicio: '14:40', fim: '16:20' },
    { inicio: '16:30', fim: '18:10' },
    { inicio: '19:00', fim: '20:40' },
    { inicio: '20:40', fim: '22:00' }
].map(f => ({ ...f, label: `${f.inicio}–${f.fim}` }));

const DIAS_SEMANA = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta'];

const doisDigitos = n => String(n).padStart(2, '0');

function dataParaIso(d) {
    return `${d.getFullYear()}-${doisDigitos(d.getMonth() + 1)}-${doisDigitos(d.getDate())}`;
}

/** Data/hora atuais (ou a data fixa definida em INNOVAROOM_AGORA, usada nos testes). */
function agoraDate() {
    if (config.agoraFixo) {
        const d = new Date(config.agoraFixo);
        if (!Number.isNaN(d.getTime())) return d;
    }
    return new Date();
}

function agora() {
    const d = agoraDate();
    const data = dataParaIso(d);
    const hora = `${doisDigitos(d.getHours())}:${doisDigitos(d.getMinutes())}:${doisDigitos(d.getSeconds())}`;
    return { data, hora, dataHora: `${data} ${hora}` };
}

/** Aceita 'AAAA-MM-DD' ou 'DD/MM/AAAA'. Retorna 'AAAA-MM-DD' ou null se inválida. */
function normalizarData(valor) {
    const texto = String(valor || '').trim();
    let ano, mes, dia;
    let m = texto.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (m) [, ano, mes, dia] = m.map(Number);
    else {
        m = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
        if (!m) return null;
        [, dia, mes, ano] = m.map(Number);
    }
    const d = new Date(ano, mes - 1, dia);
    if (d.getFullYear() !== ano || d.getMonth() !== mes - 1 || d.getDate() !== dia) return null;
    return dataParaIso(d);
}

/** Aceita 'H:MM', 'HH:MM' ou 'HH:MM:SS'. Retorna 'HH:MM:SS' ou null se inválida. */
function normalizarHora(valor) {
    const m = String(valor || '').trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]), s = Number(m[3] || 0);
    if (h > 23 || min > 59 || s > 59) return null;
    return `${doisDigitos(h)}:${doisDigitos(min)}:${doisDigitos(s)}`;
}

function minutosDoDia(hora) {
    const [h, m] = String(hora).split(':').map(Number);
    return h * 60 + m;
}

function horaDeMinutos(total) {
    return `${doisDigitos(Math.floor(total / 60))}:${doisDigitos(total % 60)}:00`;
}

/** 0 = segunda ... 4 = sexta; null para sábado e domingo. */
function diaDaSemana(dataIso) {
    const [a, m, d] = dataIso.split('-').map(Number);
    const semana = new Date(a, m - 1, d).getDay();
    return semana >= 1 && semana <= 5 ? semana - 1 : null;
}

/** Índices das faixas da grade que se sobrepõem ao intervalo [inicio, fim). */
function faixasNoIntervalo(inicio, fim) {
    const ini = minutosDoDia(inicio), f = minutosDoDia(fim);
    return FAIXAS_HORARIO
        .map((faixa, i) => ({ i, a: minutosDoDia(faixa.inicio), b: minutosDoDia(faixa.fim) }))
        .filter(x => x.a < f && x.b > ini)
        .map(x => x.i);
}

function somarDias(dataIso, dias) {
    const [a, m, d] = dataIso.split('-').map(Number);
    return dataParaIso(new Date(a, m - 1, d + dias));
}

module.exports = {
    FAIXAS_HORARIO,
    DIAS_SEMANA,
    agora,
    normalizarData,
    normalizarHora,
    minutosDoDia,
    horaDeMinutos,
    diaDaSemana,
    faixasNoIntervalo,
    somarDias
};
