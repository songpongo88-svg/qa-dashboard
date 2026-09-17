import React, { useEffect, useRef, useState } from 'react';
import { WEATHER_STATES, sceneFor, sceneUrl } from './model.mjs';
import { chooseCity, chooseWeather, refreshWeather, useWeather, type City } from './store';
import './weather.css';

function CityPicker({ onClose }: { onClose: () => void }) {
  const [query,setQuery] = useState(''), [cities,setCities] = useState<City[]>([]), [status,setStatus] = useState(''), [busy,setBusy] = useState(false);
  const request = useRef<AbortController>();
  useEffect(() => () => request.current?.abort(),[]);
  const search = async (event: React.FormEvent) => {
    event.preventDefault(); if (query.trim().length < 2) return;
    request.current?.abort(); const current = new AbortController(); request.current = current; setBusy(true); setStatus('');
    try { const response = await fetch(`/api/weather?q=${encodeURIComponent(query.trim())}`,{ signal: current.signal }); if (!response.ok) throw new Error(); const data = await response.json(); setCities(data.results || []); setStatus(data.results?.length ? '' : 'ไม่พบเมือง ลองใช้ชื่อจังหวัดหรือชื่อภาษาอังกฤษ'); }
    catch { if (!current.signal.aborted) setStatus('ค้นหายังไม่สำเร็จ กรุณาลองใหม่'); }
    finally { if (!current.signal.aborted) setBusy(false); }
  };
  return <div className="weather-city-picker">
    <form onSubmit={search}><label htmlFor="weather-city-search">เปลี่ยนพื้นที่</label><div><input autoFocus id="weather-city-search" value={query} onChange={e=>setQuery(e.target.value)} placeholder="ชื่อเมือง / จังหวัด" maxLength={80} /><button disabled={busy || query.trim().length<2}>{busy?'กำลังค้นหา…':'ค้นหา'}</button></div></form>
    <p role="status">{status}</p><ul>{cities.map(city=><li key={`${city.label}:${city.latitude}:${city.longitude}`}><button onClick={()=>{chooseCity(city);onClose();}}>{city.label}</button></li>)}</ul>
    <button onClick={()=>{chooseCity(null);onClose();}}>ใช้ตำแหน่งเครือข่ายอัตโนมัติ</button><button onClick={onClose}>ปิด</button>
  </div>;
}
export function WeatherInfo() {
  const weather = useWeather(), [cityOpen,setCityOpen] = useState(false);
  const { data } = weather, scene = sceneFor(data,weather.now);
  const value = (n: number | null | undefined, unit: string) => n == null ? '—' : `${Math.round(n)}${unit}`;
  const date = (time: number) => new Intl.DateTimeFormat('th-TH',{ timeZone: data?.timezone || 'Asia/Bangkok', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }).format(time);
  const stale = data && weather.now-data.fetchedAt>35*60000;
  return <section className="weather-info" aria-label="สภาพอากาศปัจจุบัน">
    <div className="weather-place"><span>{data?.location.label || 'กำลังตรวจพื้นที่…'}</span><button type="button" onClick={()=>setCityOpen(!cityOpen)} aria-expanded={cityOpen}>เปลี่ยนพื้นที่</button></div>
    <div className="weather-current"><span className="weather-icon" aria-hidden="true">{scene.icon}</span><strong>{value(data?.temp,'°C')}</strong><span>{data ? scene.label : 'กำลังโหลดอากาศ'}<small>{date(weather.now)}</small></span></div>
    <div className="weather-metrics"><span>โอกาสฝน <b>{value(data?.rainChance,'%')}</b></span><span>ความชื้น <b>{value(data?.humidity,'%')}</b></span><span>ลม <b>{value(data?.wind,' กม./ชม.')}</b></span></div>
    <div className="weather-status" role="status">{weather.error ? `${weather.error}${data ? ' · แสดงข้อมูลล่าสุดที่มี' : ''}` : weather.loading ? 'กำลังอัปเดต…' : stale ? 'ข้อมูลเก่า · รออัปเดต' : data ? `ข้อมูล ${date(data.observedAt)}` : 'ยังไม่มีข้อมูลอากาศ'} <button disabled={weather.loading} onClick={()=>void refreshWeather(true)}>อัปเดต</button></div>
    <small className="weather-source">{data?.location.source==='fallback' ? 'ใช้กรุงเทพฯ เป็นพื้นที่สำรอง' : data?.location.source==='manual' ? 'พื้นที่ที่คุณเลือก' : 'ตำแหน่งโดยประมาณจากเครือข่าย'} · <a href="https://open-meteo.com/" target="_blank" rel="noreferrer">Open-Meteo</a></small>
    {cityOpen && <CityPicker onClose={()=>setCityOpen(false)} />}
  </section>;
}
export function WeatherHero({ title, eyebrow, subtitle }: { title: string; eyebrow: string; subtitle?: string }) {
  return <header data-unified-robinhood-hero-v156="true" className="weather-hero"><div className="weather-hero-content"><div className="weather-hero-brand"><img src="/robinhood-logo.png" alt="Robinhood" width="44" height="44" /><div><strong>Robinhood QA</strong><span>WEATHER COLLECTION</span></div></div><div className="weather-hero-grid"><WeatherInfo /><div className="weather-hero-heading"><small>{eyebrow}</small><h1>{title}</h1>{subtitle&&<p>{subtitle}</p>}</div></div></div></header>;
}
export function WeatherCollection() {
  const weather = useWeather(), [preview,setPreview] = useState('night-cloudy');
  const state = sceneFor(weather.data,weather.now);
  return <section id="qa-weather-picker-panel" data-qa-theme-collection="weather" className="weather-collection">
    <div className="weather-collection-intro"><div><h3>Weather Collection</h3><p>เมืองของคุณ · สภาพอากาศจริง · เปลี่ยนกลางวันและกลางคืนอัตโนมัติ</p></div><button data-qa-custom-theme-card="weather-auto" onClick={chooseWeather} aria-pressed={weather.enabled}>{weather.enabled?'กำลังใช้งาน':'ใช้ Weather Collection'}</button></div>
    <p className="weather-collection-note">ตำแหน่งระดับเมืองจากเครือข่าย ไม่มีป๊อปอัปขอ GPS · เปลี่ยนพื้นที่ได้จากหัวหน้า · อัปเดตทุก 30 นาที</p>
    <div className="weather-preview" style={{backgroundImage:`url("${sceneUrl(preview)}")`}}><img src="/robinhood-logo.png" alt="Robinhood" width="32" height="32"/><span>ภาพตัวอย่างธีม</span><strong>{WEATHER_STATES.find(row=>row[0]===preview)?.[1] || ({'night-cloudy':'Night + Cloudy','night-rain':'Night + Rain'} as Record<string,string>)[preview]}</strong></div>
    <div className="weather-scene-grid">{WEATHER_STATES.map(([id,en,th])=><button key={id} data-qa-custom-theme-card="weather-preview" aria-pressed={preview===id} onClick={()=>setPreview(id)}><img loading="lazy" src={sceneUrl(id)} alt="" /><strong>{en}</strong><small>{th}{weather.enabled&&state.id===id?' · กำลังใช้งาน':''}</small></button>)}</div>
    <div className="weather-night-examples"><button data-qa-custom-theme-card="weather-preview" onClick={()=>setPreview('night-cloudy')}>ดู Night + Cloudy</button><button data-qa-custom-theme-card="weather-preview" onClick={()=>setPreview('night-rain')}>ดู Night + Rain</button></div>
    <p className="weather-collection-note">ภาพฉากเมืองเป็นภาพประกอบสภาพอากาศ อุณหภูมิและข้อมูลบนหัวหน้ามาจากพื้นที่ที่เลือก ภาพตัวอย่างไม่เปลี่ยนข้อมูลอากาศจริง</p>
  </section>;
}
export function WeatherSidebarLabel() {
  const weather = useWeather(); if (!weather.enabled) return null;
  const scene = sceneFor(weather.data,weather.now);
  return <span className="weather-sidebar-label"><small>Weather Collection</small><strong>{scene.icon} {weather.data ? Math.round(weather.data.temp)+'°C' : 'กำลังโหลด…'}</strong><span>{weather.data?.location.label || 'ตำแหน่งระดับเมือง'}</span></span>;
}
