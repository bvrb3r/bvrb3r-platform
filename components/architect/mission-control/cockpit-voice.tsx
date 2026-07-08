"use client";

// Mission Control HOME cockpit — voice command widget.
// A client-only affordance: it never mutates data. When the browser exposes the Web
// Speech API it streams a recognized command into the cockpit chat; otherwise it
// degrades to a visual standby state. No backend, no money/route mutation.

import { useEffect, useRef, useState } from "react";
import { Mic } from "lucide-react";
import { cn } from "@/lib/utils";

type SpeechRecognitionLike = {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  onresult: ((event: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void) | null;
  onerror: (() => void) | null;
  onend: (() => void) | null;
  start: () => void;
  stop: () => void;
};

type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const scope = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return scope.SpeechRecognition ?? scope.webkitSpeechRecognition ?? null;
}

const BARS = [0.4, 0.7, 1, 0.6, 0.85, 0.5, 0.75];

export function VoiceCommand({ onCommand }: { onCommand: (text: string) => void }) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);

  useEffect(() => {
    setSupported(getRecognitionCtor() !== null);
    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  const toggle = () => {
    const Ctor = getRecognitionCtor();
    if (!Ctor) return;

    if (listening) {
      recognitionRef.current?.stop();
      setListening(false);
      return;
    }

    const recognition = new Ctor();
    recognition.lang = "en-US";
    recognition.interimResults = false;
    recognition.continuous = false;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript;
      if (transcript) onCommand(transcript.trim());
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    recognition.start();
    setListening(true);
  };

  return (
    <div className="flex items-center gap-3 rounded-[12px] border border-white/12 bg-black/60 p-3" data-testid="cockpit-voice">
      <div className="flex h-9 flex-1 items-end gap-1">
        {BARS.map((height, index) => (
          <span
            key={index}
            className={cn("w-1 rounded-full bg-[#C4F24E]/70", listening && "animate-pulse")}
            style={{ height: `${(listening ? height : height * 0.4) * 100}%`, animationDelay: `${index * 90}ms` }}
          />
        ))}
      </div>
      <div className="min-w-0">
        <div className="font-mono text-[9px] uppercase tracking-[0.12em] text-white/56">Voice Command</div>
        <div className={cn("font-mono text-[10px]", listening ? "text-[#e4f9b8]" : "text-white/44")}>
          {supported ? (listening ? "Listening…" : "Standby") : "Unavailable"}
        </div>
      </div>
      <button
        type="button"
        onClick={toggle}
        disabled={!supported}
        aria-label="Toggle voice command"
        data-testid="cockpit-voice-toggle"
        className={cn(
          "flex h-10 w-10 shrink-0 items-center justify-center rounded-full border transition",
          listening ? "border-[#C4F24E] bg-[#C4F24E]/16 text-[#e4f9b8]" : "border-white/16 bg-white/[0.04] text-white/56",
          !supported && "opacity-40"
        )}
      >
        <Mic className="h-4 w-4" />
      </button>
    </div>
  );
}
