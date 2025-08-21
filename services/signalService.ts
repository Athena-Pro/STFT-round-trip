import FFT from 'fft.js';
import { StftParams, SpectrogramData, TransformParams } from '../types';

// #region Spectral Mask Class
export class SpectralMask {
  F: number; // frames
  B: number; // bins
  gainDbLayer: Float32Array; // Multiplicative gain, in dB. 0 is unity.
  generativeDbLayer: Float32Array; // Additive tone loudness, in dBFS. -999 is silent.

  constructor(F: number, B: number) {
    this.F = F;
    this.B = B;
    this.gainDbLayer = new Float32Array(F * B).fill(0);
    this.generativeDbLayer = new Float32Array(F * B).fill(-999);
  }

  idx(f: number, b: number) {
    return f * this.B + b;
  }

  clone(): SpectralMask {
    const newMask = new SpectralMask(this.F, this.B);
    newMask.gainDbLayer.set(this.gainDbLayer);
    newMask.generativeDbLayer.set(this.generativeDbLayer);
    return newMask;
  }

  applyBrush(
    centerF: number,
    centerB: number,
    radiusB: number,
    gainDb: number,
    isErase: boolean,
    brushMode: 'subtractive' | 'generative',
  ) {
    const layer =
      brushMode === 'subtractive' ? this.gainDbLayer : this.generativeDbLayer;
    const neutralValue = brushMode === 'subtractive' ? 0 : -999;
    const radiusF = Math.max(2, Math.round(radiusB / 4));

    const f0 = Math.max(0, Math.floor(centerF - radiusF)),
      f1 = Math.min(this.F - 1, Math.ceil(centerF + radiusF));
    const b0 = Math.max(0, Math.floor(centerB - radiusB)),
      b1 = Math.min(this.B - 1, Math.ceil(centerB + radiusB));

    for (let f = f0; f <= f1; f++) {
      const df = (f - centerF) / (radiusF || 1);
      for (let b = b0; b <= b1; b++) {
        const db = (b - centerB) / (radiusB || 1);
        const distSq = df * df + db * db;

        if (distSq <= 1) {
          const idx = this.idx(f, b);
          if (isErase) {
            // A hard erase is fine, a feathered erase might feel better but is more complex.
            if (brushMode === 'generative') layer[idx] = neutralValue;
            else {
              // Feather erase for subtractive
              const currentDb = layer[idx];
              const deltaDb = -gainDb; // Add back the gain
              const w = Math.exp(-2.7726 * distSq);
              const newDb = currentDb + deltaDb * w;
              layer[idx] = Math.min(0, newDb); // Clamp erase at 0 dB
            }
          } else {
            const w = Math.exp(-2.7726 * distSq);
            if (brushMode === 'subtractive') {
              const currentDb = layer[idx];
              const newDb = currentDb + gainDb * w;
              layer[idx] = Math.max(-80, Math.min(24, newDb));
            } else {
              // 'generative'
              const targetDb = gainDb; // Here, gainDb is the loudness
              // When generating, we set the max loudness in the area.
              layer[idx] = Math.max(layer[idx], targetDb - (1 - w) * 20); // Feather the loudness
            }
          }
        }
      }
    }
  }
}
// #endregion

const getHannWindow = (length: number): Float32Array => {
  const window = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    window[i] = 0.5 * (1 - Math.cos((2 * Math.PI * i) / (length - 1)));
  }
  return window;
};

const transpose = (matrix: any[][]): any[][] => {
  if (!matrix || matrix.length === 0 || matrix[0].length === 0) return [];
  return matrix[0].map((_, colIndex) => matrix.map((row) => row[colIndex]));
};

const stft = (signal: Float32Array, params: StftParams): number[][][] => {
  const { nfft, hopLength } = params;
  const window = getHannWindow(nfft);
  const fft = new FFT(nfft);
  const Zxx: number[][][] = [];

  for (let i = 0; i <= signal.length - nfft; i += hopLength) {
    const frame = signal.slice(i, i + nfft);
    const windowedFrame = new Float32Array(nfft);
    for (let j = 0; j < nfft; j++) windowedFrame[j] = frame[j] * window[j];

    const complexFrameInput = fft.createComplexArray();
    fft.toComplexArray(Array.from(windowedFrame), complexFrameInput);
    const freqData = fft.createComplexArray();
    fft.transform(freqData, complexFrameInput);

    const complexFreqData: number[][] = [];
    for (let k = 0; k < freqData.length; k += 2) {
      complexFreqData.push([freqData[k], freqData[k + 1]]);
    }
    Zxx.push(complexFreqData.slice(0, nfft / 2 + 1));
  }
  return transpose(Zxx); // Return as [bins, frames]
};

