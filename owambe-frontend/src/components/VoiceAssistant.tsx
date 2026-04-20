import { useState, useRef, useCallback } from "react";
import { API_URL } from "../utils/contract";

interface ParsedGameConfig {
  topic: string;
  prizePool: string;
  questionCount: number;
  sharePercentages: number[];
  tokenSymbol?: string; // ETH, USDC, USDT
}

interface VoiceAssistantProps {
  onConfigParsed: (config: ParsedGameConfig) => void;
}

export function VoiceAssistant({ onConfigParsed }: VoiceAssistantProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [parsing, setParsing] = useState(false);
  const [supported] = useState(
    () => "webkitSpeechRecognition" in window || "SpeechRecognition" in window
  );
  const recognitionRef = useRef<any>(null);
  const fullTranscriptRef = useRef("");

  const startListening = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) return;

    const recognition = new SpeechRecognition();
    recognition.lang = "en-US";
    recognition.interimResults = true;
    recognition.continuous = true;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => setListening(true);

    recognition.onresult = (event: any) => {
      let interim = "";
      let final = "";
      for (let i = 0; i < event.results.length; i++) {
        if (event.results[i].isFinal) {
          final += event.results[i][0].transcript + " ";
        } else {
          interim += event.results[i][0].transcript;
        }
      }
      fullTranscriptRef.current = final;
      setTranscript(final + interim);
    };

    recognition.onerror = () => {
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, []);

  const stopAndParse = useCallback(async () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);

    const text = fullTranscriptRef.current.trim() || transcript.trim();
    if (!text) return;

    setParsing(true);
    try {
      // Use Groq via our backend to parse the voice input into game config
      const response = await fetch(`${API_URL}/api/parse-voice`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript: text }),
      });

      if (response.ok) {
        const config = await response.json();
        onConfigParsed(config);
      } else {
        // Fallback: simple parsing
        onConfigParsed(fallbackParse(text));
      }
    } catch {
      // Fallback: simple parsing
      onConfigParsed(fallbackParse(text));
    } finally {
      setParsing(false);
    }
  }, [transcript, onConfigParsed]);

  const reset = useCallback(() => {
    setTranscript("");
    fullTranscriptRef.current = "";
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setListening(false);
  }, []);

  if (!supported) {
    return null;
  }

  return (
    <div className="space-y-4">
      {/* Mic button */}
      <div className="flex flex-col items-center gap-4">
        {!listening && !transcript ? (
          <button
            onClick={startListening}
            className="w-20 h-20 rounded-full bg-gold/10 border-2 border-gold/40 flex items-center justify-center hover:bg-gold/20 hover:border-gold transition-all cursor-pointer group"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              className="w-8 h-8 text-gold group-hover:scale-110 transition-transform"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
              <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
              <line x1="12" y1="19" x2="12" y2="23" />
              <line x1="8" y1="23" x2="16" y2="23" />
            </svg>
          </button>
        ) : listening ? (
          <button
            onClick={stopAndParse}
            className="w-20 h-20 rounded-full bg-arena-red/20 border-2 border-arena-red flex items-center justify-center animate-mic-pulse cursor-pointer"
          >
            <div className="w-6 h-6 rounded bg-arena-red" />
          </button>
        ) : null}

        {!listening && !transcript && (
          <p className="text-cream-dim/60 text-sm text-center max-w-xs">
            Tap the mic and describe your game.<br />
            <span className="text-gold/60 text-xs italic">
              "Create a trivia about Afrobeats music, 0.5 ETH prize pool, 3 questions, split 60-30-10"
            </span>
          </p>
        )}

        {listening && (
          <p className="text-arena-red text-sm font-arena tracking-wider animate-pulse">
            LISTENING... TAP TO FINISH
          </p>
        )}

        {parsing && (
          <p className="text-gold text-sm font-arena tracking-wider animate-pulse">
            ANALYZING YOUR VOICE...
          </p>
        )}
      </div>

      {/* Transcript display */}
      {transcript && (
        <div className="stone-card p-4 animate-fade-up">
          <p className="text-cream-dim/80 text-sm leading-relaxed">
            "{transcript}"
          </p>
          {!listening && !parsing && (
            <div className="flex gap-3 mt-3">
              <button
                onClick={stopAndParse}
                className="text-gold text-sm hover:text-gold-light transition-colors cursor-pointer font-arena tracking-wider"
              >
                USE THIS
              </button>
              <button
                onClick={reset}
                className="text-cream-dim/40 text-sm hover:text-cream transition-colors cursor-pointer"
              >
                Try again
              </button>
            </div>
          )}
          {parsing && (
            <p className="text-gold/60 text-sm mt-2 animate-pulse">
              Parsing your instructions...
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function fallbackParse(text: string): ParsedGameConfig {
  const lower = text.toLowerCase();

  // Extract topic — everything that isn't about numbers/money/splits
  let topic = text;

  // Try to find token symbol first (eth, usdt, usdc)
  let tokenSymbol = "ETH"; // default
  const tokenMatch = lower.match(/\b(eth|usdt|usdc)\b/i);
  if (tokenMatch) tokenSymbol = tokenMatch[1].toUpperCase();

  // Try to find prize pool amount
  let prizePool = "0.05";
  // Match number + optional decimal + optional currency
  const poolMatch = lower.match(/([\d.]+)\s*(?:eth|mon|usdc|usdt)?/);
  if (poolMatch) prizePool = poolMatch[1];

  // Question count
  let questionCount = 3;
  const qMatch = lower.match(/(\d+)\s*(?:question|round)/);
  if (qMatch) questionCount = Math.min(parseInt(qMatch[1]), 20);

  // Share percentages
  let sharePercentages = [60, 30, 10];
  const splitMatch = lower.match(/(\d+)[\s/-]+(\d+)[\s/-]+(\d+)/);
  if (splitMatch) {
    const parts = [parseInt(splitMatch[1]), parseInt(splitMatch[2]), parseInt(splitMatch[3])];
    if (parts.reduce((a, b) => a + b, 0) === 100) {
      sharePercentages = parts;
    }
  }

  // Clean topic — remove money/config phrases
  topic = topic
    .replace(/\b(?:eth|mon|usdc|usdt)\b/gi, "")
    .replace(/[\d.]+\s*(?:eth|mon|usdc|usdt)?\s*(?:eth|mon|usdc|usdt)?\s*(prize\s*pool)?/gi, "")
    .replace(/\d+\s*(?:question|round)s?/gi, "")
    .replace(/split\s*[\d\s/-]+/gi, "")
    .replace(/prize\s*pool/gi, "")
    .replace(/create\s*(a\s*)?trivia\s*(about|on)?/gi, "")
    .replace(/make\s*(a\s*)?quiz\s*(about|on)?/gi, "")
    .trim();

  if (!topic) topic = "General Knowledge";

  return { topic, prizePool, questionCount, sharePercentages, tokenSymbol };
}
