
import { Student, YearGroup, RiskWeights } from './types';

export const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.25,
  lowGradeWeight: 0.35,
  coreRiskWeight: 0.15,
  trendWeight: 0.1,
  iaRiskWeight: 0.1,
  missingAssignmentWeight: 0.05
};

export const MOCK_STUDENTS: Student[] = [
  {
    id: "2024001",
    name: "Alex Johnson",
    yearGroup: YearGroup.DP2,
    attendance: 88,
    lessonsMissed: 24,
    grades: [
      { subject: "Math AA", level: "HL", currentMark: 3, predictedGrade: 4, trend: 'down', assignments: [{ name: "Calculus Exploration IA", score: 8, maxScore: 20, type: "IA", status: "Submitted" }, { name: "Statistics Quiz", score: 0, maxScore: 20, type: "Summative", status: "Missing" }] },
      { subject: "Physics", level: "HL", currentMark: 4, predictedGrade: 4, trend: 'stable', assignments: [{ name: "Internal Assessment Draft", score: 12, maxScore: 24, type: "IA", status: "Submitted" }] }
    ],
    core: { ee: 'At Risk', tok: 'In Progress', cas: 'Behind', points: 1 },
    riskScore: 72,
    totalPoints: 24,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-03-01", score: 45 }, { date: "2024-04-01", score: 60 }, { date: "2024-05-01", score: 72 }]
  },
  {
    id: "2024002",
    name: "Sarah Chen",
    yearGroup: YearGroup.DP2,
    attendance: 98,
    lessonsMissed: 4,
    grades: [
      { subject: "English L&L", level: "HL", currentMark: 7, predictedGrade: 7, trend: 'stable', assignments: [] },
      { subject: "Economics", level: "HL", currentMark: 6, predictedGrade: 7, trend: 'up', assignments: [] }
    ],
    core: { ee: 'Submitted', tok: 'Submitted', cas: 'Complete', points: 3 },
    riskScore: 5,
    totalPoints: 42,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-03-01", score: 5 }, { date: "2024-04-01", score: 4 }, { date: "2024-05-01", score: 5 }]
  },
  {
    id: "2025003",
    name: "Marcus Aurelius",
    yearGroup: YearGroup.DP1,
    attendance: 75,
    lessonsMissed: 52,
    grades: [
      { subject: "Chemistry", level: "HL", currentMark: 2, predictedGrade: 3, trend: 'down', assignments: [{ name: "Lab Report 1", score: 0, maxScore: 20, type: "Summative", status: "Missing" }] },
      { subject: "Biology", level: "SL", currentMark: 3, predictedGrade: 4, trend: 'stable', assignments: [] }
    ],
    core: { ee: 'Not Started', tok: 'At Risk', cas: 'Behind', points: 0 },
    riskScore: 92,
    totalPoints: 18,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-03-01", score: 80 }, { date: "2024-04-01", score: 88 }, { date: "2024-05-01", score: 92 }]
  },
  {
    id: "2024004",
    name: "Elena Rodriguez",
    yearGroup: YearGroup.DP2,
    attendance: 91,
    lessonsMissed: 18,
    grades: [
      { subject: "History", level: "HL", currentMark: 4, predictedGrade: 5, trend: 'up', assignments: [] },
      { subject: "Spanish B", level: "SL", currentMark: 5, predictedGrade: 6, trend: 'stable', assignments: [] }
    ],
    core: { ee: 'In Progress', tok: 'In Progress', cas: 'On Track', points: 2 },
    riskScore: 28,
    totalPoints: 31,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-04-01", score: 32 }, { date: "2024-05-01", score: 28 }]
  },
  {
    id: "2025005",
    name: "Toby Wright",
    yearGroup: YearGroup.DP1,
    attendance: 84,
    lessonsMissed: 32,
    grades: [
      { subject: "Math AI", level: "SL", currentMark: 3, predictedGrade: 4, trend: 'down', assignments: [{ name: "Unit Test 1", score: 40, maxScore: 100, type: "Summative", status: "Submitted" }] }
    ],
    core: { ee: 'Not Started', tok: 'In Progress', cas: 'On Track', points: 1 },
    riskScore: 55,
    totalPoints: 22,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 55 }]
  },
  {
    id: "2024006",
    name: "Aisha Khan",
    yearGroup: YearGroup.DP2,
    attendance: 99,
    lessonsMissed: 1,
    grades: [
      { subject: "Computer Science", level: "HL", currentMark: 7, predictedGrade: 7, trend: 'stable', assignments: [] },
      { subject: "Physics", level: "HL", currentMark: 6, predictedGrade: 7, trend: 'up', assignments: [] }
    ],
    core: { ee: 'Submitted', tok: 'Submitted', cas: 'Complete', points: 3 },
    riskScore: 2,
    totalPoints: 44,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 2 }]
  },
  {
    id: "2025007",
    name: "Liam O'Connor",
    yearGroup: YearGroup.DP1,
    attendance: 89,
    lessonsMissed: 22,
    grades: [
      { subject: "Geography", level: "HL", currentMark: 4, predictedGrade: 5, trend: 'stable', assignments: [] },
      { subject: "Business", level: "HL", currentMark: 4, predictedGrade: 4, trend: 'down', assignments: [{ name: "Marketing IA", score: 5, maxScore: 25, type: "IA", status: "Submitted" }] }
    ],
    core: { ee: 'In Progress', tok: 'In Progress', cas: 'Behind', points: 1 },
    riskScore: 42,
    totalPoints: 26,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 42 }]
  },
  {
    id: "2024008",
    name: "Chloe Dubois",
    yearGroup: YearGroup.DP2,
    attendance: 82,
    lessonsMissed: 38,
    grades: [
      { subject: "Visual Arts", level: "HL", currentMark: 5, predictedGrade: 5, trend: 'stable', assignments: [] },
      { subject: "French A", level: "HL", currentMark: 3, predictedGrade: 4, trend: 'down', assignments: [{ name: "IOA Prep", score: 0, maxScore: 10, type: "Summative", status: "Missing" }] }
    ],
    core: { ee: 'At Risk', tok: 'At Risk', cas: 'Behind', points: 0 },
    riskScore: 78,
    totalPoints: 21,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 78 }]
  },
  {
    id: "2025009",
    name: "Jin Soo Park",
    yearGroup: YearGroup.DP1,
    attendance: 95,
    lessonsMissed: 8,
    grades: [
      { subject: "Math AA", level: "HL", currentMark: 6, predictedGrade: 6, trend: 'up', assignments: [] }
    ],
    core: { ee: 'Not Started', tok: 'In Progress', cas: 'On Track', points: 2 },
    riskScore: 12,
    totalPoints: 34,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 12 }]
  },
  {
    id: "2024010",
    name: "Sofia Rossi",
    yearGroup: YearGroup.DP2,
    attendance: 93,
    lessonsMissed: 14,
    grades: [
      { subject: "History", level: "HL", currentMark: 5, predictedGrade: 6, trend: 'stable', assignments: [] },
      { subject: "Italian A", level: "SL", currentMark: 6, predictedGrade: 6, trend: 'stable', assignments: [] }
    ],
    core: { ee: 'Submitted', tok: 'Submitted', cas: 'Complete', points: 3 },
    riskScore: 10,
    totalPoints: 38,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 10 }]
  },
  {
    id: "2025011",
    name: "Noah Smith",
    yearGroup: YearGroup.DP1,
    attendance: 68,
    lessonsMissed: 64,
    grades: [
      { subject: "Global Politics", level: "SL", currentMark: 3, predictedGrade: 3, trend: 'down', assignments: [{ name: "Case Study", score: 0, maxScore: 20, type: "Summative", status: "Missing" }] }
    ],
    core: { ee: 'Not Started', tok: 'At Risk', cas: 'Behind', points: 0 },
    riskScore: 98,
    totalPoints: 14,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 98 }]
  },
  {
    id: "2024012",
    name: "Emma Wilson",
    yearGroup: YearGroup.DP2,
    attendance: 95,
    lessonsMissed: 10,
    grades: [
      { subject: "Psychology", level: "HL", currentMark: 6, predictedGrade: 7, trend: 'up', assignments: [] },
      { subject: "English B", level: "HL", currentMark: 5, predictedGrade: 5, trend: 'stable', assignments: [] }
    ],
    core: { ee: 'Submitted', tok: 'In Progress', cas: 'On Track', points: 2 },
    riskScore: 15,
    totalPoints: 36,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 15 }]
  }
];
