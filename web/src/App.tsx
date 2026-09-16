import { useCallback, useEffect, useRef, useState } from 'react';
import { FiCamera, FiDownload, FiGrid, FiLink, FiList, FiMessageCircle, FiShare2 } from 'react-icons/fi';
import {
  BOOKMARKLET_HREF,
  b64urlDecode,
  canCloneHere,
  cloneShareHere,
  discountPct,
  hasOffer,
  imgUrl,
  lineTotalNormal,
  money,
  parseShareFromLocation,
  productUrl,
  qtyText,
  savingsTotal,
  shareToWhatsApp,
  shareTotal,
  storeName,
  unitPrice,
  type ShareItem,
  type ShareV1,
} from './lib/share';
import {
  backendReady,
  defaultLabel,
  isShortCode,
  loadListOnline,
  saveListOnline,
  subscribeList,
  type SnapshotMeta,
} from './lib/backend';
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

type Route = 'home' | 'ayuda' | 'historial' | 'instalar';
type Theme = 'dark' | 'light';

function getRoute(): Route {
  if (window.location.hash.startsWith('#/ayuda')) return 'ayuda';
  if (window.location.hash.startsWith('#/historial')) return 'historial';
  if (window.location.hash.startsWith('#/instalar')) return 'instalar';
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

function diffShare(
  prev: ShareV1 | null,
  next: ShareV1,
): { added: string[]; removed: ShareItem[] } {
  if (!prev) return { added: next.p.map((r) => r[0]), removed: [] };
  const before = new Map(prev.p.map((r) => [r[0], r[1]]));
  const added = next.p.filter((r) => before.get(r[0]) !== r[1]).map((r) => r[0]);
  const after = new Set(next.p.map((r) => r[0]));
  const removed = prev.p.filter((r) => !after.has(r[0]));
  return { added, removed };
}

function ProductCard({ r, grid, flash, leaving }: { r: ShareItem; grid: boolean; flash: boolean; leaving?: boolean }) {
  const [hideImg, setHideImg] = useState(false);
  const src = imgUrl(r[6]);
  const offer = hasOffer(r);
  const pct = discountPct(r);
  if (grid) {
    return (
      <article className="card grid-card">
        <a
          className="card-link"
          href={productUrl(r[0])}
          target="_blank"
          rel="noreferrer"
          aria-label={`Ver ${r[2]} en Casa Ley`}
        />
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
    <article className={`card row-card${flash ? ' flash' : ''}${leaving ? ' leaving' : ''}`}>
      <a
        className="card-link"
        href={productUrl(r[0])}
        target="_blank"
        rel="noreferrer"
        aria-label={`Ver ${r[2]} en Casa Ley`}
      />
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
  const [flashIds, setFlashIds] = useState<string[]>([]);
  const [leaving, setLeaving] = useState<ShareItem[]>([]);
  const shareRef = useRef<ShareV1 | null>(null);
  const flashTimer = useRef<number | null>(null);
  const leaveTimer = useRef<number | null>(null);
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

  // Actualización remota (Realtime/poll): anima altas y cambios, desvanece bajas.
  const applyRemoteUpdate = useCallback(
    (ns: ShareV1) => {
      const { added, removed } = diffShare(shareRef.current, ns);
      shareRef.current = ns;
      setShare(ns);
      if (added.length === 0 && removed.length === 0) return;
      if (flashTimer.current) window.clearTimeout(flashTimer.current);
      setFlashIds(added);
      flashTimer.current = window.setTimeout(() => setFlashIds([]), 1800);
      if (leaveTimer.current) window.clearTimeout(leaveTimer.current);
      setLeaving(removed);
      if (removed.length) {
        leaveTimer.current = window.setTimeout(() => setLeaving([]), 500);
      }
      const parts: string[] = [];
      if (added.length) parts.push(`${added.length} producto nuevo(s)`);
      if (removed.length) parts.push(`${removed.length} producto quitado(s)`);
      notify('Lista actualizada: ' + parts.join(', ') + '.');
    },
    [notify],
  );

  useEffect(() => {
    shareRef.current = share;
  }, [share]);
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
  const [snapshot, setSnapshot] = useState<SnapshotMeta | null>(null);
  const [shareLabel, setShareLabel] = useState('');
  const [savedKey, setSavedKey] = useState<{ code: string; editKey: string } | null>(null);
  const unsubRef = useRef<(() => void) | null>(null);
  const pollRef = useRef<number | null>(null);
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
        const upper = found.code.trim().toUpperCase();
        const { share: s, meta } = await loadListOnline(found.code);
        setShare(s);
        setSnapshot(meta);
        dismiss();
        setModalOpen(false);
        setInput('');
        const mine = loadHistory().find((e) => e.code === upper);
        setHistory(recordHistory(s, 'online', upper, meta.label || undefined, mine?.editKey));
        if (unsubRef.current) unsubRef.current();
        unsubRef.current = subscribeList(upper, (ns) => applyRemoteUpdate(ns));
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
      setSnapshot(null);
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
          const upper = qc.trim().toUpperCase();
          const { share: s, meta } = await loadListOnline(qc);
          setShare(s);
          setSnapshot(meta);
          dismiss();
          // Conserva la llave si esta lista es tuya (está en tu historial).
          const mine = loadHistory().find((e) => e.code === upper);
          setHistory(recordHistory(s, 'online', upper, meta.label || undefined, mine?.editKey));
          // Tiempo real: si el dueño la actualiza, se refresca sola.
          // + poll cada 30s como respaldo (por si Realtime no está activo).
          if (unsubRef.current) unsubRef.current();
          unsubRef.current = subscribeList(upper, (ns) => applyRemoteUpdate(ns));
          if (pollRef.current) window.clearInterval(pollRef.current);
          pollRef.current = window.setInterval(async () => {
            if (document.hidden) return;
            try {
              const { share: ns } = await loadListOnline(upper);
              if (JSON.stringify(shareRef.current) !== JSON.stringify(ns)) applyRemoteUpdate(ns);
            } catch {
              /* reintenta en el siguiente ciclo */
            }
          }, 30000);
        } catch (e) {
          setShare(null);
          setSnapshot(null);
          notify('No encontré ese código (' + (e as Error).message + ').');
        }
        return;
      }
      try {
        const { share: s } = parseShareFromLocation();
        if (s) {
          setShare(s);
          setSnapshot(null);
          dismiss();
          // autosave=1 (botón inyectado en Casa Ley): guarda online y cae al ?c= corto.
          const wantAuto = window.location.hash.includes('autosave=1');
          const found = codeFromLocation();
          if (found && found.kind === 'link' && !wantAuto) {
            setHistory(recordHistory(s, 'link', found.code));
          }
          if (wantAuto) {
            if (!backendReady) {
              notify('Para el link corto se necesita backend (aún no configurado).', true);
            } else {
              notify('Guardando online…');
              try {
                const { code, editKey } = await saveListOnline(s);
                setHistory(recordHistory(s, 'online', code, undefined, editKey));
                setSavedKey({ code, editKey });
                window.location.replace(
                  window.location.origin + window.location.pathname + '?c=' + code,
                );
              } catch (e) {
                notify('No pude guardar online: ' + (e as Error).message, true);
              }
            }
          }
        }
      } catch (e) {
        setShare(null);
        notify('El link trae un código que no pude leer (' + (e as Error).message + '). Usa Abrir código.');
      }
    };
    boot();
    window.addEventListener('hashchange', boot);
    return () => {
      window.removeEventListener('hashchange', boot);
      if (unsubRef.current) unsubRef.current();
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
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
      const label = shareLabel.trim() || defaultLabel();
      const { code, editKey } = await saveListOnline(share, label);
      setHistory(recordHistory(share, 'online', code, label, editKey));
      setSavedKey({ code, editKey });
      setSnapshot({ label, savedAt: new Date().toISOString() });
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

  // Foto para el que recibe: congela lo que ve en un código nuevo propio,
  // independiente de lo que siga cambiando el dueño original.
  const saveCopy = async (): Promise<boolean> => {
    if (!share) return false;
    if (!backendReady) {
      notify('Para guardar se necesita backend (aún no configurado).', true);
      return false;
    }
    notify('Guardando copia…');
    try {
      const label = (shareLabel.trim() || defaultLabel()) + ' (copia)';
      const { code, editKey } = await saveListOnline(share, label);
      setHistory(recordHistory(share, 'online', code, label, editKey));
      setSavedKey({ code, editKey });
      const url = window.location.origin + window.location.pathname + '?c=' + code;
      try {
        await navigator.clipboard.writeText(url);
        notify('Copia guardada: ' + code);
      } catch {
        notify('Copia guardada: ' + code, true);
        return false;
      }
      return true;
    } catch (e) {
      notify('No pude guardar la copia: ' + (e as Error).message, true);
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

  const goInstalar = () => {
    setMenuOpen(false);
    window.location.hash = '#/instalar';
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
            <button onClick={goInstalar} className={route === 'instalar' ? 'active' : ''} aria-current={route === 'instalar' ? 'page' : undefined}>Instalar extensión</button>
            <button onClick={goAyuda} className={route === 'ayuda' ? 'active' : ''} aria-current={route === 'ayuda' ? 'page' : undefined}>Cómo funciona</button>
            <div className="sidebar-foot muted">
              compilación {BUILD_LABEL} · hover {HOVER_CAPABLE ? 'sí' : 'no'}
            </div>
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
                        {e.editKey ? ' · editable' : ''}
                      </span>
                    </div>
                    <div className="row-total">
                      <b>{money(e.total)}</b>
                      <div className="row">
                        <button onClick={() => openHistory(e)}>Abrir</button>
                        {e.editKey && (
                          <button
                            onClick={async () => {
                              try {
                                await navigator.clipboard.writeText(e.editKey as string);
                                notify('Clave de edición copiada.');
                              } catch {
                                notify('No pude copiar.', true);
                              }
                            }}
                          >
                            Clave
                          </button>
                        )}
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
        ) : route === 'instalar' ? (
          <section aria-label="Instalar extensión">
            <h2>Instalar extensión</h2>
            <p className="muted">
              Chrome no deja instalar extensiones desde un botón de una página. Estas son las dos formas:
            </p>
            <h3>Opción 1 · Marcador (10 segundos, sin instalar nada)</h3>
            <p className="muted">
              Arrastra este enlace a tu barra de marcadores. Después, con tu carrito de Casa Ley abierto,
              púlsalo y se abre tu lista lista para compartir.
            </p>
            <div className="row">
              <a
                className="btn-link"
                href={BOOKMARKLET_HREF}
                onClick={(e) => {
                  e.preventDefault();
                  notify('Arrástralo a tu barra de marcadores, no le des clic aquí.');
                }}
              >
                Compartir lista Ley
              </a>
              <button
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(BOOKMARKLET_HREF);
                    notify('Código copiado: créalo como marcador manual y pégalo como dirección.');
                  } catch {
                    notify('No pude copiar.', true);
                  }
                }}
              >
                Copiar código
              </button>
            </div>
            <h3>Opción 2 · Extensión completa</h3>
            <div className="dl-card">
              <span className="dl-icon" aria-hidden="true">
                <FiDownload size={22} />
              </span>
              <div className="grow">
                <b>extension.zip</b>
                <br />
                <span className="muted small">Solo la extensión · ~12 KB · última versión del repo</span>
              </div>
              <a
                className="dl-btn"
                href="https://github.com/luisbravoc/proyecto-ley/raw/refs/heads/main/extension.zip"
                target="_blank"
                rel="noreferrer"
              >
                Descargar
              </a>
            </div>
            <ol className="steps">
              <li>Descomprime el archivo.</li>
              <li>Abre <b>chrome://extensions</b> y activa el modo desarrollador.</li>
              <li>Pulsa “Cargar descomprimida” y elige la carpeta <b>extension/</b>.</li>
              <li>Fija el icono y úsalo en tu carrito de Casa Ley.</li>
            </ol>
            <p className="muted">A futuro estará en Chrome Web Store para instalarla con un clic.</p>
            <div className="row">
              <button onClick={goHome}>Volver a la lista</button>
            </div>
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
                  {snapshot?.label ? ` · Foto: ${snapshot.label}` : ''}
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
                    <ProductCard key={r[0]} r={r} grid={view === 'grid'} flash={flashIds.includes(r[0])} />
                  ))}
                  {leaving
                    .filter((r) => !share.p.some((s) => s[0] === r[0]))
                    .map((r) => (
                      <ProductCard key={'out-' + r[0]} r={r} grid={view === 'grid'} flash={false} leaving />
                    ))}
                </div>
                <div className="total-card">
                  <div className="total-row">
                    <span className="muted">Subtotal</span>
                    <b>{money(shareTotal(share))}</b>
                  </div>
                  {savingsTotal(share) > 0 && (
                    <div className="total-row">
                      <span className="offer">Ahorras</span>
                      <b className="offer">{money(savingsTotal(share))}</b>
                    </div>
                  )}
                </div>
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
          <label className="muted" htmlFor="share-label">
            Nombre de la foto (opcional)
          </label>
          <input
            id="share-label"
            value={shareLabel}
            onChange={(e) => setShareLabel(e.target.value)}
            placeholder={defaultLabel()}
            maxLength={60}
          />
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
          <button className="sheet-opt" onClick={() => runShare(saveCopy)}>
            <FiCamera aria-hidden="true" /> Guardar copia
          </button>
          {savedKey && (
            <div className="keybox">
              <b>Tu clave de edición (solo se muestra una vez)</b>
              <p className="muted">
                Con ella puedes actualizar este link después. Se guardó en tu historial de este navegador.
              </p>
              <div className="row">
                <code>{savedKey.editKey}</code>
                <button
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(savedKey.editKey);
                      notify('Clave copiada.');
                    } catch {
                      notify('No pude copiar.', true);
                    }
                  }}
                >
                  Copiar
                </button>
              </div>
            </div>
          )}
          <button onClick={() => { setShareOpen(false); setSavedKey(null); }}>Cerrar</button>
        </div>
      )}

      {toast && (
        <div className={`toast${toast.err ? ' err' : ''}`} role="status">
          {toast.text}
        </div>
      )}

      {route === 'home' && share && (
        <div className="sharebar" role="toolbar" aria-label="Compartir lista">
          <button className="primary" onClick={() => { setShareLabel(defaultLabel()); setShareOpen(true); }}>
            <FiShare2 aria-hidden="true" /> Compartir
          </button>
          {canCloneHere() && <button onClick={clone}>Clonar</button>}
        </div>
      )}
    </>
  );
}
