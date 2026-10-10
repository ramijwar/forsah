// Real Chromium checks against the original ZIP; backend responses are mocked.
import { chromium } from 'playwright-core';
import { createServer } from 'node:http';
import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve, extname } from 'node:path';
const root=resolve('dist'),reference=resolve('artifacts/reference-dist');
const defaultCategories=JSON.parse(readFileSync('backend/default-categories.json','utf8'));
const server=createServer((req,res)=>{
  let path=new URL(req.url,'http://localhost').pathname;let base=root;
  if(path.startsWith('/__original/')){base=reference;path=path.slice('/__original/'.length);}
  else for(const prefix of ['/nested/demo/','/forsah/'])if(path.startsWith(prefix)){path=path.slice(prefix.length);break;}
  const file=resolve(base,path.replace(/^\//,'')||'index.html');
  if(!file.startsWith(base+'/')||!existsSync(file)){res.writeHead(404);res.end();return;}
  res.setHeader('Content-Type',({'.html':'text/html','.js':'application/javascript','.css':'text/css','.woff2':'font/woff2','.woff':'font/woff'})[extname(file)]||'text/plain');res.end(readFileSync(file));
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
const origin=`http://127.0.0.1:${server.address().port}`;let browser;
const assert=(condition,message)=>{if(!condition)throw new Error(message);};
const settle=async page=>{await page.evaluate(()=>document.fonts.ready);await page.waitForTimeout(750);};
const geometry=async page=>page.evaluate(()=>{
 const selectors=['header','.hero-panel','.category-grid','.category-card','.quick-card','.bottom-nav'];
 return Object.fromEntries(selectors.map(selector=>{const e=document.querySelector(selector),r=e.getBoundingClientRect(),style=getComputedStyle(e);return [selector,{x:r.x,y:r.y,width:r.width,height:r.height,radius:style.borderRadius,font:style.fontFamily}];}));
});
try {
 browser=await chromium.launch({executablePath:process.env.CHROME_BIN||'/usr/bin/google-chrome',args:['--no-sandbox'],headless:true});
 mkdirSync('artifacts/visual',{recursive:true});
 const comparisons=[];
 for(const width of [360,390,768,1280]){
   const context=await browser.newContext({viewport:{width,height:900}});
   const original=await context.newPage();const current=await context.newPage();
   await original.goto(origin+'/__original/',{waitUntil:'networkidle'});
   await current.route('https://t3lam.site/**',route=>route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{ok:true,data:defaultCategories}}));
   await current.goto(origin+'/',{waitUntil:'networkidle'});
   await settle(original);await settle(current);
   const before=await geometry(original),after=await geometry(current);
   for(const selector of Object.keys(before).filter(selector=>selector!=='.bottom-nav')){
     for(const value of ['x','y','width','height'])assert(Math.abs(before[selector][value]-after[selector][value])<=2,`Original layout mismatch at ${width}px ${selector}.${value}: ${before[selector][value]} vs ${after[selector][value]}`);
     assert(before[selector].radius===after[selector].radius,`Radius mismatch: ${width} ${selector}`);
     assert(before[selector].font===after[selector].font,`Font mismatch: ${width} ${selector}`);
   }
   if(width===390||width===1280){await original.screenshot({path:`artifacts/visual/original-${width}.png`,fullPage:true});await current.screenshot({path:`artifacts/visual/restored-${width}.png`,fullPage:true});}
   // The menu must line up with the original header, including centered desktop layouts.
   await original.getByRole('button',{name:'الإشعارات',exact:true}).click();
   await current.getByRole('button',{name:'الإشعارات',exact:true}).click();
   const originalMenu=await original.locator('.popover-card').boundingBox();
   const restoredMenu=await current.locator('.popover-card').boundingBox();
   assert(restoredMenu.x>=0&&restoredMenu.x+restoredMenu.width<=width,'Popover outside viewport');
   await current.keyboard.press('Escape');
   await current.evaluate(()=>window.scrollTo(0,700));await current.waitForTimeout(100);
   const top=await current.locator('.app-header-sticky').boundingBox(),bottom=await current.locator('.bottom-nav').boundingBox();
   assert(Math.abs(top.y)<=1,'Header did not stick to viewport');
   assert(Math.abs(bottom.x)<=1&&Math.abs(bottom.width-width)<=1&&Math.abs(bottom.y+bottom.height-900)<=1,'Bottom nav is not full-width and flush to viewport');
   comparisons.push({width,before,after,originalMenu,restoredMenu});await context.close();
   console.log(`PASS original ZIP layout comparison: ${width}px (header, hero, category grid/cards, shortcuts, bottom nav).`);
 }
 writeFileSync('artifacts/visual/layout-comparison.json',JSON.stringify(comparisons,null,2));
 const page=await browser.newPage({viewport:{width:390,height:844}});const errors=[],missing=[];
 page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400)missing.push(r.url());});
 let rejectAdminSave=false;const adminWrites=[];let liveCategories=structuredClone(defaultCategories);let imageUploads=0;
 const account={id:1,name:'Test Member',email:'member@example.test',role:'user',phone:''};
 await page.route('https://t3lam.site/**',route=>{
   if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'}});
   const url=new URL(route.request().url()),resource=url.searchParams.get('resource'),action=url.searchParams.get('action');let data;
   if(resource==='market'&&action==='image'&&route.request().method()==='POST'){imageUploads++;return route.fulfill({headers:{'Access-Control-Allow-Origin':'*'},json:{ok:true,data:{id:8,images:[1]}}});}
   if(resource==='image')return route.fulfill({contentType:'image/svg+xml',headers:{'Access-Control-Allow-Origin':'*'},body:'<svg xmlns="http://www.w3.org/2000/svg" width="400" height="280"><rect width="400" height="280" fill="green"/></svg>'});
   if(resource==='services')data=liveCategories.filter(c=>c.is_active);
   else if(resource==='admin') {
     if(route.request().method()==='POST'||route.request().method()==='PATCH') {
       adminWrites.push({action,body:route.request().postDataJSON()});
       if(rejectAdminSave)return route.fulfill({status:422,headers:{'Access-Control-Allow-Origin':'*'},json:{ok:false,error:'اختبار رفض الحفظ'}});
       if(action==='category'){const body=route.request().postDataJSON();if(route.request().method()==='POST')liveCategories.push({...body,id:8});else liveCategories=liveCategories.map(c=>c.id===Number(url.searchParams.get('id'))?{...c,...body}:c);}
       data={id:8};
     } else if(action==='category'&&route.request().method()==='DELETE'){liveCategories=liveCategories.filter(c=>c.id!==Number(url.searchParams.get('id')));data={id:8};}
     else if(action==='categories')data={items:liveCategories};
     else if(action==='me')data=account;
     else if(action==='stats')data={users:1,active_ads:1,pending_ads:0,pending_reports:0,open_tickets:0};
     else if(action==='ads')data={items:[{id:3,title:'Admin image listing',description:'Details',category:'صيانة',status:'active',created_at:'2026-10-10 00:00:00',owner_name:'Owner',owner_email:'owner@example.test'}]};
     else data={items:[]};
   }
   else if(resource==='market'&&action==='detail')data={id:3,images:[1,2,3,4]};
   else if(resource==='auth')data=account;
   else if(resource==='chat')data=[{id:4,partner:'Real conversation',title:'Listing',last_message:'Server message'}];
   else if(resource==='member-support')data=[{id:9,subject:'Server support ticket',status:'in_progress',updated_at:'2026-10-09'}];
   else if(resource==='favorites')data=[];
   else if(resource==='market'&&action==='mine')data={items:[{id:3,title:'Server listing',status:'active',images:[],user_id:1}],has_more:false};
   else data={items:[],has_more:false};
   return route.fulfill({headers:{'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,content-type','Access-Control-Allow-Methods':'GET,POST,PATCH,DELETE,OPTIONS'},json:{ok:true,data}});
 });
 for(const folder of ['/','/forsah/','/nested/demo/']){
   await page.goto(origin+folder,{waitUntil:'networkidle'});await settle(page);
   await page.getByRole('heading',{name:'تصفّح الخدمات'}).waitFor();
   assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),`Horizontal overflow: ${folder}`);
 }
 const initialUrl=page.url(),beforeHero=await page.locator('.hero-panel').boundingBox();
 const bell=page.getByRole('button',{name:'الإشعارات',exact:true});
 await bell.click();await page.getByRole('dialog',{name:'الإشعارات',exact:true}).waitFor();
 assert(page.url()===initialUrl,'Bell navigated away from the page');
 const afterHero=await page.locator('.hero-panel').boundingBox();assert(Math.abs(beforeHero.y-afterHero.y)<1,'Popover shifted page layout');
 await page.screenshot({path:'artifacts/visual/notification-popover.png',fullPage:true});
 await page.keyboard.press('Escape');assert(await bell.evaluate(e=>document.activeElement===e),'Escape did not restore bell focus');
 await bell.click();await bell.click();assert(await page.getByRole('dialog').count()===0,'Bell toggle failed');
 await bell.click();await page.getByRole('button',{name:'الرسائل',exact:true}).click();await page.getByRole('dialog',{name:'رسائلك'}).waitFor();
 await page.getByRole('heading',{name:'تصفّح الخدمات'}).click();assert(await page.getByRole('dialog').count()===0,'Outside click did not close popover');
 await page.getByRole('button',{name:'أضف إعلانك',exact:true}).click();await page.getByRole('dialog',{name:'أضف إعلانك'}).waitFor();
 assert(page.url()===initialUrl,'Create button navigated instead of opening modal');
 await page.keyboard.press('Escape');assert(await page.evaluate(()=>document.body.style.overflow)==='','Modal did not restore scroll');
 await page.getByRole('button',{name:'الإعدادات',exact:true}).click();await page.getByRole('heading',{name:'الإعدادات',exact:true}).waitFor();
 assert(await page.locator('.settings-card').count()===3,'Original settings card stack missing');
 await page.getByLabel('اللغة',{exact:true}).selectOption('en');await page.getByRole('button',{name:'Dark',exact:true}).click();
 await page.getByRole('button',{name:'Go home',exact:true}).click();await settle(page);
 assert(await page.locator('.app-shell.dark-theme').count()===1,'Dark mode failed');
 assert(!(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth)),'LTR overflow');
 await page.screenshot({path:'artifacts/visual/home-english-dark.png',fullPage:true});
 // Signed-in member: real endpoint adapters, not static demo messages.
 await page.evaluate(()=>{localStorage.setItem('forsah-language','"ar"');sessionStorage.setItem('forsah-member-token','test-token');});
 await page.reload({waitUntil:'networkidle'});await settle(page);
 await page.getByRole('button',{name:'الإشعارات',exact:true}).click();await page.getByText('Server support ticket',{exact:true}).waitFor();
 await page.getByText('Server message',{exact:true}).waitFor();await page.getByText('Server listing',{exact:true}).waitFor();
 await page.keyboard.press('Escape');
 await page.getByRole('button',{name:'أضف إعلانك',exact:true}).click();const title=page.getByLabel('العنوان',{exact:true});await title.fill('Input keeps focus');
 assert(await title.evaluate(e=>document.activeElement===e),'Form input lost focus');await page.keyboard.press('Escape');
 account.role='super_admin';
 await page.goto(origin+'/#/account',{waitUntil:'networkidle'});await page.reload({waitUntil:'networkidle'});
 const adminButton=page.getByRole('button',{name:'لوحة الإدارة',exact:true});await adminButton.waitFor();
 assert(await adminButton.evaluate(e=>!e.closest('details')&&!!e.querySelector('svg')),'Admin entry is hidden or lacks icon');
 assert(await page.getByRole('button',{name:'تسجيل الخروج',exact:true}).evaluate(e=>!e.closest('details')),'Logout is hidden');
 await adminButton.click();await page.getByRole('heading',{name:'الرئيسية والإحصائيات',exact:true}).waitFor();
 assert(await page.getByRole('button',{name:'إضافة إعلان',exact:true}).count()===0,'Ad creation leaked into overview');
 await page.locator('.admin-mobile-nav').getByRole('button',{name:'إدارة الإعلانات',exact:true}).click();
 await page.getByRole('button',{name:'إضافة إعلان',exact:true}).waitFor();
 assert(await page.getByRole('button',{name:'إضافة مستخدم',exact:true}).count()===0,'User creation leaked into ads');
 await page.getByRole('button',{name:'إضافة إعلان',exact:true}).click();
 let dialog=page.getByRole('dialog',{name:'إضافة إعلان',exact:true});
 await dialog.getByLabel('العنوان',{exact:true}).fill('New admin listing');await dialog.getByLabel('التصنيف',{exact:true}).selectOption(defaultCategories[0].name);await dialog.getByLabel('الوصف وتفاصيل الخدمة والسعر',{exact:true}).fill('Shared listing form');
 await dialog.locator('input[type=file]').setInputFiles({name:'test.png',mimeType:'image/png',buffer:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAEElEQVR4nGP4z8AARAwQCgAf7gP9i18U1AAAAABJRU5ErkJggg==','base64')});
 await dialog.getByRole('button',{name:'حفظ للمراجعة',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert(adminWrites.some(w=>w.action==='ad'&&w.body.title==='New admin listing'),'Create ad did not call backend');
 assert(imageUploads===1,'Admin photo did not reach upload endpoint');
 await page.locator('.admin-mobile-nav').getByRole('button',{name:'إدارة المستخدمين',exact:true}).click();
 assert(await page.getByRole('button',{name:'إضافة إعلان',exact:true}).count()===0,'Ad creation leaked into users');
 await page.getByRole('button',{name:'إضافة مستخدم',exact:true}).click();dialog=page.getByRole('dialog',{name:'إضافة مستخدم',exact:true});
 await dialog.getByLabel('الاسم',{exact:true}).fill('New member');await dialog.getByLabel('البريد الإلكتروني',{exact:true}).fill('new@example.test');await dialog.getByLabel('كلمة المرور',{exact:true}).fill('Strong-password-123');
 await dialog.getByRole('button',{name:'إنشاء',exact:true}).click();await dialog.waitFor({state:'hidden'});
 assert(adminWrites.some(w=>w.action==='user'&&w.body.name==='New member'),'Create user did not call backend');
 await page.locator('.admin-mobile-nav').getByRole('button',{name:'إدارة الإعلانات',exact:true}).click();
 await page.getByRole('button',{name:'إضافة إعلان',exact:true}).click();await page.keyboard.press('Escape');
 for(const viewport of [{width:360,height:640},{width:390,height:420},{width:1280,height:720}]) {
   await page.setViewportSize(viewport);
   await page.locator('.action-edit').first().click();dialog=page.getByRole('dialog',{name:'تعديل الإعلان',exact:true});
   await dialog.locator('img').nth(3).waitFor();
   const box=await dialog.boundingBox();assert(box.y>=0&&box.y+box.height<=viewport.height&&box.width<=viewport.width,'Editor exceeds viewport');
   await dialog.hover();await page.mouse.wheel(0,1800);await page.waitForTimeout(300);
   assert(await dialog.evaluate(e=>e.scrollTop>0),'Image editor does not scroll');
   await dialog.getByLabel('الوصف',{exact:true}).fill('Updated details');
   rejectAdminSave=true;await dialog.getByRole('button',{name:'حفظ التعديلات',exact:true}).click();await dialog.getByRole('alert').waitFor();
   assert(await dialog.getByLabel('الوصف',{exact:true}).inputValue()==='Updated details','Failed save lost form');
   rejectAdminSave=false;await dialog.getByRole('button',{name:'حفظ التعديلات',exact:true}).click();await dialog.waitFor({state:'hidden'});
   assert(await page.evaluate(()=>document.body.style.overflow)==='','Admin modal left page locked');
 }
 await page.setViewportSize({width:390,height:844});
 await page.locator('.admin-mobile-nav').getByRole('button',{name:'إدارة الأقسام',exact:true}).click();
 await page.getByRole('button',{name:'إضافة قسم',exact:true}).click();dialog=page.getByRole('dialog',{name:'إضافة قسم',exact:true});
 await dialog.getByLabel('اسم القسم',{exact:true}).fill('قسم جديد');await dialog.getByLabel('الاسم بالإنجليزية',{exact:true}).fill('New category');
 await dialog.getByRole('button',{name:'حفظ القسم',exact:true}).click();await dialog.waitFor({state:'hidden'});
 await page.getByRole('button',{name:'العودة للتطبيق',exact:true}).click();await page.getByText('قسم جديد',{exact:true}).waitFor();
 await page.getByRole('button',{name:'أضف إعلانك',exact:true}).click();
 await page.getByRole('dialog').getByLabel('التصنيف',{exact:true}).selectOption('قسم جديد');await page.keyboard.press('Escape');
 // Deliberate 422 responses above exercise error handling.
 assert(!errors.length,JSON.stringify({errors}));
 console.log('PASS visible account actions, admin creation, four-image editor scroll at mobile/short/desktop sizes, failed-save retention and scroll cleanup.');
 assert(!errors.length&&!missing.filter(url=>!url.includes("resource=admin")).length,JSON.stringify({errors,missing}));
 console.log('PASS popover toggle/Escape/outside dismissal, no navigation/layout jump, create modal, real account adapters, input focus, original settings, RTL/LTR, dark mode and nested assets.');
} finally {if(browser)await browser.close();server.close();}
