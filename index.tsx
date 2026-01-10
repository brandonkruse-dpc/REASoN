import React, { useState, useMemo, useRef } from 'react';
import ReactDOM from 'react-dom/client';
import { GoogleGenAI, Type } from "@google/genai";

// --- TYPES & INTERFACES ---
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
  riskScore: number;
  rawGrades: string;
}

interface RiskWeights {
  attendanceWeight: number;
  pointsWeight: number;
  coreWeight: number;
}

interface SyncStatus {
  type: 'success' | 'error' | 'none';
  message: string;
}

// --- CONSTANTS ---
const DEFAULT_WEIGHTS: RiskWeights = {
  attendanceWeight: 0.4,
  pointsWeight: 0.4,
  coreWeight: 0.2
};

const INITIAL_STATE: Student[] = [];

// --- UTILS ---
const parseCSV = (text: string): string[][] => {
  const lines = text.split(/\r?\n/).filter(line => line.trim() !== '');
  return lines.map(line => {
    const result = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') inQuotes = !inQuotes;
      else if (char === ',' && !inQuotes) {
        result.push(cur.trim());
        cur = '';
      } else cur += char;
    }
    result.push(cur.trim());
    return result;
  });
};

// --- COMPONENTS ---
const RiskIndicator: React.FC<{ score: number }> = ({ score }) => {
  let color = 'bg-emerald-500';
  let label = 'STABLE';
  if (score > 75) { color = 'bg-rose-600'; label = 'CRITICAL'; }
  else if (score > 40) { color = 'bg-amber-500'; label = 'CONCERN'; }
  return (
    <div className={`px-2.5 py-1 rounded-full text-[9px] font-black text-white tracking-widest ${color}`}>
      {label} ({score})
    </div>
  );
};

