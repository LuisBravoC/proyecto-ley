import { useCallback, useEffect, useState } from 'react';
import { FiGrid, FiList } from 'react-icons/fi';
import {
  b64urlDecode,
  canCloneHere,
  cloneShareHere,
  discountPct,
  hasOffer,
  lineTotalNormal,
  imgUrl,
  money,
  parseShareFromLocation,
  qtyText,
  shareToWhatsApp,
  shareTotal,
  storeName,
  unitPrice,
  type ShareItem,
  type ShareV1,
} from './lib/share';
import { backendReady, isShortCode, loadListOnline, saveListOnline } from './lib/backend';
import { checkForUpdate, BUILD_LABEL } from './lib/version';
import {
  clearHistory,
  codeFromLocation,
  extractCode,
  fmtFecha,
  loadHistory,
  recordHistory,
  removeHistory,
  type HistoryEntry,
} from './lib/history';

type Route = 'home' | 'ayuda' | 'historial';
type Theme = 'dark' | 'light';

function getRoute(): Route {
  if (window.location.hash.startsWith('#/ayuda')) return 'ayuda';
  if (window.location.hash.startsWith('#/historial')) return 'historial';
  return 'home';
}

function SunIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
      <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" />
    </svg>
  );
}

function ProductCard({ r, grid }: { r: ShareItem; grid: boolean }) {
  const [hideImg, setHideImg] = useState(false);
  const src = imgUrl(r[6]);
  const offer = hasOffer(r);
  const pct = discountPct(r);
  if (grid) {
    return (
      <article className="card grid-card">
        {src && !hideImg && <img src={src} onError={() => setHideImg(true)} alt="" loading="lazy" />}
        <div className="card-body">
          <b className="pname">{r[2]}</b>
          <span className="muted">{qtyText(r)}</span>
          <div className="price-row">
            <b>{money(r[8])}</b>
            {offer && pct != null && <span className="pill">−{pct}%</span>}
            {offer ? (
              <span className="muted small">
                {money(r[3])} c/u · antes {money(r[4])}
              </span>
            ) : (
              <span className="muted">{money(unitPrice(r))} c/u</span>
            )}
          </div>
        </div>
      </article>
    );
  }
  return (
    <article className="card row-card">
      {src && !hideImg && <img src={src} onError={() => setHideImg(true)} alt="" loading="lazy" />}
      <div className="card-body">
        <b className="pname">{r[2]}</b>
        <span className="muted small">{qtyText(r)}</span>
      </div>
      <div className="row-total">
        <b>{money(r[8])}</b>
        {offer && <s className="muted small">{money(lineTotalNormal(r))}</s>}
        {offer && pct != null && <span className="pill">−{pct}%</span>}
      </div>
    </article>
  );
}

