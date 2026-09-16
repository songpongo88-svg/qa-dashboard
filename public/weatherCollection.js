const WKEY='weather-auto';
const CKEY='qa-dashboard:custom-theme-v1';
const CACHE_KEY='qa-dashboard:weather-cache-v4';
const REFRESH_MS=30*60*1000;
const SIDEBAR_REFRESH_MS=3000;
const STATES=[
 ['weather-clear','Clear / Fair','☀️'],
 ['weather-hot','Sunny / Hot','🌞'],
 ['weather-partly-cloudy','Partly Cloudy','🌤️'],
 ['weather-cloudy','Cloudy','☁️'],
 ['weather-light-rain','Light Rain','🌦️'],
 ['weather-rain','Rain','🌧️'],
 ['weather-thunderstorm','Thunderstorm','⛈️'],
 ['weather-fog','Mist / Fog','🌫️'],
 ['weather-sunshower','Rain + Clear','🌦️'],
 ['weather-night','Night','🌙']
];
let data=null,state='idle',msg='',timer=0,serial=0,raf=0;
const originalSidebar=new WeakMap();
const selected=()=>{try{return localStorage.getItem(CKEY)===WKEY}catch{return false}};
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const n=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
const meta=id=>STATES.find(x=>x[0]===id)||STATES[0];

