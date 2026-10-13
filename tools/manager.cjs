const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { spawn } = require('node:child_process');
const yaml = require('js-yaml');
const root = path.resolve(__dirname, '..');
const port = Number(process.env.BLOG_MANAGER_PORT || 4318);
const origin = `http://127.0.0.1:${port}`;
const secret = crypto.randomBytes(32).toString('hex');
const local = path.join(root, '.local');
for (const dir of ['drafts','uploads','backups']) fs.mkdirSync(path.join(local, dir), {recursive:true});
const digest = text => crypto.createHash('sha256').update(text).digest('hex');
const safeId = id => { if (typeof id !== 'string' || !id || id.length > 180 || /[\\/<>:"|?*\x00-\x1f]/.test(id) || id==='.' || id==='..' || /[. ]$/.test(id)) throw Error('文章文件名无效'); return id; };
const postFile = id => path.join(root,'source','_posts',safeId(id)+'.md');
const draftFile = id => path.join(local,'drafts',safeId(id)+'.json');
function parse(text) {
  const match = text.match(/^\uFEFF?---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  return {meta:match ? yaml.load(match[1]) || {} : {}, body:match ? text.slice(match[0].length) : text};
}
function readPost(id) {
  const file=postFile(id); const exists=fs.existsSync(file); const raw=exists?fs.readFileSync(file,'utf8'):'';
  const {meta,body}=parse(raw);
  return {id, title:meta.title || id, date:String(meta.date instanceof Date ? meta.date.toISOString().slice(0,10):meta.date || ''), categories:Array.isArray(meta.categories)?meta.categories:[meta.categories].filter(Boolean), tags:Array.isArray(meta.tags)?meta.tags:[meta.tags].filter(Boolean), body, baseHash:exists?digest(raw):null, published:exists};
}
function readEntry(id) { return fs.existsSync(draftFile(id)) ? {...JSON.parse(fs.readFileSync(draftFile(id),'utf8')), draft:true} : readPost(id); }
function atomic(file, text) { fs.mkdirSync(path.dirname(file),{recursive:true}); const tmp=file+'.'+crypto.randomUUID()+'.tmp'; fs.writeFileSync(tmp,text); fs.renameSync(tmp,file); }
function entries() {
  const ids=new Set(fs.readdirSync(path.join(root,'source','_posts')).filter(f=>f.endsWith('.md')).map(f=>f.slice(0,-3)));
  fs.readdirSync(path.join(local,'drafts')).filter(f=>f.endsWith('.json')).forEach(f=>ids.add(f.slice(0,-5)));
  return [...ids].map(id=> {const e=readEntry(id); return {id,title:e.title,date:e.date,draft:!!e.draft,published:fs.existsSync(postFile(id))};}).sort((a,b)=>b.date.localeCompare(a.date));
}
function validate(data) {
  safeId(data.id);
  if (typeof data.title!=='string' || !data.title.trim() || data.title.length>200) throw Error('请填写文章标题');
  if(typeof data.body!=='string'||data.body.length>2e6) throw Error('正文过大或格式无效');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(data.date) || Number.isNaN(Date.parse(data.date))) throw Error('请填写有效日期');
  for(const key of ['categories','tags']) if(!Array.isArray(data[key])||data[key].some(v=>typeof v!=='string'||v.length>100)||data[key].length>30) throw Error('分类或标签格式无效');
  if(data.baseHash!==null && !/^[a-f0-9]{64}$/.test(data.baseHash)) throw Error('文章版本无效，请重新打开文章');
  return {id:data.id,title:data.title.trim(),body:data.body,date:data.date,categories:data.categories,tags:data.tags,baseHash:data.baseHash};
}
function run(exe,args,allowed=[0]) {return new Promise((resolve,reject)=> {
  const child=spawn(exe,args,{cwd:root,windowsHide:true,env:process.env}); let output='';
  child.stdout.on('data',b=>output+=b); child.stderr.on('data',b=>output+=b);
  const timeout=setTimeout(()=>child.kill(),120000);
  child.on('error',e=>{clearTimeout(timeout);reject(e);});
  child.on('close',code=>{clearTimeout(timeout);allowed.includes(code)?resolve({code,output}):reject(Error(output.slice(-1800)||'命令执行失败'));});
});}
let publishing=false;
async function publish(data) {
  if(publishing)throw Error('正在发布，请稍候');
  publishing=true;
  try {
    const entry=validate(data); atomic(draftFile(entry.id),JSON.stringify(entry));
    await run('git',['fetch','origin','main']);
    const upstream=(await run('git',['rev-list','--count','HEAD..origin/main'])).output.trim();
    if(upstream!=='0') {
      const dirty=(await run('git',['status','--porcelain'])).output.trim();
      if(dirty)throw Error('线上有新修改，本地也有改动。草稿已保存，请先同步博客后再发布。');
      await run('git',['pull','--ff-only','origin','main']);
    }
    const file=postFile(entry.id); const old=fs.existsSync(file)?fs.readFileSync(file,'utf8'):null;
    if((old===null?null:digest(old))!==entry.baseHash)throw Error('这篇文章已被其他操作修改。草稿已保留，请重新核对文章后发布。');
    if(old!==null)atomic(path.join(local,'backups',`${Date.now()}-${entry.id}.md`),old);
    const meta=old===null?{}:parse(old).meta;
    Object.assign(meta,{title:entry.title,published:true,date:entry.date,categories:entry.categories,tags:entry.tags});
    atomic(file,'---\n'+yaml.dump(meta,{lineWidth:-1})+'---\n\n'+entry.body.trim()+'\n');
    // Update the draft version immediately, so a failed push can safely be retried.
    entry.baseHash=digest(fs.readFileSync(file,'utf8')); atomic(draftFile(entry.id),JSON.stringify(entry));
    const assets=[...entry.body.matchAll(/\/uploads\/([a-f0-9-]+\.(?:png|jpg|gif|webp))/g)].map(m=>m[1]);
    const staged=['source/_posts/'+entry.id+'.md'];
    for(const name of new Set(assets)) {
      const source=path.join(local,'uploads',name), dest=path.join(root,'source','uploads',name);
      if(fs.existsSync(source)){fs.mkdirSync(path.dirname(dest),{recursive:true});fs.copyFileSync(source,dest);}
      if(fs.existsSync(dest))staged.push('source/uploads/'+name);
    }
    const build=await run(process.execPath,['node_modules/hexo/bin/hexo','generate']);
    if(/(?:ERROR|FATAL)\s/.test(build.output))throw Error('网页生成未通过。草稿已保留，修复后可以重试。');
    const existingStage=(await run('git',['diff','--cached','--name-only'])).output.trim();
    if(existingStage)throw Error('Git 中有尚未提交的其他修改，请先处理后再发布。草稿已保留。');
    await run('git',['add','--',...staged]);
    const diff=await run('git',['diff','--cached','--quiet'],[0,1]);
    if(diff.code===1)await run('git',['commit','-m','Publish article: '+entry.title]);
    await run('git',['push','origin','main']);
    fs.unlinkSync(draftFile(entry.id));
    const sha=(await run('git',['rev-parse','HEAD'])).output.trim();
    return {message:'文章已提交，正在更新公开网站。',entry:readPost(entry.id),sha};
  }finally{publishing=false;}
}
async function body(req) {
  let text=''; for await(const chunk of req){text+=chunk;if(text.length>16e6)throw Error('上传内容过大，请使用 10MB 以下的图片');}
  return JSON.parse(text);
}
function send(res,status,data,type='application/json; charset=utf-8') {
  res.writeHead(status,{'Content-Type':type,'Cache-Control':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin'});
  res.end(type.startsWith('application/json')?JSON.stringify(data):data);
}
const assets={
  '/':path.join(__dirname,'manager','index.html'),
  '/app.js':path.join(__dirname,'manager','app.js'),
  '/marked.js':require.resolve('marked').replace(/marked\.cjs$/, 'marked.umd.js'),
  '/purify.js':path.join(path.dirname(require.resolve('dompurify')),'purify.min.js'),
  '/turndown.js':path.join(path.dirname(require.resolve('turndown')),'../dist/turndown.js')
};
const server=http.createServer(async(req,res)=> {
 try {
  if(req.headers.host!==`127.0.0.1:${port}`)return send(res,403,{error:'请求地址无效'});
  const url=new URL(req.url,origin), route=url.pathname;
  if(req.method!=='GET' && (req.headers.origin!==origin||req.headers['x-blog-token']!==secret))return send(res,403,{error:'请在博客管理页面中操作'});
  if(req.method==='GET' && assets[route])return send(res,200,fs.readFileSync(assets[route]),route.endsWith('.js')?'text/javascript; charset=utf-8':'text/html; charset=utf-8');
  if(req.method==='GET' && /^\/uploads\/[^/]+$/.test(route)) {
    const name=route.slice(9); if(!/^[a-f0-9-]+\.(png|jpg|gif|webp)$/.test(name))throw Error('图片名称无效');
    const file=[path.join(local,'uploads',name),path.join(root,'source','uploads',name)].find(f=>fs.existsSync(f));
    if(!file)return send(res,404,{error:'图片不存在'});
    return send(res,200,fs.readFileSync(file),'image/'+({jpg:'jpeg'}[path.extname(name).slice(1)]||path.extname(name).slice(1)));
  }
  if(route==='/api/bootstrap'&&req.method==='GET')return send(res,200,{token:secret,entries:entries()});
  if(route==='/api/entry'&&req.method==='GET')return send(res,200,readEntry(safeId(url.searchParams.get('id'))));
  if(route==='/api/draft'&&req.method==='POST') {const data=validate(await body(req));atomic(draftFile(data.id),JSON.stringify(data));return send(res,200,{message:'草稿已保存到这台电脑'});}
  if(route==='/api/publish'&&req.method==='POST')return send(res,200,await publish(await body(req)));
  if(route==='/api/upload'&&req.method==='POST') {
    const data=await body(req),buffer=Buffer.from(data.data,'base64');if(buffer.length>10e6)throw Error('图片不能超过 10MB');
    let ext;
    if(buffer.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))ext='png';
    else if(buffer[0]===255&&buffer[1]===216&&buffer[2]===255)ext='jpg';
    else if(/^GIF8[79]a$/.test(buffer.subarray(0,6).toString()))ext='gif';
    else if(buffer.subarray(0,4).toString()==='RIFF'&&buffer.subarray(8,12).toString()==='WEBP')ext='webp';
    if(!ext)throw Error('请选择 PNG、JPG、GIF 或 WebP 图片');
    const name=crypto.randomUUID()+'.'+ext;fs.writeFileSync(path.join(local,'uploads',name),buffer);
    return send(res,200,{url:'/uploads/'+name});
  }
  if(route==='/api/status'&&req.method==='GET') {
    const result=await run('gh',['run','list','--workflow','pages.yml','--limit','1','--json','status,conclusion,url,headSha']);
    return send(res,200,JSON.parse(result.output)[0]||{});
  }
  send(res,404,{error:'页面不存在'});
 }catch(e){send(res,400,{error:e.message});}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'博客管理已经打开，请访问 '+origin:e.message);process.exit(1);});
server.listen(port,'127.0.0.1',()=>console.log('博客管理已启动：'+origin));
