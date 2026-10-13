export type ViewMode =
  | 'landing'
  | 'login'
  | 'dashboard'
  | 'active-quiz'
  | 'quiz-results'
  | 'quizzes-list'
  | 'leaderboard'
  | 'analytics'
  | 'settings';

export type Difficulty =
  | 'Easy'
  | 'Medium'
  | 'Hard';

export type QuestionType = 'mcq' | 'short_answer' | 'numerical';

export interface Question {
  id: number;
  question: string;
  options: string[];
  correctAnswerIndex: number;
  hint: string;
  explanation: string;

  // Used by adaptive quizzes.
  concept?: string;
  difficulty?: Difficulty;

  // Track D: source grounding + non-MCQ question types.
  questionType?: QuestionType;
  topic?: string;
  sourceLocator?: string;

  // Full backend option objects (text/is_correct/misconception_tag),
  // kept around so /explain-answer can use the real misconception tags
  // instead of a generic fallback. Only present for AI-generated questions.
  backendQuestion?: Record<string, unknown>;
}

export interface Citation {
  chunkIndex: number;
  locator: string;
  excerpt: string;
}

export interface GroundedChatMessage {
  role: 'user' | 'model';
  text: string;
  isGrounded?: boolean;
  citations?: Citation[];
}

export interface Quiz {
  id: string;
  title: string;
  topic: string;
  difficulty: Difficulty;
  questions: Question[];
  totalQuestions: number;
  timeLimitMinutes?: number;
}

export interface AdaptiveQuizLaunch {
  sessionId: string;
  title: string;
  totalQuestions: number;
  firstQuestion: Question;
}

export interface UserAnswer {
  questionId: number;
  selectedOptionIndex: number | null;
  isFlagged?: boolean;
  isMarkedForReview?: boolean;
}

export interface QuizResult {
  quizId: string;
  quizTitle: string;
  scorePercentage: number;
  totalQuestions: number;
  correctAnswersCount: number;
  incorrectAnswersCount: number;
  timeSpentSeconds: number;
  dateCompleted: string;
  userAnswers: Record<number, number | null>;

  // Correctness for short-answer/numerical questions, which aren't
  // scored by option index. Falls back to userAnswers comparison when
  // a question id isn't present here (i.e. it was an MCQ question).
  openEndedResults?: Record<number, boolean>;

  topicBreakdown: Array<{
    topicName: string;
    score: number;
    total: number;
    masteryPercentage: number;
  }>;
}

export interface UserProfile {
  name: string;
  role: string;
  avatarUrl: string;
  email: string;
  totalQuizzesAttempted: number;
  averageScore: number;
  bestScore: number;
  accuracy: number;
  streakDays: number;
  overallProgress: number;
}