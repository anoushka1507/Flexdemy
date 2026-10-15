import React, { useState, useEffect } from 'react';
import { apiFetch } from '../../utils/api';
import { ViewMode } from '../../types';

export interface FlashcardItem {
  id: string;
  front: string;
  back: string;
  source_locator?: string;
  topic?: string;
  interval_days?: number;
  repetitions?: number;
  ease_factor?: number;
  next_review?: string | null;
  last_reviewed?: string | null;
  last_rating?: string | null;
}

export interface FlashcardDeck {
  deck_id: string;
  title: string;
  topic?: string;
  collection_id?: string;
  cards: FlashcardItem[];
  created_at?: string;
  updated_at?: string;
  due_count?: number;
}

interface FlashcardRevisionViewProps {
  setCurrentView: (view: ViewMode) => void;
  onOpenUploadModal?: () => void;
  initialTopic?: string;
  onShowToast?: (message: string, type?: 'success' | 'error' | 'info') => void;
}

export const FlashcardRevisionView: React.FC<FlashcardRevisionViewProps> = ({
  setCurrentView,
  onOpenUploadModal,
  initialTopic,
  onShowToast,
}) => {
  const [decks, setDecks] = useState<FlashcardDeck[]>([]);
  const [activeDeckId, setActiveDeckId] = useState<string | null>(null);
  const [activeDeck, setActiveDeck] = useState<FlashcardDeck | null>(null);
  const [currentCardIndex, setCurrentCardIndex] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reviewedCards, setReviewedCards] = useState<Record<string, string>>({});
  const [filterDueOnly, setFilterDueOnly] = useState(false);

  // Fetch saved decks on mount
  const fetchDecks = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await apiFetch('/api/flashcard-decks');
      if (response.ok) {
        const data = await response.json();
        const loadedDecks: FlashcardDeck[] = data.decks || [];
        setDecks(loadedDecks);

        if (loadedDecks.length > 0) {
          // If initialTopic requested, select that deck
          const matched = initialTopic
            ? loadedDecks.find((d) => d.topic?.toLowerCase() === initialTopic.toLowerCase() || d.title.toLowerCase().includes(initialTopic.toLowerCase()))
            : null;
          const chosen = matched || loadedDecks[0];
          setActiveDeckId(chosen.deck_id);
          setActiveDeck(chosen);
        }
      } else {
        // Fallback: check if we can generate sample/demo deck for weak topics
        setDecks([]);
      }
    } catch {
      setError('Could not connect to fetch flashcard decks.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDecks();
  }, [initialTopic]);

  // When active deck changes, reset card state
  useEffect(() => {
    if (activeDeckId) {
      const found = decks.find((d) => d.deck_id === activeDeckId) || null;
      setActiveDeck(found);
      setCurrentCardIndex(0);
      setIsFlipped(false);
    }
  }, [activeDeckId, decks]);

  // Filter cards in active deck
  const cardsToReview: FlashcardItem[] = React.useMemo(() => {
    if (!activeDeck || !activeDeck.cards) return [];
    if (!filterDueOnly) return activeDeck.cards;

    const nowIso = new Date().toISOString();
    return activeDeck.cards.filter(
      (c) => !c.next_review || c.next_review <= nowIso
    );
  }, [activeDeck, filterDueOnly]);

  const currentCard = cardsToReview[currentCardIndex] || null;

  const handleNext = () => {
    setIsFlipped(false);
    if (currentCardIndex < cardsToReview.length - 1) {
      setCurrentCardIndex((prev) => prev + 1);
    } else {
      setCurrentCardIndex(0);
    }
  };

  const handlePrev = () => {
    setIsFlipped(false);
    if (currentCardIndex > 0) {
      setCurrentCardIndex((prev) => prev - 1);
    } else {
      setCurrentCardIndex(cardsToReview.length - 1);
    }
  };

  const handleShuffle = () => {
    if (!activeDeck) return;
    const shuffled = [...activeDeck.cards].sort(() => Math.random() - 0.5);
    setActiveDeck({ ...activeDeck, cards: shuffled });
    setCurrentCardIndex(0);
    setIsFlipped(false);
  };

  const handleRate = async (rating: 'again' | 'hard' | 'good' | 'easy') => {
    if (!activeDeck || !currentCard) return;

    // Prevent duplicate submission for same card in this session
    setReviewedCards((prev) => ({ ...prev, [currentCard.id]: rating }));

    try {
      await apiFetch('/api/flashcard-review', {
        method: 'POST',
        body: JSON.stringify({
          deck_id: activeDeck.deck_id,
          card_id: currentCard.id,
          rating,
          topic: currentCard.topic || activeDeck.topic,
        }),
      });
    } catch (err) {
      console.warn('Flashcard review record failed:', err);
    }

    // Move to next card after rating
    handleNext();
  };

  const handleDeleteDeck = async (deckId: string) => {
    if (!confirm('Are you sure you want to delete this flashcard deck?')) return;
    try {
      const res = await apiFetch(`/api/flashcard-decks/${deckId}`, { method: 'DELETE' });
      if (res.ok) {
        setDecks((prev) => prev.filter((d) => d.deck_id !== deckId));
        if (activeDeckId === deckId) {
          const remaining = decks.filter((d) => d.deck_id !== deckId);
          setActiveDeckId(remaining[0]?.deck_id || null);
        }
      }
    } catch {
      alert('Could not delete deck.');
    }
  };

  return (
    <div className="space-y-6 text-left animate-in fade-in duration-200 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-[#d8d7e8] dark:border-[#312f45]">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center shadow-xs">
              <span className="material-symbols-outlined text-xl">style</span>
            </div>
            <h1 className="text-xl sm:text-2xl font-extrabold text-[#222138] dark:text-[#f2f1f8] tracking-tight">
              Spaced Revision Flashcards
            </h1>
          </div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
            Active recall with SM-2 spaced repetition, grounded in your uploaded materials.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white text-xs font-extrabold shadow-xs transition-all"
            >
              <span className="material-symbols-outlined text-base">add</span>
              <span>New Deck from Material</span>
            </button>
          )}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="p-12 text-center space-y-3 bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <div className="w-10 h-10 mx-auto rounded-full border-3 border-[#7372A5] border-t-transparent animate-spin" />
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400">
            Loading your revision flashcards...
          </p>
        </div>
      )}

      {/* Empty State */}
      {!loading && decks.length === 0 && (
        <div className="p-12 text-center space-y-4 bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
          <div className="w-14 h-14 mx-auto rounded-2xl bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3] flex items-center justify-center">
            <span className="material-symbols-outlined text-3xl">style</span>
          </div>
          <div className="space-y-1">
            <h3 className="font-extrabold text-base text-[#222138] dark:text-[#f2f1f8]">
              No Flashcard Decks Yet
            </h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 max-w-sm mx-auto leading-relaxed">
              Generate flashcards from your uploaded lecture notes or after completing an adaptive quiz on weak topics.
            </p>
          </div>
          {onOpenUploadModal && (
            <button
              onClick={onOpenUploadModal}
              className="px-5 py-2.5 rounded-2xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-extrabold text-xs shadow-md transition-all inline-flex items-center gap-2"
            >
              <span className="material-symbols-outlined text-base">upload_file</span>
              <span>Upload Material for Flashcards</span>
            </button>
          )}
        </div>
      )}

      {/* Active Deck & Review Interface */}
      {!loading && decks.length > 0 && activeDeck && (
        <div className="space-y-6">
          {/* Deck Selector Tabs & Filters */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white dark:bg-[#161522] p-3 rounded-2xl border border-[#d8d7e8] dark:border-[#312f45] shadow-xs">
            <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
              <span className="text-xs font-bold text-gray-500 dark:text-gray-400 px-2 shrink-0">
                Deck:
              </span>
              {decks.map((d) => (
                <button
                  key={d.deck_id}
                  onClick={() => setActiveDeckId(d.deck_id)}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                    activeDeckId === d.deck_id
                      ? 'bg-[#7372A5] text-white shadow-xs'
                      : 'bg-[#ececf4] dark:bg-[#252436] text-gray-700 dark:text-gray-300 hover:bg-[#d8d7e8] dark:hover:bg-[#312f45]'
                  }`}
                >
                  <span>{d.title}</span>
                  <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-white/20">
                    {d.cards.length}
                  </span>
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
              <button
                onClick={() => setFilterDueOnly(!filterDueOnly)}
                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center gap-1 ${
                  filterDueOnly
                    ? 'bg-amber-100 text-amber-800 border-amber-300 dark:bg-amber-950/50 dark:text-amber-200'
                    : 'bg-[#ececf4] dark:bg-[#252436] text-gray-700 dark:text-gray-300 border-transparent'
                }`}
                title="Filter only cards due for review"
              >
                <span className="material-symbols-outlined text-sm">alarm</span>
                <span>Due Only</span>
              </button>

              <button
                onClick={handleShuffle}
                className="p-1.5 rounded-xl text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200 bg-[#ececf4] dark:bg-[#252436]"
                title="Shuffle Cards"
              >
                <span className="material-symbols-outlined text-base">shuffle</span>
              </button>

              <button
                onClick={() => handleDeleteDeck(activeDeck.deck_id)}
                className="p-1.5 rounded-xl text-rose-500 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/30"
                title="Delete Deck"
              >
                <span className="material-symbols-outlined text-base">delete</span>
              </button>
            </div>
          </div>

          {/* Flashcard Component */}
          {cardsToReview.length > 0 && currentCard ? (
            <div className="space-y-4">
              {/* Card Meta / Counter */}
              <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 px-2">
                <span>
                  Card <strong>{currentCardIndex + 1}</strong> of <strong>{cardsToReview.length}</strong>
                </span>
                {currentCard.source_locator && (
                  <span className="px-2 py-0.5 rounded-md bg-[#ececf4] dark:bg-[#252436] text-[11px] font-bold text-[#7372A5] dark:text-[#a1a0d3]">
                    [Source: {currentCard.source_locator}]
                  </span>
                )}
              </div>

              {/* 3D Flip Card Container */}
              <div
                onClick={() => setIsFlipped(!isFlipped)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === ' ' || e.key === 'Enter') {
                    e.preventDefault();
                    setIsFlipped(!isFlipped);
                  }
                }}
                className="relative min-h-[260px] sm:min-h-[300px] w-full rounded-3xl p-8 bg-white dark:bg-[#161522] border-2 border-[#d8d7e8] dark:border-[#312f45] hover:border-[#7372A5] shadow-lg cursor-pointer transition-all flex flex-col justify-between select-none"
              >
                {/* Badge top-left */}
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[#ececf4] dark:bg-[#252436] text-[#7372A5] dark:text-[#a1a0d3]">
                    {isFlipped ? 'Answer / Explanation' : 'Question / Term'}
                  </span>
                  <span className="material-symbols-outlined text-gray-400 text-lg">
                    {isFlipped ? 'visibility_off' : 'visibility'}
                  </span>
                </div>

                {/* Card Main Text */}
                <div className="my-auto py-6 text-center space-y-3">
                  <p className="text-base sm:text-xl font-extrabold text-[#222138] dark:text-[#f2f1f8] leading-relaxed">
                    {isFlipped ? currentCard.back : currentCard.front}
                  </p>
                  {isFlipped && currentCard.topic && (
                    <span className="inline-block text-xs font-semibold text-[#7372A5] dark:text-[#a1a0d3]">
                      Topic: {currentCard.topic}
                    </span>
                  )}
                </div>

                {/* Flip Hint */}
                <div className="text-center text-[11px] font-bold text-gray-400 dark:text-gray-400">
                  {isFlipped ? 'Click card to flip back' : 'Click card or press Space to reveal answer'}
                </div>
              </div>

              {/* SM-2 Spaced Repetition Rating Buttons */}
              {isFlipped ? (
                <div className="space-y-2 animate-in fade-in duration-150">
                  <p className="text-center text-xs font-bold text-gray-500 dark:text-gray-400">
                    How well did you know this concept? (Updates spaced schedule)
                  </p>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                    <button
                      onClick={() => handleRate('again')}
                      className="py-3 px-3 rounded-2xl bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 dark:hover:bg-rose-900/50 text-rose-800 dark:text-rose-200 border border-rose-200 dark:border-rose-900/50 font-extrabold text-xs transition-all flex flex-col items-center gap-0.5 shadow-xs"
                    >
                      <span>Again</span>
                      <span className="text-[10px] font-semibold opacity-75">1 Day</span>
                    </button>
                    <button
                      onClick={() => handleRate('hard')}
                      className="py-3 px-3 rounded-2xl bg-amber-50 dark:bg-amber-950/40 hover:bg-amber-100 dark:hover:bg-amber-900/50 text-amber-800 dark:text-amber-200 border border-amber-200 dark:border-amber-900/50 font-extrabold text-xs transition-all flex flex-col items-center gap-0.5 shadow-xs"
                    >
                      <span>Hard</span>
                      <span className="text-[10px] font-semibold opacity-75">2 Days</span>
                    </button>
                    <button
                      onClick={() => handleRate('good')}
                      className="py-3 px-3 rounded-2xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-800 dark:text-indigo-200 border border-indigo-200 dark:border-indigo-900/50 font-extrabold text-xs transition-all flex flex-col items-center gap-0.5 shadow-xs"
                    >
                      <span>Good</span>
                      <span className="text-[10px] font-semibold opacity-75">4 Days</span>
                    </button>
                    <button
                      onClick={() => handleRate('easy')}
                      className="py-3 px-3 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 text-emerald-800 dark:text-emerald-200 border border-emerald-200 dark:border-emerald-900/50 font-extrabold text-xs transition-all flex flex-col items-center gap-0.5 shadow-xs"
                    >
                      <span>Easy</span>
                      <span className="text-[10px] font-semibold opacity-75">7 Days</span>
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center justify-between gap-3 pt-2">
                  <button
                    onClick={handlePrev}
                    className="flex-1 py-2.5 rounded-2xl bg-white dark:bg-[#161522] border border-[#d8d7e8] dark:border-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs hover:bg-[#ececf4] dark:hover:bg-[#252436] transition-all flex items-center justify-center gap-1 shadow-xs"
                  >
                    <span className="material-symbols-outlined text-sm">arrow_back</span>
                    <span>Previous</span>
                  </button>
                  <button
                    onClick={() => setIsFlipped(true)}
                    className="flex-1 py-2.5 rounded-2xl bg-[#7372A5] hover:bg-[#5d5c8e] text-white font-extrabold text-xs shadow-md transition-all flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">flip</span>
                    <span>Reveal Answer</span>
                  </button>
                  <button
                    onClick={handleNext}
                    className="flex-1 py-2.5 rounded-2xl bg-white dark:bg-[#161522] border border-[#d8d7e8] dark:border-[#312f45] text-gray-700 dark:text-gray-200 font-bold text-xs hover:bg-[#ececf4] dark:hover:bg-[#252436] transition-all flex items-center justify-center gap-1 shadow-xs"
                  >
                    <span>Next</span>
                    <span className="material-symbols-outlined text-sm">arrow_forward</span>
                  </button>
                </div>
              )}
            </div>
          ) : (
            <div className="p-8 text-center space-y-2 bg-white dark:bg-[#161522] rounded-3xl border border-[#d8d7e8] dark:border-[#312f45]">
              <span className="material-symbols-outlined text-3xl text-emerald-500">task_alt</span>
              <p className="text-xs font-bold text-[#222138] dark:text-[#f2f1f8]">
                All cards reviewed for this deck!
              </p>
              <button
                onClick={() => setFilterDueOnly(false)}
                className="text-xs font-bold text-[#7372A5] hover:underline"
              >
                Review all cards in deck anyway
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
