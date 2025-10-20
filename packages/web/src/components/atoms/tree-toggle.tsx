import { ActionIcon } from "@mantine/core";
import { IconChevronDown, IconChevronRight } from "@tabler/icons-react";

interface TreeToggleProps {
	isExpanded: boolean;
	onToggle: () => void;
	hasChildren: boolean;
}

export function TreeToggle({
	isExpanded,
	onToggle,
	hasChildren,
}: TreeToggleProps) {
	if (!hasChildren) {
		return <div style={{ width: 20, height: 20 }} />; // Spacer for alignment
	}

	return (
		<ActionIcon
			variant="subtle"
			size="sm"
			onClick={onToggle}
			style={{ flexShrink: 0 }}
		>
			{isExpanded ? (
				<IconChevronDown size={16} />
			) : (
				<IconChevronRight size={16} />
			)}
		</ActionIcon>
	);
}
