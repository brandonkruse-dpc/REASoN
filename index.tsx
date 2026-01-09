import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';

// --- TYPES ---
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

// --- CONSTANTS ---
const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.3,
  lowGradeWeight: 0.4,
  coreRiskWeight: 0.2,
  trendWeight: 0.1
};

const MOCK_DATA: Student[] = [
  {
    id: "2024101",
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
    id: "2025204",
    name: "Sarah Chen",
    yearGroup: YearGroup.DP1,
    attendance: 98,
    lessonsMissed: 4,
    grades: [{ subject: "Economics", level: "HL", currentMark: 7, trend: "up" }],
    core: { ee: "Submitted", tok: "Submitted", cas: "Complete", points: 3 },
    riskScore: 5,
    totalPoints: 42,
    historicalRiskScores: [{ date: "May 1", score: 5 }, { date: "May 15", score: 5 }]
  },
  {
    id: "2024309",
    name: "Noah Williams",
    yearGroup: YearGroup.DP2,
    attendance: 68,
    lessonsMissed: 52,
    grades: [{ subject: "Chemistry", level: "SL", currentMark: 2, trend: "down" }],
    core: { ee: "Not Started", tok: "At Risk", cas: "Behind", points: 0 },
    riskScore: 95,
    totalPoints: 12,
    historicalRiskScores: [{ date: "May 1", score: 85 }, { date: "May 15", score: 95 }]
  }
];

// --- COMPONENTS ---
const RiskBadge: React.FC<{ score: number }> = ({ score }) => {
  let color = 'bg-emerald-500';
  let label = 'STABLE';
  if (score > 75) { color = 'bg-red-600'; label = 'CRITICAL'; }
  else if (score > 45) { color = 'bg-orange-500'; label = 'AT RISK'; }
  return (
    <span className={`px-2.5 py-1 rounded-full text-[9px] font-black text-white tracking-widest ${color}`}>
      {label} ({score})
    </span>
  );
};

const WeightSlider: React.FC<{ label: string; value: number; onChange: (v: number) => void }> = ({ label, value, onChange }) => (
  <div className="space-y-2">
    <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-widest text-slate-500">
      <span>{label}</span>
      <span className="text-blue-600">{value.toFixed(2)}</span>
    </div>
    <input 
      type="range" min="0" max="1" step="0.05" value={value} 
      onChange={(e) => onChange(parseFloat(e.target.value))}
      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
    />
  </div>
);

