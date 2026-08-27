import canModel from '../assets/3D/can.glb?url';
import metalTexture from '../assets/6a0edb0e83db8ea830f2875d_5b37bb5107a2849b546a7b5d4bd06ef4_can-metallic-2.avif?url';
import labelOriginal from '../assets/rotulos/rotulo_redbull_tradicional.jpg?url';
import labelRed from '../assets/rotulos/watermelon_rotulo.avif?url';
import labelBlue from '../assets/rotulos/rotulo_redbull_azul.jpg?url';
import labelWinter from '../assets/rotulos/rotulo_redbull_winter.jpg?url';
import labelCoconut from '../assets/rotulos/rotulo_redbull_coco.jpg?url';
import labelSpring from '../assets/rotulos/rotulo_redbull_senior.jpg?url';

export const canModelUrl = canModel;
export const metalTextureUrl = metalTexture;

export interface Edition {
	id: string;
	name: string;
	description: string;
	/** Hero field gradient while this edition is on the can. */
	background: string;
	/** Unwrapped label artwork. */
	label: string;
	/** Where its front panel sits along the wrap, as a fraction of u. */
	front: number;
	lid: string;
	/** Ink for the white CTA button. */
	cta: string;
}

export const editions: Edition[] = [
	{
		id: 'original',
		name: 'Red Bull Original',
		description:
			'A que começou tudo. Taurina, vitaminas do complexo B e cafeína na lata prata e azul que revigora corpo e mente desde 1987.',
		background: 'linear-gradient(100deg, #2C3C63 0%, #40568C 52%, #5C74AC 100%)',
		label: labelOriginal,
		front: 0.67,
		lid: '#c9ced4',
		cta: '#25355A',
	},
	{
		id: 'red',
		name: 'Red Edition',
		description:
			'Melancia, sem rodeio. A carga inteira da Red Bull atrás de um sabor de verão doce e suculento, que entra gelado e termina limpo.',
		background: 'linear-gradient(100deg, #A00A2A 0%, #C4103A 52%, #DC2450 100%)',
		label: labelRed,
		front: 0.71,
		lid: '#d2c8ca',
		cta: '#8A0824',
	},
	{
		id: 'blue',
		name: 'Blue Edition',
		description:
			'Mirtilo: escuro, fundo e ácido. As mesmas asas, os mesmos 80 mg de cafeína, no azul mais reconhecível da prateleira.',
		background: 'linear-gradient(100deg, #101F58 0%, #1D3489 52%, #2F4EBB 100%)',
		label: labelBlue,
		front: 0.73,
		lid: '#c6cbd6',
		cta: '#14235E',
	},
	{
		id: 'winter',
		name: 'Winter Edition',
		description:
			'Baunilha gelada com frutas vermelhas. Um sabor macio de estação fria numa lata azul-gelo — a sazonal que some da prateleira antes da hora.',
		background: 'linear-gradient(100deg, #2A7A90 0%, #3D9CB4 52%, #57B8CE 100%)',
		label: labelWinter,
		front: 0.72,
		lid: '#cdd8dc',
		cta: '#215E70',
	},
	{
		id: 'coconut',
		name: 'Coconut Edition',
		description:
			'Coco com frutas vermelhas sobre uma lata branca. Tropical na entrada, seco no final, e tão afiada quanto a original.',
		background: 'linear-gradient(100deg, #6F5A44 0%, #8E7458 52%, #AC8F70 100%)',
		label: labelCoconut,
		front: 0.64,
		lid: '#d6d2cb',
		cta: '#5A4835',
	},
	{
		id: 'spring',
		name: 'Spring Edition',
		description:
			'Cereja sakura em plena flor. Um sabor floral e leve numa lata vestida de flor de cerejeira — a arte mais delicada que a Red Bull já imprimiu.',
		background: 'linear-gradient(100deg, #9E4460 0%, #C05E7B 52%, #D8798F 100%)',
		label: labelSpring,
		front: 0.71,
		lid: '#dccbd1',
		cta: '#883A52',
	},
];

/**
 * The files the can cannot render without. Layout preloads these so they go on
 * the wire immediately, instead of queueing behind the three.js bundle.
 */
export const criticalCanAssets = [
	{ href: canModelUrl, as: 'fetch', type: 'model/gltf-binary' },
	{ href: editions[0].label, as: 'image', type: undefined },
	{ href: metalTextureUrl, as: 'image', type: undefined },
] as const;
