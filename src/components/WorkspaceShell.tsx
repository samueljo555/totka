import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Building2, ChevronRight, Grid2X2, LogOut, Menu, X } from 'lucide-react';
import { Brand } from './Brand';

export interface WorkspaceItem { id: string; name: string; icon: ReactNode }
interface Props {
  user?: { fullName?: string; role?: string; className?: string; schoolNpsn?: string; school?: { name?: string; npsn?: string } | null } | null;
  roleLabel: string;
  items: WorkspaceItem[];
  activeId: string;
  onNavigate: (id: string) => void;
  onLogout: () => void;
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
}

export function WorkspaceShell({ user, roleLabel, items, activeId, onNavigate, onLogout, title, description, actions, children }: Props) {
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null), heading = useRef<HTMLHeadingElement>(null);
  const id = useId(), menuId = `workspace-menu-${id}`, mainId = `workspace-content-${id}`;
  const pageTitle = title || items.find(item => item.id === activeId)?.name || roleLabel;
  const name = user?.fullName?.trim() || roleLabel;
  const initials = name.split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
  const central = user?.role === 'admin' || user?.role === 'super_admin';
  const teacher = user?.role === 'guru';
  const workspaceName = central ? 'Pusat pengelolaan' : teacher ? 'Penyusunan soal' : user?.school?.name || 'Sekolah belum tersedia';
  const npsn = user?.school?.npsn || user?.schoolNpsn;
  const detail = central ? 'Seluruh sekolah' : teacher ? 'Bank soal & bacaan' : user?.role === 'siswa' ? (user.className ? `Kelas ${user.className}` : roleLabel) : npsn ? `NPSN ${npsn}` : roleLabel;

  useEffect(() => {
    const media = window.matchMedia('(min-width: 851px)');
    const resized = () => { if (media.matches) setOpen(false); };
    media.addEventListener('change', resized);
    return () => media.removeEventListener('change', resized);
  }, []);
  useEffect(() => {
    const element = dialog.current;
    if (!element) return;
    if (!open) { if (element.open) element.close(); return; }
    element.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { element.close(); document.body.style.overflow = overflow; };
  }, [open]);

  const navigate = (next: string) => {
    setOpen(false);
    onNavigate(next);
    requestAnimationFrame(() => heading.current?.focus({ preventScroll: true }));
  };
  const navigation = <>
    <div className="workspace-brand-row"><Brand /></div>
    <div className="workspace-identity"><span className="workspace-space-icon">{central || teacher ? <Grid2X2 aria-hidden="true" /> : <Building2 aria-hidden="true" />}</span><div><strong>{workspaceName}</strong><small>{detail}</small></div></div>
    <p className="workspace-nav-label">Menu {roleLabel}</p>
    <nav className="workspace-navigation" aria-label="Menu utama">{items.map(item => <button type="button" key={item.id} aria-current={activeId === item.id ? 'page' : undefined} onClick={() => navigate(item.id)}>{item.icon}<span>{item.name}</span></button>)}</nav>
    <div className="workspace-user"><span className="workspace-avatar">{initials}</span><div><strong>{name}</strong><small>{roleLabel}</small></div><button type="button" className="workspace-icon-button" aria-label="Keluar" title="Keluar" onClick={onLogout}><LogOut aria-hidden="true" /></button></div>
  </>;

  return <div className="dashboard-app workspace-shell">
    <a className="workspace-skip" href={`#${mainId}`}>Lewati ke konten utama</a>
    <aside className="workspace-desktop-nav" aria-label={`Workspace ${roleLabel}`}>{navigation}</aside>
    <div className="workspace-frame">
      <header className="workspace-topbar">
        <div className="workspace-breadcrumb"><button type="button" className="workspace-icon-button workspace-mobile-toggle" aria-label="Buka menu" aria-controls={menuId} aria-expanded={open} onClick={() => setOpen(true)}><Menu aria-hidden="true" /></button><span>Workspace</span><ChevronRight aria-hidden="true" /><strong>{pageTitle}</strong></div>
        <div className="workspace-topbar-user"><span className="workspace-product-badge">Try Out TKA</span><div className="workspace-topbar-profile"><strong>{name}</strong><small>{roleLabel}</small></div><span className="workspace-avatar">{initials}</span></div>
      </header>
      <main className="workspace-main" id={mainId} tabIndex={-1}>
        <header className="workspace-page-heading"><div><p className="workspace-eyebrow">{roleLabel}</p><h1 ref={heading} tabIndex={-1}>{pageTitle}</h1>{description && <p className="workspace-description">{description}</p>}</div>{actions && <div className="workspace-page-actions">{actions}</div>}</header>
        {children}
        <footer className="workspace-footer"><span>© {new Date().getFullYear()} TOTKA · Try Out Tes Kemampuan Akademik</span><span>{roleLabel}</span></footer>
      </main>
    </div>
    <dialog ref={dialog} id={menuId} className="workspace-nav-dialog" aria-label={`Menu ${roleLabel}`} onCancel={event => { event.preventDefault(); setOpen(false); }} onKeyDown={event => {
      if (event.key !== 'Tab') return;
      const buttons = event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not(:disabled)');
      const first = buttons[0], last = buttons[buttons.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }} onClick={event => {
      if (event.target !== event.currentTarget) return;
      const rect = event.currentTarget.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) setOpen(false);
    }}>
      <button type="button" className="workspace-icon-button workspace-close-menu" aria-label="Tutup menu" onClick={() => setOpen(false)}><X aria-hidden="true" /></button>
      {navigation}
    </dialog>
  </div>;
}
