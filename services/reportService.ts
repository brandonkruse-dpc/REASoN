
import { Student, YearGroup } from '../types.ts';

export async function generateWeeklyPDF(students: Student[]) {
  const { jsPDF } = (window as any).jspdf;
  const doc = new jsPDF();
  const now = new Date().toLocaleDateString();

  const getTopAtRisk = (list: Student[], count: number = 10) => {
    return [...list].sort((a, b) => b.riskScore - a.riskScore).slice(0, count);
  };

  const wholeDP = getTopAtRisk(students);
  const dp1 = getTopAtRisk(students.filter(s => s.yearGroup === YearGroup.DP1));
  const dp2 = getTopAtRisk(students.filter(s => s.yearGroup === YearGroup.DP2));

  const primaryColor = '#0f172a'; 
  
  doc.setFillColor(primaryColor);
  doc.rect(0, 0, 210, 40, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(22);
  doc.setFont('helvetica', 'bold');
  doc.text('RE:ASoN WEEKLY RISK REPORT', 15, 25);
  doc.setFontSize(10);
  doc.setFont('helvetica', 'normal');
  doc.text(`Generated on: ${now}`, 15, 32);

  let yPos = 50;

  const renderSection = (title: string, data: Student[]) => {
    doc.setTextColor(primaryColor);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text(title, 15, yPos);
    yPos += 8;

    doc.setFillColor(241, 245, 249); 
    doc.rect(15, yPos, 180, 8, 'F');
    doc.setTextColor(71, 85, 105); 
    doc.setFontSize(8);
    doc.text('STUDENT NAME', 20, yPos + 5.5);
    doc.text('ID', 80, yPos + 5.5);
    doc.text('RISK', 110, yPos + 5.5);
    doc.text('PTS', 135, yPos + 5.5);
    doc.text('ATTN', 160, yPos + 5.5);
    doc.text('FAIL FLAGS', 180, yPos + 5.5);

    yPos += 8;
    doc.setTextColor(0, 0, 0);
    doc.setFont('helvetica', 'normal');

    data.forEach((s, i) => {
      if (i % 2 === 0) {
        doc.setFillColor(248, 250, 252);
        doc.rect(15, yPos, 180, 7, 'F');
      }
      const flags = (s.grades.filter(g => Number(g.currentMark) < 4).length) + (s.core.cas === 'Behind' ? 1 : 0);
      doc.text(s.name, 20, yPos + 5);
      doc.text(s.id, 80, yPos + 5);
      if (s.riskScore > 70) doc.setTextColor(220, 38, 38);
      else if (s.riskScore > 40) doc.setTextColor(234, 88, 12);
      else doc.setTextColor(0,0,0);
      doc.text(String(s.riskScore), 110, yPos + 5);
      doc.setTextColor(0,0,0);
      doc.text(String(s.totalPoints), 135, yPos + 5);
      doc.text(`${s.attendance}%`, 160, yPos + 5);
      doc.text(String(flags), 180, yPos + 5);
      yPos += 7;
    });
    yPos += 10;
  };

  renderSection('TOP 10 RISK - WHOLE DP COHORT', wholeDP);
  renderSection('TOP 10 RISK - DP1 (YEAR 11)', dp1);
  renderSection('TOP 10 RISK - DP2 (YEAR 12)', dp2);

  doc.setFontSize(8);
  doc.setTextColor(148, 163, 184);
  doc.text('RE:ASoN - Risk Engine: Assessing Students of Note. Internal School Use Only.', 105, 285, { align: 'center' });

  doc.save(`REASON_Weekly_Report_${now.replace(/\//g, '-')}.pdf`);
}
