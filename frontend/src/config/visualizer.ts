export const visualizerConfig = {
	coverSrc: '/images/Duvet.jpg',
	coverClassName: 'w-[52%]',
	camera: {
		scale: 1.2,
		maxOffset: 5,
		maxRotation: 3,
		speed: 0.8
	},
	// 仅用于样式展示，暂不关联真实播放状态。
	songName: 'Duvet',
	playbackProgress: '0:00/0:00',
	bufferSize: 256,
	maxFps: 60,
	maxDpr: 1.5,
	ring: {
		count: 64,
		gap: 6,
		spacing: 8,
		openThreshold: 32,
		sensitivity: 2.6,
		maxHeight: 80,
		lineWidth: 3,
		color: 'rgba(255, 255, 255, 0.7)',
		glow: { strength: 6, color: 'rgba(255, 255, 255, 0.35)' }
	},
	edges: {
		maxCount: 90,
		spacing: 8,
		gap: 2,
		color: { gradient: ['#ffffff', '#ffffff'] },
		glow: { strength: 3, color: 'rgba(255, 255, 255, 0.35)' }
	}
}
