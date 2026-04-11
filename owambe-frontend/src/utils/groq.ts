export interface TriviaQuestion {
  question: string;
  options: { A: string; B: string; C: string; D: string };
  answer: "A" | "B" | "C" | "D";
}

const GROQ_API_KEY = import.meta.env.VITE_GROQ_API_KEY || "";

export async function generateQuestions(topic: string, count: number = 3): Promise<TriviaQuestion[]> {
  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${GROQ_API_KEY}`,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        {
          role: "system",
          content:
            "You are a trivia question generator. Return ONLY valid JSON, no markdown, no explanation, no code fences.",
        },
        {
          role: "user",
          content: `Generate exactly ${count} trivia questions about: ${topic}
Return this exact JSON structure:
[{"question": "...", "options": {"A": "...", "B": "...", "C": "...", "D": "..."}, "answer": "A"}]
Make the questions fun and challenging but not impossible. Vary the correct answer position.`,
        },
      ],
      max_tokens: 1000,
      temperature: 0.8,
    }),
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`Groq API error: ${response.status} - ${err}`);
  }

  const data = await response.json();
  const content = data.choices[0].message.content.trim();

  // Parse JSON — handle potential markdown code fences
  let jsonStr = content;
  if (jsonStr.startsWith("```")) {
    jsonStr = jsonStr.replace(/```(?:json)?\n?/g, "").trim();
  }

  const questions: TriviaQuestion[] = JSON.parse(jsonStr);

  if (!Array.isArray(questions) || questions.length === 0) {
    throw new Error("Invalid response format from AI");
  }

  return questions;
}
