import React, { useState } from 'react';
import { GroundedChatMessage } from '../types';

interface TutorChatPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId?: string;
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

  if (!isOpen) return null;

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
      const response = await fetch('/api/grounded-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          session_id: sessionId,
          message: question,
          history: messages.map((m) => ({ role: m.role, text: m.text })),
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
          <button
            onClick={onClose}
            className="w-7 h-7 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white"
          >
            ✕
          </button>
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
                <p className="whitespace-pre-wrap">{message.text}</p>

                {message.citations && message.citations.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {message.citations.map((c, cIdx) => (
                      <span
                        key={cIdx}
                        className="text-[10px] font-semibold text-[#7372A5] bg-white px-2 py-0.5 rounded-full border border-[#d8d7e8]"
                        title={c.excerpt}
                      >
                        {c.locator}
                      </span>
                    ))}
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
            placeholder="Ask about your notes..."
            disabled={loading || !sessionId}
            className="flex-1 px-3 py-2 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#7372A5]/50 text-xs"
          />
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
