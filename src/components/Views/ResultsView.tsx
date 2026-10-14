import React, { useState } from 'react';
import { Quiz, QuizResult, ViewMode } from '../../types';

const isAiQuestion = (q: { backendQuestion?: Record<string, unknown> }) =>
  Boolean(q.backendQuestion);

const isMcq = (q: { questionType?: string }) =>
  !q.questionType || q.questionType === 'mcq';

interface Flashcard {
  front: string;
  back: string;
  source_locator: string;
}

interface ResultsViewProps {
  quizResult: QuizResult;
  quiz: Quiz;
  setCurrentView: (view: ViewMode) => void;
  dyslexiaMode: boolean;
  setDyslexiaMode: (enabled: boolean) => void;
  onRetakeQuiz: () => void;
  onStartAnotherQuiz: () => void;
  sessionId?: string;
  initialTab?: 'review' | 'insights';
}

export const ResultsView: React.FC<ResultsViewProps> = ({
  quizResult,
  quiz,
  setCurrentView,
  dyslexiaMode,
  setDyslexiaMode,
  onRetakeQuiz,
  onStartAnotherQuiz,
  sessionId,
  initialTab,
}) => {
  const [activeTab, setActiveTab] = useState<'review' | 'insights'>(
    initialTab || 'review'
  );
  const [flashcardsByTopic, setFlashcardsByTopic] = useState<
    Record<string, Flashcard[]>
  >({});
  const [flashcardsLoading, setFlashcardsLoading] = useState<
    Record<string, boolean>
  >({});
  const [flashcardsError, setFlashcardsError] = useState<
    Record<string, string>
  >({});
  const [flippedCards, setFlippedCards] = useState<Record<string, boolean>>(
    {}
  );

  const fetchFlashcards = async (topic: string) => {
    if (!sessionId || flashcardsLoading[topic]) return;

    setFlashcardsLoading((prev) => ({ ...prev, [topic]: true }));
    setFlashcardsError((prev) => ({ ...prev, [topic]: '' }));

    try {
      const response = await fetch('/api/generate-flashcards', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ session_id: sessionId, topic, count: 5 }),
      });

      if (!response.ok) {
        throw new Error('Could not generate flashcards for this topic.');
      }

      const data = await response.json();
      setFlashcardsByTopic((prev) => ({
        ...prev,
        [topic]: data.flashcards || [],
      }));
    } catch (err) {
      setFlashcardsError((prev) => ({
        ...prev,
        [topic]:
          err instanceof Error
            ? err.message
            : 'Could not generate flashcards.',
      }));
    } finally {
      setFlashcardsLoading((prev) => ({ ...prev, [topic]: false }));
    }
  };

  const [explanations, setExplanations] = useState<
    Record<number, { text: string; sourceLocator: string; topic: string }>
  >({});
  const [explanationLoading, setExplanationLoading] = useState<Record<number, boolean>>({});
  const [explanationError, setExplanationError] = useState<Record<number, string>>({});

  const [summary, setSummary] = useState<string | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  const optionLetters = ['A', 'B', 'C', 'D'];

  const fetchExplanation = async (
    q: Quiz['questions'][number],
    selectedOptionIndex: number
  ) => {
    if (!q.backendQuestion) return;

    setExplanationLoading((prev) => ({ ...prev, [q.id]: true }));
    setExplanationError((prev) => ({ ...prev, [q.id]: '' }));

    try {
      const response = await fetch('/api/explain-answer', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          question: q.backendQuestion,
          selected_option_index: selectedOptionIndex,
        }),
      });

      if (!response.ok) {
        throw new Error('Could not generate an explanation.');
      }

      const data = await response.json();

      setExplanations((prev) => ({
        ...prev,
        [q.id]: {
          text: data.explanation,
          sourceLocator: data.source_locator || '',
          topic: data.topic || '',
        },
      }));
    } catch (err) {
      setExplanationError((prev) => ({
        ...prev,
        [q.id]: err instanceof Error ? err.message : 'Could not generate an explanation.',
      }));
    } finally {
      setExplanationLoading((prev) => ({ ...prev, [q.id]: false }));
    }
  };

  const fetchSummary = async () => {
    if (summary || summaryLoading) return;

    setSummaryLoading(true);
    setSummaryError('');

    try {
      const concepts = quizResult.topicBreakdown.map((t) => ({
        concept_label: t.topicName,
        final_difficulty: (quiz.difficulty || 'medium').toLowerCase(),
        accuracy: t.masteryPercentage / 100,
        question_count: t.total,
      }));

      const weakestConceptLabels = [...quizResult.topicBreakdown]
        .sort((a, b) => a.masteryPercentage - b.masteryPercentage)
        .slice(0, 3)
        .map((t) => t.topicName);

      const response = await fetch('/api/quiz-summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          report_data: {
            concepts,
            weakest_concept_labels: weakestConceptLabels,
          },
        }),
      });

      if (!response.ok) {
        throw new Error('Could not generate the performance report.');
      }

      const data = await response.json();
      setSummary(data.summary);
    } catch (err) {
      setSummaryError(
        err instanceof Error ? err.message : 'Could not generate the performance report.'
      );
    } finally {
      setSummaryLoading(false);
    }
  };

  const handleTabChange = (tab: 'review' | 'insights') => {
    setActiveTab(tab);
    if (tab === 'insights') {
      fetchSummary();
    }
  };

  return (
    <div className="min-h-screen bg-[#f6f6fa] text-left">
      
      {/* Top Header */}
      <header className="bg-white border-b border-[#d8d7e8] px-6 py-3.5 sticky top-0 z-30 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setCurrentView('dashboard')} className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl bg-[#7372A5] flex items-center justify-center text-white shadow-md">
              <span className="material-symbols-outlined text-xl">bolt</span>
            </div>
            <span className="text-xl font-bold tracking-tight text-[#222138]">
              Flex<span className="text-[#7372A5]">demy</span>
            </span>
          </button>
          
          
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 bg-[#ececf4] px-3 py-1.5 rounded-xl border border-[#d8d7e8]">
            <span className="material-symbols-outlined text-[#7372A5] text-base">visibility</span>
            <span className="text-xs text-gray-700 font-medium hidden md:inline">Dyslexia Mode: </span>
            <span className={`text-xs font-bold ${dyslexiaMode ? 'text-[#7372A5]' : 'text-gray-500'}`}>
              {dyslexiaMode ? 'ON' : 'OFF'}
            </span>
            <button
              onClick={() => setDyslexiaMode(!dyslexiaMode)}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full transition-colors ${
                dyslexiaMode ? 'bg-[#7372A5]' : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
                  dyslexiaMode ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        </div>
      </header>

      {/* Main Grid */}
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left Performance Hub Navigation */}
        <div className="lg:col-span-1 space-y-4">
          <div className="bg-white p-4 rounded-2xl border border-[#d8d7e8] shadow-xs space-y-2">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-3 mb-1">
              Performance Hub
            </p>
            <button
              onClick={() => handleTabChange('review')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'review'
                  ? 'bg-[#ececf4] text-[#7372A5]'
                  : 'text-gray-600 hover:bg-[#ececf4]'
              }`}
            >
              <span className="material-symbols-outlined text-lg">fact_check</span>
              <span>Question Review</span>
            </button>

            <button
              onClick={() => handleTabChange('insights')}
              className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-bold transition-all ${
                activeTab === 'insights'
                  ? 'bg-[#ececf4] text-[#7372A5]'
                  : 'text-gray-600 hover:bg-[#ececf4]'
              }`}
            >
              <span className="material-symbols-outlined text-lg">insights</span>
              <span>Topic Mastery</span>
            </button>
          </div>

          <div className="bg-[#222138] p-5 rounded-2xl text-white space-y-3">
            <h4 className="font-bold text-sm">Want to improve your score?</h4>
            <p className="text-xs text-gray-300 leading-relaxed">
              Retake this quiz to reinforce weak areas or generate a new AI adaptive quiz.
            </p>
            <button
              onClick={onRetakeQuiz}
              className="w-full py-2 bg-[#7372A5] text-white hover:bg-[#585785] rounded-xl text-xs font-bold shadow-xs transition-colors"
            >
              Retake Quiz
            </button>
          </div>
        </div>

        {/* Center/Right Main Section */}
        <div className="lg:col-span-3 space-y-6">
          
          {/* Result Hero Banner */}
          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#d8d7e8] shadow-md space-y-6">
            <div className="text-center space-y-2">
              <span className="text-3xl">🎉</span>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-[#222138]">
                Great Job! You completed the quiz.
              </h2>
              <p className="text-xs text-gray-500 font-medium">
                {quiz.title} • Completed in {Math.floor(quizResult.timeSpentSeconds / 60)}m {quizResult.timeSpentSeconds % 60}s
              </p>
            </div>

            {/* Score Cards Row */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 items-center bg-[#f6f6fa] p-6 rounded-2xl border border-[#d8d7e8] text-center">
              
              {/* Score Donut */}
              <div className="space-y-1">
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
                      className={quizResult.scorePercentage >= 70 ? 'text-emerald-500' : 'text-amber-500'}
                      strokeDasharray={`${quizResult.scorePercentage}, 100`}
                      strokeWidth="3.8"
                      strokeLinecap="round"
                      stroke="currentColor"
                      fill="none"
                      d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                    />
                  </svg>
                  <div className="absolute flex flex-col items-center">
                    <span className="text-2xl font-extrabold text-[#222138]">{quizResult.scorePercentage}%</span>
                    <span className="text-[10px] text-gray-400 font-semibold">Overall</span>
                  </div>
                </div>
                <span className="text-xs font-bold text-gray-700 block">Final Score</span>
              </div>

              {/* Correct Answers */}
              <div className="bg-emerald-50 border border-emerald-100 p-4 rounded-xl">
                <span className="material-symbols-outlined text-emerald-600 text-2xl mb-1">check_circle</span>
                <span className="text-2xl font-extrabold text-emerald-800 block">
                  {quizResult.correctAnswersCount} / {quizResult.totalQuestions}
                </span>
                <span className="text-xs font-bold text-emerald-700">Correct Answers</span>
              </div>

              {/* Incorrect Answers */}
              <div className="bg-rose-50 border border-rose-100 p-4 rounded-xl">
                <span className="material-symbols-outlined text-rose-600 text-2xl mb-1">cancel</span>
                <span className="text-2xl font-extrabold text-rose-800 block">
                  {quizResult.incorrectAnswersCount} / {quizResult.totalQuestions}
                </span>
                <span className="text-xs font-bold text-rose-700">Incorrect Answers</span>
              </div>

            </div>

            {/* Quick Action Buttons */}
            <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
              <button
                onClick={() => setCurrentView('dashboard')}
                className="px-6 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
              >
                Go to Dashboard
              </button>

              <button
                onClick={onStartAnotherQuiz}
                className="px-6 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-base">upload_file</span>
                <span>Upload Material / Quizzes</span>
              </button>
            </div>
          </div>

          {/* Question Review List */}
          {activeTab === 'review' && (
          <div className="space-y-4">
            <h3 className="font-extrabold text-lg text-[#222138]">Question Review & Explanations</h3>

            <div className="space-y-4">
              {quiz.questions.map((q, idx) => {
                const userSelected = quizResult.userAnswers[q.id];

                const openEndedResult = quizResult.openEndedResults?.[q.id];

                const isCorrect =
                  openEndedResult !== undefined
                    ? openEndedResult
                    : userSelected === q.correctAnswerIndex;

                return (
                  <div
                    key={q.id}
                    className={`bg-white rounded-2xl p-6 border-2 shadow-xs space-y-3 ${
                      isCorrect ? 'border-emerald-200' : 'border-rose-200'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-center gap-2.5">
                        <span
                          className={`w-7 h-7 rounded-lg text-white font-bold text-xs flex items-center justify-center ${
                            isCorrect ? 'bg-emerald-500' : 'bg-rose-500'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        <h4 className="font-bold text-sm text-[#222138]">{q.question}</h4>
                      </div>

                      <span
                        className={`text-xs font-bold px-3 py-1 rounded-full shrink-0 flex items-center gap-1 ${
                          isCorrect ? 'bg-emerald-100 text-emerald-800' : 'bg-rose-100 text-rose-800'
                        }`}
                      >
                        <span className="material-symbols-outlined text-sm">
                          {isCorrect ? 'check' : 'close'}
                        </span>
                        <span>{isCorrect ? 'Correct' : 'Incorrect'}</span>
                      </span>
                    </div>

                    {!isMcq(q) && (
                      <p className="text-xs text-gray-400 italic pt-2">
                        Open-ended question — graded by the tutor during the quiz.
                      </p>
                    )}

                    {/* Options list */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                      {q.options.map((opt, optIdx) => {
                        const isUserChoice = userSelected === optIdx;
                        const isCorrectChoice = q.correctAnswerIndex === optIdx;

                        return (
                          <div
                            key={optIdx}
                            className={`p-3 rounded-xl border text-xs font-semibold flex items-center justify-between ${
                              isCorrectChoice
                                ? 'bg-emerald-50 border-emerald-300 text-emerald-900 font-bold'
                                : isUserChoice
                                ? 'bg-rose-50 border-rose-300 text-rose-900 font-bold'
                                : 'bg-gray-50 border-gray-200 text-gray-500'
                            }`}
                          >
                            <span>
                              {optionLetters[optIdx]}. {opt}
                            </span>
                            {isCorrectChoice && (
                              <span className="text-[10px] uppercase font-bold text-emerald-700 bg-emerald-200 px-2 py-0.5 rounded-full">
                                Correct Answer
                              </span>
                            )}
                            {isUserChoice && !isCorrectChoice && (
                              <span className="text-[10px] uppercase font-bold text-rose-700 bg-rose-200 px-2 py-0.5 rounded-full">
                                Your Answer
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {isMcq(q) && !isCorrect && isAiQuestion(q) && (
                      <div className="pt-2">
                        {explanations[q.id] ? (
                          <div className="text-xs text-gray-600 bg-[#f6f6fa] rounded-xl p-3 leading-relaxed">
                            <p>{explanations[q.id].text}</p>
                            {explanations[q.id].sourceLocator && (
                              <p className="mt-2 text-[10px] font-bold text-[#7372A5] uppercase tracking-wider">
                                Source: {explanations[q.id].sourceLocator}
                              </p>
                            )}
                          </div>
                        ) : (
                          <button
                            onClick={() =>
                              fetchExplanation(
                                q,
                                userSelected ?? 0
                              )
                            }
                            disabled={explanationLoading[q.id]}
                            className="text-xs font-bold text-[#7372A5] underline disabled:opacity-50"
                          >
                            {explanationLoading[q.id]
                              ? 'Generating explanation...'
                              : 'Get AI explanation'}
                          </button>
                        )}

                        {explanationError[q.id] && (
                          <p className="text-xs text-rose-600 mt-1">
                            {explanationError[q.id]}
                          </p>
                        )}
                      </div>
                    )}

                  </div>
                );
              })}
            </div>
          </div>
          )}

          {/* Topic Mastery / AI Insights */}
          {activeTab === 'insights' && (
          <div className="space-y-4">
            <h3 className="font-extrabold text-lg text-[#222138]">Topic Mastery</h3>

            <div className="bg-white rounded-2xl p-6 border border-[#d8d7e8] shadow-xs space-y-4">
              {quizResult.topicBreakdown
                .slice()
                .sort((a, b) => a.masteryPercentage - b.masteryPercentage)
                .map((topic) => (
                  <div key={topic.topicName} className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold text-[#222138]">{topic.topicName}</span>
                      <span className="font-semibold text-gray-500">
                        {topic.score}/{topic.total} · {topic.masteryPercentage}%
                      </span>
                    </div>
                    <div className="w-full bg-[#ececf4] h-2.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          topic.masteryPercentage < 40
                            ? 'bg-red-400'
                            : topic.masteryPercentage < 75
                            ? 'bg-amber-400'
                            : 'bg-emerald-400'
                        }`}
                        style={{ width: `${topic.masteryPercentage}%` }}
                      />
                    </div>

                    {topic.masteryPercentage < 75 && sessionId && (
                      <div className="pt-1">
                        {!flashcardsByTopic[topic.topicName] ? (
                          <button
                            onClick={() => fetchFlashcards(topic.topicName)}
                            disabled={flashcardsLoading[topic.topicName]}
                            className="text-[11px] font-bold text-[#7372A5] underline disabled:opacity-50"
                          >
                            {flashcardsLoading[topic.topicName]
                              ? 'Generating flashcards...'
                              : 'Get revision flashcards'}
                          </button>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 mt-2">
                            {flashcardsByTopic[topic.topicName].map((card, idx) => {
                              const key = `${topic.topicName}-${idx}`;
                              const flipped = flippedCards[key];
                              return (
                                <button
                                  key={key}
                                  onClick={() =>
                                    setFlippedCards((prev) => ({
                                      ...prev,
                                      [key]: !prev[key],
                                    }))
                                  }
                                  className="text-left bg-[#f6f6fa] hover:bg-[#ececf4] border border-[#d8d7e8] rounded-xl p-3 text-[11px] text-[#222138] min-h-[70px]"
                                >
                                  {flipped ? (
                                    <>
                                      <p>{card.back}</p>
                                      {card.source_locator && (
                                        <p className="mt-1 text-[10px] text-[#7372A5] font-bold">
                                          Source: {card.source_locator}
                                        </p>
                                      )}
                                    </>
                                  ) : (
                                    <p className="font-semibold">{card.front}</p>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {flashcardsError[topic.topicName] && (
                          <p className="text-[11px] text-rose-600 mt-1">
                            {flashcardsError[topic.topicName]}
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                ))}
            </div>

            <div className="bg-white rounded-2xl p-6 border border-[#d8d7e8] shadow-xs space-y-2">
              <h4 className="font-bold text-sm text-[#222138]">AI Performance Summary</h4>

              {summaryLoading && (
                <p className="text-xs text-gray-400">Analyzing your performance...</p>
              )}

              {summaryError && (
                <p className="text-xs text-rose-600">{summaryError}</p>
              )}

              {summary && (
                <p className="text-xs text-gray-600 leading-relaxed">{summary}</p>
              )}

              {!summary && !summaryLoading && !summaryError && (
                <p className="text-xs text-gray-400">
                  Switch to this tab to generate a summary of your weak topics and likely misconceptions.
                </p>
              )}
            </div>
          </div>
          )}

        </div>

      </div>

    </div>
  );
};
