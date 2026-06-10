import { defaultSettings, type ImproverSettings } from "./clientConfig";

const SETTINGS_KEY = "speech_improver_settings_v1";

export function loadSettings(): ImproverSettings {
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) return cloneSettings(defaultSettings);
    const parsed = JSON.parse(raw) as Partial<ImproverSettings>;
    const merged: ImproverSettings = {
      ...cloneSettings(defaultSettings),
      ...parsed,
      checklist: Array.isArray(parsed.checklist) && parsed.checklist.length > 0
        ? parsed.checklist
        : cloneSettings(defaultSettings).checklist
    };
    return merged;
  } catch {
    return cloneSettings(defaultSettings);
  }
}

export function saveSettings(settings: ImproverSettings) {
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

export function cloneSettings(settings: ImproverSettings): ImproverSettings {
  return JSON.parse(JSON.stringify(settings)) as ImproverSettings;
}
