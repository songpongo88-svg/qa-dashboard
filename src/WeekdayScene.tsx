import React, { useEffect, useState } from "react";

const scenes: Record<string, { day: string; english: string; message: string; quote: string }> = {
  "weekday-monday": { day: "จันทร์", english: "Monday", message: "เริ่มต้นสัปดาห์อย่างมั่นใจ ให้ทุกการแชทเป็นประสบการณ์ที่ดีของลูกค้า", quote: "เริ่มต้นวันใหม่ด้วยพลังบวก" },
  "weekday-tuesday": { day: "อังคาร", english: "Tuesday", message: "พลังดี ๆ ในทุกการแชท สร้างประสบการณ์ที่ดีให้กับลูกค้า", quote: "ทุกการแชท คือโอกาสในการสร้างความประทับใจ" },
  "weekday-wednesday": { day: "พุธ", english: "Wednesday", message: "คิดบวก ทำวันนี้ให้ดีที่สุด เพื่อรอยยิ้มของลูกค้า", quote: "ความสำเร็จ เริ่มต้นจากการลงมือทำ" },
  "weekday-thursday": { day: "พฤหัสบดี", english: "Thursday", message: "มุ่งมั่นในวันนี้ สร้างผลลัพธ์ที่ดีกว่าเดิม", quote: "ความพยายามในวันนี้ คือผลลัพธ์ที่ดีในวันพรุ่งนี้" },
  "weekday-friday": { day: "ศุกร์", english: "Friday", message: "ทำงานให้เต็มที่ แล้วพบวันหยุดที่สดใส", quote: "ทำวันนี้ให้ดี แล้ววันหยุดจะมีความสุขกว่าเดิม" },
  "weekday-saturday": { day: "เสาร์", english: "Saturday", message: "เติมพลังให้ตัวเอง แล้วกลับมาลุยกันต่อ", quote: "พักให้เต็มที่ เพื่อวันใหม่ที่ดีกว่า" },
  "weekday-sunday": { day: "อาทิตย์", english: "Sunday", message: "พักผ่อนวันนี้ เพื่อพรุ่งนี้ที่สดใสกว่าเดิม", quote: "จบสัปดาห์ด้วยรอยยิ้ม เพื่อเริ่มสัปดาห์ใหม่อย่างมั่นใจ" },
};

export function useWeekdayScene() {
  const [theme, setTheme] = useState(() => typeof document === "undefined" ? "" : document.documentElement.dataset.qaTheme || "");
  useEffect(() => {
    const sync = () => setTheme(document.documentElement.dataset.qaTheme || "");
    const observer = new MutationObserver(sync);
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-qa-theme"] });
    sync();
    return () => observer.disconnect();
  }, []);
  return scenes[theme] || null;
}

export default function WeekdayScene({ scene, title }: { scene: NonNullable<ReturnType<typeof useWeekdayScene>>; title: string }) {
  const date = new Intl.DateTimeFormat("th-TH", { timeZone: "Asia/Bangkok", day: "numeric", month: "long", year: "numeric" }).format(new Date());
  return (
    <header className="qa-weekday-scene" data-qa-weekday-scene="true">
      <div className="qa-weekday-scene-photo" aria-hidden="true" />
      <div className="qa-weekday-scene-content">
        <div className="qa-weekday-brand-row">
          <img src="/robinhood-logo.png" alt="Robinhood" width="40" height="40" />
          <div><strong>Robinhood QA</strong><div className="qa-weekday-scene-eyebrow">HAPPY {scene.english.toUpperCase()}</div></div>
        </div>
        <h1>สวัสดีวัน<span>{scene.day}</span></h1>
        <p>{scene.message}</p>
        <div className="qa-weekday-scene-meta">{title} · {date}</div>
      </div>
    </header>
  );
}

/** A real grid column reserves space for the rail; data and dialogs stay interactive. */
export function WeekdayDashboardLayout({ children }: { children: React.ReactNode }) {
  const scene = useWeekdayScene();
  return (
    <div className={scene ? "qa-weekday-dashboard-layout" : "qa-weekday-layout-inactive"}>
      <div className="qa-weekday-dashboard-main">{children}</div>
      {scene ? (
        <aside className="qa-weekday-side-rail" aria-label="ข้อความประจำวัน">
          <div className="qa-weekday-side-photo" aria-hidden="true" />
          <div className="qa-weekday-side-copy">
            <span className="qa-weekday-side-label">{scene.english}</span>
            <blockquote>{scene.quote}</blockquote>
            <div className="qa-weekday-side-rule" />
            <p>Good People<br />Better Service</p>
          </div>
          <div className="qa-weekday-side-footer">Same System<br /><strong>More Vibes</strong></div>
        </aside>
      ) : null}
    </div>
  );
}
