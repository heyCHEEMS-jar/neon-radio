export class ApiError extends Error {
	constructor(
		readonly statusCode: number,
		message: string,
		readonly code = statusCode
	) {
		super(message)
		this.name = 'ApiError'
	}
}
