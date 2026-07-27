import { state } from './state.js';
import { PRICE_EXTRA_INITIALS, PRICE_SHIP, fmt, getAdvance } from './pricing.js';
import { validateShippingForm } from './shipping-form.js';

export const WHATSAPP_NUMBER = "573134954478";

/* ===================== WHATSAPP ===================== */
export function sendWhatsapp(){
  const p = state.currentProduct;
  const initialsInput = document.getElementById('initialsInput');
  const initials = p.personalizable ? initialsInput.value : '';
  const name = document.getElementById('shipName').value.trim();
  const city = document.getElementById('shipCity').value.trim();
  const address = document.getElementById('shipAddress').value.trim();
  const phone = document.getElementById('shipPhone').value.trim();
  const doc = document.getElementById('shipDoc').value.trim();
  const reqNote = document.getElementById('reqNote');

  if(!validateShippingForm()){
    return;
  }
  reqNote.textContent = '';

  const count = initials.length;
  const extra = (p.category==='tote' && count>3) ? PRICE_EXTRA_INITIALS : 0;
  const total = p.price + extra + PRICE_SHIP;

  let productLines = [];
  if(p.category==='tote'){
    productLines = [
      `• Producto: Tote Bag personalizado`,
      `• Color del bolso: ${p.color}`,
      `• Color de los cordones: ${p.variant.replace('Cordones ','')}`,
      `• Iniciales: ${initials || '(sin iniciales)'}`,
      `• Color de las iniciales: ${state.currentInitialsColor.name}`,
    ];
  } else if(p.category==='tote-luxury'){
    productLines = [
      `• Producto: Tote Bag Luxury`,
      `• Color: ${p.color}`,
      `• Iniciales: ${initials || '(sin iniciales)'}`,
      `• Color de las iniciales: ${state.currentInitialsColor.name}`,
    ];
  } else if(p.category==='neceser'){
    productLines = [
      `• Producto: Neceser`,
      `• Color / modelo: ${p.color}`,
      `• Iniciales: ${initials || '(sin iniciales)'}`,
      `• Color de las iniciales: ${state.currentInitialsColor.name}`,
    ];
  } else if(p.category==='cosmetiquera'){
    productLines = [
      `• Producto: Cosmetiquera`,
      `• Color: ${p.color}`,
      `• Iniciales: ${initials || '(sin iniciales)'}`,
      `• Color de las iniciales: ${state.currentInitialsColor.name}`,
    ];
  } else if(p.category==='makeup-bag'){
    productLines = [
      `• Producto: Makeup Bag`,
      `• Color: ${p.color}`,
      `• Iniciales: ${initials || '(sin iniciales)'}`,
      `• Color de las iniciales: ${state.currentInitialsColor.name}`,
      ``,
    ];
  } else {
    productLines = [
      `• Producto: Bag Lumiere`,
      `• Color / modelo: ${p.color}`,
    ];
  }

  const lines = [
    `¡Hola! Quiero agendar un pedido en Baqtime`,
    ``,
    `DETALLES DE MI PEDIDO:`,
    ``,
    ...productLines,
    ``,
    `VALOR DEL PEDIDO:`,
    `• ${p.name}: ${fmt(p.price)}`,
    extra > 0 ? `• Personalización: ${fmt(extra)}` : null,
    `• Envío: ${fmt(PRICE_SHIP)}`,
    `• Total: ${fmt(total)}`,
    ``,
    `DATOS PARA EL ENVIO:`,
    `• Nombre: ${name}`,
    `• Ciudad: ${city}`,
    `• Dirección: ${address}`,
    `• Teléfono: ${phone}`,
    doc ? `• Documento: ${doc}` : null,
    ``,
    `Quiero reservar este modelo. ¿Me comparten los medios de pago para realizar el anticipo de ${fmt(getAdvance(p))} y confirmar mi pedido?`
  ].filter(Boolean).join('\n');

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines)}`;
  window.location.href = url;
}
