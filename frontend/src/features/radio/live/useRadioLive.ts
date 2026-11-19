'use client'

import type { LiveEvent, NeteaseSyncState, PlaybackOrder, PlaybackSnapshot, PlaybackState, RadioOptions, RadioSong } from '@neon-radio/protocol'
import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'
import { toast } from 'sonner'
import { appendHistory, moveHistory, type HistoryAction, type PlaybackHistory } from './history'
import { readLocalPlaybackOrder, saveLocalPlaybackOrder } from './preferences'
import { parseLiveEvent } from './protocol'

export type { PlaybackOrder, PlaybackState, RadioOptions, RadioSong }

export interface RadioLiveState {
	options: RadioOptions | null
	songs: RadioSong[] | null
	status: 'loading' | 'ready' | 'error'
	authenticated: boolean
	playback: PlaybackState | null
	playbackPending: boolean
	impactsRevision: number
	neteaseSync: NeteaseSyncState | null
	syncPending: boolean
	successfulSyncId: string | null
	localPlaybackOrder: PlaybackOrder // 浏览器自己的游客漫游偏好，不读取或修改电台播放顺序
	setLocalPlaybackOrder: (order: PlaybackOrder) => void
	playSong: (songId: string) => Promise<boolean>
	hasPrevious: boolean
	playPrevious: () => Promise<boolean>
	playNext: (manual?: boolean) => Promise<boolean>
	pause: () => Promise<boolean>
	returnToMain: () => Promise<boolean>
	seek: (positionMs: number) => Promise<boolean>
	enableMainPlaybackSync: () => Promise<boolean>
	syncNetease: () => void
	reconnect: () => void
	reauthenticate: () => void
}

interface PendingPlayback {
	mode: PlaybackState['mode']
	restoring: boolean
	historyAction?: HistoryAction // 只在成功确认后更新历史，不随 WS 指令上传
	timer: ReturnType<typeof setTimeout>
	resolve: (success: boolean) => void
}

type PlaybackRequest =
	| { type: 'playback-request'; mode: 'main' }
	| { type: 'playback-request'; mode: 'local'; songId: string; playbackId?: string; positionMs?: number; paused?: boolean }
	| { type: 'playback-seek-request'; mode: 'local'; sourceMode: PlaybackState['mode']; playbackId: string; positionMs: number; paused: boolean }
	| { type: 'playback-next-request'; mode: 'local'; playbackId: string; order?: PlaybackOrder | undefined; manual?: boolean | undefined }
	| { type: 'playback-pause-request'; mode: 'local' }
	| { type: 'main-sync-request'; mode: 'main'; playback: { songId: string; positionMs: number } | null }

export const RadioLiveContext = createContext<RadioLiveState | null>(null)

// 从快照基准计算当前播放进度
export function getPlaybackPosition(playback: PlaybackState, now = Date.now()) {
	if (!playback.song) return 0
	return Math.min(playback.song.durationMs, Math.max(0, playback.positionMs + (playback.paused ? 0 : now - playback.receivedAt)))
}

// 服务端快照补充本页接收时间，本地播放才保留暂停状态
function toPlaybackState(snapshot: PlaybackSnapshot, receivedAt = Date.now()): PlaybackState {
	return { ...snapshot, paused: snapshot.mode === 'local' && snapshot.paused === true, receivedAt }
}

