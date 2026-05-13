import React from "react";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  workspaceTitle?: string;
  workspaceSubtitle?: string;
  className?: string;
};

export default function PageHero({
  eyebrow,
  title,
  subtitle,
  workspaceTitle = "Quality Monitoring Workspace",
  workspaceSubtitle = "Corporate dashboard for audit tracking and case review",
  className = "",
}: PageHeroProps) {
  return (
    <div className={`relative text-white shadow-[0_16px_40px_rgba(76,29,149,0.22)] bg-gradient-to-r from-violet-950 via-violet-900 to-fuchsia-700 ${className}`}>
      <div className="mx-auto max-w-[1720px] px-6 py-8 lg:px-8 lg:py-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="max-w-4xl">
            <div className="text-xs font-semibold uppercase tracking-[0.35em] text-violet-200">
              {eyebrow}
            </div>
            <div className="mt-2 text-3xl font-bold tracking-tight lg:text-4xl">
              {title}
            </div>
            <div className="mt-3 max-w-3xl text-sm leading-6 text-violet-100/95">
              {subtitle}
            </div>
          </div>

          <div className="flex min-w-[320px] max-w-[680px] items-center gap-4 rounded-[28px] border border-white/10 bg-white/10 px-4 py-4 backdrop-blur-sm">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <img
                src="/robinhood-logo.png"
                alt="Robinhood QA Logo"
                className="h-16 w-16 rounded-[18px] bg-white/90 object-contain p-2 shadow-sm"
              />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="text-xs font-semibold uppercase tracking-[0.28em] text-violet-200">
                Robinhood QA
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                {workspaceTitle}
              </div>
              <div className="mt-1 text-sm text-violet-100/90">
                {workspaceSubtitle}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
