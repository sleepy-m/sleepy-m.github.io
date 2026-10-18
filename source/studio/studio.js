'use strict';
(() => {
 const $=id=>document.getElementById(id),cloudHost=location.hostname==='sleepym-blog-studio.2036681827.workers.dev';
 const key='sleepym-studio-drafts-v1',today=()=>new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Shanghai'}).format(new Date());
 const sample='## 像 Typora 一样开始写作\n\n输入 **粗体**、列表和标题，离开当前段落即可看到排版。\n\n### 数学公式\n\n行内公式：$E=mc^2$。\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n### 表格和代码\n\n| 功能 | 体验 |\n| --- | --- |\n| Markdown | 即时渲染 |\n| LaTeX | 公式预览 |\n\n```python\ndef hello():\n    print("你好，博客！")\n```\n';
 let drafts=[],active,editor,ready=false,timer,me=null,queue=Promise.resolve(),storageFailed=false,busy=false,conflict=false,uploads=0;
 function status(text){$('status').textContent=text;$('recover').hidden=!(me&&active&&(active.path||active.conflict));}
 async function api(path,method='GET',data){const response=await fetch(path,{method,credentials:'same-origin',headers:{'Content-Type':'application/json',...(me?{'X-CSRF-Token':me.csrf}:{})},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();if(!response.ok){const error=Error(result.error||'请求失败');error.status=response.status;throw error;}return result;}
 try{const saved=JSON.parse(localStorage.getItem(key)||'[]');if(Array.isArray(saved))drafts=saved.filter(d=>typeof d.id==='string'&&typeof d.body==='string'&&typeof d.title==='string');}catch{storageFailed=true;}
 if(!drafts.length)drafts=[{id:crypto.randomUUID(),title:'欢迎试写',body:sample,date:today(),revision:0}];
 active=drafts[0];
 const split=value=>value.split(/[,，]/).map(s=>s.trim()).filter(Boolean);
 function fillFields(){ $('title').value=active.title;$('date').value=active.date||today();$('categories').value=(active.categories||[]).join('，');$('tags').value=(active.tags||[]).join('，');$('publish').textContent=active.path?'更新博客文章':'发布到博客'; }
 function list(){
  $('drafts').replaceChildren();
  for(const d of drafts){
   const b=document.createElement('button');b.textContent=(d.cloud?'☁ ':'')+(d.title||'未命名草稿')+(d.unsynced?' · 未同步':'');b.className=d===active?'active':'';
   b.onclick=async()=>{if(busy||!ready)return;clearTimeout(timer);saveLocal();if(me&&active.unsynced&&!conflict)cloudSave();try{await queue;}catch{}active=d;conflict=!!d.conflict;fillFields();editor.setValue(d.body);list();status(d.unsynced?'当前是未同步的本机备份。':d.cloud?'已打开云端草稿':'已打开本机草稿');};$('drafts').append(b);
  }
 }
 function saveLocal(){if(!ready)return false;active.title=$('title').value;active.body=editor.getValue();active.date=$('date').value||today();active.categories=split($('categories').value);active.tags=split($('tags').value);active.updated=new Date().toISOString();try{localStorage.setItem(key,JSON.stringify(drafts));storageFailed=false;list();return true;}catch{storageFailed=true;status('本机备份失败（空间不足或被禁用），请立即下载备份。');return false;}}
 function cloudSave(){if(!me||conflict||!ready)return queue;saveLocal();const d=active;const snapshot={id:d.id,title:d.title,body:d.body,date:d.date,categories:d.categories,tags:d.tags,path:d.path,baseSha:d.baseSha};d.unsynced=true;saveLocal();queue=queue.catch(()=>{}).then(async()=>{if(d.conflict)return;try{const result=await api('/api/drafts','PUT',{draft:snapshot,revision:d.revision||0});d.revision=result.revision;d.cloud=true;if(d.body===snapshot.body&&d.title===snapshot.title&&JSON.stringify(d.tags)===JSON.stringify(snapshot.tags)&&JSON.stringify(d.categories)===JSON.stringify(snapshot.categories)&&d.date===snapshot.date)d.unsynced=false;localStorage.setItem(key,JSON.stringify(drafts));if(d===active)status(d.unsynced?'仍有修改待同步……':'云端已保存 · '+new Date().toLocaleTimeString());list();}catch(error){d.unsynced=true;if(error.status===409){d.conflict=true;if(d===active)conflict=true;}try{localStorage.setItem(key,JSON.stringify(drafts));}catch{}if(d===active)status(error.message+' 当前内容仍在本机，可下载备份。');list();throw error;}});queue.catch(()=>{});return queue;}
 function changed(){if(!ready||busy)return;active.unsynced=!!me;saveLocal();clearTimeout(timer);status(me?'本机已备份，等待云端同步……':storageFailed?'本机备份失败，请下载备份。':'已保存至此浏览器');if(me&&!conflict)timer=setTimeout(cloudSave,1500);}
 async function create(title,body){if(!ready||busy)return;clearTimeout(timer);saveLocal();if(me&&active.unsynced&&!conflict)cloudSave();try{await queue;}catch{}active={id:crypto.randomUUID(),title,body,date:today(),categories:[],tags:[],revision:0};drafts.unshift(active);conflict=false;fillFields();editor.setValue(body);saveLocal();if(me)cloudSave();else status('新建本机草稿');}
 function controls(disabled){busy=disabled;for(const id of ['new','import','title','date','tags','categories','save-cloud','publish','refresh-posts','logout','recover'])$(id).disabled=disabled;if(ready){if(disabled)editor.disabled();else editor.enable();}}
 async function loadPosts(){
  $('posts-message').textContent='正在读取博客文章……';
  try{
   const items=await api('/api/posts');$('posts').replaceChildren();
   $('posts-message').textContent=items.length?'点击下面的文章即可编辑；修改先存草稿，点击“更新博客文章”才更新原文。':'仓库中还没有文章，可以先新建一篇。';
   for(const item of items){
    const b=document.createElement('button');b.textContent='编辑 · '+item.name;b.title=item.path;
    b.onclick=async()=>{
     if(busy||!ready)return;clearTimeout(timer);saveLocal();controls(true);
     try{
      if(me&&active.unsynced){if(conflict)throw Error('当前草稿存在冲突，请先下载备份或读取最新版本。');await cloudSave();}
      await queue;
      const existing=drafts.find(d=>d.path===item.path);
      if(existing){active=existing;conflict=!!existing.conflict;}
      else{active=await api('/api/post?path='+encodeURIComponent(item.path));drafts.unshift(active);conflict=false;}
      fillFields();editor.setValue(active.body);saveLocal();list();
      if(!existing)await cloudSave();
      status(existing?'已打开原文章的编辑草稿；点击“更新博客文章”更新原文，不会新建重复文章。':'原文章已载入并另存云端编辑草稿。修改后点击“更新博客文章”，原文地址保持不变。');
     }catch(e){status(e.message);}finally{controls(false);}
    };$('posts').append(b);
   }
  }catch(e){$('posts-message').textContent='文章列表读取失败：'+e.message+' 请点击“刷新文章列表”重试。';throw e;}
 }
 async function connect(){if(!cloudHost)return;$('login').textContent='使用 GitHub 登录';$('login').href='/auth/login';try{me=await api('/api/me');$('account').textContent=me.login;$('login').hidden=true;$('logout').hidden=false;$('publish').hidden=false;$('save-cloud').hidden=false;$('posts-section').hidden=false;$('notice').textContent='已连接云端。草稿仅存私有数据库；点击“发布到博客”才会写入公开仓库。未同步时请勿关闭页面。';const remote=await api('/api/drafts');for(const d of remote){const local=drafts.find(x=>x.id===d.id);if(local?.unsynced){local.cloud=true;if(local.revision!==d.revision){local.conflict=true;local.unsynced=true;}}else if(local){Object.assign(local,d,{cloud:true,unsynced:false});}else drafts.push({...d,cloud:true,unsynced:false});}active=drafts.find(d=>d.unsynced)||drafts.find(d=>d.cloud)||drafts[0];conflict=!!active.conflict;fillFields();editor.setValue(active.body);saveLocal();list();status(active.conflict?'本机备份与云端存在版本冲突，请下载备份后刷新核对。':active.unsynced?'恢复了未同步本机备份，按保存继续同步。':'云端连接成功');await loadPosts();}catch(e){me=null;$('notice').textContent=e.status===401?'登录后可在不同电脑查看云端草稿。未登录的试写只保存于本机。':'云端连接未完成：'+e.message;status(e.status===401?'请点击“使用 GitHub 登录”。':e.message);} }
 fillFields();
 try{editor=new Vditor('editor',{cdn:location.origin+'/vendor/vditor',lang:'zh_CN',mode:'ir',height:Math.max(560,innerHeight-300),cache:{enable:false},placeholder:'从这里开始写……',value:active.body,outline:{enable:true,position:'right'},counter:{enable:true,type:'text'},toolbar:['undo','redo','|','headings','bold','italic','strike','|','list','ordered-list','check','quote','|','link','upload','table','code','inline-code','|','edit-mode','outline','fullscreen'],preview:{math:{engine:'KaTeX'},hljs:{style:'github'},markdown:{sanitize:true}},upload:{accept:'image/png,image/jpeg,image/webp,image/gif',handler:async files=>{uploads++;try{for(const file of files){if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>2*1024*1024){status('图片仅支持 PNG/JPEG/WebP/GIF，每张不超过 2MB。');continue;}const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(file);});editor.insertValue('\n![图片]('+data+')\n');}changed();return null;}finally{uploads--;}}},input:changed,after:()=>{ready=true;list();saveLocal();status(storageFailed?'本机保存不可用，请及时下载备份。':'已恢复本机草稿');connect();}});}catch{status('编辑器加载失败，请刷新或使用现有发布后台。');}
 for(const id of ['title','date','tags','categories'])$(id).addEventListener('input',changed);
 $('new').onclick=()=>create('','');
 $('save-cloud').onclick=()=>{clearTimeout(timer);cloudSave().catch(()=>{});};
 $('refresh-posts').onclick=()=>loadPosts().catch(e=>status(e.message));
 $('publish').onclick=async()=>{if(!me||busy)return;if(uploads){status('图片正在插入，请稍后发布。');return;}if(conflict){status('草稿有版本冲突，请下载备份后刷新核对，不会覆盖云端。');return;}if(!$('title').value.trim()){status('请先填写标题。');return;}clearTimeout(timer);controls(true);try{await cloudSave();await queue;if(active.unsynced)throw Error('草稿尚未成功同步，暂不发布。');status('正在提交文章和图片……');const result=await api('/api/publish','POST',{id:active.id,revision:active.revision});Object.assign(active,result,{cloud:true,unsynced:false});editor.setValue(result.body);saveLocal();$('deployment').hidden=false;$('deployment').href='https://github.com/sleepy-m/sleepy-m.github.io/commit/'+result.commit;status('文章已提交到 GitHub，网站正在构建；完成前仍可能显示旧版本。');let attempts=0;const poll=async()=>{try{const run=await api('/api/deployment?sha='+result.commit);if(run.url)$('deployment').href=run.url;if(run.status==='completed'){status(run.conclusion==='success'?'发布成功，博客已更新。':'文章已提交，但网站构建失败。请打开发布进度查看。');return;}if(run.status==='unknown'){status('文章已提交；自动查询进度不可用，请点击“查看发布进度”。');return;}if(++attempts<20)setTimeout(poll,6000);else status('文章已提交，请在“查看发布进度”确认网站构建结果。');}catch{status('文章已提交，请在“查看发布进度”确认网站构建结果。');}};setTimeout(poll,6000);}catch(e){status(e.message);}finally{controls(false);}};
 $('recover').onclick=async()=>{
  if(!me||busy)return;clearTimeout(timer);saveLocal();controls(true);
  try{try{await queue;}catch{}const old=active;let latest;
   if(old.path)latest=await api('/api/post?path='+encodeURIComponent(old.path));
   else{const all=await api('/api/drafts');latest=all.find(d=>d.id===old.id);if(!latest)throw Error('找不到云端版本，当前备份没有删除。');latest={...latest,cloud:true,unsynced:false};}
   const backup={...old,id:crypto.randomUUID(),title:old.title+'（本机冲突备份）',path:null,baseSha:null,revision:0,cloud:false,unsynced:false,conflict:false};
   drafts=drafts.filter(d=>d!==old);drafts.unshift(backup,latest);active=latest;conflict=false;fillFields();editor.setValue(latest.body);saveLocal();list();status('已读取最新版本；原修改另存为本机冲突备份，可手工合并。');
  }catch(e){status(e.message);}finally{controls(false);}
 };
 $('logout').onclick=async()=>{if(busy||uploads)return;clearTimeout(timer);try{await cloudSave();if(drafts.some(d=>d.cloud&&d.unsynced))throw Error('其他草稿仍有未同步修改，请先保存或下载备份。');await api('/api/logout','POST',{});localStorage.setItem(key,JSON.stringify(drafts.filter(d=>!d.cloud)));active.unsynced=false;location.reload();}catch(e){status('退出未完成：'+e.message);}};
 $('export').onclick=()=>{if(!ready)return;saveLocal();const title=$('title').value||'未命名草稿';const url=URL.createObjectURL(new Blob([editor.getValue()],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=title.replace(/[\\/:*?"<>|]/g,'-')+'.md';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);};
 $('import').onclick=()=>$('file').click();
 $('file').onchange=async()=>{const file=$('file').files[0];if(!file)return;try{if(file.size>5*1024*1024)throw Error('导入文件不能超过 5MB。');const body=await file.text();if(/^---\r?\n/.test(body))throw Error('博客文件请从“仓库文章”打开，以保留元数据；导入只接受纯正文 Markdown。');await create(file.name.replace(/\.(md|markdown|txt)$/i,''),body);}catch(e){status(e.message);}finally{$('file').value='';}};
 document.addEventListener('keydown',e=>{if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='s'){e.preventDefault();if(me)cloudSave().catch(()=>{});else{saveLocal();status(storageFailed?'备份失败，请下载 Markdown。':'已保存至此浏览器');}}});
 window.addEventListener('pagehide',saveLocal);
 window.addEventListener('beforeunload',e=>{if(ready&&(storageFailed||uploads||busy||active.unsynced||editor.getValue()!==active.body||$('title').value!==active.title)){e.preventDefault();e.returnValue='';}});
 list();
})();
