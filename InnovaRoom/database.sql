-- Banco de dados para o sistema InnovaRoom
-- Script de criação do schema e dados iniciais do MySQL.
-- Pode ser executado novamente sem quebrar a estrutura.

CREATE DATABASE IF NOT EXISTS innovaroom;
USE innovaroom;

-- Remove objetos antigos para permitir execução em lote limpa
DROP TABLE IF EXISTS access_logs;
DROP TABLE IF EXISTS reservations;
DROP TABLE IF EXISTS grade_weekly;
DROP TABLE IF EXISTS rooms;
DROP TABLE IF EXISTS users;
DROP TABLE IF EXISTS admins;

DROP FUNCTION IF EXISTS str_to_date_br;
DROP PROCEDURE IF EXISTS sp_reservar_sala;
DROP PROCEDURE IF EXISTS sp_adicionar_evento;
DROP PROCEDURE IF EXISTS sp_liberar_sala;

-- Tabela de administradores
CREATE TABLE admins (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(50) NOT NULL UNIQUE,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'admin',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- Tabela de usuários para crachá/digital
CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nome VARCHAR(100) NOT NULL,
    username VARCHAR(50) UNIQUE,
    card_code VARCHAR(100) UNIQUE,
    fingerprint_code VARCHAR(100) UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela de salas
CREATE TABLE rooms (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_code VARCHAR(10) NOT NULL UNIQUE,
    bloco CHAR(1) NOT NULL,
    andar INT NOT NULL,
    nome VARCHAR(50) NOT NULL,
    status ENUM('livre', 'reservada', 'ocupada', 'evento') NOT NULL DEFAULT 'livre',
    professor VARCHAR(100),
    reserva_id VARCHAR(30),
    data_reserva DATE,
    horario_inicio TIME,
    horario_fim TIME,
    evento VARCHAR(100),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Tabela de logs de autenticação e desbloqueio
CREATE TABLE access_logs (
    id INT AUTO_INCREMENT PRIMARY KEY,
    user_id INT,
    room_id INT,
    action ENUM('authenticate', 'unlock', 'release') NOT NULL,
    source VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE SET NULL
);

-- Tabela de reservas e eventos históricos
CREATE TABLE reservations (
    id INT AUTO_INCREMENT PRIMARY KEY,
    room_id INT NOT NULL,
    professor VARCHAR(100) NOT NULL,
    reserva_id VARCHAR(30) NOT NULL UNIQUE,
    tipo ENUM('reservada', 'ocupada', 'evento') NOT NULL,
    status ENUM('pending', 'completed', 'cancelled') NOT NULL DEFAULT 'pending',
    evento VARCHAR(100),
    data_reserva DATE NOT NULL,
    horario_inicio TIME NOT NULL,
    horario_fim TIME NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (room_id) REFERENCES rooms(id) ON DELETE CASCADE
);

-- Tabela para armazenar grade semanal persistente
CREATE TABLE grade_weekly (
    id INT AUTO_INCREMENT PRIMARY KEY,
    professor VARCHAR(100) NOT NULL,
    dia TINYINT NOT NULL,
    faixa TINYINT NOT NULL,
    sala_code VARCHAR(10) NOT NULL,
    turma_id VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- Função auxiliar para converter data formatada em DATE
DELIMITER //
CREATE FUNCTION str_to_date_br(valor VARCHAR(10)) RETURNS DATE DETERMINISTIC
BEGIN
    RETURN STR_TO_DATE(valor, '%d/%m/%Y');
END//
DELIMITER ;

-- Stored procedure para reservar sala
DELIMITER //
CREATE PROCEDURE sp_reservar_sala(
    IN p_room_code VARCHAR(10),
    IN p_professor VARCHAR(100),
    IN p_data VARCHAR(10),
    IN p_horario_inicio TIME,
    IN p_horario_fim TIME,
    IN p_reserva_id VARCHAR(30)
)
BEGIN
    DECLARE v_room_id INT;

    SELECT id INTO v_room_id
    FROM rooms
    WHERE room_code = p_room_code
    LIMIT 1;

    IF v_room_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sala não encontrada';
    END IF;

    UPDATE rooms
    SET status = 'reservada',
        professor = p_professor,
        reserva_id = p_reserva_id,
        data_reserva = str_to_date_br(p_data),
        horario_inicio = p_horario_inicio,
        horario_fim = p_horario_fim,
        evento = NULL
    WHERE id = v_room_id;

    INSERT INTO reservations (room_id, professor, reserva_id, tipo, data_reserva, horario_inicio, horario_fim)
    VALUES (v_room_id, p_professor, p_reserva_id, 'reservada', str_to_date_br(p_data), p_horario_inicio, p_horario_fim);
END//
DELIMITER ;

-- Stored procedure para marcar evento em sala
DELIMITER //
CREATE PROCEDURE sp_adicionar_evento(
    IN p_room_code VARCHAR(10),
    IN p_evento VARCHAR(100),
    IN p_professor VARCHAR(100),
    IN p_data VARCHAR(10),
    IN p_horario_inicio TIME,
    IN p_horario_fim TIME,
    IN p_reserva_id VARCHAR(30)
)
BEGIN
    DECLARE v_room_id INT;

    SELECT id INTO v_room_id
    FROM rooms
    WHERE room_code = p_room_code
    LIMIT 1;

    IF v_room_id IS NULL THEN
        SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Sala não encontrada';
    END IF;

    UPDATE rooms
    SET status = 'evento',
        professor = p_professor,
        reserva_id = p_reserva_id,
        data_reserva = str_to_date_br(p_data),
        horario_inicio = p_horario_inicio,
        horario_fim = p_horario_fim,
        evento = p_evento
    WHERE id = v_room_id;

    INSERT INTO reservations (room_id, professor, reserva_id, tipo, evento, data_reserva, horario_inicio, horario_fim)
    VALUES (v_room_id, p_professor, p_reserva_id, 'evento', p_evento, str_to_date_br(p_data), p_horario_inicio, p_horario_fim);
END//
DELIMITER ;

-- Stored procedure para liberar sala
DELIMITER //
CREATE PROCEDURE sp_liberar_sala(
    IN p_room_code VARCHAR(10)
)
BEGIN
    UPDATE rooms
    SET status = 'livre',
        professor = NULL,
        reserva_id = NULL,
        data_reserva = NULL,
        horario_inicio = NULL,
        horario_fim = NULL,
        evento = NULL
    WHERE room_code = p_room_code;
END//
DELIMITER ;

-- Dados iniciais de salas do SENAI
INSERT INTO rooms (room_code, bloco, andar, nome, status, professor, reserva_id, data_reserva, horario_inicio, horario_fim, evento)
VALUES
('S115', 'T', 1, 'S115 BIBLIOTECA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S129', 'T', 1, 'S129 INFORMÁTICA', 'reservada', 'Prof. Carlos Lima', 'PROF1002', STR_TO_DATE('29/04/2026', '%d/%m/%Y'), '08:40:00', '10:20:00', NULL),
('S130', 'T', 1, 'S130 SALA DE AULA', 'ocupada', 'Prof. Beatriz Nunes', 'PROF1003', STR_TO_DATE('30/04/2026', '%d/%m/%Y'), '10:30:00', '12:10:00', NULL),
('L131', 'T', 1, 'L131 METROLOGIA I', 'evento', 'Prof. Rafael Costa', 'PROF1004', STR_TO_DATE('01/05/2026', '%d/%m/%Y'), '13:00:00', '14:40:00', 'Defesa de TCC'),
('L132', 'T', 1, 'L132 METROLOGIA II', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S133', 'T', 1, 'S133 SALA DE AULA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L135', 'T', 1, 'L135 SENAI LAB', 'reservada', 'Prof. Carlos Lima', 'PROF1007', STR_TO_DATE('28/04/2026', '%d/%m/%Y'), '19:00:00', '20:40:00', NULL),
('L137', 'T', 1, 'L137 CAD / CAM', 'ocupada', 'Prof. Beatriz Nunes', 'PROF1008', STR_TO_DATE('29/04/2026', '%d/%m/%Y'), '20:40:00', '22:00:00', NULL),
('S215', '2', 2, 'S215 PREPARAÇÃO DOCENTE', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L216', '2', 2, 'L216 ENSAIOS MECÂNICOS', 'evento', 'Prof. Juliana Ferreira', 'PROF1010', STR_TO_DATE('01/05/2026', '%d/%m/%Y'), '08:40:00', '10:20:00', 'Defesa de TCC'),
('S224', '2', 2, 'S224 SALA DE AULA', 'reservada', 'Prof. Ana Souza', 'PROF1011', STR_TO_DATE('02/05/2026', '%d/%m/%Y'), '10:30:00', '12:10:00', NULL),
('S228', '2', 2, 'S228 SALA DE AULA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L229', '2', 2, 'L229 ELETRÔNICA DIGITAL', 'ocupada', 'Prof. Beatriz Nunes', 'PROF1013', STR_TO_DATE('28/04/2026', '%d/%m/%Y'), '14:40:00', '16:20:00', NULL),
('L230', '2', 2, 'L230 COMANDOS ACIONAMENTOS', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S232', '2', 2, 'S232 TEC. ELETRICIDADE', 'reservada', 'Prof. Juliana Ferreira', 'PROF1015', STR_TO_DATE('30/04/2026', '%d/%m/%Y'), '19:00:00', '20:40:00', NULL),
('S304', '3', 3, 'S304 SALA DE AULA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S305', '3', 3, 'S305 AUDITÓRIO', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S306', '3', 3, 'S306 SALA DE AULA', 'reservada', 'Prof. Beatriz Nunes', 'PROF1018', STR_TO_DATE('05/05/2026', '%d/%m/%Y'), '08:40:00', '10:20:00', NULL),
('L307', '3', 3, 'L307 PROJETOS', 'ocupada', 'Prof. Rafael Costa', 'PROF1019', STR_TO_DATE('28/04/2026', '%d/%m/%Y'), '10:30:00', '12:10:00', NULL),
('S308', '3', 3, 'S308 DESENHO', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L310', '3', 3, 'L310 PREPARAÇÃO DOCENTE SUP.', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L315', '3', 3, 'L315 INFORMÁTICA', 'evento', 'Prof. Carlos Lima', 'PROF1022', STR_TO_DATE('01/05/2026', '%d/%m/%Y'), '16:30:00', '18:10:00', 'Defesa de TCC'),
('L318', '3', 3, 'L318 SERVIDOR EDUCACIONAL', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S319', '3', 3, 'S319 INFORMÁTICA', 'reservada', 'Prof. Rafael Costa', 'PROF1024', STR_TO_DATE('05/05/2026', '%d/%m/%Y'), '20:40:00', '22:00:00', NULL),
('S320', '3', 3, 'S320 INFORMÁTICA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S321', '3', 3, 'S321 INFORMÁTICA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S322', '3', 3, 'S322 INFORMÁTICA', 'reservada', 'Prof. Carlos Lima', 'PROF1027', STR_TO_DATE('30/04/2026', '%d/%m/%Y'), '10:30:00', '12:10:00', NULL),
('S323', '3', 3, 'S323 SALA DE AULA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S324', '3', 3, 'S324 INFORMÁTICA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L327', '3', 3, 'L327 CLP', 'ocupada', 'Prof. Juliana Ferreira', 'PROF1030', STR_TO_DATE('05/05/2026', '%d/%m/%Y'), '16:30:00', '18:10:00', NULL),
('L328', '3', 3, 'L328 HIDRÁULICA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L329', '3', 3, 'L329 ROBÓTICA', 'reservada', 'Prof. Carlos Lima', 'PROF1032', STR_TO_DATE('29/04/2026', '%d/%m/%Y'), '20:40:00', '22:00:00', NULL),
('L331', '3', 3, 'L331 PNEUMÁTICA', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L332', '3', 3, 'L332 ELETRÔNICA GERAL', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('L334', '3', 3, 'L334 COMANDOS ELÉTRICOS', 'livre', NULL, NULL, NULL, NULL, NULL, NULL),
('S333', '3', 3, 'S333 DEP. MECATRÔNICA', 'ocupada', 'Prof. Juliana Ferreira', 'PROF1036', STR_TO_DATE('02/05/2026', '%d/%m/%Y'), '10:30:00', '12:10:00', NULL),
('S404', '4', 4, 'S404 SALA DE AULA - ÁREA 02', 'livre', NULL, NULL, NULL, NULL, NULL, NULL);

-- Administrador inicial
INSERT INTO admins (username, password_hash, role)
VALUES ('admin', 'admin123', 'admin')
ON DUPLICATE KEY UPDATE
    password_hash = VALUES(password_hash),
    role = VALUES(role);

-- Reservas e eventos iniciais
INSERT INTO reservations (room_id, professor, reserva_id, tipo, evento, data_reserva, horario_inicio, horario_fim)
VALUES
((SELECT id FROM rooms WHERE room_code = 'S129' LIMIT 1), 'Prof. Carlos Lima', 'PROF1002', 'reservada', NULL, STR_TO_DATE('29/04/2026', '%d/%m/%Y'), '08:40:00', '10:20:00'),
((SELECT id FROM rooms WHERE room_code = 'S130' LIMIT 1), 'Prof. Beatriz Nunes', 'PROF1003', 'ocupada', NULL, STR_TO_DATE('30/04/2026', '%d/%m/%Y'), '10:30:00', '12:10:00'),
((SELECT id FROM rooms WHERE room_code = 'L131' LIMIT 1), 'Prof. Rafael Costa', 'PROF1004', 'evento', 'Defesa de TCC', STR_TO_DATE('01/05/2026', '%d/%m/%Y'), '13:00:00', '14:40:00'),
((SELECT id FROM rooms WHERE room_code = 'L135' LIMIT 1), 'Prof. Carlos Lima', 'PROF1007', 'reservada', NULL, STR_TO_DATE('28/04/2026', '%d/%m/%Y'), '19:00:00', '20:40:00'),
((SELECT id FROM rooms WHERE room_code = 'L137' LIMIT 1), 'Prof. Beatriz Nunes', 'PROF1008', 'ocupada', NULL, STR_TO_DATE('29/04/2026', '%d/%m/%Y'), '20:40:00', '22:00:00'),
((SELECT id FROM rooms WHERE room_code = 'L216' LIMIT 1), 'Prof. Juliana Ferreira', 'PROF1010', 'evento', 'Defesa de TCC', STR_TO_DATE('01/05/2026', '%d/%m/%Y'), '08:40:00', '10:20:00'),
((SELECT id FROM rooms WHERE room_code = 'S224' LIMIT 1), 'Prof. Ana Souza', 'PROF1011', 'reservada', NULL, STR_TO_DATE('02/05/2026', '%d/%m/%Y'), '10:30:00', '12:10:00'),
((SELECT id FROM rooms WHERE room_code = 'L229' LIMIT 1), 'Prof. Beatriz Nunes', 'PROF1013', 'ocupada', NULL, STR_TO_DATE('28/04/2026', '%d/%m/%Y'), '14:40:00', '16:20:00'),
((SELECT id FROM rooms WHERE room_code = 'S232' LIMIT 1), 'Prof. Juliana Ferreira', 'PROF1015', 'reservada', NULL, STR_TO_DATE('30/04/2026', '%d/%m/%Y'), '19:00:00', '20:40:00'),
((SELECT id FROM rooms WHERE room_code = 'S306' LIMIT 1), 'Prof. Beatriz Nunes', 'PROF1018', 'reservada', NULL, STR_TO_DATE('05/05/2026', '%d/%m/%Y'), '08:40:00', '10:20:00'),
((SELECT id FROM rooms WHERE room_code = 'L307' LIMIT 1), 'Prof. Rafael Costa', 'PROF1019', 'ocupada', NULL, STR_TO_DATE('28/04/2026', '%d/%m/%Y'), '10:30:00', '12:10:00'),
((SELECT id FROM rooms WHERE room_code = 'L315' LIMIT 1), 'Prof. Carlos Lima', 'PROF1022', 'evento', 'Defesa de TCC', STR_TO_DATE('01/05/2026', '%d/%m/%Y'), '16:30:00', '18:10:00'),
((SELECT id FROM rooms WHERE room_code = 'L319' LIMIT 1), 'Prof. Rafael Costa', 'PROF1024', 'reservada', NULL, STR_TO_DATE('05/05/2026', '%d/%m/%Y'), '20:40:00', '22:00:00'),
((SELECT id FROM rooms WHERE room_code = 'S322' LIMIT 1), 'Prof. Carlos Lima', 'PROF1027', 'reservada', NULL, STR_TO_DATE('30/04/2026', '%d/%m/%Y'), '10:30:00', '12:10:00'),
((SELECT id FROM rooms WHERE room_code = 'L327' LIMIT 1), 'Prof. Juliana Ferreira', 'PROF1030', 'ocupada', NULL, STR_TO_DATE('05/05/2026', '%d/%m/%Y'), '16:30:00', '18:10:00'),
((SELECT id FROM rooms WHERE room_code = 'L329' LIMIT 1), 'Prof. Carlos Lima', 'PROF1032', 'reservada', NULL, STR_TO_DATE('29/04/2026', '%d/%m/%Y'), '20:40:00', '22:00:00'),
((SELECT id FROM rooms WHERE room_code = 'S333' LIMIT 1), 'Prof. Juliana Ferreira', 'PROF1036', 'ocupada', NULL, STR_TO_DATE('02/05/2026', '%d/%m/%Y'), '10:30:00', '12:10:00')
ON DUPLICATE KEY UPDATE
    professor = VALUES(professor),
    tipo = VALUES(tipo),
    evento = VALUES(evento),
    data_reserva = VALUES(data_reserva),
    horario_inicio = VALUES(horario_inicio),
    horario_fim = VALUES(horario_fim);

-- Dados iniciais da grade semanal
INSERT INTO grade_weekly (professor, dia, faixa, sala_code, turma_id)
VALUES
('Prof. Ana Souza', 0, 0, 'S133', 'T1'),
('Prof. Carlos Lima', 0, 2, 'L137', 'T2')
ON DUPLICATE KEY UPDATE
    sala_code = VALUES(sala_code),
    turma_id = VALUES(turma_id);

