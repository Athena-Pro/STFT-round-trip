
import React from 'react';
import { StftParams, TransformParams } from '../types';

interface ResultsDisplayProps {
    error: number;
    params: StftParams;
    snr: number | null;
    transformParams: TransformParams;
    isResynthesizing: boolean;
}

const ResultsDisplay: React.FC<ResultsDisplayProps> = ({ error, params, snr, transformParams, isResynthesizing }) => {
    const isLossless = !transformParams.spectralEdit.enabled && !transformParams.audioGlitch.enabled;
    const isSuccess = isLossless && error < 1e-5;
    const { window, hopLength, nfft } = params;
    
    let title: string;
    let message: string;
    let icon: JSX.Element;
    
    const activeTransforms = [
        transformParams.spectralEdit.enabled && 'Spectral Edits',
        transformParams.audioGlitch.enabled && 'Audio Glitch'
    ].filter(Boolean).join(' & ');

    if (isLossless) {
        if (isSuccess) {
            title = 'Reconstruction Successful';
            message = "The chosen parameters satisfy COLA conditions, demonstrating a high-fidelity reconstruction.";
            icon = <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
        } else {
            title = 'High Reconstruction Error';
            message = "COLA conditions are met, but error is high. This might be due to numerical precision limits.";
            icon = <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-500" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>;
        }
    } else {
        title = 'Lossy Transformation Active';
        message = `The '${activeTransforms}' transformation(s) are active. Error and SNR reflect these intentional modifications.`;
        icon = <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-blue-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2"><path strokeLinecap="round" strokeLinejoin="round" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" /></svg>;
    }


    return (
        <div className="flex flex-col md:flex-row gap-4 items-start bg-slate-50 p-4 rounded-lg border">
            <div className="flex-shrink-0">{icon}</div>
            <div className="flex-1">
                <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
                    <h3 className={`text-lg font-semibold ${isSuccess ? 'text-green-700' : isLossless ? 'text-yellow-700' : 'text-blue-700'}`}>
                       {title}
                    </h3>
                    <p className="text-sm text-slate-600 font-mono">
                        Max Error: <span className="font-bold text-slate-800">{error.toExponential(2)}</span>
                    </p>
                    {snr !== null && (
                         <p className="text-sm text-slate-600 font-mono">
                            SNR: <span className={`font-bold ${snr > 60 && isLossless ? 'text-green-800' : 'text-slate-800'}`}>{isFinite(snr) ? snr.toFixed(2) + ' dB' : 'Perfect'}</span>
                        </p>
                    )}
                    {isResynthesizing && (
                         <div className="flex items-center gap-2 text-sm text-slate-600">
                             <svg className="animate-spin h-4 w-4 text-blue-600" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                             </svg>
                            <span>Resynthesizing...</span>
                         </div>
                    )}
                </div>
                <p className="text-slate-600 mt-1 text-sm">
                   {message}
                </p>
            </div>
        </div>
    );
};

export default ResultsDisplay;
