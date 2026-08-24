"use client";

import { type SyntheticEvent, useState } from "react";

const emailAddress = "reshetnik.nikita@gmail.com";

/**
 * Renders a native-validating contact form that opens a prefilled mail client.
 *
 * @returns The contact form.
 */
export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const mailto = name || email || message
    ? `mailto:${emailAddress}?subject=${encodeURIComponent(`Portfolio message from ${name}`)}&body=${encodeURIComponent(`From: ${name} <${email}>\n\n${message}`)}`
    : `mailto:${emailAddress}`;

  /**
   * Hands the encoded mail action to the browser after native validation.
   *
   * @param event - Valid contact-form submission event.
   */
  function sendEmail(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    window.location.href = mailto;
  }

  const fieldClass =
    "rounded-md border bg-background px-3 py-2 outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

  return (
    <form action={mailto} className="space-y-5" onSubmit={sendEmail}>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-name">Name</label>
        <input
          className={`${fieldClass} h-11 w-full`}
          id="contact-name"
          name="name"
          onChange={(event) => {
            setName(event.target.value);
          }}
          placeholder="Your name"
          required
          type="text"
          value={name}
          autoComplete="name"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-email">Email</label>
        <input
          className={`${fieldClass} h-11 w-full`}
          id="contact-email"
          name="email"
          onChange={(event) => {
            setEmail(event.target.value);
          }}
          placeholder="m@example.com"
          required
          type="email"
          value={email}
          autoComplete="email"
        />
      </div>
      <div className="space-y-2">
        <label className="text-sm font-medium" htmlFor="contact-message">Message</label>
        <textarea
          className={`${fieldClass} min-h-28 w-full resize-y`}
          id="contact-message"
          name="message"
          onChange={(event) => {
            setMessage(event.target.value);
          }}
          placeholder="What would you like to discuss?"
          required
          rows={4}
          value={message}
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <button className="rounded-md bg-primary px-5 py-2.5 font-medium text-primary-foreground" type="submit">
          Send message
        </button>
        <span className="text-sm text-muted-foreground">Opens your mail app</span>
      </div>
      <p className="border-t pt-4 text-sm text-muted-foreground">
        No mail client?{" "}
        <a className="underline underline-offset-4" href={`mailto:${emailAddress}`}>
          {emailAddress}
        </a>
      </p>
    </form>
  );
}
