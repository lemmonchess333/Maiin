import type { ShareCardTheme } from '@/components/social/ShareCard';

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
    console.error('Share failed:', e);
  }
}
