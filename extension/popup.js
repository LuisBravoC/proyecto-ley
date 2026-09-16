// popup.js — interfaz de la extensión (MV3)
// Botones: abrir carrito en viewer, copiar link, clonar link en la pestaña actual.
// Las funciones readCartFromPage / cloneCartInPage se INYECTAN en la pestaña de
// Casa Ley: deben ser autocontenidas (Chrome las serializa, sin referencias externas).

// 'bundled' = viewer empaquetado (integral, sin internet extra).
// 'pages'   = GitHub Pages (el mismo link sirve para compartir).
const MODE = 'pages';
const PAGES_URL = 'https://luisbravoc.github.io/proyecto-ley/'; // app React en vivo
const API = 'https://serviciosapp.casaley.com.mx/rails/api/bulk_add_to_cart_web';
// Nota: el guardado online vive en la página (botón Guardar online), no aquí.
// La extensión solo lee el carrito y lo abre/copia; así no hay keys que configurar.

function readCartFromPage() {
  const CART = JSON.parse(localStorage.getItem('CART') || '{"products":[]}');
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  const prods = (CART.products || []).map(function (p) {
    return [p.ProductId, p.Quantity, p.artdesc, p.special_price, p.normal_price,
            p.unitmeasure, p.picture_name, p.GRAMS || 0, p.total];
  });
  if (!prods.length) throw new Error('EMPTY_CART');
  const share = { v: 1, b: SUC.id || '1086', n: SUC.name || '', p: prods };
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(share))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { code: code, count: prods.length, store: SUC.name || '', share: share };
}

function cloneCartInPage(codeInput) {
  var code = String(codeInput || '').trim();
  var m = code.match(/#c=([A-Za-z0-9\-_]+)/) || code.match(/[\?&]c=([A-Za-z0-9\-_]+)/);
  if (m) code = m[1];
  code = code.replace(/-/g, '+').replace(/_/g, '/');
  while (code.length % 4) code += '=';
  var share = JSON.parse(decodeURIComponent(escape(atob(code))));
  if (!share || share.v !== 1 || !share.p || !share.p.length) throw new Error('SHARE_VACIO');
  var USER = JSON.parse(localStorage.getItem('USER') || '{}');
  var SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  var WEBSESSION = localStorage.getItem('WEBSESSION') || '';
  if (!USER.id || !USER.token_web) throw new Error('SIN_SESION');
  var products = share.p.map(function (r) {
    var isKG = r[5] === 'KG';
    return { ProductId: r[0], msi: false, orderType: 1, productType: 1,
      UNITCONVERT: isKG ? true : null, unitmeasure: r[5],
      GRAMS: r[7] || 0, Quantity: r[1], isKG: isKG,
      comments: '', special_price: String(r[3] == null ? '' : r[3]),
      normal_price: String(r[4] == null ? '' : r[4]),
      artdesc: r[2], picture_name: r[6], substitute: 0,
      total: String(r[8] == null ? '' : r[8]), apartado: false, RecordType: 'I' };
  });
  var payload = { CustomerID: USER.id, WebId: WEBSESSION, loyaltyCard: USER.loyaltyCard || '',
    orderType: 1, points: '', products: products, redeempoints: 0,
    register_no: SUC.id || share.b || '1086', user: { token_web: USER.token_web } };
  return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
    .then(function (res) { if (!res.ok) throw new Error('API_' + res.status); return res.json(); })
    .then(function (data) {
      var fresh = (data.products || []).map(function (p) {
        var kg = p.Artuniven === 'KG';
        return { ProductId: p.Upc, msi: false, orderType: 1, productType: 1,
          UNITCONVERT: p.UNITCONVERT, unitmeasure: p.Artuniven, GRAMS: p.GRAMS || 0,
          Quantity: kg ? Math.round(Number(p.Cantidad) * 1000) : Number(p.Cantidad),
          isKG: kg, comments: p.comments || '', special_price: p.SPECIAL_PRICE,
          normal_price: p.NORMAL_PRICE, artdesc: p.Descripcion, picture_name: p.prodUrl,
          substitute: 0, total: p.Total, apartado: false, RecordType: 'I' };
      });
      localStorage.setItem('CART', JSON.stringify({ products: fresh.length ? fresh : products }));
      localStorage.setItem('ORDER', JSON.stringify({ subTotal: Number(data.total) || 0 }));
      return { total: data.total, count: (data.products || []).length };
    });
}

// ---- lógica del popup (sí puede usar chrome.*) ----
const $ = (id) => document.getElementById(id);
let lastCode = null;
let lastShare = null;

function status(msg, cls) {
  const el = $('status');
  el.textContent = msg;
  el.className = cls || '';
}
function viewerBase() {
  return MODE === 'pages' ? PAGES_URL : chrome.runtime.getURL('viewer.html');
}
function shareBase() {
  // Para compartir con OTRO equipo siempre conviene la URL pública de Pages.
  if (PAGES_URL.indexOf('<usuario>') === -1) return PAGES_URL;
  return viewerBase();
}
async function activeTab() {
  const [t] = await chrome.tabs.query({ active: true, currentWindow: true });
  return t;
}
function isCasaLey(t) {
  return t && t.url && t.url.includes('tusuper.casaley.com.mx');
}
async function readCurrentCart() {
  const tab = await activeTab();
  if (!isCasaLey(tab)) throw new Error('NOT_CASALEY');
  const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readCartFromPage });
  return res.result;
}
function friendly(e) {
  const m = String((e && e.message) || e);
  if (m.includes('NOT_CASALEY')) return 'Abre primero tu carrito en tusuper.casaley.com.mx y reintenta.';
  if (m.includes('EMPTY_CART')) return 'Tu carrito está vacío en esta pestaña.';
  if (m.includes('SIN_SESION')) return 'Inicia sesión en Casa Ley en esta pestaña primero.';
  if (m.includes('SHARE_VACIO')) return 'El link no trae productos (código inválido).';
  if (m.includes('Cannot access') || m.includes('No tab with id'))
    return 'No pude inyectar en la pestaña: recárgala y reintenta.';
  return 'Error: ' + m;
}

