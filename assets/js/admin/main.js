// Admin panel entry point. Moved verbatim from the former inline <script> in admin.html.
// Loaded as an ES module, so nothing here leaks to the global scope and every control
// is wired explicitly below instead of through inline onclick attributes.
import { DEFAULT_PHOTOS } from './default-photos.js';
import { escapeHtml } from '../shared/escape.js';

const firebaseConfig = {
  apiKey: "AIzaSyB9wJvA0Wz2tD7Ia19sDiO0gXiK19ESp80",
  authDomain: "baqtimecatalogo.firebaseapp.com",
  databaseURL: "https://baqtimecatalogo-default-rtdb.firebaseio.com",
  projectId: "baqtimecatalogo",
  storageBucket: "baqtimecatalogo.firebasestorage.app",
  messagingSenderId: "119191612833",
  appId: "1:119191612833:web:341137d315a8c74fdaafe0"
};
firebase.initializeApp(firebaseConfig);
const db = firebase.database();
const auth = firebase.auth();
const storage = firebase.storage();

const DRAFT_NODES = ["productPhotos", "customProducts", "deletedProducts", "productOverrides", "productOrder"];

document.getElementById('confirmChangesBtn').addEventListener('click', ()=>{
  if(!confirm('¿Quieres confirmar todos los cambios pendientes y actualizar el catálogo real ahora?')) return;
  document.getElementById('confirmPasswordInput').value = '';
  document.getElementById('confirmPasswordError').textContent = '';
  const overlay = document.getElementById('confirmPasswordOverlay');
  overlay.classList.remove('hidden');
  overlay.querySelector('.modal').focus();
});
function closeConfirmPasswordModal(){
  document.getElementById('confirmPasswordOverlay').classList.add('hidden');
}

// Cierra con Escape el modal que esté visible en ese momento (el "más encima" primero,
// ya que el recortador y el selector de color avanzado pueden abrirse sobre otro modal)
document.addEventListener('keydown', (e)=>{
  if(e.key !== 'Escape') return;
  if(!document.getElementById('cropOverlay').classList.contains('hidden')){ closeCropModal(); return; }
  if(!document.getElementById('colorPickerOverlay').classList.contains('hidden')){ closeColorPicker(); return; }
  if(!document.getElementById('newProductOverlay').classList.contains('hidden')){ closeNewProductModal(); return; }
  if(!document.getElementById('confirmPasswordOverlay').classList.contains('hidden')){ closeConfirmPasswordModal(); return; }
  if(!document.getElementById('productOverlay').classList.contains('hidden')){ closeProductModal(); return; }
});

async function publishChanges(){
  const password = document.getElementById('confirmPasswordInput').value;
  const user = auth.currentUser;
  if(!user){
    document.getElementById('confirmPasswordError').textContent = 'Tu sesión expiró. Vuelve a iniciar sesión.';
    return;
  }
  if(!password){
    document.getElementById('confirmPasswordError').textContent = 'Escribe tu contraseña.';
    return;
  }
  const btn = document.getElementById('confirmChangesBtn');
  btn.disabled = true;
  btn.textContent = 'Actualizando...';
  try{
    // Re-autentica contra Firebase (no contra una clave hardcodeada) antes de publicar
    const credential = firebase.auth.EmailAuthProvider.credential(user.email, password);
    await user.reauthenticateWithCredential(credential);

    // Estado publicado actual de productPhotos, ANTES de sobreescribir (para poder
    // detectar después qué fotos quedaron huérfanas en Storage tras esta publicación)
    const photosBeforeSnap = await db.ref('productPhotos').once('value');
    const photosBefore = photosBeforeSnap.val() || {};

    // Lectura paralela de los 5 nodos _draft
    const snaps = await Promise.all(
      DRAFT_NODES.map(node => db.ref(node + '_draft').once('value'))
    );

    // Construcción del objeto de actualización multi-ruta (5 nodos publicados)
    const updates = {};
    DRAFT_NODES.forEach((node, i) => {
      updates[node] = snaps[i].val() || null;
    });

    // Una única escritura atómica: o se publican los 5 nodos, o no se publica ninguno
    await db.ref().update(updates);

    // Si hay un producto abierto, su referencia pasa a ser el valor recién publicado
    // (tomado de "updates", nunca de workingPhotos genérico, que podría ser de otro producto)
    if(currentProduct && updates['productPhotos'] && updates['productPhotos'][currentProduct.id] !== undefined){
      referencePhotos = [...(updates['productPhotos'][currentProduct.id] || [])];
      updateDiscardButtonState();
    }

    closeConfirmPasswordModal();
    alert('Listo, el catálogo ya quedó actualizado con tus cambios.');

    // Limpieza de imágenes huérfanas en Storage: se ejecuta solo aquí, después de que
    // la publicación ya se completó con éxito, nunca durante la edición de borradores.
    cleanupOrphanedStorage(photosBefore, updates['productPhotos'] || {});
  }catch(e){
    if(e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential'){
      document.getElementById('confirmPasswordError').textContent = 'Contraseña incorrecta.';
    } else {
      alert('Hubo un problema al actualizar. Intenta de nuevo.');
      console.error(e);
    }
  }
  btn.disabled = false;
  btn.textContent = '✓ Confirmar cambios';
}

// Borra de Firebase Storage las fotos que quedaron huérfanas tras una publicación:
// cualquier URL que existía en el productPhotos publicado ANTERIOR y ya no aparece
// en el productPhotos recién publicado (ya sea porque se reemplazó una foto, se
// eliminó una foto puntual, o se eliminó el producto completo). Se ejecuta únicamente
// después de una publicación exitosa; nunca durante la edición de borradores, para no
// afectar "Deshacer cambios" ni "Deshacer último cambio".
async function cleanupOrphanedStorage(photosBefore, photosAfter){
  for(const id of Object.keys(photosBefore)){
    const before = photosBefore[id] || [];
    const after = photosAfter[id] || [];
    const afterSet = new Set(after);
    for(const url of before){
      if(!afterSet.has(url)){
        try{
          const path = decodeURIComponent(url.split('/o/')[1].split('?')[0]);
          await firebase.storage().ref(path).delete();
          console.log('🧹 Imagen huérfana eliminada de Storage:', path);
        }catch(e){
          console.warn('No se pudo borrar una imagen huérfana de Storage:', url, e);
        }
      }
    }
  }
}

let panelInitialized = false;
function tryLogin(){
  const email = document.getElementById('loginEmail').value.trim();
  const password = document.getElementById('pw').value;
  const loginBtn = document.getElementById('loginBtn');
  const loginError = document.getElementById('loginError');
  loginError.textContent = '';
  if(!email || !password){
    loginError.textContent = 'Ingresa correo y contraseña.';
    return;
  }
  loginBtn.disabled = true;
  loginBtn.textContent = 'Entrando...';
  auth.signInWithEmailAndPassword(email, password)
    .catch(()=>{
      // Mensaje genérico: no revelamos si el correo existe o no (buena práctica de seguridad)
      loginError.textContent = 'Correo o contraseña incorrectos.';
    })
    .finally(()=>{
      loginBtn.disabled = false;
      loginBtn.textContent = 'Entrar';
    });
}
document.getElementById('pw').addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });
document.getElementById('loginEmail').addEventListener('keydown', e=>{ if(e.key==='Enter') tryLogin(); });

