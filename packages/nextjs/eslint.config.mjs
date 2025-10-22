import path from "node:path";
import { fileURLToPath } from "node:url";
import { FlatCompat } from "@eslint/eslintrc";
import eslintPluginUnicorn from "eslint-plugin-unicorn";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const compat = new FlatCompat({
	baseDirectory: __dirname,
});

const eslintConfig = [
	...compat.extends("next/core-web-vitals", "next/typescript"),
	eslintPluginUnicorn.configs.recommended,
	{
		rules: {
			"unicorn/no-useless-undefined": "off",
			"unicorn/no-null": "off",
			'quotes': 'off'
		},
		ignores: [
			"node_modules/**",
			".next/**",
			"out/**",
			"build/**",
			"next-env.d.ts",
			"**/.next/**",
			"**/node_modules/**",
		],
	},
];

export default eslintConfig;
