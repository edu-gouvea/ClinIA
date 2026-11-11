'use client';
export default function ErrorPage({reset}:{reset:()=>void}) {return <div className="empty-state" role="alert"><h1>Não foi possível abrir esta tela</h1><p>Seus dados locais continuam salvos. Tente novamente.</p><button className="btn btn-primary" onClick={reset}>Tentar novamente</button></div>;}
