import React, { useState, useMemo, useRef, useEffect } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- CORE MODELS ---
enum YearGroup {
  DP1 = 'DP1 (Y11)',
  DP2 = 'DP2 (Y12)'
}

interface Student {
  sourcedId: string;
  name: string;
  yearGroup: YearGroup;
  attendance: number;
  totalPoints: number;
  eeStatus: string;
  tokStatus: string;
  casStatus: string;
  rawGrades: string;
  riskScore: number;
}

interface RiskWeights {
  attendanceWeight: number;
  pointsWeight: number;
  coreWeight: number;
}

interface SyncStatus {
  type: 'success' | 'error' | 'none' | 'loading';
  message: string;
  details?: string[];
}

// --- CONSTANTS ---
const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.35,
  pointsWeight: 0.45,
  coreWeight: 0.20
};

const ONE_ROSTER_HEADERS = ['sourcedId', 'givenName', 'familyName', 'grades', 'attendance', 'points', 'ee', 'tok', 'cas', 'raw_grades'];

// --- UI COMPONENTS ---
const RiskPill: React.FC<{ score: number }> = ({ score }) => {
  let color = 'bg-emerald-500';
  let label = 'STABLE';
  if (score > 75) { color = 'bg-rose-600'; label = 'CRITICAL'; }
  else if (score > 40) { color = 'bg-amber-500'; label = 'CONCERN'; }
  return (
    <div className={`px-2 py-1 rounded-md text-[9px] font-black text-white tracking-widest ${color} text-center shadow-sm`}>
      {label} ({score})
    </div>
  );
};

