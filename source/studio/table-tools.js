'use strict';
// Markdown tables stay portable; editing controls live beside the active cell.
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
   if(next&&line.includes('|')&&cells(next).every(s=>/^:?-+:?$/.test(s))&&cells(next).length===cells(line).length){
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
 function normalizeSeparators(value){
  if(!value||!value.includes('|'))return value;
  return value.split('\n').map(line=>{
   if(!line.trim().startsWith('|'))return line;
   const parts=line.trim().replace(/^\|/,'').replace(/\|$/,'').split('|');
   if(!parts.length||!parts.every(cell=>/^\s*:?-+:?\s*$/.test(cell)))return line;
   return '| '+parts.map(cell=>{const text=cell.trim();return(text.startsWith(':')?':':'')+'---'+(text.endsWith(':')?':':'');}).join(' | ')+' |';
  }).join('\n');
 }

 window.StudioTableTools={normalizeSeparators,tables,mount({root,getValue,setValue,onChange,isBusy}){
  const toolbar=document.createElement('div');toolbar.className='table-context-tools';toolbar.setAttribute('role','toolbar');toolbar.setAttribute('aria-label','当前单元格的表格操作');toolbar.hidden=true;
  const handles=document.createElement('div');handles.className='table-column-handles';handles.setAttribute('aria-hidden','true');
  document.body.append(toolbar,handles);
  let current={index:-1,row:0,col:0,table:null},layoutTimer=0,placeTimer=0,dragging=false,handleTable=null,handleList=[];
  const visibleTables=()=>[...root.querySelectorAll('table')].filter(table=>table.getClientRects().length);
  function domTableIndex(table){return visibleTables().indexOf(table);}
  function cellAt(node){
   const cell=node?.closest?.('td,th'),table=cell?.closest('table');
   if(!cell||!root.contains(table))return null;
   const index=domTableIndex(table);if(index<0)return null;
   return{index,row:cell.parentElement.rowIndex,col:cell.cellIndex,table,cell};
  }
  function selectionCell(){
   const selection=getSelection();if(!selection?.rangeCount)return null;
   let node=selection.anchorNode;if(node?.nodeType===3)node=node.parentElement;
   return cellAt(node);
  }
  function choose(hit){if(!hit)return;current={index:hit.index,row:hit.row,col:hit.col,table:hit.table};place();}
  function clamp(n,min,max){return Math.max(min,Math.min(max,n));}
  function dimensions(index,domTable){
   const parsed=tables(getValue())[index];
   const width=parsed?.align.length||domTable.rows[0]?.cells.length||1;
   const widths=Array.from({length:width},(_,i)=>clamp(Number(parsed?.meta.widths?.[i])||domTable.rows[0]?.cells[i]?.getBoundingClientRect().width||180,80,600));
   const heights=Array.from({length:domTable.rows.length},(_,i)=>clamp(Number(parsed?.meta.heights?.[i])||domTable.rows[i]?.getBoundingClientRect().height||56,44,500));
   return{widths,heights};
  }
  function serialize(rows,align,widths,heights){
   const escape=value=>String(value??'').replace(/<br\s*\/?>/gi,' ').replace(/\r?\n/g,' ').replace(/(?<!\\)\|/g,'\\|');
   const line=row=>'| '+row.map(escape).join(' | ')+' |';
   const rule=value=>(value.startsWith(':')?':':'')+'---'+(value.endsWith(':')?':':'');
   return'<!-- studio-table-layout '+JSON.stringify({widths,heights})+' -->\n'+[line(rows[0]),line(align.map(rule)),...rows.slice(1).map(line)].join('\n');
  }
  function writeTable(index,mutate,focus){
   if(isBusy())return false;
   const source=getValue(),items=tables(source),table=items[index];if(!table)return false;
   const rows=table.rows.map(row=>row.slice()),align=table.align.slice();
   let{widths,heights}=dimensions(index,visibleTables()[index]);
   const data={rows,align,widths,heights};mutate(data);
   if(!rows.length||!align.length)return false;
   while(heights.length<rows.length)heights.push(56);heights.length=rows.length;
   while(widths.length<align.length)widths.push(160);widths.length=align.length;
   for(const row of rows){while(row.length<align.length)row.push('');row.length=align.length;}
   const value=source.slice(0,table.start)+serialize(rows,align,widths,heights)+source.slice(table.end);
   setValue(value);onChange();
   current={index,row:clamp(focus.row,0,rows.length-1),col:clamp(focus.col,0,align.length-1),table:null};
   setTimeout(()=>{
    const next=visibleTables()[index];if(!next)return;
    current.table=next;focusCell(next,current.row,current.col);place();
   },80);
   return true;
  }
  function focusCell(table,row,col){
   const cell=table.rows[row]?.cells[col];if(!cell)return;
   const roots=[...root.querySelectorAll('.vditor-ir .vditor-reset,.vditor-wysiwyg .vditor-reset,.vditor-sv .vditor-reset')];
   const editor=roots.find(node=>node.isConnected&&node.getClientRects().length&&node.isContentEditable)||roots.find(node=>node.isConnected&&node.getClientRects().length);
   editor?.focus();
   const range=document.createRange();range.selectNodeContents(cell);range.collapse(false);
   const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
   choose(cellAt(cell));
  }
  function makeButton(label,title,handler){
   const button=document.createElement('button');button.type='button';button.className='table-context-button';button.textContent=label;button.title=title;button.setAttribute('aria-label',title);
   button.addEventListener('mousedown',event=>event.preventDefault());button.addEventListener('click',handler);return button;
  }
  const addRow=makeButton('＋ 行 ↓','在当前行下方插入一行',()=>writeTable(current.index,data=>{data.rows.splice(current.row+1,0,data.align.map(()=>''));data.heights.splice(current.row+1,0,56);current.row++;},{get row(){return current.row;},get col(){return current.col;}}));
  const addCol=makeButton('＋ 列 →','在当前列右侧插入一列',()=>writeTable(current.index,data=>{const at=current.col+1;data.align.splice(at,0,'---');data.widths.splice(at,0,160);data.rows.forEach(row=>row.splice(at,0,''));current.col=at;},{get row(){return current.row;},get col(){return current.col;}}));
  const deleteRow=makeButton('删行','删除当前行（表头行会保留）',()=>writeTable(current.index,data=>{if(current.row>0){data.rows.splice(current.row,1);data.heights.splice(current.row,1);current.row--; }},{get row(){return current.row;},get col(){return current.col;}}));
  const deleteCol=makeButton('删列','删除当前列',()=>writeTable(current.index,data=>{if(data.align.length>1){data.align.splice(current.col,1);data.widths.splice(current.col,1);data.rows.forEach(row=>row.splice(current.col,1));current.col=Math.max(0,current.col-1);}},{get row(){return current.row;},get col(){return current.col;}}));
  const position=document.createElement('span');position.className='table-context-position';position.setAttribute('aria-live','polite');
  toolbar.append(addRow,addCol,deleteRow,deleteCol,position);

  function applyWidths(table,widths){
   table.style.tableLayout='fixed';table.style.width=(widths.reduce((a,b)=>a+b,0)+2)+'px';table.style.maxWidth='none';
   for(const row of table.rows)for(let col=0;col<row.cells.length;col++)row.cells[col].style.width=(widths[col]||160)+'px';
  }
  function clearHandles(){handles.replaceChildren();handleTable=null;handleList=[];}
  function buildHandles(table,index,widths){
   const head=table.rows[0];if(!head)return;
   const count=Math.max(0,head.cells.length-1);
   if(handleTable!==table||handleList.length!==count){clearHandles();handleTable=table;}
   const positionHandle=(handle,col)=>{
    const edge=head.cells[col].getBoundingClientRect(),bounds=table.getBoundingClientRect();
    handle.style.left=(edge.right-4)+'px';handle.style.top=bounds.top+'px';handle.style.height=bounds.height+'px';
   };
   if(handleList.length===count){handleList.forEach((handle,col)=>positionHandle(handle,col));return;}
   for(let col=0;col<head.cells.length-1;col++){
    const handle=document.createElement('button');handle.type='button';handle.className='table-column-handle';handle.title='拖动调整列宽';handle.setAttribute('aria-label',`拖动调整第 ${col+1} 列宽`);handle.setAttribute('aria-orientation','vertical');handle.setAttribute('role','separator');
    positionHandle(handle,col);handles.append(handle);handleList.push(handle);
    handle.onpointerdown=event=>{
     event.preventDefault();event.stopPropagation();dragging=true;
     const start=event.clientX,initial=widths[col],next=widths.slice();
     const move=moveEvent=>{if(!dragging)return;next[col]=clamp(initial+moveEvent.clientX-start,80,600);applyWidths(table,next);};
     const finish=()=>{
      if(!dragging)return;
      dragging=false;handle.onpointermove=null;
      document.removeEventListener('pointermove',move,true);document.removeEventListener('mousemove',move,true);
      document.removeEventListener('pointerup',finish,true);document.removeEventListener('mouseup',finish,true);
      writeTable(index,data=>{data.widths=next.slice();},{row:current.row,col:current.col});
     };
     document.addEventListener('pointermove',move,true);document.addEventListener('mousemove',move,true);
     document.addEventListener('pointerup',finish,true);document.addEventListener('mouseup',finish,true);
    };
    handle.onkeydown=event=>{
     if(!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();
     const next=widths.slice();next[col]=clamp(next[col]+(event.key==='ArrowRight'?10:-10),80,600);
     applyWidths(table,next);writeTable(index,data=>{data.widths=next.slice();},{row:current.row,col:current.col});
    };
   }
  }
  function place(){
   if(isBusy()||!current.table?.isConnected){toolbar.hidden=true;clearHandles();return;}
   const table=current.table,rect=table.getBoundingClientRect();
   if(!rect.width||!rect.height){toolbar.hidden=true;clearHandles();return;}
   const rowCount=table.rows.length,colCount=table.rows[0]?.cells.length||1;
   current.row=clamp(current.row,0,rowCount-1);current.col=clamp(current.col,0,colCount-1);
   deleteRow.disabled=current.row===0;deleteCol.disabled=colCount<=1;
   position.textContent=`${current.row+1} 行 · ${current.col+1} 列`;
   toolbar.hidden=false;toolbar.style.left=clamp(rect.left,8,innerWidth-toolbar.offsetWidth-8)+'px';toolbar.style.top=Math.max(8,rect.top-toolbar.offsetHeight-10)+'px';
   const {widths}=dimensions(current.index,table);buildHandles(table,current.index,widths);
  }
  function updateLayout(){
   if(isBusy())return;
   for(const code of root.querySelectorAll('code[data-type="html-block"]')){
    const text=code.textContent.trim();
    if(text.match(marker)||/^<!-- studio-document \{[^\n]*\} -->$/.test(text))code.parentElement.classList.add('studio-table-meta');
    else if(text==='<!-- more -->')code.parentElement.classList.add('studio-more');
   }
   const parsed=tables(getValue()),visible=visibleTables();
   visible.forEach((table,index)=>{
    const meta=parsed[index]?.meta;if(!meta||!Array.isArray(meta.widths))return;
    const widths=meta.widths.map(value=>clamp(Number(value)||180,80,600));
    applyWidths(table,widths);
    for(let row=0;row<table.rows.length;row++)if(meta.heights?.[row])table.rows[row].style.height=clamp(Number(meta.heights[row])||56,44,500)+'px';
   });
   const active=visibleTables()[current.index];
   if(current.index>=0&&active){current.table=active;place();}
  }
  function schedulePlace(){clearTimeout(placeTimer);placeTimer=setTimeout(()=>{const hit=selectionCell();if(hit)choose(hit);else place();},40);}
  new MutationObserver(()=>{clearTimeout(layoutTimer);layoutTimer=setTimeout(updateLayout,100);}).observe(root,{childList:true,subtree:true,characterData:true});
  root.addEventListener('click',event=>{
   const hit=cellAt(event.target);
   if(hit)choose(hit);
   else{current={index:-1,row:0,col:0,table:null};toolbar.hidden=true;clearHandles();}
  });
  root.addEventListener('focusin',event=>{const hit=cellAt(event.target);if(hit)choose(hit);});
  root.addEventListener('keyup',schedulePlace);
  root.addEventListener('keydown',event=>{
   if(event.key!=='Tab'||event.defaultPrevented)return;
   const hit=cellAt(event.target)||selectionCell();if(!hit)return;
   event.preventDefault();event.stopPropagation();
   const rowCount=hit.table.rows.length,colCount=hit.table.rows[0]?.cells.length||1;
   let index=hit.row*colCount+hit.col+(event.shiftKey?-1:1),total=rowCount*colCount;
   if(index<0)return;
   if(index>=total){writeTable(hit.index,data=>{data.rows.push(data.align.map(()=>''));data.heights.push(56);},{row:rowCount,col:0});return;}
   focusCell(hit.table,Math.floor(index/colCount),index%colCount);
  });
  root.addEventListener('paste',event=>{
   const hit=cellAt(event.target),text=event.clipboardData?.getData('text/plain')||'';
   if(!hit||!/[\t\n]/.test(text))return;
   event.preventDefault();
   const matrix=text.replace(/\r\n?/g,'\n').split('\n');if(matrix[matrix.length-1]==='')matrix.pop();
   const pasted=matrix.slice(0,200).map(line=>line.split('\t').slice(0,60));
   writeTable(hit.index,data=>{
    const maxCol=Math.min(60,Math.max(data.align.length,hit.col+Math.max(0,...pasted.map(row=>row.length))));
    while(data.align.length<maxCol){data.align.push('---');data.widths.push(160);data.rows.forEach(row=>row.push(''));}
    pasted.forEach((row,rowOffset)=>{
     const target=hit.row+rowOffset;while(data.rows.length<=target){data.rows.push(data.align.map(()=>''));data.heights.push(56);}
     row.forEach((value,colOffset)=>{if(hit.col+colOffset<data.align.length)data.rows[target][hit.col+colOffset]=value;});
    });
   },{row:Math.min(199,hit.row+pasted.length-1),col:Math.min(59,hit.col+Math.max(0,...pasted.map(row=>row.length))-1)});
  },true);
  document.addEventListener('selectionchange',schedulePlace);
  document.addEventListener('mousedown',event=>{if(toolbar.contains(event.target)||handles.contains(event.target)||root.contains(event.target))return;toolbar.hidden=true;clearHandles();});
  window.addEventListener('resize',place);window.addEventListener('scroll',place,true);
  updateLayout();
 }};
})();
