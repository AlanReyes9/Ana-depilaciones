import { useSyncExternalStore } from 'react';
import type {
  CashSession, DB, Expense, PayMethod, Payment, Purchase, PurchaseItem, Sale, SaleItem, StockMove,
} from './types';
import { PAY_METHODS } from './types';
import { calcTotals, round2, setCurrency, sum, uid } from './utils';
import { defaultSettings, seedDB } from './seed';

const KEY = 'ana-erp-db-v1';

function migrate(raw: Partial<DB>): DB {
  const base = seedDB();
  return {
    ...base,
    ...raw,
    settings: { ...defaultSettings, ...(raw.settings || {}) },
  } as DB;
}

function load(): DB {
  try {
    const s = localStorage.getItem(KEY);
    if (s) return migrate(JSON.parse(s));
  } catch (e) {
    console.error('No se pudo leer la base de datos local', e);
  }
  return seedDB();
}

let db: DB = load();
setCurrency(db.settings.currency);
const listeners = new Set<() => void>();
let remoteSaver: ((db: DB) => void) | null = null;

export const setRemoteSaver = (fn: ((db: DB) => void) | null) => (remoteSaver = fn);

function persist() {
  try {
    localStorage.setItem(KEY, JSON.stringify(db));
  } catch (e) {
    alert('No se pudo guardar en este dispositivo (¿almacenamiento lleno?). Exporta un respaldo desde Configuración.');
    console.error(e);
  }
  remoteSaver?.(db);
}

export const getDB = () => db;

export function replaceDB(next: Partial<DB>, save = true) {
  db = migrate(next);
  setCurrency(db.settings.currency);
  if (save) persist();
  else localStorage.setItem(KEY, JSON.stringify(db));
  listeners.forEach((l) => l());
}

/** Applies a mutation to a copy of the database, then persists and notifies. */
export function update(fn: (d: DB) => void) {
  const draft = structuredClone(db);
  fn(draft);
  db = draft;
  setCurrency(db.settings.currency);
  persist();
  listeners.forEach((l) => l());
}

export function useDB(): DB {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => db,
  );
}

// ---------- Caja ----------

export const openSession = (d: DB) => d.cashSessions.find((s) => s.status === 'abierta');

export function openCash(openingAmount: number, notes = '') {
  if (openSession(db)) throw new Error('Ya hay una caja abierta');
  const s: CashSession = {
    id: uid(), openedAt: new Date().toISOString(), openingAmount, status: 'abierta', movements: [], notes,
  };
  update((d) => void d.cashSessions.push(s));
  return s;
}

export function addCashMovement(type: 'entrada' | 'salida', amount: number, reason: string) {
  update((d) => {
    const s = openSession(d);
    if (!s) throw new Error('No hay caja abierta');
    s.movements.push({ id: uid(), date: new Date().toISOString(), type, amount, reason });
  });
}

const zero = (): Record<PayMethod, number> => ({ efectivo: 0, tarjeta: 0, transferencia: 0 });

export function sessionSummary(d: DB, s: CashSession) {
  const inflow = zero();
  let collections = 0;
  const salesInSession = d.sales.filter((x) => x.cashSessionId === s.id && x.status !== 'anulada');
  for (const sale of d.sales) {
    if (sale.status === 'anulada') continue;
    for (const p of sale.payments) {
      if (p.cashSessionId !== s.id) continue;
      inflow[p.method] = round2(inflow[p.method] + p.amount);
      if (sale.cashSessionId !== s.id) collections = round2(collections + p.amount);
    }
  }
  const expenses = d.expenses.filter((e) => e.cashSessionId === s.id);
  const expensesCash = sum(expenses, (e) => e.amount);
  let purchasesCash = 0;
  for (const pu of d.purchases) {
    if (pu.status === 'anulada') continue;
    for (const p of pu.payments) if (p.cashSessionId === s.id) purchasesCash = round2(purchasesCash + p.amount);
  }
  const entradas = sum(s.movements.filter((m) => m.type === 'entrada'), (m) => m.amount);
  const salidas = sum(s.movements.filter((m) => m.type === 'salida'), (m) => m.amount);
  const expected = { ...inflow };
  expected.efectivo = round2(s.openingAmount + inflow.efectivo + entradas - salidas - expensesCash - purchasesCash);
  const products = sum(salesInSession, (x) => sum(x.items.filter((i) => i.type === 'product'), (i) => i.qty * i.price));
  const services = sum(salesInSession, (x) => sum(x.items.filter((i) => i.type === 'service'), (i) => i.qty * i.price));
  return {
    inflow, expected, entradas, salidas, expensesCash, purchasesCash, collections,
    salesCount: salesInSession.length,
    salesTotal: sum(salesInSession, (x) => x.total),
    pendingTotal: sum(salesInSession, (x) => x.balance),
    discounts: sum(salesInSession, (x) => x.discount),
    tax: sum(salesInSession, (x) => x.tax),
    products, services,
    totalIn: sum(PAY_METHODS, (m) => inflow[m]),
  };
}

