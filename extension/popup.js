// popup.js — interfaz de la extensión (MV3)
// Las funciones readCartFromPage / cloneCartInPage se INYECTAN en la pestaña de
// Casa Ley: deben ser autocontenidas (Chrome las serializa, sin referencias externas).
// Claves Supabase: solo la publishable (pública por diseño, igual que en la página).
const PAGES_URL = 'https://luisbravoc.github.io/proyecto-ley/'; // app React en vivo
const SUPABASE_URL = 'https://pdkrtsrfaygeungcolde.supabase.co';
const SUPABASE_ANON = 'sb_publishable_3jDw8StQcSVaPxGIimaX5Q_-vSLzt5n';

function readCartFromPage() {
  const CART = JSON.parse(localStorage.getItem('CART') || '{"products":[]}');
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  const USER = JSON.parse(localStorage.getItem('USER') || '{}');
  // Autocontenida (Chrome la serializa): sin helpers externos.
  let by = String((USER.name || '')).trim().split(/\s+/)[0] || '';
  by = by.charAt(0).toUpperCase() + by.slice(1).toLowerCase();
  const prods = (CART.products || []).map(function (p) {
    return [p.ProductId, p.Quantity, p.artdesc, p.special_price, p.normal_price,
            p.unitmeasure, p.picture_name, p.GRAMS || 0, p.total];
  });
  if (!prods.length) throw new Error('EMPTY_CART');
  const share = { v: 1, b: SUC.id || '1086', n: SUC.name || '', by: by, p: prods };
  const code = btoa(unescape(encodeURIComponent(JSON.stringify(share))))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { code: code, count: prods.length, store: SUC.name || '', share: share };
}

