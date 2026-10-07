// Los correos de cambio de estado: pago confirmado, enviado y entregado.
//
// Funciones puras, sin red ni secretos, igual que correo-pedido.ts, y con el mismo marco
// (envolverCorreo) para que los cuatro correos se vean como de la misma casa. Quién los manda
// y cómo se anotan vive en src/lib/correo.ts.
//
// QUÉ NO LLEVAN: ni el documento ni la dirección. El correo de confirmación ya le mostró la
// dirección al cliente para que la revise; repetirla en cada aviso solo agrega superficie
// si el correo estaba mal escrito y el mensaje le llega a otra persona.

import { whatsappUrl } from "./whatsapp.js";
import {
  C,
  MONO,
  SANS,
  SERIF,
  envolverCorreo,
  esc,
  primerNombre,
  type CorreoArmado,
} from "./correo-pedido";

/** Los tres avisos que existen. Es el mismo texto que guarda order_notifications.tipo. */
export const TIPOS_AVISO = ["aprobado", "enviado", "entregado"] as const;
export type TipoAviso = (typeof TIPOS_AVISO)[number];

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

function cajaDatos(filas: { etiqueta: string; valor: string; mono?: boolean }[]): string {
  const celdas = filas
    .map(
      (f, i) => `
                    <div style="font-family:${MONO};font-size:10px;letter-spacing:2px;color:${C.draftText};${i ? "margin-top:14px;" : ""}">${esc(f.etiqueta)}</div>
                    <div style="font-family:${f.mono ? MONO : SANS};font-size:${f.mono ? "22px" : "15px"};${f.mono ? "letter-spacing:2px;" : ""}color:${C.ink};margin-top:6px;">${esc(f.valor)}</div>`
    )
    .join("");
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${C.draftBg};border:1px solid ${C.draftBorder};">
                <tr>
                  <td style="padding:16px 20px;">${celdas}
                  </td>
                </tr>
              </table>`;
}

function boton(href: string, texto: string, principal: boolean): string {
  return principal
    ? `
                <tr>
                  <td align="center" style="background:${C.ink};">
                    <a href="${esc(href)}" style="display:block;padding:15px;font-family:${SANS};font-size:14px;letter-spacing:0.5px;color:${C.cream};text-decoration:none;">${esc(texto)}</a>
                  </td>
                </tr>`
    : `
                <tr>
                  <td align="center" style="border:1px solid ${C.ink};">
                    <a href="${esc(href)}" style="display:block;padding:14px;font-family:${SANS};font-size:14px;letter-spacing:0.5px;color:${C.ink};text-decoration:none;">${esc(texto)}</a>
                  </td>
                </tr>`;
}

/** Los botones van en filas separadas por un espacio: Outlook ignora el margin entre tablas. */
function botones(lista: { href: string; texto: string; principal: boolean }[]): string {
  const filas = lista
    .map((b) => boton(b.href, b.texto, b.principal))
    .join(`
                <tr><td style="height:10px;font-size:0;line-height:0;">&nbsp;</td></tr>`);
  return `
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-top:24px;">${filas}
              </table>`;
}

interface Contenido {
  asunto: string;
  bandeja: string;
  /** La etiqueta pequeña sobre el título, en mayúsculas. */
  etiqueta: string;
  titulo: string;
  /** Párrafos de texto plano; el HTML y el texto salen de la misma lista. */
  parrafos: string[];
  /** Filas de la caja destacada. */
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
      caja: [{ etiqueta: "TU NÚMERO DE PEDIDO", valor: p.order_number, mono: true }],
      botones: [{ ...verEstado, principal: true }],
      nota: null,
    };
  }

  if (tipo === "enviado") {
    const filas: Contenido["caja"] = [
      { etiqueta: "TU NÚMERO DE PEDIDO", valor: p.order_number, mono: true },
    ];
    if (p.carrier) filas.push({ etiqueta: "TRANSPORTADORA", valor: p.carrier });
    if (p.tracking_number) {
      filas.push({ etiqueta: "NÚMERO DE GUÍA", valor: p.tracking_number, mono: true });
    }
    const fecha = p.estimated_date ? fechaLarga(p.estimated_date) : null;
    if (fecha) filas.push({ etiqueta: "ENTREGA ESTIMADA", valor: fecha });

    // El botón NO lleva directo al rastreador de la transportadora: su página no permite abrirla
    // con la guía puesta (se probaron las formas de enlace y ninguna carga), así que el cliente
    // caería en un campo vacío. Lleva a la página del pedido, que muestra la guía y la copia al
    // pulsar "Copiar guía y rastrear envío" (ver PedidoVista.astro).
    const lista: Contenido["botones"] = [
      {
        href: p.seguimiento,
        texto: p.tracking_number ? "Rastrear mi envío" : "Ver el estado de mi pedido",
        principal: true,
      },
    ];

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
      caja: filas,
      botones: lista,
      nota: p.tracking_number
        ? "En esa página copias tu guía con un toque y abres el rastreador de la transportadora."
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
    caja: [{ etiqueta: "TU NÚMERO DE PEDIDO", valor: p.order_number, mono: true }],
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
  const c = contenidoDe(tipo, p);
  const ayuda = puedeResponder
    ? "Si tienes dudas, responde a este correo o escríbenos por WhatsApp."
    : "Si tienes dudas, escríbenos por WhatsApp.";

  const parrafos = c.parrafos
    .map(
      (t, i) => `
              <p style="margin:0 0 ${i === c.parrafos.length - 1 ? "24" : "12"}px;font-family:${SANS};font-size:14px;line-height:1.6;color:${C.inkSoft};">
                ${esc(t)}
              </p>`
    )
    .join("");

  const contenido = `              <p style="margin:0 0 8px;font-family:${MONO};font-size:11px;letter-spacing:2px;color:#B68234;">${esc(c.etiqueta)}</p>
              <h1 style="margin:0 0 8px;font-family:${SERIF};font-size:28px;line-height:1.15;font-weight:bold;color:${C.ink};">${esc(c.titulo)}</h1>${parrafos}
${cajaDatos(c.caja)}
${botones(c.botones)}
              <p style="margin:20px 0 28px;font-family:${SANS};font-size:12px;line-height:1.55;color:${C.inkSoft};">
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
