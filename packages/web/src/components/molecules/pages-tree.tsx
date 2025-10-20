import { TreeNode } from "@components/molecules/tree-node";
import { Box } from "@mantine/core";
import type { GetPagesTreeResponse } from "@types/index";

interface PagesTreeProps {
	branches: GetPagesTreeResponse["branches"];
}

export function PagesTree({ branches }: PagesTreeProps) {
	if (!branches || branches.length === 0) {
		return (
			<Box p="md" style={{ color: "var(--mantine-color-dimmed)" }}>
				No pages found
			</Box>
		);
	}

	return (
		<Box>
			{branches.map((branch) => (
				<TreeNode
					key={branch.page.id}
					page={branch.page}
					childPages={branch.children}
				/>
			))}
		</Box>
	);
}
