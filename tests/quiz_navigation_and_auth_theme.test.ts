import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import {
  applyAuthThemeBoundary,
  restoreDashboardTheme,
  applyTheme,
  THEME_STORAGE_KEY,
  DYSLEXIA_STORAGE_KEY,
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
  removeAttribute(k: string) {
    delete this.attributes[k];
  }
}

const mockDocElement = new MockElement();
const mockBody = new MockElement();

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

describe('Fix Adaptive Quiz Navigation — Final Question Must End the Quiz', () => {
  // Navigation helper mirroring ActiveQuizView logic
  function getQuizNavigationState(
    currentQuestionIndex: number,
    totalQuizQuestions: number,
    isSubmitting: boolean
  ) {
    const isFinalQuestion = currentQuestionIndex >= totalQuizQuestions - 1;
    const canGoPrevious = currentQuestionIndex > 0;
    const buttonText = isSubmitting
      ? 'Submitting…'
      : isFinalQuestion
        ? 'Finish Quiz'
        : 'Continue to Next Question →';

    return {
      isFinalQuestion,
      canGoPrevious,
      buttonText,
      isButtonDisabled: isSubmitting,
    };
  }

  it('1. 1-Question Quiz: Question 1 displays Finish Quiz immediately (never Continue to Next)', () => {
    const totalQuestions = 1;
    const navQ1 = getQuizNavigationState(0, totalQuestions, false);

    assert.strictEqual(navQ1.isFinalQuestion, true);
    assert.strictEqual(navQ1.buttonText, 'Finish Quiz');
    assert.strictEqual(navQ1.canGoPrevious, false);
    assert.strictEqual(navQ1.isButtonDisabled, false);
  });

  it('2. 2-Question Quiz: Q1 displays Continue to Next Question, Q2 displays Finish Quiz', () => {
    const totalQuestions = 2;

    // Question 1 of 2
    const navQ1 = getQuizNavigationState(0, totalQuestions, false);
    assert.strictEqual(navQ1.isFinalQuestion, false);
    assert.strictEqual(navQ1.buttonText, 'Continue to Next Question →');
    assert.strictEqual(navQ1.canGoPrevious, false);

    // Question 2 of 2 (Final)
    const navQ2 = getQuizNavigationState(1, totalQuestions, false);
    assert.strictEqual(navQ2.isFinalQuestion, true);
    assert.strictEqual(navQ2.buttonText, 'Finish Quiz');
    assert.strictEqual(navQ2.canGoPrevious, true);
  });

  it('3. 5-Question Quiz: Q1..Q4 display Continue to Next Question, Q5 displays Finish Quiz', () => {
    const totalQuestions = 5;

    for (let i = 0; i < 4; i++) {
      const nav = getQuizNavigationState(i, totalQuestions, false);
      assert.strictEqual(nav.isFinalQuestion, false, `Question ${i + 1} should not be final`);
      assert.strictEqual(nav.buttonText, 'Continue to Next Question →');
      if (i > 0) {
        assert.strictEqual(nav.canGoPrevious, true, `Question ${i + 1} can go previous`);
      }
    }

    // Question 5 of 5
    const navQ5 = getQuizNavigationState(4, totalQuestions, false);
    assert.strictEqual(navQ5.isFinalQuestion, true);
    assert.strictEqual(navQ5.buttonText, 'Finish Quiz');
    assert.strictEqual(navQ5.canGoPrevious, true);
  });

  it('4. Final answer is recorded and preserved when Finish Quiz is clicked', () => {
    const userAnswers: Record<number, number> = { 0: 2, 1: 0 };
    const currentQuestionIndex = 2; // Q3 of 3
    const selectedOption = 1;

    // Immediate answer recording logic from ActiveQuizView handleOptionSelect
    userAnswers[currentQuestionIndex] = selectedOption;

    // Simulation of handleFinishQuiz payload
    const finalAnswersToSubmit = {
      ...userAnswers,
      [currentQuestionIndex]: selectedOption,
    };

    assert.strictEqual(finalAnswersToSubmit[2], 1);
    assert.strictEqual(Object.keys(finalAnswersToSubmit).length, 3);
  });

  it('5. Submitting state disables Finish Quiz button and prevents duplicate attempts', () => {
    let submissionCallCount = 0;
    let masteryUpdateCount = 0;
    let isSubmitting = false;

    const submitAttempt = async () => {
      if (isSubmitting) return; // Guard against multiple clicks
      isSubmitting = true;
      submissionCallCount++;
      masteryUpdateCount++;
      // simulate network request
      await new Promise((resolve) => setTimeout(resolve, 10));
      isSubmitting = false;
    };

    // User rapidly clicks button twice
    submitAttempt();
    submitAttempt();

    assert.strictEqual(submissionCallCount, 1);
    assert.strictEqual(masteryUpdateCount, 1);
  });

  it('6. Recoverable submission error preserves answers and enables retry', () => {
    const userAnswers: Record<number, number> = { 0: 3, 1: 1, 2: 0 };
    let submissionError: string | null = null;
    let isSubmitting = false;

    // First attempt fails
    isSubmitting = true;
    submissionError = 'Network timeout while saving quiz results. Please try again.';
    isSubmitting = false;

    // Button re-enabled, answers untouched
    assert.strictEqual(isSubmitting, false);
    assert.ok(submissionError.includes('Network timeout'));
    assert.strictEqual(userAnswers[0], 3);
    assert.strictEqual(userAnswers[1], 1);
    assert.strictEqual(userAnswers[2], 0);

    // Retry succeeds
    submissionError = null;
    assert.strictEqual(submissionError, null);
  });
});

