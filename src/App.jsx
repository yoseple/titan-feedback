import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import ErrorBoundary from './components/ErrorBoundary';
import Login from './pages/Login';
import Dashboard from './components/Dashboard';
import Settings from './pages/Settings';

// SECURITY GUARD: Forces login if no user is found
const PrivateRoute = ({ children }) => {
  const { currentUser } = useAuth();
  return currentUser ? children : <Navigate to="/login" />;
};

function App() {
  return (
    <ErrorBoundary>
    <Router>
      <AuthProvider>
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
                 <div className="min-h-screen bg-gray-900 flex items-center justify-center">
                   <Settings onClose={() => window.history.back()} />
                 </div>
               </PrivateRoute>
             } 
          />
        </Routes>
      </AuthProvider>
    </Router>
    </ErrorBoundary>
  );
}

export default App;