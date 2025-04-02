// Color utility functions
const colors = {
	command: (str: string) => `\x1b[36m${str}\x1b[0m`, // cyan
	response: (str: string) => `\x1b[32m${str}\x1b[0m`, // green
	untagged: (str: string) => `\x1b[33m${str}\x1b[0m`, // yellow
	error: (str: string) => `\x1b[31m${str}\x1b[0m`, // red
	id: (str: string) => `\x1b[35m${str}\x1b[0m`, // magenta
};

export function logCommand(id: string, command: string) {
	console.log(`${colors.id(id)} → ${colors.command(command)}`);
}

export function logResponse(id: string, response: string) {
	if (response.startsWith('*')) {
		console.log(`${colors.id(id)} ← ${colors.untagged(response.trim())}`);
	} else {
		console.log(`${colors.id(id)} ← ${colors.response(response.trim())}`);
	}
} 