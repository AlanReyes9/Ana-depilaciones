import { useMemo, useState } from 'react';
import { update, useDB } from '../lib/store';
import { fmtDate, money, normalizePhone, sum, uid } from '../lib/utils';
import type { Client } from '../lib/types';
import { Empty, Field, Modal, PageHead, StatusBadge } from '../components/ui';
import InvoiceView from '../components/InvoiceView';

export default function Clientes() {
  const db = useDB();
  const [q, setQ] = useState('');
  const [edit, setEdit] = useState<Partial<Client> | null>(null);
  const [detail, setDetail] = useState<Client | null>(null);

  const list = useMemo(() => {
    const qq = q.toLowerCase();
    return db.clients
      .filter((c) => !qq || c.name.toLowerCase().includes(qq) || c.phone.includes(qq))
      .map((c) => {
        const sales = db.sales.filter((s) => s.clientId === c.id && s.status !== 'anulada');
        return { c, count: sales.length, total: sum(sales, (s) => s.total), balance: sum(sales, (s) => s.balance), last: sales.at(-1)?.date };
      })
      .sort((a, b) => a.c.name.localeCompare(b.c.name));
  }, [db, q]);

  return (
    <>
      <PageHead title="Clientes" subtitle="Historial de visitas, consumo y balances.">
        <button className="btn primary" onClick={() => setEdit({})}>+ Cliente</button>
      </PageHead>
      <div className="card">
        <div className="toolbar"><input className="input" placeholder="Buscar nombre o teléfono" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        {list.length === 0 ? <Empty>No hay clientes registrados. También se crean automáticamente desde el punto de venta.</Empty> : (
          <div className="table-wrap">
            <table className="t">
              <thead><tr><th>Cliente</th><th>Teléfono</th><th className="c">Visitas</th><th className="r">Consumo</th><th className="r">Balance</th><th>Última visita</th><th /></tr></thead>
              <tbody>
                {list.map(({ c, count, total, balance, last }) => (
                  <tr key={c.id}>
                    <td className="b"><a href="#" onClick={(e) => { e.preventDefault(); setDetail(c); }}>{c.name}</a></td>
                    <td className="nowrap">{c.phone}</td>
                    <td className="c">{count}</td>
                    <td className="r nowrap">{money(total)}</td>
                    <td className="r nowrap">{balance > 0 ? <span className="badge warn">{money(balance)}</span> : '—'}</td>
                    <td className="small">{last ? fmtDate(last) : '—'}</td>
                    <td className="r nowrap">
                      {c.phone && (
                        <a className="btn sm wa" target="_blank" rel="noreferrer" href={`https://wa.me/${normalizePhone(c.phone, db.settings.countryCode)}`}>WhatsApp</a>
                      )}{' '}
                      <button className="btn sm" onClick={() => setEdit(c)}>Editar</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {edit && <ClientModal value={edit} onClose={() => setEdit(null)} />}
      {detail && <ClientDetail client={detail} onClose={() => setDetail(null)} />}
    </>
  );
}

function ClientModal({ value, onClose }: { value: Partial<Client>; onClose: () => void }) {
  const isNew = !value.id;
  const [f, setF] = useState({ name: value.name || '', phone: value.phone || '', email: value.email || '', notes: value.notes || '' });
  const save = () => {
    if (!f.name.trim()) return alert('El nombre es obligatorio');
    update((d) => {
      if (isNew) d.clients.push({ ...f, name: f.name.trim(), id: uid(), createdAt: new Date().toISOString() });
      else {
        Object.assign(d.clients.find((x) => x.id === value.id)!, f);
        for (const s of d.sales) if (s.clientId === value.id) { s.clientName = f.name; s.clientPhone = s.clientPhone || f.phone; }
      }
    });
    onClose();
  };
  const remove = () => {
    if (!confirm('¿Eliminar este cliente? Sus facturas se conservan.')) return;
    update((d) => void (d.clients = d.clients.filter((x) => x.id !== value.id)));
    onClose();
  };
  return (
    <Modal title={isNew ? 'Nuevo cliente' : 'Editar cliente'} onClose={onClose}
      footer={<>
        {!isNew && <button className="btn danger" onClick={remove}>Eliminar</button>}
        <button className="btn" onClick={onClose}>Cancelar</button>
        <button className="btn primary" onClick={save}>Guardar</button>
      </>}>
      <div className="grid g2">
        <Field label="Nombre"><input className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} autoFocus /></Field>
        <Field label="WhatsApp / teléfono"><input className="input" inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        <Field label="Correo"><input className="input" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
      </div>
      <Field label="Notas (alergias, tipo de piel, preferencias…)">
        <textarea className="input" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
      </Field>
    </Modal>
  );
}

function ClientDetail({ client, onClose }: { client: Client; onClose: () => void }) {
  const db = useDB();
  const [view, setView] = useState<string | null>(null);
  const sales = db.sales.filter((s) => s.clientId === client.id).reverse();
  return (
    <Modal title={client.name} onClose={onClose} wide>
      <div className="small muted">{client.phone} {client.email && `· ${client.email}`}</div>
      {client.notes && <div className="alert small">{client.notes}</div>}
      {sales.length === 0 ? <Empty>Sin facturas.</Empty> : (
        <table className="t">
          <thead><tr><th>Factura</th><th>Fecha</th><th>Detalle</th><th className="r">Total</th><th>Estado</th></tr></thead>
          <tbody>
            {sales.map((s) => (
              <tr key={s.id} style={{ cursor: 'pointer' }} onClick={() => setView(s.id)}>
                <td className="b">{s.number}</td>
                <td className="small">{fmtDate(s.date)}</td>
                <td className="small">{s.items.map((i) => i.name).join(', ')}</td>
                <td className="r nowrap">{money(s.total)}</td>
                <td><StatusBadge status={s.status} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {view && <InvoiceView saleId={view} onClose={() => setView(null)} />}
    </Modal>
  );
}
