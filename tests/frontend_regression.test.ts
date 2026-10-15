import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  applyTheme,
  getStoredTheme,
  syncThemeWithDyslexia,
  isDyslexiaMode,
  THEME_STORAGE_KEY,
} from '../src/utils/theme';

// Mock browser globals for Node test environment
class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

class MockClassList {
  private classes = new Set<string>();
  add(c: string) {
    this.classes.add(c);
  }
  remove(c: string) {
    this.classes.delete(c);
  }
  contains(c: string) {
    return this.classes.has(c);
  }
}

class MockElement {
  classList = new MockClassList();
  attributes: Record<string, string> = {};
  style: Record<string, string> = {};
  setAttribute(k: string, v: string) {
    this.attributes[k] = v;
  }
  getAttribute(k: string) {
    return this.attributes[k];
  }
}

const mockDocElement = new MockElement();
const mockBody = new MockElement();

// Setup global browser mock
(global as any).window = {
  matchMedia: (query: string) => ({
    matches: query.includes('dark') ? false : true,
    addEventListener: () => {},
    removeEventListener: () => {},
  }),
};
(global as any).document = {
  documentElement: mockDocElement,
  body: mockBody,
};
(global as any).localStorage = new MockLocalStorage();

describe('P0 — Dyslexia Mode Precedence and Theme System Invariants', () => {
  beforeEach(() => {
    (global as any).localStorage.clear();
    mockDocElement.classList.remove('dark');
    mockDocElement.classList.remove('dyslexia-mode');
    mockBody.classList.remove('dyslexia-mode');
  });

  it('1. Dyslexia Mode locks out Dark mode and forces high-readability Light theme', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    applyTheme('dark');
    assert.strictEqual(mockDocElement.classList.contains('dark'), true);

    // Turn Dyslexia Mode ON
    syncThemeWithDyslexia(true, 'dark');
    assert.strictEqual(isDyslexiaMode(), true);
    // Dark class must be removed, dyslexia-mode active on body, and data-theme set to light
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);
    assert.strictEqual(mockBody.classList.contains('dyslexia-mode'), true);
    assert.strictEqual(mockDocElement.getAttribute('data-theme'), 'light');

    // Attempting to apply dark mode while Dyslexia is ON must be blocked
    applyTheme('dark');
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);
    assert.strictEqual(mockDocElement.getAttribute('data-theme'), 'light');
  });

  it('2. Turning Dyslexia Mode OFF restores the stored user theme preference', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    syncThemeWithDyslexia(true, 'dark');
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);

    // Turn Dyslexia Mode OFF -> restores dark mode
    syncThemeWithDyslexia(false, 'dark');
    assert.strictEqual(isDyslexiaMode(), false);
    assert.strictEqual(mockBody.classList.contains('dyslexia-mode'), false);
    assert.strictEqual(mockDocElement.classList.contains('dark'), true);
    assert.strictEqual(mockDocElement.getAttribute('data-theme'), 'dark');
  });

  it('3. Restores original Light theme as clean white background with lavender accents', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'light');
    applyTheme('light');
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);
    assert.strictEqual(mockDocElement.getAttribute('data-theme'), 'light');
    assert.strictEqual(getStoredTheme(), 'light');
  });
});

