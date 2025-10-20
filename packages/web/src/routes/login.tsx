import {
	Button,
	Center,
	Container,
	Paper,
	Stack,
	Text,
	Title,
} from "@mantine/core";
import { authClient } from "../lib/auth/client";

export default function () {
	return (
		<Center style={{ minHeight: "100vh" }}>
			<Container size="xs" w="100%">
				<Paper shadow="md" p="xl" radius="md" withBorder>
					<Stack gap="lg" align="center">
						<div style={{ textAlign: "center" }}>
							<Title order={2} c="var(--mantine-color-blue-6)">
								Welcome to Thoth
							</Title>
							<Text c="dimmed" size="sm" mt="xs">
								Sign in to access your account
							</Text>
						</div>

						<Button
							size="md"
							fullWidth
							onClick={() =>
								authClient.signIn.social({
									provider: "oidc",
									callbackURL: `${window.location.origin}/`,
								})
							}
						>
							Sign In
						</Button>
					</Stack>
				</Paper>
			</Container>
		</Center>
	);
}
