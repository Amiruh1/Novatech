import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  email?: string;
  name?: string;
  sub: string;
}

export async function verifyGoogleCredential(credential: string, clientId: string): Promise<GoogleIdentity | undefined> {
  const oauth2Client = new OAuth2Client(clientId);
  const ticket = await oauth2Client.verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload();
  return payload ? { email: payload.email, name: payload.name, sub: payload.sub } : undefined;
}
