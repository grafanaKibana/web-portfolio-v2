/**
 * Builds the encoded portfolio contact email link.
 *
 * @param recipient - Contact email destination.
 * @param name - Sender name.
 * @param email - Sender email address.
 * @param message - Sender message.
 * @returns The encoded mailto link.
 */
export function buildMailtoHref(
  recipient: string,
  name: string,
  email: string,
  message: string,
): string {
  const subject = `Portfolio message from ${name}`;
  const body = `From: ${name} <${email}>\n\n${message}`;

  return `mailto:${recipient}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
