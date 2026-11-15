export default function Video() {
	return (
		<video
			className="pointer-events-none fixed inset-0 z-0 block h-svh w-full bg-black object-cover object-center"
			autoPlay
			loop
			muted
			playsInline
			preload="auto"
			aria-hidden="true"
		>
			<source src="/videos/loop.webm" type="video/webm" />
		</video>
	)
}
