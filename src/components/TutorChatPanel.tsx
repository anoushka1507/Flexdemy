import React, { useEffect, useRef, useState } from 'react';
import { GroundedChatMessage, Citation } from '../types';
import { apiFetch } from '../utils/api';

interface TutorChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
}

type ChatLanguage = 'english' | 'hindi';

// Browser-native voice support (Track D optional 6e). No backend
// involved — speech-to-text fills the input box, text-to-speech
// reads an answer aloud. Falls back to disabled buttons on browsers
// without support instead of erroring.
const SpeechRecognitionCtor: any =
  (typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition ||
      (window as any).webkitSpeechRecognition)) ||
  null;

const speechSynthesisSupported =
  typeof window !== 'undefined' && 'speechSynthesis' in window;

function speakText(text: string, language: ChatLanguage) {
  if (!speechSynthesisSupported) return;

  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = language === 'hindi' ? 'hi-IN' : 'en-IN';
  window.speechSynthesis.speak(utterance);
}

// Source files don't have a native "jump to location" viewer for
// every type (no in-browser slide renderer), so this only returns a
// URL for the types where a real browser-native jump is possible:
// a PDF page (#page=N) or a video timestamp (#t=seconds). Slides and
// plain text fall back to the locator staying as display-only text.
function getSourceJumpUrl(sessionId: string, citation: Citation): string | null {
  const base = `/api/materials/${sessionId}/file`;

  if (citation.sourceType === 'pdf') {
    const match = citation.locator.match(/Page (\d+)/);
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
}) => {
  const [messages, setMessages] = useState<GroundedChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [language, setLanguage] = useState<ChatLanguage>('english');
  const [isListening, setIsListening] = useState(false);
  const recognitionRef = useRef<any>(null);

  // This component stays mounted even while closed (isOpen just
  // makes it render null below), so speech wasn't stopping when the
  // panel was closed — only an actual unmount would have triggered
  // that. Watching isOpen directly instead.
  useEffect(() => {
    if (!isOpen && speechSynthesisSupported) {
      window.speechSynthesis.cancel();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleToggleListening = () => {
    if (!SpeechRecognitionCtor) return;

    if (isListening) {
      recognitionRef.current?.stop();
      return;
    }

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = language === 'hindi' ? 'hi-IN' : 'en-IN';
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;

    recognition.onresult = (event: any) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) setInput(transcript);
    };

    recognition.onend = () => setIsListening(false);
    recognition.onerror = () => setIsListening(false);

    recognitionRef.current = recognition;
    setIsListening(true);
    recognition.start();
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();

    const question = input.trim();
    if (!question || !sessionId || loading) return;

    const nextMessages: GroundedChatMessage[] = [
      ...messages,
      { role: 'user', text: question },
    ];

    setMessages(nextMessages);
    setInput('');
    setError('');
    setLoading(true);

    try {
      const response = await apiFetch('/api/grounded-chat', {
        method: 'POST',
        body: JSON.stringify({
          session_id: sessionId,
          message: question,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
          language,
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
      setError(
        err instanceof Error ? err.message : 'Could not reach the tutor.'
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg border border-[#d8d7e8] overflow-hidden flex flex-col max-h-[80vh]">
        <div className="p-4 bg-[#7372A5] text-white flex items-center justify-between shrink-0">
          <div>
            <h3 className="font-bold text-sm">Ask Your Tutor</h3>
            <p className="text-[11px] text-gray-200">
              Answers are grounded in your uploaded material
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() =>
                setLanguage((prev) =>
                  prev === 'english' ? 'hindi' : 'english'
                )
              }
              title="Switch answer language"
              className="px-2.5 py-1 rounded-full bg-white/10 hover:bg-white/20 text-[11px] font-bold text-white"
            >
              {language === 'hindi' ? 'हिं' : 'EN'}
            </button>
            {speechSynthesisSupported && (
              <button
                type="button"
                onClick={() => window.speechSynthesis.cancel()}
                title="Stop reading aloud"
                className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
              >
                <span className="material-symbols-outlined text-base">
                  stop_circle
                </span>
              </button>
            )}
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-left">
          {messages.length === 0 && (
            <p className="text-xs text-gray-400">
              Ask a question about the material you uploaded for this quiz.
            </p>
          )}

          {messages.map((message, idx) => (
            <div
              key={idx}
              className={`flex ${
                message.role === 'user' ? 'justify-end' : 'justify-start'
              }`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-xs ${
                  message.role === 'user'
                    ? 'bg-[#7372A5] text-white'
                    : message.isGrounded === false
                    ? 'bg-amber-50 text-amber-800 border border-amber-200'
                    : 'bg-[#ececf4] text-[#222138]'
                }`}
              >
                <div className="flex items-start gap-1.5">
                  <p className="whitespace-pre-wrap flex-1">{message.text}</p>
                  {message.role === 'model' && speechSynthesisSupported && (
                    <button
                      type="button"
                      onClick={() => speakText(message.text, language)}
                      title="Read this answer aloud"
                      className="shrink-0 text-gray-400 hover:text-[#7372A5]"
                    >
                      <span className="material-symbols-outlined text-sm">
                        volume_up
                      </span>
                    </button>
                  )}
                </div>

                {message.citations && message.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {message.citations.map((c, cIdx) => {
                      const jumpUrl = sessionId
                        ? getSourceJumpUrl(sessionId, c)
                        : null;

                      const className =
                        'text-[10px] font-semibold text-[#7372A5] bg-white px-2 py-0.5 rounded-full border border-[#d8d7e8]' +
                        (jumpUrl ? ' hover:bg-[#ececf4] cursor-pointer underline decoration-dotted' : '');

                      if (jumpUrl) {
                        return (
                          <a
                            key={cIdx}
                            href={jumpUrl}
                            target="_blank"
                            rel="noreferrer"
                            className={className}
                            title={`${c.excerpt}\n\nClick to open source`}
                          >
                            {c.locator}
                          </a>
                        );
                      }

                      return (
                        <span
                          key={cIdx}
                          className={className}
                          title={c.excerpt}
                        >
                          {c.locator}
                        </span>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          ))}

          {loading && (
            <p className="text-xs text-gray-400">Thinking...</p>
          )}

          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </div>
          )}
        </div>

        <form
          onSubmit={handleSend}
          className="p-3 border-t border-[#d8d7e8] flex items-center gap-2 shrink-0"
        >
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={
              isListening ? 'Listening...' : 'Ask about your notes...'
            }
            disabled={loading || !sessionId}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#7372A5]/50 text-xs"
          />
          {SpeechRecognitionCtor && (
            <button
              type="button"
              onClick={handleToggleListening}
              disabled={loading || !sessionId}
              title={isListening ? 'Stop listening' : 'Ask by voice'}
              className={`w-8 h-8 shrink-0 rounded-xl flex items-center justify-center disabled:opacity-50 ${
                isListening
                  ? 'bg-red-500 text-white'
                  : 'bg-[#ececf4] text-[#7372A5] hover:bg-[#d8d7e8]'
              }`}
            >
              <span className="material-symbols-outlined text-lg">
                {isListening ? 'mic' : 'mic_none'}
              </span>
            </button>
          )}
          <button
            type="submit"
            disabled={loading || !input.trim() || !sessionId}
            className="px-4 py-2 rounded-xl bg-[#7372A5] text-white font-bold text-xs disabled:opacity-50"
          >
            Send
          </button>
        </form>
      </div>
    </div>
  );
};
