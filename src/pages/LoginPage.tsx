import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft, ArrowRight, Eye, EyeOff, Info, LoaderCircle } from 'lucide-react';
import { setToken } from '../lib/api';
import { accessRoles, accountDestination } from '../lib/access-roles';
import { PublicLayout } from '../components/PublicLayout';

const LoginPage = ({ onLogin }: { onLogin: (user: any) => void }) => {
  const { roleId } = useParams();
  const navigate = useNavigate();
  const [username, setUsername] = useState(''), [password, setPassword] = useState('');
  const [visible, setVisible] = useState(false), [pending, setPending] = useState(false);
  const [error, setError] = useState(''), [invalidCredentials, setInvalidCredentials] = useState(false);
  const request = useRef<AbortController | null>(null), errorRef = useRef<HTMLDivElement>(null);
  const role = accessRoles.find(item => item.id === (roleId === 'admin' ? 'super_admin' : roleId)) || accessRoles[0];
  const Icon = role.icon;

  useEffect(() => {
    setPassword(''); setVisible(false); setError(''); setInvalidCredentials(false); setPending(false);
    window.scrollTo(0, 0);
    return () => { request.current?.abort(); request.current = null; };
  }, [roleId]);
  useEffect(() => { if (error) errorRef.current?.focus(); }, [error]);

  const handleLoginSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (request.current) return;
    const controller = new AbortController(); request.current = controller;
    const timeout = window.setTimeout(() => controller.abort('timeout'), 15000);
    setPending(true); setError(''); setInvalidCredentials(false);
    try {
      const response = await fetch('/api/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ username, password }), signal: controller.signal });
      const data = await response.json().catch(() => null);
      if (request.current !== controller) return;
      if (!response.ok) {
        setInvalidCredentials(response.status === 400 || response.status === 401);
        const messages: Record<number, string> = {
          400: 'Lengkapi username dan password dengan benar.',
          401: 'Username/NISN atau password tidak sesuai. Periksa kembali akun Anda.',
          429: 'Terlalu banyak percobaan masuk. Tunggu beberapa saat, lalu coba lagi.',
        };
        setError(messages[response.status] || 'Login belum berhasil diproses. Silakan coba lagi.');
        return;
      }
      const destination = typeof data?.user?.role === 'string' ? accountDestination(data.user.role) : null;
      if (!destination || typeof data?.user?.id !== 'string' || typeof data?.token !== 'string' || !data.token) {
        setError('Respons login belum dapat diproses. Silakan coba lagi.'); return;
      }
      setToken(data.token);
      onLogin(data.user);
      navigate(destination, { replace: true });
    } catch {
      if (request.current === controller) setError(controller.signal.reason === 'timeout' ? 'Permintaan masuk terlalu lama. Silakan coba lagi.' : 'Tidak dapat terhubung. Periksa koneksi internet Anda, lalu coba lagi.');
    } finally {
      window.clearTimeout(timeout);
      if (request.current === controller) { request.current = null; setPending(false); }
    }
  };

  return <PublicLayout className="access-login">
    <section className="access-login-story" aria-labelledby="login-welcome"><span className="access-role-icon"><Icon aria-hidden="true" /></span><h2 id="login-welcome">Selamat datang<br />di workspace Anda.</h2><p>Persiapan yang baik dimulai dari langkah yang teratur. Masuk dan lanjutkan kegiatan try out Anda bersama TOTKA.</p><div className="access-notice"><Info aria-hidden="true" /><p>{role.id === 'siswa' ? 'Gunakan username/NISN dan password pada kartu login dari sekolah. Token paket dimasukkan setelah berhasil login.' : 'Gunakan akun yang telah diberikan pengelola sistem atau sekolah Anda.'}</p></div></section>
    <section className="access-login-panel" aria-labelledby="login-title"><span className="access-badge">{role.title}</span><h1 id="login-title">Masuk ke TOTKA</h1><p className="access-login-description">Silakan masukkan kredensial akun Anda.</p>
      <form onSubmit={handleLoginSubmit} aria-busy={pending}>
        <label htmlFor="access-role">Peran akses</label><select id="access-role" value={role.id} disabled={pending} onChange={event => navigate(`/login/${event.target.value}`, { replace: true })}>{accessRoles.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}</select>
        {error && <div id="login-error" className="access-error" role="alert" tabIndex={-1} ref={errorRef}><AlertCircle aria-hidden="true" /><span>{error}</span></div>}
        <label htmlFor="username">Username / NISN</label><input id="username" name="username" type="text" placeholder="Masukkan username atau NISN" value={username} onChange={event => setUsername(event.target.value)} autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required disabled={pending} aria-invalid={invalidCredentials || undefined} aria-describedby={error ? 'login-error' : undefined} />
        <label htmlFor="password">Password</label><div className="access-password"><input id="password" name="password" type={visible ? 'text' : 'password'} placeholder="Masukkan password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required disabled={pending} aria-invalid={invalidCredentials || undefined} aria-describedby={error ? 'login-error' : undefined} /><button type="button" aria-label={visible ? 'Sembunyikan password' : 'Tampilkan password'} aria-pressed={visible} disabled={pending} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div>
        <button className="access-button primary access-submit" type="submit" disabled={pending}>{pending ? <><LoaderCircle aria-hidden="true" className="access-spinner" />Memproses...</> : <>Masuk ke sistem<ArrowRight aria-hidden="true" /></>}</button>
        <Link className="access-back" to="/"><ArrowLeft aria-hidden="true" />Kembali ke beranda</Link>
      </form>
      <p className="access-login-help">{role.id === 'siswa' ? 'Belum memiliki kartu login? Hubungi operator sekolah Anda.' : 'Jika mengalami kendala akses, hubungi pengelola akun Anda.'}</p>
    </section>
  </PublicLayout>;
};

export default LoginPage;
