import json
import re

def parse_extracted_text(text_content):
    problem_sets_data = []
    
    # Debugging: Print raw content
    print(f"DEBUG: Raw content start: {repr(text_content[:50])}")

    # Problem set title pattern: [X～Y] 다음 글을 읽고 물음에 답하시오.
    # This regex is designed to match the title line and capture it.
    # Using re.MULTILINE to make '^' and '$' match start/end of lines.
    problem_set_title_regex = re.compile(r'[\d+～\d+] 다음 글을 읽고 물음에 답하시오.', re.MULTILINE) # Problem set title pattern: [X～Y] 다음 글을 읽고 물음에 답하시오.
    
    # Find all problem set titles and their positions.
    problem_set_matches = list(problem_set_title_regex.finditer(text_content))
    print(f"DEBUG: Total problem set matches found: {len(problem_set_matches)}")

    if not problem_set_matches:
        print("Warning: No problem set titles found. Parsing might be incomplete.")
        return []

    for i, match in enumerate(problem_set_matches):
        title = match.group(0).strip() # group(0) is the entire match
        
        # Determine the content block for the current problem set.
        # It's from the end of the current title match to the start of the next title match.
        start_content = match.end()
        end_content = problem_set_matches[i+1].start() if i+1 < len(problem_set_matches) else len(text_content)
        content_block = text_content[start_content:end_content].strip()
        
        current_problem_set = {
            "problem_set_title": title,
            "passages": [],
            "questions": []
        }
        
        # --- Passage Parsing ---
        # Find the first occurrence of a question number pattern to separate passage from questions
        first_question_match_in_block = re.search(r'\n\d+\.\s', content_block) # Look for newline before number
        
        if first_question_match_in_block:
            passage_end_index = first_question_match_in_block.start()
            passage_area_content = content_block[:passage_end_index].strip()
            question_area_content = content_block[passage_end_index:].strip()
        else:
            # If no question numbers found, treat the whole block as passage
            passage_area_content = content_block.strip()
            question_area_content = ""

        # Always treat the entire passage_area_content as a single passage
        if passage_area_content:
            current_problem_set["passages"].append({
                "label": None,
                "content": passage_area_content
            })

        # --- Question and Option Parsing ---
        # Split the question_area_content into individual question blocks
        # The regex captures the question number (e.g., "1. ") as a delimiter
        question_blocks = re.split(r'(\d+\.\s*)', question_area_content)
        
        # The split result will be like: ['', '1. ', 'Question 1 text and options', '2. ', 'Question 2 text and options', ...]
        # We need to pair the question number with its content.
        
        # Filter out empty strings and combine number with content
        parsed_question_blocks = []
        for j in range(1, len(question_blocks), 2):
            if j + 1 < len(question_blocks):
                parsed_question_blocks.append(question_blocks[j] + question_blocks[j+1])

        print(f"DEBUG: Parsed question blocks for {title}: {len(parsed_question_blocks)}")

        for q_block_content in parsed_question_blocks:
            # Extract question number, text, and points
            question_num_match = re.match(r'(\d+\.\s*)', q_block_content)
            question_num = question_num_match.group(1).strip() if question_num_match else None
            
            # Remove question number from the block to get the rest of the content
            remaining_content = q_block_content[len(question_num_match.group(0)):].strip() if question_num_match else q_block_content.strip()

            points_match = re.search(r'[(\d+)점]', remaining_content)
            question_points = points_match.group(1) if points_match else None
            
            # Remove points from the remaining content to get pure question text
            question_text_with_options = re.sub(r'\s*[\d+점]', '', remaining_content).strip()

            # Find the start of options (first circled number)
            first_option_match = re.search(r'[①②③④⑤]', question_text_with_options)
            if first_option_match:
                question_text = question_text_with_options[:first_option_match.start()].strip()
                options_content = question_text_with_options[first_option_match.start():].strip()
            else:
                question_text = question_text_with_options.strip()
                options_content = "" # No options found

            current_question = {
                "number": question_num,
                "question_text": question_text,
                "points": question_points,
                "options": []
            }
            
            # Option parsing using re.findall to get all options and their content
            option_regex = re.compile(r'([①②③④⑤])(.*?)(?=[①②③④⑤]|$)', re.DOTALL)
            option_matches = option_regex.findall(options_content)
            print(f"DEBUG: Option matches for question {question_num}: {len(option_matches)}")

            for option_label, option_content_text in option_matches:
                current_question["options"].append({
                    "label": option_label,
                    "content": option_content_text.strip()
                })
            
            current_problem_set["questions"].append(current_question)

        problem_sets_data.append(current_problem_set)
        
    return problem_sets_data

if __name__ == "__main__":
    input_file_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/extracted_text.txt"
    output_json_path = "/mnt/d/progress/munjero_rag_system/munjero_rag_system/structured_text.json"

    try:
        with open(input_file_path, "r", encoding="utf-8") as f:
            extracted_content = f.read()
        
        cleaned_content = extracted_content.replace("--- Page End ---", "").strip()

        structured_data = parse_extracted_text(cleaned_content)
        
        with open(output_json_path, "w", encoding="utf-8") as json_f:
            json.dump(structured_data, json_f, ensure_ascii=False, indent=2)
        
        print(f"Structured data saved to: {output_json_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {input_file_path}")
    except Exception as e:
        print(f"An error occurred: {e}")