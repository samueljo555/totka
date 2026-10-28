import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { ArrowRight, BookOpen, Check, ShieldCheck } from 'lucide-react';
import { PublicLayout } from '../components/PublicLayout';
import { accessRoles } from '../lib/access-roles';

const LandingPage = () => {
  const { hash } = useLocation();
  useEffect(() => {
    if (hash === '#akses') {
      const frame = requestAnimationFrame(() => document.getElementById('akses')?.scrollIntoView());
      return () => cancelAnimationFrame(frame);
    }
    window.scrollTo(0, 0);
  }, [hash]);

  return <PublicLayout className="access-landing">
    <section className="access-hero" aria-labelledby="landing-title">
      <div><span className="access-badge">Try Out TKA · Jenjang SD</span><h1 id="landing-title">Siap melangkah<br />lebih <span>percaya diri.</span></h1><p>Ruang try out untuk siswa. Workspace yang tertata untuk guru, operator sekolah, dan pengelola ujian.</p><Link to="/login/siswa" className="access-button primary">Mulai sebagai siswa<ArrowRight aria-hidden="true" /></Link><div className="access-hero-note"><ShieldCheck aria-hidden="true" />Gunakan akun dan token yang diberikan sekolah.</div></div>
      <div className="access-hero-visual" aria-hidden="true"><div className="access-visual-sheet"><div className="access-visual-heading"><strong>Try Out Bahasa Indonesia</strong><span>Soal 04</span></div><div className="access-visual-progress"><span /></div><p>Membaca membuka jendela pengetahuan.<br />Temukan makna, pahami cerita, dan pilih jawabanmu.</p><div className="access-visual-option selected"><b>A</b><span>Belajar dan bertumbuh bersama.</span><Check /></div><div className="access-visual-option"><b>B</b><span>Mencoba hal baru setiap hari.</span></div><div className="access-visual-option"><b>C</b><span>Menyimpan cerita untuk nanti.</span></div></div><div className="access-visual-badge"><span className="access-role-icon"><BookOpen /></span><div><strong>Satu ruang belajar.</strong><small>Untuk setiap langkah persiapan.</small></div></div></div>
    </section>
    <section id="akses" className="access-roles" aria-labelledby="access-title"><div className="access-section-heading"><div><p className="access-eyebrow">Akses workspace</p><h2 id="access-title">Masuk sesuai peran Anda.</h2></div><p>Empat peran. Satu tujuan.</p></div><div className="access-role-grid">{accessRoles.map(({ id, title, description, icon: Icon }) => <Link key={id} to={`/login/${id}`} className="access-role-card" aria-label={`Masuk sebagai ${title}`}><span className="access-role-icon"><Icon aria-hidden="true" /></span><h3>{title}</h3><p>{description}</p><span className="access-role-enter">Masuk workspace<ArrowRight aria-hidden="true" /></span></Link>)}</div></section>
  </PublicLayout>;
};

export default LandingPage;
