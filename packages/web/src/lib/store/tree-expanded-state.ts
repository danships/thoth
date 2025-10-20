import { atom } from "nanostores";

export const $expandedPages = atom<Map<string, boolean>>(new Map());

// Actions to manage expanded state
export const togglePageExpanded = (pageId: string) => {
	const current = $expandedPages.get();
	const newMap = new Map(current);

	const isCurrentlyExpanded = newMap.get(pageId) ?? false;
	newMap.set(pageId, !isCurrentlyExpanded);

	$expandedPages.set(newMap);
};

export const isPageExpanded = (pageId: string): boolean => {
	return $expandedPages.get().get(pageId) ?? false;
};

export const expandPage = (pageId: string) => {
	const current = $expandedPages.get();
	const newMap = new Map(current);
	newMap.set(pageId, true);
	$expandedPages.set(newMap);
};

export const collapsePage = (pageId: string) => {
	const current = $expandedPages.get();
	const newMap = new Map(current);
	newMap.set(pageId, false);
	$expandedPages.set(newMap);
};
