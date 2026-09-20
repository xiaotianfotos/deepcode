/** Compact mobile tool groups; retain wrapping for larger user fonts or extra plugins. */
export const COMPOSER_ROW_CSS: string = `
@media (max-width: 767px) {
  [data-composer-card] > div:has(> div > [data-slot='conversation.input.left']),
  [data-composer-card] div:has(> [data-slot='conversation.input.left']),
  [data-composer-card] div:has(> [data-slot='conversation.input.right']) {
    gap: 6px;
  }
}
@media (max-width: 400px) {
  [data-composer-card] [aria-label*='选择模型'],
  [data-composer-card] [aria-label*='model'] {
    max-width: 104px;
  }
  [data-composer-card] [aria-label*='选择模型'] span,
  [data-composer-card] [aria-label*='model'] span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
}
`
