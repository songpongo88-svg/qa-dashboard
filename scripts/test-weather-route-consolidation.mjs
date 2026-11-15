import assert from "node:assert/strict";
import {readFileSync, existsSync} from "node:fs";
import {fileURLToPath} from "node:url";
import path from "node:path";
import handler from "../api/reverse-geocode.js";

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const config=JSON.parse(readFileSync(path.join(root,"vercel.json"),"utf8"));
assert.ok((config.rewrites||[]).some(x=>x.source==="/api/weather-location"&&x.destination==="/api/reverse-geocode?mode=ip-location"),"weather-location rewrite preserved");
assert.ok(!existsSync(path.join(root,"api/weather-location.js")),"no duplicate deployed IP-location function");
const call=async (method,headers,query={mode:"ip-location"})=>{
 const res={headers:{},statusCode:200,setHeader(key,value){this.headers[key]=value;return this;},status(n){this.statusCode=n;return this;},json(value){this.value=value;return this;}};
 await handler({method,headers,query},res);return res;
};
let r=await call("GET",{});
assert.equal(r.statusCode,200);
assert.deepEqual(r.value,{label:"กรุงเทพมหานคร",latitude:13.75,longitude:100.5,source:"fallback"});
r=await call("GET",{"x-vercel-ip-city":"Chiang%20Mai","x-vercel-ip-latitude":"18.78793","x-vercel-ip-longitude":"98.99310"});
assert.equal(r.statusCode,200);
assert.deepEqual(r.value,{label:"Chiang Mai",latitude:18.79,longitude:98.99,source:"ip"});
r=await call("POST",{});
assert.equal(r.statusCode,405);
r=await call("GET",{"x-vercel-ip-city":"Test","x-vercel-ip-latitude":"999","x-vercel-ip-longitude":"100"});
assert.equal(r.value.source,"fallback");
r=await call("GET",{}, {lat:"abc",lon:"100"});
assert.equal(r.statusCode,400);
console.log("PASS Vercel function consolidation: weather-location rewrite, fallback, valid IP, invalid coords, reverse geocode contract");
