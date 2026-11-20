// Real ink validation for hand-drawn signatures. A PNG with transparent
// pixels only cannot be accepted as a signature or counted in a PDF.
export function pixelsContainSignatureInk(data, minimumPixels = 5) {
  let pixels = 0;
  for (let i = 0; i + 3 < data.length; i += 4) {
    if (data[i + 3] > 32 && data[i] < 220 && data[i + 1] < 220 &&
        data[i + 2] < 220 && ++pixels >= minimumPixels) return true;
  }
  return false;
}
export function canvasContainsSignatureInk(canvas) {
  try {
    if (!canvas?.width || !canvas?.height) return false;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    return Boolean(context && pixelsContainSignatureInk(
      context.getImageData(0, 0, canvas.width, canvas.height).data
    ));
  } catch { return false; }
}
export async function signatureImageContainsInk(dataUrl) {
  if (!/^data:image\/(?:png|jpeg|webp);base64,/i.test(dataUrl || "")) return false;
  // No DOM in existing Node layout fixtures; client-side verification is
  // performed in the browser before export and before each signature write.
  if (typeof Image === "undefined" || typeof document === "undefined") return true;
  return new Promise(resolve => {
    let settled = false;
    const settle = value => { if (!settled) { settled = true; clearTimeout(timer); resolve(value); } };
    const timer = setTimeout(() => settle(false), 3500);
    const image = new Image();
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = image.naturalWidth || image.width;
        canvas.height = image.naturalHeight || image.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx || !canvas.width || !canvas.height) return settle(false);
        ctx.drawImage(image, 0, 0);
        settle(pixelsContainSignatureInk(ctx.getImageData(0, 0, canvas.width, canvas.height).data));
      } catch { settle(false); }
    };
    image.onerror = () => settle(false);
    image.src = dataUrl;
  });
}
