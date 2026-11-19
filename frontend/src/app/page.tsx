import Video from '@/components/backgrounds/Video'
import Visuals from '@/features/radio/components/Visuals'
import Radio from '@/features/radio/Radio'

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
