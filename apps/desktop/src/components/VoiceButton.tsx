import { useEffect } from "react";
import { useVoice } from "../hooks/useVoice";

interface VoiceButtonProps {
  /** Called when voice transcript is ready to be inserted into chat input */
  onTranscript: (text: string) => void;
}

export function VoiceButton({ onTranscript }: VoiceButtonProps) {
  const { start, stop, transcript, isListening, isSupported, clearTranscript } =
    useVoice();

  // When recording stops and we have a transcript, pass it up
  useEffect(() => {
    if (!isListening && transcript) {
      onTranscript(transcript);
      clearTranscript();
    }
  }, [isListening, transcript, onTranscript, clearTranscript]);

  if (!isSupported) {
    return null;
  }

  const handleMouseDown = () => {
    start();
  };

  const handleMouseUp = () => {
    stop();
  };

  return (
    <button
      type="button"
      onMouseDown={handleMouseDown}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      title={isListening ? "Release to send" : "Hold to speak"}
      className={`
        flex items-center justify-center w-9 h-9 rounded-lg
        transition-all duration-200 cursor-pointer
        ${
          isListening
            ? "bg-accent-red text-white animate-pulse-recording shadow-lg shadow-accent-red/30"
            : "text-text-muted hover:text-text-primary hover:bg-bg-tertiary"
        }
      `}
    >
      <svg
        width="18"
        height="18"
        viewBox="0 0 18 18"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <path
          d="M9 1.5C8.172 1.5 7.5 2.172 7.5 3V9C7.5 9.828 8.172 10.5 9 10.5C9.828 10.5 10.5 9.828 10.5 9V3C10.5 2.172 9.828 1.5 9 1.5Z"
          fill="currentColor"
        />
        <path
          d="M5.25 7.5V9C5.25 11.07 6.93 12.75 9 12.75C11.07 12.75 12.75 11.07 12.75 9V7.5"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
        <path
          d="M9 12.75V15.75M6.75 15.75H11.25"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
        />
      </svg>
    </button>
  );
}
