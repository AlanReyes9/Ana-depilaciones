import { StrictMode, useEffect, useState, type FormEvent } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import { cloudEnabled, startCloudSync, stopCloudSync, supabase } from './lib/cloud';
import './styles.css';

function Login() {
  const [mode, setMode] = useState<'login' | 'forgot' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === 'login') {
      const { error } = await supabase!.auth.signInWithPassword({ email, password });
      if (error) setMsg({ ok: false, text: 'Correo o contraseña incorrectos' });
    } else if (mode === 'signup') {
      if (password.length < 8) {
        setBusy(false);
        return setMsg({ ok: false, text: 'La contraseña debe tener al menos 8 caracteres' });
      }
      const { data, error } = await supabase!.auth.signUp({ email, password, options: { emailRedirectTo: location.origin } });
      if (error) setMsg({ ok: false, text: error.message });
      else if (!data.session) setMsg({ ok: true, text: 'Cuenta creada. Confirma tu correo con el enlace que te enviamos y luego inicia sesión.' });
    } else {
      const { error } = await supabase!.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
      setMsg(error
        ? { ok: false, text: 'No se pudo enviar el correo. Intenta más tarde.' }
        : { ok: true, text: 'Te enviamos un enlace para crear una nueva contraseña. Revisa tu correo.' });
    }
    setBusy(false);
  };
  return (
    <div className="login">
      <form className="card grid" onSubmit={submit}>
        <img src="/brand-art.jpg" alt="Ana Depilaciones" style={{ margin: '0 auto' }} />
        <input className="input" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} required />
        {mode !== 'forgot' && (
          <input className="input" type="password" placeholder="Contraseña" value={password} onChange={(e) => setPassword(e.target.value)} required />
        )}
        {msg && <div className={`badge ${msg.ok ? 'ok' : 'bad'}`} style={{ whiteSpace: 'normal' }}>{msg.text}</div>}
        <button className="btn primary lg" disabled={busy}>
          {busy ? 'Un momento…' : { login: 'Entrar', forgot: 'Enviar enlace', signup: 'Crear cuenta' }[mode]}
        </button>
        <div className="btns" style={{ justifyContent: 'center' }}>
          {(['login', 'forgot', 'signup'] as const).filter((m) => m !== mode).map((m) => (
            <a key={m} href="#" className="small" onClick={(e) => { e.preventDefault(); setMsg(null); setMode(m); }}>
              {{ login: 'Iniciar sesión', forgot: '¿Olvidaste tu contraseña?', signup: 'Crear cuenta' }[m]}
            </a>
          ))}
        </div>
      </form>
    </div>
  );
}

function NewPassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (password.length < 8) return setError('Mínimo 8 caracteres');
    const { error } = await supabase!.auth.updateUser({ password });
    if (error) setError(error.message);
    else onDone();
  };
  return (
    <div className="login">
      <form className="card grid" onSubmit={submit}>
        <h3 style={{ margin: 0 }}>Crea tu nueva contraseña</h3>
        <input className="input" type="password" placeholder="Nueva contraseña" value={password} onChange={(e) => setPassword(e.target.value)} autoFocus />
        {error && <div className="badge bad">{error}</div>}
        <button className="btn primary lg">Guardar</button>
      </form>
    </div>
  );
}

type GateState = 'loading' | 'out' | 'in' | 'recovery' | 'denied' | 'error';

/** When Supabase is configured, require a login and load the shared data before showing the ERP. */
function Gate() {
  const [state, setState] = useState<GateState>(cloudEnabled ? 'loading' : 'in');
  useEffect(() => {
    if (!supabase) return;
    const handle = async (signedIn: boolean) => {
      stopCloudSync();
      if (!signedIn) return setState('out');
      try {
        await startCloudSync();
        setState('in');
      } catch (e) {
        console.error(e);
        setState((e as Error).message === 'not-authorized' ? 'denied' : 'error');
      }
    };
    supabase.auth.getSession().then(({ data }) => handle(Boolean(data.session)));
    const { data } = supabase.auth.onAuthStateChange((ev, session) => {
      if (ev === 'PASSWORD_RECOVERY') setState('recovery');
      else if (ev === 'SIGNED_IN' || ev === 'SIGNED_OUT') setTimeout(() => handle(Boolean(session)), 0);
    });
    return () => data.subscription.unsubscribe();
  }, []);
  const box = (text: string) => (
    <div className="login">
      <div className="card grid">
        <div>{text}</div>
        {state !== 'loading' && <button className="btn" onClick={() => supabase?.auth.signOut()}>Cerrar sesión</button>}
      </div>
    </div>
  );
  if (state === 'loading') return box('Cargando…');
  if (state === 'out') return <Login />;
  if (state === 'recovery') return <NewPassword onDone={() => location.replace('/')} />;
  if (state === 'denied') return box('Esta cuenta no está autorizada para usar el sistema. Pide acceso a la administradora.');
  if (state === 'error') return box('No se pudo conectar con la nube. Revisa tu conexión y recarga la página.');
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
