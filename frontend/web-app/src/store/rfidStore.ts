import { create } from 'zustand';

interface RFIDStore {
  plugged: boolean;
  setPlugged: (plugged: boolean) => void;
  activeHandler: ((rfid: string) => Promise<void> | void) | null;
  setActiveHandler: (handler: ((rfid: string) => Promise<void> | void) | null) => void;
}

export const useRFIDStore = create<RFIDStore>((set) => ({
  plugged: false,
  setPlugged: (plugged) => set({ plugged }),
  activeHandler: null,
  setActiveHandler: (handler) => set({ activeHandler: handler }),
}));
