"use client";

import { clsx } from "clsx";
import { type SyntheticEvent, useState } from "react";
import { PrimaryAction } from "../primary-action/primary-action";
import styles from "./home-contact.module.scss";

interface ContactFormProps {
  emailAddress: string;
  emailLabel: string;
  emailPlaceholder: string;
  bodyFromLabel: string;
  invalidEmailHelper: string;
  messageLabel: string;
  messagePlaceholder: string;
  missingSuffix: string;
  nameLabel: string;
  namePlaceholder: string;
  sendLabel: string;
  subjectPrefix: string;
}

/**
 * Renders a native-validating contact form that opens a prefilled mail client.
 *
 * @param props - YAML-backed Contact form copy and email destination.
 * @returns The contact form.
 */
export function ContactForm(props: ContactFormProps) {
  const {
    bodyFromLabel,
    emailAddress,
    emailLabel,
    emailPlaceholder,
    invalidEmailHelper,
    messageLabel,
    messagePlaceholder,
    missingSuffix,
    nameLabel,
    namePlaceholder,
    sendLabel,
    subjectPrefix,
  } = props;
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [isEmailValid, setIsEmailValid] = useState(false);
  const [message, setMessage] = useState("");
  const trimmedName = name.trim();
  const trimmedEmail = email.trim();
  const trimmedMessage = message.trim();
  const isReady = Boolean(trimmedName && trimmedEmail && isEmailValid && trimmedMessage);
  const subject = `${subjectPrefix} ${trimmedName}`;
  const mailtoHref = isReady
    ? `mailto:${emailAddress}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(`${bodyFromLabel} ${trimmedName} <${trimmedEmail}>\n\n${trimmedMessage}`)}`
    : `mailto:${emailAddress}`;
  let helperText = "";
  if (trimmedName || trimmedEmail || trimmedMessage) {
    if (!trimmedName) {
      helperText = `${nameLabel} ${missingSuffix}`;
    } else if (!trimmedEmail) {
      helperText = `${emailLabel} ${missingSuffix}`;
    } else if (!trimmedMessage) {
      helperText = `${messageLabel} ${missingSuffix}`;
    } else if (!isEmailValid) {
      helperText = invalidEmailHelper;
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
    "rounded-md border bg-background px-3 py-2 focus-visible:outline focus-visible:outline-2 focus-visible:outline-foreground focus-visible:outline-offset-2 user-invalid:border-destructive";

  return (
    <form action={mailtoHref} className={clsx(styles.form, "flex h-full min-w-0 flex-col gap-4")} onSubmit={sendEmail}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-name">{nameLabel}</label>
        <input
          className={`${fieldClass} h-11 w-full`}
          id="contact-name"
          name="name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder={namePlaceholder}
          required
          type="text"
          value={name}
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-email">{emailLabel}</label>
        <input
          className={`${fieldClass} h-11 w-full`}
          id="contact-email"
          name="email"
          onChange={(event) => {
            setEmail(event.target.value);
            setIsEmailValid(!event.currentTarget.validity.typeMismatch);
          }}
          placeholder={emailPlaceholder}
          required
          type="email"
          value={email}
          autoComplete="email"
        />
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2">
        <label className="text-sm font-medium" htmlFor="contact-message">{messageLabel}</label>
        <textarea
          className={`${fieldClass} min-h-28 w-full flex-1 resize-y`}
          id="contact-message"
          name="message"
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          placeholder={messagePlaceholder}
          required
          rows={4}
          value={message}
        />
      </div>
      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:gap-5">
        <PrimaryAction disabled={!isReady} type="submit">
          {sendLabel}
        </PrimaryAction>
        {helperText ? <span aria-live="polite" className="text-sm text-muted-foreground">{helperText}</span> : null}
      </div>
    </form>
  );
}
