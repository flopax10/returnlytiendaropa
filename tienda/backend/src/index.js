import express from 'express';
import cors from 'cors';
import { tiendaRouter } from './routes/tienda.js';
import { integracionRouter } from './routes/integracion.js';

const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => res.json({ ok: true }));

// Rutas que usa la web de la tienda (públicas)
app.use('/api/store', tiendaRouter);

// Rutas que usa Returnly (protegidas con API key)
app.use('/api', integracionRouter);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(500).json({ error: 'Error interno' });
});

// En Vercel la app corre como función (usa el export); en la compu levanta un servidor normal
if (!process.env.VERCEL) {
  const port = Number(process.env.PORT ?? 3001);
  app.listen(port, () => console.log(`API de la tienda en http://localhost:${port}`));
}

export default app;
