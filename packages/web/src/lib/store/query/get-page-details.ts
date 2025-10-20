import type { GetPageDetailsResponse } from "@types/endpoints";
import { atom } from "nanostores";
import { createFetcherStore } from "../fetcher";

export const $currentPageId = atom<string | null>(null);

export const $currentPage = createFetcherStore<GetPageDetailsResponse>([
	"/pages/",
	$currentPageId,
]);
