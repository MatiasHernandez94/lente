"use client";

import { useEffect } from "react";

export function useScrollToError(hasErrors: boolean) {
  useEffect(() => {
    if (!hasErrors) return;
    const invalid = document.querySelector<HTMLElement>('[aria-invalid="true"]:not([type="radio"])');
    const target = invalid ?? document.querySelector<HTMLElement>('[role="alert"]');
    const el = target ?? document.activeElement;
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    const focusable = ["input", "select", "textarea", "button", "summary"].includes(
      el instanceof HTMLElement ? el.tagName.toLowerCase() : "",
    );
    if (focusable && el instanceof HTMLElement) el.focus();
  }, [hasErrors]);
}