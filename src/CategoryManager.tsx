import { useCallback, useEffect, useState } from 'react';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { apiRequest } from './api';
import type { Category } from './categories';
import Overlay from './Overlay';
const blank:Category={id:0,name:'',name_en:'',description:'',icon:'Gavel',color:'#47705c',tint:'#edf3e6',subcategories:[],sort_order:0,is_active:true};
export default function CategoryManager({token,canManage}:{token:string;canManage:boolean}) {
  const [items,setItems]=useState<Category[]>([]);const [editor,setEditor]=useState<Category|null>(null);const [subtext,setSubtext]=useState('');
  const [removing,setRemoving]=useState<Category|null>(null);const [replacement,setReplacement]=useState('');
  const [busy,setBusy]=useState(false);const [error,setError]=useState('');const [loading,setLoading]=useState(true);
  const load=useCallback(async()=>{setLoading(true);try{const result=await apiRequest<{items:Category[]}>('admin',{headers:{Authorization:`Bearer ${token}`}},{action:'categories'});setItems(result.items);setError('');}catch(e){setError(e instanceof Error?e.message:'تعذر التحميل');}finally{setLoading(false);}},[token]);
  useEffect(()=>{void load();},[load]);
  const save=async(method:'POST'|'PATCH'|'DELETE',body:unknown,id?:number)=>{
    if(busy)return;setBusy(true);setError('');
    try{await apiRequest('admin',{method,headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify(body)},{action:'category',...(id?{id:String(id)}:{})});setEditor(null);setRemoving(null);window.dispatchEvent(new Event('forsah-categories-changed'));await load();}
    catch(e){setError(e instanceof Error?e.message:'تعذر حفظ القسم');}finally{setBusy(false);}
  };
  return <section className="admin-content">
    <div className="admin-section-intro"><div><h2>إدارة الأقسام</h2><p>تنعكس التغييرات على الرئيسية والبحث ونماذج الإعلانات. تغيير الاسم ينقل تصنيفات الإعلانات معه.</p></div>{canManage&&<button className="admin-primary" onClick={()=>{setError('');setEditor({...blank,sort_order:items.length});setSubtext('');}}><Plus size={17}/>إضافة قسم</button>}</div>
    {error&&!editor&&!removing&&<p className="admin-alert" role="alert">{error}<button onClick={()=>void load()}>إعادة المحاولة</button></p>}
    {loading?<p role="status">جار تحميل الأقسام…</p>:<div className="admin-category-grid">{items.map(item=><article className="admin-panel" key={item.id}><h3>{item.name}</h3><p>{item.name_en}</p><p>{item.description}</p><small>{item.is_active?'ظاهر في التطبيق':'مخفي من اختيار الأقسام'} · الترتيب: {item.sort_order} · الإعلانات: {item.ad_count||0}</small><div className="admin-create-actions">{canManage&&<><button className="admin-secondary" onClick={()=>{setError('');setEditor(item);setSubtext(item.subcategories.join('\n'));}}><Pencil size={16}/>تعديل {item.name}</button><button className="admin-secondary" onClick={()=>{setError('');setRemoving(item);setReplacement('');}}><Trash2 size={16}/>حذف {item.name}</button></>}</div></article>)}</div>}
    {!loading&&!items.length&&<p>لا توجد أقسام. أضف أول قسم لإتاحته في التطبيق.</p>}
    {editor&&<Overlay label={editor.id?'تعديل القسم':'إضافة قسم'} panelClassName="admin-editor-panel" close={()=>{if(!busy)setEditor(null);}}><form className="admin-modal" onSubmit={e=>{e.preventDefault();void save(editor.id?'PATCH':'POST',{...editor,subcategories:subtext.split('\n').map(s=>s.trim()).filter(Boolean)},editor.id);}}>
      <h2>{editor.id?'تعديل القسم':'إضافة قسم'}</h2>
      <label>اسم القسم<input required maxLength={80} value={editor.name} onChange={e=>setEditor({...editor,name:e.target.value})}/></label>
      <label>الاسم بالإنجليزية<input maxLength={80} value={editor.name_en} onChange={e=>setEditor({...editor,name_en:e.target.value})}/></label>
      <label>وصف القسم<textarea aria-label="وصف القسم" maxLength={250} value={editor.description} onChange={e=>setEditor({...editor,description:e.target.value})}/></label>
      <label>الأيقونة<select value={editor.icon} onChange={e=>setEditor({...editor,icon:e.target.value})}>{[['Gavel','سوق'],['UsersRound','أشخاص'],['Truck','نقل'],['Zap','طوارئ'],['Armchair','أثاث'],['PackageCheck','شحن'],['Wrench','صيانة']].map(([value,label])=><option key={value} value={value}>{label}</option>)}</select></label>
      <label>لون الأيقونة<input type="color" value={editor.color} onChange={e=>setEditor({...editor,color:e.target.value})}/></label>
      <label>لون خلفية الأيقونة<input type="color" value={editor.tint} onChange={e=>setEditor({...editor,tint:e.target.value})}/></label>
      <label>ترتيب العرض<input type="number" min={0} max={9999} required value={editor.sort_order} onChange={e=>setEditor({...editor,sort_order:Number(e.target.value)})}/></label>
      <label>الخيارات الفرعية (كل خيار بسطر، حتى 12)<textarea aria-label="الخيارات الفرعية" rows={4} value={subtext} onChange={e=>setSubtext(e.target.value)}/></label>
      <label><input type="checkbox" checked={editor.is_active} onChange={e=>setEditor({...editor,is_active:e.target.checked})}/>ظاهر في التطبيق</label>
      {error&&<p role="alert" className="admin-alert">{error}</p>}
      <div className="admin-modal-actions"><button className="admin-primary" disabled={busy}>حفظ القسم</button><button type="button" className="admin-secondary" disabled={busy} onClick={()=>setEditor(null)}>إلغاء</button></div>
    </form></Overlay>}
    {removing&&<Overlay label="حذف القسم" close={()=>{if(!busy)setRemoving(null);}}><h2>حذف {removing.name}؟</h2><p>لن تُحذف الإعلانات. إذا كان القسم مستخدمًا، يجب نقلها إلى قسم نشط آخر.</p><label>نقل الإعلانات إلى<select value={replacement} onChange={e=>setReplacement(e.target.value)}><option value="">اختر القسم البديل</option>{items.filter(c=>c.id!==removing.id&&c.is_active).map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label>{error&&<p role="alert" className="admin-alert">{error}</p>}<div className="admin-modal-actions"><button className="admin-primary" disabled={busy||!!removing.ad_count&&!replacement} onClick={()=>void save('DELETE',{replacement_id:replacement?Number(replacement):null},removing.id)}>تأكيد الحذف</button><button className="admin-secondary" disabled={busy} onClick={()=>setRemoving(null)}>إلغاء</button></div></Overlay>}
  </section>;
}
