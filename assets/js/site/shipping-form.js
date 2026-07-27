/* ===================== VALIDACIONES DE FORMULARIO ===================== */
export const NAME_CITY_REGEX = /^[A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]*$/;

export function filterDigitsInput(id, maxLen){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', ()=>{
    let v = el.value.replace(/[^0-9]/g,'');
    if(maxLen) v = v.slice(0, maxLen);
    el.value = v;
  });
}

export function filterNameCityInput(id){
  const el = document.getElementById(id);
  if(!el) return;
  el.addEventListener('input', ()=>{
    el.value = el.value.replace(/[^A-Za-zÁÉÍÓÚáéíóúÑñÜü\s]/g,'');
  });
}

export function setFieldError(id, msg){
  const el = document.getElementById(id);
  if(el) el.textContent = msg || '';
}

export function validateShippingForm(){
  const name = document.getElementById('shipName').value.trim();
  const city = document.getElementById('shipCity').value.trim();
  const address = document.getElementById('shipAddress').value.trim();
  const phone = document.getElementById('shipPhone').value.trim();
  const doc = document.getElementById('shipDoc').value.trim();
  const reqNote = document.getElementById('reqNote');

  let ok = true;
  setFieldError('shipNameErr','');
  setFieldError('shipCityErr','');
  setFieldError('shipPhoneErr','');
  setFieldError('shipDocErr','');
  setFieldError('shipAddressErr','');
  reqNote.textContent = '';

  if(!name || !NAME_CITY_REGEX.test(name)){
    setFieldError('shipNameErr', 'Por favor ingresa un nombre válido (solo letras y espacios).');
    ok = false;
  }
  if(!city || !NAME_CITY_REGEX.test(city)){
    setFieldError('shipCityErr', 'Por favor ingresa una ciudad válida (solo letras y espacios).');
    ok = false;
  }
  if(!/^[0-9]{10}$/.test(phone)){
    setFieldError('shipPhoneErr', 'Por favor, ingresa un número de teléfono válido de 10 dígitos.');
    ok = false;
  }
  if(doc && (!/^[0-9]+$/.test(doc) || doc.length > 20)){
    setFieldError('shipDocErr', 'El número de identificación debe contener solo números (máx. 20 dígitos).');
    ok = false;
  }
  if(!address){
    setFieldError('shipAddressErr', 'Por favor ingresa tu dirección exacta para continuar.');
    ok = false;
  }

  return ok;
}
