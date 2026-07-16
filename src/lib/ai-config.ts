// Single source of truth for the Gemini model used by the AI features.
// NOTE: the SettingsWindow "model tier" selector (store.aiModelTier) is NOT
// currently wired to the API calls — every call site used this hardcoded
// model. Wiring the selector is a separate, behavior-changing decision.
export const GEMINI_MODEL = 'gemini-3-flash-preview';
