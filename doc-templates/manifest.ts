// Manifest of available HTML templates bundled with the app
// Add new entries when you add more HTML files under doc-templates/

export type TemplateItem = {
  id: string; // unique identifier (derived from filename)
  title: string; // display name
  asset: number; // require() asset id
  filename: string;
};

// NOTE: Metro requires static require paths. Add new templates here.
export const templates: TemplateItem[] = [
  {
    id: 'proforma-invoice',
    title: 'Proforma Invoice',
    asset: require('./proforma-invoice.html'),
    filename: 'proforma-invoice.html',
  },
  {
    id: 'sales-invoice',
    title: 'Sales Invoice',
    asset: require('./sales-invoice.html'),
    filename: 'sales-invoice.html',
  },
];
