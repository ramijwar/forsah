// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import Overlay from '../src/Overlay';
afterEach(cleanup);
it('provides one administrative close action, prevents closing during save, and releases scroll lock',async()=>{
  const close=vi.fn();const actions=userEvent.setup();const {rerender,unmount}=render(<Overlay label="إضافة قسم" chrome={{icon:<span/>,subtitle:'Details'}} close={close} busy><input aria-label="Name"/></Overlay>);
  expect(screen.getAllByRole('button',{name:'إغلاق'})).toHaveLength(1);
  expect((screen.getByRole('button',{name:'إغلاق'}) as HTMLButtonElement).disabled).toBe(true);
  await actions.keyboard('{Escape}');expect(close).not.toHaveBeenCalled();
  rerender(<Overlay label="إضافة قسم" chrome={{icon:<span/>,subtitle:'Details'}} close={close}><input aria-label="Name"/></Overlay>);
  await actions.click(screen.getByRole('button',{name:'إغلاق'}));expect(close).toHaveBeenCalledTimes(1);
  unmount();expect(document.body.style.overflow).toBe('');
});
