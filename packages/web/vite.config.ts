import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vitejs.dev/config/
export default defineConfig({
	plugins: [react()],
	resolve: {
		alias: {
			"@lib": path.resolve(__dirname, "./src/lib"),
			"@components": path.resolve(__dirname, "./src/components"),
			"@types": path.resolve(__dirname, "../../packages/types/src/api"),
		},
	},
});
