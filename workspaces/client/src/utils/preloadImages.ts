async function wait(milliseconds: number) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

export async function preloadImages() {
  if (process.env['PATH_LIST'] == null) {
    return;
  }

  const imagePathList: string[] = process.env['PATH_LIST'].split(',').filter((imagePath) => {
    const dotIndex = imagePath.lastIndexOf('.');
    const extension = dotIndex !== -1 ? imagePath.slice(dotIndex).toLowerCase() : '';
    return ['.bmp', '.jpg', '.jpeg', '.gif', '.png', '.webp', '.avif'].includes(extension);
  });

  const prefetch = Promise.all(
    imagePathList.map((imagePath) => {
      return new Promise((resolve) => {
        const link = document.createElement('link');

        Object.assign(link, {
          as: 'image',
          crossOrigin: 'anonymous',
          fetchPriority: 'high',
          href: imagePath,
          onerror: resolve,
          onload: resolve,
          rel: 'preload',
        });
        document.head.appendChild(link);
      });
    }),
  );

  await Promise.race([prefetch, wait(5000)]);
}
