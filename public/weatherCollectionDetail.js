const QA_W_CKEY='qa-dashboard:custom-theme-v1';
const QA_W_WKEY='weather-auto';
const QA_W_CACHE='qa-dashboard:weather-cache-v4';
const QA_W_REFRESH=30*60*1000;
let qaWeatherDetailTimer=0;
let qaWeatherDetailData=null;
const qaWeatherSelected=()=>{try{return localStorage.getItem(QA_W_CKEY)===QA_W_WKEY}catch{return false}};
const qaEsc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const qaN=(v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
function qaThemeName(item){
  if(!item)return'Weather';
  const names={
    'weather-clear':'Clear / Fair','weather-hot':'Sunny / Hot','weather-partly-cloudy':'Partly Cloudy','weather-cloudy':'Cloudy','weather-light-rain':'Light Rain','weather-rain':'Rain','weather-thunderstorm':'Thunderstorm','weather-fog':'Mist / Fog','weather-sunshower':'Rain + Clear'
  };
  if(item.id!=='weather-night')return names[item.id]||'Weather';
  const base=names[item.nightBase||'weather-clear']||'Clear / Fair';
  return base==='Clear / Fair'?'Night':`Night + ${base.replace('Sunny / Hot','Clear / Fair')}`;
}
function qaWeatherIcon(item){
  const t=qaThemeName(item);
  if(t.includes('Thunderstorm'))return'⛈️';
  if(t.includes('Rain + Clear'))return'🌦️';
  if(t.includes('Light Rain'))return'🌦️';
  if(t.includes('Rain'))return'🌧️';
  if(t.includes('Fog'))return'🌫️';
  if(t.includes('Cloudy')&&t.startsWith('Night'))return'☁️';
  if(t==='Night')return'🌙';
  if(t.includes('Cloudy'))return'☁️';
  if(t.includes('Partly'))return'🌤️';
  if(t.includes('Hot'))return'🌞';
  return'☀️';
}
function qaClassifyDay(c){
  const code=qaN(c.weather_code),temp=qaN(c.temperature_2m),cloud=qaN(c.cloud_cover),p=qaN(c.precipitation),rain=qaN(c.rain);
  if([95,96,99].includes(code))return'weather-thunderstorm';
  if([45,48].includes(code))return'weather-fog';
  const wet=p>0||rain>0||[51,53,55,56,57,61,63,65,66,67,80,81,82].includes(code);
  if(wet){if(cloud<=55&&(p>0||rain>0))return'weather-sunshower';if([51,53,56,61,80].includes(code)||Math.max(p,rain)<=1)return'weather-light-rain';return'weather-rain'}
  if(code===3||cloud>=75)return'weather-cloudy';
  if([1,2].includes(code)||cloud>=30)return'weather-partly-cloudy';
  return temp>=35?'weather-hot':'weather-clear';
}
function qaClassify(c){if(qaN(c.is_day,1)===1)return{id:qaClassifyDay(c),nightBase:''};let base=qaClassifyDay({...c,is_day:1});if(base==='weather-hot')base='weather-clear';return{id:'weather-night',nightBase:base}}
function qaLoadWeatherCache(){
  try{const raw=localStorage.getItem(QA_W_CACHE);if(!raw)return null;const x=JSON.parse(raw);return{...x,at:new Date(x.at)}}catch{return null}
}
function qaFormatDayTime(at){
  const d=at instanceof Date?at:new Date(at||Date.now());
  return new Intl.DateTimeFormat('en-GB',{weekday:'long',hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}
function qaFormatUpdate(at){
  const d=at instanceof Date?at:new Date(at||Date.now());
  return new Intl.DateTimeFormat('en-GB',{hour:'2-digit',minute:'2-digit',hour12:false}).format(d);
}
function qaHero(){return document.querySelector('[data-unified-robinhood-hero-v156="true"]')}
function qaWidget(){
  let el=document.getElementById('qa-weather-hero-detail');
  if(!el){el=document.createElement('div');el.id='qa-weather-hero-detail';el.className='qa-weather-hero-info';el.setAttribute('aria-live','polite')}
  const hero=qaHero();
  if(hero&&el.parentElement!==hero)hero.append(el);
  return el;
}
function qaPaintWeatherDetail(){
  const el=qaWidget();
  if(!qaWeatherSelected()||!qaHero()){el.style.display='none';return}
  const d=qaWeatherDetailData||qaLoadWeatherCache();
  if(!d){el.style.display='none';return}
  el.style.display='block';
  const theme=qaThemeName(d),isNight=d.id==='weather-night';
  el.dataset.tone=isNight||['weather-rain','weather-thunderstorm'].includes(d.id)?'light':'dark';
  const loc=d.locationDetail||d.loc||'Current location';
  const rainChance=d.rainChance==null?'—':`${Math.round(d.rainChance)}%`;
  const humidity=d.humidity==null?'—':`${Math.round(d.humidity)}%`;
  const wind=d.wind==null?'—':`${Math.round(d.wind)} km/h`;
  el.innerHTML=`<div class="qa-weather-location">${qaEsc(loc)}</div><div class="qa-weather-info-row"><div class="qa-weather-icon">${qaWeatherIcon(d)}</div><div class="qa-weather-temp">${Math.round(qaN(d.temp))}<small>°C</small></div><div class="qa-weather-metrics"><span>Rain chance: <b>${qaEsc(rainChance)}</b></span><span>Humidity: <b>${qaEsc(humidity)}</b></span><span>Wind: <b>${qaEsc(wind)}</b></span></div><div class="qa-weather-condition"><strong>${qaEsc(theme)}</strong><span>${qaEsc(qaFormatDayTime(d.at))}</span></div></div><div class="qa-weather-updated">Updated ${qaEsc(qaFormatUpdate(d.at))}</div>`;
}
async function qaReverse(lat,lon){
  try{
    const u=new URL('https://api.bigdatacloud.net/data/reverse-geocode-client');
    u.searchParams.set('latitude',lat.toFixed(6));u.searchParams.set('longitude',lon.toFixed(6));u.searchParams.set('localityLanguage','en');
    const r=await fetch(u,{cache:'no-store'});if(!r.ok)throw 0;const j=await r.json();
    const local=String(j.locality||j.localityInfo?.administrative?.[2]?.name||'').trim();
    const city=String(j.city||j.principalSubdivision||'').trim();
    if(local&&city&&local.toLowerCase()!==city.toLowerCase())return`${local}, ${city}`;
    return city||local||String(j.countryName||'Current location');
  }catch{return''}
}
async function qaFetchWeatherDetail(lat,lon){
  const u=new URL('https://api.open-meteo.com/v1/forecast');
  u.searchParams.set('latitude',lat.toFixed(6));u.searchParams.set('longitude',lon.toFixed(6));
  u.searchParams.set('current','temperature_2m,relative_humidity_2m,precipitation,rain,weather_code,cloud_cover,wind_speed_10m,is_day');
  u.searchParams.set('hourly','precipitation_probability');u.searchParams.set('timezone','auto');u.searchParams.set('forecast_days','1');
  const [res,place]=await Promise.all([fetch(u,{cache:'no-store'}),qaReverse(lat,lon)]);if(!res.ok)throw 0;
  const json=await res.json(),c=json.current||{},times=json.hourly?.time||[],probs=json.hourly?.precipitation_probability||[];
  let rainChance=null;
  if(times.length&&probs.length){const target=new Date(c.time||Date.now()).getTime();let best=0,bestDiff=Infinity;times.forEach((t,i)=>{const diff=Math.abs(new Date(t).getTime()-target);if(diff<bestDiff){bestDiff=diff;best=i}});rainChance=probs[best]??null}
  const kind=qaClassify(c);
  qaWeatherDetailData={id:kind.id,nightBase:kind.nightBase,temp:qaN(c.temperature_2m),humidity:c.relative_humidity_2m==null?null:qaN(c.relative_humidity_2m),wind:c.wind_speed_10m==null?null:qaN(c.wind_speed_10m),rainChance,loc:place||qaLoadWeatherCache()?.loc||'Current location',locationDetail:place||'',at:new Date()};
  qaPaintWeatherDetail();
}
function qaRefreshWeatherDetail(){
  clearTimeout(qaWeatherDetailTimer);
  if(!qaWeatherSelected()){qaPaintWeatherDetail();qaWeatherDetailTimer=window.setTimeout(qaRefreshWeatherDetail,1500);return}
  const cached=qaLoadWeatherCache();if(cached&&!qaWeatherDetailData){qaWeatherDetailData={...cached};qaPaintWeatherDetail()}
  if(!navigator.geolocation){qaPaintWeatherDetail();qaWeatherDetailTimer=window.setTimeout(qaRefreshWeatherDetail,QA_W_REFRESH);return}
  navigator.geolocation.getCurrentPosition(p=>{qaFetchWeatherDetail(p.coords.latitude,p.coords.longitude).catch(()=>qaPaintWeatherDetail());qaWeatherDetailTimer=window.setTimeout(qaRefreshWeatherDetail,QA_W_REFRESH)},()=>{qaPaintWeatherDetail();qaWeatherDetailTimer=window.setTimeout(qaRefreshWeatherDetail,5*60*1000)},{enableHighAccuracy:true,timeout:12000,maximumAge:10*60*1000});
}
function qaWeatherHeartbeat(){qaPaintWeatherDetail();window.setTimeout(qaWeatherHeartbeat,1500)}
qaRefreshWeatherDetail();qaWeatherHeartbeat();
window.addEventListener('focus',()=>{if(qaWeatherSelected())qaRefreshWeatherDetail()});
document.addEventListener('visibilitychange',()=>{if(!document.hidden&&qaWeatherSelected())qaRefreshWeatherDetail()});
