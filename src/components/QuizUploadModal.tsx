import React, { useState } from 'react';
import { Quiz, AdaptiveQuizLaunch } from '../types';
import { supabase } from '../supabaseClient';

const QUESTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'numerical', label: 'Numerical' },
];

interface ConceptDraft {
  label: string;
  description: string;
  topic: string;
  subtopic: string;
  prerequisites: string[];
  source_chunk_index: number;
}

interface QuizUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onQuizStarted: (launch: AdaptiveQuizLaunch) => void;
}

export const QuizUploadModal: React.FC<QuizUploadModalProps> = ({
  isOpen,
  onClose,
  onQuizStarted,
}) => {
  const [topic, setTopic] = useState('');
  const [content, setContent] = useState('');
  const [difficulty, setDifficulty] = useState<'Easy' | 'Medium' | 'Hard'>('Medium');
  const [questionCount, setQuestionCount] = useState<number>(10);
  const [loading, setLoading] = useState(false);
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [questionTypes, setQuestionTypes] = useState<string[]>(['mcq']);

  // Student-chosen quiz scope: preview extracted topics for the
  // uploaded file, then let them narrow which ones get quizzed.
  const [extractedConcepts, setExtractedConcepts] = useState<ConceptDraft[] | null>(null);
  const [selectedTopics, setSelectedTopics] = useState<string[]>([]);
  const [extractingTopics, setExtractingTopics] = useState(false);
  const [extractError, setExtractError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isDiagnosticMode, setIsDiagnosticMode] = useState(false);

  const toggleQuestionType = (value: string) => {
    setQuestionTypes((prev) => {
      const next = prev.includes(value)
        ? prev.filter((t) => t !== value)
        : [...prev, value];
      return next.length > 0 ? next : prev;
    });
  };

  if (!isOpen) return null;

  const handleFileUpload = (
  e: React.ChangeEvent<HTMLInputElement>
) => {
  const file = e.target.files?.[0];

  if (file) {
    setSelectedFile(file);
    setSelectedFileName(file.name);

    // A new file invalidates any previous topic preview.
    setExtractedConcepts(null);
    setSelectedTopics([]);
    setExtractError(null);

    if (!topic) {
      setTopic(file.name.replace(/\.[^/.]+$/, ''));
    }
  }
};

  const uniqueTopics = extractedConcepts
    ? Array.from(new Set(extractedConcepts.map((c) => c.topic)))
    : [];

  const toggleTopic = (t: string) => {
    setSelectedTopics((prev) =>
      prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]
    );
  };

  const handlePreviewTopics = async () => {
    if (!selectedFile) return;

    setExtractingTopics(true);
    setExtractError(null);

    try {
      const formData = new FormData();
      formData.append('file', selectedFile);

      const response = await fetch('/api/extract-concepts', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`Topic extraction failed: ${response.status}`);
      }

      const data = await response.json();
      const concepts: ConceptDraft[] = data.concepts || [];

      if (concepts.length === 0) {
        setExtractError('No topics could be extracted from this file.');
        return;
      }

      setExtractedConcepts(concepts);
      setSelectedTopics(Array.from(new Set(concepts.map((c) => c.topic))));
    } catch (err) {
      console.error('Topic extraction error:', err);
      setExtractError('Could not extract topics. You can still start the quiz with everything included.');
    } finally {
      setExtractingTopics(false);
    }
  };
  const handleQuickTopic = (quickTopic: string) => {
    setTopic(quickTopic);
    setContent(`Sample study notes for ${quickTopic}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!selectedFile) {
    setSubmitError('Please select a file to upload.');
    return;
  }

  setLoading(true);
  setSubmitError(null);

  try {
    const formData = new FormData();

    formData.append('file', selectedFile);
    formData.append('question_types', questionTypes.join(','));

    if (extractedConcepts) {
      formData.append('concept_drafts_json', JSON.stringify(extractedConcepts));
      formData.append('selected_topics', selectedTopics.join(','));
    }

    if (isDiagnosticMode) {
      formData.append('is_diagnostic', 'true');
    }

    const difficultyValue = difficulty.toLowerCase();

    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData.session?.access_token;

    const response = await fetch(
      `/api/start-adaptive-quiz?difficulty=${difficultyValue}&question_count=${questionCount}`,
      {
        method: 'POST',
        headers: accessToken
          ? { Authorization: `Bearer ${accessToken}` }
          : undefined,
        body: formData,
      }
    );

    if (!response.ok) {
      const errorText = await response.text();

      if (errorText.includes('RESOURCE_EXHAUSTED')) {
        throw new Error(
          "The AI is handling too many requests right now (free-tier rate limit). Wait about a minute and try again."
        );
      }

      let detail = errorText;
      try {
        detail = JSON.parse(errorText)?.detail || errorText;
      } catch {
        // errorText wasn't JSON, use it as-is
      }

      throw new Error(detail || `Quiz generation failed (${response.status})`);
    }

    const data = await response.json();

    console.log('Started adaptive quiz:', data);

    const launch: AdaptiveQuizLaunch = {
      sessionId: data.session_id,
      title: data.title || topic || 'Adaptive Quiz',
      totalQuestions: data.total_questions,
      firstQuestion: {
        id: data.question_number,
        question: data.question.question_text,
        options: (data.question.options || []).map((opt: any) => opt.text),
        correctAnswerIndex: (data.question.options || []).findIndex((opt: any) => opt.is_correct),
        hint: '',
        explanation: '',
        concept: data.concept_label,
        difficulty: data.difficulty,
        questionType: data.question.question_type || 'mcq',
        topic: data.question.topic,
        sourceLocator: data.question.source_locator,
        backendQuestion: data.question,
      },
    };

    onQuizStarted(launch);
    onClose();

  } catch (err) {
    console.error('Quiz generation error:', err);
    setSubmitError(
      err instanceof Error ? err.message : 'Could not generate the quiz. Please try again.'
    );
  } finally {
    setLoading(false);
  }
};

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-fade-in">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl border border-[#d8d7e8] overflow-hidden flex flex-col max-h-[90vh]">
        
        {/* Modal Header */}
        <div className="p-5 bg-[#7372A5] text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div>
              <h3 className="font-bold text-lg font-display">Generate AI Adaptive Quiz</h3>
              <p className="text-xs text-gray-200">Upload notes, paste text, or enter a topic</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
          >
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 overflow-y-auto space-y-5 text-left">
          
          {/* Quick Select Preset Topics */}
          <div>
            <label className="block text-xs font-bold text-gray-500 uppercase tracking-wider mb-2">
              Quick Pick Topic Preset
            </label>
            <div className="flex flex-wrap gap-2">
              {['Python Basics', 'DBMS Fundamentals', 'Networking Basics', 'Machine Learning', 'World History'].map((preset) => (
                <button
                  key={preset}
                  type="button"
                  onClick={() => handleQuickTopic(preset)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                    topic === preset
                      ? 'bg-[#7372A5] text-white font-bold shadow-sm'
                      : 'bg-[#ececf4] text-[#7372A5] hover:bg-[#d8d7e8] border border-[#d8d7e8]'
                  }`}
                >
                   {preset}
                </button>
              ))}
            </div>
          </div>

          {/* Topic Title Input */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Quiz Title or Topic Name
            </label>
            <input
              type="text"
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. Data Structures, Cell Biology, Operating Systems..."
              required
              className="w-full px-4 py-2.5 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#7372A5]/50 focus:border-[#7372A5] text-sm"
            />
          </div>

          {/* File Drag & Drop or Text Area */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Upload Material or Paste Study Notes
            </label>
            
            <div className="border-2 border-dashed border-[#d8d7e8] rounded-2xl p-4 text-center bg-[#f6f6fa] hover:bg-[#ececf4]/50 transition-colors relative mb-3">
              <input
                type="file"
                accept=".pdf,.txt,.md,.pptx,.mp4,.mov,.webm,.mkv"
                onChange={handleFileUpload}
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
              />
              <span className="material-symbols-outlined text-3xl text-[#7372A5] mb-1">cloud_upload</span>
              <p className="text-xs font-bold text-[#222138]">
                {selectedFileName ? `Selected: ${selectedFileName}` : 'Click to upload a PDF, slide deck, lecture video, or text file'}
              </p>
              <p className="text-[11px] text-gray-400 mt-0.5">Drag & drop your study notes here</p>
            </div>

            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Or paste your raw study text, lecture notes, or key definitions here..."
              rows={4}
              className="w-full p-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#7372A5]/50 text-xs font-mono"
            />
          </div>

          {/* Student-Chosen Quiz Scope */}
          {selectedFile && (
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                  Quiz Scope
                </label>
                <button
                  type="button"
                  onClick={handlePreviewTopics}
                  disabled={extractingTopics}
                  className="text-xs font-semibold text-[#7372A5] hover:underline disabled:opacity-50"
                >
                  {extractingTopics
                    ? 'Scanning material...'
                    : extractedConcepts
                      ? 'Rescan topics'
                      : 'Preview topics in this file'}
                </button>
              </div>

              {extractError && (
                <p className="text-[11px] text-red-500 mb-1">{extractError}</p>
              )}

              {extractedConcepts && (
                <div className="border border-[#d8d7e8] rounded-xl p-3 bg-[#f6f6fa]">
                  <p className="text-[11px] text-gray-500 mb-2">
                    Pick which topics the quiz should draw from. Unchecked topics are skipped.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {uniqueTopics.map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => toggleTopic(t)}
                        className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                          selectedTopics.includes(t)
                            ? 'bg-[#7372A5] text-white font-bold shadow-sm'
                            : 'bg-white text-[#7372A5] border border-[#d8d7e8]'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                  {selectedTopics.length === 0 && (
                    <p className="text-[11px] text-red-500 mt-2">
                      Select at least one topic, or the full material will be used instead.
                    </p>
                  )}

                  <div className="mt-3 pt-3 border-t border-[#d8d7e8] space-y-2 max-h-40 overflow-y-auto">
                    {uniqueTopics.map((t) => {
                      const conceptsInTopic = extractedConcepts.filter(
                        (c) => c.topic === t
                      );

                      const subtopics = Array.from(
                        new Set(
                          conceptsInTopic
                            .map((c) => c.subtopic)
                            .filter((s) => s)
                        )
                      );

                      return (
                        <div key={t} className="text-[11px]">
                          <p className="font-bold text-[#222138]">{t}</p>
                          {subtopics.length > 0 && (
                            <p className="text-gray-500 ml-2">
                              Subtopics: {subtopics.join(', ')}
                            </p>
                          )}
                          {conceptsInTopic.map((c) => (
                            <p key={c.label} className="text-gray-500 ml-2">
                              • {c.label}
                              {c.prerequisites.length > 0 && (
                                <span className="text-[#7372A5]">
                                  {' '}(requires: {c.prerequisites.join(', ')})
                                </span>
                              )}
                            </p>
                          ))}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Diagnostic Placement Mode Toggle (Requirement 4.b) */}
          <div className="p-3.5 rounded-2xl border border-purple-200 bg-purple-50/70 space-y-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-sm text-[#7372A5]">assignment_turned_in</span>
                <span className="text-xs font-bold text-[#222138]">Diagnostic Placement Mode (Cold-Start)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={isDiagnosticMode}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setIsDiagnosticMode(checked);
                    if (checked) {
                      setDifficulty('Medium');
                      setQuestionCount(5);
                    }
                  }}
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#7372A5]"></div>
              </label>
            </div>
            <p className="text-[11px] text-gray-600 leading-normal">
              {isDiagnosticMode
                ? 'Active: Selects 1 representative Medium question per major topic to cleanly calibrate your Bayesian Knowledge Tracing (BKT) baseline mastery vector P(L_0) with 0 LLM grading tokens.'
                : 'Enable for new students or intake calibration before regular adaptive quizzing.'}
            </p>
          </div>

          {/* Difficulty and Question Count */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Difficulty Level {isDiagnosticMode && <span className="text-[10px] text-[#7372A5] font-normal">(Locked to Medium for diagnostic)</span>}
              </label>
              <select
                value={difficulty}
                disabled={isDiagnosticMode}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5] disabled:bg-gray-100 disabled:opacity-70"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Question Count {isDiagnosticMode && <span className="text-[10px] text-[#7372A5] font-normal">(1 per major topic)</span>}
              </label>
              <select
                value={questionCount}
                disabled={isDiagnosticMode}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5] disabled:bg-gray-100 disabled:opacity-70"
              >
                <option value={5}>5 Questions</option>
                <option value={10}>10 Questions</option>
              </select>
            </div>
          </div>

          {/* Question Types */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
              Question Types
            </label>
            <div className="flex flex-wrap gap-2">
              {QUESTION_TYPE_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => toggleQuestionType(opt.value)}
                  className={`text-xs px-3 py-1.5 rounded-xl font-medium transition-all ${
                    questionTypes.includes(opt.value)
                      ? 'bg-[#7372A5] text-white font-bold shadow-sm'
                      : 'bg-[#ececf4] text-[#7372A5] hover:bg-[#d8d7e8] border border-[#d8d7e8]'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {submitError && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {submitError}
            </div>
          )}

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={
                loading ||
                (!topic && !content) ||
                (extractedConcepts !== null && selectedTopics.length === 0)
              }
              className="w-full py-3 px-4 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white font-bold text-sm shadow-md transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined text-lg animate-spin">sync</span>
                  <span>AI is Analyzing & Building Quiz...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-lg">play_arrow</span>
                  <span>Generate & Start Quiz Now</span>
                </>
              )}
            </button>
          </div>

        </form>

      </div>
    </div>
  );
};
