import { fmt } from './pricing.js';
import { escapeHtml } from '../shared/escape.js';

// ===== Carrito — Fase 1 =====
// Guarda cada línea en localStorage (así no se pierde si el cliente recarga la página
// por accidente). Cada línea guarda todo lo que después hará falta para el mensaje de
// WhatsApp (Fase 3): producto, color/variante, iniciales, color de iniciales, precio.
// No hay "cantidad": agregar el mismo producto dos veces crea dos líneas separadas
// (por ejemplo, el mismo Tote Bag pero con iniciales distintas para dos personas).
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
export function getCartTotal(){ return cart.reduce((sum, item)=> sum + item.price + item.extra, 0); }

export function addToCart(item){
  cart.push({ id: 'line_' + Date.now() + '_' + Math.random().toString(36).slice(2), ...item });
  saveCart();
  renderCartUI();
}

export function removeFromCart(lineId){
  cart = cart.filter(item => item.id !== lineId);
  saveCart();
  renderCartUI();
}

// Detalle legible de una línea, para mostrarla en el panel (color/variante + iniciales).
function lineDetail(item){
  const parts = [];
  if(item.variant) parts.push(item.variant);
  else if(item.color) parts.push(item.color);
  if(item.initials) parts.push(`Iniciales: ${item.initials} (${item.initialsColorName})`);
  return parts.join(' · ');
}

function renderCartBadge(){
  const count = getCartCount();
  document.querySelectorAll('.cart-count').forEach(badge=>{
    badge.textContent = count;
    badge.classList.toggle('hidden', count===0);
  });
}

function renderCartUI(){
  renderCartBadge();
  const listEl = document.getElementById('cartItemsList');
  listEl.innerHTML = '';
  if(!cart.length){
    listEl.innerHTML = '<p class="cart-empty">Tu carrito está vacío.</p>';
  } else {
    cart.forEach(item=>{
      const row = document.createElement('div');
      row.className = 'cart-line';
      row.innerHTML = `
        <div>
          <p class="cart-line-name">${escapeHtml(item.name)}</p>
          <p class="cart-line-detail">${escapeHtml(lineDetail(item))}</p>
          <p class="cart-line-price mono">${fmt(item.price + item.extra)}</p>
        </div>
        <button type="button" class="cart-line-remove" data-id="${item.id}" aria-label="Quitar del carrito">×</button>
      `;
      listEl.appendChild(row);
    });
    listEl.querySelectorAll('.cart-line-remove').forEach(btn=>{
      btn.addEventListener('click', ()=> removeFromCart(btn.dataset.id));
    });
  }
  document.getElementById('cartTotal').textContent = fmt(getCartTotal());
}

export function initCart(){
  renderCartUI();
  const panel = document.getElementById('cartPanel');
  document.querySelectorAll('.cart-icon-btn').forEach(btn=>{
    btn.addEventListener('click', ()=> panel.classList.toggle('hidden'));
  });
  document.getElementById('cartCloseBtn').addEventListener('click', ()=> panel.classList.add('hidden'));
}
