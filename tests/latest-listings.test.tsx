// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LatestListings from '../src/LatestListings';
import { apiRequest } from '../src/api';
vi.mock('../src/api',async original=>({...await original<typeof import('../src/api')>(),apiRequest:vi.fn()}));
const api=vi.mocked(apiRequest);
beforeEach(()=>vi.clearAllMocks());
afterEach(cleanup);
it('caps latest cards at ten, uses thumbnails and opens the selected real id',async()=>{
  api.mockResolvedValue({items:Array.from({length:12},(_,i)=>({id:20-i,title:`Listing ${i}`,category:'Market',images:[50+i]}))});
  const open=vi.fn();const {container}=render(<LatestListings t={ar=>ar} open={open} browse={vi.fn()}/>);
  await screen.findByText('Listing 0');expect(container.querySelectorAll('.latest-card')).toHaveLength(10);
  for(const image of container.querySelectorAll('img'))expect(new URL(image.src).searchParams.get('size')).toBe('thumb');
  await userEvent.setup().click(screen.getByRole('button',{name:/Listing 0/}));expect(open).toHaveBeenCalledWith(20);
  expect(api).toHaveBeenCalledWith('market',expect.objectContaining({signal:expect.any(AbortSignal)}),{action:'latest'});
});
it('shows a truthful empty state rather than sample ads',async()=>{
  api.mockResolvedValue({items:[]});render(<LatestListings t={ar=>ar} open={vi.fn()} browse={vi.fn()}/>);
  expect(await screen.findByText('لا توجد إعلانات منشورة بعد.')).toBeTruthy();
});
it('offers retry on network failure and recovers',async()=>{
  api.mockRejectedValueOnce(new Error('offline')).mockResolvedValue({items:[]});render(<LatestListings t={ar=>ar} open={vi.fn()} browse={vi.fn()}/>);
  await screen.findByRole('alert');await userEvent.setup().click(screen.getByRole('button',{name:'إعادة المحاولة'}));
  await waitFor(()=>expect(screen.queryByRole('alert')).toBeNull());expect(api).toHaveBeenCalledTimes(2);
});
