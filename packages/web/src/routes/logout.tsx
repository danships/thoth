import { Loader } from "@mantine/core";
import { useEffect } from "react";
import { useNavigate } from "react-router";
import { authClient } from "../lib/auth/client";

export default function () {
	const navigate = useNavigate();

	useEffect(() => {
		authClient.signOut();
		navigate("/");
	}, []);

	return <Loader />;
}
