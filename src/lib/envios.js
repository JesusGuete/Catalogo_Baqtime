// Cuánto cuesta y cuánto tarda el envío, según el municipio.
//
// EL ÚNICO LUGAR QUE SABE CALCULAR UN ENVÍO. Lo usan el carrito, el checkout (para mostrarlo)
// y /api/pedidos (para cobrarlo). El servidor recalcula con esta misma función, así que el
// navegador nunca decide cuánto se cobra.
//
// Las tarifas son las cotizaciones de Inter Rapidísimo desde Barranquilla que entregó el dueño
// (docs/Envios-cotizaciones.xlsx; reglas en docs/Plan-envios-baqtime.pdf):
//   * Municipio cotizado: su precio y su tiempo de tránsito.
//   * Municipio no cotizado: el de la ciudad base de su departamento + $5.000 y +1 a 2 días.
//     En Atlántico eso aplica a todo lo que no sea el área metropolitana.
//   * Cada bolso adicional al primero: +$4.000.
//   * Tiempo: base de 2 a 4 días hábiles desde que se aprueba el pago (producción + envío),
//     más los días de tránsito de la ciudad.
//
// La lista de municipios (src/data/municipios.json) sale del paquete colombia-cities (MIT),
// que replica la DIVIPOLA del DANE. Para cambiar un precio, se cambia acá.

import MUNICIPIOS from "../data/municipios.json";

export const RECARGO_MUNICIPIO_CERCANO = 5000;
export const RECARGO_BOLSO_ADICIONAL = 4000;
const DIAS_BASE = [2, 4];
const DIAS_EXTRA_CERCANO = [1, 2];

