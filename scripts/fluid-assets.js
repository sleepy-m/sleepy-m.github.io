const fs=require('fs');
const path=require('path');
hexo.extend.generator.register('self-hosted-fluid-assets',function(){
  const result=[];
  const packageRoot=name=>path.dirname(require.resolve(name+'/package.json'));
  const file=(pkg,source,dest)=>result.push({path:dest,data:()=>fs.createReadStream(path.join(packageRoot(pkg),source))});
  function folder(pkg,source,dest){const base=path.join(packageRoot(pkg),source);for(const entry of fs.readdirSync(base,{withFileTypes:true})){const relative=path.posix.join(source,entry.name),output=path.posix.join(dest,entry.name);if(entry.isDirectory())folder(pkg,relative,output);else file(pkg,relative,output);}}
  function font(pkg,css,dest){file(pkg,css,dest+'/index.css');file(pkg,'LICENSE',dest+'/LICENSE.txt');const text=fs.readFileSync(path.join(packageRoot(pkg),css),'utf8');for(const match of text.matchAll(/url\(([^)]+)\)/g)){const name=match[1].replace(/["']/g,'').replace(/^\.\//,'');file(pkg,name,dest+'/'+name);}}
  font('@fontsource-variable/inter','standard.css','vendor/fonts/inter');
  font('@fontsource-variable/noto-sans-sc','index.css','vendor/fonts/chinese');
  font('@fontsource/jetbrains-mono','latin-400.css','vendor/fonts/code');
  file('jquery','dist/jquery.min.js','vendor/jquery/jquery.min.js');
  file('bootstrap','dist/css/bootstrap.min.css','vendor/bootstrap/css/bootstrap.min.css');
  file('bootstrap','dist/js/bootstrap.bundle.min.js','vendor/bootstrap/js/bootstrap.min.js');
  file('github-markdown-css','github-markdown.css','vendor/markdown/github-markdown.min.css');
  file('nprogress','nprogress.js','vendor/nprogress/nprogress.min.js');file('nprogress','nprogress.css','vendor/nprogress/nprogress.min.css');
  file('anchor-js','anchor.min.js','vendor/anchor/anchor.min.js');file('tocbot','dist/tocbot.min.js','vendor/tocbot/tocbot.min.js');file('tocbot','dist/tocbot.css','vendor/tocbot/tocbot.css');
  file('clipboard','dist/clipboard.min.js','vendor/clipboard/clipboard.min.js');folder('katex','dist','vendor/katex');
  return result;
});
hexo.extend.filter.register('after_render:html',html=>html.replace(/(?:https?:)?\/\/at\.alicdn\.com\/t\/c\/font_1749284_5i9bdhy70f8\.css/g,'/css/site-icons.css'));
