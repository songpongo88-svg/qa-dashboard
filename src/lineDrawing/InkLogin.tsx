import React from 'react';

export function InkLoginArtwork() {
  return <>
    <div className="qa-ink-login-artwork" aria-hidden="true">
      <img className="qa-ink-login-house" src="/line-drawing/login-house.svg" alt="" />
      <img className="qa-ink-login-tree" src="/line-drawing/login-tree.svg" alt="" />
      <img className="qa-ink-login-sun" src="/line-drawing/sun.svg" alt="" />
      <svg className="qa-ink-login-birds" viewBox="0 0 280 80" fill="none"><path d="m8 38 13-19q7-8 9 7 8-17 16-10l17 10 19-3m72-4 11-13q6-5 6 8 7-12 13-8l14 8 18-4m-79 53 13-12q6-6 7 8 7-12 13-5l12 6 17-4" /></svg>
    </div>
    <header className="qa-ink-login-title"><img src="/line-drawing/logo.svg" alt="QA Dashboard" /></header>
  </>;
}
