import { Capacitor, registerPlugin } from '@capacitor/core';
interface VaultPlugin {
  persist(options: { token: string }): Promise<void>;
  restore(): Promise<{ token: string }>;
  available(): Promise<{ available: boolean; saved: boolean }>;
  save(options: { token: string }): Promise<void>;
  unlock(): Promise<{ token: string }>;
  clear(): Promise<void>;
}
export const SessionVault = registerPlugin<VaultPlugin>('SessionVault');
export const native = Capacitor.isNativePlatform();
