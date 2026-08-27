/**
 * Turns an unwrapped Red Bull label into the texture that goes around the 3D
 * can. The mesh UVs map u = 0..1 around the circumference and v = 0 (bottom)
 * .. 1 (top), so the canvas is drawn top-down with the front of the can at the
 * horizontal centre.
 *
 * Every artwork in `assets/rotulos` is already a full wrap — information panel
 * on the left, front panel on the right — so the only work here is sliding the
 * print around the circumference until the front panel lands in the middle.
 */

/** Canvas size. The source art tops out around 1024px, so this is plenty. */
const W = 1536;
/** Circumference / height of a slim can, which is what the artwork assumes. */
const H = Math.round(W / 1.243);

export function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image();
		image.decoding = 'async';
		image.onload = () => resolve(image);
		image.onerror = () => reject(new Error(`Could not load ${url}`));
		image.src = url;
	});
}

/**
 * @param front Where the front panel sits on the source artwork, as a fraction
 *              of the circumference.
 */
export function drawLabel(art: HTMLImageElement, front: number): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d')!;

	// Slide the print around the can, drawn twice so the wrap seam is covered
	// on both sides of the offset.
	const shift = ((((0.5 - front) % 1) + 1) % 1) * W;
	ctx.drawImage(art, shift - W, 0, W, H);
	ctx.drawImage(art, shift, 0, W, H);

	// A soft vertical sheen, so the print reads as ink on a curved can rather
	// than as flat vector art.
	const sheen = ctx.createLinearGradient(0, 0, 0, H);
	sheen.addColorStop(0, 'rgba(255,255,255,0.16)');
	sheen.addColorStop(0.2, 'rgba(255,255,255,0.03)');
	sheen.addColorStop(0.82, 'rgba(0,0,0,0.14)');
	sheen.addColorStop(1, 'rgba(0,0,0,0.28)');
	ctx.fillStyle = sheen;
	ctx.fillRect(0, 0, W, H);

	return canvas;
}
