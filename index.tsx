
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- APPLICATION TYPES ---
enum YearGroup {
  DP1 = 'DP1 (Y11)',
  DP2 = 'DP2 (Y12)'
}

interface Assignment {
  name: string;
  score: number;
  maxScore: number;
  type: 'IA' | 'Summative' | 'Core';
  status: 'Submitted' | 'Missing' | 'Late' | 'Pending';
}

interface SubjectGrade {
  subject: string;
  level: 'HL' | 'SL';
  currentMark: number;
  predictedGrade: number;
  iaScore?: number;
  trend: 'up' | 'down' | 'stable';
  assignments: Assignment[];
}

interface CoreStatus {
  ee: 'Not Started' | 'In Progress' | 'Submitted' | 'At Risk';
  tok: 'Not Started' | 'In Progress' | 'Submitted' | 'At Risk';
  cas: 'Behind' | 'On Track' | 'Complete';
  points: number;
}

interface Student {
  id: string;
  name: string;
  yearGroup: YearGroup;
  attendance: number;
  lessonsMissed: number;
  grades: SubjectGrade[];
  core: CoreStatus;
  riskScore: number;
  totalPoints: number;
  lastUpdated: string;
  historicalRiskScores: { date: string; score: number }[];
}

interface RiskWeights {
  attendanceWeight: number;
  lowGradeWeight: number;
  coreRiskWeight: number;
  trendWeight: number;
  iaRiskWeight: number;
  missingAssignmentWeight: number;
}

interface RiskAnalysis {
  riskLevel: 'Low' | 'Medium' | 'High' | 'Critical';
  summary: string;
  recommendations: string[];
}

// --- CONSTANTS & MOCK DATA ---
const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.25,
  lowGradeWeight: 0.35,
  coreRiskWeight: 0.15,
  trendWeight: 0.1,
  iaRiskWeight: 0.1,
  missingAssignmentWeight: 0.05
};

const MOCK_STUDENTS: Student[] = [
  {
    id: "2024001",
    name: "Alex Johnson",
    yearGroup: YearGroup.DP2,
    attendance: 88,
    lessonsMissed: 24,
    grades: [
      { subject: "Math AA", level: "HL", currentMark: 3, predictedGrade: 4, trend: 'down', assignments: [{ name: "Calculus Exploration IA", score: 8, maxScore: 20, type: "IA", status: "Submitted" }, { name: "Statistics Quiz", score: 0, maxScore: 20, type: "Summative", status: "Missing" }] },
      { subject: "Physics", level: "HL", currentMark: 4, predictedGrade: 4, trend: 'stable', assignments: [] }
    ],
    core: { ee: 'At Risk', tok: 'In Progress', cas: 'Behind', points: 1 },
    riskScore: 72,
    totalPoints: 24,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-03-01", score: 45 }, { date: "2024-04-01", score: 60 }, { date: "2024-05-01", score: 72 }]
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
  }
];

// --- UTILITIES & SERVICES ---
const calculateRiskScore = (student: Student, weights: RiskWeights): number => {
  let score = 0;
  score += Math.max(0, 95 - student.attendance) * 5 * weights.attendanceWeight;
  student.grades.forEach(g => {
    if (g.currentMark < 4) score += (4 - g.currentMark) * 15 * weights.lowGradeWeight;
    if (g.trend === 'down') score += 10 * weights.trendWeight;
  });
  if (student.core.ee === 'At Risk') score += 35 * weights.coreRiskWeight;
  if (student.core.tok === 'At Risk') score += 30 * weights.coreRiskWeight;
  return Math.min(100, Math.round(score));
};

const calculateTotalPoints = (student: Student): number => {
  const academic = student.grades.reduce((acc, g) => acc + (g.currentMark || 0), 0);
  return Math.min(45, academic + (student.core.points || 0));
};

