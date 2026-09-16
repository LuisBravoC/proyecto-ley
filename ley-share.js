// ley-share.js — usar en consola de https://tusuper.casaley.com.mx/
// 1) Exportar: leyExportar() -> imprime link viewer.html#c=... y lo copia
// 2) Importar: leyImportar(shareObj | "#c=..." | url) -> reconstruye payload con TU sesión y hace POST bulk_add_to_cart_web
// El link NUNCA incluye CustomerID / token_web / WebId. Solo productos + sucursal.
(function(){
const API = 'https://serviciosapp.casaley.com.mx/rails/api/bulk_add_to_cart_web';
// App React en vivo (GitHub Pages). Los links generados se abren y comparten directo.
const VIEWER_URL = 'https://luisbravoc.github.io/proyecto-ley/';

function b64urlEncode(obj){
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function b64urlDecode(code){
  code = String(code).trim();
  const m = code.match(/#c=([A-Za-z0-9\-_]+)/);
  if (m) code = m[1];
  code = code.replace(/-/g,'+').replace(/_/g,'/');
  while (code.length % 4) code += '=';
  return JSON.parse(decodeURIComponent(escape(atob(code))));
}
function getSession(){
  const USER = JSON.parse(localStorage.getItem('USER') || '{}');
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  const WEBSESSION = localStorage.getItem('WEBSESSION') || '';
  if (!USER.id || !USER.token_web) throw new Error('Sin sesión: inicia sesión en Casa Ley primero (localStorage USER vacío).');
  return { USER, SUC, WEBSESSION };
}
// Nombre de pila para "Creada por …". Solo display, nunca email/teléfono.
function creatorName(n){
  n = String(n || '').trim().split(/\s+/)[0] || '';
  return n.charAt(0).toUpperCase() + n.slice(1).toLowerCase();
}
// Compacto v1: [ProductId, Quantity, artdesc, special_price, normal_price, unitmeasure, picture_name, GRAMS, total]
function leyExportar(){
  const CART = JSON.parse(localStorage.getItem('CART') || '{"products":[]}');
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  const USER = JSON.parse(localStorage.getItem('USER') || '{}');
  const prods = (CART.products || []).map(p => [p.ProductId, p.Quantity, p.artdesc, p.special_price, p.normal_price, p.unitmeasure, p.picture_name, p.GRAMS || 0, p.total]);
  const share = { v: 1, b: SUC.id || '1086', n: SUC.name || '', by: creatorName(USER.name), p: prods };
  const code = b64urlEncode(share);
  const link = VIEWER_URL + '#c=' + code; // comparte esta URL completa
  console.log('Productos:', prods.length, '| Sucursal:', share.b, '| chars:', code.length);
  copyText(link);
  console.log(link);
  return { share, link, code };
}
function copyText(t){
  // uBlock y "Document is not focused" rompen clipboard API: fallback a textarea
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(t).then(
      function(){ console.log('Link copiado al portapapeles.'); },
      function(){ fallbackCopy(t); }
    );
  } else fallbackCopy(t);
}
function fallbackCopy(t){
  try {
    const ta = document.createElement('textarea');
    ta.value = t; ta.style.position = 'fixed'; ta.style.opacity = '0';
    document.body.appendChild(ta); ta.select();
    document.execCommand('copy'); ta.remove();
    console.log('Link copiado (fallback).');
  } catch(e){ console.log('Copia manual: selecciona el link de arriba.'); }
}
// Reconstruye un product CART completo a partir de la tupla compacta
function toCartProduct(r){
  const [ProductId, Quantity, artdesc, special_price, normal_price, unitmeasure, picture_name, GRAMS, total] = r;
  const isKG = unitmeasure === 'KG';
  return {
    ProductId, msi: false, orderType: 1, productType: 1,
    UNITCONVERT: isKG ? true : null, unitmeasure,
    GRAMS: GRAMS || 0, Quantity, isKG,
    comments: '', special_price: String(special_price ?? ''), normal_price: String(normal_price ?? ''),
    artdesc, picture_name, substitute: 0, total: String(total ?? ''), apartado: false, RecordType: 'I'
  };
}
async function leyImportar(input){
  const share = (typeof input === 'object' && input.v === 1) ? input : b64urlDecode(input);
  if (share.v !== 1 || !Array.isArray(share.p) || !share.p.length) throw new Error('Share inválido o vacío.');
  const { USER, SUC, WEBSESSION } = getSession();
  const products = share.p.map(toCartProduct);
  const payload = {
    CustomerID: USER.id, WebId: WEBSESSION, loyaltyCard: USER.loyaltyCard || '',
    orderType: 1, points: '', products,
    redeempoints: 0, register_no: SUC.id || share.b || '1086',
    user: { token_web: USER.token_web }
  };
  const res = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  // Refleja en UI local con lo que devuelve el backend (precios/totales frescos)
  const fresh = (data.products || []).map(p => ({
    ProductId: p.Upc, msi: false, orderType: 1, productType: 1,
    UNITCONVERT: p.UNITCONVERT, unitmeasure: p.Artuniven, GRAMS: p.GRAMS || 0,
    Quantity: p.Artuniven === 'KG' ? Math.round(Number(p.Cantidad) * 1000) : Number(p.Cantidad),
    isKG: p.Artuniven === 'KG', comments: p.comments || '',
    special_price: p.SPECIAL_PRICE, normal_price: p.NORMAL_PRICE,
    artdesc: p.Descripcion, picture_name: p.prodUrl, substitute: 0, total: p.Total, apartado: false, RecordType: 'I'
  }));
  localStorage.setItem('CART', JSON.stringify({ products: fresh.length ? fresh : products }));
  localStorage.setItem('ORDER', JSON.stringify({ subTotal: Number(data.total) || 0 }));
  console.log('Clonado OK. Backend total:', data.total, '| items:', (data.products||[]).length);
  return data;
}
window.leyExportar = leyExportar;
window.leyImportar = leyImportar;
window.leyShare = { b64urlEncode, b64urlDecode };
console.log('ley-share listo. Usa leyExportar() para generar link, leyImportar("#c=...") para clonar.');
})();
