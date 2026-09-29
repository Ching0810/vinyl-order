/**
 * `true` when A and B are the same union, `false` otherwise. Compile-time only.
 *
 * Wrapped in tuples so a union is compared as a whole rather than one member at
 * a time — a bare `A extends B` would distribute and ask the question per member.
 */
export type SameUnion<A, B> = [A] extends [B] ? ([B] extends [A] ? true : false) : false;
