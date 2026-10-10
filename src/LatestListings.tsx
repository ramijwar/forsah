import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, ImageOff, Sparkles } from 'lucide-react';
import { apiRequest, apiUrl } from './api';
import type { Translate } from './OriginalViews';
type Listing = { id:number; title:string; category:string; images:number[] };
function Thumbnail({listing}:{listing:Listing}) {
  const [failed,setFailed]=useState(false);
  const image=listing.images[0];
  useEffect(()=>setFailed(false),[image]);
  return image&&!failed?<img src={apiUrl('image',{id:String(image),size:'thumb'})} alt={listing.title} loading="lazy" decoding="async" onError={()=>setFailed(true)}/>:<span className="latest-image-empty"><ImageOff size={28}/></span>;
}
export default function LatestListings({t,open,browse}:{t:Translate;open:(id:number)=>void;browse:()=>void}) {
  const [items,setItems]=useState<Listing[]>([]);const [loading,setLoading]=useState(true);const [error,setError]=useState('');const [retry,setRetry]=useState(0);const [index,setIndex]=useState(0);const [atStart,setAtStart]=useState(true);const [atEnd,setAtEnd]=useState(true);
  const track=useRef<HTMLDivElement>(null);
  useEffect(()=>{
    const controller=new AbortController();let fetching=false;
    const refresh=async()=>{if(fetching)return;fetching=true;try{
      const data=await apiRequest<{items:Listing[]}>('market',{signal:controller.signal},{action:'latest'});
      if(!Array.isArray(data.items))throw new Error('Invalid listings');
      if(!controller.signal.aborted){setItems(data.items.slice(0,10));setError('');}
    }catch(e){if(!controller.signal.aborted)setError(e instanceof Error?e.message:'Unavailable');}finally{fetching=false;if(!controller.signal.aborted)setLoading(false);}};
    void refresh();const interval=setInterval(()=>void refresh(),30000);window.addEventListener('focus',refresh);
    return()=>{controller.abort();clearInterval(interval);window.removeEventListener('focus',refresh);};
  },[retry]);
  const updateIndex=()=>{const el=track.current;if(!el)return;const rtl=getComputedStyle(el).direction==='rtl';const box=el.getBoundingClientRect();let closest=Infinity,at=0;
    Array.from(el.children).forEach((child,i)=>{const rect=child.getBoundingClientRect();const distance=Math.abs(rtl?rect.right-box.right:rect.left-box.left);if(distance<closest){closest=distance;at=i;}});const max=el.scrollWidth-el.clientWidth,offset=Math.abs(el.scrollLeft);setAtStart(offset<2);setAtEnd(offset>=max-2);setIndex(max<=1?0:offset>=max-2?items.length-1:at);
  };
  useEffect(()=>{updateIndex();const el=track.current;if(!el)return;const observer=typeof ResizeObserver!=='undefined'?new ResizeObserver(updateIndex):null;observer?.observe(el);return()=>observer?.disconnect();},[items]);
  const move=(step:number)=>{const el=track.current;if(!el)return;const next=Math.max(0,Math.min(items.length-1,index+step));const card=el.children[next];if(!card)return;
    const rtl=getComputedStyle(el).direction==='rtl',box=el.getBoundingClientRect(),rect=card.getBoundingClientRect();
    el.scrollBy({left:rtl?rect.right-box.right:rect.left-box.left,behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'auto':'smooth'});
  };
  return <section className="latest-section" aria-label={t('أحدث الإعلانات','Latest listings')}>
    <div className="latest-heading"><div><p className="eyebrow"><Sparkles size={12}/>{t('جديد فرصة','New on Forsah')}</p><h2>{t('أحدث الإعلانات','Latest listings')}</h2><p className="latest-subtitle">{t('آخر 10 إعلانات منشورة، اكتشف فرصتك القادمة.','The 10 newest published listings. Find your next opportunity.')}</p></div><button className="latest-all" onClick={browse}>{t('عرض الكل','View all')}<ArrowLeft size={15}/></button></div>
    {loading&&<div className="latest-feedback" role="status">{t('جار تحميل الإعلانات…','Loading listings…')}</div>}
    {error&&<div className="latest-feedback" role="alert">{t('تعذر تحديث أحدث الإعلانات.','Could not refresh the latest listings.')}<button onClick={()=>setRetry(value=>value+1)}>{t('إعادة المحاولة','Retry')}</button></div>}
    {!loading&&!error&&!items.length&&<div className="latest-feedback">{t('لا توجد إعلانات منشورة بعد.','No published listings yet.')}</div>}
    {!!items.length&&<><div className="latest-track" ref={track} onScroll={updateIndex} tabIndex={0} aria-label={t('تصفح أحدث الإعلانات','Browse the latest listings')} onKeyDown={e=>{if(e.target!==e.currentTarget)return;const rtl=getComputedStyle(e.currentTarget).direction==='rtl';if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();move((e.key==='ArrowLeft')===rtl?1:-1);}}}>
      {items.map((listing,i)=><button className="latest-card" key={listing.id} onClick={()=>open(listing.id)}><span className="latest-photo"><Thumbnail listing={listing}/><span className="latest-rank">{String(i+1).padStart(2,'0')}</span></span><span className="latest-card-copy"><small>{listing.category}</small><strong>{listing.title}</strong><span>{t('عرض الإعلان','View listing')}<ArrowLeft size={14}/></span></span></button>)}
    </div><div className="latest-controls"><span>{Math.min(index+1,items.length)} / {items.length}</span><div><button type="button" aria-label={t('الإعلان السابق','Previous listing')} disabled={atStart} onClick={()=>move(-1)}><ArrowRight size={17}/></button><button type="button" aria-label={t('الإعلان التالي','Next listing')} disabled={atEnd} onClick={()=>move(1)}><ArrowLeft size={17}/></button></div></div></>}
  </section>;
}
