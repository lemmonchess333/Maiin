import { toBlob } from 'html-to-image';

export async function generateAndShare(node: HTMLElement, title: string) {
  try {
    const blob = await toBlob(node, {
      width: 1080, height: 1920, pixelRatio: 2, backgroundColor: '#0a0a0a',
    });
    if (!blob) throw new Error('Failed to generate image');

    const file = new File([blob], 'maiin-activity.png', { type: 'image/png' });

    if (navigator.share && navigator.canShare({ files: [file] })) {
      await navigator.share({ files: [file], title, text: `Check out my ${title} on Maiin` });
    } else {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = 'maiin-activity.png'; a.click();
      URL.revokeObjectURL(url);
    }
  } catch (e) {
    console.error('Share failed:', e);
  }
}
