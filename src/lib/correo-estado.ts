// Los correos de cambio de estado: pago confirmado, enviado y entregado.
//
// Funciones puras, sin red ni secretos, igual que correo-pedido.ts, y con el mismo marco y las
// mismas piezas (número de pedido, progreso, botones) para que los correos se vean como de la
// misma casa. Quién los manda y cómo se anotan vive en src/lib/correo.ts.
//
// QUÉ NO LLEVAN: ni el documento ni la dirección. El correo de confirmación ya le mostró la
// dirección al cliente para que la revise; repetirla en cada aviso solo agrega superficie
// si el correo estaba mal escrito y el mensaje le llega a otra persona.

import { urlRastreo } from "./tracking";
import { whatsappUrl } from "./whatsapp.js";
import {
  C,
  MONO,
  SANS,
  bloqueNumeroPedido,
  botonesCorreo,
  cajaDatos,
  envolverCorreo,
  esc,
  primerNombre,
  progresoPedido,
  type CorreoArmado,
  type PasoPedido,
} from "./correo-pedido";

/** Los tres avisos de cambio de estado. Es el mismo texto que guarda order_notifications.tipo. */
export const TIPOS_AVISO = ["aprobado", "enviado", "entregado"] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

/**
 * Lo que se guarda en order_notifications.tipo: los tres avisos de estado más el recordatorio
 * de pago, que NO es un aviso de estado (no lo manda el panel, lo manda la tarea programada).
 */
export type TipoRegistro = TipoAviso | "recordatorio";

export function esTipoAviso(valor: unknown): valor is TipoAviso {
  return typeof valor === "string" && (TIPOS_AVISO as readonly string[]).includes(valor);
}

export interface DatosCorreoEstado {
  order_number: string;
  customer_name: string;
  /** Enlace privado de seguimiento, absoluto: el correo se abre lejos de la tienda. */
  seguimiento: string;
  carrier: string | null;
  tracking_number: string | null;
  /** `date` de Postgres: "2026-10-20", sin hora. */
  estimated_date: string | null;
}

const MESES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

/**
 * "2026-10-20" → "20 de octubre de 2026". A mano y no con toLocaleDateString: no depende de
 * qué datos de idioma traiga el runtime, y no pasa por new Date(), que leería la fecha como
 * medianoche UTC y en Colombia (UTC-5) mostraría el día anterior.
 */
export function fechaLarga(iso: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!m) return null;
  const mes = MESES[Number(m[2]) - 1];
  if (!mes) return null;
  return `${Number(m[3])} de ${mes} de ${m[1]}`;
}

export interface Contenido {
  asunto: string;
  bandeja: string;
  /** La etiqueta pequeña sobre el título, en mayúsculas. */
  etiqueta: string;
  titulo: string;
  /** Párrafos de texto plano; el HTML y el texto salen de la misma lista. */
  parrafos: string[];
  /** El número de pedido: va en el bloque grande, no entre los demás datos. */
  numero: string;
  /** Dónde va el pedido, para la barra de progreso. */
  paso: PasoPedido;
  /** Datos sueltos de la tarjeta (transportadora, guía…). Puede estar vacía. */
  caja: { etiqueta: string; valor: string; mono?: boolean }[];
  botones: { href: string; texto: string; principal: boolean }[];
  /** Nota pequeña bajo los botones, o null. */
  nota: string | null;
}

