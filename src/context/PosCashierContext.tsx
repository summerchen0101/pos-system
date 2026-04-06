/* eslint-disable react-refresh/only-export-components -- hook colocated with provider for POS */
import { createContext, useContext, useMemo, useState, type ReactNode } from "react";

export type PosCashier = {
  userId: string;
  name: string;
};

type PosCashierContextValue = {
  cashier: PosCashier | null;
  setCashier: (c: PosCashier | null) => void;
};

const PosCashierContext = createContext<PosCashierContextValue | null>(null);

export function PosCashierProvider({ children }: { children: ReactNode }) {
  const [cashier, setCashier] = useState<PosCashier | null>(null);
  const value = useMemo(() => ({ cashier, setCashier }), [cashier]);
  return <PosCashierContext.Provider value={value}>{children}</PosCashierContext.Provider>;
}

export function usePosCashier() {
  const ctx = useContext(PosCashierContext);
  if (!ctx) {
    throw new Error("usePosCashier must be used within PosCashierProvider");
  }
  return ctx;
}
