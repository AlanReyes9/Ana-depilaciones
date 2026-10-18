import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { createSale, openCash, openSession, update, useDB } from '../lib/store';
import { calcTotals, money, num, round2, uid } from '../lib/utils';
import { PAY_LABEL, PAY_METHODS, type PayMethod, type SaleItem } from '../lib/types';
import { Field, Modal, PageHead, tryRun } from '../components/ui';
import InvoiceView from '../components/InvoiceView';
import { downloadInvoicePdf } from '../lib/documents';

export function OpenCashCard() {
  const [amount, setAmount] = useState('0');
  return (
    <div className="card" style={{ maxWidth: 420 }}>
      <h3>Abrir caja</h3>
      <p className="muted small">Indica el efectivo con el que inicias el día (fondo de caja).</p>
      <div className="grid">
        <Field label="Fondo inicial">
          <input className="input" type="number" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <button className="btn primary" onClick={() => tryRun(() => openCash(num(amount)))}>Abrir caja</button>
      </div>
    </div>
  );
}

type Tab = 'todo' | 'service' | 'product';

export default function POS() {
  const db = useDB();
  const s = db.settings;
  const session = openSession(db);
  const [tab, setTab] = useState<Tab>('todo');
  const [q, setQ] = useState('');
  const [cart, setCart] = useState<SaleItem[]>([]);
  const [discount, setDiscount] = useState('');
  const [discountPct, setDiscountPct] = useState(false);
  const [client, setClient] = useState({ id: '', name: '', phone: '' });
  const [notes, setNotes] = useState('');
  const [checkout, setCheckout] = useState(false);
  const [lastSale, setLastSale] = useState<string | null>(null);

  const catalog = useMemo(() => {
    const qq = q.trim().toLowerCase();
    const items = [
      ...(tab !== 'product'
        ? db.services.filter((x) => x.active).map((x) => ({ type: 'service' as const, id: x.id, name: x.name, cat: x.category, price: x.price, stock: Infinity, cost: 0, sku: '' }))
        : []),
      ...(tab !== 'service'
        ? db.products.filter((x) => x.active).map((x) => ({ type: 'product' as const, id: x.id, name: x.name, cat: x.category, price: x.price, stock: x.stock, cost: x.cost, sku: x.sku }))
        : []),
    ];
    return items.filter((i) => !qq || i.name.toLowerCase().includes(qq) || i.sku.toLowerCase().includes(qq) || i.cat.toLowerCase().includes(qq));
  }, [db, tab, q]);

  const stockOf = (id: string) => db.products.find((p) => p.id === id)?.stock ?? 0;

  const add = (i: (typeof catalog)[number]) => {
    setCart((c) => {
      const ex = c.find((x) => x.refId === i.id);
      if (ex) {
        if (i.type === 'product' && ex.qty + 1 > i.stock) return c;
        return c.map((x) => (x === ex ? { ...x, qty: x.qty + 1 } : x));
      }
      return [...c, { type: i.type, refId: i.id, name: i.name, qty: 1, price: i.price, cost: i.cost }];
    });
  };
  const setQty = (refId: string, qty: number) =>
    setCart((c) =>
      c.flatMap((x) => {
        if (x.refId !== refId) return [x];
        if (qty <= 0) return [];
        const max = x.type === 'product' ? stockOf(x.refId) : Infinity;
        return [{ ...x, qty: Math.min(qty, max) }];
      }),
    );
  const setPrice = (refId: string, price: number) => setCart((c) => c.map((x) => (x.refId === refId ? { ...x, price } : x)));

  const gross = round2(cart.reduce((a, i) => a + i.qty * i.price, 0));
  const discAmount = Math.min(gross, discountPct ? round2((gross * num(discount)) / 100) : num(discount));
  const totals = calcTotals(cart, discAmount, s);

  const pickClient = (name: string) => {
    const c = db.clients.find((x) => x.name.toLowerCase() === name.trim().toLowerCase());
    setClient(c ? { id: c.id, name: c.name, phone: c.phone } : { id: '', name, phone: client.phone });
  };

  const reset = () => {
    setCart([]);
    setDiscount('');
    setClient({ id: '', name: '', phone: '' });
    setNotes('');
  };

  if (!session) {
    return (
      <>
        <PageHead title="Punto de venta" subtitle="Para empezar a facturar abre la caja del día." />
        <OpenCashCard />
      </>
    );
  }

  return (
    <>
      <PageHead title="Punto de venta" subtitle="Selecciona servicios y productos, cobra e imprime o envía la factura.">
        <Link className="btn" to="/caja">💵 Caja</Link>
      </PageHead>
      <div className="pos">
        <div>
          <div className="toolbar">
            <div className="tabs" style={{ margin: 0 }}>
              {(['todo', 'service', 'product'] as Tab[]).map((t) => (
                <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
                  {{ todo: 'Todo', service: 'Servicios', product: 'Productos' }[t]}
                </button>
              ))}
            </div>
            <input className="input" placeholder="Buscar por nombre, código o categoría…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
          <div className="catalog">
            {catalog.map((i) => (
              <button key={i.id} className="tile" onClick={() => add(i)} disabled={i.type === 'product' && i.stock <= 0}>
                <span className="ts">{i.type === 'service' ? '✨ ' : '🧴 '}{i.cat}</span>
                <span className="tn">{i.name}</span>
                {i.type === 'product' && (
                  <span className={`ts ${i.stock <= 0 ? 'b' : ''}`}>{i.stock <= 0 ? 'Agotado' : `Stock: ${i.stock}`}</span>
                )}
                <span className="tp">{money(i.price)}</span>
              </button>
            ))}
          </div>
          {catalog.length === 0 && <div className="empty">No hay resultados. Agrega servicios y productos en Inventario.</div>}
        </div>

        <div className="card cart">
          <h3>🛒 Venta actual</h3>
          <div className="grid" style={{ marginBottom: 8 }}>
            <Field label="Cliente">
              <input
                className="input" list="clients" placeholder="Cliente general" value={client.name}
                onChange={(e) => pickClient(e.target.value)}
              />
              <datalist id="clients">{db.clients.map((c) => <option key={c.id} value={c.name}>{c.phone}</option>)}</datalist>
            </Field>
            <Field label="WhatsApp / teléfono">
              <input className="input" inputMode="tel" value={client.phone} onChange={(e) => setClient({ ...client, phone: e.target.value })} />
            </Field>
          </div>
          {cart.length === 0 && <div className="empty">Toca un servicio o producto para agregarlo.</div>}
          {cart.map((i) => (
            <div key={i.refId} className="cart-item">
              <div>
                <div className="b small">{i.name}</div>
                <div className="small muted">
                  {s.currency}{' '}
                  <input
                    className="input" style={{ width: 90, padding: '3px 6px', display: 'inline' }} type="number" inputMode="decimal"
                    value={i.price} onChange={(e) => setPrice(i.refId, num(e.target.value))}
                  />
                </div>
              </div>
              <div className="r">
                <div className="qty">
                  <button onClick={() => setQty(i.refId, i.qty - 1)}>−</button>
                  <input value={i.qty} inputMode="numeric" onChange={(e) => setQty(i.refId, num(e.target.value))} />
                  <button onClick={() => setQty(i.refId, i.qty + 1)}>+</button>
                </div>
                <div className="b small" style={{ marginTop: 4 }}>{money(i.qty * i.price)}</div>
              </div>
            </div>
          ))}
          <div className="grid g2" style={{ marginTop: 10 }}>
            <Field label={`Descuento ${discountPct ? '(%)' : `(${s.currency})`}`}>
              <div style={{ display: 'flex', gap: 6 }}>
                <input className="input" type="number" inputMode="decimal" value={discount} onChange={(e) => setDiscount(e.target.value)} />
                <button className="btn sm" onClick={() => setDiscountPct(!discountPct)}>{discountPct ? '%' : '$'}</button>
              </div>
            </Field>
            <Field label="Nota">
              <input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
          <div className="totals" style={{ marginTop: 12 }}>
            {discAmount > 0 && <div className="row"><span>Descuento</span><span>-{money(discAmount)}</span></div>}
            <div className="row muted"><span>Subtotal</span><span>{money(totals.subtotal)}</span></div>
            <div className="row muted"><span>{s.taxName} ({s.taxRate}%)</span><span>{money(totals.tax)}</span></div>
            <div className="row grand"><span>Total</span><span>{money(totals.total)}</span></div>
          </div>
          <div className="btns" style={{ marginTop: 12 }}>
            <button className="btn" onClick={reset} disabled={!cart.length}>Limpiar</button>
            <button className="btn primary lg" style={{ flex: 1 }} disabled={!cart.length} onClick={() => setCheckout(true)}>
              Cobrar {money(totals.total)}
            </button>
          </div>
        </div>
      </div>

      {checkout && (
        <Checkout
          total={totals.total}
          clientName={client.name}
          onClose={() => setCheckout(false)}
          onConfirm={(payments, saveClient) => {
            const sale = tryRun(() => {
              let clientId = client.id || undefined;
              if (saveClient && !clientId && client.name.trim()) {
                clientId = uid();
                const c = { id: clientId, name: client.name.trim(), phone: client.phone, email: '', notes: '', createdAt: new Date().toISOString() };
                update((d) => void d.clients.push(c));
              }
              return createSale({
                items: cart, discount: discAmount, clientId, clientName: client.name.trim(), clientPhone: client.phone, payments, notes,
              });
            });
            if (!sale) return;
            if (s.autoPdf) downloadInvoicePdf(sale, s);
            setCheckout(false);
            reset();
            setLastSale(sale.id);
          }}
        />
      )}
      {lastSale && <InvoiceView saleId={lastSale} onClose={() => setLastSale(null)} />}
    </>
  );
}

