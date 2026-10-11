import React, { useLayoutEffect, useRef } from 'react';

export default function AutoResizeTextarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const node = ref.current;
    if (!node) return;
    const resize = () => {
      const style = window.getComputedStyle(node);
      const borders = parseFloat(style.borderTopWidth || '0') + parseFloat(style.borderBottomWidth || '0');
      node.style.height = 'auto';
      node.style.height = `${node.scrollHeight + borders}px`;
    };
    resize();
    let width = node.getBoundingClientRect().width;
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(() => {
      const nextWidth = node.getBoundingClientRect().width;
      if (nextWidth !== width) { width = nextWidth;resize(); }
    });
    observer?.observe(node);
    let active = true;
    document.fonts?.ready.then(() => { if (active) resize(); });
    return () => { active = false;observer?.disconnect(); };
  }, [props.value]);
  return <textarea {...props} ref={ref} style={{ ...props.style, overflowY: 'hidden', resize: 'none' }} />;
}
