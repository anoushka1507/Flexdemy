import React, {
  useEffect,
  useState,
} from 'react';

import { TutorChatPanel } from '../../components/TutorChatPanel';
import { ReadAloudControls } from '../ReadAloudControls';
import { speechController } from '../../utils/speechController';
import { apiFetch } from '../../utils/api';

// @ts-ignore
import Hypher from 'hypher';
// @ts-ignore
import english from 'hyphenation.en-us';

import {
  Quiz,
  QuizResult,
  ViewMode,
  Question,
} from '../../types';

const h = new Hypher(english);

interface ActiveQuizViewProps {
  quiz: Quiz;

  adaptiveSessionId?: string;

  setCurrentView: (
    view: ViewMode
  ) => void;

  dyslexiaMode: boolean;

  setDyslexiaMode: (
    enabled: boolean
  ) => void;

  onCompleteQuiz: (
    result: QuizResult,
    completedQuiz?: Quiz
  ) => void;
}


export const ActiveQuizView: React.FC<
  ActiveQuizViewProps
> = ({
  quiz,
  adaptiveSessionId,
  setCurrentView,
  dyslexiaMode,
  setDyslexiaMode,
  onCompleteQuiz,
}) => {

  const isAdaptive =
    Boolean(adaptiveSessionId);


  // ----------------------------------------------------------
  // Questions already shown to the student.
  //
  // For adaptive mode this starts with Q1 and grows
  // one question at a time.
  // ----------------------------------------------------------

  const [
    questions,
    setQuestions,
  ] = useState<Question[]>(
    quiz.questions
  );


  const [
    currentQuestionIndex,
    setCurrentQuestionIndex,
  ] = useState(0);


  const [
    selectedAnswers,
    setSelectedAnswers,
  ] = useState<
    Record<number, number | null>
  >({});


  const [
    flaggedQuestions,
    setFlaggedQuestions,
  ] = useState<
    Record<number, boolean>
  >({});


  const [
    reviewLaterQuestions,
    setReviewLaterQuestions,
  ] = useState<
    Record<number, boolean>
  >({});


  const [
    showHint,
    setShowHint,
  ] = useState<
    Record<number, boolean>
  >({});


  const [
    secondsSpent,
    setSecondsSpent,
  ] = useState(0);

  const [
    adaptiveLoading,
    setAdaptiveLoading,
  ] = useState(false);


  const [
    adaptiveError,
    setAdaptiveError,
  ] = useState('');

  // Track D: open-ended (short-answer / numerical) question support.
  const [
    openAnswers,
    setOpenAnswers,
  ] = useState<Record<number, string>>({});

  const [
    answeredCorrectly,
    setAnsweredCorrectly,
  ] = useState<Record<number, boolean>>({});

  const [
    openFeedback,
    setOpenFeedback,
  ] = useState<Record<number, string>>({});

  const [
    feedbackState,
    setFeedbackState,
  ] = useState<Record<number, {
    isChecked: boolean;
    wasCorrect: boolean;
    explanation: string;
    misconception?: string | null;
    sourceLocator?: string;
  }>>({});

  const [
    pendingNextQuestion,
    setPendingNextQuestion,
  ] = useState<any | null>(null);

  const [
    isTutorChatOpen,
    setIsTutorChatOpen,
  ] = useState(false);


  const [
    spokenHighlight,
    setSpokenHighlight,
  ] = useState<{ type: 'question' | 'option', optIndex?: number, wordIndex: number } | null>(null);

  const [
    speechSpeed,
    setSpeechSpeed,
  ] = useState(0.85);


  // ----------------------------------------------------------
  // Timer
  // ----------------------------------------------------------

  useEffect(() => {

    const timer =
      setInterval(() => {

        setSecondsSpent(
          (prev) => prev + 1
        );

      }, 1000);

    return () =>
      clearInterval(timer);

  }, []);


  // ----------------------------------------------------------
  // Reset if the quiz prop changes.
  // ----------------------------------------------------------

  useEffect(() => {

    setQuestions(
      quiz.questions
    );

    setCurrentQuestionIndex(0);
    setSelectedAnswers({});
    setFlaggedQuestions({});
    setReviewLaterQuestions({});
    setShowHint({});
    setSecondsSpent(0);
    setAdaptiveError('');
    setFeedbackState({});
    setPendingNextQuestion(null);
    setAnsweredCorrectly({});

  }, [
  quiz.id,
  adaptiveSessionId,
]);


  const currentQuestion =
    questions[
      currentQuestionIndex
    ];


  if (!currentQuestion) {

    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-sm font-semibold text-[#7372A5]">
          Loading question...
        </div>
      </div>
    );

  }

  const isMcqQuestion =
    !currentQuestion.questionType ||
    currentQuestion.questionType === 'mcq';


  // ----------------------------------------------------------
  // TEXT TO SPEECH (DYSLEXIA MODE)
  // ----------------------------------------------------------

  const speakWord = (word: string, type: 'question' | 'option', optIndex: number, wordIndex: number) => {
    setSpokenHighlight({ type, optIndex, wordIndex });
    const cleanWord = word.replace(/[.,!?]/g, '');
    
    // Break into syllables for clear, slow pronunciation
    const syllables = h.hyphenate(cleanWord);
    // Use hyphens instead of commas to prevent the TTS engine from treating
    // syllables like "vi" as isolated Roman numerals (e.g., reading "6")
    const syllabifiedText = syllables.join('-'); 

    const passageId = `quiz-word-${currentQuestion.id}-${type}-${optIndex}-${wordIndex}`;
    speechController.play(passageId, syllabifiedText, {
      rate: 0.3,
      lang: 'en-US',
      onEnd: () => setSpokenHighlight(null),
      onError: () => setSpokenHighlight(null),
    });
  };

  const speakFullQuestion = () => {
    setSpokenHighlight(null);

    const qWords = currentQuestion.question.split(' ');
    const qCharMap: number[] = [];
    let qc = 0, qw = 0;
    for (const word of qWords) {
      for (let i = 0; i < word.length; i++) qCharMap[qc++] = qw;
      qCharMap[qc++] = qw; // space
      qw++;
    }

    const UtteranceCtor =
      (window as any).SpeechSynthesisUtterance ||
      (globalThis as any).SpeechSynthesisUtterance;
    if (!UtteranceCtor) return;

    const qUtterance = new UtteranceCtor(currentQuestion.question);
    qUtterance.lang = 'en-US';
    qUtterance.rate = dyslexiaMode ? speechSpeed : 1.0;

    qUtterance.onboundary = (e: SpeechSynthesisEvent) => {
      if (e.name === 'word') {
        const idx = qCharMap[e.charIndex];
        if (idx !== undefined) {
          setSpokenHighlight({ type: 'question', wordIndex: idx });
        }
      }
    };

    const optionUtterances: SpeechSynthesisUtterance[] = [];
    if (isMcqQuestion && currentQuestion.options) {
      currentQuestion.options.forEach((opt, optIndex) => {
        const prefix = `Option ${['A', 'B', 'C', 'D', 'E'][optIndex]}: `;
        const prefixLen = prefix.length;

        const optWords = opt.split(' ');
        const optCharMap: number[] = [];
        let cc = 0, ww = 0;
        for (const word of optWords) {
          for (let i = 0; i < word.length; i++) optCharMap[cc++] = ww;
          optCharMap[cc++] = ww;
          ww++;
        }

        const oUtt = new UtteranceCtor(prefix + opt);
        oUtt.lang = 'en-US';
        oUtt.rate = dyslexiaMode ? speechSpeed : 1.0;
        oUtt.onboundary = (e: SpeechSynthesisEvent) => {
          if (e.name === 'word') {
            const adj = e.charIndex - prefixLen;
            if (adj >= 0) {
              const idx = optCharMap[adj];
              if (idx !== undefined) {
                setSpokenHighlight({ type: 'option', optIndex, wordIndex: idx });
              }
            } else {
              setSpokenHighlight(null);
            }
          }
        };
        optionUtterances.push(oUtt);
      });
    }

    const passageId = `quiz-question-${currentQuestion.id}`;
    speechController.playChained(passageId, [qUtterance, ...optionUtterances], {
      onEnd: () => setSpokenHighlight(null),
      onError: () => setSpokenHighlight(null),
    });
  };

  // Stop in-progress read-aloud when moving to a different question,
  // or when leaving this view completely
  useEffect(() => {
    return () => {
      speechController.stop();
      setSpokenHighlight(null);
    };
  }, [currentQuestionIndex]);

  useEffect(() => {
    return () => {
      speechController.stop();
      setSpokenHighlight(null);
    };
  }, []);

  // ----------------------------------------------------------
  // OPTION SELECTION
  // ----------------------------------------------------------

  const handleSelectOption = (
  optionIndex: number
) => {

  if (adaptiveLoading || feedbackState[currentQuestion.id]?.isChecked) return;

  setSelectedAnswers(
    (prev) => ({
      ...prev,
      [currentQuestion.id]:
        optionIndex,
    })
  );

};

  const handleCheckCurrentAnswer = async () => {
    if (adaptiveLoading || feedbackState[currentQuestion.id]?.isChecked) return;

    if (isAdaptive && adaptiveSessionId) {
      if (isMcqQuestion) {
        const selected = selectedAnswers[currentQuestion.id];
        if (selected === undefined || selected === null) {
          setAdaptiveError('Please select an option first.');
          return;
        }
        setAdaptiveError('');
        setAdaptiveLoading(true);

        try {
          const response = await apiFetch('/api/answer-adaptive-question', {
            method: 'POST',
            body: JSON.stringify({
              session_id: adaptiveSessionId,
              question_number: currentQuestion.id,
              selected_option_index: selected,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Could not process the answer.');
          }

          const data = await response.json();
          const wasCorrect = Boolean(data.was_correct);

          setAnsweredCorrectly((prev) => ({
            ...prev,
            [currentQuestion.id]: wasCorrect,
          }));

          setFeedbackState((prev) => ({
            ...prev,
            [currentQuestion.id]: {
              isChecked: true,
              wasCorrect,
              explanation:
                data.explanation ||
                (wasCorrect
                  ? 'Great job! Your answer matches the source concept.'
                  : 'Review the cited source below to master this concept.'),
              misconception: data.misconception || null,
              sourceLocator: data.source_locator || currentQuestion.sourceLocator || '',
            },
          }));

          setPendingNextQuestion(data);
        } catch (err: any) {
          console.error('Adaptive answer error:', err);
          setAdaptiveError(err?.message || 'Error processing answer.');
        } finally {
          setAdaptiveLoading(false);
        }
      } else {
        const answerText = (openAnswers[currentQuestion.id] || '').trim();
        if (!answerText) {
          setAdaptiveError('Please enter an answer first.');
          return;
        }
        setAdaptiveError('');
        setAdaptiveLoading(true);

        try {
          const response = await apiFetch('/api/answer-adaptive-question-open', {
            method: 'POST',
            body: JSON.stringify({
              session_id: adaptiveSessionId,
              question_number: currentQuestion.id,
              student_answer: answerText,
            }),
          });

          if (!response.ok) {
            const text = await response.text();
            throw new Error(text || 'Could not process the answer.');
          }

          const data = await response.json();
          const wasCorrect = Boolean(data.was_correct);

          setAnsweredCorrectly((prev) => ({
            ...prev,
            [currentQuestion.id]: wasCorrect,
          }));

          setOpenFeedback((prev) => ({
            ...prev,
            [currentQuestion.id]: data.feedback || data.explanation || '',
          }));

          setFeedbackState((prev) => ({
            ...prev,
            [currentQuestion.id]: {
              isChecked: true,
              wasCorrect,
              explanation: data.explanation || data.feedback || (wasCorrect ? 'Correct!' : 'Incorrect.'),
              sourceLocator: data.source_locator || currentQuestion.sourceLocator || '',
            },
          }));

          setPendingNextQuestion(data);
        } catch (err: any) {
          console.error('Open-answer question error:', err);
          setAdaptiveError(err?.message || 'Error processing answer.');
        } finally {
          setAdaptiveLoading(false);
        }
      }
    } else {
      // Non-adaptive static quiz fallback
      if (isMcqQuestion) {
        const selected = selectedAnswers[currentQuestion.id];
        if (selected === undefined || selected === null) {
          setAdaptiveError('Please select an option first.');
          return;
        }
        setAdaptiveError('');
        const wasCorrect = selected === currentQuestion.correctAnswerIndex;
        let misconception: string | null = null;
        const bq = currentQuestion.backendQuestion as any;
        if (bq?.options && Array.isArray(bq.options)) {
          misconception = bq.options[selected]?.misconception_tag || null;
        }
        const explanation =
          currentQuestion.explanation ||
          bq?.explanation ||
          currentQuestion.hint ||
          (wasCorrect
            ? 'Great job! Your answer matches the source concept.'
            : 'Review the cited source below to master this concept.');
        const sourceLocator = currentQuestion.sourceLocator || bq?.source_locator || '';

        setFeedbackState((prev) => ({
          ...prev,
          [currentQuestion.id]: {
            isChecked: true,
            wasCorrect,
            explanation,
            misconception,
            sourceLocator,
          },
        }));
        setAnsweredCorrectly((prev) => ({
          ...prev,
          [currentQuestion.id]: wasCorrect,
        }));
      } else {
        const answerText = (openAnswers[currentQuestion.id] || '').trim();
        if (!answerText) {
          setAdaptiveError('Please enter an answer first.');
          return;
        }
        setAdaptiveError('');
        const bq = currentQuestion.backendQuestion as any;
        const expected = bq?.expected_answer || '';
        let wasCorrect = false;

        if (currentQuestion.questionType === 'numerical') {
          const numStudent = parseFloat(answerText.replace(/,/g, ''));
          const numExpected = parseFloat(String(expected).replace(/,/g, ''));
          const tol = bq?.numerical_tolerance || 0.05;
          if (!isNaN(numStudent) && !isNaN(numExpected)) {
            wasCorrect = Math.abs(numStudent - numExpected) <= Math.max(tol, 0.01 * Math.abs(numExpected));
          }
        } else {
          const cleanS = answerText.toLowerCase().trim();
          const cleanE = String(expected).toLowerCase().trim();
          wasCorrect = cleanS === cleanE || (cleanE.length > 3 && cleanS.includes(cleanE));
        }

        const explanation = bq?.explanation || (wasCorrect ? `Correct! Expected: ${expected}` : `Expected: ${expected}`);
        const sourceLocator = currentQuestion.sourceLocator || bq?.source_locator || '';

        setFeedbackState((prev) => ({
          ...prev,
          [currentQuestion.id]: {
            isChecked: true,
            wasCorrect,
            explanation,
            sourceLocator,
          },
        }));
        setAnsweredCorrectly((prev) => ({
          ...prev,
          [currentQuestion.id]: wasCorrect,
        }));
      }
    }
  };

  const handleClearSelection = () => {

    setSelectedAnswers(
      (prev) => ({
        ...prev,
        [currentQuestion.id]:
          null,
      })
    );
  };


  // ----------------------------------------------------------
  // FLAGS / REVIEW
  // ----------------------------------------------------------

  const handleToggleFlag = () => {

    setFlaggedQuestions(
      (prev) => ({
        ...prev,
        [currentQuestion.id]:
          !prev[
            currentQuestion.id
          ],
      })
    );
  };


  const handleToggleReviewLater = () => {

    setReviewLaterQuestions(
      (prev) => ({
        ...prev,
        [currentQuestion.id]:
          !prev[
            currentQuestion.id
          ],
      })
    );
  };


  // ----------------------------------------------------------
  // CREATE FINAL RESULT
  // ----------------------------------------------------------

  const finishQuiz = (
    finalQuestions: Question[]
  ) => {

    let correctCount = 0;

    finalQuestions.forEach(
      (question) => {

        const openResult =
          answeredCorrectly[
            question.id
          ];

        if (openResult !== undefined) {

          if (openResult) {
            correctCount += 1;
          }

          return;
        }

        const selected =
          selectedAnswers[
            question.id
          ];

        if (
          selected ===
          question.correctAnswerIndex
        ) {
          correctCount += 1;
        }

      }
    );


    const total =
      finalQuestions.length;


    const scorePercentage =
      total > 0
        ? Math.round(
            (correctCount / total) *
              100
          )
        : 0;


    // --------------------------------------------------------
    // Build concept-level breakdown.
    // --------------------------------------------------------

    const breakdown =
      new Map<
        string,
        {
          score: number;
          total: number;
        }
      >();


    finalQuestions.forEach(
      (question) => {

        const concept =
          question.concept ||
          quiz.topic;


        const existing =
          breakdown.get(
            concept
          ) || {
            score: 0,
            total: 0,
          };


        existing.total += 1;


        const openResult =
          answeredCorrectly[
            question.id
          ];

        const isCorrect =
          openResult !== undefined
            ? openResult
            : selectedAnswers[
                question.id
              ] ===
              question.correctAnswerIndex;

        if (isCorrect) {
          existing.score += 1;
        }


        breakdown.set(
          concept,
          existing
        );

      }
    );


    const topicBreakdown =
      Array.from(
        breakdown.entries()
      ).map(
        ([topicName, data]) => ({
          topicName,
          score: data.score,
          total: data.total,
          masteryPercentage:
            Math.round(
              (data.score /
                data.total) *
                100
            ),
        })
      );


    const result: QuizResult = {

      quizId: quiz.id,

      quizTitle: quiz.title,

      scorePercentage,

      totalQuestions: total,

      correctAnswersCount:
        correctCount,

      incorrectAnswersCount:
        total - correctCount,

      timeSpentSeconds:
        secondsSpent,

      dateCompleted:
        'Just now',

      userAnswers:
        selectedAnswers,

      openEndedResults:
        answeredCorrectly,

      topicBreakdown,
    };


    const completedQuiz: Quiz = {
      ...quiz,
      questions:
        finalQuestions,
      totalQuestions:
        finalQuestions.length,
    };


    onCompleteQuiz(
      result,
      completedQuiz
    );
  };


  // ----------------------------------------------------------
  // ADAPTIVE NEXT QUESTION
  // ----------------------------------------------------------

  const handleAdaptiveNext = () => {
    if (!pendingNextQuestion) return;

    const data = pendingNextQuestion;
    setPendingNextQuestion(null);

    if (data.completed) {
      finishQuiz(questions);
      return;
    }

    const raw = data.question;
    const rawOptions = Array.isArray(raw?.options) ? raw.options : [];
    const options = rawOptions
      .map((option: any) =>
        typeof option === 'string' ? option : option?.text || ''
      )
      .filter((option: string) => option.trim().length > 0);

    const correctAnswerIndex = rawOptions.findIndex(
      (option: any) =>
        option?.is_correct === true ||
        option?.isCorrect === true ||
        option?.correct === true
    );

    const nextIsMcq = !raw?.question_type || raw.question_type === 'mcq';

    if (
      !raw?.question_text ||
      (nextIsMcq && (options.length !== 4 || correctAnswerIndex < 0))
    ) {
      setAdaptiveError('The backend returned an invalid next question.');
      return;
    }

    const nextQuestion: Question = {
      id: currentQuestion.id + 1,
      question: raw.question_text,
      options,
      correctAnswerIndex,
      hint: '',
      explanation: '',
      concept: data.next_concept,
      difficulty: String(
        data.next_difficulty || 'medium'
      ).replace(/^./, (c) => c.toUpperCase()) as
        | 'Easy'
        | 'Medium'
        | 'Hard',
      questionType: raw.question_type || 'mcq',
      topic: raw.topic,
      sourceLocator: raw.source_locator,
      backendQuestion: raw,
    };

    setSelectedAnswers((prev) => {
      const next = { ...prev };
      delete next[nextQuestion.id];
      return next;
    });

    setOpenAnswers((prev) => {
      const next = { ...prev };
      delete next[nextQuestion.id];
      return next;
    });

    setQuestions((prev) => [...prev, nextQuestion]);
    setCurrentQuestionIndex((prev) => prev + 1);
  };

  const handleOpenAnswerSubmit = handleAdaptiveNext;


  // ----------------------------------------------------------
  // STATIC QUIZ NEXT
  // ----------------------------------------------------------

  const handleStaticNext =
    () => {

      if (
        currentQuestionIndex <
        questions.length - 1
      ) {

        setCurrentQuestionIndex(
          (prev) => prev + 1
        );

      } else {

        finishQuiz(
          questions
        );

      }
    };


  // ----------------------------------------------------------
  // CURRENT ANSWER / PROGRESS
  // ----------------------------------------------------------

  const answeredCount =
    Object.values(
      selectedAnswers
    ).filter(
      (value) =>
        value !== null &&
        value !== undefined
    ).length;


  const progressPercent =
    Math.round(
      (answeredCount /
        quiz.totalQuestions) *
        100
    );


  const currentDifficulty =
    currentQuestion.difficulty ||
    quiz.difficulty;


  return (

    <div className="min-h-screen bg-[#f6f6fa] flex flex-col text-left">

      {/* ====================================================
          HEADER
      ==================================================== */}

      <header className="bg-white border-b border-[#d8d7e8] px-4 sm:px-8 py-3.5 sticky top-0 z-30 flex items-center justify-between gap-4">

        <div className="flex items-center gap-3">

          <button
            onClick={() =>
              setCurrentView(
                'dashboard'
              )
            }
            className="flex items-center gap-1.5 text-xs font-bold text-gray-500 hover:text-[#7372A5] bg-gray-50 px-3 py-1.5 rounded-xl"
          >
            ←
            <span>
              Exit Quiz
            </span>
          </button>

          <div className="h-5 w-px bg-gray-200 hidden sm:block" />

          <div>
            <h1 className="text-base sm:text-lg font-extrabold text-[#222138]">
              {quiz.title}
            </h1>

            <span className="text-[11px] text-gray-400 font-semibold">
              {currentQuestion.concept ||
                quiz.topic}
            </span>
          </div>

        </div>


        <div className="flex items-center gap-3">

          <div className="flex items-center gap-2 bg-[#ececf4] px-3 py-1 rounded-xl border border-[#d8d7e8]">

            <span className="text-xs text-gray-700 font-medium hidden md:inline">
              Dyslexia Mode:
            </span>

            <span className="text-xs font-bold text-[#7372A5]">
              {dyslexiaMode
                ? 'ON'
                : 'OFF'}
            </span>

            <button
              onClick={() =>
                setDyslexiaMode(
                  !dyslexiaMode
                )
              }
              className={`relative inline-flex h-5 w-9 shrink-0 rounded-full ${
                dyslexiaMode
                  ? 'bg-[#7372A5]'
                  : 'bg-gray-300'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white shadow ${
                  dyslexiaMode
                    ? 'translate-x-4'
                    : 'translate-x-0'
                }`}
              />
            </button>

          </div>


          <span className="bg-[#ececf4] text-[#7372A5] border border-[#d8d7e8] text-xs font-bold px-3 py-1 rounded-full hidden sm:inline">
            {currentDifficulty}
          </span>


          {isAdaptive && (
            <button
              onClick={() => setIsTutorChatOpen(true)}
              className="bg-[#ececf4] text-[#7372A5] border border-[#d8d7e8] text-xs font-bold px-3 py-2 rounded-xl"
            >
              Ask Tutor
            </button>
          )}

          {!isAdaptive && (
            <button
              onClick={() =>
                finishQuiz(
                  questions
                )
              }
              className="bg-[#7372A5] text-white text-xs font-bold px-4 py-2 rounded-xl"
            >
              Submit Quiz
            </button>
          )}

        </div>

      </header>

      <TutorChatPanel
        isOpen={isTutorChatOpen}
        onClose={() => setIsTutorChatOpen(false)}
        sessionId={adaptiveSessionId}
        materialTitle={quiz.title}
        currentTopic={questions[currentQuestionIndex]?.topic || questions[currentQuestionIndex]?.concept || quiz.topic}
      />


      {/* ====================================================
          BODY
      ==================================================== */}

      <div className="flex-1 max-w-7xl w-full mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">

        {/* ==================================================
            LEFT SIDEBAR
        ================================================== */}

        <div className="lg:col-span-1 space-y-6">

          <div className="bg-white p-5 rounded-2xl border border-[#d8d7e8] shadow-xs space-y-3">

            <div className="flex items-center justify-between text-xs font-bold">

              <span className="text-gray-500">
                Progress
              </span>

              <span className="text-[#7372A5]">
                {currentQuestionIndex + 1}
                {' '}
                of
                {' '}
                {quiz.totalQuestions}
              </span>

            </div>

            <div className="w-full bg-[#ececf4] h-2.5 rounded-full overflow-hidden">

              <div
                className="bg-[#7372A5] h-full rounded-full transition-all"
                style={{
                  width: `${progressPercent}%`,
                }}
              />

            </div>

          </div>


          {/* Concept / adaptive information */}

          {isAdaptive && (
            <div className="bg-white p-5 rounded-2xl border border-[#d8d7e8] space-y-3">

              <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
                Adaptive Engine
              </h3>

              <div className="text-xs text-gray-600 space-y-2">

                <p>
                  <strong>
                    Current concept:
                  </strong>{' '}
                  {currentQuestion.concept}
                </p>

                <p>
                  <strong>
                    Current difficulty:
                  </strong>{' '}
                  {currentDifficulty}
                </p>

                <p className="text-[#7372A5]">
                  Difficulty changes after
                  two consecutive correct or
                  incorrect answers.
                </p>

              </div>

            </div>
          )}


          {/* Question navigator */}

          <div className="bg-white p-5 rounded-2xl border border-[#d8d7e8] space-y-4">

            <h3 className="text-xs font-bold uppercase tracking-wider text-gray-500">
              Question Navigator
            </h3>

            <div className="grid grid-cols-5 gap-2">

              {questions.map(
                (q, idx) => {

                  const isSelected =
                    selectedAnswers[
                      q.id
                    ] !== undefined &&
                    selectedAnswers[
                      q.id
                    ] !== null;

                  const isCurrent =
                    idx ===
                    currentQuestionIndex;

                  const isReview =
                    reviewLaterQuestions[
                      q.id
                    ];

                  return (
                    <button
                      key={q.id}
                      disabled={
                        isAdaptive
                      }
                      onClick={() =>
                        setCurrentQuestionIndex(
                          idx
                        )
                      }
                      className={`w-10 h-10 rounded-xl font-bold text-xs flex items-center justify-center relative ${
                        isCurrent
                          ? 'ring-2 ring-[#7372A5] bg-[#ececf4] text-[#7372A5]'
                          : isSelected
                          ? 'bg-[#7372A5] text-white'
                          : 'bg-[#ececf4]/60 text-gray-600'
                      } ${
                        isAdaptive
                          ? 'cursor-default'
                          : ''
                      }`}
                    >

                      {idx + 1}

                      {isReview && (
                        <span className="w-2 h-2 rounded-full bg-amber-400 absolute top-1 right-1" />
                      )}

                    </button>
                  );
                }
              )}

            </div>

            {isAdaptive && (
              <p className="text-[10px] text-gray-400">
                Adaptive quizzes move forward
                one question at a time.
              </p>
            )}

          </div>


          <button
            onClick={
              handleToggleReviewLater
            }
            className={`w-full py-2.5 px-4 rounded-xl border text-xs font-bold flex items-center justify-center gap-2 ${
              reviewLaterQuestions[
                currentQuestion.id
              ]
                ? 'bg-amber-50 text-amber-700 border-amber-300'
                : 'bg-white text-gray-700 border-[#d8d7e8]'
            }`}
          >
            🔖
            <span>
              {reviewLaterQuestions[
                currentQuestion.id
              ]
                ? 'Marked for Review'
                : 'Review Later'}
            </span>
          </button>

        </div>


        {/* ==================================================
            QUESTION
        ================================================== */}

        <div className="lg:col-span-3 space-y-6">

          <div className="bg-white rounded-3xl p-6 sm:p-8 border border-[#d8d7e8] shadow-md space-y-6">

            <div className="flex items-center justify-between pb-4 border-b border-[#d8d7e8]">

              <span className="text-xs font-extrabold uppercase tracking-widest text-[#7372A5] bg-[#ececf4] px-3 py-1 rounded-full">
                QUESTION{' '}
                {currentQuestionIndex + 1}
              </span>

              <div className="flex items-center gap-3 flex-wrap justify-end">
                {dyslexiaMode && (
                  <select
                    aria-label="Select speech speed"
                    title="Speech Speed"
                    className="text-xs font-bold text-[#7372A5] bg-[#ececf4] border border-[#d8d7e8] rounded-xl px-2.5 py-1.5 outline-none cursor-pointer hover:bg-[#d8d7e8] transition-colors"
                    value={speechSpeed}
                    onChange={(e) => {
                      setSpeechSpeed(parseFloat(e.target.value));
                      speechController.stop();
                      setSpokenHighlight(null);
                    }}
                  >
                    <option value={0.5}>0.5x Speed</option>
                    <option value={0.75}>0.75x Speed</option>
                    <option value={0.85}>0.85x Speed (Default)</option>
                    <option value={1.0}>1x Speed</option>
                  </select>
                )}

                <ReadAloudControls
                  passageId={`quiz-question-${currentQuestion.id}`}
                  onPlay={speakFullQuestion}
                />
              </div>

            </div>

            <div className="space-y-2">
              <h2 className="text-xl sm:text-2xl font-bold text-[#222138] leading-snug">
                {dyslexiaMode ? (
                  currentQuestion.question.split(' ').map((word, index) => (
                    <span key={index} className="inline-block relative group">
                      <button 
                        onClick={() => speakWord(word, 'question', 0, index)}
                        className={`transition-all duration-200 rounded px-1 underline decoration-dotted decoration-purple-300 relative z-10 ${
                          spokenHighlight?.type === 'question' && spokenHighlight?.wordIndex === index 
                            ? 'bg-yellow-200 text-yellow-900 scale-110 shadow-sm' 
                            : 'hover:bg-purple-100 hover:text-purple-800 hover:scale-110 hover:shadow-sm'
                        }`}
                      >
                        {word}
                      </button>
                      <span className="absolute -top-8 left-1/2 -translate-x-1/2 bg-[#222138] text-white text-[10px] font-bold px-2 py-1 rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-20">
                        Click to hear
                        <span className="absolute -bottom-1 left-1/2 -translate-x-1/2 border-[4px] border-transparent border-t-[#222138]"></span>
                      </span>
                      <span className="mr-1"> </span>
                    </span>
                  ))
                ) : (
                  currentQuestion.question
                )}
              </h2>

              <p className="text-xs text-gray-400 font-medium">
                Select the correct answer.
              </p>
            </div>

            {currentQuestion.sourceLocator && (
              <div className="text-[11px] font-semibold text-[#7372A5] bg-[#ececf4] inline-flex items-center gap-1 px-2.5 py-1 rounded-full">
                Source: {currentQuestion.sourceLocator}
              </div>
            )}

            {/* Open-ended answer (short-answer / numerical) */}
            {!isMcqQuestion && (
              <div className="space-y-2 pt-2">
                <input
                  type={
                    currentQuestion.questionType === 'numerical'
                      ? 'text'
                      : 'text'
                  }
                  inputMode={
                    currentQuestion.questionType === 'numerical'
                      ? 'decimal'
                      : 'text'
                  }
                  value={openAnswers[currentQuestion.id] || ''}
                  onChange={(e) =>
                    setOpenAnswers((prev) => ({
                      ...prev,
                      [currentQuestion.id]: e.target.value,
                    }))
                  }
                  disabled={adaptiveLoading}
                  placeholder={
                    currentQuestion.questionType === 'numerical'
                      ? 'Enter a numeric answer...'
                      : 'Type your answer...'
                  }
                  className="w-full px-4 py-3 rounded-2xl border-2 border-[#d8d7e8] focus:outline-none focus:ring-2 focus:ring-[#7372A5]/50 focus:border-[#7372A5] text-sm font-semibold"
                />

                {openFeedback[currentQuestion.id] && (
                  <p className="text-xs text-gray-500">
                    {openFeedback[currentQuestion.id]}
                  </p>
                )}
              </div>
            )}

            {/* Answer Options (MCQ) */}
            {isMcqQuestion && (
            <>
            <div className="space-y-3 pt-2">
              {currentQuestion.options.map((option, optionIndex) => {
                const isSelected = selectedAnswers[currentQuestion.id] === optionIndex;
                const isChecked = Boolean(feedbackState[currentQuestion.id]?.isChecked);
                const isCorrectOption = optionIndex === currentQuestion.correctAnswerIndex;
                const letters = ['A', 'B', 'C', 'D', 'E'];

                let optionStyle = 'border-[#d8d7e8] bg-white hover:border-[#7372A5]/50 hover:bg-[#ececf4]/30';
                let badgeStyle = 'bg-[#ececf4] text-[#7372A5] group-hover:bg-[#d8d7e8]';

                if (isChecked) {
                  if (isCorrectOption) {
                    optionStyle = 'border-emerald-500 bg-emerald-50/80 shadow-xs ring-1 ring-emerald-400';
                    badgeStyle = 'bg-emerald-600 text-white';
                  } else if (isSelected) {
                    optionStyle = 'border-rose-500 bg-rose-50/80 shadow-xs ring-1 ring-rose-400';
                    badgeStyle = 'bg-rose-600 text-white';
                  } else {
                    optionStyle = 'border-[#d8d7e8] bg-white opacity-40';
                  }
                } else if (isSelected) {
                  optionStyle = 'border-[#7372A5] bg-[#ececf4] shadow-xs';
                  badgeStyle = 'bg-[#7372A5] text-white';
                }

                return (
                  <button
                    key={optionIndex}
                    disabled={adaptiveLoading || isChecked}
                    onClick={() => handleSelectOption(optionIndex)}
                    className={`w-full min-w-0 p-4 rounded-2xl border-2 text-left transition-all flex items-center justify-between group ${optionStyle} ${adaptiveLoading ? 'opacity-70' : ''}`}
                  >
                    <div className="flex items-center gap-3.5 min-w-0 flex-1">
                      <span
                        className={`w-8 h-8 rounded-xl font-bold text-xs flex items-center justify-center transition-colors ${badgeStyle}`}
                      >
                        {letters[optionIndex]}
                      </span>

                      <span className="text-sm font-semibold text-[#222138] break-words whitespace-normal min-w-0">
                        {dyslexiaMode ? (
                          option.split(' ').map((word, index) => (
                            <span 
                              key={index}
                              onClick={(e) => {
                                e.stopPropagation();
                                speakWord(word, 'option', optionIndex, index);
                              }}
                              className={`inline-block transition-all duration-200 rounded px-1 cursor-pointer ${
                                spokenHighlight?.type === 'option' && spokenHighlight?.optIndex === optionIndex && spokenHighlight?.wordIndex === index 
                                  ? 'bg-yellow-200 text-yellow-900 scale-110 shadow-sm' 
                                  : 'hover:bg-purple-100 hover:text-purple-800 hover:scale-110 hover:shadow-sm'
                              }`}
                            >
                              {word}&nbsp;
                            </span>
                          ))
                        ) : (
                          option
                        )}
                      </span>
                    </div>

                    <div
                      className={`w-5 h-5 shrink-0 rounded-full border-2 flex items-center justify-center transition-colors ${
                        isChecked
                          ? isCorrectOption
                            ? 'border-emerald-600 bg-emerald-600 text-white'
                            : isSelected
                            ? 'border-rose-600 bg-rose-600 text-white'
                            : 'border-gray-300'
                          : isSelected
                          ? 'border-[#7372A5] bg-[#7372A5]'
                          : 'border-gray-300'
                      }`}
                    >
                      {isChecked ? (
                        isCorrectOption ? (
                          <span className="text-white text-[10px] font-extrabold">✓</span>
                        ) : isSelected ? (
                          <span className="text-white text-[10px] font-extrabold">✕</span>
                        ) : null
                      ) : isSelected ? (
                        <span className="w-2 h-2 rounded-full bg-white" />
                      ) : null}
                    </div>
                  </button>
                );
              })}
            </div>

            {selectedAnswers[currentQuestion.id] !== undefined &&
              selectedAnswers[currentQuestion.id] !== null &&
              !feedbackState[currentQuestion.id]?.isChecked && (
                <button
                  onClick={handleClearSelection}
                  className="text-xs text-gray-400 underline"
                >
                  Clear Selection
                </button>
              )}

            </>
            )}

            {/* Immediate Cited Feedback Card (Requirement 3.c & 2.a) */}
            {feedbackState[currentQuestion.id]?.isChecked && (
              <div
                className={`p-5 rounded-2xl border-2 transition-all space-y-3 ${
                  feedbackState[currentQuestion.id].wasCorrect
                    ? 'bg-emerald-50/90 border-emerald-300 text-emerald-950'
                    : 'bg-rose-50/90 border-rose-300 text-rose-950'
                }`}
              >
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-7 h-7 rounded-lg text-white font-extrabold text-xs flex items-center justify-center ${
                        feedbackState[currentQuestion.id].wasCorrect
                          ? 'bg-emerald-600'
                          : 'bg-rose-600'
                      }`}
                    >
                      {feedbackState[currentQuestion.id].wasCorrect ? '✓' : '✕'}
                    </span>
                    <h4 className="font-extrabold text-sm">
                      {feedbackState[currentQuestion.id].wasCorrect
                        ? 'Correct!'
                        : 'Incorrect'}
                    </h4>
                  </div>

                  {feedbackState[currentQuestion.id].sourceLocator && (
                    <span className="text-[11px] font-bold px-3 py-1 rounded-full bg-white border border-gray-200 text-[#7372A5] flex items-center gap-1.5 shadow-2xs">
                      <span className="material-symbols-outlined text-xs">menu_book</span>
                      <span>Source: {feedbackState[currentQuestion.id].sourceLocator}</span>
                    </span>
                  )}
                </div>

                {feedbackState[currentQuestion.id].misconception && (
                  <div className="bg-rose-100/90 border border-rose-300 px-3.5 py-2 rounded-xl text-xs font-semibold text-rose-900 flex items-start gap-2">
                    <span className="text-sm">⚠️</span>
                    <div>
                      <span className="font-extrabold block">Identified Misconception:</span>
                      <span>{feedbackState[currentQuestion.id].misconception}</span>
                    </div>
                  </div>
                )}

                <p className="text-xs font-medium leading-relaxed text-gray-700">
                  {feedbackState[currentQuestion.id].explanation}
                </p>
              </div>
            )}

            {adaptiveError && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-xs text-red-700">
                {adaptiveError}
              </div>
            )}

          </div>


          {/* =================================================
              NAVIGATION
          ================================================= */}

          <div className="flex items-center justify-between gap-4">

            <button
              disabled={
                isAdaptive ||
                currentQuestionIndex === 0 ||
                adaptiveLoading
              }
              onClick={() =>
                setCurrentQuestionIndex(
                  (prev) => prev - 1
                )
              }
              className="px-5 py-2.5 rounded-xl border border-[#d8d7e8] bg-white font-bold text-xs disabled:opacity-40"
            >
              ← Previous
            </button>


            {/* Primary Action Button: Check Answer first, then Continue */}
            {!feedbackState[currentQuestion.id]?.isChecked ? (
              <button
                onClick={handleCheckCurrentAnswer}
                disabled={
                  adaptiveLoading ||
                  (isMcqQuestion
                    ? selectedAnswers[currentQuestion.id] === undefined || selectedAnswers[currentQuestion.id] === null
                    : !(openAnswers[currentQuestion.id] || '').trim())
                }
                className="px-6 py-2.5 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-xs shadow-md disabled:opacity-50 transition-all flex items-center gap-1.5"
              >
                <span>Check Answer</span>
                <span className="material-symbols-outlined text-sm">check_circle</span>
              </button>
            ) : (
              <button
                onClick={
                  isAdaptive
                    ? (isMcqQuestion
                        ? handleAdaptiveNext
                        : handleOpenAnswerSubmit)
                    : handleStaticNext
                }
                disabled={adaptiveLoading}
                className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition-all flex items-center gap-1.5"
              >
                <span>
                  {adaptiveLoading
                    ? 'Processing...'
                    : currentQuestionIndex < questions.length - 1 || isAdaptive
                    ? 'Continue to Next Question →'
                    : 'Submit Quiz'}
                </span>
              </button>
            )}

          </div>

        </div>

      </div>

    </div>
  );
};
