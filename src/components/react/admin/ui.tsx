// Piezas visuales compartidas del panel.
//
// Son presentacionales puras: no hacen fetch, no conocen Supabase, no tienen estado
// propio más allá de lo estrictamente visual. Reciben datos y devuelven marcado. Toda
// la lógica vive en los repositorios y en las vistas contenedoras.
//
// Existen para que "un error se ve así" y "una etiqueta de campo se ve así" estén
// definidos una sola vez. Cuatro pantallas repitiendo la misma estructura de campo
// es exactamente cómo empiezan a divergir.

import type { ReactNode, ChangeEvent } from "react";
import type { AdminError } from "../../../lib/supabase/errors";

// ============================================================================
// Texto y estructura
// ============================================================================

export function Mono({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <span className={`adm-mono ${className}`.trim()}>{children}</span>;
}

// ============================================================================
// Íconos
// ============================================================================

/**
 * Ícono de agarre para reordenar (tres líneas, como Spotify).
 *
 * Antes era el carácter "⠿" (braille de 8 puntos) puesto como texto. Se
 * cambia a SVG por dos razones: se ve como se busca, y deja de depender de
 * que el dispositivo tenga esa fuente — braille no es un ícono universal,
 * cada sistema lo dibuja distinto y algunos no lo traen.
 */
export function IconoAgarre({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="16"
      height="16"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2 4h12M2 8h12M2 12h12"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Papelera. Se usa para borrar un pedido desde la lista, sin abrirlo. */
export function IconoPapelera({ className = "" }: { className?: string }) {
  return (
    <svg
      className={className}
      width="15"
      height="15"
      viewBox="0 0 16 16"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 4h11M6.5 4V2.75h3V4M4 4l.6 9.2h6.8L12 4M6.5 6.5v4.5M9.5 6.5v4.5"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function SectionHead({ numero, titulo }: { numero?: string; titulo: string }) {
  return (
    <div className="adm-sechead">
      {numero && <span className="adm-sechead-num">{numero}</span>}
      <h3 className="adm-sechead-title">{titulo}</h3>
      <span className="adm-sechead-rule" />
    </div>
  );
}

// ============================================================================
// Avisos y errores
// ============================================================================

export type TonoAviso = "info" | "borrador" | "error" | "exito";

export function Aviso({
  tono = "info",
  titulo,
  children,
  meta,
}: {
  tono?: TonoAviso;
  titulo?: string;
  children?: ReactNode;
  /** Línea en mono debajo: el código crudo, la columna de la base, lo que sea. */
  meta?: string;
}) {
  return (
    <div className={`adm-aviso adm-aviso--${tono}`}>
      <span className="adm-aviso-bar" />
      <div className="adm-aviso-txt">
        {titulo && <p className="adm-aviso-titulo">{titulo}</p>}
        {children && <div className="adm-aviso-cuerpo">{children}</div>}
        {meta && <p className="adm-mono adm-aviso-meta">{meta}</p>}
      </div>
    </div>
  );
}

/**
 * Muestra un AdminError con su código crudo debajo.
 *
 * El código se muestra a propósito: cuando algo falla, "23505" es lo único que le
 * sirve a quien tenga que ayudar por WhatsApp. El mensaje en castellano es para el
 * dueño; el código, para quien lo asista.
 */
export function ErrorAviso({ error }: { error: AdminError | null }) {
  if (!error) return null;
  return <Aviso tono="error" titulo={error.message} meta={error.etiqueta} />;
}

// ============================================================================
// Campos de formulario
// ============================================================================

interface CampoProps {
  etiqueta: string;
  /** Aclaración corta que va en la misma línea de la etiqueta, en gris. */
  ayuda?: string;
  error?: string;
  children: ReactNode;
}

export function Campo({ etiqueta, ayuda, error, children }: CampoProps) {
  return (
    <label className="adm-campo">
      <span className="adm-mono adm-campo-label">
        {etiqueta}
        {ayuda && <span className="adm-campo-ayuda"> · {ayuda}</span>}
      </span>
      {children}
      {error && <span className="adm-campo-error">{error}</span>}
    </label>
  );
}

interface TextoProps {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  disabled?: boolean;
  invalido?: boolean;
  mono?: boolean;
}

export function Texto({ value, onChange, placeholder, disabled, invalido, mono }: TextoProps) {
  return (
    <input
      type="text"
      className={`adm-input ${mono ? "adm-mono" : ""} ${invalido ? "adm-input--mal" : ""}`.trim()}
      value={value}
      placeholder={placeholder}
      disabled={disabled}
      onChange={(e: ChangeEvent<HTMLInputElement>) => onChange(e.target.value)}
    />
  );
}

/**
 * Campo numérico entero.
 *
 * Devuelve `number | null` y no `number` a propósito: mientras el usuario borra para
 * escribir otra cosa, el campo queda vacío. Forzar un 0 en ese instante le pisa lo
 * que estaba escribiendo, y forzar NaN rompe la validación. `null` representa
 * "vacío" con honestidad y la validación lo rechaza como corresponde.
 */
export function Numero({
  value,
  onChange,
  disabled,
  invalido,
  prefijo,
}: {
  value: number | null;
  onChange: (v: number | null) => void;
  disabled?: boolean;
  invalido?: boolean;
  prefijo?: string;
}) {
  return (
    <div className={`adm-input adm-input--num ${invalido ? "adm-input--mal" : ""}`.trim()}>
      {prefijo && <span className="adm-mono adm-input-prefijo">{prefijo}</span>}
      <input
        type="number"
        step={1}
        className="adm-mono adm-input-raw"
        value={value ?? ""}
        disabled={disabled}
        onChange={(e) => {
          const t = e.target.value;
          onChange(t === "" ? null : Number.parseInt(t, 10));
        }}
      />
    </div>
  );
}

export function Selector<T extends string>({
  value,
  onChange,
  opciones,
  disabled,
  invalido,
}: {
  value: T;
  onChange: (v: T) => void;
  opciones: { value: T; label: string }[];
  disabled?: boolean;
  invalido?: boolean;
}) {
  return (
    <select
      className={`adm-input adm-select ${invalido ? "adm-input--mal" : ""}`.trim()}
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value as T)}
    >
      {opciones.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Campo de color: el selector nativo y el hex escribible, sincronizados. */
export function ColorHex({
  value,
  onChange,
  invalido,
}: {
  value: string;
  onChange: (v: string) => void;
  invalido?: boolean;
}) {
  // El input nativo `type=color` exige un #RRGGBB válido; si el texto está a medio
  // escribir se le pasa negro para que no tire warnings, sin tocar el valor real.
  const seguro = /^#[0-9A-Fa-f]{6}$/.test(value) ? value : "#000000";
  return (
    <div className={`adm-input adm-input--color ${invalido ? "adm-input--mal" : ""}`.trim()}>
      <input
        type="color"
        className="adm-swatch"
        value={seguro}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        aria-label="Elegir color"
      />
      <input
        type="text"
        className="adm-mono adm-input-raw"
        value={value}
        placeholder="#RRGGBB"
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

export function Interruptor({
  activo,
  onChange,
  titulo,
  detalle,
  disabled,
}: {
  activo: boolean;
  onChange: (v: boolean) => void;
  titulo: string;
  detalle?: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={activo}
      disabled={disabled}
      className="adm-toggle"
      onClick={() => onChange(!activo)}
    >
      <span className={`adm-toggle-track ${activo ? "is-on" : ""}`}>
        <span className="adm-toggle-knob" />
      </span>
      <span className="adm-toggle-txt">
        <span className="adm-toggle-titulo">{titulo}</span>
        {detalle && <span className="adm-mono adm-toggle-detalle">{detalle}</span>}
      </span>
    </button>
  );
}

// ============================================================================
// Botones y estados
// ============================================================================

export type VarianteBoton = "primario" | "secundario" | "peligro" | "acento";

export function Boton({
  children,
  onClick,
  variante = "secundario",
  disabled,
  cargando,
  type = "button",
  ancho,
}: {
  children: ReactNode;
  onClick?: () => void;
  variante?: VarianteBoton;
  disabled?: boolean;
  cargando?: boolean;
  type?: "button" | "submit";
  ancho?: boolean;
}) {
  return (
    <button
      type={type}
      className={`adm-btn adm-btn--${variante} ${ancho ? "adm-btn--ancho" : ""}`.trim()}
      onClick={onClick}
      // Deshabilitar mientras corre es lo que evita el doble guardado por doble clic,
      // que en el editor crearía dos productos con el mismo sort_order y devolvería
      // un 23505 desconcertante.
      disabled={disabled || cargando}
    >
      <span className="adm-mono">{cargando ? "GUARDANDO…" : children}</span>
    </button>
  );
}

export type EstadoPunto = "vivo" | "borrador" | "inactivo";

export function Punto({ estado, texto }: { estado: EstadoPunto; texto: string }) {
  return (
    <span className={`adm-punto adm-punto--${estado}`}>
      <span className="adm-punto-dot" />
      <span className="adm-mono">{texto}</span>
    </span>
  );
}

export function Etiqueta({
  children,
  tono = "neutro",
}: {
  children: ReactNode;
  tono?: "neutro" | "borrador" | "solido";
}) {
  return <span className={`adm-mono adm-tag adm-tag--${tono}`}>{children}</span>;
}

export function Cargando({ texto = "CARGANDO…" }: { texto?: string }) {
  return <p className="adm-mono adm-cargando">{texto}</p>;
}

export function Vacio({ titulo, children }: { titulo: string; children?: ReactNode }) {
  return (
    <div className="adm-vacio">
      <p className="adm-vacio-titulo">{titulo}</p>
      {children && <div className="adm-vacio-cuerpo">{children}</div>}
    </div>
  );
}

/** Formato de pesos consistente en todo el panel. */
export const dinero = (n: number): string => "$ " + n.toLocaleString("es-CO");
