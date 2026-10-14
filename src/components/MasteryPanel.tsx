import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';
import { apiFetch } from '../utils/api';

interface TopicMastery {
  mastery_score: number;
  times_seen: number;
  last_updated: string;
}

interface MasteryPanelProps {
  onStartDiagnostic?: () => void;
}

export const MasteryPanel: React.FC<MasteryPanelProps> = ({ onStartDiagnostic }) => {
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
            <span className="text-[10px] font-bold px-2.5 py-1 rounded-full bg-purple-100 text-[#7372A5] uppercase tracking-wider">
              Cold-Start Diagnostic Calibration (Req 4.b)
            </span>
            <h4 className="font-extrabold text-sm text-[#222138]">
              Calibrate Your Topic Mastery Vector
            </h4>
            <p className="text-xs text-gray-500 leading-relaxed">
              You don't have a mastery profile yet. Complete a rapid diagnostic placement quiz (1 question per major topic at Medium difficulty). Your answers immediately seed your Bayesian Knowledge Tracing (BKT) baseline vector P(L_0), with 0 LLM grading overhead.
            </p>
            {onStartDiagnostic && (
              <button
                onClick={onStartDiagnostic}
                className="mt-2 px-5 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center gap-2"
              >
                <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                <span>Launch Diagnostic Placement Quiz</span>
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            <p className="text-xs text-gray-500">
              No mastery data yet — complete an adaptive quiz while signed in to
              start building your topic mastery profile.
            </p>
            {onStartDiagnostic && (
              <button
                onClick={onStartDiagnostic}
                className="mt-2 px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-sm transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">quiz</span>
                <span>Start Diagnostic Assessment</span>
              </button>
            )}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* BKT Mastery Radar Card */}
      <div className="bg-white p-8 rounded-3xl border border-[#d8d7e8] shadow-xs space-y-5">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-extrabold text-[#222138]">
              Bayesian Knowledge Tracing (BKT) Mastery
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Psychometric mastery probability P(L) updated after every assessment attempt.
            </p>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#ececf4] text-[#7372A5]">
            Pure Math • 0 LLM Latency
          </span>
        </div>

        <div className="space-y-4">
          {topics.map(([topic, info]) => {
            const percent = Math.round(info.mastery_score * 100);

            const badge =
              percent < 40
                ? { label: 'Needs Remediation', color: 'bg-rose-100 text-rose-700 border-rose-200' }
                : percent < 75
                ? { label: 'Working Knowledge', color: 'bg-amber-100 text-amber-700 border-amber-200' }
                : { label: 'Mastered', color: 'bg-emerald-100 text-emerald-700 border-emerald-200' };

            const barColor =
              percent < 40
                ? 'bg-rose-500'
                : percent < 75
                ? 'bg-amber-500'
                : 'bg-emerald-500';

            return (
              <div key={topic} className="space-y-1.5 p-3 rounded-2xl bg-[#f8f8fc] border border-[#e8e8f2]">
                <div className="flex items-center justify-between text-xs flex-wrap gap-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-[#222138]">{topic}</span>
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md border ${badge.color}`}>
                      {badge.label}
                    </span>
                  </div>
                  <span className="font-semibold text-gray-600">
                    P(L) = {info.mastery_score.toFixed(2)}{' '}
                    <span className="text-gray-400 font-normal">
                      ({info.times_seen} attempts)
                    </span>
                  </span>
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

      {/* Spaced Repetition Exam Planner (Requirement 6.c) */}
      <div className="bg-white p-8 rounded-3xl border border-[#d8d7e8] shadow-xs space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="text-base font-extrabold text-[#222138] flex items-center gap-2">
              <span className="material-symbols-outlined text-[#7372A5]">calendar_month</span>
              <span>Spaced Repetition Exam Schedule</span>
            </h3>
            <p className="text-xs text-gray-500 mt-0.5">
              Generates an optimal review schedule using the Ebbinghaus forgetting curve R(t) = exp(-t/S) and weak topics.
            </p>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-[#ececf4] text-[#7372A5]">
            Deterministic • 0 API Tokens
          </span>
        </div>

        {/* Inputs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 bg-[#f8f8fc] p-4 rounded-2xl border border-[#e8e8f2]">
          <div>
            <label className="text-xs font-bold text-gray-700 block mb-1">
              Days Until Exam
            </label>
            <select
              value={examDays}
              onChange={(e) => setExamDays(Number(e.target.value))}
              className="w-full px-3 py-2 rounded-xl bg-white border border-[#d8d7e8] text-xs font-semibold text-[#222138]"
            >
              <option value={3}>3 Days (Crash Course)</option>
              <option value={5}>5 Days (Intensive)</option>
              <option value={7}>7 Days (Standard Week)</option>
              <option value={14}>14 Days (Comprehensive)</option>
              <option value={21}>21 Days (Spaced Mastery)</option>
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
              <option value={30}>30 Minutes</option>
              <option value={45}>45 Minutes</option>
              <option value={60}>60 Minutes</option>
              <option value={90}>90 Minutes</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleGenerateSchedule}
              disabled={scheduleLoading}
              className="w-full py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center justify-center gap-1.5"
            >
              {scheduleLoading ? (
                <span>Calculating curve...</span>
              ) : (
                <>
                  <span className="material-symbols-outlined text-sm">schedule</span>
                  <span>Build Study Plan</span>
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
                    {item.tasks.map((task: any, idx: number) => (
                      <div
                        key={idx}
                        className="p-2.5 rounded-xl bg-[#f8f8fc] border border-[#e8e8f2] text-xs flex items-start gap-2"
                      >
                        <span className="material-symbols-outlined text-sm text-[#7372A5] mt-0.5">
                          {task.type === 'mock_exam' ? 'quiz' : task.type === 'flashcards' ? 'style' : 'menu_book'}
                        </span>
                        <div>
                          <p className="font-semibold text-gray-800 leading-snug">{task.title}</p>
                          <span className="text-[10px] text-gray-400 font-medium">{task.minutes} mins</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
