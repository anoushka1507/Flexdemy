import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ViewMode, UserProfile, ThemeMode } from '../types';

interface AccountMenuProps {
  userProfile: UserProfile;
  isGuest: boolean;
  collapsed?: boolean;
  currentTheme: ThemeMode;
  dyslexiaMode?: boolean;
  onThemeChange: (theme: ThemeMode) => void;
  onNavigate: (view: ViewMode) => void;
  onSignOut: () => Promise<void>;
}

export const AccountMenu: React.FC<AccountMenuProps> = ({
  userProfile,
  isGuest,
  collapsed = false,
  currentTheme,
  dyslexiaMode = false,
  onThemeChange,
  onNavigate,
  onSignOut,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  // Compute initials fallback
  const getInitials = (name?: string, email?: string): string => {
    const raw = (name || '').trim() || (email ? email.split('@')[0] : 'ST');
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  };

  const displayName = isGuest
    ? 'Guest Learner'
    : userProfile.name?.trim() || (userProfile.email ? userProfile.email.split('@')[0] : 'Learner');

  const displayRole = isGuest ? 'Guest Session' : userProfile.role || 'Student';
  const initials = getInitials(userProfile.name, userProfile.email);

  // Click outside to close
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Escape to close
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOpen(false);
        buttonRef.current?.focus();
      }
    },
    []
  );

  const handleSelectView = (view: ViewMode) => {
    onNavigate(view);
    setIsOpen(false);
  };

  const handleSignOutClick = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsOpen(false);
    await onSignOut();
  };

  return (
    <div
      ref={menuRef}
      onKeyDown={handleKeyDown}
      className="relative w-full overflow-visible"
    >
      {/* Dropdown Menu Anchored Above Footer */}
      {isOpen && (
        <div
          role="menu"
          aria-orientation="vertical"
          aria-labelledby="account-menu-button"
          className={`absolute z-50 mb-2 rounded-2xl bg-white dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] shadow-xl p-2 animate-in fade-in zoom-in-95 duration-150 ${
            collapsed
              ? 'left-full ml-3 bottom-0 w-64'
              : 'bottom-full left-0 right-0 w-full min-w-[240px]'
          }`}
        >
          {/* User Header Summary */}
          <div className="px-3 py-2.5 mb-1.5 border-b border-[#ececf4] dark:border-[#252436]">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center font-bold text-xs border border-[#d8d7e8] dark:border-[#312f45]">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8] truncate">
                  {displayName}
                </p>
                <p className="text-[11px] text-gray-400 dark:text-gray-400 truncate">
                  {userProfile.email || (isGuest ? 'Temporary local session' : 'Signed in')}
                </p>
              </div>
            </div>
          </div>

          {/* Navigation Options */}
          <div className="space-y-0.5">
            <button
              role="menuitem"
              onClick={() => handleSelectView('profile')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#252436] hover:text-[#7372A5] dark:hover:text-[#a1a0d3] transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
            >
              <span className="material-symbols-outlined text-lg text-gray-400 dark:text-gray-400">
                person
              </span>
              <span>Profile</span>
            </button>

            <button
              role="menuitem"
              onClick={() => handleSelectView('settings')}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-gray-700 dark:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#252436] hover:text-[#7372A5] dark:hover:text-[#a1a0d3] transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
            >
              <span className="material-symbols-outlined text-lg text-gray-400 dark:text-gray-400">
                settings
              </span>
              <span>Settings</span>
            </button>
          </div>

          {/* Theme Quick Selector */}
          <div className="my-2 pt-2 border-t border-[#ececf4] dark:border-[#252436] px-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400 dark:text-gray-400 mb-1.5 px-1">
              Appearance
            </p>
            {dyslexiaMode ? (
              <div className="bg-[#ececf4] dark:bg-[#1f1d2e] p-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] text-[11px] text-[#222138] dark:text-[#f2f1f8] leading-tight">
                <span className="font-bold text-[#7372A5] dark:text-[#a1a0d3] block mb-1">
                  Dyslexia Mode Active
                </span>
                Theme is locked to High-Readability Light. Turn off Dyslexia Mode in Settings or Sidebar to switch themes.
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-1 bg-[#ececf4] dark:bg-[#12111d] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => onThemeChange('light')}
                  title="Light Theme"
                  className={`flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    currentTheme === 'light'
                      ? 'bg-white dark:bg-[#222138] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">light_mode</span>
                  <span>Light</span>
                </button>

                <button
                  type="button"
                  onClick={() => onThemeChange('dark')}
                  title="Dark Theme"
                  className={`flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    currentTheme === 'dark'
                      ? 'bg-white dark:bg-[#222138] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">dark_mode</span>
                  <span>Dark</span>
                </button>

                <button
                  type="button"
                  onClick={() => onThemeChange('system')}
                  title="System Theme"
                  className={`flex items-center justify-center gap-1 py-1 rounded-lg text-[11px] font-bold transition-all ${
                    currentTheme === 'system'
                      ? 'bg-white dark:bg-[#222138] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                      : 'text-gray-500 hover:text-gray-800 dark:text-gray-400 dark:hover:text-gray-200'
                  }`}
                >
                  <span className="material-symbols-outlined text-sm">desktop_windows</span>
                  <span>Auto</span>
                </button>
              </div>
            )}
          </div>

          {/* Sign Out Action */}
          <div className="pt-1.5 border-t border-[#ececf4] dark:border-[#252436]">
            <button
              role="menuitem"
              onClick={handleSignOutClick}
              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-rose-500/40"
            >
              <span className="material-symbols-outlined text-lg">logout</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {/* Main Account Row Container */}
      <div className="flex items-center justify-between p-1.5 rounded-2xl hover:bg-[#ececf4]/60 dark:hover:bg-[#222033] transition-colors border border-transparent hover:border-[#d8d7e8] dark:hover:border-[#312f45] group">
        {/* Clickable Profile Info Button */}
        <button
          ref={buttonRef}
          id="account-menu-button"
          aria-haspopup="true"
          aria-expanded={isOpen}
          onClick={() => setIsOpen((prev) => !prev)}
          className={`flex items-center gap-2.5 text-left rounded-xl focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 transition-all ${
            collapsed ? 'justify-center p-1 w-full' : 'flex-1 p-1 min-w-0'
          }`}
        >
          {/* Avatar or Initials Badge */}
          <div className="w-9 h-9 rounded-full bg-[#ececf4] dark:bg-[#242236] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center font-bold text-xs border border-[#d8d7e8] dark:border-[#312f45] shrink-0 shadow-2xs">
            {initials}
          </div>

          {!collapsed && (
            <div className="min-w-0 flex-1 text-left">
              <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8] group-hover:text-[#7372A5] dark:group-hover:text-[#a1a0d3] truncate leading-tight">
                {displayName}
              </p>
              <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate mt-0.5">
                {displayRole}
              </p>
            </div>
          )}
        </button>

        {/* Dedicated Icon-Only Logout Shortcut (NO visible 'Logout' text) */}
        {!collapsed && (
          <button
            type="button"
            onClick={handleSignOutClick}
            aria-label="Sign out"
            title="Sign out"
            className="p-2 rounded-xl text-gray-400 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500/40"
          >
            <span className="material-symbols-outlined text-lg leading-none">
              logout
            </span>
          </button>
        )}
      </div>
    </div>
  );
};
