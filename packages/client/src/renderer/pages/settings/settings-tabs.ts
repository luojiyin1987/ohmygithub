export type SettingsTabId = 'appearance' | 'keyboard' | 'about'

export const DEFAULT_SETTINGS_TAB: SettingsTabId = 'appearance'
export const SETTINGS_TAB_IDS = new Set<string>([DEFAULT_SETTINGS_TAB, 'keyboard', 'about'])
