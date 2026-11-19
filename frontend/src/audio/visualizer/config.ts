export const visualizerConfig = {
	coverSrc: '/images/thumb_music.webp',
	coverClassName: 'w-[52%]',
	scene: {
		scale: 1.04, // 固定放大，为位移和旋转留出边缘余量
		offset: 2, // 最大偏移，单位 px
		rotation: 0.2 // 最大旋转角度，单位度
	},
	camera: {
		scale: 1.2, // 封面固定缩放
		spinSeconds: 24 // 封面固定旋转一圈的秒数
	},
	bufferSize: 1024, // 对应 2048 点 FFT，兼顾低频分辨率和响应
	maxFps: 24,
	maxDpr: 1.0,
	spectrum: {
		smoothingTimeConstant: 0.45,
		minDecibels: -80,
		maxDecibels: -10 // 旁路采样不再经过音量衰减，留出强音余量，避免频谱整片顶满
	},
	shake: {
		mediumStrength: 0.5,
		highStrength: 0.65, // 相对该曲最高冲击强度的比例，仅用于动画分档
		levels: {
			low: { offset: 1, scale: 0.002, centerScale: 0.008, centerRecoil: 0.003, duration: 220 },
			medium: { offset: 1.5, scale: 0.005, centerScale: 0.018, centerRecoil: 0.006, duration: 320 },
			high: { offset: 3.5, scale: 0.01, centerScale: 0.032, centerRecoil: 0.01, duration: 440 }
		}
	},
	ring: {
		count: 48,
		gap: 6,
		spacing: 10,
		minFrequency: 60,
		maxFrequency: 12000,
		openThreshold: 32, // 抑制微弱底噪，让圆环主要由局部波峰拉伸
		sensitivity: 1.1,
		power: 1.5,
		response: {
			sustain: 0.08, // 弱化整体呼吸，保留少量局部波峰的拉伸
			transientBoost: 2,
			contrastBoost: 1.3,
			baselineSeconds: 0.65,
			attackSeconds: 0.02,
			releaseSeconds: 0.24
		},
		maxHeight: 80,
		lineWidth: 2,
		color: 'rgba(255, 255, 255, 0.7)',
		glow: { strength: 3, color: 'rgba(255, 255, 255, 0.35)' }
	},
	edges: {
		maxCount: 90,
		spacing: 8,
		gap: 2,
		top: { minFrequency: 600, maxFrequency: 12000 },
		bottom: { minFrequency: 60, maxFrequency: 600 },
		openThreshold: 24,
		sensitivity: 1.35,
		power: 2, // 收低弱音、拉高强音，扩大柱高的强弱对比
		color: { gradient: ['#ffffff', '#ffffff'] },
		glow: { strength: 3, color: 'rgba(255, 255, 255, 0.35)' }
	}
}
