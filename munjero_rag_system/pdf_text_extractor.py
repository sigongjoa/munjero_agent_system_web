import fitz  # PyMuPDF
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
            return True
    
    # Check for isolated page numbers (e.g., "1", "2", "11", "131", "171")
    if re.fullmatch(r'^\s*\d{1,3}\s*$', line):
        return True
    
    # Check for patterns like "11 수학능력시험 문제지" or "131 (화법과 작문)"
    if re.search(r'^\s*\d+\s*(수학능력시험 문제지|\(화법과 작문\)|\(언어와 매체\))', line):
        return True
    
    # Check for patterns like "제 1 교시" followed by a number
    if re.search(r'제\s*\d+\s*교시\s*\d*', line):
        return True

    return False

def extract_raw_text_from_pdf(pdf_path):
    """
    Extracts raw text from each page in a PDF using PyMuPDF's "text" method,
    and then applies header/footer filtering.
    
    Args:
        pdf_path (str): The absolute path to the PDF file.

    Returns:
        str: A single string containing all extracted text.
    """
    full_text = []
    
    try:
        doc = fitz.open(pdf_path)
        for page_num in range(len(doc)):
            page = doc.load_page(page_num)
            
            # Extract raw text from the page
            page_text = page.get_text("text") 
            
            extracted_lines = []
            if page_text:
                for line in page_text.split('\n'):
                    cleaned_line = line.strip()
                    if not is_header_footer_line(cleaned_line):
                        extracted_lines.append(cleaned_line)
            
            if extracted_lines:
                full_text.append('\n'.join(extracted_lines))
            
            full_text.append("--- Page End ---\n") # Separator for pages
        
        doc.close()

    except Exception as e:
        return f"Error processing PDF: {e}"

    return "\n".join(full_text)

if __name__ == "__main__":
    pdf_file_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/국어영역_문제지_홀수형.pdf"
    output_file_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/extracted_text.txt"

    try:
        extracted_content = extract_raw_text_from_pdf(pdf_file_path) # Changed function call
        
        with open(output_file_path, "w", encoding="utf-8") as f:
            f.write(extracted_content)
        
        print(f"Extracted text saved to: {output_file_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {pdf_file_path}")
    except Exception as e:
        print(f"An error occurred: {e}")