import pg from 'pg';

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL ?? 'postgres://tienda:tienda@localhost:5433/tienda',
});