function classifyDay(c){
  const code=n(c.weather_code),temp=n(c.temperature_2m),cloud=n(c.cloud_cover),p=n(c.precipitation),rain=n(c.rain);
  if([95,96,99].includes(code))return'weather-thunderstorm';
  if([45,48].includes(code))return'weather-fog';
  const wet=p>0||rain>0||[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code);
  if(wet){
    if(cloud<=55&&(p>0||rain>0))return'weather-sunshower';
    if([51,53,56,61,80].includes(code)||Math.max(p,rain)<=1)return'weather-light-rain';
    return'weather-rain';
  }
  if(code===3||cloud>=75)return'weather-cloudy';
  if([1,2].includes(code)||cloud>=30)return'weather-partly-cloudy';
  return temp>=35?'weather-hot':'weather-clear';
}
function classify(c){
  if(n(c.is_day,1)===1)return{id:classifyDay(c),nightBase:''};
  let base=classifyDay({...c,is_day:1});
  if(base==='weather-hot')base='weather-clear';
  return{id:'weather-night',nightBase:base};
}
function themeName(item=data){
  if(!item)return'Weather Collection';
  if(item.id!=='weather-night')return meta(item.id)[1];
  const b=meta(item.nightBase||'weather-clear')[1].replace('Sunny / Hot','Clear / Fair');
  return b==='Clear / Fair'?'Night':`Night + ${b}`;
}
function saveCache(){
  if(!data)return;
  try{localStorage.setItem(CACHE_KEY,JSON.stringify({...data,at:data.at instanceof Date?data.at.toISOString():data.at}))}catch{}
}
function loadCache(){
  try{
    const r=localStorage.getItem(CACHE_KEY);if(!r)return null;
    const x=JSON.parse(r),at=new Date(x.at);
    if(!Number.isFinite(at.getTime())||Date.now()-at.getTime()>60*60*1000)return null;
    return{...x,at};
  }catch{return null}
}
function setDatasets(){
  const root=document.documentElement;
  if(!selected()){
    delete root.dataset.qaWeatherCollection;
    delete root.dataset.qaWeatherState;
    delete root.dataset.qaWeatherNight;
    return;
  }
  root.dataset.qaWeatherCollection='auto';
  root.dataset.qaWeatherState=data?.id||root.dataset.qaWeatherState||'weather-clear';
  root.dataset.qaWeatherNight=data?.nightBase||'';
}
function selectWeather(){
  try{localStorage.setItem(CKEY,WKEY)}catch{}
  setDatasets();sync();locate(true);
}
function disableWeather(){
  if(!selected())return;
  try{localStorage.removeItem(CKEY)}catch{}
  serial++;clearTimeout(timer);setDatasets();removeInline();restoreSidebar();
}
async function place(lat,lon){
  try{
    const u=new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    u.searchParams.set('latitude',lat.toFixed(6));
    u.searchParams.set('longitude',lon.toFixed(6));
    u.searchParams.set('localityLanguage','en');
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw 0;
    const j=await r.json();
    return String(j.city||j.locality||j.principalSubdivision||j.countryName||'Current location');
  }catch{return'Current location'}
}
async function weather(lat,lon,s){
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',lat.toFixed(6));
  u.searchParams.set('longitude',lon.toFixed(6));
  u.searchParams.set('current','temperature_2m,apparent_temperature,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,pressure_msl,wind_speed_10m,is_day');
  u.searchParams.set('timezone','auto');
  const [r,loc]=await Promise.all([fetch(u,{cache:'no-store'}),place(lat,lon)]);
  if(!r.ok)throw 0;
  const c=(await r.json()).current;
  if(!c||s!==serial||!selected())return;
  const k=classify(c);
  data={id:k.id,nightBase:k.nightBase,temp:n(c.temperature_2m),feel:c.apparent_temperature==null?null:n(c.apparent_temperature),humidity:c.relative_humidity_2m==null?null:n(c.relative_humidity_2m),pressure:c.pressure_msl==null?null:n(c.pressure_msl),wind:c.wind_speed_10m==null?null:n(c.wind_speed_10m),loc,at:new Date()};
  state='ready';msg='';saveCache();setDatasets();paint();schedule();
}
function locate(user=true){
  if(!selected())return;
  if(!navigator.geolocation){state='error';msg='Location is not supported by this browser';paint();return}
  state='requesting';msg=user?'Waiting for location permission…':'Updating location…';paint();
  const s=++serial;
  navigator.geolocation.getCurrentPosition(
    p=>weather(p.coords.latitude,p.coords.longitude,s).catch(()=>{if(s!==serial)return;state='error';msg='Unable to update weather';paint();schedule(5*60*1000)}),
    e=>{if(s!==serial)return;state=e.code===1?'denied':'error';msg=e.code===1?'Location blocked · enable it in Site settings':'Unable to read current location';paint()},
    {enableHighAccuracy:true,timeout:15000,maximumAge:10*60*1000}
  );
}
function schedule(ms=REFRESH_MS){clearTimeout(timer);if(selected())timer=window.setTimeout(()=>locate(false),ms)}
function formatTime(at){if(!(at instanceof Date)||!Number.isFinite(at.getTime()))return'—';return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(at)}
function cleanupLegacy(){document.getElementById('qa-weather-widget')?.remove();document.getElementById('qa-weather-atmosphere')?.remove();document.querySelectorAll('[data-qa-weather-legacy]').forEach(x=>x.remove())}
function inline(){let el=document.getElementById('qa-weather-inline');if(el)return el;el=document.createElement('div');el.id='qa-weather-inline';el.className='qa-weather-inline';el.setAttribute('aria-live','polite');document.body.append(el);return el}
function removeInline(){document.getElementById('qa-weather-inline')?.remove()}
function sidebarButton(){return document.querySelector('button[aria-label^="Theme ปัจจุบัน"],button[data-qa-weather-sidebar="true"]')}
function patchSidebar(){
  if(!selected())return restoreSidebar();
  const b=sidebarButton();if(!b)return;
  if(!originalSidebar.has(b))originalSidebar.set(b,{html:b.innerHTML,aria:b.getAttribute('aria-label')||''});
  const label=b.querySelector('.qa-sidebar-label');if(!label)return;
  const t=themeName(),temp=data?`${Math.round(data.temp)}°C`:'—°C',loc=data?.loc||'Location';
  const signature=`${t}|${temp}|${loc}`;
  if(b.dataset.qaWeatherSidebar==='true'&&b.dataset.qaWeatherSignature===signature)return;
  b.dataset.qaWeatherSidebar='true';
  b.dataset.qaWeatherSignature=signature;
  b.setAttribute('aria-label',`Weather Collection · ${t} · ${temp} · ${loc}`);
  label.innerHTML=`<span class="block text-[8px] font-normal uppercase tracking-[0.12em]">Weather Collection</span><span class="block truncate text-[10px] font-medium text-white">${esc(t)} · ${esc(temp)}</span><span class="block truncate text-[8px] font-normal text-violet-200">${esc(loc)}</span>`;
}
function restoreSidebar(){
  document.querySelectorAll('button[data-qa-weather-sidebar="true"]').forEach(b=>{
    const o=originalSidebar.get(b);
    if(o){b.innerHTML=o.html;b.setAttribute('aria-label',o.aria)}
    delete b.dataset.qaWeatherSidebar;
    delete b.dataset.qaWeatherSignature;
  });
}
function paint(){
  cleanupLegacy();
  if(!selected()){removeInline();restoreSidebar();return}
  setDatasets();
  const el=inline();
  if(data&&state==='ready'){
    const t=themeName();
    el.dataset.tone=data.id==='weather-night'||['weather-rain','weather-thunderstorm'].includes(data.id)?'light':'dark';
    el.innerHTML=`<div class="w-inline-kicker">WEATHER COLLECTION · ${esc(t.toUpperCase())}</div><div class="w-inline-main">${Math.round(data.temp)}°C · ${esc(data.loc.toUpperCase())}</div><div class="w-inline-sub">UPDATED ${formatTime(data.at)}</div>`;
  }else{
    el.dataset.tone='dark';
    el.innerHTML=`<div class="w-inline-kicker">WEATHER COLLECTION</div><div class="w-inline-main">${state==='requesting'?'GETTING LOCATION…':'LOCATION REQUIRED'}</div><div class="w-inline-sub">${esc(msg||'SELECT WEATHER COLLECTION TO CONTINUE')}</div>`;
  }
  patchSidebar();renderSoon();
}
function dialog(){return document.querySelector('section[role="dialog"][aria-labelledby="qa-theme-picker-title"]')}
function panel(){return dialog()?.querySelector('.qa-theme-collection-panel')||null}
function tablist(){return dialog()?.querySelector('.qa-theme-collection-tabs')||null}
function ensureWeatherTab(){
  const tabs=tablist();if(!tabs)return;
  let tab=tabs.querySelector('#qa-collection-tab-weather');
  if(!tab){
    tab=document.createElement('button');tab.id='qa-collection-tab-weather';tab.type='button';tab.role='tab';tab.textContent='Weather Collection';tab.onclick=()=>showWeatherPanel();tabs.append(tab);
  }
  tab.setAttribute('aria-selected',String(panel()?.dataset.qaPickerCollection==='weather'));
  tab.tabIndex=panel()?.dataset.qaPickerCollection==='weather'?0:-1;
}
function weatherPanel(){
  let box=document.getElementById('qa-weather-picker-panel');if(box)return box;
  const p=panel();if(!p)return null;
  box=document.createElement('div');box.id='qa-weather-picker-panel';box.dataset.qaWeatherAdded='true';box.className='qa-weather-picker-panel';
  box.innerHTML=`<button type="button" class="w-picker-master"><span class="w-picker-title">Weather Collection</span><span class="w-picker-desc">Uses your current location and changes automatically with real weather.</span><strong>Use Weather Collection</strong></button><div class="w-picker-grid">${STATES.map(([id,name,icon])=>`<div class="w-picker-state ${id}" data-weather-state="${id}"><span>${icon}</span><b>${esc(name)}</b><small>Auto</small></div>`).join('')}</div><p class="w-picker-status"></p>`;
  box.querySelector('.w-picker-master').onclick=()=>selectWeather();p.append(box);return box;
}
function showWeatherPanel(){
  const p=panel();if(!p)return;
  p.dataset.qaPickerCollection='weather';ensureWeatherTab();weatherPanel();updatePicker();
  [...tablist().querySelectorAll('[role="tab"]')].forEach(t=>t.setAttribute('aria-selected',String(t.id==='qa-collection-tab-weather')));
}
function updatePicker(){
  const box=weatherPanel();if(!box)return;
  box.querySelectorAll('.w-picker-state').forEach(x=>x.toggleAttribute('data-current',selected()&&data?.id===x.dataset.weatherState));
  const status=box.querySelector('.w-picker-status');const master=box.querySelector('.w-picker-master');master.toggleAttribute('data-active',selected());
  if(status)status.textContent=selected()?(data&&state==='ready'?`${themeName()} · ${Math.round(data.temp)}°C · ${data.loc}`:msg||'Waiting for weather data…'):'Weather Collection is off';
}
function renderPicker(){
  const d=dialog();if(!d)return;
  ensureWeatherTab();weatherPanel();updatePicker();
  const p=panel();
  if(p?.dataset.qaPickerCollection==='weather'){
    p.querySelectorAll(':scope > *:not(#qa-weather-picker-panel)').forEach(x=>x.style.display='none');
    const box=document.getElementById('qa-weather-picker-panel');if(box)box.style.display='grid';
  }else{
    p?.querySelectorAll(':scope > *:not(#qa-weather-picker-panel)').forEach(x=>x.style.removeProperty('display'));
    const box=document.getElementById('qa-weather-picker-panel');if(box)box.style.display='none';
  }
}
function renderSoon(delay=0){
  if(delay){window.setTimeout(()=>renderSoon(),delay);return}
  if(raf)return;
  raf=requestAnimationFrame(()=>{raf=0;renderPicker()});
}
function hooks(){
  document.addEventListener('click',e=>{
    const target=e.target instanceof Element?e.target:null;if(!target)return;
    const themeButton=target.closest('button[aria-label^="Theme ปัจจุบัน"],button[data-qa-weather-sidebar="true"]');
    if(themeButton){renderSoon(60);renderSoon(180);if(selected())window.setTimeout(patchSidebar,220);return}
    const nativeTab=target.closest('.qa-theme-collection-tabs button:not(#qa-collection-tab-weather)');
    if(nativeTab){
      setTimeout(()=>{const p=panel();if(p&&p.dataset.qaPickerCollection==='weather')p.dataset.qaPickerCollection=(nativeTab.id||'').replace('qa-collection-tab-','');renderSoon()},0);
      return;
    }
    const p=target.closest('.qa-theme-collection-panel');
    if(p&&p.dataset.qaPickerCollection!=='weather'){
      const b=target.closest('button');
      if(b&&!b.closest('#qa-weather-picker-panel'))setTimeout(()=>{disableWeather();paint()},0);
    }
    if(selected())window.setTimeout(patchSidebar,0);
  },true);
}
function sync(){
  setDatasets();
  if(!selected()){removeInline();restoreSidebar();clearTimeout(timer);serial++;renderSoon();return}
  const cached=loadCache();if(cached&&!data){data=cached;state='ready'}
  paint();
}
async function restore(){
  if(!selected())return;
  const cached=loadCache();if(cached){data=cached;state='ready';paint()}
  try{
    if(navigator.permissions?.query){
      const p=await navigator.permissions.query({name:'geolocation'});if(!selected())return;
      if(p.state==='granted')locate(false);
      else if(p.state==='denied'){state='denied';msg='Location blocked · enable it in Site settings';paint()}
      else if(!data){state='idle';msg='Select Weather Collection to allow location';paint()}
      p.onchange=()=>{if(p.state==='granted'&&selected())locate(false);else paint()};
      return;
    }
  }catch{}
  if(!data){state='idle';msg='Select Weather Collection to allow location';paint()}
}
function start(){
  cleanupLegacy();hooks();sync();restore();renderSoon(100);
  window.setInterval(()=>{if(selected())patchSidebar()},SIDEBAR_REFRESH_MS);
  window.addEventListener('storage',e=>{if(e.key===CKEY||e.key===null){sync();restore()}});
  window.addEventListener('focus',()=>{if(selected()&&state==='ready')locate(false)});
  window.addEventListener('popstate',()=>{renderSoon(100);if(selected())window.setTimeout(patchSidebar,150)});
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&selected()){patchSidebar();if(state==='ready')locate(false)}});
}
start();
