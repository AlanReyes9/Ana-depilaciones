import type { Settings, SaleItem } from './types';

export const uid = () =>
  Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

let currency = 'RD$';
export const setCurrency = (c: string) => (currency = c);

export const money = (n: number, cur = currency) =>
  `${cur} ${(n || 0).toLocaleString('es-DO', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const num = (v: unknown) => {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

/** Local calendar day as YYYY-MM-DD. */
export const dayKey = (d: string | Date = new Date()) => new Date(d).toLocaleDateString('en-CA');
export const monthKey = (d: string | Date = new Date()) => dayKey(d).slice(0, 7);

export const fmtDate = (d: string | Date) =>
  new Date(d).toLocaleDateString('es-DO', { day: '2-digit', month: '2-digit', year: 'numeric' });
export const fmtDateTime = (d: string | Date) =>
  new Date(d).toLocaleString('es-DO', {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

/** Converts a YYYY-MM-DD input value to an ISO timestamp at local noon. */
export const fromDayInput = (v: string) => new Date(`${v}T12:00:00`).toISOString();

export function calcTotals(items: SaleItem[], discount: number, s: Settings) {
  const gross = round2(items.reduce((a, i) => a + i.qty * i.price, 0));
  const net = Math.max(0, round2(gross - discount));
  const r = (s.taxRate || 0) / 100;
  let subtotal: number, tax: number, total: number;
  if (s.pricesIncludeTax) {
    total = net;
    subtotal = round2(net / (1 + r));
    tax = round2(total - subtotal);
  } else {
    subtotal = net;
    tax = round2(net * r);
    total = round2(net + tax);
  }
  return { gross, subtotal, tax, total };
}

export const normalizePhone = (phone: string, countryCode: string) => {
  let p = (phone || '').replace(/\D/g, '');
  if (!p) return '';
  if (p.length <= 10 && countryCode && !p.startsWith(countryCode)) p = countryCode + p;
  return p;
};

export const download = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
};

export const sum = <T,>(arr: T[], f: (x: T) => number) => round2(arr.reduce((a, x) => a + f(x), 0));

/** WhatsApp click-to-chat link. Uses api.whatsapp.com directly because the wa.me redirect garbles emoji. */
export const waLink = (phone: string, text = '') =>
  `https://api.whatsapp.com/send?phone=${phone}${text ? `&text=${encodeURIComponent(text)}` : ''}`;
