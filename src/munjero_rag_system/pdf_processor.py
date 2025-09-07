import re
import pdfplumber
import json

def parse_problem_block(problem_text):
    """
    Parses a single problem block to extract the question and options.
    Includes pre-processing for line break restoration and option separation.
    """
    # Normalize line breaks: ensure "다." is followed by a newline
    processed_text = re.sub(r"(다\.)", r"\1\n", problem_text)
    
    # Ensure options start on a new line for easier parsing
    processed_text = re.sub(r"(①|②|③|④|⑤)", r"\n\1", processed_text)
    
    # Remove multiple newlines, replace with single newline for consistency
    processed_text = re.sub(r"\n\s*\n", "\n", processed_text).strip()

    question_match = re.match(r"^(.*?)(?=①)", processed_text, re.DOTALL)
    question = question_match.group(1).strip() if question_match else processed_text.split('①')[0].strip()

    options_match = re.search(r"①(.*?)②(.*?)③(.*?)④(.*?)⑤(.*)", processed_text, re.DOTALL)
    options = []
    if options_match:
        for i in range(1, 6):
            option = options_match.group(i).strip()
            if option:
                options.append(option)
    
    return {"질문": question, "선택지": options}

def extract_structured_content_from_pdf(pdf_file_obj, y_gap_threshold=25):
    """
    Extracts structured content (passages and problems) from a PDF using pdfplumber,
    handling two-column layouts based on detected vertical lines.
    """
    structured_content = []

    with pdfplumber.open(pdf_file_obj) as pdf:
        for page in pdf.pages:
            current_page_blocks = []

            # Define header and footer exclusion zones (adjust these values as needed)
            HEADER_EXCLUSION_HEIGHT = 220
            FOOTER_EXCLUSION_HEIGHT = 120
            
            page_height = page.height
            header_exclusion_y_bottom = HEADER_EXCLUSION_HEIGHT
            footer_exclusion_y_top = page_height - FOOTER_EXCLUSION_HEIGHT

            # --- Column Detection ---
            column_separator_x = None
            # Look for a prominent vertical line in the middle of the page
            # A common x-coordinate for a separator in a standard A4 page (width ~595) would be around 297.5
            # For this PDF (width 842), middle is around 421.
            # Let's look for a vertical line that is at least 50% of the page height
            # and is roughly in the middle third of the page (x between 842/3 and 2*842/3)
            min_x_for_separator = page.width / 3
            max_x_for_separator = 2 * page.width / 3

            for line in page.lines:
                # Check if it's a vertical line (x0 close to x1)
                # and if it's long enough (y span > 50% of page height)
                # and if it's within the expected middle region
                if (abs(line['x0'] - line['x1']) < 5 and # Almost vertical
                    abs(line['y0'] - line['y1']) > (page_height * 0.5) and # Long enough
                    min_x_for_separator < line['x0'] < max_x_for_separator):
                    column_separator_x = line['x0']
                    break # Assume the first one found is the main separator

            # --- Process Content by Column ---
            # If a column separator is found, process each column independently
            if column_separator_x:
                column_regions = [
                    (0, column_separator_x), # Left column
                    (column_separator_x, page.width) # Right column
                ]
            else:
                # No column separator, treat as a single column spanning the whole width
                column_regions = [(0, page.width)]

            for col_idx, (x_start, x_end) in enumerate(column_regions):
                # Filter words and rectangles for the current column
                words_in_column = [
                    w for w in page.extract_words(extra_attrs=["x0","y0","x1","y1","top","bottom","text"])
                    if x_start <= w['x0'] < x_end
                ]
                rects_in_column = [
                    r for r in page.rects
                    if x_start <= r['x0'] < x_end
                ]

                # Apply header/footer exclusion to words and rects for this column
                filtered_words_for_column = [
                    word for word in words_in_column
                    if not (word['top'] < header_exclusion_y_bottom or word['bottom'] > footer_exclusion_y_top)
                ]
                filtered_rects_for_column = [
                    rect for rect in rects_in_column
                    if not (rect['top'] < header_exclusion_y_bottom or rect['bottom'] > footer_exclusion_y_top)
                ]

                # Sort words by their top and then x0 for reading order within the column
                filtered_words_for_column.sort(key=lambda w: (w["top"], w["x0"]))

                words_already_processed_in_rects = set()
                # --- 1. Identify Rectangles (Main Passages) within this column ---
                for rect in filtered_rects_for_column:
                    # Extract text within the rectangle
                    # Note: Cropping needs to be relative to the original page, not just the column
                    cropped_page = page.crop((rect['x0'], rect['y0'], rect['x1'], rect['y1']))
                    rect_text = cropped_page.extract_text().strip()
                    
                    # Identify words within this rectangle to exclude them from later word processing
                    words_in_this_rect = cropped_page.extract_words(extra_attrs=["x0","y0","x1","y1","top","bottom","text"])
                    for w_in_rect in words_in_this_rect:
                        words_already_processed_in_rects.add((w_in_rect['x0'], w_in_rect['y0'], w_in_rect['x1'], w_in_rect['y1']))

                    if rect_text:
                        passage_range_match = re.search(r"^[(\d+)～(\d+)]", rect_text, re.MULTILINE)
                        if passage_range_match:
                            start_num = passage_range_match.group(1)
                            end_num = passage_range_match.group(2)
                            content_text = rect_text[passage_range_match.end():].strip()
                            current_page_blocks.append({
                                "type": "본문",
                                "본문범위": f"{start_num}～{end_num}",
                                "내용": content_text,
                                "top": rect['top'],
                                "x0": rect['x0'] # Keep original x0 for sorting later
                            })
                        else:
                            current_page_blocks.append({
                                "type": "본문",
                                "본문범위": "없음",
                                "내용": rect_text,
                                "top": rect['top'],
                                "x0": rect['x0']
                            })

                # --- 2. Identify Problem Blocks and General Text by Pattern Matching within this column ---
                current_block_text = ""
                current_block_type = "일반텍스트" # Default type
                current_block_start_top = None
                current_block_start_x0 = None

                # Regex patterns for different block types
                QUESTION_START_PATTERN = re.compile(r"^\\s*(\\d+)\\s*\\.") # e.g., "1."
                OPTION_START_PATTERN = re.compile(r"^\\s*(①|②|③|④|⑤)") # e.g., "①"
                PASSAGE_RANGE_PATTERN = re.compile(r"^\\s*\\[\\s*(\\d+)～(\\d+)\\s*\\]") # e.g., "[1～3]"

                for i, word in enumerate(filtered_words_for_column):
                    # Skip words that are inside identified rectangles (passages) - these are handled separately
                    # Check if the word's bounding box is in the set of words already processed from rectangles
                    if (word['x0'], word['y0'], word['x1'], word['y1']) in words_already_processed_in_rects:
                        continue

                    # Determine if this word starts a new block type
                    word_text_strip = word["text"].strip()
                    is_new_question_start = QUESTION_START_PATTERN.match(word_text_strip)
                    is_new_option_start = OPTION_START_PATTERN.match(word_text_strip)
                    is_new_passage_range_start = PASSAGE_RANGE_PATTERN.match(word_text_strip)

                    # Logic to finalize current block and start a new one
                    # If a new block type is detected OR a significant vertical gap (for general text/passage)
                    # AND there's accumulated text in current_block_text
                    if (is_new_question_start or is_new_passage_range_start or is_new_option_start or\
                        (current_block_start_top is not None and (word["top"] - current_block_start_top) > y_gap_threshold)) and \
                       current_block_text.strip():
                        
                        # Finalize the previous block
                        if current_block_type == "문제":
                            print(f"--- DEBUG: Identified Problem Block (raw text) ---\n{current_block_text.strip()}\n--------------------------------------------------")
                            # Store the raw text of the problem block
                            problem_num_match = QUESTION_START_PATTERN.match(current_block_text.strip())
                            problem_number = int(problem_num_match.group(1)) if problem_num_match else None
                            
                            current_page_blocks.append({
                                "type": "문제",
                                "문제번호": problem_number, # Store the number if found
                                "내용": current_block_text.strip(), # Store the raw content
                                "top": current_block_start_top,
                                "x0": current_block_start_x0
                            })
                        elif current_block_type == "본문_패턴": # For passages identified by pattern, not rect
                            passage_range_match = PASSAGE_RANGE_PATTERN.match(current_block_text.strip())
                            if passage_range_match:
                                start_num = passage_range_match.group(1)
                                end_num = passage_range_match.group(2)
                                content_text = current_block_text[passage_range_match.end():].strip()
                                current_page_blocks.append({
                                    "type": "본문",
                                    "본문범위": f"{start_num}～{end_num}",
                                    "내용": content_text,
                                    "top": current_block_start_top,
                                    "x0": current_block_start_x0
                                })
                            else:
                                current_page_blocks.append({
                                    "type": "일반텍스트",
                                    "내용": current_block_text,
                                    "top": current_block_start_top,
                                    "x0": current_block_start_x0
                                })
                        else: # General text or options that weren't part of a problem block
                            current_page_blocks.append({
                                "type": current_block_type, # Could be "일반텍스트" or "선택지" if we track it
                                "내용": current_block_text,
                                "top": current_block_start_top,
                                "x0": current_block_start_x0
                            })
                        
                        # Reset for new block
                        current_block_text = ""
                        current_block_start_top = word["top"]
                        current_block_start_x0 = word["x0"]
                        
                        if is_new_question_start:
                            current_block_type = "문제"
                        elif is_new_passage_range_start:
                            current_block_type = "본문_패턴" # Differentiate from rect-based 본문
                        elif is_new_option_start:
                            current_block_type = "선택지_단독" # Options not part of a question block
                        else:
                            current_block_type = "일반텍스트"

                    # Append word to current block
                    if current_block_start_top is None: # First word in a block
                        current_block_start_top = word["top"]
                        current_block_start_x0 = word["x0"]
                    
                    current_block_text += word["text"] + " "
                
                # Process any remaining text in current_block_text after loop
                if current_block_text.strip():
                    # Finalize the last block (similar logic as above)
                    if current_block_type == "문제":
                        print(f"--- DEBUG: Identified Problem Block (raw text, end of column) ---\n{current_block_text.strip()}\n--------------------------------------------------")
                        # Store the raw text of the problem block
                        problem_num_match = QUESTION_START_PATTERN.match(current_block_text.strip())
                        problem_number = int(problem_num_match.group(1)) if problem_num_match else None
                        
                        current_page_blocks.append({
                            "type": "문제",
                            "문제번호": problem_number, # Store the number if found
                            "내용": current_block_text.strip(), # Store the raw content
                            "top": current_block_start_top,
                            "x0": current_block_start_x0
                        })
                    elif current_block_type == "본문_패턴":
                        passage_range_match = PASSAGE_RANGE_PATTERN.match(current_block_text.strip())
                        if passage_range_match:
                            start_num = passage_range_match.group(1)
                            end_num = passage_range_match.group(2)
                            content_text = current_block_text[passage_range_match.end():].strip()
                            current_page_blocks.append({
                                "type": "본문",
                                "본문범위": f"{start_num}～{end_num}",
                                "내용": content_text,
                                "top": current_block_start_top,
                                "x0": current_block_start_x0
                            })
                        else:
                            current_page_blocks.append({
                                "type": "일반텍스트",
                                "내용": current_block_text,
                                "top": current_block_start_top,
                                "x0": current_block_start_x0
                            })
                    else:
                        current_page_blocks.append({
                            "type": current_block_type,
                            "내용": current_block_text,
                            "top": current_block_start_top,
                            "x0": current_block_start_x0
                        })

            # Sort all blocks on the current page by their top coordinate, then by x0 for reading order
            current_page_blocks.sort(key=lambda b: (b['top'], b['x0']))
            structured_content.extend(current_page_blocks)

    return structured_content
