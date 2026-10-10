// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { ApiError, apiRequest } from '../src/api';
vi.mock('../src/api', async (original) => ({ ...await original<typeof import('../src/api')>(), apiRequest: vi.fn() }));
vi.mock('../src/categories',async original=>{const module=await original<typeof import('../src/categories')>();return {...module,useCategories:()=>({categories:module.defaultCategories,categoryError:'',refreshCategories:vi.fn()})};});
const api = vi.mocked(apiRequest);
const user = { id: 1, name: 'Test User', email: 'test@example.test', phone: null, role: 'user' };
const ad = { id: 10, user_id: 1, title: 'My real listing', description: 'Details', category: 'الحراج الشعبي', status: 'pending', images: [] };
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();vi.clearAllMocks();
  vi.stubGlobal('scrollTo',vi.fn());
  vi.stubGlobal('matchMedia',()=>({matches:false,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  api.mockImplementation(async(resource,_options,params)=>{
    if(resource==='auth'&&params?.action==='me')return user;
    if(resource==='favorites')return [];
    if(resource==='market'&&params?.action==='detail')return ad;
    if(resource==='market')return {items:[],has_more:false};
    return {};
  });
});
afterEach(()=>{cleanup();vi.unstubAllGlobals();});
const mount=(path='/')=>render(<MemoryRouter initialEntries={[path]}><App/></MemoryRouter>);
it('shows empty real marketplace rather than sample listings',async()=>{
  mount('/search');expect(await screen.findByText('ما لقينا نتائج مطابقة')).toBeTruthy();
  expect(api).toHaveBeenCalledWith('market',expect.anything(),expect.objectContaining({action:'list'}));
});
it('guards member-only screens without fake data',async()=>{
  mount('/messages');expect(await screen.findByText('سجّل دخولك لعرض رسائلك')).toBeTruthy();
  expect(api.mock.calls.some(([r])=>r==='chat')).toBe(false);
});
it('submits actual registration and stores only the returned session',async()=>{
  api.mockImplementation(async(resource,_options,params)=>{
    if(resource==='auth'&&params?.action==='register')return {token:'test-server-token',user};
    if(resource==='auth')return user;
    if(resource==='favorites')return [];
    return {items:[],has_more:false};
  });
  mount('/account');const actions=userEvent.setup();
  await actions.click(screen.getByRole('button',{name:'تسجيل الدخول',exact:true}));
  await actions.click(screen.getByRole('button',{name:'إنشاء حساب',exact:true}));
  await actions.type(screen.getByLabelText('الاسم'),'Test User');await actions.type(screen.getByLabelText('البريد الإلكتروني'),'test@example.test');
  await actions.type(screen.getByLabelText(/كلمة المرور/),'Secure-test-password');
  await actions.click(screen.getByRole('button',{name:'إنشاء الحساب',exact:true}));
  await waitFor(()=>expect(sessionStorage.getItem('forsah-member-token')).toBe('test-server-token'));
  expect(localStorage.getItem('password')).toBeNull();
});
it('keeps ad form contents on server failure and never reports success',async()=>{
  sessionStorage.setItem('forsah-member-token','session');
  api.mockImplementation(async(resource,_options,params)=>{
    if(resource==='auth')return user;
    if(resource==='favorites')return [];
    if(params?.action==='create')throw new Error('Server unavailable');
    return {};
  });
  mount('/new');const actions=userEvent.setup();
  await actions.type(await screen.findByLabelText('العنوان'),'A real ad');
  await actions.type(screen.getByLabelText('الوصف وتفاصيل الخدمة والسعر'),'Details');
  await actions.click(screen.getByRole('button',{name:'حفظ للمراجعة'}));
  expect(await screen.findByRole('alert')).toHaveProperty('textContent',expect.stringContaining('Server unavailable'));
  expect(screen.getByLabelText('العنوان')).toHaveProperty('value','A real ad');
});
it('English setting updates actual interface language and direction',async()=>{
  mount('/settings');await userEvent.setup().selectOptions(screen.getByLabelText('اللغة'),'en');
  expect(screen.getByRole('heading',{name:'Settings'})).toBeTruthy();expect(document.documentElement.dir).toBe('ltr');
  expect(localStorage.getItem('forsah-language')).toBe('"en"');
});
it('renders real support replies for the signed-in account',async()=>{
  sessionStorage.setItem('forsah-member-token','session');
  api.mockImplementation(async(resource)=>{
    if(resource==='auth')return user;if(resource==='favorites')return [];
    return {id:2,subject:'My ticket',status:'in_progress',messages:[{id:1,sender_name:'Support',sender_type:'admin',content:'Actual support reply',created_at:'2026-10-09'}]};
  });
  mount('/ticket/2');expect(await screen.findByText('Actual support reply')).toBeTruthy();
});
it('restored service cards filter real marketplace listings',async()=>{
  mount();await screen.findByRole('heading',{name:'تصفّح الخدمات'});
  await userEvent.setup().click(screen.getByRole('button',{name:/الحراج الشعبي.*بيع وشراء/}));
  await waitFor(()=>expect(api).toHaveBeenCalledWith('market',expect.anything(),expect.objectContaining({action:'list',category:'الحراج الشعبي'})));
});

it('bell opens an in-page popover, toggles closed, and Escape restores focus',async()=>{
  const actions=userEvent.setup();mount();const bell=screen.getByRole('button',{name:'الإشعارات',exact:true});
  await actions.click(bell);expect(await screen.findByRole('dialog',{name:'الإشعارات'})).toBeTruthy();
  expect(screen.getByRole('heading',{name:'تصفّح الخدمات'})).toBeTruthy();
  await actions.keyboard('{Escape}');expect(screen.queryByRole('dialog')).toBeNull();expect(document.activeElement).toBe(bell);
  await actions.click(bell);await actions.click(bell);expect(screen.queryByRole('dialog')).toBeNull();
});
it('message icon switches popovers without navigating and outside click closes them',async()=>{
  const actions=userEvent.setup();mount();await actions.click(screen.getByRole('button',{name:'الإشعارات',exact:true}));
  await actions.click(screen.getByRole('button',{name:'الرسائل',exact:true}));
  expect(screen.queryByRole('dialog',{name:'الإشعارات'})).toBeNull();expect(screen.getByRole('dialog',{name:'رسائلك'})).toBeTruthy();
  await actions.click(screen.getByRole('heading',{name:'تصفّح الخدمات'}));expect(screen.queryByRole('dialog')).toBeNull();
});
it('create action opens the original-style modal on the home page',async()=>{
  sessionStorage.setItem('forsah-member-token','session');const actions=userEvent.setup();mount();
  await waitFor(()=>expect(api).toHaveBeenCalledWith('auth',expect.anything(),expect.objectContaining({action:'me'})));
  await actions.click(screen.getByRole('button',{name:'أضف إعلانك',exact:true}));
  expect(screen.getByRole('dialog',{name:'أضف إعلانك'})).toBeTruthy();expect(screen.getByRole('heading',{name:'تصفّح الخدمات'})).toBeTruthy();
  const input=await screen.findByLabelText('العنوان');await actions.type(input,'Typing stays focused');expect(document.activeElement).toBe(input);
  await actions.keyboard('{Escape}');expect(screen.queryByRole('dialog')).toBeNull();expect(document.body.style.overflow).toBe('');
});
it('member bell contents are built from actual account endpoints, not invented messages',async()=>{
  sessionStorage.setItem('forsah-member-token','session');
  api.mockImplementation(async(resource,_options,params)=>{
    if(resource==='auth')return user;if(resource==='favorites')return [];
    if(resource==='chat')return [{id:3,partner:'Real seller',last_message:'Actual message',title:'Actual ad'}];
    if(resource==='member-support')return [{id:5,subject:'Real ticket',status:'in_progress',updated_at:'2026-10-09'}];
    if(resource==='market'&&params?.action==='mine')return {items:[ad]};
    return {items:[],has_more:false};
  });
  mount();await waitFor(()=>expect(api).toHaveBeenCalledWith('favorites',expect.anything(),expect.anything()));
  await userEvent.setup().click(screen.getByRole('button',{name:'الإشعارات',exact:true}));
  expect(await screen.findByText('Actual message')).toBeTruthy();expect(await screen.findByText('Real ticket')).toBeTruthy();
  expect(screen.getByText('My real listing')).toBeTruthy();
});

it('restores a login after browser session storage is cleared',async()=>{
  localStorage.setItem('forsah-member-token','persistent-session');
  mount('/account');
  expect(await screen.findByText('تسجيل الخروج')).toBeTruthy();
  expect(api).toHaveBeenCalledWith('auth',expect.objectContaining({headers:expect.objectContaining({Authorization:'Bearer persistent-session'})}),expect.objectContaining({action:'me'}));
});
it('does not erase a saved session on temporary server/network failure',async()=>{
  localStorage.setItem('forsah-member-token','persistent-session');
  api.mockRejectedValue(new Error('offline'));mount('/account');
  await screen.findByText('offline');
  expect(localStorage.getItem('forsah-member-token')).toBe('persistent-session');
});
it('clears an expired session only on unauthorized response',async()=>{
  localStorage.setItem('forsah-member-token','expired-session');
  api.mockRejectedValue(new ApiError('expired',401));mount('/account');
  await waitFor(()=>expect(localStorage.getItem('forsah-member-token')).toBeNull());
});
it('loads only thumbnails in listing results',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue(new Response('image')));
  vi.stubGlobal('URL',class extends URL { static createObjectURL(){return 'blob:test';} static revokeObjectURL(){} });
  api.mockImplementation(async(resource)=>resource==='market'?{items:[{...ad,images:[11,12]}],has_more:false}:[]);
  mount('/search');await screen.findByText(ad.title);
  await waitFor(()=>expect(fetch).toHaveBeenCalled());
  expect(vi.mocked(fetch).mock.calls.every(([url])=>String(url).includes('size=thumb'))).toBe(true);
});
it('loads only the selected full photo and switches the detail carousel',async()=>{
  vi.stubGlobal('fetch',vi.fn().mockImplementation(async()=>new Response('image')));
  vi.stubGlobal('URL',class extends URL { static createObjectURL(){return 'blob:test';} static revokeObjectURL(){} });
  api.mockImplementation(async(resource,_options,params)=>{
    if(resource==='market'&&params?.action==='detail')return {...ad,images:[11,12,13,14]};
    return [];
  });
  mount('/ad/10');const actions=userEvent.setup();
  await screen.findByRole('button',{name:'الصورة التالية'});
  const originals=()=>vi.mocked(fetch).mock.calls.map(([url])=>new URL(String(url))).filter(url=>!url.searchParams.has('size')).map(url=>url.searchParams.get('id'));
  await waitFor(()=>expect(originals()).toEqual(['11']));
  await actions.click(screen.getByRole('button',{name:'الصورة التالية'}));
  await waitFor(()=>expect(originals()).toEqual(['11','12']));
  await actions.click(screen.getByRole('button',{name:'عرض الصورة 4'}));
  await waitFor(()=>expect(originals()).toEqual(['11','12','14']));
});

it('shows logout and administration outside collapsed profile settings',async()=>{
  sessionStorage.setItem('forsah-member-token','session');
  api.mockImplementation(async(resource)=>resource==='auth'?{...user,role:'super_admin'}:[]);
  mount('/account');
  const admin=await screen.findByRole('button',{name:'لوحة الإدارة'});
  const logout=screen.getByRole('button',{name:'تسجيل الخروج'});
  expect(admin.closest('details')).toBeNull();expect(logout.closest('details')).toBeNull();
  expect(admin.querySelector('svg')).not.toBeNull();
  await userEvent.setup().click(logout);
  await waitFor(()=>expect(localStorage.getItem('forsah-member-token')).toBeNull());
  expect(api.mock.calls.some(([r,o,p])=>r==='auth'&&o?.method==='POST'&&p?.action==='logout')).toBe(true);
});
