import React, { useEffect, useState } from 'react';
import { ViewMode } from '../types';
import { supabase } from '../supabaseClient';

interface SidebarProps {
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  dyslexiaMode: boolean;
  setDyslexiaMode: (enabled: boolean) => void;
  onOpenUploadModal: () => void;
  onOpenCourseMap: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  dyslexiaMode,
  setDyslexiaMode,
  onOpenUploadModal,
  onOpenCourseMap,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

    // getSession() reads the already-cached local session instead
    // of making a fresh network round-trip, so this resolves
    // immediately instead of sometimes getting stuck on first paint
    // (e.g. right after a hard refresh).
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
    : '...';

  // "Upload Material" previously navigated to the pre-login landing
  // page (losing the sidebar entirely, leaving only the upload/quiz
  // flow reachable). It should just open the upload modal in place.
  const handleNavClick = (id: string) => {
    if (id === 'landing') {
      onOpenUploadModal();
    } else if (id === 'course-map') {
      onOpenCourseMap();
    } else {
      setCurrentView(id as ViewMode);
    }
  };

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
    { id: 'quizzes-list', label: 'Quizzes', icon: 'quiz' },
    { id: 'landing', label: 'Upload Material', icon: 'upload_file' },
    { id: 'course-map', label: 'Course Map', icon: 'account_tree' },
    { id: 'analytics', label: 'Analytics', icon: 'insights' },
    { id: 'quiz-results', label: 'Latest Results', icon: 'fact_check' },
  ];

  return (
    <>
      {/* Mobile Top Header (Only shown on small screens when main navbar is hidden) */}
      <div className="lg:hidden bg-white border-b border-[#d8d7e8] px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs w-full">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="flex items-center gap-2 text-left"
        >
          <div className="w-8 h-8 rounded-lg bg-[#7372A5] flex items-center justify-center text-white shadow-xs">
            <span className="material-symbols-outlined text-xl">bolt</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-[#222138]">
            Flex<span className="text-[#7372A5]">Quizz</span>
          </span>
        </button>

        <div className="flex items-center gap-3">
          {/* Mobile Dyslexia Toggle */}
          <button
            onClick={() => setDyslexiaMode(!dyslexiaMode)}
            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 ${
              dyslexiaMode ? 'bg-[#7372A5] text-white border-[#7372A5]' : 'bg-[#ececf4] text-gray-700 border-[#d8d7e8]'
            }`}
            title="Toggle Dyslexia Mode"
          >
            <span className="material-symbols-outlined text-base">visibility</span>
            <span className="text-[10px] uppercase font-extrabold">{dyslexiaMode ? 'ON' : 'OFF'}</span>
          </button>

          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="p-2 rounded-xl bg-[#ececf4] text-gray-700 hover:bg-[#d8d7e8] border border-[#d8d7e8]"
          >
            <span className="material-symbols-outlined text-xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="lg:hidden bg-white border-b border-[#d8d7e8] p-4 space-y-2 sticky top-[57px] z-20 shadow-md">
          {navItems.map((item) => {
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  handleNavClick(item.id);
                  setMobileMenuOpen(false);
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                  isActive
                    ? 'bg-[#ececf4] text-[#7372A5] font-bold border-l-4 border-[#7372A5] pl-2.5'
                    : 'text-gray-600 hover:bg-[#ececf4] hover:text-[#7372A5]'
                }`}
              >
                <span className={`material-symbols-outlined text-xl ${isActive ? 'text-[#7372A5]' : 'text-gray-400'}`}>
                  {item.icon}
                </span>
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>
      )}

      {/* Desktop Sidebar (Single primary navigation) */}
      <aside className="w-64 shrink-0 hidden lg:flex bg-white border-r border-[#d8d7e8] p-5 flex-col justify-between min-h-screen sticky top-0 h-screen overflow-y-auto">
        <div className="space-y-6">
          
          {/* Brand Header */}
          <button
            onClick={() => setCurrentView('dashboard')}
            className="flex items-center gap-3 text-left w-full pb-4 border-b border-[#d8d7e8] group"
          >
            <div className="w-10 h-10 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
              <span className="material-symbols-outlined text-2xl">bolt</span>
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-[#222138] block leading-tight">
                Flex<span className="text-[#7372A5]">Quizz</span>
              </span>
              <span className="text-[10px] uppercase tracking-wider font-semibold text-[#7372A5] block">
                AI Learning Platform
              </span>
            </div>
          </button>

          {/* Dyslexia Mode Switch Widget */}
          <div className="bg-[#ececf4] p-3.5 rounded-2xl border border-[#d8d7e8] flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#7372A5] text-xl">visibility</span>
              <div className="text-left">
                <span className="text-xs font-bold text-[#222138] block leading-tight">Dyslexia Mode</span>
                <span className={`text-[10px] font-extrabold ${dyslexiaMode ? 'text-[#7372A5]' : 'text-gray-400'}`}>
                  {dyslexiaMode ? 'MONOCHROME' : 'OFF'}
                </span>
              </div>
            </div>

            <button
              onClick={() => setDyslexiaMode(!dyslexiaMode)}
              role="switch"
              aria-checked={dyslexiaMode}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                dyslexiaMode ? 'bg-[#7372A5]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  dyslexiaMode ? 'translate-x-5' : 'translate-x-0'
                }`}
              />
            </button>
          </div>

          {/* Main Nav Items */}
          <div className="space-y-1">
            <p className="px-3 text-[11px] font-bold text-gray-400 uppercase tracking-wider mb-2">
              Navigation
            </p>
            {navItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  className={`w-full flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                    isActive
                      ? 'bg-[#ececf4] text-[#7372A5] font-bold border-l-4 border-[#7372A5] pl-3 shadow-2xs'
                      : 'text-gray-600 hover:bg-[#ececf4]/60 hover:text-[#7372A5]'
                  }`}
                >
                  <span className={`material-symbols-outlined text-xl ${isActive ? 'text-[#7372A5]' : 'text-gray-400'}`}>
                    {item.icon}
                  </span>
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>


        </div>

        {/* Footer / Account Quick Details */}
        <div className="border-t border-[#d8d7e8] pt-4 mt-auto">
          <button
            onClick={async () => {
              await supabase.auth.signOut();
              setCurrentView('login');
            }}
            className="w-full flex items-center justify-between p-2 rounded-xl hover:bg-[#ececf4] transition-colors group"
          >
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-full bg-[#ececf4] flex items-center justify-center border border-[#d8d7e8]">
                  <span className="material-symbols-outlined text-[#7372A5]">
                    person
                  </span>
              </div>

              <div className="text-left">
                  <p className="text-xs font-bold text-[#222138] group-hover:text-[#7372A5] truncate max-w-[120px]">
                    {displayName}
                  </p>
                  <p className="text-[10px] text-gray-500">
                    {isGuest ? 'Guest session' : 'Student'}
                  </p>
              </div>
            </div>
            <span className="material-symbols-outlined text-gray-400 text-lg group-hover:text-[#7372A5]">
              logout
            </span>
          </button>
        </div>
      </aside>
    </>
  );
};
