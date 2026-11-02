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
  // A thin handle glued to the right edge of the table that holds the caret.
  const launch=document.createElement('button');
  launch.type='button';launch.className='table-edit-launch';launch.textContent='编辑';
  launch.title='编辑光标所在表格：增删行列、调整尺寸';launch.setAttribute('aria-label','编辑表格');
  launch.hidden=true;
  // Mount inside the editable surface, beside it, never into the mount root:
  // Vditor reads the mount element's HTML as the document's first content.
  let mounted=false;
  function mountHandle(){
   const host=root.querySelector('.vditor-content')||root;
   if(launch.parentElement!==host&&root.contains(host)&&host!==root)host.append(launch);
   else if(!root.contains(launch))root.append(launch);
   mounted=true;
  }
  let selected=-1,anchor=null,layoutTimer=0;

  function caretTable(){
   const selection=getSelection();
   if(!selection||!selection.rangeCount)return null;
   let node=selection.anchorNode;
   if(node&&node.nodeType===3)node=node.parentElement;
   if(!node||!node.closest)return null;
   const table=node.closest('table');
   return table&&root.contains(table)?table:null;
  }
  // The button sits just above the table's top-right corner, clear of the text.
  function place(){
   const table=isBusy()?null:caretTable();
   if(!table){launch.hidden=true;anchor=null;return;}
   anchor=table;
   launch.hidden=false;
   const width=launch.offsetWidth||96;
   launch.style.left=Math.max(0, table.offsetLeft+table.offsetWidth-width)+'px';
   launch.style.top=Math.max(0, table.offsetTop-36)+'px';
   launch.style.height='';
  }
  function updateLayout(){
   if(isBusy())return;
   if(!mounted)mountHandle();
   for(const code of root.querySelectorAll('code[data-type="html-block"]')){
    const text=code.textContent.trim();
    if(text.match(marker)||/^<!-- studio-document \{[^\n]*\} -->$/.test(text))code.parentElement.classList.add('studio-table-meta');
    else if(text==='<!-- more -->')code.parentElement.classList.add('studio-more');
   }
   const parsed=tables(getValue()),visible=[...root.querySelectorAll('table')].filter(t=>t.getClientRects().length);
   visible.forEach((t,index)=>{const meta=parsed[index]?.meta;if(!meta||!Array.isArray(meta.widths))return;const widths=meta.widths.map(n=>Math.max(80,Math.min(600,Number(n)||180)));t.style.tableLayout='fixed';t.style.width=widths.reduce((a,b)=>a+b,0)+'px';t.style.maxWidth='none';for(const r of t.rows){for(let i=0;i<r.cells.length;i++)r.cells[i].style.width=(widths[i]||180)+'px';}for(let i=0;i<t.rows.length;i++)t.rows[i].style.height=Math.max(48,Math.min(500,Number(meta.heights?.[i])||64))+'px';});
   place();
  }
  new MutationObserver(()=>{clearTimeout(layoutTimer);layoutTimer=setTimeout(updateLayout,120);}).observe(root,{childList:true,subtree:true});
  document.addEventListener('selectionchange',()=>{if(!isBusy())place();});
  root.addEventListener('focusout',()=>setTimeout(()=>{if(!document.querySelector('.table-dialog')){launch.hidden=true;}},0));
  window.addEventListener('resize',()=>place());

  function editor(original,table){
   const rows=table.rows.map(r=>r.slice()),align=table.align.slice();
   // A fresh table has empty body cells; give them breathing room.
   for(const r of rows.slice(1))if(!r.some(cell=>cell)&&r.length===align.length)r.fill('',0);
   let widths=align.map((_,i)=>Math.min(600,Math.max(120,Number(table.meta.widths?.[i])||180)));
   let heights=rows.map((_,i)=>Math.min(400,Math.max(44,Number(table.meta.heights?.[i])||56)));
   let row=0,col=0,dragging=false;
   const dialog=document.createElement('dialog');
   dialog.className='table-dialog';
   dialog.setAttribute('aria-label','编辑表格');
   const heading=document.createElement('h2');heading.textContent='编辑表格';
   const help=document.createElement('p');
   help.textContent='点击单元格后可直接输入。Tab 移到下一个单元格，Enter 换行；拖动右边线调列宽，底边线调行高。第一行是表头。';
   const bar=document.createElement('div');bar.className='table-actions';
   const viewport=document.createElement('div');viewport.className='table-grid-viewport';
   const grid=document.createElement('table');grid.className='table-grid';viewport.append(grid);
   const info=document.createElement('span');info.className='table-selection';info.setAttribute('aria-live','polite');
   const actions=document.createElement('div');actions.className='table-dialog-footer';
   const cancel=document.createElement('button');cancel.type='button';cancel.textContent='取消';cancel.onclick=()=>dialog.close();
   const apply=document.createElement('button');apply.type='button';apply.textContent='应用到正文';apply.className='primary';apply.disabled=true;
   const hint=document.createElement('span');hint.className='table-selection';hint.textContent='先修改内容，再点“应用到正文”。';
   actions.append(info,cancel,apply);
   dialog.append(heading,help,bar,viewport,actions);
   document.body.append(dialog);
   dialog.addEventListener('close',()=>{dialog.remove();launch.hidden=true;});

   const fields=()=>[...grid.querySelectorAll('textarea')];
   function markDirty(){apply.disabled=false;hint.remove();}
   function highlight(){
    for(const cell of grid.querySelectorAll('th,td'))cell.classList.toggle('selected',+cell.dataset.row===row&&+cell.dataset.col===col);
    info.textContent=`第 ${row+1} 行 · 第 ${col+1} 列（共 ${rows.length} 行 × ${align.length} 列）`;
   }
   function focusCell([r,c]){
    const total=rows.length*align.length;
    if(!total)return;
    let index=r*align.length+c;
    if(index<0)index=total-1;
    if(index>=total)index=0;
    const field=grid.querySelector(`textarea[data-row="${Math.floor(index/align.length)}"][data-col="${index%align.length}"]`);
    if(field){field.focus();field.setSelectionRange(field.value.length,field.value.length);}
   }
   function action(label,fn,title){
    const b=document.createElement('button');b.type='button';b.textContent=label;b.onclick=()=>{if(dragging)return;fn();render();markDirty();};if(title)b.title=title;bar.append(b);return b;
   }
   action('上方加行',()=>{const at=Math.max(0,row);rows.splice(at,0,align.map(()=>''));heights.splice(at,0,56);row=at;},'在当前行上方插入一行');
   action('下方加行',()=>{rows.splice(row+1,0,align.map(()=>''));heights.splice(row+1,0,56);row++;},'在当前行下方插入一行');
   action('左侧加列',()=>{for(const r of rows)r.splice(col,0,'');align.splice(col,0,'---');widths.splice(col,0,160);},'在当前列左侧插入一列');
   action('右侧加列',()=>{col++;for(const r of rows)r.splice(col,0,'');align.splice(col,0,'---');widths.splice(col,0,160);},'在当前列右侧插入一列');
   action('删除本行',()=>{if(row===0){info.textContent='表头要保留；可以改表头文字，或删除整张表格。';return;}rows.splice(row,1);heights.splice(row,1);row=Math.max(0,row-1);},'删除当前行（表头不可删）');
   action('删除本列',()=>{if(align.length===1){info.textContent='至少保留一列。';return;}for(const r of rows)r.splice(col,1);align.splice(col,1);widths.splice(col,1);col=Math.min(col,align.length-1);},'删除当前列');
   action('重置尺寸',()=>{widths=align.map(()=>160);heights=rows.map(()=>56);},'恢复自动尺寸');

   function resize(handle,axis,index){
    handle.onpointerdown=e=>{e.preventDefault();e.stopPropagation();dragging=true;const start=axis==='x'?e.clientX:e.clientY,initial=axis==='x'?widths[index]:heights[index];handle.setPointerCapture(e.pointerId);
     handle.onpointermove=event=>{const value=Math.round(Math.max(axis==='x'?80:44,Math.min(axis==='x'?600:400,initial+(axis==='x'?event.clientX:event.clientY)-start)));if(axis==='x'){widths[index]=value;grid.querySelectorAll('col')[index].style.width=value+'px';grid.style.width=widths.reduce((a,b)=>a+b,0)+'px';}else{heights[index]=value;grid.rows[index].style.height=value+'px';for(const field of grid.rows[index].querySelectorAll('textarea'))field.style.height=(value-12)+'px';}info.textContent=(axis==='x'?'列宽':'行高')+'：'+value+' px';markDirty();};
     handle.onpointerup=handle.onpointercancel=()=>{dragging=false;handle.onpointermove=null;highlight();};
    };
    handle.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();const delta=['ArrowRight','ArrowDown'].includes(e.key)?10:-10;if(axis==='x')widths[index]=Math.max(80,Math.min(600,widths[index]+delta));else heights[index]=Math.max(44,Math.min(400,heights[index]+delta));render();markDirty();};
   }

   function render(){
    grid.replaceChildren();grid.style.width=widths.reduce((a,b)=>a+b,0)+'px';
    const group=document.createElement('colgroup');for(const width of widths){const c=document.createElement('col');c.style.width=width+'px';group.append(c);}grid.append(group);
    const body=document.createElement('tbody');grid.append(body);
    rows.forEach((cellsOfRow,ri)=>{
     const tr=document.createElement('tr');tr.style.height=heights[ri]+'px';body.append(tr);
     cellsOfRow.forEach((value,ci)=>{
      const td=document.createElement(ri===0?'th':'td');td.dataset.row=ri;td.dataset.col=ci;tr.append(td);
      const field=document.createElement('textarea');
      field.value=value.replace(/<br\s*\/?>/gi,'\n');
      field.style.height=(heights[ri]-12)+'px';
      field.dataset.row=ri;field.dataset.col=ci;
      field.setAttribute('aria-label',`第 ${ri+1} 行第 ${ci+1} 列`);
      field.onfocus=()=>{row=ri;col=ci;highlight();};
      field.oninput=()=>{rows[ri][ci]=field.value.replace(/\r?\n/g,'<br>');markDirty();};
      field.onkeydown=event=>{
       if(event.key==='Tab'){event.preventDefault();focusCell([ri,ci+(event.shiftKey?-1:1)]);}
       else if(event.key==='Enter'&&!event.shiftKey){event.preventDefault();if(ri+1<rows.length)focusCell([ri+1,ci]);}
      };
      td.append(field);
      if(ri===0){const h=document.createElement('span');h.className='column-resize';h.tabIndex=0;h.setAttribute('role','separator');h.setAttribute('aria-label',`调整第 ${ci+1} 列宽度`);h.setAttribute('aria-orientation','vertical');resize(h,'x',ci);td.append(h);}
      if(ci===cellsOfRow.length-1){const h=document.createElement('span');h.className='row-resize';h.tabIndex=0;h.setAttribute('role','separator');h.setAttribute('aria-label',`调整第 ${ri+1} 行高度`);h.setAttribute('aria-orientation','horizontal');resize(h,'y',ri);td.append(h);}
     });
    });
    highlight();
   }

   apply.onclick=()=>{
    if(isBusy()||getValue()!==original){info.textContent='正文已在其他操作中变化，请取消后重新打开，避免覆盖。';return;}
    const escape=s=>s.replace(/\r?\n/g,'<br>').replace(/(?<!\\)\|/g,'\\|');
    const line=r=>'| '+r.map(escape).join(' | ')+' |';
    const content='<!-- studio-table-layout '+JSON.stringify({widths,heights})+' -->\n'+[line(rows[0]),line(align),...rows.slice(1).map(line)].join('\n');
    setValue(original.slice(0,table.start)+content+original.slice(table.end));
    onChange();
    dialog.close();
   };
   render();
   dialog.showModal();
   focusCell([0,0]);
  }

  launch.onclick=()=>{
   if(isBusy())return;
   const table=anchor||caretTable();
   const original=getValue();
   const parsed=tables(original);
   const visible=[...root.querySelectorAll('table')].filter(t=>t.getClientRects().length);
   const index=visible.indexOf(table);
   const picked=index>=0?parsed[index]:parsed[0];
   if(!picked){alert('当前表格不是可识别的 Markdown 表格，请切换编辑模式后重试。');return;}
   editor(original,picked);
  };
  updateLayout();
 }};
})();
