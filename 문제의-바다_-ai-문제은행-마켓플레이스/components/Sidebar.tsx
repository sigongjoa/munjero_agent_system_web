


import React, { useMemo, useState, useEffect } from 'react';
import { 
    BrainCircuitIcon, SparklesIcon, BookOpenIcon, ClipboardListIcon, LayoutDashboardIcon, UserCircleIcon
} from './icons';
import type { ActiveView } from '../types';
import { shortAnswerQuestionAnalysis } from '../services/shortAnswerQuestionAnalysis';

interface SidebarProps {
  activeView: ActiveView;
  setActiveView: (view: ActiveView) => void;
}

const Sidebar: React.FC<SidebarProps> = ({ activeView, setActiveView }) => {
  const [isAiCreateOpen, setIsAiCreateOpen] = useState(true);
  const [isCurriculumOpen, setIsCurriculumOpen] = useState(false);
  const [isAutomationOpen, setIsAutomationOpen] = useState(false); // New state

  const curriculumSubjects = [
    { id: 'subject-korean', label: '국어' },
    { id: 'subject-social', label: '사회' },
    { id: 'subject-ethics', label: '도덕' },
    { id: 'subject-math', label: '수학' },
    { id: 'subject-science', label: '과학' },
    { id: 'subject-english', label: '영어' },
  ];

  const aiCreateSubItems = [
      { id: 'ai-create-concepts', label: '핵심 개념/논리' },
      { id: 'ai-create-analysis', label: '텍스트/자료 분석' },
      { id: 'ai-create-application', label: '사례 적용/주장' },
      { id: 'ai-create-csat', label: '수능 심화 유형' }
  ];

  const navItems = [
    { id: 'ai-create', label: 'AI 맞춤 학습', icon: SparklesIcon, children: aiCreateSubItems },
    { id: 'my-page', label: '마이페이지', icon: UserCircleIcon },
    { id: 'knowledge-base', label: '문제 유형 분석', icon: BookOpenIcon },
    { id: 'good-question-guide', label: '좋은 문제란?', icon: ClipboardListIcon },
    { id: 'automation', label: '자동화 도구', icon: BrainCircuitIcon, children: [ // Using BrainCircuitIcon for now
        { id: 'chatgpt-automation', label: 'ChatGPT 이미지' },
        { id: 'typecast-automation', label: 'Typecast TTS' },
        { id: 'quiz-automation', label: '퀴즈 자동화' },
    ]},
    { id: 'subjects', label: '고교 교과과목', icon: LayoutDashboardIcon, children: curriculumSubjects },
  ];
  
  const tocItems = useMemo(() => {
        const items: { id: string; text: string; children?: { id: string; text: string }[] }[] = [];
        const fullText = shortAnswerQuestionAnalysis;
        
        const introMatch = fullText.match(/^I\..+/m);
        if (introMatch) {
            items.push({ id: 'introduction', text: introMatch[0] });
        }

        const analysisMatch = fullText.match(/^II\..+/m);
        if(analysisMatch) {
            const analysisNode = {
                id: 'main-analysis',
                text: analysisMatch[0],
                children: [] as { id: string; text: string }[],
            };

            const mainContentMatch = fullText.match(/II\. 문제 유형별 상세 분석([\s\S]*?)IV\. 결론 및 제언/);
            if (mainContentMatch) {
                const sections = mainContentMatch[1].split(/(?=\n[A-J]\.)/).map(s => s.trim()).filter(s => s);
                sections.forEach(sec => {
                    const firstLine = sec.split('\n')[0];
                    const match = firstLine.match(/^[A-J]\.\s(.+)/);
                    if (match) {
                        const id = `section-${match[0].charAt(0).toLowerCase()}`;
                        analysisNode.children.push({ id, text: match[0] });
                    }
                });
            }
            items.push(analysisNode);
        }

        const conclusionMatch = fullText.match(/^IV\..+/m);
        if (conclusionMatch) {
            items.push({ id: 'conclusion', text: conclusionMatch[0] });
        }

        return items;
  }, []);
  
  const handleTocClick = (e: React.MouseEvent<HTMLAnchorElement, MouseEvent>, id: string) => {
      e.preventDefault();
      e.stopPropagation();
      document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };
  
  useEffect(() => {
      if (activeView.startsWith('subject-')) {
          setIsCurriculumOpen(true);
      }
      if (activeView.startsWith('ai-create-')) {
          setIsAiCreateOpen(true);
      }
  }, [activeView]);

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex-col flex-shrink-0 hidden md:flex">
      <div className="h-[65px] border-b border-slate-200 flex items-center px-6 gap-3">
         <BrainCircuitIcon className="h-7 w-7 text-primary-600" />
         <h1 className="ml-1 text-xl font-bold text-slate-800 tracking-tight">
          문제의 바다
        </h1>
      </div>
      <nav className="flex-1 px-4 py-4 overflow-y-auto">
        <ul className="space-y-1">
          {navItems.map((item) => (
            <li key={item.id}>
                <button
                    onClick={() => {
                        if (item.children) {
                            if (item.id === 'ai-create') {
                                setIsAiCreateOpen(!isAiCreateOpen);
                            } else if (item.id === 'subjects') {
                                setIsCurriculumOpen(!isCurriculumOpen);
                            } else if (item.id === 'automation') { // New handler
                                setIsAutomationOpen(!isAutomationOpen);
                            }
                        } else {
                            setActiveView(item.id as ActiveView);
                        }
                    }}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg text-sm font-semibold transition-colors ${
                      (activeView.startsWith(item.id)) || (item.id === 'my-page' && (activeView === 'my-page' || activeView.startsWith('persona')))
                        ? 'bg-primary-100 text-primary-700'
                        : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                    }`}
                  >
                    <item.icon className="w-5 h-5" />
                    <span>{item.label}</span>
                  </button>
                  {item.id === 'knowledge-base' && activeView === 'knowledge-base' && (
                      <ul className="mt-2 pl-5 space-y-1 border-l-2 border-slate-200 ml-3">
                          {tocItems.map(tocItem => (
                              <li key={tocItem.id}>
                                  <a
                                    href={`#${tocItem.id}`}
                                    onClick={(e) => handleTocClick(e, tocItem.id)}
                                    className="block py-1 px-2 text-sm font-medium text-slate-600 rounded-md hover:bg-slate-100 hover:text-slate-900"
                                  >
                                      {tocItem.text}
                                  </a>
                                  {tocItem.children && tocItem.children.length > 0 && (
                                      <ul className="mt-1 pl-3 space-y-1">
                                          {tocItem.children.map(child => (
                                              <li key={child.id}>
                                                  <a
                                                      href={`#${child.id}`}
                                                      onClick={(e) => handleTocClick(e, child.id)}
                                                      className="block py-1 px-2 text-xs text-slate-500 rounded-md hover:bg-slate-100 hover:text-slate-800"
                                                  >
                                                      {child.text}
                                                  </a>
                                              </li>
                                          ))}
                                      </ul>
                                  )}
                              </li>
                          ))}
                      </ul>
                  )}
                   {(item.id === 'ai-create' && isAiCreateOpen) && (
                        <ul className="mt-2 pl-5 space-y-1 border-l-2 border-slate-200 ml-3">
                            {item.children?.map(child => (
                                <li key={child.id}>
                                    <button
                                        onClick={() => setActiveView(child.id as ActiveView)}
                                        className={`w-full text-left py-1.5 px-2 text-sm font-medium rounded-md transition-colors ${
                                            activeView === child.id
                                            ? 'text-primary-700 font-bold'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                        }`}
                                    >
                                        {child.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                   )}
                   {(item.id === 'subjects' && isCurriculumOpen) && (
                        <ul className="mt-2 pl-5 space-y-1 border-l-2 border-slate-200 ml-3">
                            {item.children?.map(child => (
                                <li key={child.id}>
                                    <button
                                        onClick={() => setActiveView(child.id as ActiveView)}
                                        className={`w-full text-left py-1.5 px-2 text-sm font-medium rounded-md transition-colors ${
                                            activeView === child.id
                                            ? 'text-primary-700 font-bold'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                        }`}
                                    >
                                        {child.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                   )}
                   {(item.id === 'automation' && isAutomationOpen) && ( // New rendering logic
                        <ul className="mt-2 pl-5 space-y-1 border-l-2 border-slate-200 ml-3">
                            {item.children?.map(child => (
                                <li key={child.id}>
                                    <button
                                        onClick={() => setActiveView(child.id as ActiveView)}
                                        className={`w-full text-left py-1.5 px-2 text-sm font-medium rounded-md transition-colors ${
                                            activeView === child.id
                                            ? 'text-primary-700 font-bold'
                                            : 'text-slate-500 hover:bg-slate-100 hover:text-slate-800'
                                        }`}
                                    >
                                        {child.label}
                                    </button>
                                </li>
                            ))}
                        </ul>
                   )}
            </li>
          ))}
        </ul>
      </nav>
    </aside>
  );
};

export default Sidebar;