/** Clave sin tildes ni mayúsculas: "Medellín" y "medellin" son el mismo municipio. */
function clave(texto) {
  return String(texto ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

// [departamento, municipio, precio, días de tránsito]. 0 días = tiempo base.
const COTIZADOS = [
  ["Atlántico", "Barranquilla", 10000, 0],
  ["Atlántico", "Soledad", 10000, 0],
  ["Atlántico", "Puerto Colombia", 10000, 0],
  ["Atlántico", "Galapa", 10000, 0],
  ["Atlántico", "Malambo", 10000, 1],
  ["Bolívar", "Cartagena", 10000, 1],
  ["Bolívar", "Turbaco", 15000, 2],
  ["Bolívar", "Arjona", 15000, 2],
  ["Bolívar", "Magangué", 15000, 5],
  ["Bolívar", "Carmen de Bolívar", 23000, 5],
  ["Bolívar", "Mompós", 23000, 4],
  ["Magdalena", "Santa Marta", 10000, 1],
  ["Cesar", "Valledupar", 15000, 2],
  ["La Guajira", "Riohacha", 15000, 2],
  ["Sucre", "Sincelejo", 15000, 2],
  ["Córdoba", "Montería", 15000, 2],
  ["Santander", "Bucaramanga", 20000, 4],
  ["Santander", "Barrancabermeja", 23000, 4],
  ["Antioquia", "Medellín", 20000, 4],
  ["Antioquia", "Itagüí", 20000, 4],
  ["Antioquia", "Envigado", 20000, 4],
  ["Antioquia", "Bello", 20000, 4],
  ["Antioquia", "Sabaneta", 20000, 4],
  ["Antioquia", "Rionegro", 20000, 4],
  ["Bogotá D.C.", "Bogotá D.C.", 20000, 2],
  ["Valle del Cauca", "Cali", 20000, 4],
  ["Valle del Cauca", "Buenaventura", 20000, 4],
  ["Valle del Cauca", "Palmira", 20000, 4],
  ["Norte de Santander", "Cúcuta", 20000, 5],
  ["Risaralda", "Pereira", 20000, 4],
  ["Caldas", "Manizales", 20000, 4],
  ["Quindío", "Armenia", 20000, 4],
  ["Tolima", "Ibagué", 20000, 4],
  ["Meta", "Villavicencio", 20000, 4],
  ["Huila", "Neiva", 20000, 4],
  ["Cauca", "Popayán", 20000, 4],
  ["Nariño", "Pasto", 20000, 5],
  ["Boyacá", "Tunja", 20000, 4],
  ["Chocó", "Quibdó", 23000, 5],
  ["Caquetá", "Florencia", 20000, 4],
  ["Putumayo", "Mocoa", 20000, 4],
  ["Casanare", "Yopal", 20000, 4],
  ["Arauca", "Arauca", 20000, 5],
  ["Amazonas", "Leticia", 35000, 6],
  ["Guainía", "Inírida", 35000, 8],
  ["Guaviare", "San José del Guaviare", 23000, 4],
  ["Vaupés", "Mitú", 35000, 11],
  ["Vichada", "Puerto Carreño", 35000, 11],
  ["San Andrés y Providencia", "San Andrés", 35000, 8],
];

// La ciudad cuyo precio usan los municipios no cotizados de cada departamento.
const CIUDAD_BASE = {
  "Atlántico": "Barranquilla",
  "Bolívar": "Cartagena",
  "Magdalena": "Santa Marta",
  "Cesar": "Valledupar",
  "La Guajira": "Riohacha",
  "Sucre": "Sincelejo",
  "Córdoba": "Montería",
  "Santander": "Bucaramanga",
  "Antioquia": "Medellín",
  "Bogotá D.C.": "Bogotá D.C.",
  "Cundinamarca": "Bogotá D.C.",
  "Valle del Cauca": "Cali",
  "Norte de Santander": "Cúcuta",
  "Risaralda": "Pereira",
  "Caldas": "Manizales",
  "Quindío": "Armenia",
  "Tolima": "Ibagué",
  "Meta": "Villavicencio",
  "Huila": "Neiva",
  "Cauca": "Popayán",
  "Nariño": "Pasto",
  "Boyacá": "Tunja",
  "Chocó": "Quibdó",
  "Caquetá": "Florencia",
  "Putumayo": "Mocoa",
  "Casanare": "Yopal",
  "Arauca": "Arauca",
  "Amazonas": "Leticia",
  "Guainía": "Inírida",
  "Guaviare": "San José del Guaviare",
  "Vaupés": "Mitú",
  "Vichada": "Puerto Carreño",
  "San Andrés y Providencia": "San Andrés",
};

const tarifas = new Map(
  COTIZADOS.map(([dep, mun, precio, dias]) => [`${clave(dep)}|${clave(mun)}`, { mun, precio, dias }])
);
// Cundinamarca no tiene ciudad cotizada propia: usa la de Bogotá.
const tarifaDe = (dep, mun) =>
  tarifas.get(`${clave(dep)}|${clave(mun)}`) ??
  (dep === "Cundinamarca" ? tarifas.get(`${clave("Bogotá D.C.")}|${clave(mun)}`) : undefined);

/** Los departamentos, en orden alfabético. */
export const DEPARTAMENTOS = Object.keys(MUNICIPIOS);

/** Los municipios de un departamento, o [] si el departamento no existe. */
export function municipiosDe(departamento) {
  return MUNICIPIOS[departamento] ?? [];
}

/** "Medellín, Antioquia" — lo que se guarda en orders.ship_city. Bogotá no repite. */
export function nombreDestino(departamento, municipio) {
  return departamento === municipio ? municipio : `${municipio}, ${departamento}`;
}

/**
 * El envío a un municipio para un pedido de `bolsos` artículos.
 *
 * Devuelve `null` si el municipio no existe en ese departamento: el que llama decide qué
 * mostrar (el checkout pide elegir; el servidor rechaza el pedido).
 *
 * @returns {{ precio: number, diasMin: number, diasMax: number, cercano: boolean, base: string } | null}
 */
export function calcularEnvio(departamento, municipio, bolsos = 1) {
  const lista = municipiosDe(departamento);
  const real = lista.find((m) => clave(m) === clave(municipio));
  if (!real) return null;

  const adicionales = RECARGO_BOLSO_ADICIONAL * Math.max(0, (bolsos | 0) - 1);
  const propio = tarifaDe(departamento, real);
  if (propio) {
    return {
      precio: propio.precio + adicionales,
      diasMin: DIAS_BASE[0] + propio.dias,
      diasMax: DIAS_BASE[1] + propio.dias,
      cercano: false,
      base: real,
    };
  }

  const ciudadBase = CIUDAD_BASE[departamento];
  const base = ciudadBase && tarifaDe(departamento, ciudadBase);
  if (!base) return null;
  return {
    precio: base.precio + RECARGO_MUNICIPIO_CERCANO + adicionales,
    diasMin: DIAS_BASE[0] + base.dias + DIAS_EXTRA_CERCANO[0],
    diasMax: DIAS_BASE[1] + base.dias + DIAS_EXTRA_CERCANO[1],
    cercano: true,
    base: base.mun,
  };
}

/** "6 a 8 días hábiles". */
export function textoEntrega(envio) {
  return `${envio.diasMin} a ${envio.diasMax} días hábiles`;
}

/** El envío más barato, para mostrar "desde $10.000" antes de saber el destino. */
export const ENVIO_DESDE = Math.min(...COTIZADOS.map((c) => c[2]));
