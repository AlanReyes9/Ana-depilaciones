import { useMemo, useState } from 'react';
import { adjustStock, update, useDB } from '../lib/store';
import { download, fmtDateTime, money, num, sum, uid } from '../lib/utils';
import type { Product, Service } from '../lib/types';
import { Empty, Field, Modal, PageHead, Stat } from '../components/ui';

type Tab = 'productos' | 'servicios' | 'movimientos';

export default function Inventario() {
  const db = useDB();
  const [tab, setTab] = useState<Tab>('productos');
  const [q, setQ] = useState('');
  const [cat, setCat] = useState('');
  const [editP, setEditP] = useState<Partial<Product> | null>(null);
  const [editS, setEditS] = useState<Partial<Service> | null>(null);
  const [adj, setAdj] = useState<Product | null>(null);

  const products = useMemo(() => {
    const qq = q.toLowerCase();
    return db.products
      .filter((p) => (!cat || p.category === cat) && (!qq || p.name.toLowerCase().includes(qq) || p.sku.toLowerCase().includes(qq)))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [db, q, cat]);
  const services = useMemo(
    () => db.services.filter((s) => (!cat || s.category === cat) && (!q || s.name.toLowerCase().includes(q.toLowerCase()))),
    [db, q, cat],
  );
  const active = db.products.filter((p) => p.active);

  const exportCsv = () => {
    const rows = [
      ['Código', 'Producto', 'Categoría', 'Costo', 'Precio', 'Existencia', 'Mínimo', 'Valor costo', 'Valor venta'],
      ...db.products.map((p) => [p.sku, p.name, p.category, p.cost, p.price, p.stock, p.minStock, p.cost * p.stock, p.price * p.stock]),
    ];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), 'inventario.csv');
  };

  return (
    <>
      <PageHead title="Inventario" subtitle="Productos, servicios y movimientos de existencia.">
        {tab === 'productos' && <button className="btn" onClick={exportCsv}>⬇️ Exportar</button>}
        {tab === 'productos' && (
          <button className="btn primary" onClick={() => setEditP({ category: db.settings.productCategories[0] || '', active: true, minStock: 3 })}>
            + Producto
          </button>
        )}
        {tab === 'servicios' && (
          <button className="btn primary" onClick={() => setEditS({ category: db.settings.serviceCategories[0] || '', active: true, duration: 30 })}>
            + Servicio
          </button>
        )}
      </PageHead>

      <div className="grid g4" style={{ marginBottom: 14 }}>
        <Stat accent label="Invertido en productos" value={money(sum(active, (p) => Math.max(0, p.stock) * p.cost))} hint="Existencia × costo" />
        <Stat label="Valor a precio de venta" value={money(sum(active, (p) => Math.max(0, p.stock) * p.price))} />
        <Stat label="Productos / unidades" value={`${active.length} / ${sum(active, (p) => Math.max(0, p.stock))}`} />
        <Stat label="Stock bajo" value={String(active.filter((p) => p.stock <= p.minStock).length)} hint="En o debajo del mínimo" />
      </div>

      <div className="tabs">
        {(['productos', 'servicios', 'movimientos'] as Tab[]).map((t) => (
          <button key={t} className={`tab ${tab === t ? 'active' : ''}`} onClick={() => { setTab(t); setCat(''); }}>
            {t[0].toUpperCase() + t.slice(1)}
          </button>
        ))}
      </div>

      <div className="card">
        {tab !== 'movimientos' && (
          <div className="toolbar">
            <input className="input" placeholder="Buscar…" value={q} onChange={(e) => setQ(e.target.value)} />
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">Todas las categorías</option>
              {(tab === 'productos' ? db.settings.productCategories : db.settings.serviceCategories).map((c) => <option key={c}>{c}</option>)}
            </select>
          </div>
        )}

        {tab === 'productos' && (products.length === 0 ? <Empty>No hay productos.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Código</th><th>Producto</th><th>Categoría</th><th className="r">Costo</th><th className="r">Precio</th><th className="r">Margen</th><th className="c">Existencia</th><th /></tr></thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.id} style={{ opacity: p.active ? 1 : 0.5 }}>
                    <td className="small muted">{p.sku}</td>
                    <td className="b">{p.name}</td>
                    <td className="small">{p.category}</td>
                    <td className="r nowrap">{money(p.cost)}</td>
                    <td className="r nowrap">{money(p.price)}</td>
                    <td className="r small">{p.price ? Math.round(((p.price - p.cost) / p.price) * 100) : 0}%</td>
                    <td className="c">
                      <span className={`badge ${p.stock <= 0 ? 'bad' : p.stock <= p.minStock ? 'warn' : 'ok'}`}>{p.stock}</span>
                    </td>
                    <td className="r nowrap">
                      <button className="btn sm" onClick={() => setAdj(p)}>Ajustar</button>{' '}
                      <button className="btn sm" onClick={() => setEditP(p)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'servicios' && (services.length === 0 ? <Empty>No hay servicios.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Servicio</th><th>Categoría</th><th className="c">Duración</th><th className="r">Precio</th><th /></tr></thead>
              <tbody>
                {services.map((s) => (
                  <tr key={s.id} style={{ opacity: s.active ? 1 : 0.5 }}>
                    <td className="b">{s.name}</td>
                    <td className="small">{s.category}</td>
                    <td className="c small">{s.duration} min</td>
                    <td className="r nowrap">{money(s.price)}</td>
                    <td className="r"><button className="btn sm" onClick={() => setEditS(s)}>Editar</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}

        {tab === 'movimientos' && (db.stockMoves.length === 0 ? <Empty>Sin movimientos.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Fecha</th><th>Producto</th><th>Tipo</th><th>Referencia</th><th className="r">Cantidad</th></tr></thead>
              <tbody>
                {[...db.stockMoves].reverse().slice(0, 500).map((m) => (
                  <tr key={m.id}>
                    <td className="small nowrap">{fmtDateTime(m.date)}</td>
                    <td>{m.productName}</td>
                    <td><span className="badge pink">{m.type}</span></td>
                    <td className="small">{m.ref}</td>
                    <td className={`r b ${m.qty < 0 ? 'pink' : ''}`}>{m.qty > 0 ? '+' : ''}{m.qty}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      {editP && <ProductModal value={editP} onClose={() => setEditP(null)} />}
      {editS && <ServiceModal value={editS} onClose={() => setEditS(null)} />}
      {adj && <AdjustModal product={adj} onClose={() => setAdj(null)} />}
    </>
  );
}

function ProductModal({ value, onClose }: { value: Partial<Product>; onClose: () => void }) {
  const db = useDB();
  const isNew = !value.id;
  const [f, setF] = useState({
    sku: value.sku || '', name: value.name || '', category: value.category || '', cost: String(value.cost ?? ''),
    price: String(value.price ?? ''), stock: String(value.stock ?? 0), minStock: String(value.minStock ?? 3), active: value.active ?? true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.name.trim()) return alert('El nombre es obligatorio');
    const data = {
      sku: f.sku.trim(), name: f.name.trim(), category: f.category, cost: num(f.cost), price: num(f.price),
      minStock: num(f.minStock), active: f.active,
    };
    if (isNew) {
      const id = uid();
      update((d) => {
        d.products.push({ ...data, id, stock: 0, createdAt: new Date().toISOString() });
      });
      if (num(f.stock)) adjustStock(id, num(f.stock), 'Existencia inicial');
    } else {
      update((d) => {
        const p = d.products.find((x) => x.id === value.id)!;
        Object.assign(p, data);
      });
    }
    onClose();
  };
  const remove = () => {
    if (!confirm('¿Eliminar este producto? Las facturas anteriores no se modifican.')) return;
    update((d) => void (d.products = d.products.filter((x) => x.id !== value.id)));
    onClose();
  };
  return (
    <Modal title={isNew ? 'Nuevo producto' : 'Editar producto'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn danger" onClick={remove}>Eliminar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <div className="grid g2">
        <Field label="Nombre"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Código / SKU"><input className="input" value={f.sku} onChange={set('sku')} /></Field>
        <Field label="Categoría">
          <select className="input" value={f.category} onChange={set('category')}>
            {db.settings.productCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Stock mínimo"><input className="input" type="number" value={f.minStock} onChange={set('minStock')} /></Field>
        <Field label="Costo"><input className="input" type="number" inputMode="decimal" value={f.cost} onChange={set('cost')} /></Field>
        <Field label="Precio de venta"><input className="input" type="number" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
        {isNew && <Field label="Existencia inicial"><input className="input" type="number" value={f.stock} onChange={set('stock')} /></Field>}
      </div>
      {!isNew && <p className="muted small">Para cambiar la existencia usa “Ajustar” o registra una compra.</p>}
      <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo (visible en punto de venta)</label>
    </Modal>
  );
}

function ServiceModal({ value, onClose }: { value: Partial<Service>; onClose: () => void }) {
  const db = useDB();
  const isNew = !value.id;
  const [f, setF] = useState({
    name: value.name || '', category: value.category || '', price: String(value.price ?? ''), duration: String(value.duration ?? 30), active: value.active ?? true,
  });
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });
  const save = () => {
    if (!f.name.trim()) return alert('El nombre es obligatorio');
    const data = { name: f.name.trim(), category: f.category, price: num(f.price), duration: num(f.duration), active: f.active };
    update((d) => {
      if (isNew) d.services.push({ ...data, id: uid() });
      else Object.assign(d.services.find((x) => x.id === value.id)!, data);
    });
    onClose();
  };
  const remove = () => {
    if (!confirm('¿Eliminar este servicio?')) return;
    update((d) => void (d.services = d.services.filter((x) => x.id !== value.id)));
    onClose();
  };
  return (
    <Modal title={isNew ? 'Nuevo servicio' : 'Editar servicio'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn danger" onClick={remove}>Eliminar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <div className="grid g2">
        <Field label="Nombre"><input className="input" value={f.name} onChange={set('name')} autoFocus /></Field>
        <Field label="Categoría">
          <select className="input" value={f.category} onChange={set('category')}>
            {db.settings.serviceCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Precio"><input className="input" type="number" inputMode="decimal" value={f.price} onChange={set('price')} /></Field>
        <Field label="Duración (min)"><input className="input" type="number" value={f.duration} onChange={set('duration')} /></Field>
      </div>
      <label className="check"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Activo</label>
    </Modal>
  );
}

function AdjustModal({ product, onClose }: { product: Product; onClose: () => void }) {
  const [stock, setStock] = useState(String(product.stock));
  const [reason, setReason] = useState('Conteo físico');
  return (
    <Modal title={`Ajustar existencia · ${product.name}`} onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={() => { adjustStock(product.id, num(stock), reason); onClose(); }}>Guardar</button></>}>
      <div className="alert small">Existencia actual: <b>{product.stock}</b></div>
      <div className="grid g2">
        <Field label="Nueva existencia"><input className="input" type="number" value={stock} onChange={(e) => setStock(e.target.value)} autoFocus /></Field>
        <Field label="Motivo">
          <select className="input" value={reason} onChange={(e) => setReason(e.target.value)}>
            {['Conteo físico', 'Producto dañado', 'Producto vencido', 'Uso interno (cabina)', 'Regalo / muestra', 'Otro'].map((r) => <option key={r}>{r}</option>)}
          </select>
        </Field>
      </div>
    </Modal>
  );
}
