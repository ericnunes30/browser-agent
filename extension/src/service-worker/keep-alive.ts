/* ─── Keep-alive (MV3 Service Worker) ──────────────────────────── */

const KEEP_ALIVE_ALARM = 'ba-keep-alive';

export function startKeepAlive() {
  chrome.alarms.create(KEEP_ALIVE_ALARM, { periodInMinutes: 0.33 });
}

export function stopKeepAlive() {
  chrome.alarms.clear(KEEP_ALIVE_ALARM);
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === KEEP_ALIVE_ALARM) {
    console.log('[SW] Keep-alive tick');
  }
});