// 页面共用一条实时连接，弹窗关闭后仍接收播放和手动同步状态
export default function useRadioLive(roamingOpen: boolean, audioRef: RefObject<HTMLAudioElement | null>): RadioLiveState {
	const [options, setOptions] = useState<RadioOptions | null>(null) // 服务端电台开关
	const [localPlaybackOrder, updateLocalPlaybackOrder] = useState<PlaybackOrder>('single') // 游客本地默认单曲循环
	const [authenticated, setAuthenticated] = useState(false) // 当前浏览器是否为已登录管理员
	const [songs, setSongs] = useState<RadioSong[] | null>(null) // 漫游界面正在展示的歌曲列表
	const [status, setStatus] = useState<RadioLiveState['status']>('loading') // 实时连接是否就绪
	const [connectionKey, setConnectionKey] = useState(0) // 主动重连时更新，重建同一条实时管线
	const [playback, setPlayback] = useState<PlaybackState | null>(null) // 已确认的歌曲、播放模式和进度
	const [history, setHistory] = useState<PlaybackHistory>({ songIds: [], cur: -1 }) // 本页播放历史，不随模式切换或重连清空
	const [playbackPending, setPlaybackPending] = useState(false) // 是否有尚未确认的播放操作
	const [impactsRevision, setImpactsRevision] = useState(0) // 当前歌曲的分析完成后重新拉取时间轴
	const [neteaseSync, setNeteaseSync] = useState<NeteaseSyncState | null>(null) // 网易云数据刷新任务的状态
	const [syncPending, setSyncPending] = useState(false) // 网易云刷新请求是否尚未确认
	const [successfulSyncId, setSuccessfulSyncId] = useState<string | null>(null) // 最近成功的数据刷新任务
	const latestSongsRef = useRef<RadioSong[] | null>(null) // 最新歌曲列表，漫游关闭时应用
	const roamingOpenRef = useRef(roamingOpen) // 让消息回调读取当前漫游开关
	const socketRef = useRef<WebSocket | null>(null) // 页面唯一的实时连接
	const playbackRef = useRef<PlaybackState | null>(null) // 异步回调读取最新已确认播放状态
	const historyRef = useRef(history) // 同一份历史供 WS 回调和连续切歌读取，避免重建连接
	const playbackRequestsRef = useRef(new Map<string, PendingPlayback>()) // 按请求 ID 保存等待确认的播放操作
	const deferredMainRef = useRef<PlaybackState | null>(null) // 操作未确认时暂存主线快照，避免覆盖本地操作
	const awaitingMainRef = useRef(false) // 主线操作已受理，等待最终广播；重连不再恢复旧本地歌曲
	const pendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null) // 正在等待受理的网易云刷新请求
	const noticeRef = useRef<Pick<NeteaseSyncState, 'id' | 'phase'> | null>(null) // 已提示的刷新任务阶段，避免重复 toast
	const authChannelRef = useRef<BroadcastChannel | null>(null) // 通知其他标签页更新登录会话

	// 挂载后读取本地偏好，存储不可用或旧值无效时保留单曲循环
	useEffect(() => {
		const stored = readLocalPlaybackOrder()
		if (stored) updateLocalPlaybackOrder(stored)
	}, [])

	// 只更新当前页面与浏览器存储，不向服务端提交电台配置
	const setLocalPlaybackOrder = useCallback((order: PlaybackOrder) => {
		updateLocalPlaybackOrder(order)
		if (!saveLocalPlaybackOrder(order)) toast.warning('无法保存本地播放偏好', { description: '当前页面仍生效，刷新后将恢复单曲循环。' })
	}, [])

	// 有真实音频时读取实际位置，重连和管理员推送不再使用估算进度
	const getCurrentPlayback = useCallback(() => {
		const current = playbackRef.current // 当前确认的播放实例
		const audio = audioRef.current // 页面唯一的真实音频元素
		if (!current || !audio) return current
		if (audio.dataset.playbackId !== current.playbackId) {
			return current.mode === 'local' ? { ...current, paused: audio.paused, receivedAt: Date.now() } : current
		}
		return {
			...current,
			positionMs: Math.max(0, audio.currentTime - Number(audio.dataset.start ?? 0)) * 1000,
			paused: audio.paused,
			receivedAt: Date.now()
		}
	}, [audioRef])

	// 清理尚未确认的网易云同步请求
	const clearPending = useCallback(() => {
		if (pendingRef.current) clearTimeout(pendingRef.current.timer)
		pendingRef.current = null
		setSyncPending(false)
	}, [])
	// 完成本次播放请求；true 为已确认，false 为失败或未确认
	const finishPlaybackRequest = useCallback((requestId: string, success: boolean) => {
		const pending = playbackRequestsRef.current.get(requestId)
		if (!pending) return
		clearTimeout(pending.timer)
		playbackRequestsRef.current.delete(requestId)
		setPlaybackPending(playbackRequestsRef.current.size > 0)
		pending.resolve(success)
	}, [])
	// 断线或会话变化时结束所有未确认请求，不取消服务端已受理操作
	const clearPlaybackRequests = useCallback(() => {
		for (const pending of playbackRequestsRef.current.values()) {
			clearTimeout(pending.timer)
			pending.resolve(false)
		}
		playbackRequestsRef.current.clear()
		setPlaybackPending(false)
	}, [])
	// 清除本页面的网易云同步提示
	const clearSync = useCallback(() => {
		toast.dismiss('netease-sync')
		noticeRef.current = null
		setNeteaseSync(null)
	}, [])
	// 主动重建实时连接
	const reconnect = useCallback(() => setConnectionKey(key => key + 1), [])
	// 登录状态变化后清理在途请求并重新握手
	const resetSession = useCallback(() => {
		clearPending()
		clearPlaybackRequests()
		clearSync()
		const current = socketRef.current
		socketRef.current = null
		current?.close()
		reconnect()
	}, [clearPending, clearPlaybackRequests, clearSync, reconnect])
	// 让当前页面及其他标签页使用新的登录会话
	const reauthenticate = useCallback(() => {
		resetSession()
		authChannelRef.current?.postMessage('changed')
	}, [resetSession])

	// 新播放先按歌曲 ID 去重再追加；回退历史只移动 cur，不改变数组顺序
	const updateHistory = useCallback((songId: string, action: HistoryAction = 'append') => {
		const current = historyRef.current
		const next = typeof action === 'number' ? moveHistory(current, songId, action) : appendHistory(current, songId)
		if (!next) return
		historyRef.current = next
		setHistory(next)
	}, [])

	// 首次真正播放时记录当前歌，未点击播放前的主线快照不算播放历史
	useEffect(() => {
		const audio = audioRef.current
		if (!audio) return
		const onPlaying = () => {
			const current = playbackRef.current
			if (historyRef.current.cur < 0 && current?.song && audio.dataset.playbackId === current.playbackId) updateHistory(current.song.id)
		}
		audio.addEventListener('playing', onPlaying)
		return () => audio.removeEventListener('playing', onPlaying)
	}, [audioRef, updateHistory])

	// 应用确认的播放状态，再更新共用历史；重连、拖动和同歌曲快照不重复追加
	const applyPlayback = useCallback((next: PlaybackState, historyAction?: HistoryAction) => {
		const previous = playbackRef.current
		awaitingMainRef.current = false
		playbackRef.current = next
		setPlayback(next)
		if (historyRef.current.cur >= 0 && next.song && (historyAction !== undefined || previous?.song?.id !== next.song.id)) {
			updateHistory(next.song.id, historyAction)
		}
	}, [updateHistory])

	// 每次操作立即发送，按请求 ID 独立确认；true 为已受理，false 为未受理
	const startPlaybackRequest = useCallback(
		(socket: WebSocket, request: PlaybackRequest, { restoring = false, historyAction }: { restoring?: boolean; historyAction?: HistoryAction } = {}) => {
			if (!playbackRequestsRef.current.size) deferredMainRef.current = null
			const requestId = crypto.randomUUID()
			let resolveRequest: (success: boolean) => void = () => {}
			const result = new Promise<boolean>(resolve => {
				resolveRequest = resolve
			})
			// 超时不视为成功，重新握手以确认实际路线
			const timer = setTimeout(() => {
				if (!playbackRequestsRef.current.has(requestId)) return
				finishPlaybackRequest(requestId, false)
				if (!restoring) toast.warning('播放请求未确认', { description: '保持原来的播放状态，重连后可再次尝试。' })
				socket.close()
			}, 15_000)
			playbackRequestsRef.current.set(requestId, { mode: request.mode, restoring, historyAction, timer, resolve: resolveRequest })
			setPlaybackPending(true)
			try {
				socket.send(JSON.stringify({ requestId, ...request }))
			} catch {
				finishPlaybackRequest(requestId, false)
				if (!restoring) toast.error('播放请求发送失败，请重连后重试')
				socket.close()
			}
			return result
		},
		[finishPlaybackRequest]
	)

	// 漫游期间保留展示快照，关闭后应用最新列表，切换界面不重建连接
	useLayoutEffect(() => {
		roamingOpenRef.current = roamingOpen
		if (!roamingOpen) setSongs(latestSongsRef.current)
	}, [roamingOpen])

	// 登录或退出后重新握手，其他标签页也使用新的 HttpOnly Cookie
	useEffect(() => {
		if (typeof BroadcastChannel !== 'function') return
		let channel: BroadcastChannel
		try {
			channel = new BroadcastChannel('neon-radio-session')
		} catch {
			return
		}
		authChannelRef.current = channel
		channel.onmessage = event => {
			if (event.data === 'changed') resetSession()
		}
		return () => {
			channel.close()
			authChannelRef.current = null
		}
	}, [resetSession])

	useEffect(() => {
		let stopped = false
		let timer: ReturnType<typeof setTimeout> | undefined

		// 更新同步任务，首次握手不重复提示历史结果
		const applySync = (state: NeteaseSyncState | null, snapshot: boolean) => {
			if (state === null) {
				clearSync()
				return
			}
			setNeteaseSync(state)
			const previous = noticeRef.current
			const running = state.phase === 'refreshing' || state.phase === 'syncing'
			// 首次进入不弹历史结果；断线期间已知任务完成后仍补上提示
			if (snapshot && !running && !previous) return
			if (state.phase === 'success') setSuccessfulSyncId(state.id)
			if (previous?.id === state.id && previous.phase === state.phase) return
			noticeRef.current = { id: state.id, phase: state.phase }
			const notice = { id: 'netease-sync', description: state.message }
			if (running) toast.loading('正在同步网易云数据', notice)
			else if (state.phase === 'success') toast.success('网易云数据同步完成', notice)
			else toast.error('网易云数据同步失败', notice)
		}
		// 建立连接，重连时恢复已确认的路线
		const connect = () => {
			if (stopped) return
			setStatus('loading')
			setAuthenticated(false)
			deferredMainRef.current = null
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
			const current = new WebSocket(`${protocol}//${window.location.host}/neon-radio/live`)
			socketRef.current = current

			current.onopen = () => {
				if (stopped || socketRef.current !== current) return
				// 重连补拉时间轴，避免错过断线期间的分析完成通知
				setImpactsRevision(value => value + 1)
				const previous = getCurrentPlayback() // 断线恢复使用真实歌曲位置和暂停状态
				if (
					awaitingMainRef.current ||
					previous?.mode !== 'local' ||
					!previous.song ||
					!previous.playbackId
				)
					return
				// 仅恢复本地歌曲，不把断线恢复当成新的管理员主线操作
				void startPlaybackRequest(
					current,
					{
						type: 'playback-request',
						mode: 'local',
						songId: previous.song.id,
						playbackId: previous.playbackId,
						positionMs: getPlaybackPosition(previous),
						paused: previous.paused
					},
					{ restoring: true }
				)
			}
			current.onmessage = event => {
				if (stopped || socketRef.current !== current || typeof event.data !== 'string') return
				try {
					const message: LiveEvent | null = parseLiveEvent(event.data)
					if (!message) throw new Error('实时消息格式异常')
					if (message.type === 'radio-auth') {
						setAuthenticated(message.data)
					} else if (message.type === 'radio-options') {
						setOptions(message.data)
						setStatus('ready')
					} else if (message.type === 'radio-songs') {
						const songs = message.data
						// 首份数据允许结束加载，已有卡片在漫游期间保持不变
						const firstSnapshot = latestSongsRef.current === null
						latestSongsRef.current = songs
						if (!roamingOpenRef.current || firstSnapshot) setSongs(songs)
					} else if (message.type === 'radio-impacts-ready') {
						if (message.data === playbackRef.current?.song?.id) setImpactsRevision(value => value + 1)
					} else if (message.type === 'playback-state') {
						const next = toPlaybackState(message.data)
						// 请求未确认时暂存；已受理主线操作后允许离开旧本地状态
						if (playbackRequestsRef.current.size || (playbackRef.current?.mode === 'local' && !awaitingMainRef.current)) {
							deferredMainRef.current = next
						} else {
							deferredMainRef.current = null
							applyPlayback(next)
						}
					} else if (message.type === 'playback-response') {
						const pending = playbackRequestsRef.current.get(message.requestId)
						if (!pending) return
						if (message.code === 202) {
							if (pending.restoring || message.mode !== 'main') throw new Error('主线操作受理异常')
							// 202 只确认受理，不用响应快照覆盖广播的最终状态
							awaitingMainRef.current = true
							finishPlaybackRequest(message.requestId, true)
							if (!playbackRequestsRef.current.size && deferredMainRef.current) {
								applyPlayback(deferredMainRef.current)
								deferredMainRef.current = null
							}
							return
						}
						if (message.code !== 200) {
							finishPlaybackRequest(message.requestId, false)
							if (pending.restoring) {
								awaitingMainRef.current = true
								if (deferredMainRef.current) applyPlayback(deferredMainRef.current)
								deferredMainRef.current = null
								toast.warning('未能恢复本地播放，已回到电台', { description: message.message ?? '请重新选择歌曲' })
							} else {
								if (!playbackRequestsRef.current.size) {
									if ((playbackRef.current?.mode === 'main' || awaitingMainRef.current) && deferredMainRef.current) {
										applyPlayback(deferredMainRef.current)
									}
									deferredMainRef.current = null
								}
								// 游客点歌被漫游权限阻止时静默保留原播放，其他失败仍提示
								if (message.code !== 401 || pending.mode !== 'local') {
									toast.error('切换播放失败', { description: message.message ?? '请稍后重试' })
								}
							}
							return
						}
						// 普通本地点歌和回主线由成功响应确认实际快照
						if (!message.data) throw new Error('播放响应缺少快照')
						const next = toPlaybackState(message.data)
						if (next.mode !== pending.mode) throw new Error('播放模式确认异常')
						deferredMainRef.current = null
						applyPlayback(next, pending.historyAction)
						finishPlaybackRequest(message.requestId, true)
					} else if (message.type === 'netease-sync') {
						applySync(message.data, message.snapshot)
					} else if (message.type === 'netease-sync-response') {
						if (pendingRef.current?.id !== message.requestId) return
						clearPending()
						if (message.code !== 202) {
							toast.error('启动网易云同步失败', { description: message.message ?? '请稍后重试' })
							if (message.code === 401) {
								clearSync()
								current.close()
							}
						}
					} else if (message.type === 'auth-required') {
						clearPending()
						clearPlaybackRequests()
						clearSync()
						toast.error('登录已失效', { description: message.message })
						current.close()
					}
				} catch {
					console.warn('电台实时数据格式异常，正在重连')
					current.close()
				}
			}
			current.onerror = () => {
				if (!stopped && socketRef.current === current) current.close()
			}
			current.onclose = () => {
				if (stopped || socketRef.current !== current) return
				const interruptedPlayback = [...playbackRequestsRef.current.values()].some(pending => !pending.restoring)
				clearPlaybackRequests()
				deferredMainRef.current = null
				if (interruptedPlayback) {
					toast.warning('播放请求连接中断', { description: '未确认的请求请重连后重试，已受理的主线操作不受页面断线影响。' })
				}
				if (pendingRef.current) {
					clearPending()
					toast.warning('同步请求连接中断', { description: '任务可能仍在后台运行，重连后将恢复状态，请勿重复点击。' })
				}
				setStatus('error')
				timer = setTimeout(connect, 3000)
			}
		}

		connect()
		return () => {
			stopped = true
			clearTimeout(timer)
			clearPending()
			clearPlaybackRequests()
			socketRef.current?.close()
			socketRef.current = null
		}
	}, [applyPlayback, clearPending, clearPlaybackRequests, clearSync, connectionKey, finishPlaybackRequest, getCurrentPlayback, startPlaybackRequest])

	// 申请选歌；true 为已受理或已在当前歌，false 为未受理
	const playSong = useCallback(
		(songId: string) => {
			if (playbackRef.current?.song?.id === songId) return Promise.resolve(true)
			const socket = socketRef.current
			if (!socket || socket.readyState !== WebSocket.OPEN) {
				toast.error('连接已断开，请稍后重试')
				return Promise.resolve(false)
			}
			return startPlaybackRequest(socket, { type: 'playback-request', mode: 'local', songId })
		},
		[startPlaybackRequest]
	)
	// 前后切歌共用私有播放请求，成功后更新历史；true 为已确认，false 为未受理
	const requestLocalSong = useCallback((songId: string, historyAction: HistoryAction) => {
		const socket = socketRef.current
		if (status !== 'ready' || !socket || socket.readyState !== WebSocket.OPEN || playbackRequestsRef.current.size) return Promise.resolve(false)
		if (!authenticated && !options?.guestRoamingEnabled) return Promise.resolve(false)
		if (!latestSongsRef.current?.some(song => song.id === songId && Number.isFinite(song.durationMs) && song.durationMs > 0)) return Promise.resolve(false)

		// 携带新本地实例，只切当前听众，不触发管理员强制同步到主线
		return startPlaybackRequest(socket, {
			type: 'playback-request',
			mode: 'local',
			songId,
			playbackId: crypto.randomUUID(),
			positionMs: 0,
			paused: false
		}, { historyAction })
	}, [authenticated, options?.guestRoamingEnabled, startPlaybackRequest, status])

	// 上一首确认后只移动 cur，不重新追加旧歌；true 为已确认，false 为无上一首或未受理
	const playPrevious = useCallback(() => {
		const current = historyRef.current
		const songId = current.songIds[current.cur - 1]
		if (!songId) return Promise.resolve(false)
		return requestLocalSong(songId, current.cur - 1)
	}, [requestLocalSong])

	// 自动续播遵循单曲循环，手动下一首重新选歌而不前进历史；true 为已确认，false 为未受理
	const playNext = useCallback(
		(manual = false) => {
			const current = playbackRef.current
			const socket = socketRef.current
			if (!current?.song || !current.playbackId || !socket || socket.readyState !== WebSocket.OPEN || playbackRequestsRef.current.size)
				return Promise.resolve(false)
			if (!manual && current.mode !== 'local') return Promise.resolve(false)

			// 选歌规则只在服务端实现，游客只上送自己的本地顺序
			return startPlaybackRequest(
				socket,
				{ type: 'playback-next-request', mode: 'local', playbackId: current.playbackId, order: authenticated ? undefined : localPlaybackOrder, manual },
				{ historyAction: 'append' }
			)
		},
		[authenticated, localPlaybackOrder, startPlaybackRequest]
	)

	// 手动暂停脱离主线，只冻结当前歌曲；这不是游客自行选歌或拖动
	const pause = useCallback(() => {
		const current = playbackRef.current
		if (current?.mode === 'local') return Promise.resolve(true)
		const socket = socketRef.current
		if (!current?.song || !socket || socket.readyState !== WebSocket.OPEN) return Promise.resolve(false)
		return startPlaybackRequest(socket, { type: 'playback-pause-request', mode: 'local' })
	}, [startPlaybackRequest])

	// 申请回主线；true 为已受理或已在主线，false 为未受理
	const returnToMain = useCallback(() => {
		if (playbackRef.current?.mode === 'main') return Promise.resolve(true)
		const socket = socketRef.current
		if (!socket || socket.readyState !== WebSocket.OPEN) {
			toast.error('连接已断开，请稍后重试')
			return Promise.resolve(false)
		}
		return startPlaybackRequest(socket, { type: 'playback-request', mode: 'main' })
	}, [startPlaybackRequest])

	// 拖动进度由服务端确认：普通听众进入本地，强制同步管理员调整主线
	const seek = useCallback(
		(positionMs: number) => {
			const current = getCurrentPlayback() // 拖动针对当前已确认实例，避免误改刚切换的歌曲
			const socket = socketRef.current // 复用页面实时连接
			if (!authenticated && !options?.guestRoamingEnabled) return Promise.resolve(false)
			if (!current?.playbackId || !socket || socket.readyState !== WebSocket.OPEN || playbackRequestsRef.current.size) return Promise.resolve(false)
			return startPlaybackRequest(socket, {
				type: 'playback-seek-request',
				mode: 'local',
				sourceMode: current.mode,
				playbackId: current.playbackId,
				positionMs,
				paused: current.paused
			})
		},
		[authenticated, getCurrentPlayback, options?.guestRoamingEnabled, startPlaybackRequest]
	)

	// 开启主线同步并推送本页面当前进度；true 为已确认，false 为未确认
	const enableMainPlaybackSync = useCallback(() => {
		const socket = socketRef.current
		if (status !== 'ready' || !socket || socket.readyState !== WebSocket.OPEN) {
			toast.error('连接已断开，请稍后重试')
			return Promise.resolve(false)
		}
		if (playbackRequestsRef.current.size) {
			toast.error('请等待当前播放操作完成后再开启主线同步')
			return Promise.resolve(false)
		}
		// 使用确认点击时的播放快照，不经过同歌曲免请求的选歌分支
		const current = getCurrentPlayback() // 开启同步时采样真实播放位置，暂停时也不会跳回估算进度
		return startPlaybackRequest(socket, {
			type: 'main-sync-request',
			mode: 'main',
			playback: current?.song ? { songId: current.song.id, positionMs: getPlaybackPosition(current) } : null
		})
	}, [getCurrentPlayback, startPlaybackRequest, status])

	// 手动刷新在途时不重复发送，保留稳定回调供选项弹窗使用
	const syncNetease = useCallback(() => {
		if (pendingRef.current || neteaseSync?.phase === 'refreshing' || neteaseSync?.phase === 'syncing') return
		const socket = socketRef.current
		if (status !== 'ready' || !socket || socket.readyState !== WebSocket.OPEN) {
			toast.error('连接已断开，请稍后重试')
			return
		}
		const requestId = crypto.randomUUID()
		const timer = setTimeout(() => {
			if (pendingRef.current?.id !== requestId) return
			clearPending()
			toast.warning('同步请求未确认', { description: '任务可能已经启动，重连后将恢复状态，请勿重复点击。' })
			socket.close()
		}, 15_000)
		pendingRef.current = { id: requestId, timer }
		setSyncPending(true)
		try {
			socket.send(JSON.stringify({ type: 'netease-sync-request', requestId }))
		} catch {
			clearPending()
			toast.error('同步请求发送失败，请重连后重试')
			socket.close()
		}
	}, [clearPending, neteaseSync?.phase, status])

	return {
		options,
		songs,
		status,
		authenticated,
		playback,
		playbackPending,
		impactsRevision,
		neteaseSync,
		syncPending,
		successfulSyncId,
		localPlaybackOrder,
		setLocalPlaybackOrder,
		playSong,
		hasPrevious: history.cur > 0 && Boolean(songs?.some(song => song.id === history.songIds[history.cur - 1] && Number.isFinite(song.durationMs) && song.durationMs > 0)),
		playPrevious,
		playNext,
		pause,
		returnToMain,
		seek,
		enableMainPlaybackSync,
		syncNetease,
		reconnect,
		reauthenticate
	}
}
