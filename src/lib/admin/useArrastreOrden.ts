// Reordenar una lista arrastrando, con mouse Y con el dedo.
//
// POR QUÉ NO SE USA EL ARRASTRE DE HTML — esto importa:
// `draggable` + `dragstart/dragover/drop` es la API vieja de arrastre del
// navegador y **no dispara nunca con el dedo**. En un celular el ícono de
// agarre simplemente no responde. Pointer Events sí: unifica mouse, dedo y
// lápiz en los mismos eventos, así que una sola implementación cubre todo.
//
// El hook NO toca los datos. Solo avisa "movete del índice A al B" y cada
// pantalla decide qué hacer con eso (guardar en el borrador, avisarle al
// editor, etc.). Por eso sirve igual para productos, categorías y fotos.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  CSSProperties,
  KeyboardEvent as EventoTeclado,
  PointerEvent as EventoPuntero,
  RefObject,
} from "react";

/** Cuánto tarda una fila en correrse para abrir el hueco. */
const DURACION_MS = 180;
/** Cuánto hay que mover el dedo antes de considerar que es un arrastre y no un toque. */
const UMBRAL_PX = 6;
/** Franja del borde de la pantalla donde la lista empieza a desplazarse sola. */
const ZONA_BORDE_PX = 90;
/** Píxeles por cuadro, al máximo, del desplazamiento automático. */
const VELOCIDAD_MAX = 18;

interface Medida {
  /** En coordenadas de PÁGINA, no de pantalla — así sobreviven al scroll. */
  top: number;
  height: number;
}

interface Opciones {
  /** Cuántos elementos hay en la lista. */
  cantidad: number;
  /** Si es `false`, el agarre no arrastra (ej. Productos con el filtro en TODAS). */
  activo?: boolean;
  /** Se llama UNA vez, al soltar, y solo si la posición cambió. */
  onMover: (desde: number, hasta: number) => void;
}

interface Arrastre {
  /** Va en el contenedor de la lista (`<tbody>`, `<ul>`). */
  contenedorRef: RefObject<HTMLElement | null>;
  /** Va en cada elemento arrastrable: lo marca y lo mueve. */
  propsItem: (i: number) => { "data-indice": number; style: CSSProperties };
  /** Va en el ícono de agarre. */
  propsAgarre: (i: number) => {
    ref: (nodo: HTMLElement | null) => (() => void) | void;
    onPointerDown: (e: EventoPuntero<HTMLElement>) => void;
    onPointerMove: (e: EventoPuntero<HTMLElement>) => void;
    onPointerUp: (e: EventoPuntero<HTMLElement>) => void;
    onPointerCancel: (e: EventoPuntero<HTMLElement>) => void;
    onClick: (e: { stopPropagation: () => void }) => void;
    onKeyDown: (e: EventoTeclado<HTMLElement>) => void;
    tabIndex: number;
    role: "button";
    style: CSSProperties;
  };
  /** Índice que se está arrastrando, o `null`. Sirve para las clases visuales. */
  arrastrando: number | null;
}

