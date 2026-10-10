import { useEffect, useRef, type ReactNode } from 'react';

// Stable component: fields do not remount as the parent form state changes.
export default function Overlay({label,close,children,panelClassName=""}:{label:string;close:()=>void;children:ReactNode;panelClassName?:string}) {
  const panel=useRef<HTMLDivElement>(null);const closeRef=useRef(close);closeRef.current=close;
  useEffect(()=>{
    const previous=document.activeElement as HTMLElement|null;
    const overflow=document.body.style.overflow;document.body.style.overflow='hidden';
    const el=panel.current;
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
    return()=>{document.body.style.overflow=overflow;document.removeEventListener('keydown',key);if(previous?.isConnected)previous.focus({preventScroll:true});};
  },[]);
  return <div className="modal-backdrop" onPointerDown={e=>{if(e.target===e.currentTarget)close();}}><div className={`ad-modal ${panelClassName}`} ref={panel} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>;
}
