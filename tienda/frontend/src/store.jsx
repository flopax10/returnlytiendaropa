// Estado global: sesión del cliente y carrito (ambos guardados en localStorage)
import { createContext, useContext, useEffect, useState } from 'react';

function useGuardado(clave, inicial) {
  const [valor, setValor] = useState(() => {
    try { return JSON.parse(localStorage.getItem(clave)) ?? inicial; } catch { return inicial; }
  });
  useEffect(() => { localStorage.setItem(clave, JSON.stringify(valor)); }, [clave, valor]);
  return [valor, setValor];
}

const AuthContext = createContext(null);
export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }) {
  const [sesion, setSesion] = useGuardado('tienda.sesion', null); // { token, cliente }
  const valor = {
    token: sesion?.token,
    cliente: sesion?.cliente,
    iniciar: setSesion,
    salir: () => setSesion(null),
  };
  return <AuthContext.Provider value={valor}>{children}</AuthContext.Provider>;
}

const CartContext = createContext(null);
export const useCart = () => useContext(CartContext);

export function CartProvider({ children }) {
  // Cada ítem: { varianteId, cantidad, productoId, nombre, imagen, talle, color, precio }
  const [items, setItems] = useGuardado('tienda.carrito', []);

  const agregar = (item) => setItems((prev) => {
    const existe = prev.find((i) => i.varianteId === item.varianteId);
    if (existe) return prev.map((i) => (i.varianteId === item.varianteId ? { ...i, cantidad: i.cantidad + 1 } : i));
    return [...prev, { ...item, cantidad: 1 }];
  });
  const cambiarCantidad = (varianteId, cantidad) => setItems((prev) =>
    cantidad < 1 ? prev.filter((i) => i.varianteId !== varianteId)
      : prev.map((i) => (i.varianteId === varianteId ? { ...i, cantidad } : i)));
  const vaciar = () => setItems([]);

  const cantidad = items.reduce((s, i) => s + i.cantidad, 0);
  const total = items.reduce((s, i) => s + i.cantidad * i.precio, 0);

  return (
    <CartContext.Provider value={{ items, agregar, cambiarCantidad, vaciar, cantidad, total }}>
      {children}
    </CartContext.Provider>
  );
}
