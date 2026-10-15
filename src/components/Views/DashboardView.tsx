import React from 'react';
import { ViewMode, Quiz, UserProfile, QuizResult } from '../../types';

interface DashboardViewProps {
  setCurrentView: (view: ViewMode) => void;
  userProfile: UserProfile;
  onStartQuiz: (quiz: Quiz) => void;
  onOpenQuizResult: (quizId: string) => void;
  sampleQuizzes: Quiz[];
  quizResults: QuizResult[];
  recentHistory: Array<{
    id: string;
    title: string;
    topic: string;
    score: number;
    date: string;
    icon: string;
    difficulty: string;
  }>;
  weakTopics?: Array<{
    topic: string;
    mastery_score: number;
    times_seen?: number;
  }>;
  onOpenUploadModal: () => void;
  onOpenCourseMap?: () => void;
  learnerDataError?: string | null;
  onRetryHydrate?: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  setCurrentView,
  userProfile,
  onStartQuiz,
  onOpenQuizResult,
  sampleQuizzes,
  quizResults,
  recentHistory,
  weakTopics = [],
  onOpenUploadModal,
  onOpenCourseMap,
  learnerDataError,
  onRetryHydrate,
}) => {
  const hasHistory = quizResults.length > 0 || recentHistory.length > 0;

  // Calculate real topic mastery stats
  const topicStats: Record<string, { correct: number; total: number }> = {};
  quizResults.forEach((result) => {
    const topic =
      sampleQuizzes.find((quiz) => quiz.id === result.quizId)?.topic ||
      result.quizTitle;

    if (!topicStats[topic]) {
      topicStats[topic] = { correct: 0, total: 0 };
    }
    topicStats[topic].correct += result.correctAnswersCount;
    topicStats[topic].total += result.totalQuestions;
  });

  const topicCount = Object.keys(topicStats).length;
  const topicMasteries = Object.values(topicStats).map(
    (stats) => (stats.correct / stats.total) * 100
  );
  const topicStrength =
    topicMasteries.length > 0
      ? Math.round(
          topicMasteries.reduce((sum, m) => sum + m, 0) / topicMasteries.length
        )
      : 0;

  const mostRecentQuiz = recentHistory[0];
  const weakestTopicItem = weakTopics.length > 0 ? weakTopics[0] : null;

  // Clean, real display name
  const studentName =
    userProfile.name?.trim() ||
    (userProfile.email ? userProfile.email.split('@')[0] : 'Learner');

  return (
    <div className="space-y-8 text-left animate-in fade-in duration-200">
      {/* ========================================================
          COMPACT WELCOME & ACTION BAR
      ======================================================== */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-[#161522] p-5 sm:p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] tracking-tight">
              Welcome back, {studentName}!
            </h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {hasHistory
              ? 'Continue your adaptive learning trajectory or explore new material.'
              : 'Begin your personalized journey with an adaptive practice quiz.'}
          </p>
        </div>

        {/* Quick Action Buttons */}
        <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
          <button
            onClick={onOpenUploadModal}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors shrink-0"
          >
            <span className="material-symbols-outlined text-base">upload_file</span>
            <span>Upload Material</span>
          </button>

          {onOpenCourseMap && (
            <button
              onClick={onOpenCourseMap}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors shrink-0 border border-[#d8d7e8] dark:border-[#312f45]"
            >
              <span className="material-symbols-outlined text-base text-[#7372A5] dark:text-[#a1a0d3]">
                account_tree
              </span>
              <span>Course Map</span>
            </button>
          )}

          <button
            onClick={() => setCurrentView('flashcards')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors shrink-0 border border-[#d8d7e8] dark:border-[#312f45]"
          >
            <span className="material-symbols-outlined text-base text-[#7372A5] dark:text-[#a1a0d3]">
              style
            </span>
            <span>Flashcards</span>
          </button>

          <button
            onClick={() => setCurrentView('quizzes-list')}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors shrink-0 border border-[#d8d7e8] dark:border-[#312f45]"
          >
            <span className="material-symbols-outlined text-base">quiz</span>
            <span>All Quizzes</span>
          </button>
        </div>
      </div>

      {learnerDataError && (
        <div className="p-4 rounded-2xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900/40 flex flex-col sm:flex-row items-center justify-between gap-3 text-rose-800 dark:text-rose-200">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-xl text-rose-600 dark:text-rose-400">
              error
            </span>
            <span className="text-xs font-semibold">{learnerDataError}</span>
          </div>
          {onRetryHydrate && (
            <button
              onClick={onRetryHydrate}
              className="px-3.5 py-1.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold transition-colors shadow-xs shrink-0"
            >
              Retry Loading History
            </button>
          )}
        </div>
      )}

      {/* ========================================================
          STAT CARDS BENTO GRID
      ======================================================== */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
        {/* Quizzes Attempted */}
        <div className="bg-white dark:bg-[#161522] p-4 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">quiz</span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
            Quizzes Attempted
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] mt-0.5 block">
            {userProfile.totalQuizzesAttempted}
          </span>
        </div>

        {/* Average Score */}
        <div className="bg-white dark:bg-[#161522] p-4 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">analytics</span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
            Average Score
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] mt-0.5 block">
            {hasHistory ? `${userProfile.averageScore}%` : '—'}
          </span>
        </div>

        {/* Best Score */}
        <div className="bg-white dark:bg-[#161522] p-4 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">trophy</span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
            Best Score
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] mt-0.5 block">
            {hasHistory ? `${userProfile.bestScore}%` : '—'}
          </span>
        </div>

        {/* Accuracy */}
        <div className="bg-white dark:bg-[#161522] p-4 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-blue-500/15 text-blue-600 dark:text-blue-400 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">published_with_changes</span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
            Accuracy Rate
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] mt-0.5 block">
            {hasHistory ? `${userProfile.accuracy}%` : '—'}
          </span>
        </div>

        {/* Topics Practiced */}
        <div className="bg-white dark:bg-[#161522] p-4 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs hover:border-[#7372A5]/50 transition-all col-span-2 sm:col-span-1">
          <div className="w-8 h-8 rounded-xl bg-purple-500/15 text-purple-600 dark:text-purple-400 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">category</span>
          </div>
          <span className="text-xs font-medium text-gray-500 dark:text-gray-400 block">
            Topics Covered
          </span>
          <span className="text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] mt-0.5 block">
            {hasHistory ? topicCount : '0'}
          </span>
        </div>
      </div>

      {/* ========================================================
          ONBOARDING STATE (No History Yet)
      ======================================================== */}
      {!hasHistory ? (
        <div className="bg-white dark:bg-[#161522] p-8 sm:p-10 rounded-3xl border border-dashed border-[#d8d7e8] dark:border-[#312f45] shadow-xs text-center space-y-6">
          <div className="w-16 h-16 rounded-3xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center mx-auto shadow-xs border border-[#d8d7e8] dark:border-[#312f45]">
            <span className="material-symbols-outlined text-3xl">school</span>
          </div>

          <div className="max-w-xl mx-auto space-y-2">
            <h2 className="text-xl sm:text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] tracking-tight">
              Start Your First Adaptive Practice Quiz
            </h2>
            <p className="text-xs sm:text-sm text-gray-500 dark:text-gray-400 leading-relaxed">
              Flexdemy tracks your progress across topics as you practise. Upload your course lecture notes or slides to generate customized questions, or try a sample quiz.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={onOpenUploadModal}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-md transition-all hover:scale-[1.02]"
            >
              <span className="material-symbols-outlined text-lg">upload_file</span>
              <span>Upload Notes & Generate Quiz</span>
            </button>

            <button
              onClick={() => onStartQuiz(sampleQuizzes[0])}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3 rounded-2xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors border border-[#d8d7e8] dark:border-[#312f45]"
            >
              <span className="material-symbols-outlined text-lg">play_arrow</span>
              <span>Try Demo Python Quiz</span>
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-6 border-t border-[#ececf4] dark:border-[#252436] text-left">
            <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] space-y-1">
              <span className="material-symbols-outlined text-[#7372A5] dark:text-[#a1a0d3] text-xl">
                folder_open
              </span>
              <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">1. Multi-Format Upload</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                PDFs, PPTX slides, text notes, and video transcripts are chunked with exact citations.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] space-y-1">
              <span className="material-symbols-outlined text-emerald-500 text-xl">
                psychology
              </span>
              <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">2. Adaptive Mastery</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Question difficulty adapts in real time based on your streak and misconception tags.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] space-y-1">
              <span className="material-symbols-outlined text-purple-500 text-xl">
                insights
              </span>
              <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">3. Target Weak Topics</p>
              <p className="text-[11px] text-gray-500 dark:text-gray-400">
                Persistent BKT analytics surface your weak topics for targeted revision and flashcards.
              </p>
            </div>
          </div>
        </div>
      ) : (
        /* ========================================================
            RETURNING LEARNER DASHBOARD (With Real History)
        ======================================================== */
        <div className="space-y-8">
          {/* Continue Learning & Recommended Action Row */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Continue Learning Card */}
            {mostRecentQuiz ? (
              <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs flex flex-col justify-between space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#7372A5] dark:text-[#a1a0d3] px-2.5 py-0.5 rounded-full bg-[#ececf4] dark:bg-[#252436] border border-[#d8d7e8] dark:border-[#312f45]">
                    Continue Learning
                  </span>
                  <span className="text-[11px] text-gray-400">{mostRecentQuiz.date}</span>
                </div>

                <div>
                  <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
                    {mostRecentQuiz.title}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Topic: {mostRecentQuiz.topic} • Score: {mostRecentQuiz.score}%
                  </p>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <button
                    onClick={() => onOpenQuizResult(mostRecentQuiz.id)}
                    className="flex-1 py-2.5 rounded-xl bg-[#ececf4] dark:bg-[#252436] hover:bg-[#d8d7e8] dark:hover:bg-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs transition-colors text-center border border-[#d8d7e8] dark:border-[#312f45]"
                  >
                    Review Insights
                  </button>
                  <button
                    onClick={onOpenUploadModal}
                    className="flex-1 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors text-center"
                  >
                    Practice More
                  </button>
                </div>
              </div>
            ) : null}

            {/* Recommended Action / Weak Topic Prompt */}
            <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs flex flex-col justify-between space-y-4">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-amber-600 dark:text-amber-400 px-2.5 py-0.5 rounded-full bg-amber-500/10 border border-amber-500/30">
                  Recommended Action
                </span>
                <span className="material-symbols-outlined text-amber-500 text-lg">lightbulb</span>
              </div>

              <div>
                {weakestTopicItem ? (
                  <>
                    <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
                      Revise Weak Topic: {weakestTopicItem.topic}
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      Your current mastery for this topic is{' '}
                      <strong className="text-amber-600 dark:text-amber-400">
                        {Math.round(weakestTopicItem.mastery_score * 100)}%
                      </strong>
                      . Practising this topic will help reinforce your understanding before exams.
                    </p>
                  </>
                ) : (
                  <>
                    <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
                      Explore Learning Paths
                    </h3>
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 leading-relaxed">
                      Visualize topic connections and recommended learning sequences across your course documents.
                    </p>
                  </>
                )}
              </div>

              <div className="pt-2">
                <button
                  onClick={weakestTopicItem ? onOpenUploadModal : onOpenCourseMap}
                  className="w-full py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-bold text-xs shadow-xs transition-colors text-center"
                >
                  {weakestTopicItem ? 'Practice Weak Topic' : 'Open Learning Path'}
                </button>
              </div>
            </div>
          </div>

          {/* Performance Overview & Recent Quizzes Grid */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* Donut Charts Column */}
            <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
                  Performance Overview
                </h3>
                <button
                  onClick={() => setCurrentView('analytics')}
                  className="text-xs text-[#7372A5] dark:text-[#a1a0d3] font-bold hover:underline"
                >
                  View Detailed Analytics
                </button>
              </div>

              <div className="grid grid-cols-2 gap-6 items-center text-center">
                {/* Overall Donut */}
                <div className="space-y-2">
                  <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#ececf4] dark:text-[#252436]"
                        strokeWidth="3.8"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-[#7372A5] dark:text-[#a1a0d3]"
                        strokeDasharray={`${userProfile.averageScore}, 100`}
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-xl font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                        {userProfile.averageScore}%
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">Overall</span>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                    Average Score
                  </p>
                </div>

                {/* Topic Strength Donut */}
                <div className="space-y-2">
                  <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                    <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                      <path
                        className="text-[#ececf4] dark:text-[#252436]"
                        strokeWidth="3.8"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                      <path
                        className="text-emerald-500"
                        strokeDasharray={`${topicStrength}, 100`}
                        strokeWidth="3.8"
                        strokeLinecap="round"
                        stroke="currentColor"
                        fill="none"
                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                      />
                    </svg>
                    <div className="absolute flex flex-col items-center">
                      <span className="text-xl font-extrabold text-[#222138] dark:text-[#f2f1f8]">
                        {topicStrength}%
                      </span>
                      <span className="text-[10px] text-gray-400 font-semibold">Mastery</span>
                    </div>
                  </div>
                  <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                    Topic Strength
                  </p>
                </div>
              </div>
            </div>

            {/* Recent Quizzes Column */}
            <div className="bg-white dark:bg-[#161522] p-6 rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
                  Recent Completed Quizzes
                </h3>
                <button
                  onClick={() => setCurrentView('quizzes-list')}
                  className="text-xs text-[#7372A5] dark:text-[#a1a0d3] font-bold hover:underline"
                >
                  See All
                </button>
              </div>

              <div className="space-y-2.5">
                {recentHistory.slice(0, 4).map((q) => (
                  <div
                    key={q.id}
                    className="flex items-center justify-between p-3 rounded-2xl bg-[#fcf8ff] dark:bg-[#1a1926] border border-[#d8d7e8] dark:border-[#312f45] hover:bg-[#ececf4]/50 dark:hover:bg-[#252338]/50 transition-colors"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center font-bold shrink-0">
                        <span className="material-symbols-outlined text-lg">{q.icon}</span>
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-xs text-[#222138] dark:text-[#f2f1f8] truncate">
                          {q.title}
                        </h4>
                        <p className="text-[11px] text-gray-400 truncate">
                          {q.topic} • {q.date}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2.5 shrink-0">
                      <span
                        className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                          q.score >= 80
                            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
                            : q.score >= 70
                            ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400'
                            : 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                        }`}
                      >
                        {q.score}%
                      </span>
                      <button
                        onClick={() => onOpenQuizResult(q.id)}
                        className="text-xs text-[#7372A5] dark:text-[#a1a0d3] hover:underline font-bold"
                      >
                        Review
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
