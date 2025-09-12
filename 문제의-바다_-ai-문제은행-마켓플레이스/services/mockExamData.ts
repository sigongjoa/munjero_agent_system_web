import type { ExamQuestion, TestConfig } from '../types';
import { ExamType, Subject } from '../types';

const mockDatabase: ExamQuestion[] = [
  // Suneung - Korean
  {
    exam: "SUNEUNG",
    year: 2023,
    source: "KICE",
    subject: "Korean",
    section: "Nonfiction",
    question_id: "S23-KR-NF-12",
    stem: "다음 글을 읽고 추론한 내용으로 가장 적절하지 않은 것은? (보기) 인공지능은 딥러닝 기술을 통해 특정 분야에서 인간의 능력을 뛰어넘는 성능을 보여주기도 한다. 하지만 인공지능의 판단 과정을 인간이 완벽하게 이해하기 어렵다는 '블랙박스' 문제는 여전히 해결해야 할 과제로 남아있다.",
    choices: [
      "① 딥러닝 기술은 인공지능 성능 향상의 핵심 요소이다.",
      "② 특정 분야에서 인공지능은 인간보다 뛰어날 수 있다.",
      "③ 인공지능의 모든 의사결정 과정은 투명하게 공개되어 있다.",
      "④ '블랙박스' 문제는 인공지능의 신뢰성과 관련된 쟁점이다.",
      "⑤ 인간이 인공지능의 작동 원리를 완전히 파악하지는 못했다."
    ],
    answer_index: 2,
    explanation: "보기에서 '인공지능의 판단 과정을 인간이 완벽하게 이해하기 어렵다'고 언급했으므로, 모든 의사결정 과정이 투명하게 공개되어 있다는 ③번 선택지는 글의 내용과 명백히 배치된다.",
    tags: ["비문학", "추론", "세부 정보 파악"],
    difficulty: 3
  },
  {
    exam: "SUNEUNG",
    year: 2024,
    source: "KICE",
    subject: "Korean",
    section: "Nonfiction",
    question_id: "S24-KR-NF-08",
    stem: "윗글의 내용과 일치하지 않는 것은? (지문) 조선 후기 실학자들은 농업 생산력 증대를 위해 다양한 기술을 연구했다. 특히 정약용은 '경세유표'에서 토지 제도의 개혁과 함께 수리 시설의 중요성을 강조하며, 효율적인 물 관리가 국가의 근간임을 역설했다.",
    choices: [
      "① 실학자들은 농업 기술 발전에 관심이 많았다.",
      "② 정약용은 토지 제도 개혁을 주장했다.",
      "③ '경세유표'는 농업 기술에 대한 내용을 담고 있다.",
      "④ 정약용은 물 관리의 중요성을 강조했다.",
      "⑤ 조선 후기에는 농업 생산력이 급격히 감소했다."
    ],
    answer_index: 4,
    explanation: "지문은 조선 후기 실학자들이 '농업 생산력 증대'를 위해 노력했다고 서술하고 있을 뿐, 생산력이 급격히 감소했다는 정보는 포함하고 있지 않다. 따라서 ⑤번 선택지는 지문의 내용과 일치하지 않는다.",
    tags: ["비문학", "내용 일치", "인물/사상 파악"],
    difficulty: 2
  },
  // Suneung - English
  {
    exam: "SUNEUNG",
    year: 2023,
    source: "KICE",
    subject: "English",
    section: "Reading Comprehension",
    question_id: "S23-EN-RC-31",
    stem: "Which of the following best expresses the main idea of the passage? (Passage) The rise of social media has fundamentally changed the way we consume news. While traditional media outlets served as gatekeepers, platforms like Twitter and Facebook allow information to spread rapidly, often without editorial oversight. This democratization of information has both positive and negative consequences.",
    choices: [
      "① The benefits of traditional media outweigh its drawbacks.",
      "② Social media has transformed news consumption, bringing both opportunities and challenges.",
      "③ Twitter is the most reliable source for breaking news.",
      "④ Editorial oversight is no longer necessary in the digital age.",
      "⑤ The primary role of social media is entertainment, not information."
    ],
    answer_index: 1,
    explanation: "The passage introduces the topic of social media's impact on news and explicitly states this change has 'both positive and negative consequences'. Choice ② correctly summarizes this central theme of transformation with dual aspects.",
    tags: ["독해", "요지 파악", "매체 비평"],
    difficulty: 3
  },
  {
    exam: "SUNEUNG",
    year: 2024,
    source: "KICE",
    subject: "English",
    section: "Reading Comprehension",
    question_id: "S24-EN-RC-22",
    stem: "According to the passage, why is biodiversity important for an ecosystem? (Passage) Biodiversity, the variety of life in a particular habitat, is crucial for ecosystem resilience. A wide range of species ensures that if one species is wiped out by disease or environmental change, others can fill its niche, maintaining the overall stability and health of the ecosystem.",
    choices: [
        "① It increases the ecosystem's vulnerability to diseases.",
        "② It guarantees that all species will survive any environmental change.",
        "③ It helps the ecosystem to remain stable and recover from disturbances.",
        "④ It simplifies the food web, making it more efficient.",
        "⑤ It is only important in tropical rainforests."
    ],
    answer_index: 2,
    explanation: "The passage states that biodiversity is 'crucial for ecosystem resilience' and that a variety of species helps in 'maintaining the overall stability and health of the ecosystem' after disturbances. This directly supports choice ③.",
    tags: ["독해", "세부 정보 파악", "과학"],
    difficulty: 2
  }
];

// This function simulates querying a database
export function getMockQuestions(examType: ExamType, subject: Subject, count: number): ExamQuestion[] {
  const subjectStr = subject.toString();
  const examTypeStr = examType.toString();

  const filtered = mockDatabase.filter(q => 
    q.exam.toLowerCase().includes(examTypeStr.split('/')[0].toLowerCase()) &&
    q.subject.toLowerCase() === subjectStr.toLowerCase()
  );

  // Return a random subset of the filtered questions
  return filtered.sort(() => 0.5 - Math.random()).slice(0, count);
}