$('btnOpen').onclick = async () => {
  status('Leyendo carrito…');
  try {
    const r = await readCurrentCart();
    lastCode = r.code;
    lastShare = r.share;
    await chrome.tabs.create({ url: viewerBase() + '#c=' + r.code });
    status('Abierto: ' + r.count + ' producto(s)' + (r.store ? ' · ' + r.store : '') + '.', 'ok');
  } catch (e) { status(friendly(e), 'err'); }
};

$('btnCopy').onclick = async () => {
  status('Leyendo carrito…');
  try {
    const r = lastCode ? { code: lastCode } : await readCurrentCart();
    lastCode = r.code;
    if (r.share) lastShare = r.share;
    const link = shareBase() + '#c=' + r.code;
    // Abrir el viewer local garantiza ver la lista: los links chrome-extension://
    // NO se pueden pegar en la barra del navegador (Chrome los bloquea), solo
    // abrirlos desde la propia extensión. Para compartir usa la URL de Pages.
    await chrome.tabs.create({ url: viewerBase() + '#c=' + r.code });
    try {
      await navigator.clipboard.writeText(link);
      status(shareBase().startsWith('chrome-extension')
        ? 'Link copiado + lista abierta. Ojo: ese link local solo abre en tu Chrome.'
        : 'Link compartible copiado + lista abierta.', 'ok');
    } catch (_e) {
      status('Te abrí la lista. No pude autocopiar (permiso). Tu link:\n' + link);
    }
  } catch (e) { status(friendly(e), 'err'); }
};

$('btnClone').onclick = async () => {
  const input = $('importInput').value;
  if (!input.trim()) { status('Pega primero un link #c=... arriba.', 'err'); return; }
  status('Clonando con tu sesión local…');
  try {
    const tab = await activeTab();
    if (!isCasaLey(tab)) throw new Error('NOT_CASALEY');
    const [res] = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: cloneCartInPage, args: [input] });
    status('Clonado: ' + res.result.count + ' producto(s). Total backend: $' + res.result.total + '. Recarga el carrito.', 'ok');
  } catch (e) { status(friendly(e), 'err'); }
};
