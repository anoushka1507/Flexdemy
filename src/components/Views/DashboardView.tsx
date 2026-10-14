import React from 'react';
import { ViewMode, Quiz, UserProfile, QuizResult } from '../../types';


interface DashboardViewProps {
  setCurrentView: (view: ViewMode) => void;
  userProfile: UserProfile;
  onStartQuiz: (quiz: Quiz) => void;
  onOpenQuizResult: (quizId: string) => void;
  sampleQuizzes: Quiz[];
  quizResults: QuizResult[];
  recentHistory: Array<{ id: string; title: string; topic: string; score: number; date: string; icon: string; difficulty: string }>;
  onOpenUploadModal: () => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  setCurrentView,
  userProfile,
  onStartQuiz,
  onOpenQuizResult,
  sampleQuizzes,
  quizResults,
  recentHistory,
  onOpenUploadModal,
}) => {
  const pythonQuiz = sampleQuizzes.find((q) => q.id === 'python-basics') || sampleQuizzes[0];
  const topicStats: Record<string, { correct: number; total: number }> = {};

quizResults.forEach((result) => {
  const topic = sampleQuizzes.find(
    (quiz) => quiz.id === result.quizId
  )?.topic || result.quizTitle;

  if (!topicStats[topic]) {
    topicStats[topic] = {
      correct: 0,
      total: 0,
    };
  }

  topicStats[topic].correct += result.correctAnswersCount;
  topicStats[topic].total += result.totalQuestions;
});

const topicMasteries = Object.values(topicStats).map(
  (stats) => (stats.correct / stats.total) * 100
);

const topicStrength =
  topicMasteries.length > 0
    ? Math.round(
        topicMasteries.reduce(
          (sum, mastery) => sum + mastery,
          0
        ) / topicMasteries.length
      )
    : 0;

  return (
    <div className="space-y-8 text-left">
      
      {/* Top Greeting Banner */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-6 rounded-3xl border border-[#d8d7e8] shadow-xs">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[#222138] tracking-tight">
            Welcome back! 
          </h1>
          <p className="text-xs sm:text-sm text-gray-500 mt-1">
            Let's keep learning and improving your quiz accuracy today.
          </p>
        </div>
      </div>

      {/* 6 Stat Cards Bento Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-4">
        
        <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">quiz</span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">Quizzes Attempted</span>
          <span className="text-2xl font-extrabold text-[#222138] mt-0.5 block">
           {userProfile.totalQuizzesAttempted}
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">analytics</span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">Average Score</span>
          <span className="text-2xl font-extrabold text-[#222138] mt-0.5 block">
            {userProfile.averageScore}%
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">trophy</span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">Best Score</span>
          <span className="text-2xl font-extrabold text-[#222138] mt-0.5 block">
            {userProfile.bestScore}%
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">published_with_changes</span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">Accuracy</span>
          <span className="text-2xl font-extrabold text-[#222138] mt-0.5 block">
            {userProfile.accuracy}%
          </span>
        </div>

        <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-xs hover:border-[#7372A5]/50 transition-all">
          <div className="w-8 h-8 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center mb-2">
            <span className="material-symbols-outlined text-lg">flag</span>
          </div>
          <span className="text-xs font-medium text-gray-500 block">Overall Progress</span>
          <span className="text-2xl font-extrabold text-[#222138] mt-0.5 block">
            {userProfile.overallProgress}%
          </span>
        </div>

      </div>

      


      {/* Grid: Performance Donut & Recent Quizzes */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Donut Charts Column */}
        <div className="bg-white p-6 rounded-3xl border border-[#d8d7e8] shadow-xs space-y-6">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base text-[#222138]">Performance Overview</h3>
            <button onClick={() => setCurrentView('analytics')} className="text-xs text-[#7372A5] font-bold hover:underline">
              View Detailed Analytics
            </button>
          </div>

          <div className="grid grid-cols-2 gap-6 items-center text-center">
            {/* Overall Donut */}
            <div className="space-y-2">
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#ececf4]"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  <path
                    className="text-[#7372A5]"
                    strokeDasharray={`${userProfile.averageScore}, 100`}
                    strokeWidth="3.8"
                    strokeLinecap="round"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center">
                  <span className="text-xl font-extrabold text-[#222138]">
                    {userProfile.averageScore}%
                  </span>
                  <span className="text-[10px] text-gray-400 font-semibold">Overall</span>
                </div>
              </div>
              <p className="text-xs font-bold text-[#222138]">Overall Score</p>
            </div>

            {/* Topic Strength Donut */}
            <div className="space-y-2">
              <div className="relative w-28 h-28 mx-auto flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  <path
                    className="text-[#ececf4]"
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
                  <span className="text-xl font-extrabold text-[#222138]">
                    {topicStrength}%
                  </span>
                  <span className="text-[10px] text-gray-400 font-semibold">Topic Mastery</span>
                </div>
              </div>
              <p className="text-xs font-bold text-[#222138]">Topic Strength</p>
            </div>
          </div>
        </div>

        {/* Recent Quizzes Column */}
        <div className="bg-white p-6 rounded-3xl border border-[#d8d7e8] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-extrabold text-base text-[#222138]">Recent Quizzes</h3>
            <button onClick={() => setCurrentView('quizzes-list')} className="text-xs text-[#7372A5] font-bold hover:underline">
              See All Quizzes
            </button>
          </div>

          <div className="space-y-3">
            {recentHistory.map((q) => (
              <div
                key={q.id}
                className="flex items-center justify-between p-3 rounded-2xl bg-[#f6f6fa] border border-[#d8d7e8] hover:bg-[#ececf4]/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[#ececf4] text-[#7372A5] flex items-center justify-center font-bold">
                    <span className="material-symbols-outlined text-xl">{q.icon}</span>
                  </div>
                  <div>
                    <h4 className="font-bold text-xs text-[#222138]">{q.title}</h4>
                    <p className="text-[11px] text-gray-400">{q.topic} • {q.date}</p>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <span
                    className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      q.score >= 80
                        ? 'bg-emerald-100 text-emerald-700'
                        : q.score >= 70
                        ? 'bg-amber-100 text-amber-700'
                        : 'bg-rose-100 text-rose-700'
                    }`}
                  >
                    {q.score}%
                  </span>
                  <button
                    onClick={() => onOpenQuizResult(q.id)}
                    className="text-xs text-[#7372A5] hover:underline font-bold"
                  >
                    View Results
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

    </div>
  );
};