// El estado real de la sesión (no una variable local) decide si se ve el panel o el login
auth.onAuthStateChanged(user=>{
  if(user){
    document.getElementById('loginBox').style.display='none';
    document.getElementById('panel').style.display='block';
    document.getElementById('sessionEmail').textContent = user.email;
    if(!panelInitialized){
      panelInitialized = true;
      initPanel();
    }
  } else {
    document.getElementById('loginBox').style.display='block';
    document.getElementById('panel').style.display='none';
  }
});

document.getElementById('logoutBtn').addEventListener('click', ()=>{
  auth.signOut();
});


const PRODUCTS = [
  {id:"t1", cat:"Tote Bag", name:"Tote Bag Beige", variant:"Cordones Negros"},
  {id:"t2", cat:"Tote Bag", name:"Tote Bag Beige", variant:"Cordones Beige"},
  {id:"t3", cat:"Tote Bag", name:"Tote Bag Beige", variant:"Cordones Café"},
  {id:"t4", cat:"Tote Bag", name:"Tote Bag Blanco", variant:"Cordones Negros"},
  {id:"t5", cat:"Tote Bag", name:"Tote Bag Mocca", variant:"Cordones Café"},
  {id:"t6", cat:"Tote Bag", name:"Tote Bag Mocca", variant:"Cordones Negros"},
  {id:"t7", cat:"Tote Bag", name:"Tote Bag Negro", variant:"Cordones Negros"},
  {id:"t8", cat:"Tote Bag", name:"Tote Bag Rosado", variant:"Cordones Negros"},
  {id:"t9", cat:"Tote Bag", name:"Tote Bag Rosado", variant:"Cordones Rosado"},
  {id:"t10", cat:"Tote Bag", name:"Tote Bag Verde", variant:"Cordones Negros"},
  {id:"t11", cat:"Tote Bag", name:"Tote Bag Vino", variant:"Cordones Negros"},
  {id:"n1", cat:"Neceser", name:"Neceser Azul"},
  {id:"n2", cat:"Neceser", name:"Neceser Beige"},
  {id:"n3", cat:"Neceser", name:"Neceser Mocca"},
  {id:"n4", cat:"Neceser", name:"Neceser Negro"},
  {id:"n5", cat:"Neceser", name:"Neceser Verde"},
  {id:"n6", cat:"Neceser", name:"Neceser Vino"},
  {id:"l1", cat:"Bag Lumiere", name:"Bag Lumiere Beige"},
  {id:"l2", cat:"Bag Lumiere", name:"Bag Lumiere Negro"},
  {id:"l3", cat:"Bag Lumiere", name:"Bag Lumiere Vino"},
  {id:"tl1", cat:"Tote Bag Luxury", name:"Tote Bag Luxury Beige"},
  {id:"tl2", cat:"Tote Bag Luxury", name:"Tote Bag Luxury Mocca"},
  {id:"tl3", cat:"Tote Bag Luxury", name:"Tote Bag Luxury Negro"},
  {id:"c1", cat:"Cosmetiquera", name:"Cosmetiquera Beige"},
  {id:"c2", cat:"Cosmetiquera", name:"Cosmetiquera Negra"},
  {id:"c3", cat:"Cosmetiquera", name:"Cosmetiquera Rosada"},
  {id:"m1", cat:"Makeup Bag", name:"Makeup Bag Mocca"},
  {id:"m2", cat:"Makeup Bag", name:"Makeup Bag Negra"},
  {id:"m3", cat:"Makeup Bag", name:"Makeup Bag Rosada"},
  {id:"m4", cat:"Makeup Bag", name:"Makeup Bag Vino"},
];

// Configuración por categoría para poder crear modelos nuevos
const CATEGORY_CONFIG = {
  "Tote Bag":        { key:"tote",         price:130000, personalizable:true,  maxInitials:7, hasVariant:true  },
  "Neceser":         { key:"neceser",      price:60000,  personalizable:true,  maxInitials:2, hasVariant:false },
  "Bag Lumiere":     { key:"lumiere",      price:140000, personalizable:false, maxInitials:0, hasVariant:false },
  "Tote Bag Luxury": { key:"tote-luxury",  price:130000, personalizable:true,  maxInitials:2, hasVariant:false },
  "Cosmetiquera":    { key:"cosmetiquera", price:50000,  personalizable:true,  maxInitials:2, hasVariant:false },
  "Makeup Bag":      { key:"makeup-bag",   price:70000,  personalizable:true,  maxInitials:3, hasVariant:false },
};

// Mismo orden en que aparecen las categorías en el catálogo público
const CATEGORY_ORDER = ["Tote Bag", "Tote Bag Luxury", "Bag Lumiere", "Neceser", "Cosmetiquera", "Makeup Bag"];

// Paleta amplia de colores para elegir el color de referencia de un modelo nuevo
const COLOR_PALETTE = [
  {name:"Beige",  hex:"#EDE6D6"},
  {name:"Blanco", hex:"#F2EFE8"},
  {name:"Mocca",  hex:"#6B4A38"},
  {name:"Negro",  hex:"#1A1A1A"},
  {name:"Rosado", hex:"#E9C7CE"},
  {name:"Verde",  hex:"#3B4A34"},
  {name:"Vino",   hex:"#6E1F2A"},
  {name:"Azul",   hex:"#25324A"},
];

let customProductCounter = 0;

// ===== Caché en memoria (evita 1 consulta a Firebase por producto) =====
let photosCache = {};
let orderCache = {};
let overridesCache = {};
let customProductsCache = {};
let deletedProductsCache = {};

async function loadAllDraftData(){
  const [photosSnap, orderSnap, overridesSnap, customSnap, deletedSnap] = await Promise.all([
    db.ref('productPhotos_draft').once('value'),
    db.ref('productOrder_draft').once('value'),
    db.ref('productOverrides_draft').once('value'),
    db.ref('customProducts_draft').once('value'),
    db.ref('deletedProducts_draft').once('value'),
  ]);
  photosCache = photosSnap.val() || {};
  orderCache = orderSnap.val() || {};
  overridesCache = overridesSnap.val() || {};
  customProductsCache = customSnap.val() || {};
  deletedProductsCache = deletedSnap.val() || {};
}

async function ensureDraftSeeded(){
  // Solo la primerísima vez (si TODOS los nodos de borrador están vacíos) migramos
  // lo publicado hacia el borrador, en un solo lote paralelo.
  const cacheByNode = {
    productPhotos: photosCache, productOrder: orderCache, productOverrides: overridesCache,
    customProducts: customProductsCache, deletedProducts: deletedProductsCache
  };
  const needsSeed = DRAFT_NODES.filter(n => Object.keys(cacheByNode[n]).length === 0);
  if(!needsSeed.length) return;
  try{
    const liveSnaps = await Promise.all(needsSeed.map(n=>db.ref(n).once('value')));
    await Promise.all(needsSeed.map((n,i)=>{
      const val = liveSnaps[i].val();
      if(val === null) return Promise.resolve();
      cacheByNode[n] = val;
      if(n==='productPhotos') photosCache = val;
      if(n==='productOrder') orderCache = val;
      if(n==='productOverrides') overridesCache = val;
      if(n==='customProducts') customProductsCache = val;
      if(n==='deletedProducts') deletedProductsCache = val;
      return db.ref(n+'_draft').set(val);
    }));
  }catch(e){ console.warn('No se pudo preparar el borrador inicial', e); }
}

