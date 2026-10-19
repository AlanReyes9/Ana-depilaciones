import type { Settings } from './types';

export const DEFAULT_LOGO = '/logo.png';

export const logoSrc = (s: Settings) => s.logo || DEFAULT_LOGO;

/**
 * Reads an image file and returns it as a square PNG data URL of at most `size` px,
 * with the image centered (contain) on a transparent background.
 */
export function prepareLogo(file: File, size = 320): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith('image/')) return reject(new Error('El archivo debe ser una imagen (PNG, JPG…)'));
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      const side = Math.min(size, Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = canvas.height = side;
      const ctx = canvas.getContext('2d')!;
      const scale = side / Math.max(img.width, img.height);
      const w = img.width * scale;
      const h = img.height * scale;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, (side - w) / 2, (side - h) / 2, w, h);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('No se pudo leer la imagen'));
    };
    img.src = url;
  });
}
