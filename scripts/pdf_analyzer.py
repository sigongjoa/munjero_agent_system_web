import pdfplumber
import sys
import os

def analyze_pdf_layout(pdf_path):
    """
    Analyzes the layout of a PDF file, writing information about text, rectangles, lines, and images to a text file.
    """
    output_file_path = pdf_path.replace(".pdf", "_analysis.txt")
    
    try:
        with open(output_file_path, "w", encoding="utf-8") as outfile:
            with pdfplumber.open(pdf_path) as pdf:
                outfile.write(f"\nAnalyzing PDF: {pdf_path}\n")
                for i, page in enumerate(pdf.pages):
                    outfile.write(f"\n--- Page {i + 1} ---\n")
                    outfile.write(f"Page Dimensions: Width={page.width}, Height={page.height}\n")

                    outfile.write("\n--- Text Elements ---\n")
                    words = page.extract_words(extra_attrs=["x0", "y0", "x1", "y1", "top", "bottom"])
                    if words:
                        for word in words:
                            outfile.write(f"  Text: '{word["text"]}' | BBox: (x0={word["x0"]:.2f}, y0={word["y0"]:.2f}, x1={word["x1"]:.2f}, y1={word["y1"]:.2f}) | Top={word["top"]:.2f}, Bottom={word["bottom"]:.2f})\n")
                    else:
                        outfile.write("  No text elements found on this page.\n")

                    outfile.write("\n--- Rectangles ---\n")
                    if page.rects:
                        for rect in page.rects:
                            outfile.write(f"  Rect: (x0={rect["x0"]:.2f}, y0={rect["y0"]:.2f}, x1={rect["x1"]:.2f}, y1={rect["y1"]:.2f}) | Top={rect["top"]:.2f}, Bottom={rect["bottom"]:.2f})\n")
                    else:
                        outfile.write("  No rectangles found on this page.\n")

                    outfile.write("\n--- Lines ---\n")
                    if page.lines:
                        for line in page.lines:
                            outfile.write(f"  Line: (x0={line["x0"]:.2f}, y0={line["y0"]:.2f}, x1={line["x1"]:.2f}, y1={line["y1"]:.2f})\n")
                    else:
                        outfile.write("  No lines found on this page.\n")

                    outfile.write("\n--- Images ---\n")
                    if page.images:
                        for img in page.images:
                            outfile.write(f"  Image: (x0={img["x0"]:.2f}, y0={img["y0"]:.2f}, x1={img["x1"]:.2f}, y1={img["y1"]:.2f})\n")
                    else:
                        outfile.write("  No images found on this page.\n")
            
            print(f"Analysis complete. Output saved to: {output_file_path}")

    except Exception as e:
        print(f"Error analyzing PDF: {e}")

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python pdf_analyzer.py <path_to_pdf_file>")
        sys.exit(1)
    
    pdf_file_path = sys.argv[1]
    analyze_pdf_layout(pdf_file_path)

# Coordinate Interpretation for Header/Footer:
# - pdfplumber uses a coordinate system where (0,0) is the bottom-left of the page.
# - 'top' refers to the top edge of the element (distance from the top of the page).
# - 'bottom' refers to the bottom edge of the element (distance from the top of the page).
# - For headers, look for elements with small 'top' values (e.g., 0 to 50).
# - For footers, look for elements with 'bottom' values close to the page height (e.g., page.height - 50 to page.height).
#   Note: 'bottom' is also measured from the top of the page, so a larger 'bottom' value means it's further down the page.
#   A more intuitive way for footers might be to consider elements whose 'top' is close to 'page.height - footer_height_threshold'.
#   Example: If page.height is 792, and footer is 50 units high, then elements with top > (792 - 50) = 742 are likely in the footer.