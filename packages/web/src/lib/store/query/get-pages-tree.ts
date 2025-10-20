import { createFetcherStore } from "@lib/store/fetcher";
import {
	GET_PAGES_TREE_ENDPOINT,
	type GetPagesTreeResponse,
} from "@types/index";

export const $rootPagesTree = createFetcherStore<GetPagesTreeResponse>([
	GET_PAGES_TREE_ENDPOINT,
]);
