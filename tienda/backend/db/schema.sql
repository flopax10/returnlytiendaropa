DROP TABLE IF EXISTS item_pedido, pedido, cliente, variante, producto CASCADE;
DROP SEQUENCE IF EXISTS pedido_numero_seq;

CREATE TABLE producto (
  id          SERIAL PRIMARY KEY,
  nombre      TEXT NOT NULL,
  categoria   TEXT NOT NULL,
  descripcion TEXT,
  precio      NUMERIC(10,2) NOT NULL,
  imagen      TEXT
);

CREATE TABLE variante (
  id          SERIAL PRIMARY KEY,
  producto_id INT NOT NULL REFERENCES producto(id) ON DELETE CASCADE,
  talle       TEXT NOT NULL,
  color       TEXT NOT NULL,
  sku         TEXT NOT NULL UNIQUE
);

CREATE TABLE cliente (
  id            SERIAL PRIMARY KEY,
  nombre        TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL
);

CREATE SEQUENCE pedido_numero_seq START 1000;

CREATE TABLE pedido (
  id         SERIAL PRIMARY KEY,
  numero     TEXT NOT NULL UNIQUE DEFAULT ('TR-' || nextval('pedido_numero_seq')),
  cliente_id INT NOT NULL REFERENCES cliente(id),
  fecha      TIMESTAMPTZ NOT NULL DEFAULT now(),
  estado     TEXT NOT NULL DEFAULT 'entregado'
);

CREATE TABLE item_pedido (
  id              SERIAL PRIMARY KEY,
  pedido_id       INT NOT NULL REFERENCES pedido(id) ON DELETE CASCADE,
  variante_id     INT NOT NULL REFERENCES variante(id),
  cantidad        INT NOT NULL CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL,
  devuelto        BOOLEAN NOT NULL DEFAULT false,
  devolucion_ref  TEXT
);

CREATE INDEX ON pedido (cliente_id);
CREATE INDEX ON item_pedido (pedido_id);
