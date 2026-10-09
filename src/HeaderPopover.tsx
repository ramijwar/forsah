import { useEffect, useState } from 'react';
import { ChevronLeft, MessageCircle, Sparkles, Tag, CircleHelp } from 'lucide-react';
import type { Translate, FeedPreferences } from './OriginalViews';
type API = <T>(resource:string,action?:string,options?:RequestInit,params?:Record<string,string>)=>Promise<T>;
type Entry={key:string;title:string;detail:string;path:string;kind:keyof FeedPreferences;signature:string};
export default function HeaderPopover({kind,userId,api,t,preferences,close,go}: {kind:'notices'|'messages';userId?:number;api:API;t:Translate;preferences:FeedPreferences;close:()=>void;go:(path:string)=>void}) {
  const [entries,setEntries]=useState<Entry[]>([]);const [loading,setLoading]=useState(false);const [error,setError]=useState('');const [retry,setRetry]=useState(0);
  const [seen,setSeen]=useState<Record<string,string>>({});
  useEffect(()=>{
    const c=new AbortController();setEntries([]);setError('');setSeen({});setLoading(false);
    if(!userId)return;
    try{setSeen(JSON.parse(localStorage.getItem(`forsah-feed-read-${userId}`)||'{}'));}catch{/* corrupted local read state */}
    setLoading(true);
    const chats=api<Array<{id:number;partner:string;last_message:string|null;title:string|null}>>('chat','list',{signal:c.signal})
      .then(data=>data.map(x=>({key:`chat-${x.id}`,title:x.partner,detail:x.last_message||x.title||'',path:`/chat/${x.id}`,kind:'chat' as const,signature:x.last_message||''})));
    const data=kind==='messages'?chats:Promise.all([
      chats,
      api<{items:Array<{id:number;title:string;status:string}>}>('market','mine',{signal:c.signal}).then(page=>page.items.map(x=>({key:`ad-${x.id}`,title:x.title,detail:x.status,path:`/ad/${x.id}`,kind:'ads' as const,signature:x.status}))),
      api<Array<{id:number;subject:string;status:string;updated_at:string}>>('member-support','list',{signal:c.signal}).then(rows=>rows.map(x=>({key:`support-${x.id}`,title:x.subject,detail:x.status,path:`/ticket/${x.id}`,kind:'support' as const,signature:`${x.status}:${x.updated_at}`}))),
    ]).then(groups=>groups.flat());
    data.then(rows=>{if(!c.signal.aborted)setEntries(rows);}).catch(e=>{if(!c.signal.aborted)setError(e instanceof Error?e.message:'Connection failed');}).finally(()=>{if(!c.signal.aborted)setLoading(false);});
    return()=>c.abort();
  },[kind,userId,api,retry]);
  const visible=entries.filter(e=>kind==='messages'||preferences[e.kind]).slice(0,8);
  const markSeen=(items:Entry[])=>{
    const next={...seen};items.forEach(item=>{next[item.key]=item.signature;});
    const bounded=Object.fromEntries(Object.entries(next).slice(-100));setSeen(bounded);
    try{localStorage.setItem(`forsah-feed-read-${userId}`,JSON.stringify(bounded));}catch{/* local preferences only */}
  };
  const status=(value:string)=>({pending:t('قيد المراجعة','Pending review'),active:t('منشور','Published'),rejected:t('مرفوض','Rejected'),blocked:t('محظور','Blocked'),open:t('مفتوحة','Open'),in_progress:t('قيد المتابعة','In progress'),resolved:t('مغلقة','Resolved')}[value]||value);
  return <div id="header-popover" className="popover-card header-popover soft-shadow" role="dialog" aria-label={kind==='notices'?t('الإشعارات','Notifications'):t('رسائلك','Your messages')} aria-modal="false">
    <div className="flex items-center justify-between"><strong>{kind==='notices'?t('الإشعارات','Notifications'):t('رسائلك','Your messages')}</strong><button className="text-xs font-semibold text-[#59806a]" onClick={close}>{t('إغلاق','Close')}</button></div>
    {!userId?<div className="mt-4 flex gap-3"><span className="mini-icon bg-[#eef5e7] text-[#5d8050]"><Sparkles size={16}/></span><div><p className="text-sm font-semibold">{t('أهلاً بك في فرصة!','Welcome to Forsah!')}</p><p className="mt-1 text-xs text-[#89928d]">{t('سجّل دخولك لعرض تحديثات حسابك ورسائلك.','Sign in to see your account updates and messages.')}</p><button className="mt-3 text-xs font-bold text-[#47705c]" onClick={()=>go('/account')}>{t('تسجيل الدخول','Sign in')}</button></div></div>:<>
      {loading&&<p className="mt-4 text-xs" role="status">{t('جار تحميل التحديثات…','Loading updates…')}</p>}
      {error&&<div role="alert" className="mt-4 text-xs"><p>{error}</p><button className="mt-2 text-[#47705c]" onClick={()=>setRetry(v=>v+1)}>{t('إعادة المحاولة','Retry')}</button></div>}
      {!loading&&!error&&!visible.length&&<p className="py-6 text-center text-xs text-[#89928d]">{kind==='notices'?t('لا توجد تحديثات لعرضها ضمن الفئات المفعّلة.','No updates in your enabled categories.'):t('لا توجد محادثات بعد.','No conversations yet.')}</p>}
      <div className="popover-items">{visible.map(item=>{const Icon=item.kind==='chat'?MessageCircle:item.kind==='ads'?Tag:CircleHelp;return <button key={item.key} className="popover-item" onClick={()=>{markSeen([item]);go(item.path);}}><span className="mini-icon bg-[#eef5e7] text-[#5d8050]"><Icon size={16}/></span><span className="min-w-0 flex-1 text-start"><strong className="block text-xs">{item.title}</strong><span className="mt-1 block text-[11px] text-[#89928d]">{item.kind==='chat'?item.detail:status(item.detail)}</span></span>{kind==='notices'&&seen[item.key]!==item.signature&&<span className="feed-unseen" aria-label={t('لم تراجع هذا التحديث على هذا الجهاز','Not yet reviewed on this device')}/>}</button>;})}</div>
      {kind==='notices'&&visible.length>0&&<button className="mt-3 text-xs text-[#59806a]" onClick={()=>markSeen(visible)}>{t('تحديد المعروض كمقروء على هذا الجهاز','Mark displayed updates as read on this device')}</button>}
    </>}
    <button onClick={()=>go(kind==='messages'?'/messages':'/settings')} className="mt-4 flex w-full items-center justify-between border-t border-[#eef0eb] pt-3 text-xs font-semibold text-[#52705f]">{kind==='messages'?t('عرض كل المحادثات','View all conversations'):t('إدارة التفضيلات','Manage preferences')}<ChevronLeft size={15}/></button>
  </div>;
}