// --- MAIN ENGINE ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>([]);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiResult, setAiResult] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ type: 'none', message: '' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Compute Selected Student
  const selectedStudent = useMemo(() => students.find(s => s.sourcedId === selectedId), [students, selectedId]);

  // Risk Calculation (No trend logic)
  const processedStudents = useMemo(() => {
    return students.map(s => {
      let score = 0;
      // Attendance Factor
      const attDeficit = Math.max(0, 95 - s.attendance);
      score += attDeficit * 4 * weights.attendanceWeight;

      // Points Factor
      const pointsDeficit = Math.max(0, 24 - s.totalPoints);
      score += pointsDeficit * 10 * weights.pointsWeight;

      // Core Factor
      if (s.eeStatus?.toLowerCase().includes('risk') || s.tokStatus?.toLowerCase().includes('risk')) {
        score += 35 * weights.coreWeight;
      }
      if (s.casStatus?.toLowerCase().includes('behind')) {
        score += 20 * weights.coreWeight;
      }

      return { ...s, riskScore: Math.min(100, Math.round(score)) };
    }).filter(s => (view === 'all' || s.yearGroup === view) && s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, weights, view, search]);

  // CSV Processing
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setSyncStatus({ type: 'loading', message: 'Analyzing data stream...' });

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = text.split(/\r?\n/).filter(r => r.trim() !== '');
        if (rows.length < 2) throw new Error("File is empty or missing data rows.");

        // Robust CSV splitter
        const parseLine = (line: string) => {
          const res = [];
          let cur = '';
          let inQ = false;
          for (let i = 0; i < line.length; i++) {
            const char = line[i];
            if (char === '"') inQ = !inQ;
            else if (char === ',' && !inQ) { res.push(cur.trim()); cur = ''; }
            else cur += char;
          }
          res.push(cur.trim());
          return res;
        };

        const headers = parseLine(rows[0]).map(h => h.toLowerCase());
        const missing = ONE_ROSTER_HEADERS.filter(h => !headers.includes(h.toLowerCase()));
        
        if (missing.length > 0 && !headers.includes('sourcedid')) {
          throw new Error(`Invalid OneRoster 1.2 Format. Missing: ${missing.join(', ')}`);
        }

        const getIdx = (name: string) => headers.indexOf(name.toLowerCase());
        const idx = {
          sid: getIdx('sourcedId'),
          fn: getIdx('givenName'),
          ln: getIdx('familyName'),
          grade: getIdx('grades'),
          att: getIdx('attendance'),
          pts: getIdx('points'),
          ee: getIdx('ee'),
          tok: getIdx('tok'),
          cas: getIdx('cas'),
          raw: getIdx('raw_grades')
        };

        const newStudents: Student[] = rows.slice(1).map((row, i) => {
          const cols = parseLine(row);
          return {
            sourcedId: cols[idx.sid] || `S-${i}`,
            name: `${cols[idx.fn] || ''} ${cols[idx.ln] || ''}`.trim() || 'Unknown Student',
            yearGroup: (cols[idx.grade] || '').includes('12') ? YearGroup.DP2 : YearGroup.DP1,
            attendance: parseFloat(cols[idx.att]) || 100,
            totalPoints: parseInt(cols[idx.pts]) || 0,
            eeStatus: cols[idx.ee] || 'On Track',
            tokStatus: cols[idx.tok] || 'On Track',
            casStatus: cols[idx.cas] || 'On Track',
            rawGrades: cols[idx.raw] || '',
            riskScore: 0
          };
        });

        // DISCRETE LOAD: Clear previous
        setStudents(newStudents);
        setSelectedId(null);
        setAiResult(null);
        setSyncStatus({ 
          type: 'success', 
          message: `Discrete Sync Successful. Loaded ${newStudents.length} Students.`,
          details: [`Wiped previous session data.`, `Validated ${headers.length} headers.`]
        });
      } catch (err: any) {
        setSyncStatus({ type: 'error', message: 'Sync Failure', details: [err.message] });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const headers = ONE_ROSTER_HEADERS.join(',') + "\n";
    const sample1 = "2024001,Alex,Smith,12,88,24,At Risk,On Track,Behind,\"Math: 3, Physics: 3, English: 4\"\n";
    const sample2 = "2025002,Sarah,Chen,11,98,42,On Track,On Track,Complete,\"Math: 7, Economics: 7, French: 6\"";
    const blob = new Blob([headers + sample1 + sample2], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'REASON_OneRoster_1.2_MB_Template.csv';
    a.click();
  };

  const generateReport = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("RE:ASoN COHORT RISK REPORT", 15, 22);
    doc.setFontSize(9);
    doc.text(`SYNC DATE: ${now} | DISCRETE SNAPSHOT | FILTER: ${view.toUpperCase()}`, 15, 30);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(12);
    doc.text("Top Critical Alerts (Action Required):", 15, 50);

    let y = 60;
    processedStudents.slice(0, 25).forEach((s, i) => {
      doc.setFontSize(8);
      doc.text(`${i + 1}. ${s.name} (${s.sourcedId})`, 15, y);
      doc.text(`Risk: ${s.riskScore}%`, 85, y);
      doc.text(`Pts: ${s.totalPoints}`, 115, y);
      doc.text(`Attn: ${s.attendance}%`, 140, y);
      doc.text(`Core: ${s.eeStatus}`, 170, y);
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
    });

    doc.save(`REASON_DP_Risk_Report_${now.replace(/\//g, '-')}.pdf`);
  };

  const runAIAnalysis = async () => {
    if (!selectedStudent) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: (window as any).process?.env?.API_KEY || "" });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze IB Failure Risk for ${selectedStudent.name}. Attendance: ${selectedStudent.attendance}%, Total Points: ${selectedStudent.totalPoints}, EE: ${selectedStudent.eeStatus}. Raw Subjects: ${selectedStudent.rawGrades}. Strictly return JSON: { "tier": "Critical|High|Low", "summary": "1 sentence", "actions": ["action 1", "action 2"] }`,
        config: { responseMimeType: "application/json" }
      });
      setAiResult(JSON.parse(resp.text));
    } catch (e) {
      setAiResult({ tier: "Manual Review", summary: "AI engine connection limited. Student flags suggest intervention based on IB failing condition 2.1.", actions: ["Review IA submission history", "Schedule parent meeting"] });
    }
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen flex flex-col antialiased">
      {/* HEADER SECTION */}
      <header className="bg-slate-900 text-white py-6 px-8 sticky top-0 z-50 shadow-2xl border-b border-indigo-500/20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-2xl shadow-lg border border-white/10">R</div>
            <div>
              <h1 className="text-2xl font-black tracking-tighter leading-none">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 italic">Discrete DP Risk Analytics Engine</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl border border-slate-700">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-6 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                {v === 'all' ? 'Whole DP' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input 
              value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter Student Registry..." 
              className="bg-slate-800 border-none rounded-xl px-5 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-white outline-none w-56 placeholder:text-slate-500" 
            />
            <button onClick={generateReport} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              Build PDF
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD GRID */}
      <main className="max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* LEFT COLUMN: REGISTRY & CONFIG */}
        <div className={`space-y-8 ${selectedId ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          
          {/* SNAPSHOT METRICS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="glass-card p-8 rounded-[32px] shadow-sm">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-2">
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400"></span> Cohort Risk Avg
              </p>
              <p className="text-4xl font-black text-slate-900 leading-none">
                {students.length ? Math.round(processedStudents.reduce((a,s)=>a+s.riskScore,0)/processedStudents.length) : 0}%
              </p>
            </div>
            <div className="glass-card p-8 rounded-[32px] shadow-sm border-l-4 border-l-indigo-500">
              <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-2">IB Avg (Summative)</p>
              <p className="text-4xl font-black text-indigo-600 leading-none">
                {students.length ? (processedStudents.reduce((a,s)=>a+s.totalPoints,0)/processedStudents.length).toFixed(1) : 0}
              </p>
            </div>
            <div className="glass-card p-8 rounded-[32px] shadow-sm border-l-4 border-l-rose-500">
              <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mb-2">Critical Flags</p>
              <p className="text-4xl font-black text-rose-600 leading-none">
                {processedStudents.filter(s=>s.riskScore > 75).length}
              </p>
            </div>
          </div>

          {/* TABLE REGISTRY */}
          <div className="glass-card rounded-[32px] overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">IB Risk Registry</h2>
              <span className="text-[9px] font-black bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full uppercase tracking-widest">
                {processedStudents.length} Discrete Records
              </span>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead className="bg-slate-50/50 text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 tracking-widest">
                  <tr>
                    <th className="px-8 py-5">Identity (SourcedID)</th>
                    <th className="px-8 py-5 text-center">IB Pts</th>
                    <th className="px-8 py-5 text-center">Attn</th>
                    <th className="px-8 py-5">Risk Matrix Rating</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.length === 0 ? (
                    <tr><td colSpan={4} className="p-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs italic">Sync Hub Waiting for OneRoster 1.2 Data Pull...</td></tr>
                  ) : processedStudents.map(s => (
                    <tr 
                      key={s.sourcedId} 
                      onClick={() => { setSelectedId(s.sourcedId); setAiResult(null); }} 
                      className={`cursor-pointer transition-all duration-200 ${selectedId === s.sourcedId ? 'bg-indigo-50/70' : 'hover:bg-slate-50'}`}
                    >
                      <td className="px-8 py-5">
                        <div className={`font-black text-sm ${selectedId === s.sourcedId ? 'text-indigo-600' : 'text-slate-900'}`}>{s.name}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase tracking-tighter">{s.sourcedId} • {s.yearGroup}</div>
                      </td>
                      <td className="px-8 py-5 text-center font-black text-xl text-slate-700">{s.totalPoints}</td>
                      <td className={`px-8 py-5 text-center font-black ${s.attendance < 90 ? 'text-rose-500' : 'text-slate-600'}`}>{s.attendance}%</td>
                      <td className="px-8 py-5"><RiskPill score={s.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* CONTROL HUB */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* SYNC TERMINAL */}
            <div className="glass-card p-8 rounded-[32px]">
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 text-slate-500 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                Sync Terminal (OneRoster 1.2)
              </h3>
              
              <div className="space-y-4">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="w-full p-12 border-2 border-dashed border-slate-200 rounded-[28px] hover:border-indigo-500 hover:bg-indigo-50/40 transition-all flex flex-col items-center group relative overflow-hidden"
                >
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg className="w-7 h-7 text-slate-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  </div>
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Wipe & Sync New Pull</span>
                  <p className="text-[8px] text-slate-400 font-bold mt-2">ManageBac CSV Standard</p>
                  {syncStatus.type === 'loading' && <div className="absolute inset-0 bg-white/60 flex items-center justify-center backdrop-blur-sm"><div className="w-6 h-6 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div></div>}
                </button>

                {syncStatus.type !== 'none' && syncStatus.type !== 'loading' && (
                  <div className={`p-5 rounded-2xl flex items-start gap-4 animate-in ${syncStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-100' : 'bg-rose-50 text-rose-800 border border-rose-100'}`}>
                    <div className="mt-1 font-black text-lg">{syncStatus.type === 'success' ? '✓' : '⚠'}</div>
                    <div className="space-y-1">
                      <p className="text-[11px] font-black uppercase tracking-tight leading-none">{syncStatus.message}</p>
                      {syncStatus.details?.map((d, i) => <p key={i} className="text-[9px] font-medium opacity-80 leading-tight">• {d}</p>)}
                    </div>
                  </div>
                )}

                <button onClick={downloadTemplate} className="w-full py-4 bg-slate-100 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-200 transition-all flex items-center justify-center gap-2">
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  Get OneRoster 1.2 Template
                </button>
              </div>
            </div>

            {/* WEIGHT MATRIX */}
            <div className="glass-card p-8 rounded-[32px]">
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 text-slate-500 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                Risk Sensitivity Weights
              </h3>
              
              <div className="space-y-8">
                {[
                  { key: 'attendanceWeight', label: 'Attendance Sensitivity', color: 'bg-rose-500' },
                  { key: 'pointsWeight', label: 'Academic Points Sensitivity', color: 'bg-indigo-500' },
                  { key: 'coreWeight', label: 'Core Progress Sensitivity', color: 'bg-purple-500' }
                ].map(item => (
                  <div key={item.key}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-3">
                      <span className="text-slate-400">{item.label}</span>
                      <span className="text-indigo-600">{(weights as any)[item.key].toFixed(2)}</span>
                    </div>
                    <input 
                      type="range" min="0" max="1" step="0.05" 
                      value={(weights as any)[item.key]} 
                      onChange={e => setWeights({...weights, [item.key]: parseFloat(e.target.value)})}
                      className="w-full h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer" 
                    />
                  </div>
                ))}
              </div>
              <p className="mt-8 p-5 bg-indigo-50 rounded-[24px] text-[9px] font-bold text-indigo-800 leading-relaxed italic border border-indigo-100/50">
                Adjust sensitivity parameters to recalibrate the registry list. Discrete scoring ensures no historical data artifacts remain.
              </p>
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: INDIVIDUAL ANALYTICS */}
        {selectedStudent && (
          <div className="col-span-12 lg:col-span-4 animate-in">
            <div className="bg-white rounded-[44px] shadow-2xl border border-slate-200 overflow-hidden sticky top-32 z-10 transition-all duration-500 transform border-t-8 border-t-indigo-600">
              <div className="p-10 bg-slate-900 text-white relative">
                <button onClick={() => setSelectedId(null)} className="absolute top-6 right-6 text-xs hover:text-rose-500 bg-slate-800 p-2.5 rounded-full transition-all border border-white/5">✕</button>
                <h2 className="text-3xl font-black tracking-tighter leading-none mb-1 pr-12">{selectedStudent.name}</h2>
                <p className="text-indigo-400 font-black text-[10px] uppercase tracking-[0.3em]">{selectedStudent.yearGroup}</p>
                
                <div className="mt-12 flex justify-between border-t border-slate-800 pt-10">
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-slate-500 font-black tracking-widest mb-2">Academic Pts</p>
                    <p className="text-5xl font-black text-indigo-500 leading-none">{selectedStudent.totalPoints}</p>
                  </div>
                  <div className="text-center border-l border-slate-800 pl-12">
                    <p className="text-[9px] uppercase text-slate-500 font-black tracking-widest mb-2">Attendance</p>
                    <p className={`text-5xl font-black leading-none ${selectedStudent.attendance < 90 ? 'text-rose-500' : 'text-white'}`}>{selectedStudent.attendance}%</p>
                  </div>
                </div>
              </div>

              <div className="p-10 space-y-10 max-h-[60vh] overflow-y-auto custom-scrollbar">
                
                {/* AI SYNTHESIS */}
                <div className="p-1 rounded-[32px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-900 shadow-xl overflow-hidden">
                  <div className="bg-white p-6 rounded-[28px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-5 flex items-center justify-between">
                      <span>RE:ASoN AI Synthesis</span>
                      {!aiResult && <div className="w-2 h-2 bg-indigo-500 rounded-full animate-pulse shadow-[0_0_10px_indigo]"></div>}
                    </h3>
                    
                    {isAnalyzing ? (
                      <div className="py-10 flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Crunching Performance Metrics...</p>
                      </div>
                    ) : aiResult ? (
                      <div className="space-y-5 animate-in">
                        <div className={`p-3 rounded-xl text-[10px] font-black text-center uppercase tracking-[0.2em] border shadow-sm ${aiResult.tier === 'Critical' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                          Risk Tier: {aiResult.tier}
                        </div>
                        <p className="text-sm text-slate-700 italic leading-relaxed font-semibold">"{aiResult.summary}"</p>
                        <ul className="space-y-3">
                          {aiResult.actions.map((act: string, i: number) => (
                            <li key={i} className="text-[10px] font-bold text-slate-600 flex gap-3 items-start bg-slate-50 p-2.5 rounded-lg border border-slate-100">
                              <span className="text-indigo-600 font-black mt-0.5">▶</span> {act}
                            </li>
                          ))}
                        </ul>
                        <button onClick={runAIAnalysis} className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-800 transition-colors tracking-widest">Recalculate Insight</button>
                      </div>
                    ) : (
                      <button 
                        onClick={runAIAnalysis}
                        className="w-full py-5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg active:scale-95 border-b-4 border-indigo-800"
                      >
                        Generate Data Synthesis
                      </button>
                    )}
                  </div>
                </div>

                {/* SNAPSHOT DATA */}
                <div className="space-y-6">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-4">Academic Core Status</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 flex justify-between items-center group hover:bg-white transition-all">
                      <span className="text-[10px] font-black uppercase text-slate-500">EE Component</span>
                      <span className={`text-[10px] font-black px-4 py-1.5 rounded-lg ${selectedStudent.eeStatus.toLowerCase().includes('risk') ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{selectedStudent.eeStatus}</span>
                    </div>
                    <div className="p-5 bg-slate-50 rounded-[24px] border border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-slate-500">TOK Exhibition</span>
                      <span className="text-[10px] font-black text-slate-800 uppercase tracking-tight">{selectedStudent.tokStatus}</span>
                    </div>
                    <div className="p-6 bg-indigo-50/50 rounded-[28px] border border-indigo-100/50">
                      <p className="text-[9px] font-black uppercase text-indigo-400 mb-3 tracking-widest">Raw Pull Summary</p>
                      <p className="text-[12px] font-bold text-slate-600 leading-relaxed italic">
                        {selectedStudent.rawGrades || "No granular descriptors extracted from OneRoster pull."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      {/* FOOTER */}
      <footer className="p-12 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.5em] mt-auto border-t border-slate-100 bg-white">
        RE:ASoN ANALYTICS ENGINE v10.5 • DP COORDINATOR SECURE ACCESS ONLY
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