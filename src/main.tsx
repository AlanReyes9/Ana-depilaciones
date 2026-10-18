import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { cloudEnabled, startCloudSync, stopCloudSync, supabase } from './lib/cloud';
import './styles.css';

function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    const { error } = await supabase!.auth.signInWithPassword({ email, password });
    if (error) setError('Correo o contraseña incorrectos');
    setBusy(false);
  };
  return (
    <div className="login">
      <form className="card grid" onSubmit={submit}>
        <img src="/brand-art.jpg" alt="Ana Depilaciones" style={{ margin: '0 auto' }} />
        <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input className="input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
        {error && <div className="badge bad">{error}</div>}
        <button className="btn primary lg" disabled={busy}>{busy ? 'Entrando…' : 'Entrar'}</button>
      </form>
    </div>
  );
}

/** When Supabase is configured, require a login and load the shared data before showing the ERP. */
function Gate() {
  const [state, setState] = useState<'loading' | 'out' | 'in' | 'error'>(cloudEnabled ? 'loading' : 'in');
  useEffect(() => {
    if (!supabase) return;
    const handle = async (signedIn: boolean) => {
      if (!signedIn) {
        stopCloudSync();
        setState('out');
        return;
      }
      try {
        await startCloudSync();
        setState('in');
      } catch (e) {
        console.error(e);
        setState('error');
      }
    };
    supabase.auth.getSession().then(({ data }) => handle(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') handle(Boolean(session));
    });
    return () => data.subscription.unsubscribe();
  }, []);
  if (state === 'loading') return <div className="login"><div className="card">Cargando…</div></div>;
  if (state === 'out') return <Login />;
  if (state === 'error')
    return <div className="login"><div className="card">No se pudo conectar con la nube. Revisa tu conexión y recarga.</div></div>;
  return (
    <BrowserRouter>
      <App />
    </BrowserRouter>
  );
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Gate />
  </StrictMode>,
);
