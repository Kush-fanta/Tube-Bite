import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Lock, Eye, EyeOff, Loader2 } from 'lucide-react';

export default function Login() {
  const { theme } = useTheme();
  const { login, loginWithGoogle } = useAuth();
  const navigate = useNavigate();
  const dark = theme === 'dark';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) { setError('All fields are required'); return; }
    setLoading(true);
    setError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch {
      setError('Invalid credentials');
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setLoading(true);
    try {
      await loginWithGoogle();
      // Navigation is handled automatically by PublicRoute once user state is set
    } catch {
      setError('Google login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={`flex min-h-[calc(100vh-4rem)] items-center justify-center px-4 py-12 transition-colors duration-300 ${dark ? 'bg-gray-950' : 'bg-gray-50'}`}>
      {/* Background */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-1/3 left-1/2 h-[500px] w-[500px] -translate-x-1/2 rounded-full bg-violet-500/10 blur-[120px]" />
      </div>

      <div className={`relative w-full max-w-md rounded-2xl border p-8 shadow-2xl ${dark ? 'border-white/10 bg-gray-900/80 backdrop-blur-xl' : 'border-gray-200 bg-white'
        }`}>
        {/* Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-6 flex justify-center">
            <div className="relative">
              {dark && (
                <div className="absolute inset-0 mx-auto h-[120%] w-[120%] -translate-y-[10%] bg-white/10 blur-[60px] rounded-full scale-[1.5]" />
              )}
              <img src="/logo_full.png" alt="Tube Bite Logo" className="relative z-10 h-30 w-auto" />
            </div>
          </div>
          <h1 className={`text-2xl font-bold ${dark ? 'text-white' : 'text-gray-900'}`}>Welcome back</h1>
          <p className={`mt-1.5 text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>Sign in to your Tube Bite account</p>
        </div>

        {/* Google */}
        <button
          onClick={handleGoogle}
          disabled={loading}
          className={`mb-6 flex w-full items-center justify-center gap-3 rounded-xl border py-3 text-sm font-medium transition-colors ${dark
            ? 'border-white/10 text-white hover:bg-white/5'
            : 'border-gray-300 text-gray-700 hover:bg-gray-50'
            }`}
        >
          <svg className="h-5 w-5" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
          </svg>
          Continue with Google
        </button>

        <div className="relative mb-6">
          <div className={`absolute inset-0 flex items-center ${dark ? '' : ''}`}>
            <div className={`w-full border-t ${dark ? 'border-white/10' : 'border-gray-200'}`} />
          </div>
          <div className="relative flex justify-center text-xs uppercase">
            <span className={`px-3 ${dark ? 'bg-gray-900 text-gray-500' : 'bg-white text-gray-400'}`}>or</span>
          </div>
        </div>

        {error && (
          <div className="mb-4 rounded-lg bg-red-500/10 border border-red-500/20 px-4 py-3 text-sm text-red-400">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Email</label>
            <div className="relative">
              <Mail className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? 'text-gray-500' : 'text-gray-400'}`} />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className={`w-full rounded-xl border py-3 pl-10 pr-4 text-sm outline-none transition-colors placeholder:text-gray-500 ${dark
                  ? 'border-white/10 bg-white/5 text-white focus:border-violet-500'
                  : 'border-gray-300 bg-gray-50 text-gray-900 focus:border-violet-500'
                  }`}
              />
            </div>
          </div>
          <div>
            <label className={`mb-1.5 block text-sm font-medium ${dark ? 'text-gray-300' : 'text-gray-700'}`}>Password</label>
            <div className="relative">
              <Lock className={`absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 ${dark ? 'text-gray-500' : 'text-gray-400'}`} />
              <input
                type={showPw ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className={`w-full rounded-xl border py-3 pl-10 pr-12 text-sm outline-none transition-colors placeholder:text-gray-500 ${dark
                  ? 'border-white/10 bg-white/5 text-white focus:border-violet-500'
                  : 'border-gray-300 bg-gray-50 text-gray-900 focus:border-violet-500'
                  }`}
              />
              <button type="button" onClick={() => setShowPw(!showPw)} className={`absolute right-3.5 top-1/2 -translate-y-1/2 ${dark ? 'text-gray-500 hover:text-gray-300' : 'text-gray-400 hover:text-gray-600'}`}>
                {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
          </div>
          <button
            type="submit"
            disabled={loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-violet-500 to-fuchsia-500 py-3 text-sm font-semibold text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-all disabled:opacity-50"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Sign In'}
          </button>
        </form>

        <p className={`mt-6 text-center text-sm ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
          Don't have an account?{' '}
          <Link to="/signup" className="font-medium text-violet-400 hover:text-violet-300">Sign up free</Link>
        </p>
      </div>
    </div>
  );
}
