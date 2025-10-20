import type { Router } from "express";
import express from "express";
import { middleware } from "../../modules/auth/middleware.js";
import { createPage } from "../../modules/containers/api/create-page.js";
import { getPageDetails } from "../../modules/containers/api/get-page-details.js";
import { getPagesTree } from "../../modules/containers/api/get-pages-tree.js";

export function initializeHttpApi(): Router {
	const router = express.Router();

	router.use("/api/v1/", middleware, express.json());

	router.get("/api/v1/pages/tree", getPagesTree);
	router.get("/api/v1/pages/:id", getPageDetails);
	router.post("/api/v1/pages", createPage);

	return router;
}
