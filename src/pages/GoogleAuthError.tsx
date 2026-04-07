import { useSearchParams, useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { AlertTriangle, ArrowLeft, RefreshCw, Settings, Wifi, Clock } from 'lucide-react';

// ── Every reason slug that Settings.tsx can produce ─────────────────────────
const ERROR_MESSAGES: Record<string, { title: string; description: string; hint?: string }> = {
  provider_not_configured: {
    title: 'Google sign-in not set up',
    description:
      'The Google OAuth credentials are missing or invalid on the server. This is a configuration issue, not something you did wrong.',
    hint: 'If you\'re the app owner, go to your Supabase dashboard → Authentication → Providers → Google and add your Client ID and Secret.',
  },
  access_denied: {
    title: 'Access denied',
    description:
      "You declined the Google permission request. To connect your Google account you'll need to allow the requested permissions.",
  },
  no_code: {
    title: 'Missing authorisation code',
    description:
      "Google didn't return an authorisation code. This can happen if the request timed out or was interrupted. Please try again.",
  },
  token_exchange_failed: {
    title: 'Token exchange failed',
    description:
      "We couldn't exchange the authorisation code for access tokens. Please try connecting again.",
  },
  state_mismatch: {
    title: 'Security check failed',
    description:
      "The request state didn't match what we expected. This is a security measure — please start the connection again from Settings.",
  },
  already_connected: {
    title: 'Already connected',
    description: 'Your Google account is already linked. You can manage this in Settings.',
  },
  network_error: {
    title: 'Network error',
    description:
      "We couldn't reach the server. Check your internet connection and try again.",
  },
  rate_limited: {
    title: 'Too many attempts',
    description:
      'You\'ve made too many connection attempts in a short time. Please wait a few minutes and try again.',
  },
  unknown: {
    title: 'Something went wrong',
    description:
      'An unexpected error occurred while connecting your Google account. Please try again.',
  },
};

const FALLBACK: typeof ERROR_MESSAGES[string] = {
  title: 'Something went wrong',
  description:
    'An unexpected error occurred while connecting your Google account. Please try again.',
};

// Icon to show per reason
function ErrorIcon({ reason }: { reason: string }) {
  if (reason === 'network_error') {
    return (
      <div className="h-16 w-16 rounded-2xl bg-amber-100 flex items-center justify-center">
        <Wifi className="h-8 w-8 text-amber-600" />
      </div>
    );
  }
  if (reason === 'rate_limited') {
    return (
      <div className="h-16 w-16 rounded-2xl bg-amber-100 flex items-center justify-center">
        <Clock className="h-8 w-8 text-amber-600" />
      </div>
    );
  }
  return (
    <div className="h-16 w-16 rounded-2xl bg-destructive/10 flex items-center justify-center">
      <AlertTriangle className="h-8 w-8 text-destructive" />
    </div>
  );
}

export default function GoogleAuthError() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const reason = searchParams.get('reason') ?? 'unknown';
  const error = ERROR_MESSAGES[reason] ?? FALLBACK;

  // "already_connected" doesn't need a retry — just go to settings
  const isAlreadyConnected = reason === 'already_connected';
  // "provider_not_configured" is an admin issue — hide the retry button
  const isAdminError = reason === 'provider_not_configured';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="w-full max-w-[440px] space-y-6">

        {/* Icon with Google badge */}
        <div className="flex justify-center">
          <div className="relative">
            <ErrorIcon reason={reason} />
            <div className="absolute -bottom-1 -right-1 h-6 w-6 rounded-full bg-background border border-border flex items-center justify-center shadow-sm">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4" />
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05" />
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335" />
              </svg>
            </div>
          </div>
        </div>

        {/* Message */}
        <div className="text-center space-y-2">
          <h1 className="text-xl font-semibold">{error.title}</h1>
          <p className="text-sm text-muted-foreground leading-relaxed">{error.description}</p>

          {/* Admin hint box */}
          {error.hint && (
            <div className="mt-3 text-left bg-muted rounded-lg px-4 py-3 text-xs text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">How to fix: </span>
              {error.hint}
            </div>
          )}

          {/* Error code pill */}
          <p className="text-xs text-muted-foreground/50 font-mono bg-muted rounded-md px-3 py-1.5 inline-block mt-1">
            reason: {reason}
          </p>
        </div>

        {/* Actions */}
        <div className="flex flex-col gap-2">
          {!isAdminError && !isAlreadyConnected && (
            <Button className="w-full gap-2" onClick={() => navigate('/settings')}>
              <RefreshCw className="h-4 w-4" />
              Try connecting again
            </Button>
          )}
          <Button
            variant={isAdminError || isAlreadyConnected ? 'default' : 'outline'}
            className="w-full gap-2"
            onClick={() => navigate('/settings')}
          >
            <Settings className="h-4 w-4" />
            Go to Settings
          </Button>
          <Button
            variant="ghost"
            className="w-full gap-2 text-muted-foreground"
            onClick={() => navigate('/dashboard')}
          >
            <ArrowLeft className="h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>

        {/* Footer tip */}
        {!isAdminError && (
          <p className="text-center text-xs text-muted-foreground">
            If this keeps happening, try signing out of Google in your browser first, then connect again.
          </p>
        )}
      </div>
    </div>
  );
}