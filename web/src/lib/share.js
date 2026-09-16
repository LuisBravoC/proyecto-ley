// Codec del formato v1 compartido con viewer.html y ley-share.js.
// share = { v:1, b:"1086", p:[[ProductId, Quantity, artdesc, special_price,
//   normal_price, unitmeasure, picture_name, GRAMS, total], ...] }
// El link NUNCA lleva sesión (CustomerID / token_web / WebId): solo productos.

export function b64urlEncode(obj) {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function b64urlDecode(code) {
  let c = String(code || '').trim();
  const m = c.match(/#c=([A-Za-z0-9\-_]+)/) || c.match(/[\?&]c=([A-Za-z0-9\-_]+)/);
  if (m) c = m[1];
  c = c.replace(/-/g, '+').replace(/_/g, '/');
  while (c.length % 4) c += '=';
  return JSON.parse(decodeURIComponent(escape(atob(c))));
}

function validShare(s) {
  return s && s.v === 1 && Array.isArray(s.p);
}

// Acepta: #/c/<code> (app), #c=<code> (legacy viewer/ley-share), ?c=<code>.
export function parseShareFromLocation(loc = window.location) {
  const qs = new URLSearchParams(loc.search);
  if (qs.get('c')) return { share: validShareCheck(b64urlDecode(qs.get('c'))), from: 'query' };
  const h = loc.hash || '';
  let m = h.match(/#\/c\/([A-Za-z0-9\-_]+)/) || h.match(/#c=([A-Za-z0-9\-_]+)/);
  if (m) return { share: validShareCheck(b64urlDecode(m[1])), from: 'hash' };
  if (/^[#]?[A-Za-z0-9\-_]{20,}/.test(h)) {
    return { share: validShareCheck(b64urlDecode(h.replace(/^#/, ''))), from: 'hash' };
  }
  return { share: null, from: null };
}

function validShareCheck(s) {
  if (!validShare(s)) throw new Error('Código inválido (se esperaba v1 con p=productos).');
  return s;
}

export const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || null;

export function money(n) {
  return '$' + Number(n || 0).toFixed(2);
}

// Precio unitario a mostrar: oferta si existe, si no el normal.
// (special_price viene null cuando no hay oferta → antes pintaba "$0.00".)
export function unitPrice(r) {
  const s = Number(r[3]);
  return (r[3] != null && !isNaN(s) && s > 0) ? r[3] : r[4];
}

export function hasOffer(r) {
  const s = Number(r[3]), n = Number(r[4]);
  return r[3] != null && !isNaN(s) && s > 0 && s !== n;
}

export function qtyText(r) {
  const qty = r[1], unit = r[5] || 'PZ', grams = r[7];
  if (unit === 'KG') {
    return qty + ' g' + (grams && Number(grams) !== Number(qty) ? ` (paq. de ${grams} g)` : '');
  }
  return qty + (Number(qty) === 1 ? ' pza' : ' pzas');
}

// Nombre de tienda: viene dinámico en el link ("n"). El id ("b") se conserva
// en el dato para futuro backend, pero no se muestra en frontend.
export function storeName(share) {
  return share.n || '';
}

// Imágenes: el host real es serviciosapp (.../rails/Images/...). tusuper devuelve HTML.
const IMG_BASE = 'https://serviciosapp.casaley.com.mx/rails/';
export function imgUrl(img) {
  if (!img) return null;
  if (/^https?:/i.test(img)) return img;
  return IMG_BASE + String(img).replace(/\\/g, '/').replace(/^\//, '');
}

export function shareTotal(share) {
  return share.p.reduce((a, r) => a + Number(r[8] || 0), 0);
}

export function shareToWhatsApp(share) {
  const lines = share.p.map((r) => `- ${r[2]} (${qtyText(r)}) ${money(r[8])}`);
  const store = storeName(share);
  const head = share.by ? `Lista de ${share.by} · Casa Ley` : 'Mi lista Casa Ley';
  return `${head}${store ? ` (${store})` : ''}:\n` + lines.join('\n');
}

// Clonado: solo funciona si la app corre en origen tusuper (misma sesión local).
// En Pages siempre será falso → la UI muestra usar la extensión.
export function canCloneHere() {
  return window.location.hostname.includes('casaley');
}

export async function cloneShareHere(share, api = 'https://serviciosapp.casaley.com.mx/rails/api/bulk_add_to_cart_web') {
  const USER = JSON.parse(localStorage.getItem('USER') || '{}');
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  const WEBSESSION = localStorage.getItem('WEBSESSION') || '';
  if (!USER.id || !USER.token_web) throw new Error('Inicia sesión en Casa Ley primero.');
  const products = share.p.map((r) => {
    const isKG = r[5] === 'KG';
    return { ProductId: r[0], msi: false, orderType: 1, productType: 1,
      UNITCONVERT: isKG ? true : null, unitmeasure: r[5],
      GRAMS: r[7] || 0, Quantity: r[1], isKG,
      comments: '', special_price: String(r[3] ?? ''), normal_price: String(r[4] ?? ''),
      artdesc: r[2], picture_name: r[6], substitute: 0,
      total: String(r[8] ?? ''), apartado: false, RecordType: 'I' };
  });
  const payload = { CustomerID: USER.id, WebId: WEBSESSION, loyaltyCard: USER.loyaltyCard || '',
    orderType: 1, points: '', products, redeempoints: 0,
    register_no: SUC.id || share.b || '1086', user: { token_web: USER.token_web } };
  const res = await fetch(api, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = await res.json();
  return { total: data.total, count: (data.products || []).length };
}
