// Calcula cuántos datos leerían las consultas del panel para cada empresa, sin gastar cuota (dry run).
//   npm run estimar
import { listarEmpresas } from '../src/empresas.js';
import { probarConexion } from '../src/datos.js';

for (const empresa of await listarEmpresas()) {
  try {
    const { gbPorActualizacion } = await probarConexion(empresa);
    console.log(`${empresa.nombre}: ${gbPorActualizacion} GB por actualización (límite gratis: 1.024 GB por mes)`);
  } catch (e) {
    console.log(`${empresa.nombre}: ${e.message}`);
  }
}
