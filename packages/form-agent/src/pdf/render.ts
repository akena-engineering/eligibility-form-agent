import { renderPageAsImage } from "unpdf";

/**
 * Pixels per PDF point. A letter page becomes 1224 x 1584 pixels: sharp enough
 * for 6 pt checkboxes, under the 2576 pixel limit where Claude starts
 * downscaling images (and its coordinates stop matching ours).
 */
export const RENDER_SCALE = 2;

/** One page as a PNG, `RENDER_SCALE` pixels per point. */
export async function renderPage(
  bytes: Uint8Array,
  pageNumber: number,
): Promise<Uint8Array> {
  // pdf.js may detach the buffer it is given, so pass a copy.
  const png = await renderPageAsImage(new Uint8Array(bytes), pageNumber, {
    canvasImport: () => import("@napi-rs/canvas"),
    scale: RENDER_SCALE,
  });

  return new Uint8Array(png);
}