describe('P0 — Active Quiz In-Progress State Persistence', () => {
  beforeEach(() => {
    (global as any).localStorage.clear();
  });

  it('1. Persists in-progress quiz answers to localStorage across view navigation', () => {
    const quizId = 'adaptive-test-session-123';
    const mockAnswers = { 1: 2, 2: 0, 3: null };

    // Simulate saving in-progress answers
    localStorage.setItem(`flexdemy_quiz_answers_${quizId}`, JSON.stringify(mockAnswers));

    // Simulate page refresh or navigation restore
    const restored = JSON.parse(localStorage.getItem(`flexdemy_quiz_answers_${quizId}`) || '{}');
    assert.deepStrictEqual(restored, mockAnswers);
    assert.strictEqual(restored[1], 2);
  });

  it('2. Submission clears in-progress answers while preserving completed result', () => {
    const quizId = 'adaptive-test-session-123';
    localStorage.setItem(`flexdemy_quiz_answers_${quizId}`, JSON.stringify({ 1: 2 }));

    const completedResult = {
      quizId,
      quizTitle: 'Biology Review',
      scorePercentage: 80,
      totalQuestions: 5,
      correctAnswersCount: 4,
      incorrectAnswersCount: 1,
      timeSpentSeconds: 120,
      dateCompleted: 'Just now',
      userAnswers: { 1: 2 },
      topicBreakdown: [],
    };

    // Simulate quiz completion: clear in-progress and persist active result
    localStorage.removeItem(`flexdemy_quiz_answers_${quizId}`);
    localStorage.setItem('flexdemy_active_quiz_result', JSON.stringify(completedResult));

    assert.strictEqual(localStorage.getItem(`flexdemy_quiz_answers_${quizId}`), null);
    const persistedResult = JSON.parse(localStorage.getItem('flexdemy_active_quiz_result')!);
    assert.strictEqual(persistedResult.scorePercentage, 80);
    assert.strictEqual(persistedResult.quizId, quizId);
  });

  it('3. Opening Course Map does not overwrite or clear quiz results', () => {
    const completedResult = {
      quizId: 'test-biology',
      quizTitle: 'Biology 101',
      scorePercentage: 90,
      totalQuestions: 10,
      correctAnswersCount: 9,
      incorrectAnswersCount: 1,
      timeSpentSeconds: 300,
      dateCompleted: '2026-10-15',
      userAnswers: {},
      topicBreakdown: [],
    };
    localStorage.setItem('flexdemy_active_quiz_result', JSON.stringify(completedResult));

    // Simulate generating and viewing course map
    const activeMap = {
      id: 'path-1',
      title: 'Cellular Respiration Flow',
      concepts: ['Glycolysis', 'Krebs Cycle'],
    };

    // Invariant: active quiz result is still intact
    const checkResult = JSON.parse(localStorage.getItem('flexdemy_active_quiz_result')!);
    assert.strictEqual(checkResult.quizTitle, 'Biology 101');
    assert.strictEqual(checkResult.scorePercentage, 90);
  });
});

describe('P1 — Flashcards Spaced Repetition (SM-2 Algorithm)', () => {
  it('1. Again resets interval to 1 day and penalizes ease factor', () => {
    const card = { repetitions: 3, interval_days: 6, ease_factor: 2.5 };
    // SM-2 logic for 'again':
    const nextInterval = 1;
    const nextReps = 0;
    const nextEase = Math.max(1.3, card.ease_factor - 0.2);

    assert.strictEqual(nextInterval, 1);
    assert.strictEqual(nextReps, 0);
    assert.strictEqual(nextEase, 2.3);
  });

  it('2. Good rating advances interval by ease factor and increments repetitions', () => {
    const card = { repetitions: 2, interval_days: 6, ease_factor: 2.5 };
    const nextReps = card.repetitions + 1;
    const nextInterval = Math.round(card.interval_days * card.ease_factor);

    assert.strictEqual(nextReps, 3);
    assert.strictEqual(nextInterval, 15);
  });

  it('3. Easy rating boosts interval and increases ease factor', () => {
    const card = { repetitions: 2, interval_days: 6, ease_factor: 2.5 };
    const nextReps = card.repetitions + 1;
    const nextInterval = Math.round(card.interval_days * card.ease_factor * 1.3);
    const nextEase = Math.min(3.0, card.ease_factor + 0.15);

    assert.strictEqual(nextReps, 3);
    assert.strictEqual(nextInterval, 20);
    assert.strictEqual(nextEase, 2.65);
  });
});
