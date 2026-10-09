import { Capacitor, registerPlugin } from '@capacitor/core';
interface VaultPlugin {
  available(): Promise<{ available: boolean; saved: boolean }>;
  save(options: { token: string }): Promise<void>;
  unlock(): Promise<{ token: string }>;
  clear(): Promise<void>;
}
export const SessionVault = registerPlugin<VaultPlugin>('SessionVault');
export const native = Capacitor.isNativePlatform();
