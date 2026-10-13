const $=id=>document.getElementById(id);
let token,entry,sourceMode=false,dirty=false,timer,range,publishing=false,saveQueue=Promise.resolve(),originalBody,deploymentSha;
const converter=new TurndownService({headingStyle:'atx',codeBlockStyle:'fenced'});
converter.addRule('comments',{filter:node=>node.nodeType===8,replacement:(_,node)=>'\n\n<!--'+node.nodeValue+'-->\n\n'});
async function api(url,data){const res=await fetch(url,data?{method:'POST',headers:{'Content-Type':'application/json','X-Blog-Token':token},body:JSON.stringify(data)}:{});const value=await res.json();if(!res.ok)throw Error(value.error||'操作失败');if(url==='/api/publish')deploymentSha=value.sha;if(url==='/api/status'&&value.headSha!==deploymentSha)return {};return value;}
function notice(text,error=false){$('status').textContent=text;$('status').classList.toggle('error',error);}
function today(){const d=new Date();return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;}
function split(text){return text.split(/[,，]/).map(v=>v.trim()).filter(Boolean);}
let bodyChanged=false;
function current(){return {...entry,title:$('title').value,date:$('date').value,categories:split($('categories').value),tags:split($('tags').value),body:bodyChanged?(sourceMode?$('source').value:converter.turndown($('editor').innerHTML)):originalBody};}
async function refresh(){const data=await api('/api/bootstrap');token=data.token;$('entries').replaceChildren();for(const item of data.entries){const button=document.createElement('button');button.className='entry'+(entry?.id===item.id?' active':'');const title=document.createElement('span');title.textContent=item.title;const subtitle=document.createElement('small');subtitle.textContent=(item.draft?'草稿 · ':'已发布 · ')+item.date;button.append(title,subtitle);button.onclick=()=>open(item.id).catch(e=>notice(e.message,true));$('entries').append(button);}}
function display(data){entry=data;dirty=false;bodyChanged=false;originalBody=data.body;sourceMode=false;$('mode').textContent='查看原文';$('source').classList.add('hidden');$('editor').classList.remove('hidden');$('title').value=data.title;$('date').value=data.date||today();$('categories').value=data.categories.join('，');$('tags').value=data.tags.join('，');$('source').value=data.body;$('editor').innerHTML=DOMPurify.sanitize(marked.parse(data.body));$('empty').classList.add('hidden');$('form').classList.remove('hidden');$('saved').textContent=data.draft?'已恢复本机草稿':'修改会自动保存为本机草稿';range=null;notice('');}
function save(){if(!entry||!dirty)return saveQueue;const snapshot=current();clearTimeout(timer);saveQueue=saveQueue.catch(()=>{}).then(async()=>{await api('/api/draft',snapshot);if(entry?.id===snapshot.id&&JSON.stringify(current())===JSON.stringify(snapshot)){dirty=false;$('saved').textContent='草稿已保存 · '+new Date().toLocaleTimeString();}await refresh();});return saveQueue;}
async function open(id){await save();display(await api('/api/entry?id='+encodeURIComponent(id)));await refresh();}
function changed(body=false){if(body)bodyChanged=true;dirty=true;$('saved').textContent='正在保存草稿……';clearTimeout(timer);timer=setTimeout(()=>save().catch(e=>notice('草稿未保存：'+e.message,true)),1000);}
for(const id of ['title','date','categories','tags'])$(id).addEventListener('input',()=>changed());
$('editor').addEventListener('input',()=>changed(true));$('source').addEventListener('input',()=>changed(true));
$('editor').addEventListener('keyup',capture);$('editor').addEventListener('mouseup',capture);
function capture(){const selection=window.getSelection();if(selection.rangeCount&&$('editor').contains(selection.anchorNode))range=selection.getRangeAt(0).cloneRange();}
function restore(){ $('editor').focus();if(range){const selection=window.getSelection();selection.removeAllRanges();selection.addRange(range);} }
function command(cmd,value){if(sourceMode){notice('请先切回编辑模式');return;}restore();document.execCommand(cmd,false,value);capture();changed(true);}
document.querySelectorAll('[data-command]').forEach(b=>b.onclick=()=>command(b.dataset.command));document.querySelectorAll('[data-block]').forEach(b=>b.onclick=()=>command('formatBlock',b.dataset.block));
$('code').onclick=()=>command('formatBlock','pre');$('link').onclick=()=>{const href=prompt('链接地址（https://…）');if(href&&/^https?:\/\//i.test(href))command('createLink',href);};
$('image').onclick=()=>{capture();$('upload').click();};
$('upload').onchange=async()=>{const file=$('upload').files[0];if(!file)return;try{if(file.size>10e6)throw Error('图片不能超过 10MB');const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.onerror=reject;reader.readAsDataURL(file);});const uploaded=await api('/api/upload',{data});if(sourceMode){$('source').value+='\n\n![图片]('+uploaded.url+')\n';changed(true);}else command('insertImage',uploaded.url);notice('图片已插入，发布文章时会一起上传。');}catch(e){notice(e.message,true);}finally{$('upload').value='';}};
$('mode').onclick=()=>{if(!sourceMode){$('source').value=current().body;}else{$('editor').innerHTML=DOMPurify.sanitize(marked.parse($('source').value));}sourceMode=!sourceMode;$('source').classList.toggle('hidden',!sourceMode);$('editor').classList.toggle('hidden',sourceMode);$('mode').textContent=sourceMode?'返回编辑':'查看原文';};
$('new').onclick=async()=>{if(publishing)return;try{await save();display({id:'article-'+Date.now()+'-'+crypto.randomUUID().slice(0,8),title:'',date:today(),categories:[],tags:[],body:'',baseHash:null,published:false});$('title').focus();}catch(e){notice(e.message,true);}};
$('save').onclick=()=>save().then(()=>notice('草稿已保存到这台电脑。')).catch(e=>notice(e.message,true));
$('publish').onclick=async()=>{
  if(publishing||!entry)return;
  const data=current();
  if(!data.title.trim()){notice('请先填写标题',true);$('title').focus();return;}
  publishing=true;clearTimeout(timer);
  document.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=true);$('editor').contentEditable='false';
  try{
    await saveQueue;notice('正在发布，请稍候……');
    const result=await api('/api/publish',data);display(result.entry);await refresh();
    notice('已提交，网站正在更新……');
    for(let i=0;i<30;i++){
      await new Promise(r=>setTimeout(r,4000));const status=await api('/api/status');
      if(status.status==='completed'&&status.conclusion==='success'){notice('发布成功！点击右上角“查看博客”查看。');break;}
      if(status.status==='completed'&&status.conclusion&&status.conclusion!=='success'){notice('文章已保存，但网站更新失败，请查看发布记录。',true);break;}
    }
  }catch(e){
    notice('发布未完成：'+e.message+'。草稿会保留。',true);
    try{const saved=await api('/api/entry?id='+encodeURIComponent(data.id));entry.baseHash=saved.baseHash;}catch{}
  }finally{publishing=false;document.querySelectorAll('button,input,textarea').forEach(e=>e.disabled=false);$('editor').contentEditable='true';}
};
window.addEventListener('beforeunload',e=>{if(dirty||publishing){e.preventDefault();e.returnValue='';}});
refresh().catch(e=>notice('无法连接博客管理：'+e.message,true));
