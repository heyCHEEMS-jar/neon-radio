'use client'

import { createContext, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { toast } from 'sonner'

export interface RadioOptions {
	guestRoamingEnabled: boolean
	emojiChatEnabled: boolean
}

export interface RadioSong {
	id: string
	name: string
	artists: string[]
	picUrl: string
	duration: number
}

export interface NeteaseSyncState {
	id: string
	phase: 'refreshing' | 'syncing' | 'success' | 'error'
	message: string
}

export interface RadioLiveState {
	options: RadioOptions | null
	songs: RadioSong[] | null
	status: 'loading' | 'ready' | 'error'
	neteaseSync: NeteaseSyncState | null
	syncPending: boolean
	successfulSyncId: string | null
	syncNetease: () => void
	reconnect: () => void
	reauthenticate: () => void
}

export const RadioLiveContext = createContext<RadioLiveState | null>(null)

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isRadioSong(value: unknown): value is RadioSong {
	return (
		isRecord(value) &&
		typeof value.id === 'string' &&
		typeof value.name === 'string' &&
		Array.isArray(value.artists) &&
		value.artists.every((artist: unknown) => typeof artist === 'string') &&
		typeof value.picUrl === 'string' &&
		typeof value.duration === 'number' &&
		Number.isFinite(value.duration) &&
		value.duration >= 0
	)
}

function readSyncState(value: unknown): NeteaseSyncState {
	if (!isRecord(value) || typeof value.id !== 'string' || !value.id || typeof value.message !== 'string') {
		throw new Error('网易云同步状态异常')
	}
	const phase = value.phase
	if (phase !== 'refreshing' && phase !== 'syncing' && phase !== 'success' && phase !== 'error') {
		throw new Error('网易云同步阶段异常')
	}
	return { id: value.id, phase, message: value.message }
}

// 页面共用一条实时连接，弹窗关闭后仍接收手动同步的最终结果
export default function useRadioLive(roamingOpen: boolean): RadioLiveState {
	const [options, setOptions] = useState<RadioOptions | null>(null)
	const [songs, setSongs] = useState<RadioSong[] | null>(null)
	const [status, setStatus] = useState<RadioLiveState['status']>('loading')
	const [connectionKey, setConnectionKey] = useState(0)
	const [neteaseSync, setNeteaseSync] = useState<NeteaseSyncState | null>(null)
	const [syncPending, setSyncPending] = useState(false)
	const [successfulSyncId, setSuccessfulSyncId] = useState<string | null>(null)
	const latestSongsRef = useRef<RadioSong[] | null>(null)
	const roamingOpenRef = useRef(roamingOpen)
	const socketRef = useRef<WebSocket | null>(null)
	const pendingRef = useRef<{ id: string; timer: ReturnType<typeof setTimeout> } | null>(null)
	const noticeRef = useRef<Pick<NeteaseSyncState, 'id' | 'phase'> | null>(null)
	const authChannelRef = useRef<BroadcastChannel | null>(null)

	const clearPending = useCallback(() => {
		if (pendingRef.current) clearTimeout(pendingRef.current.timer)
		pendingRef.current = null
		setSyncPending(false)
	}, [])
	const clearSync = useCallback(() => {
		toast.dismiss('netease-sync')
		noticeRef.current = null
		setNeteaseSync(null)
	}, [])
	const reconnect = useCallback(() => setConnectionKey(key => key + 1), [])
	const resetSession = useCallback(() => {
		clearPending()
		clearSync()
		const current = socketRef.current
		socketRef.current = null
		current?.close()
		reconnect()
	}, [clearPending, clearSync, reconnect])
	const reauthenticate = useCallback(() => {
		resetSession()
		authChannelRef.current?.postMessage('changed')
	}, [resetSession])

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

		const applySync = (data: unknown, snapshot: boolean) => {
			if (data === null) {
				clearSync()
				return
			}
			const state = readSyncState(data)
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
		const connect = () => {
			if (stopped) return
			setStatus('loading')
			const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
			const current = new WebSocket(`${protocol}//${window.location.host}/neon-radio/live`)
			socketRef.current = current

			current.onmessage = event => {
				if (stopped || socketRef.current !== current || typeof event.data !== 'string') return
				try {
					const message: unknown = JSON.parse(event.data)
					if (!isRecord(message)) return
					if (message.type === 'radio-options') {
						const data = message.data
						if (!isRecord(data) || typeof data.guestRoamingEnabled !== 'boolean' || typeof data.emojiChatEnabled !== 'boolean') {
							throw new Error('电台选项数据异常')
						}
						setOptions({ guestRoamingEnabled: data.guestRoamingEnabled, emojiChatEnabled: data.emojiChatEnabled })
						setStatus('ready')
					} else if (message.type === 'radio-songs') {
						const songs = message.data
						if (!Array.isArray(songs) || !songs.every(isRadioSong)) throw new Error('漫游歌曲列表数据异常')
						// 首份数据允许结束加载，已有卡片在漫游期间保持不变
						const firstSnapshot = latestSongsRef.current === null
						latestSongsRef.current = songs
						if (!roamingOpenRef.current || firstSnapshot) setSongs(songs)
					} else if (message.type === 'netease-sync') {
						if (typeof message.snapshot !== 'boolean') throw new Error('网易云同步消息异常')
						applySync(message.data, message.snapshot)
					} else if (message.type === 'netease-sync-response') {
						if (typeof message.requestId !== 'string' || typeof message.code !== 'number') throw new Error('网易云同步响应异常')
						if (pendingRef.current?.id !== message.requestId) return
						clearPending()
						if (message.code !== 202) {
							toast.error('启动网易云同步失败', { description: typeof message.message === 'string' ? message.message : '请稍后重试' })
							if (message.code === 401) {
								clearSync()
								current.close()
							}
						}
					} else if (message.type === 'auth-required') {
						clearPending()
						clearSync()
						toast.error('登录已失效', { description: typeof message.message === 'string' ? message.message : '请重新扫码登录' })
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
			socketRef.current?.close()
			socketRef.current = null
		}
	}, [connectionKey, clearPending, clearSync])

	// 保持同步回调稳定，避免无关状态更新重建按钮防抖
	const syncNetease = useCallback(() => {
		if (pendingRef.current || neteaseSync?.phase === 'refreshing' || neteaseSync?.phase === 'syncing') return
		const socket = socketRef.current
		if (status !== 'ready' || !socket || socket.readyState !== WebSocket.OPEN) {
			toast.error('实时连接尚未就绪，请稍后重试')
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

	return { options, songs, status, neteaseSync, syncPending, successfulSyncId, syncNetease, reconnect, reauthenticate }
}
