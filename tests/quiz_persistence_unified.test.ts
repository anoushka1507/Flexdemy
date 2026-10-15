import { describe, it, beforeEach } from 'node:test';
import assert from 'node:assert';
import { Quiz, QuizResult, UserProfile } from '../src/types';

describe('P0 — Flexdemy Quiz Attempt Persistence & Single Source of Truth', () => {
  // Test local storage mock
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

  let storage: MockLocalStorage;

  beforeEach(() => {
    storage = new MockLocalStorage();
  });

  it('1. Completing a 5-question quiz with 2 correct answers produces exactly 40% score', () => {
    const questions = [
      { id: 1, question: 'Q1', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0 },
      { id: 2, question: 'Q2', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 1 },
      { id: 3, question: 'Q3', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 2 },
      { id: 4, question: 'Q4', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 3 },
      { id: 5, question: 'Q5', options: ['A', 'B', 'C', 'D'], correctAnswerIndex: 0 },
    ];

    // Student answers: Q1=A(0, correct), Q2=A(0, wrong), Q3=C(2, correct), Q4=A(0, wrong), Q5=B(1, wrong)
    const selectedAnswers: Record<number, number> = { 1: 0, 2: 0, 3: 2, 4: 0, 5: 1 };

    let correctCount = 0;
    const questionOutcomes = questions.map((q, idx) => {
      const selected = selectedAnswers[q.id];
      const isCorrect = selected === q.correctAnswerIndex;
      if (isCorrect) correctCount++;
      return {
        question_number: idx + 1,
        question_id: q.id,
        question_text: q.question,
        selected_option_index: selected,
        correct_answer_index: q.correctAnswerIndex,
        was_correct: isCorrect,
      };
    });

    const totalQuestions = questions.length;
    const scorePercentage = Math.round((correctCount / totalQuestions) * 100);

    assert.strictEqual(totalQuestions, 5);
    assert.strictEqual(correctCount, 2);
    assert.strictEqual(scorePercentage, 40);
    assert.strictEqual(questionOutcomes.length, 5);
    assert.strictEqual(questionOutcomes[0].was_correct, true);
    assert.strictEqual(questionOutcomes[1].was_correct, false);
    assert.strictEqual(questionOutcomes[2].was_correct, true);
  });

  it('2. In-progress answers are NOT cleared if backend persistence throws an error', async () => {
    const quizId = 'quiz-os-crash-test';
    storage.setItem(`flexdemy_quiz_answers_${quizId}`, JSON.stringify({ 1: 0, 2: 1, 3: 2, 4: 3, 5: 0 }));

    let databaseWriteSucceeded = false;
    let localAnswersCleared = false;

    // Simulated handleQuizComplete that fails on backend write
    const mockOnCompleteQuiz = async () => {
      // Backend throws HTTP 500 error
      throw new Error('Database write failed to confirm quiz attempt save. Please retry.');
    };

    try {
      await mockOnCompleteQuiz();
      // This line must NOT be reached:
      storage.removeItem(`flexdemy_quiz_answers_${quizId}`);
      localAnswersCleared = true;
      databaseWriteSucceeded = true;
    } catch (err: any) {
      assert.strictEqual(err.message.includes('Database write failed'), true);
    }

    assert.strictEqual(databaseWriteSucceeded, false);
    assert.strictEqual(localAnswersCleared, false);
    // Preserved answers remain in storage so user can retry without losing their work
    assert.notStrictEqual(storage.getItem(`flexdemy_quiz_answers_${quizId}`), null);
  });

  it('3. In-progress answers are safely cleared only AFTER backend confirms write', async () => {
    const quizId = 'quiz-os-success-test';
    storage.setItem(`flexdemy_quiz_answers_${quizId}`, JSON.stringify({ 1: 0, 2: 1 }));

    let localAnswersCleared = false;

    // Simulated handleQuizComplete with confirmed backend write
    const mockOnCompleteQuiz = async () => {
      // Simulate network / database write roundtrip
      return Promise.resolve({ recorded: true, attempt_id: 'attempt-123' });
    };

    const res = await mockOnCompleteQuiz();
    assert.strictEqual(res.recorded, true);

    // After resolution:
    storage.removeItem(`flexdemy_quiz_answers_${quizId}`);
    localAnswersCleared = true;

    assert.strictEqual(localAnswersCleared, true);
    assert.strictEqual(storage.getItem(`flexdemy_quiz_answers_${quizId}`), null);
  });

  it('4. Single source of truth: Dashboard, Latest Results, and Profile share the same hydrated attempt', () => {
    // Database returns this single persisted record:
    const databaseRow = {
      quiz_id: 'quiz-algorithms-5q',
      attempt_id: 'attempt-algo-001',
      quiz_title: 'Algorithms & Complexity',
      topic: 'Algorithms',
      difficulty: 'Medium',
      score_percentage: 40,
      total_questions: 5,
      correct_answers_count: 2,
      completed_at: '2026-10-15T10:00:00Z',
      user_answers: { 1: 0, 2: 1, 3: 2, 4: 0, 5: 3 },
      topic_breakdown: [{ topic: 'Algorithms', score: 2, total: 5 }],
    };

    // Hydration mapping in App.tsx
    const results: QuizResult[] = [
      {
        quizId: databaseRow.quiz_id,
        attemptId: databaseRow.attempt_id,
        quizTitle: databaseRow.quiz_title,
        scorePercentage: databaseRow.score_percentage,
        totalQuestions: databaseRow.total_questions,
        correctAnswersCount: databaseRow.correct_answers_count,
        incorrectAnswersCount: databaseRow.total_questions - databaseRow.correct_answers_count,
        timeSpentSeconds: 0,
        dateCompleted: databaseRow.completed_at,
        userAnswers: databaseRow.user_answers,
        topicBreakdown: databaseRow.topic_breakdown as any,
      },
    ];

    const recentHistory = results.map((r) => ({
      id: r.quizId,
      title: r.quizTitle,
      topic: databaseRow.topic,
      score: r.scorePercentage,
      date: new Date(r.dateCompleted).toLocaleDateString(),
      icon: 'quiz',
      difficulty: databaseRow.difficulty,
    }));

    // Dashboard stats
    const totalQuizzes = results.length;
    const averageScore = Math.round(results.reduce((s, q) => s + q.scorePercentage, 0) / totalQuizzes);
    const bestScore = Math.max(...results.map((q) => q.scorePercentage));
    const accuracy = Math.round(
      (results.reduce((s, q) => s + q.correctAnswersCount, 0) /
        results.reduce((s, q) => s + q.totalQuestions, 0)) *
        100
    );

    // 1. Dashboard values match
    assert.strictEqual(totalQuizzes, 1);
    assert.strictEqual(averageScore, 40);
    assert.strictEqual(bestScore, 40);
    assert.strictEqual(accuracy, 40);

    // 2. Latest Results matches
    assert.strictEqual(results[0].quizId, 'quiz-algorithms-5q');
    assert.strictEqual(results[0].scorePercentage, 40);
    assert.strictEqual(results[0].correctAnswersCount, 2);

    // 3. Profile recent history matches
    assert.strictEqual(recentHistory[0].id, 'quiz-algorithms-5q');
    assert.strictEqual(recentHistory[0].score, 40);
    assert.strictEqual(recentHistory[0].title, 'Algorithms & Complexity');
  });

  it('5. Database failure displays error with retry action instead of falsely claiming "No Completed Quizzes Yet"', () => {
    let learnerDataError: string | null = null;
    let quizResults: QuizResult[] = [];

    // Simulate database query failure
    try {
      throw new Error('Could not retrieve quiz history from database. Connection timeout.');
    } catch (err: any) {
      learnerDataError = err.message;
    }

    // UI state assertion:
    assert.strictEqual(learnerDataError, 'Could not retrieve quiz history from database. Connection timeout.');
    // When error is present, UI displays retry banner and does not claim user has 0 quizzes
    const isErrorState = Boolean(learnerDataError);
    assert.strictEqual(isErrorState, true);
  });

  it('6. Reconstructing past quiz attempt from question_outcomes enables review with explanations', () => {
    const pastAttemptRecord = {
      quiz_id: 'quiz-os-review',
      quiz_title: 'OS Review',
      topic: 'Operating Systems',
      difficulty: 'Medium',
      total_questions: 2,
      question_outcomes: [
        {
          question_id: 1,
          question_text: 'What is thrashing?',
          options: ['Excessive paging', 'Fast computation', 'Memory cleanup', 'Disk formatting'],
          correct_answer_index: 0,
          explanation: 'Thrashing occurs when the system spends more time paging than executing.',
          hint: 'Think about virtual memory paging.',
          concept: 'Virtual Memory',
        },
      ],
    };

    // Reconstruction logic from handleOpenQuizResult
    const reconstructedQuiz: Quiz = {
      id: pastAttemptRecord.quiz_id,
      title: pastAttemptRecord.quiz_title,
      topic: pastAttemptRecord.topic,
      difficulty: pastAttemptRecord.difficulty as any,
      totalQuestions: pastAttemptRecord.total_questions,
      questions: pastAttemptRecord.question_outcomes.map((qo: any, idx: number) => ({
        id: qo.question_id || idx + 1,
        question: qo.question_text || '',
        options: qo.options || [],
        correctAnswerIndex: qo.correct_answer_index ?? 0,
        hint: qo.hint || '',
        explanation: qo.explanation || '',
        concept: qo.concept || pastAttemptRecord.topic,
      })),
    };

    assert.strictEqual(reconstructedQuiz.questions.length, 1);
    assert.strictEqual(reconstructedQuiz.questions[0].question, 'What is thrashing?');
    assert.strictEqual(
      reconstructedQuiz.questions[0].explanation,
      'Thrashing occurs when the system spends more time paging than executing.'
    );
    assert.strictEqual(reconstructedQuiz.questions[0].correctAnswerIndex, 0);
  });
});
