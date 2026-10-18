import { useState } from 'react';
import { addPurchasePayment, createPurchase, openSession, update, useDB, voidPurchase } from '../lib/store';
import { dayKey, fmtDate, fromDayInput, money, monthKey, num, round2, sum, uid } from '../lib/utils';
import { PAY_LABEL, PAY_METHODS, type PayMethod, type Purchase, type PurchaseItem, type Supplier } from '../lib/types';
import { Empty, Field, Modal, PageHead, Stat, StatusBadge, tryRun } from '../components/ui';

export default function Compras() {
  const db = useDB();
  const [tab, setTab] = useState<'compras' | 'proveedores'>('compras');
  const [creating, setCreating] = useState(false);
  const [view, setView] = useState<Purchase | null>(null);
  const [editSup, setEditSup] = useState<Partial<Supplier> | null>(null);
  const list = [...db.purchases].reverse();
  const valid = db.purchases.filter((p) => p.status !== 'anulada');
  const month = valid.filter((p) => monthKey(p.date) === monthKey());

  return (
    <>
      <PageHead title="Compras" subtitle="Entrada de mercancía, proveedores y cuentas por pagar.">
        {tab === 'compras'
          ? <button className="btn primary" onClick={() => setCreating(true)}>+ Nueva compra</button>
          : <button className="btn primary" onClick={() => setEditSup({})}>+ Proveedor</button>}
      </PageHead>
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat accent label="Compras del mes" value={money(sum(month, (p) => p.total))} hint={`${month.length} compras`} />
        <Stat label="Por pagar a proveedores" value={money(sum(valid, (p) => round2(p.total - p.paid)))} />
        <Stat label="Proveedores" value={String(db.suppliers.length)} />
      </div>
      <div className="tabs">
        <button className={`tab ${tab === 'compras' ? 'active' : ''}`} onClick={() => setTab('compras')}>Compras</button>
        <button className={`tab ${tab === 'proveedores' ? 'active' : ''}`} onClick={() => setTab('proveedores')}>Proveedores</button>
      </div>
      <div className="card">
        {tab === 'compras' ? (list.length === 0 ? <Empty>No hay compras registradas.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>No.</th><th>Fecha</th><th>Proveedor</th><th>Ref.</th><th className="r">Total</th><th className="r">Pendiente</th><th>Estado</th></tr></thead>
              <tbody>
                {list.map((p) => (
                  <tr key={p.id} style={{ cursor: 'pointer' }} onClick={() => setView(p)}>
                    <td className="b">{p.number}</td>
                    <td className="small">{fmtDate(p.date)}</td>
                    <td>{p.supplierName || '—'}</td>
                    <td className="small">{p.invoiceRef}</td>
                    <td className="r nowrap">{money(p.total)}</td>
                    <td className="r nowrap">{p.status === 'pendiente' ? money(p.total - p.paid) : '—'}</td>
                    <td><StatusBadge status={p.status} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )) : (db.suppliers.length === 0 ? <Empty>No hay proveedores.</Empty> : (
          <table className="t">
            <thead><tr><th>Proveedor</th><th>Teléfono</th><th>RNC</th><th className="r">Comprado</th><th /></tr></thead>
            <tbody>
              {db.suppliers.map((s) => (
                <tr key={s.id}>
                  <td className="b">{s.name}</td><td>{s.phone}</td><td>{s.rnc}</td>
                  <td className="r">{money(sum(valid.filter((p) => p.supplierId === s.id), (p) => p.total))}</td>
                  <td className="r"><button className="btn sm" onClick={() => setEditSup(s)}>Editar</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      </div>
      {creating && <PurchaseModal onClose={() => setCreating(false)} />}
      {view && <PurchaseView id={view.id} onClose={() => setView(null)} />}
      {editSup && <SupplierModal value={editSup} onClose={() => setEditSup(null)} />}
    </>
  );
}

function PurchaseModal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const hasCash = Boolean(openSession(db));
  const [supplier, setSupplier] = useState('');
  const [date, setDate] = useState(dayKey());
  const [ref, setRef] = useState('');
  const [items, setItems] = useState<(PurchaseItem & { key: string })[]>([]);
  const [pick, setPick] = useState('');
  const [paid, setPaid] = useState('');
  const [method, setMethod] = useState<PayMethod>('efectivo');
  const [fromCash, setFromCash] = useState(false);
  const [notes, setNotes] = useState('');
  const total = sum(items, (i) => i.qty * i.cost);

  const addItem = (id: string) => {
    const p = db.products.find((x) => x.id === id);
    if (!p) return;
    setItems([...items, { key: uid(), productId: p.id, name: p.name, qty: 1, cost: p.cost }]);
    setPick('');
  };
  const setItem = (key: string, patch: Partial<PurchaseItem>) => setItems(items.map((i) => (i.key === key ? { ...i, ...patch } : i)));

  const save = () => {
    if (!items.length) return alert('Agrega al menos un producto');
    const sup = db.suppliers.find((s) => s.name.toLowerCase() === supplier.trim().toLowerCase());
    let supplierId = sup?.id;
    if (!sup && supplier.trim()) {
      supplierId = uid();
      const ns = { id: supplierId, name: supplier.trim(), phone: '', rnc: '', notes: '' };
      update((d) => void d.suppliers.push(ns));
    }
    const ok = tryRun(() => {
      createPurchase({
        date: date === dayKey() ? new Date().toISOString() : fromDayInput(date),
        supplierId, supplierName: supplier.trim(), invoiceRef: ref,
        items: items.map(({ productId, name, qty, cost }) => ({ productId, name, qty: num(qty), cost: num(cost) })),
        paidNow: paid === '' ? total : num(paid), method, fromCash, notes,
      });
      return true;
    });
    if (ok) onClose();
  };

  return (
    <Modal title="Nueva compra" onClose={onClose} wide
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar compra</button></>}>
      <div className="grid g3">
        <Field label="Proveedor">
          <input className="input" list="sups" value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          <datalist id="sups">{db.suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        <Field label="Fecha"><input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
        <Field label="No. factura del proveedor"><input className="input" value={ref} onChange={(e) => setRef(e.target.value)} /></Field>
      </div>
      <Field label="Agregar producto">
        <select className="input" value={pick} onChange={(e) => addItem(e.target.value)}>
          <option value="">Selecciona un producto…</option>
          {db.products.map((p) => <option key={p.id} value={p.id}>{p.name} (existencia {p.stock})</option>)}
        </select>
      </Field>
      <p className="muted small" style={{ margin: 0 }}>¿Producto nuevo? Créalo primero en Inventario con existencia 0.</p>
      {items.length > 0 && (
        <table className="t">
          <thead><tr><th>Producto</th><th>Cant.</th><th>Costo unit.</th><th className="r">Importe</th><th /></tr></thead>
          <tbody>
            {items.map((i) => (
              <tr key={i.key}>
                <td>{i.name}</td>
                <td><input className="input" style={{ width: 80 }} type="number" value={i.qty} onChange={(e) => setItem(i.key, { qty: num(e.target.value) })} /></td>
                <td><input className="input" style={{ width: 110 }} type="number" value={i.cost} onChange={(e) => setItem(i.key, { cost: num(e.target.value) })} /></td>
                <td className="r nowrap">{money(i.qty * i.cost)}</td>
                <td><button className="btn sm danger" onClick={() => setItems(items.filter((x) => x.key !== i.key))}>×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      <div className="totals"><div className="row grand"><span>Total compra</span><span>{money(total)}</span></div></div>
      <div className="grid g3">
        <Field label="Monto pagado ahora (vacío = todo)"><input className="input" type="number" value={paid} placeholder={String(total)} onChange={(e) => setPaid(e.target.value)} /></Field>
        <Field label="Método">
          <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}
          </select>
        </Field>
        <Field label="Notas"><input className="input" value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      </div>
      {method === 'efectivo' && hasCash && (
        <label className="check"><input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} /> Pagado con efectivo de la caja abierta</label>
      )}
    </Modal>
  );
}

function PurchaseView({ id, onClose }: { id: string; onClose: () => void }) {
  const db = useDB();
  const p = db.purchases.find((x) => x.id === id)!;
  const [amount, setAmount] = useState(String(round2(p.total - p.paid)));
  const [method, setMethod] = useState<PayMethod>('efectivo');
  const [fromCash, setFromCash] = useState(false);
  const pending = round2(p.total - p.paid);
  return (
    <Modal title={`Compra ${p.number}`} onClose={onClose} wide
      footer={p.status !== 'anulada' ? (
        <button className="btn danger" onClick={() => confirm('¿Anular la compra? Se descontará del inventario.') && (voidPurchase(p.id), onClose())}>Anular compra</button>
      ) : undefined}>
      <div className="grid g3">
        <div><div className="muted small">Proveedor</div><b>{p.supplierName || '—'}</b></div>
        <div><div className="muted small">Fecha</div><b>{fmtDate(p.date)}</b></div>
        <div><div className="muted small">Estado</div><StatusBadge status={p.status} /></div>
      </div>
      <table className="t">
        <thead><tr><th>Producto</th><th className="c">Cant.</th><th className="r">Costo</th><th className="r">Importe</th></tr></thead>
        <tbody>{p.items.map((i, k) => <tr key={k}><td>{i.name}</td><td className="c">{i.qty}</td><td className="r">{money(i.cost)}</td><td className="r">{money(i.qty * i.cost)}</td></tr>)}</tbody>
      </table>
      <div className="totals" style={{ maxWidth: 300, marginLeft: 'auto', width: '100%' }}>
        <div className="row grand"><span>Total</span><span>{money(p.total)}</span></div>
        <div className="row"><span>Pagado</span><span>{money(p.paid)}</span></div>
        {pending > 0 && <div className="row b pink"><span>Pendiente</span><span>{money(pending)}</span></div>}
      </div>
      {p.status === 'pendiente' && (
        <div className="card">
          <h3>Registrar pago al proveedor</h3>
          <div className="grid g3">
            <Field label="Monto"><input className="input" type="number" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
            <Field label="Método">
              <select className="input" value={method} onChange={(e) => setMethod(e.target.value as PayMethod)}>
                {PAY_METHODS.map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}
              </select>
            </Field>
            <Field label=" ">
              <button className="btn primary" onClick={() => tryRun(() => addPurchasePayment(p.id, num(amount), method, fromCash))}>Pagar</button>
            </Field>
          </div>
          {method === 'efectivo' && openSession(db) && (
            <label className="check" style={{ marginTop: 8 }}><input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} /> Pagado con efectivo de la caja</label>
          )}
        </div>
      )}
    </Modal>
  );
}

function SupplierModal({ value, onClose }: { value: Partial<Supplier>; onClose: () => void }) {
  const isNew = !value.id;
  const [f, setF] = useState({ name: value.name || '', phone: value.phone || '', rnc: value.rnc || '', notes: value.notes || '' });
  const save = () => {
    if (!f.name.trim()) return alert('El nombre es obligatorio');
    update((d) => {
      if (isNew) d.suppliers.push({ ...f, id: uid() });
      else Object.assign(d.suppliers.find((x) => x.id === value.id)!, f);
    });
    onClose();
  };
  return (
    <Modal title={isNew ? 'Nuevo proveedor' : 'Editar proveedor'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn danger" onClick={() => { if (confirm('¿Eliminar proveedor?')) { update((d) => void (d.suppliers = d.suppliers.filter((x) => x.id !== value.id))); onClose(); } }}>Eliminar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <div className="grid g2">
        <Field label="Nombre"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="Teléfono"><input className="input" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="RNC"><input className="input" value={f.rnc} onChange={(e) => setF({ ...f, rnc: e.target.value })} /></Field>
        <Field label="Notas"><input className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </Modal>
  );
}
