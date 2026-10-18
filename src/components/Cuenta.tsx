import { useEffect, useState } from 'react';
import { allowEmail, currentEmail, listAllowed, revokeEmail, supabase } from '../lib/cloud';
import { Field } from './ui';

export default function Cuenta() {
  const [email, setEmail] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [allowed, setAllowed] = useState<string[]>([]);
  const [invite, setInvite] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const refresh = async () => {
    setEmail(await currentEmail());
    try {
      setAllowed(await listAllowed());
    } catch (e) {
      console.error(e);
    }
  };
  useEffect(() => void refresh(), []);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      await refresh();
    } catch (e) {
      setMsg({ ok: false, text: (e as Error).message });
    }
  };

  const changeEmail = () =>
    run(async () => {
      const target = newEmail.trim().toLowerCase();
      if (!target.includes('@')) throw new Error('Escribe un correo válido');
      const { error } = await supabase!.auth.updateUser({ email: target }, { emailRedirectTo: location.origin });
      if (error) throw error;
      setNewEmail('');
    }, 'Te enviamos un enlace de confirmación al correo nuevo (y otro al actual). El cambio se aplica al confirmarlo.');

  const changePassword = () =>
    run(async () => {
      if (password.length < 8) throw new Error('La contraseña debe tener al menos 8 caracteres');
      if (password !== password2) throw new Error('Las contraseñas no coinciden');
      const { error } = await supabase!.auth.updateUser({ password });
      if (error) throw error;
      setPassword('');
      setPassword2('');
    }, 'Contraseña actualizada.');

  return (
    <div className="card grid">
      <h3>Mi cuenta y accesos</h3>
      <div className="small">Sesión iniciada como <b>{email}</b></div>
      {msg && <div className={`badge ${msg.ok ? 'ok' : 'bad'}`} style={{ whiteSpace: 'normal' }}>{msg.text}</div>}
      <div className="grid g2">
        <Field label="Cambiar correo">
          <input className="input" type="email" placeholder="nuevo@correo.com" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} />
        </Field>
        <Field label=" "><button className="btn" onClick={changeEmail} disabled={!newEmail}>Cambiar correo</button></Field>
        <Field label="Nueva contraseña">
          <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="new-password" />
        </Field>
        <Field label="Repetir contraseña">
          <input className="input" type="password" value={password2} onChange={(e) => setPassword2(e.target.value)} autoComplete="new-password" />
        </Field>
      </div>
      <div><button className="btn" onClick={changePassword} disabled={!password}>Cambiar contraseña</button></div>

      <hr style={{ border: 0, borderTop: '1px solid var(--line)', width: '100%' }} />
      <div className="small b">Correos autorizados</div>
      <p className="small muted" style={{ margin: 0 }}>
        Solo estas personas pueden ver y usar los datos. Para dar acceso a alguien, agrega su correo aquí y pídele que entre a la
        página y use “Crear cuenta” con ese mismo correo.
      </p>
      <table className="t"><tbody>
        {allowed.map((a) => (
          <tr key={a}>
            <td>{a}</td>
            <td className="r">
              {a.toLowerCase() !== email.toLowerCase() && (
                <button className="btn sm danger" onClick={() => confirm(`¿Quitar acceso a ${a}?`) && run(() => revokeEmail(a), 'Acceso eliminado.')}>Quitar</button>
              )}
            </td>
          </tr>
        ))}
      </tbody></table>
      <div style={{ display: 'flex', gap: 8 }}>
        <input className="input" type="email" placeholder="correo@ejemplo.com" value={invite} onChange={(e) => setInvite(e.target.value)} />
        <button className="btn primary" disabled={!invite.includes('@')} onClick={() => run(async () => { await allowEmail(invite); setInvite(''); }, 'Correo autorizado.')}>
          Autorizar
        </button>
      </div>
    </div>
  );
}
