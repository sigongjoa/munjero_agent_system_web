
import React from 'react';
import { subjectEthicsData } from '../services/subjectEthicsData';

const SubjectEthics: React.FC = () => {
    
    const renderContent = (text: string) => {
        const lines = text.split('\n').filter(line => line.trim() !== '');
        
        return lines.map((line, index) => {
            const trimmedLine = line.trim();
            if (trimmedLine.endsWith(':')) {
                return <h3 key={index} className="text-xl font-bold text-slate-800 mt-6 mb-3">{trimmedLine}</h3>;
            }
            if (trimmedLine.startsWith('•')) {
                 return <li key={index} className="text-slate-700 leading-relaxed ml-6 list-disc">{trimmedLine.substring(1).trim()}</li>;
            }
            if (trimmedLine.match(/^[가-힣\s]+:/)) {
                const parts = trimmedLine.split(':');
                return <h4 key={index} className="text-lg font-semibold text-slate-700 mt-4 mb-2">{parts[0]}:<span className="font-normal">{parts.slice(1).join(':')}</span></h4>;
            }
            return <p key={index} className="mb-4 text-slate-700 leading-relaxed">{trimmedLine}</p>;
        });
    };

    return (
        <div className="animate-fade-in bg-white p-6 sm:p-10 rounded-2xl shadow-lg border border-slate-200 w-full">
            <h1 className="text-3xl font-bold text-slate-900 mb-4 border-b pb-2">고교 교과과목: 도덕</h1>
            <p className="mb-6 text-slate-600">2022 개정 교육과정에 따른 도덕과 교육과정의 주요 내용입니다.</p>
            <div>
                {renderContent(subjectEthicsData)}
            </div>
        </div>
    );
};

export default SubjectEthics;