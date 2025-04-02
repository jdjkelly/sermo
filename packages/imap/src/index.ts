import { randomBytes } from "crypto";
import { EventEmitter } from "events";
import type { Socket } from "net";
import { connect } from "tls";
import { XOAUTH2, type XOAUTH2Params } from "./sasl";
import { logCommand, logResponse } from "./logger";

interface IMAPEvents {
	ready: () => void;
	untagged: (response: string) => void;
	response: (data: { id: string; response: string | null | undefined }) => void;
	// Dynamic event types for response:${id}
	[key: `response:${string}`]: (response: string | null | undefined) => void;
}

type IMAPCommand = 
	| "CAPABILITY"
	| "NOOP"
	| "LOGOUT"
	| { type: "SELECT" | "EXAMINE"; mailbox: string }
	| { type: "AUTHENTICATE"; method: "XOAUTH2"; token: string }
	| { 
		type: "FETCH"; 
		sequence: string; // e.g. "1:*", "1,2,3", "1:10"
		items: Array<"FLAGS" | "ENVELOPE" | "BODY" | "UID">
	}
	| { type: "STORE"; sequence: string; flags: string[] }
	| { type: "SEARCH"; criteria: string[] }
	| { type: "LIST"; reference: string; mailbox: string };

// Extend EventEmitter with the typed events
class IMAPConnection extends EventEmitter {
	private host: string;
	private port: number;
	private socket: Socket;
	private token: string;
	private log: Map<string, string | null>;
	public ready: boolean = false;

	constructor(host: string, port: number, xoauth2Params: XOAUTH2Params) {
		super();
		this.host = host;
		this.port = port;
		this.log = new Map();
		this.token = XOAUTH2(xoauth2Params);
		this.onData = this.onData.bind(this);
		this.socket = this.connect();
	}

	private connect() {
		const socket = connect({ host: this.host, port: this.port }, () => {
			this.sendCommand({ 
				type: "AUTHENTICATE", 
				method: "XOAUTH2", 
				token: this.token 
			});
			this.emit("ready");
		});
		socket.on("data", this.onData);
		return socket;
	}

	public emit<K extends keyof IMAPEvents>(
		event: K,
		...args: Parameters<IMAPEvents[K]>
	): boolean {
		return super.emit(event, ...args);
	}

	public on<K extends keyof IMAPEvents>(
		event: K,
		listener: IMAPEvents[K]
	): this {
		return super.on(event, listener);
	}

	public once<K extends keyof IMAPEvents>(
		event: K,
		listener: IMAPEvents[K]
	): this {
		return super.once(event, listener);
	}

	onData(data: Buffer<ArrayBufferLike>) {
		const response = data.toString();
		const lines = response.split("\r\n");

		for (const line of lines) {
			if (!line) continue;

			const match = line.match(/^([a-f0-9]{8}) /);
			if (match) {
				const [_, id] = match;
				const currentLog = this.log.get(id) || "";
				this.log.set(id, currentLog + line + "\n");
				this.emit(`response:${id}`, this.log.get(id));
				this.emit("response", { id, response: this.log.get(id) });
			} else if (line.startsWith("*")) {
				const lastId = Array.from(this.log.keys()).pop();
				if (lastId) {
					const currentLog = this.log.get(lastId) || "";
					this.log.set(lastId, currentLog + line + "\n");
				}
				this.emit("untagged", line);
			}
		}
	}

	private formatCommand(command: IMAPCommand): string {
		if (typeof command === "string") {
			return command;
		}

		switch (command.type) {
			case "SELECT":
			case "EXAMINE":
				return `${command.type} "${command.mailbox}"`;
			
			case "AUTHENTICATE":
				return `AUTHENTICATE ${command.method} ${command.token}`;
			
			case "FETCH":
				return `FETCH ${command.sequence} (${command.items.join(" ")})`;
			
			case "STORE":
				return `STORE ${command.sequence} +FLAGS (${command.flags.join(" ")})`;
			
			case "SEARCH":
				return `SEARCH ${command.criteria.join(" ")}`;
			
			case "LIST":
				return `LIST "${command.reference}" "${command.mailbox}"`;
			
			default:
				throw new Error(`Unknown command type: ${(command as any).type}`);
		}
	}

