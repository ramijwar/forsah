import ModerationImages from './ModerationImages';
import { API_BASE } from './api';
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import {
  Activity, ArrowUpRight, BadgeCheck, Ban, Check,
  ChevronLeft, CircleHelp, Clock3, FileText, Flag, LayoutDashboard, LoaderCircle,
  LogOut, MessageCircle, Pencil, RefreshCw, Search, Send, Shield, ShieldCheck,
  Sparkles, Tag, Trash2, Users, X,
} from 'lucide-react';
import './admin-dashboard.css';

type Role = 'super_admin' | 'admin' | 'support' | 'user';
type AdminUser = { id: number; name: string; email: string; phone: string | null; role: Role; is_banned: boolean; created_at: string };
type Ad = { id: number; title: string; description: string; category: string; status: 'pending' | 'active' | 'rejected' | 'blocked'; owner_name: string | null; owner_email: string | null; created_at: string };
type TicketMessage = { id: number; sender_type: 'user' | 'admin' | 'support'; sender_name: string; content: string; created_at: string };
type Ticket = { id: number; subject: string; status: 'open' | 'in_progress' | 'resolved'; priority: 'normal' | 'urgent'; user_name: string; user_email: string; updated_at: string; messages?: TicketMessage[] };
type Report = { id: number; reporter_name: string; reporter_email: string; entity_type: 'ad' | 'user'; entity_id: number; reason: string; description: string; status: 'pending' | 'handled' | 'dismissed'; created_at: string; target_label: string | null };
type AdminProfile = { id: number; name: string; email: string; role: Role };
type Stats = { users: number; active_ads: number; pending_ads: number; pending_reports: number; open_tickets: number };
type Section = 'overview' | 'ads' | 'users' | 'reports' | 'support';
type ApiEnvelope<T> = { ok: boolean; data?: T; error?: string };

const TOKEN_KEY = 'forsah-admin-session';
const labels: Record<Section, string> = { overview: 'الرئيسية والإحصائيات', ads: 'إدارة الإعلانات', users: 'إدارة المستخدمين', reports: 'إدارة البلاغات', support: 'تذاكر الدعم' };

