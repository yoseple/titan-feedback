import React from 'react';

const WeightChart = ({ data, showDates = false }) => {
  if (!data || data.length < 2) return <div className="text-center text-gray-500 text-xs py-8 bg-gray-900/30 rounded-lg border border-gray-700 border-dashed">Log 2+ weeks for trend line.</div>;
  const sorted = [...data].sort((a, b) => new Date(a.date) - new Date(b.date));
  const minWeight = Math.min(...sorted.map(d => parseFloat(d.weight))) - 2;
  const maxWeight = Math.max(...sorted.map(d => parseFloat(d.weight))) + 2;
  const weightRange = (maxWeight - minWeight) || 1;
  const points = sorted.map((d, i) => { const x = ((i / (sorted.length - 1)) * 280) + 10; const y = 90 - (((d.weight - minWeight) / weightRange) * 80); return `${x},${y}`; }).join(' ');
  return (
    <div className="w-full h-40 mb-4 bg-gray-900/30 rounded-xl border border-gray-700 p-2 relative">
      <svg viewBox="0 0 300 100" className="w-full h-full overflow-visible">
         <polyline fill="none" stroke="#ef4444" strokeWidth="2" points={points} strokeLinecap="round" strokeLinejoin="round"/>
         {sorted.map((d, i) => { 
            const x = ((i / (sorted.length - 1)) * 280) + 10; 
            const y = 90 - (((d.weight - minWeight) / weightRange) * 80); 
            return (
               <g key={i}>
                  <circle cx={x} cy={y} r="2" fill="#ef4444" />
                  {showDates && (i === 0 || i === sorted.length - 1 || i % Math.ceil(sorted.length/4) === 0) && (
                     <text x={x} y={115} fontSize="8" fill="#6b7280" textAnchor="middle">{d.date.slice(5)}</text>
                  )}
               </g>
            )
         })}
      </svg>
      <div className="absolute top-2 left-2 text-[10px] text-gray-500 font-bold uppercase tracking-wider">Start</div><div className="absolute top-2 right-2 text-[10px] text-gray-500 font-bold uppercase tracking-wider">Now</div>
    </div>
  )
};
export default WeightChart;