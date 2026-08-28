-- ================================================================
-- NOVATECH ECOMMERCE - BASE INSTALL SCRIPT (MySQL 8.0+)
-- ================================================================
-- Objetivo:
-- 1) Mantener compatibilidad con el e-commerce actual.
-- 2) Adoptar arquitectura limpia inspirada en SISTEMA-DE-VENTAS.V2.
-- 3) Dejar base lista para escalamiento (roles/permisos, catalogo, carrito, checkout).
--
-- Nota de seguridad:
-- Este script deja passwords con hash BCrypt.
-- Si existen usuarios legacy en texto plano, el backend los migra a hash al iniciar sesion.
-- ================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

CREATE DATABASE IF NOT EXISTS novatech_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE novatech_db;

-- ------------------------------------------------
-- 0) RESET CONTROLLED
-- ------------------------------------------------
SET FOREIGN_KEY_CHECKS = 0;

DROP VIEW IF EXISTS vw_productos_catalogo;

DROP PROCEDURE IF EXISTS sp_actualizar_estado_venta;
DROP PROCEDURE IF EXISTS sp_checkout_desde_carrito;
DROP PROCEDURE IF EXISTS sp_registrar_venta;

DROP TRIGGER IF EXISTS trg_productos_bi_sync_names;
DROP TRIGGER IF EXISTS trg_productos_bu_sync_names;

DROP TABLE IF EXISTS auditoria;
DROP TABLE IF EXISTS notificaciones;
DROP TABLE IF EXISTS inventario_movimientos;
DROP TABLE IF EXISTS ventas_pagos;
DROP TABLE IF EXISTS detalle_ventas;
DROP TABLE IF EXISTS ventas;
DROP TABLE IF EXISTS carrito_items;
DROP TABLE IF EXISTS carritos;
DROP TABLE IF EXISTS preferencias_usuario;
DROP TABLE IF EXISTS productos;
DROP TABLE IF EXISTS subcategorias;
DROP TABLE IF EXISTS marcas;
DROP TABLE IF EXISTS categorias;
DROP TABLE IF EXISTS direcciones_usuario;
DROP TABLE IF EXISTS metodos_pago;
DROP TABLE IF EXISTS usuarios;
DROP TABLE IF EXISTS roles_permisos;
DROP TABLE IF EXISTS permisos;
DROP TABLE IF EXISTS roles;

SET FOREIGN_KEY_CHECKS = 1;

