-- =============================================================================
--  InnovaRoom — Banco de dados (MySQL 8.0.16 ou superior)
-- =============================================================================
--  ATENÇÃO: este script APAGA e recria todas as tabelas do sistema.
--  Use para instalar o banco pela primeira vez ou para voltar ao estado inicial.
--
--  Formas de executar:
--    1) Terminal, na pasta do projeto:   npm run banco:recriar
--    2) MySQL Workbench: abra este arquivo e execute tudo (raio ⚡).
--
--  O usuário administrador NÃO é criado aqui: o servidor cria automaticamente
--  o usuário "admin" na primeira vez que iniciar, já com a senha criptografada
--  (senha definida em ADMIN_SENHA no arquivo .env).
-- =============================================================================

CREATE DATABASE IF NOT EXISTS innovaroom
    CHARACTER SET utf8mb4
    COLLATE utf8mb4_unicode_ci;
USE innovaroom;

SET FOREIGN_KEY_CHECKS = 0;

-- Tabelas da versão nova
DROP TABLE IF EXISTS logs_acesso;
DROP TABLE IF EXISTS reservas;
DROP TABLE IF EXISTS grade_semanal;
DROP TABLE IF EXISTS turmas;
DROP TABLE IF EXISTS salas;
DROP TABLE IF EXISTS professores;
DROP TABLE IF EXISTS admins;

-- Tabelas e rotinas da versão antiga (removidas para não deixar lixo no banco)
DROP TABLE IF EXISTS access_logs;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS grade_weekly;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;
DROP FUNCTION IF EXISTS str_to_date_br;
DROP PROCEDURE IF EXISTS sp_reservar_sala;
DROP PROCEDURE IF EXISTS sp_adicionar_evento;
DROP PROCEDURE IF EXISTS sp_liberar_sala;

SET FOREIGN_KEY_CHECKS = 1;

-- -----------------------------------------------------------------------------
-- Administradores (senha guardada como hash scrypt, nunca em texto puro)
-- -----------------------------------------------------------------------------
CREATE TABLE admins (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    usuario       VARCHAR(50)  NOT NULL,
    senha_hash    VARCHAR(255) NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_admins_usuario UNIQUE (usuario)
);

-- -----------------------------------------------------------------------------
-- Professores e suas credenciais
--   cracha_hash / digital_hash: SHA-256 do código (o código em si não é salvo)
--   rosto_descritor: vetor de 128 números (JSON) gerado pelo face-api.js
-- -----------------------------------------------------------------------------
CREATE TABLE professores (
    id               INT AUTO_INCREMENT PRIMARY KEY,
    nome             VARCHAR(100) NOT NULL,
    cracha_hash      CHAR(64)     NULL,
    digital_hash     CHAR(64)     NULL,
    rosto_descritor  TEXT         NULL,
    ativo            TINYINT(1)   NOT NULL DEFAULT 1,
    created_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at       TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT uq_professores_nome    UNIQUE (nome),
    CONSTRAINT uq_professores_cracha  UNIQUE (cracha_hash),
    CONSTRAINT uq_professores_digital UNIQUE (digital_hash)
);

-- -----------------------------------------------------------------------------
-- Salas (fonte única: o front-end lê tudo daqui)
-- -----------------------------------------------------------------------------
CREATE TABLE salas (
    id          INT AUTO_INCREMENT PRIMARY KEY,
    codigo      VARCHAR(10)  NOT NULL,
    nome        VARCHAR(80)  NOT NULL,
    andar       TINYINT      NOT NULL,
    solenoide   TINYINT      NULL,      -- solenoide (1 a 3) onde fica a chave; NULL = SOLENOIDE_PADRAO do .env
    created_at  TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_salas_codigo UNIQUE (codigo),
    CONSTRAINT ck_salas_andar CHECK (andar BETWEEN 0 AND 20)
);

-- -----------------------------------------------------------------------------
-- Turmas / cursos
-- -----------------------------------------------------------------------------
CREATE TABLE turmas (
    id     VARCHAR(10)  NOT NULL PRIMARY KEY,
    nome   VARCHAR(80)  NOT NULL,
    curso  VARCHAR(120) NOT NULL
);

