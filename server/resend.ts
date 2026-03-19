import { Resend } from 'resend';

export async function getUncachableResendClient() {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    throw new Error('RESEND_API_KEY not configured');
  }
  return {
    client: new Resend(apiKey),
    fromEmail: 'onboarding@resend.dev',
  };
}
