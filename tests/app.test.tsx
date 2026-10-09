// @vitest-environment jsdom
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import App from '../src/App';
import { apiRequest } from '../src/api';
vi.mock('../src/api', () => ({ apiRequest: vi.fn(), apiUrl: () => 'https://t3lam.site/forsah/api.php' }));
const api = vi.mocked(apiRequest);
const user = { id: 1, name: 'Test User', email: 'test@example.test', phone: null, role: 'user' };
const ad = { id: 10, user_id: 1, title: 'My real listing', description: 'Details', category: 'الحراج الشعبي', status: 'pending', images: [] };
beforeEach(()=>{
  localStorage.clear();sessionStorage.clear();vi.clearAllMocks();
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
  mount();expect(await screen.findByText('لا توجد إعلانات مطابقة. لن نعرض بيانات وهمية.')).toBeTruthy();
  expect(api).toHaveBeenCalledWith('market',expect.anything(),expect.objectContaining({action:'list'}));
});
it('guards member-only screens without fake data',async()=>{
  mount('/messages');expect(await screen.findByText('سجّل دخولك أولًا')).toBeTruthy();
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
  await userEvent.setup().click(screen.getByRole('button',{name:/الحراج الشعبي.*تصفح الإعلانات/}));
  await waitFor(()=>expect(api).toHaveBeenCalledWith('market',expect.anything(),expect.objectContaining({action:'list',category:'الحراج الشعبي'})));
});