	sendCommand(command: IMAPCommand, callback?: (response: string | null | undefined) => void): string {
		if (!this.socket) {
			throw new Error("Connection not initialized");
		}
		const id = randomBytes(4).toString("hex");
		this.log.set(id, null);
		const formattedCommand = this.formatCommand(command);
		const fullCommand = `${id} ${formattedCommand}\r\n`;
		
		logCommand(id, formattedCommand);
		
		this.socket.write(fullCommand);
		this.once(`response:${id}`, (response) => {
			if (response) {
				const lines = response.split('\n');
				lines.forEach(line => {
					if (line.trim()) {
						logResponse(id, line);
					}
				});
			}
			if (callback) {
				callback(response);
			}
		});
		return id;
	}
}
// Usage example:
const imap = new IMAPConnection("imap.gmail.com", 993, {
	username: process.env.IMAP_USERNAME!,
	accessToken: process.env.IMAP_ACCESS_TOKEN!,
});

imap.on("ready", () => {
	imap.sendCommand({ 
		type: "SELECT", 
		mailbox: "INBOX" 
	}, (selectResponse) => {
		const existsMatch = selectResponse?.match(/\* (\d+) EXISTS/);
		const total = existsMatch ? parseInt(existsMatch[1]) : 0;
		const start = Math.max(1, total - 3);

		imap.sendCommand({ 
			type: "FETCH",
			sequence: `${start}:*`,
			items: ["FLAGS", "ENVELOPE"]
		}, (response) => {
			if (response) {
				console.log("\nLast messages:");
				console.log("----------------");
				const messages = response
					.split("\n")
					.filter(line => line.includes("ENVELOPE"))
					.map(line => {
						const envelopeMatch = line.match(/ENVELOPE \((.*)/);
						if (envelopeMatch) {
							try {
								// Get the full envelope data, handling potential multi-line responses
								let envelopeData = envelopeMatch[1];
								if (!envelopeData.endsWith("))")) {
									// If envelope data is split across lines, find the end
									const remainingLines = line.split("\n");
									for (const remainingLine of remainingLines) {
										envelopeData += remainingLine;
										if (remainingLine.includes("))")) break;
									}
								}

								// Parse the envelope parts more carefully
								const parts = envelopeData.match(/"([^"]*)"|\(((?:[^()]*|\([^()]*\))*)\)/g) || [];
								
								const date = parts[0]?.replace(/"/g, '') || 'No Date';
								const subject = parts[1]?.replace(/"/g, '') || 'No Subject';
								
								// Handle encoded subjects
								const decodedSubject = subject.startsWith('=?') 
									? decodeIMAPString(subject)
									: subject;

								// Extract from information
								const fromPart = parts.find(p => p.startsWith('(('));
								const fromMatch = fromPart?.match(/\(\((.*?)\)\)/);
								const fromInfo = fromMatch ? fromMatch[1].split(' ') : [];
								
								const fromName = decodeIMAPString(fromInfo[0]?.replace(/"/g, '') || 'Unknown');
								const fromEmail = fromInfo[3]?.replace(/"/g, '') || 'unknown@email';

								return `From: ${fromName} <${fromEmail}> - Subject: ${decodedSubject}`;
							} catch (err) {
								console.error('Error parsing message:', err);
								return `Error parsing message: ${err.message}`;
							}
						}
						return null;
					})
					.filter(Boolean);
				
				messages.forEach(msg => console.log(msg));
			}
		});
	});
});

// Helper function to decode IMAP strings
function decodeIMAPString(str: string): string {
	if (!str.startsWith('=?')) return str;
	
	try {
		// Handle UTF-8 quoted printable encoding
		if (str.includes('?Q?')) {
			return str
				.replace(/=\?UTF-8\?Q\?/gi, '')
				.replace(/\?=/g, '')
				.replace(/=([0-9A-F]{2})/gi, (_, p1) => 
					String.fromCharCode(parseInt(p1, 16)))
				.replace(/=E2=80=9C/g, '"')  // Smart quotes
				.replace(/=E2=80=9D/g, '"');
		}
		
		// Handle UTF-8 base64 encoding
		if (str.includes('?B?')) {
			const encoded = str.match(/=\?UTF-8\?B\?(.*?)\?=/)?.[1] || '';
			return Buffer.from(encoded, 'base64').toString('utf8');
		}
	} catch (err) {
		console.error('Error decoding string:', str, err);
	}
	return str;
}

// // You can also listen for all responses
// imap.on("response", ({ id, response }) => {
// 	console.log(`Command ${id} completed with:`, response);
// });

// // Or listen for untagged responses
// imap.on("untagged", (response) => {
// 	console.log("Untagged:", response);
// });

