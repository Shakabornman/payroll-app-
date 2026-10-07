"use client";

import { useEffect, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";

const MODES = ["system", "light", "dark"];
const LABELS = { system: "Auto", light: "Light", dark: "Dark" };
const CHANGE_EVENT = "hae-theme-change";

function readMode() {
  try {
    const stored = localStorage.getItem("theme");
    return MODES.includes(stored) ? stored : "system";
  } catch {
    return "system";
  }
}

function applyMode(mode) {
  const dark =
    mode === "dark" ||
    (mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

function subscribe(callback) {
  window.addEventListener(CHANGE_EVENT, callback);
  return () => window.removeEventListener(CHANGE_EVENT, callback);
}

// Cycles Auto -> Light -> Dark. Auto follows the computer's setting. The same
// rule runs in an inline script in app/layout.js before the page paints.
export function ThemeToggle() {
  const mode = useSyncExternalStore(subscribe, readMode, () => "system");

  // Keep the page in step with the stored choice, and with the computer's
  // setting while the choice is Auto.
  useEffect(() => {
    applyMode(mode);
    if (mode !== "system") return;
    const query = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => applyMode("system");
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [mode]);

  function cycle() {
    const next = MODES[(MODES.indexOf(mode) + 1) % MODES.length];
    try {
      localStorage.setItem("theme", next);
    } catch {
      // Private window or blocked storage: the choice just won't be remembered.
    }
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }

  return (
    <Button variant="ghost" size="sm" onClick={cycle} aria-label="Change colour theme">
      Theme: {LABELS[mode]}
    </Button>
  );
}
