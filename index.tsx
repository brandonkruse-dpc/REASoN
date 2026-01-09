import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- CORE TYPES ---
enum YearGroup {
  DP1 = 'DP1 (Y11)',
  DP2 = 'DP2 (Y12)'
}

interface Student {
  id: string;
  name: string;
  yearGroup: YearGroup;
  attendance: number;
  lessonsMissed: number;
  grades: { subject: string; level: string; currentMark: number; trend: string }[];
  core: { ee: string; tok: string; cas: string; points: number };
  riskScore: number;
  totalPoints: number;
  historicalRiskScores: { date: string; score: number }[];
}

interface RiskWeights {
  attendanceWeight: number;
  lowGradeWeight: number;
  coreRiskWeight: number;
  trendWeight: number;
}

const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.3,
  lowGradeWeight: 0.4,
  coreRiskWeight: 0.2,
  trendWeight: 0.1
};

const MOCK_DATA: Student[] = [
  {
    id: "2024001",
    name: "Alex Johnson",
    yearGroup: YearGroup.DP2,
    attendance: 82,
    lessonsMissed: 34,
    grades: [{ subject: "Math AA", level: "HL", currentMark: 3, trend: "down" }, { subject: "Physics", level: "HL", currentMark: 4, trend: "stable" }],
    core: { ee: "At Risk", tok: "In Progress", cas: "Behind", points: 1 },
    riskScore: 78,
    totalPoints: 24,
    historicalRiskScores: [{ date: "May 1", score: 60 }, { date: "May 8", score: 72 }, { date: "May 15", score: 78 }]
  },
  {
    id: "2025002",
    name: "Sarah Chen",
    yearGroup: YearGroup.DP1,
    attendance: 98,
    lessonsMissed: 4,
    grades: [{ subject: "Economics", level: "HL", currentMark: 7, trend: "up" }],
    core: { ee: "Submitted", tok: "Submitted", cas: "Complete", points: 3 },
    riskScore: 5,
    totalPoints: 42,
    historicalRiskScores: [{ date: "May 15", score: 5 }]
  }
];

// --- UTILS ---
const calculateStudentStats = (student: Student, weights: RiskWeights) => {
  let score = 0;
  const attDeficit = Math.max(0, 95 - student.attendance);
  score += attDeficit * 4 * weights.attendanceWeight;

  student.grades.forEach(g => {
    if (g.currentMark < 4) score += (4 - g.currentMark) * 15 * weights.lowGradeWeight;
    if (g.trend === "down") score += 10 * weights.trendWeight;
  });

  if (student.core.ee === "At Risk" || student.core.tok === "At Risk") score += 30 * weights.coreRiskWeight;
  
  const totalPoints = student.grades.reduce((acc, g) => acc + g.currentMark, 0) + student.core.points;
  return { riskScore: Math.min(100, Math.round(score)), totalPoints };
};

