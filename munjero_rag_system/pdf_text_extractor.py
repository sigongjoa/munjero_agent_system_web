import pdfplumber
import re

def is_header_footer_line(line):
    """
    Checks if a line is likely a header or footer based on its content.
    """
    line = line.strip()
    if not line:
        return True

    # Common header/footer patterns
    header_footer_keywords = [
        "홀수형", "짝수형", "2025학년도", "대학수학능력시험", "문제지",
        "제 1 교시", "화법과 작문", "언어와 매체", "수학능력능력시험 문제지"
    ]

    # Check if the line contains mostly header/footer keywords
    for keyword in header_footer_keywords:
        if keyword in line:
            # If the line is very short and contains a keyword, it's likely a header/footer
            if len(line) < 30 or len(line.split()) < 5: # Heuristic for short lines
                return True
    
    # Check for isolated page numbers (e.g., "1", "2", "11", "131", "171")
    # This regex looks for lines that are just numbers, possibly with spaces around them
    if re.fullmatch(r'^\s*\d{1,3}\s*$', line):
        return True
    
    # Check for patterns like "11 수학능력시험 문제지" or "131 (화법과 작문)"
    if re.search(r'^\s*\d+\s*(수학능력시험 문제지|\(화법과 작문\)|\(언어와 매체\))', line):
        return True
    
    # Check for patterns like "제 1 교시" followed by a number
    if re.search(r'제\s*\d+\s*교시\s*\d*', line):
        return True

    return False

def extract_text_from_pdf_sides(pdf_path):
    """
    Extracts text from the left and right sides of each page in a PDF,
    excluding header and footer areas, with post-processing for common patterns.

    Args:
        pdf_path (str): The absolute path to the PDF file.

    Returns:
        str: A single string containing all extracted text.
    """
    full_text = []
    
    # Define page dimensions and margins based on analysis.txt
    # Content area bounding box (x0, y0, x1, y1)
    content_bbox = (80, 150, 760, 950) # Adjusted based on previous attempts
    
    # Calculate mid-point for left and right halves
    page_width = 842
    mid_x = page_width / 2
    
    # Left half bounding box (relative to page, not content_bbox)
    left_bbox = (content_bbox[0], content_bbox[1], mid_x, content_bbox[3])
    
    # Right half bounding box (relative to page, not content_bbox)
    right_bbox = (mid_x, content_bbox[1], content_bbox[2], content_bbox[3])

    try:
        with pdfplumber.open(pdf_path) as pdf:
            for page_num, page in enumerate(pdf.pages):
                extracted_lines = []

                # Extract text from left side
                left_content = page.crop(left_bbox)
                left_text = left_content.extract_text()
                if left_text:
                    for line in left_text.split('\n'):
                        cleaned_line = line.strip() # Ensure line is stripped
                        if not is_header_footer_line(cleaned_line):
                            extracted_lines.append(cleaned_line)
                
                # Extract text from right side
                right_content = page.crop(right_bbox)
                right_text = right_content.extract_text()
                if right_text:
                    for line in right_text.split('\n'):
                        cleaned_line = line.strip() # Ensure line is stripped
                        if not is_header_footer_line(cleaned_line):
                            extracted_lines.append(cleaned_line)
                
                if extracted_lines:
                    full_text.append('\n'.join(extracted_lines))
                
                full_text.append("--- Page End ---\n") # Separator for pages

    except Exception as e:
        return f"Error processing PDF: {e}"

    return "\n".join(full_text)

if __name__ == "__main__":
    pdf_file_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/국어영역_문제지_홀수형.pdf"
    output_file_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/extracted_text.txt"

    try:
        extracted_content = extract_text_from_pdf_sides(pdf_file_path)
        
        with open(output_file_path, "w", encoding="utf-8") as f:
            f.write(extracted_content)
        
        print(f"Extracted text saved to: {output_file_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {pdf_file_path}")
    except Exception as e:
        print(f"An error occurred: {e}")