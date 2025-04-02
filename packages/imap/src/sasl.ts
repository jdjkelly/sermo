export interface SASLMechanism<T> {
  (params: T): string;
}

export interface XOAUTH2Params {
	username: string;
	accessToken: string;
}

export const XOAUTH2: SASLMechanism<XOAUTH2Params> = (params) => {
	return Buffer.from(
		`user=${params.username}\x01auth=Bearer ${params.accessToken}\x01\x01`,
	).toString("base64");
};