// --- GEMINI SERVICE ---
const analyzeStudentRisk = async (student: Student): Promise<RiskAnalysis> => {
  const apiKey = (window as any).process?.env?.API_KEY || "";
  if (!apiKey) {
    return {
      riskLevel: student.riskScore > 70 ? 'Critical' : 'Medium',
      summary: "Manual Review Required. AI Synthesis is currently offline due to a missing configuration key.",
      recommendations: ["Examine Attendance records", "Verify EE Draft Status", "Check for missing Summative tasks"]
    };
  }
  
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Perform a risk assessment for IB student ${student.name}. Data: Attendance ${student.attendance}%, Grades: ${JSON.stringify(student.grades)}, Core: ${JSON.stringify(student.core)}. Respond in JSON format.`,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: { type: Type.STRING },
            summary: { type: Type.STRING },
            recommendations: { type: Type.ARRAY, items: { type: Type.STRING } }
          },
          required: ["riskLevel", "summary", "recommendations"]
        }
      }
    });
    return JSON.parse(response.text.trim());
  } catch (e) {
    console.error("AI Error:", e);
    return { riskLevel: 'Medium', summary: "Synthesis error. Manual grade check required.", recommendations: ["Contact subject teachers"] };
  }
};

// --- COMPONENTS ---
const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score > 70 ? 'bg-red-500 text-white' : score > 40 ? 'bg-orange-500 text-white' : 'bg-emerald-500 text-white';
  const label = score > 70 ? 'CRITICAL' : score > 40 ? 'AT RISK' : 'STABLE';
  return (
    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest ${color}`}>
      {label} ({score})
    </div>
  );
};

