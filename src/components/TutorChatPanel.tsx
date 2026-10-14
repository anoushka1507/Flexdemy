import React, { useEffect, useRef, useState } from 'react';
import { GroundedChatMessage, Citation } from '../types';
import { apiFetch } from '../utils/api';

export type ChatLanguage = 'english' | 'hindi';
export type AnswerStyle = 'concise' | 'step-by-step' | 'example-first';

interface TutorChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
  materialTitle?: string;
  currentTopic?: string;
}

export const SUPPORTED_LANGUAGES: {
  id: ChatLanguage;
  label: string;
  nativeLabel: string;
  speechLocale: string;
}[] = [
  {
    id: 'english',
    label: 'English',
    nativeLabel: 'English',
    speechLocale: 'en-US',
  },
  {
    id: 'hindi',
    label: 'Hindi / Hinglish',
    nativeLabel: 'हिन्दी / Hinglish',
    speechLocale: 'hi-IN',
  },
];

export const ANSWER_STYLES: {
  id: AnswerStyle;
  label: string;
  description: string;
}[] = [
  { id: 'concise', label: 'Concise', description: 'Brief, direct answer' },
  { id: 'step-by-step', label: 'Step-by-step', description: 'Clear sequential steps' },
  { id: 'example-first', label: 'Example-first', description: 'Concrete scenario first' },
];

const SpeechRecognitionCtor: any =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition)) ||
  null;

const speechSynthesisSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

function getSourceJumpUrl(sessionId: string, citation: Citation): string | null {
  const base = `/api/materials/${sessionId}/file`;

  if (citation.sourceType === 'pdf') {
    const match = citation.locator.match(/Page (\d+)/i);
    if (match) return `${base}#page=${match[1]}`;
  }

  if (citation.sourceType === 'video') {
    const match = citation.locator.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const seconds = Number(match[1]) * 60 + Number(match[2]);
      return `${base}#t=${seconds}`;
    }
  }

  return null;
}