const applyAudioGlitches = (
  signal: Float32Array,
  params: StftParams,
  transformParams: TransformParams,
): Float32Array => {
  if (!transformParams.audioGlitch.enabled) return signal;

  const { sr } = params;
  const { params: glitch } = transformParams.audioGlitch;
  const output = new Float32Array(signal);
  const chunkSize = 512;

  for (let i = 0; i < output.length; i += chunkSize) {
    if (Math.random() < glitch.stutterChance) {
      const stutterDurationSamples = Math.floor(
        sr * (glitch.stutterDuration / 1000),
      );
      const stutterChunk = output.slice(Math.max(0, i - chunkSize), i);
      if (stutterChunk.length > 0) {
        for (let s = 0; s < stutterDurationSamples; s++) {
          if (i + s < output.length)
            output[i + s] = stutterChunk[s % stutterChunk.length];
        }
        i += stutterDurationSamples - chunkSize;
      }
    }
    if (Math.random() < glitch.dropChance) {
      for (let j = 0; j < chunkSize && i + j < output.length; j++)
        output[i + j] = 0;
    }
  }
  return output;
};

const istftCooperative = async (
  ZxxTransposed: number[][][],
  params: StftParams,
  originalLength: number,
): Promise<Float32Array> => {
  const { nfft, hopLength } = params;
  if (ZxxTransposed.length === 0) return new Float32Array(originalLength);

  const Zxx = transpose(ZxxTransposed);
  const window = getHannWindow(nfft);
  const fft = new FFT(nfft);

  const reconstructedSignal = new Float32Array(originalLength).fill(0);
  const windowSum = new Float32Array(originalLength).fill(0);
  let lastYield = performance.now();

  for (let frameIndex = 0; frameIndex < Zxx.length; frameIndex++) {
    const frame = Zxx[frameIndex];
    const fullFrame: number[][] = [...frame];
    for (let i = frame.length - 2; i > 0; i--)
      fullFrame.push([frame[i][0], -frame[i][1]]);

    const complexFrameInput = fft.createComplexArray();
    let k = 0;
    for (const [re, im] of fullFrame) {
      complexFrameInput[k++] = re;
      complexFrameInput[k++] = im;
    }

    const timeDomainOutput = fft.createComplexArray();
    fft.inverseTransform(timeDomainOutput, complexFrameInput);
    const realTimeFrame = new Float32Array(nfft);
    fft.fromComplexArray(timeDomainOutput, realTimeFrame);

    const offset = frameIndex * hopLength;
    for (let i = 0; i < nfft; i++) {
      if (offset + i < originalLength) {
        reconstructedSignal[offset + i] += realTimeFrame[i] * window[i];
        windowSum[offset + i] += window[i] * window[i];
      }
    }

    if (performance.now() - lastYield > 10) {
      await new Promise(requestAnimationFrame);
      lastYield = performance.now();
    }
  }

  for (let i = 0; i < reconstructedSignal.length; i++) {
    if (windowSum[i] > 1e-9) reconstructedSignal[i] /= windowSum[i];
  }

  return reconstructedSignal;
};

