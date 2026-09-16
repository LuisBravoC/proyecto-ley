// Botón flotante "Compartir lista" en tusuper.casaley.com.mx (content script MV3).
// Lee el carrito del localStorage y abre la página con #c=...&autosave=1,
// que guarda online y deja el link corto listo. Sin keys aquí: el backend
// vive solo en la página.
(function () {
  var BTN_ID = 'ley-share-fab';
  var PAGES_URL = 'https://luisbravoc.github.io/proyecto-ley/';
  var ICON = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>';
  var CSS = [
    'position:fixed', 'right:16px', 'bottom:88px', 'z-index:2147483647',
    'background:#0a7b2e', 'color:#fff', 'border:0', 'border-radius:999px',
    'padding:12px 18px', 'font-size:14px', 'font-weight:700',
    'font-family:system-ui,Roboto,Arial,sans-serif', 'cursor:pointer',
    'box-shadow:0 6px 20px rgba(0,0,0,.35)',
    'display:inline-flex', 'align-items:center', 'gap:8px',
  ].join(';');

  function buildCode() {
    try {
      var CART = JSON.parse(localStorage.getItem('CART') || '{"products":[]}');
      var SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}');
      var USER = JSON.parse(localStorage.getItem('USER') || '{}');
      var by = String(USER.name || '').trim().split(/\s+/)[0] || '';
      by = by.charAt(0).toUpperCase() + by.slice(1).toLowerCase();
      var prods = (CART.products || []).map(function (p) {
        return [p.ProductId, p.Quantity, p.artdesc, p.special_price, p.normal_price,
          p.unitmeasure, p.picture_name, p.GRAMS || 0, p.total];
      });
      if (!prods.length) return null;
      var share = { v: 1, b: SUC.id || '1086', n: SUC.name || '', by: by, p: prods };
      return btoa(unescape(encodeURIComponent(JSON.stringify(share))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    } catch (e) {
      return null;
    }
  }

  function ensureBtn() {
    if (!window.location.hostname.includes('tusuper.casaley.com.mx')) return;
    if (document.getElementById(BTN_ID)) return;
    var b = document.createElement('button');
    b.id = BTN_ID;
    b.type = 'button';
    b.setAttribute('style', CSS);
    b.innerHTML = ICON + '<span>Compartir lista</span>';
    b.addEventListener('click', function () {
      var label = b.querySelector('span');
      var code = buildCode();
      if (!code) {
        if (label) label.textContent = 'Carrito vacío';
        setTimeout(function () { if (label) label.textContent = 'Compartir lista'; }, 2000);
        return;
      }
      window.open(PAGES_URL + '#c=' + code + '&autosave=1', '_blank');
    });
    (document.body || document.documentElement).appendChild(b);
  }

  ensureBtn();
  setInterval(ensureBtn, 2000); // SPA: repone el botón si la app lo tumba
})();
