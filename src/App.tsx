import { API_BASE, apiRequest } from './api';
import { App as NativeApp } from '@capacitor/app';
import { Capacitor } from '@capacitor/core';
import { useEffect, useMemo, useState } from 'react';
import type { FormEvent } from 'react';
import type { LucideIcon } from 'lucide-react';
import { useLocation, useNavigate } from 'react-router-dom';
import AdminDashboard from './AdminDashboard';
import {
  Armchair,
  ArrowLeft,
  BadgeCheck,
  Bell,
  Check,
  ChevronLeft,
  CircleHelp,
  Clock3,
  Gavel,
  Globe2,
  Heart,
  Home,
  LockKeyhole,
  MessageCircle,
  Monitor,
  Moon,
  PackageCheck,
  Plus,
  Search,
  Send,
  Settings as SettingsIcon,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Tag,
  Trash2,
  Truck,
  UserRound,
  UsersRound,
  Wrench,
  Zap,
} from 'lucide-react';

type Tab = 'home' | 'messages' | 'ads' | 'search' | 'account' | 'settings';
type ThemeMode = 'light' | 'dark' | 'system';
type Category = {
  id: string;
  title: string;
  description: string;
  icon: LucideIcon;
  color: string;
  tint: string;
  subcategories: string[];
};

const categories: Category[] = [
  { id: 'haraj', title: 'الحراج الشعبي', description: 'بيع وشراء.. ولقطة اليوم تنتظرك', icon: Gavel, color: '#9a5b31', tint: '#f7eadf', subcategories: ['تصفح الحراج', 'مزادات'] },
  { id: 'workers', title: 'سوق العمالة', description: 'أيدٍ خبيرة لخدماتك اليومية', icon: UsersRound, color: '#3d7290', tint: '#e6f1f5', subcategories: ['تصفح العمال', 'انشر إعلانك'] },
  { id: 'transport', title: 'المواصلات والنقل الداخلي', description: 'مشاوير ونقل بين أحياء مدينتك', icon: Truck, color: '#98702d', tint: '#f6f0de', subcategories: ['تصفح الرحلات', 'انشر رحلتك'] },
  { id: 'emergency', title: 'طوارئ السيارات', description: 'مساعدة على الطريق وقت الحاجة', icon: Zap, color: '#ca6246', tint: '#fbe9e4', subcategories: ['سطحة إنقاذ', 'بنشر متنقل'] },
  { id: 'furniture', title: 'المفروشات والموبيليا', description: 'لمسات جديدة لبيتك ومساحتك', icon: Armchair, color: '#90617e', tint: '#f3eaf1', subcategories: ['غرف نوم', 'مجالس'] },
  { id: 'logistics', title: 'الخدمات اللوجستية', description: 'توصيل سريع.. من الباب للباب', icon: PackageCheck, color: '#3b826a', tint: '#e5f2ec', subcategories: ['توصيل طرد', 'توصيل طعام'] },
  { id: 'maintenance', title: 'خدمات الصيانة المنزلية', description: 'فنيون موثوقون لراحة بالك', icon: Wrench, color: '#526fa0', tint: '#e9edf7', subcategories: ['سباكة', 'كهرباء', 'تكييف'] },
];

const navItems: { id: Tab; label: string; icon: LucideIcon }[] = [
  { id: 'home', label: 'الرئيسية', icon: Home },
  { id: 'messages', label: 'رسائلي', icon: MessageCircle },
  { id: 'ads', label: 'إعلاناتي', icon: Tag },
  { id: 'search', label: 'البحث', icon: Search },
  { id: 'account', label: 'حسابي', icon: UserRound },
];

const defaultPrefs = {
  theme: 'system' as ThemeMode,
  autoDark: true,
  style: 'modern' as 'classic' | 'modern',
  language: 'العربية',
  orderNotifications: true,
  chatNotifications: true,
  offersNotifications: false,
  biometric: false,
};

