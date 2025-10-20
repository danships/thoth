import { client } from "@lib/api/client";
import type { AxiosResponse } from "axios";
import { useState } from "react";

export const useCudApi = () => {
	const [inProgress, setInProgress] = useState<boolean>(false);
	const [error, setError] = useState<string | null>(null);

	async function request<T = unknown, D = unknown>(
		method: "post" | "patch" | "delete",
		path: string,
		data?: D,
	): Promise<T> {
		setInProgress(true);
		setError(null);
		try {
			const result = await client.request<D, AxiosResponse<{ data: T }>>({
				method,
				url: path,
				data,
			});

			if (result.status === 200 && "data" in result.data) {
				return result.data.data;
			}

			// Endpoints that return a 204/201/200 with no content will return null
			return null as unknown as T;
		} catch (error) {
			setError(error instanceof Error ? error.message : "Unknown error");
			throw error;
		} finally {
			setInProgress(false);
		}
	}

	return {
		inProgress,
		post: <T, D = unknown>(path: string, data?: D) =>
			request<T, D>("post", path, data),
		patch: <T, D = unknown>(path: string, data?: D) =>
			request<T, D>("patch", path, data),
		delete: <T, D = unknown>(path: string, data?: D) =>
			request<T, D>("delete", path, data),
		error,
	};
};
