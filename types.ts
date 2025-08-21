export interface SignalPoint {
  time: number;
  amplitude: number;
}

export type WindowFunction = 'hann';

export interface StftParams {
  sr: number;
  duration: number;
  nfft: number;
  hopLength: number;
  window: WindowFunction;
}

export interface SpectrogramData {
  data: number[][]; // 2D array of values
  freqLabels: { bin: number; label: string }[];
}

export interface Complex {
  re: number;
  im: number;
}

export type PlaybackStatus = 'playing' | 'stopped';

export interface GlitchParams {
  stutterChance: number; // 0-1
  stutterDuration: number; // in ms
  dropChance: number; // 0-1
  clipChance: number; // 0-1
  jitterChance: number; // 0-1
}

export interface BrushParams {
  radius: number; // in bins
  gainDb: number;
  brushMode: 'subtractive' | 'generative';
}

export interface TransformParams {
  spectralEdit: {
    enabled: boolean;
    brush: BrushParams;
  };
  audioGlitch: {
    enabled: boolean;
    params: GlitchParams;
  };
}

export type SpectrogramView = 'original' | 'transformed' | 'difference';
