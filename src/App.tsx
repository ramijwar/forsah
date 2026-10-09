import { Sparkles, Settings, MessageCircle, Heart, Home, Tag, Search, UserRound, Plus, ArrowLeft, ChevronLeft, Gavel, UsersRound, Truck, Zap, Armchair, PackageCheck, Wrench, CircleHelp } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as NativeApp } from '@capacitor/app';
import { apiRequest, apiUrl } from './api';
import { native, SessionVault } from './sessionVault';
import AdminDashboard from './AdminDashboard';
import './market.css';

type User = { id: number; name: string; email: string; phone: string | null; role: string };
type Session = { token: string; user: User };
type Ad = { id: number; user_id: number | null; title: string; description: string; category: string; status: string; owner_name?: string; images: number[] };
type Page = { items: Ad[]; has_more: boolean };
type Chat = { id: number; title: string | null; partner: string; last_message: string | null };
type Message = { id: number; sender_id?: number; sender_name?: string; sender_type?: string; content: string; created_at: string };
type Ticket = { id: number; subject: string; status: string; messages?: Message[] };
type Translate = (ar: string, en: string) => string;
const categories = [
  ['الحراج الشعبي','Marketplace'], ['سوق العمالة','Workers'], ['المواصلات والنقل الداخلي','Transport'],
  ['طوارئ السيارات','Roadside assistance'], ['المفروشات والموبيليا','Furniture'], ['الخدمات اللوجستية','Logistics'], ['خدمات الصيانة المنزلية','Home maintenance'],
];
const categoryAppearance = [
  { icon:Gavel, color:'#9a5b31', tint:'#f7eadf', ar:'بيع وشراء.. ولقطة اليوم تنتظرك', en:'Buy, sell and discover something special' },
  { icon:UsersRound, color:'#3d7290', tint:'#e6f1f5', ar:'أيدٍ خبيرة لخدماتك اليومية', en:'Skilled people for everyday services' },
  { icon:Truck, color:'#98702d', tint:'#f6f0de', ar:'مشاوير ونقل بين أحياء مدينتك', en:'Rides and transport around your city' },
  { icon:Zap, color:'#ca6246', tint:'#fbe9e4', ar:'مساعدة على الطريق وقت الحاجة', en:'Roadside assistance when you need it' },
  { icon:Armchair, color:'#90617e', tint:'#f3eaf1', ar:'لمسات جديدة لبيتك ومساحتك', en:'Something new for your home' },
  { icon:PackageCheck, color:'#3b826a', tint:'#e5f2ec', ar:'توصيل سريع.. من الباب للباب', en:'Deliveries from door to door' },
  { icon:Wrench, color:'#526fa0', tint:'#e9edf7', ar:'فنيون وخدمات لصيانة منزلك', en:'Find home maintenance services' },
];
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const persist = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing/storage quota */ } };
function ImageView({ id, token, title }: { id: number; token: string; title: string }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    fetch(apiUrl('image', { id: String(id) }), { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Image unavailable'); return r.blob(); })
      .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); } }).catch(() => setSrc(''));
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token]);
  return src ? <img loading="lazy" className="listing-image" src={src} alt={title} /> : <span className="image-placeholder" aria-label={title}>▧</span>;
}
function AdEditor({ ad, busy, t, submit }: { ad?: Ad; busy: boolean; t: Translate; submit: (body: Record<string, string>) => void }) {
  const [title, setTitle] = useState(ad?.title || '');
  const [description, setDescription] = useState(ad?.description || '');
  const [category, setCategory] = useState(ad?.category || categories[0][0]);
  return <form onSubmit={e => { e.preventDefault(); submit({ title, description, category }); }} className="market-form">
    <label>{t('العنوان','Title')}<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>{t('التصنيف','Category')}<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(([ar,en]) => <option key={ar} value={ar}>{t(ar,en)}</option>)}</select></label>
    <label>{t('الوصف وتفاصيل الخدمة والسعر','Description, service details and price')}<textarea required maxLength={3000} rows={5} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <p>{t('تخضع الإعلانات والتعديلات والصور للمراجعة قبل ظهورها للجمهور. يمكنك إضافة حتى 3 صور بعد حفظ الإعلان.','Listings, edits and images require moderation before publication. Add up to 3 images after saving.')}</p>
    <button disabled={busy} className="market-primary">{t('حفظ للمراجعة','Save for review')}</button>
  </form>;
}

