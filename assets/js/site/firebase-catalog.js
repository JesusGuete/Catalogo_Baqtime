import { ALL_PRODUCTS } from './catalog-data.js';
import { state } from './state.js';

// ===== Fotos administradas por la clienta (Firebase) =====
const firebaseConfig = {
  apiKey: "AIzaSyB9wJvA0Wz2tD7Ia19sDiO0gXiK19ESp80",
  authDomain: "baqtimecatalogo.firebaseapp.com",
  databaseURL: "https://baqtimecatalogo-default-rtdb.firebaseio.com",
  projectId: "baqtimecatalogo",
  storageBucket: "baqtimecatalogo.firebasestorage.app",
  messagingSenderId: "119191612833",
  appId: "1:119191612833:web:341137d315a8c74fdaafe0"
};

let productPhotosRef = null;
let customProductsRef = null;
let deletedProductsRef = null;
let firebaseInitFailed = false;

// If the gstatic.com CDN is blocked/offline, `firebase` is undefined and referencing it
// throws a synchronous ReferenceError. Previously this ran at top level in index.html and
// would kill the whole (classic) script — this try/catch is what lets first paint (already
// complete by the time main.js reaches this import — see main.js) survive that outage.
try{
  firebase.initializeApp(firebaseConfig);
  productPhotosRef = firebase.database().ref('productPhotos');
  customProductsRef = firebase.database().ref('customProducts');
  deletedProductsRef = firebase.database().ref('deletedProducts');
}catch(e){
  firebaseInitFailed = true;
  console.warn('No se pudo inicializar Firebase', e);
}

export async function applyFirebaseCustomProducts(customSnap){
  try{
    if(customSnap.status !== 'fulfilled') throw customSnap.reason;
    const data = customSnap.value.val() || {};
    Object.values(data).forEach(p=>{
      if(!ALL_PRODUCTS.find(x=>x.id===p.id)) ALL_PRODUCTS.push(p);
    });
  }catch(e){
    console.warn('No se pudieron cargar los productos nuevos', e);
  }
}

export async function applyFirebasePhotos(){
  if(firebaseInitFailed) return;
  const [customSnap, delSnap, photosSnap, overridesSnap, orderSnap] = await Promise.allSettled([
    customProductsRef.once('value'),
    deletedProductsRef.once('value'),
    productPhotosRef.once('value'),
    firebase.database().ref('productOverrides').once('value'),
    firebase.database().ref('productOrder').once('value'),
  ]);
  await applyFirebaseCustomProducts(customSnap);
  try{
    if(delSnap.status !== 'fulfilled') throw delSnap.reason;
    const deleted = delSnap.value.val() || {};
    for(let i = ALL_PRODUCTS.length - 1; i >= 0; i--){
      if(deleted[ALL_PRODUCTS[i].id]) ALL_PRODUCTS.splice(i,1);
    }
  }catch(e){
    console.warn('No se pudieron cargar los productos eliminados', e);
  }
  try{
    if(photosSnap.status !== 'fulfilled') throw photosSnap.reason;
    const data = photosSnap.value.val() || {};
    ALL_PRODUCTS.forEach(p=>{
      const photos = data[p.id];
      if(photos && photos.length){
        p.img = photos[0];
        p.gallery = photos.length > 1 ? photos : undefined;
      }
    });
  }catch(e){
    console.warn('No se pudieron cargar las fotos actualizadas', e);
  }
  try{
    if(overridesSnap.status !== 'fulfilled') throw overridesSnap.reason;
    const overrides = overridesSnap.value.val() || {};
    ALL_PRODUCTS.forEach(p=>{
      if(overrides[p.id]){
        if(overrides[p.id].name) p.name = overrides[p.id].name;
        if(overrides[p.id].variant !== undefined) p.variant = overrides[p.id].variant;
      }
    });
  }catch(e){
    console.warn('No se pudieron cargar los nombres actualizados', e);
  }
  try{
    if(orderSnap.status !== 'fulfilled') throw orderSnap.reason;
    const orders = orderSnap.value.val() || {};
    const categoryKeys = [...new Set(ALL_PRODUCTS.map(p=>p.category))];
    let sorted = [];
    categoryKeys.forEach(catKey=>{
      const inCat = ALL_PRODUCTS.filter(p=>p.category===catKey);
      const order = orders[catKey];
      if(order && order.length){
        const known = inCat.filter(p=>order.includes(p.id)).sort((a,b)=>order.indexOf(a.id)-order.indexOf(b.id));
        const unknown = inCat.filter(p=>!order.includes(p.id));
        sorted = sorted.concat(known, unknown);
      } else {
        sorted = sorted.concat(inCat);
      }
    });
    ALL_PRODUCTS.length = 0;
    ALL_PRODUCTS.push(...sorted);
  }catch(e){
    console.warn('No se pudo aplicar el orden de productos', e);
  }
  state.firebasePhotosLoaded = true;
}
