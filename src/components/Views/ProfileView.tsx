import React, { useState, useEffect } from 'react';
import { UserProfile, ViewMode } from '../../types';
import { SavedLearningPathData } from '../CourseFlowMapModal';
import { apiFetch } from '../../utils/api';

interface ProfileViewProps {
  userProfile: UserProfile;
  onUpdateProfile: (updated: Partial<UserProfile>) => Promise<boolean>;
  isGuest: boolean;
  onShowToast: (message: string, type?: 'success' | 'error' | 'info') => void;
  onNavigate: (view: ViewMode) => void;
  onOpenLearningPath?: (path: SavedLearningPathData) => void;
  onOpenUploadModal?: () => void;
  recentHistory?: Array<{
    id: string;
    title: string;
    topic: string;
    score: number;
    date: string;
    icon: string;
    difficulty: string;
  }>;
  onOpenQuizResult?: (quizId: string) => void;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  userProfile,
  onUpdateProfile,
  isGuest,
  onShowToast,
  onNavigate,
  onOpenLearningPath,
  onOpenUploadModal,
  recentHistory = [],
  onOpenQuizResult,
}) => {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states
  const [name, setName] = useState(userProfile.name || '');
  const [institution, setInstitution] = useState(userProfile.institution || '');
  const [courseProgram, setCourseProgram] = useState(userProfile.courseProgram || '');
  const [studyGoal, setStudyGoal] = useState(userProfile.studyGoal || '');
  const [bio, setBio] = useState(userProfile.bio || '');
  const [avatarUrl, setAvatarUrl] = useState(userProfile.avatarUrl || '');

  // Saved learning paths state
  const [savedPaths, setSavedPaths] = useState<SavedLearningPathData[]>([]);
  const [loadingPaths, setLoadingPaths] = useState(false);

  const fetchSavedPaths = async () => {
    if (isGuest) return;
    setLoadingPaths(true);
    try {
      const res = await apiFetch('/api/learning-paths');
      if (res.ok) {
        const data = await res.json();
        setSavedPaths(data.learning_paths || []);
      }
    } catch {
      // ignore
    } finally {
      setLoadingPaths(false);
    }
  };

  useEffect(() => {
    fetchSavedPaths();
  }, [isGuest]);

  const handleDeletePath = async (id?: string) => {
    if (!id || !confirm('Are you sure you want to delete this saved learning path?')) return;
    try {
      const res = await apiFetch(`/api/learning-paths/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setSavedPaths((prev) => prev.filter((p) => p.id !== id));
        onShowToast('Learning path deleted', 'info');
      }
    } catch {
      onShowToast('Could not delete learning path', 'error');
    }
  };

  const handleRenamePath = async (path: SavedLearningPathData) => {
    const newTitle = prompt('Enter a new title for this learning path:', path.title);
    if (!newTitle || !newTitle.trim() || newTitle.trim() === path.title) return;
    try {
      const res = await apiFetch('/api/learning-paths', {
        method: 'POST',
        body: JSON.stringify({
          ...path,
          title: newTitle.trim(),
        }),
      });
      if (res.ok) {
        setSavedPaths((prev) =>
          prev.map((p) => (p.id === path.id ? { ...p, title: newTitle.trim() } : p))
        );
        onShowToast('Learning path renamed', 'success');
      }
    } catch {
      onShowToast('Could not rename learning path', 'error');
    }
  };

  // Keep state in sync with prop updates
  useEffect(() => {
    setName(userProfile.name || '');
    setInstitution(userProfile.institution || '');
    setCourseProgram(userProfile.courseProgram || '');
    setStudyGoal(userProfile.studyGoal || '');
    setBio(userProfile.bio || '');
    setAvatarUrl(userProfile.avatarUrl || '');
  }, [userProfile]);

  const getInitials = (val?: string): string => {
    const raw = (val || '').trim() || 'ST';
    const parts = raw.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return raw.slice(0, 2).toUpperCase();
  };

  const handleCancel = () => {
    setName(userProfile.name || '');
    setInstitution(userProfile.institution || '');
    setCourseProgram(userProfile.courseProgram || '');
    setStudyGoal(userProfile.studyGoal || '');
    setBio(userProfile.bio || '');
    setAvatarUrl(userProfile.avatarUrl || '');
    setErrorMessage(null);
    setIsEditing(false);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);

    const trimmedName = name.trim();
    if (!trimmedName) {
      setErrorMessage('Display name cannot be empty.');
      return;
    }

    setIsSaving(true);
    try {
      const success = await onUpdateProfile({
        name: trimmedName,
        institution: institution.trim(),
        courseProgram: courseProgram.trim(),
        studyGoal: studyGoal.trim(),
        bio: bio.trim(),
        avatarUrl: avatarUrl.trim(),
      });

      if (success) {
        setIsEditing(false);
        onShowToast('Profile updated successfully!', 'success');
      } else {
        setErrorMessage('Failed to save profile changes. Please try again.');
        onShowToast('Could not save profile changes', 'error');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while saving.');
      onShowToast('Could not save profile changes', 'error');
    } finally {
      setIsSaving(false);
    }
  };

  const formattedDate = userProfile.createdAt
    ? new Date(userProfile.createdAt).toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
      })
    : 'Active member';

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-left animate-in fade-in duration-200">
      {/* Header Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-[#7372A5] text-white flex items-center justify-center font-extrabold text-xl shadow-md border-2 border-white dark:border-[#222138]">
            {getInitials(name || userProfile.name)}
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] tracking-tight">
                {name || userProfile.name || 'Learner Profile'}
              </h1>
              <span className="text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] border border-[#d8d7e8] dark:border-[#312f45]">
                {isGuest ? 'Guest' : userProfile.role || 'Student'}
              </span>
            </div>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {userProfile.email || 'Guest learner profile'}
            </p>
          </div>
        </div>

        <div>
          {!isEditing ? (
            <button
              onClick={() => setIsEditing(true)}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors"
            >
              <span className="material-symbols-outlined text-base">edit</span>
              <span>Edit Profile</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCancel}
                disabled={isSaving}
                className="px-3 py-2 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4] dark:bg-[#242236] text-gray-700 dark:text-gray-200 hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] font-bold text-xs transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                form="profile-form"
                disabled={isSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <span className="material-symbols-outlined text-base animate-spin">
                      sync
                    </span>
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">check</span>
                    <span>Save Changes</span>
                  </>
                )}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Guest Mode Callout */}
      {isGuest && (
        <div className="p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 flex items-start gap-3">
          <span className="material-symbols-outlined text-xl shrink-0 mt-0.5">info</span>
          <div className="text-xs space-y-1">
            <p className="font-bold">You are browsing in guest mode</p>
            <p>
              Your learning profile and preferences will be kept in your browser storage. Sign in to sync your profile across devices and preserve your practice history in Supabase.
            </p>
          </div>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-700 dark:text-rose-300 flex items-center gap-2 text-xs font-semibold">
          <span className="material-symbols-outlined text-lg">error</span>
          <span>{errorMessage}</span>
        </div>
      )}

      <form id="profile-form" onSubmit={handleSave} className="space-y-6">
        {/* Profile Information Card */}
        <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-6">
          <div className="border-b border-[#ececf4] dark:border-[#252436] pb-3">
            <h2 className="text-base font-extrabold text-[#222138] dark:text-[#f2f1f8]">
              Personal Information
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Manage your identity and how your name is presented across quizzes and certificates.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Display Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                Display Name <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                disabled={!isEditing || isSaving}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your full name"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 disabled:opacity-75 disabled:cursor-not-allowed transition-all"
              />
            </div>

            {/* Email (Read-only) */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                  Email Address
                </label>
                <span className="text-[10px] text-gray-400 font-semibold flex items-center gap-1">
                  <span className="material-symbols-outlined text-xs">lock</span>
                  Managed by Supabase Auth
                </span>
              </div>
              <input
                type="email"
                disabled
                value={userProfile.email || 'guest@flexdemy.local'}
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#ececf4] dark:bg-[#201e30] text-gray-500 dark:text-gray-400 text-xs font-semibold cursor-not-allowed"
              />
            </div>

            {/* Institution / University */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                Institution or University
              </label>
              <input
                type="text"
                disabled={!isEditing || isSaving}
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. Stanford University or Self-Study"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 disabled:opacity-75 disabled:cursor-not-allowed transition-all"
              />
            </div>

            {/* Course / Program */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
                Course or Program
              </label>
              <input
                type="text"
                disabled={!isEditing || isSaving}
                value={courseProgram}
                onChange={(e) => setCourseProgram(e.target.value)}
                placeholder="e.g. Computer Science & Systems"
                className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 disabled:opacity-75 disabled:cursor-not-allowed transition-all"
              />
            </div>
          </div>

          {/* Primary Study Goal */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
              Primary Learning Goal
            </label>
            <input
              type="text"
              disabled={!isEditing || isSaving}
              value={studyGoal}
              onChange={(e) => setStudyGoal(e.target.value)}
              placeholder="e.g. Master Operating Systems & Pass Final Exams with Distinction"
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 disabled:opacity-75 disabled:cursor-not-allowed transition-all"
            />
          </div>

          {/* Bio / Notes */}
          <div className="space-y-1.5">
            <label className="text-xs font-bold text-gray-700 dark:text-gray-300 block">
              Short Bio or Study Focus
            </label>
            <textarea
              rows={3}
              disabled={!isEditing || isSaving}
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              placeholder="Describe your learning background, upcoming exams, or target topics..."
              className="w-full px-3.5 py-2.5 rounded-xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#fcf8ff] dark:bg-[#1a1926] text-[#222138] dark:text-[#f2f1f8] text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]/40 disabled:opacity-75 disabled:cursor-not-allowed transition-all resize-none"
            />
          </div>
        </div>
      </form>

      {/* Learning Metrics & Account Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-[#161522] p-5 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <span className="text-xs font-semibold text-gray-400 block mb-1">
            Quizzes Completed
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] block">
            {userProfile.totalQuizzesAttempted}
          </span>
          <span className="text-[11px] text-gray-500 dark:text-gray-400 mt-1 block">
            Across all adaptive topics
          </span>
        </div>

        <div className="bg-white dark:bg-[#161522] p-5 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <span className="text-xs font-semibold text-gray-400 block mb-1">
            Average Score
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] block">
            {userProfile.averageScore}%
          </span>
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 mt-1 block">
            Best: {userProfile.bestScore}%
          </span>
        </div>

        <div className="bg-white dark:bg-[#161522] p-5 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <span className="text-xs font-semibold text-gray-400 block mb-1">
            Member Since
          </span>
          <span className="text-base font-bold text-[#222138] dark:text-[#f2f1f8] block mt-1">
            {formattedDate}
          </span>
        </div>
      </div>

      {/* ========================================================
          COMPLETED QUIZ ATTEMPTS HISTORY
      ======================================================== */}
      <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-extrabold text-[#222138] dark:text-[#f2f1f8]">
              Completed Quiz History
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Your persistent record of completed adaptive and practice quizzes.
            </p>
          </div>
          <button
            onClick={() => onNavigate('latest-results')}
            className="px-3 py-1.5 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 text-xs font-bold transition-all flex items-center gap-1 border border-[#d8d7e8] dark:border-[#312f45]"
          >
            <span className="material-symbols-outlined text-sm text-[#7372A5] dark:text-[#a1a0d3]">
              fact_check
            </span>
            <span>View All in Latest Results</span>
          </button>
        </div>

        {recentHistory.length === 0 ? (
          <div className="py-8 text-center space-y-2">
            <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600">
              quiz
            </span>
            <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
              No completed quizzes yet.
            </p>
            <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
              Complete an adaptive quiz to build your persistent mastery and review history here.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {recentHistory.map((attempt) => (
              <div
                key={attempt.id}
                className="p-3.5 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] flex items-center justify-between gap-3 hover:border-[#7372A5]/40 transition-all"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center shrink-0">
                    <span className="material-symbols-outlined text-base">quiz</span>
                  </div>
                  <div className="min-w-0">
                    <h4 className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8] truncate">
                      {attempt.title}
                    </h4>
                    <p className="text-[11px] text-gray-500 dark:text-gray-400">
                      {attempt.topic} • {attempt.date}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5 shrink-0">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[11px] font-extrabold border ${
                      attempt.score >= 80
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50'
                        : attempt.score >= 50
                        ? 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/50'
                        : 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/50'
                    }`}
                  >
                    {attempt.score}%
                  </span>

                  {onOpenQuizResult && (
                    <button
                      onClick={() => onOpenQuizResult(attempt.id)}
                      className="px-2.5 py-1 rounded-xl bg-white dark:bg-[#201e30] border border-[#d8d7e8] dark:border-[#312f45] text-xs font-bold text-gray-700 dark:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#252436] transition-colors"
                    >
                      Review
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ========================================================
          MY SAVED LEARNING PATHS SECTION
      ======================================================== */}
      <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-gray-100 dark:border-gray-800">
          <div>
            <h2 className="text-base font-extrabold text-[#222138] dark:text-[#f2f1f8]">
              My Saved Learning Paths
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              Review, reopen, and practice your personalized topic flows.
            </p>
          </div>
          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="px-3 py-1.5 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 text-xs font-bold transition-all flex items-center gap-1 border border-[#d8d7e8] dark:border-[#312f45]"
            >
              <span className="material-symbols-outlined text-sm text-[#7372A5] dark:text-[#a1a0d3]">
                add
              </span>
              <span>New Path</span>
            </button>
          )}
        </div>

        {loadingPaths && (
          <div className="py-8 text-center text-xs text-gray-400 font-semibold">
            Loading saved learning paths...
          </div>
        )}

        {!loadingPaths && savedPaths.length === 0 && (
          <div className="py-8 text-center space-y-2">
            <span className="material-symbols-outlined text-3xl text-gray-300 dark:text-gray-600">
              account_tree
            </span>
            <p className="text-xs font-bold text-gray-600 dark:text-gray-300">
              No saved learning paths yet.
            </p>
            <p className="text-[11px] text-gray-400 max-w-sm mx-auto">
              Generate a Learning Path from your uploaded materials and click "Save to My Learning" to keep it here.
            </p>
          </div>
        )}

        {!loadingPaths && savedPaths.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {savedPaths.map((path) => (
              <div
                key={path.id}
                className="p-4 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] bg-[#f8f8fc] dark:bg-[#1a1926] space-y-3 flex flex-col justify-between hover:border-[#7372A5]/50 transition-all"
              >
                <div className="space-y-1">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-extrabold text-sm text-[#222138] dark:text-[#f2f1f8] leading-snug">
                      {path.title}
                    </h3>
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 dark:bg-purple-950/40 text-[#7372A5] dark:text-[#a1a0d3] shrink-0">
                      {path.concepts.length} concepts
                    </span>
                  </div>
                  {path.source_files && path.source_files.length > 0 && (
                    <p className="text-[11px] text-gray-500 dark:text-gray-400 truncate">
                      Source:{' '}
                      {path.source_files
                        .map((f: any) => (typeof f === 'string' ? f : f.name))
                        .join(', ')}
                    </p>
                  )}
                  {path.created_at && (
                    <p className="text-[10px] text-gray-400">
                      Saved on {new Date(path.created_at).toLocaleDateString()}
                    </p>
                  )}
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-gray-200 dark:border-gray-800 text-xs">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleRenamePath(path)}
                      className="text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 text-xs font-semibold cursor-pointer"
                      title="Rename this path"
                    >
                      Rename
                    </button>
                    <span className="text-gray-300 dark:text-gray-700">•</span>
                    <button
                      onClick={() => handleDeletePath(path.id)}
                      className="text-rose-500 hover:text-rose-700 text-xs font-semibold cursor-pointer"
                      title="Delete this path"
                    >
                      Delete
                    </button>
                  </div>

                  {onOpenLearningPath && (
                    <button
                      onClick={() => onOpenLearningPath(path)}
                      className="px-3 py-1.5 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-all flex items-center gap-1 cursor-pointer"
                    >
                      <span>Open Path</span>
                      <span className="material-symbols-outlined text-xs">arrow_forward</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
