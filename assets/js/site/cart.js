import { PRICE_SHIP, getAdvance, fmt } from './pricing.js';
import { escapeHtml } from '../shared/escape.js';
import { ALL_PRODUCTS } from './catalog-data.js';
import { resolveProductImage } from './site-images.js';
import { validateShippingForm, filterDigitsInput, filterNameCityInput } from './shipping-form.js';
import { WHATSAPP_NUMBER } from './whatsapp-order.js';

// ===== Carrito =====
// Guarda cada línea en localStorage (así no se pierde si el cliente recarga la página
// por accidente). Cada línea guarda todo lo que hace falta para el mensaje de WhatsApp:
// producto, color/variante, iniciales, color de iniciales, precio.
// No hay "cantidad": agregar el mismo producto dos veces crea dos líneas separadas
// (por ejemplo, el mismo Tote Bag pero con iniciales distintas para dos personas).
//
// Hay dos vistas sobre los mismos datos:
// - El panel lateral (#cartPanel): vistazo rápido, solo lista + total + "Finalizar compra".
// - La página de checkout (#checkoutOverlay): página completa (igual formato que un
//   producto), con la lista otra vez, el total, y los datos de envío.
const STORAGE_KEY = 'baqtime_cart';

function loadCart(){
  try{
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  }catch(e){
    console.warn('No se pudo leer el carrito guardado, se empieza vacío:', e);
    return [];
  }
}

let cart = loadCart();

function saveCart(){
  try{ localStorage.setItem(STORAGE_KEY, JSON.stringify(cart)); }
  catch(e){ console.warn('No se pudo guardar el carrito en este navegador:', e); }
}

export function getCart(){ return cart; }
export function getCartCount(){ return cart.length; }
export function getCartSubtotal(){ return cart.reduce((sum, item)=> sum + item.price + item.extra, 0); }

export function addToCart(item){
  cart.push({ id: 'line_' + Date.now() + '_' + Math.random().toString(36).slice(2), ...item });
  saveCart();
  renderAll();
}

export function removeFromCart(lineId){
  cart = cart.filter(item => item.id !== lineId);
  saveCart();
  renderAll();
}

function clearCart(){
  cart = [];
  saveCart();
  renderAll();
}

// Detalle legible de una línea (color/variante + iniciales), usado en ambas vistas.
function lineDetail(item){
  const parts = [];
  if(item.variant) parts.push(item.variant);
  else if(item.color) parts.push(item.color);
  if(item.initials) parts.push(`Iniciales: ${item.initials} (${item.initialsColorName})`);
  return parts.join(' · ');
}

function lineImage(item){
  const product = ALL_PRODUCTS.find(p=>p.id===item.productId);
  return product ? resolveProductImage(product) : 'assets/img/placeholder.svg';
}

// Arma el elemento <div class="cart-line"> de una línea (con su foto), reutilizado
// tanto por el panel lateral como por la página de checkout.
function buildCartLineElement(item){
  const row = document.createElement('div');
  row.className = 'cart-line';
  row.innerHTML = `
    <img class="cart-line-img" src="${escapeHtml(lineImage(item))}" alt="${escapeHtml(item.name)}">
    <div class="cart-line-body">
      <p class="cart-line-name">${escapeHtml(item.name)}</p>
      <p class="cart-line-detail">${escapeHtml(lineDetail(item))}</p>
      <p class="cart-line-price mono">${fmt(item.price + item.extra)}</p>
    </div>
    <button type="button" class="cart-line-remove" data-id="${item.id}" aria-label="Quitar del carrito">×</button>
  `;
  row.querySelector('.cart-line-remove').addEventListener('click', ()=> removeFromCart(item.id));
  return row;
}

function renderCartBadge(){
  const count = getCartCount();
  document.querySelectorAll('.cart-count').forEach(badge=>{
    badge.textContent = count;
    badge.classList.toggle('hidden', count===0);
  });
}

// Llena un contenedor de líneas + sus 3 totales (subtotal/envío/total), usando los
// ids que correspondan a esa vista (el panel lateral y el checkout tienen ids propios).
function renderInto(listId, subtotalId, shippingId, totalId){
  const listEl = document.getElementById(listId);
  listEl.innerHTML = '';
  if(!cart.length){
    listEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
  } else {
    cart.forEach(item=> listEl.appendChild(buildCartLineElement(item)));
  }
  const subtotal = getCartSubtotal();
  const shipping = cart.length ? PRICE_SHIP : 0;
  document.getElementById(subtotalId).textContent = fmt(subtotal);
  document.getElementById(shippingId).textContent = fmt(shipping);
  document.getElementById(totalId).textContent = fmt(subtotal + shipping);
}

function renderAll(){
  renderCartBadge();
  renderInto('cartItemsList', 'cartSubtotal', 'cartShipping', 'cartTotal');
  document.getElementById('checkoutBtn').classList.toggle('hidden', cart.length===0);
  // El checkout solo se re-renderiza si ya está abierto (si no, se renderiza fresco
  // justo antes de abrirlo, ver el click de checkoutBtn más abajo).
  if(!document.getElementById('checkoutOverlay').classList.contains('open')) return;
  renderInto('checkoutItemsList', 'checkoutSubtotal', 'checkoutShipping', 'checkoutTotal');
}

