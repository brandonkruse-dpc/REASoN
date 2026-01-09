
import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- TYPES ---
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

// --- CONSTANTS ---
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
      { subject: "Chemistry", level: "HL", currentMark: 2, predictedGrade: 3, trend: 'down', assignments: [{ name: "Lab Report 1", score: 0, maxScore: 20, type: "Summative", status: "Missing" }] }
    ],
    core: { ee: 'Not Started', tok: 'At Risk', cas: 'Behind', points: 0 },
    riskScore: 92,
    totalPoints: 18,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-03-01", score: 80 }, { date: "2024-04-01", score: 88 }, { date: "2024-05-01", score: 92 }]
  }
];

// --- SERVICES ---
const calculateRiskScore = (student: Student, weights: RiskWeights): number => {
  let score = 0;
  score += Math.max(0, 95 - student.attendance) * 5 * weights.attendanceWeight;
  student.grades.forEach(g => {
    if (g.currentMark < 4) score += (4 - g.currentMark) * 15 * weights.lowGradeWeight;
    if (g.trend === 'down') score += 10 * weights.trendWeight;
  });
  if (student.core.ee === 'At Risk') score += 35 * weights.coreRiskWeight;
  return Math.min(100, Math.round(score));
};

const calculateTotalPoints = (student: Student): number => {
  const academic = student.grades.reduce((acc, g) => acc + (g.currentMark || 0), 0);
  return academic + (student.core.points || 0);
};

const getAIClient = () => new GoogleGenAI({ apiKey: (window as any).process?.env?.API_KEY || "" });

