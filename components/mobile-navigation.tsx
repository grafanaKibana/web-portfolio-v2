"use client";

import { Dialog } from "@base-ui/react/dialog";
import { Menu, X } from "lucide-react";
import Link from "next/link";

const links = [
  { href: "/projects", label: "Projects" },
  { href: "/articles", label: "Articles" },
];

/**
 * Renders the keyboard-accessible mobile navigation dialog.
 *
 * @returns The mobile navigation trigger and dialog.
 */
export function MobileNavigation() {
  return (
    <Dialog.Root modal>
      <Dialog.Trigger
        aria-label="Open navigation"
        className="inline-flex size-11 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 sm:hidden"
      >
        <Menu aria-hidden="true" className="size-5" />
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-40 bg-foreground/20" />
        <Dialog.Popup
          finalFocus
          className="fixed inset-x-0 top-0 z-50 border-b bg-background px-6 pb-8 pt-5 shadow-lg sm:hidden"
        >
          <div className="flex items-center justify-between">
            <Dialog.Title className="font-medium">Navigation</Dialog.Title>
            <Dialog.Close
              aria-label="Close navigation"
              className="inline-flex size-11 items-center justify-center rounded-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
            >
              <X aria-hidden="true" className="size-5" />
            </Dialog.Close>
          </div>
          <nav aria-label="Mobile navigation" className="mt-6 flex flex-col">
            {links.map((link) => (
              <Dialog.Close
                key={link.href}
                render={
                  <Link
                    className="border-t py-4 text-lg font-medium focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 last:border-b"
                    href={link.href}
                  />
                }
              >
                {link.label}
              </Dialog.Close>
            ))}
          </nav>
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
