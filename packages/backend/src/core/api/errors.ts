export class HttpError extends Error {
	constructor(
		public statusCode: number,
		message: string,
		public readableMessage: boolean = false,
	) {
		super(message);
	}
}

export class NotFoundError extends HttpError {
	constructor(message: string, readableMessage: boolean = false) {
		super(404, message, readableMessage);
	}
}
