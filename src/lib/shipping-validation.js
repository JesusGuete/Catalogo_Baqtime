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
  }
  if (!address.trim()) {
    errors.address = "Por favor ingresa tu dirección exacta para continuar.";
  }
  return errors;
}
