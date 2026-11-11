import { describe, expect, it } from 'vitest';
import { customProfileImage, profileImageAvatar, PROFILE_IMAGE_SHAPES, MAX_PROFILE_IMAGE_LENGTH } from '../src/lib/profile-image';
import { PROFILE_TEST_JPEG } from './helpers/profile-image';
describe('bounded custom profile images',()=>{
 it.each(PROFILE_IMAGE_SHAPES)('accepts a small actual JPEG in a %s frame',shape=>{expect(customProfileImage(profileImageAvatar(shape,PROFILE_TEST_JPEG))).toEqual({shape,image:PROFILE_TEST_JPEG});});
 it.each(['jade','https://example.com/photo.jpg','custom:circle:data:image/svg+xml;base64,PHN2Zz4=', 'custom:triangle:'+PROFILE_TEST_JPEG, 'custom:circle:data:image/jpeg;base64,Ly9mYWtl', 'custom:circle:'+PROFILE_TEST_JPEG+'x'.repeat(MAX_PROFILE_IMAGE_LENGTH)])('rejects malformed or unsupported content',value=>expect(customProfileImage(value)).toBeNull());
 it('rejects oversized JPEG dimensions even in a small file',()=>{
  const bytes=Buffer.from(PROFILE_TEST_JPEG.split(',')[1]!,'base64');
  const marker=bytes.findIndex((b,i)=>b===255&&[192,194].includes(bytes[i+1]!));expect(marker).toBeGreaterThan(0);
  bytes[marker+5]=15;bytes[marker+6]=255;
  expect(customProfileImage(profileImageAvatar('circle','data:image/jpeg;base64,'+bytes.toString('base64')))).toBeNull();
 });
});
