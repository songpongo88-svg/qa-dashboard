import React, { useLayoutEffect, useRef } from "react";

function FitLine({ children, size = 10, bold = false }: { children: React.ReactNode; size?: number; bold?: boolean }) {
  const box = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const container = box.current;
    const content = text.current;
    if (!container || !content) return;
    let active = true;
    const fit = () => {
      if (!active || !container.clientWidth) return;
      content.style.fontSize = size + "px";
      const width = content.getBoundingClientRect().width;
      if (width > container.clientWidth) content.style.fontSize = (size * (container.clientWidth - 1) / width) + "px";
    };
    const observer = new ResizeObserver(fit);
    observer.observe(container);
    fit();
    void document.fonts.ready.then(fit);
    return () => { active = false; observer.disconnect(); };
  }, [children, size]);
  return <div ref={box} style={{ width: "100%", minWidth: 0, lineHeight: "1.7", whiteSpace: "nowrap" }}>
    <span ref={text} style={{ display: "inline-block", fontSize: size, fontWeight: bold ? 600 : 400 }}>{children}</span>
  </div>;
}

export default function SidebarProfileDetails({ name, adminName, role, team, workSim, version }: {
  name: string; adminName: string; role: string; team: string; workSim: string; version: string;
}) {
  return <div className="qa-sidebar-label" data-sidebar-profile-details="true" style={{ width: "100%", minWidth: 0 }}>
    <FitLine size={14} bold>{name}</FitLine>
    {adminName ? <FitLine><strong>Admin Name:</strong> {adminName}</FitLine> : null}
    {role ? <FitLine><strong>Role:</strong> {role}</FitLine> : null}
    {team && team !== "-" ? <FitLine><strong>Team:</strong> {team}</FitLine> : null}
    {workSim && workSim !== "—" ? <FitLine><strong>Work SIM:</strong> {workSim}</FitLine> : null}
    <FitLine><strong>Deploy Version:</strong> {version}</FitLine>
  </div>;
}
