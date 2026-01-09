
import { Student, YearGroup, RiskWeights, SubjectGrade, Assignment } from '../types';

/**
 * Calculates a weighted risk score (0-100).
 * This score is purely used for alerts and trend analysis.
 * It is heavily influenced by the Coordinator's specific weight preferences.
 */
export function calculateRiskScore(student: Student, weights: RiskWeights): number {
  let score = 0;

  // 1. Attendance Risk (Weighted)
  const attendanceVal = student.attendance || 100;
  const attendanceDeficit = Math.max(0, 95 - attendanceVal); // Goal is 95%
  score += (attendanceDeficit * weights.attendanceWeight) * 5;

  // 2. Academic Risk Components (Weighted)
  let missingCount = 0;
  if (student.grades && Array.isArray(student.grades)) {
    student.grades.forEach(grade => {
      const mark = Number(grade.currentMark);
      
      // Low Grade Risk: Grades below 4 are failing/at-risk in DP
      if (mark < 4 && mark > 0) {
        score += ((4 - mark) * 15 * weights.lowGradeWeight);
      }
      
      // Negative Trend Risk
      if (grade.trend === 'down') {
        score += (10 * weights.trendWeight);
      }
      
      // Assignment & IA specific risks
      grade.assignments?.forEach(a => {
        if (a.status === 'Missing') missingCount++;
        // Low IA performance risk
        if (a.type === 'IA' && a.maxScore > 0 && (a.score / a.maxScore) < 0.4) {
          score += (20 * weights.iaRiskWeight);
        }
      });
    });
  }
  
  // Missing Work Risk
  score += (missingCount * 12 * weights.missingAssignmentWeight);

  // 3. Core Component Risk (EE, TOK, CAS)
  if (student.core) {
    if (student.core.ee === 'At Risk') score += (35 * weights.coreRiskWeight);
    if (student.core.tok === 'At Risk') score += (30 * weights.coreRiskWeight);
    if (student.core.cas === 'Behind') score += (25 * weights.coreRiskWeight);
  }

  return Math.min(100, Math.round(score));
}

/**
 * Calculates pure IB Points (1-45).
 * Strictly based on the aggregate of summative assessment scores (1-7) 
 * across the subjects plus the 0-3 core points.
 * THIS IS NOT AFFECTED BY RISK WEIGHTS.
 */
export function calculateTotalPoints(student: Student): number {
  // Aggregate the 1-7 summative marks from all subject grades
  const summativeAcademicPoints = student.grades.reduce((acc, g) => {
    const mark = Number(g.currentMark) || 0;
    // Ensure we only count valid IB grades (1-7)
    return acc + (mark >= 1 && mark <= 7 ? mark : 0);
  }, 0);

  // Add the 0-3 core points from TOK/EE matrix
  const corePoints = student.core?.points || 0;
  
  // Total IB points (capped at 45 as per standard DP regulations)
  return Math.min(45, summativeAcademicPoints + corePoints);
}

export function parseCSVRow(row: string): string[] {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') {
      if (inQuotes && row[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

function normalizeYearGroup(val: string): YearGroup {
  const lower = String(val).toLowerCase();
  if (lower.includes('dp2') || lower.includes('y12') || lower.includes('12')) return YearGroup.DP2;
  return YearGroup.DP1;
}

export async function parseManageBacCSV(fileContent: string): Promise<Student[]> {
  const rows = fileContent.split(/\r?\n/).filter(row => row.trim().length > 0);
  if (rows.length < 2) return [];

  const students: Student[] = [];
  
  for (let i = 1; i < rows.length; i++) {
    try {
      const cols = parseCSVRow(rows[i]);
      if (cols.length < 2) continue; 

      const [id, name, yearGroup, attendance, lessonsMissed, gradesJson, coreJson] = cols;
      
      const cleanAttendance = parseFloat(String(attendance || '100').replace(/[^0-9.]/g, '')) || 100;
      const cleanLessons = parseInt(String(lessonsMissed || '0').replace(/[^0-9]/g, '')) || 0;

      let parsedGrades: SubjectGrade[] = [];
      let parsedCore = { ee: 'Not Started', tok: 'Not Started', cas: 'On Track', points: 0 };
      
      try {
        if (gradesJson && gradesJson !== '""') {
          const jsonStr = (gradesJson.startsWith('"') && gradesJson.endsWith('"')) ? gradesJson.slice(1, -1).replace(/""/g, '"') : gradesJson.replace(/""/g, '"');
          parsedGrades = JSON.parse(jsonStr);
        }
        if (coreJson && coreJson !== '""') {
          const jsonStr = (coreJson.startsWith('"') && coreJson.endsWith('"')) ? coreJson.slice(1, -1).replace(/""/g, '"') : coreJson.replace(/""/g, '"');
          parsedCore = JSON.parse(jsonStr);
        }
      } catch (e) { 
        console.error("JSON Error in Row " + i + ":", name, e); 
      }

      const student: Student = {
        id: id || `S-${Math.random().toString(36).substr(2, 5)}`,
        name: name || "Unknown Student",
        yearGroup: normalizeYearGroup(yearGroup || 'DP1'),
        attendance: cleanAttendance,
        lessonsMissed: cleanLessons,
        grades: Array.isArray(parsedGrades) ? parsedGrades : [],
        core: parsedCore as any,
        riskScore: 0,
        totalPoints: 0,
        lastUpdated: new Date().toISOString().split('T')[0],
        historicalRiskScores: [{ date: new Date().toISOString().split('T')[0], score: 0 }]
      };
      
      student.totalPoints = calculateTotalPoints(student);
      // Risk score is temporary until weights are applied in the UI
      student.riskScore = 0; 
      
      students.push(student);
    } catch (err) { console.error(`Error row ${i}:`, err); }
  }
  return students;
}