const generateSpectrogramData = (
  stftResult: number[][][],
  params: StftParams,
): SpectrogramData => {
  if (!stftResult || stftResult.length === 0)
    return { data: [], freqLabels: [] };

  const dbMatrix = stftResult.map((row) =>
    row.map((c) => 20 * Math.log10(Math.sqrt(c[0] ** 2 + c[1] ** 2) + 1e-12)),
  );

  const DB_FLOOR = -90;
  const DB_CEIL = 0;
  const DB_SPAN = DB_CEIL - DB_FLOOR;
  const normalizedMatrix = dbMatrix.map((row) =>
    row.map((db) => {
      const clampedDb = Math.max(DB_FLOOR, Math.min(DB_CEIL, db));
      return (clampedDb - DB_FLOOR) / DB_SPAN;
    }),
  );

  const downsampleAndCreateLabels = (matrix: number[][]): SpectrogramData => {
    const freqBins = matrix.length,
      timeSteps = matrix.length > 0 ? matrix[0].length : 0;
    const MAX_DISPLAY_TIME_STEPS = 512,
      MAX_DISPLAY_FREQ_BINS = 256;
    const timeRatio = Math.max(
      1,
      Math.floor(timeSteps / MAX_DISPLAY_TIME_STEPS),
    );
    const freqRatio = Math.max(1, Math.floor(freqBins / MAX_DISPLAY_FREQ_BINS));
    const displayMatrix: number[][] = [];

    for (let i = freqBins - 1; i >= 0; i -= freqRatio) {
      const newRow: number[] = [];
      for (let j = 0; j < timeSteps; j += timeRatio) {
        let sum = 0,
          count = 0;
        for (let y = 0; y < freqRatio && i - y >= 0; y++) {
          for (let x = 0; x < timeRatio && j + x < timeSteps; x++) {
            sum += matrix[i - y][j + x];
            count++;
          }
        }
        newRow.push(count > 0 ? sum / count : 0);
      }
      displayMatrix.push(newRow);
    }

    const nyquist = params.sr / 2;
    const freqLabels = [
      { bin: 0, label: `${(nyquist / 1000).toFixed(1)} kHz` },
      {
        bin: Math.floor(displayMatrix.length / 2),
        label: `${(nyquist / 2 / 1000).toFixed(1)} kHz`,
      },
      { bin: displayMatrix.length - 1, label: '0 kHz' },
    ];
    return { data: displayMatrix, freqLabels };
  };

  return downsampleAndCreateLabels(normalizedMatrix);
};

// Main service functions exported to App.tsx
export const performStft = (audioData: Float32Array, params: StftParams) => {
  const complexStft = stft(audioData, params);
  const originalSpectrogram = generateSpectrogramData(complexStft, params);
  return { complexStft, originalSpectrogram };
};

export const resynthesizeAudio = async (
  originalComplexStft: number[][][],
  mask: SpectralMask,
  params: StftParams,
  originalLength: number,
  transformParams: TransformParams,
): Promise<Float32Array> => {
  const { enabled: spectralEditEnabled } = transformParams.spectralEdit;

  const numBins = originalComplexStft.length;
  const numFrames = numBins > 0 ? originalComplexStft[0].length : 0;

  // If no edits are enabled, we can take a shortcut, but we still need to apply glitches.
  // So, we process the STFT fully if either transform is active. The logic below handles this.

  const maskedStft: number[][][] = Array.from({ length: numBins }, () =>
    Array.from({ length: numFrames }, () => [0, 0]),
  );

  for (let b = 0; b < numBins; b++) {
    for (let f = 0; f < numFrames; f++) {
      const [re, im] = originalComplexStft[b][f];

      if (spectralEditEnabled) {
        const maskIdx = mask.idx(f, b);

        // 1. Apply multiplicative gain from the subtractive/boost layer.
        const gainDb = mask.gainDbLayer[maskIdx];
        const gain = Math.pow(10, gainDb / 20); // gainDb=0 -> gain=1
        const gainModifiedRe = re * gain;
        const gainModifiedIm = im * gain;

        // 2. Get the additive signal from the generative layer.
        let genRe = 0,
          genIm = 0;
        const genDb = mask.generativeDbLayer[maskIdx];
        if (genDb > -900) {
          const mag = Math.pow(10, genDb / 20);
          const phase = Math.random() * 2 * Math.PI;
          genRe = mag * Math.cos(phase);
          genIm = mag * Math.sin(phase);
        }

        // 3. Combine them: (Original * Gain) + Generative
        maskedStft[b][f][0] = gainModifiedRe + genRe;
        maskedStft[b][f][1] = gainModifiedIm + genIm;
      } else {
        // If spectral editing is off, just use the original values.
        maskedStft[b][f][0] = re;
        maskedStft[b][f][1] = im;
      }
    }
  }

  // Inverse STFT to get back to the time domain.
  let reconstructedSignal = await istftCooperative(
    maskedStft,
    params,
    originalLength,
  );

  // Apply any time-domain transforms like audio glitches.
  reconstructedSignal = applyAudioGlitches(
    reconstructedSignal,
    params,
    transformParams,
  );

  return reconstructedSignal;
};
