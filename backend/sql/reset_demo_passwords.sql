-- ------------------------------------------------
-- Reset de credenciales demo (solo desarrollo / QA local)
-- ------------------------------------------------
-- Password demo: NovaTech123!
-- Usuarios afectados:
--   - admin@novatech.com
--   - cliente@novatech.com
--
-- ADVERTENCIA:
-- No ejecutar este script en produccion.
-- Cambia la clave inmediatamente si lo usas fuera de local.

START TRANSACTION;

UPDATE usuarios
SET password = '$2b$10$YxAum5fsKzuXUPrDdcKic.fkNkVubqwbIAefM2bSPWMCkyeWNPMEC',
    actualizado_en = CURRENT_TIMESTAMP
WHERE email IN ('admin@novatech.com', 'cliente@novatech.com');

COMMIT;

SELECT id, nombre, email, rol, activo, CHAR_LENGTH(password) AS pass_len
FROM usuarios
WHERE email IN ('admin@novatech.com', 'cliente@novatech.com')
ORDER BY id;
