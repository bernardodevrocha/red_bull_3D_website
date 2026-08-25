/**
 * Builds the can artwork on a 2D canvas so it can be wrapped around the 3D
 * model as a texture. The mesh UVs map u = 0..1 around the circumference and
 * v = 0 (bottom) .. 1 (top), so the canvas is drawn top-down with the front of
 * the can at the horizontal centre. Everything printed on the front is sized as
 * a fraction of the circumference, which keeps it inside the visible face.
 */

export interface LabelStyle {
	/** Bright brand colour used for the claw and the flavour band. */
	accent: string;
	/** Deeper shade of the accent, used for the claw gradient. */
	accentDeep: string;
	/** Copy printed inside the flavour band. */
	band: string;
}

const W = 2048;
const H = 1664;

/**
 * Warms up the faces used by the artwork. The label is decorative, so a slow
 * font never holds the can back — whatever is ready wins, and `whenFontsReady`
 * lets the caller repaint once the real faces arrive.
 */
export function loadLabelFonts(timeout = 1200): Promise<void> {
	if (!('fonts' in document)) return Promise.resolve();
	const faces = Promise.all([
		document.fonts.load('900 120px Poppins'),
		document.fonts.load('800 120px Poppins'),
		document.fonts.load('600 120px Poppins'),
	]).then(() => undefined);

	return Promise.race([
		faces,
		new Promise<void>((resolve) => window.setTimeout(resolve, timeout)),
	]).catch(() => undefined);
}

export function whenFontsReady(): Promise<void> {
	if (!('fonts' in document)) return Promise.resolve();
	return document.fonts.ready.then(() => undefined).catch(() => undefined);
}

export function drawLabel(style: LabelStyle): HTMLCanvasElement {
	const canvas = document.createElement('canvas');
	canvas.width = W;
	canvas.height = H;
	const ctx = canvas.getContext('2d')!;
	const cx = W / 2;

	// Body: near-black aluminium with a soft vertical sheen.
	ctx.fillStyle = '#080808';
	ctx.fillRect(0, 0, W, H);
	const sheen = ctx.createLinearGradient(0, 0, 0, H);
	sheen.addColorStop(0, 'rgba(255,255,255,0.10)');
	sheen.addColorStop(0.18, 'rgba(255,255,255,0.02)');
	sheen.addColorStop(0.85, 'rgba(0,0,0,0.35)');
	sheen.addColorStop(1, 'rgba(0,0,0,0.55)');
	ctx.fillStyle = sheen;
	ctx.fillRect(0, 0, W, H);

	// Shoulder text.
	ctx.fillStyle = 'rgba(226, 208, 148, 0.92)';
	fitText(ctx, 'ZERO SUGAR', cx, 0.075 * H, 0.185 * W, 600, 0.24);

	// A faded claw on the back, split across the texture seam.
	ctx.save();
	ctx.globalAlpha = 0.14;
	drawClaw(ctx, 0, 0.28 * H, 0.16 * W, 0.3 * H, style);
	drawClaw(ctx, W, 0.28 * H, 0.16 * W, 0.3 * H, style);
	ctx.restore();

	// Front artwork.
	drawClaw(ctx, cx, 0.16 * H, 0.205 * W, 0.37 * H, style);

	ctx.fillStyle = '#ffffff';
	fitText(ctx, 'MONSTER', cx, 0.655 * H, 0.225 * W, 900, 0.02);

	ctx.fillStyle = 'rgba(255,255,255,0.94)';
	fitText(ctx, 'ENERGY', cx, 0.722 * H, 0.16 * W, 600, 0.42);

	drawBand(ctx, cx, style);

	ctx.fillStyle = 'rgba(255,255,255,0.66)';
	fitText(ctx, 'ENERGY DRINK', cx - 0.1 * W, 0.895 * H, 0.075 * W, 600, 0.06);
	fitText(ctx, '16 FL OZ', cx + 0.1 * W, 0.895 * H, 0.05 * W, 600, 0.06);

	return canvas;
}

