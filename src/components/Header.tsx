import React, { useEffect, useState } from 'react';
import { ViewMode } from '../types';
import { supabase } from '../supabaseClient';

interface HeaderProps {
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  dyslexiaMode: boolean;
  setDyslexiaMode: (enabled: boolean) => void;
  onOpenUploadModal: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentView,
  setCurrentView,
  dyslexiaMode,
  setDyslexiaMode,
  onOpenUploadModal,
}) => {
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [isGuest, setIsGuest] = useState(false);

  useEffect(() => {
    let mounted = true;

    const applySession = (
      session: { user?: { email?: string | null } } | null
    ) => {
      if (!mounted) return;
      if (session?.user?.email) {
        setUserEmail(session.user.email);
        setIsGuest(false);
      } else {
        setUserEmail(null);
        setIsGuest(true);
      }
    };

    supabase.auth.getSession().then(({ data }) => {
      applySession(data.session);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const displayName = userEmail
    ? userEmail.split('@')[0]
    : isGuest
    ? 'Guest'
    : '';

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-[#d8d7e8] px-4 lg:px-8 py-3 transition-colors">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-4">
        
        {/* Brand Logo & Name */}
        <button
          onClick={() => setCurrentView('dashboard')}
          className="flex items-center gap-2.5 group text-left focus:outline-none"
        >
          <div className="w-10 h-10 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
            <span className="material-symbols-outlined text-2xl">bolt</span>
          </div>
          <div>
            <span className="text-xl font-bold tracking-tight text-[#222138] font-display flex items-center gap-1">
              Flex<span className="text-[#7372A5]">demy</span>
            </span>
            <span className="text-[10px] uppercase tracking-wider font-semibold text-[#7372A5] block -mt-1">
              AI Adaptive Platform
            </span>
          </div>
        </button>

        {/* Navigation Links (Desktop) */}
        <nav className="hidden md:flex items-center gap-1 bg-[#ececf4] p-1 rounded-xl border border-[#d8d7e8]">
          <button
            onClick={() => setCurrentView('dashboard')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentView === 'dashboard'
                ? 'bg-white text-[#7372A5] shadow-sm font-semibold'
                : 'text-gray-600 hover:text-[#222138] hover:bg-white/50'
            }`}
          >
            Dashboard
          </button>
          <button
            onClick={() => setCurrentView('quizzes-list')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentView === 'quizzes-list'
                ? 'bg-white text-[#7372A5] shadow-sm font-semibold'
                : 'text-gray-600 hover:text-[#222138] hover:bg-white/50'
            }`}
          >
            Quizzes
          </button>
          <button
            onClick={() => setCurrentView('landing')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentView === 'landing'
                ? 'bg-white text-[#7372A5] shadow-sm font-semibold'
                : 'text-gray-600 hover:text-[#222138] hover:bg-white/50'
            }`}
          >
            Material Upload
          </button>
          <button
            onClick={() => setCurrentView('analytics')}
            className={`px-3.5 py-1.5 rounded-lg text-sm font-medium transition-all ${
              currentView === 'analytics' || currentView === 'quiz-results'
                ? 'bg-white text-[#7372A5] shadow-sm font-semibold'
                : 'text-gray-600 hover:text-[#222138] hover:bg-white/50'
            }`}
          >
            Analytics
          </button>
        </nav>

        {/* Right Section Controls */}
        <div className="flex items-center gap-3">
          
          {/* Dyslexia Mode Toggle Card */}
          <div className="flex items-center gap-2 bg-[#ececf4] px-3 py-1.5 rounded-xl border border-[#d8d7e8]">
            <span className="material-symbols-outlined text-[#7372A5] text-lg">
              visibility
            </span>
            <div className="text-xs">
              <span className="text-gray-700 font-medium hidden sm:inline">Dyslexia Mode: </span>
              <span className={`font-bold ${dyslexiaMode ? 'text-[#7372A5]' : 'text-gray-500'}`}>
                {dyslexiaMode ? 'ON' : 'OFF'}
              </span>
            </div>
            
            <button
              onClick={() => setDyslexiaMode(!dyslexiaMode)}
              role="switch"
              aria-checked={dyslexiaMode}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-[#7372A5] focus:ring-offset-1 ${
                dyslexiaMode ? 'bg-[#7372A5]' : 'bg-gray-300'
              }`}
            >
              <span className="sr-only">Toggle Dyslexia Mode</span>
              <span
                className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  dyslexiaMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* AI Generator Button */}
          <button
            onClick={onOpenUploadModal}
            className="hidden sm:flex items-center gap-2 bg-[#7372A5] hover:bg-[#585785] text-white px-3.5 py-1.5 rounded-xl text-sm font-semibold shadow-md transition-all hover:scale-[1.02] active:scale-[0.98]"
          >
            <span className="material-symbols-outlined text-lg">auto_awesome</span>
            <span>New Quiz</span>
          </button>

          {/* User Profile / Login Direct Button */}
          {currentView === 'login' ? (
            <button
              onClick={() => setCurrentView('dashboard')}
              className="text-xs font-semibold text-[#7372A5] border border-[#7372A5]/30 px-3 py-1.5 rounded-lg hover:bg-[#7372A5]/10"
            >
              Skip to App
            </button>
          ) : (
            <div className="flex items-center gap-2 pl-1 border-l border-gray-200">
              <button
                onClick={() => setCurrentView('login')}
                className="flex items-center gap-2 p-1 rounded-full hover:bg-[#ececf4] transition-colors"
                title="Account Profile"
              >
                <div className="w-8 h-8 rounded-full bg-[#ececf4] flex items-center justify-center ring-2 ring-[#7372A5]/40">
                  <span className="material-symbols-outlined text-[#7372A5] text-lg">
                    person
                  </span>
                </div>
                <span className="hidden lg:inline text-xs font-bold text-[#222138] truncate max-w-[100px]">
                  {displayName}
                </span>
              </button>
            </div>
          )}

        </div>
      </div>
    </header>
  );
};
