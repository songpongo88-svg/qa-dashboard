import assert from "node:assert/strict";
import {mkdir,mkdtemp,rm} from "node:fs/promises";
import {resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {build} from "esbuild";
import React,{act} from "react";
import {JSDOM} from "jsdom";
const dom=new JSDOM("<!doctype html><html><body><div id='root'></div></body></html>",{url:"https://qa-dashboard.test",pretendToBeVisual:true});
for(const name of ["window","document","HTMLElement","MutationObserver","Event","MouseEvent","KeyboardEvent"])globalThis[name]=dom.window[name];
globalThis.IS_REACT_ACT_ENVIRONMENT=true;
globalThis.crypto=await import("node:crypto").then(mod=>mod.webcrypto);
const room={
 id:"SG-12345678",host:"alice",status:"playing",members:[
  {username:"alice",displayName:"Alice QA",joined:true,position:4,pot:200,skips:0,shields:0,rewardedTiles:[],claimedAt:""},
  {username:"bob",displayName:"Bob QA",joined:true,position:4,pot:100,skips:0,shields:0,rewardedTiles:[],claimedAt:""},
  {username:"charlie",displayName:"Charlie QA",joined:true,position:28,pot:80,skips:0,shields:0,rewardedTiles:[],claimedAt:""}],
 currentTurn:"alice",winner:"",invited:[],event:null,events:[],pendingTarget:null,
 createdAt:"2026-11-07T06:00:00Z",updatedAt:"2026-11-07T06:00:00Z",lastRoll:0,yourUsername:"alice"
};
const actions=[];
globalThis.fetch=async(url,options)=>{
 assert.equal(url,"/api/sparks-admin");
 const req=JSON.parse(options.body);
 actions.push(req.action);
 if(req.action==="snakes-state")return {ok:true,json:async()=>({rooms:[structuredClone(room)],activeRoomId:room.id,rules:{}})};
 if(req.action==="snakes-roll"){
  room.lastRoll=3;room.currentTurn="bob";room.event={actor:"alice",type:"reward",tile:7,delta:185,dice:3,description:"ค้นพบ 185 Sparks",at:new Date().toISOString()};
  room.members[0].position=7;room.members[0].pot+=185;
  return {ok:true,json:async()=>({room:structuredClone(room)})};
 }
 throw Error("Unexpected action "+req.action);
};
const folder=await mkdir(resolve("node_modules/.cache"),{recursive:true}).then(()=>mkdtemp(resolve("node_modules/.cache/snakes-ui-")));
const {createRoot}=await import("react-dom/client");
const root=createRoot(document.querySelector("#root"));
const click=async node=>{assert.ok(node);await act(async()=>node.dispatchEvent(new MouseEvent("click",{bubbles:true})));};
try{
 const out=resolve(folder,"SnakeUI.mjs");
 await build({entryPoints:["src/SnakesLaddersGame.tsx"],outfile:out,bundle:true,platform:"node",format:"esm",packages:"external",
   loader:{".css":"empty"},logLevel:"silent",
   plugins:[{name:"stub-photo",setup(builder){
     builder.onResolve({filter:/^\.\/profilePhotoStore$/},()=>({path:"photo",namespace:"test"}));
     builder.onLoad({filter:/.*/,namespace:"test"},()=>({contents:"export async function fetchStoredProfilePhoto(username){return {photoDataUrl:'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScL/nwAAAABJRU5ErkJggg=='}}",loader:"js"}));
   }}]});
 const {default:Game}=await import(pathToFileURL(out).href);
 await act(async()=>root.render(React.createElement(Game,{username:"alice",sessionId:"session-example-00001"})));
 const board=document.querySelector('[data-sparks-snakes="true"]');
 assert.ok(board);
 assert.equal(board.querySelectorAll("[data-snake-tile]").length,50,"must draw exactly 50 board squares");
 assert.ok(board.querySelector('[data-snake-tile="50"]'));
 assert.ok(board.querySelector('[data-snake-tile="4"]').textContent.includes("Alice QA"));
 assert.ok(board.querySelector('[data-snake-tile="4"]').textContent.includes("Bob QA"),"two avatars can occupy one tile");
 assert.ok(board.textContent.includes("Charlie QA"));
 assert.ok(board.querySelector(".sl-board-art"),"paint actual snakes and ladders across the board");
 assert.equal(board.querySelectorAll(".sl-snake-art").length,4);
 assert.equal(board.querySelectorAll(".sl-ladder-art").length,4);
 assert.equal(board.querySelectorAll(".sl-playercard").length,3);
 assert.ok(board.querySelectorAll(".sl-avatar img").length>=3,"display real QA user profile images");
 assert.match(board.querySelector(".sl-pot-panel").textContent,/200/);
 assert.ok(board.querySelector(".sl-claim").disabled,"Sparks cannot enter wallet during play");
 assert.ok(!actions.includes("snakes-claim"));
 await click(board.querySelector(".sl-roll"));
 assert.deepEqual(actions.filter(a=>a==="snakes-roll"),["snakes-roll"]);
 assert.ok(board.querySelector(".sl-popup"),"show reward popup for landing on Sparks tile");
 assert.match(board.querySelector(".sl-popup").textContent,/\+185 Sparks/);
 assert.equal(board.querySelector('[data-snake-tile="7"]').textContent.includes("Alice QA"),true);
 assert.match(board.querySelector(".sl-pot-panel").textContent,/385/);
 await click(board.querySelector(".sl-popup .sl-primary"));
 assert.ok(!board.querySelector(".sl-popup"));
 assert.equal(board.querySelector(".sl-roll").disabled,true,"other player's turn prevents extra roll");
 assert.ok(!actions.includes("snakes-claim"),"not credited before completed match");
 console.log("PASS Snakes UI: 50 tile neon board, real profile avatars and usernames, same-tile players, visible dice, earned popup, no early claim");
}finally{await act(async()=>root.unmount());dom.window.close();await rm(folder,{recursive:true,force:true});}