export default function App() {
  const [share, setShare] = useState<ShareV1 | null>(null);
  const [msg, setMsg] = useState('');
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [updateAvail, setUpdateAvail] = useState(false);
  const [route, setRoute] = useState<Route>(() => getRoute());
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('ley-theme') as Theme) || 'dark';
    } catch {
      return 'dark';
    }
  });
  const [view, setView] = useState<'lista' | 'grid'>(() => {
    try {
      return (localStorage.getItem('ley-view') as 'lista' | 'grid') || 'lista';
    } catch {
      return 'lista';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('ley-view', view);
    } catch {
      /* sin almacenamiento */
    }
  }, [view]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    try {
      localStorage.setItem('ley-theme', theme);
    } catch {
      /* sin almacenamiento */
    }
  }, [theme]);

  const load = useCallback(async (code: string) => {
    // Código corto online (ej. "RRAQYN") se carga del backend.
    const found = extractCode(code);
    if (found && found.kind === 'online') {
      if (!backendReady) {
        setMsg('Ese código corto necesita backend (aún no configurado en esta página).');
        return;
      }
      setMsg('Cargando lista…');
      try {
        const s = await loadListOnline(found.code);
        setShare(s);
        setMsg('');
        setModalOpen(false);
        setInput('');
        setHistory(recordHistory(s, 'online', found.code));
        if (getRoute() !== 'home') window.location.hash = '#/';
      } catch (e) {
        setMsg('No encontré ese código (' + (e as Error).message + ').');
      }
      return;
    }
    try {
      const s = b64urlDecode(code);
      if (!s || s.v !== 1 || !Array.isArray(s.p)) throw new Error('Código inválido.');
      setShare(s);
      setMsg('');
      setModalOpen(false);
      setInput('');
      const raw = extractCode(code);
      if (raw && raw.kind === 'link') setHistory(recordHistory(s, 'link', raw.code));
      if (getRoute() !== 'home') window.location.hash = '#/';
    } catch (e) {
      setMsg('No pude leer el código (' + (e as Error).message + ').');
    }
  }, []);

  useEffect(() => {
    const boot = async () => {
      setRoute(getRoute());
      if (getRoute() !== 'home') return;
      // Link corto de backend: ?c=ABC123
      const qc = new URLSearchParams(window.location.search).get('c');
      if (qc && isShortCode(qc)) {
        if (!backendReady) {
          setShare(null);
          setMsg('Este link corto necesita backend (aún no configurado en esta página).');
          return;
        }
        setMsg('Cargando lista…');
        try {
          const s = await loadListOnline(qc);
          setShare(s);
          setMsg('');
          setHistory(recordHistory(s, 'online', qc.trim().toUpperCase()));
        } catch (e) {
          setShare(null);
          setMsg('No encontré ese código (' + (e as Error).message + ').');
        }
        return;
      }
      try {
        const { share: s } = parseShareFromLocation();
        if (s) {
          setShare(s);
          setMsg('');
          const found = codeFromLocation();
          if (found && found.kind === 'link') setHistory(recordHistory(s, 'link', found.code));
        }
      } catch (e) {
        setShare(null);
        setMsg('El link trae un código que no pude leer (' + (e as Error).message + '). Usa Abrir código.');
      }
    };
    boot();
    window.addEventListener('hashchange', boot);
    return () => window.removeEventListener('hashchange', boot);
  }, []);

  // Aviso de versión nueva: revisa cada 60s (solo con pestaña visible).
  useEffect(() => {
    if (window.location.protocol === 'file:') return;
    let stop = false;
    const check = async () => {
      if (!document.hidden && !stop && (await checkForUpdate())) setUpdateAvail(true);
    };
    check();
    const t = setInterval(check, 60000);
    const onVis = () => {
      if (!document.hidden) check();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      stop = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, []);

  // Cierra menú/modal con Escape.
  useEffect(() => {
    if (!menuOpen && !modalOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMenuOpen(false);
        setModalOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, modalOpen]);

  const copyText = async () => {
    if (!share) return;
    const txt = shareToWhatsApp(share);
    try {
      await navigator.clipboard.writeText(txt);
      setMsg('Copiado para WhatsApp.');
    } catch {
      setMsg('No pude autocopiar. Texto:\n' + txt);
    }
  };

  const copyLink = async () => {
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      setMsg('Link copiado.');
    } catch {
      setMsg('No pude autocopiar. Copia la URL del navegador.');
    }
  };

  const saveOnline = async () => {
    if (!share) return;
    setMsg('Guardando online…');
    try {
      const code = await saveListOnline(share);
      setHistory(recordHistory(share, 'online', code));
      const url = window.location.origin + window.location.pathname + '?c=' + code;
      try {
        await navigator.clipboard.writeText(url);
        setMsg('Link corto copiado:\n' + url);
      } catch {
        setMsg('Tu link corto:\n' + url);
      }
    } catch (e) {
      setMsg('No pude guardar online: ' + (e as Error).message);
    }
  };

  const clone = async () => {
    if (!share) {
      setMsg('Primero carga una lista.');
      return;
    }
    if (!canCloneHere()) {
      setMsg('Para clonar usa la extensión (botón Clonar) estando en tusuper.casaley.com.mx. Esta página solo muestra.');
      return;
    }
    setMsg('Clonando con tu sesión local…');
    try {
      const r = await cloneShareHere(share);
      setMsg(`Listo. Total backend: $${r.total}. Recarga el carrito.`);
    } catch (e) {
      setMsg('Error al clonar: ' + (e as Error).message);
    }
  };

  const goHome = () => {
    setMenuOpen(false);
    if (window.location.hash && window.location.hash !== '#/') window.location.hash = '#/';
    else setRoute('home');
  };

  const goAyuda = () => {
    setMenuOpen(false);
    window.location.hash = '#/ayuda';
  };

  const goHistorial = () => {
    setMenuOpen(false);
    window.location.hash = '#/historial';
  };

  const openHistory = (e: HistoryEntry) => {
    setMenuOpen(false);
    if (e.kind === 'online') {
      window.location.href = window.location.pathname + '?c=' + e.code;
    } else {
      if (window.location.hash === '#c=' + e.code) load(e.code);
      else window.location.hash = '#c=' + e.code;
    }
  };

  const openModal = () => {
    setMenuOpen(false);
    setModalOpen(true);
  };

  return (
    <>
      <header className="topbar">
        <button
          className="menu-btn"
          aria-label={menuOpen ? 'Cerrar menú' : 'Abrir menú'}
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((v) => !v)}
        >
          <span />
          <span />
          <span />
        </button>
        <div className="topbar-title">
          <b>Mi lista Casa Ley</b>
          {route === 'home' && share?.by && <span className="muted"> · de {share.by}</span>}
        </div>
        <div className="topbar-actions">
          <button
            className="icon-btn"
            aria-label={theme === 'dark' ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
            title={theme === 'dark' ? 'Modo claro' : 'Modo oscuro'}
            onClick={() => setTheme((t) => (t === 'dark' ? 'light' : 'dark'))}
          >
            {theme === 'dark' ? <SunIcon /> : <MoonIcon />}
          </button>
          {route === 'home' && (
            <button className="open-btn" onClick={openModal}>
              Abrir código
            </button>
          )}
        </div>
      </header>

      {(menuOpen || modalOpen) && (
        <div
          className="overlay"
          onClick={() => {
            setMenuOpen(false);
            setModalOpen(false);
          }}
        />
      )}
      <nav className={`drawer${menuOpen ? ' open' : ''}`} aria-hidden={!menuOpen}>
        <button onClick={goHome}>Inicio</button>
        <button onClick={goHistorial}>Historial</button>
        <button onClick={openModal}>Abrir código</button>
        <button onClick={goAyuda}>Cómo funciona</button>
      </nav>

      {modalOpen && (
        <div className="modal" role="dialog" aria-modal="true" aria-label="Abrir código">
          <h2>Abrir código</h2>
          <p className="muted">Pega el link compartido o el código #c=…</p>
          <textarea
            autoFocus
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="https://…/#c=…"
          />
          <div className="row">
            <button className="primary" onClick={() => load(input)}>
              Ver lista
            </button>
            <button onClick={() => setModalOpen(false)}>Cancelar</button>
          </div>
        </div>
      )}

      <main>
        {updateAvail && (
          <p className="banner">
            Hay una versión más reciente de la página.{' '}
            <button onClick={() => window.location.reload()}>Recargar</button>
          </p>
        )}

        {route === 'ayuda' ? (
          <section aria-label="Cómo funciona">
            <h2>Cómo funciona</h2>
            <ol className="steps">
              <li>Arma tu carrito en Casa Ley y ábrelo con la extensión.</li>
              <li>Guárdalo online o copia el link y mándalo por WhatsApp.</li>
              <li>Quien lo recibe lo ve aquí y, con su sesión, lo clona a su carrito.</li>
            </ol>
            <p className="muted">El link lleva solo productos y precios. Nunca tu sesión ni tus datos.</p>
            <div className="row">
              <button onClick={goHome}>Volver a la lista</button>
            </div>
          </section>
        ) : route === 'historial' ? (
          <section aria-label="Historial">
            <h2>Historial</h2>
            <p className="muted">Listas vistas o guardadas en este navegador. Sin cuenta, sin nube.</p>
            {history.length === 0 ? (
              <p className="muted">Aún no hay listas. Abre o guarda una y aparecerá aquí.</p>
            ) : (
              <>
                {history.map((e) => (
                  <div className="card row-card" key={e.code}>
                    <div className="card-body">
                      <b className="pname">{e.title}</b>
                      <span className="muted small">
                        {e.kind === 'online' ? `Código ${e.code}` : 'Link local'} · {fmtFecha(e.when)}
                      </span>
                    </div>
                    <div className="row-total">
                      <b>{money(e.total)}</b>
                      <div className="row">
                        <button onClick={() => openHistory(e)}>Abrir</button>
                        <button onClick={() => setHistory(removeHistory(e.code))}>Borrar</button>
                      </div>
                    </div>
                  </div>
                ))}
                <div className="row">
                  <button
                    onClick={() => {
                      if (window.confirm('¿Borrar todo el historial?')) setHistory(clearHistory());
                    }}
                  >
                    Borrar todo
                  </button>
                </div>
              </>
            )}
          </section>
        ) : (
          <>
            {!share ? (
              <div className="empty">
                <h2>Sin lista todavía</h2>
                <p className="muted">Te compartieron una lista del súper? Ábrela aquí.</p>
                <button className="primary big" onClick={openModal}>
                  Abrir código
                </button>
                {msg && <div id="msg">{msg}</div>}
              </div>
            ) : (
              <>
                <p className="meta-line muted">
                  {share.p.length} {share.p.length === 1 ? 'producto' : 'productos'}
                  {share.by ? ` · de ${share.by}` : ''}
                  {storeName(share) ? ` · ${storeName(share)}` : ''} · Precios de referencia, pueden variar en
                  tienda.
                </p>
                {msg && <div id="msg">{msg}</div>}
                <div className="view-toggle" role="group" aria-label="Vista de lista">
                  <button
                    className={view === 'lista' ? 'primary' : ''}
                    aria-pressed={view === 'lista'}
                    onClick={() => setView('lista')}
                  >
                    <FiList aria-hidden="true" /> Lista
                  </button>
                  <button
                    className={view === 'grid' ? 'primary' : ''}
                    aria-pressed={view === 'grid'}
                    onClick={() => setView('grid')}
                  >
                    <FiGrid aria-hidden="true" /> Cuadrícula
                  </button>
                </div>
                <div className={view === 'grid' ? 'grid' : ''}>
                  {share.p.map((r) => (
                    <ProductCard key={r[0]} r={r} grid={view === 'grid'} />
                  ))}
                </div>
                <div className="total-card">
                  <span className="muted">Subtotal</span>
                  <b>{money(shareTotal(share))}</b>
                </div>
                <p className="muted">El total final se confirma antes de pagar.</p>
                <p className="muted build-tag">compilación {BUILD_LABEL}</p>
              </>
            )}
          </>
        )}
      </main>

      {route === 'home' && share && (
        <div className="sharebar" role="toolbar" aria-label="Compartir lista">
          <button onClick={copyLink}>Copiar link</button>
          <button onClick={copyText}>Texto</button>
          {backendReady && <button onClick={saveOnline}>Link corto</button>}
          {canCloneHere() && (
            <button className="primary" onClick={clone}>
              Clonar
            </button>
          )}
        </div>
      )}
    </>
  );
}
