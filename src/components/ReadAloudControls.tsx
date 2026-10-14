import React from 'react';
import { useSpeechController } from '../hooks/useSpeechController';

interface ReadAloudControlsProps {
  passageId: string;
  onPlay: () => void;
  className?: string;
  compact?: boolean;
}

export const ReadAloudControls: React.FC<ReadAloudControlsProps> = ({
  passageId,
  onPlay,
  className = '',
  compact = false,
}) => {
  const {
    playbackState,
    currentPassageId,
    error,
    isSupported,
    pause,
    resume,
    stop,
  } = useSpeechController();

  const isCurrentPassage = currentPassageId === passageId;
  const isSpeaking = isCurrentPassage && playbackState === 'speaking';
  const isPaused = isCurrentPassage && playbackState === 'paused';
  const isActive = isSpeaking || isPaused;

  if (!isSupported) {
    return (
      <div
        className={`inline-flex items-center gap-1.5 text-xs font-semibold text-gray-400 bg-gray-100 border border-gray-200 px-3 py-1.5 rounded-xl cursor-not-allowed select-none ${className}`}
        title="Speech synthesis is not supported in this browser"
        aria-label="Speech synthesis not supported in this browser"
      >
        <span className="material-symbols-outlined text-base">volume_off</span>
        {!compact && <span>Speech Unavailable</span>}
      </div>
    );
  }

  // Accessible announcement status
  const announcement = isSpeaking
    ? 'Reading aloud in progress'
    : isPaused
    ? 'Reading aloud paused'
    : error
    ? `Speech error: ${error}`
    : 'Reading aloud idle';

  if (compact) {
    return (
      <div
        className={`inline-flex items-center gap-1 bg-[#ececf4] p-1 rounded-xl border border-[#d8d7e8] ${className}`}
        role="group"
        aria-label="Speech playback controls"
      >
        <div className="sr-only" role="status" aria-live="polite">
          {announcement}
        </div>

        {/* Play Button */}
        <button
          type="button"
          onClick={onPlay}
          disabled={isSpeaking}
          aria-disabled={isSpeaking}
          aria-label={isPaused ? 'Restart reading aloud' : 'Read aloud'}
          title={isPaused ? 'Restart reading aloud' : 'Read aloud'}
          className={`p-1.5 rounded-lg transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#7372A5] ${
            isSpeaking
              ? 'text-gray-300 cursor-not-allowed'
              : 'text-[#7372A5] hover:bg-[#d8d7e8] hover:text-[#585785]'
          }`}
        >
          <span className="material-symbols-outlined text-sm">volume_up</span>
        </button>

        {/* Pause Button */}
        <button
          type="button"
          onClick={pause}
          disabled={!isSpeaking}
          aria-disabled={!isSpeaking}
          aria-label="Pause reading aloud"
          title="Pause reading aloud"
          className={`p-1.5 rounded-lg transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
            isSpeaking
              ? 'text-amber-700 bg-amber-100 hover:bg-amber-200 animate-pulse'
              : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-sm">pause</span>
        </button>

        {/* Resume Button */}
        <button
          type="button"
          onClick={resume}
          disabled={!isPaused}
          aria-disabled={!isPaused}
          aria-label="Resume reading aloud"
          title="Resume reading aloud"
          className={`p-1.5 rounded-lg transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
            isPaused
              ? 'text-emerald-700 bg-emerald-100 hover:bg-emerald-200'
              : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-sm">play_arrow</span>
        </button>

        {/* Stop Button */}
        <button
          type="button"
          onClick={stop}
          disabled={!isActive}
          aria-disabled={!isActive}
          aria-label="Stop reading aloud"
          title="Stop reading aloud"
          className={`p-1.5 rounded-lg transition-all focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#7372A5] ${
            isActive
              ? 'text-rose-600 hover:bg-rose-100'
              : 'text-gray-300 cursor-not-allowed'
          }`}
        >
          <span className="material-symbols-outlined text-sm">stop</span>
        </button>
      </div>
    );
  }

  return (
    <div
      className={`inline-flex items-center gap-2 flex-wrap ${className}`}
      role="group"
      aria-label="Read aloud controls"
    >
      <div className="sr-only" role="status" aria-live="polite">
        {announcement}
      </div>

      {/* Read Aloud / Play Button */}
      <button
        type="button"
        onClick={onPlay}
        disabled={isSpeaking}
        aria-disabled={isSpeaking}
        aria-label="Read aloud"
        title="Read question and options aloud"
        className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#7372A5] ${
          isSpeaking
            ? 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-60'
            : 'bg-[#7372A5] hover:bg-[#585785] text-white hover:scale-102 active:scale-98'
        }`}
      >
        <span className="material-symbols-outlined text-base">volume_up</span>
        <span>Read Aloud</span>
      </button>

      {/* Pause Button */}
      <button
        type="button"
        onClick={pause}
        disabled={!isSpeaking}
        aria-disabled={!isSpeaking}
        aria-label="Pause reading aloud"
        title={isSpeaking ? 'Pause reading aloud' : 'Pause unavailable when not speaking'}
        className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-amber-500 ${
          isSpeaking
            ? 'bg-amber-600 hover:bg-amber-700 text-white animate-pulse active:scale-98'
            : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50'
        }`}
      >
        <span className="material-symbols-outlined text-base">pause</span>
        <span>Pause</span>
      </button>

      {/* Resume Button */}
      <button
        type="button"
        onClick={resume}
        disabled={!isPaused}
        aria-disabled={!isPaused}
        aria-label="Resume reading aloud"
        title={isPaused ? 'Resume reading aloud from current position' : 'Resume unavailable when not paused'}
        className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-emerald-500 ${
          isPaused
            ? 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-98'
            : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50'
        }`}
      >
        <span className="material-symbols-outlined text-base">play_arrow</span>
        <span>Resume</span>
      </button>

      {/* Stop Button */}
      <button
        type="button"
        onClick={stop}
        disabled={!isActive}
        aria-disabled={!isActive}
        aria-label="Stop reading aloud"
        title={isActive ? 'Stop reading aloud and reset' : 'Stop unavailable when idle'}
        className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-xl transition-all shadow-xs focus-visible:outline-hidden focus-visible:ring-2 focus-visible:ring-[#7372A5] ${
          isActive
            ? 'bg-[#ececf4] hover:bg-[#d8d7e8] text-[#222138] active:scale-98'
            : 'bg-gray-100 text-gray-400 border border-gray-200 cursor-not-allowed opacity-50'
        }`}
      >
        <span className="material-symbols-outlined text-base text-gray-600">stop</span>
        <span>Stop</span>
      </button>
    </div>
  );
};
