// Hooks del panel.
//
// Toda la carga de datos vive acá y no repartida por las pantallas. Tres razones
// concretas: el borrador lo necesitan la lista, el editor y la publicación; el diff
// necesita borrador y publicado juntos; y después de guardar hay que refrescar una
// sola vez, no una por pantalla.

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { subscribe, getSession, type Sesion } from "../supabase/auth-store";
import { comoAdminError, type AdminError } from "../supabase/errors";
import * as categoriasRepo from "./categories.repo";
import * as productosRepo from "./products.repo";
import * as publishRepo from "./publish.repo";
import type { Category, ProductWithPhotos } from "../../types/database";

/**
 * Conecta un componente al store de sesión.
 *
 * Usa useSyncExternalStore y no useState+useEffect porque es exactamente el caso
 * para el que existe: un store externo a React del que hay que leer sin perderse
 * cambios entre el render y la suscripción.
 */
export function useSession(): Sesion | null {
  return useSyncExternalStore(
    subscribe,
    getSession,
    // En el servidor no hay sesión posible: el panel es client:only, pero React
    // igual pide este snapshot y sin él tira un error confuso.
    () => null
  );
}

export interface AdminData {
  categorias: Category[];
  borrador: ProductWithPhotos[];
  publicado: ProductWithPhotos[];
  /** Cuántos productos del borrador cuelgan de cada categoría. */
  conteoPorCategoria: Record<string, number>;
  cargando: boolean;
  error: AdminError | null;
  recargar: () => Promise<void>;
}

/**
 * Carga el estado completo del panel: categorías, borrador y publicado.
 *
 * Las tres van en paralelo porque no dependen entre sí. En serie el panel tardaría
 * el triple en abrir sin ninguna razón.
 */
export function useAdminData(activo: boolean): AdminData {
  const [categorias, setCategorias] = useState<Category[]>([]);
  const [borrador, setBorrador] = useState<ProductWithPhotos[]>([]);
  const [publicado, setPublicado] = useState<ProductWithPhotos[]>([]);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const recargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const [cats, draft, pub] = await Promise.all([
        categoriasRepo.listar(),
        productosRepo.listar(),
        publishRepo.cargarPublicado(),
      ]);
      setCategorias(cats);
      setBorrador(draft);
      setPublicado(pub);
    } catch (e) {
      setError(comoAdminError(e));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (activo) void recargar();
  }, [activo, recargar]);

  // Se deriva del borrador ya cargado en vez de pedirle otra consulta al servidor:
  // es el mismo dato contado de otra forma.
  const conteoPorCategoria: Record<string, number> = {};
  for (const p of borrador) {
    conteoPorCategoria[p.category_key] = (conteoPorCategoria[p.category_key] ?? 0) + 1;
  }

  return { categorias, borrador, publicado, conteoPorCategoria, cargando, error, recargar };
}

/**
 * Estado de una acción que escribe (guardar, borrar, publicar).
 *
 * Existe porque las cuatro pantallas repetían el mismo trío
 * `enCurso / error / ejecutar-con-try-catch`. Además desactiva el botón mientras
 * corre, que es lo que evita el doble guardado por doble clic.
 */
export function useAccion<Args extends unknown[], R>(
  fn: (...args: Args) => Promise<R>
): {
  ejecutar: (...args: Args) => Promise<R | null>;
  enCurso: boolean;
  error: AdminError | null;
  limpiarError: () => void;
} {
  const [enCurso, setEnCurso] = useState(false);
  const [error, setError] = useState<AdminError | null>(null);

  const ejecutar = useCallback(
    async (...args: Args): Promise<R | null> => {
      setEnCurso(true);
      setError(null);
      try {
        return await fn(...args);
      } catch (e) {
        setError(comoAdminError(e));
        return null;
      } finally {
        setEnCurso(false);
      }
    },
    [fn]
  );

  return { ejecutar, enCurso, error, limpiarError: () => setError(null) };
}
