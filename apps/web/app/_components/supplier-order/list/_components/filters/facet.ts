/** One option of a filter, with how many orders it would leave. */
export type FacetChoice = { value: string; label: string; count?: number };

/** The chosen option of every filter, by its key. */
export type FilterValues = Record<string, string>;

/**
 * One way the list can be filtered — by status, by shop — as both the
 * desktop row and the phone drawer show it.
 *
 * - key: its name in FilterValues.
 * - name: what it filters, shown while nothing is chosen ("Status").
 * - value: the chosen option; "all" while unfiltered.
 * - choices: its options, "all" first.
 */
export type Facet = {
  key: string;
  name: string;
  value: string;
  choices: FacetChoice[];
};

/** The option a facet has chosen. */
export const chosen = (facet: Facet): FacetChoice =>
  facet.choices.find((choice) => choice.value === facet.value) ?? facet.choices[0];

/** What a facet's trigger says: its name, or once narrowed, the choice. */
export const facetLabel = (facet: Facet): string =>
  facet.value === 'all' ? facet.name : chosen(facet).label;

/** "1 order", "3 orders". */
export const orderCount = (count: number): string => `${count} ${count === 1 ? 'order' : 'orders'}`;
