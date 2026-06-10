import type { ShareCardTheme } from '@/components/social/ShareCard';
import type { ShareFormat, ShareBackground } from '@/components/share/ShareCardRenderer';
import { logger } from '@/lib/logger';

const FORMAT_DIMS: Record<ShareFormat, { w: number; h: number }> = {
  story: { w: 1080, h: 1920 },
  square: { w: 1080, h: 1080 },
};

/**
 * Rasterise a ShareCardRenderer node to a PNG File (SOCIAL S1).
 * Rendered at pixelRatio 2 for crispness; the node paints its own
 * background (brand gradient / dark / transparent), so we never pass a
 * fill — that keeps `transparent` genuinely transparent for the overlay
 * use case. Returns null on failure (caller surfaces a toast).
 */
export async function generateShareImage(
  node: HTMLElement,
  opts: { format: ShareFormat; background: ShareBackground }
): Promise<File | null> {
  try {
    const { toBlob } = await import('html-to-image');
    const { w, h } = FORMAT_DIMS[opts.format];
    const blob = await toBlob(node, {
      width: w,
      height: h,
      pixelRatio: 2,
      cacheBust: true,
      // No backgroundColor: the node's own inline background renders, and
      // omitting it preserves a transparent export for `transparent` mode.
    });
    if (!blob) return null;
    return new File([blob], `tropos-${opts.format}.png`, { type: 'image/png' });
  } catch (e) {
    logger.error('Share image generation failed:', e);
    return null;
  }
}

/**
 * Hand a generated File to the native share sheet (Web Share API — works
 * in browsers AND the iOS WKWebView), falling back to a download. A
 * user-cancelled native share (AbortError) reports "cancelled", not a
 * failure, so the caller doesn't show an error toast.
 *
 * NATIVE SEAM: when @capacitor/share is added (needs `cap sync`), swap
 * the navigator.share branch for the plugin on native platforms.
 */
export async function shareImageFile(
  file: File,
  text: string
): Promise<'shared' | 'downloaded' | 'cancelled' | 'failed'> {
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.share &&
      navigator.canShare?.({ files: [file] })
    ) {
      await navigator.share({ files: [file], text });
      return 'shared';
    }
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
    return 'downloaded';
  } catch (e) {
    if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
    logger.error('Share dispatch failed:', e);
    return 'failed';
  }
}

const THEME_BG: Record<ShareCardTheme, string | undefined> = {
  dark: '#0a0a0f',
  light: '#ffffff',
  transparent: undefined,
};

export async function generateAndShare(node: HTMLElement, title: string, theme: ShareCardTheme = 'dark') {
  try {
    const { toBlob } = await import('html-to-image');
    const blob = await toBlob(node, {
      width: 1080, height: 1920, pixelRatio: 2,
      backgroundColor: THEME_BG[theme] || '#0a0a0a',
    });
    if (!blob) throw new Error('Failed to generate image');

    const file = new File([blob], 'tropos-activity.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text: `Check out my ${title} on Tropos` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'tropos-activity.png'; a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    logger.error('Share failed:', e);
  }
}
