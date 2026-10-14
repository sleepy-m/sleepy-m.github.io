import test from 'node:test';
import assert from 'node:assert/strict';
import {DatabaseSync} from 'node:sqlite';
import worker,{splitPost,validateDraft,images} from './worker.mjs';
const origin='https://sleepym-blog-studio.2036681827.workers.dev';
function database(){const db=new DatabaseSync(':memory:');return {prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return db.prepare(sql).get(...values)||null;},async all(){return {results:db.prepare(sql).all(...values)};},async run(){return {meta:db.prepare(sql).run(...values)};}};},async batch(statements){return Promise.all(statements.map(s=>s.run()));},close(){db.close();}};}
function context(){return {waitUntil(p){p.catch(()=>{});}};}
test('YAML metadata and formula source survive parsing',()=>{const d=splitPost('---\ntitle: 你好\ndate: 2026-10-14\ncustom: keep\npublished: false\n---\n\n$E=mc^2$');assert.equal(d.metadata.custom,'keep');assert.equal(d.metadata.date,'2026-10-14');assert.equal(d.body,'$E=mc^2$');assert.throws(()=>splitPost('no front matter'));});
test('draft validation blocks path traversal and oversized bodies',()=>{const d={id:crypto.randomUUID(),title:'test',body:'text'};assert.equal(validateDraft(d).title,'test');assert.throws(()=>validateDraft({...d,path:'_config.yml',baseSha:'a'.repeat(40)}));assert.throws(()=>validateDraft({...d,path:'source/_posts/../bad.md',baseSha:'a'.repeat(40)}));assert.throws(()=>validateDraft({...d,body:'a'.repeat(1600000)}));assert.throws(()=>validateDraft({...d,tags:['x'.repeat(81)]}));});
test('inline images become fixed upload paths and reject disguised HTML',async()=>{const png='iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jr2sAAAAASUVORK5CYII=';const result=await images('![图](data:image/png;base64,'+png+')');assert.match(result.body,/\/uploads\/[\da-f-]+\.png/);assert.equal(result.blobs.length,1);await assert.rejects(images('![图](data:image/png;base64,PGh0bWw+PC9odG1sPg==)'));});
test('unconfigured Worker fails closed',async()=>{const r=await worker.fetch(new Request(origin+'/api/drafts'),{},context());assert.equal(r.status,503);const health=await worker.fetch(new Request(origin+'/api/health'),{},context());assert.equal((await health.json()).configured,false);});
test('OAuth, owner check, CSRF and optimistic draft revisions',async()=>{
 const DB=database(),env={DB,GITHUB_CLIENT_SECRET:'FAKE-TEST-SECRET-never-a-real-credential'};
 const realFetch=globalThis.fetch;let loginUser=142882860,gitMock=false,gitFailure=false;const gitWrites=[];
 globalThis.fetch=async(url,options)=>{
  if(String(url).includes('/login/oauth/access_token')){const body=JSON.parse(options.body);assert.equal(body.repository_id,'1416752098');assert.equal(body.code_verifier.length,43);return Response.json({access_token:'FAKE-USER-TOKEN',expires_in:28800});}
  if(String(url)==='https://api.github.com/user')return Response.json({id:loginUser,login:'sleepy-m'});
  if(String(url).includes('/user/installations/'))return Response.json({repositories:[{id:1416752098}]});
  if(gitMock&&String(url).startsWith('https://api.github.com/repos/sleepy-m/sleepy-m.github.io/git/')){
   if(gitFailure)return new Response('{}',{status:500});
   const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;
   if(options.method!=='GET')gitWrites.push({path,body});
   if(path.endsWith('/ref/heads/main'))return Response.json({object:{sha:'a'.repeat(40)}});
   if(path.endsWith('/commits/'+'a'.repeat(40)))return Response.json({tree:{sha:'b'.repeat(40)}});
   if(path.endsWith('/trees/'+'b'.repeat(40)))return Response.json({tree:[],truncated:false});
   if(path.endsWith('/blobs'))return Response.json({sha:'c'.repeat(40)});
   if(path.endsWith('/trees'))return Response.json({sha:'d'.repeat(40)});
   if(path.endsWith('/commits'))return Response.json({sha:'e'.repeat(40)});
   if(path.endsWith('/refs/heads/main')){assert.equal(body.force,false);return Response.json({object:{sha:body.sha}});}
  }
  throw Error('Unexpected external call in test: '+url);
 };
 try{
  assert.equal((await worker.fetch(new Request(origin+'/api/drafts'),env,context())).status,401);
  const login=await worker.fetch(new Request(origin+'/auth/login'),env,context());const authURL=new URL(login.headers.get('Location'));assert.equal(authURL.searchParams.get('code_challenge_method'),'S256');const state=authURL.searchParams.get('state');const oauthCookie=login.headers.get('Set-Cookie').split(';')[0];
  assert.equal((await worker.fetch(new Request(origin+'/auth/callback?state='+state+'&code=fake'),env,context())).status,403);
  const callback=await worker.fetch(new Request(origin+'/auth/callback?state='+state+'&code=fake',{headers:{Cookie:oauthCookie}}),env,context());assert.equal(callback.status,302);const sessionCookie=callback.headers.getSetCookie().find(v=>v.startsWith('__Host-blog-session=')).split(';')[0];assert.match(callback.headers.getSetCookie().join(' '),/HttpOnly/);
  assert.equal((await worker.fetch(new Request(origin+'/auth/callback?state='+state+'&code=fake',{headers:{Cookie:oauthCookie}}),env,context())).status,403,'OAuth state cannot be replayed');
  const me=await (await worker.fetch(new Request(origin+'/api/me',{headers:{Cookie:sessionCookie}}),env,context())).json();assert.equal(me.login,'sleepy-m');assert.equal(me.token,undefined);
  const id=crypto.randomUUID(),draft={id,title:'私有草稿',body:'$x^2$'};
  const request=(body,extra={})=>new Request(origin+'/api/drafts',{method:'PUT',headers:{Cookie:sessionCookie,'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':me.csrf,...extra},body:JSON.stringify(body)});
  assert.equal((await worker.fetch(request({draft,revision:0},{Origin:'https://evil.invalid'}),env,context())).status,403);
  const saved=await worker.fetch(request({draft,revision:0}),env,context());assert.equal(saved.status,200);assert.equal((await saved.json()).revision,1);
  assert.equal((await worker.fetch(request({draft:{...draft,body:'overwrite'},revision:0}),env,context())).status,409);
  assert.equal((await worker.fetch(request({draft:{...draft,body:'new'},revision:1}),env,context())).status,200);
  const list=await (await worker.fetch(new Request(origin+'/api/drafts',{headers:{Cookie:sessionCookie}}),env,context())).json();assert.equal(list[0].body,'new');assert.equal(list[0].revision,2);
  gitMock=true;const publishRequest=revision=>new Request(origin+'/api/publish',{method:'POST',headers:{Cookie:sessionCookie,'Content-Type':'application/json',Origin:origin,'X-CSRF-Token':me.csrf},body:JSON.stringify({id,revision})});
  const published=await worker.fetch(publishRequest(2),env,context());assert.equal(published.status,200);const publication=await published.json();assert.equal(publication.revision,3);assert.equal(publication.commit,'e'.repeat(40));assert.match(publication.path,/^source\/_posts\/[a-f0-9-]+\.md$/);assert.equal(gitWrites.filter(w=>w.path.endsWith('/refs/heads/main')).length,1);assert.match(gitWrites.find(w=>w.path.endsWith('/blobs')).body.content,/published: true/);
  assert.equal((await worker.fetch(publishRequest(2),env,context())).status,409,'stale publish cannot run twice');
  gitFailure=true;assert.equal((await worker.fetch(publishRequest(3),env,context())).status,502);const afterFailure=await (await worker.fetch(new Request(origin+'/api/drafts',{headers:{Cookie:sessionCookie}}),env,context())).json();assert.equal(afterFailure[0].publishing,false,'failed publish releases draft lock');assert.equal(afterFailure[0].body,'new');gitFailure=false;
  loginUser=1;assert.equal((await worker.fetch(new Request(origin+'/api/drafts',{headers:{Cookie:sessionCookie}}),env,context())).status,403);loginUser=142882860;
  assert.equal((await worker.fetch(new Request(origin+'/api/post?path=_config.yml',{headers:{Cookie:sessionCookie}}),env,context())).status,400);
  const logout=await worker.fetch(new Request(origin+'/api/logout',{method:'POST',headers:{Cookie:sessionCookie,Origin:origin,'X-CSRF-Token':me.csrf}}),env,context());assert.equal(logout.status,200);assert.equal((await worker.fetch(new Request(origin+'/api/me',{headers:{Cookie:sessionCookie}}),env,context())).status,401);
 }finally{globalThis.fetch=realFetch;DB.close();}
});
