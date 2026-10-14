import React, {
  useEffect,
  useState,
} from 'react';

import {
  ViewMode,
  Quiz,
  QuizResult,
  AdaptiveQuizLaunch,
} from './types';

import { supabase } from './supabaseClient';

import {
  INITIAL_USER_PROFILE,
  SAMPLE_QUIZZES,
  RECENT_QUIZZES_HISTORY,
} from './data/sampleData';

import { Sidebar } from './components/Sidebar';
import { QuizUploadModal } from './components/QuizUploadModal';
import { MasteryPanel } from './components/MasteryPanel';
import { CourseFlowMapModal } from './components/CourseFlowMapModal';

import { LoginView } from './components/Views/LoginView';
import { LandingView } from './components/Views/LandingView';
import { DashboardView } from './components/Views/DashboardView';
import { ActiveQuizView } from './components/Views/ActiveQuizView';
import { ResultsView } from './components/Views/ResultsView';


export default function App() {
  const [currentView, setCurrentView] = useState<ViewMode>('login');
  const [authLoading, setAuthLoading] = useState(true);
  const [dyslexiaMode, setDyslexiaMode] = useState<boolean>(false);
  const [userProfile, setUserProfile] = useState(INITIAL_USER_PROFILE);
  const [quizzesList, setQuizzesList] = useState<Quiz[]>(SAMPLE_QUIZZES);
  
  const [recentHistory, setRecentHistory] = useState<{
    id: string;
    title: string;
    topic: string;
    score: number;
    date: string;
    icon: string;
    difficulty: string;
  }[]>([]);
  
  const [activeQuiz, setActiveQuiz] = useState<Quiz>(SAMPLE_QUIZZES[0]);
  const [adaptiveSessionId, setAdaptiveSessionId] = useState<string | undefined>(undefined);
  const [quizResult, setQuizResult] = useState<QuizResult | null>(null);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState<boolean>(false);
  const [isCourseMapOpen, setIsCourseMapOpen] = useState<boolean>(false);
  const [quizResults, setQuizResults] = useState<QuizResult[]>([]);

  // ==========================================================
  // DYSLEXIA MODE
  // ==========================================================

  useEffect(() => {
    if (dyslexiaMode) {
      document.body.classList.add('dyslexia-mode');
    } else {
      document.body.classList.remove('dyslexia-mode');
    }
  }, [dyslexiaMode]);

  // ==========================================================
  // AUTH
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    const checkAuth = async () => {
      const { data } = await supabase.auth.getSession();
      if (!mounted) return;
      setCurrentView(data.session ? 'dashboard' : 'login');
      setAuthLoading(false);
    };

    checkAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (!mounted) return;

      if (event === 'SIGNED_IN') {
        // Supabase re-validates the session (and re-fires this
        // same event) whenever the tab regains focus/visibility —
        // not just on an actual fresh sign-in. Only navigate away
        // if the user was genuinely on the login screen; otherwise
        // this would yank them out of an active quiz, a chat, or
        // anywhere else just for switching windows and back.
        setCurrentView((prev) => (prev === 'login' ? 'dashboard' : prev));
      } else if (event === 'SIGNED_OUT') {
        setCurrentView('login');
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  // ==========================================================
  // QUIZ HISTORY (fetch once so the dashboard survives a refresh
  // instead of resetting to empty — it was only ever held in React
  // state before this, with nothing fetched back on load)
  // ==========================================================

  useEffect(() => {
    let mounted = true;

    const loadHistory = async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const accessToken = sessionData.session?.access_token;
      if (!accessToken) return;

      try {
        const response = await fetch('/api/quiz-history', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

        if (!response.ok) {
          console.error(
            'Quiz history fetch failed:',
            response.status,
            await response.text()
          );
          return;
        }
        if (!mounted) return;

        const data = await response.json();
        const rows: any[] = data.history || [];
        console.log('Quiz history loaded:', rows.length, 'entries');
        if (rows.length === 0) return;

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

        setRecentHistory(
          rows.slice(0, 4).map((row) => ({
            id: row.quiz_id,
            title: row.quiz_title,
            topic: row.topic || row.quiz_title,
            score: row.score_percentage,
            date: new Date(row.completed_at).toLocaleDateString(),
            icon: 'quiz',
            difficulty: row.difficulty || 'Medium',
          }))
        );

        const totalQuizzes = results.length;
        const averageScore = Math.round(
          results.reduce((sum, q) => sum + q.scorePercentage, 0) / totalQuizzes
        );
        const bestScore = Math.max(...results.map((q) => q.scorePercentage));
        const totalQuestions = results.reduce((sum, q) => sum + q.totalQuestions, 0);
        const totalCorrect = results.reduce((sum, q) => sum + q.correctAnswersCount, 0);
        const accuracy =
          totalQuestions > 0 ? Math.round((totalCorrect / totalQuestions) * 100) : 0;

        setUserProfile((profile) => ({
          ...profile,
          totalQuizzesAttempted: totalQuizzes,
          averageScore,
          bestScore,
          accuracy,
          overallProgress: averageScore,
        }));
      } catch {
        // Best-effort — dashboard just stays empty if this fails.
      }
    };

    loadHistory();

    return () => {
      mounted = false;
    };
  }, []);

  // ==========================================================
  // LOADING
  // ==========================================================

  if (authLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f6f6fa]">
        <div className="text-sm font-semibold text-[#7372A5]">
          Loading FlexQuizz...
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
  };

  // ==========================================================
  // QUIZ COMPLETE
  // ==========================================================

  const handleQuizComplete = (
    result: QuizResult,
    completedQuiz?: Quiz
  ) => {
    if (completedQuiz) {
      setActiveQuiz(completedQuiz);
    }

    // Best-effort persistence so this result survives a refresh —
    // fire-and-forget, doesn't block the UI update below.
    (async () => {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;
        if (!accessToken) {
          console.warn(
            'Quiz result not saved: no active session (guest mode?).'
          );
          return;
        }

        const saveResponse = await fetch('/api/record-quiz-result', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
          body: JSON.stringify({
            quiz_id: result.quizId,
            quiz_title: result.quizTitle,
            topic: completedQuiz?.topic || activeQuiz?.topic || '',
            difficulty: completedQuiz?.difficulty || activeQuiz?.difficulty || 'Medium',
            score_percentage: result.scorePercentage,
            total_questions: result.totalQuestions,
            correct_answers_count: result.correctAnswersCount,
          }),
        });

        if (!saveResponse.ok) {
          console.error(
            'Quiz result save failed:',
            saveResponse.status,
            await saveResponse.text()
          );
        } else {
          console.log('Quiz result saved:', await saveResponse.json());
        }
      } catch (err) {
        console.error('Quiz result save threw an error:', err);
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
    ].slice(0, 4));

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

  // ==========================================================
  // LOGIN
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
  // LANDING
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
  // ACTIVE QUIZ
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
  // RESULTS
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
      />
    );
  }

  // ==========================================================
  // MAIN APP LAYOUT
  // ==========================================================

  return (
    <div className="min-h-screen bg-[#f6f6fa] flex flex-col font-sans">
      <div className="flex-1 flex max-w-7xl w-full mx-auto">
        <Sidebar
          currentView={currentView}
          setCurrentView={setCurrentView}
          dyslexiaMode={dyslexiaMode}
          setDyslexiaMode={setDyslexiaMode}
          onOpenUploadModal={() => setIsUploadModalOpen(true)}
          onOpenCourseMap={() => setIsCourseMapOpen(true)}
        />

        <main className="flex-1 p-4 sm:p-6 lg:p-8 overflow-y-auto">
          {currentView === 'dashboard' && (
            <DashboardView
              setCurrentView={setCurrentView}
              userProfile={userProfile}
              onStartQuiz={handleStartQuiz}
              sampleQuizzes={quizzesList}
              recentHistory={recentHistory}
              quizResults={quizResults}
              onOpenUploadModal={() => setIsUploadModalOpen(true)}
            />
          )}

          {currentView === 'quizzes-list' && (

            <div className="space-y-6 text-left">

              <div>

                <h1 className="text-2xl font-extrabold text-[#222138]">
                  Available Quizzes
                </h1>

                <p className="text-xs text-gray-500">
                  Pick a quiz topic to start practicing immediately
                </p>

              </div>


              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">

                {quizzesList.map(
                  (quiz) => (

                    <div
                      key={
                        quiz.id
                      }
                      className="bg-white p-6 rounded-2xl border border-[#d8d7e8] shadow-xs space-y-4"
                    >

                      <div className="flex items-center justify-between">

                        <span className="bg-[#ececf4] text-[#7372A5] text-[10px] font-extrabold px-2.5 py-0.5 rounded-full uppercase">
                          {quiz.difficulty}
                        </span>

                        <span className="text-xs text-gray-400 font-semibold">
                          {quiz.totalQuestions}
                          {' '}
                          Questions
                        </span>

                      </div>


                      <div>

                        <h3 className="font-bold text-base text-[#222138]">
                          {quiz.title}
                        </h3>

                        <p className="text-xs text-gray-500 mt-1">
                          {quiz.topic}
                        </p>

                      </div>


                      <button
                        onClick={() =>
                          handleStartQuiz(
                            quiz
                          )
                        }
                        className="w-full py-2.5 rounded-xl bg-[#ececf4] text-[#7372A5] font-bold text-xs"
                      >
                        Start Quiz →
                      </button>

                    </div>

                  )
                )}

              </div>

            </div>

          )}


          {currentView ===
            'analytics' && (

            <div className="space-y-6 text-left">

              <h1 className="text-2xl font-extrabold text-[#2b1836]">
                Analytics & Mastery Radar
              </h1>

              <MasteryPanel />

            </div>

          )}


          {currentView ===
            'leaderboard' && (

            <div className="space-y-6 text-left">

              <h1 className="text-2xl font-extrabold text-[#2b1836]">
                Global Student Leaderboard
              </h1>

            </div>

          )}

        </main>

      </div>


      {/* ====================================================
          UPLOAD / ADAPTIVE QUIZ MODAL
      ==================================================== */}

      <QuizUploadModal

        isOpen={
          isUploadModalOpen
        }

        onClose={() =>
          setIsUploadModalOpen(
            false
          )
        }

        onQuizStarted={
          handleAdaptiveQuizStarted
        }

      />

      <CourseFlowMapModal
        isOpen={isCourseMapOpen}
        onClose={() => setIsCourseMapOpen(false)}
      />

    </div>
  );
}
