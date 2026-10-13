import React, { useState } from 'react';
import { ViewMode } from '../../types';
import { supabase } from '../../supabaseClient';

interface LoginViewProps {
  setCurrentView: (view: ViewMode) => void;
  dyslexiaMode: boolean;
  setDyslexiaMode: (enabled: boolean) => void;
}

export const LoginView: React.FC<LoginViewProps> = ({
  setCurrentView,
  dyslexiaMode,
  setDyslexiaMode,
}) => {
  const [email, setEmail] = useState('');
const [password, setPassword] = useState('');
const [showPassword, setShowPassword] = useState(false);
const [error, setError] = useState('');
const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  setError('');
  setLoading(true);

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  setLoading(false);

  if (error) {
    setError(error.message);
    return;
  }

  setCurrentView('dashboard');
};

  return (
    <div className="min-h-screen bg-[#f6f6fa] flex flex-col justify-between text-left">
      
      {/* Top Header */}
      <header className="p-4 lg:px-12 flex items-center justify-between border-b border-[#d8d7e8] bg-white/80 backdrop-blur-md">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md">
            <span className="material-symbols-outlined text-2xl">bolt</span>
          </div>
          <span className="text-2xl font-bold tracking-tight text-[#222138]">
            Flex<span className="text-[#7372A5]">Quizz</span>
          </span>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#ececf4] px-3 py-1.5 rounded-xl border border-[#d8d7e8]">
            <span className="material-symbols-outlined text-[#7372A5] text-lg">visibility</span>
            <span className="text-xs text-gray-700 font-medium hidden sm:inline">Dyslexia Mode: </span>
            <span className={`text-xs font-bold ${dyslexiaMode ? 'text-[#7372A5]' : 'text-gray-500'}`}>
              {dyslexiaMode ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={() => setDyslexiaMode(!dyslexiaMode)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                dyslexiaMode ? 'bg-[#7372A5]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  dyslexiaMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main Split Content */}
      <main className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 items-center">
        
        {/* Left Side: Clean Hero Typography & Feature Cards (No pictures) */}
        <div className="space-y-8 text-left p-2 lg:p-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#ececf4] text-[#7372A5] text-xs font-bold uppercase tracking-wider border border-[#d8d7e8]">
              <span className="material-symbols-outlined text-sm">auto_awesome</span>
              <span>Your notes. Your pace. Your rules</span>
            </div>

            <h1 className="text-4xl sm:text-5xl font-extrabold text-[#222138] tracking-tight leading-tight">
              Learn your way. <br />
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#7372A5] to-[#8c8bbd]">
                Quiz your way.
              </span>
            </h1>

            <p className="text-base text-gray-600 max-w-lg leading-relaxed">
              AI-powered quizzes that adapt to your knowledge level. Upload study materials, track progress analytics, and master subjects with built-in dyslexia accessibility.
            </p>
          </div>

          {/* Feature Highlights Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-lg">
            <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-lg">description</span>
              </div>
              <h3 className="font-bold text-sm text-[#222138]">Upload & Generate</h3>
              <p className="text-xs text-gray-500 leading-snug">Convert lecture slides, notes, or PDFs into practice quizzes instantly.</p>
            </div>

            <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-2xs space-y-2">
              <div className="w-8 h-8 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center font-bold">
                <span className="material-symbols-outlined text-lg">insights</span>
              </div>
              <h3 className="font-bold text-sm text-[#222138]">Smart Analytics</h3>
              <p className="text-xs text-gray-500 leading-snug">Identify weak topics, review explanations, and build daily study streaks.</p>
            </div>
          </div>

          {/* Social Proof Bar */}
          <div className="pt-2 flex flex-wrap items-center gap-6 border-t border-[#d8d7e8]">
            <div>
              <p className="text-xl font-extrabold text-[#222138]">Built</p>
              <p className="text-xs text-gray-500 font-medium">For Every learner</p>
            </div>
            <div className="h-8 w-px bg-[#d8d7e8]" />
            <div>
              <p className="text-xl font-extrabold text-[#222138]">100%</p>
              <p className="text-xs text-gray-500 font-medium">Dyslexia Accessible</p>
            </div>
            <div className="h-8 w-px bg-[#d8d7e8]" />
            <div>
              <p className="text-xl font-extrabold text-[#222138]">Instant</p>
              <p className="text-xs text-gray-500 font-medium">Quiz AI Generation</p>
            </div>
          </div>
        </div>

        {/* Right Side: Login Form Card */}
        <div className="w-full max-w-md mx-auto bg-white rounded-3xl p-8 shadow-xl border border-[#d8d7e8] text-left">
          <div className="mb-6">
            <h2 className="text-2xl font-bold text-[#222138]">Welcome back!</h2>
            <p className="text-xs text-gray-500 mt-1">Sign in to access your quizzes and track performance</p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Email address
              </label>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-3 text-gray-400 text-lg">
                  mail
                </span>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#7372A5] text-sm font-medium"
                  placeholder="alex@university.edu"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Password
                </label>
                <a href="#forgot" className="text-xs text-[#7372A5] font-semibold hover:underline">
                  Forgot password?
                </a>
              </div>
              <div className="relative">
                <span className="material-symbols-outlined absolute left-3 top-3 text-gray-400 text-lg">
                  lock
                </span>
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full pl-10 pr-10 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#7372A5] text-sm font-medium"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-3 text-gray-400 hover:text-gray-600"
                >
                  <span className="material-symbols-outlined text-lg">
                    {showPassword ? 'visibility_off' : 'visibility'}
                  </span>
                </button>
              </div>
            </div>
{error && (
  <p className="text-sm text-red-500">
    {error}
  </p>
)}
            <button
  type="submit"
  disabled={loading}
  className="w-full py-3 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-sm shadow-md transition-all disabled:opacity-50"
>
  {loading ? 'Logging in...' : 'Log In'}
</button>
          </form>

          <div className="relative my-6 text-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-200" />
            </div>
            <span className="relative bg-white px-3 text-xs text-gray-400 font-semibold uppercase">
              OR
            </span>
          </div>

          <button
            type="button"
            onClick={async () => {
              setError('');
              const { error } = await supabase.auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: window.location.origin },
              });
              if (error) setError(error.message);
            }}
            className="w-full py-2.5 rounded-xl border border-gray-200 hover:bg-gray-50 flex items-center justify-center gap-2 text-xs font-bold text-gray-700 transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path
                fill="#4285F4"
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
              />
              <path
                fill="#34A853"
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
              />
              <path
                fill="#FBBC05"
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
              />
              <path
                fill="#EA4335"
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
              />
            </svg>
            Continue with Google
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('dashboard')}
            className="w-full mt-2 py-2.5 rounded-xl border border-dashed border-gray-300 hover:bg-gray-50 flex items-center justify-center gap-2 text-xs font-bold text-gray-500 transition-colors"
          >
            <span className="material-symbols-outlined text-base">person_outline</span>
            Continue as Guest
          </button>
          <p className="text-[10px] text-gray-400 text-center mt-1">
            No account, no saved progress across sessions
          </p>

        </div>

      </main>

      {/* Footer */}
      <footer className="p-4 border-t border-[#d8d7e8] text-center text-xs text-gray-400">
        &copy; {new Date().getFullYear()} FlexQuizz Inc. Accessibility first learning.
      </footer>

    </div>
  );
};

