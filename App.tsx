import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  StftParams,
  SignalPoint,
  SpectrogramData,
  PlaybackStatus,
  TransformParams,
  SpectrogramView,
  GlitchParams,
  BrushParams,
} from './types';
import {
  DEFAULT_PARAMS,
  DEFAULT_GLITCH_PARAMS,
  DEFAULT_BRUSH_PARAMS,
} from './constants';
import ParameterControls from './components/ParameterControls';
import SignalPlot from './components/SignalPlot';
import ResultsDisplay from './components/ResultsDisplay';
import SpectrogramDisplay from './components/SpectrogramDisplay';
import AudioPlaybackControls from './components/AudioPlaybackControls';
import {
  performStft,
  resynthesizeAudio,
  SpectralMask,
} from './services/signalService';
import { debounce } from './utils';

const ALLOWED_AUDIO_TYPES = [
  'audio/wav',
  'audio/mpeg',
  'audio/ogg',
  'audio/webm',
  'audio/aac',
  'audio/flac',
];
const MAX_FILE_SIZE_BYTES = 50 * 1024 * 1024; // 50MB

const float32ArrayToSignalPoints = (
  data: Float32Array,
  sr: number,
): SignalPoint[] => {
  return Array.from(data).map((amplitude, index) => ({
    time: index / sr,
    amplitude,
  }));
};

