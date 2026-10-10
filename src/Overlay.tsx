import { X } from 'lucide-react';
import { useEffect, useRef, type ReactNode } from 'react';

// Stable component: fields do not remount as the parent form state changes.
export default function Overlay({label,close,children,panelClassName="",chrome,busy=false}:{label:string;close:()=>void;children:ReactNode;panelClassName?:string;chrome?:{icon:ReactNode;subtitle:string};busy?:boolean}) {
  const panel=useRef<HTMLDivElement>(null);const closeRef=useRef(close);closeRef.current=()=>{if(!busy)close();};
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const el=panel.current;
    const viewport=window.visualViewport;
    const resize=()=>{if(el&&viewport)el.style.maxHeight=`${Math.max(80,viewport.height-48)}px`;};
    resize();viewport?.addEventListener('resize',resize);
    (el?.querySelector<HTMLElement>('input,select,textarea,button,[tabindex="0"]')||el)?.focus({preventScroll:true});
    const key=(event:KeyboardEvent)=>{
      if(event.key==='Escape'){event.preventDefault();closeRef.current();}
      if(event.key==='Tab'&&el){
        const focusable=Array.from(el.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex="0"]'));
        const first=focusable[0],last=focusable[focusable.length-1];
        if(!first){event.preventDefault();return;}
        if(event.shiftKey&&(document.activeElement===first||document.activeElement===el)){event.preventDefault();last.focus();}
        else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first.focus();}
      }
    };
    document.addEventListener('keydown',key);
    return()=>{viewport?.removeEventListener('resize',resize);document.body.style.overflow=overflow;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)closeRef.current();}}><div className={`ad-modal ${panelClassName} ${chrome?'admin-dialog':''}`} ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{chrome?<><header className="admin-dialog-header"><button type="button" className="admin-dialog-close" aria-label="إغلاق" disabled={busy} onClick={()=>closeRef.current()}><X size={20}/></button><div className="admin-dialog-title"><span className="admin-dialog-icon">{chrome.icon}</span><div><span className="admin-dialog-eyebrow">مساحة إدارة فرصة</span><h2>{label}</h2></div></div><p>{chrome.subtitle}</p></header><div className="admin-dialog-content">{children}</div></>:children}</div></div>;
}
