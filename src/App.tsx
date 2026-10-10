import { Sparkles, Settings, MessageCircle, Heart, Home, Tag, Search, UserRound, Plus, ArrowLeft, ChevronLeft, Bell, Clock3, LockKeyhole, BadgeCheck, SlidersHorizontal, X } from 'lucide-react';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { App as NativeApp } from '@capacitor/app';
import { ApiError, apiRequest, apiUrl } from './api';
import { native, SessionVault } from './sessionVault';
import AdminDashboard from './AdminDashboard';
import './market.css';
import { OriginalHome, OriginalSettings, type FeedPreferences } from './OriginalViews';
import HeaderPopover from './HeaderPopover';
import Overlay from './Overlay';
import { compressAdImage } from './imageCompression';

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
const stored = <T,>(key: string, fallback: T): T => { try { return JSON.parse(localStorage.getItem(key) || 'null') ?? fallback; } catch { return fallback; } };
const persist = (key: string, value: unknown) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private browsing/storage quota */ } };
function ImageView({ id, token, title, thumbnail = false }: { id: number; token: string; title: string; thumbnail?: boolean }) {
  const [src, setSrc] = useState('');
  useEffect(() => {
    const controller = new AbortController(); let objectUrl = '';
    setSrc('');
    fetch(apiUrl('image', { id: String(id), ...(thumbnail ? { size: 'thumb' } : {}) }), { headers: token ? { Authorization: `Bearer ${token}` } : {}, signal: controller.signal })
      .then(r => { if (!r.ok) throw new Error('Image unavailable'); return r.blob(); })
      .then(blob => { if (!controller.signal.aborted) { objectUrl = URL.createObjectURL(blob); setSrc(objectUrl); } }).catch(() => setSrc(''));
    return () => { controller.abort(); if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [id, token, thumbnail]);
  return src ? <img loading="lazy" className="listing-image" src={src} alt={title} /> : <span className="image-placeholder" aria-label={title}>▧</span>;
}
function AdGallery({ images, token, title, remove, busy, t }: { images: number[]; token: string; title: string; remove?: (id: number) => void; busy: boolean; t: Translate }) {
  const [selected, setSelected] = useState(0);
  const start = useRef<number | null>(null);
  const index = Math.min(selected, Math.max(0, images.length - 1));
  const move = (step: number) => setSelected((index + step + images.length) % images.length);
  if (!images.length) return null;
  return <section className="ad-carousel" aria-label={t('صور الإعلان','Listing photos')}>
    <div className="ad-carousel-stage" onTouchStart={e => { start.current=e.touches[0].clientX; }} onTouchEnd={e => { if(start.current!==null) { const dx=e.changedTouches[0].clientX-start.current; if(Math.abs(dx)>45) move(dx<0?1:-1); } start.current=null; }}>
      <ImageView key={images[index]} id={images[index]} token={token} title={title}/>
    </div>
    <div className="ad-carousel-controls"><button type="button" onClick={()=>move(-1)} disabled={images.length<2} aria-label={t('الصورة السابقة','Previous photo')}>‹</button><span aria-live="polite">{index+1} / {images.length}</span><button type="button" onClick={()=>move(1)} disabled={images.length<2} aria-label={t('الصورة التالية','Next photo')}>›</button></div>
    <div className="ad-carousel-strip">{images.map((id,i)=><button type="button" key={id} aria-label={t(`عرض الصورة ${i+1}`,`Show photo ${i+1}`)} aria-pressed={i===index} onClick={()=>setSelected(i)}><ImageView id={id} token={token} title={title} thumbnail/></button>)}</div>
    {remove&&<button type="button" disabled={busy} onClick={()=>remove(images[index])}>{t('حذف الصورة المحددة','Delete selected photo')}</button>}
  </section>;
}
function AdEditor({ ad, busy, t, submit, initialCategory }: { initialCategory?: string; ad?: Ad; busy: boolean; t: Translate; submit: (body: Record<string, string>) => void }) {
  const [title, setTitle] = useState(ad?.title || '');
  const [description, setDescription] = useState(ad?.description || '');
  const [category, setCategory] = useState(ad?.category || initialCategory || categories[0][0]);
  return <form onSubmit={e => { e.preventDefault(); submit({ title, description, category }); }} className="market-form">
    <label>{t('العنوان','Title')}<input required maxLength={120} value={title} onChange={e => setTitle(e.target.value)} /></label>
    <label>{t('التصنيف','Category')}<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(([ar,en]) => <option key={ar} value={ar}>{t(ar,en)}</option>)}</select></label>
    <label>{t('الوصف وتفاصيل الخدمة والسعر','Description, service details and price')}<textarea required maxLength={3000} rows={5} value={description} onChange={e => setDescription(e.target.value)} /></label>
    <p>{t('تخضع الإعلانات والتعديلات والصور للمراجعة قبل ظهورها للجمهور. يمكنك إضافة حتى 4 صور بعد حفظ الإعلان.','Listings, edits and images require moderation before publication. Add up to 4 images after saving.')}</p>
    <button disabled={busy} className="market-primary">{t('حفظ للمراجعة','Save for review')}</button>
  </form>;
}

export default function App() {
  const navigate = useNavigate(); const location = useLocation();
  const parts = location.pathname.split('/').filter(Boolean); const view = (parts[0]==='ads'?'mine':parts[0]==='home'?'market':parts[0]) || 'market'; const id = Number(parts[1]);
  const [language, setLanguage] = useState<'ar'|'en'>(() => stored('forsah-language','ar'));
  const t: Translate = (ar,en) => language === 'en' ? en : ar;
  const [theme, setTheme] = useState(() => stored('forsah-theme','system'));
  const [style, setStyle] = useState(() => stored('forsah-style','modern'));
  const [systemDark, setSystemDark] = useState(matchMedia('(prefers-color-scheme: dark)').matches);
  const [token, setToken] = useState(() => { try { return native ? '' : localStorage.getItem('forsah-member-token') || sessionStorage.getItem('forsah-member-token') || ''; } catch { return ''; } });
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
  const [popover,setPopover]=useState<'notices'|'messages'|null>(null);
  const [newOpen,setNewOpen]=useState(false);const [authOpen,setAuthOpen]=useState(false);const [draftCategory,setDraftCategory]=useState(categories[0][0]);
  const [feedPreferences,setFeedPreferences]=useState<FeedPreferences>(()=>stored('forsah-feed-preferences',{ads:true,chat:true,support:true}));
  const [filtersOpen,setFiltersOpen]=useState(false);const [recentOpen,setRecentOpen]=useState(false);
  const headerArea=useRef<HTMLDivElement>(null);const popupTrigger=useRef<HTMLButtonElement|null>(null);
  const routeScroll=useRef<Record<string,number>>({});
  const operation = useRef(false);
  const status = (s: string) => ({ pending: t('قيد المراجعة','Pending review'), active: t('منشور','Published'), rejected: t('مرفوض','Rejected'), blocked: t('محظور','Blocked'), open: t('مفتوحة','Open'), in_progress: t('قيد المتابعة','In progress'), resolved: t('مغلقة','Resolved') }[s] || s);
  const api = useCallback(<T,>(resource: string, action = '', options: RequestInit = {}, params: Record<string,string> = {}) => apiRequest<T>(resource, {
    ...options, headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(options.body && !(options.body instanceof FormData) ? { 'Content-Type':'application/json' } : {}), ...options.headers },
  }, { ...params, ...(action ? { action } : {}) }), [token]);
  const sessionWrites = useRef<Promise<void>>(Promise.resolve());
  const saveToken = useCallback((value: string) => {
    setToken(value);
    if(native) {
      sessionWrites.current=sessionWrites.current.catch(()=>undefined).then(()=>SessionVault.persist({token:savedBiometric?'':value}));
      void sessionWrites.current.catch(()=>setError('تعذر حفظ الجلسة على الجهاز'));
      return sessionWrites.current;
    }
    try { for(const storage of [localStorage,sessionStorage]) { if(value) storage.setItem('forsah-member-token',value); else storage.removeItem('forsah-member-token'); } } catch { setError('تعذر حفظ الجلسة على الجهاز'); }
    return Promise.resolve();
  }, [savedBiometric]);
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
    let cancelled=false;
    void (async()=>{const s=await SessionVault.available();if(cancelled)return;setBiometric(s.available);setSavedBiometric(s.saved);if(s.saved){setToken('');setUser(null);navigate('/account');await SessionVault.persist({token:''});}else{const restored=await SessionVault.restore();if(!cancelled)setToken(restored.token);}})().catch(()=>setError('تعذر استعادة الجلسة المحفوظة'));
    return()=>{cancelled=true;};
  },[]);
  useEffect(() => {
    if(!native)return;
    const back=NativeApp.addListener('backButton',()=>{ if(newOpen){setNewOpen(false);return;}if(authOpen){setAuthOpen(false);return;}if(popover){setPopover(null);return;}if(location.pathname!=='/') navigate('/'); else void NativeApp.exitApp(); });
    const state=NativeApp.addListener('appStateChange',({isActive})=>{if(!isActive && savedBiometric) { saveToken('');setUser(null);setAd(null);setMessages([]);setTicket(null);navigate('/account'); }});
    return()=>{void back.then(h=>h.remove());void state.then(h=>h.remove());};
  },[location.pathname,navigate,savedBiometric,saveToken,newOpen,authOpen,popover]);
  useEffect(() => {
    const controller=new AbortController();setReady(false);setUser(null);setFavorites([]);
    if(!token){setReady(true);return;}
    api<User>('auth','me',{signal:controller.signal}).then(u=>{setUser(u);setName(u.name);setEmail(u.email);setPhone(u.phone||'');setReady(true);})
      .catch(e=>{if(!controller.signal.aborted){setError(e.message);if(e instanceof ApiError && e.status===401) { void saveToken(''); if(native) void SessionVault.clear().then(()=>setSavedBiometric(false)); }setReady(true);}});
    return()=>controller.abort();
  },[token,api,saveToken]);
  useEffect(() => {
    if(!user)return;const c=new AbortController();api<number[]>('favorites','',{signal:c.signal}).then(setFavorites).catch(()=>undefined);return()=>c.abort();
  },[user,api,revision]);
  useEffect(()=>{setPopover(null);setNewOpen(false);setAuthOpen(false);setError('');setNotice('');setMessage('');setReason('');setPassword('');setCurrentPassword('');setAd(null);setTicket(null);setMessages([]);},[location.pathname]);
  useEffect(()=>{persist('forsah-feed-preferences',feedPreferences);},[feedPreferences]);
  useEffect(()=>{
    if(!popover)return;
    const outside=(event:PointerEvent)=>{if(event.target instanceof Node&&!headerArea.current?.contains(event.target))setPopover(null);};
    const escape=(event:KeyboardEvent)=>{if(event.key==='Escape'){event.preventDefault();setPopover(null);popupTrigger.current?.focus({preventScroll:true});}};
    document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escape);
    return()=>{document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escape);};
  },[popover]);
  useLayoutEffect(()=>{
    const path=location.pathname;
    window.scrollTo({top:routeScroll.current[path]||0,behavior:'instant'});
    return()=>{routeScroll.current[path]=window.scrollY;};
  },[location.pathname]);
  useEffect(()=>{if(!notice)return;const timer=setTimeout(()=>setNotice(''),4000);return()=>clearTimeout(timer);},[notice]);
  useEffect(() => {
    if(!ready)return;
    const controller=new AbortController();const options={signal:controller.signal};setLoading(true);let task:Promise<unknown>=Promise.resolve();
    if(['search','mine','favorites'].includes(view)) {
      if(!['market','search'].includes(view) && !user){setList([]);setLoading(false);return;}
      task=api<Page>('market',['market','search'].includes(view)?'list':view,options,{q:query,category,page:String(page)}).then(data=>{setList(data.items);setMore(data.has_more);});
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
  const go=(path:string)=>{setPopover(null);setAuthOpen(false);if(path==='/new'){setDraftCategory(categories[0][0]);setNewOpen(true);return;}setPage(1);setQuery('');setSearch('');setCategory('');navigate(path);};
  const browse=(selected='',term='')=>{routeScroll.current['/search']=0;setPopover(null);setPage(1);setCategory(selected);setQuery(term);setSearch(term);navigate('/search');};
  const create=(selected=categories[0][0])=>{setPopover(null);setDraftCategory(selected);setNewOpen(true);};
  useEffect(()=>{if(view!=='search')return;const timer=setTimeout(()=>{setPage(1);setQuery(search.trim());},300);return()=>clearTimeout(timer);},[view,search]);
  const submitSearch=(e:FormEvent)=>{e.preventDefault();setPage(1);setQuery(search.trim());if(search.trim()){const next=[search.trim(),...history.filter(v=>v!==search.trim())].slice(0,10);setHistory(next);persist('forsah-search-history',next);}};
  const auth=()=>run(async()=>{
    const result=await apiRequest<Session>('auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email,password,name})},{action:register?'register':'login'});
    if(native && savedBiometric){await SessionVault.clear();setSavedBiometric(false);}
    if(native) await SessionVault.persist({token:result.token});
    else await saveToken(result.token);
    setToken(result.token);setPassword('');setAuthOpen(false);go('/');
  });
  const requireLogin = !user && !['market','search','ad','account','settings','admin','messages','mine','new'].includes(view);
  const dark = theme==='dark'||(theme==='system'&&systemDark);
  if(view==='admin')return <><button className="market-admin-back" onClick={()=>go('/')}>{t('العودة للتطبيق','Back to app')}</button><AdminDashboard memberToken={user?.role!=='user'?token:''}/></>;
  return <div className={`app-shell ${dark?'dark-theme':''} ${style==='classic'?'classic-style':''}`} dir={language==='ar'?'rtl':'ltr'}>
    <div className="page-wrap original-page-wrap">
    <div ref={headerArea}>
      <header className="flex items-center justify-between pt-6 pb-5 md:pt-8">
        <button className="flex items-center gap-3 text-right" onClick={()=>go('/')} aria-label={t('العودة إلى الرئيسية','Go home')}><span className="brand-mark"><Sparkles size={20} strokeWidth={2.3}/></span><span><span className="block text-[22px] font-bold leading-none tracking-tight text-[#174c3c] dark-text">{t('فرصة','Forsah')}</span><span className="mt-1 block text-[11px] font-medium text-[#86918a]">{t('كل شيء يبدأ بفرصة','Everything starts with an opportunity')}</span></span></button>
        <div className="flex items-center gap-2">
          <button className={`icon-button relative ${popover==='notices'?'icon-button-active':''}`} aria-label={t('الإشعارات','Notifications')} aria-expanded={popover==='notices'} aria-controls={popover==='notices'?'header-popover':undefined} aria-haspopup="dialog" onClick={event=>{popupTrigger.current=event.currentTarget;setPopover(value=>value==='notices'?null:'notices');}}><Bell size={19}/></button>
          <button className={`icon-button ${popover==='messages'?'icon-button-active':''}`} aria-label={t('الرسائل','Messages')} aria-expanded={popover==='messages'} aria-controls={popover==='messages'?'header-popover':undefined} aria-haspopup="dialog" onClick={event=>{popupTrigger.current=event.currentTarget;setPopover(value=>value==='messages'?null:'messages');}}><MessageCircle size={19}/></button>
          <button className="icon-button" aria-label={t('الإعدادات','Settings')} onClick={()=>go('/settings')}><Settings size={19}/></button>
        </div>
      </header>
      {popover&&<HeaderPopover kind={popover} userId={user?.id} api={api} t={t} preferences={feedPreferences} close={()=>{setPopover(null);popupTrigger.current?.focus({preventScroll:true});}} go={go}/>}
    </div>
    <main className="main-content">
      {error&&!newOpen&&!authOpen&&view!=='new'&&<div role="alert" className="market-error">{error}<button onClick={()=>{setError('');setRevision(v=>v+1);}}>{t('إعادة المحاولة','Retry')}</button></div>}
      {view!=='market'&&(!ready||loading)&&<div className="inline-loading" role="status">{t('جار التحميل…','Loading…')}</div>}
      {requireLogin&&<section className="market-panel"><h1>{t('سجّل دخولك أولًا','Please sign in')}</h1><p>{t('لحماية بياناتك، تتطلب هذه الخدمة حسابًا.','An account is required to protect your data.')}</p><button className="market-primary" onClick={()=>go('/account')}>{t('الدخول أو إنشاء حساب','Sign in or register')}</button></section>}
      {!requireLogin&&<>
        {view==='market'&&<OriginalHome t={t} browse={browse} create={create}/>}
        {['search','mine','favorites'].includes(view)&&<>
          <div className="mb-5 mt-5 flex items-end justify-between"><div><p className="eyebrow">{view==='mine'?t('كل ما نشرته','Your listings'):t('اكتشف القريب منك','Explore your community')}</p><h1 className="mt-1 text-[26px] font-bold">{view==='mine'?t('إعلاناتي','My listings'):view==='favorites'?t('المفضلة','Favorites'):t('البحث','Search')}</h1></div>{view==='mine'&&<button className="small-primary" onClick={()=>create()}><Plus size={16}/>{t('إعلان جديد','New listing')}</button>}</div>
          {view!=='mine'&&<><form className="search-field" onSubmit={submitSearch}><Search size={19}/><input aria-label={t('البحث','Search')} value={search} maxLength={120} onChange={e=>setSearch(e.target.value)} placeholder={t('وش تدور عليه؟','What are you looking for?')}/><button type="button" aria-label={t('تصفية البحث','Filter search')} aria-expanded={filtersOpen} onClick={()=>setFiltersOpen(v=>!v)}><SlidersHorizontal size={18}/></button></form>
          <div className="mt-5 flex gap-2 overflow-x-auto pb-2 no-scrollbar">{[['',t('الكل','All')],...categories.map(([ar,en])=>[ar,t(ar,en)])].map(([value,label])=><button key={value} className={`filter-chip ${category===value?'filter-chip-active':''}`} aria-pressed={category===value} onClick={()=>{setCategory(value);setPage(1);}}>{label}</button>)}</div>
          {filtersOpen&&<div className="tip-card mt-3"><button onClick={()=>{setSearch('');setQuery('');setCategory('');setPage(1);}}>{t('مسح الكلمات والتصنيف','Clear search and category')}</button><span>{t('تُعرض الإعلانات المنشورة فقط، الأحدث أولًا.','Published listings only, newest first.')}</span></div>}</>}
          {!!history.length&&<details><summary>{t('عمليات البحث الأخيرة (على هذا الجهاز)','Recent searches (on this device)')}</summary><div className="market-filters">{history.map(q=><button key={q} onClick={()=>{setSearch(q);setQuery(q);setPage(1);}}>{q}</button>)}<button onClick={()=>{setHistory([]);persist('forsah-search-history',[]);}}>{t('مسح السجل','Clear history')}</button></div></details>}
          <section className="market-grid mt-3">{list.map(item=><article className="listing" key={item.id}>
            <button className="listing-open" onClick={()=>navigate(`/ad/${item.id}`)}>{item.images.length?<ImageView id={item.images[0]} token={token} title={item.title} thumbnail/>:<span className="image-placeholder">◈</span>}<div><small>{categories.find(c=>c[0]===item.category)?.[language==='ar'?0:1]||item.category}</small><h2>{item.title}</h2><p>{item.description.slice(0,140)}</p><span>{item.owner_name||t('إعلان عام','Public listing')}</span>{view==='mine'&&<strong className="market-badge">{status(item.status)}</strong>}</div></button>
            <button disabled={busy||!user} aria-label={t('حفظ أو إزالة من المفضلة','Save or remove favorite')} onClick={()=>void run(async()=>{await api('favorites','',{method:favorites.includes(item.id)?'DELETE':'POST'},{id:String(item.id)});setRevision(v=>v+1);})}>{favorites.includes(item.id)?'♥':'♡'} {t('المفضلة','Favorite')}</button>
          </article>)}</section>
          {!loading&&!list.length&&<div className={`empty-state ${view==='mine'?'ads-empty':''}`}><span className="empty-illustration">{view==='mine'?<Tag size={25}/>:<Search size={25}/>}</span><strong>{view==='mine'?t('ما عندك إعلانات للحين','No listings yet'):t('ما لقينا نتائج مطابقة','No matching listings')}</strong><span>{view==='mine'?t('انشر خدمتك أو غرضك وخله يوصل للناس.','Post your service or item for others to discover.'):t('جرّب كلمات ثانية أو تصفّح كل الخدمات.','Try another search or browse all categories.')}</span>{view==='mine'&&<button className="primary-button mt-2" onClick={()=>create()}><Plus size={17}/>{t('أضف أول إعلان','Create your first listing')}</button>}</div>}
          {view==='mine'&&<div className="tip-card mt-4"><Sparkles size={17}/><span><strong>{t('نصيحة لظهور أفضل','A tip for better listings')}</strong><br/>{t('أضف صور واضحة ووصف مختصر لإعلانك.','Add clear photos and a concise description.')}</span></div>}
          {(more||page>1)&&<div className="market-actions"><button disabled={page===1||loading} onClick={()=>setPage(p=>p-1)}>{t('السابق','Previous')}</button><span>{page}</span><button disabled={!more||loading} onClick={()=>setPage(p=>p+1)}>{t('التالي','Next')}</button></div>}
        </>}
        {view==='ad'&&ad&&<section className="market-panel"><span className="market-badge">{status(ad.status)}</span><h1>{ad.title}</h1><p className="market-description">{ad.description}</p><p>{ad.owner_name}</p>
          <AdGallery key={ad.id} images={ad.images} token={token} title={ad.title} busy={busy} t={t} remove={user?.id===ad.user_id ? image=>void run(async()=>{setAd(await api<Ad>('market','image-delete',{method:'DELETE'},{id:String(ad.id),image_id:String(image)}));}) : undefined}/>
          {user?.id===ad.user_id?<><h2>{t('إدارة إعلانك','Manage your listing')}</h2><AdEditor key={`${ad.id}-${ad.status}`} ad={ad} t={t} busy={busy} submit={body=>void run(async()=>{setAd(await api<Ad>('market','edit',{method:'PATCH',body:JSON.stringify(body)},{id:String(ad.id)}));setNotice(t('حُفظ الإعلان للمراجعة','Listing saved for review'));})}/>
            <label className="market-upload">{t('إضافة صور (حتى 4) — تُضغط تلقائيًا قبل الرفع','Add photos (up to 4) — automatically compressed before upload')}<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={busy||ad.images.length>=4||ad.status==='blocked'} onChange={e=>{const files=Array.from(e.target.files||[]);e.target.value='';if(files.length)void run(async()=>{if(files.length+ad.images.length>4)throw new Error(t('الحد الأقصى 4 صور لكل إعلان','Maximum 4 photos per listing'));for(const file of files){const compressed=await compressAdImage(file);const data=new FormData();data.append('image',compressed);setAd(await api<Ad>('market','image',{method:'POST',body:data},{id:String(ad.id)}));}});}}/></label>
            <button className="market-danger" disabled={busy} onClick={()=>{if(confirm(t('حذف الإعلان نهائيًا؟','Permanently delete this listing?')))void run(async()=>{await api('market','delete',{method:'DELETE'},{id:String(ad.id)});go('/mine');});}}>{t('حذف الإعلان','Delete listing')}</button></>:<>
            <button className="market-primary" disabled={busy||!ad.user_id} onClick={()=>{if(!user){go('/account');return;}void run(async()=>{const chat=await api<{id:number}>('chat','start',{method:'POST'},{id:String(ad.id)});navigate(`/chat/${chat.id}`);});}}>{t('مراسلة صاحب الإعلان','Message the seller')}</button>
            {!ad.user_id&&<p>{t('الإعلان القديم غير مرتبط بحساب، لذلك لا يمكن مراسلة صاحبه.','This legacy listing has no linked account; messaging is unavailable.')}</p>}
          </>}
          {user&&<form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('reports','create',{method:'POST',body:JSON.stringify({name:user.name,email:user.email,entity_type:'ad',entity_id:ad.id,reason})});setReason('');setNotice(t('وصل البلاغ إلى الإدارة','Report submitted to moderation'));});}}><h2>{t('الإبلاغ عن الإعلان','Report listing')}</h2><input aria-label={t('سبب البلاغ','Report reason')} required maxLength={160} value={reason} onChange={e=>setReason(e.target.value)}/><button disabled={busy}>{t('إرسال بلاغ','Submit report')}</button></form>}
        </section>}
        {view==='messages'&&<>
          <div className="mb-5 mt-5"><p className="eyebrow">{t('تواصل بسهولة','Stay in touch')}</p><h1 className="mt-1 text-[26px] font-bold">{t('رسائلي','My messages')}</h1></div>
          <label className="search-field compact-search"><Search size={18}/><input aria-label={t('البحث في المحادثات','Search conversations')} value={search} onChange={e=>setSearch(e.target.value)} placeholder={t('ابحث في محادثاتك','Search your conversations')}/></label>
          {user&&chats.filter(c=>`${c.partner} ${c.title||''} ${c.last_message||''}`.includes(search)).map(c=><button key={c.id} className="conversation-card mt-4" onClick={()=>navigate(`/chat/${c.id}`)}><span className="avatar">{c.partner.slice(0,1)}</span><span className="flex-1 text-start"><strong className="text-sm">{c.partner}</strong><span className="mt-1 block text-xs text-[#8b958e]">{c.last_message||c.title||t('ابدأ المحادثة','Start the conversation')}</span></span><ChevronLeft size={16}/></button>)}
          {(!user||!chats.length)&&<div className="empty-invite mt-4"><MessageCircle size={20}/><p>{user?t('محادثاتك الجديدة بتظهر هنا','Your conversations will appear here'):t('سجّل دخولك لعرض رسائلك','Sign in to see your messages')}</p><span>{t('تواصل مباشرة مع مقدمي الخدمات.','Talk directly with service providers.')}</span><button onClick={()=>user?browse():go('/account')} className="mt-3 text-xs font-bold text-[#47705c]">{user?t('اكتشف الخدمات','Explore services'):t('تسجيل الدخول','Sign in')}<ArrowLeft className="mr-1 inline" size={13}/></button></div>}
          <div className="support-contact-card"><h2 className="text-base font-bold">{t('فريق فرصة','Forsah support')}</h2><p className="text-xs text-[#849088]">{t('أرسل رسالة دعم وتابع الردود من حسابك.','Send a support ticket and follow replies in your account.')}</p><button className="primary-button" onClick={()=>go('/support')}>{t('تذاكر الدعم','Support tickets')}</button><button className="text-xs text-[#47705c]" onClick={()=>setRevision(v=>v+1)}>{t('تحديث المحادثات','Refresh conversations')}</button></div>
        </>}
        {view==='chat'&&user&&<section className="market-panel"><h1>{t('المحادثة','Conversation')}</h1><p>{t('تُحدَّث الرسائل كل 3 ثوانٍ أثناء فتح الصفحة.','Messages refresh every 3 seconds while this page is visible.')}</p><div className="market-messages" role="log" aria-live="polite">{messages.map(m=><article className={Number(m.sender_id)===user.id?'message-own':''} key={m.id}><p>{m.content}</p><small>{m.created_at} UTC</small></article>)}</div><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('chat','send',{method:'POST',body:JSON.stringify({content:message})},{id:String(id)});setMessage('');});}}><textarea aria-label={t('رسالتك','Your message')} required maxLength={3000} value={message} onChange={e=>setMessage(e.target.value)}/><button className="market-primary" disabled={busy}>{t('إرسال','Send')}</button></form></section>}
        {view==='support'&&user&&<section className="market-panel"><h1>{t('تذاكر الدعم','Support tickets')}</h1><button onClick={()=>setRevision(v=>v+1)}>{t('تحديث','Refresh')}</button>{tickets.map(v=><button className="market-thread" key={v.id} onClick={()=>navigate(`/ticket/${v.id}`)}><strong>{v.subject}</strong><span>{status(v.status)}</span></button>)}<h2>{t('تذكرة جديدة','New ticket')}</h2><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{const result=await api<{id:number}>('member-support','create',{method:'POST',body:JSON.stringify({subject,content:message})});setSubject('');navigate(`/ticket/${result.id}`);});}}><label>{t('الموضوع','Subject')}<input required maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)}/></label><label>{t('التفاصيل','Details')}<textarea required maxLength={5000} value={message} onChange={e=>setMessage(e.target.value)}/></label><button className="market-primary" disabled={busy}>{t('إرسال للدعم','Send to support')}</button></form></section>}
        {view==='ticket'&&ticket&&user&&<section className="market-panel"><h1>{ticket.subject}</h1><p>{status(ticket.status)}</p><button onClick={()=>setRevision(v=>v+1)}>{t('تحديث الردود','Refresh replies')}</button><div className="market-messages">{ticket.messages?.map(m=><article key={m.id}><strong>{m.sender_name} · {m.sender_type}</strong><p>{m.content}</p><small>{m.created_at} UTC</small></article>)}</div><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('member-support','reply',{method:'POST',body:JSON.stringify({content:message})},{id:String(id)});setMessage('');setRevision(v=>v+1);});}}><textarea aria-label={t('الرد','Reply')} required maxLength={5000} value={message} onChange={e=>setMessage(e.target.value)}/><button disabled={busy} className="market-primary">{t('إرسال الرد وإعادة فتح التذكرة','Reply and reopen ticket')}</button></form></section>}
        {view==='account'&&<>
          <div className="mb-5 mt-5"><p className="eyebrow">{t('مساحتك في فرصة','Your space in Forsah')}</p><h1 className="mt-1 text-[26px] font-bold">{t('حسابي','My account')}</h1></div>
          <div className="profile-card"><span className="profile-avatar"><UserRound size={27}/></span><div className="flex-1"><h2 className="font-bold">{user?.name||t('مرحباً بك','Welcome')}</h2><p className="mt-1 text-xs text-[#78867d]">{user?.email||t('سجّل دخولك لإدارة حسابك وإعلاناتك','Sign in to manage your account and listings')}</p></div><BadgeCheck className="text-[#a3b29f]" size={20}/></div>
          {!user&&<button className="primary-button mt-4 w-full" onClick={()=>{setRegister(false);setAuthOpen(true);}}>{t('تسجيل الدخول','Sign in')}<ArrowLeft size={16}/></button>}
          <div className="account-menu mt-5 overflow-hidden rounded-2xl border border-[#e9ede7] bg-white">
            {[{icon:Heart,label:t('المفضلة','Favorites'),action:()=>go('/favorites')},{icon:Clock3,label:t('عمليات البحث الأخيرة','Recent searches'),action:()=>setRecentOpen(v=>!v)},{icon:LockKeyhole,label:t('الخصوصية والأمان','Privacy and security'),action:()=>go('/settings')},{icon:Settings,label:t('الإعدادات','Settings'),action:()=>go('/settings')}].map(({icon:Icon,label,action},i)=><button key={label} className={`account-row ${i===3?'last-row':''}`} onClick={action}><Icon size={18}/><span>{label}</span><ChevronLeft className="mr-auto" size={16}/></button>)}
          </div>
          {recentOpen&&<div className="support-contact-card"><h2 className="font-bold">{t('عمليات البحث الأخيرة','Recent searches')}</h2>{history.length?history.map(q=><button key={q} className="filter-chip" onClick={()=>browse('',q)}>{q}</button>):<p className="text-xs">{t('لا توجد عمليات بحث محفوظة على هذا الجهاز.','No searches saved on this device.')}</p>}<button className="text-xs text-[#47705c]" onClick={()=>{setHistory([]);persist('forsah-search-history',[]);}}>{t('مسح السجل','Clear history')}</button></div>}
          {user&&<details className="support-contact-card"><summary className="text-sm font-bold">{t('بيانات الحساب وكلمة المرور','Profile and password')}</summary><p>{user.email}</p><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{setUser(await api<User>('auth','profile',{method:'PATCH',body:JSON.stringify({name,phone})}));setNotice(t('تم حفظ بياناتك','Profile saved'));});}}><label>{t('الاسم','Name')}<input required maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label><label>{t('الهاتف (لا يُعرض علنًا)','Phone (not displayed publicly)')}<input type="tel" maxLength={30} value={phone} onChange={e=>setPhone(e.target.value)}/></label><button disabled={busy}>{t('حفظ بيانات الحساب','Save profile')}</button></form>
          <details><summary>{t('تغيير كلمة المرور','Change password')}</summary><form className="market-form" onSubmit={e=>{e.preventDefault();void run(async()=>{await api('auth','password',{method:'POST',body:JSON.stringify({current_password:currentPassword,password})});if(native)await SessionVault.clear();setSavedBiometric(false);saveToken('');setUser(null);setPassword('');setCurrentPassword('');setNotice(t('تم تغيير كلمة المرور وإبطال جميع الجلسات. سجل الدخول مجددًا.','Password changed. All sessions revoked. Sign in again.'));});}}><input required type="password" aria-label={t('كلمة المرور الحالية','Current password')} autoComplete="current-password" value={currentPassword} onChange={e=>setCurrentPassword(e.target.value)}/><input required type="password" aria-label={t('كلمة المرور الجديدة','New password')} autoComplete="new-password" minLength={12} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)}/><button disabled={busy}>{t('تغيير كلمة المرور','Change password')}</button></form></details>
          <button className="market-danger" disabled={busy} onClick={()=>void run(async()=>{await api('auth','logout',{method:'POST'});if(native)await SessionVault.clear();setSavedBiometric(false);saveToken('');setUser(null);go('/');})}>{t('تسجيل الخروج','Sign out')}</button>{user.role!=='user'&&<button onClick={()=>go('/admin')}>{t('لوحة الإدارة (العربية)','Administration (Arabic)')}</button>}
        </details>}
          <p className="copyright">{t('فرصة','Forsah')} <span>·</span> {t('تم التطوير بواسطة','Developed by')} <strong>Engineer Abdulrazzak Saleh Al-Ja'ili</strong></p>
        </>}
        {view==='settings'&&<OriginalSettings t={t} theme={theme} setTheme={setTheme} style={style} setStyle={setStyle} language={language} setLanguage={setLanguage} preferences={feedPreferences} setPreferences={setFeedPreferences} biometricEnabled={savedBiometric} biometricAvailable={native&&biometric&&!!user} busy={busy}
          toggleBiometric={()=>void run(async()=>{if(savedBiometric){await SessionVault.persist({token});await SessionVault.clear();setSavedBiometric(false);}else{await SessionVault.save({token});await SessionVault.persist({token:''});setSavedBiometric(true);}setNotice(t('تم تحديث حماية الجلسة','Session protection updated'));})}
          clearCache={()=>void run(async()=>{if('caches'in window){const keys=await caches.keys();await Promise.all(keys.filter(k=>k.startsWith('forsah-')).map(k=>caches.delete(k)));}setNotice(t('تم مسح التخزين المؤقت دون حذف الحساب','Cache cleared without deleting account data'));})}
          support={()=>go('/support')}/>}
      </>}
    </main>
    </div>
    <nav className="bottom-nav" aria-label={t('التنقل الرئيسي','Main navigation')}>{[
      {path:'/',icon:Home,label:t('الرئيسية','Home'),active:view==='market'},
      {path:'/messages',icon:MessageCircle,label:t('رسائلي','Messages'),active:['messages','chat','support','ticket'].includes(view)},
      {path:'/mine',icon:Tag,label:t('إعلاناتي','My ads'),active:['mine','new','ad'].includes(view)},
      {path:'/search',icon:Search,label:t('البحث','Search'),active:view==='search'},
      {path:'/account',icon:UserRound,label:t('حسابي','Account'),active:['account','favorites','settings'].includes(view)},
    ].map(({path,icon:Icon,label,active})=><button key={path} className={`nav-item ${active?'nav-item-active':''}`} aria-current={active?'page':undefined} onClick={()=>go(path)}><span className="nav-icon-wrap"><Icon size={20} strokeWidth={active?2.3:1.8}/></span><span>{label}</span></button>)}</nav>
    {(newOpen||view==='new')&&<Overlay label={t('أضف إعلانك','Create a listing')} close={()=>{setNewOpen(false);if(view==='new')go('/');}}><div className="flex items-start justify-between"><div><p className="eyebrow">{t('وصل خدمتك للي يحتاجها','Reach people who need your service')}</p><h2 className="mt-1 text-xl font-bold">{t('أضف إعلانك','Create a listing')}</h2></div><button type="button" className="icon-button" aria-label={t('إغلاق','Close')} onClick={()=>{setNewOpen(false);if(view==='new')go('/');}}><X size={19}/></button></div>
      {user?<AdEditor t={t} busy={busy} initialCategory={draftCategory} submit={body=>void run(async()=>{const result=await api<Ad>('market','create',{method:'POST',body:JSON.stringify(body)});setNewOpen(false);navigate(`/ad/${result.id}`);})}/>:<><p className="text-sm text-[#849088]">{t('سجّل دخولك لنشر الإعلان ومتابعة حالته.','Sign in to publish your listing and track its status.')}</p><button className="primary-button" onClick={()=>{setNewOpen(false);go('/account');}}>{t('تسجيل الدخول','Sign in')}</button></>}
      {error&&<p className="market-error" role="alert">{error}</p>}
    </Overlay>}
    {authOpen&&<Overlay label={t('تسجيل الدخول','Sign in')} close={()=>setAuthOpen(false)}><div className="flex items-center justify-between"><h2 className="text-xl font-bold">{t('حساب فرصة','Forsah account')}</h2><button type="button" className="icon-button" aria-label={t('إغلاق','Close')} onClick={()=>setAuthOpen(false)}><X size={19}/></button></div><div className="market-actions"><button aria-pressed={!register} onClick={()=>setRegister(false)}>{t('دخول','Sign in')}</button><button aria-pressed={register} onClick={()=>setRegister(true)}>{t('إنشاء حساب','Register')}</button></div>
          <form className="market-form" onSubmit={e=>{e.preventDefault();void auth();}}>{register&&<label>{t('الاسم','Name')}<input required autoComplete="name" maxLength={100} value={name} onChange={e=>setName(e.target.value)}/></label>}<label>{t('البريد الإلكتروني','Email')}<input required type="email" autoComplete="email" maxLength={190} value={email} onChange={e=>setEmail(e.target.value)}/></label><label>{t('كلمة المرور (12 حرفًا على الأقل للحساب الجديد)','Password (at least 12 characters for new accounts)')}<input required type="password" autoComplete={register?'new-password':'current-password'} minLength={register?12:1} maxLength={200} value={password} onChange={e=>setPassword(e.target.value)}/></label><button className="market-primary" disabled={busy}>{register?t('إنشاء الحساب','Create account'):t('دخول','Sign in')}</button></form>
          {native&&savedBiometric&&<button disabled={busy} onClick={()=>void run(async()=>{const session=await SessionVault.unlock();saveToken(session.token);})}>{t('فتح الجلسة بالبصمة','Unlock session with biometrics')}</button>}
        {error&&<p className="market-error" role="alert">{error}</p>}</Overlay>}
    {notice&&<div className="toast-message" role="status">{notice}</div>}
  </div>;
}
