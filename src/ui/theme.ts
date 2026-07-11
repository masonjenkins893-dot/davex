import { getSetting, setSetting } from '../config/settings.js';

export interface Theme {
  name: string;
  primary: string;
  secondary: string;
  accent: string;
  error: string;
  success: string;
  warning: string;
  muted: string;
}

export const THEMES: Record<string, Theme> = {
  default: {
    name: 'Default',
    primary: 'cyan',
    secondary: 'white',
    accent: 'yellow',
    error: 'red',
    success: 'green',
    warning: 'yellow',
    muted: 'gray',
  },
  dracula: {
    name: 'Dracula',
    primary: 'magenta',
    secondary: 'white',
    accent: 'cyan',
    error: 'red',
    success: 'green',
    warning: 'yellow',
    muted: 'gray',
  },
  ocean: {
    name: 'Ocean',
    primary: 'blue',
    secondary: 'cyan',
    accent: 'white',
    error: 'red',
    success: 'green',
    warning: 'yellow',
    muted: 'gray',
  },
  matrix: {
    name: 'Matrix',
    primary: 'green',
    secondary: 'greenBright',
    accent: 'white',
    error: 'red',
    success: 'greenBright',
    warning: 'yellow',
    muted: 'gray',
  },
  sunset: {
    name: 'Sunset',
    primary: 'magenta',
    secondary: 'yellow',
    accent: 'red',
    error: 'red',
    success: 'green',
    warning: 'yellow',
    muted: 'gray',
  },
};

export function getActiveTheme(): Theme {
  const name = getSetting('theme') ?? 'default';
  return THEMES[name] ?? THEMES.default;
}

export function setTheme(name: string): boolean {
  if (!THEMES[name]) return false;
  setSetting('theme', name);
  return true;
}

export function listThemes(): string[] {
  return Object.keys(THEMES);
}