function applyCustomProductsAndDeletions(){
  Object.values(customProductsCache).forEach(p=>{
    if(!PRODUCTS.find(x=>x.id===p.id)){
      PRODUCTS.push({ id:p.id, cat:categoryKeyToLabel(p.category), name:p.name, variant:p.variant||'' });
    }
  });
  for(let i = PRODUCTS.length - 1; i >= 0; i--){
    if(deletedProductsCache[PRODUCTS[i].id]) PRODUCTS.splice(i,1);
  }
}
function categoryKeyToLabel(key){
  const found = Object.entries(CATEGORY_CONFIG).find(([label,cfg])=>cfg.key===key);
  return found ? found[0] : key;
}

function showSaved(){
  const el = document.getElementById('saveMsg');
  el.style.opacity = '1';
  setTimeout(()=>{ el.style.opacity = '0'; }, 1500);
}

function getPhotos(id){
  const val = photosCache[id];
  if(val && val.length) return [...val];
  return DEFAULT_PHOTOS[id] ? [...DEFAULT_PHOTOS[id]] : [];
}
async function commitPhotos(id, arr){
  await db.ref('productPhotos_draft/'+id).set(arr);
  photosCache[id] = arr;
  showSaved();
}

const undoStore = {};
let workingPhotos = [];   // borrador local del producto abierto (sin guardar aún)
let referencePhotos = []; // estado del producto al iniciar esta sesión de edición (para "Deshacer cambios")
let hasUnsavedChanges = false;

function updateDiscardButtonState(){
  const btn = document.getElementById('discardChangesBtn');
  if(!btn) return;
  btn.disabled = (JSON.stringify(workingPhotos) === JSON.stringify(referencePhotos));
}
function markDirty(){
  hasUnsavedChanges = true;
  document.getElementById('saveChangesBtn').disabled = false;
  updateDiscardButtonState();
}

function applyStoredOrder(){
  const cats = [...new Set(PRODUCTS.map(p=>p.cat))];
  for(const cat of cats){
    const cfg = CATEGORY_CONFIG[cat];
    if(!cfg) continue;
    const order = orderCache[cfg.key];
    if(!order || !order.length) continue;
    const catProducts = PRODUCTS.filter(x=>x.cat===cat);
    const others = PRODUCTS.filter(x=>x.cat!==cat);
    const known = catProducts.filter(x=>order.includes(x.id));
    const unknown = catProducts.filter(x=>!order.includes(x.id));
    known.sort((a,b)=> order.indexOf(a.id) - order.indexOf(b.id));
    const sorted = [...known, ...unknown];
    PRODUCTS.length = 0;
    PRODUCTS.push(...others, ...sorted);
  }
}

function applyStoredNames(){
  PRODUCTS.forEach(p=>{
    if(overridesCache[p.id]){
      if(overridesCache[p.id].name) p.name = overridesCache[p.id].name;
      if(overridesCache[p.id].variant !== undefined) p.variant = overridesCache[p.id].variant;
    }
  });
}

async function initPanel(){
  const loadStatus = document.getElementById('loadStatus');
  const loadError = document.getElementById('loadError');
  loadStatus.classList.remove('hidden');
  loadStatus.style.display = 'block';
  loadError.classList.add('hidden');

  try{
    await loadAllDraftData();
    await ensureDraftSeeded();
    applyCustomProductsAndDeletions();
    applyStoredNames();
    applyStoredOrder();
  }catch(e){
    console.error('No se pudieron cargar los productos:', e);
    loadStatus.style.display = 'none';
    loadError.classList.remove('hidden');
    panelInitialized = false; // permite reintentar desde el botón
    return;
  }
  loadStatus.style.display = 'none';

  const groupsEl = document.getElementById('groups');
  groupsEl.innerHTML = '';
  const cats = CATEGORY_ORDER.filter(c=>PRODUCTS.some(p=>p.cat===c));
  for(const cat of cats){
    const group = document.createElement('div');
    group.className = 'cat-group';
    group.innerHTML = `<h2>${cat}</h2>`;
    const grid = document.createElement('div');
    grid.className = 'grid';
    grid.id = 'grid-'+cat.replace(/\s+/g,'_');
    group.appendChild(grid);
    groupsEl.appendChild(group);
    for(const p of PRODUCTS.filter(x=>x.cat===cat)){
      grid.appendChild(renderThumbCard(p));
    }
    grid.appendChild(renderAddCard(cat));
  }
}

document.getElementById('retryLoadBtn').addEventListener('click', ()=>{
  panelInitialized = true;
  initPanel();
});

function renderAddCard(cat){
  const addCard = document.createElement('div');
  addCard.className = 'thumb-card add-card';
  addCard.innerHTML = `
    <div class="thumb" style="display:flex;align-items:center;justify-content:center;flex-direction:column;gap:4px;">
      <span style="font-size:28px;color:var(--ink-soft);">+</span>
      <span style="font-size:11px;color:var(--ink-soft);">Agregar nuevo modelo</span>
    </div>
  `;
  addCard.addEventListener('click', ()=>openNewProductModal(cat));
  return addCard;
}

let newProductCat = null;
let selectedColor = COLOR_PALETTE[2].hex;

function renderColorPalette(){
  const el = document.getElementById('colorPalette');
  el.innerHTML = '';
  COLOR_PALETTE.forEach(c=>{
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:3px;cursor:pointer;';
    wrap.innerHTML = `
      <div style="width:100%;aspect-ratio:1;border-radius:50%;background:${c.hex};border:2px solid ${c.hex===selectedColor?'var(--ink)':'transparent'};box-shadow:0 0 0 1px var(--border) inset;"></div>
      <span style="font-size:9px;color:var(--ink-soft);">${c.name}</span>
    `;
    wrap.addEventListener('click', ()=>{
      selectedColor = c.hex;
      document.getElementById('selectedColorPreview').style.background = selectedColor;
      if(!document.getElementById('newColorName').value.trim()) document.getElementById('newColorName').value = c.name;
      renderColorPalette();
    });
    el.appendChild(wrap);
  });
}

function openNewProductModal(cat){
  newProductCat = cat;
  const cfg = CATEGORY_CONFIG[cat];
  document.getElementById('newProductCatLabel').textContent = cat;
  document.getElementById('newColorName').value = '';
  document.getElementById('newVariantName').value = '';
  document.getElementById('newVariantWrap').style.display = cfg.hasVariant ? 'block' : 'none';
  document.getElementById('colorSectionWrap').style.display = cfg.hasVariant ? 'none' : 'block';
  document.getElementById('newProductError').textContent = '';
  selectedColor = COLOR_PALETTE[2].hex;
  document.getElementById('selectedColorPreview').style.background = selectedColor;
  renderColorPalette();
  const overlay = document.getElementById('newProductOverlay');
  overlay.classList.remove('hidden');
  overlay.querySelector('.modal').focus();
}
function closeNewProductModal(){
  document.getElementById('newProductOverlay').classList.add('hidden');
}

