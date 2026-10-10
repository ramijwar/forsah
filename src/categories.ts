import { useCallback, useEffect, useState } from 'react';
import { apiRequest } from './api';
import defaults from '../backend/default-categories.json';
export type Category = { id:number; name:string; name_en:string; description:string; icon:string; color:string; tint:string; subcategories:string[]; sort_order:number; is_active:boolean; ad_count?:number };
export const defaultCategories: Category[] = defaults;
export function useCategories() {
  const [categories,setCategories]=useState<Category[]>(()=>{try{return JSON.parse(localStorage.getItem('forsah-categories')||'null')||defaultCategories;}catch{return defaultCategories;}});
  const [categoryError,setError]=useState('');
  const refreshCategories=useCallback(async(signal?:AbortSignal)=>{
    try { const result=await apiRequest<Category[]>('services',{signal});
      if(!Array.isArray(result))throw new Error('تعذر تحميل الأقسام');
      if(signal?.aborted)return;
      const normalized=result.map((item,index)=>({...{id:index+1,name_en:'',description:'',icon:'Gavel',color:'#47705c',tint:'#edf3e6',subcategories:[],sort_order:index,is_active:true},...defaultCategories.find(c=>c.name===item.name),...item}));
      setCategories(normalized);setError('');try{localStorage.setItem('forsah-categories',JSON.stringify(normalized));}catch{/* cache optional */}
    }catch(error){if(!signal?.aborted)setError(error instanceof Error?error.message:'تعذر تحميل الأقسام');}
  },[]);
  useEffect(()=>{const controller=new AbortController();const refresh=()=>{void refreshCategories(controller.signal);};refresh();
    const interval=setInterval(refresh,30000);window.addEventListener('focus',refresh);window.addEventListener('forsah-categories-changed',refresh);
    return()=>{controller.abort();clearInterval(interval);window.removeEventListener('focus',refresh);window.removeEventListener('forsah-categories-changed',refresh);};
  },[refreshCategories]);
  return {categories,categoryError,refreshCategories};
}
