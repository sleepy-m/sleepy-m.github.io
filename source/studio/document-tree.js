'use strict';
(() => {
 const pattern=/^<!-- studio-document (\{[^\n]*\}) -->\s*(?:\n|$)/;
 function metadata(d){try{const value=JSON.parse((d.body||'').match(pattern)?.[1]||'{}');if(!value||typeof value!=='object'||Array.isArray(value))return {};return {id:typeof value.id==='string'&&value.id.length<=200?value.id:undefined,parent:typeof value.parent==='string'&&value.parent.length<=200?value.parent:null};}catch{return {};}}
 function id(d){return metadata(d).id||d.id;}
 function parent(d){return metadata(d).parent||null;}
 function stamp(body,docId,parentId){return '<!-- studio-document '+JSON.stringify({id:docId,parent:parentId||null})+' -->\n\n'+body.replace(pattern,'');}
 function descendants(doc,docs){const result=new Set([id(doc)]);let changed=true;while(changed){changed=false;for(const d of docs)if(result.has(parent(d))&&!result.has(id(d))){result.add(id(d));changed=true;}}return result;}
 function forest(docs){const nodes=new Map(),duplicates=[];for(const d of docs){if(!nodes.has(id(d)))nodes.set(id(d),{doc:d,children:[]});else duplicates.push({doc:d,children:[]});}const roots=[...duplicates];
  for(const n of nodes.values()){const seen=new Set([id(n.doc)]);let key=parent(n.doc),cycle=false;while(key&&nodes.has(key)){if(seen.has(key)){cycle=true;break;}seen.add(key);key=parent(nodes.get(key).doc);}const p=nodes.get(parent(n.doc));if(p&&!cycle)p.children.push(n);else roots.push(n);}return roots;
 }
 const collapsed=new Set();
 function render(root,docs,buttons){
  root.replaceChildren();root.setAttribute('aria-label','文档树');
  function walk(nodes,container,depth){for(const node of nodes){const key=id(node.doc),wrapper=document.createElement('div');wrapper.className='doc-tree-node';wrapper.dataset.doc=key;const line=document.createElement('div');line.className='doc-tree-line';line.style.paddingLeft=(depth*14)+'px';const toggle=document.createElement('button');toggle.type='button';toggle.className='doc-tree-toggle';toggle.textContent=node.children.length?(collapsed.has(key)?'▸':'▾'):'·';toggle.disabled=!node.children.length;toggle.setAttribute('aria-label','展开或收起 '+(node.doc.title||'未命名文档'));toggle.setAttribute('aria-expanded',String(!collapsed.has(key)));const select=buttons.get(node.doc);if(!select)continue;select.title=node.doc.title||'未命名文档';line.append(toggle,select);const group=document.createElement('div');group.className='doc-tree-children';group.hidden=collapsed.has(key);toggle.onclick=()=>{if(collapsed.has(key))collapsed.delete(key);else collapsed.add(key);group.hidden=collapsed.has(key);toggle.textContent=group.hidden?'▸':'▾';toggle.setAttribute('aria-expanded',String(!group.hidden));};wrapper.append(line,group);container.append(wrapper);walk(node.children,group,depth+1);}}
  walk(forest(docs),root,0);
 }
 function filter(root,query){for(const node of root.querySelectorAll('.doc-tree-node')){const group=node.querySelector(':scope > .doc-tree-children');node.hidden=!!query&&!node.textContent.toLocaleLowerCase().includes(query);group.hidden=!query&&collapsed.has(node.dataset.doc);}}
 window.StudioDocumentTree={metadata,id,parent,stamp,forest,descendants,render,filter};
})();
