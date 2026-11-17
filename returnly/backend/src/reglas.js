// Reglas de negocio de Returnly: UN SOLO LUGAR para cambiarlas. El backend las aplica y se las pasa al portal
// (en /api/sesion y /api/login) para que muestre los avisos con los mismos valores, sin repetirlos.
export const REGLAS = Object.freeze({
  maxIntentos: 5,               // intentos fallidos seguidos antes de bloquear al usuario
  minutosBloqueoAdmin: 15,      // un admin se bloquea por un rato (así nadie deja a Returnly sin admins)
  horasSesion: 8,               // duración máxima de una sesión
  minutosInactividad: 30,       // la sesión se cierra tras este tiempo sin uso
  minutosAvisoInactividad: 2,   // cuánto antes de cerrar se avisa "¿Seguís ahí?"
  largoMinimoPassword: 10,      // al cambiar la contraseña
  estadosSeguimiento: Object.freeze(['pendiente', 'en_curso', 'hecha']), // avance de una recomendación
});
