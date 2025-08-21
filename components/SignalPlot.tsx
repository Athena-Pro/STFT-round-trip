import React from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { SignalPoint } from '../types';

interface SignalPlotProps {
  originalData: SignalPoint[];
  reconstructedData: SignalPoint[];
}

const SignalPlot: React.FC<SignalPlotProps> = ({
  originalData,
  reconstructedData,
}) => {
  // Combine data for plotting on the same chart
  const combinedData = originalData.map((point, index) => ({
    time: point.time,
    original: point.amplitude,
    reconstructed: reconstructedData[index]
      ? reconstructedData[index].amplitude
      : null,
  }));

  // Zoom in to the first 50ms to see the waveform details, similar to the python script
  const zoomedData = combinedData.filter((p) => p.time <= 0.05);

  return (
    <div className="w-full h-80 bg-slate-50 p-2 rounded-lg border">
      <ResponsiveContainer>
        <LineChart
          data={zoomedData}
          margin={{
            top: 5,
            right: 30,
            left: 0,
            bottom: 5,
          }}
        >
          <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
          <XAxis
            dataKey="time"
            type="number"
            domain={[0, 0.05]}
            tickFormatter={(tick) => tick.toFixed(3)}
            label={{ value: 'Time (s)', position: 'insideBottom', offset: -5 }}
            stroke="#64748b"
          />
          <YAxis
            domain={[-1.6, 1.6]}
            label={{ value: 'Amplitude', angle: -90, position: 'insideLeft' }}
            stroke="#64748b"
          />
          <Tooltip
            formatter={(value: number) => value.toFixed(4)}
            labelFormatter={(label: number) => `Time: ${label.toFixed(4)}s`}
          />
          <Legend verticalAlign="top" height={36} />
          <Line
            type="monotone"
            dataKey="original"
            name="Original Signal"
            stroke="#3b82f6"
            dot={false}
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="reconstructed"
            name="Reconstructed Signal"
            stroke="#ef4444"
            strokeDasharray="3 3"
            dot={false}
            strokeWidth={2}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
};

export default SignalPlot;
