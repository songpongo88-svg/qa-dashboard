import React from "react";

type PageHeroProps = {
  eyebrow: string;
  title: string;
  subtitle?: string;
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
    <div
      data-unified-robinhood-hero-v156="true"
      className={`relative overflow-hidden bg-gradient-to-r from-violet-950 via-violet-800 to-fuchsia-700 text-white shadow-[0_16px_40px_rgba(76,29,149,0.18)] ${className}`}
    >
      <div className="pointer-events-none absolute -right-20 -top-28 h-72 w-72 rounded-full bg-white/5" />
      <div className="pointer-events-none absolute -bottom-28 right-40 h-56 w-56 rounded-full bg-fuchsia-200/10" />
      <div className="relative mx-auto max-w-[1720px] px-6 py-7 lg:px-8 lg:py-8">
        <div className="flex flex-col gap-6 lg:min-h-[132px] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-h-[112px] max-w-4xl flex-col justify-center lg:order-2 lg:items-end lg:text-right">
            <div className="text-xs font-medium uppercase tracking-[0.28em] text-violet-200">
              {eyebrow}
            </div>
            <div className="mt-3 text-3xl font-semibold tracking-tight lg:text-4xl">
              {title}
            </div>
            {subtitle ? (
              <div className="mt-2 max-w-3xl text-sm font-normal leading-6 text-violet-100/90">
                {subtitle}
              </div>
            ) : null}
          </div>

          <div className="flex min-w-[320px] max-w-[620px] items-center gap-4 rounded-[28px] border border-white/15 bg-white/10 px-4 py-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.14)] backdrop-blur-sm lg:order-1 lg:self-center">
            <div className="flex h-24 w-24 shrink-0 items-center justify-center rounded-[28px] border border-white/20 bg-white/10 shadow-[inset_0_1px_0_rgba(255,255,255,0.18)]">
              <img
                src="/robinhood-logo.png"
                alt="Robinhood QA Logo"
                className="h-16 w-16 rounded-[18px] object-contain shadow-sm"
              />
            </div>
            <div className="hidden min-w-0 sm:block">
              <div className="text-xs font-medium uppercase tracking-[0.24em] text-violet-200">
                Robinhood QA
              </div>
              <div className="mt-1 text-lg font-medium text-white">
                {workspaceTitle}
              </div>
              <div className="mt-1 text-sm font-normal text-violet-100/90">
                {workspaceSubtitle}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
