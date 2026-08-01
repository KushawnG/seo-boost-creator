import { useEffect, useState } from "react";

const STORAGE_KEY = "ear-training-mode";
const CHANGE_EVENT = "ear-training-mode-change";

/** Global Ear Training Mode flag, persisted and synced across components. */
export function useEarTrainingMode(): [boolean, (enabled: boolean) => void] {
  const [enabled, setEnabled] = useState(
    () => typeof window !== "undefined" && localStorage.getItem(STORAGE_KEY) === "1",
  );

  useEffect(() => {
    const sync = () => setEnabled(localStorage.getItem(STORAGE_KEY) === "1");
    window.addEventListener(CHANGE_EVENT, sync);
    return () => window.removeEventListener(CHANGE_EVENT, sync);
  }, []);

  const set = (value: boolean) => {
    localStorage.setItem(STORAGE_KEY, value ? "1" : "0");
    window.dispatchEvent(new Event(CHANGE_EVENT));
  };

  return [enabled, set];
}
