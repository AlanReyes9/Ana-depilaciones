import { useMemo, useState } from 'react';
import { addExpense, openSession, update, useDB } from '../lib/store';
import { dayKey, download, fmtDate, fromDayInput, money, monthKey, num, sum } from '../lib/utils';
import { PAY_LABEL, PAY_METHODS, type PayMethod } from '../lib/types';
import { Empty, Field, Modal, PageHead, Stat } from '../components/ui';

export default function Gastos() {
  const db = useDB();
  const [month, setMonth] = useState(monthKey());
  const [cat, setCat] = useState('');
  const [adding, setAdding] = useState(false);

  const list = useMemo(
    () => db.expenses.filter((e) => monthKey(e.date) === month && (!cat || e.category === cat)).sort((a, b) => b.date.localeCompare(a.date)),
    [db, month, cat],
  );
  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    for (const e of db.expenses.filter((x) => monthKey(x.date) === month)) m.set(e.category, (m.get(e.category) || 0) + e.amount);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [db, month]);
  const total = sum(list, (e) => e.amount);
  const max = Math.max(1, ...byCat.map((x) => x[1]));

  const exportCsv = () => {
    const rows = [['Fecha', 'Categoría', 'Descripción', 'Método', 'Monto'], ...list.map((e) => [fmtDate(e.date), e.category, e.description, PAY_LABEL[e.method], e.amount])];
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
    download(new Blob(['﻿' + csv], { type: 'text/csv' }), `gastos_${month}.csv`);
  };

  return (
    <>
      <PageHead title="Gastos" subtitle="Registra los gastos del negocio para conocer tu utilidad real.">
        <button className="btn" onClick={exportCsv}>⬇️ Exportar</button>
        <button className="btn primary" onClick={() => setAdding(true)}>+ Gasto</button>
      </PageHead>
      <div className="grid g3" style={{ marginBottom: 14 }}>
        <Stat accent label="Gastos del mes" value={money(sum(db.expenses.filter((e) => monthKey(e.date) === month), (e) => e.amount))} />
        <Stat label="Registros" value={String(list.length)} />
        <Stat label="Mayor categoría" value={byCat[0]?.[0] || '—'} hint={byCat[0] ? money(byCat[0][1]) : ''} />
      </div>
      <div className="grid g2" style={{ gridTemplateColumns: 'minmax(0,2fr) minmax(0,1fr)' }}>
        <div className="card">
          <div className="toolbar">
            <input className="input" type="month" value={month} onChange={(e) => setMonth(e.target.value)} style={{ maxWidth: 180 }} />
            <select className="input" value={cat} onChange={(e) => setCat(e.target.value)} style={{ maxWidth: 220 }}>
              <option value="">Todas las categorías</option>
              {db.settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}
            </select>
            <span className="small">Total: <b>{money(total)}</b></span>
          </div>
          {list.length === 0 ? <Empty>No hay gastos en este mes.</Empty> : (
            <div className="table-wrap">
              <table className="t">
                <thead><tr><th>Fecha</th><th>Categoría</th><th>Descripción</th><th>Método</th><th className="r">Monto</th><th /></tr></thead>
                <tbody>
                  {list.map((e) => (
                    <tr key={e.id}>
                      <td className="small nowrap">{fmtDate(e.date)}</td>
                      <td><span className="badge pink">{e.category}</span></td>
                      <td>{e.description}{e.cashSessionId && <span className="small muted"> · de caja</span>}</td>
                      <td className="small">{PAY_LABEL[e.method]}</td>
                      <td className="r b nowrap">{money(e.amount)}</td>
                      <td className="r">
                        <button className="btn sm danger" onClick={() => confirm('¿Eliminar gasto?') && update((d) => void (d.expenses = d.expenses.filter((x) => x.id !== e.id)))}>×</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
        <div className="card">
          <h3>Por categoría</h3>
          {byCat.length === 0 ? <Empty>—</Empty> : byCat.map(([c, v]) => (
            <div key={c} className="bar-row">
              <span>{c}</span><b>{money(v)}</b>
              <div className="bar"><div style={{ width: `${(v / max) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>
      {adding && <ExpenseModal onClose={() => setAdding(false)} />}
    </>
  );
}

function ExpenseModal({ onClose }: { onClose: () => void }) {
  const db = useDB();
  const hasCash = Boolean(openSession(db));
  const [f, setF] = useState({ date: dayKey(), category: db.settings.expenseCategories[0] || 'Otros', description: '', amount: '', method: 'efectivo' as PayMethod });
  const [fromCash, setFromCash] = useState(hasCash);
  const save = () => {
    if (num(f.amount) <= 0) return alert('Indica el monto');
    addExpense(
      {
        date: f.date === dayKey() ? new Date().toISOString() : fromDayInput(f.date),
        category: f.category, description: f.description, amount: num(f.amount), method: f.method,
      },
      fromCash && f.date === dayKey(),
    );
    onClose();
  };
  return (
    <Modal title="Nuevo gasto" onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancelar</button><button className="btn primary" onClick={save}>Guardar</button></>}>
      <div className="grid g2">
        <Field label="Fecha"><input className="input" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} /></Field>
        <Field label="Categoría">
          <select className="input" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {db.settings.expenseCategories.map((c) => <option key={c}>{c}</option>)}
          </select>
        </Field>
        <Field label="Monto"><input className="input" type="number" inputMode="decimal" value={f.amount} onChange={(e) => setF({ ...f, amount: e.target.value })} autoFocus /></Field>
        <Field label="Método">
          <select className="input" value={f.method} onChange={(e) => setF({ ...f, method: e.target.value as PayMethod })}>
            {PAY_METHODS.map((m) => <option key={m} value={m}>{PAY_LABEL[m]}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Descripción"><input className="input" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      {hasCash && f.method === 'efectivo' && f.date === dayKey() && (
        <label className="check"><input type="checkbox" checked={fromCash} onChange={(e) => setFromCash(e.target.checked)} /> Pagado con efectivo de la caja (se descuenta del cuadre)</label>
      )}
    </Modal>
  );
}
