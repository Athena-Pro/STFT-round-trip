import React, { useRef, useEffect, useState, useCallback, PointerEvent } from 'react';
import { SpectrogramData, BrushParams } from '../types';
import { SpectralMask } from '../services/signalService';

interface SpectrogramDisplayProps {
    spectrogramData: SpectrogramData;
    viewType: 'intensity' | 'difference';
    diffData: number[][];
    mask: SpectralMask | null;
    onMaskChange: (newMask: SpectralMask) => void;
    isEditMode: boolean;
    brushParams: BrushParams;
    fullDimensions: { frames: number; bins: number; };
}

const colors = {
    intensity: (v: number) => {
        if (v > 0.9) return [253, 224, 71]; if (v > 0.75) return [163, 230, 53];
        if (v > 0.6) return [34, 197, 94]; if (v > 0.45) return [20, 184, 166];
        if (v > 0.3) return [37, 99, 235]; if (v > 0.15) return [67, 56, 202];
        return [15, 23, 42];
    },
    difference: (v: number) => {
        const a = Math.abs(v); if (a < 0.05) return [226, 232, 240];
        if (v > 0) { // Added (red)
            if (a > 0.8) return [185, 28, 28]; if (a > 0.5) return [220, 38, 38];
            return [239, 68, 68];
        } else { // Removed (blue)
            if (a > 0.8) return [29, 78, 216]; if (a > 0.5) return [59, 130, 246];
            return [96, 165, 250];
        }
    },
};

const DifferenceLegend: React.FC = () => (
    <div className="flex items-center justify-end gap-4 text-xs text-slate-600 mt-2">
        <span>Difference Legend:</span>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-blue-600"></div><span>Removed</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-slate-200"></div><span>Unchanged</span></div>
        <div className="flex items-center gap-1"><div className="w-3 h-3 rounded-sm bg-red-600"></div><span>Added</span></div>
    </div>
);

