"use client";

import { clsx } from "clsx";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { credentialEdgeFade, type CredentialEdgeFade } from "./credential-edge-fade";
import styles from "./education.module.scss";

/**
 * Keeps credential fades and keyboard access aligned with native vertical overflow.
 *
 * @param children - Server-rendered credential rows.
 * @param potentialOverflow - Whether SSR should expose the track to keyboard scrolling.
 * @param singleColumn - Whether every credential occupies its own row.
 * @returns A bounded, scrollable credential list.
 */
export function CredentialTrack({
  children,
  potentialOverflow,
  singleColumn,
}: {
  children: ReactNode;
  potentialOverflow: boolean;
  singleColumn: boolean;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [fade, setFade] = useState<CredentialEdgeFade>("none");
  const [overflow, setOverflow] = useState(potentialOverflow);

  useEffect(() => {
    const scrollport = scrollRef.current;
    const list = listRef.current;
    if (!scrollport || !list) return;

    /** Fits two credentials and a visible part of the next one. */
    const measureWindow = () => {
      const first = list.children.item(0);
      const second = list.children.item(1);
      const third = list.children.item(2);
      if (!first || !second || !third) {
        scrollport.style.removeProperty("height");
        return;
      }

      const listTop = list.getBoundingClientRect().top;
      const secondBottom = Math.max(first.getBoundingClientRect().bottom, second.getBoundingClientRect().bottom);
      const thirdBox = third.getBoundingClientRect();
      const height = Math.ceil(Math.max(secondBottom, thirdBox.top) - listTop + thirdBox.height * 0.45);
      if (Math.abs(scrollport.clientHeight - height) > 1) scrollport.style.height = `${String(height)}px`;
    };

    /** Updates edge cues after scrolling or content/viewport resizing. */
    const update = () => {
      const edges = credentialEdgeFade(scrollport.scrollTop, scrollport.clientHeight, scrollport.scrollHeight);
      setFade(edges.fade);
      setOverflow(edges.overflow);
    };

    measureWindow();
    update();
    scrollport.addEventListener("scroll", update, { passive: true });
    const observer = new ResizeObserver(() => {
      measureWindow();
      update();
    });
    observer.observe(scrollport);
    observer.observe(list);
    const mutations = new MutationObserver(() => {
      measureWindow();
      update();
    });
    mutations.observe(list, { childList: true });

    return () => {
      scrollport.removeEventListener("scroll", update);
      observer.disconnect();
      mutations.disconnect();
    };
  }, []);

  return (
    <div
      aria-label="Professional credentials"
      className={clsx(
        styles.credentialScrollport,
        "overflow-y-auto overscroll-y-auto [scrollbar-width:none] focus-visible:rounded focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring [&::-webkit-scrollbar]:hidden",
        potentialOverflow && "h-54 md:h-34",
      )}
      data-edge-fade={fade}
      data-lenis-native-scroll
      data-slot="credential-scrollport"
      ref={scrollRef}
      role="region"
      tabIndex={overflow ? 0 : -1}
    >
      <ul
        className="m-0 grid list-none grid-cols-[minmax(0,1fr)] content-start p-0 md:data-[single-column=false]:grid-cols-2 md:data-[single-column=false]:gap-x-5"
        data-single-column={singleColumn}
        data-slot="credential-list"
        ref={listRef}
      >
        {children}
      </ul>
    </div>
  );
}
