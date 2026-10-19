'use strict';
// Markdown stays portable; optional sizing metadata lives beside its table.
(() => {
 const marker=/^<!-- studio-table-layout (\{[^\n]*\}) -->\s*$/;
 function cells(line){return line.trim().replace(/^\|/,'').replace(/(?<!\\)\|$/,'').split(/(?<!\\)\|/).map(s=>s.trim());}
 function tables(source){
  const lines=source.split('\n'),found=[];let fence=null,offset=0;
  for(let i=0;i<lines.length;i++){
   const line=lines[i],fm=line.match(/^ {0,3}(`{3,}|~{3,})/);
   if(fm){if(!fence)fence=fm[1];else if(fm[1][0]===fence[0]&&fm[1].length>=fence.length)fence=null;offset+=line.length+1;continue;}
   if(fence){offset+=line.length+1;continue;}
   const next=lines[i+1];
   if(next&&line.includes('|')&&cells(next).every(s=>/^:?-{3,}:?$/.test(s))&&cells(next).length===cells(line).length){
    const start=offset,rows=[cells(line)],align=cells(next);let j=i+2;
    while(j<lines.length&&lines[j].trim()&&lines[j].includes('|')){rows.push(cells(lines[j]));j++;}
    const width=align.length;for(const row of rows){while(row.length<width)row.push('');if(row.length>width)row.length=width;}
    let meta={},metaStart=start,previousIndex=i-1;while(previousIndex>=0&&!lines[previousIndex].trim())previousIndex--;
    const previous=lines[previousIndex]?.match(marker);
    if(previous){try{meta=JSON.parse(previous[1]);metaStart=start-lines.slice(previousIndex,i).reduce((n,s)=>n+s.length+1,0);}catch{}}
    found.push({start:metaStart,end:start+lines.slice(i,j).join('\n').length,rows,align,meta});
    offset+=lines.slice(i,j).reduce((n,s)=>n+s.length+1,0);i=j-1;
   }else offset+=line.length+1;
  }return found;
 }
 window.StudioTableTools={tables,mount({root,getValue,setValue,onChange,isBusy}){
  const launch=document.createElement('button');launch.type='button';launch.className='table-edit-launch';launch.textContent='表格 · 增删行列 / 拖动尺寸';launch.hidden=true;root.before(launch);
  let selected=-1;
  let layoutTimer;
  function updateLayout(){
   if(isBusy())return;
   for(const code of root.querySelectorAll('code[data-type="html-block"]')){if(code.textContent.trim().match(marker))code.parentElement.classList.add('studio-table-meta');}
   const parsed=tables(getValue()),visible=[...root.querySelectorAll('table')].filter(t=>t.getClientRects().length);
   visible.forEach((t,index)=>{const meta=parsed[index]?.meta;if(!meta||!Array.isArray(meta.widths))return;const widths=meta.widths.map(n=>Math.max(80,Math.min(600,Number(n)||180)));t.style.tableLayout='fixed';t.style.width=widths.reduce((a,b)=>a+b,0)+'px';t.style.maxWidth='none';for(const r of t.rows){for(let i=0;i<r.cells.length;i++)r.cells[i].style.width=(widths[i]||180)+'px';}for(let i=0;i<t.rows.length;i++)t.rows[i].style.height=Math.max(48,Math.min(500,Number(meta.heights?.[i])||64))+'px';});
  }
  new MutationObserver(()=>{clearTimeout(layoutTimer);layoutTimer=setTimeout(updateLayout,120);}).observe(root,{childList:true,subtree:true});
  root.addEventListener('click',event=>{const table=event.target.closest('table');if(!table){launch.hidden=true;return;}const visible=[...root.querySelectorAll('table')].filter(t=>t.getClientRects().length);selected=visible.indexOf(table);launch.hidden=selected<0;},true);
  launch.onclick=()=>{
   if(isBusy())return;const original=getValue(),table=tables(original)[selected];
   if(!table){alert('当前表格不是可识别的 Markdown 表格，请切回即时渲染模式后重试。');return;}
   const rows=table.rows.map(r=>r.slice()),align=table.align.slice();
   let widths=align.map((_,i)=>Math.min(600,Math.max(80,Number(table.meta.widths?.[i])||180)));
   let heights=rows.map((_,i)=>Math.min(500,Math.max(48,Number(table.meta.heights?.[i])||64)));
   let row=0,col=0,dragging=false;
   const dialog=document.createElement('dialog');dialog.className='table-dialog';
   const heading=document.createElement('h2');heading.textContent='整理表格';
   const help=document.createElement('p');help.textContent='点击单元格选中行列；拖动右边线调列宽、底边线调行高。第一行为表头。单元格内容按 Markdown 保存。';
   const bar=document.createElement('div');bar.className='table-actions';
   const viewport=document.createElement('div');viewport.className='table-grid-viewport';
   const grid=document.createElement('table');grid.className='table-grid';viewport.append(grid);
   const info=document.createElement('span');info.className='table-selection';info.setAttribute('aria-live','polite');
   const actions=document.createElement('div');actions.className='table-dialog-footer';
   const cancel=document.createElement('button');cancel.textContent='取消';cancel.onclick=()=>dialog.close();
   const apply=document.createElement('button');apply.textContent='应用到正文';apply.className='primary';
   actions.append(info,cancel,apply);dialog.append(heading,help,bar,viewport,actions);document.body.append(dialog);
   dialog.addEventListener('close',()=>{dialog.remove();launch.hidden=true;});
   function highlight(){for(const cell of grid.querySelectorAll('th,td'))cell.classList.toggle('selected',+cell.dataset.row===row&&+cell.dataset.col===col);info.textContent=`第 ${row+1} 行 · 第 ${col+1} 列（${rows.length} 行 × ${align.length} 列）`;}
   function button(label,action){const b=document.createElement('button');b.textContent=label;b.type='button';b.onclick=()=>{if(dragging)return;action();render();};bar.append(b);}
   button('↑ 上方加行',()=>{const at=Math.max(1,row);rows.splice(at,0,align.map(()=>''));heights.splice(at,0,64);row=at;});
   button('↓ 下方加行',()=>{rows.splice(row+1,0,align.map(()=>''));heights.splice(row+1,0,64);row++;});
   button('← 左侧加列',()=>{for(const r of rows)r.splice(col,0,'');align.splice(col,0,'---');widths.splice(col,0,180);});
   button('→ 右侧加列',()=>{col++;for(const r of rows)r.splice(col,0,'');align.splice(col,0,'---');widths.splice(col,0,180);});
   button('删除当前行',()=>{if(row===0){info.textContent='表头保留；可以修改表头文字。';return;}rows.splice(row,1);heights.splice(row,1);row=Math.max(0,row-1);});
   button('删除当前列',()=>{if(align.length===1)return;for(const r of rows)r.splice(col,1);align.splice(col,1);widths.splice(col,1);col=Math.min(col,align.length-1);});
   button('重置尺寸',()=>{widths=align.map(()=>180);heights=rows.map(()=>64);});
   function resize(handle,axis,index){
    handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();dragging=true;const start=axis==='x'?e.clientX:e.clientY,initial=axis==='x'?widths[index]:heights[index];handle.setPointerCapture(e.pointerId);
     handle.onpointermove=event=>{const value=Math.round(Math.max(axis==='x'?80:48,Math.min(axis==='x'?600:500,initial+(axis==='x'?event.clientX:event.clientY)-start)));if(axis==='x'){widths[index]=value;grid.querySelectorAll('col')[index].style.width=value+'px';grid.style.width=widths.reduce((a,b)=>a+b,0)+'px';}else{heights[index]=value;grid.rows[index].style.height=value+'px';for(const field of grid.rows[index].querySelectorAll('textarea'))field.style.height=(value-14)+'px';}info.textContent=(axis==='x'?'列宽':'行高')+'：'+value+' px';};
     handle.onpointerup=handle.onpointercancel=()=>{dragging=false;handle.onpointermove=null;highlight();};
    };
    handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const delta=['ArrowRight','ArrowDown'].includes(e.key)?10:-10;if(axis==='x')widths[index]=Math.max(80,Math.min(600,widths[index]+delta));else heights[index]=Math.max(48,Math.min(500,heights[index]+delta));render();};
   }
   function render(){
    grid.replaceChildren();grid.style.width=widths.reduce((a,b)=>a+b,0)+'px';const group=document.createElement('colgroup');for(const width of widths){const c=document.createElement('col');c.style.width=width+'px';group.append(c);}grid.append(group);
    const body=document.createElement('tbody');grid.append(body);
    rows.forEach((r,ri)=>{const tr=document.createElement('tr');tr.style.height=heights[ri]+'px';body.append(tr);r.forEach((value,ci)=>{const td=document.createElement(ri===0?'th':'td');td.dataset.row=ri;td.dataset.col=ci;tr.append(td);const field=document.createElement('textarea');field.value=value;field.setAttribute('aria-label',`第${ri+1}行第${ci+1}列`);field.style.height=(heights[ri]-14)+'px';field.onfocus=()=>{row=ri;col=ci;highlight();};field.oninput=()=>{rows[ri][ci]=field.value.replace(/\r?\n/g,'<br>');};td.append(field);
     if(ri===0){const h=document.createElement('span');h.className='column-resize';h.tabIndex=0;h.setAttribute('role','separator');h.setAttribute('aria-label',`调整第${ci+1}列宽度`);h.setAttribute('aria-orientation','vertical');resize(h,'x',ci);td.append(h);}
     if(ci===r.length-1){const h=document.createElement('span');h.className='row-resize';h.tabIndex=0;h.setAttribute('role','separator');h.setAttribute('aria-label',`调整第${ri+1}行高度`);h.setAttribute('aria-orientation','horizontal');resize(h,'y',ri);td.append(h);}
    });});highlight();
   }
   apply.onclick=()=>{if(isBusy()||getValue()!==original){info.textContent='正文已在其他操作中变化，请取消后重新打开，避免覆盖。';return;}
    const escape=s=>s.replace(/\r?\n/g,'<br>').replace(/(?<!\\)\|/g,'\\|');
    const line=r=>'| '+r.map(escape).join(' | ')+' |';
    const content='<!-- studio-table-layout '+JSON.stringify({widths,heights})+' -->\n'+[line(rows[0]),line(align),...rows.slice(1).map(line)].join('\n');
    setValue(original.slice(0,table.start)+content+original.slice(table.end));onChange();dialog.close();
   };
   render();dialog.showModal();
  };
 }};
})();