function contenidoDe(tipo: TipoAviso, p: DatosCorreoEstado): Contenido {
  const nombre = primerNombre(p.customer_name);
  const verEstado = { href: p.seguimiento, texto: "Ver el estado de mi pedido", principal: false };

  if (tipo === "aprobado") {
    return {
      asunto: `Confirmamos el pago de tu pedido ${p.order_number}`,
      bandeja: `Pedido ${p.order_number}: recibimos tu pago y entró a producción.`,
      etiqueta: "PAGO CONFIRMADO",
      titulo: `¡Gracias, ${nombre}!`,
      parrafos: [
        "Recibimos tu pago. Tu pedido entró a producción y te avisaremos por este medio cuando salga el envío.",
      ],
      numero: p.order_number,
      paso: 3,
      caja: [],
      botones: [{ ...verEstado, principal: true }],
      nota: null,
    };
  }

  if (tipo === "enviado") {
    const filas: Contenido["caja"] = [];
    if (p.carrier) filas.push({ etiqueta: "TRANSPORTADORA", valor: p.carrier });
    if (p.tracking_number) {
      filas.push({ etiqueta: "NÚMERO DE GUÍA", valor: p.tracking_number, mono: true });
    }
    const fecha = p.estimated_date ? fechaLarga(p.estimated_date) : null;
    if (fecha) filas.push({ etiqueta: "ENTREGA ESTIMADA", valor: fecha });

    const rastreo = urlRastreo(p.carrier, p.tracking_number);
    const lista: Contenido["botones"] = [];
    if (rastreo) lista.push({ href: rastreo, texto: "Rastrear mi envío", principal: true });
    lista.push({ ...verEstado, principal: !rastreo });

    return {
      asunto: `Tu pedido ${p.order_number} va en camino`,
      bandeja: `Pedido ${p.order_number}: ya salió${p.tracking_number ? `. Guía ${p.tracking_number}` : ""}.`,
      etiqueta: "PEDIDO ENVIADO",
      titulo: `¡Tu pedido va en camino, ${nombre}!`,
      parrafos: [
        p.tracking_number
          ? "Tu pedido ya salió. Con el número de guía puedes seguir el envío."
          : "Tu pedido ya salió. Puedes ver cómo va desde el enlace de abajo.",
      ],
      numero: p.order_number,
      paso: 4,
      caja: filas,
      botones: lista,
      nota: rastreo
        ? "El rastreador de la transportadora se abre sin la guía escrita: copia el número de arriba y pégalo ahí."
        : null,
    };
  }

  return {
    asunto: `Tu pedido ${p.order_number} fue entregado`,
    bandeja: `Pedido ${p.order_number}: entregado. Gracias por comprar en Baqtime.`,
    etiqueta: "PEDIDO ENTREGADO",
    titulo: `¡Que lo disfrutes, ${nombre}!`,
    parrafos: [
      "Marcamos tu pedido como entregado. Gracias por comprar en Baqtime.",
      "Si algo no llegó como esperabas, escríbenos y lo resolvemos.",
    ],
    numero: p.order_number,
    paso: 5,
    caja: [],
    botones: [
      {
        href: whatsappUrl(`Hola, tengo una consulta sobre mi pedido ${p.order_number}`),
        texto: "Escribirnos por WhatsApp",
        principal: true,
      },
      verEstado,
    ],
    nota: null,
  };
}

/**
 * @param puedeResponder Si hay una dirección de respuesta configurada. Sin ella, decirle
 *   al cliente "responde a este correo" lo mandaría a escribirle a un buzón que nadie lee.
 */
export function armarCorreoEstado(
  tipo: TipoAviso,
  p: DatosCorreoEstado,
  puedeResponder: boolean
): CorreoArmado {
  return armarDesdeContenido(contenidoDe(tipo, p), puedeResponder);
}

/**
 * Del contenido ya decidido al correo: HTML, texto plano y asunto. Lo comparten los avisos de
 * estado y el recordatorio de pago, para que se vean exactamente como de la misma casa.
 */
export function armarDesdeContenido(c: Contenido, puedeResponder: boolean): CorreoArmado {
  const ayuda = puedeResponder
    ? "Si tienes dudas, responde a este correo o escríbenos por WhatsApp."
    : "Si tienes dudas, escríbenos por WhatsApp.";

  const parrafos = c.parrafos
    .map(
      (t, i) => `
              <p style="margin:${i === 0 ? "0" : "10px"} 0 0;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                ${esc(t)}
              </p>`
    )
    .join("");

  const contenido = `              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:${C.mocha};">${esc(c.etiqueta)}</p>
              <h1 style="margin:0 0 8px;font-family:${SANS};font-size:26px;line-height:1.2;font-weight:bold;color:${C.ink};">${esc(c.titulo)}</h1>${parrafos}
${bloqueNumeroPedido(c.numero)}
${progresoPedido(c.paso)}
${cajaDatos(c.caja)}
${botonesCorreo(c.botones)}
              <p style="margin:20px 0 28px;font-family:${SANS};font-size:12px;line-height:1.55;color:${C.inkSoft};text-align:center;">
                ${c.nota ? esc(c.nota) : "&nbsp;"}
              </p>`;

  const html = envolverCorreo({
    titulo: c.asunto,
    bandeja: c.bandeja,
    contenido,
    pie: `Recibes este correo porque hiciste un pedido en baqtime.store. ${ayuda}`,
  });

  const texto = [
    c.titulo,
    ``,
    ...c.parrafos.flatMap((t) => [t, ``]),
    `TU NÚMERO DE PEDIDO: ${c.numero}`,
    ...c.caja.map((f) => `${f.etiqueta}: ${f.valor}`),
    ``,
    ...c.botones.map((b) => `${b.texto}: ${b.href}`),
    ...(c.nota ? [``, c.nota] : []),
    ``,
    `--`,
    `Recibes este correo porque hiciste un pedido en baqtime.store. ${ayuda}`,
  ].join("\n");

  return { asunto: c.asunto, html, texto };
}
