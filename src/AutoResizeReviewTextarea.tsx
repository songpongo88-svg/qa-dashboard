import React, { useLayoutEffect, useRef } from "react";

type Props = React.TextareaHTMLAttributes<HTMLTextAreaElement>;

function fitTextarea(element: HTMLTextAreaElement) {
  element.style.height = "auto";
  const style = window.getComputedStyle(element);
  const borders = (parseFloat(style.borderTopWidth) || 0) + (parseFloat(style.borderBottomWidth) || 0);
  element.style.height = `${element.scrollHeight + borders}px`;
}

export default function AutoResizeReviewTextarea({ value, onInput, ...props }: Props) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    if (ref.current) fitTextarea(ref.current);
  }, [value]);
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    let active = true;
    const resize = () => { if (active) fitTextarea(element); };
    let width = -1;
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(entries => {
      const nextWidth = entries[0]?.contentRect.width;
      if (nextWidth !== undefined && nextWidth !== width) { width = nextWidth; resize(); }
    });
    if (element.parentElement) observer?.observe(element.parentElement);
    window.addEventListener("resize", resize);
    void document.fonts?.ready.then(resize);
    return () => { active = false; observer?.disconnect(); window.removeEventListener("resize", resize); };
  }, []);
  return <textarea {...props} ref={ref} value={value} onInput={event => { fitTextarea(event.currentTarget); onInput?.(event); }} />;
}
