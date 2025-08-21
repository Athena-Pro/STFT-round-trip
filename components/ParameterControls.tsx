import React from 'react';
import {
  StftParams,
  TransformParams,
  GlitchParams,
  BrushParams,
} from '../types';

interface ParameterControlsProps {
  params: StftParams;
  onParamsChange: (newParams: StftParams) => void;
  transformParams: TransformParams;
  onTransformChange: (newParams: TransformParams) => void;
  onFileChange: (event: React.ChangeEvent<HTMLInputElement>) => void;
  isLoading: boolean;
  audioInfo: { name: string; duration: number; sr: number } | null;
  onMaskReset: () => void;
}

const ParameterControlGroup: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <div className="pt-4">
    <h3 className="text-lg font-semibold text-slate-700 border-b pb-2">
      {title}
    </h3>
    <div className="space-y-4 mt-4">{children}</div>
  </div>
);

const LabeledSlider: React.FC<{
  label: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  max: number;
  step: number;
  unit: string;
  description?: string;
}> = ({ label, value, onChange, min, max, step, unit, description }) => (
  <div>
    <label className="block text-sm font-medium text-slate-700">
      {label}:{' '}
      <span className="font-mono text-blue-600">
        {value.toFixed(0)}
        {unit}
      </span>
    </label>
    <input
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer"
    />
    {description && (
      <p className="text-xs text-slate-500 mt-1">{description}</p>
    )}
  </div>
);