export function useArrastreOrden({ cantidad, activo = true, onMover }: Opciones): Arrastre {
  const contenedorRef = useRef<HTMLElement | null>(null);

  // Lo que se dibuja. Se mantiene aparte del ref porque React necesita
  // re-renderizar para mover las filas.
  const [origen, setOrigen] = useState<number | null>(null);
  const [destino, setDestino] = useState<number | null>(null);
  const [corrimiento, setCorrimiento] = useState(0);
  const [paso, setPaso] = useState(0);

  // Todo lo que cambia dentro de un mismo arrastre vive acá: un ref no
  // provoca re-render, y en `pointermove` eso pasa decenas de veces por segundo.
  const gesto = useRef({
    medidas: [] as Medida[],
    paso: 0,
    origen: -1,
    destino: -1,
    inicioClienteY: 0,
    inicioScrollY: 0,
    ultimoClienteY: 0,
    activo: false,
    raf: 0,
  });

  const detener = useCallback(() => {
    const g = gesto.current;
    if (g.raf) cancelAnimationFrame(g.raf);
    g.raf = 0;
    g.activo = false;
    g.origen = -1;
    g.destino = -1;
    g.medidas = [];
    setOrigen(null);
    setDestino(null);
    setCorrimiento(0);
  }, []);

  // Si el componente desaparece a mitad de un arrastre, el bucle de
  // desplazamiento seguiría corriendo contra un componente que ya no existe.
  useEffect(() => {
    return () => {
      if (gesto.current.raf) cancelAnimationFrame(gesto.current.raf);
    };
  }, []);

  /**
   * A qué posición iría la fila, según dónde está su centro ahora.
   *
   * Se compara contra el punto medio de cada vecina: la fila "pasa" a otra
   * recién cuando le cruza la mitad, que es lo que hace que el intercambio no
   * tiemble cuando el dedo queda justo en el borde entre dos.
   */
  const calcularDestino = useCallback((desplazamiento: number): number => {
    const g = gesto.current;
    const propia = g.medidas[g.origen];
    if (!propia) return g.origen;
    const centro = propia.top + desplazamiento + propia.height / 2;

    let destino = g.origen;
    if (desplazamiento > 0) {
      for (let k = g.origen + 1; k < g.medidas.length; k++) {
        const m = g.medidas[k];
        if (!m || centro <= m.top + m.height / 2) break;
        destino = k;
      }
    } else if (desplazamiento < 0) {
      for (let k = g.origen - 1; k >= 0; k--) {
        const m = g.medidas[k];
        if (!m || centro >= m.top + m.height / 2) break;
        destino = k;
      }
    }
    return destino;
  }, []);

  /** Recalcula posición y destino a partir del último punto conocido del dedo. */
  const refrescar = useCallback(() => {
    const g = gesto.current;
    const desplazamiento =
      g.ultimoClienteY + window.scrollY - (g.inicioClienteY + g.inicioScrollY);
    g.destino = calcularDestino(desplazamiento);
    setCorrimiento(desplazamiento);
    setDestino(g.destino);
  }, [calcularDestino]);

  /** Desplaza la página sola cuando el dedo llega al borde. */
  const bucleBorde = useCallback(() => {
    const g = gesto.current;
    if (!g.activo) return;
    const y = g.ultimoClienteY;
    const alto = window.innerHeight;

    let velocidad = 0;
    if (y < ZONA_BORDE_PX) {
      velocidad = -Math.ceil(((ZONA_BORDE_PX - y) / ZONA_BORDE_PX) * VELOCIDAD_MAX);
    } else if (y > alto - ZONA_BORDE_PX) {
      velocidad = Math.ceil(((y - (alto - ZONA_BORDE_PX)) / ZONA_BORDE_PX) * VELOCIDAD_MAX);
    }

    if (velocidad !== 0) {
      const antes = window.scrollY;
      window.scrollBy(0, velocidad);
      // Si ya no se movió (llegamos al tope), no hace falta recalcular.
      if (window.scrollY !== antes) refrescar();
    }
    g.raf = requestAnimationFrame(bucleBorde);
  }, [refrescar]);

  const propsAgarre = useCallback(
    (i: number) => ({
      // `touch-action: none` (más abajo, en `style`) alcanza en Chrome/Firefox,
      // pero iOS Safari a veces igual arranca su propio gesto de scroll apenas
      // el dedo se mueve, sin llegar a disparar `pointermove`. Cancelar el
      // `touchstart` a mano es el único respaldo que funciona ahí — y tiene que
      // ser un listener nativo con `passive: false`, porque el `onTouchStart`
      // de React se agrega pasivo y `preventDefault()` ahí no hace nada.
      ref: (nodo: HTMLElement | null) => {
        if (!nodo) return;
        const cancelar = (e: TouchEvent) => {
          if (activo && cantidad > 1) e.preventDefault();
        };
        nodo.addEventListener("touchstart", cancelar, { passive: false });
        return () => nodo.removeEventListener("touchstart", cancelar);
      },
      onPointerDown: (e: EventoPuntero<HTMLElement>) => {
        if (!activo || cantidad < 2) return;
        if (e.button !== 0) return; // solo el botón principal del mouse
        const contenedor = contenedorRef.current;
        if (!contenedor) return;

        const nodos = contenedor.querySelectorAll<HTMLElement>("[data-indice]");
        const medidas: Medida[] = [];
        nodos.forEach((n) => {
          const r = n.getBoundingClientRect();
          // En coordenadas de página: así el desplazamiento automático no
          // invalida las medidas a mitad del arrastre.
          medidas.push({ top: r.top + window.scrollY, height: r.height });
        });
        if (medidas.length < 2 || !medidas[i]) return;

        const g = gesto.current;
        g.medidas = medidas;
        // El hueco que deja la fila al salir = su alto + la separación entre filas
        // (0 en una tabla, 10px en la lista de fotos).
        const primera = medidas[0]!;
        const segunda = medidas[1]!;
        const separacion = Math.max(0, segunda.top - (primera.top + primera.height));
        g.paso = medidas[i]!.height + separacion;
        g.origen = i;
        g.destino = i;
        g.inicioClienteY = e.clientY;
        g.inicioScrollY = window.scrollY;
        g.ultimoClienteY = e.clientY;
        g.activo = false; // todavía no superó el umbral

        e.currentTarget.setPointerCapture(e.pointerId);
        setPaso(g.paso);
      },

      onPointerMove: (e: EventoPuntero<HTMLElement>) => {
        const g = gesto.current;
        if (g.origen < 0) return;
        g.ultimoClienteY = e.clientY;

        if (!g.activo) {
          // Un toque que no se mueve no debe convertirse en arrastre.
          if (Math.abs(e.clientY - g.inicioClienteY) < UMBRAL_PX) return;
          g.activo = true;
          setOrigen(g.origen);
          g.raf = requestAnimationFrame(bucleBorde);
        }
        refrescar();
      },

      onPointerUp: () => {
        const g = gesto.current;
        const desde = g.origen;
        const hasta = g.destino;
        const hubo = g.activo;
        detener();
        if (hubo && desde >= 0 && hasta >= 0 && hasta !== desde) onMover(desde, hasta);
      },

      onPointerCancel: () => detener(),

      // La fila entera abre el editor al hacer clic; el agarre no debe hacerlo.
      onClick: (e: { stopPropagation: () => void }) => e.stopPropagation(),

      // Respaldo de teclado: sin esto, quitar los botones ↑/↓ de la pantalla
      // dejaría sin forma de reordenar a quien no usa mouse ni dedo.
      onKeyDown: (e: EventoTeclado<HTMLElement>) => {
        if (!activo) return;
        if (e.key === "ArrowUp" && i > 0) {
          e.preventDefault();
          onMover(i, i - 1);
        } else if (e.key === "ArrowDown" && i < cantidad - 1) {
          e.preventDefault();
          onMover(i, i + 1);
        }
      },

      tabIndex: activo && cantidad > 1 ? 0 : -1,
      role: "button" as const,

      style: {
        // Sin esto, en el celular el navegador se queda el gesto para desplazar
        // la página y `pointermove` no llega nunca. Va SOLO en el agarre: si
        // estuviera en la fila, no se podría desplazar la lista con el dedo.
        touchAction: "none",
        userSelect: "none",
        WebkitUserSelect: "none",
        // Mantener el dedo sobre un ícono abre el menú de iOS a mitad del arrastre.
        WebkitTouchCallout: "none",
        cursor: activo && cantidad > 1 ? "grab" : "not-allowed",
      } as CSSProperties,
    }),
    [activo, cantidad, bucleBorde, refrescar, detener, onMover]
  );

  const propsItem = useCallback(
    (i: number) => {
      const base = { "data-indice": i };
      if (origen === null || destino === null) return { ...base, style: {} as CSSProperties };

      // La fila agarrada sigue al dedo: sin transición, o se sentiría "pesada".
      if (i === origen) {
        return {
          ...base,
          style: {
            transform: `translateY(${corrimiento}px)`,
            transition: "none",
            position: "relative",
            zIndex: 2,
          } as CSSProperties,
        };
      }

      // Las demás se corren para abrir el hueco, con transición.
      let mueve = 0;
      if (destino > origen && i > origen && i <= destino) mueve = -paso;
      else if (destino < origen && i >= destino && i < origen) mueve = paso;

      return {
        ...base,
        style: {
          transform: mueve ? `translateY(${mueve}px)` : undefined,
          transition: `transform ${DURACION_MS}ms ease`,
        } as CSSProperties,
      };
    },
    [origen, destino, corrimiento, paso]
  );

  return { contenedorRef, propsItem, propsAgarre, arrastrando: origen };
}