type Prefs = typeof defaultPrefs;

function readPrefs(): Prefs {
  try {
    const saved = localStorage.getItem('forsah-preferences');
    return saved ? { ...defaultPrefs, ...JSON.parse(saved) } : defaultPrefs;
  } catch {
    return defaultPrefs;
  }
}

function Switch({ checked, onChange, label, disabled = false }: { checked: boolean; onChange: () => void; label: string; disabled?: boolean }) {
  return (
    <button type="button" role="switch" disabled={disabled} aria-checked={checked} aria-label={label} onClick={onChange} className={`switch ${checked ? 'switch-on' : ''}`}>
      <span />
    </button>
  );
}

function App() {
  const [tab, setTab] = useState<Tab>('home');
  const location = useLocation();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(readPrefs);
  const [query, setQuery] = useState('');
  const [noticeOpen, setNoticeOpen] = useState(false);
  const [messageOpen, setMessageOpen] = useState(false);
  const [adOpen, setAdOpen] = useState(false);
  const [toast, setToast] = useState('');
  const [apiServices, setApiServices] = useState<string[]>([]);
  const [adTitle, setAdTitle] = useState('');
  const [adDescription, setAdDescription] = useState('');
  const [adCategory, setAdCategory] = useState(categories[0].title);
  const [supportName, setSupportName] = useState('');
  const [supportEmail, setSupportEmail] = useState('');
  const [supportSubject, setSupportSubject] = useState('');
  const [supportMessage, setSupportMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [apiError, setApiError] = useState('');

  const apiBase = API_BASE;
  const dark = prefs.theme === 'dark' || (prefs.theme === 'system' && typeof window !== 'undefined' && window.matchMedia('(prefers-color-scheme: dark)').matches);

  useEffect(() => {
    localStorage.setItem('forsah-preferences', JSON.stringify(prefs));
  }, [prefs]);

  useEffect(() => {
    const route = location.pathname.replace(/^\/+/, '') as Tab;
    const validTabs: Tab[] = ['home', 'messages', 'ads', 'search', 'account', 'settings'];
    setTab(validTabs.includes(route) ? route : 'home');
  }, [location.pathname]);

  useEffect(() => {
    if (!apiBase) return;
    const controller = new AbortController();
    apiRequest<Array<{ name: string }>>('services', { signal: controller.signal })
      .then((data) => { setApiServices(data.map((item) => item.name)); setApiError(''); })
      .catch(() => { if (!controller.signal.aborted) setApiError('تعذر الاتصال بالخادم؛ التصنيفات المعروضة محلية وليست إعلانات متاحة.'); });
    return () => controller.abort();
  }, [apiBase]);

  useEffect(() => {
    if (prefs.theme !== 'system') return;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const update = () => setPrefs((current) => ({ ...current }));
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [prefs.theme]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const searchable = useMemo(() => categories.flatMap((category) => category.subcategories.map((name) => ({ name, category: category.title, icon: category.icon, tint: category.tint, color: category.color }))), []);
  const filtered = searchable.filter((item) => `${item.name} ${item.category}`.includes(query.trim()));

  const updatePref = <K extends keyof Prefs>(key: K, value: Prefs[K]) => setPrefs((current) => ({ ...current, [key]: value }));
  const changeTab = (next: Tab) => { setTab(next); navigate(next === 'home' ? '/' : `/${next}`); };
  const openSearch = (value = '') => { setQuery(value); changeTab('search'); };
  const goSettings = () => { setNoticeOpen(false); setMessageOpen(false); changeTab('settings'); };
  const clearCache = async () => {
    try {
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.filter((key) => key.startsWith('forsah-')).map((key) => caches.delete(key)));
      }
      setToast('تم مسح ملفات التخزين المؤقت للتطبيق دون حذف الجلسات');
    } catch { setToast('تعذر مسح التخزين المؤقت'); }
  };

  const submitSupportTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiRequest('support', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: supportName, email: supportEmail, subject: supportSubject, message: supportMessage }),
      }, { action: 'tickets' });
      setToast('تم إرسال رسالتك لفريق الدعم بنجاح'); setSupportSubject(''); setSupportMessage('');
    } catch (error) { setToast(error instanceof Error ? error.message : 'تعذر الاتصال بالخدمة'); }
    finally { setSubmitting(false); }
  };

  const submitAd = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submitting) return;
    setSubmitting(true);
    try {
      await apiRequest('ads', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: adTitle, description: adDescription, category: adCategory }),
      });
      setToast('تم إرسال إعلانك للمراجعة؛ سيُنشر بعد اعتماد الإدارة');
      setAdOpen(false); setAdTitle(''); setAdDescription('');
    } catch (error) { setToast(error instanceof Error ? error.message : 'تعذر الاتصال بالخدمة'); }
    finally { setSubmitting(false); }
  };

  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    const listener = NativeApp.addListener('backButton', () => {
      if (adOpen) setAdOpen(false);
      else if (noticeOpen || messageOpen) { setNoticeOpen(false); setMessageOpen(false); }
      else if (location.pathname !== '/') navigate('/');
      else void NativeApp.exitApp();
    });
    return () => { void listener.then((handle) => handle.remove()); };
  }, [adOpen, noticeOpen, messageOpen, location.pathname, navigate]);

  const categoryCount = apiServices.length || categories.length;
  const Header = ({ title = 'فرصة' }: { title?: string }) => (
    <header className="flex items-center justify-between pt-6 pb-5 md:pt-8">
      <button className="flex items-center gap-3 text-right" onClick={() => { changeTab('home'); setNoticeOpen(false); setMessageOpen(false); }} aria-label="العودة إلى الرئيسية">
        <span className="brand-mark"><Sparkles size={20} strokeWidth={2.3} /></span>
        <span>
          <span className="block text-[22px] font-bold leading-none tracking-tight text-[#174c3c] dark-text">{title}</span>
          <span className="mt-1 block text-[11px] font-medium text-[#86918a]">كل شيء يبدأ بفرصة</span>
        </span>
      </button>
      <div className="flex items-center gap-2">
        <button onClick={() => { setNoticeOpen((open) => !open); setMessageOpen(false); }} className={`icon-button relative ${noticeOpen ? 'icon-button-active' : ''}`} aria-label="الإشعارات">
          <Bell size={19} /> 
        </button>
        <button onClick={() => { setMessageOpen((open) => !open); setNoticeOpen(false); }} className={`icon-button ${messageOpen ? 'icon-button-active' : ''}`} aria-label="الرسائل"><MessageCircle size={19} /></button>
        <button onClick={goSettings} className="icon-button" aria-label="الإعدادات"><SettingsIcon size={19} /></button>
      </div>
    </header>
  );

  const HeaderPopover = () => {
    if (!noticeOpen && !messageOpen) return null;
    return (
      <div className="popover-card soft-shadow">
        <div className="flex items-center justify-between">
          <strong>{noticeOpen ? 'الإشعارات' : 'رسائلك'}</strong>
          <button className="text-xs font-semibold text-[#59806a]" onClick={() => { setNoticeOpen(false); setMessageOpen(false); }}>إغلاق</button>
        </div>
        {noticeOpen ? (
          <div className="mt-4 flex gap-3"><span className="mini-icon bg-[#eef5e7] text-[#5d8050]"><Sparkles size={16} /></span><div><p className="text-sm font-semibold">أهلاً بك في فرصة!</p><p className="mt-1 text-xs text-[#89928d]">فعّل إشعاراتك لتصلك أحدث الفرص.</p></div></div>
        ) : (
          <button onClick={() => { setMessageOpen(false); changeTab('messages'); }} className="mt-4 flex w-full gap-3 text-right"><span className="avatar avatar-small">م</span><div className="flex-1"><p className="text-sm font-semibold">فريق فرصة</p><p className="mt-1 text-xs text-[#89928d]">مرحباً بك! كيف نقدر نخدمك؟</p></div><span className="text-[10px] text-[#a0a8a2]">الآن</span></button>
        )}
        <button onClick={goSettings} className="mt-4 flex w-full items-center justify-between border-t border-[#eef0eb] pt-3 text-xs font-semibold text-[#52705f]">إدارة التفضيلات <ChevronLeft size={15} /></button>
      </div>
    );
  };

  const HomePage = () => (
    <>
      <div className="hero-panel relative mt-1 overflow-hidden rounded-[28px] px-6 py-7 md:px-10 md:py-9">
        <div className="hero-orb hero-orb-one" /><div className="hero-orb hero-orb-two" />
        <div className="relative z-10 max-w-[560px]">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-semibold text-[#dff2bd]"><Sparkles size={13} /> منصتك المحلية لكل احتياج</div>
          <h1 className="max-w-[420px] text-[28px] font-bold leading-[1.35] tracking-tight text-white md:text-[34px]">خلّها فرصة.. <span className="text-[#c8ef7a]">لشيء أحلى</span></h1>
          <p className="mt-2 max-w-[380px] text-[13px] leading-6 text-white/70 md:text-sm">اكتشف خدمات قريبة منك، أو اعرض خدمتك ووصل للي يبحث عنها.</p>
          <div className="mt-5 flex flex-wrap items-center gap-3">
            <button onClick={() => setAdOpen(true)} className="primary-light-button"><Plus size={17} /> أضف إعلانك</button>
            <button onClick={() => openSearch()} className="hero-link">اكتشف الخدمات <ArrowLeft size={15} /></button>
          </div>
        </div>
        <div className="hero-illustration" aria-hidden="true"><span className="hero-sun" /><span className="hero-card"><Sparkles size={25} /><span>فرصتك<br />قريبة</span></span><span className="hero-plant" /></div>
      </div>

      <section className="mt-8 md:mt-10">
        <div className="mb-4 flex items-end justify-between">
          <div><p className="eyebrow">اختَر ما يناسبك</p><h2 className="mt-1 text-[21px] font-bold tracking-tight">تصفّح الخدمات</h2></div>
          <button onClick={() => openSearch()} className="text-xs font-bold text-[#47705c]">عرض الكل <ArrowLeft className="mr-1 inline" size={14} /></button>
        </div>
        <div className="category-grid">
          {categories.map((category, index) => {
            const Icon = category.icon;
            return (
              <article key={category.id} className="category-card group" style={{ animationDelay: `${index * 45}ms` }}>
                <button className="flex w-full items-start gap-3 text-right" onClick={() => openSearch(category.title)}>
                  <span className="category-icon" style={{ backgroundColor: category.tint, color: category.color }}><Icon size={21} strokeWidth={1.8} /></span>
                  <span className="min-w-0 flex-1 pt-0.5"><span className="block text-[14px] font-bold leading-5">{category.title}</span><span className="mt-1 block text-[11px] leading-[1.65] text-[#8a948d]">{category.description}</span></span>
                  <ChevronLeft className="mt-1 shrink-0 text-[#b5bcb6] transition-transform group-hover:-translate-x-1" size={16} />
                </button>
                <div className="mt-4 flex flex-wrap gap-2">
                  {category.subcategories.map((sub) => <button key={sub} onClick={() => openSearch(sub)} className="subcategory-chip">{sub}</button>)}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section className="mt-8 grid gap-3 pb-2 sm:grid-cols-2">
        <button onClick={() => openSearch('')} className="quick-card"><span className="quick-icon"><Search size={19} /></span><span className="text-right"><strong className="block text-sm">تدور على شيء؟</strong><span className="mt-1 block text-xs text-[#8d9790]">ابحث بين الفرص القريبة</span></span><ArrowLeft className="mr-auto text-[#9aa59d]" size={17} /></button>
        <button onClick={() => setAdOpen(true)} className="quick-card"><span className="quick-icon quick-icon-lime"><Plus size={20} /></span><span className="text-right"><strong className="block text-sm">عندك خدمة؟</strong><span className="mt-1 block text-xs text-[#8d9790]">خلّ الناس يلاقونك بسهولة</span></span><ArrowLeft className="mr-auto text-[#9aa59d]" size={17} /></button>
      </section>
      {apiServices.length > 0 && <p className="pb-3 text-center text-[10px] text-[#9aa59d]">متصل بالخدمة · {categoryCount} خدمة</p>}
    </>
  );

  const SettingsPage = () => (
    <>
      <div className="mb-6 mt-5"><p className="eyebrow">خصّص تجربتك</p><h1 className="mt-1 text-[26px] font-bold">الإعدادات</h1><p className="mt-1 text-sm text-[#849088]">خلّ فرصة على مزاجك.</p></div>
      <div className="settings-stack">
        <section className="settings-card">
          <div className="settings-heading"><span className="settings-icon" style={{ background: '#edf3e6', color: '#567445' }}><Sun size={18} /></span><div><h2>المظهر</h2><p>اختَر الشكل اللي يريحك</p></div></div>
          <div className="setting-row"><div><strong>الوضع الداكن التلقائي</strong><span>يتبع تفضيلات جهازك عند تفعيل وضع النظام</span></div><Switch checked={prefs.autoDark} label="الوضع الداكن التلقائي" onChange={() => { const enabled = !prefs.autoDark; updatePref('autoDark', enabled); if (enabled) updatePref('theme', 'system'); else if (prefs.theme === 'system') updatePref('theme', 'light'); }} /></div>
          <div className="theme-options" role="group" aria-label="اختيار المظهر">
            {([{ id: 'light', label: 'فاتح', icon: Sun }, { id: 'dark', label: 'داكن', icon: Moon }, { id: 'system', label: 'حسب النظام', icon: Monitor }] as const).map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { updatePref('theme', item.id); updatePref('autoDark', item.id === 'system'); }} className={`theme-option ${prefs.theme === item.id ? 'theme-option-selected' : ''}`}><Icon size={16} />{item.label}{prefs.theme === item.id && <Check className="mr-auto" size={14} />}</button>; })}
          </div>
          <div className="setting-row"><div><strong>نمط الواجهة</strong><span>اختر طابع الواجهة</span></div><div className="segmented"><button className={prefs.style === 'classic' ? 'selected' : ''} onClick={() => updatePref('style', 'classic')}>كلاسيك</button><button className={prefs.style === 'modern' ? 'selected' : ''} onClick={() => updatePref('style', 'modern')}>عصري</button></div></div>
          <div className="setting-row last-row"><div><strong>اللغة</strong><span>لغة عرض التطبيق</span></div><label className="select-wrap"><Globe2 size={15} /><select value={prefs.language} onChange={(event) => { updatePref('language', event.target.value); if (event.target.value !== 'العربية') setToast('ستتوفر اللغة المحددة قريباً'); }} aria-label="اللغة"><option>العربية</option><option disabled>English — غير متاحة</option></select><ChevronLeft size={14} /></label></div>
        </section>

        <section className="settings-card">
          <div className="settings-heading"><span className="settings-icon" style={{ background: '#fff1e7', color: '#bd7541' }}><Bell size={18} /></span><div><h2>الإشعارات</h2><p>غير متاحة في هذا الإصدار — لا توجد خدمة إشعارات دفع</p></div></div>
          <div className="setting-row"><div><strong>إشعارات الطلبات</strong><span>تحديثات طلباتك وخدماتك</span></div><Switch disabled checked={false} label="إشعارات الطلبات" onChange={() => updatePref('orderNotifications', !prefs.orderNotifications)} /></div>
          <div className="setting-row"><div><strong>رسائل المحادثة</strong><span>رسالة جديدة؟ نعلمك فوراً</span></div><Switch disabled checked={false} label="رسائل المحادثة" onChange={() => updatePref('chatNotifications', !prefs.chatNotifications)} /></div>
          <div className="setting-row last-row"><div><strong>العروض والفرص</strong><span>عروض مختارة تناسب اهتماماتك</span></div><Switch disabled checked={false} label="العروض والفرص" onChange={() => updatePref('offersNotifications', !prefs.offersNotifications)} /></div>
        </section>

        <section className="settings-card">
          <div className="settings-heading"><span className="settings-icon" style={{ background: '#e9eff7', color: '#53739a' }}><ShieldCheck size={18} /></span><div><h2>الخصوصية والأمان</h2><p>بياناتك وخصوصيتك أولاً</p></div></div>
          <div className="setting-row"><div><strong>الدخول البيومتري</strong><span>غير متاح في هذا الإصدار</span></div><Switch disabled checked={false} label="الدخول البيومتري" onChange={() => { updatePref('biometric', !prefs.biometric); setToast(!prefs.biometric ? 'تم تفعيل خيار الدخول البيومتري' : 'تم إيقاف خيار الدخول البيومتري'); }} /></div>
          <button className="setting-row cache-row last-row" onClick={clearCache}><div><strong>مسح الذاكرة المؤقتة</strong><span>لا يشمل الجلسات أو التفضيلات</span></div><span className="cache-button"><Trash2 size={16} /> مسح</span></button>
        </section>

        <section className="support-card"><div className="flex items-center gap-3"><span className="settings-icon" style={{ background: 'rgba(255,255,255,.12)', color: '#c8ef7a' }}><CircleHelp size={18} /></span><div><h2 className="font-bold">تحتاج مساعدة؟</h2><p className="mt-1 text-xs text-white/60">فريق فرصة قريب منك دائماً</p></div></div><button onClick={() => changeTab('messages')} className="support-arrow" aria-label="الدعم"><ArrowLeft size={18} /></button></section>
      </div>
      <p className="copyright">فرصة <span>·</span> تم التطوير بواسطة <strong>Engineer Abdulrazzak Saleh Al-Ja'ili</strong></p>
    </>
  );

  const SearchPage = () => (
    <>
      <div className="mb-5 mt-5"><p className="eyebrow">اكتشف القريب منك</p><h1 className="mt-1 text-[26px] font-bold">البحث</h1></div>
      <label className="search-field"><Search size={19} /><input autoFocus value={query} onChange={(event) => setQuery(event.target.value)} placeholder="وش تدور عليه؟" /><button type="button" onClick={() => setToast('خيارات تصفية البحث قريباً')} aria-label="تصفية البحث"><SlidersHorizontal size={18} /></button></label>
      <div className="mt-5 flex gap-2 overflow-x-auto pb-2 no-scrollbar">{['الكل', ...categories.map((item) => item.title)].map((label) => <button key={label} onClick={() => setQuery(label === 'الكل' ? '' : label)} className={`filter-chip ${query === label || (label === 'الكل' && !query) ? 'filter-chip-active' : ''}`}>{label}</button>)}</div>
      <div className="mt-5 flex items-center justify-between"><h2 className="font-bold">{query ? 'نتائج البحث' : 'خدمات قد تهمك'}</h2><span className="text-xs text-[#8c968e]">{filtered.length} خدمة</span></div>
      {filtered.length ? <div className="mt-3 grid gap-3 sm:grid-cols-2">{filtered.map((item) => { const Icon = item.icon; return <button className="result-card" key={`${item.category}-${item.name}`} onClick={() => setToast(`تم اختيار «${item.name}»`)}><span className="category-icon" style={{ backgroundColor: item.tint, color: item.color }}><Icon size={20} /></span><span className="flex-1 text-right"><strong className="block text-sm">{item.name}</strong><span className="mt-1 block text-xs text-[#8c968e]">ضمن {item.category}</span></span><ChevronLeft size={16} className="text-[#aab2ac]" /></button>; })}</div> : <div className="empty-state"><Search size={24} /><strong>ما لقينا نتائج مطابقة</strong><span>جرّب كلمات ثانية أو تصفّح كل الخدمات.</span><button onClick={() => setQuery('')} className="text-sm font-bold text-[#47705c]">عرض كل الخدمات</button></div>}
    </>
  );

  const MessagesPage = () => (
    <>
      <div className="mb-5 mt-5"><p className="eyebrow">تواصل بسهولة</p><h1 className="mt-1 text-[26px] font-bold">رسائلي</h1></div>
      <p className="tip-card">هذه الصفحة لإرسال تذاكر الدعم فقط. المحادثات الفورية ومتابعة الردود من التطبيق غير متاحة حاليًا.</p>
      <form className="support-contact-card" onSubmit={submitSupportTicket}><div><p className="eyebrow">نحن هنا لمساعدتك</p><h2 className="mt-1 text-base font-bold">أرسل رسالة لفريق الدعم</h2><p className="mt-1 text-xs text-[#849088]">ستصل رسالتك مباشرة إلى فريق فرصة.</p></div><label className="form-label">الاسم<input required maxLength={100} value={supportName} onChange={(event) => setSupportName(event.target.value)} /></label><label className="form-label">البريد الإلكتروني<input type="email" required maxLength={190} value={supportEmail} onChange={(event) => setSupportEmail(event.target.value)} /></label><label className="form-label">موضوع الرسالة<input required maxLength={160} value={supportSubject} onChange={(event) => setSupportSubject(event.target.value)} /></label><label className="form-label">تفاصيل الرسالة<textarea required maxLength={5000} rows={4} value={supportMessage} onChange={(event) => setSupportMessage(event.target.value)} /></label><button className="primary-button w-full" type="submit" disabled={submitting}><Send size={16} /> إرسال إلى الدعم</button></form>
    </>
  );

  const AdsPage = () => (
    <>
      <div className="mb-5 mt-5 flex items-end justify-between"><div><p className="eyebrow">كل ما نشرته</p><h1 className="mt-1 text-[26px] font-bold">إعلاناتي</h1></div><button className="small-primary" onClick={() => setAdOpen(true)}><Plus size={16} /> إعلان جديد</button></div>
      <div className="empty-state ads-empty"><span className="empty-illustration"><Tag size={25} /></span><strong>إرسال إعلان للمراجعة</strong><span>لا تتوفر متابعة إعلانات المستخدم في هذا الإصدار.</span><button className="primary-button mt-2" onClick={() => setAdOpen(true)}><Plus size={17} /> أضف أول إعلان</button></div>
      <div className="tip-card mt-4"><Sparkles size={17} /><span><strong>نصيحة لظهور أفضل</strong><br />أضف وصفًا واضحًا؛ رفع الصور غير متاح حاليًا.</span></div>
    </>
  );

  const AccountPage = () => (
    <>
      <div className="mb-5 mt-5"><p className="eyebrow">مساحتك في فرصة</p><h1 className="mt-1 text-[26px] font-bold">حسابي</h1></div>
      <div className="profile-card"><span className="profile-avatar"><UserRound size={27} /></span><div className="flex-1"><h2 className="font-bold">مرحباً بك</h2><p className="mt-1 text-xs text-[#78867d]">يمكنك إرسال إعلان للمراجعة أو رسالة دعم دون حساب</p></div><BadgeCheck className="text-[#a3b29f]" size={20} /></div>
      <button disabled className="primary-button mt-4 w-full">دخول المستخدم غير متاح حاليًا <ArrowLeft size={16} /></button>
      <div className="mt-5 overflow-hidden rounded-2xl border border-[#e9ede7] bg-white">
        {[{ icon: Heart, label: 'المفضلة' }, { icon: Clock3, label: 'عمليات البحث الأخيرة' }, { icon: LockKeyhole, label: 'الخصوصية والأمان' }, { icon: SettingsIcon, label: 'الإعدادات' }].map(({ icon: Icon, label }, index) => <button key={label} onClick={() => label === 'الإعدادات' || label === 'الخصوصية والأمان' ? changeTab('settings') : setToast(`${label} — لا توجد عناصر بعد`)} className={`account-row ${index === 3 ? 'last-row' : ''}`}><Icon size={18} /><span>{label}</span><ChevronLeft className="mr-auto" size={16} /></button>)}
      </div>
      <p className="copyright">فرصة <span>·</span> تم التطوير بواسطة <strong>Engineer Abdulrazzak Saleh Al-Ja'ili</strong></p>
    </>
  );

  if (location.pathname === '/admin' || location.pathname.startsWith('/admin/')) return <AdminDashboard />;

  return (
    <div className={`app-shell ${dark ? 'dark-theme' : ''} ${prefs.style === 'classic' ? 'classic-style' : ''}`}>
      <div className="page-wrap">
        {Header({ title: 'فرصة' })}
        {HeaderPopover()}
        <main className="main-content">
          {apiError && <p role="alert" className="tip-card">{apiError}</p>}
          {tab === 'home' && HomePage()}
          {tab === 'settings' && SettingsPage()}
          {tab === 'search' && SearchPage()}
          {tab === 'messages' && MessagesPage()}
          {tab === 'ads' && AdsPage()}
          {tab === 'account' && AccountPage()}
        </main>
      </div>

      <nav className="bottom-nav" aria-label="التنقل الرئيسي">
        {navItems.map(({ id, label, icon: Icon }) => <button key={id} onClick={() => { changeTab(id); setNoticeOpen(false); setMessageOpen(false); }} className={`nav-item ${tab === id ? 'nav-item-active' : ''}`} aria-current={tab === id ? 'page' : undefined}><span className="nav-icon-wrap"><Icon size={20} strokeWidth={tab === id ? 2.3 : 1.8} /></span><span>{label}</span></button>)}
      </nav>

      {adOpen && <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) setAdOpen(false); }}><form className="ad-modal" onSubmit={submitAd}><div className="flex items-start justify-between"><div><p className="eyebrow">وصل خدمتك للي يحتاجها</p><h2 className="mt-1 text-xl font-bold">أضف إعلانك</h2></div><button type="button" className="icon-button" onClick={() => setAdOpen(false)} aria-label="إغلاق">×</button></div><label className="form-label">عنوان الإعلان<input required maxLength={80} value={adTitle} onChange={(event) => setAdTitle(event.target.value)} placeholder="مثال: فني تكييف بخبرة" /></label><label className="form-label">التصنيف<select value={adCategory} onChange={(event) => setAdCategory(event.target.value)}>{categories.map((category) => <option key={category.id}>{category.title}</option>)}</select></label><label className="form-label">وصف مختصر<textarea required rows={3} maxLength={500} value={adDescription} onChange={(event) => setAdDescription(event.target.value)} placeholder="اكتب تفاصيل خدمتك أو إعلانك..." /></label><div className="flex gap-2"><button type="submit" disabled={submitting} className="primary-button flex-1"><Send size={16} /> نشر الإعلان</button><button type="button" onClick={() => setAdOpen(false)} className="secondary-button">إلغاء</button></div>{!apiBase && <p className="text-center text-[10px] text-[#929b94]">واجهة تجريبية — اربط الـ API لتفعيل النشر.</p>}</form></div>}
      {toast && <div role="status" className="toast-message"><Check size={17} />{toast}</div>}
    </div>
  );
}

export default App;