const ParameterControls: React.FC<ParameterControlsProps> = ({
  params,
  onParamsChange,
  transformParams,
  onTransformChange,
  onFileChange,
  isLoading,
  audioInfo,
  onMaskReset,
}) => {
  const handleNfftChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newNfft = parseInt(e.target.value, 10);
    onParamsChange({ ...params, nfft: newNfft, hopLength: newNfft / 2 });
  };

  const handleTransformSubParamChange = <
    K extends keyof TransformParams,
    P extends keyof TransformParams[K],
  >(
    key: K,
    subkey: P,
    value: TransformParams[K][P],
  ) => {
    onTransformChange({
      ...transformParams,
      [key]: { ...transformParams[key], [subkey]: value },
    });
  };

  const nfftOptions = [256, 512, 1024, 2048, 4096, 8192];
  const isGenerativeMode =
    transformParams.spectralEdit.brush.brushMode === 'generative';

  return (
    <div className="bg-white rounded-xl shadow-lg p-6 space-y-6 ring-1 ring-slate-900/5 lg:max-h-[calc(100vh-6rem)] lg:overflow-y-auto">
      <div>
        <h2 className="text-2xl font-bold text-slate-800 border-b pb-3">
          Controls
        </h2>
        <div className="mt-4">
          <label
            htmlFor="audio-upload"
            className={`w-full flex items-center justify-center px-4 py-3 border border-transparent text-base font-medium rounded-md shadow-sm text-white ${isLoading ? 'bg-slate-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 cursor-pointer'}`}
          >
            {isLoading ? 'Processing...' : 'Upload Audio File'}
          </label>
          <input
            id="audio-upload"
            type="file"
            className="sr-only"
            accept="audio/*"
            onChange={onFileChange}
            disabled={isLoading}
          />
        </div>
      </div>

      {audioInfo && (
        <div className="bg-slate-100 p-3 rounded-md space-y-2 text-sm">
          <h3 className="font-bold text-slate-800">Audio Details</h3>
          <p className="text-slate-600 truncate" title={audioInfo.name}>
            <span className="font-medium">Name:</span> {audioInfo.name}
          </p>
          <p className="text-slate-600">
            <span className="font-medium">Duration:</span>{' '}
            {audioInfo.duration.toFixed(2)}s
          </p>
          <p className="text-slate-600">
            <span className="font-medium">Sample Rate:</span>{' '}
            {audioInfo.sr.toLocaleString()} Hz
          </p>
        </div>
      )}

      <div
        className={`space-y-4 ${!audioInfo ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <fieldset disabled={!audioInfo || isLoading} className="space-y-4">
          <ParameterControlGroup title="STFT Parameters">
            <div>
              <label htmlFor="nfft" className="block text-sm font-medium">
                FFT Size (n_fft)
              </label>
              <select
                id="nfft"
                value={params.nfft}
                onChange={handleNfftChange}
                className="mt-1 block w-full pl-3 pr-10 py-2 text-base border-slate-300 focus:outline-none focus:ring-blue-500 focus:border-blue-500 sm:text-sm rounded-md"
              >
                {nfftOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
              <p className="text-xs text-slate-500 mt-1">
                Changes trigger re-analysis.
              </p>
            </div>
            <div className="bg-slate-100 p-3 rounded-md">
              <p className="text-sm font-medium">
                Hop Length:{' '}
                <span className="text-lg font-mono text-blue-600">
                  {params.hopLength}
                </span>
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Auto-set to 50% of FFT size for ideal reconstruction.
              </p>
            </div>
          </ParameterControlGroup>

          <ParameterControlGroup title="Spectral Editor">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-md border">
              <label
                htmlFor="editMode"
                className="text-sm font-medium text-slate-700"
              >
                Enable Edit Mode
              </label>
              <button
                role="switch"
                aria-checked={transformParams.spectralEdit.enabled}
                onClick={() =>
                  handleTransformSubParamChange(
                    'spectralEdit',
                    'enabled',
                    !transformParams.spectralEdit.enabled,
                  )
                }
                className={`${transformParams.spectralEdit.enabled ? 'bg-blue-600' : 'bg-slate-300'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
              >
                <span
                  className={`${transformParams.spectralEdit.enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </button>
            </div>

            <div className="flex items-center space-x-1 bg-slate-100 p-1 rounded-md">
              {(['subtractive', 'generative'] as const).map((mode) => (
                <button
                  key={mode}
                  onClick={() =>
                    handleTransformSubParamChange('spectralEdit', 'brush', {
                      ...transformParams.spectralEdit.brush,
                      brushMode: mode,
                      gainDb: mode === 'generative' ? -24 : -60,
                    })
                  }
                  className={`w-full px-2 py-1 text-xs font-medium rounded ${transformParams.spectralEdit.brush.brushMode === mode ? 'bg-white text-blue-600 shadow-sm' : 'text-slate-600 hover:bg-slate-200'}`}
                >
                  {mode === 'subtractive' ? 'Remove/Boost' : 'Generate Tone'}
                </button>
              ))}
            </div>

            <LabeledSlider
              label="Brush Size"
              value={transformParams.spectralEdit.brush.radius}
              min={2}
              max={50}
              step={1}
              unit=" bins"
              onChange={(v) =>
                handleTransformSubParamChange('spectralEdit', 'brush', {
                  ...transformParams.spectralEdit.brush,
                  radius: v,
                })
              }
            />
            <LabeledSlider
              label={isGenerativeMode ? 'Tone Loudness' : 'Brush Gain'}
              value={transformParams.spectralEdit.brush.gainDb}
              min={isGenerativeMode ? -60 : -60}
              max={isGenerativeMode ? 0 : 12}
              step={1}
              unit=" dB"
              onChange={(v) =>
                handleTransformSubParamChange('spectralEdit', 'brush', {
                  ...transformParams.spectralEdit.brush,
                  gainDb: v,
                })
              }
            />

            <button
              onClick={onMaskReset}
              className="w-full px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 border border-slate-200 rounded-md hover:bg-slate-200"
            >
              Reset Mask
            </button>
            <p className="text-xs text-slate-500 mt-1">
              Click and drag on the spectrogram to apply edits. Hold 'Alt' while
              dragging to erase.
            </p>
          </ParameterControlGroup>

          <ParameterControlGroup title="Audio Glitch (Post-Processing)">
            <div className="flex items-center justify-between bg-slate-50 p-3 rounded-md border">
              <label
                htmlFor="glitchMode"
                className="text-sm font-medium text-slate-700"
              >
                Enable Glitches
              </label>
              <button
                role="switch"
                aria-checked={transformParams.audioGlitch.enabled}
                onClick={() =>
                  handleTransformSubParamChange(
                    'audioGlitch',
                    'enabled',
                    !transformParams.audioGlitch.enabled,
                  )
                }
                className={`${transformParams.audioGlitch.enabled ? 'bg-blue-600' : 'bg-slate-300'} relative inline-flex h-6 w-11 items-center rounded-full transition-colors`}
              >
                <span
                  className={`${transformParams.audioGlitch.enabled ? 'translate-x-6' : 'translate-x-1'} inline-block h-4 w-4 transform rounded-full bg-white transition-transform`}
                />
              </button>
            </div>
            {transformParams.audioGlitch.enabled && (
              <div className="space-y-4">
                <LabeledSlider
                  label="Stutter Chance"
                  value={transformParams.audioGlitch.params.stutterChance * 100}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(v) =>
                    handleTransformSubParamChange('audioGlitch', 'params', {
                      ...transformParams.audioGlitch.params,
                      stutterChance: v / 100,
                    })
                  }
                />
                <LabeledSlider
                  label="Drop Chance"
                  value={transformParams.audioGlitch.params.dropChance * 100}
                  min={0}
                  max={100}
                  step={1}
                  unit="%"
                  onChange={(v) =>
                    handleTransformSubParamChange('audioGlitch', 'params', {
                      ...transformParams.audioGlitch.params,
                      dropChance: v / 100,
                    })
                  }
                />
              </div>
            )}
          </ParameterControlGroup>
        </fieldset>
      </div>
    </div>
  );
};

export default ParameterControls;
