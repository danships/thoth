import {
	$currentPage,
	$currentPageId,
} from "@lib/store/query/get-page-details";
import { Container, Loader, Text, Title } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { useEffect } from "react";
import { useParams } from "react-router";

export default function Page() {
	const { id } = useParams<{ id: string }>();

	const { data } = useStore($currentPage);

	useEffect(() => {
		if (id) {
			$currentPageId.set(id);
		} else {
			$currentPageId.set("");
		}
		return () => $currentPageId.set(null);
	}, [id]);

	return (
		<Container size="md">
			<Title order={1} mb="md">
				{data?.page.name ?? <Loader />}
			</Title>
			<Text c="dimmed">
				This is a placeholder for the page content. Page ID: {id}
			</Text>
		</Container>
	);
}
