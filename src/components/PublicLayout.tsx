import { ArrowRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';
import { Brand } from './Brand';
import '../public-design.css';

export function PublicLayout({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <div className="access-page">
    <a href="#access-content" className="access-skip">Lewati ke konten utama</a>
    <header className="access-header"><Link to="/" className="access-brand-link" aria-label="Beranda TOTKA"><Brand /></Link><nav aria-label="Navigasi publik"><p>Try out yang tertata. Persiapan yang lebih baik.</p><Link to="/#akses" className="access-button">Pilih akses<ArrowRight aria-hidden="true" /></Link></nav></header>
    <main id="access-content" tabIndex={-1} className={className}>{children}</main>
    <footer className="access-footer"><span>© {new Date().getFullYear()} TOTKA · Try Out Tes Kemampuan Akademik</span><span>Jenjang Sekolah Dasar</span></footer>
  </div>;
}
