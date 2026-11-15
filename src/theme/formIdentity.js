import { createContext, createElement, useContext } from 'react';

/**
 * One colour per form. The form colour leads every chart on that form's pages;
 * comparisons sit in grey and status colours (STATUS) only ever mean status.
 * Ramp: dark (text on pale, emphasis), base (main series), light, mid (extra
 * parts of one whole), pale (bands, tiles).
 */
export const FORM_IDENTITY = {
  ecph: {
    key: 'ecph', name: 'EC / pH', nameAr: 'الملوحة والحموضة',
    dark: '#0b5e5e', base: '#0f8a8a', light: '#7cc6c2', mid: '#b5e0dd', pale: '#e3f3f2',
    icon: 'M9 3h6M10 3v6l-5 9a2 2 0 0 0 1.7 3h10.6a2 2 0 0 0 1.7-3l-5-9V3M7.5 15h9',
  },
  fertigation: {
    key: 'fertigation', name: 'Fertigation', nameAr: 'التسميد',
    dark: '#4a3391', base: '#6d4fc2', light: '#b3a2e6', mid: '#d6ccf3', pale: '#efebfa',
    icon: 'M5 19c0-8 5-13 14-14-1 9-6 14-14 14zM5 19l7-7',
  },
  irrigation: {
    key: 'irrigation', name: 'Irrigation', nameAr: 'الري',
    dark: '#1f4f9a', base: '#2f6fd0', light: '#94b6ec', mid: '#c6d8f5', pale: '#e8f0fb',
    icon: 'M12 3c3.5 4.5 6 7.6 6 11a6 6 0 0 1-12 0c0-3.4 2.5-6.5 6-11z',
  },
  harvest: {
    key: 'harvest', name: 'Harvest', nameAr: 'الحصاد',
    dark: '#9a3a17', base: '#d0562a', light: '#eeaa8c', mid: '#f5cdb9', pale: '#fbece6',
    icon: 'M4 10h16l-1.5 9h-13zM8 10l3-6M16 10l-3-6M9 14v2M15 14v2',
  },
  cropRotation: {
    key: 'cropRotation', name: 'Crop rotation', nameAr: 'الدورة الزراعية',
    dark: '#2a6421', base: '#3d8b2f', light: '#9ccc8f', mid: '#c9e4c1', pale: '#ebf5e8',
    icon: 'M20 12a8 8 0 0 1-14 5.3M4 12a8 8 0 0 1 14-5.3M18 3v4h-4M6 21v-4h4',
  },
  pumpRoom: {
    key: 'pumpRoom', name: 'Pump room', nameAr: 'غرفة المضخات',
    dark: '#33435a', base: '#4a5d78', light: '#a3b0c4', mid: '#cdd5e0', pale: '#edf0f5',
    icon: 'M12 20a8 8 0 1 1 8-8M12 12l4-3M3 20h18',
  },
  economics: {
    key: 'economics', name: 'Economics', nameAr: 'الاقتصاديات',
    dark: '#735812', base: '#a07c1c', light: '#d8c07a', mid: '#ebddb2', pale: '#f7f1e1',
    icon: 'M12 8c4 0 7-1.3 7-3s-3-3-7-3-7 1.3-7 3 3 3 7 3zM5 5v6c0 1.7 3 3 7 3s7-1.3 7-3V5M5 11v6c0 1.7 3 3 7 3s7-1.3 7-3v-6',
  },
};

/** Reserved for state. Always shown with a word and an icon, never colour alone. */
export const STATUS = {
  good: { label: 'Good', color: '#2b8a3e', bg: '#e3f4e6', icon: 'M5 12l5 5 9-10' },
  warn: { label: 'Watch', color: '#9a6415', bg: '#fbf0dc', icon: 'M12 8v5M12 17h.01' },
  out: { label: 'Out', color: '#c0392b', bg: '#fbe5e2', icon: 'M6 6l12 12M18 6L6 18' },
  none: { label: 'No data', color: '#5f6a63', bg: '#eceeeb', icon: 'M5 12h14' },
};

/** The comparison series (last period, plan, "in" side) is always this grey. */
export const COMPARE_GREY = '#9aa39c';

/** Ordered colours for parts of one whole within a form: dark → base → light → mid. */
export function formParts(id) {
  const f = id || FORM_IDENTITY.ecph;
  return [f.dark, f.base, f.light, f.mid];
}

const FormIdentityContext = createContext(null);

export function FormIdentityProvider({ form, children }) {
  const value = typeof form === 'string' ? FORM_IDENTITY[form] || null : form || null;
  return createElement(FormIdentityContext.Provider, { value }, children);
}

/** The current form's identity, or null outside a form page. */
export function useFormIdentity() {
  return useContext(FormIdentityContext);
}
