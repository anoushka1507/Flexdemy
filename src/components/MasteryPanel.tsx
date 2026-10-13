import React, { useEffect, useState } from 'react';
import { supabase } from '../supabaseClient';

export const MasteryPanel: React.FC = () => {
  const [mastery, setMastery] = useState<Record<string, number> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      setLoading(true);
      setError('');

      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token;

        if (!accessToken) {
          if (mounted) {
            setError('Sign in to see your mastery profile.');
            setLoading(false);
          }
          return;
        }

        const response = await fetch('/api/mastery', {
          headers: { Authorization: `Bearer ${accessToken}` },
        });

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
        if (mounted) setMastery(data);
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
    ([, a], [, b]) => a - b
  );

  if (topics.length === 0) {
    return (
      <div className="bg-white p-8 rounded-3xl border border-purple-100 shadow-xs">
        <p className="text-xs text-gray-500">
          No mastery data yet — complete an adaptive quiz while signed in to
          start building your topic mastery profile.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white p-8 rounded-3xl border border-purple-100 shadow-xs space-y-5">
      <p className="text-xs text-gray-500">
        Per-topic mastery, updated after every adaptive quiz question.
        Weakest topics are listed first.
      </p>

      <div className="space-y-4">
        {topics.map(([topic, score]) => {
          const percent = Math.round(score * 100);

          const barColor =
            percent < 40
              ? 'bg-red-400'
              : percent < 75
              ? 'bg-amber-400'
              : 'bg-emerald-400';

          return (
            <div key={topic} className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-[#222138]">{topic}</span>
                <span className="font-semibold text-gray-500">
                  {percent}%
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
  );
};