// --- MAIN APPLICATION ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<RiskAnalysis | null>(null);

  // Recalculate scores when weights change
  useEffect(() => {
    setStudents(prev => prev.map(s => ({
      ...s,
      riskScore: calculateRiskScore(s, weights),
      totalPoints: calculateTotalPoints(s)
    })));
  }, [weights]);

  const filtered = useMemo(() => {
    return students
      .filter(s => (view === 'all' || s.yearGroup === view) && s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, view, search]);

  const runAnalysis = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    const result = await analyzeStudentRisk(selected);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter'] selection:bg-blue-100">
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-50 shadow-2xl border-b border-blue-900/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-blue-600 rounded-2xl flex items-center justify-center font-black text-2xl shadow-lg border border-white/10">R</div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-black">Risk Engine: Assessing Students of Note</p>
            </div>
          </div>
          
          <div className="flex bg-slate-800/50 p-1 rounded-xl border border-slate-700">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button 
                key={v} 
                onClick={() => setView(v)} 
                className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase transition-all tracking-widest ${view === v ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}
              >
                {v === 'all' ? 'WHOLE DP' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
              </button>
            ))}
          </div>

          <div className="relative group">
            <input 
              value={search} 
              onChange={e => setSearch(e.target.value)} 
              placeholder="Search Student Identity..." 
              className="bg-slate-800 border-none rounded-xl px-5 py-3 text-sm focus:ring-2 focus:ring-blue-500 w-64 transition-all outline-none placeholder:text-slate-600 text-slate-100" 
            />
            <div className="absolute right-4 top-3.5 text-slate-600">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"/></svg>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        <div className={`space-y-8 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200 hover:shadow-xl transition-all group">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-blue-500 transition-colors"></div>
                Cohort Risk Avg
              </p>
              <p className="text-5xl font-black text-slate-900">
                {Math.round(filtered.reduce((a,s)=>a+s.riskScore,0)/filtered.length || 0)}
              </p>
            </div>
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200 hover:shadow-xl transition-all group">
              <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-300 group-hover:bg-indigo-500 transition-colors"></div>
                Mean IB Pts
              </p>
              <p className="text-5xl font-black text-indigo-600 leading-none">
                {(filtered.reduce((a,s)=>a+s.totalPoints,0)/filtered.length || 0).toFixed(1)}
              </p>
            </div>
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200 border-l-[10px] border-l-red-500 hover:shadow-xl transition-all group">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-3 flex items-center gap-2">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></div>
                Critical Alerts
              </p>
              <p className="text-5xl font-black text-red-600">
                {filtered.filter(s=>s.riskScore > 70).length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Active Registry</h2>
              <span className="text-[10px] font-black bg-white border border-slate-200 px-4 py-1.5 rounded-full text-slate-500 tracking-widest uppercase">
                {filtered.length} RECORDS FOUND
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 border-b border-slate-100">
                    <th className="px-8 py-5">Student Identity</th>
                    <th className="px-8 py-5 text-center">IB Score</th>
                    <th className="px-8 py-5 text-center">Attn %</th>
                    <th className="px-8 py-5">Risk Matrix</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(s => (
                    <tr 
                      key={s.id} 
                      onClick={() => { setSelected(s); setAiAnalysis(null); }} 
                      className={`cursor-pointer transition-all duration-200 ${selected?.id === s.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-8 py-6">
                        <div className={`font-black text-base transition-colors ${selected?.id === s.id ? 'text-blue-600' : 'text-slate-900'}`}>{s.name}</div>
                        <div className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">{s.id} • {s.yearGroup}</div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className={`inline-block px-5 py-2 rounded-2xl font-black text-xl ${s.totalPoints < 24 ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-700'}`}>
                          {s.totalPoints}
                        </div>
                      </td>
                      <td className="px-8 py-6 text-center">
                        <div className={`text-lg font-black ${s.attendance < 90 ? 'text-red-500' : 'text-slate-800'}`}>{s.attendance}%</div>
                      </td>
                      <td className="px-8 py-6">
                        <RiskBadge score={s.riskScore} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {selected && (
          <div className="col-span-12 lg:col-span-4 space-y-8">
            <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden sticky top-32 z-10 transition-all animate-in fade-in slide-in-from-bottom-8 duration-500">
              <div className="p-8 bg-slate-900 text-white relative">
                <button 
                  onClick={() => setSelected(null)} 
                  className="absolute top-6 right-6 p-2.5 bg-slate-800/80 hover:bg-red-600 rounded-full transition-all group"
                >
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"/></svg>
                </button>
                <div>
                  <h2 className="text-3xl font-black tracking-tighter leading-none mb-1 pr-12">{selected.name}</h2>
                  <p className="text-blue-400 font-black text-[10px] uppercase tracking-[0.2em]">{selected.yearGroup}</p>
                </div>
              </div>

              <div className="p-8 space-y-10">
                {/* AI INSIGHTS PANEL */}
                <div className="p-1 rounded-[32px] bg-gradient-to-br from-indigo-500 via-purple-500 to-pink-500 shadow-xl overflow-hidden">
                  <div className="bg-white p-6 rounded-[28px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-4 flex justify-between items-center">
                      <span>RE:ASoN AI SYNTHESIS</span>
                      {!aiAnalysis && <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse"></span>}
                    </h3>
                    
                    {isAnalyzing ? (
                      <div className="py-8 text-center">
                        <div className="inline-block w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin mb-4"></div>
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Processing Matrix...</p>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-4 animate-in fade-in zoom-in-95 duration-300">
                        <div className={`p-3 rounded-xl text-[10px] font-black uppercase text-center tracking-widest ${aiAnalysis.riskLevel === 'Critical' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}`}>
                          Rating: {aiAnalysis.riskLevel}
                        </div>
                        <p className="text-xs text-slate-600 italic font-medium leading-relaxed">"{aiAnalysis.summary}"</p>
                        <ul className="space-y-2">
                          {aiAnalysis.recommendations.map((r,i) => (
                            <li key={i} className="text-[11px] font-bold text-slate-700 flex gap-2">
                              <span className="text-indigo-500 mt-0.5">•</span> {r}
                            </li>
                          ))}
                        </ul>
                        <button onClick={runAnalysis} className="text-[9px] font-black text-indigo-600 uppercase tracking-widest hover:text-indigo-800 transition-colors">REFRESH INSIGHTS</button>
                      </div>
                    ) : (
                      <button 
                        onClick={runAnalysis} 
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-[10px] shadow-lg transition-all active:scale-95"
                      >
                        GENERATE RISK SYNOPSIS
                      </button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 pb-3">Academic Performance</h3>
                  <div className="space-y-3">
                    {selected.grades.map((g,i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-2xl flex justify-between items-center group hover:bg-white hover:shadow-md transition-all border border-transparent hover:border-slate-100">
                        <div>
                          <div className="text-xs font-black text-slate-800 uppercase tracking-tight">{g.subject}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{g.level} • {g.trend.toUpperCase()} TREND</div>
                        </div>
                        <div className={`text-2xl font-black ${g.currentMark < 4 ? 'text-red-500' : 'text-slate-900'}`}>{g.currentMark}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-auto border-t border-slate-100">
        RE:ASoN v3.0 • SECURE ANALYTICS TERMINAL
      </footer>
    </div>
  );
};

// --- BOOTSTRAP ---
console.log("RE:ASoN: Initializing Render Cycle...");
const mountNode = document.getElementById('root');
if (mountNode) {
  const root = ReactDOM.createRoot(mountNode);
  root.render(<App />);
}
