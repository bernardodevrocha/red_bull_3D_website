/**
 * Page-wide scroll motion. Three behaviours, one observer and one scroll
 * listener between them, so adding a section costs nothing at runtime:
 *
 *   [data-reveal]   fades and lifts into place the first time it is seen.
 *                   `--i` on the element staggers it inside its group.
 *   [data-parallax] drifts vertically as it crosses the viewport. The value is
 *                   the travel in pixels, signed.
 *   [data-count]    counts up to its value once revealed.
 *
 * Everything is opt-out under prefers-reduced-motion: the end state is applied
 * immediately instead.
 */

const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function countUp(node: HTMLElement, value: number, duration = 1400) {
	const decimals = (node.dataset.decimals && Number(node.dataset.decimals)) || 0;
	const start = performance.now();

	function step(now: number) {
		const t = Math.min(1, (now - start) / duration);
		// Ease out, so the number settles rather than slamming to a stop.
		const eased = 1 - Math.pow(1 - t, 3);
		node.textContent = (value * eased).toFixed(decimals);
		if (t < 1) requestAnimationFrame(step);
	}

	requestAnimationFrame(step);
}

export function initMotion() {
	const revealed = [...document.querySelectorAll<HTMLElement>('[data-reveal]')];
	const counters = [...document.querySelectorAll<HTMLElement>('[data-count]')];
	const floated = [...document.querySelectorAll<HTMLElement>('[data-parallax]')];

	if (reduceMotion()) {
		for (const node of revealed) node.dataset.inview = 'true';
		for (const node of counters) node.textContent = node.dataset.count!;
		return;
	}

	// --- reveal + counters --------------------------------------------------

	const observer = new IntersectionObserver(
		(entries) => {
			for (const entry of entries) {
				if (!entry.isIntersecting) continue;
				const node = entry.target as HTMLElement;
				node.dataset.inview = 'true';
				if (node.dataset.count) countUp(node, Number(node.dataset.count));
				observer.unobserve(node);
			}
		},
		{ rootMargin: '0px 0px -10% 0px', threshold: 0.2 },
	);

	for (const node of new Set([...revealed, ...counters])) observer.observe(node);

	// --- parallax -----------------------------------------------------------

	if (!floated.length) return;

	let ticking = false;

	function drift() {
		ticking = false;
		const height = window.innerHeight;

		for (const node of floated) {
			const box = node.getBoundingClientRect();
			if (box.bottom < -200 || box.top > height + 200) continue;
			// -1 above the fold, 0 centred, 1 below it.
			const progress = (box.top + box.height / 2 - height / 2) / height;
			const travel = Number(node.dataset.parallax) || 0;
			node.style.setProperty('--drift', `${(progress * travel).toFixed(2)}px`);
		}
	}

	function onScroll() {
		if (ticking) return;
		ticking = true;
		requestAnimationFrame(drift);
	}

	window.addEventListener('scroll', onScroll, { passive: true });
	window.addEventListener('resize', onScroll, { passive: true });
	drift();
}
