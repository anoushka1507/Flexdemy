export type ViewMode =
  | 'landing'
  | 'login'
  | 'dashboard'
  | 'active-quiz'
  | 'quiz-results'
  | 'quizzes-list'
  | 'latest-results'
  | 'flashcards'
  | 'leaderboard'
  | 'analytics'
  | 'settings'
  | 'profile';

export type ThemeMode = 'light' | 'dark' | 'system';

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

export type SourceType = 'pdf' | 'slide' | 'video' | 'text';

export interface Citation {
  chunkIndex: number;
  locator: string;
  excerpt: string;
  sourceType: SourceType;
  sourceFilename?: string;
  collectionId?: string;
  docId?: string;
}

export type QueueItemStatus = 'queued' | 'uploading' | 'completed' | 'partial' | 'failed' | 'skipped';

export type IngestionStage =
  | 'waiting'
  | 'uploading'
  | 'extracting'
  | 'indexing'
  | 'preparing_questions'
  | 'completed'
  | 'failed'
  | 'skipped';

export interface FileQueueItem {
  id: string;
  file: File;
  name: string;
  size: number;
  format: 'pdf' | 'pptx' | 'text' | 'video' | 'unsupported';
  status: QueueItemStatus;
  stage?: IngestionStage;
  progressPercent?: number;
  progress?: number;
  error?: string;
  warnings?: string[];
  docId?: string;
  chunkCount?: number;
  locatorSummary?: string;
}

export interface MaterialDocumentMetadata {
  docId: string;
  filename: string;
  format: string;
  sizeBytes: number;
  chunkCount: number;
  status: string;
  locatorSummary?: string;
  warnings?: string[];
}

export interface MaterialCollectionSummary {
  collectionId: string;
  name: string;
  documents: MaterialDocumentMetadata[];
  totalChunks: number;
  updatedAt?: string;
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
  // Card was reconstructed from a past completed attempt (quiz_history),
  // not a live, ready-to-start quiz with real questions loaded.
  isFromHistory?: boolean;
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
  id?: string;
  name: string;
  role: string;
  avatarUrl: string;
  email: string;
  institution?: string;
  courseProgram?: string;
  studyGoal?: string;
  bio?: string;
  createdAt?: string;
  totalQuizzesAttempted: number;
  averageScore: number;
  bestScore: number;
  accuracy: number;
  streakDays: number;
  overallProgress: number;
}

export interface UserSettings {
  theme: ThemeMode;
  dyslexiaMode: boolean;
  speechRate: number;
  speechPitch: number;
  reducedMotion: boolean;
  fontSize: 'standard' | 'large';
  explanationLanguage: 'english' | 'hindi';
  explanationStyle: 'concise' | 'step-by-step' | 'example-first';
  dailyStudyMinutes: number;
  examDate?: string;
  weakTopicInterval: 'daily' | 'before_quiz' | 'weekly';
}