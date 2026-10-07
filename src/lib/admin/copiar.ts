// Copiar texto al portapapeles desde el panel.

/**
 * `navigator.clipboard` no existe fuera de HTTPS ni en navegadores viejos, y a veces el
 * navegador niega el permiso. Quedarse sin forma de copiar dejaría la opción inservible justo
 * en el momento en que se necesita, así que si falla se usa el camino de siempre: un textarea
 * invisible, seleccionado, con `execCommand("copy")`.
 */
export async function copiarAlPortapapeles(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto);
  } catch {
    const caja = document.createElement("textarea");
    caja.value = texto;
    caja.setAttribute("readonly", "");
    caja.style.position = "fixed";
    caja.style.opacity = "0";
    document.body.appendChild(caja);
    caja.select();
    document.execCommand("copy");
    caja.remove();
  }
}
