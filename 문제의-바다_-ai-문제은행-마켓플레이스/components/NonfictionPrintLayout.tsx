
import React from 'react';

// This component is no longer used as PDF generation is now handled by pdfmake
// directly from data, without rendering a React component to an intermediate format.
// Keeping the file to avoid breaking imports, but its content is cleared.
const NonfictionPrintLayout: React.FC = () => {
  return null;
};

export default NonfictionPrintLayout;
