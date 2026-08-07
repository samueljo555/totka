import React, { useState } from 'react';
import { Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import './index.css';
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
    navigate('/');
  };

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