export function closeCash(counted: Record<PayMethod, number>, notes: string) {
  let closed: CashSession | undefined;
  update((d) => {
    const s = openSession(d);
    if (!s) throw new Error('No hay caja abierta');
    s.expected = sessionSummary(d, s).expected;
    s.counted = counted;
    s.closedAt = new Date().toISOString();
    s.status = 'cerrada';
    s.notes = notes;
    closed = s;
  });
  return closed!;
}

// ---------- Ventas ----------

function stockMove(d: DB, productId: string, qty: number, type: StockMove['type'], ref: string) {
  const p = d.products.find((x) => x.id === productId);
  if (!p) return;
  p.stock = round2(p.stock + qty);
  d.stockMoves.push({ id: uid(), date: new Date().toISOString(), productId, productName: p.name, qty, type, ref });
}

export interface NewSale {
  items: SaleItem[];
  discount: number;
  clientId?: string;
  clientName: string;
  clientPhone: string;
  payments: { method: PayMethod; amount: number }[];
  notes: string;
}

export function createSale(input: NewSale): Sale {
  let sale!: Sale;
  update((d) => {
    const s = openSession(d);
    if (!s) throw new Error('Debes abrir la caja antes de vender');
    const t = calcTotals(input.items, input.discount, d.settings);
    const now = new Date().toISOString();
    const received = round2(input.payments.reduce((a, p) => a + p.amount, 0));
    // Change is always returned in cash.
    const change = Math.max(0, round2(received - t.total));
    const payments: Payment[] = [];
    let toApply = t.total;
    for (const p of input.payments) {
      if (p.amount <= 0 || toApply <= 0) continue;
      let amt = p.amount;
      if (p.method === 'efectivo') amt = round2(amt - change);
      amt = Math.min(amt, toApply);
      if (amt <= 0) continue;
      toApply = round2(toApply - amt);
      payments.push({ id: uid(), date: now, amount: round2(amt), method: p.method, cashSessionId: s.id });
    }
    const paid = sum(payments, (p) => p.amount);
    const number = `${d.settings.invoicePrefix}-${String(d.settings.nextInvoice).padStart(6, '0')}`;
    d.settings.nextInvoice += 1;
    sale = {
      id: uid(), number, date: now,
      clientId: input.clientId, clientName: input.clientName || 'Cliente general', clientPhone: input.clientPhone,
      items: input.items, discount: input.discount, ...t,
      paid, balance: round2(t.total - paid), change,
      status: t.total - paid > 0.009 ? 'pendiente' : 'pagada',
      payments, cashSessionId: s.id, notes: input.notes,
    };
    d.sales.push(sale);
    for (const i of input.items) if (i.type === 'product') stockMove(d, i.refId, -i.qty, 'venta', number);
  });
  return sale;
}

