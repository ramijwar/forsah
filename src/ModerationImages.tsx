import { useEffect, useState } from 'react';
import { apiRequest, apiUrl } from './api';
export default function ModerationImages({ id, token }: { id: number; token: string }) {
  const [images, setImages] = useState<string[]>([]); const [error,setError]=useState('');
  useEffect(()=>{
    const controller=new AbortController();const urls:string[]=[];
    const headers={Authorization:`Bearer ${token}`};setImages([]);setError('');
    apiRequest<{images:number[]}>('market',{headers,signal:controller.signal},{action:'detail',id:String(id)})
      .then(async ad=>{
        for(const image of ad.images){
          const r=await fetch(apiUrl('image',{id:String(image)}),{headers,signal:controller.signal});
          if(!r.ok)throw new Error('تعذر تحميل الصورة');const blob=await r.blob();
          if(controller.signal.aborted)return;urls.push(URL.createObjectURL(blob));
        }
        if(!controller.signal.aborted)setImages([...urls]);
      }).catch(e=>{if(!controller.signal.aborted)setError(e.message);});
    return()=>{controller.abort();urls.forEach(URL.revokeObjectURL);};
  },[id,token]);
  return <div>{error&&<p role="alert">{error}</p>}{images.map(src=><img key={src} src={src} alt="صورة الإعلان للمراجعة" style={{width:'100%',maxHeight:280,objectFit:'contain',margin:'10px 0'}}/>)}</div>;
}