const analyzeStudentRisk = async (student: Student): Promise<RiskAnalysis> => {
  const ai = getAIClient();
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Analyze risk for IB DP Student: ${student.name}. Attendance: ${student.attendance}%. Grades: ${JSON.stringify(student.grades)}. Core: ${JSON.stringify(student.core)}`,
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
    return { riskLevel: 'Medium', summary: 'AI synthesis unavailable. Manual review suggested based on score of ' + student.riskScore, recommendations: ['Check attendance logs', 'Verify IA drafts'] };
  }
};

// --- COMPONENTS ---
const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score > 70 ? 'bg-red-100 text-red-700' : score > 40 ? 'bg-orange-100 text-orange-700' : 'bg-emerald-100 text-emerald-700';
  return <span className={`px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-widest ${color}`}>{score > 70 ? 'Critical' : score > 40 ? 'At Risk' : 'Stable'} ({score})</span>;
};

// --- APP COMPONENT ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<RiskAnalysis | null>(null);

  useEffect(() => {
    setStudents(prev => prev.map(s => ({ ...s, riskScore: calculateRiskScore(s, weights), totalPoints: calculateTotalPoints(s) })));
  }, [weights]);

  const filtered = useMemo(() => {
    return students.filter(s => (view === 'all' || s.yearGroup === view) && (s.name.toLowerCase().includes(search.toLowerCase()))).sort((a,b) => b.riskScore - a.riskScore);
  }, [students, view, search]);

  const runAnalysis = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    const result = await analyzeStudentRisk(selected);
    setAiAnalysis(result);
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter']">
      <header className="bg-slate-900 text-white p-4 shadow-2xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl">R</div>
            <div>
              <h1 className="text-xl font-black tracking-tighter">RE:ASoN</h1>
              <p className="text-[8px] text-slate-400 uppercase tracking-widest font-black">Risk Engine: Assessing Students of Note</p>
            </div>
          </div>
          <div className="flex gap-2 bg-slate-800 p-1 rounded-xl">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-4 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all ${view === v ? 'bg-blue-600' : 'text-slate-400 hover:text-white'}`}>
                {v === 'all' ? 'Whole DP' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter Students..." className="bg-slate-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 w-48" />
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-8 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className={`space-y-6 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-2">Cohort Avg Risk</p>
              <p className="text-4xl font-black">{Math.round(filtered.reduce((a,s)=>a+s.riskScore,0)/filtered.length || 0)}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-[10px] text-slate-500 font-black uppercase mb-2">Academic Avg</p>
              <p className="text-4xl font-black text-blue-600">{(filtered.reduce((a,s)=>a+s.totalPoints,0)/filtered.length || 0).toFixed(1)}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 border-l-4 border-l-red-500">
              <p className="text-[10px] text-red-500 font-black uppercase mb-2">Critical Alerts</p>
              <p className="text-4xl font-black text-red-600">{filtered.filter(s=>s.riskScore > 70).length}</p>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-50 border-b border-slate-100 text-[10px] font-black uppercase tracking-widest text-slate-500">
                <tr>
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4">IB Points</th>
                  <th className="px-6 py-4">Attn %</th>
                  <th className="px-6 py-4">Risk Rating</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map(s => (
                  <tr key={s.id} onClick={() => { setSelected(s); setAiAnalysis(null); }} className={`cursor-pointer hover:bg-slate-50 transition-colors ${selected?.id === s.id ? 'bg-blue-50/50' : ''}`}>
                    <td className="px-6 py-4"><div className="font-bold">{s.name}</div><div className="text-[10px] text-slate-400 font-bold">{s.id}</div></td>
                    <td className="px-6 py-4"><span className="font-black text-lg">{s.totalPoints}</span></td>
                    <td className="px-6 py-4 font-bold">{s.attendance}%</td>
                    <td className="px-6 py-4"><RiskBadge score={s.riskScore} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <div className="col-span-12 lg:col-span-4 space-y-6">
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-6 bg-slate-900 text-white flex justify-between items-start">
                <div>
                  <h2 className="text-2xl font-black">{selected.name}</h2>
                  <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest">{selected.yearGroup}</p>
                </div>
                <button onClick={() => setSelected(null)} className="p-2 bg-slate-800 rounded-full">✕</button>
              </div>
              <div className="p-6 space-y-6">
                <div className="p-1 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
                  <div className="bg-white p-4 rounded-xl">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase mb-3 flex justify-between">
                      <span>RE:ASoN AI Synthesis</span>
                      {!aiAnalysis && <span className="animate-pulse text-indigo-500">NEW DATA</span>}
                    </h3>
                    {isAnalyzing ? <div className="py-4 text-center text-xs font-black text-slate-400 animate-pulse">SYNTHESIZING...</div> : aiAnalysis ? (
                      <div className="space-y-3">
                        <div className="bg-blue-50 p-2 rounded-lg text-[10px] font-black uppercase text-blue-700">Risk: {aiAnalysis.riskLevel}</div>
                        <p className="text-xs text-slate-600 italic leading-relaxed">"{aiAnalysis.summary}"</p>
                        <ul className="space-y-1">
                          {aiAnalysis.recommendations.map((r,i) => <li key={i} className="text-[10px] font-bold text-slate-500 flex gap-2"><span className="text-indigo-500">●</span> {r}</li>)}
                        </ul>
                        <button onClick={runAnalysis} className="text-[9px] font-black text-indigo-600 uppercase">Refresh Insights</button>
                      </div>
                    ) : <button onClick={runAnalysis} className="w-full py-3 bg-indigo-600 text-white rounded-xl font-black uppercase tracking-widest text-[10px]">Generate Risk Analysis</button>}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-[10px] font-black uppercase text-slate-400">Academic Standing</h3>
                  {selected.grades.map((g,i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center border border-slate-100">
                      <div><div className="text-xs font-black uppercase">{g.subject}</div><div className="text-[9px] font-bold text-slate-400">{g.level} • {g.trend.toUpperCase()}</div></div>
                      <div className={`text-xl font-black ${g.currentMark < 4 ? 'text-red-600' : 'text-slate-900'}`}>{g.currentMark}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
      <footer className="p-8 text-center text-[10px] font-black text-slate-400 uppercase tracking-widest border-t border-slate-100">RE:ASoN v2.1 • Private IB DP Risk Engine</footer>
    </div>
  );
};

// --- BOOT ---
const container = document.getElementById('root');
if (container) {
  const root = ReactDOM.createRoot(container);
  root.render(<App />);
}
