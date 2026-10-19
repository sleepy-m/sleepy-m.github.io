'use strict';
// Only numeric dimensions are accepted; no user-authored CSS is interpolated.
function layout(html){
 return html.replace(/<!-- studio-table-layout (\{[^\n]*\}) -->\s*(<table\b[\s\S]*?<\/table>)/g,(all,json,table)=>{
  let data;try{data=JSON.parse(json);}catch{return all;}
  if(!Array.isArray(data.widths)||!Array.isArray(data.heights)||data.widths.length>100||data.heights.length>1000)return all;
  const widths=data.widths.map(n=>Math.max(80,Math.min(600,Number(n)||180)));
  const heights=data.heights.map(n=>Math.max(48,Math.min(500,Number(n)||64)));
  table=table.replace(/<table\b[^>]*>/,`<table style="table-layout:fixed;width:${widths.reduce((a,b)=>a+b,0)}px;max-width:none"><colgroup>${widths.map(n=>`<col style="width:${n}px">`).join('')}</colgroup>`);
  let row=0;table=table.replace(/<tr\b[^>]*>/g,tag=>tag.replace(/>$/,` style="height:${heights[row++]||64}px">`));
  return '<div class="sized-table-scroll" style="overflow-x:auto;max-width:100%">'+table+'</div>';
 });
}
if(typeof hexo!=='undefined')hexo.extend.filter.register('after_post_render',data=>{data.content=layout(data.content);return data;});
module.exports=layout;
