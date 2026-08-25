import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import {
	drawLabel,
	loadLabelFonts,
	whenFontsReady,
	type LabelStyle,
} from './can-label';

export interface CanScene {
	/** Swaps the printed artwork, spinning the can while it changes. */
	setStyle(style: LabelStyle, lidColor: string): void;
	dispose(): void;
}

const FOV = 20;
/** Can height as a share of the viewport, from the design spec (410 / 576). */
const CAN_VIEWPORT_RATIO = 410 / 576;

export async function createCanScene(
	canvas: HTMLCanvasElement,
	modelUrl: string,
	initial: { style: LabelStyle; lidColor: string },
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

	const rim = new THREE.DirectionalLight(0xd8f79a, 2.2);
	rim.position.set(3, 1.4, -2.5);
	scene.add(rim);

	scene.add(new THREE.AmbientLight(0xffffff, 0.35));

	await loadLabelFonts();

	const gltf = await new GLTFLoader().loadAsync(modelUrl);
	const model = gltf.scene;

	// Normalise: centre on the origin and scale so the can is exactly 1 unit tall.
	const box = new THREE.Box3().setFromObject(model);
	const size = box.getSize(new THREE.Vector3());
	const center = box.getCenter(new THREE.Vector3());
	model.position.sub(center);
	const holder = new THREE.Group();
	holder.add(model);
	holder.scale.setScalar(1 / size.y);

	const pivot = new THREE.Group();
	pivot.add(holder);
	scene.add(pivot);

	let labelTexture: THREE.CanvasTexture | null = null;
	let shell: THREE.MeshPhysicalMaterial | null = null;
	let lid: THREE.MeshStandardMaterial | null = null;

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
		} else {
			const isTop = child.parent?.name === 'Top' || child.name === 'Top';
			const metal = new THREE.MeshStandardMaterial({
				color: isTop ? 0xa8c94a : 0x9aa094,
				roughness: isTop ? 0.34 : 0.26,
				metalness: 1,
			});
			if (isTop) lid = metal;
			child.material = metal;
		}
		source.dispose?.();
	});

	function applyStyle(style: LabelStyle, lidColor: string) {
		const texture = new THREE.CanvasTexture(drawLabel(style));
		texture.colorSpace = THREE.SRGBColorSpace;
		texture.anisotropy = renderer.capabilities.getMaxAnisotropy();
		texture.wrapS = THREE.RepeatWrapping;
		if (shell) {
			shell.map = texture;
			shell.needsUpdate = true;
		}
		labelTexture?.dispose();
		labelTexture = texture;
		lid?.color.set(lidColor);
	}

	let current = initial;
	applyStyle(current.style, current.lidColor);

	// Repaint once the web fonts land, in case the first pass used a fallback.
	whenFontsReady().then(() => applyStyle(current.style, current.lidColor));

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

	function onPointerDown(event: PointerEvent) {
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

		if (!reduceMotion && !dragging) spinTarget += dt * 0.14;
		spin += (spinTarget - spin) * 0.08;

		pointer.x += (pointer.tx - pointer.x) * 0.05;
		pointer.y += (pointer.ty - pointer.y) * 0.05;

		pivot.rotation.y = spin + pointer.x * 0.18;
		pivot.rotation.x = -pointer.y * 0.07;
		pivot.rotation.z = Math.sin(t * 0.5) * 0.012;
		pivot.position.y = reduceMotion ? 0 : Math.sin(t * 0.8) * 0.012;

		renderer.render(scene, camera);
	}

	canvas.dataset.ready = 'true';
	frame();

	return {
		setStyle(style, lidColor) {
			current = { style, lidColor };
			spinTarget += Math.PI * 2;
			// Swap the artwork while the back of the can faces the camera.
			window.setTimeout(() => applyStyle(style, lidColor), 320);
		},
		dispose() {
			cancelAnimationFrame(raf);
			observer.disconnect();
			window.removeEventListener('pointermove', onPointerMove);
			labelTexture?.dispose();
			pmrem.dispose();
			renderer.dispose();
		},
	};
}
