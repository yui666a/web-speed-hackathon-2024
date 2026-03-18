import { getImageUrl } from '../../lib/image/getImageUrl';

export const useImage = ({ height, imageId, width }: { height: number; imageId: string; width: number }): string => {
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1;

  return getImageUrl({
    format: 'jpg',
    height: height * dpr,
    imageId,
    width: width * dpr,
  });
};
