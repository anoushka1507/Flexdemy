import React, { useState } from 'react';
import { Quiz, AdaptiveQuizLaunch } from '../types';
import { supabase } from '../supabaseClient';

const QUESTION_TYPE_OPTIONS: { value: string; label: string }[] = [
  { value: 'mcq', label: 'Multiple Choice' },
  { value: 'short_answer', label: 'Short Answer' },
  { value: 'numerical', label: 'Numerical' },
];

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

    if (!topic) {
      setTopic(file.name.replace(/\.[^/.]+$/, ''));
    }
  }
};
  const handleQuickTopic = (quickTopic: string) => {
    setTopic(quickTopic);
    setContent(`Sample study notes for ${quickTopic}`);
  };

  const handleSubmit = async (e: React.FormEvent) => {
  e.preventDefault();

  if (!selectedFile) {
    console.error('Please select a PDF file.');
    return;
  }

  setLoading(true);

  try {
    const formData = new FormData();

    formData.append('file', selectedFile);
    formData.append('question_types', questionTypes.join(','));

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
      throw new Error(
        `Quiz generation failed: ${response.status} ${errorText}`
      );
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
      },
    };

    onQuizStarted(launch);
    onClose();

  } catch (err) {
    console.error('Quiz generation error:', err);
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

          {/* Difficulty and Question Count */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Difficulty Level
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]"
              >
                <option value="Easy">Easy</option>
                <option value="Medium">Medium</option>
                <option value="Hard">Hard</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-1">
                Question Count
              </label>
              <select
                value={questionCount}
                onChange={(e) => setQuestionCount(Number(e.target.value))}
                className="w-full px-3 py-2 rounded-xl border border-gray-200 text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-[#7372A5]"
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

          {/* Submit Button */}
          <div className="pt-2">
            <button
              type="submit"
              disabled={loading || (!topic && !content)}
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