export default function App() {
  const navigate = useNavigate(); const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean); const view = parts[0] || 'market'; const id = Number(parts[1]);
  const [language, setLanguage] = useState<'ar'|'en'>(() => stored('forsah-language','ar'));
  const t: Translate = (ar,en) => language === 'en' ? en : ar;
  const [theme, setTheme] = useState(() => stored('forsah-theme','system'));
  const [style, setStyle] = useState(() => stored('forsah-style','modern'));
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem('forsah-member-token') || ''; } catch { return ''; } });
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false); const [error, setError] = useState(''); const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false); const [loading, setLoading] = useState(false); const [revision, setRevision] = useState(0);
  const [list, setList] = useState<Ad[]>([]); const [ad, setAd] = useState<Ad | null>(null); const [more, setMore] = useState(false); const [page, setPage] = useState(1);
  const [favorites, setFavorites] = useState<number[]>([]);
  const [search, setSearch] = useState(''); const [query, setQuery] = useState(''); const [category, setCategory] = useState('');
  const [history, setHistory] = useState<string[]>(() => stored('forsah-search-history',[]));
  const [chats, setChats] = useState<Chat[]>([]); const [messages, setMessages] = useState<Message[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]); const [ticket, setTicket] = useState<Ticket | null>(null);
  const [message, setMessage] = useState(''); const [subject, setSubject] = useState(''); const [reason, setReason] = useState('');
  const [register, setRegister] = useState(false); const [name, setName] = useState(''); const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [phone, setPhone] = useState(''); const [currentPassword, setCurrentPassword] = useState('');
  const [biometric, setBiometric] = useState(false); const [savedBiometric, setSavedBiometric] = useState(false);
  const operation = useRef(false);
  const status = (s: string) => ({ pending: t('قيد المراجعة','Pending review'), active: t('منشور','Published'), rejected: t('مرفوض','Rejected'), blocked: t('محظور','Blocked'), open: t('مفتوحة','Open'), in_progress: t('قيد المتابعة','In progress'), resolved: t('مغلقة','Resolved') }[s] || s);
  const api = useCallback(<T,>(resource: string, action = '', options: RequestInit = {}, params: Record<string,string> = {}) => apiRequest<T>(resource, {
    ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type':'application/json' } : {}), ...options.headers },
  }, { ...params, ...(action ? { action } : {}) }), [token]);
  const saveToken = useCallback((value: string) => { setToken(value); try { if (value) sessionStorage.setItem('forsah-member-token',value); else sessionStorage.removeItem('forsah-member-token'); } catch { /* memory-only session */ } }, []);
  const run = async (work: () => Promise<void>) => {
    if(operation.current) return; operation.current=true;setBusy(true);setError('');setNotice('');
    try { await work(); } catch(e) { setError(e instanceof Error ? e.message : t('تعذر الاتصال بالخادم','Server connection failed')); }
    finally { operation.current=false;setBusy(false); }
  };
  useEffect(() => {
    persist('forsah-language',language); document.documentElement.lang=language;document.documentElement.dir=language==='ar'?'rtl':'ltr';
  },[language]);
  useEffect(() => { persist('forsah-theme',theme);persist('forsah-style',style); },[theme,style]);
  useEffect(() => {
    const m=matchMedia('(prefers-color-scheme: dark)');const fn=()=>setSystemDark(m.matches);m.addEventListener('change',fn);return()=>m.removeEventListener('change',fn);
  },[]);
  useEffect(() => {
    if(!native)return;
    SessionVault.available().then(s=>{setBiometric(s.available);setSavedBiometric(s.saved);if(s.saved){saveToken('');setUser(null);navigate('/account');}}).catch(()=>undefined);
  },[]);
  useEffect(() => {
    if(!native)return;
    const back=NativeApp.addListener('backButton',()=>{ if(location.pathname!=='/') navigate('/'); else void NativeApp.exitApp(); });
    const state=NativeApp.addListener('appStateChange',({isActive})=>{if(!isActive && savedBiometric) { saveToken('');setUser(null);setAd(null);setMessages([]);setTicket(null);navigate('/account'); }});
    return()=>{void back.then(h=>h.remove());void state.then(h=>h.remove());};
  },[location.pathname,navigate,savedBiometric,saveToken]);
  useEffect(() => {
    const controller=new AbortController();setReady(false);setUser(null);setFavorites([]);
    if(!token){setReady(true);return;}
    api<User>('auth','me',{signal:controller.signal}).then(u=>{setUser(u);setName(u.name);setEmail(u.email);setPhone(u.phone||'');setReady(true);})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);saveToken('');setReady(true);}});
    return()=>controller.abort();
  },[token,api,saveToken]);
  useEffect(() => {
    if(!user)return;const c=new AbortController();api<number[]>('favorites','',{signal:c.signal}).then(setFavorites).catch(()=>undefined);return()=>c.abort();
  },[user,api,revision]);
  useEffect(()=>{setError('');setNotice('');setMessage('');setReason('');setPassword('');setCurrentPassword('');setAd(null);setTicket(null);setMessages([]);},[location.pathname]);
  useEffect(() => {
    if(!ready)return;
    const controller=new AbortController();const options={signal:controller.signal};setLoading(true);let task:Promise<unknown>=Promise.resolve();
    if(['market','search','mine','favorites'].includes(view)) {
      if(!['market','search'].includes(view) && !user){setList([]);setLoading(false);return;}
      setList([]);task=api<Page>('market',['market','search'].includes(view)?'list':view,options,{q:query,category,page:String(page)}).then(data=>{setList(data.items);setMore(data.has_more);});
    } else if(view==='ad' && id) {setAd(null);task=api<Ad>('market','detail',options,{id:String(id)}).then(setAd);}
    else if(view==='messages' && user) task=api<Chat[]>('chat','list',options).then(setChats);
    else if(view==='support' && user) task=api<Ticket[]>('member-support','list',options).then(setTickets);
    else if(view==='ticket' && id && user) task=api<Ticket>('member-support','detail',options,{id:String(id)}).then(setTicket);
    task.catch(e=>{if(!controller.signal.aborted)setError(e.message);}).finally(()=>{if(!controller.signal.aborted)setLoading(false);});
    return()=>controller.abort();
  },[view,id,query,category,page,revision,api,ready,user]);
  useEffect(()=>{
    if(view!=='chat' || !id || !user)return;
    const controller=new AbortController();let timer:ReturnType<typeof setTimeout>;let after=0;setMessages([]);
    const poll=async()=>{
      try {
        if(document.visibilityState==='visible'){
          const data=await api<Message[]>('chat','messages',{signal:controller.signal},{id:String(id),after:String(after)});
          if(controller.signal.aborted)return;
          if(data.length){after=Number(data[data.length-1].id);setMessages(old=>[...old,...data.filter(m=>!old.some(o=>Number(o.id)===Number(m.id)))]);}
        }
      }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Connection failed');}
      if(!controller.signal.aborted)timer=setTimeout(poll,3000);
    };void poll();return()=>{controller.abort();clearTimeout(timer);};
  },[view,id,user,api]);
  const go=(path:string)=>{setPage(1);setQuery('');setSearch('');setCategory('');navigate(path);};
  const submitSearch=(e:FormEvent)=>{e.preventDefault();setPage(1);setQuery(search.trim());if(search.trim()){const next=[search.trim(),...history.filter(v=>v!==search.trim())].slice(0,10);setHistory(next);persist('forsah-search-history',next);}};
  const auth=()=>run(async()=>{
    const result=await apiRequest<Session>('auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,name})},{action:register?'register':'login'});
    if(native && savedBiometric){await SessionVault.clear();setSavedBiometric(false);}
    saveToken(result.token);setPassword('');go('/');
  });
  const requireLogin = !user && !['market','search','ad','account','settings','admin'].includes(view);
  const dark = theme==='dark'||(theme==='system'&&systemDark);
  if(view==='admin')return <><button className="market-admin-back" onClick={()=>go('/')}>{t('العودة للتطبيق','Back to app')}</button><AdminDashboard/></>;
  return <div className={`market-app ${dark?'night':''} ${style==='classic'?'classic':''}`} dir={language==='ar'?'rtl':'ltr'}>
    <header className="market-header"><button className="market-brand" onClick={()=>go('/')} aria-label={t('العودة إلى الرئيسية','Go home')}><span className="brand-mark"><Sparkles size={20}/></span><span><strong>{t('فرصة','Forsah')}</strong><small>{t('كل شيء يبدأ بفرصة','Everything starts with an opportunity')}</small></span></button><div className="market-header-actions"><button aria-label={t('المفضلة','Favorites')} onClick={()=>go('/favorites')}><Heart size={19}/></button><button aria-label={t('الرسائل','Messages')} onClick={()=>go('/messages')}><MessageCircle size={19}/></button><button aria-label={t('الإعدادات','Settings')} onClick={()=>go('/settings')}><Settings size={19}/></button></div></header>
    <main className="market-main">
      {error&&<div role="alert" className="market-error">{error}<button onClick={()=>{setError('');setRevision(v=>v+1);}}>{t('إعادة المحاولة','Retry')}</button></div>}
      {notice&&<div role="status" className="market-notice">{notice}</div>}
      {(!ready||loading)&&<p role="status">{t('جار التحميل…','Loading…')}</p>}
      {requireLogin&&<section className="market-panel"><h1>{t('سجّل دخولك أولًا','Please sign in')}</h1><p>{t('لحماية بياناتك، تتطلب هذه الخدمة حسابًا.','An account is required to protect your data.')}</p><button className="market-primary" onClick={()=>go('/account')}>{t('الدخول أو إنشاء حساب','Sign in or register')}</button></section>}
      {!requireLogin&&<>
        {['market','search','mine','favorites'].includes(view)&&<>
          {view==='market'?<>
            <section className="market-hero hero-panel">
              <div className="hero-orb hero-orb-one" aria-hidden="true"/><div className="hero-orb hero-orb-two" aria-hidden="true"/>
              <div className="forsah-hero-content"><span className="forsah-hero-badge"><Sparkles size={13}/>{t('منصتك المحلية لكل احتياج','Your local services platform')}</span>
                <h1>{t('خلّها فرصة..','An opportunity..')} <em>{t('لشيء أحلى','for something better')}</em></h1>
                <p>{t('اكتشف خدمات قريبة منك، أو اعرض خدمتك ووصل للي يبحث عنها.','Discover local services, or offer yours to people looking for them.')}</p>
                <div className="forsah-hero-actions"><button className="market-primary" onClick={()=>go('/new')}><Plus size={17}/>{t('أضف إعلانك','Create a listing')}</button><button className="forsah-hero-link" onClick={()=>go('/search')}>{t('اكتشف الخدمات','Explore services')}<ArrowLeft size={15}/></button></div>
              </div>
              <div className="hero-illustration" aria-hidden="true"><span className="hero-sun"/><span className="hero-card"><Sparkles size={25}/><span>{t('فرصتك','Your next')}<br/>{t('قريبة','opportunity')}</span></span><span className="hero-plant"/></div>
            </section>
            <section className="forsah-services" aria-label={t('تصفح الخدمات','Browse services')}><div className="forsah-section-heading"><div><span className="eyebrow">{t('اختَر ما يناسبك','Find what suits you')}</span><h2>{t('تصفّح الخدمات','Browse services')}</h2></div><button onClick={()=>go('/search')}>{t('عرض الكل','View all')}<ArrowLeft size={14}/></button></div>
              <div className="forsah-category-grid">{categories.map(([ar,en],i)=>{const appearance=categoryAppearance[i];const Icon=appearance.icon;return <button key={ar} className="forsah-category-card" onClick={()=>{setCategory(ar);setPage(1);setQuery('');setSearch('');navigate('/search');}}><span className="forsah-category-top"><span className="category-icon" style={{color:appearance.color,background:appearance.tint}}><Icon size={21} strokeWidth={1.8}/></span><span className="forsah-category-copy"><strong>{t(ar,en)}</strong><small>{t(appearance.ar,appearance.en)}</small></span><ChevronLeft size={16}/></span><span className="forsah-category-chip">{t('تصفح الإعلانات','Browse listings')}</span></button>;})}</div>
            </section>
            <div className="forsah-section-heading"><div><span className="eyebrow">{t('من مجتمع فرصة','From the Forsah community')}</span><h2>{t('الإعلانات المنشورة','Published listings')}</h2></div></div>
          </>:<div className="forsah-page-heading"><span className="eyebrow">{t('كل شيء يبدأ بفرصة','Everything starts with an opportunity')}</span><h1>{view==='mine'?t('إعلاناتي','My listings'):view==='favorites'?t('المفضلة','Favorites'):t('البحث','Search')}</h1><button className="market-primary" onClick={()=>go('/new')}><Plus size={16}/>{t('أضف إعلانًا','Create a listing')}</button></div>}
          <form className="market-search" onSubmit={submitSearch}><input aria-label={t('البحث','Search')} maxLength={120} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('ابحث في الإعلانات الفعلية…','Search real listings…')}/><button className="market-primary">{t('بحث','Search')}</button></form>
          <div className="market-filters"><button aria-pressed={!category} onClick={()=>{setCategory('');setPage(1);}}>{t('الكل','All')}</button>{categories.map(([ar,en])=><button key={ar} aria-pressed={category===ar} onClick={()=>{setCategory(ar);setPage(1);}}>{t(ar,en)}</button>)}</div>
          {!!history.length&&<details><summary>{t('عمليات البحث الأخيرة (على هذا الجهاز)','Recent searches (on this device)')}</summary><div className="market-filters">{history.map(q=><button key={q} onClick={()=>{setSearch(q);setQuery(q);setPage(1);}}>{q}</button>)}<button onClick={()=>{setHistory([]);persist('forsah-search-history',[]);}}>{t('مسح السجل','Clear history')}</button></div></details>}
          <section className="market-grid">{list.map(item=><article className="listing" key={item.id}>
            <button className="listing-open" onClick={()=>navigate(`/ad/${item.id}`)}>{item.images.length?<ImageView id={item.images[0]} token={token} title={item.title}/>:<span className="image-placeholder">◈</span>}<div><small>{categories.find(c=>c[0]===item.category)?.[language==='ar'?0:1]||item.category}</small><h2>{item.title}</h2><p>{item.description.slice(0,140)}</p><span>{item.owner_name||t('إعلان عام','Public listing')}</span>{view==='mine'&&<strong className="market-badge">{status(item.status)}</strong>}</div></button>
            <button disabled={busy||!user} aria-label={t('حفظ أو إزالة من المفضلة','Save or remove favorite')} onClick={()=>void run(async()=>{await api('favorites','',{method:favorites.includes(item.id)?'DELETE':'POST'},{id:String(item.id)});setRevision(v=>v+1);})}>{favorites.includes(item.id)?'♥':'♡'} {t('المفضلة','Favorite')}</button>
          </article>)}</section>
          {!loading&&!list.length&&<p className="market-empty">{t('لا توجد إعلانات مطابقة. لن نعرض بيانات وهمية.','No matching listings. No sample listings are shown.')}</p>}
          <div className="market-actions"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><span>{page}</span><button disabled={!more||loading} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></div>
        </>}
        {view==='new'&&user&&<section className="market-panel"><h1>{t('إعلان جديد','New listing')}</h1><AdEditor t={t} busy={busy} submit={body=>void run(async()=>{const result=await api<Ad>('market','create',{method:'POST',body:JSON.stringify(body)});navigate(`/ad/${result.id}`);})}/></section>}
        {view==='ad'&&ad&&<section className="market-panel"><span className="market-badge">{status(ad.status)}</span><h1>{ad.title}</h1><p className="market-description">{ad.description}</p><p>{ad.owner_name}</p>
          <div className="market-gallery">{ad.images.map(image=><div key={image}><ImageView id={image} token={token} title={ad.title}/>{user?.id===ad.user_id&&<button disabled={busy} onClick={()=>void run(async()=>{setAd(await api<Ad>('market','image-delete',{method:'DELETE'},{id:String(ad.id),image_id:String(image)}));})}>{t('حذف الصورة','Delete image')}</button>}</div>)}</div>
          {user?.id===ad.user_id?<><h2>{t('إدارة إعلانك','Manage your listing')}</h2><AdEditor key={`${ad.id}-${ad.status}`} ad={ad} t={t} busy={busy} submit={body=>void run(async()=>{setAd(await api<Ad>('market','edit',{method:'PATCH',body:JSON.stringify(body)},{id:String(ad.id)}));setNotice(t('حُفظ الإعلان للمراجعة','Listing saved for review'));})}/>
            <label className="market-upload">{t('إضافة صورة: JPEG / PNG / WebP، حتى 2 MB، 3 صور كحد أقصى','Add image: JPEG / PNG / WebP, up to 2 MB, maximum 3 images')}<input type="file" accept="image/jpeg,image/png,image/webp" disabled={busy||ad.images.length>=3||ad.status==='blocked'} onChange={e=>{const file=e.target.files?.[0];e.target.value='';if(file)void run(async()=>{if(file.size>2*1024*1024)throw new Error(t('الصورة أكبر من 2 MB','Image exceeds 2 MB'));const data=new FormData();data.append('image',file);setAd(await api<Ad>('market','image',{method:'POST',body:data},{id:String(ad.id)}));});}}/></label>
            <button className="market-danger" disabled={busy} onClick={()=>{if(confirm(t('حذف الإعلان نهائيًا؟','Permanently delete this listing?')))void run(async()=>{await api('market','delete',{method:'DELETE'},{id:String(ad.id)});go('/mine');});}}>{t('حذف الإعلان','Delete listing')}</button></>:<>
            <button className="market-primary" disabled={busy||!ad.user_id} onClick={()=>{if(!user){go('/account');return;}void run(async()=>{const chat=await api<{id:number}>('chat','start',{method:'POST'},{id:String(ad.id)});navigate(`/chat/${chat.id}`);});}}>{t('مراسلة صاحب الإعلان','Message the seller')}</button>
            {!ad.user_id&&<p>{t('الإعلان القديم غير مرتبط بحساب، لذلك لا يمكن مراسلة صاحبه.','This legacy listing has no linked account; messaging is unavailable.')}</p>}
          </>}
          {user&&<form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('reports','create',{method:'POST',body:JSON.stringify({name:user.name,email:user.email,entity_type:'ad',entity_id:ad.id,reason})});setReason('');setNotice(t('وصل البلاغ إلى الإدارة','Report submitted to moderation'));});}}><h2>{t('الإبلاغ عن الإعلان','Report listing')}</h2><input aria-label={t('سبب البلاغ','Report reason')} required maxLength={160} value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={busy}>{t('إرسال بلاغ','Submit report')}</button></form>}
        </section>}
        {view==='messages'&&user&&<section className="market-panel"><h1>{t('المحادثات','Conversations')}</h1><button onClick={()=>setRevision(v=>v+1)}>{t('تحديث','Refresh')}</button>{chats.map(c=><button className="market-thread" key={c.id} onClick={()=>navigate(`/chat/${c.id}`)}><strong>{c.partner} · {c.title||t('إعلان محذوف','Deleted listing')}</strong><span>{c.last_message||t('ابدأ المحادثة','Start the conversation')}</span></button>)}{!chats.length&&!loading&&<p>{t('ابدأ محادثة من صفحة إعلان منشور.','Start a conversation from a published listing.')}</p>}</section>}
        {view==='chat'&&user&&<section className="market-panel"><h1>{t('المحادثة','Conversation')}</h1><p>{t('تُحدَّث الرسائل كل 3 ثوانٍ أثناء فتح الصفحة.','Messages refresh every 3 seconds while this page is visible.')}</p><div className="market-messages" role="log" aria-live="polite">{messages.map(m=><article className={Number(m.sender_id)===user.id?'message-own':''} key={m.id}><p>{m.content}</p><small>{m.created_at} UTC</small></article>)}</div><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('chat','send',{method:'POST',body:JSON.stringify({content:message})},{id:String(id)});setMessage('');});}}><textarea aria-label={t('رسالتك','Your message')} required maxLength={3000} value={message} onChange={e=>setMessage(e.target.value)}/><button className="market-primary" disabled={busy}>{t('إرسال','Send')}</button></form></section>}
        {view==='support'&&user&&<section className="market-panel"><h1>{t('تذاكر الدعم','Support tickets')}</h1><button onClick={()=>setRevision(v=>v+1)}>{t('تحديث','Refresh')}</button>{tickets.map(v=><button className="market-thread" key={v.id} onClick={()=>navigate(`/ticket/${v.id}`)}><strong>{v.subject}</strong><span>{status(v.status)}</span></button>)}<h2>{t('تذكرة جديدة','New ticket')}</h2><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await api<{id:number}>('member-support','create',{method:'POST',body:JSON.stringify({subject,content:message})});setSubject('');navigate(`/ticket/${result.id}`);});}}><label>{t('الموضوع','Subject')}<input required maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>{t('التفاصيل','Details')}<textarea required maxLength={5000} value={message} onChange={e=>setMessage(e.target.value)}/></label><button className="market-primary" disabled={busy}>{t('إرسال للدعم','Send to support')}</button></form></section>}
        {view==='ticket'&&ticket&&user&&<section className="market-panel"><h1>{ticket.subject}</h1><p>{status(ticket.status)}</p><button onClick={()=>setRevision(v=>v+1)}>{t('تحديث الردود','Refresh replies')}</button><div className="market-messages">{ticket.messages?.map(m=><article key={m.id}><strong>{m.sender_name} · {m.sender_type}</strong><p>{m.content}</p><small>{m.created_at} UTC</small></article>)}</div><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('member-support','reply',{method:'POST',body:JSON.stringify({content:message})},{id:String(id)});setMessage('');setRevision(v=>v+1);});}}><textarea aria-label={t('الرد','Reply')} required maxLength={5000} value={message} onChange={e=>setMessage(e.target.value)}/><button disabled={busy} className="market-primary">{t('إرسال الرد وإعادة فتح التذكرة','Reply and reopen ticket')}</button></form></section>}
        {view==='account'&&<section className="market-panel"><h1>{t('حسابي','My account')}</h1>{!user?<>
          <div className="market-actions"><button aria-pressed={!register} onClick={()=>setRegister(false)}>{t('دخول','Sign in')}</button><button aria-pressed={register} onClick={()=>setRegister(true)}>{t('إنشاء حساب','Register')}</button></div>
          <form className="market-form" onSubmit={e=>{e.preventDefault();void auth();}}>{register&&<label>{t('الاسم','Name')}<input required autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>}<label>{t('البريد الإلكتروني','Email')}<input required type="email" autoComplete="email" maxLength={190} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{t('كلمة المرور (12 حرفًا على الأقل للحساب الجديد)','Password (at least 12 characters for new accounts)')}<input required type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="market-primary" disabled={busy}>{register?t('إنشاء الحساب','Create account'):t('دخول','Sign in')}</button></form>
          {native&&savedBiometric&&<button disabled={busy} onClick={()=>void run(async()=>{const session=await SessionVault.unlock();saveToken(session.token);})}>{t('فتح الجلسة بالبصمة','Unlock session with biometrics')}</button>}
        </>:<><p>{user.email}</p><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{setUser(await api<User>('auth','profile',{method:'PATCH',body:JSON.stringify({name,phone})}));setNotice(t('تم حفظ بياناتك','Profile saved'));});}}><label>{t('الاسم','Name')}<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('الهاتف (لا يُعرض علنًا)','Phone (not displayed publicly)')}<input type="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)}/></label><button disabled={busy}>{t('حفظ بيانات الحساب','Save profile')}</button></form>
          <details><summary>{t('تغيير كلمة المرور','Change password')}</summary><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('auth','password',{method:'POST',body:JSON.stringify({current_password:currentPassword,password})});if(native)await SessionVault.clear();setSavedBiometric(false);saveToken('');setUser(null);setPassword('');setCurrentPassword('');setNotice(t('تم تغيير كلمة المرور وإبطال جميع الجلسات. سجل الدخول مجددًا.','Password changed. All sessions revoked. Sign in again.'));});}}><input required type="password" aria-label={t('كلمة المرور الحالية','Current password')} autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/><input required type="password" aria-label={t('كلمة المرور الجديدة','New password')} autoComplete="new-password" minLength={12} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy}>{t('تغيير كلمة المرور','Change password')}</button></form></details>
          <button className="market-danger" disabled={busy} onClick={()=>void run(async()=>{await api('auth','logout',{method:'POST'});if(native)await SessionVault.clear();setSavedBiometric(false);saveToken('');setUser(null);go('/');})}>{t('تسجيل الخروج','Sign out')}</button>{user.role!=='user'&&<button onClick={()=>go('/admin')}>{t('لوحة الإدارة (العربية)','Administration (Arabic)')}</button>}
        </>}</section>}
        {view==='settings'&&<section className="market-panel"><h1>{t('الإعدادات','Settings')}</h1><div className="market-form"><label>{t('اللغة','Language')}<select aria-label={t('اللغة','Language')} value={language} onChange={e=>setLanguage(e.target.value as 'ar'|'en')}><option value="ar">العربية</option><option value="en">English</option></select></label><label>{t('المظهر','Theme')}<select aria-label={t('المظهر','Theme')} value={theme} onChange={e=>setTheme(e.target.value)}><option value="system">{t('حسب النظام','System')}</option><option value="light">{t('فاتح','Light')}</option><option value="dark">{t('داكن','Dark')}</option></select></label><label>{t('نمط الواجهة','Interface style')}<select aria-label={t('نمط الواجهة','Interface style')} value={style} onChange={e=>setStyle(e.target.value)}><option value="modern">{t('عصري','Modern')}</option><option value="classic">{t('كلاسيكي','Classic')}</option></select></label></div>
          <h2>{t('البصمة وحماية الجلسة','Biometrics and session protection')}</h2><p>{t('تُشفّر الجلسة بمفتاح Android Keystore، وتُقفل عند انتقال التطبيق إلى الخلفية. لا تُخزّن كلمة المرور. انتهاء جلسة الخادم يتطلب دخولًا جديدًا.','The session is encrypted with Android Keystore and locks when the app goes into the background. Your password is not stored. An expired server session requires signing in again.')}</p>
          {native&&biometric&&user&&<button disabled={busy} onClick={()=>void run(async()=>{await SessionVault.save({token});setSavedBiometric(true);setNotice(t('تم حفظ الجلسة المشفرة بالبصمة','Biometric session saved securely'));})}>{t('تفعيل أو تحديث جلسة البصمة','Enable or refresh biometric session')}</button>}
          {savedBiometric&&<button disabled={busy} onClick={()=>void run(async()=>{await SessionVault.clear();setSavedBiometric(false);})}>{t('حذف جلسة البصمة من الجهاز','Remove biometric session from device')}</button>}
          {(!native||!biometric)&&<p>{t('تتطلب البصمة جهاز Android يدعم قياسات حيوية قوية ومسجلة.','Requires an Android device with an enrolled strong biometric.')}</p>}
          <button disabled={busy} onClick={()=>void run(async()=>{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('forsah-')).map(k=>caches.delete(k)));}setNotice(t('تم مسح ملفات التخزين المؤقت دون حذف الحساب','Cached files cleared without deleting your account'));})}>{t('مسح التخزين المؤقت','Clear cache')}</button>
          <h2>{t('الخصوصية','Privacy')}</h2><p>{t('الإعلانات المنشورة وأسماء أصحابها عامة. الرسائل وتذاكر الدعم محمية بصلاحيات الحساب. تُحذف بيانات الموقع من الصور عند رفعها. إشعارات الدفع غير مضمنة حسب الطلب.','Published listings and seller names are public. Messages and support tickets are access-controlled. Image location metadata is stripped on upload. Push notifications are not included as requested.')}</p>
        </section>}
      </>}
    </main>
    <nav className="market-nav" aria-label={t('التنقل الرئيسي','Main navigation')}>{[
      {path:'/',icon:Home,label:t('الرئيسية','Home')},
      {path:'/messages',icon:MessageCircle,label:t('رسائلي','Messages')},
      {path:'/mine',icon:Tag,label:t('إعلاناتي','My ads')},
      {path:'/search',icon:Search,label:t('البحث','Search')},
      {path:'/account',icon:UserRound,label:t('حسابي','Account')},
    ].map(({path,icon:Icon,label})=><button key={path} aria-current={location.pathname===path?'page':undefined} onClick={()=>go(path)}><span><Icon size={20}/></span>{label}</button>)}</nav>
    <button className="forsah-support-link" aria-label={t('الدعم الفني','Support')} onClick={()=>go('/support')}><CircleHelp size={18}/>{t('تحتاج مساعدة؟','Need help?')}</button>
  </div>;
}
