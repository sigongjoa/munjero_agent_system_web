import json
import re

def parse_extracted_text(text_content):
    problem_sets_data = []
    
    # Problem set title pattern: [X～Y] 다음 글을 읽고 물음에 답하시오.
    # This regex is designed to match the title line and capture it.
    # Using re.MULTILINE to make '^' and '$' match start/end of lines.
    problem_set_title_regex = re.compile(r'^[\d+～\d+\] 다음 글을 읽고 물음에 답하시오\.$', re.MULTILINE)
    
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
        question_area_start_index = len(content_block)
        first_question_match_in_block = re.search(r'\d+\.\s', content_block)
        if first_question_match_in_block:
            question_area_start_index = first_question_match_in_block.start()
        
        passage_area_content = content_block[:question_area_start_index].strip()
        question_area_content = content_block[question_area_start_index:].strip()

        passage_label_regex = re.compile(r'((가|나|다|라|마))')
        passage_sub_parts = passage_label_regex.split(passage_area_content)
        
        if passage_sub_parts and passage_sub_parts[0].strip():
            current_problem_set["passages"].append({
                "label": None,
                "content": passage_sub_parts[0].strip()
            })
        
        for j in range(1, len(passage_sub_parts), 2):
            label = passage_sub_parts[j].strip() # Label already includes parentheses
            content = passage_sub_parts[j+1].strip()
            if content:
                current_problem_set["passages"].append({
                    "label": label,
                    "content": content
                })

        # --- Question and Option Parsing ---
        question_line_regex = re.compile(r'(\d+\.\s*(.*?)(?:\s*\[(\d+)점\])?)(?=\n|\s*[①②③④⑤])', re.DOTALL)
        question_matches = list(question_line_regex.finditer(question_area_content))
        print(f"DEBUG: Question matches for {title}: {len(question_matches)}")
        
        for q_idx, q_match in enumerate(question_matches):
            full_question_line = q_match.group(1).strip()
            
            question_num_match = re.match(r'(\d+\.)', full_question_line)
            question_num = question_num_match.group(1) if question_num_match else None
            
            text_and_points_part = full_question_line[len(question_num):].strip() if question_num else full_question_line.strip()
            
            points_match = re.search(r'\[(\d+)점\]', text_and_points_part)
            question_points = points_match.group(1) if points_match else None
            
            question_text = re.sub(r'\s*\[\d+점\]', '', text_and_points_part).strip()

            options_block_start = q_match.end()
            options_block_end = question_matches[q_idx+1].start() if q_idx + 1 < len(question_matches) else len(question_area_content)
            options_content = question_area_content[options_block_start:options_block_end].strip()

            current_question = {
                "number": question_num,
                "question_text": question_text,
                "points": question_points,
                "options": []
            }
            
            # Option parsing using re.findall to get all options and their content
            # This regex captures the label and the content up to the next label or end of string.
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
        
        cleaned_content = extracted_content.replace("--- Page End ---\n", "").strip()

        structured_data = parse_extracted_text(cleaned_content)
        
        with open(output_json_path, "w", encoding="utf-8") as json_f:
            json.dump(structured_data, json_f, ensure_ascii=False, indent=2)
        
        print(f"Structured data saved to: {output_json_path}")

    except FileNotFoundError:
        print(f"Error: Input file not found at {input_file_path}")
    except Exception as e:
        print(f"An error occurred: {e}")
