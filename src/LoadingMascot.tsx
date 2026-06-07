import React from "react";

type LoadingMascotProps = {
  message?: string;
  subMessage?: string;
};

export default function LoadingMascot({
  message = "กำลังโหลดข้อมูล",
  subMessage = "กรุณารอสักครู่...",
}: LoadingMascotProps) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6">
      <style>
        {`
          @keyframes qaOwlFloat {
            0%, 100% {
              transform: translateY(0) rotate(-1deg);
            }
            50% {
              transform: translateY(-16px) rotate(1deg);
            }
          }

          @keyframes qaOwlBlink {
            0%, 88%, 100% {
              opacity: 0;
            }
            91%, 95% {
              opacity: 1;
            }
          }

          @keyframes qaLoadingDot {
            0%, 80%, 100% {
              transform: translateY(0);
              opacity: .35;
            }
            40% {
              transform: translateY(-7px);
              opacity: 1;
            }
          }

          @keyframes qaSoftGlow {
            0%, 100% {
              opacity: .28;
              transform: scale(.92);
            }
            50% {
              opacity: .55;
              transform: scale(1.08);
            }
          }

          .qa-owl-float {
            animation: qaOwlFloat 2.6s ease-in-out infinite;
          }

          .qa-owl-blink {
            animation: qaOwlBlink 3.2s ease-in-out infinite;
          }

          .qa-loading-dot {
            animation: qaLoadingDot 1.2s ease-in-out infinite;
          }

          .qa-soft-glow {
            animation: qaSoftGlow 2.6s ease-in-out infinite;
          }
        `}
      </style>

      <div className="flex flex-col items-center justify-center text-center">
        <div className="relative h-56 w-56 sm:h-64 sm:w-64 qa-owl-float">
          <div className="qa-soft-glow absolute inset-x-8 bottom-3 h-9 rounded-full bg-violet-400/30 blur-xl" />

          <img
            src="/loader-owl-open.png"
            alt="QA Loading Owl"
            className="relative z-10 h-full w-full object-contain drop-shadow-[0_20px_24px_rgba(76,29,149,0.22)]"
          />

          <img
            src="/loader-owl-blink.png"
            alt=""
            aria-hidden="true"
            className="qa-owl-blink absolute inset-0 z-20 h-full w-full object-contain drop-shadow-[0_20px_24px_rgba(76,29,149,0.22)]"
          />
        </div>

        <div className="mt-4 text-2xl font-extrabold tracking-tight text-violet-950">
          {message}
        </div>

        <div className="mt-2 text-sm font-medium text-slate-500">
          {subMessage}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="qa-loading-dot h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span
            className="qa-loading-dot h-2.5 w-2.5 rounded-full bg-fuchsia-500"
            style={{ animationDelay: "0.15s" }}
          />
          <span
            className="qa-loading-dot h-2.5 w-2.5 rounded-full bg-sky-500"
            style={{ animationDelay: "0.3s" }}
          />
        </div>
      </div>
    </div>
  );
}
