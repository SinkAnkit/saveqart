import { useState } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './context/AuthContext.jsx';
import Navbar from './components/Navbar.jsx';
import LocationModal from './components/LocationModal.jsx';
import Login from './pages/Login.jsx';
import Signup from './pages/Signup.jsx';
import ForgotPassword from './pages/ForgotPassword.jsx';
import ResetPassword from './pages/ResetPassword.jsx';
import Home from './pages/Home.jsx';
import History from './pages/History.jsx';
import Basket from './pages/Basket.jsx';

function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  const loc = useLocation();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center text-muted-foreground font-medium">
        Loading…
      </div>
    );
  }
  if (!user) return <Navigate to="/login" state={{ from: loc }} replace />;
  return children;
}

function PublicOnly({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  const { user } = useAuth();
  const [showLocation, setShowLocation] = useState(false);

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar onChangeLocation={() => setShowLocation(true)} />
      <main className="flex-1">
        <Routes>
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/signup" element={<PublicOnly><Signup /></PublicOnly>} />
          <Route path="/forgot-password" element={<PublicOnly><ForgotPassword /></PublicOnly>} />
          <Route path="/reset-password" element={<PublicOnly><ResetPassword /></PublicOnly>} />
          <Route path="/" element={<ProtectedRoute><Home /></ProtectedRoute>} />
          <Route path="/basket" element={<ProtectedRoute><Basket /></ProtectedRoute>} />
          <Route path="/history" element={<ProtectedRoute><History /></ProtectedRoute>} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
      <footer className="bg-muted mt-16">
        <div className="max-w-7xl mx-auto px-4 md:px-8 py-8 text-sm text-muted-foreground
          flex flex-wrap items-center justify-between gap-3">
          <div className="font-medium">
            © {new Date().getFullYear()} SaveQart. Compare quick-commerce in one place.
          </div>
          <div>Prices &amp; ETAs are indicative. Final prices on the seller's app.</div>
        </div>
      </footer>

      {user && (
        <LocationModal open={showLocation} onClose={() => setShowLocation(false)} />
      )}
    </div>
  );
}
