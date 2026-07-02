import React, { Suspense, lazy } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useNavigate } from 'react-router-dom';
import { Loader } from 'lucide-react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import { ToastProvider } from './components/Toast';
import Login from './pages/Login';

// Code-split the authenticated app (Dashboard drags in modals, charts, the QR
// scanner + firebase data layer) so the Login screen paints fast on cellular.
const Dashboard = lazy(() => import('./components/Dashboard'));
const Settings = lazy(() => import('./pages/Settings'));

const RouteFallback = () => (
  <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
    <Loader className="animate-spin w-8 h-8 text-blue-500" />
  </div>
);

// SECURITY GUARD: Forces login if no user is found
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" replace />;
};

// Close Settings through the router (not window.history.back(), which exits the app when
// /settings is loaded directly — PWA reload, SW update, or a deep link/bookmark).
const SettingsRoute = () => {
  const navigate = useNavigate();
  return (
    <div className="min-h-screen bg-gray-900 flex items-center justify-center">
      <Settings onClose={() => navigate('/', { replace: true })} />
    </div>
  );
};

function App() {
  return (
    <ErrorBoundary>
    <ToastProvider>
    <Router>
      <AuthProvider>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/login" element={<Login />} />
          
          <Route 
            path="/" 
            element={
              <PrivateRoute>
                <Dashboard />
              </PrivateRoute>
            } 
          />
          
          <Route
             path="/settings"
             element={
               <PrivateRoute>
                 <SettingsRoute />
               </PrivateRoute>
             }
          />

          {/* Any unknown path resolves to a real screen (PrivateRoute then bounces to /login
              if signed out) instead of rendering a blank white page. */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
      </AuthProvider>
    </Router>
    </ToastProvider>
    </ErrorBoundary>
  );
}

export default App;