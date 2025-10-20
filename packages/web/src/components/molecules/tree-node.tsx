import { TreeItem } from "@components/atoms/tree-item";
import { TreeToggle } from "@components/atoms/tree-toggle";
import {
	$expandedPages,
	togglePageExpanded,
} from "@lib/store/tree-expanded-state";
import { ActionIcon, Box, UnstyledButton } from "@mantine/core";
import { useStore } from "@nanostores/react";
import { IconPlus } from "@tabler/icons-react";
import { computed } from "nanostores";
import { Link } from "react-router";

type TreeNodeProps = {
	page: {
		id: string;
		name: string;
		emoji?: string | null;
	};
	childPages?: Array<{
		page: {
			id: string;
			name: string;
			emoji?: string | null;
		};
	}>;
	level?: number;
};

export function TreeNode({ page, childPages = [], level = 0 }: TreeNodeProps) {
	const $isExpanded = computed(
		$expandedPages,
		(expandedPages) => expandedPages.get(page.id) ?? false,
	);

	const isExpanded = useStore($isExpanded);

	const hasChildren = childPages.length > 0;

	const handleToggle = () => {
		togglePageExpanded(page.id);
	};

	return (
		<Box>
			{/* Current page row */}
			<Box
				style={{
					display: "flex",
					alignItems: "center",
					gap: 4,
					paddingLeft: level * 20,
				}}
			>
				<UnstyledButton onClick={(e) => e.stopPropagation()}>
					<TreeToggle
						isExpanded={isExpanded}
						onToggle={handleToggle}
						hasChildren={hasChildren}
					/>
				</UnstyledButton>
				<TreeItem
					name={page.name}
					emoji={page.emoji}
					to={`/pages/${page.id}`}
				/>
				<ActionIcon
					variant="subtle"
					size="xs"
					component={Link}
					to={`/pages/${page.id}/create`}
					aria-label="Add child page"
					style={{ marginLeft: "auto" }}
					onClick={(e) => {
						e.stopPropagation();
					}}
				>
					<IconPlus size={12} />
				</ActionIcon>
			</Box>

			{/* Children */}
			{isExpanded && hasChildren && (
				<Box>
					{childPages.map((child) => (
						<TreeNode
							key={child.page.id}
							page={{
								id: child.page.id,
								name: child.page.name,
								emoji: child.page.emoji,
							}}
							level={level + 1}
						/>
					))}
				</Box>
			)}
		</Box>
	);
}
