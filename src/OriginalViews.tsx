import type { Category } from './categories';
import { Armchair, ArrowLeft, ChevronLeft, Gavel, PackageCheck, Plus, Search, Sparkles, Truck, UsersRound, Wrench, Zap, Sun, Moon, Monitor, Check, Globe2, Bell, ShieldCheck, Trash2, CircleHelp } from 'lucide-react';
export type Translate = (ar:string,en:string)=>string;
const words: Record<string,string> = {
 'الحراج الشعبي':'Marketplace','سوق العمالة':'Workers','المواصلات والنقل الداخلي':'Transport','طوارئ السيارات':'Roadside assistance','المفروشات والموبيليا':'Furniture','الخدمات اللوجستية':'Logistics','خدمات الصيانة المنزلية':'Home maintenance',
 'بيع وشراء.. ولقطة اليوم تنتظرك':'Buy, sell and find your next deal','أيدٍ خبيرة لخدماتك اليومية':'Skilled people for everyday services','مشاوير ونقل بين أحياء مدينتك':'Rides and transport around your city','مساعدة على الطريق وقت الحاجة':'Roadside help when needed','لمسات جديدة لبيتك ومساحتك':'Something new for your home','توصيل سريع.. من الباب للباب':'Deliveries from door to door','فنيون موثوقون لراحة بالك':'Find technicians for your home',
 'تصفح الحراج':'Browse listings','مزادات':'Auctions','تصفح العمال':'Browse workers','انشر إعلانك':'Post a listing','تصفح الرحلات':'Browse rides','انشر رحلتك':'Post a ride','سطحة إنقاذ':'Vehicle recovery','بنشر متنقل':'Mobile tire service','غرف نوم':'Bedrooms','مجالس':'Living rooms','توصيل طرد':'Parcel delivery','توصيل طعام':'Food delivery','سباكة':'Plumbing','كهرباء':'Electrical','تكييف':'Air conditioning'
};
const translate=(t:Translate,value:string)=>t(value,words[value]||value);
const categoryIcons:Record<string,typeof Gavel>={Gavel,UsersRound,Truck,Zap,Armchair,PackageCheck,Wrench};

