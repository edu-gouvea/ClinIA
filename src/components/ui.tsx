'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState, useSyncExternalStore, type ButtonHTMLAttributes, type CSSProperties, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Check, Inbox, LoaderCircle, Search, X } from 'lucide-react';
import { activateModal } from '@/lib/modal-focus';
import type { StatusTone } from '@/lib/status-presentation';
import { breakpointQuery } from '@/lib/breakpoints';

export function Button({variant='primary',size='default',className='',children,...props}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'primary'|'secondary'|'ghost'|'danger';size?:'default'|'icon'}) {
  return <button className={`btn btn-${variant} ${size === 'icon' ? 'btn-icon' : ''} ${className}`} {...props}>{children}</button>;
}
export function SearchInput({className='',...props}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {'aria-label':string}) {
  return <div className={`search-field ${className}`}><Search size={16} aria-hidden="true"/><input type="search" {...props}/></div>;
}
/** Legacy colour names map onto the semantic tones from `lib/status-presentation`. */
const badgeTones: Record<BadgeTone, StatusTone> = { green: 'success', amber: 'warning', red: 'danger', gray: 'neutral', blue: 'info', success: 'success', warning: 'warning', danger: 'danger', neutral: 'neutral', info: 'info', ai: 'ai' };
export type BadgeTone = StatusTone | 'green' | 'amber' | 'red' | 'gray' | 'blue';
export function Badge({children,tone='neutral'}:{children:ReactNode;tone?:BadgeTone}) { const semantic = badgeTones[tone]; return <span className={`badge badge-${semantic}`} data-tone={semantic}>{children}</span>; }
export function Spinner() { return <LoaderCircle className="spinner" size={20} aria-label="Carregando" role="status"/>; }
export function Avatar({name,color,size='md',className='',style}:{name:string;color?:string;size?:'sm'|'md'|'lg';className?:string;style?:CSSProperties}) { return <span aria-hidden="true" className={`avatar avatar-${size} ${className}`} style={style ?? (color?{backgroundColor:`${color}20`,color:'var(--ink)'}:undefined)}>{name.replace(/^(Dr\.?|Dra\.?)\s+/,'').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span>; }
export function EmptyState({title,description,children}:{title:string;description?:string;children?:ReactNode}) { return <div className="empty-state"><Inbox size={30}/><h3>{title}</h3>{description&&<p>{description}</p>}{children}</div>; }
/** `trail` renders the Foundation breadcrumb ("Gestão / Agenda") above the h1. */
export function PageHeading({eyebrow,title,description,actions,trail}:{eyebrow?:string;title:string;description?:string;actions?:ReactNode;trail?:string[]}) { return <header className="page-heading"><div>{trail&&<nav aria-label="Trilha de navegação" className="page-trail"><ol>{trail.map((item,index)=><li key={item} aria-current={index===trail.length-1?'page':undefined}>{item}</li>)}</ol></nav>}{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="muted">{description}</p>}</div>{actions&&<div className="heading-actions">{actions}</div>}</header>; }
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
const subscribeNothing=()=>()=>{};
/** `icon` adds a leading tile to the heading; `className` scopes per-dialog layout.
 * `header` replaces the visible heading (the close button stays); the dialog then keeps
 * `title` as its accessible name through `aria-label`. */
export function Modal({title,onClose,children,wide=false,icon,className='',header}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean;icon?:ReactNode;className?:string;header?:ReactNode}) {
 const ref=useRef<HTMLDivElement>(null); const onCloseRef=useRef(onClose); const id=useId();
 // A dialog opened by the URL (`?appointment=`, `?new=1`) also renders on the server,
 // where `document` does not exist: portal only once mounted, then trap focus.
 const mounted=useSyncExternalStore(subscribeNothing,()=>true,()=>false);
 useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
 useEffect(()=>{
   if(mounted&&ref.current)return activateModal(ref.current,()=>onCloseRef.current());
 },[mounted]);
 if(!mounted)return null;
 return createPortal(<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} data-density="comfortable" className={`modal ${wide?'modal-wide':''} ${className}`} role="dialog" aria-modal="true" aria-labelledby={header?undefined:id} aria-label={header?title:undefined} tabIndex={-1}><div className={`modal-heading${header?' has-custom-header':''}`}>{header?<div className="modal-custom-header">{header}</div>:icon?<div className="modal-title-group"><span className="modal-icon" aria-hidden="true">{icon}</span><h2 id={id}>{title}</h2></div>:<h2 id={id}>{title}</h2>}<Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X size={20}/></Button></div>{children}</div></div>,document.body);
}
/** Side panel with the same focus contract as `Modal`: trapped focus, Escape
 * closes, inert background and focus restoration (see `lib/modal-focus`).
 * `side="right"` slides from the right; `side="full"` covers the viewport. */
