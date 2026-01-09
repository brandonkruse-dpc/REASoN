
export enum YearGroup {
  DP1 = 'DP1 (Y11)',
  DP2 = 'DP2 (Y12)'
}

export interface Assignment {
  name: string;
  score: number;
  maxScore: number;
  type: 'IA' | 'Summative' | 'Core';
  status: 'Submitted' | 'Missing' | 'Late' | 'Pending';
}

export interface SubjectGrade {
  subject: string;
  level: 'HL' | 'SL';
  currentMark: number; // 1-7
  predictedGrade: number; // 1-7
  iaScore?: number; // percentage or raw
  trend: 'up' | 'down' | 'stable';
  assignments: Assignment[];
}

export interface CoreStatus {
  ee: 'Not Started' | 'In Progress' | 'Submitted' | 'At Risk';
  tok: 'Not Started' | 'In Progress' | 'Submitted' | 'At Risk';
  cas: 'Behind' | 'On Track' | 'Complete';
  points: number; // 0-3 core points
}

export interface Student {
  id: string;
  name: string;
  yearGroup: YearGroup;
  attendance: number; // percentage
  lessonsMissed: number;
  grades: SubjectGrade[];
  core: CoreStatus;
  riskScore: number;
  totalPoints: number; // Calculated 1-45
  lastUpdated: string;
  historicalRiskScores: { date: string; score: number }[];
}

export interface RiskWeights {
  attendanceWeight: number;
  lowGradeWeight: number; // for grades < 4
  coreRiskWeight: number;
  trendWeight: number;
  iaRiskWeight: number;
  missingAssignmentWeight: number;
}

export interface RiskAnalysis {
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: string;
  recommendations: string[];
}
