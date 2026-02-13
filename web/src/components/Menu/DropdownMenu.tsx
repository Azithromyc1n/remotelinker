import React, { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

type DropdownProps = {
  trigger: React.ReactNode;
  children: React.ReactNode;
  align?: "start" | "end";
  offset?: number;
  minWidth?: number;
  maxWidth?: number;
  maxHeight?: number;
};

const Dropdown: React.FC<DropdownProps> = ({
  trigger,
  children,
  align = "end",
  offset = 8,
  minWidth = 100,
  maxWidth = 360,
  maxHeight = 520,
}) => {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: 0, top: 0 });

  const triggerWrapRef = useRef<HTMLSpanElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const close = () => setOpen(false);
  const toggle = () => setOpen((v) => !v);

  const updatePosition = () => {
    const t = triggerWrapRef.current;
    const m = menuRef.current;
    if (!t || !m) return;

    const tr = t.getBoundingClientRect();
    const mr = m.getBoundingClientRect();

    let left = align === "start" ? tr.left : tr.right - mr.width;
    left = Math.max(8, Math.min(left, window.innerWidth - mr.width - 8));

    const desiredHeight = Math.min(mr.height, maxHeight);
    const spaceBelow = window.innerHeight - tr.bottom;
    const spaceAbove = tr.top;

    let top = tr.bottom + offset;
    const willOverflowBelow = spaceBelow < desiredHeight + offset;

    if (willOverflowBelow && spaceAbove > spaceBelow) {
        top = Math.max(8, tr.top - desiredHeight - offset);
    } else {
        top = Math.min(top, window.innerHeight - desiredHeight - 8);
    }

    setPos({ left, top });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
  }, [open, align, minWidth, maxWidth, offset, maxHeight]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const m = menuRef.current;
      const t = triggerWrapRef.current;
      const target = e.target as Node;
      if (m && m.contains(target)) return;
      if (t && t.contains(target)) return;
      close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  const menu = open
    ? createPortal(
        <div
          ref={menuRef}
          style={{
            position: "fixed",
            left: pos.left,
            top: pos.top,
            width: "fit-content",
            minWidth,
            maxWidth,
            maxHeight,
            overflowY: "auto",
            zIndex: 9999,
            background: "#212121",
            color: "#fff",
            borderRadius: 12,
            boxShadow: "0 12px 30px rgba(0,0,0,0.35)",
            padding: "8px 0",
          }}
          onClick={(e) => {
            const el = e.target as HTMLElement;
            if (el.closest("[data-close='true']")) close();
          }}
        >
          {children}
        </div>,
        document.body
      )
    : null;

  return (
    <>
      <span
        ref={triggerWrapRef}
        style={{ display: "inline-flex" }}
        onClick={(e) => {
          e.stopPropagation();
          toggle();
        }}
      >
        {trigger}
      </span>

      {menu}
    </>
  );
};

export default Dropdown;