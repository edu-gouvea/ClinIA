'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Activity, ArrowUpRight, CalendarDays, ChartColumn, FlaskConical, House, Menu, MessageCircle, Settings, Sparkles, Users, UsersRound, X, type LucideIcon } from 'lucide-react';
import { useId, useState } from 'react';
import { useDemo } from './demo-provider';
import { AssistantProvider, useAssistant } from './assistant-provider';
import { Avatar, Button, Drawer, EmptyState, Modal, Spinner } from './ui';
import { can, currentUser, routePermissions } from '@/lib/permissions';
import { formatDate } from '@/lib/date';
import { ThemeToggle } from './theme-toggle';

type NavItem = { href: string; label: string; icon: LucideIcon; match: (path: string) => boolean };
const primaryItems: NavItem[] = [
  { href: '/inicio', label: 'Início', icon: House, match: path => path === '/inicio' },
  { href: '/conversas', label: 'Conversas', icon: MessageCircle, match: path => path.startsWith('/conversas') },
  { href: '/gestao/agenda', label: 'Agenda', icon: CalendarDays, match: path => path.startsWith('/gestao/agenda') },
  { href: '/gestao/pacientes', label: 'Pacientes', icon: UsersRound, match: path => path.startsWith('/gestao/pacientes') },
];
const managementItems: NavItem[] = [
  { href: '/gestao/visao-gerencial', label: 'Visão gerencial', icon: ChartColumn, match: path => path.startsWith('/gestao/visao-gerencial') },
  { href: '/gestao/equipe', label: 'Equipe', icon: Users, match: path => path.startsWith('/gestao/equipe') },
  { href: '/gestao/configuracoes', label: 'Configurações', icon: Settings, match: path => path.startsWith('/gestao/configuracoes') },
];

function Logo() {
  return <Link href="/inicio" className="sidebar-logo" aria-label="ClinIA — início" title="ClinIA — início">
    <span className="brand-mark" aria-hidden="true"><Activity size={16} strokeWidth={2.4} /></span>
    <span className="brand-wordmark" aria-hidden="true">clinia<span className="brand-dot">.</span></span>
  </Link>;
}

/** Sidebar body shared by the persistent rail (≥768 px) and the mobile drawer. */
function SidebarContent({ onOpenAssistant, onOpenProfile }: { onOpenAssistant: () => void; onOpenProfile: () => void }) {
  const path = usePathname();
  const { state, ready } = useDemo();
  const live = ready;
  const waiting = live ? state.conversations.filter(c => c.status === 'aguardando').length : 0;
  const groupId = useId();
  const user = currentUser(state);
  const management = managementItems.filter(item => can(user, routePermissions[item.href]));
  const demoText = live ? `Dados fictícios · ref. ${formatDate(state.referenceDate)}, 10h15` : 'Dados fictícios';
  const item = ({ href, label, icon: Icon, match }: NavItem) => {
    const active = match(path);
    const count = href === '/conversas' && waiting > 0 ? waiting : 0;
    const name = count ? `${label}, ${count} ${count === 1 ? 'conversa aguardando' : 'conversas aguardando'} atendente` : label;
    return <li key={href}><Link href={href} className={`sidebar-item${active ? ' active' : ''}`} aria-current={active ? 'page' : undefined} aria-label={name} title={name}>
      <Icon size={16} aria-hidden="true" /><span className="sidebar-label">{label}</span>{count > 0 && <span className="nav-count tabular" aria-hidden="true">{count}</span>}
    </Link></li>;
  };
  return <>
    <Logo />
    <div className="sidebar-clinic" title={state.clinic.name}><span className="sidebar-clinic-mark" aria-hidden="true">{state.clinic.name.replace(/^Clínica\s+/i, '').charAt(0)}</span><span className="sidebar-label">{state.clinic.name}</span></div>
    <ul className="sidebar-list">{primaryItems.map(item)}</ul>
    {management.length > 0 && <div className="sidebar-group">
      <p className="sidebar-group-label" id={groupId}><span className="sidebar-label">Gestão</span></p>
      <ul className="sidebar-list" aria-labelledby={groupId}>{management.map(item)}</ul>
    </div>}
    <div className="sidebar-spacer" />
    <div className="sidebar-list">
      <button type="button" className="sidebar-item sidebar-assistant" aria-label="Assistente IA" title="Assistente IA" onClick={onOpenAssistant}><Sparkles size={16} aria-hidden="true" /><span className="sidebar-label">Assistente IA</span></button>
      <ThemeToggle />
    </div>
    <div className="sidebar-demo" title={`Ambiente demonstrativo · ${demoText}`}>
      <FlaskConical size={16} aria-hidden="true" className="sidebar-demo-icon" />
      <p className="sidebar-label"><strong>Ambiente demonstrativo</strong><span>{demoText}</span></p>
    </div>
    {user && <button type="button" className="sidebar-profile" onClick={onOpenProfile} aria-label={`Abrir perfil de ${user.name}`} title={`${user.name} · ${user.role}`}>
      <Avatar name={user.name} size="sm" /><span className="sidebar-label"><strong>{user.name}</strong><small>{user.role}</small></span>
    </button>}
  </>;
}

