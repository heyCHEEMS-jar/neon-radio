import * as React from 'react'
import { cn } from '@/lib/cn'

function Input({ className, type, ...props }: React.ComponentProps<'input'>) {
	return (
		<input
			type={type}
			className={cn(
				'flex h-9 w-full min-w-0 rounded-md border border-zinc-200 bg-transparent px-3 py-1 text-base shadow-xs transition-colors outline-none placeholder:text-zinc-500 focus-visible:border-zinc-950 focus-visible:ring-[3px] focus-visible:ring-zinc-950/10 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
				className
			)}
			{...props}
		/>
	)
}

export { Input }
