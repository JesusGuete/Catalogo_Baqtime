import { useState } from "react";
import type { Category, InitialsColor } from "../../../types/database";
import * as coloresRepo from "../../../lib/admin/initials-colors.repo";
import { useAccion } from "../../../lib/admin/useAdminData";
import {
  Aviso,
  Boton,
  Campo,
  Cargando,
  ColorHex,
  ErrorAviso,
  Texto,
  Vacio,
} from "./ui";

// La paleta de bordado. Es la pantalla que justifica 014_initials_colors.sql.
//
// Hasta 014 esta lista estaba escrita en el código y en DOS lugares con valores
// distintos: `src/lib/initials.js` (los 9 que pintaba la tienda) y el `COLORES_MARCA`
// de CategoriesView (5, con otros hex). El panel ofrecía colores que la tienda no tenía,
// y marcarlos en una categoría la dejaba sin ningún color de bordado disponible.
//
// Acá se edita la paleta entera. Qué colores usa CADA categoría se sigue eligiendo en
// Categorías, con `initials_palette`, que ahora resuelve contra esta tabla.

interface Props {
  colores: InitialsColor[];
  /** Para avisar, antes de borrar, qué categorías se quedarían sin ese color. */
  categorias: Category[];
  cargando: boolean;
  onCambio: () => void;
}

const HEX_VALIDO = /^#[0-9A-Fa-f]{6}$/;

