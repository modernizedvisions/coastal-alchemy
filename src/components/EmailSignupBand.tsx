import { EmailListSignupSection } from './email-list/EmailListSignupSection';

type EmailSignupBandProps = {
  className?: string;
};

export function EmailSignupBand({ className = '' }: EmailSignupBandProps) {
  return <EmailListSignupSection className={className} title="Join our Email List" subtitle="New drops, restocks, and updates from Dover Designs." />;
}