async function createNewProduct(){
  const cfg = CATEGORY_CONFIG[newProductCat];
  const colorName = document.getElementById('newColorName').value.trim();
  const variantName = document.getElementById('newVariantName').value.trim();
  const errEl = document.getElementById('newProductError');
  if(!colorName){ errEl.textContent = 'Escribe el nombre del color.'; return; }
  if(cfg.hasVariant && !variantName){ errEl.textContent = 'Escribe la variante.'; return; }

  const id = 'custom_' + Date.now();
  const name = `${newProductCat} ${colorName}`;
  const productData = {
    id, category: cfg.key, name, color: colorName,
    price: cfg.price, personalizable: cfg.personalizable, groupKey: colorName
  };
  if(!cfg.hasVariant) productData.hex = selectedColor;
  if(cfg.hasVariant) productData.variant = variantName;
  if(cfg.maxInitials) productData.maxInitials = cfg.maxInitials;

  await db.ref('customProducts_draft/'+id).set(productData);
  customProductsCache[id] = productData;

  const p = { id, cat: newProductCat, name, variant: variantName };
  PRODUCTS.push(p);
  const grid = document.getElementById('grid-'+newProductCat.replace(/\s+/g,'_'));
  const addCardEl = grid.querySelector('.add-card');
  const newCard = renderThumbCard(p);
  grid.insertBefore(newCard, addCardEl);

  closeNewProductModal();
  openProductModal(p);
}

// ===== Selector de color avanzado (estilo Windows) =====
let pickerHue = 210, pickerSat = 60, pickerVal = 40;

function hsvToHex(h,s,v){
  s/=100; v/=100;
  const c = v*s, x = c*(1-Math.abs((h/60)%2-1)), m = v-c;
  let r,g,b;
  if(h<60){ r=c;g=x;b=0; } else if(h<120){ r=x;g=c;b=0; }
  else if(h<180){ r=0;g=c;b=x; } else if(h<240){ r=0;g=x;b=c; }
  else if(h<300){ r=x;g=0;b=c; } else { r=c;g=0;b=x; }
  const R=Math.round((r+m)*255), G=Math.round((g+m)*255), B=Math.round((b+m)*255);
  return '#'+[R,G,B].map(n=>n.toString(16).padStart(2,'0')).join('');
}
function hexToHsv(hex){
  const r=parseInt(hex.substr(1,2),16)/255, g=parseInt(hex.substr(3,2),16)/255, b=parseInt(hex.substr(5,2),16)/255;
  const max=Math.max(r,g,b), min=Math.min(r,g,b), d=max-min;
  let h=0;
  if(d!==0){
    if(max===r) h=60*(((g-b)/d)%6);
    else if(max===g) h=60*((b-r)/d+2);
    else h=60*((r-g)/d+4);
  }
  if(h<0) h+=360;
  const s = max===0 ? 0 : d/max*100;
  const v = max*100;
  return {h,s,v};
}

function drawSvCanvas(){
  const canvas = document.getElementById('svCanvas');
  const ctx = canvas.getContext('2d');
  const w = canvas.width, h = canvas.height;
  const base = hsvToHex(pickerHue,100,100);
  ctx.fillStyle = base;
  ctx.fillRect(0,0,w,h);
  const gradWhite = ctx.createLinearGradient(0,0,w,0);
  gradWhite.addColorStop(0,'rgba(255,255,255,1)');
  gradWhite.addColorStop(1,'rgba(255,255,255,0)');
  ctx.fillStyle = gradWhite;
  ctx.fillRect(0,0,w,h);
  const gradBlack = ctx.createLinearGradient(0,0,0,h);
  gradBlack.addColorStop(0,'rgba(0,0,0,0)');
  gradBlack.addColorStop(1,'rgba(0,0,0,1)');
  ctx.fillStyle = gradBlack;
  ctx.fillRect(0,0,w,h);
}
function drawHueCanvas(){
  const canvas = document.getElementById('hueCanvas');
  const ctx = canvas.getContext('2d');
  const grad = ctx.createLinearGradient(0,0,canvas.width,0);
  for(let i=0;i<=360;i+=30) grad.addColorStop(i/360, hsvToHex(i,100,100));
  ctx.fillStyle = grad;
  ctx.fillRect(0,0,canvas.width,canvas.height);
}
function updatePickerFromState(){
  const hex = hsvToHex(pickerHue, pickerSat, pickerVal);
  document.getElementById('hexInput').value = hex;
  document.getElementById('pickerPreview').style.background = hex;
  const canvas = document.getElementById('svCanvas');
  const cursor = document.getElementById('svCursor');
  cursor.style.left = (pickerSat/100*canvas.clientWidth)+'px';
  cursor.style.top = ((100-pickerVal)/100*canvas.clientHeight)+'px';
}
function svPointerHandler(e){
  const canvas = document.getElementById('svCanvas');
  const rect = canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  let x = (point.clientX - rect.left)/rect.width;
  let y = (point.clientY - rect.top)/rect.height;
  x = Math.max(0, Math.min(1,x)); y = Math.max(0, Math.min(1,y));
  pickerSat = x*100; pickerVal = (1-y)*100;
  updatePickerFromState();
}
function huePointerHandler(e){
  const canvas = document.getElementById('hueCanvas');
  const rect = canvas.getBoundingClientRect();
  const point = e.touches ? e.touches[0] : e;
  let x = (point.clientX - rect.left)/rect.width;
  x = Math.max(0, Math.min(1,x));
  pickerHue = x*360;
  drawSvCanvas();
  updatePickerFromState();
}

document.getElementById('moreColorsBtn').addEventListener('click', ()=>{
  const hsv = hexToHsv(selectedColor);
  pickerHue = hsv.h; pickerSat = hsv.s; pickerVal = hsv.v;
  const overlay = document.getElementById('colorPickerOverlay');
  overlay.classList.remove('hidden');
  overlay.querySelector('.modal').focus();
  setTimeout(()=>{ drawSvCanvas(); drawHueCanvas(); updatePickerFromState(); }, 0);
});
function closeColorPicker(){
  document.getElementById('colorPickerOverlay').classList.add('hidden');
}
function acceptColorPicker(){
  selectedColor = document.getElementById('hexInput').value;
  document.getElementById('selectedColorPreview').style.background = selectedColor;
  renderColorPalette();
  closeColorPicker();
}