async function request<T>(token: string, action: string, options: { method?: string; id?: number; body?: unknown } = {}): Promise<T> {
  if (!API_BASE) throw new Error('عنوان الـ API غير مضبوط. أضف VITE_API_BASE_URL إلى ملف .env ثم أعد تشغيل الواجهة.');
  const url = new URL(API_BASE, window.location.href);
  url.searchParams.set('resource', 'admin');
  url.searchParams.set('action', action);
  if (options.id !== undefined) url.searchParams.set('id', String(options.id));
  const response = await fetch(url.toString(), {
    signal: AbortSignal.timeout(15000),
    method: options.method ?? 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(options.body === undefined ? {} : { 'Content-Type': 'application/json' }) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  let result: ApiEnvelope<T>;
  try { result = await response.json() as ApiEnvelope<T>; } catch { throw new Error('استجابة الخادم غير صالحة.'); }
  if (!response.ok || !result.ok || result.data === undefined) throw new Error(result.error || 'تعذر إتمام الطلب.');
  return result.data;
}

function dateLabel(value: string) {
  try { return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(`${value.replace(' ', 'T')}Z`)); }
  catch { return value; }
}
function roleLabel(role: Role) { return role === 'super_admin' ? 'مدير فائق' : role === 'admin' ? 'مدير' : role === 'support' ? 'دعم فني' : 'مستخدم'; }
function statusLabel(status: string) { return ({ pending: 'قيد المراجعة', active: 'نشط', rejected: 'مرفوض', blocked: 'محظور', open: 'مفتوحة', in_progress: 'قيد المعالجة', resolved: 'مغلقة' } as Record<string, string>)[status] ?? status; }

export default function AdminDashboard({ memberToken = '' }: { memberToken?: string }) {
  const [token, setToken] = useState(() => { try { return memberToken || sessionStorage.getItem(TOKEN_KEY) || ''; } catch { return ''; } });
  const [profile, setProfile] = useState<AdminProfile | null>(null);
  const [section, setSection] = useState<Section>('overview');
  const [stats, setStats] = useState<Stats>({ users: 0, active_ads: 0, pending_ads: 0, pending_reports: 0, open_tickets: 0 });
  const [ads, setAds] = useState<Ad[]>([]);
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState('');
  const [query, setQuery] = useState('');
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [editor, setEditor] = useState<{ kind: 'ad' | 'user'; id: number; title?: string; description?: string; category?: string; name?: string; email?: string; phone?: string; role?: Role } | null>(null);

  const logout = useCallback(async () => {
    if (token && API_BASE) { try { await request(token, 'logout', { method: 'POST' }); } catch { /* local session still removed */ } }
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* storage may be unavailable */ }
    setToken(''); setProfile(null); setSelectedTicket(null);
  }, [token]);

  const load = useCallback(async (target: Section = section, activeToken = token) => {
    if (!activeToken) return;
    setLoading(true); setError('');
    try {
      if (target === 'overview') {
        const data = await request<Stats>(activeToken, 'stats'); setStats(data);
      } else if (target === 'ads') {
        const data = await request<{ items: Ad[] }>(activeToken, 'ads'); setAds(data.items);
      } else if (target === 'users') {
        const data = await request<{ items: AdminUser[] }>(activeToken, 'users'); setUsers(data.items);
      } else if (target === 'reports') {
        const data = await request<{ items: Report[] }>(activeToken, 'reports'); setReports(data.items);
      } else {
        const data = await request<{ items: Ticket[] }>(activeToken, 'tickets'); setTickets(data.items);
        if (selectedTicket) {
          const fresh = await request<Ticket>(activeToken, 'ticket', { id: selectedTicket.id }); setSelectedTicket(fresh);
        }
      }
    } catch (caught) {
      const message = caught instanceof Error ? caught.message : 'حدث خطأ غير متوقع.';
      if (/انتهت|غير صالح|غير مخول|غير مصرّح|مصادقة/i.test(message)) { await logout(); }
      else setError(message);
    } finally { setLoading(false); }
  }, [section, token, logout, selectedTicket]);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    request<AdminProfile>(token, 'me').then((me) => { if (!cancelled) setProfile(me); }).catch(() => { if (!cancelled) void logout(); });
    return () => { cancelled = true; };
  }, [token, logout]);
  useEffect(() => { if (profile) void load(section); }, [profile, section]);

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setBusy(true); setError('');
    try {
      if (!API_BASE) throw new Error('لم يُضبط عنوان الـ API. أضف VITE_API_BASE_URL إلى ملف .env وأعد تشغيل الواجهة.');
      const url = new URL(API_BASE, window.location.href); url.searchParams.set('resource', 'admin'); url.searchParams.set('action', 'login');
      const response = await fetch(url.toString(), { signal: AbortSignal.timeout(15000), method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }) });
      const result = await response.json() as ApiEnvelope<{ token: string; user: AdminProfile }>;
      if (!response.ok || !result.ok || !result.data) throw new Error(result.error || 'بيانات الدخول غير صحيحة.');
      try { sessionStorage.setItem(TOKEN_KEY, result.data.token); } catch { /* token remains in memory */ }
      setToken(result.data.token); setProfile(result.data.user); setLoginPassword(''); setSection('overview');
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر تسجيل الدخول.'); }
    finally { setBusy(false); }
  };

  const mutate = async (action: string, method: string, id: number, body?: unknown) => {
    setBusy(true); setError(''); setNotice('');
    try { await request(token, action, { method, id, body }); setNotice('تم حفظ التغيير بنجاح.'); await load(section); try { setStats(await request<Stats>(token, 'stats')); } catch { /* the changed record is saved; refresh summary on next visit */ } }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر حفظ التغيير.'); }
    finally { setBusy(false); }
  };

  const openTicket = async (ticket: Ticket) => {
    setSelectedTicket(ticket); setError('');
    try { setSelectedTicket(await request<Ticket>(token, 'ticket', { id: ticket.id })); }
    catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر فتح التذكرة.'); }
  };

  const sendReply = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!selectedTicket || !reply.trim()) return;
    setBusy(true); setError('');
    try {
      const updated = await request<Ticket>(token, 'ticket-reply', { method: 'POST', id: selectedTicket.id, body: { content: reply.trim() } });
      setSelectedTicket(updated); setReply(''); setNotice('تم إرسال الرد.'); await load('support'); try { setStats(await request<Stats>(token, 'stats')); } catch { /* refresh summary on next visit */ }
    } catch (caught) { setError(caught instanceof Error ? caught.message : 'تعذر إرسال الرد.'); }
    finally { setBusy(false); }
  };

  const visibleAds = useMemo(() => ads.filter((item) => `${item.title} ${item.category} ${item.owner_name ?? ''}`.toLowerCase().includes(query.toLowerCase())), [ads, query]);
  const visibleUsers = useMemo(() => users.filter((item) => `${item.name} ${item.email} ${item.phone ?? ''}`.toLowerCase().includes(query.toLowerCase())), [users, query]);
  const visibleTickets = useMemo(() => tickets.filter((item) => `${item.subject} ${item.user_name} ${item.user_email}`.toLowerCase().includes(query.toLowerCase())), [tickets, query]);
  const visibleReports = useMemo(() => reports.filter((item) => `${item.reason} ${item.description} ${item.reporter_name} ${item.reporter_email} ${item.target_label ?? ''}`.toLowerCase().includes(query.toLowerCase())), [reports, query]);

  if (!profile) return <main className="admin-login" dir="rtl">
    <div className="admin-login-card">
      <div className="admin-brand"><span className="admin-brand-icon"><Sparkles size={22} /></span><div><strong>فرصة <span>إدارة</span></strong><small>مساحة الإدارة والدعم الفني</small></div></div>
      <div className="admin-login-intro"><span className="admin-shield"><ShieldCheck size={24} /></span><h1>تسجيل دخول الإدارة</h1><p>هذه المساحة مخصصة للحسابات الإدارية المخوّلة.</p></div>
      {error && <div className="admin-alert" role="alert">{error}</div>}
      {!API_BASE && <div className="admin-config-note"><strong>يلزم ربط الخادم أولًا</strong><span>أضف <code>VITE_API_BASE_URL</code> في <code>.env</code> ثم أعد تشغيل Vite.</span></div>}
      <form className="admin-login-form" onSubmit={login}>
        <label>البريد الإلكتروني<input type="email" autoComplete="username" required value={loginEmail} onChange={(event) => setLoginEmail(event.target.value)} placeholder="admin@example.com" /></label>
        <label>كلمة المرور<input type="password" autoComplete="current-password" required value={loginPassword} onChange={(event) => setLoginPassword(event.target.value)} placeholder="أدخل كلمة المرور" /></label>
        <button className="admin-primary" disabled={busy || !API_BASE}>{busy ? <LoaderCircle className="spin" size={17} /> : <Shield size={17} />} دخول آمن</button>
      </form>
      <p className="admin-login-foot"><ShieldCheck size={14} /> الجلسة محمية وتنتهي تلقائيًا بعد 12 ساعة</p>
      <a className="admin-back-link" href="#/">العودة إلى فرصة</a>
    </div>
  </main>;

  const nav: { id: Section; icon: typeof LayoutDashboard; count?: number }[] = [
    { id: 'overview', icon: LayoutDashboard }, { id: 'ads', icon: Tag, count: stats.pending_ads },
    { id: 'users', icon: Users }, { id: 'reports', icon: Flag, count: stats.pending_reports }, { id: 'support', icon: CircleHelp, count: stats.open_tickets },
  ];
  const refresh = () => void load(section);
  const confirmDelete = async (ad: Ad) => {
    if (window.confirm(`حذف الإعلان «${ad.title}» نهائيًا؟`)) await mutate('ad', 'DELETE', ad.id);
  };
  const submitEditor = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (!editor) return;
    const { kind, id, ...body } = editor;
    await mutate(kind, 'PATCH', id, kind === 'ad' ? body : { name: body.name, email: body.email, phone: body.phone, ...(profile.role === 'super_admin' && body.role ? { role: body.role } : {}) });
    setEditor(null);
  };

  return <div className="admin-app" dir="rtl">
    <aside className="admin-sidebar">
      <a className="admin-sidebar-brand" href="#/"><span className="admin-brand-icon"><Sparkles size={20} /></span><span><strong>فرصة</strong><small>لوحة الإدارة</small></span></a>
      <div className="admin-side-caption">القائمة الرئيسية</div>
      <nav className="admin-nav" aria-label="التنقل الإداري">{nav.map(({ id, icon: Icon, count }) => <button key={id} onClick={() => { setSection(id); setQuery(''); setError(''); }} className={section === id ? 'active' : ''}><Icon size={18} /><span>{labels[id]}</span>{count ? <b>{count}</b> : null}</button>)}</nav>
      <div className="admin-sidebar-bottom"><div className="admin-operator"><span className="operator-avatar">{profile.name.slice(0, 1)}</span><span><strong>{profile.name}</strong><small>{roleLabel(profile.role)}</small></span><ShieldCheck size={16} /></div><button className="admin-logout" onClick={() => void logout()}><LogOut size={17} /> تسجيل الخروج</button></div>
    </aside>
    <main className="admin-main">
      <header className="admin-topbar"><div><span className="admin-breadcrumb">فرصة <ChevronLeft size={13} /> الإدارة</span><h1>{labels[section]}</h1></div><div className="admin-top-actions"><span className="admin-secure-label"><span /> اتصال إداري آمن</span><button className="admin-icon-btn" onClick={refresh} aria-label="تحديث البيانات" title="تحديث"><RefreshCw size={17} /></button><button className="admin-logout-mobile" onClick={() => void logout()} aria-label="تسجيل الخروج"><LogOut size={17} /></button></div></header>
      {error && <div className="admin-alert admin-alert-inline" role="alert"><span>{error}</span><button onClick={() => setError('')} aria-label="إغلاق"><X size={15} /></button></div>}
      {notice && <div className="admin-success" role="status"><Check size={16} />{notice}<button onClick={() => setNotice('')} aria-label="إغلاق"><X size={14} /></button></div>}
      <div className="admin-mobile-nav">{nav.map(({ id, icon: Icon }) => <button key={id} className={section === id ? 'active' : ''} onClick={() => { setSection(id); setQuery(''); }}><Icon size={16} /><span>{labels[id]}</span></button>)}</div>
      {section === 'overview' && <section className="admin-content">
        <div className="admin-welcome"><div><span className="admin-eyebrow">نظرة عامة على المنصة</span><h2>أهلًا {profile.name}، إليك ملخص فرصة</h2><p>تابع نشاط المنصة والطلبات التي تحتاج إلى مراجعة.</p></div><span className="welcome-illustration"><Activity size={30} /></span></div>
        <div className="admin-stat-grid">
          <StatCard label="إجمالي المستخدمين" value={stats.users} icon={Users} tone="green" detail="حساب مسجّل" />
          <StatCard label="الإعلانات النشطة" value={stats.active_ads} icon={Tag} tone="blue" detail="منشور على المنصة" />
          <StatCard label="إعلانات بانتظار المراجعة" value={stats.pending_ads} icon={Clock3} tone="amber" detail="تحتاج قرارًا إداريًا" />
          <StatCard label="بلاغات معلقة" value={stats.pending_reports} icon={Flag} tone="violet" detail="تحتاج إلى مراجعة" />
          <StatCard label="تذاكر دعم مفتوحة" value={stats.open_tickets} icon={MessageCircle} tone="blue" detail="بانتظار المتابعة" />
        </div>
        <div className="admin-overview-grid"><section className="admin-panel"><div className="admin-panel-heading"><div><h3>مهام سريعة</h3><p>انتقل مباشرة إلى العناصر التي تحتاج متابعة</p></div><Activity size={18} /></div><div className="admin-quick-list"><button onClick={() => setSection('ads')}><span className="quick-badge amber"><Tag size={17} /></span><span><strong>مراجعة الإعلانات</strong><small>{stats.pending_ads} إعلان بانتظار الاعتماد</small></span><b>{stats.pending_ads}</b><ChevronLeft size={17} /></button><button onClick={() => setSection('reports')}><span className="quick-badge violet"><Flag size={17} /></span><span><strong>مراجعة البلاغات</strong><small>{stats.pending_reports} بلاغ معلق</small></span><b>{stats.pending_reports}</b><ChevronLeft size={17} /></button><button onClick={() => setSection('support')}><span className="quick-badge blue"><CircleHelp size={17} /></span><span><strong>الرد على الدعم الفني</strong><small>{stats.open_tickets} تذكرة غير مغلقة</small></span><b>{stats.open_tickets}</b><ChevronLeft size={17} /></button><button onClick={() => setSection('users')}><span className="quick-badge blue"><Users size={17} /></span><span><strong>إدارة المستخدمين</strong><small>عرض الحسابات وحالتها</small></span><ChevronLeft size={17} /></button></div></section><section className="admin-panel admin-roles-panel"><div className="admin-panel-heading"><div><h3>صلاحيات حسابك</h3><p>تختلف الصلاحيات حسب الدور المعيّن لك</p></div><ShieldCheck size={19} /></div><div className="role-indicator"><span><Shield size={19} /></span><div><strong>{roleLabel(profile.role)}</strong><small>{profile.role === 'super_admin' ? 'كامل الصلاحيات بما فيها إدارة الأدوار' : profile.role === 'support' ? 'إدارة المحتوى والمستخدمين وتذاكر الدعم' : 'إدارة المنصة والمحتوى'}</small></div><BadgeCheck size={19} /></div><p className="admin-audit-hint"><ShieldCheck size={15} /> تُسجّل تغييرات الإدارة في سجل تدقيق على الخادم.</p></section></div>
      </section>}
      {section === 'ads' && <section className="admin-content"><div className="admin-section-intro"><div><span className="admin-eyebrow">مراجعة ومراقبة المحتوى</span><h2>إدارة الإعلانات والخدمات</h2><p>مراجعة الإعلانات من جميع التصنيفات وتعديلها أو إيقافها.</p></div><span className="admin-section-icon green"><Tag size={21} /></span></div><SearchBox value={query} onChange={setQuery} placeholder="ابحث بعنوان الإعلان أو التصنيف أو المعلن" />
        <div className="admin-table-wrap"><div className="admin-table-caption"><strong>كل الإعلانات</strong><span>{visibleAds.length} إعلان</span></div>{loading ? <Loading /> : visibleAds.length ? <table className="admin-table"><thead><tr><th>الإعلان</th><th>التصنيف</th><th>المعلن</th><th>الحالة</th><th>تاريخ الإضافة</th><th>الإجراءات</th></tr></thead><tbody>{visibleAds.map((ad) => <tr key={ad.id}><td><strong>{ad.title}</strong><small className="table-subtitle">{ad.description}</small></td><td>{ad.category}</td><td>{ad.owner_name || '—'}<small className="table-subtitle">{ad.owner_email}</small></td><td><StatusBadge status={ad.status} /></td><td>{dateLabel(ad.created_at)}</td><td><div className="admin-row-actions">{ad.status !== 'active' && <button className="action-approve" title="اعتماد الإعلان" aria-label="اعتماد الإعلان" onClick={() => void mutate('ad', 'PATCH', ad.id, { status: 'active' })}><Check size={15} /></button>}<button className="action-edit" title="تعديل الإعلان" aria-label="تعديل الإعلان" onClick={() => setEditor({ kind: 'ad', id: ad.id, title: ad.title, description: ad.description, category: ad.category })}><Pencil size={15} /></button>{ad.status !== 'blocked' && <button className="action-block" title="حظر الإعلان" aria-label="حظر الإعلان" onClick={() => void mutate('ad', 'PATCH', ad.id, { status: 'blocked' })}><Ban size={15} /></button>}<button className="action-delete" title="حذف الإعلان" aria-label="حذف الإعلان" onClick={() => void confirmDelete(ad)}><Trash2 size={15} /></button></div></td></tr>)}</tbody></table> : <EmptyState title="لا توجد إعلانات" detail="ستظهر الإعلانات هنا عند توفرها." />}</div>
      </section>}
      {section === 'users' && <section className="admin-content"><div className="admin-section-intro"><div><span className="admin-eyebrow">الحسابات والصلاحيات</span><h2>إدارة المستخدمين</h2><p>تحديث بيانات المستخدمين وإدارة حالات الحظر.</p></div><span className="admin-section-icon blue"><Users size={21} /></span></div><SearchBox value={query} onChange={setQuery} placeholder="ابحث بالاسم أو البريد أو رقم الهاتف" />
        <div className="admin-table-wrap"><div className="admin-table-caption"><strong>كل الحسابات</strong><span>{visibleUsers.length} مستخدم</span></div>{loading ? <Loading /> : visibleUsers.length ? <table className="admin-table"><thead><tr><th>المستخدم</th><th>رقم الهاتف</th><th>الدور</th><th>الحالة</th><th>تاريخ التسجيل</th><th>الإجراءات</th></tr></thead><tbody>{visibleUsers.map((user) => <tr key={user.id}><td><div className="admin-user-cell"><span className="user-table-avatar">{user.name.slice(0, 1)}</span><span><strong>{user.name}</strong><small className="table-subtitle">{user.email}</small></span></div></td><td>{user.phone || '—'}</td><td><span className={`role-chip ${user.role !== 'user' ? 'staff' : ''}`}>{roleLabel(user.role)}</span></td><td><StatusBadge status={user.is_banned ? 'blocked' : 'active'} /></td><td>{dateLabel(user.created_at)}</td><td><div className="admin-row-actions"><button className="action-edit" title="تعديل بيانات المستخدم" aria-label="تعديل بيانات المستخدم" onClick={() => setEditor({ kind: 'user', id: user.id, name: user.name, email: user.email, phone: user.phone ?? '', role: user.role })}><Pencil size={15} /></button>{user.role === 'user' && <button className={user.is_banned ? 'action-approve' : 'action-block'} title={user.is_banned ? 'فك الحظر' : 'حظر المستخدم'} aria-label={user.is_banned ? 'فك الحظر' : 'حظر المستخدم'} onClick={() => void mutate('user', 'PATCH', user.id, { is_banned: !user.is_banned })}>{user.is_banned ? <Check size={15} /> : <Ban size={15} />}</button>}</div></td></tr>)}</tbody></table> : <EmptyState title="لا يوجد مستخدمون" detail="لم يعثر البحث على حسابات مطابقة." />}</div>
      </section>}
      {section === 'reports' && <section className="admin-content"><div className="admin-section-intro"><div><span className="admin-eyebrow">مراجعة بلاغات المنصة</span><h2>إدارة البلاغات</h2><p>راجع البلاغات الواردة على الإعلانات أو حسابات المستخدمين.</p></div><span className="admin-section-icon violet"><Flag size={21} /></span></div><SearchBox value={query} onChange={setQuery} placeholder="ابحث بسبب البلاغ أو المبلّغ أو المحتوى" />
        <div className="admin-table-wrap"><div className="admin-table-caption"><strong>البلاغات الواردة</strong><span>{visibleReports.filter((report) => report.status === 'pending').length} بلاغ معلق · {visibleReports.length} إجمالي</span></div>{loading ? <Loading /> : visibleReports.length ? <table className="admin-table"><thead><tr><th>المبلّغ</th><th>العنصر المبلّغ عنه</th><th>سبب البلاغ</th><th>الحالة</th><th>تاريخ البلاغ</th><th>الإجراء</th></tr></thead><tbody>{visibleReports.map((report) => <tr key={report.id}><td><strong>{report.reporter_name}</strong><small className="table-subtitle">{report.reporter_email}</small></td><td><strong>{report.entity_type === 'ad' ? 'إعلان' : 'حساب مستخدم'} · #{report.entity_id}</strong><small className="table-subtitle">{report.target_label || 'العنصر حُذف أو لم يعد متاحًا'}</small></td><td><strong>{report.reason}</strong><small className="table-subtitle">{report.description || '—'}</small></td><td><StatusBadge status={report.status === 'handled' ? 'resolved' : report.status === 'dismissed' ? 'rejected' : 'pending'} /></td><td>{dateLabel(report.created_at)}</td><td>{report.status === 'pending' ? <div className="admin-row-actions"><button className="action-approve" title="تم التعامل مع البلاغ" aria-label="تم التعامل مع البلاغ" onClick={() => void mutate('report', 'PATCH', report.id, { status: 'handled' })}><Check size={15} /></button><button className="action-block" title="صرف النظر عن البلاغ" aria-label="صرف النظر عن البلاغ" onClick={() => void mutate('report', 'PATCH', report.id, { status: 'dismissed' })}><X size={15} /></button></div> : <span className="admin-muted-text">تمت المراجعة</span>}</td></tr>)}</tbody></table> : <EmptyState title="لا توجد بلاغات" detail="ستظهر البلاغات المرسلة من المستخدمين هنا." />}</div>
      </section>}
      {section === 'support' && <section className="admin-content"><div className="admin-section-intro"><div><span className="admin-eyebrow">خدمة المستخدمين</span><h2>تذاكر الدعم والرسائل</h2><p>استعرض طلبات الدعم ورد على المستخدمين مباشرة.</p></div><span className="admin-section-icon violet"><CircleHelp size={21} /></span></div><SearchBox value={query} onChange={setQuery} placeholder="ابحث بموضوع التذكرة أو اسم المستخدم" />
        <div className="admin-support-layout"><div className="admin-ticket-list">{loading ? <Loading /> : visibleTickets.length ? visibleTickets.map((ticket) => <button key={ticket.id} onClick={() => void openTicket(ticket)} className={`admin-ticket-item ${selectedTicket?.id === ticket.id ? 'selected' : ''}`}><span className="ticket-avatar">{ticket.user_name.slice(0, 1)}</span><span className="ticket-info"><span className="ticket-title-line"><strong>{ticket.subject}</strong>{ticket.priority === 'urgent' && <i>عاجل</i>}</span><small>{ticket.user_name} · {dateLabel(ticket.updated_at)}</small></span><StatusBadge status={ticket.status} /></button>) : <EmptyState title="لا توجد تذاكر" detail="ستظهر رسائل الدعم المرسلة من المستخدمين هنا." />}</div>
          <div className="admin-ticket-thread">{selectedTicket ? <><div className="thread-header"><div><span className="ticket-avatar">{selectedTicket.user_name.slice(0, 1)}</span><span><strong>{selectedTicket.subject}</strong><small>{selectedTicket.user_name} · {selectedTicket.user_email}</small></span></div><select aria-label="حالة التذكرة" value={selectedTicket.status} onChange={(event) => void mutate('ticket', 'PATCH', selectedTicket.id, { status: event.target.value })}><option value="open">مفتوحة</option><option value="in_progress">قيد المعالجة</option><option value="resolved">مغلقة</option></select></div><div className="thread-messages">{(selectedTicket.messages ?? []).map((message) => <div key={message.id} className={`thread-message ${message.sender_type !== 'user' ? 'staff-message' : ''}`}><div className="message-meta"><strong>{message.sender_name}</strong><time>{dateLabel(message.created_at)}</time></div><p>{message.content}</p></div>)}</div><form className="thread-reply" onSubmit={sendReply}><textarea value={reply} onChange={(event) => setReply(event.target.value)} maxLength={5000} rows={2} placeholder="اكتب ردًا للمستخدم..." required /><button className="admin-primary" disabled={busy || !reply.trim()}><Send size={16} /> إرسال الرد</button></form></> : <div className="thread-empty"><MessageCircle size={28} /><strong>اختر تذكرة لعرض المحادثة</strong><span>يمكنك قراءة الرسائل والرد عليها من هنا.</span></div>}</div>
        </div>
      </section>}
      {editor && <div className="admin-modal-overlay" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null); }}><form className="admin-modal" onSubmit={submitEditor}><div className="admin-modal-heading"><div><span className="admin-eyebrow">تحديث البيانات</span><h2>{editor.kind === 'ad' ? 'تعديل الإعلان' : 'تعديل بيانات المستخدم'}</h2></div><button type="button" onClick={() => setEditor(null)} aria-label="إغلاق"><X size={19} /></button></div>{editor.kind === 'ad' ? <><ModerationImages id={editor.id} token={token}/><label>العنوان<input required maxLength={120} value={editor.title ?? ''} onChange={(e) => setEditor({ ...editor, title: e.target.value })} /></label><label>التصنيف<input required maxLength={80} value={editor.category ?? ''} onChange={(e) => setEditor({ ...editor, category: e.target.value })} /></label><label>الوصف<textarea rows={4} maxLength={3000} value={editor.description ?? ''} onChange={(e) => setEditor({ ...editor, description: e.target.value })} /></label></> : <><label>الاسم<input required maxLength={100} value={editor.name ?? ''} onChange={(e) => setEditor({ ...editor, name: e.target.value })} /></label><label>البريد الإلكتروني<input type="email" required value={editor.email ?? ''} onChange={(e) => setEditor({ ...editor, email: e.target.value })} /></label><label>رقم الهاتف<input maxLength={30} value={editor.phone ?? ''} onChange={(e) => setEditor({ ...editor, phone: e.target.value })} /></label>{profile.role === 'super_admin' && <label>الدور الإداري<select value={editor.role ?? 'user'} onChange={(e) => setEditor({ ...editor, role: e.target.value as Role })}><option value="user">مستخدم</option><option value="support">دعم فني</option><option value="admin">مدير</option></select></label>}</>}<div className="admin-modal-actions"><button type="button" className="admin-secondary" onClick={() => setEditor(null)}>إلغاء</button><button className="admin-primary" disabled={busy}><Check size={16} /> حفظ التعديلات</button></div></form></div>}
      <footer className="admin-footer"><span>فرصة · لوحة إدارة آمنة</span><span><ShieldCheck size={14} /> تغييراتك تسجّل على الخادم</span></footer>
    </main>
  </div>;
}

