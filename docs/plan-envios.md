# Plan — Costo de envío según la ciudad

> **Solo plan.** Nada de esto está implementado todavía. Hoy el sitio cobra un envío fijo de
> $10.000 (`PRICE_SHIP` en `src/lib/pricing.js`) a cualquier destino.

## El problema

$10.000 alcanza para Barranquilla y las ciudades cercanas (Cartagena, Santa Marta). Para el
interior, Inter Rapidísimo cobra más, y la diferencia la está pagando Baqtime.

## Lo que se encontró de las tarifas de Inter Rapidísimo (2026)

Inter Rapidísimo **no publica una tabla de precios**: cada guía se cotiza según origen, destino,
peso real o volumétrico (el mayor de los dos) y valor declarado. Estas son referencias públicas
de comparadores; hay que confirmarlas con el cotizador oficial (paso 1).

| Ruta / zona (1 kg) | Precio de referencia |
|---|---|
| Barranquilla → Santa Marta | ~$5.500 |
| Barranquilla → Bogotá | ~$12.000 |
| Medellín → Barranquilla | ~$11.000 |
| Zona urbana (ciudad a ciudad principal) | $11.000 – $13.500 |
| Zona regional (municipios intermedios) | $14.500 – $17.500 |
| Zona especial (rural o de difícil acceso) | $20.000 – $25.000 |

Fuentes: comparadores [envios.com.co](https://info.envios.com.co/barranquilla-a-santa-marta),
[envios.com.co](https://info.envios.com.co/bogota-a-barranquilla),
[Skydropx](https://www.skydropx.com.co/transportadoras/inter-rapidisimo/cotizador/) y
[Andrey Business](https://www.andreybusiness.com/blog/interrapidisimo-tarifas-precio-envio-2026).
Son precios para 1 kg sin valor declarado alto; un bolso empacado puede pesar más por volumen.

## Propuesta de tarifas (borrador para validar)

Cada municipio de Colombia queda asignado a una **ciudad base**. El envío es el precio de esa
ciudad; si el municipio no es la ciudad misma, se suman **$3.000** (la regla del dueño).

| Zona | Ciudades base | Envío propuesto | Municipio cercano |
|---|---|---|---|
| Costa cercana | Barranquilla, Cartagena, Santa Marta | $10.000 | $13.000 |
| Costa | Valledupar, Montería, Sincelejo, Riohacha | $12.000 | $15.000 |
| Andina principal | Bogotá, Medellín, Bucaramanga | $14.000 | $17.000 |
| Andina y Pacífico | Cali, Pereira, Manizales, Armenia, Ibagué, Cúcuta, Tunja, Neiva, Villavicencio | $16.000 | $19.000 |
| Sur | Pasto, Popayán, Florencia, Yopal | $18.000 | $21.000 |
| Especial | San Andrés, Leticia, Mocoa, Quibdó, Inírida, Mitú, Puerto Carreño, San José del Guaviare | Se coordina por WhatsApp | — |

Ejemplo: un pedido a Chía (cerca de Bogotá) paga $14.000 + $3.000 = **$17.000**.

Los valores incluyen un pequeño margen sobre la referencia para cubrir el empaque y el peso
volumétrico. Se ajustan con las cotizaciones reales del paso 1.

## Pasos

### Paso 1 — Cotizar de verdad (dueño)
1. Pesar y medir el paquete típico, ya empacado: un bolso, y un pedido de dos bolsos.
2. En el cotizador de interrapidisimo.com (o en la oficina), cotizar desde Barranquilla a una
   ciudad de cada zona y a un municipio cercano de cada una.
3. Con eso, confirmar o corregir la tabla de arriba.

**Decisiones que faltan:**
- ¿Barranquilla y su área metropolitana (Soledad, Malambo, Puerto Colombia, Galapa) siguen en $10.000?
- ¿Un pedido con varios bolsos paga más envío, o el mismo?
- ¿Las zonas especiales se cotizan por WhatsApp o se bloquean en el checkout?

### Paso 2 — La tabla de tarifas en Supabase
- Tabla `shipping_zones` (zona y precio) y tabla `municipios` (municipio, departamento, ciudad
  base, si es la ciudad misma o un municipio cercano). La lista de municipios sale de la
  DIVIPOLA del DANE (~1.100 municipios).
- Editable desde el panel: cambiar el precio de una zona sin tocar código.

### Paso 3 — Checkout
- El campo "Ciudad" pasa a ser un buscador de municipios (escribe "Chí…" → "Chía, Cundinamarca"),
  para que el precio no dependa de cómo se escriba el nombre.
- El costo del envío aparece en cuanto se elige el municipio, en el resumen del carrito y del
  checkout. Las zonas especiales muestran "Se coordina por WhatsApp".
- La regla del documento (obligatorio fuera de Barranquilla) se mantiene.

### Paso 4 — Servidor
- `/api/pedidos` recalcula el envío con la tabla, igual que ya recalcula los precios: el
  navegador nunca decide cuánto se cobra.
- `orders.shipping_cost` ya existe y queda congelado en cada pedido; los correos ya lo muestran.

### Paso 5 — Textos
- Términos ("Precios" y "Tiempos de entrega y envíos"): el envío depende del municipio y se ve
  antes de confirmar. Quitar la mención al valor fijo.
- Footer: "Envíos a toda Colombia" sigue siendo cierto.

### Paso 6 — Revisión
- Revisar las tarifas cada vez que Inter Rapidísimo suba precios (normalmente a inicio de año).