// Líneas del mensaje de WhatsApp para un producto del carrito (mismo formato por
// categoría que tenía el flujo de un solo producto — ver whatsapp-order.js).
function formatCartItemLines(item, idx){
  const initialsLine = `• Iniciales: ${item.initials || '(sin iniciales)'}`;
  const initialsColorLine = item.initialsColorName ? `• Color de las iniciales: ${item.initialsColorName}` : null;
  let lines;
  if(item.category==='tote'){
    lines = [
      `• Producto: Tote Bag personalizado`,
      `• Color del bolso: ${item.color}`,
      `• Color de los cordones: ${(item.variant||'').replace('Cordones ','')}`,
      initialsLine, initialsColorLine,
    ];
  } else if(item.category==='tote-luxury'){
    lines = [`• Producto: Tote Bag Luxury`, `• Color: ${item.color}`, initialsLine, initialsColorLine];
  } else if(item.category==='neceser'){
    lines = [`• Producto: Neceser`, `• Color / modelo: ${item.color}`, initialsLine, initialsColorLine];
  } else if(item.category==='cosmetiquera'){
    lines = [`• Producto: Cosmetiquera`, `• Color: ${item.color}`, initialsLine, initialsColorLine];
  } else if(item.category==='makeup-bag'){
    lines = [`• Producto: Makeup Bag`, `• Color: ${item.color}`, initialsLine, initialsColorLine];
  } else {
    lines = [`• Producto: Bag Lumiere`, `• Color / modelo: ${item.color}`];
  }
  return [
    `Producto ${idx+1} — ${item.name}:`,
    ...lines.filter(Boolean),
    item.extra ? `• Personalización adicional: ${fmt(item.extra)}` : null,
    `• Valor: ${fmt(item.price + item.extra)}`,
  ].filter(Boolean);
}

function sendCartWhatsapp(){
  if(!cart.length) return;
  if(!validateShippingForm()) return;

  const name = document.getElementById('shipName').value.trim();
  const city = document.getElementById('shipCity').value.trim();
  const address = document.getElementById('shipAddress').value.trim();
  const phone = document.getElementById('shipPhone').value.trim();
  const doc = document.getElementById('shipDoc').value.trim();

  const subtotal = getCartSubtotal();
  const totalAdvance = cart.reduce((sum, item)=> sum + getAdvance(item), 0);

  const productBlocks = cart.map((item, idx)=> formatCartItemLines(item, idx).join('\n'));

  const lines = [
    `¡Hola! Quiero agendar un pedido en Baqtime (${cart.length} producto${cart.length>1?'s':''})`,
    ``,
    `DETALLES DE MI PEDIDO:`,
    ``,
    productBlocks.join('\n\n'),
    ``,
    `VALOR DEL PEDIDO:`,
    `• Subtotal productos: ${fmt(subtotal)}`,
    `• Envío: ${fmt(PRICE_SHIP)}`,
    `• Total: ${fmt(subtotal + PRICE_SHIP)}`,
    ``,
    `DATOS PARA EL ENVÍO:`,
    `• Nombre: ${name}`,
    `• Ciudad: ${city}`,
    `• Dirección: ${address}`,
    `• Teléfono: ${phone}`,
    doc ? `• Documento: ${doc}` : null,
    ``,
    `Quiero reservar estos productos. ¿Me comparten los medios de pago para realizar el anticipo de ${fmt(totalAdvance)} y confirmar mi pedido?`
  ].filter(l => l !== null).join('\n');

  const url = `https://wa.me/${WHATSAPP_NUMBER}?text=${encodeURIComponent(lines)}`;
  window.location.href = url;
  clearCart();
}

function openCheckout(){
  const cartPanel = document.getElementById('cartPanel');
  const checkoutOverlay = document.getElementById('checkoutOverlay');
  cartPanel.classList.add('hidden');
  renderInto('checkoutItemsList', 'checkoutSubtotal', 'checkoutShipping', 'checkoutTotal');
  checkoutOverlay.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeCheckout(){
  document.getElementById('checkoutOverlay').classList.remove('open');
  document.body.style.overflow = '';
}

export function initCart(){
  renderAll();
  const cartPanel = document.getElementById('cartPanel');
  const checkoutOverlay = document.getElementById('checkoutOverlay');

  document.querySelectorAll('.cart-icon-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> cartPanel.classList.toggle('hidden'));
  });
  document.getElementById('cartCloseBtn').addEventListener('click', ()=> cartPanel.classList.add('hidden'));
  document.getElementById('checkoutBtn').addEventListener('click', openCheckout);
  document.getElementById('checkoutCloseBtn').addEventListener('click', closeCheckout);
  checkoutOverlay.addEventListener('click', (e)=>{ if(e.target===checkoutOverlay) closeCheckout(); });
  document.addEventListener('keydown', (e)=>{ if(e.key==='Escape' && checkoutOverlay.classList.contains('open')) closeCheckout(); });

  document.getElementById('sendCartBtn').addEventListener('click', sendCartWhatsapp);

  filterDigitsInput('shipPhone', 10);
  filterDigitsInput('shipDoc', 20);
  filterNameCityInput('shipName');
  filterNameCityInput('shipCity');
}
