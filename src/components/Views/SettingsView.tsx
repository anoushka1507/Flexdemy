import React, { useState } from 'react';
import { UserProfile, UserSettings, ThemeMode, DYSLEXIA_DEFAULTS } from '../../types';
import { supabase } from '../../supabaseClient';
import { apiFetch } from '../../utils/api';

interface SettingsViewProps {
  settings: UserSettings;
  onUpdateSettings: (newSettings: Partial<UserSettings>) => Promise<boolean>;
  userProfile: UserProfile;
  isGuest: boolean;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onSignOut: () => Promise<void>;
  onResetLearningData: () => Promise<boolean>;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  settings,
  onUpdateSettings,
  userProfile,
  isGuest,
  onShowToast,
  onSignOut,
  onResetLearningData,
}) => {
  const [activeTab, setActiveTab] = useState<'appearance' | 'learning' | 'account'>('appearance');

  // Appearance & Accessibility local states
  const [theme, setTheme] = useState<ThemeMode>(settings.theme || 'system');
  const [dyslexiaMode, setDyslexiaMode] = useState<boolean>(settings.dyslexiaMode || false);
  const [speechRate, setSpeechRate] = useState<number>(settings.speechRate || 1.0);
  const [speechPitch, setSpeechPitch] = useState<number>(settings.speechPitch || 1.0);
  const [reducedMotion, setReducedMotion] = useState<boolean>(settings.reducedMotion || false);
  const [fontSize, setFontSize] = useState<'standard' | 'large'>(settings.fontSize || 'standard');
  const [dyslexiaFont, setDyslexiaFont] = useState<'standard' | 'lexend'>(
    settings.dyslexiaFont || DYSLEXIA_DEFAULTS.dyslexiaFont
  );
  const [dyslexiaTextSize, setDyslexiaTextSize] = useState<number>(
    settings.dyslexiaTextSize ?? DYSLEXIA_DEFAULTS.dyslexiaTextSize
  );
  const [dyslexiaLineSpacing, setDyslexiaLineSpacing] = useState<number>(
    settings.dyslexiaLineSpacing ?? DYSLEXIA_DEFAULTS.dyslexiaLineSpacing
  );
  const [dyslexiaLetterSpacing, setDyslexiaLetterSpacing] = useState<number>(
    settings.dyslexiaLetterSpacing ?? DYSLEXIA_DEFAULTS.dyslexiaLetterSpacing
  );
  const [dyslexiaBackground, setDyslexiaBackground] = useState<'warm' | 'soft-white' | 'mint'>(
    settings.dyslexiaBackground || DYSLEXIA_DEFAULTS.dyslexiaBackground
  );

  // Learning preferences local states
  const [explanationLanguage, setExplanationLanguage] = useState<'english' | 'hindi'>(
    settings.explanationLanguage || 'english'
  );
  const [explanationStyle, setExplanationStyle] = useState<'concise' | 'step-by-step' | 'example-first'>(
    settings.explanationStyle || 'concise'
  );
  const [dailyStudyMinutes, setDailyStudyMinutes] = useState<number>(settings.dailyStudyMinutes || 45);
  const [examDate, setExamDate] = useState<string>(settings.examDate || '');
  const [weakTopicInterval, setWeakTopicInterval] = useState<'daily' | 'before_quiz' | 'weekly'>(
    settings.weakTopicInterval || 'daily'
  );

  // Password management states
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordUpdating, setPasswordUpdating] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Reset confirmation modal state
  const [showResetModal, setShowResetModal] = useState(false);
  const [isResetting, setIsResetting] = useState(false);

  // Save states
  const [isSaving, setIsSaving] = useState(false);

  // Test Speech Synthesis
  const handleTestSpeech = () => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const text =
        explanationLanguage === 'hindi'
          ? 'नमस्ते! यह फ्लेक्सडेमी का स्पीच टेस्ट है।'
          : 'Hello! This is your customized Flexdemy read-aloud speed and pitch test.';
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = speechRate;
      utterance.pitch = speechPitch;
      window.speechSynthesis.speak(utterance);
    } else {
      onShowToast('Speech synthesis is not supported on this browser.', 'info');
    }
  };

  // Immediate setting dispatcher
  const handleApplySetting = async (updated: Partial<UserSettings>) => {
    setIsSaving(true);
    try {
      const ok = await onUpdateSettings(updated);
      if (ok) {
        onShowToast('Setting saved', 'success');
      } else {
        onShowToast('Could not save setting to cloud', 'error');
      }
    } catch {
      onShowToast('Could not save setting', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetDyslexiaDefaults = () => {
    setDyslexiaFont(DYSLEXIA_DEFAULTS.dyslexiaFont);
    setDyslexiaTextSize(DYSLEXIA_DEFAULTS.dyslexiaTextSize);
    setDyslexiaLineSpacing(DYSLEXIA_DEFAULTS.dyslexiaLineSpacing);
    setDyslexiaLetterSpacing(DYSLEXIA_DEFAULTS.dyslexiaLetterSpacing);
    setDyslexiaBackground(DYSLEXIA_DEFAULTS.dyslexiaBackground);
    handleApplySetting({ ...DYSLEXIA_DEFAULTS });
  };

  // Password change handler
  const handleUpdatePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 6) {
      setPasswordStatus({ type: 'error', message: 'Password must be at least 6 characters.' });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: 'error', message: 'Passwords do not match.' });
      return;
    }

    setPasswordUpdating(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) {
        setPasswordStatus({ type: 'error', message: error.message });
        onShowToast(error.message, 'error');
      } else {
        setPasswordStatus({ type: 'success', message: 'Password updated successfully!' });
        onShowToast('Password updated successfully', 'success');
        setNewPassword('');
        setConfirmPassword('');
      }
    } catch (err: any) {
      setPasswordStatus({ type: 'error', message: err.message || 'Failed to update password.' });
      onShowToast('Failed to update password', 'error');
    } finally {
      setPasswordUpdating(false);
    }
  };

  // Reset learning data handler
  const handleConfirmReset = async () => {
    setIsResetting(true);
    try {
      const ok = await onResetLearningData();
      if (ok) {
        onShowToast('Learning history and mastery reset.', 'success');
        setShowResetModal(false);
      } else {
        onShowToast('Failed to reset learning data.', 'error');
      }
    } catch (err: any) {
      onShowToast(err.message || 'Error resetting learning data', 'error');
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-left animate-in fade-in duration-200">
      {/* Settings Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
        <div>
          <h1 className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] tracking-tight">
            Settings & Preferences
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Customize your visual theme, reading tools, AI tutor style, and account security.
          </p>
        </div>

        {/* Tab Pills */}
        <div className="flex items-center gap-1 bg-[#ececf4] dark:bg-[#201e30] p-1 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45]">
          <button
            onClick={() => setActiveTab('appearance')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'appearance'
                ? 'bg-white dark:bg-[#161522] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Appearance
          </button>
          <button
            onClick={() => setActiveTab('learning')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'learning'
                ? 'bg-white dark:bg-[#161522] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Learning
          </button>
          <button
            onClick={() => setActiveTab('account')}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all ${
              activeTab === 'account'
                ? 'bg-white dark:bg-[#161522] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
            }`}
          >
            Account
          </button>
        </div>
      </div>

      {/* ========================================================
          TAB 1: APPEARANCE & ACCESSIBILITY
      ======================================================== */}
      {activeTab === 'appearance' && (
        <div className="space-y-6">
          {/* Theme Mode Selector */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                Color Scheme & Theme
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Choose between Light mode, dark mode, or follow your operating system automatically.
              </p>
            </div>

            {dyslexiaMode && (
              <div className="p-3 rounded-2xl bg-[#ececf4] dark:bg-[#1f1d2e] border border-[#d8d7e8] dark:border-[#312f45] text-xs text-[#222138] dark:text-[#f2f1f8] flex items-center gap-2.5">
                <span className="material-symbols-outlined text-[#7372A5] dark:text-[#a1a0d3] text-lg">info</span>
                <span>
                  Theme selection is locked to High-Readability Light while <strong>Dyslexia Mode</strong> is active. Turn off Dyslexia Mode below to choose Dark or System theme.
                </span>
              </div>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                disabled={dyslexiaMode}
                onClick={() => {
                  setTheme('light');
                  handleApplySetting({ theme: 'light' });
                }}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 ${
                  dyslexiaMode
                    ? 'opacity-60 cursor-not-allowed border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4]/40'
                    : theme === 'light'
                    ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] ring-2 ring-[#7372A5]/30'
                    : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-amber-500 text-xl">light_mode</span>
                  {theme === 'light' && (
                    <span className="material-symbols-outlined text-sm text-[#7372A5] dark:text-[#a1a0d3]">
                      check_circle
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">Light</p>
                  <p className="text-[11px] text-gray-400">Crisp, high-clarity daylight theme</p>
                </div>
              </button>

              <button
                type="button"
                disabled={dyslexiaMode}
                onClick={() => {
                  setTheme('dark');
                  handleApplySetting({ theme: 'dark' });
                }}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 ${
                  dyslexiaMode
                    ? 'opacity-60 cursor-not-allowed border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4]/40'
                    : theme === 'dark'
                    ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] ring-2 ring-[#7372A5]/30'
                    : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-indigo-400 text-xl">dark_mode</span>
                  {theme === 'dark' && (
                    <span className="material-symbols-outlined text-sm text-[#7372A5] dark:text-[#a1a0d3]">
                      check_circle
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">Dark</p>
                  <p className="text-[11px] text-gray-400">Sleek, low-glare evening theme</p>
                </div>
              </button>

              <button
                type="button"
                disabled={dyslexiaMode}
                onClick={() => {
                  setTheme('system');
                  handleApplySetting({ theme: 'system' });
                }}
                className={`p-4 rounded-2xl border text-left transition-all flex flex-col justify-between h-24 ${
                  dyslexiaMode
                    ? 'opacity-60 cursor-not-allowed border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4]/40'
                    : theme === 'system'
                    ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] ring-2 ring-[#7372A5]/30'
                    : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] hover:border-gray-400'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="material-symbols-outlined text-gray-400 text-xl">desktop_windows</span>
                  {theme === 'system' && (
                    <span className="material-symbols-outlined text-sm text-[#7372A5] dark:text-[#a1a0d3]">
                      check_circle
                    </span>
                  )}
                </div>
                <div>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">System</p>
                  <p className="text-[11px] text-gray-400">Sync with your device appearance</p>
                </div>
              </button>
            </div>
          </div>

          {/* Accessibility Settings (Dyslexia Mode & Reduced Motion) */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-5">
            <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
              Accessibility & Typography
            </h2>

            {/* Dyslexia Mode Switch */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#7372A5] dark:text-[#a1a0d3] text-lg">
                    visibility
                  </span>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                    Dyslexia-Friendly Mode
                  </p>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-md">
                  Enhances letter spacing, word spacing, and activates a high-contrast monochrome palette designed for reading ease.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={dyslexiaMode}
                onClick={() => {
                  const val = !dyslexiaMode;
                  setDyslexiaMode(val);
                  handleApplySetting({ dyslexiaMode: val });
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  dyslexiaMode ? 'bg-[#7372A5]' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    dyslexiaMode ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Adjustable Dyslexia Mode reading preferences — only shown
                once the mode is on, since they only affect it. Not every
                dyslexic reader wants the same font/spacing/background,
                so each is independently adjustable. */}
            {dyslexiaMode && (
              <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] space-y-5">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                    Reading Preferences
                  </p>
                  <button
                    type="button"
                    onClick={handleResetDyslexiaDefaults}
                    className="text-[11px] font-bold text-[#7372A5] dark:text-[#a1a0d3] hover:underline"
                  >
                    Reset to defaults
                  </button>
                </div>

                {/* Font */}
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1.5">
                    Font
                  </label>
                  <div className="flex gap-2">
                    {([
                      { id: 'standard', label: 'Standard (Atkinson Hyperlegible)' },
                      { id: 'lexend', label: 'Lexend' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDyslexiaFont(opt.id);
                          handleApplySetting({ dyslexiaFont: opt.id });
                        }}
                        className={`px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                          dyslexiaFont === opt.id
                            ? 'bg-[#7372A5] text-white border-[#7372A5]'
                            : 'bg-white dark:bg-[#1e1d2c] text-[#222138] dark:text-[#f2f1f8] border-[#d8d7e8] dark:border-[#312f45]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Text size */}
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1.5">
                    Text size — {dyslexiaTextSize}px
                  </label>
                  <input
                    type="range"
                    min={15}
                    max={24}
                    step={1}
                    value={dyslexiaTextSize}
                    onChange={(e) => setDyslexiaTextSize(Number(e.target.value))}
                    onMouseUp={() => handleApplySetting({ dyslexiaTextSize })}
                    onTouchEnd={() => handleApplySetting({ dyslexiaTextSize })}
                    className="w-full accent-[#7372A5]"
                  />
                </div>

                {/* Line spacing */}
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1.5">
                    Line spacing — {dyslexiaLineSpacing.toFixed(2)}
                  </label>
                  <input
                    type="range"
                    min={1.3}
                    max={2.2}
                    step={0.05}
                    value={dyslexiaLineSpacing}
                    onChange={(e) => setDyslexiaLineSpacing(Number(e.target.value))}
                    onMouseUp={() => handleApplySetting({ dyslexiaLineSpacing })}
                    onTouchEnd={() => handleApplySetting({ dyslexiaLineSpacing })}
                    className="w-full accent-[#7372A5]"
                  />
                </div>

                {/* Letter spacing */}
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1.5">
                    Letter spacing — {dyslexiaLetterSpacing.toFixed(3)}em
                  </label>
                  <input
                    type="range"
                    min={0}
                    max={0.08}
                    step={0.005}
                    value={dyslexiaLetterSpacing}
                    onChange={(e) => setDyslexiaLetterSpacing(Number(e.target.value))}
                    onMouseUp={() => handleApplySetting({ dyslexiaLetterSpacing })}
                    onTouchEnd={() => handleApplySetting({ dyslexiaLetterSpacing })}
                    className="w-full accent-[#7372A5]"
                  />
                </div>

                {/* Background theme */}
                <div>
                  <label className="text-[11px] font-bold text-gray-600 dark:text-gray-400 block mb-1.5">
                    Background
                  </label>
                  <div className="flex gap-2">
                    {([
                      { id: 'warm', label: 'Warm off-white', swatch: '#faf6ef' },
                      { id: 'soft-white', label: 'Soft white', swatch: '#f7f7f5' },
                      { id: 'mint', label: 'Pale mint', swatch: '#eef5f0' },
                    ] as const).map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setDyslexiaBackground(opt.id);
                          handleApplySetting({ dyslexiaBackground: opt.id });
                        }}
                        title={opt.label}
                        className={`flex items-center gap-2 px-3 py-2 rounded-xl text-[11px] font-bold border transition-all ${
                          dyslexiaBackground === opt.id
                            ? 'border-[#7372A5] ring-2 ring-[#7372A5]/30'
                            : 'border-[#d8d7e8] dark:border-[#312f45]'
                        }`}
                        style={{ backgroundColor: opt.swatch, color: '#2b2420' }}
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Reduced Motion Switch */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#7372A5] dark:text-[#a1a0d3] text-lg">
                    motion_photos_off
                  </span>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                    Reduced Motion
                  </p>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400 max-w-md">
                  Disables page animations and transitions for improved comfort and vestibular safety.
                </p>
              </div>

              <button
                type="button"
                role="switch"
                aria-checked={reducedMotion}
                onClick={() => {
                  const val = !reducedMotion;
                  setReducedMotion(val);
                  handleApplySetting({ reducedMotion: val });
                }}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out ${
                  reducedMotion ? 'bg-[#7372A5]' : 'bg-gray-300 dark:bg-gray-700'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    reducedMotion ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>

            {/* Font Size Option */}
            <div className="flex items-center justify-between p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-[#7372A5] dark:text-[#a1a0d3] text-lg">
                    format_size
                  </span>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                    Text Size
                  </p>
                </div>
                <p className="text-[11px] text-gray-500 dark:text-gray-400">
                  Scale application text for optimal viewing distance.
                </p>
              </div>

              <div className="flex items-center gap-1 bg-[#ececf4] dark:bg-[#201e30] p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => {
                    setFontSize('standard');
                    handleApplySetting({ fontSize: 'standard' });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    fontSize === 'standard'
                      ? 'bg-white dark:bg-[#161522] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Standard
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setFontSize('large');
                    handleApplySetting({ fontSize: 'large' });
                  }}
                  className={`px-3 py-1 rounded-lg text-xs font-bold transition-all ${
                    fontSize === 'large'
                      ? 'bg-white dark:bg-[#161522] text-[#7372A5] dark:text-[#a1a0d3] shadow-xs'
                      : 'text-gray-600 dark:text-gray-400'
                  }`}
                >
                  Large (110%)
                </button>
              </div>
            </div>
          </div>

          {/* Read-Aloud Speech Customization */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-5">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                  Read-Aloud Speech Controls
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Tune voice speed and pitch for quiz audio narration and revision notes.
                </p>
              </div>

              <button
                type="button"
                onClick={handleTestSpeech}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-[#7372A5] dark:text-[#a1a0d3] text-xs font-bold transition-colors"
              >
                <span className="material-symbols-outlined text-base">volume_up</span>
                <span>Test Voice</span>
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Rate Slider */}
              <div className="space-y-2 p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-700 dark:text-gray-300">Speech Rate</span>
                  <span className="text-[#7372A5] dark:text-[#a1a0d3]">{speechRate.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.75"
                  max="1.5"
                  step="0.05"
                  value={speechRate}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSpeechRate(val);
                    handleApplySetting({ speechRate: val });
                  }}
                  className="w-full accent-[#7372A5] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>0.75x (Slower)</span>
                  <span>1.0x (Normal)</span>
                  <span>1.5x (Faster)</span>
                </div>
              </div>

              {/* Pitch Slider */}
              <div className="space-y-2 p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
                <div className="flex items-center justify-between text-xs font-bold">
                  <span className="text-gray-700 dark:text-gray-300">Voice Pitch</span>
                  <span className="text-[#7372A5] dark:text-[#a1a0d3]">{speechPitch.toFixed(2)}x</span>
                </div>
                <input
                  type="range"
                  min="0.8"
                  max="1.2"
                  step="0.05"
                  value={speechPitch}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setSpeechPitch(val);
                    handleApplySetting({ speechPitch: val });
                  }}
                  className="w-full accent-[#7372A5] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-gray-400">
                  <span>Lower</span>
                  <span>Default</span>
                  <span>Higher</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 2: LEARNING PREFERENCES
      ======================================================== */}
      {activeTab === 'learning' && (
        <div className="space-y-6">
          {/* Language & Tutor Explanation Style */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-6">
            <div>
              <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                AI Tutor & Grounded Explanations
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                These preferences configure how the AI tutor clarifies misconceptions and answers your questions.
              </p>
            </div>

            {/* Language Selection */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                Explanation Language
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setExplanationLanguage('english');
                    handleApplySetting({ explanationLanguage: 'english' });
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    explanationLanguage === 'english'
                      ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] ring-2 ring-[#7372A5]/30'
                      : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926]'
                  }`}
                >
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">English (Standard)</p>
                  <p className="text-[11px] text-gray-400">Clear English technical explanations and citations</p>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setExplanationLanguage('hindi');
                    handleApplySetting({ explanationLanguage: 'hindi' });
                  }}
                  className={`p-3.5 rounded-2xl border text-left transition-all ${
                    explanationLanguage === 'hindi'
                      ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] ring-2 ring-[#7372A5]/30'
                      : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926]'
                  }`}
                >
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">Hinglish (Hindi + English)</p>
                  <p className="text-[11px] text-gray-400">Conversational Hinglish explanations of source material</p>
                </button>
              </div>
            </div>

            {/* Answer Style */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                Tutor Explanation Style
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {(['concise', 'step-by-step', 'example-first'] as const).map((style) => (
                  <button
                    key={style}
                    type="button"
                    onClick={() => {
                      setExplanationStyle(style);
                      handleApplySetting({ explanationStyle: style });
                    }}
                    className={`p-3.5 rounded-2xl border text-left transition-all ${
                      explanationStyle === style
                        ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] ring-2 ring-[#7372A5]/30'
                        : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926]'
                    }`}
                  >
                    <p className="text-xs font-bold capitalize text-[#222138] dark:text-[#f2f1f8]">
                      {style.replace('-', ' ')}
                    </p>
                    <p className="text-[11px] text-gray-400">
                      {style === 'concise'
                        ? 'Direct, bulleted answers'
                        : style === 'step-by-step'
                        ? 'Sequential logical progression'
                        : 'Real-world practical examples first'}
                    </p>
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Study Schedule & Exam Targets */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-5">
            <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
              Daily Target & Exam Date
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              {/* Daily Study Minutes */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  Daily Study Goal
                </label>
                <div className="grid grid-cols-4 gap-2">
                  {[15, 30, 45, 60].map((mins) => (
                    <button
                      key={mins}
                      type="button"
                      onClick={() => {
                        setDailyStudyMinutes(mins);
                        handleApplySetting({ dailyStudyMinutes: mins });
                      }}
                      className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                        dailyStudyMinutes === mins
                          ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#7372A5] text-white'
                          : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {mins}m
                    </button>
                  ))}
                </div>
              </div>

              {/* Exam Date */}
              <div className="space-y-2">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  Target Exam Date (Optional)
                </label>
                <input
                  type="date"
                  value={examDate}
                  onChange={(e) => {
                    setExamDate(e.target.value);
                    handleApplySetting({ examDate: e.target.value });
                  }}
                  className="w-full px-3.5 py-2 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
                />
              </div>
            </div>

            {/* Weak Topic Practice Cadence */}
            <div className="space-y-2 pt-2 border-t border-[#ececf4] dark:border-[#252436]">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                Weak Topic Practice Prompts
              </label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'daily', label: 'Daily Review' },
                  { id: 'before_quiz', label: 'Before Each Quiz' },
                  { id: 'weekly', label: 'Weekly Summary' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setWeakTopicInterval(item.id as any);
                      handleApplySetting({ weakTopicInterval: item.id as any });
                    }}
                    className={`py-2 rounded-xl border text-xs font-bold transition-all ${
                      weakTopicInterval === item.id
                        ? 'border-[#7372A5] dark:border-[#a1a0d3] bg-[#ececf4]/60 dark:bg-[#252338] text-[#7372A5] dark:text-[#a1a0d3]'
                        : 'border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================
          TAB 3: ACCOUNT & PRIVACY
      ======================================================== */}
      {activeTab === 'account' && (
        <div className="space-y-6">
          {/* Account Overview Card */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
            <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
              Account Overview
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Email
                </span>
                <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8] truncate">
                  {userProfile.email || 'guest@flexdemy.local'}
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45]">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block mb-1">
                  Status
                </span>
                <p className="text-xs font-bold text-emerald-600 dark:text-emerald-400">
                  {isGuest ? 'Guest Session' : 'Active Account (Authenticated)'}
                </p>
              </div>
            </div>
          </div>

          {/* Change Password Card */}
          {!isGuest && (
            <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
              <div>
                <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                  Change Password
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Update your authentication credentials securely via Supabase.
                </p>
              </div>

              {passwordStatus && (
                <div
                  className={`p-3 rounded-xl text-xs font-semibold flex items-center gap-2 ${
                    passwordStatus.type === 'success'
                      ? 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/30'
                      : 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border border-rose-500/30'
                  }`}
                >
                  <span className="material-symbols-outlined text-base">
                    {passwordStatus.type === 'success' ? 'check_circle' : 'error'}
                  </span>
                  <span>{passwordStatus.message}</span>
                </div>
              )}

              <form onSubmit={handleUpdatePassword} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                      New Password
                    </label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      disabled={passwordUpdating}
                      className="w-full px-3.5 py-2 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                      Confirm New Password
                    </label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Repeat new password"
                      disabled={passwordUpdating}
                      className="w-full px-3.5 py-2 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40"
                    />
                  </div>
                </div>

                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={passwordUpdating || !newPassword}
                    className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
                  >
                    {passwordUpdating ? 'Updating...' : 'Update Password'}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* Learning Data Transparency & Reset */}
          <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
            <div>
              <h2 className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                Data Transparency & Privacy
              </h2>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                Understand what learning data Flexdemy stores to personalize your quizzes.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] text-xs space-y-2 text-gray-600 dark:text-gray-300">
              <p className="font-semibold text-[#222138] dark:text-[#f2f1f8]">
                Data Saved on Your Account:
              </p>
              <ul className="list-disc list-inside space-y-1 text-[11px] text-gray-500 dark:text-gray-400">
                <li>Quiz attempt records, scores, and completion timestamps.</li>
                <li>Topic mastery and progress records.</li>
                <li>Extracted concepts and topic connections for your learning path.</li>
                <li>Saved learning paths and revision notes.</li>
                <li>Uploaded study materials and citations.</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2">
              <div>
                <p className="text-xs font-bold text-rose-600 dark:text-rose-400">
                  Reset Practice Data
                </p>
                <p className="text-[11px] text-gray-400">
                  Clear quiz history, mastery records, and uploaded material while keeping your login account.
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowResetModal(true)}
                className="px-3.5 py-2 rounded-xl border border-rose-300 dark:border-rose-900 bg-rose-50 dark:bg-rose-950/20 text-rose-600 dark:text-rose-400 font-bold text-xs hover:bg-rose-100 dark:hover:bg-rose-900/30 transition-colors shrink-0"
              >
                Reset Learning History
              </button>
            </div>
          </div>

          {/* Sign Out Shortcut Card */}
          <div className="p-6 rounded-3xl bg-white dark:bg-[#161522] border border-[#d8d7e8] dark:border-[#312f45] shadow-xs flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">Sign Out of Session</p>
              <p className="text-[11px] text-gray-400">
                Safely end your session. All saved quizzes and mastery will remain intact.
              </p>
            </div>

            <button
              onClick={onSignOut}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-rose-50 dark:hover:bg-rose-950/30 text-gray-700 hover:text-rose-600 dark:text-gray-200 dark:hover:text-rose-400 font-bold text-xs transition-colors"
            >
              <span className="material-symbols-outlined text-base">logout</span>
              <span>Sign out</span>
            </button>
          </div>
        </div>
      )}

      {/* Reset Confirmation Modal */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-xs"
            onClick={() => setShowResetModal(false)}
          />
          <div className="relative bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-2xl p-6 max-w-md w-full space-y-4 z-10 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center gap-3 text-rose-600 dark:text-rose-400">
              <div className="w-10 h-10 rounded-2xl bg-rose-100 dark:bg-rose-950/40 flex items-center justify-center">
                <span className="material-symbols-outlined text-2xl">warning</span>
              </div>
              <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
                Reset Learning Data?
              </h3>
            </div>

            <p className="text-xs text-gray-500 dark:text-gray-400 leading-relaxed">
              This action will permanently delete all completed quiz scores, topic mastery records, and uploaded course materials from your account. Your user login will remain active.
            </p>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setShowResetModal(false)}
                className="px-4 py-2 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4] dark:bg-[#242236] text-gray-700 dark:text-gray-200 font-bold text-xs hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleConfirmReset}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs transition-colors disabled:opacity-50"
              >
                {isResetting ? 'Resetting...' : 'Yes, Reset My Data'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
