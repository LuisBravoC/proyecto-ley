import { useCallback, useEffect, useRef, useState } from 'react';
import { FiGrid, FiLink, FiList, FiMessageCircle, FiShare2 } from 'react-icons/fi';
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
import { checkForUpdate, BUILD_LABEL, HOVER_CAPABLE } from './lib/version';
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
        {offer && pct != null && <span className="discount-box">−{pct}%</span>}
        <div className="price-col">
          {offer && <s className="muted small">{money(lineTotalNormal(r))}</s>}
          <b>{money(r[8])}</b>
        </div>
      </div>
    </article>
  );
}

export default function App() {
  const [share, setShare] = useState<ShareV1 | null>(null);
  const [toast, setToast] = useState<{ id: number; text: string; err?: boolean } | null>(null);
  const toastTimer = useRef<number | null>(null);
  const notify = useCallback((text: string, err = false) => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast({ id: Date.now(), text, err });
    toastTimer.current = window.setTimeout(() => setToast(null), err ? 4000 : 2600);
  }, []);
  const dismiss = useCallback(() => {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);
  const [input, setInput] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const openTimer = useRef<number | null>(null);
  const closeTimer = useRef<number | null>(null);

  // Apertura por proximidad (solo con mouse): entra a la zona → abre con
  // retardo; sale de la zona → cierra con retardo. En táctil solo con toque.
  const canHover = () =>
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(hover: hover)').matches;
  const cancelHoverTimers = () => {
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  };
  const scheduleOpen = () => {
    if (!canHover()) return;
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    if (menuOpen || openTimer.current) return;
    openTimer.current = window.setTimeout(() => {
      setMenuOpen(true);
      openTimer.current = null;
    }, 120);
  };
  const scheduleClose = () => {
    if (!canHover()) return;
    if (openTimer.current) {
      window.clearTimeout(openTimer.current);
      openTimer.current = null;
    }
    if (!menuOpen || closeTimer.current) return;
    closeTimer.current = window.setTimeout(() => {
      setMenuOpen(false);
      closeTimer.current = null;
    }, 200);
  };
  useEffect(() => () => cancelHoverTimers(), []);
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
        notify('Ese código corto necesita backend (aún no configurado en esta página).');
        return;
      }
      notify('Cargando lista…');
      try {
        const s = await loadListOnline(found.code);
        setShare(s);
        dismiss();
        setModalOpen(false);
        setInput('');
        setHistory(recordHistory(s, 'online', found.code));
        if (getRoute() !== 'home') window.location.hash = '#/';
      } catch (e) {
        notify('No encontré ese código (' + (e as Error).message + ').');
      }
      return;
    }
    try {
      const s = b64urlDecode(code);
      if (!s || s.v !== 1 || !Array.isArray(s.p)) throw new Error('Código inválido.');
      setShare(s);
      dismiss();
      setModalOpen(false);
      setInput('');
      const raw = extractCode(code);
      if (raw && raw.kind === 'link') setHistory(recordHistory(s, 'link', raw.code));
      if (getRoute() !== 'home') window.location.hash = '#/';
    } catch (e) {
      notify('No pude leer el código (' + (e as Error).message + ').');
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
          notify('Este link corto necesita backend (aún no configurado en esta página).');
          return;
        }
        notify('Cargando lista…');
        try {
          const s = await loadListOnline(qc);
          setShare(s);
          dismiss();
          setHistory(recordHistory(s, 'online', qc.trim().toUpperCase()));
        } catch (e) {
          setShare(null);
          notify('No encontré ese código (' + (e as Error).message + ').');
        }
        return;
      }
      try {
        const { share: s } = parseShareFromLocation();
        if (s) {
          setShare(s);
          dismiss();
          const found = codeFromLocation();
          if (found && found.kind === 'link') setHistory(recordHistory(s, 'link', found.code));
        }
      } catch (e) {
        setShare(null);
        notify('El link trae un código que no pude leer (' + (e as Error).message + '). Usa Abrir código.');
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
        setShareOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [menuOpen, modalOpen, shareOpen]);

  const copyText = async (): Promise<boolean> => {
    if (!share) return false;
    const txt = shareToWhatsApp(share);
    try {
      await navigator.clipboard.writeText(txt);
      notify('Copiado para WhatsApp.');
      return true;
    } catch {
      notify('No pude copiar al portapapeles.', true);
      return false;
    }
  };

  // Compartir siempre es link corto online. El código largo (#c=) queda solo
  // para pruebas y para pegarlo en "Abrir código".
  const ensureShortUrl = async (): Promise<string | null> => {
    if (!share) return null;
    const qc = new URLSearchParams(window.location.search).get('c');
    if (qc && isShortCode(qc)) return window.location.href;
    if (!backendReady) {
      notify('Para compartir se necesita backend (aún no configurado).', true);
      return null;
    }
    notify('Guardando online…');
    try {
      const code = await saveListOnline(share);
      setHistory(recordHistory(share, 'online', code));
      return window.location.origin + window.location.pathname + '?c=' + code;
    } catch (e) {
      notify('No pude guardar online: ' + (e as Error).message, true);
      return null;
    }
  };

  const copyLink = async (): Promise<boolean> => {
    const url = await ensureShortUrl();
    if (!url) return false;
    try {
      await navigator.clipboard.writeText(url);
      notify('Link corto copiado.');
      return true;
    } catch {
      notify('Tu link corto:\n' + url, true);
      return false;
    }
  };

  const canNativeShare =
    typeof navigator !== 'undefined' &&
    !!(navigator as Navigator & { share?: unknown }).share;

  const nativeShare = async (): Promise<boolean> => {
    const url = await ensureShortUrl();
    if (!url || !share) return false;
    try {
      await (
        navigator as Navigator & {
          share: (d: { title?: string; text?: string; url?: string }) => Promise<void>;
        }
      ).share({
        title: 'Mi lista Casa Ley',
        text: shareToWhatsApp(share),
        url,
      });
      return true;
    } catch {
      return false; // cancelado por el usuario
    }
  };

  const runShare = async (fn: () => Promise<boolean>) => {
    if (await fn()) setShareOpen(false);
  };

  const clone = async () => {
    if (!share) {
      notify('Primero carga una lista.');
      return;
    }
    if (!canCloneHere()) {
      notify('Para clonar usa la extensión (botón Clonar) estando en tusuper.casaley.com.mx. Esta página solo muestra.');
      return;
    }
    notify('Clonando con tu sesión local…');
    try {
      const r = await cloneShareHere(share);
      notify(`Listo. Total backend: $${r.total}. Recarga el carrito.`);
    } catch (e) {
      notify('Error al clonar: ' + (e as Error).message);
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
          onClick={() => {
            cancelHoverTimers();
            setMenuOpen((v) => !v);
          }}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
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

      {(modalOpen || shareOpen) && (
        <div
          className="overlay"
          onClick={() => {
            setModalOpen(false);
            setShareOpen(false);
          }}
        />
      )}

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

      <div
        className="edge-zone"
        aria-hidden="true"
        onMouseEnter={scheduleOpen}
        onMouseLeave={scheduleClose}
      />
      <div className="shell">
        <aside
          className={`sidebar${menuOpen ? ' open' : ''}`}
          aria-hidden={!menuOpen}
          onMouseEnter={scheduleOpen}
          onMouseLeave={scheduleClose}
        >
          <nav className="sidebar-inner" aria-label="Menú principal">
            <button onClick={goHome} className={route === 'home' ? 'active' : ''} aria-current={route === 'home' ? 'page' : undefined}>Inicio</button>
            <button onClick={goHistorial} className={route === 'historial' ? 'active' : ''} aria-current={route === 'historial' ? 'page' : undefined}>Historial</button>
            <button onClick={goAyuda} className={route === 'ayuda' ? 'active' : ''} aria-current={route === 'ayuda' ? 'page' : undefined}>Cómo funciona</button>
          </nav>
        </aside>
        <div className="content">
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
                {null}
              </div>
            ) : (
              <>
                <p className="meta-line muted">
                  {share.p.length} {share.p.length === 1 ? 'producto' : 'productos'}
                  {share.by ? ` · de ${share.by}` : ''}
                  {storeName(share) ? ` · ${storeName(share)}` : ''} · Precios de referencia, pueden variar en
                  tienda.
                </p>
                {null}
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
                <p className="muted build-tag">
                  compilación {BUILD_LABEL} · hover {HOVER_CAPABLE ? 'sí' : 'no'}
                </p>
              </>
            )}
          </>
        )}
          </main>
        </div>
      </div>

      {shareOpen && share && (
        <div className="modal sheet" role="dialog" aria-modal="true" aria-label="Compartir lista">
          <div className="sheet-handle" aria-hidden="true" />
          <h2>Compartir lista</h2>
          <p className="muted">
            {share.p.length} {share.p.length === 1 ? 'producto' : 'productos'} · {money(shareTotal(share))}
          </p>
          <button className="sheet-opt" onClick={() => runShare(copyLink)}>
            <FiLink aria-hidden="true" /> Copiar link
          </button>
          <button className="sheet-opt" onClick={() => runShare(copyText)}>
            <FiMessageCircle aria-hidden="true" /> Copiar como texto
          </button>
          {canNativeShare && (
            <button className="sheet-opt" onClick={() => runShare(nativeShare)}>
              <FiShare2 aria-hidden="true" /> Compartir con…
            </button>
          )}
          <button onClick={() => setShareOpen(false)}>Cerrar</button>
        </div>
      )}

      {toast && (
        <div className={`toast${toast.err ? ' err' : ''}`} role="status">
          {toast.text}
        </div>
      )}

      {route === 'home' && share && (
        <div className="sharebar" role="toolbar" aria-label="Compartir lista">
          <button className="primary" onClick={() => setShareOpen(true)}>
            <FiShare2 aria-hidden="true" /> Compartir
          </button>
          {canCloneHere() && <button onClick={clone}>Clonar</button>}
        </div>
      )}
    </>
  );
}
