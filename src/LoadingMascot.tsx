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
            0%, 100% { transform: translateY(0) rotate(-1deg); }
            50% { transform: translateY(-14px) rotate(1deg); }
          }

          @keyframes qaOwlGlow {
            0%, 100% { opacity: .35; transform: scale(.95); }
            50% { opacity: .75; transform: scale(1.08); }
          }

          @keyframes qaLoadingDot {
            0%, 80%, 100% { transform: translateY(0); opacity: .35; }
            40% { transform: translateY(-7px); opacity: 1; }
          }

          @keyframes qaSparkle {
            0%, 100% { transform: scale(.85) rotate(0deg); opacity: .45; }
            50% { transform: scale(1.15) rotate(12deg); opacity: 1; }
          }

          .qa-owl-float {
            animation: qaOwlFloat 2.4s ease-in-out infinite;
          }

          .qa-owl-glow {
            animation: qaOwlGlow 2.4s ease-in-out infinite;
          }

          .qa-loading-dot {
            animation: qaLoadingDot 1.2s ease-in-out infinite;
          }

          .qa-sparkle {
            animation: qaSparkle 1.8s ease-in-out infinite;
          }
        `}
      </style>

      <div className="relative w-full max-w-[420px] rounded-[32px] border border-violet-200/80 bg-white/85 px-7 py-8 text-center shadow-[0_24px_70px_rgba(109,40,217,0.16)] backdrop-blur-xl">
        <div className="pointer-events-none absolute -top-5 left-8 text-2xl qa-sparkle">✨</div>
        <div className="pointer-events-none absolute right-9 top-8 text-xl qa-sparkle" style={{ animationDelay: "0.35s" }}>💜</div>

        <div className="relative mx-auto h-40 w-40 sm:h-48 sm:w-48">
          <div className="qa-owl-glow absolute inset-x-5 bottom-1 h-8 rounded-full bg-violet-400/25 blur-xl" />
          <img
            src="/qa-loading-owl.png"
            alt="QA Loading"
            className="qa-owl-float relative z-10 h-full w-full object-contain drop-shadow-[0_18px_22px_rgba(76,29,149,0.22)]"
          />
        </div>

        <div className="mt-4 text-xl font-extrabold tracking-tight text-violet-950">
          {message}
        </div>

        <div className="mt-2 text-sm font-medium text-slate-500">
          {subMessage}
        </div>

        <div className="mt-5 flex items-center justify-center gap-2">
          <span className="qa-loading-dot h-2.5 w-2.5 rounded-full bg-violet-500" />
          <span className="qa-loading-dot h-2.5 w-2.5 rounded-full bg-fuchsia-500" style={{ animationDelay: "0.15s" }} />
          <span className="qa-loading-dot h-2.5 w-2.5 rounded-full bg-sky-500" style={{ animationDelay: "0.3s" }} />
        </div>
      </div>
    </div>
  );
}