// --- APP ---
const App = () => {
  const [students, setStudents] = useState<Student[]>(MOCK_DATA);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processedStudents = useMemo(() => {
    return students.map(s => {
      const stats = calculateStudentStats(s, weights);
      return { ...s, ...stats };
    }).filter(s => (view === 'all' || s.yearGroup === view) && s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, weights, view, search]);

  const handleRunAI = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: (window as any).process?.env?.API_KEY || "" });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze risk for IB Student ${selected.name}. Data: Attn ${selected.attendance}%, Grades: ${JSON.stringify(selected.grades)}. Respond in JSON with keys "riskLevel", "summary", "recommendations".`,
        config: { responseMimeType: "application/json" }
      });
      setAiAnalysis(JSON.parse(resp.text));
    } catch (e) {
      setAiAnalysis({ riskLevel: "High", summary: "AI engine unavailable. Review manually.", recommendations: ["Contact parents", "Check EE progress"] });
    }
    setIsAnalyzing(false);
  };

  const downloadPDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.setFontSize(20);
    doc.text("RE:ASoN WEEKLY COHORT REPORT", 15, 20);
    doc.setFontSize(10);
    processedStudents.slice(0, 15).forEach((s, i) => {
      doc.text(`${s.name} (${s.id}) - Risk: ${s.riskScore} - Pts: ${s.totalPoints}`, 15, 40 + (i * 10));
    });
    doc.save(`REASON_Report_${new Date().toLocaleDateString()}.pdf`);
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-50 shadow-xl flex flex-wrap justify-between items-center gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-black">R</div>
          <div>
            <h1 className="text-xl font-black tracking-tighter">RE:ASoN</h1>
            <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Risk Assessment Engine</p>
          </div>
        </div>

        <div className="flex bg-slate-800 p-1 rounded-xl">
          {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
            <button key={v} onClick={() => setView(v)} className={`px-5 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-blue-600 text-white' : 'text-slate-500 hover:text-white'}`}>
              {v === 'all' ? 'Whole' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-3">
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search records..." className="bg-slate-800 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 text-white outline-none w-48" />
          <button onClick={downloadPDF} className="bg-emerald-600 hover:bg-emerald-700 px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95">PDF Report</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className={`space-y-8 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Cohort Avg Risk</p>
              <p className="text-4xl font-black text-slate-900 leading-none">{Math.round(processedStudents.reduce((a,s)=>a+s.riskScore,0)/processedStudents.length || 0)}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-[10px] text-blue-500 font-black uppercase tracking-widest mb-2">Academic Points Avg</p>
              <p className="text-4xl font-black text-blue-600 leading-none">{(processedStudents.reduce((a,s)=>a+s.totalPoints,0)/processedStudents.length || 0).toFixed(1)}</p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 border-l-4 border-l-red-500">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-2">Critical Alerts</p>
              <p className="text-4xl font-black text-red-600 leading-none">{processedStudents.filter(s=>s.riskScore > 70).length}</p>
            </div>
          </div>

          <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
            <table className="w-full text-left">
              <thead>
                <tr className="text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">
                  <th className="px-6 py-4">Student</th>
                  <th className="px-6 py-4 text-center">IB Pts</th>
                  <th className="px-6 py-4 text-center">Attn %</th>
                  <th className="px-6 py-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {processedStudents.map(s => (
                  <tr key={s.id} onClick={() => { setSelected(s); setAiAnalysis(null); }} className={`cursor-pointer transition-all ${selected?.id === s.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                    <td className="px-6 py-4">
                      <div className="font-black text-slate-900">{s.name}</div>
                      <div className="text-[9px] text-slate-400 font-bold uppercase">{s.id} • {s.yearGroup}</div>
                    </td>
                    <td className="px-6 py-4 text-center font-black">{s.totalPoints}</td>
                    <td className="px-6 py-4 text-center font-black">{s.attendance}%</td>
                    <td className="px-6 py-4">
                      <span className={`px-3 py-1 rounded-full text-[9px] font-black text-white ${s.riskScore > 70 ? 'bg-red-500' : s.riskScore > 40 ? 'bg-orange-500' : 'bg-emerald-500'}`}>
                        {s.riskScore > 70 ? 'CRITICAL' : s.riskScore > 40 ? 'AT RISK' : 'STABLE'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400">ManageBac Sync Zone</h3>
              <input type="file" ref={fileInputRef} className="hidden" />
              <button onClick={() => fileInputRef.current?.click()} className="w-full p-10 border-2 border-dashed border-slate-200 rounded-3xl hover:border-blue-500 hover:bg-blue-50 transition-all flex flex-col items-center">
                <div className="w-12 h-12 bg-slate-100 rounded-full flex items-center justify-center mb-4 text-slate-400">↑</div>
                <span className="text-[10px] font-black text-slate-700 uppercase">Upload Weekly CSV Pull</span>
              </button>
            </div>
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400">Risk Matrix Weights</h3>
              <div className="space-y-6">
                {Object.entries(weights).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                      <span className="text-slate-500">{k.replace('Weight', '')}</span>
                      <span className="text-blue-600">{(v as number).toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={v as number} onChange={e => setWeights({ ...weights, [k]: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {selected && (
          <div className="col-span-12 lg:col-span-4 animate-in">
            <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden sticky top-24">
              <div className="p-8 bg-slate-900 text-white relative">
                <button onClick={() => setSelected(null)} className="absolute top-6 right-6 text-xs hover:text-red-500">✕</button>
                <h2 className="text-2xl font-black leading-none mb-1">{selected.name}</h2>
                <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest">{selected.yearGroup}</p>
                <div className="mt-8 flex justify-between border-t border-slate-800 pt-6">
                  <div className="text-center"><p className="text-[8px] uppercase text-slate-500">Points</p><p className="text-2xl font-black">{selected.totalPoints}</p></div>
                  <div className="text-center"><p className="text-[8px] uppercase text-slate-500">Attendance</p><p className="text-2xl font-black">{selected.attendance}%</p></div>
                </div>
              </div>
              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                <div className="p-5 bg-blue-50 rounded-[24px]">
                  <h3 className="text-[10px] font-black text-blue-900 uppercase tracking-widest mb-4">RE:ASoN AI Insight</h3>
                  {isAnalyzing ? (
                    <div className="py-4 text-center"><div className="w-6 h-6 border-2 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div><p className="text-[9px] font-bold text-slate-400">Synthesizing Data...</p></div>
                  ) : aiAnalysis ? (
                    <div className="space-y-4">
                      <p className="text-xs text-slate-700 italic">"{aiAnalysis.summary}"</p>
                      <ul className="space-y-1">{aiAnalysis.recommendations.map((r: string, i: number) => <li key={i} className="text-[10px] font-bold text-blue-800">• {r}</li>)}</ul>
                    </div>
                  ) : (
                    <button onClick={handleRunAI} className="w-full py-4 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-[10px] uppercase tracking-widest shadow-lg transition-all active:scale-95">Generate Insight</button>
                  )}
                </div>
                <div className="space-y-4">
                  <h3 className="text-[10px] font-black uppercase text-slate-400 border-b pb-2">Risk Trend (Last 30 Days)</h3>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selected.historicalRiskScores}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Line type="monotone" dataKey="score" stroke="#2563eb" strokeWidth={3} dot={{ r: 4 }} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-auto border-t border-slate-100">RE:ASoN v6.0 Terminal</footer>
    </div>
  );
};

const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);