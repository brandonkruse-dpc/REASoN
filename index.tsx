import React, { useState, useEffect, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

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
  totalPoints: number;
  eeStatus: string;
  tokStatus: string;
  casStatus: string;
  riskScore: number;
  rawGrades: string; // Used for AI context
}

interface RiskWeights {
  attendanceWeight: number;
  pointsWeight: number;
  coreWeight: number;
}

// --- CONSTANTS ---
const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.4,
  pointsWeight: 0.4,
  coreWeight: 0.2
};

const INITIAL_MOCK: Student[] = [
  {
    id: "S1001",
    name: "John Doe (Sample)",
    yearGroup: YearGroup.DP2,
    attendance: 82,
    lessonsMissed: 45,
    totalPoints: 22,
    eeStatus: "At Risk",
    tokStatus: "Behind",
    casStatus: "Behind",
    riskScore: 75,
    rawGrades: "Math: 3, Physics: 3, English: 4"
  }
];

// --- UTILS ---
const parseCSVRow = (row: string) => {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    if (char === '"') inQuotes = !inQuotes;
    else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else current += char;
  }
  result.push(current.trim());
  return result;
};

// --- COMPONENTS ---
const RiskIndicator: React.FC<{ score: number }> = ({ score }) => {
  let color = 'bg-emerald-500';
  let label = 'LOW';
  if (score > 70) { color = 'bg-red-600'; label = 'CRITICAL'; }
  else if (score > 40) { color = 'bg-amber-500'; label = 'ELEVATED'; }
  return (
    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black text-white tracking-widest ${color}`}>
      {label} ({score})
    </div>
  );
};

// --- MAIN APP ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(INITIAL_MOCK);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Discrete Risk Calculation (No trend logic)
  const calculateScore = (s: Student, w: RiskWeights) => {
    let score = 0;
    const attDeficit = Math.max(0, 95 - s.attendance);
    score += attDeficit * 4 * w.attendanceWeight;

    const pointsDeficit = Math.max(0, 24 - s.totalPoints);
    score += pointsDeficit * 10 * w.pointsWeight;

    if (s.eeStatus === 'At Risk' || s.tokStatus === 'At Risk') score += 40 * w.coreWeight;
    if (s.casStatus === 'Behind') score += 20 * w.coreWeight;

    return Math.min(100, Math.round(score));
  };

  const processedStudents = useMemo(() => {
    return students.map(s => ({
      ...s,
      riskScore: calculateScore(s, weights)
    })).filter(s => (view === 'all' || s.yearGroup === view) && s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, weights, view, search]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const text = event.target?.result as string;
      const rows = text.split(/\r?\n/).filter(r => r.trim());
      if (rows.length < 2) return;

      const headers = parseCSVRow(rows[0]).map(h => h.toLowerCase());
      
      // Map OneRoster 1.2 Standard Headers + Custom MB Fields
      const findIdx = (names: string[]) => headers.findIndex(h => names.includes(h));
      const idx = {
        id: findIdx(['sourcedid', 'identifier', 'id']),
        first: findIdx(['givenname', 'first name', 'firstname']),
        last: findIdx(['familyname', 'last name', 'lastname']),
        grade: findIdx(['grades', 'grade', 'yeargroup']),
        attn: findIdx(['attendance', 'attendance_percentage', 'attn']),
        points: findIdx(['points', 'ib_points', 'total_points']),
        ee: findIdx(['ee', 'ee_status', 'extended_essay']),
        tok: findIdx(['tok', 'tok_status', 'theory_of_knowledge']),
        cas: findIdx(['cas', 'cas_status']),
        raw: findIdx(['raw_grades', 'grades_summary'])
      };

      const newStudents: Student[] = rows.slice(1).map(row => {
        const cols = parseCSVRow(row);
        return {
          id: cols[idx.id] || `S-${Math.random().toString(36).substr(2, 5)}`,
          name: `${cols[idx.first] || ''} ${cols[idx.last] || ''}`.trim() || 'Unknown Student',
          yearGroup: (cols[idx.grade] || '').includes('12') ? YearGroup.DP2 : YearGroup.DP1,
          attendance: parseFloat(cols[idx.attn]) || 100,
          lessonsMissed: 0, // Simplified
          totalPoints: parseInt(cols[idx.points]) || 0,
          eeStatus: cols[idx.ee] || 'On Track',
          tokStatus: cols[idx.tok] || 'On Track',
          casStatus: cols[idx.cas] || 'On Track',
          riskScore: 0,
          rawGrades: cols[idx.raw] || ''
        };
      });

      // DISCRETE UPDATE: Clear previous state
      setStudents(newStudents);
      setSelected(null);
      setAiResult(null);
      alert(`Discrete Synchronization Successful. Loaded ${newStudents.length} records.`);
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const headers = "sourcedId,givenName,familyName,grades,attendance,points,ee,tok,cas,raw_grades\n";
    const sample = "2024001,Alex,Johnson,12,88,24,At Risk,In Progress,Behind,\"Math: 3, Physics: 4\"\n2025002,Sarah,Chen,11,98,38,On Track,On Track,Complete,\"Math: 7, Econ: 7\"";
    const blob = new Blob([headers + sample], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'REASON_OneRoster_Template.csv';
    a.click();
  };

  const generatePDF = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(20);
    doc.text("RE:ASoN COORDINATOR REPORT", 15, 22);
    doc.setFontSize(10);
    doc.text(`DATE: ${new Date().toLocaleDateString()} | VIEW: ${view.toUpperCase()}`, 15, 30);
    
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Top 20 Critical Alerts:", 15, 50);
    
    processedStudents.slice(0, 20).forEach((s, i) => {
      doc.setFontSize(9);
      doc.text(`${i+1}. ${s.name} (${s.id})`, 15, 60 + (i * 7));
      doc.text(`Risk: ${s.riskScore}%`, 80, 60 + (i * 7));
      doc.text(`Points: ${s.totalPoints}`, 110, 60 + (i * 7));
      doc.text(`Attn: ${s.attendance}%`, 140, 60 + (i * 7));
    });

    doc.save(`REASON_Report_${new Date().toISOString().split('T')[0]}.pdf`);
  };

  const runAI = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: (window as any).process?.env?.API_KEY || "" });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze risk for IB Student: ${selected.name}. Data: Attn ${selected.attendance}%, Points ${selected.totalPoints}, EE: ${selected.eeStatus}. Raw Grades: ${selected.rawGrades}. Provide JSON: { "level": string, "summary": string, "steps": string[] }`,
        config: { responseMimeType: "application/json" }
      });
      setAiResult(JSON.parse(resp.text));
    } catch (e) {
      setAiResult({ level: "Critical", summary: "Data suggests urgent review of IA markers and attendance patterns.", steps: ["Parent-Coordinator Meeting", "Review subject IA drafts"] });
    }
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* HEADER */}
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-50 shadow-xl border-b border-indigo-500/30">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-10 h-10 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg border border-white/10">R</div>
            <div>
              <h1 className="text-xl font-black tracking-tighter leading-none">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 italic">Discrete Data Terminal</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-5 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                {v === 'all' ? 'Whole DP' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input 
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Search SourcedID/Name..." 
              className="bg-slate-800 border-none rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-indigo-500 text-white outline-none w-48 placeholder:text-slate-500" 
            />
            <button onClick={generatePDF} className="bg-emerald-600 hover:bg-emerald-700 px-5 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              PDF Report
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD */}
      <main className="max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* REGISTRY COLUMN */}
        <div className={`space-y-8 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Cohort Risk Index</p>
              <p className="text-4xl font-black text-slate-900 leading-none">{Math.round(processedStudents.reduce((a,s)=>a+s.riskScore,0)/processedStudents.length || 0)}%</p>
            </div>
            <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200">
              <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-2">Academic Avg</p>
              <p className="text-4xl font-black text-indigo-600 leading-none">{(processedStudents.reduce((a,s)=>a+s.totalPoints,0)/processedStudents.length || 0).toFixed(1)}</p>
            </div>
            <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200 border-l-4 border-l-red-500">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-2">Active Alerts</p>
              <p className="text-4xl font-black text-red-600 leading-none">{processedStudents.filter(s=>s.riskScore > 70).length}</p>
            </div>
          </div>

          <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter">Current Cohort Registry</h2>
              <span className="text-[9px] font-black bg-indigo-50 text-indigo-600 px-3 py-1 rounded-full uppercase tracking-widest">{processedStudents.length} Students Loaded</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 tracking-widest">
                    <th className="px-8 py-5">Identity</th>
                    <th className="px-8 py-5 text-center">IB Pts</th>
                    <th className="px-8 py-5 text-center">Attn %</th>
                    <th className="px-8 py-5">Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {processedStudents.map(s => (
                    <tr key={s.id} onClick={() => { setSelected(s); setAiResult(null); }} className={`cursor-pointer transition-all ${selected?.id === s.id ? 'bg-indigo-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-8 py-5">
                        <div className={`font-black text-sm ${selected?.id === s.id ? 'text-indigo-600' : 'text-slate-900'}`}>{s.name}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">{s.id} • {s.yearGroup}</div>
                      </td>
                      <td className="px-8 py-5 text-center font-black text-lg text-slate-700">{s.totalPoints}</td>
                      <td className={`px-8 py-5 text-center font-black ${s.attendance < 90 ? 'text-red-500' : 'text-slate-600'}`}>{s.attendance}%</td>
                      <td className="px-8 py-5"><RiskIndicator score={s.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CONTROLS SECTION */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                Sync Terminal (OneRoster 1.2)
              </h3>
              <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
              <button 
                onClick={() => fileInputRef.current?.click()} 
                className="w-full p-12 border-2 border-dashed border-slate-200 rounded-[28px] hover:border-indigo-500 hover:bg-indigo-50/30 transition-all flex flex-col items-center group"
              >
                <div className="w-12 h-12 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                  <svg className="w-6 h-6 text-slate-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                </div>
                <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Discrete Upload MB Pull</span>
              </button>
              <button onClick={downloadTemplate} className="w-full mt-4 py-3 bg-slate-50 border border-slate-200 rounded-xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">Download OneRoster Template</button>
            </div>

            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[10px] font-black uppercase tracking-widest mb-6 text-slate-400 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                Risk Sensitivity Weights
              </h3>
              <div className="space-y-6">
                {(Object.entries(weights) as [keyof RiskWeights, number][]).map(([k, v]) => (
                  <div key={k}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-2">
                      <span className="text-slate-500">{k.replace('Weight', '')} Factor</span>
                      <span className="text-indigo-600">{v.toFixed(2)}</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05" value={v} onChange={e => setWeights({ ...weights, [k]: parseFloat(e.target.value) })} className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" />
                  </div>
                ))}
              </div>
              <p className="mt-8 p-4 bg-blue-50 rounded-2xl text-[9px] font-bold text-blue-800 leading-relaxed italic"> Adjust weights to prioritize specific performance markers. Changes are applied instantly to the Registry above.</p>
            </div>
          </div>
        </div>

        {/* ANALYSIS SIDEBAR */}
        {selected && (
          <div className="col-span-12 lg:col-span-4 animate-in">
            <div className="bg-white rounded-[40px] shadow-2xl border border-slate-200 overflow-hidden sticky top-32 z-10 transition-all duration-300">
              <div className="p-8 bg-slate-900 text-white relative">
                <button onClick={() => setSelected(null)} className="absolute top-6 right-6 text-xs hover:text-red-500 bg-slate-800 p-2 rounded-full transition-colors">✕</button>
                <h2 className="text-2xl font-black tracking-tighter leading-none mb-1 pr-10">{selected.name}</h2>
                <p className="text-indigo-400 font-black text-[10px] uppercase tracking-widest">{selected.yearGroup}</p>
                
                <div className="mt-10 flex justify-between border-t border-slate-800 pt-8">
                  <div className="text-center">
                    <p className="text-[8px] uppercase text-slate-500 font-black tracking-widest mb-1">Total Points</p>
                    <p className="text-3xl font-black text-indigo-500 leading-none">{selected.totalPoints}</p>
                  </div>
                  <div className="text-center border-l border-slate-800 pl-10">
                    <p className="text-[8px] uppercase text-slate-500 font-black tracking-widest mb-1">Attendance</p>
                    <p className="text-3xl font-black text-white leading-none">{selected.attendance}%</p>
                  </div>
                </div>
              </div>

              <div className="p-8 space-y-8 max-h-[60vh] overflow-y-auto custom-scrollbar">
                
                {/* AI COMPONENT */}
                <div className="p-1 rounded-[28px] bg-gradient-to-br from-indigo-500 to-indigo-700 shadow-xl overflow-hidden">
                  <div className="bg-white p-6 rounded-[24px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-4 flex items-center justify-between">
                      <span>RE:ASoN AI Synthesis</span>
                      {!aiResult && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>}
                    </h3>
                    
                    {isAnalyzing ? (
                      <div className="py-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Synthesizing Matrix...</p>
                      </div>
                    ) : aiResult ? (
                      <div className="space-y-4">
                        <div className="p-2 bg-indigo-50 rounded-xl text-[10px] font-black text-center text-indigo-700 uppercase tracking-widest border border-indigo-100">
                          Classification: {aiResult.level}
                        </div>
                        <p className="text-xs text-slate-700 italic leading-relaxed">"{aiResult.summary}"</p>
                        <ul className="space-y-2">
                          {aiResult.steps.map((s: string, i: number) => (
                            <li key={i} className="text-[10px] font-bold text-slate-600 flex gap-2">
                              <span className="text-indigo-500 font-black">▶</span> {s}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <button 
                        onClick={runAI}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg active:scale-95"
                      >
                        Generate Risk Analysis
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 border-b pb-2">Academic Core Summary</h3>
                  <div className="grid grid-cols-1 gap-3">
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-slate-500">EE Progress</span>
                      <span className={`text-[10px] font-black ${selected.eeStatus === 'At Risk' ? 'text-red-600' : 'text-slate-800'}`}>{selected.eeStatus}</span>
                    </div>
                    <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-slate-500">TOK Submission</span>
                      <span className="text-[10px] font-black text-slate-800">{selected.tokStatus}</span>
                    </div>
                    <div className="p-4 bg-slate-100/50 rounded-2xl text-[10px] font-medium text-slate-500 leading-relaxed">
                      RAW GRADES: {selected.rawGrades || "No data provided"}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-auto border-t border-slate-100">
        RE:ASoN ANALYTICS v8.0 • DISCRETE SNAPSHOT MODE
      </footer>
    </div>
  );
};

// --- BOOTSTRAP ---
const root = ReactDOM.createRoot(document.getElementById('root')!);
root.render(<App />);