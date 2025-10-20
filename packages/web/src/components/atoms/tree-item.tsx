import { Text } from "@mantine/core";
import { Link } from "react-router";

interface TreeItemProps {
	name: string;
	emoji?: string | null;
	to?: string;
	onClick?: () => void;
}

export function TreeItem({ name, emoji, to, onClick }: TreeItemProps) {
	const content = (
		<>
			<span>{emoji ?? "📄"}</span>
			<span>{name}</span>
		</>
	);

	if (to) {
		return (
			<Link
				to={to}
				style={{
					textDecoration: "none",
					color: "inherit",
				}}
			>
				<Text
					size="sm"
					style={{
						cursor: "pointer",
						display: "flex",
						alignItems: "center",
						gap: 8,
						padding: "4px 8px",
						borderRadius: 4,
						transition: "background-color 0.1s",
					}}
					onMouseEnter={(e) => {
						e.currentTarget.style.backgroundColor =
							"var(--mantine-color-gray-1)";
					}}
					onMouseLeave={(e) => {
						e.currentTarget.style.backgroundColor = "transparent";
					}}
				>
					{content}
				</Text>
			</Link>
		);
	}

	return (
		<Text
			size="sm"
			style={{
				cursor: onClick ? "pointer" : "default",
				display: "flex",
				alignItems: "center",
				gap: 8,
				padding: "4px 8px",
				borderRadius: 4,
				transition: "background-color 0.1s",
			}}
			onClick={onClick}
			onMouseEnter={(e) => {
				if (onClick) {
					e.currentTarget.style.backgroundColor = "var(--mantine-color-gray-1)";
				}
			}}
			onMouseLeave={(e) => {
				if (onClick) {
					e.currentTarget.style.backgroundColor = "transparent";
				}
			}}
		>
			{content}
		</Text>
	);
}
