// Real Chromium smoke test. API is mocked: this verifies UI/assets, not production data.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root=resolve('dist');
const server=createServer((req,res)=>{
  let path=new URL(req.url,'http://localhost').pathname;
  for(const prefix of ['/nested/demo/','/forsah/']) if(path.startsWith(prefix)){path=path.slice(prefix.length);break;}
  const file=resolve(root,path.replace(/^\//,'')||'index.html');
  if(!file.startsWith(root+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'})[extname(file)]||'text/plain');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser;
try{
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});
 const page=await browser.newPage({viewport:{width:390,height:844}});
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 const missing=[];page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 await page.route('https://t3lam.site/**',route=>route.fulfill({json:{ok:true,data:{items:[],has_more:false}}}));
 mkdirSync('artifacts/visual',{recursive:true});
 for(const folder of ['/','/forsah/','/nested/demo/']){
   await page.goto(`http://127.0.0.1:${server.address().port}${folder}`,{waitUntil:'networkidle'});
   await page.getByRole('heading',{name:'تصفّح الخدمات'}).waitFor();
   await page.evaluate(()=>document.fonts.ready);
   if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error(`Horizontal overflow at ${folder}`);
   console.log('PASS Chromium mobile layout, JS/CSS/font loading:',folder);
 }
 await page.screenshot({path:'artifacts/visual/home-mobile.png',fullPage:true});
 await page.getByRole('button',{name:'الإعدادات',exact:true}).click();
 await page.getByLabel('اللغة',{exact:true}).selectOption('en');
 await page.getByLabel('Theme',{exact:true}).selectOption('dark');
 await page.getByRole('button',{name:'Go home',exact:true}).click();
 await page.screenshot({path:'artifacts/visual/home-english-dark.png',fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('LTR horizontal overflow');
 await page.setViewportSize({width:1440,height:1000});
 await page.screenshot({path:'artifacts/visual/home-desktop.png',fullPage:true});
 if(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth))throw new Error('Desktop horizontal overflow');
 if(errors.length||missing.length)throw new Error(JSON.stringify({errors,missing}));
 console.log('PASS English/dark mode and desktop; no runtime errors or missing assets.');
} finally {if(browser)await browser.close();server.close();}
