import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

export default function ActionMenu({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { const target = event.target as Node; if (!triggerRef.current?.contains(target) && !menuRef.current?.contains(target)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close); document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  function toggle() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const menuHeight = 128;
      setPosition({ top: rect.bottom + 5 + menuHeight > window.innerHeight ? rect.top - menuHeight - 5 : rect.bottom + 5, left: Math.min(rect.right - 120, window.innerWidth - 130) });
    }
    setOpen((value) => !value);
  }
  return <span className="action-menu"><button ref={triggerRef} className="action-menu-trigger" type="button" aria-expanded={open} onClick={toggle}>Actions</button>{open && createPortal(<div ref={menuRef} className="action-menu-items action-menu-floating" style={{ top: position.top, left: position.left }}>{children}</div>, document.body)}</span>;
}