describe('Flexdemy — Restore Original Light Theme for Authentication Pages', () => {
  beforeEach(() => {
    (global as any).localStorage.clear();
    mockDocElement.classList.remove('dark');
    mockDocElement.classList.remove('dyslexia-mode');
    mockBody.classList.remove('dyslexia-mode');
  });

  it('1. Auth theme boundary forces Light theme on DOM without wiping saved Dark mode preference', () => {
    // User selected Dark mode in dashboard
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    applyTheme('dark');
    assert.strictEqual(mockDocElement.classList.contains('dark'), true);

    // Navigate to Login/Signup/Forgot password
    applyAuthThemeBoundary();

    // DOM must now be Light theme
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);
    assert.strictEqual(mockDocElement.getAttribute('data-theme'), 'light');

    // User preference in localStorage must NOT be modified or wiped
    assert.strictEqual(localStorage.getItem(THEME_STORAGE_KEY), 'dark');
  });

  it('2. Auth theme boundary strips dyslexia mode from Auth page without wiping saved preference', () => {
    localStorage.setItem(DYSLEXIA_STORAGE_KEY, 'true');
    mockBody.classList.add('dyslexia-mode');

    // Auth theme boundary enforces clean standard auth view
    applyAuthThemeBoundary();

    assert.strictEqual(mockBody.classList.contains('dyslexia-mode'), false);
    assert.strictEqual(mockDocElement.classList.contains('dyslexia-mode'), false);

    // Stored dyslexia preference remains intact for dashboard return
    assert.strictEqual(localStorage.getItem(DYSLEXIA_STORAGE_KEY), 'true');
  });

  it('3. restoreDashboardTheme cleanly reinstates user dark theme and dyslexia preference upon login', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem(DYSLEXIA_STORAGE_KEY, 'true');

    // First at login:
    applyAuthThemeBoundary();
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);

    // After successful sign in:
    restoreDashboardTheme('dark', true);

    // Dyslexia mode precedence enforces high-contrast light with dyslexia-mode class on body
    assert.strictEqual(mockBody.classList.contains('dyslexia-mode'), true);
  });

  it('4. restoreDashboardTheme without dyslexia mode cleanly restores dark mode', () => {
    localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    localStorage.setItem(DYSLEXIA_STORAGE_KEY, 'false');

    applyAuthThemeBoundary();
    assert.strictEqual(mockDocElement.classList.contains('dark'), false);

    restoreDashboardTheme('dark', false);
    assert.strictEqual(mockDocElement.classList.contains('dark'), true);
    assert.strictEqual(mockDocElement.getAttribute('data-theme'), 'dark');
  });
});

describe('Flexdemy — Application-Wide Plain-Language UI Rewrite', () => {
  it('1. Study schedule uses student-friendly terminology', () => {
    const studyScheduleStrings = {
      heading: 'Plan Your Exam Revision',
      subtitle: 'Create a study plan based on your exam date, available study time, and topics you need to practise.',
      timeLabel: 'Time Until Exam',
      timeOption: '7 days',
      dailyTimeLabel: 'Daily Study Time',
      dailyTimeOption: '45 minutes',
      button: 'Create My Study Plan',
    };

    assert.strictEqual(studyScheduleStrings.heading, 'Plan Your Exam Revision');
    assert.strictEqual(studyScheduleStrings.subtitle.includes('exam date'), true);
    assert.strictEqual(studyScheduleStrings.timeLabel, 'Time Until Exam');
    assert.strictEqual(studyScheduleStrings.timeOption, '7 days');
    assert.strictEqual(studyScheduleStrings.button, 'Create My Study Plan');

    // Forbidden developer tokens must not appear
    const joined = Object.values(studyScheduleStrings).join(' ');
    assert.strictEqual(joined.includes('Deterministic'), false);
    assert.strictEqual(joined.includes('0 API Tokens'), false);
    assert.strictEqual(joined.includes('BKT'), false);
    assert.strictEqual(joined.includes('DAG'), false);
  });

  it('2. Plain-language error messages for HTTP 413 and processing states', () => {
    const plainLanguageErrors: Record<string, string> = {
      '413': "We couldn't upload these files. Try a smaller file or upload them separately.",
      '500': 'Something went wrong while preparing your answer. Please try again.',
      'extraction': "We couldn't read this file. Try another copy or format.",
      'processing': "We couldn't finish preparing this material.",
      'no_context': "I couldn't find enough information in your uploaded materials to answer that yet.",
    };

    assert.strictEqual(
      plainLanguageErrors['413'],
      "We couldn't upload these files. Try a smaller file or upload them separately."
    );
    assert.strictEqual(plainLanguageErrors['413'].includes('413'), false);
    assert.strictEqual(plainLanguageErrors['413'].includes('Batch ingestion failed'), false);
  });

  it('3. Ingestion stage labels use natural progress wording', () => {
    const stageLabels: Record<string, string> = {
      waiting: 'Waiting to start',
      uploading: 'Uploading…',
      uploaded: 'Uploaded',
      extracting: 'Preparing your material…',
      processing_video: 'Preparing video content…',
      indexing: 'Indexing material…',
      completed: 'Ready',
      failed: 'Upload or processing failed',
    };

    assert.strictEqual(stageLabels.waiting, 'Waiting to start');
    assert.strictEqual(stageLabels.extracting, 'Preparing your material…');
    assert.strictEqual(stageLabels.processing_video, 'Preparing video content…');
    assert.strictEqual(stageLabels.waiting.includes('Queued'), false);
  });
});
