// Portado desde assets/js/site/shipping-form.js.
// Mismas reglas y MISMOS textos de error que hoy; solo cambia que en vez de
// escribir en el DOM devuelve un objeto de errores, para que React lo pinte.
export const NAME_CITY_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]*$/;

// Filtros de tipeo (equivalentes a filterDigitsInput / filterNameCityInput).
export function onlyDigits(value, maxLen) {
  const v = value.replace(/[^0-9]/g, "");
  return maxLen ? v.slice(0, maxLen) : v;
}

export function onlyLetters(value) {
  return value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g, "");
}

/**
 * ¿El envío es local (Barranquilla)?
 *
 * Fuera de la ciudad el paquete viaja con transportadora y hay que presentar documento
 * para reclamarlo; dentro, la entrega es local y pedirlo es fricción sin sentido. Por eso
 * el documento es obligatorio en todas partes MENOS acá.
 *
 * Se compara por CONTENIDO y no por igualdad porque la gente escribe el campo libre:
 * "barranquilla", "BARRANQUILLA" y "Barranquilla Atlántico" cuentan las tres. No hace
 * falta normalizar tildes: la palabra en sí no lleva ninguna.
 *
 * Esta misma regla está replicada como CHECK en la tabla `orders` (010_orders.sql). No es
 * duplicación por descuido: el navegador se puede saltear, y la base es lo que la vuelve
 * inviolable. Si cambia una, hay que cambiar la otra — el comentario del SQL lo repite.
 *
 * @param {string} city
 */
export function esEnvioLocal(city) {
  return (city || "").toLowerCase().includes("barranquilla");
}

// --- Correo -----------------------------------------------------------------
//
// La MISMA forma que exige el CHECK de 019_correo_cliente.sql: algo@algo.dominio, sin
// espacios, con un dominio final de al menos dos letras. No intenta más que eso — la única
// prueba real de que un correo existe es que llegue.
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_MAX = 254;

/** Como se guarda: sin espacios en los bordes y en minúsculas. create_order() hace lo mismo. */
export function normalizarCorreo(value) {
  return (value || "").trim().toLowerCase();
}

/** ¿Tiene forma de correo? La usan el formulario, el servidor y el panel. */
export function correoValido(value) {
  const correo = normalizarCorreo(value);
  return EMAIL_REGEX.test(correo) && correo.length <= EMAIL_MAX;
}

/** Mientras se escribe: un correo nunca lleva espacios, así que no se dejan entrar. */
export function filtrarCorreo(value) {
  return value.replace(/\s/g, "").slice(0, EMAIL_MAX);
}

// Los dominios que usa casi toda la clientela. Si lo escrito se parece a uno pero no es
// igual, casi seguro es un error de dedo: "gmial.com", "hotmial.com", "gmail.co".
const DOMINIOS_COMUNES = [
  "gmail.com",
  "hotmail.com",
  "outlook.com",
  "yahoo.com",
  "icloud.com",
  "live.com",
  "hotmail.es",
  "outlook.es",
  "yahoo.es",
];

// Dominios REALES que quedan a una o dos letras de uno común. Sin esta lista, a quien usa
// "ymail.com" (de Yahoo) se le sugeriría "gmail.com", que sería empujarlo a equivocarse.
const DOMINIOS_VALIDOS = new Set([
  ...DOMINIOS_COMUNES,
  "mail.com",
  "email.com",
  "ymail.com",
  "me.com",
  "msn.com",
  "aol.com",
]);

/** Distancia de edición entre dos textos cortos (cuántas letras hay que cambiar). */
function distancia(a, b) {
  const fila = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let diagonal = fila[0];
    fila[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const arriba = fila[j];
      fila[j] = Math.min(fila[j] + 1, fila[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1));
      diagonal = arriba;
    }
  }
  return fila[b.length];
}

/**
 * Si el dominio parece un error de dedo de uno común, devuelve el correo corregido; si
 * no, `null`. Es una SUGERENCIA y nunca bloquea: el cliente puede tener un dominio raro
 * que sí existe, y la última palabra es suya.
 *
 * @param {string} value
 * @returns {string | null}
 */
export function sugerirCorreo(value) {
  const correo = normalizarCorreo(value);
  const arroba = correo.lastIndexOf("@");
  if (arroba < 1) return null;
  const dominio = correo.slice(arroba + 1);
  if (!dominio || DOMINIOS_VALIDOS.has(dominio)) return null;

  let mejor = null;
  let mejorDistancia = 3; // más de dos letras de diferencia ya no es un error de dedo
  for (const comun of DOMINIOS_COMUNES) {
    const d = distancia(dominio, comun);
    if (d < mejorDistancia) {
      mejor = comun;
      mejorDistancia = d;
    }
  }
  return mejor ? `${correo.slice(0, arroba)}@${mejor}` : null;
}

import { calcularEnvio, nombreDestino } from "./envios.js";

/**
 * El destino ya no es texto libre: departamento + municipio de la lista del DANE. `city`
 * se arma de ahí ("Medellín, Antioquia") y es lo que se guarda y lo que mira la regla del
 * documento.
 */
export function validateShipping({ name, departamento = "", municipio = "", address, phone, email = "", doc }) {
  const city = municipio ? nombreDestino(departamento, municipio) : "";
  const errors = {};
  if (!name.trim() || !NAME_CITY_REGEX.test(name.trim())) {
    errors.name = "Por favor ingresa un nombre válido (solo letras y espacios).";
  }
  if (!departamento) {
    errors.departamento = "Elige el departamento de entrega.";
  } else if (!calcularEnvio(departamento, municipio)) {
    errors.municipio = "Elige el municipio de entrega.";
  }
  if (!/^[0-9]{10}$/.test(phone.trim())) {
    errors.phone = "Por favor, ingresa un número de teléfono válido de 10 dígitos.";
  }
  const correo = normalizarCorreo(email);
  if (!correo) {
    errors.email = "Por favor ingresa tu correo electrónico para recibir el resumen de tu pedido.";
  } else if (!correoValido(correo)) {
    errors.email =
      "Por favor ingresa un correo electrónico válido (por ejemplo, nombre@gmail.com).";
  }
  if (doc.trim() && (!/^[0-9]+$/.test(doc.trim()) || doc.trim().length > 20)) {
    errors.doc = "El número de identificación debe contener solo números (máx. 20 dígitos).";
  } else if (!doc.trim() && !esEnvioLocal(city)) {
    // El aviso bajo el campo ya decía "solo es necesario para envíos fuera de
    // Barranquilla" desde antes; lo que faltaba era que alguien lo hiciera cumplir.
    errors.doc = "El documento es obligatorio para envíos fuera de Barranquilla.";
  }
  if (!address.trim()) {
    errors.address = "Por favor ingresa tu dirección exacta para continuar.";
  }
  return errors;
}
