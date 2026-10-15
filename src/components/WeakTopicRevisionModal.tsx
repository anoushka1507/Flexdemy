import React, { useState, useEffect } from 'react';
import { apiFetch } from '../utils/api';
import { ReadAloudControls } from './ReadAloudControls';
import { speechController } from '../utils/speechController';

interface FlashcardItem {
  front: string;
  back: string;
  source_locator?: string;
}

interface RevisionNoteItem {
  title: string;
  key_points: string[];
  example?: string;
  source_locator?: string;
}

interface WeakTopicRevisionModalProps {
  isOpen: boolean;
  onClose: () => void;
  topic: string;
  sessionId?: string;
  onStartPracticeQuiz?: (topic: string) => void;
}

export const WeakTopicRevisionModal: React.FC<WeakTopicRevisionModalProps> = ({
  isOpen,
  onClose,
  topic,
  sessionId,
  onStartPracticeQuiz,
}) => {
  const [activeTab, setActiveTab] = useState<'flashcards' | 'notes' | 'audio'>('flashcards');
  const [language, setLanguage] = useState<'english' | 'hindi'>('english');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [flashcards, setFlashcards] = useState<FlashcardItem[]>([]);
  const [revisionNotes, setRevisionNotes] = useState<RevisionNoteItem[]>([]);
  const [audioBrief, setAudioBrief] = useState<string>('');
  const [primaryLocator, setPrimaryLocator] = useState<string>('[Curriculum Core]');
  const [flippedCards, setFlippedCards] = useState<Record<number, boolean>>({});

  useEffect(() => {
    if (!isOpen || !topic) return;

    let mounted = true;
    const fetchRevisionData = async () => {
      setLoading(true);
      setError(null);
      try {
        const response = await apiFetch('/api/weak-topics-revision', {
          method: 'POST',
          body: JSON.stringify({
            topic,
            session_id: sessionId || null,
            language,
          }),
        });

        if (!response.ok) {
          throw new Error(`Failed to load revision materials (${response.status})`);
        }

        const data = await response.json();
        if (mounted) {
          setFlashcards(data.flashcards || []);
          setRevisionNotes(data.revision_notes || []);
          setAudioBrief(data.audio_brief || '');
          setPrimaryLocator(data.primary_locator || '[Curriculum Core]');
          setFlippedCards({});
        }
      } catch (err: any) {
        if (mounted) {
          setError(err.message || 'Could not load revision materials for this topic.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };

    fetchRevisionData();
    return () => {
      mounted = false;
      speechController.stop();
    };
  }, [isOpen, topic, sessionId, language]);

  if (!isOpen) return null;

  const passageId = `revision-audio-${topic.replace(/\s+/g, '-').toLowerCase()}`;

  const handlePlayAudioBrief = () => {
    if (!audioBrief) return;
    const langCode = language === 'hindi' ? 'hi-IN' : 'en-US';
    speechController.play(passageId, audioBrief, { lang: langCode });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="revision-modal-title"
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-4xl border border-[#d8d7e8] overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 bg-[#7372A5] text-white flex items-center justify-between shrink-0">
          <div>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-xl">school</span>
              <h3 id="revision-modal-title" className="font-extrabold text-lg">
                Targeted Weak-Topic Revision: {topic}
              </h3>
            </div>
            <p className="text-xs text-purple-100 mt-0.5">
              Based on {primaryLocator} • Key revision notes and read-aloud audio
            </p>
          </div>

          <div className="flex items-center gap-3">
            {/* Language Switcher */}
            <div className="flex bg-white/10 p-0.5 rounded-xl text-xs font-bold">
              <button
                type="button"
                onClick={() => setLanguage('english')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  language === 'english' ? 'bg-white text-[#7372A5] shadow-xs' : 'text-white'
                }`}
              >
                EN
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hindi')}
                className={`px-2.5 py-1 rounded-lg transition-all ${
                  language === 'hindi' ? 'bg-white text-[#7372A5] shadow-xs' : 'text-white'
                }`}
              >
                हिन्दी
              </button>
            </div>

            <button
              onClick={() => {
                speechController.stop();
                onClose();
              }}
              className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              aria-label="Close revision modal"
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 pt-4 pb-2 border-b border-[#e8e8f2] flex items-center gap-4 text-xs font-bold shrink-0">
          <button
            onClick={() => setActiveTab('flashcards')}
            className={`pb-2 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'flashcards'
                ? 'border-[#7372A5] text-[#7372A5]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">style</span>
            <span>Flashcards ({flashcards.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('notes')}
            className={`pb-2 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'notes'
                ? 'border-[#7372A5] text-[#7372A5]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">notes</span>
            <span>Revision Notes ({revisionNotes.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('audio')}
            className={`pb-2 border-b-2 transition-all flex items-center gap-1.5 ${
              activeTab === 'audio'
                ? 'border-[#7372A5] text-[#7372A5]'
                : 'border-transparent text-gray-500 hover:text-gray-700'
            }`}
          >
            <span className="material-symbols-outlined text-base">headphones</span>
            <span>Listen to Your Revision</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-left">
          {loading && (
            <div className="py-16 text-center space-y-3">
              <span className="material-symbols-outlined text-4xl text-[#7372A5] animate-spin">
                sync
              </span>
              <p className="text-sm font-semibold text-gray-600">
                Assembling targeted revision materials for {topic}...
              </p>
            </div>
          )}

          {error && !loading && (
            <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-xs text-rose-800 space-y-2">
              <p className="font-bold">Could not load revision data</p>
              <p>{error}</p>
            </div>
          )}

          {!loading && !error && activeTab === 'flashcards' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Click any card to reveal the answer, explanation, and cited source locator.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {flashcards.map((card, idx) => {
                  const isFlipped = Boolean(flippedCards[idx]);
                  return (
                    <div
                      key={idx}
                      role="button"
                      tabIndex={0}
                      onClick={() =>
                        setFlippedCards((prev) => ({
                          ...prev,
                          [idx]: !prev[idx],
                        }))
                      }
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          setFlippedCards((prev) => ({
                            ...prev,
                            [idx]: !prev[idx],
                          }));
                        }
                      }}
                      className={`p-5 rounded-2xl border-2 transition-all cursor-pointer min-h-[140px] flex flex-col justify-between ${
                        isFlipped
                          ? 'bg-purple-50/70 border-[#7372A5]/60 shadow-xs'
                          : 'bg-white border-[#d8d7e8] hover:border-[#7372A5]/40 hover:shadow-xs'
                      }`}
                    >
                      <div className="space-y-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider text-[#7372A5] block">
                          {isFlipped ? 'Answer & Explanation' : 'Prompt / Concept'}
                        </span>
                        <p className="text-xs font-bold text-[#222138] leading-relaxed">
                          {isFlipped ? card.back : card.front}
                        </p>
                      </div>

                      <div className="pt-3 border-t border-gray-100 flex items-center justify-between text-[10px] text-gray-400">
                        <span>{isFlipped ? 'Click to show front' : 'Click to flip'}</span>
                        {card.source_locator && (
                          <span className="font-bold text-[#7372A5]">
                            Source: {card.source_locator}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'notes' && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500">
                Concise slide-style summary grounded in your course materials.
              </p>

              <div className="space-y-4">
                {revisionNotes.map((note, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-2xl bg-[#f8f8fc] border border-[#e8e8f2] space-y-2.5"
                  >
                    <div className="flex items-center justify-between flex-wrap gap-2">
                      <h4 className="font-extrabold text-xs text-[#222138]">{note.title}</h4>
                      {note.source_locator && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-purple-100 text-[#7372A5]">
                          {note.source_locator}
                        </span>
                      )}
                    </div>

                    <ul className="list-disc list-inside space-y-1 text-xs text-gray-700 leading-relaxed">
                      {note.key_points.map((pt, pIdx) => (
                        <li key={pIdx}>{pt}</li>
                      ))}
                    </ul>

                    {note.example && (
                      <div className="p-3 rounded-xl bg-white border border-[#d8d7e8] text-[11px] text-gray-600">
                        <strong className="text-gray-800">Concrete Example: </strong>
                        {note.example}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {!loading && !error && activeTab === 'audio' && (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-purple-50/80 border border-purple-200 flex items-center justify-between flex-wrap gap-3">
                <div className="space-y-0.5">
                  <h4 className="font-extrabold text-xs text-[#222138]">
                    Listen to Your Revision: {topic}
                  </h4>
                  <p className="text-[11px] text-gray-500">
                    Listen to a concise, spoken review of key principles and common pitfalls.
                  </p>
                </div>

                <ReadAloudControls
                  passageId={passageId}
                  onPlay={handlePlayAudioBrief}
                />
              </div>

              <div className="p-5 rounded-2xl bg-[#f8f8fc] border border-[#e8e8f2] text-xs text-gray-800 leading-relaxed font-medium space-y-2">
                <span className="text-[10px] font-bold uppercase tracking-wider text-gray-400 block">
                  Transcript
                </span>
                <p>{audioBrief || 'No audio transcript generated.'}</p>
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-[#d8d7e8] bg-[#f8f8fc] flex items-center justify-between flex-wrap gap-3 shrink-0">
          <span className="text-xs text-gray-500">
            Topic: <strong className="text-[#222138]">{topic}</strong>
          </span>

          <div className="flex items-center gap-2">
            {onStartPracticeQuiz && (
              <button
                onClick={() => {
                  speechController.stop();
                  onStartPracticeQuiz(topic);
                  onClose();
                }}
                className="px-4 py-2 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <span className="material-symbols-outlined text-sm">assignment_turned_in</span>
                <span>Launch Practice Quiz</span>
              </button>
            )}

            <button
              onClick={() => {
                speechController.stop();
                onClose();
              }}
              className="px-4 py-2 rounded-xl border border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-bold text-xs"
            >
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
