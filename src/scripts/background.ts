/**
 * The carbonation field behind the page.
 *
 * Bubbles rise, wobble on their own phase, and answer to two inputs: the
 * pointer pushes them out of the way, and the scroll drags them past at a rate
 * set by each bubble's depth, so the field reads as parallax rather than as a
 * flat overlay. The same loop feeds the pointer position back to CSS for the
 * aurora behind it.
 *
 * Everything is capped against viewport area, and the loop stops whenever the
 * tab is hidden — a background animation is never worth a frame the user
 * cannot see.
 */

const TAU = Math.PI * 2;
/** How far from the pointer a bubble starts getting pushed, in CSS pixels. */
const PUSH_RADIUS = 130;
const PUSH_FORCE = 26;
/** Ceiling on the field, whatever the screen size. */
const MAX_BUBBLES = 150;
/** Most a bubble may be dragged by the scroll in one frame, in CSS pixels. */
const MAX_SCROLL_PUSH = 34;
/** Most unspent scroll the field will hold on to. */
const MAX_SCROLL_BACKLOG = 260;

const clamp = (value: number, min: number, max: number) =>
	value < min ? min : value > max ? max : value;

interface Bubble {
	x: number;
	y: number;
	r: number;
	/** Rise speed, px per second. */
	rise: number;
	/** Horizontal wobble in px, and where in the wobble it currently is. */
	sway: number;
	phase: number;
	phaseRate: number;
	/** 0 = far away and barely moved by the scroll, 1 = right up against the glass. */
	depth: number;
	alpha: number;
	tint: [number, number, number];
}

/* Tints for white paper: the field is drawn in ink, not in light. Gold is out
   — at the alpha this field runs on, it simply does not read on white. */
const GRAPHITE: [number, number, number] = [96, 106, 126];
const RED: [number, number, number] = [219, 10, 64];
const NAVY: [number, number, number] = [34, 57, 113];

/** Mostly graphite, with just enough brand colour to register. */
function pickTint(): [number, number, number] {
	const roll = Math.random();
	if (roll > 0.86) return RED;
	if (roll > 0.72) return NAVY;
	return GRAPHITE;
}

function makeBubble(width: number, height: number, atBottom = false): Bubble {
	const depth = Math.random();
	return {
		x: Math.random() * width,
		y: atBottom ? height + Math.random() * height * 0.4 : Math.random() * height,
		// Near bubbles are bigger and faster; far ones are specks.
		r: 1 + depth * 4.5,
		rise: 8 + depth * 30,
		sway: 6 + depth * 26,
		phase: Math.random() * TAU,
		phaseRate: 0.2 + Math.random() * 0.5,
		depth,
		alpha: 0.05 + depth * 0.16,
		tint: pickTint(),
	};
}

