
import React from 'react';
import { RiskWeights } from '../types';

interface SettingsProps {
  weights: RiskWeights;
  onUpdate: (newWeights: RiskWeights) => void;
}

const SettingsPanel: React.FC<SettingsProps> = ({ weights, onUpdate }) => {
  const handleChange = (key: keyof RiskWeights, val: string) => {
    onUpdate({ ...weights, [key]: parseFloat(val) });
  };

  return (
    <div className="bg-white p-6 rounded-xl shadow-sm border border-slate-200">
      <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
        <svg className="w-5 h-5 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"></path><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"></path></svg>
        Risk Calculation Weights
      </h3>
      <div className="space-y-6">
        {Object.entries(weights).map(([key, value]) => (
          <div key={key}>
            <div className="flex justify-between mb-2">
              <label className="text-sm font-medium text-slate-700 capitalize">
                {key.replace(/([A-Z])/g, ' $1').trim()}
              </label>
              {/* Added type assertion to fix 'unknown' type error for toFixed() */}
              <span className="text-sm font-bold text-blue-600">{(value as number).toFixed(2)}</span>
            </div>
            <input 
              type="range" 
              min="0" 
              max="1" 
              step="0.05" 
              value={value as number} 
              onChange={(e) => handleChange(key as keyof RiskWeights, e.target.value)}
              className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
            />
          </div>
        ))}
      </div>
      <div className="mt-8 p-4 bg-blue-50 rounded-lg border border-blue-100 text-xs text-blue-800">
        <p className="font-bold mb-1">How it works:</p>
        Weights determine how much each factor contributes to the overall risk score (0-100). Higher weights prioritize those specific issues in the dashboard sorting.
      </div>
    </div>
  );
};

export default SettingsPanel;