export const TutorChatPanel: React.FC<TutorChatPanelProps> = ({
  isOpen,
  onClose,
  sessionId,
  materialTitle,
  currentTopic,
}) => {
  // Session-bound messages (preserved across drawer close/reopen)
  const [messages, setMessages] = useState<GroundedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastFailedQuestion, setLastFailedQuestion] = useState<string | null>(null);

  // User preferences persisted in localStorage
  const [language, setLanguage] = useState<ChatLanguage>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('flexdemy_tutor_lang');
      if (saved === 'hindi' || saved === 'english') return saved;
    }
    return 'english';
  });

  const [style, setStyle] = useState<AnswerStyle>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('flexdemy_tutor_style');
      if (saved === 'concise' || saved === 'step-by-step' || saved === 'example-first') {
        return saved;
      }
    }
    return 'concise';
  });

  // Voice Speech-to-Text State
  const [isListening, setIsListening] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  // Audio File Upload & Transcription State
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [audioFileName, setAudioFileName] = useState<string | null>(null);
  const audioInputRef = useRef<HTMLInputElement | null>(null);

  // Text-to-Speech State
  const [speakingMessageIndex, setSpeakingMessageIndex] = useState<number | null>(null);

  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const currentSessionRef = useRef<string | undefined>(sessionId);

  // Persist language preference
  const handleLanguageChange = (newLang: ChatLanguage) => {
    setLanguage(newLang);
    if (typeof window !== 'undefined') {
      localStorage.setItem('flexdemy_tutor_lang', newLang);
    }
  };

  // Persist style preference
  const handleStyleChange = (newStyle: AnswerStyle) => {
    setStyle(newStyle);
    if (typeof window !== 'undefined') {
      localStorage.setItem('flexdemy_tutor_style', newStyle);
    }
  };

  // Reset conversation if a brand new sessionId is loaded
  useEffect(() => {
    if (currentSessionRef.current !== sessionId) {
      currentSessionRef.current = sessionId;
      setMessages([]);
      setError(null);
      setLastFailedQuestion(null);
    }
  }, [sessionId]);

  // Stop voice and speech playback when drawer closes or unmounts
  useEffect(() => {
    if (!isOpen) {
      if (recognitionRef.current && isListening) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
        setIsListening(false);
      }
      if (speechSynthesisSupported) {
        window.speechSynthesis.cancel();
        setSpeakingMessageIndex(null);
      }
    }
  }, [isOpen, isListening]);

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {
          // ignore
        }
      }
      if (speechSynthesisSupported) {
        window.speechSynthesis.cancel();
      }
    };
  }, []);

  // Auto-scroll conversation to bottom
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [messages, loading, isOpen]);

  // Read aloud helper
  const handleToggleSpeech = (text: string, index: number) => {
    if (!speechSynthesisSupported) return;

    if (speakingMessageIndex === index) {
      window.speechSynthesis.cancel();
      setSpeakingMessageIndex(null);
      return;
    }

    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    const activeLangConfig = SUPPORTED_LANGUAGES.find((l) => l.id === language);
    utterance.lang = activeLangConfig?.speechLocale || 'en-US';

    utterance.onend = () => setSpeakingMessageIndex(null);
    utterance.onerror = () => setSpeakingMessageIndex(null);

    setSpeakingMessageIndex(index);
    window.speechSynthesis.speak(utterance);
  };

  // Browser speech recognition
  const handleToggleListening = () => {
    setVoiceError(null);
    if (!SpeechRecognitionCtor) {
      setVoiceError('Speech recognition is not supported in this browser.');
      return;
    }

    if (isListening) {
      try {
        recognitionRef.current?.stop();
      } catch {
        // ignore
      }
      setIsListening(false);
      return;
    }

    try {
      const recognition = new SpeechRecognitionCtor();
      const activeLangConfig = SUPPORTED_LANGUAGES.find((l) => l.id === language);
      recognition.lang = activeLangConfig?.speechLocale || 'en-US';
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onresult = (event: any) => {
        const transcript = event.results?.[0]?.[0]?.transcript;
        if (transcript) {
          setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
        }
      };

      recognition.onerror = (event: any) => {
        setIsListening(false);
        if (event.error === 'not-allowed') {
          setVoiceError('Microphone access was denied. Please allow microphone permission in your browser.');
        } else if (event.error !== 'no-speech') {
          setVoiceError(`Voice error: ${event.error || 'could not capture speech'}`);
        }
      };

      recognition.onend = () => setIsListening(false);

      recognitionRef.current = recognition;
      setIsListening(true);
      recognition.start();
    } catch (err: any) {
      setIsListening(false);
      setVoiceError(err?.message || 'Failed to start speech recognition.');
    }
  };

  // Audio file attachment & transcription
  const handleAudioFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setVoiceError(null);
    const file = e.target.files?.[0];
    if (!file) return;

    // Reset input value so same file can be re-selected if desired
    e.target.value = '';

    const validExtensions = ['.mp3', '.wav', '.m4a', '.ogg', '.webm', '.aac'];
    const fileName = file.name.toLowerCase();
    const isValidExt = validExtensions.some((ext) => fileName.endsWith(ext));
    const isValidMime = file.type.startsWith('audio/') || file.type === 'video/webm';

    if (!isValidExt && !isValidMime) {
      setVoiceError('Unsupported audio format. Please upload MP3, WAV, M4A, OGG, or WebM audio.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setVoiceError('Audio file exceeds the 5MB size limit.');
      return;
    }

    setAudioFileName(file.name);
    setIsTranscribing(true);

    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('language', language);

      const response = await apiFetch('/api/transcribe-audio', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Audio transcription failed on server.');
      }

      const data = await response.json();
      if (data.transcript) {
        setInput((prev) => (prev ? `${prev} ${data.transcript}` : data.transcript));
      } else {
        setVoiceError('No speech detected in audio recording.');
      }
    } catch (err: any) {
      setVoiceError(err?.message || 'Failed to transcribe audio.');
    } finally {
      setIsTranscribing(false);
      setAudioFileName(null);
    }
  };

  // Send question to grounded-chat
  const sendQuestion = async (questionText: string) => {
    const question = questionText.trim();
    if (!question || loading) return;

    if (!sessionId) {
      setError('No active quiz session found. Please start a quiz first.');
      return;
    }

    const nextMessages: GroundedChatMessage[] = [
      ...messages,
      { role: 'user', text: question },
    ];

    setMessages(nextMessages);
    setInput('');
    setError(null);
    setLastFailedQuestion(null);
    setLoading(true);

    try {
      const response = await apiFetch('/api/grounded-chat', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          message: question,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          language,
          style,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        let message = 'Could not reach the tutor.';
        try {
          const parsed = JSON.parse(text);
          message = parsed?.detail || message;
        } catch {
          if (text) message = text;
        }

        if (response.status === 429) {
          message = 'The AI tutor is currently experiencing high demand. Please click Retry in a few seconds.';
        } else if (response.status === 404) {
          message = 'No study material found for this session. It may have expired or been started without persistent storage.';
        } else if (response.status === 503) {
          message = 'AI tutor generation is temporarily unavailable because GEMINI_API_KEY is not configured on the server.';
        }

        setLastFailedQuestion(question);
        throw new Error(message);
      }

      const data = await response.json();

      setMessages((prev) => [
        ...prev,
        {
          role: 'model',
          text: data.answer,
          isGrounded: data.is_grounded,
          citations: (data.citations || []).map((c: any) => ({
            chunkIndex: c.chunk_index,
            locator: c.locator,
            excerpt: c.excerpt,
            sourceType: c.source_type || 'text',
          })),
        },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reach the tutor.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    sendQuestion(input);
  };

  const handleRetry = () => {
    if (lastFailedQuestion) {
      // Remove dangling last user message that failed
      setMessages((prev) => {
        if (prev.length > 0 && prev[prev.length - 1].role === 'user') {
          return prev.slice(0, -1);
        }
        return prev;
      });
      sendQuestion(lastFailedQuestion);
    }
  };

  // Contextual starter prompts (strictly deterministic, 0 Gemini calls)
  const starterPrompts = [
    currentTopic ? `Explain ${currentTopic} simply` : 'Explain this concept simply',
    currentTopic ? `Give a concrete example of ${currentTopic}` : 'Give a concrete example',
    currentTopic ? `Key takeaways of ${currentTopic}` : 'What are the key takeaways?',
    currentTopic ? `Quiz me on ${currentTopic}` : 'Test my understanding of this topic',
  ];

  // Follow-up suggestions after an answer
  const latestMessage = messages[messages.length - 1];
  const showFollowUps =
    !loading &&
    latestMessage &&
    latestMessage.role === 'model' &&
    latestMessage.isGrounded !== false;

  const followUpPrompts = [
    'Give me a concrete example',
    'Explain this step-by-step',
    latestMessage?.citations?.[0]?.locator
      ? `Explain passage from [${latestMessage.citations[0].locator}]`
      : 'Explain the cited passage in more detail',
  ];

  return (
    <>
      {/* Mobile Backdrop (Light tap-to-dismiss overlay on small screens only) */}
      {isOpen && (
        <div
          className="sm:hidden fixed inset-0 bg-black/20 z-30 transition-opacity"
          onClick={onClose}
          aria-hidden="true"
        />
      )}

      {/* Right-Side Drawer Container */}
      <aside
        aria-label="Ask Your Tutor Drawer"
        aria-hidden={!isOpen}
        className={`fixed top-0 right-0 h-full w-full sm:w-[440px] max-w-full z-40 bg-white shadow-2xl border-l border-[#d8d7e8] flex flex-col transition-transform duration-200 ease-in-out motion-reduce:transition-none ${
          isOpen ? 'translate-x-0' : 'translate-x-full pointer-events-none'
        }`}
      >
        {/* Compact Purple Header */}
        <header className="p-3.5 sm:p-4 bg-[#7372A5] text-white flex items-center justify-between shrink-0 shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-white/15 flex items-center justify-center text-white shrink-0">
              <span className="material-symbols-outlined text-lg" aria-hidden="true">
                school
              </span>
            </div>
            <div className="leading-tight">
              <h3 className="font-bold text-sm tracking-tight flex items-center gap-1.5">
                <span>Ask Your Tutor</span>
                <span className="bg-white/20 text-[10px] font-semibold px-1.5 py-0.2 rounded-full uppercase tracking-wider">
                  Grounded
                </span>
              </h3>
              <p className="text-[11px] text-gray-200 truncate max-w-[200px] sm:max-w-[240px]">
                {materialTitle || 'Answers strictly from your notes'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {/* Language Selector */}
            <div className="relative">
              <select
                aria-label="Select tutor response language"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as ChatLanguage)}
                className="bg-white/15 hover:bg-white/25 text-white text-xs font-semibold rounded-lg px-2 py-1 pr-6 cursor-pointer outline-none focus:ring-2 focus:ring-white/40 appearance-none transition-colors"
              >
                {SUPPORTED_LANGUAGES.map((l) => (
                  <option key={l.id} value={l.id} className="text-[#222138] bg-white">
                    {l.nativeLabel}
                  </option>
                ))}
              </select>
              <span className="material-symbols-outlined text-xs absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none text-white/80">
                arrow_drop_down
              </span>
            </div>

            {/* Global TTS Stop if currently speaking */}
            {speechSynthesisSupported && speakingMessageIndex !== null && (
              <button
                type="button"
                onClick={() => {
                  window.speechSynthesis.cancel();
                  setSpeakingMessageIndex(null);
                }}
                title="Stop reading aloud"
                className="w-7 h-7 rounded-lg bg-rose-500/80 hover:bg-rose-500 text-white flex items-center justify-center transition-colors"
                aria-label="Stop reading aloud"
              >
                <span className="material-symbols-outlined text-base">stop_circle</span>
              </button>
            )}

            {/* Close Button */}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close tutor drawer"
              className="w-7 h-7 rounded-lg bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
            >
              <span className="material-symbols-outlined text-base">close</span>
            </button>
          </div>
        </header>

        {/* Answer Style Subheader Bar */}
        <div className="bg-[#f6f6fa] border-b border-[#d8d7e8] px-3.5 py-1.5 flex items-center justify-between text-xs text-gray-600 shrink-0">
          <span className="text-[11px] font-bold text-gray-500 uppercase tracking-wider flex items-center gap-1">
            <span className="material-symbols-outlined text-sm text-[#7372A5]">tune</span>
            <span>Style:</span>
          </span>
          <div className="flex items-center gap-1">
            {ANSWER_STYLES.map((s) => (
              <button
                key={s.id}
                type="button"
                onClick={() => handleStyleChange(s.id)}
                title={s.description}
                className={`px-2 py-0.5 rounded-md text-[11px] font-bold transition-all ${
                  style === s.id
                    ? 'bg-[#7372A5] text-white shadow-2xs'
                    : 'text-gray-600 hover:bg-[#ececf4]'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>
        </div>

        {/* Scrollable Conversation View */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 text-left">
          {/* Context-aware Greeting & Starter Prompts */}
          {messages.length === 0 && (
            <div className="space-y-4 py-2">
              <div className="bg-[#f6f6fa] rounded-2xl p-4 border border-[#d8d7e8] space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xl">👋</span>
                  <h4 className="font-bold text-xs text-[#222138]">
                    {materialTitle ? `Studying: ${materialTitle}` : 'AI Study Tutor'}
                  </h4>
                </div>
                <p className="text-xs text-gray-600 leading-relaxed">
                  I answer questions strictly using your uploaded notes and cite the exact source
                  pages.
                  {currentTopic && (
                    <span className="block mt-1 text-[#7372A5] font-semibold">
                      Current topic: {currentTopic}
                    </span>
                  )}
                </p>
              </div>

              <div className="space-y-1.5">
                <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider px-1">
                  Suggested Questions
                </p>
                <div className="space-y-1.5">
                  {starterPrompts.map((prompt, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => sendQuestion(prompt)}
                      disabled={loading || !sessionId}
                      className="w-full text-left p-2.5 rounded-xl bg-white hover:bg-[#f6f6fa] border border-[#d8d7e8] hover:border-[#7372A5] text-xs font-semibold text-gray-700 hover:text-[#7372A5] transition-all flex items-center justify-between group shadow-2xs disabled:opacity-50"
                    >
                      <span className="truncate pr-2">{prompt}</span>
                      <span className="material-symbols-outlined text-sm text-gray-400 group-hover:text-[#7372A5] transition-colors shrink-0">
                        arrow_forward
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* Messages */}
          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex flex-col ${
                message.role === 'user' ? 'items-end' : 'items-start'
              }`}
            >
              <div
                className={`max-w-[88%] rounded-2xl px-3.5 py-2.5 text-xs shadow-2xs ${
                  message.role === 'user'
                    ? 'bg-[#7372A5] text-white rounded-tr-xs'
                    : message.isGrounded === false
                    ? 'bg-amber-50 text-amber-900 border border-amber-200 rounded-tl-xs'
                    : 'bg-[#ececf4] text-[#222138] rounded-tl-xs'
                }`}
              >
                <div className="flex items-start gap-2">
                  <p className="whitespace-pre-wrap flex-1 leading-relaxed">{message.text}</p>
                  {message.role === 'model' && speechSynthesisSupported && (
                    <button
                      type="button"
                      onClick={() => handleToggleSpeech(message.text, idx)}
                      title={
                        speakingMessageIndex === idx
                          ? 'Stop reading aloud'
                          : 'Read this answer aloud'
                      }
                      aria-label="Read answer aloud"
                      className={`shrink-0 p-1 rounded-md transition-colors ${
                        speakingMessageIndex === idx
                          ? 'text-rose-600 bg-white'
                          : 'text-gray-400 hover:text-[#7372A5]'
                      }`}
                    >
                      <span className="material-symbols-outlined text-sm">
                        {speakingMessageIndex === idx ? 'volume_off' : 'volume_up'}
                      </span>
                    </button>
                  )}
                </div>

                {/* Grounded Citations Pills */}
                {message.citations && message.citations.length > 0 && (
                  <div className="mt-2.5 pt-2 border-t border-[#d8d7e8]/60 flex flex-wrap items-center gap-1.5">
                    <span className="text-[10px] font-bold text-gray-500 uppercase tracking-wider">
                      Sources:
                    </span>
                    {message.citations.map((c, cIdx) => {
                      const jumpUrl = sessionId ? getSourceJumpUrl(sessionId, c) : null;
                      const pillClass =
                        'inline-flex items-center gap-1 text-[10px] font-semibold text-[#7372A5] bg-white px-2 py-0.5 rounded-full border border-[#d8d7e8] transition-colors';

                      if (jumpUrl) {
                        return (
                          <a
                            key={cIdx}
                            href={jumpUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={`${pillClass} hover:bg-[#ececf4] hover:border-[#7372A5] underline decoration-dotted`}
                            title={`${c.excerpt}\n\nClick to view source in notes`}
                          >
                            <span className="material-symbols-outlined text-[10px]">
                              open_in_new
                            </span>
                            <span>{c.locator}</span>
                          </a>
                        );
                      }

                      return (
                        <span key={cIdx} className={pillClass} title={c.excerpt}>
                          <span className="material-symbols-outlined text-[10px]">
                            description
                          </span>
                          <span>{c.locator}</span>
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Follow-up suggestions after the latest model answer */}
              {idx === messages.length - 1 && showFollowUps && (
                <div className="mt-2.5 space-y-1 w-full max-w-[88%]">
                  <p className="text-[10px] font-bold text-gray-400 uppercase tracking-wider px-1">
                    Follow-up
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {followUpPrompts.map((fu, fuIdx) => (
                      <button
                        key={fuIdx}
                        type="button"
                        onClick={() => sendQuestion(fu)}
                        disabled={loading}
                        className="text-[11px] font-semibold text-gray-600 bg-white hover:bg-[#ececf4] hover:text-[#7372A5] border border-[#d8d7e8] px-2.5 py-1 rounded-full transition-colors text-left"
                      >
                        + {fu}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}

          {/* Thinking / Transcribing Spinner */}
          {(loading || isTranscribing) && (
            <div className="flex items-center gap-2 text-xs text-gray-500 bg-[#f6f6fa] p-3 rounded-xl border border-[#d8d7e8] animate-pulse">
              <span className="material-symbols-outlined text-base animate-spin text-[#7372A5]">
                progress_activity
              </span>
              <span>
                {isTranscribing
                  ? `Transcribing audio ${audioFileName ? `(${audioFileName})` : ''}...`
                  : 'Tutor is consulting your material...'}
              </span>
            </div>
          )}

          {/* Error Banner with Retry Action */}
          {error && (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800 space-y-2">
              <div className="flex items-start gap-1.5">
                <span className="material-symbols-outlined text-base text-rose-600 shrink-0">
                  error
                </span>
                <p className="flex-1 font-medium">{error}</p>
              </div>

              {lastFailedQuestion && (
                <div className="flex items-center gap-2 pt-1 border-t border-rose-200">
                  <button
                    type="button"
                    onClick={handleRetry}
                    className="px-3 py-1 bg-rose-600 hover:bg-rose-700 text-white rounded-lg font-bold text-xs shadow-2xs transition-colors flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">replay</span>
                    <span>Retry Question</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setInput(lastFailedQuestion);
                      setError(null);
                    }}
                    className="text-xs font-semibold text-rose-700 hover:underline"
                  >
                    Edit in composer
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Voice status error banner */}
          {voiceError && (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center justify-between">
              <span className="truncate pr-2">{voiceError}</span>
              <button
                type="button"
                onClick={() => setVoiceError(null)}
                className="text-amber-700 font-bold hover:underline shrink-0 text-xs"
              >
                Dismiss
              </button>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Composer Anchored at Bottom */}
        <div className="p-3 bg-white border-t border-[#d8d7e8] shrink-0 space-y-2">
          {/* Active Listening Indicator */}
          {isListening && (
            <div className="flex items-center justify-between bg-rose-50 text-rose-700 px-3 py-1 rounded-lg text-xs font-medium animate-pulse border border-rose-200">
              <span className="flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                Listening ({language === 'hindi' ? 'Hindi/Hinglish' : 'English'})...
              </span>
              <button
                type="button"
                onClick={handleToggleListening}
                className="font-bold text-[11px] underline"
              >
                Done
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex items-center gap-1.5">
            {/* Hidden Audio File Input */}
            <input
              ref={audioInputRef}
              type="file"
              accept=".mp3,.wav,.m4a,.ogg,.webm,audio/*"
              onChange={handleAudioFileSelect}
              className="hidden"
              aria-label="Upload audio file for transcription"
            />

            {/* Audio File Upload Button */}
            <button
              type="button"
              onClick={() => audioInputRef.current?.click()}
              disabled={loading || isTranscribing || !sessionId}
              title="Attach audio recording to transcribe"
              aria-label="Attach audio recording"
              className="w-9 h-9 shrink-0 rounded-xl bg-[#ececf4] text-[#7372A5] hover:bg-[#d8d7e8] flex items-center justify-center transition-colors disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-lg">attach_file</span>
            </button>

            {/* Browser Speech-to-Text Button */}
            <button
              type="button"
              onClick={handleToggleListening}
              disabled={loading || !sessionId || !SpeechRecognitionCtor}
              title={
                !SpeechRecognitionCtor
                  ? 'Speech recognition not supported in this browser'
                  : isListening
                  ? 'Stop listening'
                  : 'Speak your question'
              }
              aria-label={isListening ? 'Stop listening' : 'Speak your question'}
              className={`w-9 h-9 shrink-0 rounded-xl flex items-center justify-center transition-colors disabled:opacity-40 ${
                isListening
                  ? 'bg-rose-500 text-white animate-pulse'
                  : 'bg-[#ececf4] text-[#7372A5] hover:bg-[#d8d7e8]'
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {isListening ? 'mic' : 'mic_none'}
              </span>
            </button>

            {/* Text Input */}
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={
                isListening
                  ? 'Listening to your speech...'
                  : isTranscribing
                  ? 'Transcribing audio file...'
                  : 'Ask about your notes...'
              }
              disabled={loading || isTranscribing || !sessionId}
              className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-gray-200 focus:outline-hidden focus:ring-2 focus:ring-[#7372A5]/50 text-xs bg-white text-[#222138] placeholder-gray-400"
            />

            {/* Send Button */}
            <button
              type="submit"
              disabled={loading || !input.trim() || !sessionId || isTranscribing}
              aria-label="Send question to tutor"
              className="w-9 h-9 shrink-0 rounded-xl bg-[#7372A5] hover:bg-[#585785] text-white flex items-center justify-center transition-colors shadow-2xs disabled:opacity-40"
            >
              <span className="material-symbols-outlined text-lg">send</span>
            </button>
          </form>
        </div>
      </aside>
    </>
  );
};