-- -----------------------------------------------------------------------------
-- Grade horária semanal fixa
--   dia:   0 = segunda ... 4 = sexta
--   faixa: índice da faixa de horário (0 = 07:00–08:40 ... 7 = 20:40–22:00)
--   Um professor não pode ter duas aulas na mesma faixa, e uma sala não pode
--   ter duas aulas na mesma faixa (garantido pelas constraints UNIQUE).
-- -----------------------------------------------------------------------------
CREATE TABLE grade_semanal (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    professor_id  INT          NOT NULL,
    dia           TINYINT      NOT NULL,
    faixa         TINYINT      NOT NULL,
    sala_id       INT          NOT NULL,
    turma_id      VARCHAR(10)  NOT NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_grade_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE CASCADE,
    CONSTRAINT fk_grade_sala      FOREIGN KEY (sala_id)      REFERENCES salas(id)       ON DELETE CASCADE,
    CONSTRAINT fk_grade_turma     FOREIGN KEY (turma_id)     REFERENCES turmas(id),
    CONSTRAINT uq_grade_professor_horario UNIQUE (professor_id, dia, faixa),
    CONSTRAINT uq_grade_sala_horario      UNIQUE (sala_id, dia, faixa),
    CONSTRAINT ck_grade_dia   CHECK (dia BETWEEN 0 AND 4),
    CONSTRAINT ck_grade_faixa CHECK (faixa BETWEEN 0 AND 7)
);

-- -----------------------------------------------------------------------------
-- Reservas e eventos (uma linha por reserva; uma sala pode ter várias reservas
-- em datas/horários diferentes). A situação da sala no painel é CALCULADA a
-- partir desta tabela, de acordo com a data e a hora atuais.
--
--   tipo:   'reserva' (professor) ou 'evento' (criado pelo administrador)
--   status: agendada  → reservada, aguardando o professor ocupar
--           em_uso    → professor validou a identidade e pegou a chave
--           concluida → terminou (professor desocupou ou o horário acabou)
--           cancelada → removida pelo administrador antes de começar
--           expirada  → o horário passou e ninguém ocupou a sala
-- -----------------------------------------------------------------------------
CREATE TABLE reservas (
    id                  INT AUTO_INCREMENT PRIMARY KEY,
    sala_id             INT          NOT NULL,
    professor_id        INT          NULL,
    responsavel         VARCHAR(100) NOT NULL,
    tipo                ENUM('reserva', 'evento') NOT NULL DEFAULT 'reserva',
    descricao_evento    VARCHAR(120) NULL,
    data                DATE         NOT NULL,
    hora_inicio         TIME         NOT NULL,
    hora_fim            TIME         NOT NULL,
    status              ENUM('agendada', 'em_uso', 'concluida', 'cancelada', 'expirada') NOT NULL DEFAULT 'agendada',
    ocupacao_forcada    TINYINT(1)   NOT NULL DEFAULT 0,
    liberacao_forcada   TINYINT(1)   NOT NULL DEFAULT 0,
    metodo_autenticacao VARCHAR(20)  NULL,
    ocupada_em          DATETIME     NULL,
    finalizada_em       DATETIME     NULL,
    created_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at          TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_reservas_sala      FOREIGN KEY (sala_id)      REFERENCES salas(id)       ON DELETE CASCADE,
    CONSTRAINT fk_reservas_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE SET NULL,
    CONSTRAINT ck_reservas_horario CHECK (hora_fim > hora_inicio)
);

CREATE INDEX idx_reservas_sala_data ON reservas (sala_id, data);
CREATE INDEX idx_reservas_status    ON reservas (status);
CREATE INDEX idx_reservas_data      ON reservas (data);

-- -----------------------------------------------------------------------------
-- Log de acessos (auditoria: quem reservou, ocupou, desocupou, falhas, etc.)
-- -----------------------------------------------------------------------------
CREATE TABLE logs_acesso (
    id            INT AUTO_INCREMENT PRIMARY KEY,
    professor_id  INT          NULL,
    sala_id       INT          NULL,
    reserva_id    INT          NULL,
    acao          VARCHAR(40)  NOT NULL,
    origem        VARCHAR(20)  NOT NULL,
    sucesso       TINYINT(1)   NOT NULL DEFAULT 1,
    detalhe       VARCHAR(255) NULL,
    created_at    TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_logs_professor FOREIGN KEY (professor_id) REFERENCES professores(id) ON DELETE SET NULL,
    CONSTRAINT fk_logs_sala      FOREIGN KEY (sala_id)      REFERENCES salas(id)       ON DELETE SET NULL,
    CONSTRAINT fk_logs_reserva   FOREIGN KEY (reserva_id)   REFERENCES reservas(id)    ON DELETE SET NULL
);

CREATE INDEX idx_logs_data ON logs_acesso (created_at);

-- =============================================================================
--  DADOS INICIAIS
-- =============================================================================