function StatCard({ label, value, icon: Icon, tone, detail }: { label: string; value: number; icon: typeof Users; tone: string; detail: string }) {
  return <article className="admin-stat-card"><span className={`stat-icon ${tone}`}><Icon size={19} /></span><span className="stat-detail"><ArrowUpRight size={14} /> مباشر</span><p>{label}</p><strong>{value.toLocaleString('ar')}</strong><small>{detail}</small></article>;
}
function SearchBox({ value, onChange, placeholder }: { value: string; onChange: (value: string) => void; placeholder: string }) {
  return <label className="admin-search"><Search size={18} /><input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} />{value && <button type="button" onClick={() => onChange('')} aria-label="مسح البحث"><X size={15} /></button>}</label>;
}
function StatusBadge({ status }: { status: string }) {
  const tone = ['active', 'resolved'].includes(status) ? 'success' : ['pending', 'open', 'in_progress'].includes(status) ? 'warning' : 'muted';
  return <span className={`admin-status ${tone}`}><i />{statusLabel(status)}</span>;
}
function Loading() { return <div className="admin-loading"><LoaderCircle className="spin" size={22} /> جارٍ تحميل البيانات...</div>; }
function EmptyState({ title, detail }: { title: string; detail: string }) { return <div className="admin-empty"><FileText size={23} /><strong>{title}</strong><span>{detail}</span></div>; }
