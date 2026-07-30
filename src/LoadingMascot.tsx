type LoadingMascotProps = {
  message?: string;
  subMessage?: string;
};

function LoadingContent({
  message,
  subMessage,
  compact = false,
}: LoadingMascotProps & { compact?: boolean }) {
  return (
    <div className="flex flex-col items-center justify-center text-center">
      <style>
        {`
          @keyframes qaRobinhoodFloat {
            0%, 100% {
              transform: translateY(0) rotate(-1deg);
            }
            50% {
              transform: translateY(-14px) rotate(1deg);
            }
          }

          @keyframes qaRobinhoodGlow {
            0%, 100% {
              opacity: .28;
              transform: scale(.92);
            }
            50% {
              opacity: .58;
              transform: scale(1.08);
            }
          }

          @keyframes qaRobinhoodRing {
            0% {
              opacity: .48;
              transform: scale(.78);
            }
            75%, 100% {
              opacity: 0;
              transform: scale(1.35);
            }
          }

          @keyframes qaLoadingDot {
            0%, 80%, 100% {
              opacity: .35;
              transform: translateY(0);
            }
            40% {
              opacity: 1;
              transform: translateY(-7px);
            }
          }

          .qa-robinhood-float {
            animation: qaRobinhoodFloat 2.6s ease-in-out infinite;
          }

          .qa-robinhood-glow {
            animation: qaRobinhoodGlow 2.6s ease-in-out infinite;
          }

          .qa-robinhood-ring {
            animation: qaRobinhoodRing 2.2s ease-out infinite;
          }

          .qa-loading-dot {
            animation: qaLoadingDot 1.2s ease-in-out infinite;
          }

          @media (prefers-reduced-motion: reduce) {
            .qa-robinhood-float,
            .qa-robinhood-glow,
            .qa-robinhood-ring,
            .qa-loading-dot {
              animation: none;
            }
          }
        `}
      </style>

      <div className={`qa-robinhood-float relative ${compact ? "h-40 w-40" : "h-52 w-52 sm:h-60 sm:w-60"}`}>
        <div className="qa-robinhood-ring absolute inset-5 rounded-full border-2 border-violet-300/70" />
        <div className="qa-robinhood-glow absolute inset-x-8 bottom-4 h-10 rounded-full bg-violet-400/35 blur-xl" />
        <div className="absolute inset-5 rounded-[34%] bg-white/85 shadow-[0_24px_60px_rgba(76,29,149,0.16)] ring-1 ring-violet-100 backdrop-blur-sm" />
        <img
          src="/robinhood-logo.png"
          alt="Robinhood loading logo"
          className="relative z-10 h-full w-full object-contain p-10 drop-shadow-[0_18px_24px_rgba(76,29,149,0.20)]"
        />
      </div>

      <div className={`${compact ? "mt-3 text-xl" : "mt-4 text-2xl"} font-semibold tracking-tight text-violet-950`}>
        {message}
      </div>

      <div className="mt-2 text-sm font-normal text-slate-500">
        {subMessage}
      </div>

      <div className="mt-5 flex items-center justify-center gap-2" aria-hidden="true">
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
  );
}

// data-robinhood-loading-v157
export default function LoadingMascot({
  message = "กำลังโหลดข้อมูล",
  subMessage = "กรุณารอสักครู่...",
}: LoadingMascotProps) {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-gradient-to-br from-[#f6f2ff] via-[#fcfbff] to-[#f3e8ff] p-6"
      role="status"
      aria-live="polite"
    >
      <LoadingContent message={message} subMessage={subMessage} />
    </div>
  );
}

export function LoadingMascotPanel({
  message = "กำลังโหลดข้อมูล",
  subMessage = "กรุณารอสักครู่...",
}: LoadingMascotProps) {
  return (
    <div
      className="flex min-h-[360px] w-full items-center justify-center px-6 py-10"
      role="status"
      aria-live="polite"
    >
      <LoadingContent message={message} subMessage={subMessage} compact />
    </div>
  );
}