document.addEventListener('DOMContentLoaded', ()=>{
  const svCanvas = document.getElementById('svCanvas');
  let svDragging = false;
  svCanvas.addEventListener('mousedown', (e)=>{ svDragging = true; svPointerHandler(e); });
  window.addEventListener('mousemove', (e)=>{ if(svDragging) svPointerHandler(e); });
  window.addEventListener('mouseup', ()=>{ svDragging = false; });
  svCanvas.addEventListener('touchstart', (e)=>{ svDragging = true; svPointerHandler(e); }, {passive:true});
  svCanvas.addEventListener('touchmove', (e)=>{ if(svDragging) svPointerHandler(e); }, {passive:true});
  svCanvas.addEventListener('touchend', ()=>{ svDragging = false; });

  const hueCanvas = document.getElementById('hueCanvas');
  let hueDragging = false;
  hueCanvas.addEventListener('mousedown', (e)=>{ hueDragging = true; huePointerHandler(e); });
  window.addEventListener('mousemove', (e)=>{ if(hueDragging) huePointerHandler(e); });
  window.addEventListener('mouseup', ()=>{ hueDragging = false; });
  hueCanvas.addEventListener('touchstart', (e)=>{ hueDragging = true; huePointerHandler(e); }, {passive:true});
  hueCanvas.addEventListener('touchmove', (e)=>{ if(hueDragging) huePointerHandler(e); }, {passive:true});
  hueCanvas.addEventListener('touchend', ()=>{ hueDragging = false; });

  document.getElementById('hexInput').addEventListener('change', (e)=>{
    let hex = e.target.value.trim();
    if(!/^#[0-9A-Fa-f]{6}$/.test(hex)) return;
    const hsv = hexToHsv(hex);
    pickerHue = hsv.h; pickerSat = hsv.s; pickerVal = hsv.v;
    drawSvCanvas();
    updatePickerFromState();
  });
});

function renderThumbCard(p){
  const photos = getPhotos(p.id);
  const card = document.createElement('div');
  card.className = 'thumb-card';
  card.id = 'card-'+p.id;
  card.dataset.id = p.id;
  card.dataset.cat = p.cat;
  card.draggable = true;
  card.style.position = 'relative';
  card.innerHTML = `
    <button class="delete-product-btn" title="Eliminar producto" aria-label="Eliminar ${escapeHtml(p.name)}" data-id="${escapeHtml(p.id)}">🗑</button>
    <div class="name">${escapeHtml(p.name)}</div>
    <div class="variant">${escapeHtml(p.variant||'')}</div>
    <div class="thumb">${photos[0] ? `<img src="${escapeHtml(photos[0])}" alt="Foto de ${escapeHtml(p.name)}">` : '<div class="empty">Sin foto</div>'}</div>
    <div class="count">${photos.length} foto${photos.length!==1?'s':''}</div>
  `;
  card.addEventListener('click', ()=>openProductModal(p));
  card.querySelector('.delete-product-btn').addEventListener('click', (e)=>{
    e.stopPropagation();
    deleteProduct(p);
  });
  card.addEventListener('dragstart', ()=>{ productDragId = p.id; productDragCat = p.cat; card.classList.add('dragging-card'); });
  card.addEventListener('dragend', ()=>{ card.classList.remove('dragging-card'); });
  card.addEventListener('dragover', (e)=>{
    e.preventDefault();
    if(card.dataset.cat === productDragCat) card.classList.add('drop-target-card');
  });
  card.addEventListener('dragleave', ()=>{ card.classList.remove('drop-target-card'); });
  card.addEventListener('drop', async (e)=>{
    e.preventDefault();
    card.classList.remove('drop-target-card');
    if(productDragId===null || productDragId===p.id) return;
    if(card.dataset.cat !== productDragCat) return;
    await reorderProduct(p.cat, productDragId, p.id);
    productDragId = null;
  });
  return card;
}
let productDragId = null;
let productDragCat = null;

async function reorderProduct(cat, draggedId, targetId){
  const catProducts = PRODUCTS.filter(x=>x.cat===cat);
  const draggedIdx = catProducts.findIndex(x=>x.id===draggedId);
  const targetIdx = catProducts.findIndex(x=>x.id===targetId);
  if(draggedIdx<0 || targetIdx<0) return;
  const [moved] = catProducts.splice(draggedIdx,1);
  catProducts.splice(targetIdx,0,moved);

  // reconstruir PRODUCTS respetando el nuevo orden solo para esta categoría
  const others = PRODUCTS.filter(x=>x.cat!==cat);
  PRODUCTS.length = 0;
  PRODUCTS.push(...others, ...catProducts);

  const cfg = CATEGORY_CONFIG[cat];
  const newOrder = catProducts.map(x=>x.id);
  orderCache[cfg.key] = newOrder;
  await db.ref('productOrder_draft/'+cfg.key).set(newOrder);

  const grid = document.getElementById('grid-'+cat.replace(/\s+/g,'_'));
  const addCardEl = grid.querySelector('.add-card');
  grid.innerHTML = '';
  for(const cp of catProducts) grid.appendChild(renderThumbCard(cp));
  grid.appendChild(addCardEl);
  showSaved();
}

async function deleteProduct(p){
  if(!confirm(`¿Eliminar "${p.name}${p.variant ? ' – '+p.variant : ''}" del catálogo? Esta acción no se puede deshacer.`)) return false;
  try{
    if(p.id.startsWith('custom_')){
      await db.ref('customProducts_draft/'+p.id).remove();
      delete customProductsCache[p.id];
    } else {
      await db.ref('deletedProducts_draft/'+p.id).set(true);
      deletedProductsCache[p.id] = true;
    }
    await db.ref('productPhotos_draft/'+p.id).remove();
    await db.ref('productOverrides_draft/'+p.id).remove();
  }catch(e){
    console.error('No se pudo eliminar el producto:', e);
    alert('No se pudo eliminar el producto. Revisa tu conexión e intenta de nuevo.');
    return false;
  }
  delete photosCache[p.id];
  delete overridesCache[p.id];
  const idx = PRODUCTS.findIndex(x=>x.id===p.id);
  if(idx>-1) PRODUCTS.splice(idx,1);
  const el = document.getElementById('card-'+p.id);
  if(el) el.remove();
  if(currentProduct && currentProduct.id === p.id){
    document.getElementById('productOverlay').classList.add('hidden');
    currentProduct = null;
  }
  return true;
}

async function refreshThumbCard(id){
  const p = PRODUCTS.find(x=>x.id===id);
  const el = document.getElementById('card-'+id);
  if(!el || !p) return;
  const newCard = renderThumbCard(p);
  el.replaceWith(newCard);
}

let currentProduct = null;
let dragIndex = null;
let currentPreviewIdx = 0;

async function openProductModal(p){
  currentProduct = p;
  workingPhotos = await getPhotos(p.id);
  referencePhotos = [...workingPhotos];
  hasUnsavedChanges = false;
  document.getElementById('modalName').textContent = p.name;
  document.getElementById('modalVariant').textContent = p.variant || '';
  document.getElementById('renameNameInput').value = p.name;
  document.getElementById('renameVariantInput').value = p.variant || '';
  document.getElementById('undoBtn').disabled = !undoStore[p.id];
  document.getElementById('saveChangesBtn').disabled = true;
  updateDiscardButtonState();
  document.getElementById('modalStatus').textContent = '';
  renderModalContent();
  const overlay = document.getElementById('productOverlay');
  overlay.classList.remove('hidden');
  overlay.querySelector('.modal').focus();
}
function closeProductModal(){
  if(hasUnsavedChanges){
    if(!confirm('Tienes cambios sin guardar en este producto. ¿Cerrar de todas formas y perderlos?')) return;
  }
  document.getElementById('productOverlay').classList.add('hidden');
  refreshThumbCard(currentProduct.id);
  currentProduct = null;
}

document.getElementById('saveChangesBtn').addEventListener('click', async ()=>{
  const id = currentProduct.id;
  const btn = document.getElementById('saveChangesBtn');
  const statusEl = document.getElementById('modalStatus');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Guardando...';
  statusEl.textContent = '';
  try{
    await commitPhotos(id, workingPhotos);
    hasUnsavedChanges = false;
    statusEl.textContent = 'Cambios guardados en el catálogo.';
  }catch(e){
    console.error('No se pudo guardar el borrador de fotos:', e);
    statusEl.textContent = 'No se pudo guardar. Revisa tu conexión e intenta de nuevo.';
    btn.disabled = false; // deja reintentar
  }
  btn.textContent = originalText;
});

document.getElementById('renameSaveBtn').addEventListener('click', async ()=>{
  const newName = document.getElementById('renameNameInput').value.trim();
  const newVariant = document.getElementById('renameVariantInput').value.trim();
  if(!newName){ alert('El nombre no puede quedar vacío.'); return; }
  const btn = document.getElementById('renameSaveBtn');
  const statusEl = document.getElementById('modalStatus');
  btn.disabled = true;
  const originalText = btn.textContent;
  btn.textContent = 'Guardando...';
  try{
    await db.ref('productOverrides_draft/'+currentProduct.id).set({ name:newName, variant:newVariant });
    overridesCache[currentProduct.id] = { name:newName, variant:newVariant };
    currentProduct.name = newName;
    currentProduct.variant = newVariant;
    document.getElementById('modalName').textContent = newName;
    document.getElementById('modalVariant').textContent = newVariant;
    statusEl.textContent = 'Nombre guardado.';
    showSaved();
    refreshThumbCard(currentProduct.id);
  }catch(e){
    console.error('No se pudo guardar el nombre/variante:', e);
    statusEl.textContent = 'No se pudo guardar el nombre. Revisa tu conexión e intenta de nuevo.';
  }
  btn.disabled = false;
  btn.textContent = originalText;
});

document.getElementById('deleteProductBtn').addEventListener('click', async ()=>{
  const ok = await deleteProduct(currentProduct);
  if(ok) currentProduct = null;
});

function renderModalContent(){
  const photos = workingPhotos;
  currentPreviewIdx = 0;
  const productLabel = escapeHtml(currentProduct.name);
  const mainEl = document.getElementById('modalMain');
  mainEl.innerHTML = photos[0] ? `<img src="${escapeHtml(photos[0])}" alt="Foto principal de ${productLabel}">` : '<div class="empty">Sin foto todavía</div>';

  const stripEl = document.getElementById('modalThumbs');
  stripEl.innerHTML = '';
  photos.forEach((ph, idx)=>{
    const item = document.createElement('div');
    item.className = 'thumb-item' + (idx===0 ? ' previewing' : '');
    item.draggable = true;
    item.dataset.idx = idx;
    item.innerHTML = `
      <img src="${escapeHtml(ph)}" alt="Foto ${idx+1} de ${productLabel}">
      <div class="icons">
        <button class="icon-del" title="Eliminar" aria-label="Eliminar foto ${idx+1} de ${productLabel}">×</button>
      </div>
      ${idx===0 ? '<div class="badge-main">Principal</div>' : ''}
    `;
    item.querySelector('.icon-del').addEventListener('click', (e)=>{
      e.stopPropagation();
      undoStore[currentProduct.id] = [...workingPhotos];
      workingPhotos.splice(idx,1);
      renderModalContent();
      document.getElementById('undoBtn').disabled = false;
      markDirty();
    });
    item.querySelector('img').addEventListener('click', (e)=>{
      e.stopPropagation();
      currentPreviewIdx = idx;
      document.getElementById('modalMain').innerHTML = `<img src="${escapeHtml(ph)}" alt="Foto ${idx+1} de ${productLabel}">`;
      stripEl.querySelectorAll('.thumb-item').forEach(t=>t.classList.remove('previewing'));
      item.classList.add('previewing');
    });
    item.addEventListener('dragstart', ()=>{ dragIndex = idx; item.classList.add('dragging'); });
    item.addEventListener('dragend', ()=>{ item.classList.remove('dragging'); });
    item.addEventListener('dragover', (e)=>{ e.preventDefault(); item.classList.add('drop-target'); });
    item.addEventListener('dragleave', ()=>{ item.classList.remove('drop-target'); });
    item.addEventListener('drop', (e)=>{
      e.preventDefault();
      item.classList.remove('drop-target');
      const dropIdx = idx;
      if(dragIndex===null || dragIndex===dropIdx) return;
      undoStore[currentProduct.id] = [...workingPhotos];
      const moved = workingPhotos.splice(dragIndex,1)[0];
      workingPhotos.splice(dropIdx,0,moved);
      renderModalContent();
      document.getElementById('undoBtn').disabled = false;
      markDirty();
      dragIndex = null;
    });
    stripEl.appendChild(item);
  });

  const addBtn = document.createElement('label');
  addBtn.className = 'add-thumb';
  addBtn.setAttribute('aria-label', 'Agregar foto');
  addBtn.innerHTML = `+ <input type="file" accept="image/*">`;
  addBtn.querySelector('input').addEventListener('change', (e)=>{
    const file = e.target.files[0];
    if(!file) return;
    const reader = new FileReader();
    reader.onload = ()=>{ openCropModalForNew(currentProduct.id, reader.result); };
    reader.readAsDataURL(file);
  });
  stripEl.appendChild(addBtn);
}

document.getElementById('cropCurrentBtn').addEventListener('click', ()=>{
  if(!workingPhotos.length){ alert('Este producto no tiene fotos todavía.'); return; }
  openCropModal(currentProduct.id, currentPreviewIdx, workingPhotos[currentPreviewIdx]);
});

document.getElementById('discardChangesBtn').addEventListener('click', async ()=>{
  if(JSON.stringify(workingPhotos) === JSON.stringify(referencePhotos)) return;
  if(!confirm('¿Deshacer todos los cambios de esta sesión de edición?')) return;

  workingPhotos = [...referencePhotos];
  renderModalContent();
  updateDiscardButtonState();
  document.getElementById('modalStatus').textContent = 'Deshaciendo...';

  try{
    // Sincroniza el borrador en Firebase para que refleje exactamente lo que se ve
    await commitPhotos(currentProduct.id, workingPhotos);
    hasUnsavedChanges = false;
    document.getElementById('saveChangesBtn').disabled = true;
    document.getElementById('modalStatus').textContent = 'Cambios de esta sesión deshechos.';
  }catch(e){
    console.error(e);
    document.getElementById('modalStatus').textContent = 'No se pudo sincronizar el borrador. Intenta de nuevo.';
  }
});

document.getElementById('undoBtn').addEventListener('click', ()=>{
  const prev = undoStore[currentProduct.id];
  if(!prev) return;
  workingPhotos = prev;
  delete undoStore[currentProduct.id];
  renderModalContent();
  document.getElementById('undoBtn').disabled = true;
  document.getElementById('modalStatus').textContent = 'Cambio deshecho. Dale "Guardar cambios" para confirmar.';
  markDirty();
});

let cropTargetId = null, cropTargetIdx = null, cropIsNew = false;
let cropImgNaturalSrc = null; // fuente original sin tocar
let cropWorkingSrc = null;    // fuente después de rotar/voltear
let cropImgBox = {left:0, top:0, width:0, height:0};
let cropBoxState = {x:0, y:0, w:0, h:0};
let rotationDeg = 0;
let flipH = false;
let aspectMode = 'libre'; // 'libre' | 'cuadrado'
const MIN_CROP = 40;

function rebuildWorkingImage(cb){
  const src = new Image();
  src.crossOrigin = 'anonymous'; // necesario para leer imágenes de Firebase Storage en el canvas
  src.onload = ()=>{
    const rad = rotationDeg * Math.PI/180;
    const w = src.naturalWidth, h = src.naturalHeight;
    const bw = Math.abs(w*Math.cos(rad)) + Math.abs(h*Math.sin(rad));
    const bh = Math.abs(w*Math.sin(rad)) + Math.abs(h*Math.cos(rad));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bw); canvas.height = Math.round(bh);
    const ctx = canvas.getContext('2d');
    ctx.translate(canvas.width/2, canvas.height/2);
    ctx.rotate(rad);
    ctx.scale(flipH ? -1 : 1, 1);
    ctx.drawImage(src, -w/2, -h/2);
    try{
      cropWorkingSrc = canvas.toDataURL('image/jpeg', 0.92);
    }catch(e){
      console.error('No se pudo leer la imagen para recortarla (posible falta de CORS en Firebase Storage):', e);
      alert('No se pudo abrir esta foto para recortar. Si el problema persiste, revisa la configuración CORS de Firebase Storage.');
      closeCropModal();
      return;
    }
    cb();
  };
  src.onerror = (e)=>{
    console.error('No se pudo cargar la imagen para recortar:', e);
    alert('No se pudo cargar la imagen. Revisa tu conexión e intenta de nuevo.');
    closeCropModal();
  };
  src.src = cropImgNaturalSrc;
}