function Checkout(props: {
  total: number;
  clientName: string;
  onClose: () => void;
  onConfirm: (p: { method: PayMethod; amount: number }[], saveClient: boolean) => void;
}) {
  const [amounts, setAmounts] = useState<Record<PayMethod, string>>({ efectivo: String(props.total), tarjeta: '', transferencia: '' });
  const [saveClient, setSaveClient] = useState(true);
  const vals = Object.fromEntries(PAY_METHODS.map((m) => [m, num(amounts[m])])) as Record<PayMethod, number>;
  const received = round2(PAY_METHODS.reduce((a, m) => a + vals[m], 0));
  const nonCash = round2(vals.tarjeta + vals.transferencia);
  const change = Math.max(0, round2(received - props.total));
  const pending = Math.max(0, round2(props.total - received));
  const invalid = nonCash > props.total + 0.001 || (pending > 0 && !props.clientName.trim());
  const only = (m: PayMethod) => setAmounts({ efectivo: '', tarjeta: '', transferencia: '', [m]: String(props.total) });
  const quick = [100, 200, 500, 1000, 2000].filter((x) => x >= props.total).slice(0, 3);

  return (
    <Modal
      title="Cobrar"
      onClose={props.onClose}
      footer={
        <>
          <button className="btn" onClick={props.onClose}>Cancelar</button>
          <button
            className="btn primary lg" disabled={invalid}
            onClick={() => props.onConfirm(PAY_METHODS.map((m) => ({ method: m, amount: vals[m] })), saveClient)}
          >
            Confirmar venta
          </button>
        </>
      }
    >
      <div className="c">
        <div className="muted small">TOTAL A COBRAR</div>
        <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--pink)' }}>{money(props.total)}</div>
      </div>
      <div className="btns">
        {PAY_METHODS.map((m) => <button key={m} className="btn sm" onClick={() => only(m)}>Todo en {PAY_LABEL[m].toLowerCase()}</button>)}
        <button className="btn sm" onClick={() => setAmounts({ efectivo: '', tarjeta: '', transferencia: '' })}>A crédito</button>
      </div>
      {PAY_METHODS.map((m) => (
        <Field key={m} label={PAY_LABEL[m]}>
          <input
            className="input" type="number" inputMode="decimal" value={amounts[m]}
            onChange={(e) => setAmounts({ ...amounts, [m]: e.target.value })}
          />
        </Field>
      ))}
      {quick.length > 0 && (
        <div className="btns">
          <span className="muted small">Efectivo recibido:</span>
          {quick.map((x) => <button key={x} className="btn sm" onClick={() => setAmounts({ ...amounts, efectivo: String(x) })}>{money(x)}</button>)}
        </div>
      )}
      <div className="totals">
        <div className="row"><span>Recibido</span><b>{money(received)}</b></div>
        {change > 0 && <div className="row grand"><span>Cambio</span><span>{money(change)}</span></div>}
        {pending > 0 && <div className="row b pink"><span>Queda pendiente (crédito)</span><span>{money(pending)}</span></div>}
      </div>
      {nonCash > props.total + 0.001 && <div className="badge bad">Tarjeta/transferencia no pueden exceder el total.</div>}
      {pending > 0 && !props.clientName.trim() && (
        <div className="alert warn small">Para dejar balance pendiente debes indicar el nombre del cliente.</div>
      )}
      {props.clientName.trim() && (
        <label className="check"><input type="checkbox" checked={saveClient} onChange={(e) => setSaveClient(e.target.checked)} /> Guardar cliente si es nuevo</label>
      )}
    </Modal>
  );
}
