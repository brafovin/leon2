/** Geräteerkennung und daraus abgeleitete Qualitätsstufen. */

const ua = navigator.userAgent || '';
const coarse = matchMedia?.('(pointer: coarse)')?.matches ?? false;
const touchPoints = navigator.maxTouchPoints || 0;

export const isTouch = coarse || touchPoints > 0 || /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
export const isPhone = isTouch && Math.min(screen.width, screen.height) < 820;

/**
 * Auf Telefonen wird bewusst abgespeckt: kleinere Auflösung, keine
 * Schatten, weniger Vegetation und weniger Bots. Das kostet Optik,
 * hält aber 60 fps auf Mittelklasse-Hardware.
 */
export const perf = isPhone
  ? { mobile: true, pixelRatio: 1, shadows: false, worldQuality: 0.7, botScale: 0.55, fogFar: 380, shadowMap: 1024 }
  : isTouch
    ? { mobile: true, pixelRatio: 1.25, shadows: true, worldQuality: 0.85, botScale: 0.8, fogFar: 520, shadowMap: 1536 }
    : { mobile: false, pixelRatio: Math.min(devicePixelRatio, 2), shadows: true, worldQuality: 1, botScale: 1, fogFar: 700, shadowMap: 2048 };

/** Vollbild anfordern (auf Android nötig, damit die Systemleisten weichen). */
export async function requestFullscreen() {
  try {
    const el = document.documentElement;
    if (!document.fullscreenElement && el.requestFullscreen) await el.requestFullscreen({ navigationUI: 'hide' });
    await screen.orientation?.lock?.('landscape').catch(() => {});
  } catch { /* iOS Safari erlaubt kein Fullscreen-API auf dem iPhone */ }
}
