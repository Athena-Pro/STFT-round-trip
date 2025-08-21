import React from 'react';
import { PlaybackStatus } from '../types';

interface AudioPlaybackControlsProps {
  onToggle: (type: 'original' | 'reconstructed') => void;
  status: {
    original: PlaybackStatus;
    reconstructed: PlaybackStatus;
  };
  disabled: boolean;
}

const PlayIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M14.752 11.168l-3.197-2.132A1 1 0 0010 9.87v4.263a1 1 0 001.555.832l3.197-2.132a1 1 0 000-1.664z"
    />
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const StopIcon = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    className="h-6 w-6"
    fill="none"
    viewBox="0 0 24 24"
    stroke="currentColor"
    strokeWidth={2}
  >
    <path
      strokeLinecap="round"
      strokeLinejoin="round"
      d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z"
    />
  </svg>
);

const AudioPlaybackControls: React.FC<AudioPlaybackControlsProps> = ({
  onToggle,
  status,
  disabled,
}) => {
  const buttonBaseClasses =
    'w-28 flex items-center justify-center gap-2 px-4 py-2 text-sm font-medium rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';
  const playClasses =
    'text-white bg-blue-600 hover:bg-blue-700 focus:ring-blue-500';
  const stopClasses =
    'text-white bg-red-600 hover:bg-red-700 focus:ring-red-500';

  return (
    <div
      className={`grid grid-cols-1 md:grid-cols-2 gap-4 ${disabled ? 'cursor-not-allowed' : ''}`}
    >
      <div className="bg-slate-50 p-4 rounded-lg border">
        <h4 className="font-semibold text-slate-700 mb-3">Original Audio</h4>
        <button
          onClick={() => onToggle('original')}
          disabled={disabled}
          className={`${buttonBaseClasses} ${status.original === 'playing' ? stopClasses : playClasses}`}
          aria-label={
            status.original === 'playing'
              ? 'Stop original audio'
              : 'Play original audio'
          }
        >
          {status.original === 'playing' ? <StopIcon /> : <PlayIcon />}
          <span>{status.original === 'playing' ? 'Stop' : 'Play'}</span>
        </button>
      </div>
      <div className="bg-slate-50 p-4 rounded-lg border">
        <h4 className="font-semibold text-slate-700 mb-3">
          Reconstructed Audio
        </h4>
        <button
          onClick={() => onToggle('reconstructed')}
          disabled={disabled}
          className={`${buttonBaseClasses} ${status.reconstructed === 'playing' ? stopClasses : playClasses}`}
          aria-label={
            status.reconstructed === 'playing'
              ? 'Stop reconstructed audio'
              : 'Play reconstructed audio'
          }
        >
          {status.reconstructed === 'playing' ? <StopIcon /> : <PlayIcon />}
          <span>{status.reconstructed === 'playing' ? 'Stop' : 'Play'}</span>
        </button>
      </div>
    </div>
  );
};

export default AudioPlaybackControls;
