// Page-level shared UI state. A value lives here only if it is written by one
// module, read by another, and has no natural owning module (see design §B1).
export const state = {
  currentProduct: null,
  currentInitialsColor: null, // set by main.js to INITIALS_COLORS[0]
  currentCategory: null,      // null = "Todos"
  currentColorFilter: null,
  firebasePhotosLoaded: false,
};