export function addSalePayment(saleId: string, amount: number, method: PayMethod, note = '') {
  update((d) => {
    const sale = d.sales.find((x) => x.id === saleId);
    if (!sale || sale.status === 'anulada') throw new Error('Factura no válida');
    const amt = Math.min(round2(amount), sale.balance);
    if (amt <= 0) throw new Error('Monto inválido');
    sale.payments.push({
      id: uid(), date: new Date().toISOString(), amount: amt, method, note, cashSessionId: openSession(d)?.id,
    });
    sale.paid = round2(sale.paid + amt);
    sale.balance = round2(sale.total - sale.paid);
    sale.status = sale.balance > 0.009 ? 'pendiente' : 'pagada';
  });
}

export function voidSale(saleId: string) {
  update((d) => {
    const sale = d.sales.find((x) => x.id === saleId);
    if (!sale || sale.status === 'anulada') return;
    sale.status = 'anulada';
    for (const i of sale.items) if (i.type === 'product') stockMove(d, i.refId, i.qty, 'anulación', sale.number);
  });
}

// ---------- Compras ----------

export interface NewPurchase {
  date: string;
  supplierId?: string;
  supplierName: string;
  invoiceRef: string;
  items: PurchaseItem[];
  paidNow: number;
  method: PayMethod;
  fromCash: boolean;
  notes: string;
}

export function createPurchase(input: NewPurchase) {
  update((d) => {
    const total = sum(input.items, (i) => i.qty * i.cost);
    const number = `COM-${String(d.settings.nextPurchase).padStart(5, '0')}`;
    d.settings.nextPurchase += 1;
    const sess = openSession(d);
    const paid = Math.min(round2(input.paidNow), total);
    const payments: Payment[] = paid > 0
      ? [{
          id: uid(), date: input.date, amount: paid, method: input.method,
          cashSessionId: input.fromCash && input.method === 'efectivo' ? sess?.id : undefined,
        }]
      : [];
    const pu: Purchase = {
      id: uid(), number, date: input.date, supplierId: input.supplierId, supplierName: input.supplierName,
      invoiceRef: input.invoiceRef, items: input.items, total, paid,
      status: total - paid > 0.009 ? 'pendiente' : 'pagada', payments, notes: input.notes,
    };
    d.purchases.push(pu);
    for (const i of input.items) {
      const p = d.products.find((x) => x.id === i.productId);
      if (p) p.cost = i.cost;
      stockMove(d, i.productId, i.qty, 'compra', number);
    }
  });
}

export function addPurchasePayment(id: string, amount: number, method: PayMethod, fromCash: boolean) {
  update((d) => {
    const pu = d.purchases.find((x) => x.id === id);
    if (!pu || pu.status === 'anulada') throw new Error('Compra no válida');
    const amt = Math.min(round2(amount), round2(pu.total - pu.paid));
    if (amt <= 0) throw new Error('Monto inválido');
    pu.payments.push({
      id: uid(), date: new Date().toISOString(), amount: amt, method,
      cashSessionId: fromCash && method === 'efectivo' ? openSession(d)?.id : undefined,
    });
    pu.paid = round2(pu.paid + amt);
    pu.status = pu.total - pu.paid > 0.009 ? 'pendiente' : 'pagada';
  });
}

export function voidPurchase(id: string) {
  update((d) => {
    const pu = d.purchases.find((x) => x.id === id);
    if (!pu || pu.status === 'anulada') return;
    pu.status = 'anulada';
    for (const i of pu.items) stockMove(d, i.productId, -i.qty, 'anulación', pu.number);
  });
}

// ---------- Gastos e inventario ----------

export function addExpense(e: Omit<Expense, 'id' | 'cashSessionId'>, fromCash: boolean) {
  update((d) => {
    const sess = openSession(d);
    d.expenses.push({
      ...e, id: uid(), cashSessionId: fromCash && e.method === 'efectivo' ? sess?.id : undefined,
    });
  });
}

export function adjustStock(productId: string, newStock: number, reason: string) {
  update((d) => {
    const p = d.products.find((x) => x.id === productId);
    if (!p) return;
    const delta = round2(newStock - p.stock);
    if (delta !== 0) stockMove(d, productId, delta, 'ajuste', reason || 'Ajuste manual');
  });
}
