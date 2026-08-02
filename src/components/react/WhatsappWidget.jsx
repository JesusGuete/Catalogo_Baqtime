import { useEffect, useRef, useState } from "react";
import { whatsappUrl } from "../../lib/whatsapp.js";

// Botón flotante de WhatsApp con sus opciones.
//
// Dos caminos y no uno solo: quien quiere comprar y quien tiene un problema con un pedido
// llegan con preguntas muy distintas, y el mensaje prellenado le ahorra a quien atiende
// tener que preguntar "¿en qué te ayudo?" antes de poder ayudar.
//
// Se reusa whatsappUrl() de lib/whatsapp.js para que el número de la tienda siga
// definido en un solo lugar.

const OPCIONES = [
  {
    titulo: "Compra con un asesor",
    detalle: "Comunícate con nuestros asesores para realizar tu compra",
    mensaje: "¡Hola! Requiero asesoría personalizada para mi compra",
  },
  {
    titulo: "Servicio al cliente",
    detalle: "Rastrea tu envío, consulta disponibilidad y resuelve tus dudas",
    mensaje: "¡Hola! Requiero asesoría personalizada de servicio al cliente.",
  },
];

export default function WhatsappWidget() {
  const [abierto, setAbierto] = useState(false);
  const contenedor = useRef(null);

  // Cerrar con Escape y al tocar fuera. Un panel flotante que solo se cierra con su
  // propio botón termina tapando el contenido cuando alguien lo abre sin querer.
  useEffect(() => {
    if (!abierto) return;
    function alTeclado(e) {
      if (e.key === "Escape") setAbierto(false);
    }
    function alTocarFuera(e) {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false);
    }
    document.addEventListener("keydown", alTeclado);
    document.addEventListener("mousedown", alTocarFuera);
    document.addEventListener("touchstart", alTocarFuera);
    return () => {
      document.removeEventListener("keydown", alTeclado);
      document.removeEventListener("mousedown", alTocarFuera);
      document.removeEventListener("touchstart", alTocarFuera);
    };
  }, [abierto]);

  return (
    <div className="wa-widget" ref={contenedor}>
      {abierto && (
        <div className="wa-opciones" role="menu" aria-label="Opciones de contacto">
          {OPCIONES.map((o) => (
            <a
              key={o.titulo}
              className="wa-opcion"
              role="menuitem"
              href={whatsappUrl(o.mensaje)}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setAbierto(false)}
            >
              <span className="wa-opcion-titulo">{o.titulo}</span>
              <span className="wa-opcion-detalle">{o.detalle}</span>
            </a>
          ))}
        </div>
      )}

      <button
        type="button"
        className={"wa-btn" + (abierto ? " is-abierto" : "")}
        aria-expanded={abierto}
        aria-label={abierto ? "Cerrar opciones de contacto" : "Escríbenos por WhatsApp"}
        onClick={() => setAbierto((v) => !v)}
      >
        {abierto ? (
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path
              d="M6 6l12 12M18 6L6 18"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
            />
          </svg>
        ) : (
          // Logo de WhatsApp. Va como trazo relleno para que se lea a 30px.
          <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.82 9.82 0 0 0 12.04 2Zm0 18.13h-.01a8.23 8.23 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.19 8.19 0 0 1-1.26-4.36c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.41a8.18 8.18 0 0 1 2.41 5.83c0 4.54-3.7 8.21-8.24 8.21Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.47-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.13-.15.17-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.48c-.16 0-.43.06-.65.31-.22.25-.85.84-.85 2.04 0 1.2.87 2.36.99 2.53.12.16 1.72 2.62 4.16 3.68.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.68-1.18.21-.58.21-1.07.14-1.18-.06-.11-.22-.17-.47-.29Z" />
          </svg>
        )}
      </button>
    </div>
  );
}
