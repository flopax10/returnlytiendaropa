import { num, compacto, usd, pct, fechaCorta, DIAS_SEMANA } from '../metricas.js'
import { Tarjeta, Tabla, Indicador, LineaTiempo, Barras, MapaCalor } from '../components/graficos.jsx'
import CambiarPassword from '../components/CambiarPassword.jsx'
import Recomendaciones from './Recomendaciones.jsx'
import { useState } from 'react'

const COLUMNAS_PRODUCTO = [
  { titulo: 'Producto', campo: 'producto' },
  { titulo: 'Categoría', campo: 'categoria' },
  { titulo: 'Lo vieron', campo: 'vieron', formato: num, numero: true },
  { titulo: 'Al carrito', campo: 'carrito', formato: num, numero: true },
  { titulo: 'Compraron', campo: 'compraron', formato: num, numero: true },
  { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v), numero: true },
]

export default function Panel({ empresa, actualizado, metricas, recomendaciones, onSalir, onVolver }) {
  const [vista, setVista] = useState('recomendaciones')
  const {
    periodo, kpis, dias, pasosEmbudo, tasaAbandono, oportunidades, destacados,
    porCategoria, porDispositivo, porFuente, porPais, grillaHoraria, sugerencias, etiquetaDispositivo,
  } = metricas
  return (
    <div className="panel">
      <header className="barra-superior">
        <div className="marca">
          <span className="logo">Returnly</span>
          <span className="marca-sub">Comportamiento pre-compra</span>
        </div>
        <div className="filtros">
          {empresa.web
            ? <a className="empresa link-web" href={empresa.web} target="_blank" rel="noopener noreferrer" title={`Abrir ${empresa.web}`}>{empresa.nombre} ↗</a>
            : <span className="empresa">{empresa.nombre}</span>}
          <span className="periodo">{fechaCorta(periodo.desde)} {periodo.desde.getFullYear()} – {fechaCorta(periodo.hasta)} {periodo.hasta.getFullYear()}</span>
          {onVolver ? <button className="boton-vista" onClick={onVolver}>Volver al admin</button> : <CambiarPassword />}
          <button className="boton-vista" onClick={onSalir}>Salir</button>
        </div>
      </header>

      <main className="contenido">
        {empresa.nota && <p className="aviso"><strong>Sobre estos datos.</strong> {empresa.nota}</p>}
        <p className="actualizado">
          Datos actualizados el {new Date(actualizado).toLocaleString('es-UY', { dateStyle: 'short', timeStyle: 'short' })}
        </p>

        <nav className="pestanas" role="tablist">
          {[['recomendaciones', 'Feedback'], ['dashboards', 'Dashboards']].map(([id, texto]) => (
            <button key={id} role="tab" aria-selected={vista === id} className={vista === id ? 'activa' : ''} onClick={() => setVista(id)}>{texto}</button>
          ))}
        </nav>

        {vista === 'recomendaciones' ? <Recomendaciones recomendaciones={recomendaciones} /> : <>

        <section className="indicadores" aria-label="Indicadores principales">
          <Indicador destacado etiqueta="Tasa de conversión" valor={pct(kpis.conversion, 2)} detalle="usuarios que compraron" />
          <Indicador etiqueta="Usuarios" valor={compacto(kpis.usuarios)} detalle={`${compacto(kpis.sesiones)} sesiones`} />
          <Indicador etiqueta="Compras" valor={num(kpis.compras)} />
          <Indicador etiqueta="Ingresos" valor={usd(kpis.ingresos)} />
          <Indicador etiqueta="Ticket promedio" valor={usd(kpis.ticket)} />
          <Indicador etiqueta="Carritos abandonados" valor={pct(tasaAbandono.carrito, 0)} detalle="sesiones con carrito sin compra" />
        </section>

        <section className="sugerencias" aria-label="Sugerencias">
          <h2>Sugerencias para vender más</h2>
          <ol>
            {sugerencias.map((s) => (
              <li key={s.titulo}>
                <strong>{s.titulo}</strong>
                <p>{s.detalle}</p>
              </li>
            ))}
          </ol>
        </section>

        <div className="tablero">
          <Tarjeta ancho={2} titulo="Embudo de compra" subtitulo="Usuarios que llegaron a cada paso · % sobre los que vieron un producto"
            tabla={{
              columnas: [
                { titulo: 'Paso', campo: 'nombre' },
                { titulo: 'Usuarios', campo: 'usuarios', formato: num, numero: true },
                { titulo: '% del total', campo: 'delTotal', formato: (v) => pct(v), numero: true },
                { titulo: '% del paso anterior', campo: 'delAnterior', formato: (v) => pct(v), numero: true },
              ],
              filas: pasosEmbudo,
            }}>
            <Barras
              filas={pasosEmbudo.map((p) => ({ etiqueta: p.nombre, valor: p.usuarios, detalle: `${pct(p.delAnterior)} del paso anterior` }))}
              formato={num}
              textoValor={(f) => `${num(f.valor)} · ${pct(f.valor / pasosEmbudo[0].usuarios)}`} />
          </Tarjeta>

          <Tarjeta titulo="Usuarios por día" subtitulo="Usuarios únicos de cada día"
            tabla={{ columnas: [{ titulo: 'Fecha', campo: 'fecha', formato: fechaCorta }, { titulo: 'Usuarios', campo: 'usuarios', formato: num, numero: true }], filas: dias }}>
            <LineaTiempo datos={dias.map((d) => ({ fecha: d.fecha, valor: d.usuarios }))} formato={num} />
          </Tarjeta>

          <Tarjeta titulo="Ingresos por día" subtitulo="Dólares facturados en compras"
            tabla={{ columnas: [{ titulo: 'Fecha', campo: 'fecha', formato: fechaCorta }, { titulo: 'Compras', campo: 'compras', formato: num, numero: true }, { titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true }], filas: dias }}>
            <LineaTiempo datos={dias.map((d) => ({ fecha: d.fecha, valor: d.ingresos }))} formato={(v) => usd(v)} />
          </Tarjeta>

          <section className="tarjeta ancho-2">
            <header className="tarjeta-cabezal">
              <div>
                <h2>Mucho interés, poca compra</h2>
                <p className="subtitulo">Entre los 40 productos más vistos, los que menos convierten y qué revisar</p>
              </div>
            </header>
            <Tabla columnas={[...COLUMNAS_PRODUCTO, { titulo: 'Qué revisar', campo: 'sugerencia' }]} filas={oportunidades} />
          </section>

          <section className="tarjeta ancho-2">
            <header className="tarjeta-cabezal">
              <div>
                <h2>Los que mejor convierten</h2>
                <p className="subtitulo">Entre los 40 productos más vistos, los que más convierten</p>
              </div>
            </header>
            <Tabla columnas={COLUMNAS_PRODUCTO} filas={destacados} />
          </section>

          <Tarjeta titulo="Ingresos por categoría" subtitulo="Dólares facturados por categoría de producto"
            tabla={{
              columnas: [
                { titulo: 'Categoría', campo: 'categoria' },
                { titulo: 'Lo vieron', campo: 'vieron', formato: num, numero: true },
                { titulo: 'Compraron', campo: 'compraron', formato: num, numero: true },
                { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v), numero: true },
                { titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true },
              ],
              filas: porCategoria,
            }}>
            <Barras filas={porCategoria.map((c) => ({ etiqueta: c.categoria, valor: c.ingresos, detalle: `Conversión ${pct(c.conversion)}` }))} formato={usd} />
          </Tarjeta>

          <Tarjeta titulo={`Conversión por ${etiquetaDispositivo}`} subtitulo="% de usuarios que compraron"
            tabla={{
              columnas: [
                { titulo: etiquetaDispositivo[0].toUpperCase() + etiquetaDispositivo.slice(1), campo: 'dispositivo' },
                { titulo: 'Usuarios', campo: 'usuarios', formato: num, numero: true },
                { titulo: 'Compradores', campo: 'compradores', formato: num, numero: true },
                { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
                { titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true },
              ],
              filas: porDispositivo,
            }}>
            <Barras filas={porDispositivo.map((d) => ({ etiqueta: d.dispositivo, valor: d.conversion, detalle: `${num(d.usuarios)} usuarios` }))} formato={(v) => pct(v, 2)} />
          </Tarjeta>

          <Tarjeta titulo="De dónde llegan" subtitulo="Usuarios por fuente / medio · conversión en la punta"
            tabla={{
              columnas: [
                { titulo: 'Fuente / medio', campo: 'fuente' },
                { titulo: 'Usuarios', campo: 'usuarios', formato: num, numero: true },
                { titulo: 'Compradores', campo: 'compradores', formato: num, numero: true },
                { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
                { titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true },
              ],
              filas: porFuente,
            }}>
            <Barras filas={porFuente.map((f) => ({ etiqueta: f.fuente, valor: f.usuarios, detalle: `Conversión ${pct(f.conversion, 2)}` }))}
              formato={num} textoValor={(f) => `${compacto(f.valor)} · ${f.detalle.replace('Conversión ', '')}`} />
          </Tarjeta>

          <section className="tarjeta">
            <header className="tarjeta-cabezal">
              <div>
                <h2>Países</h2>
                <p className="subtitulo">Los 10 con más usuarios</p>
              </div>
            </header>
            <Tabla columnas={[
              { titulo: 'País', campo: 'pais' },
              { titulo: 'Usuarios', campo: 'usuarios', formato: num, numero: true },
              { titulo: 'Conversión', campo: 'conversion', formato: (v) => pct(v, 2), numero: true },
              { titulo: 'Ingresos', campo: 'ingresos', formato: usd, numero: true },
            ]} filas={porPais} />
          </section>

          <Tarjeta ancho={2} titulo="¿Cuándo entran?" subtitulo="Sesiones por día de la semana y hora (UTC)"
            tabla={{
              columnas: [{ titulo: 'Día', campo: 'dia' }, ...Array.from({ length: 24 }, (_, h) => ({ titulo: `${h}h`, campo: h, formato: num, numero: true }))],
              filas: grillaHoraria.map((fila, d) => ({ dia: DIAS_SEMANA[d], ...fila })),
            }}>
            <MapaCalor grilla={grillaHoraria} filas={DIAS_SEMANA} formato={num} />
          </Tarjeta>
        </div>
        </>}
      </main>
    </div>
  )
}
