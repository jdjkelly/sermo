import { google } from "googleapis";
import { exec } from "child_process";
import { writeFile } from "fs/promises";
import { join } from "path";

const oauth2Client = new google.auth.OAuth2(
	process.env.GOOGLE_CLIENT_ID,
	process.env.GOOGLE_CLIENT_SECRET,
	process.env.GOOGLE_REDIRECT_URL,
);

// generate a url that asks permissions for Gmail/IMAP access
const scopes = [
	"https://mail.google.com/", // Full access to Gmail account
	"https://www.googleapis.com/auth/gmail.modify", // Read/write access to Gmail but can't delete
	"https://www.googleapis.com/auth/gmail.readonly", // Read-only access to Gmail
	"https://www.googleapis.com/auth/gmail.labels", // Manage labels and mail filters
	"https://www.googleapis.com/auth/gmail.settings.basic", // Access to basic mail settings
];

// Create the authorization URL
const authUrl = oauth2Client.generateAuthUrl({
	access_type: "offline",
	scope: scopes,
});

Bun.serve({
	port: process.env.PORT || 3000,
	async fetch(req) {
		const url = new URL(req.url);

		// Root endpoint - redirect to Google OAuth
		if (url.pathname === "/") {
			return new Response(null, {
				status: 302,
				headers: {
					Location: authUrl,
				},
			});
		}

		// OAuth callback endpoint
		if (url.pathname === "/oauth2callback") {
			const code = url.searchParams.get("code");

			if (!code) {
				return new Response(
					JSON.stringify({
						success: false,
						message: "No authorization code provided",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}

			try {
				const { tokens } = await oauth2Client.getToken(code);

				browser.kill()

				// Write tokens to IMAP package .env file
				const envContent = `IMAP_USERNAME=${process.env.GOOGLE_EMAIL}
IMAP_ACCESS_TOKEN=${tokens.access_token}`;

				await writeFile(
					join(import.meta.dir, "../../packages/imap/.env"),
					envContent
				);

				console.log("Tokens written to packages/imap/.env");

				return new Response(
					`You may close this window.`,
					{
						status: 200,
						headers: { "Content-Type": "text/plain" },
					},
				);
			} catch (error) {
				console.error("Error getting tokens:", error);
				return new Response(
					JSON.stringify({
						success: false,
						message: "Authentication failed",
					}),
					{
						status: 400,
						headers: { "Content-Type": "application/json" },
					},
				);
			}
		}

		// Handle 404
		return new Response("Not Found", { status: 404 });
	},
});

console.log(`Go to ${authUrl}`);
const browser = Bun.spawn(["open", "-a", "Arc", authUrl]);