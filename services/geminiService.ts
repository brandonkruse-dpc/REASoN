
import { GoogleGenAI, Type } from "@google/genai";
import { Student, RiskAnalysis } from "../types.ts";

/**
 * Safely retrieves the API key. 
 * Prevents crash if 'process' is not immediately available during module evaluation.
 */
const getApiKey = (): string => {
  try {
    return (window as any).process?.env?.API_KEY || "";
  } catch (e) {
    return "";
  }
};

const ai = new GoogleGenAI({ apiKey: getApiKey() });

export async function analyzeStudentRisk(student: Student): Promise<RiskAnalysis> {
  const prompt = `Analyze the following IB DP student data and identify failure risks.
  Student: ${student.name}
  Year Group: ${student.yearGroup}
  Attendance: ${student.attendance}%
  Grades: ${JSON.stringify(student.grades)}
  Core Status (EE, ToK, CAS): ${JSON.stringify(student.core)}
  
  Focus on identifying trends and specific areas of concern like failing grades (below 4), low attendance (below 90%), or core risks.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            riskLevel: {
              type: Type.STRING,
              description: "One of 'Low', 'Medium', 'High', 'Critical'"
            },
            summary: {
              type: Type.STRING,
              description: "A professional 2-sentence summary of the student's status."
            },
            recommendations: {
              type: Type.ARRAY,
              items: { type: Type.STRING },
              description: "Actionable steps for the coordinator."
            }
          },
          required: ["riskLevel", "summary", "recommendations"]
        }
      }
    });

    const result = JSON.parse(response.text.trim());
    return result as RiskAnalysis;
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return {
      riskLevel: "Medium",
      summary: "Could not generate automated summary. Please review manual data points.",
      recommendations: ["Manually check subject grades", "Schedule coordinator meeting"]
    };
  }
}

export async function generateWeeklyReport(students: Student[]): Promise<string> {
  const atRiskStudents = students.filter(s => s.riskScore > 40);
  const prompt = `Write a professional weekly report for the IB DP Coordinator. 
  The report should summarize the overall health of the DP cohort. 
  Focus on these high-risk students: ${atRiskStudents.map(s => s.name).join(", ")}.
  The report should be concise, professional, and highlight trends.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
    });
    return response.text;
  } catch (error) {
    return "Error generating weekly report. Please review individual student risk metrics.";
  }
}