function layoutImageAndDefaultBox(){
  const img = document.getElementById('cropImg');
  img.onload = ()=>{
    const stage = document.getElementById('cropStage');
    const S = stage.clientWidth;
    const scale = Math.min(S/img.naturalWidth, S/img.naturalHeight);
    const dispW = img.naturalWidth*scale, dispH = img.naturalHeight*scale;
    const left = (S-dispW)/2, top = (S-dispH)/2;
    img.style.width = dispW+'px'; img.style.height = dispH+'px';
    img.style.left = left+'px'; img.style.top = top+'px';
    cropImgBox = {left, top, width:dispW, height:dispH};

    const grid = document.getElementById('cropGrid');
    grid.style.left = left+'px'; grid.style.top = top+'px';
    grid.style.width = dispW+'px'; grid.style.height = dispH+'px';

    const initSize = Math.min(dispW, dispH) * 0.85;
    cropBoxState = {
      x: left + (dispW-initSize)/2,
      y: top + (dispH-initSize)/2,
      w: initSize, h: initSize
    };
    updateCropBoxEl();
  };
  img.src = cropWorkingSrc;
}

function openCropModalCommon(dataUrl){
  cropImgNaturalSrc = dataUrl;
  rotationDeg = 0; flipH = false; aspectMode = 'libre';
  document.getElementById('rotateRange').value = 0;
  document.getElementById('rotateVal').textContent = '0°';
  document.getElementById('aspectLabel').textContent = 'Libre';
  rebuildWorkingImage(layoutImageAndDefaultBox);
  const overlay = document.getElementById('cropOverlay');
  overlay.classList.remove('hidden');
  overlay.querySelector('.crop-modal-dark').focus();
}
function openCropModal(id, idx, dataUrl){
  cropTargetId = id; cropTargetIdx = idx; cropIsNew = false;
  openCropModalCommon(dataUrl);
}
function openCropModalForNew(id, dataUrl){
  cropTargetId = id; cropTargetIdx = null; cropIsNew = true;
  openCropModalCommon(dataUrl);
}
function closeCropModal(){
  document.getElementById('cropOverlay').classList.add('hidden');
}

