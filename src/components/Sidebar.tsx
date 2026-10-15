import React, { useState, useEffect } from 'react';
import { ViewMode, UserProfile, ThemeMode } from '../types';
import { AccountMenu } from './AccountMenu';

interface SidebarProps {
  currentView: ViewMode;
  setCurrentView: (view: ViewMode) => void;
  dyslexiaMode: boolean;
  setDyslexiaMode: (enabled: boolean) => void;
  currentTheme: ThemeMode;
  onThemeChange: (theme: ThemeMode) => void;
  userProfile: UserProfile;
  isGuest: boolean;
  onOpenUploadModal: () => void;
  onOpenCourseMap: () => void;
  onOpenLatestResults: () => void;
  onSignOut: () => Promise<void>;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  setCurrentView,
  dyslexiaMode,
  setDyslexiaMode,
  currentTheme,
  onThemeChange,
  userProfile,
  isGuest,
  onOpenUploadModal,
  onOpenCourseMap,
  onOpenLatestResults,
  onSignOut,
}) => {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(false);

  // Restore collapsed state preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem('flexdemy_sidebar_collapsed');
      if (saved === 'true') {
        setIsCollapsed(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const toggleCollapse = () => {
    setIsCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('flexdemy_sidebar_collapsed', String(next));
      } catch {
        // ignore
      }
      return next;
    });
  };

  // Close mobile menu on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && mobileMenuOpen) {
        setMobileMenuOpen(false);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mobileMenuOpen]);

  const handleNavClick = (id: string) => {
    if (id === 'landing') {
      onOpenUploadModal();
    } else if (id === 'course-map') {
      onOpenCourseMap();
    } else if (id === 'quiz-results') {
      onOpenLatestResults();
    } else {
      setCurrentView(id as ViewMode);
    }
    setMobileMenuOpen(false);
  };

  const learnNavItems = [
    { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', tooltip: 'Dashboard Overview' },
    { id: 'quizzes-list', label: 'Quizzes', icon: 'quiz', tooltip: 'Available Quizzes' },
    { id: 'landing', label: 'Upload Material', icon: 'upload_file', tooltip: 'Upload Notes & Slides' },
    { id: 'course-map', label: 'Course Map', icon: 'account_tree', tooltip: 'Prerequisite Concept Graph' },
    { id: 'analytics', label: 'Analytics', icon: 'insights', tooltip: 'Mastery Radar & BKT Analytics' },
    { id: 'quiz-results', label: 'Latest Results', icon: 'fact_check', tooltip: 'Latest Quiz Insights' },
  ];

  const preferenceNavItems = [
    { id: 'profile', label: 'Profile', icon: 'person', tooltip: 'Learner Profile & Goals' },
    { id: 'settings', label: 'Settings', icon: 'settings', tooltip: 'Preferences & Accessibility' },
  ];

  // Cycle theme: light -> dark -> system -> light
  const cycleTheme = () => {
    if (currentTheme === 'light') onThemeChange('dark');
    else if (currentTheme === 'dark') onThemeChange('system');
    else onThemeChange('light');
  };

  const themeIcon =
    currentTheme === 'dark'
      ? 'dark_mode'
      : currentTheme === 'light'
      ? 'light_mode'
      : 'desktop_windows';

  const themeLabel =
    currentTheme === 'dark'
      ? 'Dark'
      : currentTheme === 'light'
      ? 'Light'
      : 'Auto';

  return (
    <>
      {/* ========================================================
          MOBILE TOP NAVBAR
      ======================================================== */}
      <div className="lg:hidden bg-white dark:bg-[#161522] border-b border-[#d8d7e8] dark:border-[#312f45] px-4 py-3 flex items-center justify-between sticky top-0 z-30 shadow-xs w-full transition-colors">
        <button
          onClick={() => setCurrentView('dashboard')}
          className="flex items-center gap-2.5 text-left focus:outline-none"
        >
          <div className="w-8 h-8 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-xs">
            <span className="material-symbols-outlined text-xl">bolt</span>
          </div>
          <span className="text-lg font-bold tracking-tight text-[#222138] dark:text-[#f2f1f8]">
            Flex<span className="text-[#7372A5] dark:text-[#a1a0d3]">demy</span>
          </span>
        </button>

        <div className="flex items-center gap-2">
          {/* Mobile Theme Toggle */}
          <button
            onClick={cycleTheme}
            aria-label={`Switch theme, current: ${themeLabel}`}
            title={`Theme: ${themeLabel}`}
            className="p-2 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4] dark:bg-[#242236] text-gray-700 dark:text-gray-200"
          >
            <span className="material-symbols-outlined text-lg leading-none">
              {themeIcon}
            </span>
          </button>

          {/* Mobile Dyslexia Toggle */}
          <button
            onClick={() => setDyslexiaMode(!dyslexiaMode)}
            className={`p-2 rounded-xl border text-xs font-bold flex items-center gap-1 ${
              dyslexiaMode
                ? 'bg-[#7372A5] text-white border-[#7372A5]'
                : 'bg-[#ececf4] dark:bg-[#242236] text-gray-700 dark:text-gray-200 border-[#d8d7e8] dark:border-[#312f45]'
            }`}
            title="Toggle Dyslexia Mode"
          >
            <span className="material-symbols-outlined text-base">visibility</span>
          </button>

          {/* Mobile Hamburger Toggle */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label={mobileMenuOpen ? 'Close navigation' : 'Open navigation'}
            className="p-2 rounded-xl bg-[#ececf4] dark:bg-[#242236] text-gray-700 dark:text-gray-200 hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] border border-[#d8d7e8] dark:border-[#312f45]"
          >
            <span className="material-symbols-outlined text-xl">
              {mobileMenuOpen ? 'close' : 'menu'}
            </span>
          </button>
        </div>
      </div>

      {/* ========================================================
          MOBILE DRAWER & BACKDROP
      ======================================================== */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden flex">
          {/* Backdrop */}
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity"
            onClick={() => setMobileMenuOpen(false)}
            aria-hidden="true"
          />

          {/* Drawer Sheet */}
          <div className="relative w-72 max-w-[85vw] bg-white dark:bg-[#161522] border-r border-[#d8d7e8] dark:border-[#312f45] p-5 flex flex-col justify-between h-full z-50 shadow-2xl overflow-y-auto">
            <div className="space-y-6">
              <div className="flex items-center justify-between pb-3 border-b border-[#ececf4] dark:border-[#252436]">
                <button
                  onClick={() => {
                    setCurrentView('dashboard');
                    setMobileMenuOpen(false);
                  }}
                  className="flex items-center gap-2.5 text-left"
                >
                  <div className="w-8 h-8 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-xs">
                    <span className="material-symbols-outlined text-xl">bolt</span>
                  </div>
                  <span className="text-lg font-bold tracking-tight text-[#222138] dark:text-[#f2f1f8]">
                    Flex<span className="text-[#7372A5] dark:text-[#a1a0d3]">demy</span>
                  </span>
                </button>

                <button
                  onClick={() => setMobileMenuOpen(false)}
                  className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
                  aria-label="Close navigation"
                >
                  <span className="material-symbols-outlined text-xl">close</span>
                </button>
              </div>

              {/* Mobile Learn Group */}
              <div className="space-y-1">
                <p className="px-3 text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Learn
                </p>
                {learnNavItems.map((item) => {
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? 'bg-[#ececf4] dark:bg-[#242236] text-[#7372A5] dark:text-[#a1a0d3] font-bold border-l-4 border-[#7372A5] dark:border-[#a1a0d3] pl-2.5'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-[#ececf4] dark:hover:bg-[#242236] hover:text-[#7372A5] dark:hover:text-[#a1a0d3]'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-xl ${isActive ? 'text-[#7372A5] dark:text-[#a1a0d3]' : 'text-gray-400'}`}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Mobile Preferences Group */}
              <div className="space-y-1 pt-2 border-t border-[#ececf4] dark:border-[#252436]">
                <p className="px-3 text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-2">
                  Preferences
                </p>
                {preferenceNavItems.map((item) => {
                  const isActive = currentView === item.id;
                  return (
                    <button
                      key={item.id}
                      onClick={() => handleNavClick(item.id)}
                      className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-semibold transition-all ${
                        isActive
                          ? 'bg-[#ececf4] dark:bg-[#242236] text-[#7372A5] dark:text-[#a1a0d3] font-bold border-l-4 border-[#7372A5] dark:border-[#a1a0d3] pl-2.5'
                          : 'text-gray-600 dark:text-gray-300 hover:bg-[#ececf4] dark:hover:bg-[#242236] hover:text-[#7372A5] dark:hover:text-[#a1a0d3]'
                      }`}
                    >
                      <span className={`material-symbols-outlined text-xl ${isActive ? 'text-[#7372A5] dark:text-[#a1a0d3]' : 'text-gray-400'}`}>
                        {item.icon}
                      </span>
                      <span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Mobile Account Menu */}
            <div className="pt-4 border-t border-[#ececf4] dark:border-[#252436]">
              <AccountMenu
                userProfile={userProfile}
                isGuest={isGuest}
                currentTheme={currentTheme}
                onThemeChange={onThemeChange}
                onNavigate={(v) => {
                  setCurrentView(v);
                  setMobileMenuOpen(false);
                }}
                onSignOut={onSignOut}
              />
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          DESKTOP SIDEBAR (Collapsible, Fixed/Sticky)
      ======================================================== */}
      <aside
        className={`hidden lg:flex shrink-0 bg-white dark:bg-[#161522] border-r border-[#d8d7e8] dark:border-[#312f45] flex-col justify-between min-h-screen sticky top-0 h-screen transition-all duration-200 z-30 ${
          isCollapsed ? 'w-20 p-3' : 'w-64 p-5'
        }`}
      >
        <div className="space-y-6">
          {/* Brand Header & Collapse Toggle */}
          <div className="flex items-center justify-between pb-4 border-b border-[#ececf4] dark:border-[#252436]">
            {!isCollapsed ? (
              <button
                onClick={() => setCurrentView('dashboard')}
                className="flex items-center gap-3 text-left group focus:outline-none"
              >
                <div className="w-10 h-10 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md group-hover:scale-105 transition-transform">
                  <span className="material-symbols-outlined text-2xl">bolt</span>
                </div>
                <div>
                  <span className="text-xl font-bold tracking-tight text-[#222138] dark:text-[#f2f1f8] block leading-tight">
                    Flex<span className="text-[#7372A5] dark:text-[#a1a0d3]">demy</span>
                  </span>
                  <span className="text-[10px] uppercase tracking-wider font-semibold text-[#7372A5] dark:text-[#a1a0d3] block">
                    AI Learning Platform
                  </span>
                </div>
              </button>
            ) : (
              <button
                onClick={() => setCurrentView('dashboard')}
                title="Flexdemy Dashboard"
                className="mx-auto w-10 h-10 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md hover:scale-105 transition-transform focus:outline-none"
              >
                <span className="material-symbols-outlined text-2xl">bolt</span>
              </button>
            )}

            {!isCollapsed && (
              <button
                onClick={toggleCollapse}
                title="Collapse sidebar"
                aria-label="Collapse sidebar"
                className="p-1.5 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#242236] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
              >
                <span className="material-symbols-outlined text-lg leading-none">
                  first_page
                </span>
              </button>
            )}
          </div>

          {/* Collapsed Expand Button */}
          {isCollapsed && (
            <div className="text-center">
              <button
                onClick={toggleCollapse}
                title="Expand sidebar"
                aria-label="Expand sidebar"
                className="p-2 rounded-xl text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#242236] transition-colors focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 mx-auto"
              >
                <span className="material-symbols-outlined text-lg leading-none">
                  last_page
                </span>
              </button>
            </div>
          )}

          {/* Quick Utility Row (Theme + Dyslexia) */}
          {!isCollapsed ? (
            <div className="grid grid-cols-2 gap-2">
              {/* Compact Appearance Control */}
              <button
                onClick={cycleTheme}
                title={`Theme: ${themeLabel} (Click to change)`}
                aria-label={`Current theme: ${themeLabel}. Click to switch theme.`}
                className="flex items-center justify-between px-3 py-2 rounded-xl bg-[#ececf4] dark:bg-[#222033] border border-[#d8d7e8] dark:border-[#312f45] text-xs font-bold text-gray-700 dark:text-gray-200 hover:border-[#7372A5]/40 transition-all focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
              >
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-[#7372A5] dark:text-[#a1a0d3]">
                    {themeIcon}
                  </span>
                  <span>{themeLabel}</span>
                </div>
                <span className="text-[10px] text-gray-400">↻</span>
              </button>

              {/* Dyslexia Mode Quick Toggle */}
              <button
                onClick={() => setDyslexiaMode(!dyslexiaMode)}
                role="switch"
                aria-checked={dyslexiaMode}
                title="Toggle high-readability Dyslexia Mode"
                className={`flex items-center justify-between px-3 py-2 rounded-xl border text-xs font-bold transition-all focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 ${
                  dyslexiaMode
                    ? 'bg-[#7372A5] text-white border-[#7372A5]'
                    : 'bg-[#ececf4] dark:bg-[#222033] text-gray-700 dark:text-gray-200 border-[#d8d7e8] dark:border-[#312f45]'
                }`}
              >
                <span className="material-symbols-outlined text-base">visibility</span>
                <span className="text-[10px] uppercase font-extrabold">
                  {dyslexiaMode ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button
                onClick={cycleTheme}
                title={`Theme: ${themeLabel}`}
                aria-label={`Switch theme, currently ${themeLabel}`}
                className="w-10 h-10 rounded-xl bg-[#ececf4] dark:bg-[#222033] border border-[#d8d7e8] dark:border-[#312f45] flex items-center justify-center text-gray-700 dark:text-gray-200 hover:border-[#7372A5]/40 transition-all"
              >
                <span className="material-symbols-outlined text-lg leading-none text-[#7372A5] dark:text-[#a1a0d3]">
                  {themeIcon}
                </span>
              </button>

              <button
                onClick={() => setDyslexiaMode(!dyslexiaMode)}
                title={`Dyslexia Mode: ${dyslexiaMode ? 'ON' : 'OFF'}`}
                className={`w-10 h-10 rounded-xl border flex items-center justify-center transition-all ${
                  dyslexiaMode
                    ? 'bg-[#7372A5] text-white border-[#7372A5]'
                    : 'bg-[#ececf4] dark:bg-[#222033] text-gray-700 dark:text-gray-200 border-[#d8d7e8] dark:border-[#312f45]'
                }`}
              >
                <span className="material-symbols-outlined text-lg leading-none">visibility</span>
              </button>
            </div>
          )}

          {/* Group 1: LEARN */}
          <div className="space-y-1">
            {!isCollapsed && (
              <p className="px-3 text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-2">
                Learn
              </p>
            )}
            {learnNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.tooltip : undefined}
                  className={`w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 ${
                    isCollapsed ? 'justify-center p-2.5' : 'px-3.5 py-2.5'
                  } ${
                    isActive
                      ? 'bg-[#ececf4] dark:bg-[#242236] text-[#7372A5] dark:text-[#a1a0d3] font-bold border-l-4 border-[#7372A5] dark:border-[#a1a0d3] pl-2.5'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-[#ececf4]/60 dark:hover:bg-[#242236]/60 hover:text-[#7372A5] dark:hover:text-[#a1a0d3]'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-xl ${
                      isActive ? 'text-[#7372A5] dark:text-[#a1a0d3]' : 'text-gray-400 dark:text-gray-400'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!isCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>

          {/* Group 2: PREFERENCES */}
          <div className="space-y-1 pt-2 border-t border-[#ececf4] dark:border-[#252436]">
            {!isCollapsed && (
              <p className="px-3 text-[10px] font-bold text-gray-400 dark:text-gray-400 uppercase tracking-wider mb-2">
                Preferences
              </p>
            )}
            {preferenceNavItems.map((item) => {
              const isActive = currentView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => handleNavClick(item.id)}
                  title={isCollapsed ? item.tooltip : undefined}
                  className={`w-full flex items-center gap-3 rounded-xl text-sm font-semibold transition-all focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 ${
                    isCollapsed ? 'justify-center p-2.5' : 'px-3.5 py-2.5'
                  } ${
                    isActive
                      ? 'bg-[#ececf4] dark:bg-[#242236] text-[#7372A5] dark:text-[#a1a0d3] font-bold border-l-4 border-[#7372A5] dark:border-[#a1a0d3] pl-2.5'
                      : 'text-gray-600 dark:text-gray-300 hover:bg-[#ececf4]/60 dark:hover:bg-[#242236]/60 hover:text-[#7372A5] dark:hover:text-[#a1a0d3]'
                  }`}
                >
                  <span
                    className={`material-symbols-outlined text-xl ${
                      isActive ? 'text-[#7372A5] dark:text-[#a1a0d3]' : 'text-gray-400 dark:text-gray-400'
                    }`}
                  >
                    {item.icon}
                  </span>
                  {!isCollapsed && <span>{item.label}</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer: Account Menu */}
        <div className="border-t border-[#ececf4] dark:border-[#252436] pt-4 mt-auto overflow-visible">
          <AccountMenu
            userProfile={userProfile}
            isGuest={isGuest}
            collapsed={isCollapsed}
            currentTheme={currentTheme}
            onThemeChange={onThemeChange}
            onNavigate={setCurrentView}
            onSignOut={onSignOut}
          />
        </div>
      </aside>
    </>
  );
};