function ShellContent({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const { state, ready, error, switchUser } = useDemo();
  const { openAssistant } = useAssistant();
  const user = currentUser(state);
  // Same table as the server: a management route the profile cannot open shows a 403 state.
  const required = Object.entries(routePermissions).find(([route]) => path.startsWith(route))?.[1];
  const allowed = !required || !ready || can(user, required);
  const [profile, setProfile] = useState(false);
  // The drawer belongs to the route it was opened on, so any navigation closes it.
  const [menuPath, setMenuPath] = useState<string | null>(null);
  const menuOpen = menuPath === path;
  const closeMenu = () => setMenuPath(null);
  const conversations = path.startsWith('/conversas');
  // Analysis screens use the icon rail (≥1280) and the grey canvas, so the wide content breathes.
  const analysis = path.startsWith('/gestao/visao-gerencial');
  const actions = {
    onOpenAssistant: () => { closeMenu(); openAssistant(); },
    onOpenProfile: () => { closeMenu(); setProfile(true); },
  };
  return <>
    <a className="skip-link" href="#main-content">Pular para o conteúdo</a>
    <div className={`app-frame${conversations ? " app-frame-conversations" : ""}${conversations || analysis ? " app-frame-rail" : ""}`}>
      <header className="mobile-bar">
        <Logo />
        <div className="mobile-bar-actions">
          <Button variant="ghost" size="icon" className="mobile-assistant" aria-label="Assistente IA" onClick={() => openAssistant()}><Sparkles size={18} /></Button>
          <Button variant="ghost" size="icon" aria-label="Abrir menu" aria-expanded={menuOpen} aria-controls={menuOpen ? 'mobile-menu' : undefined} onClick={() => setMenuPath(path)}><Menu size={20} /></Button>
        </div>
      </header>
      <nav className="sidebar" aria-label="Navegação principal"><SidebarContent {...actions} /></nav>
      <main id="main-content" tabIndex={-1} aria-busy={!ready} className={`app-main${conversations ? ' app-main-conversations' : ''}${analysis ? ' app-main-analysis' : ''}`}>
        <div className="app-container">
          {error && <div className="error-banner" role="alert">{error}</div>}
          {!ready && <div className="app-loading"><Spinner /><span>Organizando sua clínica…</span></div>}
          <div className="app-content" hidden={!ready}>{allowed ? children : <EmptyState title="Área restrita à administração" description={`Seu perfil (${user?.role ?? 'sem perfil'}) não acessa esta área. A recepção trabalha em Início, Conversas, Agenda e Pacientes.`}>
            <Link href="/inicio" className="btn btn-primary">Ir para o início</Link>
          </EmptyState>}</div>
        </div>
      </main>
    </div>
    {menuOpen && <Drawer id="mobile-menu" label="Menu" onClose={closeMenu}>
      <div className="drawer-close"><Button variant="ghost" size="icon" aria-label="Fechar menu" onClick={closeMenu}><X size={20} /></Button></div>
      <nav className="sidebar sidebar-drawer" aria-label="Navegação principal"><SidebarContent {...actions} /></nav>
    </Drawer>}
    {profile && user && <Modal title="Seu perfil de demonstração" onClose={() => setProfile(false)}>
      <div className="profile-header"><Avatar name={user.name} size="lg" /><div><h3>{user.name}</h3><p className="muted">{user.role} · {state.clinic.name}</p></div></div>
      <p className="notice">Identidades fictícias para explorar o CRM. Autenticação, contas de acesso e provisionamento serão integrados em outra etapa.</p>
      <fieldset className="profile-switch">
        <legend>Ver como</legend>
        {state.users.map(person => <label key={person.id} className="checkbox-label">
          <input type="radio" name="demo-user" checked={person.id === user.id} onChange={() => void switchUser(person.id)} />
          {person.name} <span className="muted">· {person.role}</span>
        </label>)}
        <small className="muted">A recepção não vê Visão gerencial, Equipe nem Configurações.</small>
      </fieldset>
      {can(user, 'clinic.manage') && <Link href="/gestao/configuracoes" className="btn btn-secondary" onClick={() => setProfile(false)}>Configurações da clínica <ArrowUpRight size={16} /></Link>}
    </Modal>}
  </>;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  return <AssistantProvider><ShellContent>{children}</ShellContent></AssistantProvider>;
}