function updateCropBoxEl(){
  const box = document.getElementById('cropBox');
  box.style.left = cropBoxState.x+'px';
  box.style.top = cropBoxState.y+'px';
  box.style.width = cropBoxState.w+'px';
  box.style.height = cropBoxState.h+'px';
  const showEdges = aspectMode === 'libre';
  document.querySelectorAll('.crop-edge').forEach(el=> el.style.display = showEdges ? 'block' : 'none');
}

function clampCropBox(){
  const b = cropImgBox;
  cropBoxState.w = Math.max(MIN_CROP, Math.min(cropBoxState.w, b.width));
  cropBoxState.h = Math.max(MIN_CROP, Math.min(cropBoxState.h, b.height));
  cropBoxState.x = Math.max(b.left, Math.min(cropBoxState.x, b.left + b.width - cropBoxState.w));
  cropBoxState.y = Math.max(b.top, Math.min(cropBoxState.y, b.top + b.height - cropBoxState.h));
}

let cropInteraction = null;

function pointerDown(e, mode, handle){
  const point = e.touches ? e.touches[0] : e;
  cropInteraction = { mode, handle, startX: point.clientX, startY: point.clientY, start: {...cropBoxState} };
  e.stopPropagation();
  e.preventDefault();
}

function pointerMove(e){
  if(!cropInteraction) return;
  const point = e.touches ? e.touches[0] : e;
  const dx = point.clientX - cropInteraction.startX;
  const dy = point.clientY - cropInteraction.startY;
  const s0 = cropInteraction.start;
  const square = aspectMode === 'cuadrado';

  if(cropInteraction.mode === 'move'){
    cropBoxState.x = s0.x + dx;
    cropBoxState.y = s0.y + dy;
  } else if(cropInteraction.mode === 'resize'){
    const h = cropInteraction.handle;
    let nx=s0.x, ny=s0.y, nw=s0.w, nh=s0.h;
    if(square){
      let delta;
      if(h==='br') delta = Math.max(dx,dy);
      else if(h==='tl') delta = -Math.max(dx,dy);
      else if(h==='tr') delta = Math.max(dx,-dy);
      else delta = Math.max(-dx,dy);
      const newSize = Math.max(MIN_CROP, s0.w + delta);
      const grow = newSize - s0.w;
      if(h==='br'){ nw=newSize; nh=newSize; }
      else if(h==='tl'){ nx=s0.x-grow; ny=s0.y-grow; nw=newSize; nh=newSize; }
      else if(h==='tr'){ ny=s0.y-grow; nw=newSize; nh=newSize; }
      else { nx=s0.x-grow; nw=newSize; nh=newSize; }
    } else {
      if(h.includes('l')){ nx = s0.x+dx; nw = s0.w-dx; }
      if(h.includes('r')){ nw = s0.w+dx; }
      if(h.includes('t')){ ny = s0.y+dy; nh = s0.h-dy; }
      if(h.includes('b')){ nh = s0.h+dy; }
    }
    cropBoxState = {x:nx, y:ny, w:Math.max(MIN_CROP,nw), h:Math.max(MIN_CROP,nh)};
  } else if(cropInteraction.mode === 'edge'){
    const h = cropInteraction.handle;
    let nx=s0.x, ny=s0.y, nw=s0.w, nh=s0.h;
    if(h==='l'){ nx = s0.x+dx; nw = s0.w-dx; }
    if(h==='r'){ nw = s0.w+dx; }
    if(h==='t'){ ny = s0.y+dy; nh = s0.h-dy; }
    if(h==='b'){ nh = s0.h+dy; }
    cropBoxState = {x:nx, y:ny, w:Math.max(MIN_CROP,nw), h:Math.max(MIN_CROP,nh)};
  }
  clampCropBox();
  updateCropBoxEl();
}
function pointerUp(){ cropInteraction = null; }

