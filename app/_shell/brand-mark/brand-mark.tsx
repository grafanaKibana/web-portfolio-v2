/**
 * Displays the decorative N/R mark from its shared vector asset.
 *
 * @param className - Size and color utilities supplied by the placement.
 * @returns The non-focusable brand symbol; its parent owns any accessible label.
 */
export function BrandMark({ className }: { className: string }) {
  return (
    <svg aria-hidden="true" className={className} data-slot="brand-mark" focusable="false" viewBox="0 0 256 224">
      <use href="/brand/mark.svg#mark" />
    </svg>
  );
}
