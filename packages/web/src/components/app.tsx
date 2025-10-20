import "@mantine/core/styles.css";
import { MantineProvider } from "@mantine/core";
import { useEffect, useState } from "react";
import { theme } from "../theme";
import Router from "./router";

export default function App() {
	const [colorScheme, setColorScheme] = useState<"light" | "dark" | "auto">(
		"auto",
	);

	useEffect(() => {
		const storedColorScheme = localStorage.getItem("mantine-color-scheme") as
			| "light"
			| "dark"
			| null;
		if (storedColorScheme) {
			setColorScheme(storedColorScheme);
		}
	}, []);

	return (
		<MantineProvider theme={theme} defaultColorScheme={colorScheme}>
			<Router />
		</MantineProvider>
	);
}
