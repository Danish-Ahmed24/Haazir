import { GoogleGenerativeAI } from '@google/generative-ai';
import { IntentPayload } from '../types/AgentTypes';

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

const SYSTEM_INSTRUCTION = `
You are the Intent Agent for the "Haazir" mobile application. 
Your job is to parse natural language service requests in English, Urdu, or Roman Urdu and extract structured information.

Return a JSON object strictly matching this TypeScript interface:
interface IntentPayload {
  is_complete: boolean; // false if location/time/service is missing
  service_type: 'Plumbing' | 'Electrical' | 'Cleaning' | 'AC Technician' | null;
  location: string | null;
  time_preference: string | null;
  language: 'English' | 'Urdu' | 'Roman Urdu';
  clarification_question?: string; // required if is_complete is false. Must be in the user's detected language.
}

Examples:
Input: "Mujhe kal subah G-13 mein AC technician chahiye"
Output: {
  "is_complete": true,
  "service_type": "AC Technician",
  "location": "G-13, Islamabad",
  "time_preference": "Morning, Tomorrow",
  "language": "Roman Urdu"
}

Input: "AC kharab hai"
Output: {
  "is_complete": false,
  "service_type": "AC Technician",
  "location": null,
  "time_preference": null,
  "language": "Roman Urdu",
  "clarification_question": "Aapko kis waqt aur kahan technician chahiye?"
}

Always output valid JSON only, without markdown wrapping or backticks.
`;

export const analyzeIntent = async (query: string): Promise<IntentPayload> => {
  if (!process.env.EXPO_PUBLIC_GEMINI_API_KEY) {
    throw new Error('Missing Gemini API Key');
  }

  const model = genAI.getGenerativeModel({ 
    model: 'gemini-2.5-flash',
    systemInstruction: SYSTEM_INSTRUCTION,
    generationConfig: {
      temperature: 0.1,
      responseMimeType: "application/json",
    }
  });

  try {
    const result = await model.generateContent(query);
    const text = result.response.text();
    const payload: IntentPayload = JSON.parse(text);
    return payload;
  } catch (error) {
    console.error('IntentAgent parsing failed:', error);
    throw new Error('Failed to parse intent');
  }
};
