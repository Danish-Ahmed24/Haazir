import { GoogleGenerativeAI } from '@google/generative-ai';
import { IntentPayload } from '../types/AgentTypes';

// Initialize the Gemini API client
const genAI = new GoogleGenerativeAI(process.env.EXPO_PUBLIC_GEMINI_API_KEY || '');

const SYSTEM_INSTRUCTION = `
You are the Intent Agent for the "Haazir" mobile application. 
You are 'Haazir', an AI home services dispatcher operating strictly in Pakistan. When parsing locations, always assume the user is in Pakistan. If a user mentions ambiguous cities like 'Hyderabad', 'Punjab', or 'Clifton', map them explicitly to their Pakistani coordinates and contexts. Never resolve to Indian or international locations.
Your job is to parse natural language service requests in English, Urdu, or Roman Urdu and extract structured information.

IMPORTANT: You will receive the full conversation history between the user and the AI assistant. 
You MUST accumulate entities across messages. If the user previously mentioned a service or location, 
DO NOT forget it. Merge all information gathered across the conversation into one complete payload.

Return a JSON object strictly matching this TypeScript interface:
interface IntentPayload {
  is_complete: boolean; // false if location/time/service is STILL missing after merging all messages
  service_type: 'Plumbing' | 'Electrical' | 'Cleaning' | 'AC Technician' | null;
  location: string | null;
  time_preference: string | null;
  language: 'English' | 'Urdu' | 'Roman Urdu';
  clarification_question?: string; // required if is_complete is false. Must be in the user's detected language. Only ask about the REMAINING missing fields.
}

Examples:

Conversation:
User: "Mujhe G-13 mein AC theek karwana hai"
AI: "Aapko kis waqt technician chahiye?"
User: "9 baje"

Output: {
  "is_complete": true,
  "service_type": "AC Technician",
  "location": "G-13, Islamabad",
  "time_preference": "9:00",
  "language": "Roman Urdu"
}

Single message example:
User: "AC kharab hai"
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

export interface ConversationTurn {
  role: 'user' | 'ai';
  content: string;
}

export const analyzeIntent = async (
  query: string,
  conversationHistory: ConversationTurn[] = []
): Promise<IntentPayload> => {
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

  // Build multi-turn prompt with full conversation context
  let contextPrompt = '';
  if (conversationHistory.length > 0) {
    contextPrompt = 'Conversation so far:\n';
    for (const turn of conversationHistory) {
      contextPrompt += `${turn.role === 'user' ? 'User' : 'AI'}: "${turn.content}"\n`;
    }
    contextPrompt += `\nUser: "${query}"\n\nAnalyze the FULL conversation above and return the merged intent payload.`;
  } else {
    contextPrompt = query;
  }

  try {
    const result = await model.generateContent(contextPrompt);
    const text = result.response.text();
    const payload: IntentPayload = JSON.parse(text);
    return payload;
  } catch (error) {
    console.error('IntentAgent parsing failed:', error);
    throw new Error('Failed to parse intent');
  }
};
