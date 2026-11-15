import Video from '@/components/backgrounds/Video'
import Visuals from '@/components/visualizer/Visuals'
import Radio from '@/components/radio/Radio'

export default function HomePage() {
	return (
		<Radio>
			<main>
				<Video />
				<Visuals />
			</main>
		</Radio>
	)
}
