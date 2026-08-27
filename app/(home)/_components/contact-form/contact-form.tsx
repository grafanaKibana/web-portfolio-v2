"use client";

import { clsx } from "clsx";
import { type SyntheticEvent, useState } from "react";
import { PrimaryAction } from "../primary-action/primary-action";
import styles from "./home-contact.module.scss";

interface ContactFormProps {
  emailAddress: string;
}

const labels = {
  bodyFrom: "From:",
  email: "Email",
  emailPlaceholder: "m@example.com",
  invalidEmail: "Enter a valid email address",
  message: "Message",
  messagePlaceholder: "What would you like to discuss?",
  missingSuffix: "still empty",
  name: "Name",
  namePlaceholder: "Your name",
  send: "Send message",
  subjectPrefix: "Portfolio message from",
} as const;

/**
 * Renders a native-validating contact form that opens a prefilled mail client.
 *
 * @param props - Contact email destination.
 * @returns The contact form.
 */
export function ContactForm(props: ContactFormProps) {
  const { emailAddress } = props;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [message, setMessage] = useState("");
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedMessage = message.trim();
  const isReady = Boolean(trimmedName && trimmedEmail && isEmailValid && trimmedMessage);
  const subject = `${labels.subjectPrefix} ${trimmedName}`;
  const mailtoHref = isReady
    ? `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${labels.bodyFrom} ${trimmedName} <${trimmedEmail}>\n\n${trimmedMessage}`)}`
    : `mailto:${emailAddress}`;
  let helperText = "";
  if (trimmedName || trimmedEmail || trimmedMessage) {
    if (!trimmedName) {
      helperText = `${labels.name} ${labels.missingSuffix}`;
    } else if (!trimmedEmail) {
      helperText = `${labels.email} ${labels.missingSuffix}`;
    } else if (!trimmedMessage) {
      helperText = `${labels.message} ${labels.missingSuffix}`;
    } else if (!isEmailValid) {
      helperText = labels.invalidEmail;
    }
  }

  /**
   * Hands the encoded mail action to the browser after native validation.
   *
   * @param event - Valid contact-form submission event.
   */
  function sendEmail(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    window.location.href = mailtoHref;
  }

  const fieldClass =
    "rounded-md border bg-background px-3 py-2 transition-colors focus:border-foreground focus:outline-none user-invalid:border-destructive motion-reduce:transition-none";

  return (
    <form action={mailtoHref} className={clsx(styles.form, "flex h-full min-w-0 flex-col gap-4")} onSubmit={sendEmail}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-name">{labels.name}</label>
        <input
          className={`${fieldClass} h-11 w-full`}
          id="contact-name"
          name="name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder={labels.namePlaceholder}
          required
          type="text"
          value={name}
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-email">{labels.email}</label>
        <input
          className={`${fieldClass} h-11 w-full`}
          id="contact-email"
          name="email"
          onChange={(event) => {
            setEmail(event.target.value);
            setIsEmailValid(!event.currentTarget.validity.typeMismatch);
          }}
          placeholder={labels.emailPlaceholder}
          required
          type="email"
          value={email}
          autoComplete="email"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="contact-message">{labels.message}</label>
        <textarea
          className={`${fieldClass} min-h-28 w-full flex-1 resize-y`}
          id="contact-message"
          name="message"
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          placeholder={labels.messagePlaceholder}
          required
          rows={4}
          value={message}
        />
      </div>
      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:gap-5">
        <PrimaryAction disabled={!isReady} type="submit">
          {labels.send}
        </PrimaryAction>
        {helperText ? <span aria-live="polite" className="text-sm text-muted-foreground">{helperText}</span> : null}
      </div>
    </form>
  );
}
