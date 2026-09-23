import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { CheckCircle2, Info, X } from "lucide-react";

type ToastItem = { id: number; message: string; tone: "success" | "info" };
const ToastContext = createContext<{ showToast: (message: string, tone?: ToastItem["tone"]) => void } | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const [exiting, setExiting] = useState<Set<number>>(new Set());
  const dismiss = useCallback((id: number) => {
    setExiting((current) => new Set(current).add(id));
    window.setTimeout(() => {
      setItems((current) => current.filter((item) => item.id !== id));
      setExiting((current) => { const next = new Set(current); next.delete(id); return next; });
    }, 180);
  }, []);
  const showToast = useCallback((message: string, tone: ToastItem["tone"] = "success") => {
    const id = Date.now() + Math.random();
    setItems((current) => [...current, { id, message, tone }]);
    window.setTimeout(() => dismiss(id), 4000);
  }, [dismiss]);
  return <ToastContext.Provider value={{ showToast }}>{children}<div className="toast-region" role="region" aria-label="Notifications">{items.map((item) => <div className={`toast toast-${item.tone} ${exiting.has(item.id) ? "is-dismissing" : ""}`} key={item.id} role="status">{item.tone === "success" ? <CheckCircle2 /> : <Info />}<span>{item.message}</span><button aria-label="Dismiss notification" onClick={() => dismiss(item.id)}><X /></button><i /></div>)}</div></ToastContext.Provider>;
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used inside ToastProvider");
  return context;
}
