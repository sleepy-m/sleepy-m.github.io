'use strict';
(() => {
  const key='sleepym-studio-drafts-v1', $=id=>document.getElementById(id);
  const sample='## 像 Typora 一样开始写作\n\n输入 **粗体**、列表和标题，离开当前段落即可看到排版。\n\n### 数学公式\n\n行内公式：$E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n### 表格和代码\n\n| 功能 | 体验 |\n| --- | --- |\n| Markdown | 即时渲染 |\n| LaTeX | 公式预览 |\n\n```python\ndef hello():\n    print("你好，博客！")\n```\n\n- [ ] 试写一段文字\n- [ ] 下载 Markdown 备份\n';
  let drafts=[],active,editor,ready=false,timer,storageFailed=false;
  function status(text){$('status').textContent=text;}
  try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))drafts=saved.filter(d=>typeof d.id==='string'&&typeof d.body==='string'&&typeof d.title==='string');}catch{status('草稿读取失败，请不要清除浏览器数据。');}
  if(!drafts.length)drafts=[{id:crypto.randomUUID(),title:'欢迎试写',body:sample}];
  active=drafts[0];$('title').value=active.title;
  function list(){ $('drafts').replaceChildren();for(const draft of drafts){const button=document.createElement('button');button.textContent=draft.title||'未命名草稿';button.className=draft===active?'active':'';button.onclick=()=>{if(!ready||!save())return;active=draft;$('title').value=draft.title;editor.setValue(draft.body);list();status('已打开本机草稿');};$('drafts').append(button);} }
  function save(){if(!ready)return false;active.title=$('title').value;active.body=editor.getValue();active.updated=new Date().toISOString();try{localStorage.setItem(key,JSON.stringify(drafts));storageFailed=false;status('已保存至此浏览器 · '+new Date().toLocaleTimeString());list();return true;}catch{storageFailed=true;status('本机保存失败（空间不足或存储被禁用），请立即下载 Markdown 备份。');return false;}}
  function schedule(){clearTimeout(timer);status('有未保存修改……');timer=setTimeout(save,500);}
  function create(title,body){if(!ready||!save())return;active={id:crypto.randomUUID(),title,body};drafts.unshift(active);$('title').value=title;editor.setValue(body);save();}
  try{editor=new Vditor('editor',{cdn:location.origin+'/vendor/vditor',lang:'zh_CN',mode:'ir',height:Math.max(560,innerHeight-260),cache:{enable:false},placeholder:'从这里开始写……',value:active.body,outline:{enable:true,position:'right'},counter:{enable:true,type:'text'},toolbar:['undo','redo','|','headings','bold','italic','strike','|','list','ordered-list','check','quote','|','link','upload','table','code','inline-code','|','edit-mode','outline','fullscreen'],preview:{math:{engine:'KaTeX'},hljs:{style:'github'},markdown:{sanitize:true}},upload:{accept:'image/png,image/jpeg,image/webp,image/gif',handler:async files=>{for(const file of files){if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>2*1024*1024){status('仅支持 PNG/JPEG/WebP/GIF，每张不超过 2MB。');continue;}const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});editor.insertValue('\n![图片]('+data+')\n');}save();return null;}},input:schedule,after:()=>{ready=true;list();save();}});}catch{status('编辑器加载失败，请刷新或使用现有发布后台。');}
  $('title').addEventListener('input',schedule);
  $('new').onclick=()=>create('','');
  $('export').onclick=()=>{if(!ready)return;save();const title=$('title').value||'未命名草稿';const url=URL.createObjectURL(new Blob([editor.getValue()],{type:'text/markdown;charset=utf-8'}));const link=document.createElement('a');link.href=url;link.download=title.replace(/[\\/:*?"<>|]/g,'-')+'.md';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
  $('import').onclick=()=>$('file').click();
  $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;if(file.size>5*1024*1024){status('导入文件不能超过 5MB。');return;}let body=await file.text();let title=file.name.replace(/\.(md|markdown|txt)$/i,'');if(body.startsWith('---')){status('当前试用版暂不导入带 front matter 的博客文件，以免丢失元数据；可直接复制其正文。');$('file').value='';return;}create(title,body);$('file').value='';};
  document.addEventListener('keydown',event=>{if((event.ctrlKey||event.metaKey)&&event.key.toLowerCase()==='s'){event.preventDefault();save();}});
  window.addEventListener('pagehide',save);
  window.addEventListener('beforeunload',event=>{if(ready&&(storageFailed||editor.getValue()!==active.body||$('title').value!==active.title)){event.preventDefault();event.returnValue='';}});
  list();
})();
