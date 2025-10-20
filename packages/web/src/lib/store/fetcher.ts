import { client } from "@lib/api/client";
import { nanoquery } from "@nanostores/query";

export const [createFetcherStore, createMutatorStore] = nanoquery({
	fetcher: (...keys) => client.get(keys.join("")).then((r) => r.data.data),
});
