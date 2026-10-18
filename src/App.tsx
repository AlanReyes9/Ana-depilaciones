import { useEffect, useState } from 'react';
import { NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useDB, openSession } from './lib/store';
import { cloudEnabled, onCloudStatus, supabase } from './lib/cloud';
import Dashboard from './pages/Dashboard';
import POS from './pages/POS';
import Caja from './pages/Caja';
import Facturas from './pages/Facturas';
import Cobros from './pages/Cobros';
import Inventario from './pages/Inventario';
import Clientes from './pages/Clientes';
import Compras from './pages/Compras';
import Gastos from './pages/Gastos';
import Configuracion from './pages/Configuracion';

const NAV = [
  { to: '/', label: 'Dashboard', ico: '📊' },
  { to: '/pos', label: 'Punto de venta', ico: '🛍️' },
  { to: '/caja', label: 'Caja y cierre', ico: '💵' },
  { to: '/facturas', label: 'Facturas', ico: '🧾' },
  { to: '/cobros', label: 'Cobros', ico: '💳' },
  { to: '/inventario', label: 'Inventario', ico: '📦' },
  { to: '/clientes', label: 'Clientes', ico: '💁‍♀️' },
  { to: '/compras', label: 'Compras', ico: '🚚' },
  { to: '/gastos', label: 'Gastos', ico: '📉' },
  { to: '/configuracion', label: 'Configuración', ico: '⚙️' },
];

function CloudBadge() {
  const [s, setS] = useState('idle');
  useEffect(() => onCloudStatus(setS), []);
  if (!cloudEnabled) return <div>💾 Datos guardados en este dispositivo</div>;
  const label = { idle: 'Conectado', saving: 'Guardando…', saved: 'Sincronizado', error: 'Error al sincronizar' }[s];
  return (
    <div>
      ☁️ {label}{' '}
      <button className="btn sm" style={{ marginTop: 6 }} onClick={() => supabase?.auth.signOut()}>Cerrar sesión</button>
    </div>
  );
}

export default function App() {
  const db = useDB();
  const [open, setOpen] = useState(false);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  const cash = openSession(db);

  return (
    <div className="app">
      <header className="topbar">
        <button className="btn sm" onClick={() => setOpen(true)} aria-label="Menú">☰</button>
        <img src="/logo.png" alt="" />
        <span className="name script">Ana</span>
        <span style={{ marginLeft: 'auto' }} className={`badge ${cash ? 'ok' : 'warn'}`}>
          {cash ? 'Caja abierta' : 'Caja cerrada'}
        </span>
      </header>
      {open && <div className="backdrop" onClick={() => setOpen(false)} />}
      <aside className={`sidebar ${open ? 'open' : ''}`}>
        <div className="brand">
          <img src="/logo.png" alt="Ana" />
          <div>
            <div className="name script">Ana</div>
            <div className="sub">COSMETICS &amp;<br />DEPILACIONES</div>
          </div>
        </div>
        <nav className="nav">
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === '/'}>
              <span className="ico">{n.ico}</span>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div style={{ marginBottom: 6 }}>
            <span className={`badge ${cash ? 'ok' : 'warn'}`}>{cash ? 'Caja abierta' : 'Caja cerrada'}</span>
          </div>
          <CloudBadge />
        </div>
      </aside>
      <main className="main">
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/pos" element={<POS />} />
          <Route path="/caja" element={<Caja />} />
          <Route path="/facturas" element={<Facturas />} />
          <Route path="/cobros" element={<Cobros />} />
          <Route path="/inventario" element={<Inventario />} />
          <Route path="/clientes" element={<Clientes />} />
          <Route path="/compras" element={<Compras />} />
          <Route path="/gastos" element={<Gastos />} />
          <Route path="/configuracion" element={<Configuracion />} />
          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </main>
    </div>
  );
}