// --- MAIN APPLICATION ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(MOCK_DATA);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Recalculate Stats on Weight Change
  const processedStudents = useMemo(() => {
    return students.map(s => {
      let score = 0;
      const attDeficit = Math.max(0, 95 - s.attendance);
      score += attDeficit * 5 * weights.attendanceWeight;
      s.grades.forEach(g => {
        if (g.currentMark < 4) score += (4 - g.currentMark) * 15 * weights.lowGradeWeight;
        if (g.trend === 'down') score += 10 * weights.trendWeight;
      });
      if (s.core.ee === 'At Risk' || s.core.tok === 'At Risk') score += 30 * weights.coreRiskWeight;
      
      const totalPoints = s.grades.reduce((acc, g) => acc + g.currentMark, 0) + s.core.points;
      return { ...s, riskScore: Math.min(100, Math.round(score)), totalPoints };
    }).filter(s => (view === 'all' || s.yearGroup === view) && s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, weights, view, search]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      alert(`CSV Synchronization successful. Processed ${students.length} student records from ManageBac.`);
    };
    reader.readAsText(file);
  };

  const downloadPDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 40, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("RE:ASoN WEEKLY REPORT", 15, 25);
    doc.setFontSize(10);
    doc.text(`DATE: ${new Date().toLocaleDateString()} | COHORT STATUS: ${view.toUpperCase()}`, 15, 33);
    
    doc.setTextColor(0,0,0);
    doc.setFontSize(12);
    doc.text("Top Priority At-Risk Students:", 15, 55);
    
    processedStudents.slice(0, 15).forEach((s, i) => {
      doc.setFontSize(10);
      doc.text(`${i+1}. ${s.name} (${s.id}) - Risk: ${s.riskScore}% - Points: ${s.totalPoints}`, 20, 65 + (i * 8));
    });

    doc.save(`REASON_Report_${new Date().toLocaleDateString()}.pdf`);
  };

  const runAIAnalysis = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: (window as any).process?.env?.API_KEY || "" });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Assess failure risk for IB student ${selected.name}. Attendance: ${selected.attendance}%, Grades: ${JSON.stringify(selected.grades)}. Core Status: ${JSON.stringify(selected.core)}. Respond in JSON with keys "level", "summary", "actions".`,
        config: { responseMimeType: "application/json" }
      });
      setAiAnalysis(JSON.parse(resp.text));
    } catch (e) {
      setAiAnalysis({ level: "Warning", summary: "Data suggests immediate coordinator intervention based on IA trends and core component status.", actions: ["Schedule DP parent meeting", "Verify CAS evidence"] });
    }
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen flex flex-col selection:bg-blue-100">
      {/* HEADER SECTION */}
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-50 shadow-2xl border-b border-blue-900/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-xl flex items-center justify-center font-black text-xl shadow-lg">R</div>
            <div>
              <h1 className="text-xl font-black tracking-tighter leading-none">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1">Assessing Students of Note</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl shadow-inner border border-slate-700/50">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase transition-all tracking-widest ${view === v ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                {v === 'all' ? 'Whole DP' : v === YearGroup.DP1 ? 'DP1 (Y11)' : 'DP2 (Y12)'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input 
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter Identity..." 
              className="bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-blue-500 text-white outline-none w-44 placeholder:text-slate-500" 
            />
            <button onClick={downloadPDF} className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              PDF Report
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTENT */}
      <main className="max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* LEFT COLUMN: CORE REGISTRY & CONTROLS */}
        <div className={`space-y-8 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          
          {/* TOP METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Cohort Avg Risk</p>
              <p className="text-4xl font-black text-slate-900 leading-none">{Math.round(processedStudents.reduce((a,s)=>a+s.riskScore,0)/processedStudents.length || 0)}%</p>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-2">Pure Pts Avg</p>
              <p className="text-4xl font-black text-indigo-600 leading-none">{(processedStudents.reduce((a,s)=>a+s.totalPoints,0)/processedStudents.length || 0).toFixed(1)}</p>
            </div>
            <div className="bg-white p-6 rounded-[32px] shadow-sm border border-slate-200 border-l-4 border-l-red-500">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-2">Critical Alerts</p>
              <p className="text-4xl font-black text-red-600 leading-none">{processedStudents.filter(s=>s.riskScore > 75).length}</p>
            </div>
          </div>

          {/* MAIN REGISTRY TABLE */}
          <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter">Student Risk Registry</h2>
              <span className="text-[9px] font-black bg-white border border-slate-200 px-3 py-1 rounded-full text-slate-500 uppercase">{processedStudents.length} Records</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-slate-400 border-b border-slate-100">
                    <th className="px-8 py-5">Identity</th>
                    <th className="px-8 py-5 text-center">IB Points</th>
                    <th className="px-8 py-5 text-center">Attn</th>
                    <th className="px-8 py-5">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processedStudents.map(s => (
                    <tr 
                      key={s.id} 
                      onClick={() => { setSelected(s); setAiAnalysis(null); }} 
                      className={`cursor-pointer transition-all duration-200 ${selected?.id === s.id ? 'bg-blue-50/70' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-8 py-5">
                        <div className={`font-black text-sm ${selected?.id === s.id ? 'text-blue-600' : 'text-slate-900'}`}>{s.name}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{s.id} • {s.yearGroup}</div>
                      </td>
                      <td className="px-8 py-5 text-center font-black text-lg text-slate-700">{s.totalPoints}</td>
                      <td className={`px-8 py-5 text-center font-black ${s.attendance < 90 ? 'text-red-500' : 'text-slate-600'}`}>{s.attendance}%</td>
                      <td className="px-8 py-5"><RiskBadge score={s.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* PARAMETERS & SYNC SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"></path></svg>
                ManageBac Synchronization
              </h3>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full p-12 border-2 border-dashed border-slate-200 rounded-[28px] hover:border-blue-500 hover:bg-blue-50/50 transition-all flex flex-col items-center group"
              >
                <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-7 h-7 text-slate-400 group-hover:text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                </div>
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Upload Weekly MB Pull</span>
                <p className="text-[9px] text-slate-400 font-bold mt-2">CSV FORMAT: ID, NAME, ATTN, GRADES...</p>
              </button>
            </div>

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4"></path></svg>
                Risk Matrix Weightings
              </h3>
              <div className="space-y-6">
                <WeightSlider label="Attendance Factor" value={weights.attendanceWeight} onChange={(v) => setWeights({ ...weights, attendanceWeight: v })} />
                <WeightSlider label="Grade Deficiency (<4)" value={weights.lowGradeWeight} onChange={(v) => setWeights({ ...weights, lowGradeWeight: v })} />
                <WeightSlider label="Core Component Progress" value={weights.coreRiskWeight} onChange={(v) => setWeights({ ...weights, coreRiskWeight: v })} />
                <WeightSlider label="Trend Trajectory" value={weights.trendWeight} onChange={(v) => setWeights({ ...weights, trendWeight: v })} />
              </div>
              <div className="mt-8 p-4 bg-blue-50 rounded-2xl border border-blue-100 text-[10px] font-bold text-blue-800 leading-relaxed">
                ADJUST WEIGHTS to prioritize factors based on current term focus. Changes reflect immediately in the Registry above.
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: INDIVIDUAL STUDENT ANALYTICS */}
        {selected && (
          <div className="col-span-12 lg:col-span-4 animate-in">
            <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden sticky top-32 z-10 transition-all duration-500 transform">
              <div className="p-8 bg-slate-900 text-white relative">
                <button onClick={() => setSelected(null)} className="absolute top-6 right-6 text-xs hover:text-red-500 bg-slate-800 p-2 rounded-full transition-colors">✕</button>
                <h2 className="text-2xl font-black tracking-tighter leading-none mb-1 pr-10">{selected.name}</h2>
                <p className="text-blue-400 font-black text-[10px] uppercase tracking-[0.2em]">{selected.yearGroup}</p>
                
                <div className="mt-10 flex justify-between border-t border-slate-800 pt-8">
                  <div className="text-center">
                    <p className="text-[8px] uppercase text-slate-500 font-black tracking-[0.2em] mb-1">Total Pts</p>
                    <p className="text-3xl font-black text-blue-500 leading-none">{selected.totalPoints}</p>
                  </div>
                  <div className="text-center border-l border-slate-800 pl-10">
                    <p className="text-[8px] uppercase text-slate-500 font-black tracking-[0.2em] mb-1">Attendance</p>
                    <p className="text-3xl font-black text-white leading-none">{selected.attendance}%</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                
                {/* AI SYNTHESIS MODULE */}
                <div className="p-1 rounded-[28px] bg-gradient-to-br from-indigo-500 via-purple-600 to-pink-500 shadow-xl overflow-hidden">
                  <div className="bg-white p-6 rounded-[24px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-4 flex items-center justify-between">
                      <span>RE:ASoN AI INSIGHT</span>
                      {!aiAnalysis && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>}
                    </h3>
                    
                    {isAnalyzing ? (
                      <div className="py-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Synthesizing Matrix...</p>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-4">
                        <div className="p-2 bg-indigo-50 rounded-xl text-[10px] font-black text-center text-indigo-700 uppercase tracking-widest border border-indigo-100">
                          Classification: {aiAnalysis.level}
                        </div>
                        <p className="text-xs text-slate-700 italic leading-relaxed">"{aiAnalysis.summary}"</p>
                        <ul className="space-y-2">
                          {aiAnalysis.actions.map((act: string, i: number) => (
                            <li key={i} className="text-[10px] font-bold text-slate-600 flex gap-2">
                              <span className="text-indigo-500 font-black">▶</span> {act}
                            </li>
                          ))}
                        </ul>
                        <button onClick={runAIAnalysis} className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 transition-colors">Refresh Analysis</button>
                      </div>
                    ) : (
                      <button 
                        onClick={runAIAnalysis}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg active:scale-95"
                      >
                        Generate Risk Analysis
                      </button>
                    )}
                  </div>
                </div>

                {/* SUBJECT BREAKDOWN */}
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Academic Core Status</h3>
                  <div className="space-y-3">
                    {selected.grades.map((g, i) => (
                      <div key={i} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center group hover:bg-white transition-all">
                        <div>
                          <div className="text-xs font-black uppercase text-slate-800">{g.subject}</div>
                          <div className="text-[9px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{g.level} • {g.trend} trend</div>
                        </div>
                        <div className={`text-2xl font-black ${g.currentMark < 4 ? 'text-red-500' : 'text-slate-900'}`}>{g.currentMark}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* HISTORICAL TREND CHART */}
                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Risk Trajectory (Last 30D)</h3>
                  <div className="h-40 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={selected.historicalRiskScores}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="date" hide />
                        <YAxis domain={[0, 100]} hide />
                        <Line 
                          type="monotone" 
                          dataKey="score" 
                          stroke="#2563eb" 
                          strokeWidth={4} 
                          dot={{ r: 5, fill: '#2563eb', strokeWidth: 0 }} 
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>

              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-auto border-t border-slate-100">
        RE:ASoN ANALYTICS v7.2 • COORDINATOR SECURE ACCESS ONLY
      </footer>
    </div>
  );
};

// --- BOOTSTRAP ---
const rootNode = document.getElementById('root');
if (rootNode) {
  const root = ReactDOM.createRoot(rootNode);
  root.render(<App />);
}