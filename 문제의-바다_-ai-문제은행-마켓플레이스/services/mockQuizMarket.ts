import type { QuizSet } from '../types';

const mockQuizSets: QuizSet[] = [
    {
        id: 'quiz_1',
        title: 'PSAT 자료해석 핵심 스킬',
        description: 'PSAT 자료해석 영역의 시간 단축을 위한 필수 스킬과 꿀팁을 담은 문제집입니다. 표와 그래프를 빠르게 분석하는 능력을 길러보세요.',
        author: { id: 'user_02', name: '공직의 신', isVerified: true },
        price: 5000,
        rating: 4.8,
        downloads: 1250,
        tags: ['PSAT', '자료해석', '공무원'],
        createdAt: '2024-05-20T10:00:00Z',
        questions: [
            {
                question: '다음 표는 A국의 연도별 GDP 성장률을 나타낸다. 2021년 대비 2023년 GDP는 약 몇 % 증가했는가?',
                options: ['5.0%', '5.1%', '5.2%', '5.3%'],
                answer: 1,
                explanation: '2022년은 100 * 1.02 = 102, 2023년은 102 * 1.03 = 105.06 이므로, 2021년 대비 약 5.1% 증가했다.'
            },
            {
                question: '그래프의 A, B, C 항목 중 전년대비 증가율이 가장 높은 해는?',
                options: ['A항목, 2021년', 'B항목, 2022년', 'C항목, 2023년', 'A항목, 2022년'],
                answer: 0,
                explanation: '각 항목의 전년대비 증가율을 계산하여 가장 높은 값을 찾습니다.'
            }
        ]
    },
    {
        id: 'quiz_2',
        title: '수능 영어 어법 최종 점검',
        description: '수능에 자주 출제되는 어법 유형만을 모아 최종 점검할 수 있도록 구성했습니다. 헷갈리는 문법 개념을 확실히 잡아보세요.',
        author: { id: 'user_03', name: '영어 마스터', isVerified: true },
        price: 3000,
        rating: 4.6,
        downloads: 890,
        tags: ['수능', '영어', '어법', '고등'],
        createdAt: '2024-05-18T14:30:00Z',
        questions: [
            {
                question: '다음 문장에서 어법상 틀린 부분을 고르시오: The number of students who wants to major in computer science are increasing.',
                options: ['The number', 'who wants', 'to major', 'are increasing'],
                answer: 3,
                explanation: "'The number of ~' 구문은 단수 취급하므로 동사는 'is increasing'이 되어야 합니다. 또한 'who'의 선행사는 'students'이므로 'want'가 맞습니다. 하지만 주동사 수일치가 더 큰 오류입니다."
            }
        ]
    },
    {
        id: 'quiz_3',
        title: 'NCS 의사소통능력 실전 모의고사',
        description: '실제 NCS 시험과 유사한 형태의 문제들로 구성된 모의고사입니다. 문서 이해, 작성, 경청, 의사표현 능력을 종합적으로 테스트합니다.',
        author: { id: 'user_04', name: '취업의 달인', isVerified: false },
        price: 0,
        rating: 4.9,
        downloads: 5300,
        tags: ['NCS', '의사소통', '취업', '무료'],
        createdAt: '2024-05-21T09:00:00Z',
        questions: [
            {
                question: '다음 보고서의 핵심 내용으로 가장 적절한 것은?',
                options: ['제품 개발 일정', '마케팅 전략 제안', '예산 삭감 요청', '인력 충원 계획'],
                answer: 1,
                explanation: '보고서의 제목과 결론 부분을 통해 핵심 내용이 마케팅 전략 제안임을 파악할 수 있습니다.'
            },
            {
                question: '다음 대화를 듣고, 김대리가 다음으로 해야 할 일은?',
                options: ['회의록 작성', '거래처에 전화', '부장님께 보고', '자료 복사'],
                answer: 2,
                explanation: '대화 마지막 부분에서 부장님이 김대리에게 거래처에 관련 내용을 전달하라고 지시했습니다.'
            }
        ]
    },
     {
        id: 'quiz_4',
        title: '코딩테스트를 위한 기본 자료구조',
        description: '개발자 취업의 필수 코스, 코딩테스트! 스택, 큐, 해시 테이블 등 기본 자료구조의 개념을 문제로 익혀보세요.',
        author: { id: 'user_01', name: '코딩 마법사', isVerified: false },
        price: 0,
        rating: 4.7,
        downloads: 2100,
        tags: ['코딩테스트', '자료구조', '개발자', '무료'],
        createdAt: '2024-05-15T11:00:00Z',
        questions: [
            {
                question: '스택(Stack) 자료구조의 가장 큰 특징은 무엇인가?',
                options: ['First In First Out (FIFO)', 'Last In First Out (LIFO)', 'Key-Value 쌍으로 저장', '정렬된 상태 유지'],
                answer: 1,
                explanation: '스택은 가장 마지막에 들어온 데이터가 가장 먼저 나가는 LIFO(Last In First Out) 구조를 가집니다.'
            },
            {
                question: '해시 테이블(Hash Table)에서 발생할 수 있는 "충돌(Collision)"을 해결하기 위한 방법이 아닌 것은?',
                options: ['Chaining', 'Open Addressing', 'Resizing', 'Tree Sort'],
                answer: 3,
                explanation: 'Tree Sort는 정렬 알고리즘의 한 종류로, 해시 충돌 해결 방법과는 직접적인 관련이 없습니다.'
            }
        ]
    }
];

export function getMockQuizSets(): QuizSet[] {
    // In a real app, this would be an API call.
    return mockQuizSets;
}
