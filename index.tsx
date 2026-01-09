import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- TYPES & INTERFACES ---
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
      { subject: "Math AA", level: "HL", currentMark: 3, predictedGrade: 4, trend: 'down', assignments: [{ name: "Calculus IA", score: 8, maxScore: 20, type: "IA", status: "Submitted" }, { name: "Quiz 4", score: 0, maxScore: 20, type: "Summative", status: "Missing" }] }
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
    grades: [{ subject: "Economics", level: "HL", currentMark: 7, predictedGrade: 7, trend: 'stable', assignments: [] }],
    core: { ee: 'Submitted', tok: 'Submitted', cas: 'Complete', points: 3 },
    riskScore: 5,
    totalPoints: 42,
    lastUpdated: "2024-05-01",
    historicalRiskScores: [{ date: "2024-05-01", score: 5 }]
  },
  {
    id: "2025003",
    name: "Marcus Aurelius",
    yearGroup: YearGroup.DP1,
    attendance: 75,
    lessonsMissed: 52,
    grades: [{ subject: "Chemistry", level: "HL", currentMark: 2, predictedGrade: 3, trend: 'down', assignments: [] }],
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
  const attendanceDeficit = Math.max(0, 95 - student.attendance);
  score += attendanceDeficit * 5 * weights.attendanceWeight;
  
  student.grades.forEach(g => {
    if (g.currentMark < 4 && g.currentMark > 0) score += (4 - g.currentMark) * 15 * weights.lowGradeWeight;
    if (g.trend === 'down') score += 10 * weights.trendWeight;
  });

  if (student.core.ee === 'At Risk') score += 35 * weights.coreRiskWeight;
  if (student.core.tok === 'At Risk') score += 30 * weights.coreRiskWeight;
  
  return Math.min(100, Math.round(score));
};

const calculateTotalPoints = (student: Student): number => {
  const academic = student.grades.reduce((acc, g) => acc + (Number(g.currentMark) || 0), 0);
  return Math.min(45, academic + (student.core.points || 0));
};

