import { useEffect, useRef, useState } from 'react';
import type { Category } from './categories';
import { apiRequest } from './api';
import { compressAdImage } from './imageCompression';
import type { Translate } from './OriginalViews';
export type AdDraft = {title:string;description:string;category:string};
function PhotoPreview({file}:{file:File}) {
  const [url,setUrl]=useState('');
  useEffect(()=>{const next=URL.createObjectURL(file);setUrl(next);return()=>URL.revokeObjectURL(next);},[file]);
  return <img src={url} alt={file.name} />;
}
export default function AdEditor({ad,initialCategory,categories,t,token,onSave,onComplete,busy=false,onBusyChange}: {
  ad?:AdDraft & {id:number;images:number[]}; initialCategory?:string; categories:Category[]; t:Translate;token:string;busy?:boolean;
  onSave:(body:AdDraft,id?:number)=>Promise<{id:number}>;onComplete:(id:number)=>void;onBusyChange?:(busy:boolean)=>void;
}) {
  const [title,setTitle]=useState(ad?.title||'');const [description,setDescription]=useState(ad?.description||'');
  const [category,setCategory]=useState(ad?.category||initialCategory||categories[0]?.name||'');
  const [files,setFiles]=useState<File[]>([]);const [working,setWorking]=useState(false);const [error,setError]=useState('');
  const [uploaded,setUploaded]=useState(0);const [progress,setProgress]=useState('');
  const savedId=useRef(ad?.id);const running=useRef(false);const existing=ad?.images.length||0;
  const locked=busy||working;
  useEffect(()=>{if(!category&&categories.length)setCategory(categories[0].name);},[category,categories]);
  const submit=async()=>{
    if(running.current)return;running.current=true;setWorking(true);onBusyChange?.(true);setError('');
    try{
      // Decode and compress before creating a record; malformed images cannot leave an empty listing.
      setProgress(t('جار تجهيز الإعلان والصور…','Preparing listing and photos…'));
      const compressed:File[]=[];for(const file of files)compressed.push(await compressAdImage(file));
      const result=await onSave({title,description,category},savedId.current);savedId.current=result.id;
      for(let i=0;i<compressed.length;i++){
        setProgress(t(`رفع الصورة ${i+1} من ${compressed.length}`,`Uploading photo ${i+1} of ${compressed.length}`));
        const data=new FormData();data.append('image',compressed[i]);
        await apiRequest('market',{method:'POST',headers:{Authorization:`Bearer ${token}`},body:data},{action:'image',id:String(result.id)});
        setUploaded(value=>value+1);setFiles(previous=>previous.filter(file=>file!==files[i]));
      }
      setProgress('');onComplete(result.id);setUploaded(0);
    }catch(e){setError((savedId.current?t(`الإعلان رقم ${savedId.current} محفوظ. أعد المحاولة لإكمال الصور دون إنشاء إعلان آخر. `,`Listing ${savedId.current} is saved. Retry to finish without creating a duplicate. `):'')+(e instanceof Error?e.message:t('تعذر الحفظ','Save failed')));setProgress('');}
    finally{running.current=false;setWorking(false);onBusyChange?.(false);}
  };
  return <form className="market-form shared-ad-form" onSubmit={e=>{e.preventDefault();void submit();}}>
    {!categories.length&&<p>{t('لا توجد أقسام متاحة حاليًا. على المدير إضافة قسم نشط أولًا.','No categories available. An administrator must add an active category first.')}</p>}
    <label>{t('العنوان','Title')}<input required maxLength={120} value={title} disabled={locked} onChange={e=>setTitle(e.target.value)}/></label>
    <label>{t('التصنيف','Category')}<select aria-label={t('التصنيف','Category')} required value={category} disabled={locked} onChange={e=>setCategory(e.target.value)}><option value="">{t('اختر قسمًا','Choose a category')}</option>{!categories.some(c=>c.name===category)&&category&&<option value={category}>{category}</option>}{categories.map(c=><option key={c.id} value={c.name}>{t(c.name,c.name_en||c.name)}</option>)}</select></label>
    <label>{t('الوصف وتفاصيل الخدمة والسعر','Description, service details and price')}<textarea aria-label={t('الوصف وتفاصيل الخدمة والسعر','Description, service details and price')} required rows={5} maxLength={3000} value={description} disabled={locked} onChange={e=>setDescription(e.target.value)}/></label>
    <label>{t('صور الإعلان (حتى 4 صور)','Listing photos (up to 4)')}<input type="file" multiple accept="image/jpeg,image/png,image/webp" disabled={locked||existing+uploaded+files.length>=4} onChange={e=>{const picked=Array.from(e.target.files||[]);e.target.value='';if(picked.length+files.length+existing+uploaded>4){setError(t('الحد الأقصى 4 صور','Maximum 4 photos'));return;}setError('');setFiles(previous=>[...previous,...picked]);}}/></label>
    <p>{t('تُضغط الصور تلقائيًا قبل الرفع. تخضع الإعلانات والصور للمراجعة قبل النشر.','Photos are compressed before upload. Listings and photos are reviewed before publication.')}</p>
    {!!(existing+uploaded)&&<p>{t(`صور محفوظة: ${existing+uploaded} / 4`,`Saved photos: ${existing+uploaded} / 4`)}</p>}
    <div className="draft-photo-grid">{files.map((file,i)=><div key={`${file.name}-${file.lastModified}-${i}`}><PhotoPreview file={file}/><button type="button" disabled={locked} onClick={()=>setFiles(previous=>previous.filter((_,index)=>index!==i))}>{t('إزالة','Remove')}</button></div>)}</div>
    {error&&<p className="market-error" role="alert">{error}</p>}{progress&&<p role="status">{progress}</p>}
    <button className="market-primary" disabled={locked||(!categories.length&&!ad)}>{t('حفظ للمراجعة','Save for review')}</button>
  </form>;
}
