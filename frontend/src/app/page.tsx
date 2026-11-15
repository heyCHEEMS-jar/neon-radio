import Video from '@/components/backgrounds/Video'
import Visuals from '@/components/visualizer/Visuals'
import RadioMenu from '@/components/radio/ContextMenu'

export default function HomePage() {
	return (
		<RadioMenu>
			<main>
				<Video />
				<Visuals />
			</main>
		</RadioMenu>
	)
}
