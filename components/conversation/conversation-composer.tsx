import { ArrowUp, Sparkle } from "lucide-react";
import { clsx } from "clsx";
import type { KeyboardEvent, SyntheticEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldLabel } from "@/components/ui/field";
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupTextarea } from "@/components/ui/input-group";
import type { UseConversationResult } from "./conversation.models";
import { conversationConfig } from "./conversation.config";
import styles from "./conversation-composer.module.scss";

const { maxConversationInputLength } = conversationConfig;

/** Shared prompt shown by every editable and retained conversation entry. */
export const conversationPlaceholder = "Ask about my work…";

/** Paints the resizable field shell independently of its unscaled controls.
 * @returns Shared field surface for editable and retained entries.
 */
export function ConversationFieldSurface() {
  return <span aria-hidden className={clsx("field-surface", styles.fieldSurface)} data-composer-surface><span data-composer-accent /></span>;
}

/** Properties for the conversation's single active editable composer. */
export interface ConversationComposerProps {
  model: UseConversationResult;
  entry?: boolean;
  mobile?: boolean;
  onAccepted?: ((turnId: string) => void) | undefined;
}

/** Renders shared page-entry and thread-composer geometry around one model input.
 * @param entry - Whether the composer is the direct page-entry presentation.
 * @param mobile - Whether accepted sends should dismiss typing focus.
 * @param model - Persistent conversation state and actions.
 * @param onAccepted - Callback receiving each synchronously admitted turn ID.
 * @returns The single editable composer for its current host.
 */
export function ConversationComposer({
  entry = false,
  mobile = false,
  model,
  onAccepted,
}: ConversationComposerProps) {
  const { draft, inputId, inputRef, pending, setDraft, turns } = model;
  const latestTurn = turns.at(-1);
  const suggestions = mobile && !draft && !pending && latestTurn?.status === "complete"
    ? latestTurn.followUps ?? []
    : [];

  /** Submits through the model and transfers hosts only after synchronous acceptance.
   * @param event - Native composer submission.
   */
  function handleSubmit(event: SyntheticEvent<HTMLFormElement, SubmitEvent>) {
    event.preventDefault();
    if (pending) return;
    const result = model.submit();
    if (!result.accepted) return;
    onAccepted?.(result.turnId);
    if (mobile) {
      inputRef.current?.blur();
    } else if (!entry) {
      inputRef.current?.focus({ preventScroll: true });
    }
  }

  /** Submits Enter while preserving Shift+Enter and IME composition.
   * @param event - Composer keyboard event.
   */
  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    event.currentTarget.form?.requestSubmit();
  }

  /** Prefills a generated continuation for editing without sending it.
   * @param question - Full generated follow-up question.
   */
  function handleSuggestion(question: string) {
    inputRef.current?.setCustomValidity("");
    setDraft(question);
    inputRef.current?.focus({ preventScroll: true });
  }

  return (
    <form
      className={clsx("shrink-0", styles.composer)}
      data-conversation-composer
      data-entry={entry || undefined}
      data-mobile={mobile || undefined}
      onSubmit={handleSubmit}
    >
      <Field>
        <FieldLabel className="sr-only" htmlFor={inputId}>Your question</FieldLabel>
        <InputGroup className={clsx(styles.inputGroup, mobile && styles.mobileGroup)}>
          <ConversationFieldSurface />
          {suggestions.length > 0 ? (
            <InputGroupAddon
              align="block-start"
              aria-label="Suggested questions"
              className={styles.mobileSuggestions}
              data-mobile-suggestions
              data-composer-content
              onClick={(event) => {
                if (!(event.target as HTMLElement).closest("button")) inputRef.current?.focus({ preventScroll: true });
              }}
            >
              {suggestions.map(({ label, question }) => (
                <Button
                  className={styles.suggestion}
                  key={`${label}\u0000${question}`}
                  onClick={() => { handleSuggestion(question); }}
                  size="xs"
                  type="button"
                  variant="ghost"
                >
                  {label}
                </Button>
              ))}
            </InputGroupAddon>
          ) : null}
          <div className={styles.inputRow} data-composer-content data-composer-row>
            {entry || !mobile ? (
              <InputGroupAddon align="inline-start" className={styles.entryAddon} onClick={() => { inputRef.current?.focus({ preventScroll: true }); }}>
                <Sparkle aria-hidden className={styles.entryStar} data-entry-composer-star />
              </InputGroupAddon>
            ) : null}
            <InputGroupTextarea
              autoComplete="off"
              className={clsx(styles.textarea, mobile && styles.mobileTextarea)}
              id={inputId}
              maxLength={maxConversationInputLength}
              name="question"
              onChange={(event) => {
                event.currentTarget.setCustomValidity("");
                setDraft(event.currentTarget.value);
              }}
              onKeyDown={handleKeyDown}
              placeholder={conversationPlaceholder}
              ref={inputRef}
              required
              rows={1}
              value={draft}
            />
            <InputGroupButton
              aria-label={pending ? "Stop" : "Send"}
              className={clsx(styles.submit, mobile && styles.mobileSubmit)}
              data-pending={pending || undefined}
              onClick={pending
                ? (event) => {
                    event.preventDefault();
                    model.stop();
                    inputRef.current?.focus({ preventScroll: true });
                  }
                : undefined}
              size="sm"
              type={pending ? "button" : "submit"}
              variant="default"
            >
              {pending ? "Stop" : mobile ? <ArrowUp aria-hidden /> : "Send"}
            </InputGroupButton>
          </div>
        </InputGroup>
      </Field>
    </form>
  );
}