-- Salas do SENAI ------------------------------------------------------------------
INSERT INTO salas (codigo, nome, andar) VALUES
('115', '115 BIBLIOTECA', 1),
('129', '129 INFORMÁTICA', 1),
('130', '130 SALA DE AULA', 1),
('131', '131 METROLOGIA I', 1),
('132', '132 METROLOGIA II', 1),
('133', '133 SALA DE AULA', 1),
('135', '135 SENAI LAB', 1),
('137', '137 CAD / CAM', 1),
('304', '304 SALA DE AULA', 1),
('305', '305 AUDITÓRIO', 1),
('306', '306 SALA DE AULA', 1),
('307', '307 PROJETOS', 1),
('310', '310 PREPARAÇÃO DOCENTE SUP.', 1),
('318', '318 SERVIDOR EDUCACIONAL', 1),
('323', '323 SALA DE AULA', 1),
('324', '324 INFORMÁTICA', 1),
('329', '329 ROBÓTICA', 1),
('332', '332 ELETRÔNICA GERAL', 1),
('333', '333 DEP. MECATRÔNICA', 1),
('215', '215 PREPARAÇÃO DOCENTE', 2),
('216', '216 ENSAIOS MECÂNICOS', 2),
('224', '224 SALA DE AULA', 2),
('228', '228 SALA DE AULA', 2),
('229', '229 ELETRÔNICA DIGITAL', 2),
('230', '230 COMANDOS ACIONAMENTOS', 2),
('232', '232 TEC. ELETRICIDADE', 2),
('308', '308 DESENHO', 2),
('315', '315 INFORMÁTICA', 2),
('319', '319 INFORMÁTICA', 2),
('320', '320 INFORMÁTICA', 2),
('321', '321 INFORMÁTICA', 2),
('322', '322 INFORMÁTICA', 2),
('327', '327 CLP', 2),
('328', '328 HIDRÁULICA', 2),
('330', '330 CLP 2', 2),
('331', '331 PNEUMÁTICA', 2),
('334', '334 COMANDOS ELÉTRICOS', 2),
('404', '404 SALA DE AULA - ÁREA 02', 2);

-- Chaves do 1º andar: cada fileira do painel em uma solenoide
-- (fileira de cima = solenoide 1, do meio = solenoide 2, de baixo = solenoide 3)
UPDATE salas SET solenoide = 1 WHERE codigo IN ('115', '129', '130', '131', '132', '133', '135');
UPDATE salas SET solenoide = 2 WHERE codigo IN ('137', '304', '305', '306', '307', '310', '318');
UPDATE salas SET solenoide = 3 WHERE codigo IN ('323', '324', '329', '332', '333');

-- Turmas ---------------------------------------------------------------------------
INSERT INTO turmas (id, nome, curso) VALUES
('T1', 'Mecatrônica I',    'Técnico em Mecatrônica'),
('T2', 'Mecatrônica II',   'Técnico em Mecatrônica'),
('T3', 'Eletrotécnica I',  'Técnico em Eletrotécnica'),
('T4', 'Eletrotécnica II', 'Técnico em Eletrotécnica'),
('T5', 'Informática I',    'Técnico em Informática'),
('T6', 'Informática II',   'Técnico em Informática'),
('T7', 'Automação I',      'Técnico em Automação Industrial'),
('T8', 'Automação II',     'Técnico em Automação Industrial'),
('T9', 'Eletricista',      'Qualificação em Eletricidade');

-- Professores (as credenciais são cadastradas no primeiro acesso ou pelo admin) ----
INSERT INTO professores (nome) VALUES
('Prof. Ana Souza'),
('Prof. Carlos Lima'),
('Prof. Beatriz Nunes'),
('Prof. Rafael Costa'),
('Prof. Juliana Ferreira'),
('Prof. Marcos Oliveira'),
('Prof. Sandra Rocha'),
('Prof. Diego Alves'),
('Prof. Patrícia Mendes'),
('Prof. Fernando Ramos'),
('Prof. Luciana Teixeira'),
('Prof. Roberto Campos');