export function Drawer({id,label,onClose,children,side='left',className=''}:{id?:string;label:string;onClose:()=>void;children:ReactNode;side?:'left'|'right'|'full';className?:string}) {
 const ref=useRef<HTMLDivElement>(null); const onCloseRef=useRef(onClose);
 useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
 useEffect(()=>{ if(ref.current)return activateModal(ref.current,()=>onCloseRef.current()); },[]);
 return createPortal(<div className="drawer-overlay" data-side={side} onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} id={id} className={`drawer ${className}`} data-side={side} role="dialog" aria-modal="true" aria-label={label} tabIndex={-1}>{children}</div></div>,document.body);
}

export type MenuItem = { label: string; icon?: ReactNode; onSelect: () => void; disabled?: boolean; checked?: boolean; danger?: boolean } | { separator: true; label?: string };
/** Menu button: `aria-haspopup="menu"`, ↑/↓/Home/End move between items, Escape and
 * outside clicks close, and focus returns to the trigger. Icon-only by default; `text`
 * adds a visible label (with `triggerClassName` for its button style). Items with
 * `checked` render as `menuitemradio` with `aria-checked`. */
export function Menu({label,icon,items,className='',text,triggerClassName='btn btn-ghost btn-icon',footer}:{label:string;icon:ReactNode;items:MenuItem[];className?:string;text?:ReactNode;triggerClassName?:string;footer?:ReactNode}) {
 const [open,setOpen]=useState(false); const trigger=useRef<HTMLButtonElement>(null); const list=useRef<HTMLDivElement>(null); const id=useId();
 const enabled=()=>Array.from(list.current?.querySelectorAll<HTMLButtonElement>('[role="menuitem"]:not([disabled]),[role="menuitemradio"]:not([disabled])')??[]);
 function close(restore=true){setOpen(false);if(restore)trigger.current?.focus();}
 useEffect(()=>{
   if(!open)return;
   (enabled().find(item=>item.getAttribute('aria-checked')==='true')??enabled()[0])?.focus();
   const outside=(event:MouseEvent)=>{if(!list.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))setOpen(false);};
   document.addEventListener('mousedown',outside);
   return()=>document.removeEventListener('mousedown',outside);
 },[open]);
 function onKeyDown(event:React.KeyboardEvent){
   const items=enabled(); const index=items.indexOf(document.activeElement as HTMLButtonElement);
   const move=(next:number)=>{event.preventDefault();items[(next+items.length)%items.length]?.focus();};
   if(event.key==='ArrowDown')move(index+1); else if(event.key==='ArrowUp')move(index-1);
   else if(event.key==='Home')move(0); else if(event.key==='End')move(items.length-1);
   else if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}
   else if(event.key==='Tab')setOpen(false);
 }
 return <div className={`menu ${className}`}>
   <button ref={trigger} type="button" className={triggerClassName} aria-label={label} title={text?undefined:label} aria-haspopup="menu" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>setOpen(!open)} onKeyDown={event=>{if(event.key==='ArrowDown'&&!open){event.preventDefault();setOpen(true);}}}>{icon}{text}</button>
   {open&&<div ref={list} id={id} role="menu" aria-label={label} className="menu-list" onKeyDown={onKeyDown}>{items.map((item,index)=>'separator' in item
     ?<div key={`separator-${index}`} role="presentation"><div role="separator" className="menu-separator"/>{item.label&&<div className="menu-group-label" role="presentation">{item.label}</div>}</div>
     :<button key={item.label} type="button" role={item.checked===undefined?'menuitem':'menuitemradio'} aria-checked={item.checked} tabIndex={-1} disabled={item.disabled} className={`menu-item${item.danger?' is-danger':''}`} onClick={()=>{close();item.onSelect();}}>{item.icon}<span>{item.label}</span>{item.checked&&<Check size={14} aria-hidden="true" className="menu-item-check"/>}</button>)}{footer&&<div className="menu-footer" role="presentation">{footer}</div>}</div>}
 </div>;
}

/** Live `matchMedia` result; server and hydration render as `fallback`. */
export function useMediaQuery(query: string, fallback = false): boolean {
  return useSyncExternalStore(
    useCallback((notify: () => void) => { const list = window.matchMedia(query); list.addEventListener('change', notify); return () => list.removeEventListener('change', notify); }, [query]),
    () => window.matchMedia(query).matches,
    () => fallback,
  );
}
/** True below the `md` breakpoint (768 px), from the central scale. Server and
 * hydration render as wide. */