// --- MAIN APP ---
const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(INITIAL_STATE);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [search, setSearch] = useState('');
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [selected, setSelected] = useState<Student | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<any>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>({ type: 'none', message: '' });
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Risk Calculation Logic (Discrete - No Trend)
  const processedStudents = useMemo(() => {
    return students.map(s => {
      let score = 0;
      // Attendance: Penalty starts below 95%
      const attDeficit = Math.max(0, 95 - s.attendance);
      score += attDeficit * 5 * weights.attendanceWeight;

      // Points: Penalty starts below 24
      const pointsDeficit = Math.max(0, 24 - s.totalPoints);
      score += pointsDeficit * 12 * weights.pointsWeight;

      // Core: Weighted penalties
      if (s.eeStatus === 'At Risk' || s.tokStatus === 'At Risk') score += 40 * weights.coreWeight;
      if (s.casStatus === 'Behind') score += 25 * weights.coreWeight;

      return { ...s, riskScore: Math.min(100, Math.round(score)) };
    }).filter(s => (view === 'all' || s.yearGroup === view) && s.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [students, weights, view, search]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const text = event.target?.result as string;
        const rows = parseCSV(text);
        if (rows.length < 2) throw new Error("File appears empty or missing headers.");

        const headers = rows[0].map(h => h.toLowerCase());
        const findIdx = (names: string[]) => headers.findIndex(h => names.includes(h));

        // OneRoster 1.2 Standard Headers Mapping
        const idx = {
          sourcedId: findIdx(['sourcedid', 'identifier', 'id']),
          first: findIdx(['givenname', 'firstname', 'first name']),
          last: findIdx(['familyname', 'lastname', 'last name']),
          grades: findIdx(['grades', 'grade', 'yeargroup']),
          attn: findIdx(['attendance', 'attendance_percentage', 'attn']),
          points: findIdx(['points', 'ib_points', 'total_points', 'academic_points']),
          ee: findIdx(['ee', 'extended_essay', 'ee_status']),
          tok: findIdx(['tok', 'theory_of_knowledge', 'tok_status']),
          cas: findIdx(['cas', 'cas_status']),
          raw: findIdx(['raw_grades', 'grades_summary', 'academic_report'])
        };

        if (idx.sourcedId === -1 || (idx.first === -1 && idx.last === -1)) {
          throw new Error("OneRoster 1.2 format not detected. Headers: sourcedId, givenName, familyName required.");
        }

        const newStudents: Student[] = rows.slice(1).map((cols, i) => {
          const first = cols[idx.first] || '';
          const last = cols[idx.last] || '';
          return {
            sourcedId: cols[idx.sourcedId] || `GEN-${i}`,
            name: `${first} ${last}`.trim() || 'Unnamed Student',
            yearGroup: (cols[idx.grades] || '').includes('12') ? YearGroup.DP2 : YearGroup.DP1,
            attendance: parseFloat(cols[idx.attn]) || 100,
            totalPoints: parseInt(cols[idx.points]) || 0,
            eeStatus: cols[idx.ee] || 'On Track',
            tokStatus: cols[idx.tok] || 'On Track',
            casStatus: cols[idx.cas] || 'On Track',
            riskScore: 0,
            rawGrades: cols[idx.raw] || ''
          };
        });

        // DISCRETE UPDATE: Wipe previous data
        setStudents(newStudents);
        setSelected(null);
        setAiAnalysis(null);
        setSyncStatus({ type: 'success', message: `Sync Complete: ${newStudents.length} Students Loaded from OneRoster 1.2 pull.` });
      } catch (err: any) {
        setSyncStatus({ type: 'error', message: err.message || "Failed to process CSV file." });
      }
    };
    reader.readAsText(file);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const downloadTemplate = () => {
    const headers = "sourcedId,givenName,familyName,grades,attendance,points,ee,tok,cas,raw_grades\n";
    const samples = "2024001,Alex,Smith,12,88,24,At Risk,On Track,Behind,\"Math: 3, Physics: 4\"\n2025002,Sarah,Chen,11,96,38,On Track,On Track,Complete,\"Math: 7, Econ: 7\"";
    const blob = new Blob([headers + samples], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'REASON_OneRoster_1.2_Template.csv';
    a.click();
  };

  const generatePDFReport = () => {
    const { jsPDF } = (window as any).jspdf;
    const doc = new jsPDF();
    const now = new Date().toLocaleDateString();

    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, 210, 35, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(22);
    doc.text("RE:ASoN - WEEKLY COHORT STATUS", 15, 22);
    doc.setFontSize(10);
    doc.text(`DATE: ${now} | VIEW: ${view.toUpperCase()}`, 15, 30);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(14);
    doc.text("CRITICAL RISK PRIORITY LIST", 15, 50);
    
    let y = 60;
    processedStudents.slice(0, 20).forEach((s, i) => {
      doc.setFontSize(9);
      doc.text(`${i + 1}. ${s.name} (${s.sourcedId})`, 15, y);
      doc.text(`Risk: ${s.riskScore}%`, 80, y);
      doc.text(`Pts: ${s.totalPoints}`, 110, y);
      doc.text(`Attn: ${s.attendance}%`, 140, y);
      doc.text(`Core: ${s.eeStatus}`, 170, y);
      y += 8;
      if (y > 280) { doc.addPage(); y = 20; }
    });

    doc.save(`REASON_DP_Report_${now.replace(/\//g, '-')}.pdf`);
  };

  const runGeminiAnalysis = async () => {
    if (!selected) return;
    setIsAnalyzing(true);
    const ai = new GoogleGenAI({ apiKey: (window as any).process?.env?.API_KEY || "" });
    try {
      const resp = await ai.models.generateContent({
        model: "gemini-3-flash-preview",
        contents: `Analyze failure risk for IB DP Student: ${selected.name}. Attendance: ${selected.attendance}%, Points: ${selected.totalPoints}, Core: EE(${selected.eeStatus}) TOK(${selected.tokStatus}) CAS(${selected.casStatus}). Raw Data: ${selected.rawGrades}. Provide a JSON response: { "level": "Critical|Concern|Stable", "insight": "2 sentences", "actions": ["step 1", "step 2"] }`,
        config: { responseMimeType: "application/json" }
      });
      setAiAnalysis(JSON.parse(resp.text));
    } catch (e) {
      setAiAnalysis({ level: "Review Required", insight: "AI connection unstable. Manual intervention recommended based on performance flags.", actions: ["Review IA status", "Schedule Parent Meeting"] });
    }
    setIsAnalyzing(false);
  };

  return (
    <div className="min-h-screen flex flex-col antialiased">
      {/* HEADER NAVIGATION */}
      <header className="bg-slate-900 text-white p-5 sticky top-0 z-50 shadow-2xl border-b border-indigo-500/20">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="w-11 h-11 bg-indigo-600 rounded-xl flex items-center justify-center font-black text-xl shadow-lg border border-white/10">R</div>
            <div>
              <h1 className="text-xl font-black tracking-tighter leading-none">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 font-bold uppercase tracking-[0.2em] mt-1 italic">Discrete DP Risk Engine</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1.5 rounded-2xl border border-slate-700">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${view === v ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:text-white'}`}>
                {v === 'all' ? 'Whole DP' : v === YearGroup.DP1 ? 'DP1 (Y11)' : 'DP2 (Y12)'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <div className="relative">
              <input 
                value={search} onChange={e => setSearch(e.target.value)} placeholder="Filter ID/Name..." 
                className="bg-slate-800 border-none rounded-xl px-5 py-3 text-sm focus:ring-2 focus:ring-indigo-500 text-white outline-none w-52 placeholder:text-slate-500" 
              />
            </div>
            <button onClick={generatePDFReport} className="bg-emerald-600 hover:bg-emerald-700 px-6 py-3 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-lg active:scale-95 flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
              Report PDF
            </button>
          </div>
        </div>
      </header>

      {/* DASHBOARD CONTENT */}
      <main className="max-w-7xl mx-auto w-full p-6 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-10">
        
        {/* LEFT COLUMN - MAIN INTERFACE */}
        <div className={`space-y-8 ${selected ? 'hidden lg:block lg:col-span-8' : 'col-span-12'}`}>
          
          {/* SNAPSHOT STATS */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2">Cohort Risk Index</p>
              <p className="text-4xl font-black text-slate-900 leading-none">
                {students.length ? Math.round(processedStudents.reduce((a,s)=>a+s.riskScore,0)/processedStudents.length) : 0}%
              </p>
            </div>
            <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200">
              <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest mb-2">Avg Points</p>
              <p className="text-4xl font-black text-indigo-600 leading-none">
                {students.length ? (processedStudents.reduce((a,s)=>a+s.totalPoints,0)/processedStudents.length).toFixed(1) : 0}
              </p>
            </div>
            <div className="bg-white p-7 rounded-[32px] shadow-sm border border-slate-200 border-l-4 border-l-rose-500">
              <p className="text-[10px] text-rose-500 font-black uppercase tracking-widest mb-2">Critical Alerts</p>
              <p className="text-4xl font-black text-rose-600 leading-none">{processedStudents.filter(s=>s.riskScore > 75).length}</p>
            </div>
          </div>

          {/* MAIN REGISTRY TABLE */}
          <div className="bg-white rounded-[32px] shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-8 py-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <h2 className="font-black text-slate-800 uppercase tracking-tighter text-lg">Current Risk Registry</h2>
              <span className="text-[10px] font-black bg-indigo-100 text-indigo-700 px-4 py-1.5 rounded-full uppercase tracking-widest">{processedStudents.length} Records In Sync</span>
            </div>
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left">
                <thead>
                  <tr className="text-[9px] font-black uppercase text-slate-400 border-b border-slate-100 tracking-widest">
                    <th className="px-8 py-5">Identity (OneRoster)</th>
                    <th className="px-8 py-5 text-center">IB Points</th>
                    <th className="px-8 py-5 text-center">Attn</th>
                    <th className="px-8 py-5">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {students.length === 0 ? (
                    <tr><td colSpan={4} className="p-20 text-center text-slate-400 font-black uppercase tracking-widest text-xs italic">Sync Terminal Waiting for CSV Data...</td></tr>
                  ) : processedStudents.map(s => (
                    <tr key={s.sourcedId} onClick={() => { setSelected(s); setAiAnalysis(null); }} className={`cursor-pointer transition-all ${selected?.sourcedId === s.sourcedId ? 'bg-indigo-50/70 shadow-inner' : 'hover:bg-slate-50'}`}>
                      <td className="px-8 py-5">
                        <div className={`font-black text-sm ${selected?.sourcedId === s.sourcedId ? 'text-indigo-600' : 'text-slate-900'}`}>{s.name}</div>
                        <div className="text-[9px] text-slate-400 font-bold uppercase">{s.sourcedId} • {s.yearGroup}</div>
                      </td>
                      <td className="px-8 py-5 text-center font-black text-lg text-slate-700">{s.totalPoints}</td>
                      <td className={`px-8 py-5 text-center font-black ${s.attendance < 90 ? 'text-rose-500' : 'text-slate-600'}`}>{s.attendance}%</td>
                      <td className="px-8 py-5"><RiskIndicator score={s.riskScore} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* DUAL CONTROL HUB */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            {/* SYNC HUB */}
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 text-slate-500 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                Sync Terminal (OneRoster 1.2)
              </h3>
              
              <div className="space-y-4">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="w-full p-12 border-2 border-dashed border-slate-200 rounded-[28px] hover:border-indigo-500 hover:bg-indigo-50/40 transition-all flex flex-col items-center group"
                >
                  <div className="w-14 h-14 bg-slate-50 rounded-full flex items-center justify-center mb-4 group-hover:scale-110 transition-transform">
                    <svg className="w-7 h-7 text-slate-400 group-hover:text-indigo-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                  </div>
                  <span className="text-[10px] font-black text-slate-700 uppercase tracking-widest">Wipe & Load MB CSV</span>
                </button>

                {syncStatus.type !== 'none' && (
                  <div className={`p-4 rounded-2xl flex items-start gap-3 animate-in ${syncStatus.type === 'success' ? 'bg-emerald-50 text-emerald-800' : 'bg-rose-50 text-rose-800'}`}>
                    <div className="mt-0.5">
                      {syncStatus.type === 'success' ? '✓' : '⚠'}
                    </div>
                    <p className="text-[10px] font-bold leading-relaxed">{syncStatus.message}</p>
                  </div>
                )}

                <button onClick={downloadTemplate} className="w-full py-4 bg-slate-50 border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">Download OneRoster Template</button>
              </div>
            </div>

            {/* WEIGHTINGS PANEL */}
            <div className="bg-white p-8 rounded-[32px] shadow-sm border border-slate-200">
              <h3 className="text-[11px] font-black uppercase tracking-widest mb-6 text-slate-500 flex items-center gap-2">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path></svg>
                Risk Matrix Sensitivities
              </h3>
              
              <div className="space-y-7">
                {[
                  { key: 'attendanceWeight', label: 'Attendance Factor', color: 'bg-rose-500' },
                  { key: 'pointsWeight', label: 'Academic Points Factor', color: 'bg-indigo-500' },
                  { key: 'coreWeight', label: 'Core Progress Factor', color: 'bg-purple-500' }
                ].map(item => (
                  <div key={item.key}>
                    <div className="flex justify-between text-[10px] font-black uppercase mb-2.5">
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
              <p className="mt-8 p-5 bg-indigo-50 rounded-[20px] text-[9px] font-bold text-indigo-800 leading-relaxed italic border border-indigo-100">
                Discrete Weighting Engine: No historical data is preserved. Scores are calculated purely on the current sync pull.
              </p>
            </div>
          </div>
        </div>

        {/* SIDEBAR ANALYTICS - SELECTED STUDENT */}
        {selected && (
          <div className="col-span-12 lg:col-span-4 animate-in">
            <div className="bg-white rounded-[44px] shadow-2xl border border-slate-200 overflow-hidden sticky top-32 z-10 transition-all duration-300">
              <div className="p-9 bg-slate-900 text-white relative">
                <button onClick={() => setSelected(null)} className="absolute top-6 right-6 text-xs hover:text-rose-500 bg-slate-800 p-2.5 rounded-full transition-all">✕</button>
                <h2 className="text-2xl font-black tracking-tighter leading-none mb-1 pr-10">{selected.name}</h2>
                <p className="text-indigo-400 font-black text-[10px] uppercase tracking-widest">{selected.yearGroup}</p>
                
                <div className="mt-12 flex justify-between border-t border-slate-800 pt-8">
                  <div className="text-center">
                    <p className="text-[9px] uppercase text-slate-500 font-black tracking-widest mb-1.5">Total Points</p>
                    <p className="text-4xl font-black text-indigo-500 leading-none">{selected.totalPoints}</p>
                  </div>
                  <div className="text-center border-l border-slate-800 pl-10">
                    <p className="text-[9px] uppercase text-slate-500 font-black tracking-widest mb-1.5">Attendance</p>
                    <p className={`text-4xl font-black leading-none ${selected.attendance < 90 ? 'text-rose-500' : 'text-white'}`}>{selected.attendance}%</p>
                  </div>
                </div>
              </div>

              <div className="p-9 space-y-9 max-h-[60vh] overflow-y-auto custom-scrollbar">
                
                {/* GEMINI INSIGHT MODULE */}
                <div className="p-1 rounded-[32px] bg-gradient-to-br from-indigo-500 via-indigo-600 to-indigo-800 shadow-xl overflow-hidden">
                  <div className="bg-white p-6 rounded-[28px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-5 flex items-center justify-between">
                      <span>RE:ASoN AI Synthesis</span>
                      {!aiAnalysis && <div className="w-1.5 h-1.5 bg-indigo-500 rounded-full animate-pulse"></div>}
                    </h3>
                    
                    {isAnalyzing ? (
                      <div className="py-8 flex flex-col items-center gap-4">
                        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Analyzing Failure Risk...</p>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-5">
                        <div className={`p-2.5 rounded-xl text-[10px] font-black text-center uppercase tracking-widest border ${aiAnalysis.level === 'Critical' ? 'bg-rose-50 text-rose-700 border-rose-100' : 'bg-indigo-50 text-indigo-700 border-indigo-100'}`}>
                          Risk Tier: {aiAnalysis.level}
                        </div>
                        <p className="text-xs text-slate-700 italic leading-relaxed font-medium">"{aiAnalysis.insight}"</p>
                        <ul className="space-y-2.5">
                          {aiAnalysis.actions.map((act: string, i: number) => (
                            <li key={i} className="text-[10px] font-bold text-slate-600 flex gap-2.5">
                              <span className="text-indigo-600 font-black">▶</span> {act}
                            </li>
                          ))}
                        </ul>
                        <button onClick={runGeminiAnalysis} className="text-[9px] font-black uppercase text-indigo-500 hover:text-indigo-800 transition-colors">Regenerate Analysis</button>
                      </div>
                    ) : (
                      <button 
                        onClick={runGeminiAnalysis}
                        className="w-full py-4.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-lg active:scale-95"
                      >
                        Synthesize DP Data
                      </button>
                    )}
                  </div>
                </div>

                {/* ACADEMIC CORE SECTION */}
                <div className="space-y-5">
                  <h3 className="text-[10px] font-black text-slate-400 uppercase tracking-widest border-b pb-3">Academic Snapshot</h3>
                  <div className="grid grid-cols-1 gap-4">
                    <div className="p-4.5 bg-slate-50 rounded-[20px] border border-slate-100 flex justify-between items-center group">
                      <span className="text-[10px] font-black uppercase text-slate-500">EE Progress</span>
                      <span className={`text-[10px] font-black px-3 py-1 rounded-lg ${selected.eeStatus === 'At Risk' ? 'bg-rose-100 text-rose-700' : 'bg-emerald-100 text-emerald-700'}`}>{selected.eeStatus}</span>
                    </div>
                    <div className="p-4.5 bg-slate-50 rounded-[20px] border border-slate-100 flex justify-between items-center">
                      <span className="text-[10px] font-black uppercase text-slate-500">TOK Status</span>
                      <span className="text-[10px] font-black text-slate-700">{selected.tokStatus}</span>
                    </div>
                    <div className="p-4.5 bg-indigo-50/50 rounded-[20px] border border-indigo-100/50">
                      <p className="text-[8px] font-black uppercase text-indigo-400 mb-2 tracking-widest">Grades Overview</p>
                      <p className="text-[11px] font-bold text-slate-600 leading-relaxed italic">
                        {selected.rawGrades || "No granular subject data extracted from MB Pull."}
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>

      <footer className="p-10 text-center text-[10px] font-black text-slate-400 uppercase tracking-[0.4em] mt-auto border-t border-slate-100">
        RE:ASoN ANALYTICS v9.0 • DP COORDINATOR TERMINAL
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