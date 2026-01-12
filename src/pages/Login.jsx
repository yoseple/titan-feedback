// src/pages/Login.jsx
import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useNavigate } from 'react-router-dom';

export default function Login() {
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { googleLogin } = useAuth(); // <--- Use the new function
  const navigate = useNavigate();

  async function handleGoogleSignIn() {
    try {
      setError('');
      setLoading(true);
      await googleLogin();
      navigate('/'); // Go to Dashboard
    } catch (err) {
      console.error(err);
      setError('Failed to sign in with Google.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gray-900 text-white p-4">
      <div className="w-full max-w-md bg-gray-800 p-8 rounded-xl shadow-2xl border border-gray-700 text-center">
        <h1 className="text-4xl font-black mb-2 tracking-tighter text-blue-500">TITAN</h1>
        <p className="text-gray-400 mb-8">
          Operator Access Terminal
        </p>
        
        {error && <div className="bg-red-900/50 text-red-200 p-3 rounded mb-4 text-sm border border-red-700">{error}</div>}

        {/* GOOGLE BUTTON */}
        <button 
          onClick={handleGoogleSignIn}
          disabled={loading}
          className="w-full py-4 bg-white hover:bg-gray-100 text-gray-900 rounded-lg font-bold text-lg shadow-lg flex items-center justify-center gap-3 transition transform active:scale-95"
        >
          {/* Simple G Logo SVG */}
          <svg className="w-5 h-5" viewBox="0 0 24 24">
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.84z" />
            <path fill="#EA4335" d="M12 4.36c1.61 0 3.09.56 4.23 1.64l3.18-3.18C17.46 1.05 14.97 0 12 0 7.7 0 3.99 2.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
          </svg>
          {loading ? 'Connecting...' : 'Sign in with Google'}
        </button>

      </div>
    </div>
  );
}