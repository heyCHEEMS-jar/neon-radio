import Video from '@/components/backgrounds/Video'
import Visuals from '@/features/radio/components/Visuals'
import Radio from '@/features/radio/Radio'
import { siteDescription, siteName } from '@/lib/site'

export default function HomePage() {
	return (
		<>
			<Radio>
				<main>
					<Video />
					<Visuals />
				</main>
			</Radio>
			{/* 电台界面全靠 WebSocket 渲染，这里补一段不显示的说明文字供爬虫和无 JS 环境读取 */}
			<section className="sr-only">
				<h1>{siteName}</h1>
				<p>{siteDescription}</p>
				<h2>功能</h2>
				<ul>
					<li>实时歌词与副歌光柱，歌词随播放进度逐行推进。</li>
					<li>音频冲击可视化，按歌曲的真实分析数据驱动画面。</li>
					<li>游客漫游选歌，自行切歌和拖动进度且不影响主线电台。</li>
					<li>在线人数与每首歌的在听人数，可查看当前最热门的歌曲。</li>
				</ul>
				<h2>使用方法</h2>
				<p>点击播放按钮开始收听，空格键暂停与继续，右键打开电台菜单，页面下滚进入漫游选歌。</p>
			</section>
		</>
	)
}
