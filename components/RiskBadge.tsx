
import React from 'react';

interface RiskBadgeProps {
  score: number;
}

const RiskBadge: React.FC<RiskBadgeProps> = ({ score }) => {
  let color = 'bg-green-100 text-green-700 border-green-200';
  let label = 'Low Risk';

  if (score > 70) {
    color = 'bg-red-100 text-red-700 border-red-200';
    label = 'Critical';
  } else if (score > 40) {
    color = 'bg-orange-100 text-orange-700 border-orange-200';
    label = 'At Risk';
  } else if (score > 20) {
    color = 'bg-yellow-100 text-yellow-700 border-yellow-200';
    label = 'Moderate';
  }

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-semibold border ${color}`}>
      {label} ({score})
    </span>
  );
};

export default RiskBadge;
