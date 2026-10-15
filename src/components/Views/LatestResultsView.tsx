import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import { QuizResult, ViewMode } from '../../types';

export interface QuizAttemptRecord {
  id?: string;
  quiz_id: string;
  quiz_title: string;
  topic?: string;
  difficulty?: string;
  score_percentage: number;
  total_questions: number;
  correct_answers_count: number;
  session_id?: string;
  completed_at: string;
  topic_breakdown?: Array<{
    topic: string;
    score: number;
    total: number;
  }>;
}

interface LatestResultsViewProps {
  setCurrentView: (view: ViewMode) => void;
  onOpenQuizResult: (quizId: string) => void;
  onStartQuiz?: () => void;
  isGuest?: boolean;
}

export const LatestResultsView: React.FC<LatestResultsViewProps> = ({
  setCurrentView,
  onOpenQuizResult,
  onStartQuiz,
  isGuest = false,
}) => {
  const [attempts, setAttempts] = useState<QuizAttemptRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const fetchAttempts = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/quiz-history');
      if (!response.ok) {
        if (response.status === 401) {
          if (isGuest) {
            try {
              const guestSaved = localStorage.getItem('flexdemy_guest_quiz_history');
              if (guestSaved) {
                const parsed = JSON.parse(guestSaved);
                if (Array.isArray(parsed) && parsed.length > 0) {
                  setAttempts(parsed);
                  setLoading(false);
                  return;
                }
              }
            } catch {}
          }
          setError('Sign in to view your completed quiz results and analytics.');
        } else {
          setError('Could not retrieve quiz history from database. Please try again.');
        }
        return;
      }
      const data = await response.json();
      const history: QuizAttemptRecord[] = data.history || [];
      // Sort most recent first
      history.sort(
        (a, b) => new Date(b.completed_at).getTime() - new Date(a.completed_at).getTime()
      );
      setAttempts(history);
    } catch {
      setError('Network connection error while fetching your quiz results.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAttempts();
  }, []);

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getScoreBadgeClass = (score: number) => {
    if (score >= 80) {
      return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-200 border-emerald-200 dark:border-emerald-800/50';
    } else if (score >= 50) {
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-800 dark:text-amber-200 border-amber-200 dark:border-amber-800/50';
    } else {
      return 'bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-200 border-rose-200 dark:border-rose-800/50';
    }
  };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200 max-w-5xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#d8d7e8] dark:border-[#312f45]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-xl">fact_check</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] tracking-tight">
              Latest Quiz Results
            </h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Review your completed quiz attempts, accuracy breakdowns, and misconception feedback.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={fetchAttempts}
            disabled={loading}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-[#161522] border border-[#d8d7e8] dark:border-[#312f45] text-gray-700 dark:text-gray-200 hover:bg-[#ececf4] dark:hover:bg-[#252436] text-xs font-bold transition-all shadow-xs"
            title="Refresh list"
          >
            <span className={`material-symbols-outlined text-base ${loading ? 'animate-spin' : ''}`}>
              refresh
            </span>
            <span>Refresh</span>
          </button>

          {onStartQuiz && (
            <button
              onClick={onStartQuiz}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white text-xs font-extrabold shadow-xs transition-all"
            >
              <span className="material-symbols-outlined text-base">quiz</span>
              <span>New Quiz</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <div className="w-10 h-10 mx-auto rounded-full border-3 border-[#7372A5] border-t-transparent animate-spin" />
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
            Loading your completed quiz attempts...
          </p>
        </div>
      )}

      {/* Error State */}
      {!loading && error && (
        <div className="p-6 rounded-3xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 text-center space-y-3">
          <span className="material-symbols-outlined text-3xl text-rose-600 dark:text-rose-400">
            error
          </span>
          <p className="text-xs font-bold text-rose-800 dark:text-rose-200">{error}</p>
          <div className="flex justify-center gap-3">
            <button
              onClick={fetchAttempts}
              className="px-4 py-2 rounded-xl bg-rose-600 text-white font-bold text-xs hover:bg-rose-700 transition-colors"
            >
              Try Again
            </button>
            {isGuest && (
              <button
                onClick={() => setCurrentView('login')}
                className="px-4 py-2 rounded-xl bg-white text-rose-800 border border-rose-200 font-bold text-xs hover:bg-rose-100 transition-colors"
              >
                Sign In
              </button>
            )}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && !error && attempts.length === 0 && (
        <div className="p-12 text-center space-y-4 bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">assignment_late</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
              No Completed Quizzes Yet
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
              When you submit an adaptive practice quiz, your full results, question outcomes, and topic breakdown will appear here.
            </p>
          </div>
          {onStartQuiz && (
            <button
              onClick={onStartQuiz}
              className="px-5 py-2.5 rounded-2xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-extrabold text-xs shadow-md transition-all inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">play_arrow</span>
              <span>Start an Adaptive Quiz</span>
            </button>
          )}
        </div>
      )}

      {/* Attempts List */}
      {!loading && !error && attempts.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-1">
            <span>
              Showing <strong>{attempts.length}</strong> completed {attempts.length === 1 ? 'attempt' : 'attempts'} (most recent first)
            </span>
          </div>

          <div className="space-y-3">
            {attempts.map((attempt) => {
              const accuracy =
                attempt.total_questions > 0
                  ? Math.round((attempt.correct_answers_count / attempt.total_questions) * 100)
                  : attempt.score_percentage;

              return (
                <div
                  key={attempt.quiz_id || attempt.id}
                  className="p-5 bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs hover:border-[#7372A5]/50 transition-all flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                        {attempt.quiz_title}
                      </span>
                      {attempt.difficulty && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#ececf4] dark:bg-[#252436] text-gray-600 dark:text-gray-300 border border-[#d8d7e8] dark:border-[#312f45]">
                          {attempt.difficulty}
                        </span>
                      )}
                      {attempt.topic && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-purple-50 dark:bg-purple-950/40 text-[#7372A5] dark:text-[#a1a0d3] border border-purple-200 dark:border-purple-800/40">
                          {attempt.topic}
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 flex-wrap">
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">schedule</span>
                        {formatDate(attempt.completed_at)}
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="material-symbols-outlined text-sm">check_circle</span>
                        {attempt.correct_answers_count} of {attempt.total_questions} questions correct
                      </span>
                    </div>
                  </div>

                  <div className="flex items-center gap-4 justify-between md:justify-end shrink-0 pt-2 md:pt-0 border-t md:border-t-0 border-gray-100 dark:border-gray-800">
                    <div className="text-right">
                      <span
                        className={`inline-block px-3 py-1 rounded-xl text-xs font-extrabold border ${getScoreBadgeClass(
                          attempt.score_percentage
                        )}`}
                      >
                        {Math.round(attempt.score_percentage)}% Score
                      </span>
                      <span className="block text-[10px] text-gray-400 dark:text-gray-400 mt-0.5">
                        {accuracy}% Accuracy
                      </span>
                    </div>

                    <button
                      onClick={() => onOpenQuizResult(attempt.quiz_id)}
                      className="px-4 py-2 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#7372A5] hover:text-white dark:hover:bg-[#7372A5] text-gray-700 dark:text-gray-200 font-bold text-xs transition-all shadow-xs border border-[#d8d7e8] dark:border-[#312f45] flex items-center gap-1.5 cursor-pointer"
                    >
                      <span>Review Quiz</span>
                      <span className="material-symbols-outlined text-sm">arrow_forward</span>
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