-- ------------------------------------------------
-- 1) SEGURIDAD (RBAC)
-- ------------------------------------------------
CREATE TABLE roles (
  role_codigo VARCHAR(30) PRIMARY KEY,
  role_nombre VARCHAR(80) NOT NULL,
  role_descripcion VARCHAR(200) NULL,
  role_activo TINYINT(1) NOT NULL DEFAULT 1,
  role_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  role_updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE TABLE permisos (
  perm_codigo VARCHAR(80) PRIMARY KEY,
  perm_descripcion VARCHAR(140) NOT NULL,
  perm_modulo VARCHAR(50) NOT NULL,
  perm_activo TINYINT(1) NOT NULL DEFAULT 1,
  perm_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

CREATE INDEX idx_permisos_modulo ON permisos (perm_modulo);

CREATE TABLE roles_permisos (
  rper_role_codigo VARCHAR(30) NOT NULL,
  rper_perm_codigo VARCHAR(80) NOT NULL,
  rper_created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (rper_role_codigo, rper_perm_codigo),
  CONSTRAINT fk_rper_role
    FOREIGN KEY (rper_role_codigo) REFERENCES roles (role_codigo)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_rper_perm
    FOREIGN KEY (rper_perm_codigo) REFERENCES permisos (perm_codigo)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE TABLE usuarios (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(120) NOT NULL,
  email VARCHAR(140) NOT NULL,
  password VARCHAR(255) NOT NULL COMMENT 'Se almacena con hash BCrypt.',
  rol VARCHAR(30) NOT NULL DEFAULT 'cliente',
  tipo_documento VARCHAR(20) NOT NULL DEFAULT 'DNI',
  numero_documento VARCHAR(20) NOT NULL DEFAULT '00000000',
  telefono VARCHAR(20) NULL,
  avatar_url VARCHAR(500) NULL,
  reset_token VARCHAR(255) NULL,
  reset_token_expires DATETIME NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  ultimo_acceso DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_usuarios_email UNIQUE (email),
  CONSTRAINT fk_usuarios_rol
    FOREIGN KEY (rol) REFERENCES roles (role_codigo)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT chk_usuarios_nombre_len CHECK (CHAR_LENGTH(nombre) BETWEEN 1 AND 120),
  CONSTRAINT chk_usuarios_email_len CHECK (CHAR_LENGTH(email) BETWEEN 5 AND 140)
) ENGINE=InnoDB;

CREATE INDEX idx_usuarios_rol_activo ON usuarios (rol, activo);

CREATE TABLE preferencias_usuario (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  favoritos_json JSON NOT NULL,
  comparador_json JSON NOT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_preferencias_usuario UNIQUE (usuario_id),
  CONSTRAINT fk_preferencias_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

-- ------------------------------------------------
-- 2) MAESTROS E-COMMERCE
-- ------------------------------------------------
CREATE TABLE metodos_pago (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NOT NULL,
  nombre VARCHAR(60) NOT NULL,
  requiere_referencia TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT uq_metodos_pago_codigo UNIQUE (codigo),
  CONSTRAINT uq_metodos_pago_nombre UNIQUE (nombre)
) ENGINE=InnoDB;

CREATE TABLE direcciones_usuario (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  alias VARCHAR(80) NULL,
  destinatario VARCHAR(120) NOT NULL,
  telefono_contacto VARCHAR(20) NULL,
  direccion_linea1 VARCHAR(220) NOT NULL,
  direccion_linea2 VARCHAR(220) NULL,
  distrito VARCHAR(80) NULL,
  provincia VARCHAR(80) NULL,
  departamento VARCHAR(80) NULL,
  pais VARCHAR(60) NOT NULL DEFAULT 'PE',
  codigo_postal VARCHAR(20) NULL,
  referencia VARCHAR(220) NULL,
  predeterminada TINYINT(1) NOT NULL DEFAULT 0,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_direcciones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_direcciones_usuario_pred ON direcciones_usuario (usuario_id, predeterminada);

CREATE TABLE categorias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  categoria_padre_id INT UNSIGNED NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT UNSIGNED NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_categorias_nombre UNIQUE (nombre),
  CONSTRAINT uq_categorias_slug UNIQUE (slug),
  CONSTRAINT fk_categorias_padre
    FOREIGN KEY (categoria_padre_id) REFERENCES categorias (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE TABLE subcategorias (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  categoria_id INT UNSIGNED NOT NULL,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  descripcion TEXT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  orden INT UNSIGNED NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_subcategorias_categoria_nombre UNIQUE (categoria_id, nombre),
  CONSTRAINT uq_subcategorias_slug UNIQUE (slug),
  CONSTRAINT fk_subcategorias_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_subcategorias_categoria ON subcategorias (categoria_id, activo, orden);

CREATE TABLE marcas (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  nombre VARCHAR(100) NOT NULL,
  slug VARCHAR(120) NOT NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_marcas_nombre UNIQUE (nombre),
  CONSTRAINT uq_marcas_slug UNIQUE (slug)
) ENGINE=InnoDB;

CREATE TABLE productos (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  sku VARCHAR(50) NULL,
  nombre VARCHAR(180) NOT NULL,
  slug VARCHAR(220) NULL,
  descripcion TEXT NULL,
  categoria_id INT UNSIGNED NULL,
  subcategoria_id INT UNSIGNED NULL,
  marca_id INT UNSIGNED NULL,
  categoria VARCHAR(100) NULL COMMENT 'Compatibilidad con frontend legado',
  marca VARCHAR(100) NULL COMMENT 'Compatibilidad con frontend legado',
  precio DECIMAL(12,2) NOT NULL DEFAULT 0,
  precio_compra DECIMAL(12,2) NULL,
  precio_oferta DECIMAL(12,2) NULL,
  stock INT UNSIGNED NOT NULL DEFAULT 0,
  stock_minimo INT UNSIGNED NOT NULL DEFAULT 0,
  imagen VARCHAR(500) NULL,
  galeria_json JSON NULL,
  activo TINYINT(1) NOT NULL DEFAULT 1,
  destacado TINYINT(1) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_productos_sku UNIQUE (sku),
  CONSTRAINT uq_productos_slug UNIQUE (slug),
  CONSTRAINT fk_productos_categoria
    FOREIGN KEY (categoria_id) REFERENCES categorias (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_productos_subcategoria
    FOREIGN KEY (subcategoria_id) REFERENCES subcategorias (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_productos_marca
    FOREIGN KEY (marca_id) REFERENCES marcas (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_productos_precio CHECK (precio >= 0),
  CONSTRAINT chk_productos_precio_oferta CHECK (precio_oferta IS NULL OR precio_oferta >= 0),
  CONSTRAINT chk_productos_stock CHECK (stock >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_productos_nombre ON productos (nombre);
CREATE INDEX idx_productos_categoria_id ON productos (categoria_id);
CREATE INDEX idx_productos_subcategoria_id ON productos (subcategoria_id);
CREATE INDEX idx_productos_marca_id ON productos (marca_id);
CREATE INDEX idx_productos_activo ON productos (activo);
CREATE INDEX idx_productos_destacado ON productos (destacado);

-- ------------------------------------------------
-- 3) CARRITO Y CHECKOUT
-- ------------------------------------------------
CREATE TABLE carritos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NOT NULL,
  estado ENUM('activo', 'convertido', 'abandonado') NOT NULL DEFAULT 'activo',
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_carritos_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE
) ENGINE=InnoDB;

CREATE INDEX idx_carritos_usuario_estado ON carritos (usuario_id, estado);

CREATE TABLE carrito_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  carrito_id BIGINT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  subtotal DECIMAL(12,2) AS (ROUND(cantidad * precio_unitario, 2)) STORED,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_carrito_items_carrito
    FOREIGN KEY (carrito_id) REFERENCES carritos (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_carrito_items_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT uq_carrito_items_producto UNIQUE (carrito_id, producto_id),
  CONSTRAINT chk_carrito_items_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_carrito_items_precio CHECK (precio_unitario >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_carrito_items_producto ON carrito_items (producto_id);

CREATE TABLE ventas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  codigo VARCHAR(30) NULL,
  carrito_id BIGINT UNSIGNED NULL,
  id_usuario INT UNSIGNED NOT NULL,
  nombre_usuario VARCHAR(120) NULL,
  fecha DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  subtotal DECIMAL(12,2) NOT NULL DEFAULT 0,
  impuesto DECIMAL(12,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(12,2) NOT NULL DEFAULT 0,
  costo_envio DECIMAL(12,2) NOT NULL DEFAULT 0,
  total DECIMAL(12,2) NOT NULL DEFAULT 0,
  detalle TEXT NULL COMMENT 'JSON textual para compatibilidad con frontend actual',
  estado ENUM('pendiente', 'pagado', 'preparando', 'en camino', 'entregado', 'cancelado', 'reembolsado') NOT NULL DEFAULT 'pendiente',
  canal_venta ENUM('WEB', 'POS') NOT NULL DEFAULT 'WEB',
  metodo_pago_id INT UNSIGNED NULL,
  referencia_pago VARCHAR(120) NULL,
  direccion_envio_id INT UNSIGNED NULL,
  tipo_comprobante ENUM('boleta', 'factura') NOT NULL DEFAULT 'boleta',
  documento_fiscal VARCHAR(20) NULL,
  razon_social VARCHAR(150) NULL,
  observaciones TEXT NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  actualizado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT uq_ventas_codigo UNIQUE (codigo),
  CONSTRAINT fk_ventas_usuario
    FOREIGN KEY (id_usuario) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_ventas_carrito
    FOREIGN KEY (carrito_id) REFERENCES carritos (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_ventas_metodo_pago
    FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT fk_ventas_direccion
    FOREIGN KEY (direccion_envio_id) REFERENCES direcciones_usuario (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_ventas_subtotal CHECK (subtotal >= 0),
  CONSTRAINT chk_ventas_impuesto CHECK (impuesto >= 0),
  CONSTRAINT chk_ventas_descuento CHECK (descuento >= 0),
  CONSTRAINT chk_ventas_costo_envio CHECK (costo_envio >= 0),
  CONSTRAINT chk_ventas_total CHECK (total >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_ventas_usuario_fecha ON ventas (id_usuario, fecha DESC);
CREATE INDEX idx_ventas_carrito ON ventas (carrito_id);
CREATE INDEX idx_ventas_estado_fecha ON ventas (estado, fecha DESC);
CREATE INDEX idx_ventas_canal ON ventas (canal_venta);

CREATE TABLE detalle_ventas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT UNSIGNED NOT NULL,
  producto_id INT UNSIGNED NULL,
  sku_producto VARCHAR(50) NULL,
  nombre_producto VARCHAR(180) NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  precio_unitario DECIMAL(12,2) NOT NULL,
  descuento DECIMAL(12,2) NOT NULL DEFAULT 0,
  impuesto DECIMAL(12,2) NOT NULL DEFAULT 0,
  subtotal DECIMAL(12,2) NOT NULL,
  CONSTRAINT fk_detalle_ventas_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_detalle_ventas_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_detalle_ventas_cantidad CHECK (cantidad > 0),
  CONSTRAINT chk_detalle_ventas_precio CHECK (precio_unitario >= 0),
  CONSTRAINT chk_detalle_ventas_subtotal CHECK (subtotal >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_detalle_ventas_venta ON detalle_ventas (venta_id);
CREATE INDEX idx_detalle_ventas_producto ON detalle_ventas (producto_id);

CREATE TABLE ventas_pagos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  venta_id BIGINT UNSIGNED NOT NULL,
  metodo_pago_id INT UNSIGNED NULL,
  monto DECIMAL(12,2) NOT NULL,
  moneda VARCHAR(3) NOT NULL DEFAULT 'PEN',
  referencia VARCHAR(120) NULL,
  estado ENUM('pendiente', 'confirmado', 'rechazado') NOT NULL DEFAULT 'pendiente',
  pagado_en DATETIME NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_ventas_pagos_venta
    FOREIGN KEY (venta_id) REFERENCES ventas (id)
    ON UPDATE CASCADE
    ON DELETE CASCADE,
  CONSTRAINT fk_ventas_pagos_metodo
    FOREIGN KEY (metodo_pago_id) REFERENCES metodos_pago (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_ventas_pagos_monto CHECK (monto >= 0)
) ENGINE=InnoDB;

CREATE INDEX idx_ventas_pagos_venta_estado ON ventas_pagos (venta_id, estado);

-- ------------------------------------------------
-- 4) INVENTARIO, ALERTAS, AUDITORIA
-- ------------------------------------------------
CREATE TABLE inventario_movimientos (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  producto_id INT UNSIGNED NOT NULL,
  tipo ENUM('ENTRADA', 'SALIDA', 'VENTA', 'AJUSTE', 'DEVOLUCION') NOT NULL,
  cantidad INT UNSIGNED NOT NULL,
  stock_anterior INT UNSIGNED NOT NULL,
  stock_nuevo INT UNSIGNED NOT NULL,
  motivo VARCHAR(255) NULL,
  referencia_tabla VARCHAR(50) NULL,
  referencia_id BIGINT UNSIGNED NULL,
  usuario_id INT UNSIGNED NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_inventario_mov_producto
    FOREIGN KEY (producto_id) REFERENCES productos (id)
    ON UPDATE CASCADE
    ON DELETE RESTRICT,
  CONSTRAINT fk_inventario_mov_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL,
  CONSTRAINT chk_inventario_mov_cantidad CHECK (cantidad > 0)
) ENGINE=InnoDB;

CREATE INDEX idx_inventario_mov_producto_fecha ON inventario_movimientos (producto_id, creado_en DESC);

CREATE TABLE notificaciones (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NULL,
  tipo ENUM('ventas', 'stock', 'sistema') NOT NULL DEFAULT 'sistema',
  titulo VARCHAR(120) NOT NULL,
  descripcion VARCHAR(300) NOT NULL,
  metadata_json JSON NULL,
  leido TINYINT(1) NOT NULL DEFAULT 0,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_notificaciones_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_notificaciones_usuario_leido ON notificaciones (usuario_id, leido);
CREATE INDEX idx_notificaciones_tipo_fecha ON notificaciones (tipo, creado_en DESC);

CREATE TABLE auditoria (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  usuario_id INT UNSIGNED NULL,
  accion VARCHAR(50) NOT NULL,
  tabla VARCHAR(50) NOT NULL,
  registro_id VARCHAR(60) NOT NULL,
  valores_anteriores JSON NULL,
  valores_nuevos JSON NULL,
  ip_origen VARCHAR(45) NULL,
  user_agent VARCHAR(255) NULL,
  creado_en DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_auditoria_usuario
    FOREIGN KEY (usuario_id) REFERENCES usuarios (id)
    ON UPDATE CASCADE
    ON DELETE SET NULL
) ENGINE=InnoDB;

CREATE INDEX idx_auditoria_fecha ON auditoria (creado_en DESC);

-- ------------------------------------------------
-- 5) VISTA DE CATALOGO (READY FOR API)
-- ------------------------------------------------
CREATE VIEW vw_productos_catalogo AS
SELECT
  p.id,
  p.sku,
  p.nombre,
  p.descripcion,
  p.precio,
  p.precio_compra,
  p.precio_oferta,
  p.stock,
  COALESCE(c.nombre, p.categoria) AS categoria,
  sc.nombre AS subcategoria,
  COALESCE(m.nombre, p.marca) AS marca,
  p.imagen,
  p.activo,
  p.destacado,
  p.creado_en,
  p.actualizado_en
FROM productos p
LEFT JOIN categorias c ON c.id = p.categoria_id
LEFT JOIN subcategorias sc ON sc.id = p.subcategoria_id
LEFT JOIN marcas m ON m.id = p.marca_id;

-- ------------------------------------------------
-- 6) TRIGGERS DE SINCRONIZACION DE NOMBRES
-- ------------------------------------------------
DELIMITER $$

CREATE TRIGGER trg_productos_bi_sync_names
BEFORE INSERT ON productos
FOR EACH ROW
BEGIN
  IF NEW.subcategoria_id IS NOT NULL THEN
    IF NEW.categoria_id IS NULL THEN
      SET NEW.categoria_id = (
        SELECT sc.categoria_id
        FROM subcategorias sc
        WHERE sc.id = NEW.subcategoria_id
        LIMIT 1
      );
    ELSEIF NOT EXISTS (
      SELECT 1
      FROM subcategorias sc
      WHERE sc.id = NEW.subcategoria_id
        AND sc.categoria_id = NEW.categoria_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Subcategoria no pertenece a la categoria seleccionada';
    END IF;
  END IF;

  IF NEW.categoria_id IS NOT NULL AND (NEW.categoria IS NULL OR NEW.categoria = '') THEN
    SET NEW.categoria = (
      SELECT c.nombre
      FROM categorias c
      WHERE c.id = NEW.categoria_id
      LIMIT 1
    );
  END IF;

  IF NEW.marca_id IS NOT NULL AND (NEW.marca IS NULL OR NEW.marca = '') THEN
    SET NEW.marca = (
      SELECT m.nombre
      FROM marcas m
      WHERE m.id = NEW.marca_id
      LIMIT 1
    );
  END IF;
END$$

CREATE TRIGGER trg_productos_bu_sync_names
BEFORE UPDATE ON productos
FOR EACH ROW
BEGIN
  IF NEW.subcategoria_id IS NOT NULL THEN
    IF NEW.categoria_id IS NULL THEN
      SET NEW.categoria_id = (
        SELECT sc.categoria_id
        FROM subcategorias sc
        WHERE sc.id = NEW.subcategoria_id
        LIMIT 1
      );
    ELSEIF NOT EXISTS (
      SELECT 1
      FROM subcategorias sc
      WHERE sc.id = NEW.subcategoria_id
        AND sc.categoria_id = NEW.categoria_id
    ) THEN
      SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Subcategoria no pertenece a la categoria seleccionada';
    END IF;
  END IF;

  IF NEW.categoria_id IS NOT NULL THEN
    SET NEW.categoria = (
      SELECT c.nombre
      FROM categorias c
      WHERE c.id = NEW.categoria_id
      LIMIT 1
    );
  END IF;

  IF NEW.marca_id IS NOT NULL THEN
    SET NEW.marca = (
      SELECT m.nombre
      FROM marcas m
      WHERE m.id = NEW.marca_id
      LIMIT 1
    );
  END IF;
END$$

DELIMITER ;

-- ------------------------------------------------
-- 7) PROCEDURE: REGISTRO TRANSACCIONAL DE VENTA
-- ------------------------------------------------
DROP PROCEDURE IF EXISTS sp_registrar_venta;
DELIMITER $$

CREATE PROCEDURE sp_registrar_venta(
  IN p_id_usuario INT,
  IN p_nombre_usuario VARCHAR(120),
  IN p_detalle JSON
)
BEGIN
  DECLARE v_venta_id BIGINT UNSIGNED;
  DECLARE v_subtotal DECIMAL(12,2) DEFAULT 0;
  DECLARE v_total DECIMAL(12,2) DEFAULT 0;
  DECLARE v_locked_rows INT DEFAULT 0;

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_id_usuario IS NULL OR p_id_usuario <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usuario invalido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM usuarios u
    WHERE u.id = p_id_usuario
      AND u.activo = 1
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usuario no existe o esta inactivo';
  END IF;

  IF p_detalle IS NULL OR JSON_VALID(p_detalle) = 0 OR JSON_LENGTH(p_detalle) = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Detalle de venta invalido';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM JSON_TABLE(
      p_detalle,
      '$[*]' COLUMNS (
        producto_id INT PATH '$.id',
        cantidad INT PATH '$.cantidad'
      )
    ) jt
    WHERE IFNULL(jt.producto_id, 0) <= 0
       OR IFNULL(jt.cantidad, 0) <= 0
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uno o mas items no tienen id/cantidad validos';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT jt.producto_id
      FROM JSON_TABLE(
        p_detalle,
        '$[*]' COLUMNS (
          producto_id INT PATH '$.id',
          cantidad INT PATH '$.cantidad'
        )
      ) jt
      GROUP BY jt.producto_id
    ) x
    LEFT JOIN productos p ON p.id = x.producto_id
    WHERE p.id IS NULL
       OR p.activo = 0
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Uno o mas productos no existen o estan inactivos';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT jt.producto_id, SUM(jt.cantidad) AS cantidad_total
      FROM JSON_TABLE(
        p_detalle,
        '$[*]' COLUMNS (
          producto_id INT PATH '$.id',
          cantidad INT PATH '$.cantidad'
        )
      ) jt
      GROUP BY jt.producto_id
    ) x
    JOIN productos p ON p.id = x.producto_id
    WHERE p.stock < x.cantidad_total
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock insuficiente para uno o mas productos';
  END IF;

  START TRANSACTION;

  -- Bloquea filas de productos para evitar sobreventa por concurrencia.
  SELECT COUNT(*)
    INTO v_locked_rows
  FROM productos p
  JOIN (
    SELECT jt.producto_id, SUM(jt.cantidad) AS cantidad_total
    FROM JSON_TABLE(
      p_detalle,
      '$[*]' COLUMNS (
        producto_id INT PATH '$.id',
        cantidad INT PATH '$.cantidad'
      )
    ) jt
    GROUP BY jt.producto_id
  ) x ON x.producto_id = p.id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1
    FROM (
      SELECT jt.producto_id, SUM(jt.cantidad) AS cantidad_total
      FROM JSON_TABLE(
        p_detalle,
        '$[*]' COLUMNS (
          producto_id INT PATH '$.id',
          cantidad INT PATH '$.cantidad'
        )
      ) jt
      GROUP BY jt.producto_id
    ) x
    JOIN productos p ON p.id = x.producto_id
    WHERE p.stock < x.cantidad_total
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Stock insuficiente para uno o mas productos';
  END IF;

  INSERT INTO ventas (
    id_usuario,
    nombre_usuario,
    detalle,
    estado,
    canal_venta,
    subtotal,
    impuesto,
    total
  )
  VALUES (
    p_id_usuario,
    COALESCE(NULLIF(TRIM(p_nombre_usuario), ''), (SELECT nombre FROM usuarios WHERE id = p_id_usuario)),
    CAST(p_detalle AS CHAR(10000)),
    'pendiente',
    'WEB',
    0,
    0,
    0
  );

  SET v_venta_id = LAST_INSERT_ID();

  UPDATE ventas
  SET codigo = CONCAT('WEB-', LPAD(v_venta_id, 8, '0'))
  WHERE id = v_venta_id;

  INSERT INTO detalle_ventas (
    venta_id,
    producto_id,
    sku_producto,
    nombre_producto,
    cantidad,
    precio_unitario,
    descuento,
    impuesto,
    subtotal
  )
  SELECT
    v_venta_id,
    x.producto_id,
    p.sku,
    p.nombre,
    x.cantidad_total,
    p.precio,
    0,
    0,
    ROUND(p.precio * x.cantidad_total, 2)
  FROM (
    SELECT jt.producto_id, SUM(jt.cantidad) AS cantidad_total
    FROM JSON_TABLE(
      p_detalle,
      '$[*]' COLUMNS (
        producto_id INT PATH '$.id',
        cantidad INT PATH '$.cantidad'
      )
    ) jt
    GROUP BY jt.producto_id
  ) x
  JOIN productos p ON p.id = x.producto_id;

  INSERT INTO inventario_movimientos (
    producto_id,
    tipo,
    cantidad,
    stock_anterior,
    stock_nuevo,
    motivo,
    referencia_tabla,
    referencia_id,
    usuario_id
  )
  SELECT
    p.id,
    'VENTA',
    x.cantidad_total,
    p.stock,
    p.stock - x.cantidad_total,
    CONCAT('Venta #', v_venta_id),
    'ventas',
    v_venta_id,
    p_id_usuario
  FROM (
    SELECT jt.producto_id, SUM(jt.cantidad) AS cantidad_total
    FROM JSON_TABLE(
      p_detalle,
      '$[*]' COLUMNS (
        producto_id INT PATH '$.id',
        cantidad INT PATH '$.cantidad'
      )
    ) jt
    GROUP BY jt.producto_id
  ) x
  JOIN productos p ON p.id = x.producto_id;

  UPDATE productos p
  JOIN (
    SELECT jt.producto_id, SUM(jt.cantidad) AS cantidad_total
    FROM JSON_TABLE(
      p_detalle,
      '$[*]' COLUMNS (
        producto_id INT PATH '$.id',
        cantidad INT PATH '$.cantidad'
      )
    ) jt
    GROUP BY jt.producto_id
  ) x ON x.producto_id = p.id
  SET p.stock = p.stock - x.cantidad_total,
      p.actualizado_en = CURRENT_TIMESTAMP;

  SELECT IFNULL(SUM(subtotal), 0)
    INTO v_subtotal
  FROM detalle_ventas
  WHERE venta_id = v_venta_id;

  SET v_total = v_subtotal;

  UPDATE ventas
  SET subtotal = v_subtotal,
      impuesto = 0,
      total = v_total,
      detalle = CAST(p_detalle AS CHAR(10000))
  WHERE id = v_venta_id;

  INSERT INTO notificaciones (usuario_id, tipo, titulo, descripcion)
  VALUES (
    p_id_usuario,
    'ventas',
    'Compra registrada',
    CONCAT('Pedido #', v_venta_id, ' generado por S/ ', FORMAT(v_total, 2))
  );

  INSERT INTO auditoria (
    usuario_id,
    accion,
    tabla,
    registro_id,
    valores_nuevos
  )
  VALUES (
    p_id_usuario,
    'CREAR',
    'ventas',
    CAST(v_venta_id AS CHAR),
    JSON_OBJECT(
      'id_venta', v_venta_id,
      'total', v_total
    )
  );

  COMMIT;

  SELECT v_venta_id AS id_venta, v_total AS total_venta;
END$$

DELIMITER ;

-- ------------------------------------------------
-- 8) PROCEDURE: CHECKOUT DESDE CARRITO
-- ------------------------------------------------
DROP PROCEDURE IF EXISTS sp_checkout_desde_carrito;
DELIMITER $$

CREATE PROCEDURE sp_checkout_desde_carrito(
  IN p_carrito_id BIGINT,
  IN p_usuario_id INT
)
BEGIN
  DECLARE v_detalle JSON;
  DECLARE v_items INT DEFAULT 0;
  DECLARE v_venta_id BIGINT UNSIGNED;

  IF p_carrito_id IS NULL OR p_carrito_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Carrito invalido';
  END IF;

  IF p_usuario_id IS NULL OR p_usuario_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Usuario invalido';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM carritos c
    WHERE c.id = p_carrito_id
      AND c.usuario_id = p_usuario_id
      AND c.estado = 'activo'
  ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Carrito no existe o no esta activo';
  END IF;

  SELECT JSON_ARRAYAGG(
           JSON_OBJECT(
             'id', ci.producto_id,
             'cantidad', ci.cantidad
           )
         )
    INTO v_detalle
  FROM carrito_items ci
  WHERE ci.carrito_id = p_carrito_id;

  SET v_items = IFNULL(JSON_LENGTH(v_detalle), 0);

  IF v_items = 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'El carrito no tiene productos';
  END IF;

  CALL sp_registrar_venta(
    p_usuario_id,
    (SELECT nombre FROM usuarios WHERE id = p_usuario_id),
    v_detalle
  );

  SELECT v.id
    INTO v_venta_id
  FROM ventas v
  WHERE v.id_usuario = p_usuario_id
  ORDER BY v.id DESC
  LIMIT 1;

  IF v_venta_id IS NOT NULL THEN
    UPDATE ventas
    SET carrito_id = p_carrito_id,
        actualizado_en = CURRENT_TIMESTAMP
    WHERE id = v_venta_id;
  END IF;

  UPDATE carritos
  SET estado = 'convertido',
      actualizado_en = CURRENT_TIMESTAMP
  WHERE id = p_carrito_id;
END$$

DELIMITER ;

-- ------------------------------------------------
-- 9) PROCEDURE: ACTUALIZAR ESTADO DE VENTA
-- ------------------------------------------------
DROP PROCEDURE IF EXISTS sp_actualizar_estado_venta;
DELIMITER $$

CREATE PROCEDURE sp_actualizar_estado_venta(
  IN p_venta_id BIGINT,
  IN p_estado VARCHAR(20),
  IN p_usuario_id INT
)
BEGIN
  DECLARE v_estado_actual VARCHAR(20);

  DECLARE EXIT HANDLER FOR SQLEXCEPTION
  BEGIN
    ROLLBACK;
    RESIGNAL;
  END;

  IF p_venta_id IS NULL OR p_venta_id <= 0 THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Venta invalida';
  END IF;

  IF p_estado NOT IN ('pendiente', 'pagado', 'preparando', 'en camino', 'entregado', 'cancelado', 'reembolsado') THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Estado de venta no permitido';
  END IF;

  START TRANSACTION;

  SELECT estado
    INTO v_estado_actual
  FROM ventas
  WHERE id = p_venta_id
  FOR UPDATE;

  IF v_estado_actual IS NULL THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'Venta no encontrada';
  END IF;

  IF v_estado_actual IN ('cancelado', 'reembolsado') AND p_estado <> v_estado_actual THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se permite cambiar una venta cancelada o reembolsada';
  END IF;

  IF p_estado IN ('pagado', 'preparando', 'en camino', 'entregado')
     AND NOT EXISTS (
       SELECT 1
       FROM ventas_pagos vp
       WHERE vp.venta_id = p_venta_id
         AND vp.estado = 'confirmado'
         AND vp.metodo_pago_id IS NOT NULL
     ) THEN
    SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'No se puede avanzar la venta sin un metodo de pago valido';
  END IF;

  IF p_estado IN ('cancelado', 'reembolsado')
     AND v_estado_actual NOT IN ('cancelado', 'reembolsado') THEN
    INSERT INTO inventario_movimientos (
      producto_id,
      tipo,
      cantidad,
      stock_anterior,
      stock_nuevo,
      motivo,
      referencia_tabla,
      referencia_id,
      usuario_id
    )
    SELECT
      p.id,
      'DEVOLUCION',
      x.cantidad_total,
      p.stock,
      p.stock + x.cantidad_total,
      CONCAT('Reposicion por ', p_estado, ' de venta #', p_venta_id),
      'ventas',
      p_venta_id,
      p_usuario_id
    FROM (
      SELECT dv.producto_id, SUM(dv.cantidad) AS cantidad_total
      FROM detalle_ventas dv
      WHERE dv.venta_id = p_venta_id
        AND dv.producto_id IS NOT NULL
      GROUP BY dv.producto_id
    ) x
    JOIN productos p ON p.id = x.producto_id;

    UPDATE productos p
    JOIN (
      SELECT dv.producto_id, SUM(dv.cantidad) AS cantidad_total
      FROM detalle_ventas dv
      WHERE dv.venta_id = p_venta_id
        AND dv.producto_id IS NOT NULL
      GROUP BY dv.producto_id
    ) x ON x.producto_id = p.id
    SET p.stock = p.stock + x.cantidad_total,
        p.actualizado_en = CURRENT_TIMESTAMP;
  END IF;

  UPDATE ventas
  SET estado = p_estado,
      actualizado_en = CURRENT_TIMESTAMP
  WHERE id = p_venta_id;

  INSERT INTO auditoria (
    usuario_id,
    accion,
    tabla,
    registro_id,
    valores_anteriores,
    valores_nuevos
  )
  VALUES (
    p_usuario_id,
    'ACTUALIZAR_ESTADO',
    'ventas',
    CAST(p_venta_id AS CHAR),
    JSON_OBJECT('estado', v_estado_actual),
    JSON_OBJECT('estado', p_estado)
  );

  COMMIT;
END$$

DELIMITER ;

-- ------------------------------------------------
-- 10) DATA SEED (MINIMO FUNCIONAL)
-- ------------------------------------------------
INSERT INTO roles (role_codigo, role_nombre, role_descripcion)
VALUES
  ('admin', 'Administrador', 'Control total del e-commerce'),
  ('cliente', 'Cliente', 'Compra y seguimiento de pedidos');

INSERT INTO permisos (perm_codigo, perm_descripcion, perm_modulo)
VALUES
  ('auth.login', 'Iniciar sesion', 'auth'),
  ('catalogo.ver', 'Ver catalogo web', 'catalogo'),
  ('carrito.gestionar', 'Gestionar carrito', 'carrito'),
  ('checkout.realizar', 'Completar checkout', 'checkout'),
  ('ventas.ver_propias', 'Ver compras propias', 'ventas'),
  ('ventas.ver_todas', 'Ver todas las ventas', 'ventas'),
  ('ventas.actualizar_estado', 'Actualizar estado de venta', 'ventas'),
  ('productos.ver', 'Ver productos', 'productos'),
  ('productos.crear', 'Crear productos', 'productos'),
  ('productos.editar', 'Editar productos', 'productos'),
  ('productos.eliminar', 'Eliminar productos', 'productos'),
  ('usuarios.ver', 'Ver usuarios', 'usuarios'),
  ('usuarios.crear', 'Crear usuarios', 'usuarios'),
  ('usuarios.editar', 'Editar usuarios', 'usuarios'),
  ('usuarios.eliminar', 'Eliminar usuarios', 'usuarios'),
  ('roles.gestionar', 'Gestionar roles y permisos', 'seguridad'),
  ('notificaciones.ver', 'Ver notificaciones', 'notificaciones');

INSERT INTO roles_permisos (rper_role_codigo, rper_perm_codigo)
SELECT 'admin', p.perm_codigo
FROM permisos p;

INSERT INTO roles_permisos (rper_role_codigo, rper_perm_codigo)
VALUES
  ('cliente', 'auth.login'),
  ('cliente', 'catalogo.ver'),
  ('cliente', 'carrito.gestionar'),
  ('cliente', 'checkout.realizar'),
  ('cliente', 'ventas.ver_propias'),
  ('cliente', 'notificaciones.ver');

INSERT INTO usuarios (nombre, email, password, rol, activo)
VALUES
  ('Administrador NovaTech', 'admin@novatech.com', '$2b$10$hbKO7i8qqCKv6WyGBBKUp.SJMBJsg0n4svSDbWV4NPUPPeOuHkc5a', 'admin', 1),
  ('Cliente Demo', 'cliente@novatech.com', '$2b$10$hbKO7i8qqCKv6WyGBBKUp.SJMBJsg0n4svSDbWV4NPUPPeOuHkc5a', 'cliente', 1);

INSERT INTO metodos_pago (codigo, nombre, requiere_referencia)
VALUES
  ('tarjeta', 'Tarjeta', 0),
  ('yape', 'Yape', 1),
  ('transferencia', 'Transferencia bancaria', 1),
  ('contraentrega', 'Contra entrega', 0);

INSERT INTO categorias (nombre, slug, descripcion, orden)
VALUES
  ('Computo', 'computo', 'Laptops y equipos de productividad', 1),
  ('Perifericos', 'perifericos', 'Accesorios para trabajo y gaming', 2),
  ('Pantallas', 'pantallas', 'Monitores y pantallas externas', 3),
  ('Almacenamiento', 'almacenamiento', 'Discos SSD, HDD y memorias', 4);

INSERT INTO subcategorias (categoria_id, nombre, slug, descripcion, orden)
VALUES
  (
    (SELECT id FROM categorias WHERE slug = 'computo'),
    'Laptops',
    'laptops',
    'Equipos portatiles para trabajo y estudio',
    1
  ),
  (
    (SELECT id FROM categorias WHERE slug = 'perifericos'),
    'Mouse',
    'mouse',
    'Dispositivos apuntadores cableados e inalambricos',
    1
  ),
  (
    (SELECT id FROM categorias WHERE slug = 'perifericos'),
    'Teclados',
    'teclados',
    'Teclados mecanicos y de membrana',
    2
  ),
  (
    (SELECT id FROM categorias WHERE slug = 'pantallas'),
    'Monitores',
    'monitores',
    'Pantallas externas para oficina y diseno',
    1
  ),
  (
    (SELECT id FROM categorias WHERE slug = 'almacenamiento'),
    'SSD',
    'ssd',
    'Unidades de estado solido internas y externas',
    1
  );

INSERT INTO marcas (nombre, slug)
VALUES
  ('NovaTech', 'novatech'),
  ('VisionCore', 'visioncore'),
  ('KeyForge', 'keyforge'),
  ('FlashByte', 'flashbyte');

INSERT INTO productos (
  sku,
  nombre,
  slug,
  descripcion,
  categoria_id,
  subcategoria_id,
  marca_id,
  categoria,
  marca,
  precio,
  stock,
  stock_minimo,
  imagen,
  activo,
  destacado
)
VALUES
  (
    'SKU-NT-001',
    'Laptop Nova 14',
    'laptop-nova-14',
    'Laptop para productividad diaria',
    (SELECT id FROM categorias WHERE slug = 'computo'),
    (SELECT id FROM subcategorias WHERE slug = 'laptops'),
    (SELECT id FROM marcas WHERE slug = 'novatech'),
    'Computo',
    'NovaTech',
    2399.00,
    12,
    3,
    'https://picsum.photos/seed/nova-laptop/600/400',
    1,
    1
  ),
  (
    'SKU-NT-002',
    'Mouse Inalambrico NX',
    'mouse-inalambrico-nx',
    'Mouse ergonomico de precision',
    (SELECT id FROM categorias WHERE slug = 'perifericos'),
    (SELECT id FROM subcategorias WHERE slug = 'mouse'),
    (SELECT id FROM marcas WHERE slug = 'novatech'),
    'Perifericos',
    'NovaTech',
    89.90,
    35,
    5,
    'https://picsum.photos/seed/nova-mouse/600/400',
    1,
    0
  ),
  (
    'SKU-NT-003',
    'Monitor 27 QHD',
    'monitor-27-qhd',
    'Monitor IPS para oficina y diseno',
    (SELECT id FROM categorias WHERE slug = 'pantallas'),
    (SELECT id FROM subcategorias WHERE slug = 'monitores'),
    (SELECT id FROM marcas WHERE slug = 'visioncore'),
    'Pantallas',
    'VisionCore',
    1299.50,
    7,
    2,
    'https://picsum.photos/seed/nova-monitor/600/400',
    1,
    1
  ),
  (
    'SKU-NT-004',
    'Teclado Mecanico K82',
    'teclado-mecanico-k82',
    'Teclado mecanico retroiluminado',
    (SELECT id FROM categorias WHERE slug = 'perifericos'),
    (SELECT id FROM subcategorias WHERE slug = 'teclados'),
    (SELECT id FROM marcas WHERE slug = 'keyforge'),
    'Perifericos',
    'KeyForge',
    279.00,
    18,
    4,
    'https://picsum.photos/seed/nova-keyboard/600/400',
    1,
    0
  ),
  (
    'SKU-NT-005',
    'SSD NVMe 1TB',
    'ssd-nvme-1tb',
    'Unidad de almacenamiento de alto rendimiento',
    (SELECT id FROM categorias WHERE slug = 'almacenamiento'),
    (SELECT id FROM subcategorias WHERE slug = 'ssd'),
    (SELECT id FROM marcas WHERE slug = 'flashbyte'),
    'Almacenamiento',
    'FlashByte',
    459.00,
    24,
    6,
    'https://picsum.photos/seed/nova-ssd/600/400',
    1,
    0
  );

INSERT INTO direcciones_usuario (
  usuario_id,
  alias,
  destinatario,
  telefono_contacto,
  direccion_linea1,
  distrito,
  provincia,
  departamento,
  pais,
  predeterminada
)
VALUES
  (
    (SELECT id FROM usuarios WHERE email = 'cliente@novatech.com'),
    'Casa',
    'Cliente Demo',
    '999888777',
    'Av. Demo 123',
    'Lima',
    'Lima',
    'Lima',
    'PE',
    1
  );

INSERT INTO carritos (usuario_id, estado)
VALUES
  ((SELECT id FROM usuarios WHERE email = 'cliente@novatech.com'), 'activo');

-- Fin del script
