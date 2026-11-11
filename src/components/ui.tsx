'use client';

import { useEffect, useId, useRef, type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { Inbox, LoaderCircle, Search, X } from 'lucide-react';
import { activateModal } from '@/lib/modal-focus';

export function Button({variant='primary',size='default',className='',children,...props}: ButtonHTMLAttributes<HTMLButtonElement> & {variant?:'primary'|'secondary'|'ghost'|'danger';size?:'default'|'icon'}) {
  return <button className={`btn btn-${variant} ${size === 'icon' ? 'btn-icon' : ''} ${className}`} {...props}>{children}</button>;
}
export function SearchInput({className='',...props}: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & {'aria-label':string}) {
  return <div className={`search-field ${className}`}><Search size={16} aria-hidden="true"/><input type="search" {...props}/></div>;
}
export function Badge({children,tone='gray'}:{children:ReactNode;tone?:'green'|'amber'|'red'|'gray'|'blue'}) { return <span className={`badge badge-${tone}`}>{children}</span>; }
export function Spinner() { return <LoaderCircle className="spinner" size={20} aria-label="Carregando" role="status"/>; }
export function Avatar({name,color,size='md'}:{name:string;color?:string;size?:'sm'|'md'|'lg'}) { return <span aria-hidden="true" className={`avatar avatar-${size}`} style={color?{backgroundColor:`${color}20`,color:'var(--ink)'}:undefined}>{name.replace(/^(Dr\.?|Dra\.?)\s+/,'').split(' ').filter(Boolean).slice(0,2).map(n=>n[0]).join('')}</span>; }
export function EmptyState({title,description,children}:{title:string;description?:string;children?:ReactNode}) { return <div className="empty-state"><Inbox size={30}/><h3>{title}</h3>{description&&<p>{description}</p>}{children}</div>; }
export function PageHeading({eyebrow,title,description,actions}:{eyebrow?:string;title:string;description?:string;actions?:ReactNode}) { return <header className="page-heading"><div>{eyebrow&&<p className="eyebrow">{eyebrow}</p>}<h1>{title}</h1>{description&&<p className="muted">{description}</p>}</div>{actions&&<div className="heading-actions">{actions}</div>}</header>; }
export function Field({label,children,hint}:{label:string;children:ReactNode;hint?:string}) {return <label className="field"><span>{label}</span>{children}{hint&&<small>{hint}</small>}</label>;}
export function Modal({title,onClose,children,wide=false}:{title:string;onClose:()=>void;children:ReactNode;wide?:boolean}) {
 const ref=useRef<HTMLDivElement>(null); const onCloseRef=useRef(onClose); const id=useId();
 useEffect(()=>{onCloseRef.current=onClose;},[onClose]);
 useEffect(()=>{
   if(ref.current)return activateModal(ref.current,()=>onCloseRef.current());
 },[]);
 return createPortal(<div className="modal-overlay" onMouseDown={e=>{if(e.target===e.currentTarget)onClose();}}><div ref={ref} data-density="comfortable" className={`modal ${wide?'modal-wide':''}`} role="dialog" aria-modal="true" aria-labelledby={id} tabIndex={-1}><div className="modal-heading"><h2 id={id}>{title}</h2><Button variant="ghost" size="icon" onClick={onClose} aria-label="Fechar"><X size={20}/></Button></div>{children}</div></div>,document.body);
}
