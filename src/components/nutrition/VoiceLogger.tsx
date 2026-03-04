import { useState, useEffect, useRef } from "react";
import { motion } from "framer-motion";
import { Mic, MicOff, X, Check, AlertCircle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VoiceLoggerProps {
  onResult: (text: string) => void;
  onClose: () => void;
}

export function VoiceLogger({ onResult, onClose }: VoiceLoggerProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [supported, setSupported] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setSupported(false);
      return;
    }

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      let text = "";
      for (let i = 0; i < event.results.length; i++) {
        text += event.results[i][0].transcript;
      }
      setTranscript(text);
    };

    recognition.onerror = (event: any) => {
      setError(event.error === "not-allowed" ? "Microphone access denied" : "Speech recognition error");
      setListening(false);
    };

    recognition.onend = () => {
      setListening(false);
    };

    recognitionRef.current = recognition;

    return () => {
      recognition.abort();
    };
  }, []);

  const startListening = () => {
    setError(null);
    setTranscript("");
    recognitionRef.current?.start();
    setListening(true);
  };

  const stopListening = () => {
    recognitionRef.current?.stop();
    setListening(false);
  };

  const handleConfirm = () => {
    if (transcript.trim()) {
      onResult(transcript.trim());
    }
  };

  // Fallback: text input if speech not supported
  if (!supported) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm font-semibold text-foreground flex items-center gap-2">
            <Mic className="w-4 h-4 text-primary" />
            Voice Log (Text Fallback)
          </p>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
            <X className="w-4 h-4 text-muted-foreground" />
          </button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Speech not supported in this browser. Type your meal instead.
        </p>
        <textarea
          value={transcript}
          onChange={(e) => setTranscript(e.target.value)}
          placeholder="e.g. two eggs and a banana"
          rows={2}
          className="w-full px-3 py-2 rounded-lg bg-muted border border-border/50 text-sm resize-none"
        />
        <button
          onClick={handleConfirm}
          disabled={!transcript.trim()}
          className={cn(
            "w-full py-3 rounded-xl text-sm font-semibold",
            transcript.trim() ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"
          )}
        >
          Parse & Log
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-foreground flex items-center gap-2">
          <Mic className="w-4 h-4 text-primary" />
          Voice Log
        </p>
        <button onClick={onClose} className="p-1 rounded-lg hover:bg-muted">
          <X className="w-4 h-4 text-muted-foreground" />
        </button>
      </div>

      {/* Mic button */}
      <div className="flex flex-col items-center gap-4 py-4">
        <button
          onClick={listening ? stopListening : startListening}
          className={cn(
            "w-20 h-20 rounded-full flex items-center justify-center transition-all",
            listening
              ? "bg-red-500 shadow-[0_0_30px_rgba(239,68,68,0.4)]"
              : "bg-primary shadow-[var(--ds-shadow-purple-glow)]"
          )}
        >
          {listening ? (
            <motion.div
              animate={{ scale: [1, 1.2, 1] }}
              transition={{ repeat: Infinity, duration: 1.5 }}
            >
              <MicOff className="w-8 h-8 text-white" />
            </motion.div>
          ) : (
            <Mic className="w-8 h-8 text-white" />
          )}
        </button>

        <p className="text-xs text-muted-foreground">
          {listening ? "Listening... tap to stop" : "Tap to start speaking"}
        </p>
      </div>

      {/* Live transcript */}
      {transcript && (
        <div className="p-3 rounded-xl bg-muted/50 border border-border/30">
          <p className="text-xs text-muted-foreground mb-1">Heard:</p>
          <p className="text-sm text-foreground">{transcript}</p>
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 p-3 rounded-xl bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800/30">
          <AlertCircle className="w-4 h-4 text-red-500" />
          <p className="text-xs text-red-700 dark:text-red-300">{error}</p>
        </div>
      )}

      {transcript && !listening && (
        <button
          onClick={handleConfirm}
          className="w-full py-3 rounded-xl bg-primary text-primary-foreground text-sm font-semibold flex items-center justify-center gap-1.5"
        >
          <Check className="w-4 h-4" /> Parse & Log
        </button>
      )}
    </div>
  );
}
