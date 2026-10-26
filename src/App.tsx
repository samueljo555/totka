import React, { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import './index.css';
import './table-design.css';
import { 
  clearToken, 
  setSessionExpiredHandler, 
  resetActivityTimer, 
  isTokenExpired, 
  isIdleTimeoutExceeded, 
  triggerSessionExpired 
} from './lib/api';
import LandingPage from './pages/LandingPage';
import LoginPage from './pages/LoginPage';
import AdminDashboard from './pages/AdminDashboard';
import GuruDashboard from './pages/GuruDashboard';
import SiswaDashboard from './pages/SiswaDashboard';
import OperatorDashboard from './pages/OperatorDashboard';

function App() {
  const navigate = useNavigate();
  const [authUser, setAuthUser] = useState<any | null>(() => {
    const saved = localStorage.getItem('tka_auth_user');
    return saved ? JSON.parse(saved) : null;
  }); // This holds the authenticated user data

  const handleLogin = (user: any) => {
    setAuthUser(user);
    localStorage.setItem('tka_auth_user', JSON.stringify(user));
  };

  const handleLogout = () => {
    setAuthUser(null);
    localStorage.removeItem('tka_auth_user');
    clearToken();
    navigate('/');
  };

  // Setup Global Session Expiration & Idle Timeout Handler
  useEffect(() => {
    setSessionExpiredHandler((msg) => {
      toast.error(msg || 'Sesi login telah berakhir. Silakan login kembali.', { duration: 5000 });
      handleLogout();
    });

    // Lacak aktivitas pengguna (mouse, keyboard, scroll, touch)
    const handleUserActivity = () => {
      resetActivityTimer();
    };

    const events = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'];
    events.forEach(evt => window.addEventListener(evt, handleUserActivity, { passive: true }));

    // Pengecekan berkala setiap 30 detik untuk batas waktu idle dan sesi
    const interval = setInterval(() => {
      if (authUser) {
        if (isTokenExpired()) {
          triggerSessionExpired('Batas sesi 8 jam telah berakhir. Silakan login kembali.');
        } else if (isIdleTimeoutExceeded()) {
          triggerSessionExpired('Anda tidak aktif selama 30 menit. Sesi otomatis ditutup untuk keamanan.');
        }
      }
    }, 30000);

    return () => {
      events.forEach(evt => window.removeEventListener(evt, handleUserActivity));
      clearInterval(interval);
    };
  }, [authUser]);

  // Protected Route Wrapper
  const ProtectedRoute = ({ children, allowedRoles }: { children: React.ReactNode, allowedRoles: string[] }) => {
    if (!authUser) {
      return <Navigate to="/" replace />;
    }
    
    // For admin, handle 'super_admin' and 'admin' interchangeably for now
    const userRole = authUser.role === 'super_admin' ? 'admin' : authUser.role;
    
    if (!allowedRoles.includes(userRole)) {
      return <Navigate to="/" replace />;
    }

    return <>{children}</>;
  };

  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login/:roleId" element={<LoginPage onLogin={handleLogin} />} />
      
      {/* Protected Routes */}
      <Route 
        path="/admin/*" 
        element={
          <ProtectedRoute allowedRoles={['admin', 'super_admin']}>
            <AdminDashboard user={authUser} onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />
      
      <Route 
        path="/guru/*" 
        element={
          <ProtectedRoute allowedRoles={['guru']}>
            <GuruDashboard user={authUser} onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/siswa/*" 
        element={
          <ProtectedRoute allowedRoles={['siswa']}>
            <SiswaDashboard user={authUser} onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />

      <Route 
        path="/operator/*" 
        element={
          <ProtectedRoute allowedRoles={['operator']}>
            <OperatorDashboard user={authUser} onLogout={handleLogout} />
          </ProtectedRoute>
        } 
      />

      {/* Fallback route */}
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default App;
