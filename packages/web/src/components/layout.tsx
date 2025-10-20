import { AppShell, Burger, Group, Loader, Title } from "@mantine/core";
import { useDisclosure } from "@mantine/hooks";
import { useEffect } from "react";
import { Outlet, useNavigate } from "react-router";
import { authClient } from "../lib/auth/client";
import { LoggedInContainer as SidebarLoggedInContainer } from "./molecules/sidebar/logged-in-container";

export default function Layout() {
	const [opened, { toggle }] = useDisclosure();

	const { isPending, data: session } = authClient.useSession();
	const navigate = useNavigate();

	useEffect(() => {
		if (!isPending && !session) {
			navigate("/login");
		}
	}, [isPending, session]);

	return (
		<>
			{isPending && <Loader />}
			{!isPending && session && (
				<AppShell
					padding="md"
					header={{ height: 30 }}
					navbar={{
						width: 300,
						breakpoint: "sm",
						collapsed: { mobile: !opened },
					}}
				>
					<AppShell.Header>
						<Group
							h="100%"
							px="md"
							justify="space-between"
							style={{ width: "100%" }}
						>
							<Group>
								<Burger
									opened={opened}
									onClick={toggle}
									hiddenFrom="sm"
									size="sm"
								/>
								<Title order={5}>Thoth</Title>
							</Group>
							<a
								href="/logout"
								style={{
									textDecoration: "none",
									color: "inherit",
									fontWeight: 500,
									fontSize: "0.95rem",
								}}
							>
								Logout
							</a>
						</Group>
					</AppShell.Header>

					<AppShell.Navbar p="md">
						<AppShell.Section>
							<SidebarLoggedInContainer />
						</AppShell.Section>
					</AppShell.Navbar>

					<AppShell.Main>
						<Outlet />
					</AppShell.Main>
				</AppShell>
			)}
		</>
	);
}
