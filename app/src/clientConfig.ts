import { DEFAULT_CHECKLIST, DEFAULT_PROMPT_TEMPLATE, type ChecklistFieldDefinition } from "./lib_speech_contract";

export type LanguageOption = {
  code: string;
  name: string;
  recognitionLang: string;
};

export const LANGUAGES: LanguageOption[] = [
  { code: "de", name: "Deutsch", recognitionLang: "de-DE" },
  { code: "en", name: "English", recognitionLang: "en-US" },
  { code: "fr", name: "Français", recognitionLang: "fr-FR" }
];

export type ImproverSettings = {
  languageCode: string;
  evalModel: string;
  transcriptionModel: string;
  promptTemplate: string;
  checklist: ChecklistFieldDefinition[];
};

export const defaultSettings: ImproverSettings = {
  languageCode: "de",
  evalModel: "gpt-4o-mini",
  transcriptionModel: "gpt-4o-mini-transcribe",
  promptTemplate: DEFAULT_PROMPT_TEMPLATE,
  checklist: DEFAULT_CHECKLIST
};

export function languageByCode(code: string): LanguageOption {
  return LANGUAGES.find((language) => language.code === code) || LANGUAGES[0];
}

export function apiBasePath() {
  const base = import.meta.env.BASE_URL || "/";
  return base.endsWith("/") ? base : `${base}/`;
}
