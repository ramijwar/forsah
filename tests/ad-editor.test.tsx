// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AdEditor from '../src/AdEditor';
import { defaultCategories } from '../src/categories';
import { apiRequest } from '../src/api';
vi.mock('../src/api',()=>({apiRequest:vi.fn()}));
vi.mock('../src/imageCompression',()=>({compressAdImage:vi.fn(async(file:File)=>file)}));
afterEach(()=>{cleanup();vi.clearAllMocks();vi.unstubAllGlobals();});
it('retries failed image uploads against the saved ad without duplicating successful photos',async()=>{
  vi.stubGlobal('URL',{createObjectURL:()=> 'blob:test',revokeObjectURL:vi.fn()});
  vi.mocked(apiRequest).mockResolvedValueOnce({}).mockRejectedValueOnce(new Error('network')).mockResolvedValueOnce({});
  const save=vi.fn().mockResolvedValue({id:22});const done=vi.fn();const actions=userEvent.setup();
  const {container}=render(<AdEditor categories={defaultCategories} token="test" t={ar=>ar} onSave={save} onComplete={done}/>);
  await actions.type(screen.getByLabelText('العنوان'),'Title');await actions.type(screen.getByLabelText('الوصف وتفاصيل الخدمة والسعر'),'Details');
  await actions.upload(container.querySelector('input[type=file]')!,[new File(['a'],'a.jpg',{type:'image/jpeg'}),new File(['b'],'b.jpg',{type:'image/jpeg'})]);
  await actions.click(screen.getByRole('button',{name:'حفظ للمراجعة'}));
  await screen.findByRole('alert');expect(save.mock.calls[0][1]).toBeUndefined();expect(done).not.toHaveBeenCalled();
  expect(container.querySelectorAll('.draft-photo-grid img').length).toBe(1);
  await actions.click(screen.getByRole('button',{name:'حفظ للمراجعة'}));
  await waitFor(()=>expect(done).toHaveBeenCalledWith(22));expect(save.mock.calls[1][1]).toBe(22);
  expect(apiRequest).toHaveBeenCalledTimes(3);
});
