// Runs in Android's WebView as well as the browser; uploads only the re-encoded JPEG.
export async function compressAdImage(file: File): Promise<File> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) throw new Error('اختر صورة JPEG أو PNG أو WebP');
  if (file.size > 30 * 1024 * 1024) throw new Error('الصورة أكبر من 30 MB');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image(); image.src = url;
    await image.decode();
    const scale = Math.min(1, 1920 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('تعذر ضغط الصورة');
    context.fillStyle = '#fff'; context.fillRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [0.85, 0.7, 0.55, 0.4]) {
      const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob(b => b ? resolve(b) : reject(new Error('تعذر ضغط الصورة')), 'image/jpeg', quality));
      if (blob.size <= 2 * 1024 * 1024) return new File([blob], 'ad-photo.jpg', { type: 'image/jpeg' });
    }
    throw new Error('تعذر تقليل الصورة إلى 2 MB، اختر صورة أصغر');
  } finally { URL.revokeObjectURL(url); }
}
