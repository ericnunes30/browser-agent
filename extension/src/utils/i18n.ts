/**
 * i18n helper — wrapper around chrome.i18n.getMessage
 */

export function t(key: string, ...args: string[]): string {
  const msg = chrome.i18n.getMessage(key, args);
  return msg || key;
}

export function t1(key: string, arg: string): string {
  return t(key, arg);
}

export function t2(key: string, arg1: string, arg2: string): string {
  return t(key, arg1, arg2);
}