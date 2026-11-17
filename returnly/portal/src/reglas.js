// Las reglas de negocio (intentos antes del bloqueo, minutos de inactividad, estados del seguimiento…) viven
// en el backend (returnly/backend/src/reglas.js) y llegan con la sesión. Acá solo se ponen a disposición de
// las pantallas, para mostrar los avisos con los mismos valores sin repetirlos.
import { createContext, useContext } from 'react'

export const ReglasContext = createContext(null)
export const useReglas = () => useContext(ReglasContext)
