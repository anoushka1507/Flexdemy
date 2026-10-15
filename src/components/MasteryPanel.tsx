import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { apiFetch } from '../utils/api';
import { WeakTopicRevisionModal } from './WeakTopicRevisionModal';

interface TopicMastery {
  mastery_score: number;
  times_seen: number;
  last_updated: string;
}

interface MasteryPanelProps {
  onStartDiagnostic?: () => void;
  onStartPracticeQuiz?: (topic: string) => void;
}

export const MasteryPanel: React.FC<MasteryPanelProps> = ({
  onStartDiagnostic,
  onStartPracticeQuiz,
}) => {
  const [mastery, setMastery] = useState<Record<string, TopicMastery> | null>(
    null
  );
  const [isNewStudent, setIsNewStudent] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [examDays, setExamDays] = useState(7);
  const [dailyMinutes, setDailyMinutes] = useState(45);
  const [scheduleData, setScheduleData] = useState<any | null>(null);
  const [scheduleLoading, setScheduleLoading] = useState(false);
  const [revisionTopic, setRevisionTopic] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const response = await apiFetch('/api/mastery', { requireAuth: true });

        if (!response.ok) {
          const text = await response.text();
          let message = 'Could not load your mastery profile.';
          try {
            const parsed = JSON.parse(text);
            message = parsed?.detail || message;
          } catch {
            if (text) message = text;
          }
          throw new Error(message);
        }

        const data = await response.json();
        if (mounted) {
          setMastery(data.topics || {});
          setIsNewStudent(Boolean(data.is_new_student));
        }

        // Hydrate saved schedule and preferences
        const prefRes = await apiFetch('/api/user-preferences');
        if (prefRes.ok) {
          const prefData = await prefRes.json();
          if (mounted && prefData.preferences) {
            if (prefData.preferences.saved_schedule) {
              setScheduleData(prefData.preferences.saved_schedule);
            }
            if (prefData.preferences.daily_minutes) {
              setDailyMinutes(prefData.preferences.daily_minutes);
            }
          }
        }
      } catch (err) {
        if (mounted) {
          setError(
            err instanceof Error
              ? err.message
              : 'Could not load your mastery profile.'
          );
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    load();
    return () => {
      mounted = false;
    };
  }, []);

  const handleGenerateSchedule = async () => {
    setScheduleLoading(true);
    try {
      const res = await apiFetch('/api/study-schedule', {
        method: 'POST',
        body: JSON.stringify({
          days_until_exam: examDays,
          daily_minutes: dailyMinutes,
        }),
      });
      if (res.ok) {
        const data = await res.json();
        setScheduleData(data);
      }
    } catch (err) {
      console.error('Study schedule error:', err);
    } finally {
      setScheduleLoading(false);
    }
  };

  const handleToggleTask = async (taskId: string, currentCompleted: boolean) => {
    const newStatus = currentCompleted ? 'uncompleted' : 'completed';
    // Optimistic local update
    setScheduleData((prev: any) => {
      if (!prev || !prev.schedule) return prev;
      return {
        ...prev,
        schedule: prev.schedule.map((dayPlan: any) => ({
          ...dayPlan,
          tasks: dayPlan.tasks.map((task: any) =>
            task.id === taskId ? { ...task, completed: !currentCompleted } : task
          ),
        })),
      };
    });

    try {
      await apiFetch('/api/study-schedule/task-status', {
        method: 'POST',
        body: JSON.stringify({
          task_id: taskId,
          status: newStatus,
        }),
      });
    } catch (err) {
      console.error('Failed to update task status:', err);
    }
  };

  if (loading) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-purple-100 shadow-xs">
        <p className="text-xs text-gray-500">Loading mastery profile...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-purple-100 shadow-xs">
        <p className="text-xs text-gray-500">{error}</p>
      </div>
    );
  }

  const topics = Object.entries(mastery || {}).sort(
    ([, a], [, b]) => a.mastery_score - b.mastery_score
  );

  if (topics.length === 0) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-purple-100 shadow-xs space-y-4">
        {isNewStudent ? (
          <div className="space-y-3">
            <p className="text-xs font-bold text-[var(--brand-primary)]">
              Find your starting level
            </p>
            <h4 className="font-extrabold text-sm text-[var(--text-primary)]">
              Personalise Your Learning Journey
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              Take a quick placement quiz (1 question per key topic) to find your starting level and personalise your practice recommendations.
            </p>
            {onStartDiagnostic && (
              <button
                onClick={onStartDiagnostic}
                className="mt-2 px-5 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                <span>Start Placement Quiz</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              No topic progress yet — complete a practice quiz to start seeing your strengths and topics to revise.
            </p>
            {onStartDiagnostic && (
              <button
                onClick={onStartDiagnostic}
                className="mt-2 px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">quiz</span>
                <span>Find Your Starting Level</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Topic Mastery Progress Card */}
      <div className="bg-white p-8 rounded-3xl border border-[#d8d7e8] shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-extrabold text-[#222138]">
              Your Progress by Topic
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Tracks your understanding across topics as you answer practice questions.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          {topics.map(([topic, info]) => {
            const percent = Math.round(info.mastery_score * 100);

            const statusLabel =
              percent < 40
                ? 'Needs practice'
                : percent < 75
                ? 'Making progress'
                : 'Mastered';

            const statusTextColor =
              percent < 40
                ? 'text-[var(--error-text)]'
                : percent < 75
                ? 'text-[var(--warning-text)]'
                : 'text-[var(--success-text)]';

            const barColor =
              percent < 40
                ? 'bg-rose-500'
                : percent < 75
                ? 'bg-amber-500'
                : 'bg-emerald-500';

            return (
              <div key={topic} className="space-y-2 p-4 rounded-2xl bg-[#f8f8fc] border border-[#e8e8f2]">
                <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[var(--text-primary)]">{topic}</span>
                    <span className={`text-[11px] font-semibold ${statusTextColor}`}>
                      · {statusLabel}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setRevisionTopic(topic)}
                      className="px-2.5 py-1 rounded-xl bg-purple-100/80 hover:bg-purple-200 text-[#7372A5] font-bold text-[11px] transition-all flex items-center gap-1 shadow-2xs"
                    >
                      <span className="material-symbols-outlined text-xs">auto_stories</span>
                      <span>Revise Notes</span>
                    </button>

                    <span className="font-semibold text-gray-600">
                      {percent}% mastery{' '}
                      <span className="text-gray-400 font-normal">
                        ({info.times_seen} {info.times_seen === 1 ? 'attempt' : 'attempts'})
                      </span>
                    </span>
                  </div>
                </div>

                <div className="w-full bg-[#ececf4] h-2.5 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${barColor}`}
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Plan Your Exam Revision */}
      <div className="bg-white p-8 rounded-3xl border border-[#d8d7e8] shadow-xs space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-extrabold text-[#222138] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#7372A5]">calendar_month</span>
              <span>Plan Your Exam Revision</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Create a study plan based on your exam date, available study time, and topics you need to practise.
            </p>
          </div>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#f8f8fc] p-4 rounded-2xl border border-[#e8e8f2]">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Time Until Exam
            </label>
            <select
              value={examDays}
              onChange={(e) => setExamDays(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#d8d7e8] text-xs font-semibold text-[#222138]"
            >
              <option value={3}>3 days</option>
              <option value={5}>5 days</option>
              <option value={7}>7 days</option>
              <option value={14}>14 days</option>
              <option value={21}>21 days</option>
            </select>
          </div>

          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Daily Study Time
            </label>
            <select
              value={dailyMinutes}
              onChange={(e) => setDailyMinutes(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#d8d7e8] text-xs font-semibold text-[#222138]"
            >
              <option value={30}>30 minutes</option>
              <option value={45}>45 minutes</option>
              <option value={60}>60 minutes</option>
              <option value={90}>90 minutes</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGenerateSchedule}
              disabled={scheduleLoading}
              className="w-full py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              {scheduleLoading ? (
                <span>Creating study plan...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>Create My Study Plan</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Generated Schedule Timeline */}
        {scheduleData && (
          <div className="space-y-4 pt-2">
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-purple-50 border border-purple-200 text-xs">
              <span className="font-bold text-[#7372A5]">
                Forecasted Exam Day Memory Retention:
              </span>
              <span className="font-extrabold text-[#222138] text-sm">
                {(scheduleData.projected_exam_retention * 100).toFixed(0)}%
              </span>
            </div>

            <div className="space-y-3">
              {scheduleData.schedule.map((item: any) => (
                <div
                  key={item.day}
                  className="p-4 rounded-2xl border border-[#d8d7e8] bg-white hover:border-[#7372A5]/40 transition-all space-y-2.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="w-6 h-6 rounded-lg bg-[#ececf4] text-[#7372A5] font-extrabold text-xs flex items-center justify-center">
                        D{item.day}
                      </span>
                      <h4 className="font-extrabold text-xs text-[#222138]">
                        {item.stage}
                      </h4>
                    </div>
                    <span className="text-[11px] font-bold text-gray-500">
                      {item.daily_minutes} mins
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {item.tasks.map((task: any, idx: number) => {
                      const isDone = Boolean(task.completed);
                      return (
                        <div
                          key={task.id || idx}
                          onClick={() => handleToggleTask(task.id, isDone)}
                          role="button"
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleToggleTask(task.id, isDone);
                            }
                          }}
                          className={`p-3 rounded-xl border text-xs flex items-start gap-2.5 transition-all cursor-pointer ${
                            isDone
                              ? 'bg-emerald-50/70 border-emerald-300 line-through text-gray-400'
                              : 'bg-[#f8f8fc] border-[#e8e8f2] text-gray-800 hover:border-[#7372A5]/40'
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={isDone}
                            onChange={() => {}}
                            className="mt-0.5 rounded text-[#7372A5] focus:ring-purple-400 cursor-pointer"
                          />
                          <div className="space-y-1 flex-1">
                            <p className="font-semibold leading-snug">{task.title}</p>
                            <div className="flex items-center justify-between text-[10px] text-gray-500 pt-0.5">
                              <span>{task.minutes} mins</span>
                              {task.reason && (
                                <span className="font-semibold text-purple-700 bg-purple-50 px-1.5 py-0.5 rounded">
                                  {task.reason}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>

            {scheduleData.policy_note && (
              <p className="text-[10px] text-gray-400 italic pt-2">
                {scheduleData.policy_note}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Weak-Topic Targeted Revision Modal */}
      {revisionTopic && (
        <WeakTopicRevisionModal
          isOpen={Boolean(revisionTopic)}
          topic={revisionTopic}
          onClose={() => setRevisionTopic(null)}
          onStartPracticeQuiz={onStartPracticeQuiz}
        />
      )}
    </div>
  );
};
