# Plan — Precios que cubren la comisión de Wompi

> Estado: **implementado en `feature/precios-con-comision`** (2026-10-10), sin publicar. Se
> publica el día que se encienda Wompi (ver "El día de la salida"). Complementa
> `docs/plan-pagos-en-linea.md`: es la decisión 4 de ese plan ("se suben los precios para cubrir
> la comisión").

## El objetivo

Que por cada venta pagada con Wompi recibas **al menos lo mismo que recibes hoy** por
transferencia, sin asumir la comisión y sin cobrar un recargo aparte.

## La tarifa

Plan actual del comercio: **Avanzado Agregador + Compra y paga después Bancolombia**.

- **2,65 % + $700 + IVA por transacción exitosa**, igual para todos los medios en línea:
  tarjetas débito y crédito, PSE, Botón Bancolombia, Nequi, DaviPlata, QR Bancolombia, SU+ Pay y
  Compra y Paga Después Bancolombia.
- El IVA (19 %) es **sobre la comisión**, no sobre el bolso: el costo real es 3,15 % del total
  más $833 por pedido.
- (La tarifa de 1,98 % + IVA es solo para cobrar con tarjeta física en la app; no aplica a la
  tienda.)

## Las decisiones de diseño

1. **Un solo precio para todos los medios de pago.** Quien paga por transferencia (mientras
   exista esa opción) paga lo mismo. Un recargo solo para quien paga con tarjeta es legal en
   Colombia si se informa antes de pagar, pero las franquicias (Visa, Mastercard) suelen
   prohibirlo y obliga a mostrar dos precios. No vale la pena.
2. **El porcentaje va en los productos y los $700 fijos van en el envío.** La comisión fija se
   cobra una vez por pedido, no por bolso. Si se metiera en cada producto, un pedido de tres
   bolsos la pagaría tres veces. Cada pedido tiene exactamente un envío, así que ahí cuadra
   justo.
3. **Precios redondos.** Productos redondeados hacia arriba al millar ($124.000, no $123.912).
   Envíos a la centena ($11.200). Siempre hacia arriba, así que el redondeo nunca te hace
   perder.
4. **Los productos se cambian una vez en la base; el envío se calcula en el código.**
   - Los precios de los productos los eliges tú y los ves en el panel: lo que dice el panel
     tiene que ser lo que ve el cliente. Se actualizan una vez y desde ahí los manejas como
     siempre.
   - El envío sale de las cotizaciones de Inter Rapidísimo (`docs/Envios-cotizaciones.xlsx` →
     `src/data/tarifas-envio.json`). Esas se quedan como están: son lo que te cobra la
     transportadora. La comisión se suma en `calcularEnvio()`, que es la única función que
     calcula envíos, tanto en la tienda como en el servidor.

## La fórmula

Con `r = 2,65 % × 1,19 = 3,1535 %` y `F = $700 × 1,19 = $833`:

- **Producto:** `precio nuevo = precio actual ÷ (1 − r)`, redondeado hacia arriba a $1.000.
- **Envío:** `envío nuevo = (envío actual + $833) ÷ (1 − r)`, redondeado hacia arriba a $100.
- **Bolso adicional en el envío:** `$4.000 ÷ (1 − r)` → $4.200.

Así, en cualquier pedido: `lo que cobra el cliente − comisión de Wompi ≥ lo que cobras hoy`.

## Los precios nuevos (catálogo publicado al 2026-10-10)

### Productos (33 publicados)

| Categoría | Hoy | Nuevo | Diferencia | Productos |
|---|---:|---:|---:|---:|
| Tote Personalizado | $120.000 | **$124.000** | +$4.000 | 12 |
| Tote Bag Luxury | $120.000 | **$124.000** | +$4.000 | 5 |
| Bag Lumiere | $130.000 | **$135.000** | +$5.000 | 3 |
| Makeup Bag | $80.000 | **$83.000** | +$3.000 | 4 |
| Neceser | $50.000 | **$52.000** | +$2.000 | 6 |
| Cosmetiquera | $50.000 | **$52.000** | +$2.000 | 3 |

### Categorías (lo que usa el panel)

| Categoría | Precio base hoy → nuevo | Recargo de iniciales hoy → nuevo |
|---|---|---|
| Tote Personalizado | $120.000 → $124.000 | $10.000 → **$11.000** (desde la 4.ª inicial) |
| Tote Bag Luxury | $120.000 → $124.000 | — |
| Bag Lumiere | $130.000 → $135.000 | — |
| Neceser | $60.000 → $62.000 | — |
| Cosmetiquera | $50.000 → $52.000 | — |
| Makeup Bag | $70.000 → $73.000 | — |

El precio base de la categoría solo es el valor que se propone al crear un producto nuevo; no
cambia los productos que ya existen.

### Envío

| Tarifa hoy | Nueva | Municipios |
|---:|---:|---:|
| $10.000 | **$11.200** | 8 |
| $15.000 | **$16.400** | 58 |
| $20.000 | **$21.600** | 174 |
| $23.000 | **$24.700** | 783 |
| $35.000 | **$37.000** | 75 |
| +$4.000 por bolso adicional | **+$4.200** | — |

### Comprobación

Se simularon **625 pedidos**: de 1 a 4 bolsos, todas las combinaciones de precios, con y sin
recargo de iniciales y con las 5 tarifas de envío. **En ninguno recibes menos que hoy.** El peor
caso te deja $90 por encima; el promedio, $1.765.

Ejemplos:

| Pedido | Hoy | El cliente paga | Wompi cobra | Recibes |
|---|---:|---:|---:|---:|
| Tote + envío a Barranquilla | $130.000 | $135.200 | $5.097 | **$130.103** |
| Tote + envío de $23.000 | $143.000 | $148.700 | $5.522 | **$143.178** |
| Tote + envío de $35.000 (peor caso) | $155.000 | $161.000 | $5.910 | **$155.090** |

## Lo que se cambia en el código

Un PR, `feature/precios-con-comision`, aparte del de Wompi:

1. **`src/lib/pricing.js`**: la tarifa como constante (`COMISION_WOMPI = { porcentaje: 0.0265,
   fijo: 700, iva: 0.19 }`) y tres funciones:
   - `envioConComision()`: tarifa de la transportadora + comisión completa.
   - `cargoEnvioConComision()`: el bolso adicional, solo con el porcentaje.
   - `recibesConWompi()`: lo que queda de un precio, para el panel.

   Si algún día cambias de plan en Wompi, se cambia esa constante y nada más.
2. **`src/lib/envios.js`**: `calcularEnvio()` aplica `envioConComision()` a la tarifa de la
   transportadora y al bolso adicional. `ENVIO_DESDE` ("envío desde $…") se recalcula solo. Como
   el servidor usa la misma función, lo que ve el cliente es lo que se cobra.
3. **El panel, para los precios que pongas de aquí en adelante:**
   - **Editor de producto:** debajo del precio, "Con Wompi recibes ≈ $X" (prop `nota` de
     `Campo`, en `ui.tsx`).
   - **Categorías:** lo mismo para el precio base y el recargo de iniciales.
   - **`/terminos`:** el "envío desde" y el "+ por bolso adicional" salen de las mismas
     constantes, así que ya dicen $11.200 y $4.200.

   Así un producto nuevo no se publica por debajo del costo sin que lo notes.
4. **`supabase/sql/028_precios_con_comision.sql`** (datos, no esquema):
   - Pone el precio nuevo **en el borrador** (`products_draft`), solo en las seis categorías de
     la tabla y solo si el producto todavía tiene el precio viejo. Si ya cambiaste alguno a mano,
     no lo toca. Correrlo dos veces deja lo mismo. Al final lista los productos con un precio
     fuera de la tabla, para revisarlos a mano.
   - Actualiza `default_price` y `extra_initials_price` de las categorías.
   - Los precios de los productos **no se ven en la tienda hasta que pulses Publicar** en el
     panel, como cualquier otro cambio.

Lo que no hace falta tocar:

- **Los pedidos ya hechos** guardan el total que se cobró y no cambian.
- **Los carritos abiertos** se recalculan solos con los precios nuevos: `precioLinea()` nunca
  usa el precio guardado en el navegador.
- **Los términos y condiciones** dicen que los precios son "el precio total de cada producto",
  y siguen siéndolo.

## El día de la salida

Todo el mismo día, para que no haya precios con comisión sin Wompi ni Wompi sin precios con
comisión:

1. Correr `028_precios_con_comision.sql` en Supabase. El recargo de iniciales cambia en la
   tienda en ese momento; los productos quedan en el borrador.
2. Publicar el código (envío con comisión + Wompi fase 3).
3. Pulsar **Publicar** en el panel.
4. Encender `PAGOS_EN_LINEA=1` en Cloudflare.
5. Hacer una compra de prueba y revisar en el dashboard de Wompi que lo que te llega cuadra con
   la tabla de arriba.

Los pedidos que se crearon **antes** del cambio y que se paguen con Wompi tienen el total viejo.
Esos pocos no cubren la comisión. Si quieres evitarlo, a esos clientes se les puede pedir que
paguen por transferencia.

## Lo que hay que confirmar

- **Retenciones.** Wompi practica retención en la fuente y reteICA: emite certificados de las
  dos. No son comisión; son anticipos de impuestos que luego se descuentan en tus declaraciones.
  Por eso **no** se suman al precio. Pero lo que llega a tu cuenta puede ser un poco menos que
  "Recibes" en la tabla. Confírmalo con tu contador.
- **Que la tarifa no cambie con el volumen.** El plan dice "2,65 % + 700 + IVA por transacción
  exitosa" sin escalas. Si Wompi te ofrece otra tarifa, se cambia la constante y se vuelven a
  calcular los precios con el mismo script.