function cloneCartInPage(codeInput) {
  // Autocontenida: NO usar nada fuera de esta función (Chrome la serializa).
  var API_URL = 'https://serviciosapp.casaley.com.mx/rails/api/bulk_add_to_cart_web';
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
  return fetch(API_URL, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
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
function pageUrl() {
  return PAGES_URL;
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
    await chrome.tabs.create({ url: pageUrl() + '#c=' + r.code });
    status('Abierto: ' + r.count + ' producto(s)' + (r.store ? ' · ' + r.store : '') + '.', 'ok');
  } catch (e) { status(friendly(e), 'err'); }
};

$('btnCopy').onclick = async () => {
  status('Leyendo carrito…');
  try {
    const r = lastCode ? { code: lastCode } : await readCurrentCart();
    lastCode = r.code;
    if (r.share) lastShare = r.share;
    const link = pageUrl() + '#c=' + r.code;
    await chrome.tabs.create({ url: link });
    try {
      await navigator.clipboard.writeText(link);
      status('Link compartible copiado + lista abierta.', 'ok');
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

// --- Lista personal: un código fijo por persona. Todo lo demás lo usa.
async function personalGet() {
  const o = await chrome.storage.local.get('leypersonal');
  return o.leypersonal || null;
}
async function personalSet(p) { await chrome.storage.local.set({ leypersonal: p }); }
// Migra la config anterior (leyauto) una sola vez.
async function migrateLegacy() {
  if (await personalGet()) return;
  const o = await chrome.storage.local.get('leyauto');
  if (o.leyauto && o.leyauto.code && o.leyauto.key) {
    await personalSet({
      code: o.leyauto.code, key: o.leyauto.key,
      on: !!o.leyauto.on, lastSig: o.leyauto.lastSig || null,
    });
  }
}
async function sha256Hex(s) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function genCode(n) {
  const ABC = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  n = n || 6;
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = '';
  for (const x of a) s += ABC[x % ABC.length];
  return s;
}
function genEditKey(n) {
  const ABC = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  n = n || 24;
  const a = new Uint8Array(n);
  crypto.getRandomValues(a);
  let s = '';
  for (const x of a) s += ABC[x % ABC.length];
  return s;
}

async function refreshPersonal() {
  const p = await personalGet();
  $('personal').innerHTML = p
    ? ('Mi lista: <b>' + p.code + '</b>' + (p.on ? ' · auto ON' : ' · auto OFF'))
    : 'Sin lista personal todavía.';
  $('btnAuto').textContent = (p && p.on) ? 'Desactivar auto' : 'Activar auto';
  $('btnPersonal').style.display = p ? 'none' : '';
}

async function insertPersonal(share) {
  const code = genCode(), key = genEditKey();
  const total = Math.round(share.p.reduce((t, p) => t + Number(p[8] || 0), 0) * 100) / 100;
  const res = await fetch(SUPABASE_URL + '/rest/v1/lists', {
    method: 'POST',
    headers: {
      'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON,
      'Content-Type': 'application/json', 'Prefer': 'return=minimal',
    },
    body: JSON.stringify({
      code: code, branch: share.b || null, store_name: share.n || null,
      creator_name: share.by || null, label: null, edit_key: await sha256Hex(key),
      share: share, item_count: share.p.length, est_total: total,
    }),
  });
  if (!res.ok) throw new Error('Supabase ' + res.status);
  return { code: code, key: key };
}

$('btnPersonal').onclick = async () => {
  status('Leyendo carrito…');
  try {
    const r = await readCurrentCart();
    status('Creando tu lista…');
    const created = await insertPersonal(r.share);
    await personalSet({ code: created.code, key: created.key, on: true, lastSig: r.code });
    status('Tu lista es ' + created.code + ' (auto ON).', 'ok');
    refreshPersonal();
  } catch (e) { status(friendly(e), 'err'); }
};

$('btnMyLink').onclick = async () => {
  const p = await personalGet();
  if (!p) { status('Primero crea tu lista personal.', 'err'); return; }
  const link = PAGES_URL + '?c=' + p.code;
  try {
    await navigator.clipboard.writeText(link);
    status('Tu link copiado: ' + link, 'ok');
  } catch (_e) { status('Tu link:\n' + link); }
};

async function pushUpdate(code, key, share) {
  try {
    const res = await fetch(SUPABASE_URL + '/functions/v1/update-list', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON, 'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: code, edit_key: key, share: share }),
    });
    if (res.ok) return { ok: true };
    const j = await res.json().catch(() => ({}));
    const err = String((j && j.error) || ('HTTP ' + res.status));
    const notFound = res.status === 404 || /no editable|no encontrado/i.test(err);
    return { ok: false, err: err, notFound: notFound };
  } catch (e) {
    return { ok: false, err: 'Sin conexión', notFound: false };
  }
}

$('btnSyncNow').onclick = async () => {
  let p = await personalGet();
  if (!p) { status('Primero crea tu lista personal.', 'err'); return; }
  status('Leyendo carrito…');
  try {
    const r = await readCurrentCart();
    status('Sincronizando ' + p.code + '…');
    let up = await pushUpdate(p.code, p.key, r.share);
    if (!up.ok && up.notFound) {
      // El código murió: renace la personal con este carrito.
      status('Recreando tu lista…');
      const created = await insertPersonal(r.share);
      p = { code: created.code, key: created.key, on: true, lastSig: r.code };
      await personalSet(p);
      refreshPersonal();
      status('Nueva lista ' + p.code + ' (la anterior ya no existía).', 'ok');
      return;
    }
    if (!up.ok) throw new Error(up.err);
    p.lastSig = r.code;
    await personalSet(p);
    status('Sincronizado: ' + p.code + ' con ' + r.count + ' producto(s).', 'ok');
  } catch (e) { status(friendly(e), 'err'); }
};

$('btnAuto').onclick = async () => {
  const p = await personalGet();
  if (!p) { status('Primero crea tu lista personal.', 'err'); return; }
  p.on = !p.on;
  await personalSet(p);
  status(p.on ? ('Auto ON para ' + p.code + '.') : 'Auto desactivado.', p.on ? 'ok' : '');
  refreshPersonal();
};

$('btnAdopt').onclick = async () => {
  const code = parseShortCode($('updCode').value || $('importInput').value);
  if (!code) { status('Pega tu link ?c= primero.', 'err'); return; }
  const key = $('updKey').value.trim();
  if (!key) { status('Pega tu clave de edición.', 'err'); return; }
  await personalSet({ code: code, key: key, on: false, lastSig: null });
  status('Lista ' + code + ' adoptada como tuya. Activa el auto cuando quieras.', 'ok');
  refreshPersonal();
};

$('btnHist').onclick = async () => {
  await chrome.tabs.create({ url: PAGES_URL + '#/historial' });
};

function parseShortCode(input) {
  const t = String(input || '').trim();
  const m = t.match(/[\?&]c=([A-Za-z0-9]{4,10})/);
  if (m) return m[1].toUpperCase();
  if (/^[A-Za-z0-9]{4,10}$/.test(t)) return t.toUpperCase();
  return null;
}

async function leyKeyGet(code) {
  const p = await personalGet();
  if (p && p.code === code && p.key) return p.key;
  const o = await chrome.storage.local.get('leykeys');
  return ((o && o.leykeys) || {})[code] || '';
}

async function leyKeySet(code, key) {
  const o = await chrome.storage.local.get('leykeys');
  const m = (o && o.leykeys) || {};
  m[code] = key;
  await chrome.storage.local.set({ leykeys: m });
}

$('updCode').addEventListener('input', async () => {
  const code = parseShortCode($('updCode').value);
  if (!code) return;
  const key = await leyKeyGet(code);
  if (key && !$('updKey').value) $('updKey').value = key;
});

$('btnUpdate').onclick = async () => {
  const code = parseShortCode($('updCode').value || $('importInput').value);
  if (!code) { status('Pega el link ?c= de tu foto primero.', 'err'); return; }
  const key = $('updKey').value.trim() || await leyKeyGet(code);
  if (!key) { status('Pega tu clave de edición (se mostró una vez al guardar).', 'err'); return; }
  status('Leyendo carrito…');
  try {
    const r = await readCurrentCart();
    lastCode = r.code;
    lastShare = r.share;
    status('Actualizando ' + code + '…');
    const res = await fetch(SUPABASE_URL + '/functions/v1/update-list', {
      method: 'POST',
      headers: {
        'apikey': SUPABASE_ANON,
        'Authorization': 'Bearer ' + SUPABASE_ANON,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ code: code, edit_key: key, share: r.share }),
    });
    if (!res.ok) {
      const j = await res.json().catch(() => ({}));
      throw new Error((j && j.error) || ('HTTP ' + res.status));
    }
    await leyKeySet(code, key);
    $('updKey').value = key;
    status('Foto ' + code + ' actualizada con ' + r.count + ' producto(s). Quien la tenga abierta la ve al instante.', 'ok');
  } catch (e) { status(friendly(e), 'err'); }
};

// Al abrir: resumen del carrito, lista personal y versión.
(async () => {
  $('ver').textContent = 'v' + chrome.runtime.getManifest().version;
  await migrateLegacy();
  refreshPersonal();
  try {
    const r = await readCurrentCart();
    lastCode = r.code;
    lastShare = r.share;
    const total = r.share.p.reduce((t, p) => t + Number(p[8] || 0), 0);
    $('summary').innerHTML =
      '<b>' + r.count + (r.count === 1 ? ' producto' : ' productos') + '</b>' +
      (r.store ? ' · ' + r.store : '') +
      ' · ~$' + total.toFixed(2);
    status('Listo.', '');
  } catch (e) {
    $('summary').textContent = 'Abre tu carrito en tusuper para ver el resumen.';
    status(friendly(e), 'err');
  }
})();
