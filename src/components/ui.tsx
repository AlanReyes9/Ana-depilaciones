import { useEffect, type ReactNode } from 'react';

export function Modal(props: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && props.onClose();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [props]);
  return (
    <div className="modal-bg" onMouseDown={(e) => e.target === e.currentTarget && props.onClose()}>
      <div className={`modal ${props.wide ? 'wide' : ''}`}>
        <div className="modal-head">
          <h2>{props.title}</h2>
          <button className="x" onClick={props.onClose} aria-label="Cerrar">×</button>
        </div>
        <div className="modal-body">{props.children}</div>
        {props.footer && <div className="modal-foot">{props.footer}</div>}
      </div>
    </div>
  );
}

export function Field(props: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={`field ${props.className || ''}`}>
      <label>{props.label}</label>
      {props.children}
    </div>
  );
}

export function PageHead(props: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <div className="page-head">
      <div>
        <h1>{props.title}</h1>
        {props.subtitle && <p>{props.subtitle}</p>}
      </div>
      {props.children && <div className="btns">{props.children}</div>}
    </div>
  );
}

export function Stat(props: { label: string; value: string; hint?: string; accent?: boolean }) {
  return (
    <div className={`card stat ${props.accent ? 'accent' : ''}`}>
      <div className="label">{props.label}</div>
      <div className="value">{props.value}</div>
      {props.hint && <div className="hint">{props.hint}</div>}
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}

export function StatusBadge({ status }: { status: string }) {
  const cls = status === 'pagada' || status === 'cerrada' ? 'ok' : status === 'anulada' ? 'bad' : 'warn';
  return <span className={`badge ${cls}`}>{status}</span>;
}

/** Runs an action and shows its error message, if any, as an alert. */
export function tryRun<T>(fn: () => T): T | undefined {
  try {
    return fn();
  } catch (e) {
    alert((e as Error).message);
    return undefined;
  }
}
