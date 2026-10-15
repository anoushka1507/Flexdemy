import React, { useEffect, useState } from 'react';

import {
  ViewMode,
  Quiz,
  QuizResult,
  AdaptiveQuizLaunch,
  UserProfile,
  UserSettings,
  ThemeMode,
} from './types';

import { supabase } from './supabaseClient';
import { apiFetch } from './utils/api';
import { getStoredTheme, applyTheme, subscribeToSystemTheme } from './utils/theme';

import {
  INITIAL_USER_PROFILE,
  SAMPLE_QUIZZES,
} from './data/sampleData';

import { Sidebar } from './components/Sidebar';
import { QuizUploadModal } from './components/QuizUploadModal';
import { MasteryPanel } from './components/MasteryPanel';
import { CourseFlowMapModal } from './components/CourseFlowMapModal';
import { Toast } from './components/Toast';

import { LoginView } from './components/Views/LoginView';
import { LandingView } from './components/Views/LandingView';
import { DashboardView } from './components/Views/DashboardView';
import { ActiveQuizView } from './components/Views/ActiveQuizView';
import { ResultsView } from './components/Views/ResultsView';
import { ProfileView } from './components/Views/ProfileView';
import { SettingsView } from './components/Views/SettingsView';

export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('login');
  const [authLoading, setAuthLoading] = useState(true);
  const [isGuest, setIsGuest] = useState(true);

  // Theme & Accessibility States
  const [currentTheme, setCurrentTheme] = useState<ThemeMode>(getStoredTheme());
  const [dyslexiaMode, setDyslexiaMode] = useState<boolean>(false);
  const [userSettings, setUserSettings] = useState<UserSettings>({
    theme: getStoredTheme(),
    dyslexiaMode: false,
    speechRate: 1.0,
    speechPitch: 1.0,
    reducedMotion: false,
    fontSize: 'standard',
    explanationLanguage: 'english',
    explanationStyle: 'concise',
    dailyStudyMinutes: 45,
    weakTopicInterval: 'daily',
  });

  // Toasts
  const [toasts, setToasts] = useState<
    Array<{ id: string; message: string; type: 'success' | 'error' | 'info' }>
  >([]);

  const showToast = (
    message: string,
    type: 'success' | 'error' | 'info' = 'success'
  ) => {
    const id = Math.random().toString(36).substring(2, 9);
    setToasts((prev) => [...prev, { id, message, type }]);
  };

  const dismissToast = (id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  };

  // Profile & Learner Data
  const [userProfile, setUserProfile] = useState<UserProfile>(INITIAL_USER_PROFILE);
  const [quizzesList, setQuizzesList] = useState<Quiz[]>([]);
  const [weakTopics, setWeakTopics] = useState<
    Array<{ topic: string; mastery_score: number; times_seen?: number }>
  >([]);

  const [recentHistory, setRecentHistory] = useState<
    {
      id: string;
      title: string;
      topic: string;
      score: number;
      date: string;
      icon: string;
      difficulty: string;
    }[]
  >([]);

  const [activeQuiz, setActiveQuiz] = useState<Quiz>(SAMPLE_QUIZZES[0]);
  const [adaptiveSessionId, setAdaptiveSessionId] = useState<string | undefined>(undefined);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [resultsInitialTab, setResultsInitialTab] = useState<'review' | 'insights'>('review');
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isCourseMapOpen, setIsCourseMapOpen] = useState<boolean>(false);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);

  // ==========================================================
  // THEME & ACCESSIBILITY SUBSCRIPTIONS
  // ==========================================================

  useEffect(() => {
    const unsubscribe = subscribeToSystemTheme(() => {
      // System theme changed live in OS
      if (getStoredTheme() === 'system') {
        applyTheme('system');
      }
    });
    return unsubscribe;
  }, []);

  const handleThemeChange = async (newTheme: ThemeMode) => {
    setCurrentTheme(newTheme);
    applyTheme(newTheme);
    setUserSettings((prev) => ({ ...prev, theme: newTheme }));

    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        await apiFetch('/api/user-preferences', {
          method: 'POST',
          body: JSON.stringify({ theme: newTheme }),
        });
      }
    } catch {
      // Local preference is already saved
    }
  };

  // Dyslexia Mode effect
  useEffect(() => {
    if (dyslexiaMode) {
      document.body.classList.add('dyslexia-mode');
    } else {
      document.body.classList.remove('dyslexia-mode');
    }
  }, [dyslexiaMode]);

  // ==========================================================
  // AUTH & PERSISTENT LEARNER PROFILE HYDRATION
  // ==========================================================

  const hydrateLearnerData = async () => {
    try {
      const response = await apiFetch('/api/learner-profile');
      if (response.ok) {
        const data = await response.json();
        const rows: any[] = data.history || [];
        const results: QuizResult[] = rows.map((row) => ({
          quizId: row.quiz_id,
          quizTitle: row.quiz_title,
          scorePercentage: row.score_percentage,
          totalQuestions: row.total_questions,
          correctAnswersCount: row.correct_answers_count,
          incorrectAnswersCount: row.total_questions - row.correct_answers_count,
          timeSpentSeconds: 0,
          dateCompleted: row.completed_at,
          userAnswers: {},
          topicBreakdown: [],
        }));
        setQuizResults(results);

        setQuizzesList(
          rows.map((row) => ({
            id: row.quiz_id,
            title: row.quiz_title,
            topic: row.topic || row.quiz_title,
            difficulty: (row.difficulty || 'Medium') as Quiz['difficulty'],
            questions: [],
            totalQuestions: row.total_questions,
            isFromHistory: true,
          }))
        );

        setRecentHistory(
          rows.slice(0, 6).map((row) => ({
            id: row.quiz_id,
            title: row.quiz_title,
            topic: row.topic || row.quiz_title,
            score: row.score_percentage,
            date: new Date(row.completed_at).toLocaleDateString(),
            icon: 'quiz',
            difficulty: row.difficulty || 'Medium',
          }))
        );

        if (data.weak_topics) {
          setWeakTopics(data.weak_topics);
        }

        if (data.stats) {
          setUserProfile((profile) => ({
            ...profile,
            totalQuizzesAttempted: data.stats.total_quizzes,
            averageScore: data.stats.average_score,
            bestScore: data.stats.best_score,
            accuracy: data.stats.accuracy,
            overallProgress: data.stats.average_score,
          }));
        }

        if (data.profile) {
          setUserProfile((prev) => ({
            ...prev,
            name: data.profile.display_name || prev.name,
            avatarUrl: data.profile.avatar_url || prev.avatarUrl,
            institution: data.profile.institution || prev.institution,
            courseProgram: data.profile.course_program || prev.courseProgram,
            studyGoal: data.profile.study_goal || prev.studyGoal,
            bio: data.profile.bio || prev.bio,
            createdAt: data.profile.created_at || prev.createdAt,
          }));
        }

        if (data.preferences) {
          const p = data.preferences;
          if (p.theme && (p.theme === 'light' || p.theme === 'dark' || p.theme === 'system')) {
            setCurrentTheme(p.theme as ThemeMode);
            applyTheme(p.theme as ThemeMode);
          }
          if (p.dyslexia_mode !== undefined) {
            setDyslexiaMode(Boolean(p.dyslexia_mode));
          }
          if (p.reduced_motion !== undefined) {
            document.documentElement.classList.toggle('reduced-motion', Boolean(p.reduced_motion));
          }
          if (p.font_size === 'large') {
            document.documentElement.classList.add('font-large');
          } else {
            document.documentElement.classList.remove('font-large');
          }

          setUserSettings((prev) => ({
            ...prev,
            theme: (p.theme as ThemeMode) || prev.theme,
            dyslexiaMode: p.dyslexia_mode ?? prev.dyslexiaMode,
            speechRate: p.speech_rate ?? prev.speechRate,
            speechPitch: p.speech_pitch ?? prev.speechPitch,
            reducedMotion: p.reduced_motion ?? prev.reducedMotion,
            fontSize: (p.font_size as any) ?? prev.fontSize,
            explanationLanguage: (p.language as any) ?? prev.explanationLanguage,
            explanationStyle: (p.explanation_style as any) ?? prev.explanationStyle,
            dailyStudyMinutes: p.daily_minutes ?? prev.dailyStudyMinutes,
            examDate: p.exam_date ?? prev.examDate,
            weakTopicInterval: (p.weak_topic_interval as any) ?? prev.weakTopicInterval,
          }));
        }
      }
    } catch (err) {
      console.warn('Could not hydrate persistent learner data:', err);
    }
  };

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      if (data.session?.user) {
        setIsGuest(false);
        const user = data.session.user;
        setUserProfile((prev) => ({
          ...prev,
          id: user.id,
          email: user.email || prev.email,
          name:
            user.user_metadata?.display_name ||
            user.user_metadata?.full_name ||
            (user.email ? user.email.split('@')[0] : 'Learner'),
          createdAt: user.created_at,
        }));
        setCurrentView('dashboard');
        hydrateLearnerData();
      } else {
        setIsGuest(true);
        setCurrentView('login');
      }
      setAuthLoading(false);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN' && session?.user) {
        setIsGuest(false);
        const user = session.user;
        setUserProfile((prev) => ({
          ...prev,
          id: user.id,
          email: user.email || prev.email,
          name:
            user.user_metadata?.display_name ||
            user.user_metadata?.full_name ||
            (user.email ? user.email.split('@')[0] : 'Learner'),
          createdAt: user.created_at,
        }));
        setCurrentView((prev) => (prev === 'login' ? 'dashboard' : prev));
        hydrateLearnerData();
      } else if (event === 'SIGNED_OUT') {
        setIsGuest(true);
        setCurrentView('login');
        setQuizResults([]);
        setQuizzesList([]);
        setRecentHistory([]);
        setWeakTopics([]);
        setUserProfile(INITIAL_USER_PROFILE);
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ==========================================================
  // PROFILE & SETTINGS ACTIONS
  // ==========================================================

  const handleUpdateProfile = async (updated: Partial<UserProfile>): Promise<boolean> => {
    try {
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const resp = await apiFetch('/api/user-profile', {
          method: 'POST',
          body: JSON.stringify({
            display_name: updated.name,
            institution: updated.institution,
            course_program: updated.courseProgram,
            study_goal: updated.studyGoal,
            bio: updated.bio,
            avatar_url: updated.avatarUrl,
          }),
        });

        if (!resp.ok) {
          return false;
        }

        try {
          await supabase.auth.updateUser({
            data: { display_name: updated.name },
          });
        } catch {
          // ignore auth metadata sync failure if api succeeded
        }
      }

      setUserProfile((prev) => ({
        ...prev,
        ...updated,
      }));
      return true;
    } catch (err) {
      console.error('Update profile error:', err);
      return false;
    }
  };

  const handleUpdateSettings = async (updated: Partial<UserSettings>): Promise<boolean> => {
    try {
      if (updated.theme) {
        handleThemeChange(updated.theme);
      }
      if (updated.dyslexiaMode !== undefined) {
        setDyslexiaMode(updated.dyslexiaMode);
      }
      if (updated.reducedMotion !== undefined) {
        document.documentElement.classList.toggle('reduced-motion', updated.reducedMotion);
      }
      if (updated.fontSize) {
        if (updated.fontSize === 'large') {
          document.documentElement.classList.add('font-large');
        } else {
          document.documentElement.classList.remove('font-large');
        }
      }

      setUserSettings((prev) => ({
        ...prev,
        ...updated,
      }));

      const { data } = await supabase.auth.getSession();
      if (data.session) {
        const resp = await apiFetch('/api/user-preferences', {
          method: 'POST',
          body: JSON.stringify({
            theme: updated.theme,
            dyslexia_mode: updated.dyslexiaMode,
            speech_rate: updated.speechRate,
            speech_pitch: updated.speechPitch,
            reduced_motion: updated.reducedMotion,
            font_size: updated.fontSize,
            language: updated.explanationLanguage,
            explanation_style: updated.explanationStyle,
            daily_minutes: updated.dailyStudyMinutes,
            exam_date: updated.examDate,
            weak_topic_interval: updated.weakTopicInterval,
          }),
        });
        return resp.ok;
      }
      return true;
    } catch (err) {
      console.error('Update settings error:', err);
      return false;
    }
  };

  const handleSignOut = async () => {
    try {
      await supabase.auth.signOut();
    } catch (err) {
      console.warn('Sign out threw:', err);
    }
    setCurrentView('login');
    setQuizResults([]);
    setQuizzesList([]);
    setRecentHistory([]);
    setWeakTopics([]);
    setUserProfile(INITIAL_USER_PROFILE);
    setIsGuest(true);
    showToast('Signed out of session', 'info');
  };

  const handleResetLearningData = async (): Promise<boolean> => {
    try {
      const resp = await apiFetch('/api/reset-learning-data', { method: 'POST' });
      if (resp.ok) {
        setQuizResults([]);
        setRecentHistory([]);
        setQuizzesList([]);
        setWeakTopics([]);
        setUserProfile((prev) => ({
          ...prev,
          totalQuizzesAttempted: 0,
          averageScore: 0,
          bestScore: 0,
          accuracy: 0,
          overallProgress: 0,
        }));
        return true;
      }
      return false;
    } catch (err) {
      console.error('Reset learning data threw:', err);
      return false;
    }
  };

  // ==========================================================
  // LOADING STATE
  // ==========================================================

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f6fa] dark:bg-[#0e0d16] text-gray-500 dark:text-gray-400">
        <div className="flex items-center gap-2 text-sm font-semibold text-[#7372A5] dark:text-[#a1a0d3]">
          <span className="material-symbols-outlined text-2xl animate-spin">sync</span>
          <span>Loading Flexdemy...</span>
        </div>
      </div>
    );
  }

  // ==========================================================
  // START STATIC QUIZ
  // ==========================================================

  const handleStartQuiz = (quizToStart: Quiz) => {
    setAdaptiveSessionId(undefined);
    setActiveQuiz(quizToStart);
    setCurrentView('active-quiz');
  };

  // ==========================================================
  // START ADAPTIVE QUIZ
  // ==========================================================

  const handleAdaptiveQuizStarted = async (launch: AdaptiveQuizLaunch) => {
    const adaptiveQuiz: Quiz = {
      id: `adaptive-${launch.sessionId}`,
      title: launch.title,
      topic: launch.firstQuestion.concept || launch.title,
      difficulty: launch.firstQuestion.difficulty || 'Medium',
      questions: [launch.firstQuestion],
      totalQuestions: launch.totalQuestions,
      timeLimitMinutes: 15,
    };

    setAdaptiveSessionId(launch.sessionId);
    setActiveQuiz(adaptiveQuiz);
    setQuizzesList((prev) => [adaptiveQuiz, ...prev]);
    setCurrentView('active-quiz');
    showToast(`Started adaptive quiz: ${launch.title}`, 'info');
  };

  // ==========================================================
  // QUIZ COMPLETE
  // ==========================================================

  const handleQuizComplete = (result: QuizResult, completedQuiz?: Quiz) => {
    if (completedQuiz) {
      setActiveQuiz(completedQuiz);
    }

    setResultsInitialTab('review');

    (async () => {
      try {
        await apiFetch('/api/record-quiz-result', {
          method: 'POST',
          body: JSON.stringify({
            quiz_id: result.quizId,
            quiz_title: result.quizTitle,
            topic: completedQuiz?.topic || activeQuiz?.topic || '',
            difficulty: completedQuiz?.difficulty || activeQuiz?.difficulty || 'Medium',
            score_percentage: result.scorePercentage,
            total_questions: result.totalQuestions,
            correct_answers_count: result.correctAnswersCount,
            session_id: adaptiveSessionId || null,
            topic_breakdown: result.topicBreakdown?.length ? result.topicBreakdown : null,
          }),
        });
      } catch (err) {
        console.error('Quiz result save error:', err);
      }
    })();

    setQuizResult(result);
    setRecentHistory((prev) => [
      {
        id: result.quizId,
        title: result.quizTitle,
        topic: completedQuiz?.topic || activeQuiz?.topic || result.quizTitle,
        score: result.scorePercentage,
        date: 'Just now',
        icon: 'quiz',
        difficulty: completedQuiz?.difficulty || activeQuiz?.difficulty || 'Medium',
      },
      ...prev,
    ].slice(0, 6));

    setQuizResults((prevResults) => {
      const updatedResults = [...prevResults, result];
      const totalQuizzes = updatedResults.length;
      const averageScore = Math.round(
        updatedResults.reduce((sum, quiz) => sum + quiz.scorePercentage, 0) / totalQuizzes
      );
      const bestScore = Math.max(...updatedResults.map((quiz) => quiz.scorePercentage));
      const totalQuestions = updatedResults.reduce((sum, quiz) => sum + quiz.totalQuestions, 0);
      const totalCorrect = updatedResults.reduce((sum, quiz) => sum + quiz.correctAnswersCount, 0);
      const accuracy = totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

      setUserProfile((profile) => ({
        ...profile,
        totalQuizzesAttempted: profile.totalQuizzesAttempted + 1,
        averageScore,
        bestScore: Math.max(profile.bestScore, bestScore),
        accuracy,
        overallProgress: averageScore,
      }));

      return updatedResults;
    });

    setCurrentView('quiz-results');
  };

  const handleOpenQuizResult = async (quizId?: string) => {
    try {
      const response = await apiFetch('/api/quiz-history');
      if (!response.ok) return;

      const data = await response.json();
      const rows: any[] = data.history || [];
      if (rows.length === 0) return;

      const match = quizId ? rows.find((r) => r.quiz_id === quizId) : rows[0];
      if (!match) return;

      const reconstructed: QuizResult = {
        quizId: match.quiz_id,
        quizTitle: match.quiz_title,
        scorePercentage: match.score_percentage,
        totalQuestions: match.total_questions,
        correctAnswersCount: match.correct_answers_count,
        incorrectAnswersCount: match.total_questions - match.correct_answers_count,
        timeSpentSeconds: 0,
        dateCompleted: match.completed_at,
        userAnswers: {},
        topicBreakdown: match.topic_breakdown || [],
      };

      setQuizResult(reconstructed);
      setAdaptiveSessionId(match.session_id || undefined);
      setResultsInitialTab('insights');
      setCurrentView('quiz-results');
    } catch {
      // Best-effort
    }
  };

  const handleOpenLatestResults = () => handleOpenQuizResult();

  // ==========================================================
  // LOGIN VIEW
  // ==========================================================

  if (currentView === 'login') {
    return (
      <LoginView
        setCurrentView={setCurrentView}
        dyslexiaMode={dyslexiaMode}
        setDyslexiaMode={setDyslexiaMode}
      />
    );
  }

  // ==========================================================
  // LANDING VIEW
  // ==========================================================

  if (currentView === 'landing') {
    return (
      <>
        <LandingView
          setCurrentView={setCurrentView}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          onStartDemoQuiz={() => handleStartQuiz(SAMPLE_QUIZZES[0])}
          dyslexiaMode={dyslexiaMode}
          setDyslexiaMode={setDyslexiaMode}
        />
        <QuizUploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onQuizStarted={handleAdaptiveQuizStarted}
        />
      </>
    );
  }

  // ==========================================================
  // ACTIVE QUIZ VIEW
  // ==========================================================

  if (currentView === 'active-quiz') {
    return (
      <ActiveQuizView
        quiz={activeQuiz}
        adaptiveSessionId={adaptiveSessionId}
        setCurrentView={setCurrentView}
        dyslexiaMode={dyslexiaMode}
        setDyslexiaMode={setDyslexiaMode}
        onCompleteQuiz={handleQuizComplete}
      />
    );
  }

  // ==========================================================
  // RESULTS VIEW
  // ==========================================================

  if (currentView === 'quiz-results' && quizResult) {
    return (
      <ResultsView
        quizResult={quizResult}
        quiz={activeQuiz}
        setCurrentView={setCurrentView}
        dyslexiaMode={dyslexiaMode}
        setDyslexiaMode={setDyslexiaMode}
        onRetakeQuiz={() => handleStartQuiz(activeQuiz)}
        onStartAnotherQuiz={() => setCurrentView('landing')}
        sessionId={adaptiveSessionId}
        initialTab={resultsInitialTab}
      />
    );
  }

  // ==========================================================
  // MAIN APPLICATION SHELL
  // ==========================================================

  return (
    <div className="min-h-screen bg-[var(--bg-app)] text-[var(--text-primary)] flex flex-col font-sans transition-colors duration-200">
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          currentView={currentView}
          setCurrentView={setCurrentView}
          dyslexiaMode={dyslexiaMode}
          setDyslexiaMode={setDyslexiaMode}
          currentTheme={currentTheme}
          onThemeChange={handleThemeChange}
          userProfile={userProfile}
          isGuest={isGuest}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          onOpenCourseMap={() => setIsCourseMapOpen(true)}
          onOpenLatestResults={handleOpenLatestResults}
          onSignOut={handleSignOut}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {currentView === 'dashboard' && (
            <DashboardView
              setCurrentView={setCurrentView}
              userProfile={userProfile}
              onStartQuiz={handleStartQuiz}
              onOpenQuizResult={handleOpenQuizResult}
              sampleQuizzes={quizzesList.length > 0 ? quizzesList : SAMPLE_QUIZZES}
              recentHistory={recentHistory}
              quizResults={quizResults}
              weakTopics={weakTopics}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
              onOpenCourseMap={() => setIsCourseMapOpen(true)}
            />
          )}

          {currentView === 'profile' && (
            <ProfileView
              userProfile={userProfile}
              onUpdateProfile={handleUpdateProfile}
              isGuest={isGuest}
              onShowToast={showToast}
              onNavigate={setCurrentView}
            />
          )}

          {currentView === 'settings' && (
            <SettingsView
              settings={userSettings}
              onUpdateSettings={handleUpdateSettings}
              userProfile={userProfile}
              isGuest={isGuest}
              onShowToast={showToast}
              onSignOut={handleSignOut}
              onResetLearningData={handleResetLearningData}
            />
          )}

          {currentView === 'quizzes-list' && (
            <div className="space-y-6 text-left animate-in fade-in duration-200">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                    Available Quizzes & Practice Topics
                  </h1>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    Pick a quiz topic to practice or generate adaptive quizzes from your documents
                  </p>
                </div>

                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors self-start sm:self-auto"
                >
                  <span className="material-symbols-outlined text-base">upload_file</span>
                  <span>Upload Material</span>
                </button>
              </div>

              {quizzesList.length === 0 && (
                <div className="bg-white dark:bg-[#161522] rounded-3xl border border-dashed border-[#d8d7e8] dark:border-[#312f45] p-10 text-center space-y-3">
                  <div className="w-12 h-12 rounded-2xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center mx-auto">
                    <span className="material-symbols-outlined text-2xl">quiz</span>
                  </div>
                  <p className="text-sm font-bold text-[#222138] dark:text-[#f2f1f8]">
                    No personal quizzes generated yet
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto">
                    Upload your course slides, PDFs, or notes to synthesize personalized adaptive quizzes.
                  </p>
                  <button
                    onClick={() => setIsUploadModalOpen(true)}
                    className="px-5 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs"
                  >
                    Upload Material Now
                  </button>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
                {(quizzesList.length > 0 ? quizzesList : SAMPLE_QUIZZES).map((quiz) => (
                  <div
                    key={quiz.id}
                    className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4 hover:border-[#7372A5]/50 transition-all flex flex-col justify-between"
                  >
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase border border-[#d8d7e8] dark:border-[#312f45]">
                          {quiz.difficulty}
                        </span>
                        <span className="text-xs text-gray-400 font-semibold">
                          {quiz.totalQuestions} Questions
                        </span>
                      </div>

                      <div>
                        <h3 className="font-bold text-base text-[#222138] dark:text-[#f2f1f8]">
                          {quiz.title}
                        </h3>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                          {quiz.topic}
                        </p>
                      </div>
                    </div>

                    <button
                      onClick={() =>
                        quiz.isFromHistory
                          ? handleOpenQuizResult(quiz.id)
                          : handleStartQuiz(quiz)
                      }
                      className="w-full py-2.5 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-[#7372A5] dark:text-[#a1a0d3] font-bold text-xs transition-colors border border-[#d8d7e8] dark:border-[#312f45]"
                    >
                      {quiz.isFromHistory ? 'View Results →' : 'Start Quiz →'}
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}

          {currentView === 'analytics' && (
            <div className="space-y-6 text-left animate-in fade-in duration-200">
              <h1 className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                Analytics & Mastery Radar
              </h1>
              <MasteryPanel
                onStartDiagnostic={() => setIsUploadModalOpen(true)}
                onStartPracticeQuiz={() => setIsUploadModalOpen(true)}
              />
            </div>
          )}

          {currentView === 'leaderboard' && (
            <div className="space-y-6 text-left animate-in fade-in duration-200">
              <h1 className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                Global Student Leaderboard
              </h1>
            </div>
          )}
        </main>
      </div>

      {/* ========================================================
          FLOATING TOAST NOTIFICATION CONTAINER
      ======================================================== */}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-sm w-full pointer-events-none">
        {toasts.map((toast) => (
          <div key={toast.id} className="pointer-events-auto">
            <Toast
              id={toast.id}
              type={toast.type}
              message={toast.message}
              onClose={dismissToast}
            />
          </div>
        ))}
      </div>

      {/* ========================================================
          UPLOAD / ADAPTIVE QUIZ & COURSE FLOW MODALS
      ======================================================== */}
      <QuizUploadModal
        isOpen={isUploadModalOpen}
        onClose={() => setIsUploadModalOpen(false)}
        onQuizStarted={handleAdaptiveQuizStarted}
      />

      <CourseFlowMapModal
        isOpen={isCourseMapOpen}
        onClose={() => setIsCourseMapOpen(false)}
        onPracticeTopic={() => setIsUploadModalOpen(true)}
      />
    </div>
  );
}
