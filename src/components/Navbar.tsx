import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTheme } from '@/contexts/ThemeContext';
import { useAuth } from '@/contexts/AuthContext';
import {
  Sun, Moon, LogOut, Menu, X, History, LayoutDashboard, User,
} from 'lucide-react';

export default function Navbar() {
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);

  const dark = theme === 'dark';

  const navLinks = user
    ? [
      { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
      { to: '/history', label: 'History', icon: History },
    ]
    : [];

  const isActive = (path: string) => location.pathname === path;

  const handleLogout = () => {
    logout();
    navigate('/');
    setProfileOpen(false);
  };

  return (
    <nav
      className={`sticky top-0 z-50 border-b backdrop-blur-xl transition-colors duration-300 ${dark
        ? 'border-white/10 bg-gray-950/80 text-white'
        : 'border-gray-200 bg-white/80 text-gray-900'
        }`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6">
        {/* Logo */}
        <Link to="/" className="relative flex items-center justify-center transition-transform hover:scale-[1.02]">
          {/* Spray glow effect behind logo in dark mode */}
          {dark && (
            <div className="absolute inset-0 bg-white/20 blur-[30px] rounded-full" />
          )}
          <img src="/logo_icon.png" alt="TubeBite Logo" className="relative z-10 h-25 w-25 object-contain" />
        </Link>

        {/* Desktop Nav */}
        <div className="hidden items-center gap-1 md:flex">
          {navLinks.map(({ to, label, icon: Icon }) => (
            <Link
              key={to}
              to={to}
              className={`flex items-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-all ${isActive(to)
                ? dark
                  ? 'bg-white/10 text-white'
                  : 'bg-violet-50 text-violet-700'
                : dark
                  ? 'text-gray-400 hover:bg-white/5 hover:text-white'
                  : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                }`}
            >
              <Icon className="h-4 w-4" />
              {label}
            </Link>
          ))}
        </div>

        {/* Right */}
        <div className="flex items-center gap-2">
          <button
            onClick={toggleTheme}
            className={`rounded-lg p-2.5 transition-colors ${dark ? 'hover:bg-white/10 text-gray-400 hover:text-white' : 'hover:bg-gray-100 text-gray-500 hover:text-gray-900'
              }`}
            title="Toggle theme"
          >
            {dark ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
          </button>

          {user ? (
            <div className="relative">
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                  }`}
              >
                {user.photoURL ? (
                  <img
                    src={user.photoURL}
                    alt={user.displayName}
                    className="h-7 w-7 rounded-full object-cover ring-2 ring-violet-500/40"
                    onError={(e) => {
                      (e.currentTarget as HTMLImageElement).style.display = 'none';
                      const next = e.currentTarget.nextElementSibling as HTMLElement | null;
                      if (next) next.style.display = 'flex';
                    }}
                  />
                ) : null}
                <div
                  className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-bold text-white"
                  style={{ display: user.photoURL ? 'none' : 'flex' }}
                >
                  {user.displayName.charAt(0).toUpperCase()}
                </div>
                <span className="hidden sm:block">{user.displayName}</span>
              </button>
              {profileOpen && (
                <>
                  <div className="fixed inset-0" onClick={() => setProfileOpen(false)} />
                  <div
                    className={`absolute right-0 mt-2 w-56 rounded-xl border p-1.5 shadow-2xl ${dark
                      ? 'border-white/10 bg-gray-900 text-white'
                      : 'border-gray-200 bg-white text-gray-900'
                      }`}
                  >
                    {/* User summary — clicking goes to profile */}
                    <Link
                      to="/profile"
                      onClick={() => setProfileOpen(false)}
                      className={`mb-1.5 flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors ${dark ? 'bg-white/5 hover:bg-white/10' : 'bg-gray-50 hover:bg-gray-100'}`}
                    >
                      {user.photoURL ? (
                        <img
                          src={user.photoURL}
                          alt={user.displayName}
                          className="h-9 w-9 rounded-full object-cover ring-2 ring-violet-500/30"
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-sm font-bold text-white">
                          {user.displayName.charAt(0).toUpperCase()}
                        </div>
                      )}
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{user.displayName}</p>
                        <p className={`truncate text-xs ${dark ? 'text-gray-400' : 'text-gray-500'}`}>
                          {user.username ? `@${user.username}` : user.email}
                        </p>
                      </div>
                    </Link>
                    <Link
                      to="/profile"
                      onClick={() => setProfileOpen(false)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                        }`}
                    >
                      <User className="h-4 w-4" /> Edit Profile
                    </Link>
                    <Link
                      to="/dashboard"
                      onClick={() => setProfileOpen(false)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                        }`}
                    >
                      <LayoutDashboard className="h-4 w-4" /> Dashboard
                    </Link>
                    <Link
                      to="/history"
                      onClick={() => setProfileOpen(false)}
                      className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'
                        }`}
                    >
                      <History className="h-4 w-4" /> History
                    </Link>
                    <div className={`my-1.5 border-t ${dark ? 'border-white/10' : 'border-gray-200'}`} />
                    <button
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-red-400 hover:bg-red-500/10 transition-colors"
                    >
                      <LogOut className="h-4 w-4" /> Logout
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : (
            <div className="hidden items-center gap-2 sm:flex">
              <Link
                to="/login"
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${dark ? 'text-gray-300 hover:text-white' : 'text-gray-600 hover:text-gray-900'
                  }`}
              >
                Log in
              </Link>
              <Link
                to="/signup"
                className="rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-4 py-2 text-sm font-medium text-white shadow-lg shadow-violet-500/25 hover:shadow-violet-500/40 transition-shadow"
              >
                Sign up free
              </Link>
            </div>
          )}

          {/* Mobile menu */}
          <button
            className={`rounded-lg p-2 md:hidden ${dark ? 'hover:bg-white/10' : 'hover:bg-gray-100'}`}
            onClick={() => setMobileOpen(!mobileOpen)}
          >
            {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile Nav */}
      {mobileOpen && (
        <div className={`border-t p-4 md:hidden ${dark ? 'border-white/10 bg-gray-950' : 'border-gray-200 bg-white'}`}>
          <div className="space-y-1">
            {navLinks.map(({ to, label, icon: Icon }) => (
              <Link
                key={to}
                to={to}
                onClick={() => setMobileOpen(false)}
                className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${isActive(to)
                  ? dark ? 'bg-white/10 text-white' : 'bg-violet-50 text-violet-700'
                  : dark ? 'text-gray-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                  }`}
              >
                <Icon className="h-4 w-4" /> {label}
              </Link>
            ))}
            {!user && (
              <>
                <Link
                  to="/login"
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2.5 text-sm font-medium ${dark ? 'text-gray-400 hover:bg-white/5' : 'text-gray-600 hover:bg-gray-100'
                    }`}
                >
                  <User className="h-4 w-4" /> Log in
                </Link>
                <Link
                  to="/signup"
                  onClick={() => setMobileOpen(false)}
                  className="flex items-center justify-center rounded-lg bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-2.5 text-sm font-medium text-white"
                >
                  Sign up free
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}