const App: React.FC = () => {
  const [params, setParams] = useState<StftParams>(() => {
    try {
      const storedParams = localStorage.getItem('stft-params');
      if (storedParams) {
        const parsed = JSON.parse(storedParams);
        if (parsed.nfft && parsed.hopLength && parsed.window) {
          return { ...DEFAULT_PARAMS, ...parsed };
        }
      }
    } catch (e) {
      console.error('Could not load params from localStorage', e);
    }
    return DEFAULT_PARAMS;
  });

  const [transformParams, setTransformParams] = useState<TransformParams>({
    spectralEdit: { enabled: false, brush: DEFAULT_BRUSH_PARAMS },
    audioGlitch: { enabled: false, params: DEFAULT_GLITCH_PARAMS },
  });

  const [originalSignal, setOriginalSignal] = useState<SignalPoint[]>([]);
  const [reconstructedSignal, setReconstructedSignal] = useState<SignalPoint[]>(
    [],
  );
  const [error, setError] = useState<number>(0);
  const [snr, setSnr] = useState<number | null>(null);

  const [originalSpectrogram, setOriginalSpectrogram] =
    useState<SpectrogramData>({ data: [], freqLabels: [] });
  const [transformedSpectrogram, setTransformedSpectrogram] =
    useState<SpectrogramData>({ data: [], freqLabels: [] });
  const [differenceSpectrogram, setDifferenceSpectrogram] =
    useState<SpectrogramData>({ data: [], freqLabels: [] });
  const [spectrogramView, setSpectrogramView] =
    useState<SpectrogramView>('transformed');

  const [spectralMask, setSpectralMask] = useState<SpectralMask | null>(null);
  const [fullComplexStft, setFullComplexStft] = useState<number[][][] | null>(
    null,
  );
  const [stftDimensions, setStftDimensions] = useState<{
    frames: number;
    bins: number;
  }>({ frames: 0, bins: 0 });

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isResynthesizing, setIsResynthesizing] = useState<boolean>(false);
  const [audioBuffer, setAudioBuffer] = useState<AudioBuffer | null>(null);
  const [audioInfo, setAudioInfo] = useState<{
    name: string;
    duration: number;
    sr: number;
  } | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<{
    original: PlaybackStatus;
    reconstructed: PlaybackStatus;
  }>({ original: 'stopped', reconstructed: 'stopped' });

  const audioContextRef = useRef<AudioContext | null>(null);
  const sourceNodesRef = useRef<{
    original: AudioBufferSourceNode | null;
    reconstructed: AudioBufferSourceNode | null;
  }>({ original: null, reconstructed: null });
  const reconstructedBufferRef = useRef<AudioBuffer | null>(null);
  const audioDataRef = useRef<Float32Array | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem('stft-params', JSON.stringify(params));
    } catch (e) {
      console.error('Could not save params to localStorage', e);
    }
  }, [params]);

  useEffect(() => {
    const isTransformActive =
      transformParams.spectralEdit.enabled ||
      transformParams.audioGlitch.enabled;
    if (!isTransformActive) {
      setSpectrogramView('transformed');
    }
  }, [
    transformParams.spectralEdit.enabled,
    transformParams.audioGlitch.enabled,
  ]);

  const stopAllPlayback = useCallback(() => {
    if (sourceNodesRef.current.original) {
      sourceNodesRef.current.original.onended = null;
      sourceNodesRef.current.original.stop();
      sourceNodesRef.current.original = null;
    }
    if (sourceNodesRef.current.reconstructed) {
      sourceNodesRef.current.reconstructed.onended = null;
      sourceNodesRef.current.reconstructed.stop();
      sourceNodesRef.current.reconstructed = null;
    }
    setPlaybackStatus({ original: 'stopped', reconstructed: 'stopped' });
  }, []);

  const updateReconstructedAudio = useCallback(
    async (
      newReconstructedSignal: Float32Array,
      baseComplexStft: number[][][] | null,
    ) => {
      setReconstructedSignal(
        float32ArrayToSignalPoints(newReconstructedSignal, params.sr),
      );

      // Update error/SNR
      if (audioDataRef.current) {
        let maxError = 0;
        const len = Math.min(
          audioDataRef.current.length,
          newReconstructedSignal.length,
        );
        for (let i = 0; i < len; i++) {
          const error = Math.abs(
            audioDataRef.current[i] - newReconstructedSignal[i],
          );
          if (error > maxError) maxError = error;
        }
        setError(maxError);

        let signalPower = 0,
          errorPower = 0;
        for (let i = 0; i < len; i++) {
          const diff = audioDataRef.current[i] - newReconstructedSignal[i];
          signalPower += audioDataRef.current[i] * audioDataRef.current[i];
          errorPower += diff * diff;
        }
        setSnr(
          errorPower < 1e-12
            ? Infinity
            : 10 * Math.log10(signalPower / errorPower),
        );
      }

      // Update audio buffer for playback
      if (audioContextRef.current) {
        const newReconstructedBuffer = audioContextRef.current.createBuffer(
          1,
          newReconstructedSignal.length,
          params.sr,
        );
        newReconstructedBuffer.copyToChannel(newReconstructedSignal, 0);
        reconstructedBufferRef.current = newReconstructedBuffer;
      }

      // Update spectrograms
      const { complexStft: newTransformedStft } = performStft(
        newReconstructedSignal,
        params,
      );
      setTransformedSpectrogram(
        performStft(newReconstructedSignal, params).originalSpectrogram,
      );
      if (baseComplexStft) {
        setDifferenceSpectrogram(
          generateDifferenceSpectrogramData(
            baseComplexStft,
            newTransformedStft,
            params,
          ),
        );
      }
    },
    [params],
  );

  const processAudio = useCallback(
    async (
      buffer: AudioBuffer,
      currentParams: StftParams,
      currentTransforms: TransformParams,
    ) => {
      setIsLoading(true);
      stopAllPlayback();

      const audioData = buffer.getChannelData(0);
      audioDataRef.current = audioData;
      setOriginalSignal(
        float32ArrayToSignalPoints(audioData, currentParams.sr),
      );

      const { complexStft, originalSpectrogram: newOriginalSpec } = performStft(
        audioData,
        currentParams,
      );
      setFullComplexStft(complexStft);
      setOriginalSpectrogram(newOriginalSpec);

      const frames = complexStft.length > 0 ? complexStft[0].length : 0;
      const bins = complexStft.length;
      setStftDimensions({ frames, bins });
      const newMask = new SpectralMask(frames, bins);
      setSpectralMask(newMask);

      const initialReconstructed = await resynthesizeAudio(
        complexStft,
        newMask,
        currentParams,
        audioData.length,
        currentTransforms,
      );
      await updateReconstructedAudio(initialReconstructed, complexStft);

      setIsLoading(false);
    },
    [stopAllPlayback, updateReconstructedAudio],
  );

  const triggerResynthesis = useCallback(
    debounce(
      async (currentMask: SpectralMask, currentTransforms: TransformParams) => {
        if (!fullComplexStft || !audioDataRef.current) return;

        setIsResynthesizing(true);
        const reconstructed = await resynthesizeAudio(
          fullComplexStft,
          currentMask,
          params,
          audioDataRef.current.length,
          currentTransforms,
        );
        await updateReconstructedAudio(reconstructed, fullComplexStft);
        setIsResynthesizing(false);
      },
      400,
    ),
    [fullComplexStft, params, updateReconstructedAudio],
  );

  const handleFileChange = async (
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (
      !ALLOWED_AUDIO_TYPES.includes(file.type) ||
      file.size > MAX_FILE_SIZE_BYTES
    ) {
      alert('Unsupported file type or file too large (max 50MB).');
      event.target.value = '';
      return;
    }

    setIsLoading(true);
    setAudioInfo(null);
    setAudioBuffer(null);
    stopAllPlayback();

    const AudioContext =
      window.AudioContext || (window as any).webkitAudioContext;
    if (!audioContextRef.current) audioContextRef.current = new AudioContext();

    try {
      const arrayBuffer = await file.arrayBuffer();
      const decodedBuffer =
        await audioContextRef.current.decodeAudioData(arrayBuffer);
      const newSr = decodedBuffer.sampleRate;

      const newParams = { ...params, sr: newSr };
      setParams(newParams);
      setAudioBuffer(decodedBuffer);
      const safeName = file.name.replace(/[^\w.\- ]/g, '');
      setAudioInfo({
        name: safeName,
        duration: decodedBuffer.duration,
        sr: newSr,
      });

      await processAudio(decodedBuffer, newParams, transformParams);
    } catch (e) {
      console.error('Error decoding audio file:', e);
      alert('Could not decode audio file.');
      setIsLoading(false);
    }
  };

  const handleParamsChange = (newParams: StftParams) => {
    setParams(newParams);
    if (audioBuffer) processAudio(audioBuffer, newParams, transformParams);
  };

  const handleTransformChange = (newTransformParams: TransformParams) => {
    setTransformParams(newTransformParams);
    if (audioBuffer && spectralMask) {
      triggerResynthesis(spectralMask, newTransformParams);
    }
  };

  const handleMaskChange = (newMask: SpectralMask) => {
    setSpectralMask(newMask);
    triggerResynthesis(newMask, transformParams);
  };

  const handlePlaybackToggle = useCallback(
    (type: 'original' | 'reconstructed') => {
      if (!audioContextRef.current || !audioBuffer) return;
      const isPlaying = playbackStatus[type] === 'playing';
      stopAllPlayback();
      if (isPlaying) return;

      const bufferToPlay =
        type === 'original' ? audioBuffer : reconstructedBufferRef.current;
      if (!bufferToPlay) return;

      const source = audioContextRef.current.createBufferSource();
      source.buffer = bufferToPlay;
      source.connect(audioContextRef.current.destination);
      source.onended = () => {
        if (sourceNodesRef.current[type] === source) {
          sourceNodesRef.current[type] = null;
          setPlaybackStatus((prev) => ({ ...prev, [type]: 'stopped' }));
        }
      };
      source.start(0);
      sourceNodesRef.current[type] = source;
      setPlaybackStatus({
        original: 'stopped',
        reconstructed: 'stopped',
        [type]: 'playing',
      });
    },
    [audioBuffer, playbackStatus, stopAllPlayback],
  );

  const isTransformActive =
    transformParams.spectralEdit.enabled || transformParams.audioGlitch.enabled;
  const currentViewKey = isTransformActive ? spectrogramView : 'transformed';

  const spectrograms: Record<
    SpectrogramView,
    {
      data: SpectrogramData;
      title: string;
      viewType: 'intensity' | 'difference';
    }
  > = {
    original: {
      data: originalSpectrogram,
      title: 'Spectrogram (Original)',
      viewType: 'intensity',
    },
    transformed: {
      data: transformedSpectrogram,
      title: 'Spectrogram (Post-Transformation)',
      viewType: 'intensity',
    },
    difference: {
      data: differenceSpectrogram,
      title: 'Spectrogram (Difference Map)',
      viewType: 'difference',
    },
  };
  const currentSpectrogram = spectrograms[currentViewKey];

  const SpectrogramViewToggle = () =>
    isTransformActive ? (
      <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-md">
        {(['transformed', 'original', 'difference'] as SpectrogramView[]).map(
          (view) => (
            <button
              key={view}
              onClick={() => setSpectrogramView(view)}
              className={`px-2 py-1 text-xs font-medium rounded ${spectrogramView === view ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
            >
              {view.charAt(0).toUpperCase() + view.slice(1)}
            </button>
          ),
        )}
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-slate-100/50 font-sans p-4 sm:p-6 lg:p-8">
      <div className="max-w-7xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-slate-800 tracking-tight">
            Interactive Spectral Editor
          </h1>
          <p className="mt-2 text-lg text-slate-600 max-w-3xl mx-auto">
            Upload audio, paint on the spectrogram to remove or isolate sounds,
            and hear the results instantly.
          </p>
        </header>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <aside className="lg:col-span-3">
            <div className="lg:sticky lg:top-8">
              <ParameterControls
                params={params}
                onParamsChange={handleParamsChange}
                transformParams={transformParams}
                onTransformChange={handleTransformChange}
                isLoading={isLoading || isResynthesizing}
                onFileChange={handleFileChange}
                audioInfo={audioInfo}
                onMaskReset={() => {
                  if (stftDimensions.frames > 0) {
                    const newMask = new SpectralMask(
                      stftDimensions.frames,
                      stftDimensions.bins,
                    );
                    handleMaskChange(newMask);
                  }
                }}
              />
            </div>
          </aside>

          <main className="lg:col-span-9 bg-white rounded-xl shadow-lg p-6 ring-1 ring-slate-900/5 min-h-[500px]">
            {isLoading ? (
              <div className="flex items-center justify-center h-96">
                <svg
                  className="animate-spin h-10 w-10 text-blue-600"
                  xmlns="http://www.w3.org/2000/svg"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  ></circle>
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  ></path>
                </svg>
                <span className="ml-4 text-xl text-slate-600">
                  Performing Initial Analysis...
                </span>
              </div>
            ) : !audioBuffer ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    className="mx-auto h-12 w-12 text-slate-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                    strokeWidth={1}
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 6l12-3"
                    />
                  </svg>
                  <h3 className="mt-2 text-lg font-medium text-slate-800">
                    No Audio Loaded
                  </h3>
                  <p className="mt-1 text-sm text-slate-500">
                    Please upload an audio file to begin.
                  </p>
                </div>
              </div>
            ) : (
              <div className="space-y-8">
                <AudioPlaybackControls
                  onToggle={handlePlaybackToggle}
                  status={playbackStatus}
                  disabled={!audioBuffer || isLoading || isResynthesizing}
                />
                <ResultsDisplay
                  error={error}
                  params={params}
                  snr={snr}
                  transformParams={transformParams}
                  isResynthesizing={isResynthesizing}
                />
                <div>
                  <h3 className="text-xl font-semibold text-slate-700 mb-4">
                    Original vs. Reconstructed Signal
                  </h3>
                  <SignalPlot
                    originalData={originalSignal}
                    reconstructedData={reconstructedSignal}
                  />
                </div>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-semibold text-slate-700">
                      {isTransformActive
                        ? currentSpectrogram.title
                        : 'Spectrogram'}
                    </h3>
                    <SpectrogramViewToggle />
                  </div>
                  <SpectrogramDisplay
                    spectrogramData={spectrograms.original.data}
                    viewType={currentSpectrogram.viewType}
                    diffData={spectrograms.difference.data.data}
                    mask={spectralMask}
                    onMaskChange={handleMaskChange}
                    isEditMode={transformParams.spectralEdit.enabled}
                    brushParams={transformParams.spectralEdit.brush}
                    fullDimensions={stftDimensions}
                  />
                </div>
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
};

// Helper function to be moved to signalService but placed here for brevity in diff
export const generateDifferenceSpectrogramData = (
  originalStft: number[][][],
  transformedStft: number[][][],
  params: StftParams,
): SpectrogramData => {
  if (originalStft.length === 0 || transformedStft.length === 0)
    return { data: [], freqLabels: [] };

  const stftToDbMatrix = (stftResult: number[][][]): number[][] =>
    stftResult.map((row) =>
      row.map(
        (complex) =>
          20 * Math.log10(Math.sqrt(complex[0] ** 2 + complex[1] ** 2) + 1e-12),
      ),
    );

  const originalDb = stftToDbMatrix(originalStft);
  const transformedDb = stftToDbMatrix(transformedStft);

  let maxAbsDiff = 0;
  const diffMatrix = originalDb.map((row, i) =>
    row.map((val, j) => {
      const diff = transformedDb[i][j] - val;
      if (Math.abs(diff) > maxAbsDiff) maxAbsDiff = Math.abs(diff);
      return diff;
    }),
  );
  if (maxAbsDiff < 1e-6) maxAbsDiff = 1;

  return downsampleAndCreateLabels(
    diffMatrix.map((row) => row.map((diff) => diff / maxAbsDiff)),
    params,
  );
};

const downsampleAndCreateLabels = (
  matrix: number[][],
  params: StftParams,
): SpectrogramData => {
  const freqBins = matrix.length;
  const timeSteps = matrix.length > 0 ? matrix[0].length : 0;
  const MAX_DISPLAY_TIME_STEPS = 512;
  const MAX_DISPLAY_FREQ_BINS = 256;
  const timeStepRatio = Math.max(
    1,
    Math.floor(timeSteps / MAX_DISPLAY_TIME_STEPS),
  );
  const freqBinRatio = Math.max(
    1,
    Math.floor(freqBins / MAX_DISPLAY_FREQ_BINS),
  );
  const displayMatrix: number[][] = [];

  for (let i = freqBins - 1; i >= 0; i -= freqBinRatio) {
    const newRow: number[] = [];
    for (let j = 0; j < timeSteps; j += timeStepRatio) {
      let sum = 0,
        count = 0;
      for (let y = 0; y < freqBinRatio && i - y >= 0; y++) {
        for (let x = 0; x < timeStepRatio && j + x < timeSteps; x++) {
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

export default App;