document.addEventListener('DOMContentLoaded', ()=>{
  const box = document.getElementById('cropBox');
  box.addEventListener('mousedown', (e)=>{ if(e.target===box) pointerDown(e,'move'); });
  box.addEventListener('touchstart', (e)=>{ if(e.target===box) pointerDown(e,'move'); }, {passive:false});
  box.querySelectorAll('.crop-handle').forEach(h=>{
    h.addEventListener('mousedown', (e)=>pointerDown(e,'resize',h.dataset.h));
    h.addEventListener('touchstart', (e)=>pointerDown(e,'resize',h.dataset.h), {passive:false});
  });
  box.querySelectorAll('.crop-edge').forEach(h=>{
    h.addEventListener('mousedown', (e)=>pointerDown(e,'edge',h.dataset.h));
    h.addEventListener('touchstart', (e)=>pointerDown(e,'edge',h.dataset.h), {passive:false});
  });
  window.addEventListener('mousemove', pointerMove);
  window.addEventListener('touchmove', pointerMove, {passive:false});
  window.addEventListener('mouseup', pointerUp);
  window.addEventListener('touchend', pointerUp);

  document.getElementById('rotateRange').addEventListener('input', (e)=>{
    rotationDeg = parseInt(e.target.value);
    document.getElementById('rotateVal').textContent = rotationDeg+'°';
    rebuildWorkingImage(layoutImageAndDefaultBox);
  });
  document.getElementById('resetRotateBtn').addEventListener('click', ()=>{
    rotationDeg = 0; flipH = false;
    document.getElementById('rotateRange').value = 0;
    document.getElementById('rotateVal').textContent = '0°';
    rebuildWorkingImage(layoutImageAndDefaultBox);
  });
  document.getElementById('rotateLeftBtn').addEventListener('click', ()=>{
    rotationDeg = ((rotationDeg - 90) % 360);
    if(rotationDeg <= -180) rotationDeg += 360;
    document.getElementById('rotateRange').value = Math.max(-45, Math.min(45, rotationDeg));
    document.getElementById('rotateVal').textContent = rotationDeg+'°';
    rebuildWorkingImage(layoutImageAndDefaultBox);
  });
  document.getElementById('flipBtn').addEventListener('click', ()=>{
    flipH = !flipH;
    rebuildWorkingImage(layoutImageAndDefaultBox);
  });
  document.getElementById('aspectBtn').addEventListener('click', ()=>{
    aspectMode = aspectMode === 'libre' ? 'cuadrado' : 'libre';
    document.getElementById('aspectLabel').textContent = aspectMode === 'libre' ? 'Libre' : 'Cuadrado';
    if(aspectMode === 'cuadrado'){
      const size = Math.min(cropBoxState.w, cropBoxState.h);
      cropBoxState.w = size; cropBoxState.h = size;
      clampCropBox();
      updateCropBoxEl();
    } else {
      updateCropBoxEl();
    }
  });
});

async function saveCrop(){
  const outputW = 1000, outputH = 1000;
  const b = cropImgBox;
  const img = document.getElementById('cropImg');
  const scaleX = img.naturalWidth / b.width;
  const scaleY = img.naturalHeight / b.height;

  const relX = (cropBoxState.x - b.left) * scaleX;
  const relY = (cropBoxState.y - b.top) * scaleY;
  const relW = cropBoxState.w * scaleX;
  const relH = cropBoxState.h * scaleY;

  const canvas = document.createElement('canvas');
  canvas.width = outputW; canvas.height = outputH;
  const ctx = canvas.getContext('2d');
  const tempImg = new Image();
  await new Promise(res=>{ tempImg.onload=res; tempImg.src = cropWorkingSrc; });
  ctx.drawImage(tempImg, relX, relY, relW, relH, 0, 0, outputW, outputH);

  // Convierte el recorte a WebP (calidad 0.80) como Blob, en vez de Base64
  const blob = await new Promise(res => canvas.toBlob(res, 'image/webp', 0.80));
  if(!blob){
    alert('No se pudo procesar la imagen. Intenta de nuevo.');
    return;
  }

  const doneBtn = document.getElementById('saveCropBtn');
  if(doneBtn) doneBtn.textContent = 'Subiendo...';

  let downloadUrl;
  try{
    const path = `product-images/${currentProduct.id}/${Date.now()}.webp`;
    const fileRef = storage.ref(path);
    await fileRef.put(blob, { contentType: 'image/webp' });
    downloadUrl = await fileRef.getDownloadURL();
  }catch(e){
    console.error(e);
    alert('No se pudo subir la foto a Firebase Storage. Revisa tu conexión e intenta de nuevo.');
    if(doneBtn) doneBtn.textContent = 'Listo';
    return;
  }
  if(doneBtn) doneBtn.textContent = 'Listo';

  undoStore[currentProduct.id] = [...workingPhotos];
  if(cropIsNew){
    workingPhotos.unshift(downloadUrl);
  } else {
    workingPhotos[cropTargetIdx] = downloadUrl;
  }
  closeCropModal();
  renderModalContent();
  document.getElementById('undoBtn').disabled = false;
  markDirty();
}

/* ===== Explicit control wiring (replaces the former inline onclick attributes) ===== */
// Throws on a missing element so a mis-wired control fails loudly instead of silently.
function on(id, event, handler){
  const el = document.getElementById(id);
  if(!el) throw new Error(`Cannot wire #${id} — element not found in admin.html`);
  el.addEventListener(event, handler);
}
on('loginBtn', 'click', tryLogin);
on('closeConfirmPwdX', 'click', closeConfirmPasswordModal);
on('publishConfirmBtn', 'click', publishChanges);
on('closeConfirmPwdBtn', 'click', closeConfirmPasswordModal);
on('closeProductX', 'click', closeProductModal);
on('closeNewProductX', 'click', closeNewProductModal);
on('createProductBtn', 'click', createNewProduct);
on('closeNewProductBtn', 'click', closeNewProductModal);
on('closeColorPickerX', 'click', closeColorPicker);
on('acceptColorBtn', 'click', acceptColorPicker);
on('closeColorPickerBtn', 'click', closeColorPicker);
on('closeCropBtn', 'click', closeCropModal);
on('saveCropBtn', 'click', saveCrop);
