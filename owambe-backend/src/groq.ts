import Groq from "groq-sdk";
import { TriviaQuestion } from "./types";

let groqClient: Groq | null = null;

function getGroq(): Groq {
  if (!groqClient) {
    groqClient = new Groq({ apiKey: process.env.GROQ_API_KEY });
  }
  return groqClient;
}

export async function generateQuestions(topic: string, count: number = 3): Promise<TriviaQuestion[]> {
  const groq = getGroq();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: "You are a trivia question generator. Return ONLY valid JSON, no markdown, no explanation, no code fences.",
      },
      {
        role: "user",
        content: `Generate exactly ${count} trivia questions about: ${topic}
Return this exact JSON structure:
[{"question": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}, "answer": "A"}]
Make the questions fun and challenging but not impossible. Vary the correct answer position across A, B, C, D.`,
      },
    ],
    max_tokens: 1500,
    temperature: 0.8,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from Groq");

  let jsonStr = content;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```(?:json)?\n?/g, "").trim();
  }

  const questions: TriviaQuestion[] = JSON.parse(jsonStr);
  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Invalid question format from AI");
  }

  return questions;
}

export interface ParsedVoiceConfig {
  topic: string;
  prizePool: string;
  questionCount: number;
  sharePercentages: number[];
}

export async function parseVoiceInput(transcript: string): Promise<ParsedVoiceConfig> {
  const groq = getGroq();

  const completion = await groq.chat.completions.create({
    model: "llama-3.3-70b-versatile",
    messages: [
      {
        role: "system",
        content: `You parse voice transcripts into trivia game configurations. Return ONLY valid JSON, no markdown, no explanation.
The JSON must have exactly these fields:
{"topic": "string", "prizePool": "string (number)", "questionCount": number, "sharePercentages": [numbers summing to 100]}
Defaults if not mentioned: prizePool "0.05", questionCount 3, sharePercentages [60,30,10].
Extract the trivia topic from what the user describes — be specific and faithful to their words.`,
      },
      {
        role: "user",
        content: transcript,
      },
    ],
    max_tokens: 300,
    temperature: 0.3,
  });

  const content = completion.choices[0]?.message?.content?.trim();
  if (!content) throw new Error("Empty response from Groq");

  let jsonStr = content;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```(?:json)?\n?/g, "").trim();
  }

  const config: ParsedVoiceConfig = JSON.parse(jsonStr);

  // Validate and apply defaults
  if (!config.topic) config.topic = "General Knowledge";
  if (!config.prizePool || isNaN(Number(config.prizePool))) config.prizePool = "0.05";
  if (!config.questionCount || config.questionCount < 1) config.questionCount = 3;
  if (
    !Array.isArray(config.sharePercentages) ||
    config.sharePercentages.length === 0 ||
    config.sharePercentages.reduce((a, b) => a + b, 0) !== 100
  ) {
    config.sharePercentages = [60, 30, 10];
  }

  return config;
}
