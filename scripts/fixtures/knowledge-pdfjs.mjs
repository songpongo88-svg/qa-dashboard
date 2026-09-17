export const GlobalWorkerOptions = {};
export const pdfState = { destroyed: 0, rendered: [] };
export function getDocument({data}) {
 const text=new TextDecoder().decode(data),numPages=[...text.matchAll(/\/Type \/Page\b/g)].length;
 let destroyed=false;
 const doc={numPages,destroy:async()=>{if(!destroyed){destroyed=true;pdfState.destroyed++;}},getPage:async(number)=>({getViewport:({scale})=>({width:595*scale,height:842*scale,scale}),render:()=>{pdfState.rendered.push(number);return {promise:Promise.resolve(),cancel(){}};},getTextContent:async()=>({items:[]})})};
 return {promise:Promise.resolve(doc),destroy:doc.destroy};
}
export class TextLayer {constructor(){} async render(){} cancel(){}}