export function OriginalHome({ t, browse, create, categories }: { categories:Category[]; t: Translate; browse: (category?:string,query?:string)=>void; create:(category?:string)=>void }) {
  return (
    <>
      <div className="hero-panel relative mt-1 overflow-hidden rounded-[28px] px-6 py-7 md:px-10 md:py-9">
        <div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" />
        <div className="relative z-10 max-w-[560px]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#dff2bd]"><Sparkles size={13} />{t(' منصتك المحلية لكل احتياج',' Your local services platform')}</div>
          <h1 className="max-w-[420px] text-[28px] font-bold leading-[1.35] tracking-tight text-white md:text-[34px]">{t('خلّها فرصة.. ','An opportunity.. ')}<span className="text-[#c8ef7a]">{t('لشيء أحلى','for something better')}</span></h1>
          <p className="mt-2 max-w-[380px] text-[13px] leading-6 text-white/70 md:text-sm">{t('اكتشف خدمات قريبة منك، أو اعرض خدمتك ووصل للي يبحث عنها.','Find local services, or offer yours to people looking for them.')}</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={() => create()} className="primary-light-button"><Plus size={17} />{t(' أضف إعلانك',' Create a listing')}</button>
            <button onClick={() => browse()} className="hero-link">{t('اكتشف الخدمات ','Explore services ')}<ArrowLeft size={15} /></button>
          </div>
        </div>
        <div className="hero-illustration" aria-hidden="true"><span className="hero-sun" /><span className="hero-card"><Sparkles size={25} /><span>{t('فرصتك','Your next')}<br />{t('قريبة','opportunity')}</span></span><span className="hero-plant" /></div>
      </div>

      <section className="mt-8 md:mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div><p className="eyebrow">{t('اختَر ما يناسبك','Find what suits you')}</p><h2 className="mt-1 text-[21px] font-bold tracking-tight">{t('تصفّح الخدمات','Browse services')}</h2></div>
          <button onClick={() => browse()} className="text-xs font-bold text-[#47705c]">{t('عرض الكل ','View all ')}<ArrowLeft className="mr-1 inline" size={14} /></button>
        </div>
        <div className="category-grid">
          {categories.map((category, index) => {
            const Icon = categoryIcons[category.icon]||Gavel;
            return (
              <article key={category.id} className="category-card group" style={{ animationDelay: `${index * 45}ms` }}>
                <button className="flex w-full items-start gap-3 text-right" onClick={() => browse(category.name)}>
                  <span className="category-icon" style={{ backgroundColor: category.tint, color: category.color }}><Icon size={21} strokeWidth={1.8} /></span>
                  <span className="min-w-0 flex-1 pt-0.5"><span className="block text-[14px] font-bold leading-5">{t(category.name,category.name_en||category.name)}</span><span className="mt-1 block text-[11px] leading-[1.65] text-[#8a948d]">{translate(t,category.description)}</span></span>
                  <ChevronLeft className="mt-1 shrink-0 text-[#b5bcb6] transition-transform group-hover:-translate-x-1" size={16} />
                </button>
                <div className="mt-4 flex flex-wrap gap-2">
                  {category.subcategories.map((sub) => <button key={translate(t,sub)} onClick={() => sub.startsWith('انشر') ? create(category.name) : browse(category.name, sub.startsWith('تصفح') ? '' : sub)} className="subcategory-chip">{translate(t,sub)}</button>)}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-3 pb-2 sm:grid-cols-2">
        <button onClick={() => browse()} className="quick-card"><span className="quick-icon"><Search size={19} /></span><span className="text-right"><strong className="block text-sm">{t('تدور على شيء؟','Looking for something?')}</strong><span className="mt-1 block text-xs text-[#8d9790]">{t('ابحث بين الفرص القريبة','Search local opportunities')}</span></span><ArrowLeft className="mr-auto text-[#9aa59d]" size={17} /></button>
        <button onClick={() => create()} className="quick-card"><span className="quick-icon quick-icon-lime"><Plus size={20} /></span><span className="text-right"><strong className="block text-sm">{t('عندك خدمة؟','Have a service?')}</strong><span className="mt-1 block text-xs text-[#8d9790]">{t('خلّ الناس يلاقونك بسهولة','Let people find you easily')}</span></span><ArrowLeft className="mr-auto text-[#9aa59d]" size={17} /></button>
      </section>
    </>
  );
}
export type FeedPreferences = { ads:boolean; chat:boolean; support:boolean };
function Switch({checked,label,onChange,disabled=false}:{checked:boolean;label:string;onChange:()=>void;disabled?:boolean}) {
  return <button type="button" role="switch" aria-checked={checked} aria-label={label} disabled={disabled} onClick={onChange} className={`switch ${checked?'switch-on':''}`}><span/></button>;
}
export function OriginalSettings({t,theme,setTheme,style,setStyle,language,setLanguage,preferences,setPreferences,biometricEnabled,biometricAvailable,busy,toggleBiometric,clearCache,support}: {
  t:Translate;theme:string;setTheme:(value:string)=>void;style:string;setStyle:(value:string)=>void;language:'ar'|'en';setLanguage:(value:'ar'|'en')=>void;
  preferences:FeedPreferences;setPreferences:(value:FeedPreferences)=>void;biometricEnabled:boolean;biometricAvailable:boolean;busy:boolean;toggleBiometric:()=>void;clearCache:()=>void;support:()=>void;
}) {
  return <>
    <div className="mb-6 mt-5"><p className="eyebrow">{t('خصّص تجربتك','Make it yours')}</p><h1 className="mt-1 text-[26px] font-bold">{t('الإعدادات','Settings')}</h1><p className="mt-1 text-sm text-[#849088]">{t('خلّ فرصة على مزاجك.','Make Forsah feel like you.')}</p></div>
    <div className="settings-stack">
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon" style={{background:'#edf3e6',color:'#567445'}}><Sun size={18}/></span><div><h2>{t('المظهر','Appearance')}</h2><p>{t('اختَر الشكل اللي يريحك','Choose your preferred look')}</p></div></div>
        <div className="setting-row"><div><strong>{t('الوضع الداكن التلقائي','Automatic dark mode')}</strong><span>{t('يتبع تفضيلات جهازك عند تفعيل وضع النظام','Follow your device in system mode')}</span></div><Switch checked={theme==='system'} label={t('الوضع الداكن التلقائي','Automatic dark mode')} onChange={()=>setTheme(theme==='system'?'light':'system')}/></div>
        <div className="theme-options" role="group" aria-label={t('اختيار المظهر','Choose theme')}>
          {[{id:'light',label:t('فاتح','Light'),icon:Sun},{id:'dark',label:t('داكن','Dark'),icon:Moon},{id:'system',label:t('حسب النظام','System'),icon:Monitor}].map(({id,label,icon:Icon})=><button key={id} aria-pressed={theme===id} onClick={()=>setTheme(id)} className={`theme-option ${theme===id?'theme-option-selected':''}`}><Icon size={16}/>{label}{theme===id&&<Check className="mr-auto" size={14}/>}</button>)}
        </div>
        <div className="setting-row"><div><strong>{t('نمط الواجهة','Interface style')}</strong><span>{t('اختر طابع الواجهة','Choose your interface style')}</span></div><div className="segmented"><button className={style==='classic'?'selected':''} aria-pressed={style==='classic'} onClick={()=>setStyle('classic')}>{t('كلاسيك','Classic')}</button><button className={style==='modern'?'selected':''} aria-pressed={style==='modern'} onClick={()=>setStyle('modern')}>{t('عصري','Modern')}</button></div></div>
        <div className="setting-row last-row"><div><strong>{t('اللغة','Language')}</strong><span>{t('لغة عرض التطبيق','Application language')}</span></div><label className="select-wrap"><Globe2 size={15}/><select value={language} onChange={e=>setLanguage(e.target.value as 'ar'|'en')} aria-label={t('اللغة','Language')}><option value="ar">العربية</option><option value="en">English</option></select><ChevronLeft size={14}/></label></div>
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon" style={{background:'#fff1e7',color:'#bd7541'}}><Bell size={18}/></span><div><h2>{t('الإشعارات','Notifications')}</h2><p>{t('تحديثات داخل قائمة الجرس فقط؛ إشعارات الدفع غير مفعّلة','Updates in the bell menu only; push notifications are off')}</p></div></div>
        {([{key:'ads',label:t('تحديثات الإعلانات','Listing updates'),description:t('حالة إعلاناتك ومراجعتها','Your listings and moderation status')},{key:'chat',label:t('رسائل المحادثة','Chat messages'),description:t('أحدث المحادثات في قائمة الجرس','Recent conversations in the bell menu')},{key:'support',label:t('ردود الدعم','Support updates'),description:t('تحديثات تذاكر الدعم الخاصة بك','Updates to your support tickets')}] as const).map(({key,label,description},i)=><div className={`setting-row ${i===2?'last-row':''}`} key={key}><div><strong>{label}</strong><span>{description}</span></div><Switch checked={preferences[key]} label={label} onChange={()=>setPreferences({...preferences,[key]:!preferences[key]})}/></div>)}
      </section>
      <section className="settings-card">
        <div className="settings-heading"><span className="settings-icon" style={{background:'#e9eff7',color:'#53739a'}}><ShieldCheck size={18}/></span><div><h2>{t('الخصوصية والأمان','Privacy and security')}</h2><p>{t('بياناتك وخصوصيتك أولاً','Your privacy comes first')}</p></div></div>
        <div className="setting-row"><div><strong>{t('الدخول البيومتري','Biometric unlock')}</strong><span>{biometricAvailable?t('فتح جلسة مشفرة ببصمة الجهاز','Unlock an encrypted session with your device'):t('يتطلب تسجيل الدخول وجهاز Android يدعم البصمة','Sign in on an Android device with enrolled biometrics')}</span></div><Switch checked={biometricEnabled} disabled={busy||(!biometricAvailable&&!biometricEnabled)} label={t('الدخول البيومتري','Biometric unlock')} onChange={toggleBiometric}/></div>
        <button className="setting-row cache-row last-row" disabled={busy} onClick={clearCache}><div><strong>{t('مسح الذاكرة المؤقتة','Clear cache')}</strong><span>{t('دون حذف جلسة الدخول أو بيانات الحساب','Keeps your session and account data')}</span></div><span className="cache-button"><Trash2 size={16}/>{t('مسح','Clear')}</span></button>
      </section>
      <section className="support-card"><div className="flex items-center gap-3"><span className="settings-icon" style={{background:'rgba(255,255,255,.12)',color:'#c8ef7a'}}><CircleHelp size={18}/></span><div><h2 className="font-bold">{t('تحتاج مساعدة؟','Need help?')}</h2><p className="mt-1 text-xs text-white/60">{t('فريق فرصة قريب منك دائماً','The Forsah team is here to help')}</p></div></div><button onClick={support} className="support-arrow" aria-label={t('الدعم','Support')}><ArrowLeft size={18}/></button></section>
    </div>
    <p className="copyright">{t('فرصة','Forsah')} <span>·</span> {t('تم التطوير بواسطة','Developed by')} <strong>Engineer Abdulrazzak Saleh Al-Ja'ili</strong></p>
  </>;
}
