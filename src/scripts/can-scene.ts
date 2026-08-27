import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { drawLabel, loadImage } from './can-label';

export interface CanLabel {
	/** URL of the unwrapped artwork for this edition. */
	url: string;
	/** Where its front panel sits along the wrap, as a fraction of u. */
	front: number;
	/** Lid tint for this edition. */
	lid: string;
}

export interface CanScene {
	/**
	 * Plays the flavour-swap animation and lands on `index`. `atSwap` fires on
	 * the frame the new print goes on, so the rest of the page can change
	 * colour with the can instead of ahead of it.
	 */
	setLabel(index: number, atSwap?: () => void): void;
	dispose(): void;
}

const FOV = 20;
/** Can height as a share of the viewport, from the design spec (410 / 576). */
const CAN_VIEWPORT_RATIO = 410 / 576;
/** Length of one flavour swap, in seconds. */
const SWAP_TIME = 1.05;

const easeInOutCubic = (x: number) =>
	x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;

export async function createCanScene(
	canvas: HTMLCanvasElement,
	assets: { modelUrl: string; metalUrl: string; labels: CanLabel[] },
	initial = 0,
): Promise<CanScene> {
	const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

	const renderer = new THREE.WebGLRenderer({
		canvas,
		alpha: true,
		antialias: true,
		powerPreference: 'high-performance',
	});
	renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
	renderer.toneMapping = THREE.ACESFilmicToneMapping;
	renderer.toneMappingExposure = 1.05;

	const scene = new THREE.Scene();
	const camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 100);

	// Studio reflections — this is what sells the aluminium.
	const pmrem = new THREE.PMREMGenerator(renderer);
	scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

	const key = new THREE.DirectionalLight(0xffffff, 2.6);
	key.position.set(-2.2, 3, 4);
	scene.add(key);

	const rim = new THREE.DirectionalLight(0xfff1f3, 2.2);
	rim.position.set(3, 1.4, -2.5);
	scene.add(rim);

	scene.add(new THREE.AmbientLight(0xffffff, 0.35));

	// Only the edition on screen is on the critical path. The other five are
	// fetched in the background and awaited on the first swap that needs them,
	// which keeps roughly 370 KB of artwork out of the first frame.
	const artwork = assets.labels.map((label) => loadImage(label.url));
	for (const pending of artwork) pending.catch(() => undefined);

	const [gltf, metalMap] = await Promise.all([
		new GLTFLoader().loadAsync(assets.modelUrl),
		new THREE.TextureLoader().loadAsync(assets.metalUrl),
		artwork[initial],
	]);

	// Brushed aluminium, tiled tightly enough that the grain stays fine at the
	// size the can is actually rendered.
	metalMap.colorSpace = THREE.SRGBColorSpace;
	metalMap.wrapS = metalMap.wrapT = THREE.RepeatWrapping;
	metalMap.repeat.set(6, 3);
	metalMap.anisotropy = renderer.capabilities.getMaxAnisotropy();

	const model = gltf.scene;

	// Normalise: centre on the origin and scale so the can is exactly 1 unit tall.
	const box = new THREE.Box3().setFromObject(model);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());
	model.position.sub(center);
	const holder = new THREE.Group();
	holder.add(model);
	const baseScale = 1 / size.y;
	holder.scale.setScalar(baseScale);

	const pivot = new THREE.Group();
	pivot.add(holder);
	scene.add(pivot);

	let shell: THREE.MeshPhysicalMaterial | null = null;
	let lid: THREE.MeshStandardMaterial | null = null;

	// Body, rim and base: the aluminium texture doing the work it was made for.
	const body = new THREE.MeshStandardMaterial({
		map: metalMap,
		color: 0xdfe3e6,
		roughness: 0.26,
		metalness: 1,
	});

	model.traverse((child) => {
		if (!(child instanceof THREE.Mesh)) return;
		const source = child.material as THREE.MeshStandardMaterial;

		if (source.name === 'Etiquette') {
			shell = new THREE.MeshPhysicalMaterial({
				color: 0xffffff,
				roughness: 0.34,
				metalness: 0.12,
				clearcoat: 0.7,
				clearcoatRoughness: 0.18,
			});
			child.material = shell;
		} else if (child.parent?.name === 'Top' || child.name === 'Top') {
			lid = new THREE.MeshStandardMaterial({
				map: metalMap,
				color: 0xc9ced4,
				roughness: 0.34,
				metalness: 1,
			});
			child.material = lid;
		} else {
			child.material = body;
		}
		source.dispose?.();
	});

	// --- label textures -----------------------------------------------------

	const textures = new Map<number, THREE.CanvasTexture>();

	/** Waits for that edition's artwork, then bakes its wrap once and caches it. */
	async function ensureTexture(index: number) {
		const cached = textures.get(index);
		if (cached) return cached;

		const image = await artwork[index];
		// Another call may have baked it while this one was waiting.
		const raced = textures.get(index);
		if (raced) return raced;

		const texture = new THREE.CanvasTexture(drawLabel(image, assets.labels[index].front));
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
		texture.wrapS = THREE.RepeatWrapping;
		textures.set(index, texture);
		return texture;
	}

	/** Puts an edition on the can. False means its artwork has not landed yet. */
	function applyLabel(index: number) {
		const texture = textures.get(index);
		if (!texture) return false;
		if (shell) {
			shell.map = texture;
			shell.needsUpdate = true;
		}
		lid?.color.set(assets.labels[index].lid);
		return true;
	}

	let current = initial;
	await ensureTexture(current);
	applyLabel(current);

	// --- sizing -------------------------------------------------------------

	function resize() {
		const width = canvas.clientWidth;
		const height = canvas.clientHeight;
		if (!width || !height) return;

		renderer.setSize(width, height, false);
		camera.aspect = width / height;

		// How much of the stage the can should fill — overridable per breakpoint.
		const fill =
			parseFloat(getComputedStyle(canvas).getPropertyValue('--can-fill')) ||
			CAN_VIEWPORT_RATIO;
		const visibleHeight = 1 / fill;
		camera.position.set(0, 0, visibleHeight / 2 / Math.tan((FOV * Math.PI) / 360));
		camera.lookAt(0, 0, 0);
		camera.updateProjectionMatrix();
	}

	const observer = new ResizeObserver(resize);
	observer.observe(canvas);
	resize();

	// --- interaction --------------------------------------------------------

	let spin = 0; // continuous idle + drag rotation
	let spinTarget = 0;
	let dragging = false;
	let lastX = 0;
	const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

	/**
	 * The flavour swap: one whipped turn of the can, with the new print dropped
	 * in at the half-way point, while the back is facing the camera.
	 */
	let swap: {
		to: number;
		from: number;
		t: number;
		applied: boolean;
		announce: () => void;
	} | null = null;

	function onPointerDown(event: PointerEvent) {
		if (swap) return;
		dragging = true;
		lastX = event.clientX;
		canvas.setPointerCapture(event.pointerId);
		canvas.style.cursor = 'grabbing';
	}

	function onPointerMove(event: PointerEvent) {
		pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
		pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
		if (!dragging) return;
		spinTarget += (event.clientX - lastX) * 0.008;
		lastX = event.clientX;
	}

	function onPointerUp(event: PointerEvent) {
		dragging = false;
		canvas.releasePointerCapture?.(event.pointerId);
		canvas.style.cursor = 'grab';
	}

	canvas.addEventListener('pointerdown', onPointerDown);
	canvas.addEventListener('pointerup', onPointerUp);
	canvas.addEventListener('pointercancel', onPointerUp);
	window.addEventListener('pointermove', onPointerMove);
	canvas.style.cursor = 'grab';

	// --- loop ---------------------------------------------------------------

	const clock = new THREE.Clock();
	let raf = 0;
	let t = 0;

	function frame() {
		raf = requestAnimationFrame(frame);
		const dt = Math.min(clock.getDelta(), 0.05);
		t += dt;

		let lift = 0;
		let tilt = 0;
		let glint = 0;

		if (swap) {
			swap.t = Math.min(1, swap.t + dt / SWAP_TIME);
			// Drive the turn straight off the timeline so it lands on exactly one
			// revolution, instead of easing in behind a lagging target.
			spinTarget = swap.from + easeInOutCubic(swap.t) * Math.PI * 2;
			spin = spinTarget;

			// Retries each frame: on a slow connection the artwork may still be
			// in flight when the can reaches the half-way point.
			if (!swap.applied && swap.t >= 0.5 && applyLabel(swap.to)) {
				swap.applied = true;
				swap.announce();
			}

			// A single arc of lift, tilt, scale and light across the whole swap.
			const pulse = Math.sin(Math.PI * swap.t);
			lift = pulse * 0.055;
			tilt = pulse * 0.06;
			glint = pulse;
			holder.scale.setScalar(baseScale * (1 + pulse * 0.05));

			if (swap.t >= 1) {
				swap = null;
				holder.scale.setScalar(baseScale);
			}
		} else {
			if (!reduceMotion && !dragging) spinTarget += dt * 0.14;
			spin += (spinTarget - spin) * 0.08;
		}

		key.intensity = 2.6 + glint * 1.6;

		pointer.x += (pointer.tx - pointer.x) * 0.05;
		pointer.y += (pointer.ty - pointer.y) * 0.05;

		pivot.rotation.y = spin + pointer.x * 0.18;
		pivot.rotation.x = -pointer.y * 0.07;
		pivot.rotation.z = Math.sin(t * 0.5) * 0.012 + tilt;
		pivot.position.y = (reduceMotion ? 0 : Math.sin(t * 0.8) * 0.012) + lift;

		renderer.render(scene, camera);
	}

	canvas.dataset.ready = 'true';
	frame();

	return {
		setLabel(index, atSwap) {
			if (index === current && !swap) return;
			current = index;

			let announced = false;
			const announce = () => {
				if (announced) return;
				announced = true;
				atSwap?.();
			};

			// Bake the wrap alongside the turn rather than before it, so a
			// still-downloading edition never delays the spin.
			const ready = ensureTexture(index);

			if (reduceMotion) {
				ready.then(() => {
					applyLabel(index);
					announce();
				});
				return;
			}

			dragging = false;
			swap = { to: index, from: spin, t: 0, applied: false, announce };

			ready.then(() => {
				// If the artwork only landed after the turn was over, put it on
				// now — otherwise the frame loop has already handled it.
				if (current !== index || swap) return;
				applyLabel(index);
				announce();
			});
		},
		dispose() {
			cancelAnimationFrame(raf);
			observer.disconnect();
			window.removeEventListener('pointermove', onPointerMove);
			for (const texture of textures.values()) texture.dispose();
			body.dispose();
			metalMap.dispose();
			pmrem.dispose();
			renderer.dispose();
		},
	};
}