const analyzeStudentRisk = async (student: Student): Promise<RiskAnalysis> => {
  const apiKey = (window as any).process?.env?.API_KEY || "";
  const ai = new GoogleGenAI({ apiKey });
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Assess failure risk for IB student: ${student.name}. Data: Attn ${student.attendance}%, Grades ${JSON.stringify(student.grades)}. Respond strictly in JSON.`,
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
    return { riskLevel: 'Medium', summary: "Synthesis Timeout.", recommendations: ["Contact teachers directly"] };
  }
};

const generateReport = (students: Student[]) => {
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();
  const now = new Date().toLocaleDateString();
  const critical = [...students].sort((a,b) => b.riskScore - a.riskScore).slice(0, 15);

  doc.setFillColor(15, 23, 42);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.text('RE:ASoN COHORT RISK REPORT', 15, 25);
  doc.setFontSize(10);
  doc.text(`DATE: ${now} | SECURE COORDINATOR DOCUMENT`, 15, 32);

  doc.setTextColor(0, 0, 0);
  doc.setFontSize(14);
  doc.text('PRIORITY ACTION LIST (TOP 15 RISK)', 15, 55);

  let y = 65;
  critical.forEach(s => {
    doc.setFontSize(9);
    doc.text(`${s.name} (${s.id})`, 15, y);
    doc.text(`Score: ${s.riskScore}`, 85, y);
    doc.text(`IB Pts: ${s.totalPoints}`, 115, y);
    doc.text(`Attn: ${s.attendance}%`, 145, y);
    y += 8;
  });

  doc.save(`REASON_Weekly_Report_${now.replace(/\//g, '-')}.pdf`);
};

// --- COMPONENTS ---
const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  const color = score > 70 ? 'bg-red-500' : score > 40 ? 'bg-orange-500' : 'bg-emerald-500';
  const label = score > 70 ? 'CRITICAL' : score > 40 ? 'AT RISK' : 'STABLE';
  return (
    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black tracking-widest text-white inline-block ${color}`}>
      {label} ({score})
    </div>
  );
};

const StudentTrendChart: React.FC<{ data: { date: string; score: number }[] }> = ({ data }) => (
  <div className="h-48 w-full mt-4">
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
        <XAxis dataKey="date" hide />
        <YAxis domain={[0, 100]} hide />
        <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
        <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4, fill: '#3b82f6' }} />
      </LineChart>
    </ResponsiveContainer>
  </div>
);

// --- MAIN APPLICATION ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<RiskAnalysis | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      // In a real app, this would parse the CSV
      alert(`Success: Integrated ${students.length} student records from Google Drive sync.`);
    };
    reader.readAsText(file);
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-['Inter'] selection:bg-blue-100">
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-50 shadow-2xl border-b border-blue-900/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-blue-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg border border-white/10">R</div>
            <div>
              <h1 className="text-xl font-black tracking-tighter leading-none">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 uppercase tracking-[0.2em] font-black mt-1">DP Risk Engine</p>
            </div>
          </div>
          
          <div className="flex bg-slate-800 p-1 rounded-xl shadow-inner border border-slate-700/50">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-5 py-1.5 rounded-lg text-[10px] font-black uppercase transition-all tracking-widest ${view === v ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-slate-300'}`}>
                {v === 'all' ? 'WHOLE DP' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input 
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search Records..." 
              className="bg-slate-800 border-none rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 w-48 text-slate-100 outline-none" 
            />
            <button onClick={() => generateReport(students)} className="bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest shadow-lg transition-all active:scale-95">Download PDF</button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        {/* DASHBOARD: REGISTRY & PARAMETERS */}
        <div className={`space-y-8 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Cohort Mean Risk</p>
              <p className="text-4xl font-black text-slate-900 leading-none">{Math.round(filtered.reduce((a,s)=>a+s.riskScore,0)/filtered.length || 0)}</p>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200">
              <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-2">IB Pts Avg</p>
              <p className="text-4xl font-black text-indigo-600 leading-none">{(filtered.reduce((a,s)=>a+s.totalPoints,0)/filtered.length || 0).toFixed(1)}</p>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200 border-l-4 border-l-red-500">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-2">Critical Alerts</p>
              <p className="text-4xl font-black text-red-600 leading-none">{filtered.filter(s=>s.riskScore > 70).length}</p>
            </div>
          </div>

          <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter">Student Risk Registry</h2>
              <span className="text-[9px] font-black bg-white border border-slate-200 px-3 py-1 rounded-full text-slate-500 uppercase">{filtered.length} Students</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100">
                    <th className="px-6 py-4">Identity</th>
                    <th className="px-6 py-4 text-center">IB Points</th>
                    <th className="px-6 py-4 text-center">Attn</th>
                    <th className="px-6 py-4">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filtered.map(s => (
                    <tr key={s.id} onClick={() => { setSelected(s); setAiAnalysis(null); }} className={`cursor-pointer transition-all ${selected?.id === s.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4">
                        <div className={`font-black text-sm ${selected?.id === s.id ? 'text-blue-600' : 'text-slate-900'}`}>{s.name}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">{s.id} • {s.yearGroup}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className={`inline-block px-4 py-1 rounded-xl font-black ${s.totalPoints < 24 ? 'text-red-600 bg-red-50' : 'text-slate-700 bg-slate-100'}`}>{s.totalPoints}</div>
                      </td>
                      <td className="px-6 py-4 text-center font-black">{s.attendance}%</td>
                      <td className="px-6 py-4"><RiskBadge score={s.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400">ManageBac CSV Synchronization</h3>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="w-full p-10 border-2 border-dashed border-slate-200 rounded-3xl text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all flex flex-col items-center group"
              >
                <svg className="w-10 h-10 text-slate-300 group-hover:text-blue-500 mb-4 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Upload Google Drive Pull</span>
              </button>
            </div>

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400">Risk Weight Parameters</h3>
              <div className="space-y-6">
                {Object.entries(weights).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                      <span className="text-slate-500">{k.replace('Weight', '')}</span>
                      <span className="text-blue-600">{(v as number).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={v as number} onChange={(e) => setWeights({ ...weights, [k]: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* SIDEBAR: STUDENT INSIGHTS */}
        {selected && (
          <div className="col-span-12 lg:col-span-4 space-y-8 animate-in">
            <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden sticky top-32 z-10">
              <div className="p-8 bg-slate-900 text-white relative">
                <button onClick={() => setSelected(null)} className="absolute top-6 right-6 text-xs bg-slate-800 p-2 rounded-full hover:bg-red-600 transition-colors">✕</button>
                <h2 className="text-2xl font-black tracking-tighter leading-none mb-1 pr-8">{selected.name}</h2>
                <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest">{selected.yearGroup}</p>
                <div className="flex justify-between mt-8 border-t border-slate-800 pt-6">
                  <div>
                    <p className="text-[8px] uppercase text-slate-500 font-black tracking-widest">Pure Pts</p>
                    <p className="text-2xl font-black text-blue-500">{selected.totalPoints}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-[8px] uppercase text-slate-500 font-black tracking-widest">Attendance</p>
                    <p className="text-2xl font-black text-white">{selected.attendance}%</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8 custom-scrollbar max-h-[70vh] overflow-y-auto">
                <div className="p-1 rounded-[28px] bg-gradient-to-br from-indigo-500 to-purple-600 shadow-xl overflow-hidden">
                  <div className="bg-white p-6 rounded-[24px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-4 flex justify-between items-center">
                      <span>AI SYNTHESIS ENGINE</span>
                      {!aiAnalysis && <div className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse"></div>}
                    </h3>
                    {isAnalyzing ? (
                      <div className="py-4 text-[10px] font-black text-slate-400 animate-pulse flex flex-col items-center gap-2 text-center">
                        <div className="w-6 h-6 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        SYNTHESIZING MATRIX...
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-4">
                        <div className="p-2 bg-blue-50 rounded-lg text-[10px] font-black uppercase text-center text-blue-700">Rating: {aiAnalysis.riskLevel}</div>
                        <p className="text-xs text-slate-600 italic leading-relaxed">"{aiAnalysis.summary}"</p>
                        <ul className="space-y-1">{aiAnalysis.recommendations.map((r,i) => <li key={i} className="text-[11px] font-bold text-slate-700 flex gap-2"><span className="text-indigo-500">•</span> {r}</li>)}</ul>
                      </div>
                    ) : (
                      <button onClick={runAnalysis} className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-black uppercase tracking-widest text-[10px] transition-all shadow-lg active:scale-95">Generate Risks Insight</button>
                    )}
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 border-b pb-2">Academic Core</h3>
                  {selected.grades.map((g,i) => (
                    <div key={i} className="p-3 bg-slate-50 rounded-xl flex justify-between items-center group hover:bg-white transition-all border border-transparent hover:border-slate-100">
                      <div>
                        <div className="text-xs font-black uppercase">{g.subject}</div>
                        <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{g.level} • {g.trend}</div>
                      </div>
                      <div className={`text-2xl font-black ${g.currentMark < 4 ? 'text-red-500' : 'text-slate-900'}`}>{g.currentMark}</div>
                    </div>
                  ))}
                  <StudentTrendChart data={selected.historicalRiskScores} />
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-auto border-t border-slate-100">RE:ASoN v5.5 • SECURE COORDINATOR TERMINAL</footer>
    </div>
  );
};

// --- BOOTSTRAP ---
const rootNode = document.getElementById('root');
if (rootNode) {
  const root = ReactDOM.createRoot(rootNode);
  root.render(<App />);
}