const SpectrogramDisplay: React.FC<SpectrogramDisplayProps> = ({ spectrogramData, viewType, diffData, mask, onMaskChange, isEditMode, brushParams, fullDimensions }) => {
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const [backing, setBacking] = useState<{ ctx: CanvasRenderingContext2D; img: ImageData } | null>(null);
    const [isPainting, setIsPainting] = useState(false);
    const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
    const lastPointerPosRef = useRef<{frame: number, bin: number} | null>(null);
    const { data: displayData, freqLabels } = spectrogramData;

    const canvasToSpectral = useCallback((ev: { clientX: number, clientY: number }, canvas: HTMLCanvasElement): { frame: number; bin: number } => {
        const rect = canvas.getBoundingClientRect();
        const { frames, bins } = fullDimensions;
        
        const xCss = ev.clientX - rect.left;
        const yCss = ev.clientY - rect.top;
        const wCss = rect.width, hCss = rect.height;

        const x = Math.max(0, Math.min(wCss, xCss));
        const y = Math.max(0, Math.min(hCss, yCss));

        const frame = Math.max(0, Math.min(frames - 1, Math.round((x / wCss) * (frames - 1))));
        const bin = Math.max(0, Math.min(bins - 1, Math.round((1 - y / hCss) * (bins - 1))));
        return { frame, bin };
    }, [fullDimensions]);
    
    const rasterizeLine = useCallback((p0: { frame: number; bin: number }, p1: { frame: number; bin: number }, apply: (frame: number, bin: number) => void) => {
        const df = p1.frame - p0.frame;
        const db = p1.bin - p0.bin;
        const steps = Math.ceil(Math.max(Math.abs(df), Math.abs(db)));
        if (steps === 0) {
            apply(p0.frame, p0.bin);
            return;
        }
        for (let i = 0; i <= steps; i++) {
            const t = i / steps;
            const frame = Math.round(p0.frame + df * t);
            const bin = Math.round(p0.bin + db * t);
            apply(frame, bin);
        }
    }, []);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || displayData.length === 0) return;
        
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.getBoundingClientRect();
        if (rect.width === 0 || rect.height === 0) return;

        canvas.width = Math.round(rect.width * dpr);
        canvas.height = Math.round(rect.height * dpr);

        const ctx = canvas.getContext('2d', { alpha: false });
        if (!ctx) return;
        ctx.imageSmoothingEnabled = false;

        const img = ctx.createImageData(canvas.width, canvas.height);
        setBacking({ ctx, img });
    }, [displayData]);

    useEffect(() => {
        if (!backing || !displayData || displayData.length === 0 || !mask) return;

        const { ctx, img } = backing;
        const W = img.width; const H = img.height;
        const { frames: totalFrames, bins: totalBins } = fullDimensions;

        const DB_FLOOR = -90; const DB_CEIL = 0;
        const DB_SPAN = DB_CEIL - DB_FLOOR;

        const sourceData = viewType === 'difference' ? diffData : displayData;
        const getColor = colors[viewType];
        const displayDataHeight = sourceData.length;
        const displayDataWidth = displayData.length > 0 ? sourceData[0].length : 0;
        
        for (let y = 0; y < H; y++) {
            for (let x = 0; x < W; x++) {
                const displayX = Math.floor((x / W) * displayDataWidth);
                const displayY = Math.floor((y / H) * displayDataHeight);
                
                const fullFrame = Math.floor((x / W) * totalFrames);
                const fullBin = Math.floor(((H - 1 - y) / H) * totalBins);
                
                const value = sourceData[displayY]?.[displayX] ?? 0;
                let displayValue = value;

                if (viewType === 'intensity') {
                    let finalDb = DB_FLOOR + value * DB_SPAN;
                    
                    const maskIdx = mask.idx(fullFrame, fullBin);
                    const gainDb = mask.gainDbLayer[maskIdx];
                    finalDb += gainDb;

                    const genDb = mask.generativeDbLayer[maskIdx];
                    if (genDb > -900) {
                        finalDb = Math.max(finalDb, genDb);
                    }
                    
                    const clampedDb = Math.max(DB_FLOOR, Math.min(DB_CEIL, finalDb));
                    displayValue = (clampedDb - DB_FLOOR) / DB_SPAN;
                }
                
                const [r, g, b] = getColor(displayValue);
                const index = (y * W + x) * 4;
                img.data.set([r, g, b, 255], index);
            }
        }
        ctx.putImageData(img, 0, 0);

        if (isEditMode && mousePos && canvasRef.current) {
            const dpr = window.devicePixelRatio || 1;
            const brushRadiusCanvas = (brushParams.radius / totalBins) * canvasRef.current.clientHeight;
            ctx.beginPath();
            ctx.arc(mousePos.x * dpr, mousePos.y * dpr, brushRadiusCanvas * dpr, 0, 2 * Math.PI);
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.7)';
            ctx.lineWidth = 1.5 * dpr;
            ctx.stroke();
        }
    }, [backing, displayData, diffData, viewType, mask, isEditMode, mousePos, brushParams.radius, fullDimensions]);
    
    const handlePointerDown = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
        if (!isEditMode || e.button !== 0 || !mask) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        setIsPainting(true);
        
        const pos = canvasToSpectral(e, e.currentTarget);
        lastPointerPosRef.current = pos;
        
        const newMask = mask.clone();
        newMask.applyBrush(pos.frame, pos.bin, brushParams.radius, brushParams.gainDb, e.altKey, brushParams.brushMode);
        onMaskChange(newMask);
        setMousePos({ x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY });
    }, [isEditMode, mask, brushParams, onMaskChange, canvasToSpectral]);

    const handlePointerMove = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
        const currentMousePos = { x: e.nativeEvent.offsetX, y: e.nativeEvent.offsetY };
        setMousePos(currentMousePos);

        if (!isPainting || !isEditMode || !mask) return;

        const currentSpectralPos = canvasToSpectral(e, e.currentTarget);
        const lastSpectralPos = lastPointerPosRef.current;
        
        const newMask = mask.clone();
        const apply = (frame: number, bin: number) => newMask.applyBrush(frame, bin, brushParams.radius, brushParams.gainDb, e.altKey, brushParams.brushMode);

        if (lastSpectralPos) {
            rasterizeLine(lastSpectralPos, currentSpectralPos, apply);
        } else {
            apply(currentSpectralPos.frame, currentSpectralPos.bin);
        }
        
        lastPointerPosRef.current = currentSpectralPos;
        onMaskChange(newMask);
    }, [isPainting, isEditMode, mask, brushParams, onMaskChange, canvasToSpectral, rasterizeLine]);

    const handlePointerUp = useCallback((e: PointerEvent<HTMLCanvasElement>) => {
        if (!isPainting) return;
        e.currentTarget.releasePointerCapture(e.pointerId);
        setIsPainting(false);
        lastPointerPosRef.current = null;
    }, [isPainting]);

    if (!displayData || displayData.length === 0) {
        return <div className="text-slate-500">No spectrogram data.</div>;
    }
    const cursorClass = isEditMode ? 'cursor-crosshair' : 'cursor-default';
    
    return (
        <div>
            <div className="flex gap-4 h-80">
                <div className="flex flex-col justify-between text-xs text-slate-500 py-1 text-right">
                    {freqLabels.map(({ label }) => <div key={label}>{label}</div>)}
                </div>
                <div className="flex-1 overflow-hidden border border-slate-200 rounded bg-slate-100">
                    <canvas ref={canvasRef} className={`w-full h-full object-contain ${cursorClass}`}
                        style={{ imageRendering: 'pixelated' }}
                        onPointerDown={handlePointerDown}
                        onPointerMove={handlePointerMove}
                        onPointerUp={handlePointerUp}
                        onPointerLeave={() => { setMousePos(null); lastPointerPosRef.current = null; }}
                    />
                </div>
            </div>
            {viewType === 'difference' && <DifferenceLegend />}
        </div>
    );
};

export default SpectrogramDisplay;