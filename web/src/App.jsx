import React, { useCallback, useEffect, useState } from 'react';
import {
  BACKEND_URL, b64urlDecode, canCloneHere, cloneShareHere, hasOffer, imgUrl,
  money, parseShareFromLocation, qtyText, shareToWhatsApp, shareTotal,
  storeName, unitPrice,
} from './lib/share.js';

function ProductCard({ r }) {
  const [hideImg, setHideImg] = useState(false);
  const src = imgUrl(r[6]);
  const offer = hasOffer(r);
  return (
    <div className="card">
      {src && !hideImg && <img src={src} onError={() => setHideImg(true)} alt="" />}
      <div>
        <b>{r[2]}</b><br />
        <span className="muted">{qtyText(r)}</span><br />
        <b>{money(r[8])}</b>{' '}
        {offer
          ? <span style={{ color: '#0a7b2e' }}>Oferta {money(r[3])} c/u (antes {money(r[4])})</span>
          : <span className="muted">{money(unitPrice(r))} c/u</span>}
      </div>
    </div>
  );
}

export default function App() {
  const [share, setShare] = useState(null);
  const [msg, setMsg] = useState('');
  const [input, setInput] = useState('');

  const load = useCallback((code) => {
    try {
      const s = b64urlDecode(code);
      if (!s || s.v !== 1 || !Array.isArray(s.p)) throw new Error('Código inválido.');
      setShare(s);
      setMsg('');
    } catch (e) {
      setShare(null);
      setMsg('No pude leer el código (' + e.message + ').');
    }
  }, []);

  useEffect(() => {
    const boot = () => {
      try {
        const { share: s } = parseShareFromLocation();
        if (s) { setShare(s); setMsg(''); }
      } catch (e) {
        setShare(null);
        setMsg('El link trae un código que no pude leer (' + e.message + '). Pégalo abajo.');
      }
    };
    boot();
    window.addEventListener('hashchange', boot);
    return () => window.removeEventListener('hashchange', boot);
  }, []);

  const copyText = async () => {
    if (!share) return;
    const txt = shareToWhatsApp(share);
    try { await navigator.clipboard.writeText(txt); setMsg('Copiado para WhatsApp.'); }
    catch { setMsg('No pude autocopiar. Texto:\n' + txt); }
  };

  const copyLink = async () => {
    const url = window.location.href;
    try { await navigator.clipboard.writeText(url); setMsg('Link copiado.'); }
    catch { setMsg('No pude autocopiar. Copia la URL del navegador.'); }
  };

  const clone = async () => {
    if (!share) { setMsg('Primero carga una lista.'); return; }
    if (!canCloneHere()) {
      setMsg('Para clonar usa la extensión (botón Clonar) estando en tusuper.casaley.com.mx. Esta página solo muestra.');
      return;
    }
    setMsg('Clonando con tu sesión local…');
    try {
      const r = await cloneShareHere(share);
      setMsg(`Listo. Total backend: $${r.total}. Recarga el carrito.`);
    } catch (e) { setMsg('Error al clonar: ' + e.message); }
  };

  return (
    <main>
      <h1>Mi lista Casa Ley</h1>
      <p className="muted">
        {share
          ? `${share.p.length} ${share.p.length === 1 ? 'producto' : 'productos'}${storeName(share) ? ` · ${storeName(share)}` : ''} · Precios de referencia, pueden variar en tienda.`
          : 'Pega el link o código #c=… para ver la lista.'}
        {BACKEND_URL && <span> · Backend activo</span>}
      </p>
      <textarea value={input} onChange={(e) => setInput(e.target.value)}
        placeholder="Pega aquí el link compartido o el código #c=…" />
      <br />
      <button onClick={() => load(input)}>Ver lista</button>
      <button onClick={copyText}>Copiar como texto</button>
      <button onClick={copyLink}>Copiar link</button>
      <button className="primary" onClick={clone} style={{ display: canCloneHere() ? '' : 'none' }}>Clonar en mi carrito</button>
      {!canCloneHere() && share && (
        <p className="muted">¿Es tu lista? Para pasarla a tu carrito usa la extensión estando en tusuper.</p>
      )}
      {msg && <div id="msg">{msg}</div>}
      {share && (
        <>
          {share.p.map((r) => <ProductCard key={r[0]} r={r} />)}
          <h2>Total aproximado: {money(shareTotal(share))}</h2>
          <p className="muted">Puede variar en tienda.</p>
        </>
      )}
    </main>
  );
}
