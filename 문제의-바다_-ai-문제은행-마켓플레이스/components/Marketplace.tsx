
import React, { useState, useMemo } from 'react';
import type { QuizSet } from '../types';
import QuizCard from './QuizCard';

interface MarketplaceProps {
    quizSets: QuizSet[];
    onAcquireQuiz: (quizId: string) => void;
    purchasedQuizIds: string[];
    userId: string;
}

const Marketplace: React.FC<MarketplaceProps> = ({ quizSets, onAcquireQuiz, purchasedQuizIds, userId }) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [priceFilter, setPriceFilter] = useState('all'); // 'all', 'free', 'paid'
    const [sortOrder, setSortOrder] = useState('newest'); // 'newest', 'rating', 'downloads'

    const filteredAndSortedSets = useMemo(() => {
        let sets = [...quizSets];

        // Filter by search term
        if (searchTerm) {
            sets = sets.filter(set => 
                set.title.toLowerCase().includes(searchTerm.toLowerCase()) ||
                set.description.toLowerCase().includes(searchTerm.toLowerCase()) ||
                set.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
            );
        }

        // Filter by price
        if (priceFilter === 'free') {
            sets = sets.filter(set => set.price === 0);
        } else if (priceFilter === 'paid') {
            sets = sets.filter(set => set.price > 0);
        }

        // Sort
        switch (sortOrder) {
            case 'rating':
                sets.sort((a, b) => b.rating - a.rating);
                break;
            case 'downloads':
                sets.sort((a, b) => b.downloads - a.downloads);
                break;
            case 'newest':
            default:
                sets.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
                break;
        }

        return sets;
    }, [quizSets, searchTerm, priceFilter, sortOrder]);

    return (
        <div className="space-y-8 animate-fade-in">
            <div>
                <h1 className="text-3xl font-bold text-slate-800">문제 마켓플레이스</h1>
                <p className="text-slate-500 mt-1">커뮤니티가 만든 다양한 문제들을 만나보세요.</p>
            </div>
            
            {/* Filter and Sort Controls */}
            <div className="p-4 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col sm:flex-row gap-4">
                <input
                    type="text"
                    placeholder="제목, 내용, 태그로 검색..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full sm:flex-1 p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500"
                />
                <div className="flex gap-4">
                    <select value={priceFilter} onChange={e => setPriceFilter(e.target.value)} className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value="all">전체 가격</option>
                        <option value="free">무료</option>
                        <option value="paid">유료</option>
                    </select>
                    <select value={sortOrder} onChange={e => setSortOrder(e.target.value)} className="p-2 border border-slate-300 rounded-lg focus:ring-2 focus:ring-primary-500">
                        <option value="newest">최신순</option>
                        <option value="rating">평점순</option>
                        <option value="downloads">인기순</option>
                    </select>
                </div>
            </div>

            {/* Quiz Grid */}
            {filteredAndSortedSets.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {filteredAndSortedSets.map(quizSet => (
                        <QuizCard 
                            key={quizSet.id} 
                            quizSet={quizSet} 
                            onAcquireQuiz={onAcquireQuiz}
                            isAcquired={purchasedQuizIds.includes(quizSet.id)}
                            isMyQuiz={quizSet.author.id === userId}
                        />
                    ))}
                </div>
            ) : (
                <div className="text-center py-16 bg-white rounded-lg shadow-sm border">
                    <p className="text-slate-500 font-semibold">조건에 맞는 문제집이 없습니다.</p>
                </div>
            )}
        </div>
    );
};

export default Marketplace;
