// Traducción única de los errores de Postgres, PostgREST y Storage a algo que el
// dueño de la tienda pueda entender.
//
// Está en un solo archivo por una razón concreta: los mismos códigos aparecen en
// productos, categorías, fotos y publicación. Si cada pantalla escribiera su propio
// mensaje, el día que la base cambie un constraint habría que tocar cuatro lugares
// y seguro se olvida uno.
//
// Los códigos y sus causas salen de docs/api-endpoints.md §7, verificados contra el
// proyecto real.

/** Dónde ocurrió el error. Cambia la traducción de los códigos ambiguos. */
export type ContextoError = "categories" | "products" | "photos" | "publish" | "pedidos" | "";

export interface AdminErrorOpts {
  code?: string | null;
  status?: number | null;
  detalle?: string | null;
  causa?: unknown;
}

/**
 * Error de dominio del panel. Lleva el código crudo además del mensaje traducido
 * para que la UI muestre las dos cosas, como en el diseño: el dueño lee "Ese orden
 * ya está usado" y debajo, en mono, `23505`.
 */
export class AdminError extends Error {
  readonly code: string | null;
  readonly status: number | null;
  readonly detalle: string | null;
  readonly causa: unknown;

  constructor(mensaje: string, opts: AdminErrorOpts = {}) {
    super(mensaje);
    this.name = "AdminError";
    this.code = opts.code ?? null;
    this.status = opts.status ?? null;
    this.detalle = opts.detalle ?? null;
    this.causa = opts.causa;
  }

  /** Etiqueta corta para la línea en mono debajo del mensaje. */
  get etiqueta(): string {
    return [this.status, this.code].filter(Boolean).join(" · ") || "ERROR";
  }

  /** `true` si conviene mandar al usuario a iniciar sesión de nuevo. */
  get esDeSesion(): boolean {
    return this.code === "NO_SESSION" || this.code === "42501" || this.status === 401;
  }
}

/** Respuesta de error de PostgREST. Todos los campos pueden faltar. */
interface CuerpoPostgrest {
  code?: string;
  message?: string;
  details?: string | null;
  hint?: string | null;
}

// Mensajes por código de Postgres. Algunos dependen de la tabla: `23505` en
// categorías es "posición repetida" y en productos es "orden repetido dentro de la
// categoría". Son cosas distintas para quien las lee.
const POR_CODIGO: Record<string, (ctx: ContextoError) => string> = {
  "42501": (ctx) =>
    ctx === "pedidos"
      ? // La base solo concede UPDATE sobre guía, transportadora, fecha estimada y nota.
        // Si aparece esto sobre un pedido, casi siempre es que algo intentó cambiar el
        // estado con un PATCH en vez de usar las funciones. Ver 010_orders.sql.
        "No se puede modificar eso directamente. El estado, el pago y la fecha de envío solo cambian con sus botones. Si el problema sigue, puede que la sesión haya expirado."
      : "No tienes permiso para esto. Puede que la sesión haya expirado o que tu usuario no sea administrador.",
  "23503": (ctx) =>
    ctx === "categories"
      ? "No se puede borrar la categoría porque todavía tiene productos. Muévelos o bórralos primero."
      : ctx === "pedidos"
        ? "Ese pedido ya no existe. Puede que se haya borrado desde otra pestaña."
        : "Estás apuntando a algo que no existe. Revisa la categoría del producto.",
  "23505": (ctx) =>
    ctx === "categories"
      ? "Ya hay otra categoría en esa posición. Las posiciones no se pueden repetir."
      : "Ya hay otro producto con ese orden en la misma categoría. El orden no se puede repetir.",
  "23514": () =>
    "Hay un dato con formato inválido. Revisa que el color sea #RRGGBB con los 6 dígitos y que el precio no sea negativo.",
  "55P03": () => "Hay otra publicación en curso. Espera unos segundos y vuelve a intentar.",
  P0001: () =>
    "El borrador está vacío y el catálogo publicado tiene productos. La base se niega a publicar eso para no borrarte todo. Para vaciar el catálogo a propósito, oculta cada producto y publica.",
  PGRST116: () => "Se esperaba un solo registro y vinieron cero o más de uno.",
  PGRST205: () => "Esa tabla no existe en la API. Puede ser un error de configuración del backend.",
};

// Storage responde con HTTP, no con códigos de Postgres.
const POR_STATUS_STORAGE: Record<number, string> = {
  403: "No tienes permiso para escribir en este bucket. Revisa que la sesión siga activa.",
  409: "Ya existe un archivo con ese nombre.",
  413: "La imagen pesa más de 5 MB. Redúcela antes de subirla.",
  415: "Ese tipo de archivo no está permitido. Solo WebP, JPG y PNG.",
};

/** Convierte una respuesta de error de PostgREST en un AdminError. */
export function desdeRest(
  res: Response,
  cuerpo: CuerpoPostgrest | string | null,
  contexto: ContextoError = ""
): AdminError {
  const datos: CuerpoPostgrest = typeof cuerpo === "object" && cuerpo !== null ? cuerpo : {};
  const code = datos.code ?? null;
  const traducir = code ? POR_CODIGO[code] : undefined;

  if (traducir) {
    return new AdminError(traducir(contexto), {
      code,
      status: res.status,
      detalle: datos.message ?? null,
    });
  }

  if (res.status === 401 || res.status === 403) {
    return new AdminError(POR_CODIGO["42501"]!(contexto), {
      code: code ?? "42501",
      status: res.status,
    });
  }

  return new AdminError(datos.message || `Error ${res.status} de Supabase.`, {
    code,
    status: res.status,
    detalle: typeof cuerpo === "string" ? cuerpo : datos.hint ?? null,
  });
}

/** Convierte un error de Storage (que responde distinto a PostgREST) en AdminError. */
export function desdeStorage(
  res: Response,
  cuerpo: { message?: string; error?: string } | null
): AdminError {
  const mensaje = POR_STATUS_STORAGE[res.status];
  return new AdminError(mensaje || cuerpo?.message || `Error ${res.status} al subir la imagen.`, {
    code: cuerpo?.error ?? null,
    status: res.status,
  });
}

/** Error de red: no hubo respuesta del servidor. Se distingue de un error de la base. */
export function desdeRed(causa: unknown): AdminError {
  return new AdminError("No se pudo conectar con el servidor. Revisa tu conexión.", {
    code: "NETWORK",
    causa,
  });
}

/**
 * Normaliza cualquier cosa capturada en un `catch` a un AdminError.
 * En TypeScript el valor de un `catch` es `unknown`, así que sin esto cada
 * componente tendría que hacer su propio `instanceof` antes de leer `.message`.
 */
export function comoAdminError(e: unknown): AdminError {
  if (e instanceof AdminError) return e;
  if (e instanceof Error) return new AdminError(e.message, { causa: e });
  return new AdminError("Ocurrió un error inesperado.", { causa: e });
}
