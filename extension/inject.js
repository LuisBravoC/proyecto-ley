// Botón "Compartir lista" dentro del drawer del carrito de tusuper.casaley.com.mx
// (content script MV3). Lo inserta junto a "Vaciar" cuando el drawer se abre.
// Lee el carrito del localStorage y abre la página con #c=...&autosave=1,
// que guarda online y deja el link corto listo. Sin keys aquí: el backend
// vive solo en la página.
(function () {
  var BTN_ID = 'ley-share-cart-btn';
  var OLD_FAB_ID = 'ley-share-fab'; // flotante de la versión anterior: se retira
  var PAGES_URL = 'https://luisbravoc.github.io/proyecto-ley/';
  var ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.6" y1="13.5" x2="15.4" y2="17.5"/><line x1="15.4" y1="6.5" x2="8.6" y2="10.5"/></svg>';
  var CSS = [
    'background:#0a7b2e', 'color:#fff', 'border:0', 'border-radius:999px',
    'padding:8px 14px', 'font-size:12px', 'font-weight:700',
    'font-family:system-ui,Roboto,Arial,sans-serif', 'cursor:pointer',
    'display:inline-flex', 'align-items:center', 'gap:6px',
    'margin-left:8px', 'white-space:nowrap',
  ].join(';');

  function buildShareObject() {
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
      var code = btoa(unescape(encodeURIComponent(JSON.stringify(share))))
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
      return { share: share, code: code };
    } catch (e) {
      return null;
    }
  }

  function buildCode() {
    var built = buildShareObject();
    return built ? built.code : null;
  }

  function makeBtn() {
    var b = document.createElement('button');
    b.id = BTN_ID;
    b.type = 'button';
    b.setAttribute('style', CSS);
    b.innerHTML = ICON + '<span>Compartir</span>';
    b.addEventListener('click', function () {
      var label = b.querySelector('span');
      var code = buildCode();
      if (!code) {
        if (label) label.textContent = 'Vacío';
        setTimeout(function () { if (label) label.textContent = 'Compartir'; }, 2000);
        return;
      }
      window.open(PAGES_URL + '#c=' + code + '&autosave=1', '_blank');
    });
    return b;
  }

  // Encuentra el header del drawer ("Tu carrito") y el botón Vaciar.
  function findAnchor() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    var node, titleEl = null;
    while ((node = walker.nextNode())) {
      if (node.nodeValue && node.nodeValue.trim() === 'Tu carrito') {
        titleEl = node.parentElement;
        break;
      }
    }
    if (!titleEl) return null;
    var root = titleEl;
    for (var i = 0; i < 6 && root.parentElement; i++) {
      root = root.parentElement;
      var btns = root.querySelectorAll('button');
      for (var j = 0; j < btns.length; j++) {
        if (/vaciar/i.test(btns[j].textContent || '') && btns[j].id !== BTN_ID) {
          return { vaciar: btns[j] };
        }
      }
    }
    return { header: titleEl };
  }

  function ensureBtn() {
    if (!window.location.hostname.includes('tusuper.casaley.com.mx')) return;
    var old = document.getElementById(OLD_FAB_ID);
    if (old) old.remove();
    if (document.getElementById(BTN_ID)) return; // ya insertado y visible
    var anchor = findAnchor();
    if (!anchor) return; // drawer cerrado: nada que hacer
    var b = makeBtn();
    if (anchor.vaciar && anchor.vaciar.parentElement) {
      anchor.vaciar.parentElement.insertBefore(b, anchor.vaciar.nextSibling);
    } else if (anchor.header && anchor.header.parentElement) {
      anchor.header.parentElement.appendChild(b);
    }
  }

  var scheduled = false;
  function schedule() {
    if (scheduled) return;
    scheduled = true;
    setTimeout(function () {
      scheduled = false;
      try { ensureBtn(); } catch (e) { /* reintenta en la próxima mutación */ }
    }, 300);
  }

  ensureBtn();
  if (window.MutationObserver && document.body) {
    new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  }

  // Auto-sync eficiente: solo empuja cuando el carrito CAMBIÓ.
  // - Poll cada 5s, solo con pestaña visible y si está activado para una foto.
  // - Compara la firma del carrito: sin cambios = cero requests.
  // - Carrito vacío no se empuja (el servidor exige ≥1 producto).
  var AUTO_KEY = 'leyauto';
  var FN_URL = 'https://pdkrtsrfaygeungcolde.supabase.co/functions/v1/update-list';
  var FN_ANON = 'sb_publishable_3jDw8StQcSVaPxGIimaX5Q_-vSLzt5n'; // pública por diseño
  var pushing = false;

  async function autoTick() {
    if (document.hidden || pushing) return;
    try {
      var cfg = (await chrome.storage.local.get(AUTO_KEY))[AUTO_KEY];
      if (!cfg || !cfg.on || !cfg.code || !cfg.key) return;
      var built = buildShareObject();
      if (!built) return;
      if (built.code === cfg.lastSig) return; // sin cambios: nada que enviar
      pushing = true;
      setBtnState('Subiendo…');
      try {
        var res = await fetch(FN_URL, {
          method: 'POST',
          headers: {
            'apikey': FN_ANON,
            'Authorization': 'Bearer ' + FN_ANON,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ code: cfg.code, edit_key: cfg.key, share: built.share }),
        });
        if (!res.ok) {
          var errText = 'Error ' + res.status;
          try {
            var ej = await res.json();
            if (ej && ej.error) errText = String(ej.error);
          } catch (e) { /* usa el HTTP */ }
          setBtnState(errText, true);
          return; // reintenta en el próximo ciclo
        }
        cfg.lastSig = built.code;
        await chrome.storage.local.set({ [AUTO_KEY]: cfg });
        setBtnState('Sincronizado ✓');
      } finally {
        pushing = false;
      }
    } catch (e) { /* próximo ciclo */ }
  }

  // Refleja el estado del auto-sync en el botón del drawer (si está visible).
  var revertTimer = null;
  function setBtnState(t, sticky) {
    var b = document.getElementById(BTN_ID);
    if (!b) return;
    var s = b.querySelector('span');
    if (!s) return;
    s.textContent = t;
    if (revertTimer) clearTimeout(revertTimer);
    if (!sticky) {
      revertTimer = setTimeout(function () {
        var bb = document.getElementById(BTN_ID);
        var ss = bb && bb.querySelector('span');
        if (ss) ss.textContent = 'Compartir';
      }, 3000);
    }
  }
  setInterval(autoTick, 5000);
})();
