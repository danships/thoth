import { useCudApi } from "@lib/hooks/use-cud-api";
import { Button, Container, Stack, TextInput, Title } from "@mantine/core";
import { useForm } from "@mantine/form";
import type { CreatePageResponse } from "@types/index";
import { useNavigate, useParams } from "react-router";

interface FormValues {
	name: string;
}

export default function CreatePage() {
	const navigate = useNavigate();
	const { id: parentId } = useParams();
	const { post, inProgress } = useCudApi();

	const form = useForm<FormValues>({
		initialValues: {
			name: "",
		},
		validate: {
			name: (value) => (value.length < 1 ? "Name is required" : null),
		},
	});

	const handleSubmit = async (values: FormValues) => {
		const response = await post<CreatePageResponse>("/pages", {
			name: values.name,
			emoji: null,
			parentId: parentId || null,
		});

		// Navigate to the created page
		navigate(`/pages/${response.id}`);
	};

	return (
		<Container size="sm">
			<Stack gap="lg">
				<div style={{ textAlign: "center" }}>
					<Title order={2}>Create New Page</Title>
				</div>

				<form onSubmit={form.onSubmit(handleSubmit)}>
					<Stack gap="md">
						<TextInput
							label="Page Name"
							placeholder="Enter page name"
							required
							{...form.getInputProps("name")}
							error={form.errors.name}
						/>

						<Button type="submit" loading={inProgress} disabled={inProgress}>
							Create Page
						</Button>
					</Stack>
				</form>
			</Stack>
		</Container>
	);
}
