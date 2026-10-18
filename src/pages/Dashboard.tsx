import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { openSession, sessionSummary, useDB } from '../lib/store';
import { dayKey, money, monthKey, round2, sum } from '../lib/utils';
import { PAY_LABEL, PAY_METHODS } from '../lib/types';
import { PageHead, Stat } from '../components/ui';
import { fmtTime, isActive } from '../lib/appointments';

type Period = 'hoy' | 'semana' | 'mes' | 'anio';

function inPeriod(date: string, p: Period) {
  const d = new Date(date);
  const now = new Date();
  if (p === 'hoy') return dayKey(d) === dayKey(now);
  if (p === 'mes') return monthKey(d) === monthKey(now);
  if (p === 'anio') return d.getFullYear() === now.getFullYear();
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - 6);
  return d >= start;
}

export default function Dashboard() {
  const db = useDB();
  const [p, setP] = useState<Period>('mes');
  const session = openSession(db);

  const data = useMemo(() => {
    const sales = db.sales.filter((s) => s.status !== 'anulada');
    const ps = sales.filter((s) => inPeriod(s.date, p));
    const payments = sales.flatMap((s) => s.payments).filter((x) => inPeriod(x.date, p));
    const byMethod = Object.fromEntries(PAY_METHODS.map((m) => [m, sum(payments.filter((x) => x.method === m), (x) => x.amount)]));
    const expenses = db.expenses.filter((e) => inPeriod(e.date, p));
    const purchases = db.purchases.filter((x) => x.status !== 'anulada' && inPeriod(x.date, p));
    const items = ps.flatMap((s) => s.items);
    const salesTotal = sum(ps, (s) => s.total);
    const taxes = sum(ps, (s) => s.tax);
    const cogs = sum(items.filter((i) => i.type === 'product'), (i) => i.qty * i.cost);
    const services = sum(items.filter((i) => i.type === 'service'), (i) => i.qty * i.price);
    const products = sum(items.filter((i) => i.type === 'product'), (i) => i.qty * i.price);
    const expTotal = sum(expenses, (e) => e.amount);
    const gross = round2(salesTotal - taxes - cogs);

    const top = new Map<string, { name: string; type: string; qty: number; total: number }>();
    for (const i of items) {
      const t = top.get(i.refId) || { name: i.name, type: i.type, qty: 0, total: 0 };
      t.qty += i.qty;
      t.total = round2(t.total + i.qty * i.price);
      top.set(i.refId, t);
    }

    const days: { key: string; label: string; sales: number; exp: number }[] = [];
    for (let k = 13; k >= 0; k--) {
      const d = new Date();
      d.setDate(d.getDate() - k);
      const key = dayKey(d);
      days.push({
        key,
        label: d.toLocaleDateString('es-DO', { day: '2-digit', month: 'short' }),
        sales: sum(sales.filter((s) => dayKey(s.date) === key), (s) => s.total),
        exp: sum(db.expenses.filter((e) => dayKey(e.date) === key), (e) => e.amount),
      });
    }

    const active = db.products.filter((x) => x.active);
    return {
      salesTotal, count: ps.length, collected: sum(payments, (x) => x.amount), byMethod,
      expTotal, purchTotal: sum(purchases, (x) => x.total), cogs, gross, net: round2(gross - expTotal), services, products,
      top: [...top.values()].sort((a, b) => b.total - a.total).slice(0, 6),
      days,
      invCost: sum(active, (x) => Math.max(0, x.stock) * x.cost),
      invPrice: sum(active, (x) => Math.max(0, x.stock) * x.price),
      units: sum(active, (x) => Math.max(0, x.stock)),
      low: active.filter((x) => x.stock <= x.minStock).sort((a, b) => a.stock - b.stock),
      receivable: sum(sales, (s) => s.balance),
      receivableCount: sales.filter((s) => s.balance > 0).length,
      payable: sum(db.purchases.filter((x) => x.status !== 'anulada'), (x) => round2(x.total - x.paid)),
    };
  }, [db, p]);

  const cash = session ? sessionSummary(db, session).expected.efectivo : null;
  const maxDay = Math.max(1, ...data.days.map((d) => Math.max(d.sales, d.exp)));
  const maxTop = Math.max(1, ...data.top.map((t) => t.total));

  return (
    <>
      <PageHead title={`Hola, ${db.settings.businessName.split(' ')[0]} 💖`} subtitle="Resumen del negocio">
        <div className="tabs" style={{ margin: 0 }}>
          {(['hoy', 'semana', 'mes', 'anio'] as Period[]).map((x) => (
            <button key={x} className={`tab ${p === x ? 'active' : ''}`} onClick={() => setP(x)}>
              {{ hoy: 'Hoy', semana: '7 días', mes: 'Este mes', anio: 'Este año' }[x]}
            </button>
          ))}
        </div>
      </PageHead>

      <div className="grid g4">
        <Stat accent label="Ventas facturadas" value={money(data.salesTotal)} hint={`${data.count} facturas`} />
        <Stat label="Ingresos cobrados" value={money(data.collected)} hint="Pagos recibidos en el período" />
        <Stat label="Gastos" value={money(data.expTotal)} hint={`Compras de mercancía: ${money(data.purchTotal)}`} />
        <Stat label="Utilidad estimada" value={money(data.net)} hint={`Bruta ${money(data.gross)} (sin impuestos ni costo)`} />
      </div>

      <div className="grid g4" style={{ marginTop: 14 }}>
        <Stat label="Dinero en productos (costo)" value={money(data.invCost)} hint={`${data.units} unidades en inventario`} />
        <Stat label="Valor de venta del inventario" value={money(data.invPrice)} hint={`Ganancia potencial ${money(data.invPrice - data.invCost)}`} />
        <Stat label="Cuentas por cobrar" value={money(data.receivable)} hint={`${data.receivableCount} facturas pendientes`} />
        <Stat label="Efectivo en caja" value={cash === null ? 'Cerrada' : money(cash)} hint={`Por pagar a proveedores: ${money(data.payable)}`} />
      </div>

      <TodayAppointments />

      <div className="grid g2" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Ventas vs gastos · últimos 14 días</h3>
          <div className="legend"><span><i style={{ background: 'var(--pink)' }} />Ventas</span><span><i style={{ background: '#f8b8d6' }} />Gastos</span></div>
          <svg className="chart" viewBox="0 0 700 220" role="img" aria-label="Gráfico de ventas y gastos">
            {[0.25, 0.5, 0.75, 1].map((g) => (
              <line key={g} x1="0" x2="700" y1={190 - g * 170} y2={190 - g * 170} stroke="#f6e1ec" />
            ))}
            {data.days.map((d, i) => {
              const w = 700 / 14;
              const x = i * w;
              const hs = (d.sales / maxDay) * 170;
              const he = (d.exp / maxDay) * 170;
              return (
                <g key={d.key}>
                  <rect x={x + w * 0.15} y={190 - hs} width={w * 0.34} height={hs} rx="3" fill="#d81b7a">
                    <title>{`${d.label}: ventas ${money(d.sales)}`}</title>
                  </rect>
                  <rect x={x + w * 0.51} y={190 - he} width={w * 0.34} height={he} rx="3" fill="#f8b8d6">
                    <title>{`${d.label}: gastos ${money(d.exp)}`}</title>
                  </rect>
                  {i % 2 === 0 && <text x={x + w / 2} y="210" fontSize="11" textAnchor="middle" fill="#8a6a7c">{d.label}</text>}
                </g>
              );
            })}
          </svg>
        </div>
        <div className="card">
          <h3>Más vendidos</h3>
          {data.top.length === 0 && <div className="empty">Sin ventas en el período.</div>}
          {data.top.map((t) => (
            <div key={t.name} className="bar-row">
              <span>{t.type === 'service' ? '✨' : '🧴'} {t.name} <span className="muted small">×{t.qty}</span></span>
              <b>{money(t.total)}</b>
              <div className="bar"><div style={{ width: `${(t.total / maxTop) * 100}%` }} /></div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid g3" style={{ marginTop: 14 }}>
        <div className="card">
          <h3>Ingresos por método</h3>
          {PAY_METHODS.map((m) => (
            <div key={m} className="bar-row">
              <span>{PAY_LABEL[m]}</span><b>{money(data.byMethod[m])}</b>
              <div className="bar"><div style={{ width: `${data.collected ? (data.byMethod[m] / data.collected) * 100 : 0}%` }} /></div>
            </div>
          ))}
        </div>
        <div className="card">
          <h3>Servicios vs productos</h3>
          {[['✨ Servicios', data.services], ['🧴 Productos', data.products]].map(([l, v]) => (
            <div key={l as string} className="bar-row">
              <span>{l}</span><b>{money(v as number)}</b>
              <div className="bar"><div style={{ width: `${(v as number) / Math.max(1, data.services + data.products) * 100}%` }} /></div>
            </div>
          ))}
          <div className="small muted">Costo de productos vendidos: {money(data.cogs)}</div>
        </div>
        <div className="card">
          <h3>⚠️ Stock bajo</h3>
          {data.low.length === 0 ? <div className="empty">Todo en orden.</div> : (
            <table className="t"><tbody>
              {data.low.slice(0, 8).map((x) => (
                <tr key={x.id}><td>{x.name}</td><td className="r"><span className={`badge ${x.stock <= 0 ? 'bad' : 'warn'}`}>{x.stock}</span></td></tr>
              ))}
            </tbody></table>
          )}
          <Link to="/compras" className="btn sm" style={{ marginTop: 8 }}>Registrar compra</Link>
        </div>
      </div>
    </>
  );
}

function TodayAppointments() {
  const db = useDB();
  const today = dayKey();
  const list = db.appointments.filter((a) => a.date === today && isActive(a)).sort((a, b) => a.time.localeCompare(b.time));
  return (
    <div className="card" style={{ marginTop: 14 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <h3 style={{ margin: 0 }}>📅 Citas de hoy ({list.length})</h3>
        <Link to="/agenda" className="btn sm">Ver agenda</Link>
      </div>
      {list.length === 0 ? <div className="small muted">No hay citas para hoy.</div> : (
        <div className="btns">
          {list.map((a) => (
            <span key={a.id} className={`badge ${a.status === 'completada' ? 'ok' : a.status === 'confirmada' ? 'pink' : 'warn'}`} style={{ fontSize: 12 }}>
              {fmtTime(a.time)} · {a.clientName} · {a.services.map((x) => x.name).join(', ')}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