export function useIsNarrow(): boolean {
  return !useMediaQuery(breakpointQuery('md'), true);
}

function PopoverBody({children,close}:{children:ReactNode|((close:(restore?:boolean)=>void)=>ReactNode);close:(restore?:boolean)=>void}) { return <>{typeof children==='function'?children(close):children}</>; }
const popoverFocusable = 'input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),button:not([disabled]),[tabindex="0"]';
/** Non-modal dialog anchored under its trigger (same contract as `Menu`): the trigger
 * carries `aria-haspopup="dialog"`, `aria-expanded` and `aria-controls`; Escape and
 * outside clicks close; focus moves to the first field and returns to the trigger.
 * The panel aligns to the nearer edge of the trigger and stays inside the viewport.
 * Below 768 px the same content opens as a `Modal`. Pass `open`/`onOpenChange` to
 * control it from elsewhere (e.g. another button that opens this popover). */
export function Popover({label,triggerContent,triggerLabel,triggerClassName='btn btn-ghost',children,open:controlledOpen,onOpenChange,className='',wrapperClassName=''}:{
  label:string; triggerContent:ReactNode; triggerLabel?:string; triggerClassName?:string; children:ReactNode|((close:(restore?:boolean)=>void)=>ReactNode);
  open?:boolean; onOpenChange?:(open:boolean)=>void; className?:string; wrapperClassName?:string;
}) {
  const [uncontrolled,setUncontrolled]=useState(false);
  const open=controlledOpen??uncontrolled;
  const narrow=useIsNarrow();
  const trigger=useRef<HTMLButtonElement>(null); const panel=useRef<HTMLDivElement>(null); const id=useId();
  const [position,setPosition]=useState<CSSProperties>({opacity:0});
  const setOpen=useCallback((next:boolean)=>{ if(controlledOpen===undefined)setUncontrolled(next); onOpenChange?.(next); },[controlledOpen,onOpenChange]);
  const close=useCallback((restore=true)=>{ setOpen(false); if(restore)trigger.current?.focus({preventScroll:true}); },[setOpen]);
  useLayoutEffect(()=>{
    if(!open||narrow)return;
    const place=()=>{
      const anchor=trigger.current?.getBoundingClientRect(); const box=panel.current; if(!anchor||!box)return;
      const width=Math.min(box.offsetWidth,window.innerWidth-16);
      const preferLeft=anchor.left+anchor.width/2<window.innerWidth/2;
      const left=Math.min(Math.max(8,preferLeft?anchor.left:anchor.right-width),window.innerWidth-width-8);
      const top=anchor.bottom+6;
      setPosition({left,top,maxHeight:Math.max(200,window.innerHeight-top-8),maxWidth:'calc(100vw - 16px)'});
    };
    place();
    window.addEventListener('resize',place); window.addEventListener('scroll',place,true);
    return()=>{window.removeEventListener('resize',place);window.removeEventListener('scroll',place,true);};
  },[open,narrow]);
  useEffect(()=>{
    if(!open||narrow)return;
    panel.current?.querySelector<HTMLElement>(popoverFocusable)?.focus({preventScroll:true});
    const outside=(event:MouseEvent)=>{ if(!panel.current?.contains(event.target as Node)&&!trigger.current?.contains(event.target as Node))close(false); };
    document.addEventListener('mousedown',outside);
    return()=>document.removeEventListener('mousedown',outside);
  },[open,narrow,close]);
  const content=<PopoverBody close={close}>{children}</PopoverBody>;
  return <div className={`popover-anchor ${wrapperClassName}`}>
    <button ref={trigger} type="button" className={triggerClassName} aria-label={triggerLabel} aria-haspopup="dialog" aria-expanded={open} aria-controls={open?id:undefined} onClick={()=>{ if(open)close(false); else { setPosition({opacity:0}); setOpen(true); } }}>{triggerContent}</button>
    {open&&(narrow
      ?<Modal title={label} onClose={()=>close()}><div id={id} className={`popover-sheet ${className}`}>{content}</div></Modal>
      :<div ref={panel} id={id} role="dialog" aria-label={label} className={`popover ${className}`} style={position}
        onKeyDown={event=>{ if(event.key==='Escape'){ event.preventDefault(); event.stopPropagation(); close(); } }}
        onBlur={event=>{ const next=event.relatedTarget as Node|null; if(next&&!panel.current?.contains(next)&&!trigger.current?.contains(next))close(false); }}>{content}</div>)}
  </div>;
}
