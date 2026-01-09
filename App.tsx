
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { Student, YearGroup, RiskWeights, RiskAnalysis } from './types.ts';
import { MOCK_STUDENTS, DEFAULT_WEIGHTS } from './constants.ts';
import { calculateRiskScore, parseManageBacCSV, calculateTotalPoints } from './services/dataService.ts';
import { generateWeeklyPDF } from './services/reportService.ts';
import { analyzeStudentRisk } from './services/geminiService.ts';
import RiskBadge from './components/RiskBadge.tsx';
import StudentTrendChart from './components/StudentTrendChart.tsx';
import SettingsPanel from './components/SettingsPanel.tsx';

const App: React.FC = () => {
  const [students, setStudents] = useState<Student[]>(MOCK_STUDENTS);
  const [weights, setWeights] = useState<RiskWeights>(DEFAULT_WEIGHTS);
  const [view, setView] = useState<'all' | YearGroup>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [coordinatorEmail, setCoordinatorEmail] = useState('dp.coordinator@school.edu');
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiAnalysis, setAiAnalysis] = useState<RiskAnalysis | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedStudent(null);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    setStudents(prev => prev.map(s => ({
      ...s,
      riskScore: calculateRiskScore(s, weights),
      totalPoints: calculateTotalPoints(s) 
    })));
  }, [weights]);

  // Clear AI analysis when student changes
  useEffect(() => {
    setAiAnalysis(null);
  }, [selectedStudent?.id]);

  const cohortStudents = useMemo(() => {
    return students.filter(s => view === 'all' || s.yearGroup === view);
  }, [students, view]);

  const filteredStudents = useMemo(() => {
    return cohortStudents
      .filter(s => s.name.toLowerCase().includes(searchQuery.toLowerCase()) || String(s.id).includes(searchQuery))
      .sort((a, b) => b.riskScore - a.riskScore);
  }, [cohortStudents, searchQuery]);

  const handleRunAnalysis = async () => {
    if (!selectedStudent) return;
    setIsAnalyzing(true);
    try {
      const result = await analyzeStudentRisk(selectedStudent);
      setAiAnalysis(result);
    } catch (error) {
      console.error("AI Analysis failed", error);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleDownloadReport = async () => {
    setIsGeneratingReport(true);
    try {
      await generateWeeklyPDF(students);
    } catch (error) {
      console.error("PDF Generation failed", error);
      alert("Failed to generate PDF report.");
    } finally {
      setIsGeneratingReport(false);
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (e) => {
      const text = e.target?.result as string;
      const parsedStudents = await parseManageBacCSV(text);
      if (parsedStudents.length === 0) { 
        alert("No valid data found. Ensure CSV follows the 'id,name,yearGroup...' format."); 
        return; 
      }
      setStudents(prev => {
        const merged = [...prev];
        parsedStudents.forEach(newS => {
          const index = merged.findIndex(s => String(s.id) === String(newS.id));
          const withStats = { 
            ...newS, 
            riskScore: calculateRiskScore(newS, weights), 
            totalPoints: calculateTotalPoints(newS) 
          };
          if (index !== -1) {
            merged[index] = { 
              ...withStats, 
              historicalRiskScores: [...merged[index].historicalRiskScores, { date: new Date().toISOString().split('T')[0], score: withStats.riskScore }].slice(-10) 
            };
          } else { 
            merged.push(withStats); 
          }
        });
        return merged;
      });
      if (fileInputRef.current) fileInputRef.current.value = '';
      alert(`Sync Complete: Processed ${parsedStudents.length} student records.`);
    };
    reader.readAsText(file);
  };

  const downloadTemplate = () => {
    const headers = "id,name,yearGroup,attendance,lessonsMissed,grades,core";
    const sampleGrades = JSON.stringify([{ subject: "Math AA", level: "HL", currentMark: 3, trend: "down", assignments: [{ name: "IA Draft", score: 5, maxScore: 20, type: "IA", status: "Missing" }] }]).replace(/"/g, '""');
    const sampleCore = JSON.stringify({ ee: "At Risk", tok: "In Progress", cas: "Behind", points: 1 }).replace(/"/g, '""');
    const row = `\n2025101,Sample Student,DP1,92,24,"${sampleGrades}","${sampleCore}"`;
    const blob = new Blob([headers + row], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'REASON_Data_Template.csv';
    a.click();
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50">
      <header className="bg-slate-900 text-white p-4 sticky top-0 z-50 shadow-xl border-b border-blue-900/40">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-gradient-to-br from-blue-500 to-indigo-700 rounded-lg flex items-center justify-center font-bold text-xl shadow-inner border border-white/10">R</div>
            <div>
              <h1 className="text-xl font-black tracking-tighter">RE:ASoN</h1>
              <p className="text-[9px] text-slate-400 uppercase tracking-widest font-bold">Assessing Students of Note</p>
            </div>
          </div>

          <div className="flex bg-slate-800 p-1 rounded-xl shadow-inner border border-slate-700">
            {(['all', YearGroup.DP1, YearGroup.DP2] as const).map(v => (
              <button key={v} onClick={() => setView(v)} className={`px-5 py-1.5 rounded-lg text-xs transition-all font-black uppercase tracking-widest ${view === v ? 'bg-blue-600 text-white shadow-lg' : 'text-slate-400 hover:text-white'}`}>
                {v === 'all' ? 'Whole DP' : v === YearGroup.DP1 ? 'DP1' : 'DP2'}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <input 
              type="text"
              placeholder="Filter by Name/ID..."
              className="bg-slate-800 border border-slate-700 rounded-xl px-4 py-2 text-sm focus:ring-2 focus:ring-blue-500 w-48 transition-all outline-none placeholder:text-slate-500"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
            <button 
              disabled={isGeneratingReport}
              onClick={handleDownloadReport} 
              className={`bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all flex items-center gap-2`}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"></path></svg>
              {isGeneratingReport ? 'Building PDF...' : 'Download Report'}
            </button>
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full p-4 lg:p-6 grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className={`${selectedStudent ? 'hidden lg:block lg:col-span-8' : 'col-span-12 lg:col-span-8'} space-y-6`}>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-slate-400"></div>
                {view === 'all' ? 'Cohort' : view === YearGroup.DP1 ? 'DP1' : 'DP2'} Avg Risk
              </p>
              <p className="text-4xl font-black text-slate-900 leading-none">
                {cohortStudents.length ? Math.round(cohortStudents.reduce((a, s) => a + s.riskScore, 0) / cohortStudents.length) : 0}
              </p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow">
              <p className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div>
                Summative Pts Avg (Pure)
              </p>
              <p className="text-4xl font-black text-indigo-600 leading-none">
                {cohortStudents.length ? (cohortStudents.reduce((a, s) => a + s.totalPoints, 0) / cohortStudents.length).toFixed(1) : 0}
              </p>
            </div>
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200 hover:shadow-md transition-shadow border-l-4 border-l-red-500">
              <p className="text-[10px] text-red-500 font-black uppercase tracking-widest mb-2 flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-red-500"></div>
                Weighted Alerts
              </p>
              <p className="text-4xl font-black text-red-600 leading-none">
                {cohortStudents.filter(s => s.riskScore > 70).length}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-3xl shadow-sm border border-slate-200 overflow-hidden">
            <div className="px-6 py-5 border-b border-slate-100 flex justify-between items-center bg-slate-50/30">
              <h2 className="font-black text-slate-800 flex items-center gap-2 uppercase tracking-tight">
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10"></path></svg>
                {view === 'all' ? 'Full DP Registry' : view === YearGroup.DP1 ? 'DP1 Registry' : 'DP2 Registry'}
              </h2>
              <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest bg-slate-100 px-3 py-1 rounded-full">{filteredStudents.length} Students</span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-500 text-[10px] font-black uppercase tracking-widest border-b border-slate-100">
                    <th className="px-6 py-4">Student Identity</th>
                    <th className="px-6 py-4 text-center">IB Points (Pure)</th>
                    <th className="px-6 py-4 text-center">Attn %</th>
                    <th className="px-6 py-4 text-center">Failure Flags</th>
                    <th className="px-6 py-4">Risk Rating</th>
                    <th className="px-6 py-4 text-right">Ops</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map(s => (
                    <tr key={s.id} onClick={() => setSelectedStudent(s)} className={`cursor-pointer group transition-all duration-200 ${selectedStudent?.id === s.id ? 'bg-blue-50/50' : 'hover:bg-slate-50'}`}>
                      <td className="px-6 py-4">
                        <div className="font-black text-slate-900 group-hover:text-blue-600 transition-colors">{s.name}</div>
                        <div className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{s.yearGroup} • {s.id}</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className={`inline-block px-4 py-1.5 rounded-xl font-black text-lg ${s.totalPoints < 24 ? 'text-red-600 bg-red-50' : 'text-blue-700 bg-blue-50'}`}>
                          {s.totalPoints}
                        </div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className={`font-black ${s.attendance < 90 ? 'text-red-500' : 'text-slate-700'}`}>{s.attendance}%</div>
                      </td>
                      <td className="px-6 py-4 text-center">
                        <div className="flex justify-center gap-1.5">
                          {s.grades.filter(g => Number(g.currentMark) < 4).length > 0 && <div className="w-2 h-2 rounded-full bg-red-500" title="Academic Alert"></div>}
                          {s.attendance < 90 && <div className="w-2 h-2 rounded-full bg-orange-500" title="Attendance Alert"></div>}
                          {(s.core.ee === 'At Risk' || s.core.tok === 'At Risk') && <div className="w-2 h-2 rounded-full bg-purple-500" title="Core Component Alert"></div>}
                        </div>
                      </td>
                      <td className="px-6 py-4"><RiskBadge score={s.riskScore} /></td>
                      <td className="px-6 py-4 text-right">
                        <svg className="w-5 h-5 text-slate-300 group-hover:text-blue-500 ml-auto transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M9 5l7 7-7 7"></path></svg>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        <div className="col-span-12 lg:col-span-4 space-y-6">
          {selectedStudent && (
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden sticky top-24 z-10 transition-all animate-in fade-in slide-in-from-right-4 duration-300">
              <div className="p-6 bg-slate-900 text-white relative">
                <button 
                  onClick={() => setSelectedStudent(null)}
                  className="absolute top-4 right-4 p-2 bg-slate-800 hover:bg-red-600 rounded-full transition-all group z-20"
                >
                  <svg className="w-5 h-5 text-slate-400 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M6 18L18 6M6 6l12 12"></path></svg>
                </button>
                <div>
                  <h2 className="text-2xl font-black leading-tight pr-10">{selectedStudent.name}</h2>
                  <p className="text-blue-400 font-black text-[10px] uppercase tracking-widest">{selectedStudent.yearGroup}</p>
                </div>
                <div className="mt-8 flex items-center justify-between border-t border-slate-800 pt-6">
                  <div className="text-center">
                    <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Summative Pts</p>
                    <p className="text-4xl font-black text-blue-500">{selectedStudent.totalPoints}</p>
                  </div>
                  <div className="text-center border-l border-slate-800 pl-8">
                    <p className="text-[9px] uppercase font-black text-slate-500 tracking-widest">Attendance</p>
                    <p className={`text-2xl font-black ${selectedStudent.attendance < 90 ? 'text-red-500' : 'text-white'}`}>{selectedStudent.attendance}%</p>
                  </div>
                </div>
              </div>
              
              <div className="p-6 max-h-[65vh] overflow-y-auto space-y-8">
                {/* RESTORED GEMINI FEATURE */}
                <div className="p-1 rounded-3xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg overflow-hidden">
                  <div className="bg-white p-5 rounded-[22px]">
                    <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-3 flex items-center justify-between">
                      <span>RE:ASoN AI Insights</span>
                      {!aiAnalysis && !isAnalyzing && <span className="text-indigo-500 animate-pulse font-bold">New Alert!</span>}
                    </h3>
                    
                    {isAnalyzing ? (
                      <div className="py-8 flex flex-col items-center gap-3">
                        <div className="w-8 h-8 border-3 border-indigo-500 border-t-transparent rounded-full animate-spin"></div>
                        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Synthesizing Data...</p>
                      </div>
                    ) : aiAnalysis ? (
                      <div className="space-y-4">
                        <div className={`p-3 rounded-xl border flex items-center gap-3 ${aiAnalysis.riskLevel === 'Critical' ? 'bg-red-50 border-red-100 text-red-700' : 'bg-blue-50 border-blue-100 text-blue-700'}`}>
                          <div className={`w-2 h-2 rounded-full ${aiAnalysis.riskLevel === 'Critical' ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                          <span className="text-xs font-black uppercase tracking-widest">Rating: {aiAnalysis.riskLevel}</span>
                        </div>
                        <p className="text-sm text-slate-700 leading-relaxed font-medium italic">"{aiAnalysis.summary}"</p>
                        <div className="space-y-2">
                          {aiAnalysis.recommendations.map((rec, i) => (
                            <div key={i} className="flex gap-2 items-start text-[11px] font-bold text-slate-600">
                              <div className="w-1 h-1 rounded-full bg-indigo-400 mt-1.5 shrink-0"></div>
                              <span>{rec}</span>
                            </div>
                          ))}
                        </div>
                        <button onClick={handleRunAnalysis} className="text-[9px] font-black uppercase text-indigo-600 hover:text-indigo-800 transition-colors">Refresh Insight</button>
                      </div>
                    ) : (
                      <button 
                        onClick={handleRunAnalysis}
                        className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-xs transition-all shadow-md active:scale-95"
                      >
                        Generate Risk Synthesis
                      </button>
                    )}
                  </div>
                </div>

                <div>
                  <h3 className="text-[10px] font-black text-slate-900 uppercase tracking-widest mb-4 flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-blue-600"></div>
                    Subject Breakdown
                  </h3>
                  <div className="space-y-3">
                    {selectedStudent.grades.map((g, i) => (
                      <div key={i} className="p-3 bg-slate-50 rounded-2xl border border-slate-100">
                        <div className="flex justify-between items-center mb-1">
                          <span className="font-black text-slate-800 text-sm">{g.subject} <span className="text-[9px] bg-slate-200 px-1.5 py-0.5 rounded ml-1">{g.level}</span></span>
                          <span className={`text-xl font-black ${Number(g.currentMark) < 4 ? 'text-red-600' : 'text-blue-600'}`}>{g.currentMark}</span>
                        </div>
                        <div className="flex justify-between text-[10px] font-bold">
                          <span className="text-slate-400">Predicted: {g.predictedGrade}</span>
                          <span className={g.trend === 'up' ? 'text-emerald-500' : g.trend === 'down' ? 'text-red-500' : 'text-slate-400'}>
                            {g.trend.toUpperCase()} TREND
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="pt-4 border-t border-slate-100">
                  <h3 className="text-[10px] font-black text-indigo-900 uppercase tracking-widest mb-4">Risk History Trend</h3>
                  <StudentTrendChart data={selectedStudent.historicalRiskScores} />
                </div>
              </div>
            </div>
          )}

          <div className="space-y-6">
            <div className="bg-white p-6 rounded-3xl shadow-sm border border-slate-200">
              <h3 className="text-xs font-black text-slate-900 uppercase tracking-widest mb-6 flex items-center gap-2">
                <svg className="w-4 h-4 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M12 4v16m8-8H4"></path></svg>
                Sync Data: ManageBac
              </h3>
              <div className="space-y-4">
                <input type="file" ref={fileInputRef} onChange={handleFileUpload} className="hidden" accept=".csv" />
                <button 
                  onClick={() => fileInputRef.current?.click()} 
                  className="w-full p-10 border-2 border-dashed border-slate-200 rounded-3xl text-center hover:border-blue-400 hover:bg-blue-50/50 transition-all group flex flex-col items-center justify-center"
                >
                  <svg className="w-12 h-12 text-slate-300 group-hover:text-blue-500 mb-4 transition-colors" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"></path></svg>
                  <span className="text-sm font-black text-slate-700 block uppercase tracking-tight">Upload Weekly Data Pull</span>
                </button>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={downloadTemplate} className="py-3 bg-slate-50 border border-slate-200 text-[10px] font-black uppercase tracking-widest text-slate-600 rounded-2xl hover:bg-slate-100 transition-all">Template</button>
                  <input type="email" value={coordinatorEmail} onChange={(e) => setCoordinatorEmail(e.target.value)} placeholder="Coord. Email" className="border border-slate-200 rounded-2xl px-4 py-3 text-[10px] font-black uppercase tracking-tight focus:ring-2 focus:ring-blue-500 outline-none transition-all" />
                </div>
              </div>
            </div>
            <SettingsPanel weights={weights} onUpdate={setWeights} />
          </div>
        </div>
      </main>

      <footer className="bg-slate-900 text-slate-500 p-8 border-t border-slate-800 mt-auto">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6 text-[10px] font-black uppercase tracking-[0.2em]">
          <div className="flex items-center gap-3"><span className="text-blue-500">RE:ASoN</span> <span className="opacity-40">|</span> DP Risk Analytics Engine</div>
          <div className="text-slate-700">Privately Listed Dashboard</div>
        </div>
      </footer>
    </div>
  );
};

export default App;