export default function ColorsView({ colores, categorias, cargando, onCambio }: Props) {
  const [nombre, setNombre] = useState("");
  const [hex, setHex] = useState("#1A1A1A");

  // El hex que se está editando por fila, solo mientras difiere del guardado. Una fila
  // sin entrada acá es una fila sin cambios sin guardar.
  const [editados, setEditados] = useState<Record<string, string>>({});

  // Qué fila tiene una escritura en curso. `useAccion` es uno solo para toda la lista,
  // así que sin esto el "GUARDANDO…" aparecería en los botones de TODAS las filas
  // mientras se guarda una.
  const [enVuelo, setEnVuelo] = useState<string | null>(null);

  const agregar = useAccion(async () => {
    await coloresRepo.crear({
      name: nombre.trim(),
      hex: hex.toUpperCase(),
      // Al final de la fila. `position` no es única (014), así que un empate no rompe
      // nada: el desempate por nombre lo resuelve al leer.
      position: colores.length + 1,
    });
    setNombre("");
    setHex("#1A1A1A");
    onCambio();
  });

  // `finally` y no una línea después del await: si la escritura falla, useAccion se queda
  // con el error y la fila tiene que volver a quedar operable para reintentar.
  const guardarHex = useAccion(async (name: string, nuevo: string) => {
    setEnVuelo(name);
    try {
      await coloresRepo.editar(name, { hex: nuevo.toUpperCase() });
      setEditados((prev) => {
        const resto = { ...prev };
        delete resto[name];
        return resto;
      });
      onCambio();
    } finally {
      setEnVuelo(null);
    }
  });

  const borrar = useAccion(async (name: string) => {
    setEnVuelo(name);
    try {
      await coloresRepo.borrar(name);
      onCambio();
    } finally {
      setEnVuelo(null);
    }
  });

  /** Las categorías que nombran este color en su paleta — las que lo perderían al borrarlo. */
  function categoriasQueLoUsan(name: string): Category[] {
    return categorias.filter((c) => c.initials_palette.includes(name));
  }

  const nombreLimpio = nombre.trim();
  const repetido = colores.some(
    (c) => c.name.toLowerCase() === nombreLimpio.toLowerCase()
  );
  const puedeAgregar =
    nombreLimpio.length > 0 && HEX_VALIDO.test(hex) && !repetido && !agregar.enCurso;

  if (cargando && !colores.length) return <Cargando />;

  return (
    <div className="adm-colores">
      <Aviso
        titulo="La paleta no pasa por el borrador: se guarda directo y la tienda la ve al recargar."
        meta="QUÉ COLORES USA CADA CATEGORÍA SE ELIGE EN CATEGORÍAS · INITIALS_PALETTE"
      />

      <ErrorAviso error={agregar.error ?? guardarHex.error ?? borrar.error} />

      <section className="adm-card adm-color-nuevo">
        <h3 className="adm-h3">Agregar un color</h3>
        <div className="adm-color-nuevo-campos">
          <Campo
            etiqueta="NOMBRE"
            ayuda="no se puede cambiar después"
            error={repetido ? "Ya tienes un color con ese nombre." : undefined}
          >
            <Texto
              value={nombre}
              onChange={setNombre}
              placeholder="Ej. Turquesa"
              invalido={repetido}
            />
          </Campo>

          <Campo etiqueta="COLOR" ayuda="#RRGGBB">
            <ColorHex value={hex} onChange={setHex} invalido={!HEX_VALIDO.test(hex)} />
          </Campo>
        </div>

        {/* El nombre es la PK y viaja copiado como texto adentro de initials_palette y de
            los pedidos ya hechos. Por eso no se puede renombrar: no es una limitación de
            la pantalla, es lo que evita dejar referencias apuntando a un nombre muerto. */}
        <Boton
          onClick={() => void agregar.ejecutar()}
          variante="primario"
          disabled={!puedeAgregar}
          cargando={agregar.enCurso}
        >
          + AGREGAR COLOR
        </Boton>
      </section>

      {!colores.length ? (
        <Vacio titulo="La paleta está vacía.">
          <p>
            Sin colores, las fichas de los productos personalizables no muestran ninguno
            para elegir. Agrega al menos uno.
          </p>
        </Vacio>
      ) : (
        <ul className="adm-color-lista">
          {colores.map((c) => {
            const editado = editados[c.name];
            const valor = editado ?? c.hex;
            const sucio = editado !== undefined && editado !== c.hex;
            const usanEste = categoriasQueLoUsan(c.name);

            return (
              <li key={c.name} className="adm-color-fila">
                <span
                  className="adm-color-muestra"
                  style={{ background: HEX_VALIDO.test(valor) ? valor : "transparent" }}
                  aria-hidden="true"
                />

                <div className="adm-color-datos">
                  <span className="adm-color-nombre">{c.name}</span>
                  {usanEste.length > 0 && (
                    <span className="adm-mono adm-color-usos">
                      ELEGIDO EN {usanEste.map((k) => k.label.toUpperCase()).join(" · ")}
                    </span>
                  )}
                </div>

                <div className="adm-color-hex">
                  <ColorHex
                    value={valor}
                    onChange={(v) => setEditados((prev) => ({ ...prev, [c.name]: v }))}
                    invalido={!HEX_VALIDO.test(valor)}
                  />
                </div>

                <div className="adm-color-acciones">
                  {sucio && (
                    <Boton
                      onClick={() => void guardarHex.ejecutar(c.name, valor)}
                      variante="primario"
                      disabled={!HEX_VALIDO.test(valor)}
                      cargando={guardarHex.enCurso && enVuelo === c.name}
                    >
                      GUARDAR
                    </Boton>
                  )}
                  <Boton
                    onClick={() => {
                      // El aviso nombra las categorías porque `initials_palette` es un
                      // text[] sin foreign key: la base deja borrar el color y esos
                      // nombres quedan huérfanos sin que nada se queje.
                      const aviso =
                        usanEste.length > 0
                          ? `¿Borrar el color "${c.name}"?\n\nLo tienen elegido: ${usanEste
                              .map((k) => k.label)
                              .join(", ")}. Esas categorías van a volver a mostrar toda la paleta.`
                          : `¿Borrar el color "${c.name}"?`;
                      if (window.confirm(aviso)) void borrar.ejecutar(c.name);
                    }}
                    variante="peligro"
                    cargando={borrar.enCurso && enVuelo === c.name}
                  >
                    BORRAR
                  </Boton>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
