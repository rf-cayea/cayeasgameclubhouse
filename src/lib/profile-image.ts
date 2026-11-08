export const LEGACY_CUSTOM_PROFILE_IMAGE = 'profile-custom-image';
export const PROFILE_IMAGE_SHAPES = ['circle', 'diamond', 'square', 'portrait'] as const;
export type ProfileImageShape = typeof PROFILE_IMAGE_SHAPES[number];
export const profileFrameItem = (shape: ProfileImageShape) => `profile-image-${shape}`;
export const isProfileFrameItem = (id: string) => PROFILE_IMAGE_SHAPES.some(shape => profileFrameItem(shape) === id);
export const profileFrameName = (shape: ProfileImageShape) => shape === 'portrait' ? 'Portrait rectangle' : shape[0]!.toUpperCase() + shape.slice(1);
export const MAX_PROFILE_IMAGE_LENGTH = 12_000;
export type CustomProfileAvatar = `custom:${ProfileImageShape}:${string}`;

/** A small, re-encoded JPEG keeps profiles portable and excludes external URLs/SVG. */
export function customProfileImage(value: unknown): { shape: ProfileImageShape; image: string } | null {
  if (typeof value !== 'string' || value.length > MAX_PROFILE_IMAGE_LENGTH) return null;
  const match = /^custom:(circle|diamond|square|portrait):(data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2}))$/.exec(value);
  if (!match) return null;
  try {
    const bytes = atob(match[3]!);
    const byte = (i: number) => bytes.charCodeAt(i);
    if (byte(0) !== 255 || byte(1) !== 216 || byte(bytes.length - 2) !== 255 || byte(bytes.length - 1) !== 217) return null;
    let offset = 2;
    while (offset + 9 < bytes.length) {
      if (byte(offset++) !== 255) return null;
      while (byte(offset) === 255) offset++;
      const marker = byte(offset++), size = byte(offset) * 256 + byte(offset + 1);
      if (!Number.isFinite(size) || size < 2 || offset + size > bytes.length || marker === 218 || marker === 217) return null;
      if (marker >= 192 && marker <= 207 && ![196, 200, 204].includes(marker)) {
        const height = byte(offset + 3) * 256 + byte(offset + 4), width = byte(offset + 5) * 256 + byte(offset + 6);
        return size >= 8 && width > 0 && width <= 512 && height > 0 && height <= 512
          ? { shape: match[1] as ProfileImageShape, image: match[2]! } : null;
      }
      offset += size;
    }
  } catch { /* Reject malformed base64 or JPEG. */ }
  return null;
}

export function profileImageAvatar(shape: ProfileImageShape, image: string): CustomProfileAvatar { return `custom:${shape}:${image}`; }

export async function prepareProfileImage(file: File, shape: ProfileImageShape): Promise<CustomProfileAvatar> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 6_000_000) throw new Error('Choose a JPG, PNG or WebP image smaller than 6 MB.');
  const bitmap = await createImageBitmap(file);
  try {
    for (const width of [192, 144, 112]) {
      const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = shape === 'portrait' ? Math.round(width * 4 / 3) : width;
      const context = canvas.getContext('2d'); if (!context) throw new Error('Your browser could not prepare the image.');
      const ratio = Math.max(canvas.width / bitmap.width, canvas.height / bitmap.height), w = bitmap.width * ratio, h = bitmap.height * ratio;
      context.fillStyle = '#17352a'; context.fillRect(0, 0, canvas.width, canvas.height);
      context.drawImage(bitmap, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h);
      for (const quality of [.85, .68, .5, .35]) {
        const avatar = profileImageAvatar(shape, canvas.toDataURL('image/jpeg', quality));
        if (customProfileImage(avatar)) return avatar;
      }
    }
    throw new Error('Choose a less detailed image so your emblem can be saved.');
  } finally { bitmap.close(); }
}