/** Draws centred text scaled so it occupies exactly `targetWidth` pixels. */
function fitText(
	ctx: CanvasRenderingContext2D,
	text: string,
	cx: number,
	y: number,
	targetWidth: number,
	weight: number,
	spacingEm: number,
) {
	const base = 100;
	const spacing = (size: number) => {
		if ('letterSpacing' in ctx) (ctx as any).letterSpacing = `${spacingEm * size}px`;
	};

	ctx.save();
	ctx.textAlign = 'center';
	ctx.textBaseline = 'middle';

	ctx.font = `${weight} ${base}px Poppins, sans-serif`;
	spacing(base);
	const measured = ctx.measureText(text).width;

	const size = measured > 0 ? (base * targetWidth) / measured : base;
	ctx.font = `${weight} ${size}px Poppins, sans-serif`;
	spacing(size);
	ctx.fillText(text, cx, y);

	spacing(0);
	ctx.restore();
}

/** One torn claw slash, described in a 0..1 unit box. */
const SLASH = [
	[0.5, 0.0],
	[0.74, 0.19],
	[0.66, 0.44],
	[0.85, 0.68],
	[0.72, 0.84],
	[0.8, 1.0],
	[0.5, 0.88],
	[0.2, 1.0],
	[0.28, 0.84],
	[0.15, 0.68],
	[0.34, 0.44],
	[0.26, 0.19],
] as const;

function drawClaw(
	ctx: CanvasRenderingContext2D,
	cx: number,
	top: number,
	width: number,
	height: number,
	style: LabelStyle,
) {
	const fill = ctx.createLinearGradient(0, top, 0, top + height);
	fill.addColorStop(0, style.accent);
	fill.addColorStop(0.55, style.accentDeep);
	fill.addColorStop(1, style.accent);

	// The middle slash is the tallest; the outer two are shorter and splayed.
	const slashes = [
		{ dx: -0.32, w: 0.42, h: 0.88, dy: 0.1 },
		{ dx: 0, w: 0.46, h: 1, dy: 0 },
		{ dx: 0.32, w: 0.42, h: 0.88, dy: 0.1 },
	];

	for (const s of slashes) {
		const w = width * s.w;
		const h = height * s.h;
		const x0 = cx + width * s.dx - w / 2;
		const y0 = top + height * s.dy;

		ctx.beginPath();
		SLASH.forEach(([px, py], i) => {
			const x = x0 + px * w;
			const y = y0 + py * h;
			if (i === 0) ctx.moveTo(x, y);
			else ctx.lineTo(x, y);
		});
		ctx.closePath();
		ctx.fillStyle = fill;
		ctx.fill();

		// Inner highlight, for a little depth.
		ctx.save();
		ctx.clip();
		const hi = ctx.createLinearGradient(x0, y0, x0 + w, y0 + h);
		hi.addColorStop(0, 'rgba(255,255,255,0.32)');
		hi.addColorStop(0.4, 'rgba(255,255,255,0)');
		ctx.fillStyle = hi;
		ctx.fillRect(x0, y0, w, h);
		ctx.restore();
	}
}

function drawBand(ctx: CanvasRenderingContext2D, cx: number, style: LabelStyle) {
	const bw = 0.255 * W;
	const bh = 0.062 * H;
	const x = cx - bw / 2;
	const y = 0.762 * H;

	ctx.save();
	ctx.beginPath();
	ctx.roundRect(x, y, bw, bh, bh * 0.12);
	const g = ctx.createLinearGradient(x, y, x, y + bh);
	g.addColorStop(0, style.accent);
	g.addColorStop(1, style.accentDeep);
	ctx.fillStyle = g;
	ctx.fill();
	ctx.restore();

	ctx.fillStyle = '#0a0a0a';
	fitText(ctx, style.band, cx, y + bh / 2, 0.2 * W, 800, 0.08);
}
