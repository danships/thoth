import { lazy } from "react";
import {
	createBrowserRouter,
	createRoutesFromElements,
	Route,
} from "react-router";
import { RouterProvider } from "react-router/dom";
import Layout from "./layout";

const Home = lazy(() => import("../routes/home"));
const Login = lazy(() => import("../routes/login"));
const Logout = lazy(() => import("../routes/logout"));
const CreatePage = lazy(() => import("../routes/create-page"));
const Page = lazy(() => import("../routes/page"));

const router = createBrowserRouter(
	createRoutesFromElements(
		<>
			<Route path="/login" element={<Login />} />,
			<Route path="/logout" element={<Logout />} />,
			<Route element={<Layout />}>
				<Route index element={<Home />} />
				<Route path="/pages/create" element={<CreatePage />} />
				<Route path="/pages/:id/create" element={<CreatePage />} />
				<Route path="/pages/:id" element={<Page />} />
			</Route>
			,
		</>,
	),
);

export default function Router() {
	return <RouterProvider router={router} />;
}
