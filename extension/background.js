// background.js — SIN USO desde v0.2.0 (el popup en popup.html maneja los clics).
// Se conserva como referencia. La lectura/escritura vive en popup.js
// (readCartFromPage / cloneCartInPage) y viewer empaquetado en viewer.html.
// Original v0.1.0: clic en icono → abría viewer. Fallaba en silencio, por eso el popup con estado.

// 'bundled' = viewer empaquetado en la extensión (funciona sin internet extra).
// 'pages'   = tu GitHub Pages (misma página, sirve para compartir el link tal cual).
const MODE = 'pages';
const PAGES_URL = 'https://luisbravoc.github.io/proyecto-ley/'; // app React en vivo

// Esta función se inyecta en la pestaña de Casa Ley: debe ser autocontenida
// (sin referencias externas) porque Chrome la serializa.
function readCartFromPage() {
  const CART = JSON.parse(localStorage.getItem('CART') || '{"products":[]}');
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
  const prods = (CART.products || []).map(function (p) {
    return [p.ProductId, p.Quantity, p.artdesc, p.special_price, p.normal_price,
            p.unitmeasure, p.picture_name, p.GRAMS || 0, p.total];
  });
  if (!prods.length) throw new Error('EMPTY_CART');
  const share = { v: 1, b: SUC.id || '1086', n: SUC.name || '', p: prods };
  const json = JSON.stringify(share);
  const code = btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return { code: code, count: prods.length, branch: share.b };
}

function viewerBase() {
  if (MODE === 'pages') return PAGES_URL;
  return chrome.runtime.getURL('viewer.html');
}

chrome.action.onClicked.addListener(async (tab) => {
  const onCasaLey = tab && tab.url && tab.url.includes('tusuper.casaley.com.mx');
  if (!onCasaLey || !tab.id) {
    // Fuera de Casa Ley no hay carrito que leer: abre el viewer vacío para pegar un link.
    await chrome.tabs.create({ url: viewerBase() });
    return;
  }
  try {
    const [res] = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: readCartFromPage
    });
    const url = viewerBase() + '#c=' + res.result.code;
    await chrome.tabs.create({ url: url });
  } catch (e) {
    // Carrito vacío o página aún cargando: abre el viewer para pegar link manualmente.
    await chrome.tabs.create({ url: viewerBase() });
  }
});
