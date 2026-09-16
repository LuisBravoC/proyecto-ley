// Codec del formato v1 compartido con viewer.html y ley-share.js.
// El link NUNCA lleva sesión (CustomerID / token_web / WebId): solo productos.

// Tupla compacta: [ProductId, Quantity, artdesc, special_price,
//   normal_price, unitmeasure, picture_name, GRAMS, total]
export type ShareItem = [
  id: string,
  qty: number,
  desc: string,
  special: string | null,
  normal: string,
  unit: string,
  img: string,
  grams: number,
  total: string,
];

export interface ShareV1 {
  v: 1;
  b: string;
  n?: string;
  by?: string;
  p: ShareItem[];
}

export function b64urlEncode(obj: unknown): string {
  const json = JSON.stringify(obj);
  return btoa(unescape(encodeURIComponent(json)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

export function b64urlDecode(code: string): ShareV1 {
  let c = String(code || '').trim();
  const m = c.match(/#c=([A-Za-z0-9\-_]+)/) || c.match(/[\?&]c=([A-Za-z0-9\-_]+)/);
  if (m) c = m[1];
  c = c.replace(/-/g, '+').replace(/_/g, '/');
  while (c.length % 4) c += '=';
  return JSON.parse(decodeURIComponent(escape(atob(c)))) as ShareV1;
}

function isShareV1(s: unknown): s is ShareV1 {
  if (typeof s !== 'object' || s === null) return false;
  const o = s as Record<string, unknown>;
  return o['v'] === 1 && Array.isArray(o['p']);
}

export type ShareSource = 'query' | 'hash' | null;

// Acepta: #/c/<code> (app), #c=<code> (legacy viewer/ley-share), ?c=<code>.
export function parseShareFromLocation(
  loc: Pick<Location, 'search' | 'hash'> = window.location,
): { share: ShareV1 | null; from: ShareSource } {
  const qs = new URLSearchParams(loc.search);
  if (qs.get('c')) return { share: validShareCheck(b64urlDecode(qs.get('c') as string)), from: 'query' };
  const h = loc.hash || '';
  const m = h.match(/#\/c\/([A-Za-z0-9\-_]+)/) || h.match(/#c=([A-Za-z0-9\-_]+)/);
  if (m) return { share: validShareCheck(b64urlDecode(m[1])), from: 'hash' };
  if (/^[#]?[A-Za-z0-9\-_]{20,}/.test(h)) {
    return { share: validShareCheck(b64urlDecode(h.replace(/^#/, ''))), from: 'hash' };
  }
  return { share: null, from: null };
}

function validShareCheck(s: unknown): ShareV1 {
  if (!isShareV1(s)) throw new Error('Código inválido (se esperaba v1 con p=productos).');
  return s;
}

export const BACKEND_URL: string | null = import.meta.env.VITE_BACKEND_URL || null;

export function money(n: string | number | null | undefined): string {
  return '$' + Number(n || 0).toFixed(2);
}

// Precio unitario a mostrar: oferta si existe, si no el normal.
// (special_price viene null cuando no hay oferta → antes pintaba "$0.00".)
export function unitPrice(r: ShareItem): string {
  const s = Number(r[3]);
  return r[3] != null && !isNaN(s) && s > 0 ? (r[3] as string) : r[4];
}

export function hasOffer(r: ShareItem): boolean {
  const s = Number(r[3]);
  const n = Number(r[4]);
  return r[3] != null && !isNaN(s) && s > 0 && s !== n;
}

export function qtyText(r: ShareItem): string {
  const qty = r[1];
  const unit = r[5] || 'PZ';
  const grams = r[7];
  if (unit === 'KG') {
    return qty + ' g' + (grams && Number(grams) !== Number(qty) ? ` (paq. de ${grams} g)` : '');
  }
  return qty + (Number(qty) === 1 ? ' pza' : ' pzas');
}

// Nombre de tienda: viene dinámico en el link ("n"). El id ("b") se conserva
// en el dato para futuro backend, pero no se muestra en frontend.
export function storeName(share: ShareV1): string {
  return share.n || '';
}

// Imágenes: el host real es serviciosapp (.../rails/Images/...). tusuper devuelve HTML.
const IMG_BASE = 'https://serviciosapp.casaley.com.mx/rails/';
export function imgUrl(img: string | null | undefined): string | null {
  if (!img) return null;
  if (/^https?:/i.test(img)) return img;
  return IMG_BASE + String(img).replace(/\\/g, '/').replace(/^\//, '');
}

export function shareTotal(share: ShareV1): number {
  return share.p.reduce((a, r) => a + Number(r[8] || 0), 0);
}

export function shareToWhatsApp(share: ShareV1): string {
  const lines = share.p.map((r) => `- ${r[2]} (${qtyText(r)}) ${money(r[8])}`);
  const store = storeName(share);
  const head = share.by ? `Lista de ${share.by} · Casa Ley` : 'Mi lista Casa Ley';
  return `${head}${store ? ` (${store})` : ''}:\n` + lines.join('\n');
}

export interface CartProductOut {
  ProductId: string;
  msi: boolean;
  orderType: number;
  productType: number;
  UNITCONVERT: boolean | null;
  unitmeasure: string;
  GRAMS: number;
  Quantity: number;
  isKG: boolean;
  comments: string;
  special_price: string;
  normal_price: string;
  artdesc: string;
  picture_name: string;
  substitute: number;
  total: string;
  apartado: boolean;
  RecordType: string;
}

// Clonado: solo funciona si la app corre en origen tusuper (misma sesión local).
// En Pages siempre será falso → la UI muestra usar la extensión.
export function canCloneHere(): boolean {
  return window.location.hostname.includes('casaley');
}

interface BulkAddResponse {
  total?: unknown;
  products?: unknown[];
}

export async function cloneShareHere(
  share: ShareV1,
  api = 'https://serviciosapp.casaley.com.mx/rails/api/bulk_add_to_cart_web',
): Promise<{ total: string; count: number }> {
  const USER = JSON.parse(localStorage.getItem('USER') || '{}') as {
    id?: number;
    token_web?: string;
    loyaltyCard?: string;
  };
  const SUC = JSON.parse(localStorage.getItem('SUCURSAL') || '{}') as { id?: string };
  const WEBSESSION = localStorage.getItem('WEBSESSION') || '';
  if (!USER.id || !USER.token_web) throw new Error('Inicia sesión en Casa Ley primero.');
  const products: CartProductOut[] = share.p.map((r) => {
    const isKG = r[5] === 'KG';
    return {
      ProductId: r[0],
      msi: false,
      orderType: 1,
      productType: 1,
      UNITCONVERT: isKG ? true : null,
      unitmeasure: r[5],
      GRAMS: r[7] || 0,
      Quantity: r[1],
      isKG,
      comments: '',
      special_price: String(r[3] ?? ''),
      normal_price: String(r[4] ?? ''),
      artdesc: r[2],
      picture_name: r[6],
      substitute: 0,
      total: String(r[8] ?? ''),
      apartado: false,
      RecordType: 'I',
    };
  });
  const payload = {
    CustomerID: USER.id,
    WebId: WEBSESSION,
    loyaltyCard: USER.loyaltyCard || '',
    orderType: 1,
    points: '',
    products,
    redeempoints: 0,
    register_no: SUC.id || share.b || '1086',
    user: { token_web: USER.token_web },
  };
  const res = await fetch(api, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error('API ' + res.status);
  const data = (await res.json()) as BulkAddResponse;
  return { total: String(data.total ?? ''), count: (data.products || []).length };
}
