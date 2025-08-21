
import { StftParams, GlitchParams, BrushParams } from './types';

export const DEFAULT_PARAMS: Omit<StftParams, 'sr' | 'duration'> & { sr: number, duration: number } = {
  sr: 44100, // This will be replaced by the uploaded file's sample rate
  duration: 1.0, // This is no longer used for signal generation
  nfft: 1024,
  hopLength: 512, // nfft / 2 for perfect reconstruction with Hann window
  window: 'hann',
};

export const DEFAULT_GLITCH_PARAMS: GlitchParams = {
    stutterChance: 0,
    stutterDuration: 50, // ms
    dropChance: 0,
    clipChance: 0,
    jitterChance: 0,
};

export const DEFAULT_BRUSH_PARAMS: BrushParams = {
    radius: 10, // bins
    gainDb: -60, // A strong default for noise removal
    brushMode: 'subtractive',
};