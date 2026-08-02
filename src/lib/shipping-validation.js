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

export function validateShipping({ name, city, address, phone, doc }) {
  const errors = {};
  if (!name.trim() || !NAME_CITY_REGEX.test(name.trim())) {
    errors.name = "Por favor ingresa un nombre válido (solo letras y espacios).";
  }
  if (!city.trim() || !NAME_CITY_REGEX.test(city.trim())) {
    errors.city = "Por favor ingresa una ciudad válida (solo letras y espacios).";
  }
  if (!/^[0-9]{10}$/.test(phone.trim())) {
    errors.phone = "Por favor, ingresa un número de teléfono válido de 10 dígitos.";
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
