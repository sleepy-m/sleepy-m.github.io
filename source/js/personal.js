(() => {
  document.querySelectorAll('[aria-label="Color Toggle"]').forEach(el=>{el.setAttribute('aria-label','切换明暗模式');el.title='切换明暗模式';});
  document.querySelectorAll('[aria-label="Search"]').forEach(el=>{el.setAttribute('aria-label','搜索文章');el.title='搜索文章';});
  if(document.querySelector('.markdown-body,.page-content')){
    const track=document.createElement('div');track.className='reading-track';track.setAttribute('aria-hidden','true');const fill=document.createElement('div');fill.className='reading-fill';track.append(fill);document.body.append(track);
    let queued=false;const update=()=>{const max=document.documentElement.scrollHeight-innerHeight;fill.style.width=(max>0?Math.min(100,scrollY/max*100):0)+'%';queued=false;};addEventListener('scroll',()=>{if(!queued){queued=true;requestAnimationFrame(update);}},{passive:true});update();
  }
  const allowed=matchMedia('(hover:hover) and (pointer:fine) and (prefers-reduced-motion:no-preference)');
  if(!allowed.matches)return;
  const dot=document.createElement('div'),ring=document.createElement('div');dot.className='cursor-dot';ring.className='cursor-ring';dot.setAttribute('aria-hidden','true');ring.setAttribute('aria-hidden','true');document.body.append(dot,ring);
  let x=0,y=0,rx=0,ry=0,running=false,visible=false,frame;
  const tick=()=>{rx+=(x-rx)*.28;ry+=(y-ry)*.28;ring.style.left=rx+'px';ring.style.top=ry+'px';if(visible&&Math.abs(x-rx)+Math.abs(y-ry)>.2)frame=requestAnimationFrame(tick);else running=false;};
  document.addEventListener('pointermove',e=>{if(e.pointerType!=='mouse')return;x=e.clientX;y=e.clientY;if(!visible){rx=x;ry=y;}visible=true;dot.style.opacity=ring.style.opacity='1';dot.style.left=x+'px';dot.style.top=y+'px';ring.classList.toggle('hover',!!e.target.closest('a,button,input,textarea,[role=button]'));if(!running){running=true;frame=requestAnimationFrame(tick);}},{passive:true});
  const hide=()=>{visible=false;dot.style.opacity=ring.style.opacity='0';cancelAnimationFrame(frame);running=false;};document.addEventListener('pointerleave',hide);addEventListener('blur',hide);allowed.addEventListener('change',()=>{if(!allowed.matches){hide();dot.remove();ring.remove();}});
})();
