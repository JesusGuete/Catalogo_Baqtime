// Fotos de respaldo de la migración a Firebase Storage (Fase 6). Ya no se necesitan:
// todos los productos de fábrica tienen sus fotos reales publicadas en Storage, así que
// getPhotos() nunca llega a usar este objeto (ver el fallback en admin/main.js). Se deja
// vacío (en vez de eliminar el import y la lógica de respaldo) por si algún día un
// producto queda temporalmente sin fotos en Firebase — mismo patrón que
// site/site-images.js (IMG_DATA = {}) en el catálogo público.
export const DEFAULT_PHOTOS = {};