-- Grade semanal -----------------------------------------------------------------------
INSERT INTO grade_semanal (professor_id, dia, faixa, sala_id, turma_id) VALUES
((SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        0, 0, (SELECT id FROM salas WHERE codigo = '133'), 'T1'),
((SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        0, 1, (SELECT id FROM salas WHERE codigo = '133'), 'T1'),
((SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        1, 3, (SELECT id FROM salas WHERE codigo = '132'), 'T3'),
((SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        2, 0, (SELECT id FROM salas WHERE codigo = '224'), 'T5'),
((SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        3, 1, (SELECT id FROM salas WHERE codigo = '229'), 'T5'),
((SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        4, 4, (SELECT id FROM salas WHERE codigo = '228'), 'T7'),
((SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      0, 2, (SELECT id FROM salas WHERE codigo = '137'), 'T2'),
((SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      1, 0, (SELECT id FROM salas WHERE codigo = '137'), 'T2'),
((SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      2, 3, (SELECT id FROM salas WHERE codigo = '230'), 'T4'),
((SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      3, 4, (SELECT id FROM salas WHERE codigo = '334'), 'T3'),
((SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      4, 1, (SELECT id FROM salas WHERE codigo = '306'), 'T8'),
((SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    0, 3, (SELECT id FROM salas WHERE codigo = '319'), 'T5'),
((SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    1, 3, (SELECT id FROM salas WHERE codigo = '320'), 'T6'),
((SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    2, 1, (SELECT id FROM salas WHERE codigo = '321'), 'T5'),
((SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    3, 0, (SELECT id FROM salas WHERE codigo = '324'), 'T6'),
((SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    4, 3, (SELECT id FROM salas WHERE codigo = '322'), 'T6'),
((SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     0, 4, (SELECT id FROM salas WHERE codigo = '329'), 'T7'),
((SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     1, 2, (SELECT id FROM salas WHERE codigo = '329'), 'T8'),
((SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     2, 4, (SELECT id FROM salas WHERE codigo = '310'), 'T7'),
((SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     3, 3, (SELECT id FROM salas WHERE codigo = '327'), 'T2'),
((SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     4, 0, (SELECT id FROM salas WHERE codigo = '331'), 'T1'),
((SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 0, 1, (SELECT id FROM salas WHERE codigo = '305'), 'T9'),
((SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 1, 4, (SELECT id FROM salas WHERE codigo = '305'), 'T9'),
((SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 2, 2, (SELECT id FROM salas WHERE codigo = '332'), 'T3'),
((SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 3, 2, (SELECT id FROM salas WHERE codigo = '308'), 'T4'),
((SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 4, 2, (SELECT id FROM salas WHERE codigo = '215'), 'T9'),
((SELECT id FROM professores WHERE nome = 'Prof. Marcos Oliveira'),  0, 0, (SELECT id FROM salas WHERE codigo = '216'), 'T2'),
((SELECT id FROM professores WHERE nome = 'Prof. Marcos Oliveira'),  1, 1, (SELECT id FROM salas WHERE codigo = '216'), 'T1'),
((SELECT id FROM professores WHERE nome = 'Prof. Marcos Oliveira'),  2, 5, (SELECT id FROM salas WHERE codigo = '131'), 'T2'),
((SELECT id FROM professores WHERE nome = 'Prof. Marcos Oliveira'),  3, 5, (SELECT id FROM salas WHERE codigo = '131'), 'T1'),
((SELECT id FROM professores WHERE nome = 'Prof. Marcos Oliveira'),  4, 5, (SELECT id FROM salas WHERE codigo = '232'), 'T3'),
((SELECT id FROM professores WHERE nome = 'Prof. Sandra Rocha'),     0, 6, (SELECT id FROM salas WHERE codigo = '404'), 'T9'),
((SELECT id FROM professores WHERE nome = 'Prof. Sandra Rocha'),     1, 6, (SELECT id FROM salas WHERE codigo = '333'), 'T8'),
((SELECT id FROM professores WHERE nome = 'Prof. Sandra Rocha'),     2, 6, (SELECT id FROM salas WHERE codigo = '334'), 'T8'),
((SELECT id FROM professores WHERE nome = 'Prof. Sandra Rocha'),     3, 6, (SELECT id FROM salas WHERE codigo = '304'), 'T7'),
((SELECT id FROM professores WHERE nome = 'Prof. Sandra Rocha'),     4, 6, (SELECT id FROM salas WHERE codigo = '304'), 'T9'),
((SELECT id FROM professores WHERE nome = 'Prof. Diego Alves'),      0, 5, (SELECT id FROM salas WHERE codigo = '135'), 'T7'),
((SELECT id FROM professores WHERE nome = 'Prof. Diego Alves'),      1, 5, (SELECT id FROM salas WHERE codigo = '135'), 'T8'),
((SELECT id FROM professores WHERE nome = 'Prof. Diego Alves'),      2, 3, (SELECT id FROM salas WHERE codigo = '307'), 'T2'),
((SELECT id FROM professores WHERE nome = 'Prof. Diego Alves'),      3, 0, (SELECT id FROM salas WHERE codigo = '307'), 'T1'),
((SELECT id FROM professores WHERE nome = 'Prof. Diego Alves'),      4, 7, (SELECT id FROM salas WHERE codigo = '328'), 'T7'),
((SELECT id FROM professores WHERE nome = 'Prof. Patrícia Mendes'),  0, 2, (SELECT id FROM salas WHERE codigo = '129'), 'T5'),
((SELECT id FROM professores WHERE nome = 'Prof. Patrícia Mendes'),  1, 2, (SELECT id FROM salas WHERE codigo = '129'), 'T6'),
((SELECT id FROM professores WHERE nome = 'Prof. Patrícia Mendes'),  2, 7, (SELECT id FROM salas WHERE codigo = '315'), 'T5'),
((SELECT id FROM professores WHERE nome = 'Prof. Patrícia Mendes'),  3, 7, (SELECT id FROM salas WHERE codigo = '318'), 'T6'),
((SELECT id FROM professores WHERE nome = 'Prof. Patrícia Mendes'),  4, 6, (SELECT id FROM salas WHERE codigo = '319'), 'T5');

-- Reservas e eventos de exemplo (datas relativas ao dia em que o script é executado)
INSERT INTO reservas (sala_id, professor_id, responsavel, tipo, descricao_evento, data, hora_inicio, hora_fim, status) VALUES
((SELECT id FROM salas WHERE codigo = '129'), (SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      'Prof. Carlos Lima',      'reserva', NULL,                  CURDATE(),                           '19:00:00', '20:40:00', 'agendada'),
((SELECT id FROM salas WHERE codigo = '137'), (SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    'Prof. Beatriz Nunes',    'reserva', NULL,                  CURDATE(),                           '20:40:00', '22:00:00', 'agendada'),
((SELECT id FROM salas WHERE codigo = '224'), (SELECT id FROM professores WHERE nome = 'Prof. Ana Souza'),        'Prof. Ana Souza',        'reserva', NULL,                  DATE_ADD(CURDATE(), INTERVAL 1 DAY), '10:30:00', '12:10:00', 'agendada'),
((SELECT id FROM salas WHERE codigo = '131'), (SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     'Prof. Rafael Costa',     'evento',  'Defesa de TCC',       DATE_ADD(CURDATE(), INTERVAL 1 DAY), '13:00:00', '14:40:00', 'agendada'),
((SELECT id FROM salas WHERE codigo = '216'), (SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 'Prof. Juliana Ferreira', 'evento',  'Semana Acadêmica',    DATE_ADD(CURDATE(), INTERVAL 3 DAY), '19:00:00', '20:40:00', 'agendada');

-- Histórico de exemplo (reservas que já aconteceram)
INSERT INTO reservas (sala_id, professor_id, responsavel, tipo, data, hora_inicio, hora_fim, status, ocupacao_forcada, liberacao_forcada, metodo_autenticacao) VALUES
((SELECT id FROM salas WHERE codigo = '306'), (SELECT id FROM professores WHERE nome = 'Prof. Beatriz Nunes'),    'Prof. Beatriz Nunes',    'reserva', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '08:40:00', '10:20:00', 'concluida', 0, 0, 'cracha'),
((SELECT id FROM salas WHERE codigo = '327'), (SELECT id FROM professores WHERE nome = 'Prof. Juliana Ferreira'), 'Prof. Juliana Ferreira', 'reserva', DATE_SUB(CURDATE(), INTERVAL 1 DAY), '16:30:00', '18:10:00', 'concluida', 1, 0, 'admin'),
((SELECT id FROM salas WHERE codigo = '307'), (SELECT id FROM professores WHERE nome = 'Prof. Rafael Costa'),     'Prof. Rafael Costa',     'reserva', DATE_SUB(CURDATE(), INTERVAL 2 DAY), '10:30:00', '12:10:00', 'concluida', 0, 1, 'digital'),
((SELECT id FROM salas WHERE codigo = '322'), (SELECT id FROM professores WHERE nome = 'Prof. Carlos Lima'),      'Prof. Carlos Lima',      'reserva', DATE_SUB(CURDATE(), INTERVAL 3 DAY), '10:30:00', '12:10:00', 'expirada',  0, 0, NULL),
((SELECT id FROM salas WHERE codigo = '133'), (SELECT id FROM professores WHERE nome = 'Prof. Diego Alves'),      'Prof. Diego Alves',      'reserva', DATE_SUB(CURDATE(), INTERVAL 4 DAY), '13:00:00', '14:40:00', 'cancelada', 0, 0, NULL);
