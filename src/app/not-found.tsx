import Link from 'next/link';
export default function NotFound(){return <div className="empty-state"><h1>Página não encontrada</h1><p>Volte ao início para continuar acompanhando sua clínica.</p><Link href="/inicio" className="btn btn-primary">Ir para o início</Link></div>;}
