// Abrir el checkout de Wompi en el navegador. Lo comparten el botón "Pagar ahora"
// (BotonPagar.astro: gracias, seguimiento, resultado) y el paso de pago de la compra
// (CheckoutApp.jsx).
//
// SOLO NAVEGADOR, Y SIN DECIDIR NADA DEL COBRO: pide el checkout ya firmado a /api/pagos/iniciar
// (que toma el monto de la base) y se lo pasa tal cual al widget. Al terminar no da nada por
// pagado: lleva a /pedido/pago/<token>?id=<transacción>, y esa página le pregunta a Wompi.
//
// El widget (checkout.wompi.co/widget.js) se descarga recién la primera vez que se abre: quien
// no va a pagar en línea no descarga nada de Wompi.

interface ResultadoWidget {
  transaction?: { id?: string };
}
interface Widget {
  open(alTerminar: (resultado: ResultadoWidget) => void): void;
}
type ConstructorWidget = new (opciones: unknown) => Widget;

const URL_WIDGET = "https://checkout.wompi.co/widget.js";

function widgetCargado(): ConstructorWidget | undefined {
  return (window as unknown as { WidgetCheckout?: ConstructorWidget }).WidgetCheckout;
}

function cargarWidget(): Promise<ConstructorWidget> {
  const ya = widgetCargado();
  if (ya) return Promise.resolve(ya);
  return new Promise((resolver, rechazar) => {
    const script = document.createElement("script");
    script.src = URL_WIDGET;
    script.async = true;
    script.onload = () => {
      const cargado = widgetCargado();
      if (cargado) resolver(cargado);
      else rechazar(new Error("El widget de Wompi no quedó disponible."));
    };
    script.onerror = () => rechazar(new Error("No se pudo cargar el widget de Wompi."));
    document.head.appendChild(script);
  });
}

/** La página que le pregunta a Wompi cómo quedó el pago y muestra el resumen. */
export function urlResultadoPago(token: string, transaccion: string): string {
  return `/pedido/pago/${encodeURIComponent(token)}?id=${encodeURIComponent(transaccion)}`;
}

/**
 * Abre la ventana de pago de Wompi para el pedido del token.
 *
 * - `{ ok: true }`: la ventana quedó abierta. Si el cliente paga, el navegador se va solo a la
 *   página de resultado. Si la cierra sin pagar puede que el widget no avise, así que quien llama
 *   deja todo listo para volver a abrirla.
 * - `{ ok: false, error }`: no se pudo abrir; `error` va tal cual al cliente.
 *
 * Cada llamada crea un intento nuevo en la base (crear_intento_pago): Wompi exige una referencia
 * distinta por intento.
 */
export async function abrirPagoWompi(
  token: string
): Promise<{ ok: true } | { ok: false; error: string }> {
  let checkout: unknown;
  try {
    const res = await fetch("/api/pagos/iniciar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    const datos = (await res.json().catch(() => ({}))) as { checkout?: unknown; error?: string };
    if (!res.ok || !datos.checkout) {
      return { ok: false, error: datos.error || "No pudimos preparar el pago. Intenta de nuevo." };
    }
    checkout = datos.checkout;
  } catch {
    return { ok: false, error: "No pudimos conectarnos. Revisa tu internet e intenta de nuevo." };
  }

  let Widget: ConstructorWidget;
  try {
    Widget = await cargarWidget();
  } catch {
    return {
      ok: false,
      error:
        "No se pudo abrir la ventana de pago. Revisa tu internet o desactiva el bloqueador de anuncios e intenta de nuevo.",
    };
  }

  new Widget(checkout).open((resultado) => {
    const id = resultado?.transaction?.id;
    if (id) window.location.href = urlResultadoPago(token, id);
  });
  return { ok: true };
}