export function initBackground() {
	const canvas = document.getElementById('page-bg-canvas') as HTMLCanvasElement | null;
	const aurora = document.querySelector<HTMLElement>('.page-bg__aurora');
	if (!canvas) return;

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	let width = 0;
	let height = 0;
	let bubbles: Bubble[] = [];

	function resize() {
		// Measure the element, not the window: `innerWidth` includes the
		// scrollbar, but pointer coordinates do not, and a mismatch would put
		// the repulsion a few pixels off along the right edge.
		const rect = canvas!.getBoundingClientRect();
		width = Math.round(rect.width);
		height = Math.round(rect.height);
		if (!width || !height) return;

		// 1.5 is plenty for soft circles, and keeps the fill rate sane on
		// high-density displays.
		const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
		canvas!.width = Math.round(width * dpr);
		canvas!.height = Math.round(height * dpr);
		ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);

		const target = Math.min(MAX_BUBBLES, Math.round((width * height) / 13000));
		if (bubbles.length > target) bubbles.length = target;
		while (bubbles.length < target) bubbles.push(makeBubble(width, height));
	}

	function draw() {
		ctx!.clearRect(0, 0, width, height);

		for (const bubble of bubbles) {
			const x = bubble.x + Math.sin(bubble.phase) * bubble.sway;
			const [r, g, b] = bubble.tint;

			ctx!.beginPath();
			ctx!.arc(x, bubble.y, bubble.r, 0, TAU);
			ctx!.fillStyle = `rgba(${r}, ${g}, ${b}, ${bubble.alpha})`;
			ctx!.fill();

			// A brighter rim on the bigger ones, so they read as bubbles rather
			// than as dots.
			if (bubble.r > 2.4) {
				ctx!.strokeStyle = `rgba(${r}, ${g}, ${b}, ${bubble.alpha * 0.9})`;
				ctx!.lineWidth = 1;
				ctx!.stroke();
			}
		}
	}

	resize();
	// The element's own box is the source of truth, so observe it directly.
	const resizeObserver = new ResizeObserver(resize);
	resizeObserver.observe(canvas);

	if (reduceMotion) {
		draw();
		return;
	}

	// --- inputs -------------------------------------------------------------

	const pointer = { x: -9999, y: -9999, nx: 0, ny: 0 };
	let scrollY = window.scrollY;
	let scrollDelta = 0;

	window.addEventListener(
		'pointermove',
		(event) => {
			pointer.x = event.clientX;
			pointer.y = event.clientY;
			pointer.nx = width ? (event.clientX / width) * 2 - 1 : 0;
			pointer.ny = height ? (event.clientY / height) * 2 - 1 : 0;
		},
		{ passive: true },
	);

	window.addEventListener('pointerleave', () => {
		pointer.x = -9999;
		pointer.y = -9999;
	});

	// A tap or click sends up a small burst from that spot.
	window.addEventListener(
		'pointerdown',
		(event) => {
			for (let i = 0; i < 7; i++) {
				const bubble = makeBubble(width, height);
				bubble.x = event.clientX + (Math.random() - 0.5) * 40;
				bubble.y = event.clientY + (Math.random() - 0.5) * 20;
				bubble.rise *= 2.2;
				bubbles.push(bubble);
			}
			// Trim from the front so the field never grows without bound.
			if (bubbles.length > MAX_BUBBLES + 40) {
				bubbles.splice(0, bubbles.length - (MAX_BUBBLES + 40));
			}
		},
		{ passive: true },
	);

	window.addEventListener(
		'scroll',
		() => {
			const next = window.scrollY;
			// Cap the backlog: an anchor jump of a few thousand pixels should
			// nudge the field, not fire it off the screen.
			scrollDelta = clamp(scrollDelta + (next - scrollY), -MAX_SCROLL_BACKLOG, MAX_SCROLL_BACKLOG);
			scrollY = next;
		},
		{ passive: true },
	);

	// --- loop ---------------------------------------------------------------

	let raf = 0;
	let last = performance.now();
	let auroraX = 0;
	let auroraY = 0;

	function frame(now: number) {
		raf = requestAnimationFrame(frame);
		const dt = Math.min((now - last) / 1000, 0.05);
		last = now;

		// Hand the smoothed pointer to the CSS aurora.
		auroraX += (pointer.nx - auroraX) * 0.05;
		auroraY += (pointer.ny - auroraY) * 0.05;
		aurora?.style.setProperty('--pointer-x', auroraX.toFixed(3));
		aurora?.style.setProperty('--pointer-y', auroraY.toFixed(3));

		// Spend this frame's share of the accumulated scroll, so a fast flick
		// keeps pushing for a few frames instead of jumping once.
		const scrollPush = clamp(scrollDelta * 0.25, -MAX_SCROLL_PUSH, MAX_SCROLL_PUSH);
		scrollDelta -= scrollPush;

		for (const bubble of bubbles) {
			bubble.phase += bubble.phaseRate * dt;
			bubble.y -= bubble.rise * dt;
			bubble.y -= scrollPush * bubble.depth * 0.6;

			const dx = bubble.x - pointer.x;
			const dy = bubble.y - pointer.y;
			const distance = Math.hypot(dx, dy);
			if (distance < PUSH_RADIUS && distance > 0.01) {
				const strength = (1 - distance / PUSH_RADIUS) ** 2 * PUSH_FORCE * dt;
				bubble.x += (dx / distance) * strength * 12;
				bubble.y += (dy / distance) * strength * 12;
			}

			// Recycle off either vertical edge — scrolling can push them down
			// as well as up.
			const margin = bubble.r + bubble.sway + 20;
			if (bubble.y < -margin) {
				bubble.y = height + margin;
				bubble.x = Math.random() * width;
			} else if (bubble.y > height + margin * 3) {
				bubble.y = -margin;
				bubble.x = Math.random() * width;
			}

			if (bubble.x < -margin) bubble.x = width + margin;
			else if (bubble.x > width + margin) bubble.x = -margin;
		}

		draw();
	}

	function start() {
		if (raf) return;
		last = performance.now();
		raf = requestAnimationFrame(frame);
	}

	function stop() {
		cancelAnimationFrame(raf);
		raf = 0;
	}

	document.addEventListener('visibilitychange', () => {
		if (document.hidden) stop();
		else start();
	});

	start();
}
