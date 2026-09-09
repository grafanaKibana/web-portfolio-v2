"use client";

import { type SyntheticEvent, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { buildMailtoHref } from "./build-mailto-href";

interface ContactFormProps {
  emailAddress: string;
}

const labels = {
  email: "Email",
  emailPlaceholder: "m@example.com",
  invalidEmail: "Enter a valid email address",
  message: "Message",
  messagePlaceholder: "What would you like to discuss?",
  missingSuffix: "still empty",
  name: "Name",
  namePlaceholder: "Your name",
  send: "Send message",
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
  const isEmailInvalid = Boolean(trimmedEmail) && !isEmailValid;
  const isReady = Boolean(trimmedName && trimmedEmail && isEmailValid && trimmedMessage);
  const mailtoHref = isReady
    ? buildMailtoHref(emailAddress, trimmedName, trimmedEmail, trimmedMessage)
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

  return (
    <form className="flex h-full min-w-0 flex-col gap-4" data-page-motion-row onSubmit={sendEmail}>
      <Field>
        <FieldLabel htmlFor="contact-name">{labels.name}</FieldLabel>
        <Input
          className="placeholder:text-content-foreground"
          id="contact-name"
          name="name"
          onInput={(event) => {
            setName(event.currentTarget.value);
          }}
          placeholder={labels.namePlaceholder}
          required
          type="text"
          value={name}
          autoComplete="name"
        />
      </Field>
      <Field data-invalid={isEmailInvalid}>
        <FieldLabel htmlFor="contact-email">{labels.email}</FieldLabel>
        <Input
          className="placeholder:text-content-foreground"
          aria-invalid={isEmailInvalid}
          id="contact-email"
          name="email"
          onInput={(event) => {
            setEmail(event.currentTarget.value);
            setIsEmailValid(!event.currentTarget.validity.typeMismatch);
          }}
          placeholder={labels.emailPlaceholder}
          required
          type="email"
          value={email}
          autoComplete="email"
        />
      </Field>
      <Field className="min-h-0 flex-1">
        <FieldLabel htmlFor="contact-message">{labels.message}</FieldLabel>
        <Textarea
          className="min-h-28 flex-1 resize-y placeholder:text-content-foreground"
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
      </Field>
      <div className="flex flex-col gap-3 pt-3 sm:flex-row sm:items-center sm:gap-5">
        <Button className="w-full sm:w-auto" disabled={!isReady} type="submit">
          {labels.send}
        </Button>
        {helperText ? <span aria-live="polite" className="text-sm text-muted-foreground">{helperText}</span> : null}
      </div>
    </form>
  );
}
